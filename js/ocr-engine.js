/**
 * ocr-engine.js - Client-Side OCR & Image Preprocessing Engine for Budget Tracking PWA
 *
 * Provides completely local, client-side receipt image scanning and OCR:
 * 1. Image preprocessing: Proportional scaling (max 1600px), grayscale conversion,
 *    and contrast enhancement optimized for thermal receipt paper.
 * 2. Thumbnail generation (~120px max dimension) for efficient storage and UI history.
 * 3. Tesseract.js worker lifecycle management with singleton reuse, progress translation,
 *    and bilingual English ('eng') and Japanese ('jpn') language support.
 * 4. Zero cloud dependencies - runs 100% on-device for total privacy.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.BudgetOCR = exports;
    if (typeof window !== 'undefined') {
      window.BudgetOCR = exports;
    }
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Configuration Constants
  const MAX_IMAGE_DIMENSION = 1600;
  const THUMBNAIL_MAX_DIMENSION = 120;
  const DEFAULT_LANGUAGES = ['eng', 'jpn'];
  const DEFAULT_LANG_STRING = 'eng+jpn';
  const CONTRAST_BOOST = 28; // Optimal contrast boost for thermal receipt paper

  // Precomputed contrast lookup table (LUT) for fast pixel processing (0..255)
  const CONTRAST_LUT = new Uint8ClampedArray(256);
  (function initContrastLut() {
    // Standard contrast factor formula: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
    const factor = (259 * (CONTRAST_BOOST + 255)) / (255 * (259 - CONTRAST_BOOST));
    for (let i = 0; i < 256; i++) {
      const val = (i - 128) * factor + 128;
      CONTRAST_LUT[i] = val < 0 ? 0 : (val > 255 ? 255 : Math.round(val));
    }
  })();

  // Singleton worker state
  let workerInstance = null;
  let initPromise = null;
  let activeProgressCallback = null;

  /**
   * Translates raw Tesseract logger packets into friendly, normalized progress updates.
   *
   * @param {Object} packet - Raw logger event from Tesseract.js
   * @returns {{ status: string, progress: number, message: string }}
   */
  function formatProgress(packet) {
    if (!packet) {
      return { status: 'idle', progress: 0, message: '' };
    }

    const rawStatus = (packet.status || '').toLowerCase();
    let progress = 0;

    if (typeof packet.progress === 'number' && !isNaN(packet.progress)) {
      progress = packet.progress <= 1
        ? Math.round(packet.progress * 100)
        : Math.min(100, Math.round(packet.progress));
    }

    let message = 'Processing receipt...';

    if (rawStatus.includes('loading tesseract core') || rawStatus.includes('loading core') || rawStatus.includes('load core')) {
      message = 'Loading OCR engine...';
    } else if (rawStatus.includes('loaded tesseract core')) {
      message = 'OCR engine loaded.';
    } else if (
      rawStatus.includes('initializing tesseract') ||
      rawStatus.includes('initializing api') ||
      rawStatus.includes('init api')
    ) {
      message = 'Initializing OCR engine...';
    } else if (
      rawStatus.includes('loading language traineddata') ||
      rawStatus.includes('loading traineddata') ||
      rawStatus.includes('loading lang')
    ) {
      message = 'Loading English & Japanese models...';
    } else if (rawStatus.includes('loaded language traineddata') || rawStatus.includes('loaded traineddata')) {
      message = 'Language models loaded.';
    } else if (rawStatus.includes('initialized tesseract') || rawStatus.includes('initialized api')) {
      message = 'OCR engine ready.';
    } else if (rawStatus.includes('recognizing text') || rawStatus.includes('recognizing')) {
      message = progress > 0 ? `Reading receipt text (${progress}%)...` : 'Reading receipt text...';
    } else if (rawStatus.includes('done') || rawStatus.includes('complete')) {
      message = 'Receipt scan complete!';
    } else if (packet.status) {
      // Clean fallback capitalization
      message = packet.status.charAt(0).toUpperCase() + packet.status.slice(1) + '...';
    }

    return {
      status: packet.status || 'processing',
      progress,
      message
    };
  }

  /**
   * Internal logger bridge passed to Tesseract.js worker
   */
  function handleTesseractLog(packet) {
    if (typeof activeProgressCallback === 'function') {
      try {
        const formatted = formatProgress(packet);
        activeProgressCallback(formatted);
      } catch (err) {
        console.warn('[BudgetOCR] Error in onProgress callback:', err);
      }
    }
  }

  /**
   * Calculates scaled dimensions preserving aspect ratio.
   * If max(width, height) > maxDimension, scales down proportionally.
   * Otherwise, keeps original dimensions.
   *
   * @param {number} origWidth
   * @param {number} origHeight
   * @param {number} maxDimension
   * @returns {{ width: number, height: number }}
   */
  function calculateDimensions(origWidth, origHeight, maxDimension) {
    const longest = Math.max(origWidth, origHeight);
    if (longest <= maxDimension) {
      return { width: origWidth, height: origHeight };
    }
    const scale = maxDimension / longest;
    return {
      width: Math.max(1, Math.round(origWidth * scale)),
      height: Math.max(1, Math.round(origHeight * scale))
    };
  }

  /**
   * Detects whether a File or Blob is an iPhone HEIC/HEIF image.
   *
   * @param {File|Blob} fileOrBlob
   * @returns {boolean}
   */
  function isHeicImage(fileOrBlob) {
    if (!fileOrBlob) return false;
    const type = String(fileOrBlob.type || '').toLowerCase();
    const name = String(fileOrBlob.name || '').toLowerCase();
    return type === 'image/heic' || type === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
  }

  /**
   * Preprocesses an image File or Blob:
   * 1. Detects and converts iPhone HEIC/HEIF images to JPEG using heic2any (if present).
   * 2. Loads into an Image using URL.createObjectURL (or FileReader fallback).
   * 3. Scales down proportionally if longest dimension > 1600px.
   * 4. Draws onto a 2D canvas.
   * 5. Converts to grayscale and boosts contrast to optimize thermal receipt paper readability.
   * 6. Generates a lightweight thumbnail data URL (~120px max dimension) and OCR canvas/dataUrl.
   * 7. Cleanly revokes the created object URL.
   *
   * @param {File|Blob} fileOrBlob - Input image from file input or drag-and-drop
   * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string, thumbnailDataUrl: string, width: number, height: number }>}
   */
  async function preprocessImage(fileOrBlob) {
    if (!fileOrBlob) {
      throw new Error('No image file or blob provided for preprocessing.');
    }

    // Convert iPhone HEIC / HEIF to JPEG if needed
    let inputBlob = fileOrBlob;
    if (isHeicImage(fileOrBlob)) {
      const heicConverter = (typeof root !== 'undefined' && root.heic2any) ||
                            (typeof window !== 'undefined' && window.heic2any) ||
                            (typeof globalThis !== 'undefined' && globalThis.heic2any) ||
                            (typeof heic2any === 'function' ? heic2any : null);

      if (typeof heicConverter === 'function') {
        try {
          const converted = await heicConverter({
            blob: fileOrBlob,
            toType: 'image/jpeg',
            quality: 0.92
          });
          inputBlob = Array.isArray(converted) ? converted[0] : converted;
        } catch (heicErr) {
          console.warn('[BudgetOCR] HEIC conversion warning (falling back to direct blob):', heicErr);
        }
      }
    }

    return new Promise((resolve, reject) => {
      // Check for browser Canvas support
      if (typeof document === 'undefined' || !document.createElement) {
        return reject(new Error('DOM environment with document.createElement is required for image preprocessing.'));
      }

      let objectUrl = null;
      const img = new Image();
      let isSettled = false;

      const cleanup = () => {
        if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (e) {
            // Ignore revocation errors
          }
          objectUrl = null;
        }
      };

      img.onload = () => {
        if (isSettled) return;
        isSettled = true;
        cleanup();

        try {
          const naturalWidth = img.naturalWidth || img.width;
          const naturalHeight = img.naturalHeight || img.height;

          if (!naturalWidth || !naturalHeight) {
            throw new Error('Unable to determine image dimensions.');
          }

          // 1. Calculate target dimensions (max 1600px)
          const { width, height } = calculateDimensions(naturalWidth, naturalHeight, MAX_IMAGE_DIMENSION);

          // 2. Draw scaled image onto 2D canvas
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            throw new Error('Could not obtain 2D rendering context for canvas.');
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 3. Thermal Receipt Enhancement: Grayscale & Contrast Boost
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          const totalBytes = data.length;

          for (let i = 0; i < totalBytes; i += 4) {
            // Rec. 601 luma grayscale formula
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            const enhanced = CONTRAST_LUT[gray];
            data[i] = enhanced;
            data[i + 1] = enhanced;
            data[i + 2] = enhanced;
            // data[i + 3] (alpha channel) is preserved untouched
          }

          ctx.putImageData(imageData, 0, 0);

          // 4. Generate high-quality OCR data URL
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

          // 5. Generate lightweight thumbnail (~120px max dimension)
          const thumbDims = calculateDimensions(width, height, THUMBNAIL_MAX_DIMENSION);
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = thumbDims.width;
          thumbCanvas.height = thumbDims.height;
          const thumbCtx = thumbCanvas.getContext('2d');

          let thumbnailDataUrl = '';
          if (thumbCtx) {
            thumbCtx.drawImage(canvas, 0, 0, thumbDims.width, thumbDims.height);
            thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);
          } else {
            thumbnailDataUrl = dataUrl;
          }

          resolve({
            canvas,
            dataUrl,
            thumbnailDataUrl,
            width,
            height
          });
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        if (isSettled) return;
        isSettled = true;
        cleanup();
        reject(new Error('Failed to load image from provided file/blob. Please ensure the file is a valid image.'));
      };

      // Load using createObjectURL with FileReader fallback
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          objectUrl = URL.createObjectURL(inputBlob);
          img.src = objectUrl;
          return;
        } catch (err) {
          // Fallback to FileReader below
        }
      }

      if (typeof FileReader !== 'undefined') {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target.result;
        };
        reader.onerror = () => {
          cleanup();
          reject(new Error('Failed to read image file data.'));
        };
        reader.readAsDataURL(inputBlob);
      } else {
        cleanup();
        reject(new Error('Neither URL.createObjectURL nor FileReader is available in this environment.'));
      }
    });
  }

  /**
   * Initializes and caches a singleton Tesseract.js worker with English and Japanese models.
   * Avoids reloading WebAssembly and traineddata models across consecutive receipt scans.
   *
   * @param {Object} [options]
   * @param {Function} [options.onProgress] - Callback ({ status, progress: 0..100, message })
   * @param {string[]|string} [options.languages] - Languages to load (default: ['eng', 'jpn'])
   * @returns {Promise<Object>} The initialized Tesseract worker instance
   */
  async function initWorker(options) {
    const opts = options || {};

    // Update active progress callback
    if (typeof opts.onProgress === 'function') {
      activeProgressCallback = opts.onProgress;
    }

    // Return cached worker singleton if already ready
    if (workerInstance) {
      return workerInstance;
    }

    // Reuse in-flight initialization promise to prevent race conditions
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      // 1. Verify Tesseract library availability
      if (typeof Tesseract === 'undefined') {
        throw new Error('OCR engine is not loaded. Please check your internet connection.');
      }

      const languages = opts.languages || DEFAULT_LANGUAGES;
      const langString = Array.isArray(languages) ? languages.join('+') : (languages || DEFAULT_LANG_STRING);

      let worker = null;

      // 2. Initialize worker compatible across Tesseract v4 and v5 architectures
      try {
        // Tesseract.js v5 signature: createWorker(langs, oem, options)
        worker = await Tesseract.createWorker(languages, undefined, {
          logger: handleTesseractLog
        });
      } catch (errV5) {
        try {
          // Tesseract.js v5 string langs signature
          worker = await Tesseract.createWorker(langString, 1, {
            logger: handleTesseractLog
          });
        } catch (errV5Str) {
          // Tesseract.js v2-v4 options-only signature: createWorker(options)
          worker = await Tesseract.createWorker({
            logger: handleTesseractLog
          });
        }
      }

      // 3. For Tesseract architectures needing explicit loadLanguage / initialize calls
      if (typeof worker.loadLanguage === 'function') {
        try {
          await worker.loadLanguage(langString);
        } catch (e) {
          // Already loaded by createWorker
        }
      }

      if (typeof worker.initialize === 'function') {
        try {
          await worker.initialize(langString);
        } catch (e) {
          // Already initialized by createWorker
        }
      }

      workerInstance = worker;
      return workerInstance;
    })().finally(() => {
      initPromise = null;
    });

    return initPromise;
  }

  /**
   * Recognizes receipt text using the cached Tesseract worker.
   *
   * @param {HTMLCanvasElement|HTMLImageElement|Blob|File|string|Object} imageSource
   *        Source image, canvas, data URL, or result object from preprocessImage()
   * @param {Function} [onProgress] - Callback for real-time progress updates
   * @returns {Promise<{ text: string, confidence: number, lines: Array }>}
   */
  async function recognizeReceipt(imageSource, onProgress) {
    if (typeof onProgress === 'function') {
      activeProgressCallback = onProgress;
    }

    // Ensure worker singleton is initialized
    const worker = await initWorker({ onProgress });

    // Handle input resolution if preprocessed result was passed directly
    let targetSource = imageSource;
    if (imageSource && typeof imageSource === 'object') {
      if (imageSource.canvas) {
        targetSource = imageSource.canvas;
      } else if (imageSource.dataUrl) {
        targetSource = imageSource.dataUrl;
      }
    }

    // Execute OCR recognition
    const result = await worker.recognize(targetSource);
    const data = (result && result.data) ? result.data : (result || {});

    return {
      text: data.text || '',
      confidence: typeof data.confidence === 'number' ? data.confidence : 0,
      lines: Array.isArray(data.lines) ? data.lines : []
    };
  }

  /**
   * Cleanly terminates the WebAssembly worker to free memory when idle.
   *
   * @returns {Promise<void>}
   */
  async function terminateWorker() {
    const workerToTerminate = workerInstance;
    workerInstance = null;
    initPromise = null;
    activeProgressCallback = null;

    if (workerToTerminate && typeof workerToTerminate.terminate === 'function') {
      try {
        await workerToTerminate.terminate();
      } catch (err) {
        console.warn('[BudgetOCR] Error terminating worker:', err);
      }
    }
  }

  /**
   * Checks whether the OCR worker is currently initialized and ready for scanning.
   *
   * @returns {boolean}
   */
  function isWorkerReady() {
    return !!workerInstance;
  }

  /**
   * Gets the active worker instance (or null if not initialized).
   *
   * @returns {Object|null}
   */
  function getWorker() {
    return workerInstance;
  }

  // Public API
  return {
    preprocessImage,
    initWorker,
    recognizeReceipt,
    terminateWorker,
    isWorkerReady,
    getWorker,
    formatProgress,
    calculateDimensions,
    isHeicImage,
    MAX_IMAGE_DIMENSION,
    THUMBNAIL_MAX_DIMENSION
  };
}));
