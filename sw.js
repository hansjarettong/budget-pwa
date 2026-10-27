/**
 * Budget Tracker Service Worker
 * Precaches core application shell assets and implements cache-first strategy with network fallback.
 * Includes sanitization for Safari/WebKit redirected navigation responses.
 */

const CACHE_VERSION = 'v4';
const CACHE_NAME = `budget-tracker-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './',
  './manifest.json',
  './css/app.css',
  './css/components.css',
  './js/app.js',
  './js/store.js',
  './js/calculations.js',
  './js/ui.js',
  './js/numpad.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/**
 * Strips internal WebKit/Safari redirection metadata by constructing a clean Response.
 * Prevents the fatal iOS Safari error: "Response served by service worker has redirections".
 * @param {Response} response
 * @returns {Response}
 */
function createCleanResponse(response) {
  if (!response) return response;
  try {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (e) {
    return response;
  }
}

// Install Event: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        PRECACHE_ASSETS.map(async (assetUrl) => {
          try {
            const response = await fetch(assetUrl);
            if (response.ok) {
              const clean = createCleanResponse(response);
              if (assetUrl === './') {
                // Cache under both './' and './index.html' so both resolve cleanly without redirects
                await cache.put('./', clean.clone());
                await cache.put('./index.html', clean);
              } else {
                await cache.put(assetUrl, clean);
              }
            }
          } catch (err) {
            console.warn(`[Service Worker] Warning: Failed to precache ${assetUrl}:`, err);
          }
        })
      );
    }).then(() => {
      // Force waiting service worker to become the active service worker
      return self.skipWaiting();
    })
  );
});

// Activate Event: Clean up outdated caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith('budget-tracker-') && cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting outdated cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all open pages immediately
      return self.clients.claim();
    })
  );
});

// Fetch Event: Cache-First strategy with Network Fallback and Safari redirection safety
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests (skip mutations / non-GET)
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle navigation requests (e.g. app launches, page reloads)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Check cache for matching request or root shell
          const cachedResponse = await caches.match(event.request) ||
                                 await caches.match('./') ||
                                 await caches.match('./index.html');
          if (cachedResponse) {
            // Strip any internal WebKit redirect flags before returning
            return createCleanResponse(cachedResponse);
          }

          // Not in cache: fetch from network
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            // Cache a clean copy for offline support
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, createCleanResponse(responseToCache));
            });
            return createCleanResponse(networkResponse);
          }
          return createCleanResponse(networkResponse);
        } catch (error) {
          console.warn('[Service Worker] Navigation fetch failed; returning offline fallback.', error);
          const fallback = await caches.match('./') || await caches.match('./index.html');
          if (fallback) {
            return createCleanResponse(fallback);
          }
          throw error;
        }
      })()
    );
    return;
  }

  // Handle sub-resource requests (CSS, JS, icons, assets)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      // Not in cache: fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          // Check for valid response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
            return networkResponse;
          }

          // Cache valid GET responses for offline support
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            const cleanToCache = responseToCache.redirected
              ? createCleanResponse(responseToCache)
              : responseToCache;
            cache.put(event.request, cleanToCache);
          });

          return networkResponse.redirected
            ? createCleanResponse(networkResponse)
            : networkResponse;
        })
        .catch((error) => {
          throw error;
        });
    })
  );
});

// Support manual skip-waiting signal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
