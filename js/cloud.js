/**
 * cloud.js - Serverless Cloud Backup & Synchronization Engine
 * Handles "Bring Your Own Cloud" integration for Google Drive (via Google Identity Services
 * & Drive REST API v3) and direct Synced Cloud Folder (iCloud Drive / Dropbox) file access.
 * Serverless, client-side, zero backend storage.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./crypto.js', './store.js'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./crypto.js'), require('./store.js'));
  } else {
    root.BudgetCloud = factory(root.BudgetCrypto, root.BudgetStore);
  }
}(typeof self !== 'undefined' ? self : this, function (BudgetCrypto, BudgetStore) {
  'use strict';

  const STORAGE_KEYS = {
    CLIENT_ID: 'budget_pwa_gdrive_client_id',
    LAST_SYNC: 'budget_pwa_last_cloud_sync',
    AUTO_SYNC: 'budget_pwa_cloud_auto_sync',
    ENCRYPT_ENABLED: 'budget_pwa_cloud_encrypt_enabled'
  };

  const BACKUP_FILENAME_PLAIN = 'budget_tracker_backup.json';
  const BACKUP_FILENAME_ENC = 'budget_tracker_backup.enc';

  // In-memory session state (tokens never stored in unencrypted localStorage)
  let currentAccessToken = null;
  let tokenExpirationTime = 0;
  let cachedUserEmail = null;
  let sessionPassphrase = '';

  // In-memory fallback for environments without localStorage
  let memoryStore = {};

  /**
   * Helper to access LocalStorage safely
   */
  function getLocalStorage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage !== null) {
        return localStorage;
      }
    } catch (e) {
      // Ignore
    }
    return {
      getItem: (key) => Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null,
      setItem: (key, val) => { memoryStore[key] = String(val); },
      removeItem: (key) => { delete memoryStore[key]; }
    };
  }

  function getClientId() {
    return getLocalStorage().getItem(STORAGE_KEYS.CLIENT_ID) || '';
  }

  function setClientId(clientId) {
    const sanitized = String(clientId || '').trim();
    if (sanitized) {
      getLocalStorage().setItem(STORAGE_KEYS.CLIENT_ID, sanitized);
    } else {
      getLocalStorage().removeItem(STORAGE_KEYS.CLIENT_ID);
    }
    return sanitized;
  }

  function isConnected() {
    return Boolean(currentAccessToken && Date.now() < tokenExpirationTime);
  }

  function getUserEmail() {
    return cachedUserEmail;
  }

  function getLastSyncInfo() {
    const raw = getLocalStorage().getItem(STORAGE_KEYS.LAST_SYNC);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function setLastSyncInfo(info) {
    getLocalStorage().setItem(STORAGE_KEYS.LAST_SYNC, JSON.stringify(info));
  }

  function getSessionPassphrase() {
    return sessionPassphrase;
  }

  function setSessionPassphrase(passphrase) {
    sessionPassphrase = String(passphrase || '');
  }

  function isAutoSyncEnabled() {
    return getLocalStorage().getItem(STORAGE_KEYS.AUTO_SYNC) === 'true';
  }

  function setAutoSyncEnabled(enabled) {
    getLocalStorage().setItem(STORAGE_KEYS.AUTO_SYNC, enabled ? 'true' : 'false');
  }

  function isEncryptionEnabled() {
    const val = getLocalStorage().getItem(STORAGE_KEYS.ENCRYPT_ENABLED);
    // Default to true (recommended) if not explicitly set to false
    return val !== 'false';
  }

  function setEncryptionEnabled(enabled) {
    getLocalStorage().setItem(STORAGE_KEYS.ENCRYPT_ENABLED, enabled ? 'true' : 'false');
  }

  /**
   * Dynamically loads Google Identity Services client script if not already present.
   */
  function loadGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.oauth2) {
        return resolve(window.google.accounts.oauth2);
      }

      if (typeof document === 'undefined') {
        return reject(new Error('Document is not available'));
      }

      const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.google.accounts.oauth2));
        existingScript.addEventListener('error', (err) => reject(err));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
          resolve(window.google.accounts.oauth2);
        } else {
          reject(new Error('Google Identity Services script loaded but oauth2 is undefined'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  /**
   * Initiates Google OAuth2 token request.
   * @param {string} [overrideClientId]
   * @returns {Promise<string>} Access Token
   */
  async function connectGoogleDrive(overrideClientId = null) {
    const clientId = overrideClientId || getClientId();
    if (!clientId) {
      throw new Error('Google OAuth Client ID is required. Please enter your Client ID in Settings.');
    }

    setClientId(clientId);
    const oauth2 = await loadGoogleIdentityServices();

    return new Promise((resolve, reject) => {
      try {
        const tokenClient = oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          prompt: '',
          callback: async (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }

            currentAccessToken = response.access_token;
            // Token is typically valid for 3600 seconds
            const expiresIn = Number(response.expires_in) || 3500;
            tokenExpirationTime = Date.now() + (expiresIn * 1000);

            // Fetch user info to display account identity in UI
            try {
              const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${currentAccessToken}` }
              });
              if (userRes.ok) {
                const userData = await userRes.json();
                cachedUserEmail = userData.email || null;
              }
            } catch (e) {
              cachedUserEmail = 'Connected Account';
            }

            resolve(currentAccessToken);
          }
        });

        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnects Google Drive and revokes current token.
   */
  function disconnectGoogleDrive() {
    if (currentAccessToken && typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(currentAccessToken, () => {});
      } catch (e) {
        // Ignore
      }
    }
    currentAccessToken = null;
    tokenExpirationTime = 0;
    cachedUserEmail = null;
  }

  /**
   * Ensures an active Google Drive access token exists.
   */
  async function getValidAccessToken() {
    if (isConnected()) {
      return currentAccessToken;
    }
    return await connectGoogleDrive();
  }

  /**
   * Searches Google Drive for the existing backup file.
   * @param {string} token
   * @returns {Promise<Object|null>} File metadata { id, name, modifiedTime, size } or null
   */
  async function findRemoteBackupFile(token) {
    const q = encodeURIComponent(`(name = '${BACKUP_FILENAME_ENC}' or name = '${BACKUP_FILENAME_PLAIN}') and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,modifiedTime,size,mimeType)`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive API search error: ${res.status} - ${err}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      // Sort by modifiedTime descending in case multiple exist
      data.files.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
      return data.files[0];
    }
    return null;
  }

  /**
   * Uploads or updates the backup file in Google Drive.
   * @param {Object} [options]
   * @param {string} [options.passphrase]
   * @returns {Promise<{ success: boolean, fileId: string, fileName: string, isEncrypted: boolean, timestamp: string }>}
   */
  async function backupToGoogleDrive(options = {}) {
    const token = await getValidAccessToken();
    const store = BudgetStore || (typeof window !== 'undefined' ? window.BudgetStore : null);
    if (!store) {
      throw new Error('BudgetStore is not loaded');
    }

    const plainData = store.exportDataJSON();
    const shouldEncrypt = isEncryptionEnabled();
    const passphrase = options.passphrase !== undefined ? options.passphrase : getSessionPassphrase();

    let fileContent = plainData;
    let fileName = BACKUP_FILENAME_PLAIN;
    let isEncrypted = false;

    if (shouldEncrypt) {
      if (!passphrase) {
        throw new Error('Encryption is enabled but no passphrase was provided.');
      }
      const crypto = BudgetCrypto || (typeof window !== 'undefined' ? window.BudgetCrypto : null);
      if (!crypto) {
        throw new Error('BudgetCrypto engine is not available');
      }
      const encryptedPkg = await crypto.encrypt(plainData, passphrase);
      fileContent = JSON.stringify(encryptedPkg, null, 2);
      fileName = BACKUP_FILENAME_ENC;
      isEncrypted = true;
    }

    const existingFile = await findRemoteBackupFile(token);
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      description: 'Budget Tracker PWA automated backup'
    };

    const boundary = '-------budget_pwa_boundary_' + Math.random().toString(36).substring(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    let uploadUrl;
    let method;

    if (existingFile) {
      uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
      method = 'PATCH';
    } else {
      uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
      method = 'POST';
    }

    const res = await fetch(uploadUrl, {
      method: method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive upload failed: ${res.status} - ${err}`);
    }

    const result = await res.json();
    const syncInfo = {
      fileId: result.id,
      fileName: fileName,
      isEncrypted: isEncrypted,
      timestamp: new Date().toISOString(),
      account: cachedUserEmail || 'Google Drive'
    };

    setLastSyncInfo(syncInfo);
    return { success: true, ...syncInfo };
  }

  /**
   * Downloads and restores the latest backup from Google Drive.
   * @param {Object} [options]
   * @param {string} [options.passphrase]
   * @returns {Promise<{ success: boolean, categoriesCount: number, transactionsCount: number, fileName: string, isEncrypted: boolean }>}
   */
  async function restoreFromGoogleDrive(options = {}) {
    const token = await getValidAccessToken();
    const store = BudgetStore || (typeof window !== 'undefined' ? window.BudgetStore : null);
    if (!store) {
      throw new Error('BudgetStore is not loaded');
    }

    const fileMeta = await findRemoteBackupFile(token);
    if (!fileMeta) {
      throw new Error('No Budget Tracker backup file was found in your Google Drive.');
    }

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileMeta.id}?alt=media`;
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to download backup: ${res.status} - ${err}`);
    }

    const remoteContent = await res.text();
    const passphrase = options.passphrase !== undefined ? options.passphrase : getSessionPassphrase();

    const importResult = await store.importDataJSONAsync(remoteContent, passphrase);
    if (!importResult.success) {
      if (importResult.needsPassphrase) {
        return {
          success: false,
          needsPassphrase: true,
          fileName: fileMeta.name,
          error: 'Backup is encrypted. Passphrase required.'
        };
      }
      throw new Error(importResult.error || 'Failed to restore backup data.');
    }

    const syncInfo = {
      fileId: fileMeta.id,
      fileName: fileMeta.name,
      isEncrypted: Boolean(importResult.isEncrypted || fileMeta.name.endsWith('.enc')),
      timestamp: new Date().toISOString(),
      account: cachedUserEmail || 'Google Drive'
    };
    setLastSyncInfo(syncInfo);

    return {
      success: true,
      categoriesCount: importResult.categoriesCount,
      transactionsCount: importResult.transactionsCount,
      fileName: fileMeta.name,
      isEncrypted: syncInfo.isEncrypted
    };
  }

  /**
   * Retrieves remote backup file details without downloading the contents.
   * @returns {Promise<Object|null>}
   */
  async function checkRemoteBackup() {
    if (!isConnected()) return null;
    try {
      const token = await getValidAccessToken();
      return await findRemoteBackupFile(token);
    } catch (e) {
      return null;
    }
  }

  /**
   * Saves backup directly to a user-chosen local synced cloud folder (iCloud Drive / Dropbox)
   * using the browser's native File System Access API when available.
   * @param {string} [passphrase]
   * @returns {Promise<{ success: boolean, filename: string }>}
   */
  async function saveToSyncedFolder(passphrase = null) {
    const store = BudgetStore || (typeof window !== 'undefined' ? window.BudgetStore : null);
    if (!store) throw new Error('BudgetStore not loaded');

    const content = await store.exportData(passphrase);
    const isEncrypted = Boolean(passphrase);
    const defaultName = `budget_backup_${new Date().toISOString().slice(0, 10)}${isEncrypted ? '.enc' : '.json'}`;

    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: isEncrypted ? 'Encrypted Budget Backup' : 'Budget JSON Backup',
            accept: { 'application/json': ['.json', '.enc'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return { success: true, filename: handle.name || defaultName };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        throw e;
      }
    }

    // Fallback: standard file download
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true, filename: defaultName };
  }

  return {
    getClientId,
    setClientId,
    isConnected,
    getUserEmail,
    getLastSyncInfo,
    getSessionPassphrase,
    setSessionPassphrase,
    isAutoSyncEnabled,
    setAutoSyncEnabled,
    isEncryptionEnabled,
    setEncryptionEnabled,
    connectGoogleDrive,
    disconnectGoogleDrive,
    backupToGoogleDrive,
    restoreFromGoogleDrive,
    checkRemoteBackup,
    saveToSyncedFolder
  };
}));
