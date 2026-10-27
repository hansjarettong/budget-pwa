/**
 * Budget Tracker Service Worker
 * Precaches core application shell assets and implements cache-first strategy with network fallback.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `budget-tracker-${CACHE_VERSION}`;

const PRECACHE_ASSETS = [
  './index.html',
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

// Install Event: Precache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_ASSETS.map((assetUrl) => {
          return cache.add(assetUrl).catch((err) => {
            console.warn(`[Service Worker] Warning: Failed to precache ${assetUrl}:`, err);
          });
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

// Fetch Event: Cache-First strategy with Network Fallback
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests (skip mutations / non-GET)
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle request with cache-first strategy
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
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch((error) => {
          console.warn('[Service Worker] Fetch failed; returning offline fallback if navigation.', error);
          // If network request failed and this is a navigation request, serve index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
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
