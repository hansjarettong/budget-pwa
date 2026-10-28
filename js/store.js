/**
 * store.js - Core data storage and persistence engine for Budget Tracking PWA
 * Handles categories and transactions management, LocalStorage persistence,
 * JSON export/import, CSV export, and reset functionality.
 */

// In-memory fallback for environments without localStorage (e.g. testing, private mode)
let memoryStore = {};

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      const testKey = '__pwa_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return localStorage;
    }
  } catch (e) {
    // LocalStorage inaccessible; use memoryStore fallback
  }
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    },
    setItem: function (key, val) {
      memoryStore[key] = String(val);
    },
    removeItem: function (key) {
      delete memoryStore[key];
    },
    clear: function () {
      memoryStore = {};
    }
  };
}

const STORAGE_KEYS = {
  CATEGORIES: 'budget_pwa_categories',
  TRANSACTIONS: 'budget_pwa_transactions',
  SAVINGS_GOALS: 'budget_pwa_savings_goals',
  SAVINGS_RECORDS: 'budget_pwa_savings_records',
  CURRENCY: 'budget_pwa_currency',
  INITIALIZED: 'budget_pwa_initialized'
};

/**
 * 10 Pre-configured default budget categories with icons, colors, and initial monthly limits (in JPY).
 */
const DEFAULT_CATEGORIES = [
  { id: 'cat_dining', name: 'Dining', icon: '🍔', limit: 40000, color: '#f97316' },
  { id: 'cat_groceries', name: 'Groceries', icon: '🛒', limit: 50000, color: '#10b981' },
  { id: 'cat_transport', name: 'Transport', icon: '🚇', limit: 15000, color: '#06b6d4' },
  { id: 'cat_bills', name: 'Bills & Utilities', icon: '⚡', limit: 30000, color: '#eab308' },
  { id: 'cat_shopping', name: 'Shopping', icon: '🛍️', limit: 20000, color: '#ec4899' },
  { id: 'cat_entertainment', name: 'Entertainment', icon: '🎬', limit: 15000, color: '#8b5cf6' },
  { id: 'cat_health', name: 'Health & Wellness', icon: '💊', limit: 10000, color: '#ef4444' },
  { id: 'cat_personal', name: 'Personal Care', icon: '💈', limit: 10000, color: '#3b82f6' },
  { id: 'cat_education', name: 'Education', icon: '📚', limit: 10000, color: '#14b8a6' },
  { id: 'cat_misc', name: 'Miscellaneous', icon: '📦', limit: 10000, color: '#64748b' }
];

/**
 * Helper to get today's date formatted as 'YYYY-MM-DD'.
 * @returns {string}
 */
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper to generate random unique identifier.
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Retrieves the currently active currency code (defaults to 'JPY').
 * @returns {string} e.g. 'JPY', 'USD', 'PHP'
 */
function getCurrency() {
  const storage = getStorage();
  return storage.getItem(STORAGE_KEYS.CURRENCY) || 'JPY';
}

/**
 * Sets the active currency code.
 * @param {string} currencyCode
 * @returns {string} Sanitized uppercase currency code
 */
function setCurrency(currencyCode) {
  const storage = getStorage();
  const code = String(currencyCode || 'JPY').toUpperCase().trim();
  storage.setItem(STORAGE_KEYS.CURRENCY, code);
  return code;
}

/**
 * Retrieves all categories from storage. Initializes defaults if empty.
 * @returns {Array<Object>}
 */
function getCategories() {
  const storage = getStorage();
  const isInitialized = storage.getItem(STORAGE_KEYS.INITIALIZED);
  const raw = storage.getItem(STORAGE_KEYS.CATEGORIES);

  if (!isInitialized && raw === null) {
    const initial = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(initial));
    storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    return initial;
  }

  if (raw === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse categories from storage:', e);
  }
  return [];
}

/**
 * Retrieves a single category by id.
 * @param {string} categoryId
 * @returns {Object|null}
 */
function getCategoryById(categoryId) {
  if (!categoryId) return null;
  const categories = getCategories();
  return categories.find(c => c.id === categoryId) || null;
}

/**
 * Saves a category (creates new or updates existing).
 * @param {Object} category - { id, name, icon, color, limit }
 * @returns {Object} Saved category
 */
function saveCategory(category) {
  if (!category || typeof category !== 'object') {
    throw new Error('Category must be an object');
  }

  const categories = getCategories();
  const sanitized = {
    id: category.id || generateId('cat'),
    name: String(category.name || 'Unnamed Category').trim(),
    icon: String(category.icon || '📦').trim(),
    color: String(category.color || '#64748b').trim(),
    limit: Math.max(0, Math.round((Number(category.limit) || 0) * 100) / 100)
  };

  const existingIdx = categories.findIndex(c => c.id === sanitized.id);
  if (existingIdx >= 0) {
    categories[existingIdx] = sanitized;
  } else {
    categories.push(sanitized);
  }

  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  return sanitized;
}

/**
 * Deletes a category by id.
 * @param {string} categoryId
 * @returns {boolean} True if deleted, false if not found
 */
function deleteCategory(categoryId) {
  if (!categoryId) return false;
  const categories = getCategories();
  const index = categories.findIndex(c => c.id === categoryId);
  if (index === -1) return false;

  categories.splice(index, 1);
  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
  return true;
}

/**
 * Retrieves all transactions from storage, optionally filtered by monthKey or categoryId.
 * @param {Object} [filter] - { monthKey?: string, categoryId?: string }
 * @returns {Array<Object>}
 */
function getTransactions(filter = null) {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEYS.TRANSACTIONS);
  if (!raw) return [];
  try {
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (filter && typeof filter === 'object') {
      if (filter.monthKey) {
        list = list.filter(t => t.date && String(t.date).startsWith(filter.monthKey));
      }
      if (filter.categoryId) {
        list = list.filter(t => t.categoryId === filter.categoryId);
      }
    }
    return list;
  } catch (e) {
    console.warn('Failed to parse transactions from storage:', e);
    return [];
  }
}

/**
 * Adds a new transaction.
 * @param {Object} txData - { amount, categoryId, date, note }
 * @returns {Object} Newly created transaction
 */
function addTransaction({ amount, categoryId, date, note }) {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) {
    throw new Error('Valid transaction amount is required');
  }

  const newTx = {
    id: generateId('tx'),
    amount: Math.round(numAmount * 100) / 100,
    categoryId: String(categoryId || ''),
    date: date ? String(date).split('T')[0] : getTodayDateString(),
    note: String(note || '').trim(),
    createdAt: new Date().toISOString()
  };

  const transactions = getTransactions();
  // Prepend so newest appears first
  transactions.unshift(newTx);

  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  return newTx;
}

/**
 * Updates an existing transaction.
 * @param {Object} transaction - { id, amount?, categoryId?, date?, note? }
 * @returns {Object|null} Updated transaction, or null if not found
 */
function updateTransaction(transaction) {
  if (!transaction || !transaction.id) {
    throw new Error('Transaction id is required for update');
  }

  const transactions = getTransactions();
  const index = transactions.findIndex(t => t.id === transaction.id);
  if (index === -1) return null;

  const current = transactions[index];
  const updated = {
    ...current,
    amount: transaction.amount !== undefined ? Math.round(Number(transaction.amount) * 100) / 100 : current.amount,
    categoryId: transaction.categoryId !== undefined ? String(transaction.categoryId) : current.categoryId,
    date: transaction.date !== undefined ? String(transaction.date).split('T')[0] : current.date,
    note: transaction.note !== undefined ? String(transaction.note).trim() : current.note,
    updatedAt: new Date().toISOString()
  };

  transactions[index] = updated;
  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  return updated;
}

/**
 * Deletes a transaction by id.
 * @param {string} transactionId
 * @returns {boolean} True if deleted, false if not found
 */
function deleteTransaction(transactionId) {
  if (!transactionId) return false;
  const transactions = getTransactions();
  const index = transactions.findIndex(t => t.id === transactionId);
  if (index === -1) return false;

  transactions.splice(index, 1);
  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
  return true;
}

/**
 * Returns an array of distinct 'YYYY-MM' month strings that contain at least one transaction.
 * @returns {Array<string>} e.g. ['2026-01', '2026-10']
 */
function getMonthsWithTransactions() {
  const transactions = getTransactions();
  const monthsSet = new Set();
  for (const tx of transactions) {
    if (tx && tx.date) {
      const monthPart = String(tx.date).slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(monthPart)) {
        monthsSet.add(monthPart);
      }
    }
  }
  return Array.from(monthsSet).sort();
}

/**
 * Retrieves all savings goals from storage.
 * @returns {Array<Object>}
 */
function getSavingsGoals() {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEYS.SAVINGS_GOALS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to parse savings goals from storage:', e);
  }
  return [];
}

/**
 * Retrieves a single savings goal by id.
 * @param {string} goalId
 * @returns {Object|null}
 */
function getSavingsGoalById(goalId) {
  if (!goalId) return null;
  const goals = getSavingsGoals();
  return goals.find(g => g.id === goalId) || null;
}

/**
 * Saves a savings goal (creates new or updates existing).
 * @param {Object} goal - { id?, name, targetAmount, targetDate?, icon?, color? }
 * @returns {Object} Saved goal
 */
function saveSavingsGoal(goal) {
  if (!goal || typeof goal !== 'object') {
    throw new Error('Savings goal must be an object');
  }

  const goals = getSavingsGoals();
  const sanitized = {
    id: goal.id || generateId('goal'),
    name: String(goal.name || 'Unnamed Goal').trim(),
    targetAmount: Math.max(0, Math.round((Number(goal.targetAmount) || 0) * 100) / 100),
    targetDate: goal.targetDate ? String(goal.targetDate).split('T')[0] : null,
    icon: String(goal.icon || '🎯').trim(),
    color: String(goal.color || '#007AFF').trim(),
    createdAt: goal.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const existingIdx = goals.findIndex(g => g.id === sanitized.id);
  if (existingIdx >= 0) {
    goals[existingIdx] = sanitized;
  } else {
    goals.push(sanitized);
  }

  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.SAVINGS_GOALS, JSON.stringify(goals));
  return sanitized;
}

/**
 * Deletes a savings goal by id and cleans up all its associated savings records.
 * @param {string} goalId
 * @returns {boolean} True if deleted, false if not found
 */
function deleteSavingsGoal(goalId) {
  if (!goalId) return false;
  const goals = getSavingsGoals();
  const index = goals.findIndex(g => g.id === goalId);
  if (index === -1) return false;

  goals.splice(index, 1);
  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.SAVINGS_GOALS, JSON.stringify(goals));

  // Also remove records associated with this goal
  const records = getSavingsRecords();
  const filteredRecords = records.filter(r => r.goalId !== goalId);
  storage.setItem(STORAGE_KEYS.SAVINGS_RECORDS, JSON.stringify(filteredRecords));

  return true;
}

/**
 * Retrieves all savings records, optionally filtered by goalId, monthKey, or type.
 * @param {Object} [filter] - { goalId?: string, monthKey?: string, type?: 'deposit'|'withdraw' }
 * @returns {Array<Object>}
 */
function getSavingsRecords(filter = null) {
  const storage = getStorage();
  const raw = storage.getItem(STORAGE_KEYS.SAVINGS_RECORDS);
  if (!raw) return [];
  try {
    let list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    if (filter && typeof filter === 'object') {
      if (filter.goalId) {
        list = list.filter(r => r.goalId === filter.goalId);
      }
      if (filter.monthKey) {
        list = list.filter(r => r.date && String(r.date).startsWith(filter.monthKey));
      }
      if (filter.type) {
        list = list.filter(r => r.type === filter.type);
      }
    }
    return list;
  } catch (e) {
    console.warn('Failed to parse savings records from storage:', e);
    return [];
  }
}

/**
 * Adds a new savings record (deposit or withdrawal).
 * @param {Object} recordData - { goalId, amount, type?, date?, note? }
 * @returns {Object} Newly created record
 */
function addSavingsRecord({ goalId, amount, type = 'deposit', date, note }) {
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Valid positive savings amount is required');
  }
  if (!goalId) {
    throw new Error('Valid savings goalId is required');
  }

  const recordType = type === 'withdraw' ? 'withdraw' : 'deposit';
  const newRecord = {
    id: generateId('srec'),
    goalId: String(goalId),
    amount: Math.round(numAmount * 100) / 100,
    type: recordType,
    date: date ? String(date).split('T')[0] : getTodayDateString(),
    note: String(note || '').trim(),
    createdAt: new Date().toISOString()
  };

  const records = getSavingsRecords();
  records.unshift(newRecord);

  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.SAVINGS_RECORDS, JSON.stringify(records));
  return newRecord;
}

/**
 * Deletes a savings record by id.
 * @param {string} recordId
 * @returns {boolean} True if deleted, false if not found
 */
function deleteSavingsRecord(recordId) {
  if (!recordId) return false;
  const records = getSavingsRecords();
  const index = records.findIndex(r => r.id === recordId);
  if (index === -1) return false;

  records.splice(index, 1);
  const storage = getStorage();
  storage.setItem(STORAGE_KEYS.SAVINGS_RECORDS, JSON.stringify(records));
  return true;
}

/**
 * Exports all data (categories + transactions + savings) as JSON string.
 * @returns {string}
 */
function exportDataJSON() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    currency: getCurrency(),
    categories: getCategories(),
    transactions: getTransactions(),
    savingsGoals: getSavingsGoals(),
    savingsRecords: getSavingsRecords()
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Checks whether a payload is encrypted with BudgetCrypto.
 * @param {any} data
 * @returns {boolean}
 */
function isEncryptedPayload(data) {
  const cryptoModule = typeof BudgetCrypto !== 'undefined' ? BudgetCrypto : (typeof require === 'function' ? require('./crypto.js') : null);
  if (cryptoModule && typeof cryptoModule.isEncryptedPayload === 'function') {
    return cryptoModule.isEncryptedPayload(data);
  }
  if (!data) return false;
  let obj = data;
  if (typeof data === 'string') {
    try {
      obj = JSON.parse(data);
    } catch (e) {
      return false;
    }
  }
  return Boolean(obj && typeof obj === 'object' && obj.encrypted === true && obj.salt && obj.iv && obj.ciphertext);
}

/**
 * Imports data from JSON string or object.
 * Replaces or merges categories and transactions.
 * @param {string|Object} jsonInput
 * @returns {{ success: boolean, categoriesCount?: number, transactionsCount?: number, isEncrypted?: boolean, needsPassphrase?: boolean, error?: string }}
 */
function importDataJSON(jsonInput) {
  try {
    const data = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid data format: payload must be a JSON object' };
    }

    if (isEncryptedPayload(data)) {
      return {
        success: false,
        isEncrypted: true,
        needsPassphrase: true,
        error: 'This backup is encrypted with a passphrase. Please provide the passphrase to restore.'
      };
    }

    const storage = getStorage();
    let categoriesCount = 0;
    let transactionsCount = 0;
    let savingsGoalsCount = 0;
    let savingsRecordsCount = 0;

    if (data.currency && typeof data.currency === 'string') {
      setCurrency(data.currency);
    }

    if (Array.isArray(data.categories)) {
      const sanitizedCategories = data.categories.map(c => ({
        id: c.id || generateId('cat'),
        name: String(c.name || 'Unnamed Category').trim(),
        icon: String(c.icon || '📦').trim(),
        color: String(c.color || '#64748b').trim(),
        limit: Math.max(0, Math.round((Number(c.limit) || 0) * 100) / 100)
      }));
      storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(sanitizedCategories));
      storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
      categoriesCount = sanitizedCategories.length;
    }

    if (Array.isArray(data.transactions)) {
      const sanitizedTransactions = data.transactions.map(t => ({
        id: t.id || generateId('tx'),
        amount: Math.round((Number(t.amount) || 0) * 100) / 100,
        categoryId: String(t.categoryId || ''),
        date: t.date ? String(t.date).split('T')[0] : getTodayDateString(),
        note: String(t.note || '').trim(),
        createdAt: t.createdAt || new Date().toISOString()
      }));
      storage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(sanitizedTransactions));
      transactionsCount = sanitizedTransactions.length;
    }

    if (Array.isArray(data.savingsGoals)) {
      const sanitizedGoals = data.savingsGoals.map(g => ({
        id: g.id || generateId('goal'),
        name: String(g.name || 'Unnamed Goal').trim(),
        targetAmount: Math.max(0, Math.round((Number(g.targetAmount) || 0) * 100) / 100),
        targetDate: g.targetDate ? String(g.targetDate).split('T')[0] : null,
        icon: String(g.icon || '🎯').trim(),
        color: String(g.color || '#007AFF').trim(),
        createdAt: g.createdAt || new Date().toISOString(),
        updatedAt: g.updatedAt || new Date().toISOString()
      }));
      storage.setItem(STORAGE_KEYS.SAVINGS_GOALS, JSON.stringify(sanitizedGoals));
      savingsGoalsCount = sanitizedGoals.length;
    }

    if (Array.isArray(data.savingsRecords)) {
      const sanitizedRecords = data.savingsRecords.map(r => ({
        id: r.id || generateId('srec'),
        goalId: String(r.goalId || ''),
        amount: Math.max(0, Math.round((Number(r.amount) || 0) * 100) / 100),
        type: r.type === 'withdraw' ? 'withdraw' : 'deposit',
        date: r.date ? String(r.date).split('T')[0] : getTodayDateString(),
        note: String(r.note || '').trim(),
        createdAt: r.createdAt || new Date().toISOString()
      }));
      storage.setItem(STORAGE_KEYS.SAVINGS_RECORDS, JSON.stringify(sanitizedRecords));
      savingsRecordsCount = sanitizedRecords.length;
    }

    return {
      success: true,
      categoriesCount,
      transactionsCount,
      savingsGoalsCount,
      savingsRecordsCount
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Failed to parse JSON'
    };
  }
}

/**
 * Asynchronously imports JSON data with optional decryption passphrase.
 * @param {string|Object} jsonInput
 * @param {string} [passphrase]
 * @returns {Promise<{ success: boolean, categoriesCount?: number, transactionsCount?: number, isEncrypted?: boolean, needsPassphrase?: boolean, error?: string }>}
 */
async function importDataJSONAsync(jsonInput, passphrase = null) {
  if (isEncryptedPayload(jsonInput)) {
    if (!passphrase) {
      return {
        success: false,
        isEncrypted: true,
        needsPassphrase: true,
        error: 'This backup is encrypted. Please enter your passphrase.'
      };
    }
    const cryptoModule = typeof BudgetCrypto !== 'undefined' ? BudgetCrypto : (typeof require === 'function' ? require('./crypto.js') : null);
    if (!cryptoModule || typeof cryptoModule.decrypt !== 'function') {
      return { success: false, error: 'Encryption engine (BudgetCrypto) is not available' };
    }
    try {
      const decryptedPlaintext = await cryptoModule.decrypt(jsonInput, passphrase);
      return importDataJSON(decryptedPlaintext);
    } catch (err) {
      return { success: false, isEncrypted: true, error: err.message || 'Decryption failed: Incorrect passphrase' };
    }
  }
  return importDataJSON(jsonInput);
}

/**
 * Exports data with optional client-side AES-GCM encryption.
 * @param {string} [passphrase] - If provided, encrypts the JSON backup
 * @returns {Promise<string>}
 */
async function exportData(passphrase = null) {
  const plainJSON = exportDataJSON();
  if (!passphrase) {
    return plainJSON;
  }
  const cryptoModule = typeof BudgetCrypto !== 'undefined' ? BudgetCrypto : (typeof require === 'function' ? require('./crypto.js') : null);
  if (!cryptoModule || typeof cryptoModule.encrypt !== 'function') {
    throw new Error('Encryption engine (BudgetCrypto) is not available');
  }
  const encryptedPkg = await cryptoModule.encrypt(plainJSON, passphrase);
  return JSON.stringify(encryptedPkg, null, 2);
}

/**
 * Helper to escape CSV field values according to RFC 4180.
 * @param {any} val
 * @returns {string}
 */
function escapeCSVField(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports all transactions as a CSV string.
 * Format: Date,Category,Amount,Note
 * @returns {string}
 */
function exportTransactionsCSV() {
  const categories = getCategories();
  const categoryMap = new Map();
  for (const cat of categories) {
    categoryMap.set(cat.id, cat.name);
  }

  const transactions = getTransactions();
  // Header
  const lines = ['Date,Category,Amount,Note'];

  for (const tx of transactions) {
    const categoryName = categoryMap.get(tx.categoryId) || tx.categoryId || 'Uncategorized';
    const row = [
      escapeCSVField(tx.date),
      escapeCSVField(categoryName),
      escapeCSVField(Number(tx.amount || 0).toFixed(2)),
      escapeCSVField(tx.note)
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}

/**
 * Resets storage to default 10 categories and clears all transactions.
 * @returns {{ categories: Array<Object>, transactions: Array<Object> }}
 */
function resetToDefaultData() {
  const storage = getStorage();
  const defaultCats = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  storage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(defaultCats));
  storage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.SAVINGS_GOALS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.SAVINGS_RECORDS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  return {
    categories: defaultCats,
    transactions: [],
    savingsGoals: [],
    savingsRecords: []
  };
}

/**
 * Checks whether persistent storage is currently granted by the browser/OS.
 * @returns {Promise<boolean>}
 */
async function checkStoragePersistence() {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persisted === 'function') {
    try {
      return await navigator.storage.persisted();
    } catch (err) {
      console.warn('Persistence status check failed:', err);
    }
  }
  return false;
}

/**
 * Requests persistent storage from the browser/OS.
 * When granted, the browser/OS exempts this site from eviction during low disk space cleanups.
 * @returns {Promise<boolean>} True if granted, false otherwise.
 */
async function requestStoragePersistence() {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
    try {
      const isAlreadyPersisted = await navigator.storage.persisted();
      if (isAlreadyPersisted) {
        return true;
      }
      return await navigator.storage.persist();
    } catch (err) {
      console.warn('Storage persistence request failed:', err);
    }
  }
  return false;
}

/**
 * Formats a byte number to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * Retrieves storage usage and quota estimates from the browser StorageManager.
 * @returns {Promise<{ usage: number, quota: number, percent: number, usageFormatted: string, quotaFormatted: string }|null>}
 */
async function getStorageEstimate() {
  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = quota > 0 ? Math.min(100, Math.round((usage / quota) * 1000) / 10) : 0;

      return {
        usage,
        quota,
        percent,
        usageFormatted: formatBytes(usage),
        quotaFormatted: formatBytes(quota)
      };
    } catch (err) {
      console.warn('Storage estimate failed:', err);
    }
  }
  return null;
}

// Bundle all store functions and constants
const BudgetStore = {
  STORAGE_KEYS,
  DEFAULT_CATEGORIES,
  getCurrency,
  setCurrency,
  getCategories,
  getCategoryById,
  saveCategory,
  deleteCategory,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getMonthsWithTransactions,
  getSavingsGoals,
  getSavingsGoalById,
  saveSavingsGoal,
  deleteSavingsGoal,
  getSavingsRecords,
  addSavingsRecord,
  deleteSavingsRecord,
  exportDataJSON,
  importDataJSON,
  importDataJSONAsync,
  exportData,
  isEncryptedPayload,
  exportTransactionsCSV,
  resetToDefaultData,
  checkStoragePersistence,
  requestStoragePersistence,
  getStorageEstimate,
  formatBytes
};

// Expose on globalThis / window for browser script tags
if (typeof globalThis !== 'undefined') {
  globalThis.BudgetStore = BudgetStore;
  Object.assign(globalThis, BudgetStore);
} else if (typeof window !== 'undefined') {
  window.BudgetStore = BudgetStore;
  Object.assign(window, BudgetStore);
}

// CommonJS support for test runners
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BudgetStore;
}
