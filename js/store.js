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
 * Exports all data (categories + transactions) as JSON string.
 * @returns {string}
 */
function exportDataJSON() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    currency: getCurrency(),
    categories: getCategories(),
    transactions: getTransactions()
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Imports data from JSON string or object.
 * Replaces or merges categories and transactions.
 * @param {string|Object} jsonInput
 * @returns {{ success: boolean, categoriesCount?: number, transactionsCount?: number, error?: string }}
 */
function importDataJSON(jsonInput) {
  try {
    const data = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'Invalid data format: payload must be a JSON object' };
    }

    const storage = getStorage();
    let categoriesCount = 0;
    let transactionsCount = 0;

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

    return {
      success: true,
      categoriesCount,
      transactionsCount
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Failed to parse JSON'
    };
  }
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
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  return {
    categories: defaultCats,
    transactions: []
  };
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
  exportDataJSON,
  importDataJSON,
  exportTransactionsCSV,
  resetToDefaultData
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
