/**
 * crypto.js - Client-Side Zero-Knowledge Encryption Engine for Budget Tracking PWA
 * Uses the Web Cryptography API (crypto.subtle) to provide AES-GCM 256-bit encryption
 * with PBKDF2 key derivation and random salt/IV.
 * Completely client-side and serverless.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BudgetCrypto = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PBKDF2_ITERATIONS = 100000;
  const SALT_LENGTH = 16; // 128 bits
  const IV_LENGTH = 12;   // 96 bits for AES-GCM

  /**
   * Helper to get active Web Crypto implementation
   */
  function getSubtleCrypto() {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      return crypto.subtle;
    }
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      return window.crypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      return globalThis.crypto.subtle;
    }
    // Node.js webcrypto fallback
    try {
      const nodeCrypto = require('crypto');
      if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
        return nodeCrypto.webcrypto.subtle;
      }
    } catch (e) {
      // Ignore if not in node
    }
    return null;
  }

  function getRandomValues(array) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(array);
    }
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      return window.crypto.getRandomValues(array);
    }
    try {
      const nodeCrypto = require('crypto');
      if (nodeCrypto.randomFillSync) {
        return nodeCrypto.randomFillSync(array);
      }
    } catch (e) {
      // Ignore
    }
    // Fallback pseudo-random for test environments without native crypto
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }

  function uint8ArrayToBase64(bytes) {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function base64ToUint8Array(base64) {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Derives an AES-GCM 256-bit CryptoKey from a user passphrase and random salt using PBKDF2-SHA256.
   * @param {string} passphrase
   * @param {Uint8Array} salt
   * @param {SubtleCrypto} subtle
   * @returns {Promise<CryptoKey>}
   */
  async function deriveKey(passphrase, salt, subtle) {
    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : {
      encode: (str) => Uint8Array.from(unescape(encodeURIComponent(str)), c => c.charCodeAt(0))
    };
    const passphraseBytes = encoder.encode(passphrase);

    const baseKey = await subtle.importKey(
      'raw',
      passphraseBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts a plaintext string using a passphrase.
   * @param {string} plaintext
   * @param {string} passphrase
   * @returns {Promise<Object>} Encrypted payload object
   */
  async function encrypt(plaintext, passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('A non-empty passphrase is required for encryption');
    }

    const subtle = getSubtleCrypto();
    if (!subtle) {
      throw new Error('Web Cryptography API is not available in this environment');
    }

    const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : {
      encode: (str) => Uint8Array.from(unescape(encodeURIComponent(str)), c => c.charCodeAt(0))
    };

    const salt = new Uint8Array(SALT_LENGTH);
    getRandomValues(salt);

    const iv = new Uint8Array(IV_LENGTH);
    getRandomValues(iv);

    const key = await deriveKey(passphrase, salt, subtle);
    const dataBytes = encoder.encode(plaintext);

    const ciphertextBuffer = await subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBytes
    );

    return {
      app: 'BudgetTrackerPWA',
      version: 1,
      format: 'encrypted-backup',
      algorithm: 'AES-GCM-256-PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      encrypted: true,
      salt: uint8ArrayToBase64(salt),
      iv: uint8ArrayToBase64(iv),
      ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * Decrypts an encrypted payload using the matching passphrase.
   * @param {Object|string} payload
   * @param {string} passphrase
   * @returns {Promise<string>} Original plaintext string
   */
  async function decrypt(payload, passphrase) {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      throw new Error('Passphrase is required for decryption');
    }

    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!isEncryptedPayload(data)) {
      throw new Error('Invalid or unencrypted payload format');
    }

    const subtle = getSubtleCrypto();
    if (!subtle) {
      throw new Error('Web Cryptography API is not available in this environment');
    }

    const salt = base64ToUint8Array(data.salt);
    const iv = base64ToUint8Array(data.iv);
    const ciphertext = base64ToUint8Array(data.ciphertext);

    const key = await deriveKey(passphrase, salt, subtle);

    try {
      const decryptedBuffer = await subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );

      const bytes = new Uint8Array(decryptedBuffer);
      const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : {
        decode: (arr) => {
          let binary = '';
          for (let i = 0; i < arr.length; i++) {
            binary += String.fromCharCode(arr[i]);
          }
          return decodeURIComponent(escape(binary));
        }
      };

      return decoder.decode(bytes);
    } catch (err) {
      throw new Error('Decryption failed: Incorrect passphrase or corrupted data');
    }
  }

  /**
   * Checks whether a JSON object or string matches our encrypted envelope format.
   * @param {any} data
   * @returns {boolean}
   */
  function isEncryptedPayload(data) {
    if (!data) return false;
    let obj = data;
    if (typeof data === 'string') {
      try {
        obj = JSON.parse(data);
      } catch (e) {
        return false;
      }
    }
    return Boolean(
      obj &&
      typeof obj === 'object' &&
      obj.encrypted === true &&
      obj.salt &&
      obj.iv &&
      obj.ciphertext
    );
  }

  return {
    encrypt,
    decrypt,
    isEncryptedPayload,
    isCryptoSupported: () => Boolean(getSubtleCrypto())
  };
}));
