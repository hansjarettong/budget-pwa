/**
 * calculations.js - Core calculation engine for Budget Tracking PWA
 * Handles monthly date arithmetic, currency formatting, category spending aggregations,
 * category & overall budget status calculations, and transaction grouping.
 */

/**
 * Returns month key in 'YYYY-MM' format for a given date (defaults to current date).
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. '2026-10'
 */
function getCurrentMonthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Shifts a 'YYYY-MM' month key by deltaMonths (positive for future, negative for past).
 * @param {string} monthKey - 'YYYY-MM'
 * @param {number} deltaMonths - e.g. -1, 1
 * @returns {string} 'YYYY-MM'
 */
function shiftMonthKey(monthKey, deltaMonths = 0) {
  if (!monthKey || typeof monthKey !== 'string') {
    monthKey = getCurrentMonthKey();
  }
  const parts = monthKey.split('-');
  let year = parseInt(parts[0], 10);
  let month = parseInt(parts[1], 10); // 1-12

  if (isNaN(year) || isNaN(month)) {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  // Month in Date constructor is 0-indexed (0 to 11)
  const targetDate = new Date(year, month - 1 + deltaMonths, 1);
  const newYear = targetDate.getFullYear();
  const newMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
  return `${newYear}-${newMonth}`;
}

/**
 * Helper to get previous month key string.
 * @param {string} monthKey
 * @returns {string}
 */
function getPreviousMonthKey(monthKey) {
  return shiftMonthKey(monthKey, -1);
}

/**
 * Helper to get next month key string.
 * @param {string} monthKey
 * @returns {string}
 */
function getNextMonthKey(monthKey) {
  return shiftMonthKey(monthKey, 1);
}

/**
 * Human-readable month display (e.g. 'October 2026').
 * @param {string} monthKey - 'YYYY-MM'
 * @param {string} [locale='en-US']
 * @returns {string}
 */
function formatMonthDisplay(monthKey, locale = 'en-US') {
  if (!monthKey || typeof monthKey !== 'string') {
    monthKey = getCurrentMonthKey();
  }
  const parts = monthKey.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/**
 * Supported world currencies with display symbols, locales, and fraction digits.
 */
const SUPPORTED_CURRENCIES = {
  USD: { code: 'USD', symbol: '$', locale: 'en-US', name: 'USD ($) - US Dollar', fractionDigits: 2 },
  JPY: { code: 'JPY', symbol: '¥', locale: 'ja-JP', name: 'JPY (¥) - Japanese Yen', fractionDigits: 0 },
  PHP: { code: 'PHP', symbol: '₱', locale: 'en-PH', name: 'PHP (₱) - Philippine Peso', fractionDigits: 2 },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE', name: 'EUR (€) - Euro', fractionDigits: 2 },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'GBP (£) - British Pound', fractionDigits: 2 },
  CAD: { code: 'CAD', symbol: 'CA$', locale: 'en-CA', name: 'CAD ($) - Canadian Dollar', fractionDigits: 2 },
  AUD: { code: 'AUD', symbol: 'A$', locale: 'en-AU', name: 'AUD ($) - Australian Dollar', fractionDigits: 2 },
  SGD: { code: 'SGD', symbol: 'S$', locale: 'en-SG', name: 'SGD (S$) - Singapore Dollar', fractionDigits: 2 },
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'INR (₹) - Indian Rupee', fractionDigits: 2 },
  KRW: { code: 'KRW', symbol: '₩', locale: 'ko-KR', name: 'KRW (₩) - South Korean Won', fractionDigits: 0 },
  CNY: { code: 'CNY', symbol: '¥', locale: 'zh-CN', name: 'CNY (¥) - Chinese Yuan', fractionDigits: 2 },
  THB: { code: 'THB', symbol: '฿', locale: 'th-TH', name: 'THB (฿) - Thai Baht', fractionDigits: 2 },
  VND: { code: 'VND', symbol: '₫', locale: 'vi-VN', name: 'VND (₫) - Vietnamese Dong', fractionDigits: 0 },
  IDR: { code: 'IDR', symbol: 'Rp', locale: 'id-ID', name: 'IDR (Rp) - Indonesian Rupiah', fractionDigits: 0 },
  MYR: { code: 'MYR', symbol: 'RM', locale: 'ms-MY', name: 'MYR (RM) - Malaysian Ringgit', fractionDigits: 2 },
  CHF: { code: 'CHF', symbol: 'CHF', locale: 'de-CH', name: 'CHF (CHF) - Swiss Franc', fractionDigits: 2 },
  BRL: { code: 'BRL', symbol: 'R$', locale: 'pt-BR', name: 'BRL (R$) - Brazilian Real', fractionDigits: 2 },
  MXN: { code: 'MXN', symbol: 'MX$', locale: 'es-MX', name: 'MXN (MX$) - Mexican Peso', fractionDigits: 2 }
};

/**
 * Returns configuration metadata for a given currency code.
 * @param {string} code
 * @returns {Object}
 */
function getCurrencyConfig(code) {
  const upper = String(code || '').toUpperCase().trim();
  return SUPPORTED_CURRENCIES[upper] || SUPPORTED_CURRENCIES['JPY'];
}

/**
 * Helper to get the display currency symbol.
 * @param {string} [code]
 * @returns {string} e.g. '$', '¥', '₱'
 */
function getCurrencySymbol(code = null) {
  let targetCode = code;
  if (!targetCode && typeof BudgetStore !== 'undefined' && BudgetStore.getCurrency) {
    targetCode = BudgetStore.getCurrency();
  } else if (!targetCode && typeof window !== 'undefined' && window.BudgetStore && window.BudgetStore.getCurrency) {
    targetCode = window.BudgetStore.getCurrency();
  }
  return getCurrencyConfig(targetCode).symbol;
}

/**
 * Formats a numeric amount as currency string according to active/specified currency.
 * @param {number|string} amount
 * @param {string} [currency=null] - defaults to active currency from store or 'USD'
 * @param {string} [locale=null]
 * @returns {string} e.g. '$1,234.56', '¥1,500', or '₱500.00'
 */
function formatCurrency(amount, currency = null, locale = null) {
  const num = Number(amount);
  const validNum = isNaN(num) ? 0 : num;

  let code = currency;
  if (!code && typeof BudgetStore !== 'undefined' && BudgetStore.getCurrency) {
    code = BudgetStore.getCurrency();
  } else if (!code && typeof window !== 'undefined' && window.BudgetStore && window.BudgetStore.getCurrency) {
    code = window.BudgetStore.getCurrency();
  }

  const config = getCurrencyConfig(code);
  const targetLocale = locale || config.locale || 'en-US';
  const fracDigits = config.fractionDigits !== undefined ? config.fractionDigits : 2;

  try {
    return new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: config.code,
      minimumFractionDigits: fracDigits,
      maximumFractionDigits: fracDigits
    }).format(validNum);
  } catch (e) {
    const sign = validNum < 0 ? '-' : '';
    const absVal = Math.abs(validNum).toFixed(fracDigits);
    return `${sign}${config.symbol}${absVal}`;
  }
}

/**
 * Returns sum of amounts for transactions matching categoryId and optionally monthKey.
 * @param {Array<Object>} transactions
 * @param {string} categoryId
 * @param {string} [monthKey] - optional 'YYYY-MM'
 * @returns {number}
 */
function getCategorySpending(transactions, categoryId, monthKey = null) {
  if (!Array.isArray(transactions) || !categoryId) return 0;
  const total = transactions
    .filter(tx => {
      if (!tx || tx.categoryId !== categoryId) return false;
      if (monthKey) {
        const dateStr = String(tx.date || '');
        if (!dateStr.startsWith(monthKey)) return false;
      }
      return true;
    })
    .reduce((sum, tx) => {
      const amt = Number(tx.amount);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Calculates category budget status.
 * Status logic:
 *  - 'safe' if percent < 75
 *  - 'warning' if 75 <= percent < 100
 *  - 'danger' if percent >= 100
 * Cleanly handles limit = 0 and negative amounts.
 *
 * @param {Object} category - { id, name, icon, color, limit }
 * @param {Array<Object>} transactions
 * @param {string} [monthKey] - 'YYYY-MM'
 * @returns {{ categoryId: string, name: string, icon: string, color: string, limit: number, spent: number, remaining: number, percent: number, status: 'safe'|'warning'|'danger' }}
 */
function getCategoryBudgetStatus(category, transactions, monthKey = null) {
  const cat = category || {};
  const categoryId = cat.id || cat.categoryId || '';
  const name = cat.name || 'Uncategorized';
  const icon = cat.icon || '📦';
  const color = cat.color || '#64748b';
  const rawLimit = Number(cat.limit);
  const limit = isNaN(rawLimit) ? 0 : Math.max(0, Math.round(rawLimit * 100) / 100);

  const spent = getCategorySpending(transactions, categoryId, monthKey);
  const remaining = Math.round((limit - spent) * 100) / 100;

  let percent = 0;
  let status = 'safe';

  if (limit <= 0) {
    if (spent > 0) {
      percent = 100;
      status = 'danger';
    } else {
      percent = 0;
      status = 'safe';
    }
  } else {
    percent = Number(((spent / limit) * 100).toFixed(1));
    if (percent < 75) {
      status = 'safe';
    } else if (percent < 100) {
      status = 'warning';
    } else {
      status = 'danger';
    }
  }

  return {
    categoryId,
    name,
    icon,
    color,
    limit,
    spent,
    remaining,
    percent,
    status
  };
}

/**
 * Calculates overall monthly budget status across all categories.
 * @param {Array<Object>} categories
 * @param {Array<Object>} transactions
 * @param {string} [monthKey] - 'YYYY-MM'
 * @returns {{ totalBudget: number, totalSpent: number, totalRemaining: number, overallPercent: number, status: 'safe'|'warning'|'danger' }}
 */
function getOverallMonthlyStatus(categories, transactions, monthKey = null) {
  const cats = Array.isArray(categories) ? categories : [];
  const txs = Array.isArray(transactions) ? transactions : [];

  const totalBudget = cats.reduce((sum, cat) => {
    const lim = Number(cat.limit);
    return sum + (isNaN(lim) ? 0 : Math.max(0, lim));
  }, 0);

  const filteredTxs = monthKey
    ? txs.filter(tx => tx && String(tx.date || '').startsWith(monthKey))
    : txs;

  const totalSpent = filteredTxs.reduce((sum, tx) => {
    const amt = Number(tx.amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const roundedBudget = Math.round(totalBudget * 100) / 100;
  const roundedSpent = Math.round(totalSpent * 100) / 100;
  const totalRemaining = Math.round((roundedBudget - roundedSpent) * 100) / 100;

  let overallPercent = 0;
  let status = 'safe';

  if (roundedBudget <= 0) {
    if (roundedSpent > 0) {
      overallPercent = 100;
      status = 'danger';
    } else {
      overallPercent = 0;
      status = 'safe';
    }
  } else {
    overallPercent = Number(((roundedSpent / roundedBudget) * 100).toFixed(1));
    if (overallPercent < 75) {
      status = 'safe';
    } else if (overallPercent < 100) {
      status = 'warning';
    } else {
      status = 'danger';
    }
  }

  return {
    totalBudget: roundedBudget,
    totalSpent: roundedSpent,
    totalRemaining,
    overallPercent,
    status
  };
}

/**
 * Helper to group transactions by date for history display.
 * Returns list of date groups sorted descending (newest date first),
 * with daily total and list of transactions for that date.
 *
 * @param {Array<Object>} transactions
 * @param {string} [monthKey] - optional 'YYYY-MM' filter
 * @returns {Array<{ date: string, formattedDate: string, total: number, transactions: Array<Object> }>}
 */
function groupTransactionsByDate(transactions, monthKey = null) {
  if (!Array.isArray(transactions)) return [];

  // Filter by monthKey if provided
  let list = transactions.filter(tx => {
    if (!tx || !tx.date) return false;
    if (monthKey && !String(tx.date).startsWith(monthKey)) return false;
    return true;
  });

  // Sort descending by date, then id / createdAt
  list.sort((a, b) => {
    const cmpDate = String(b.date).localeCompare(String(a.date));
    if (cmpDate !== 0) return cmpDate;
    const bTime = b.createdAt || b.id || '';
    const aTime = a.createdAt || a.id || '';
    return String(bTime).localeCompare(String(aTime));
  });

  // Group by date
  const groupsMap = new Map();
  const todayStr = getCurrentMonthKey() + '-' + String(new Date().getDate()).padStart(2, '0');
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;

  for (const tx of list) {
    const dateStr = String(tx.date).split('T')[0];
    if (!groupsMap.has(dateStr)) {
      let formattedDate = dateStr;
      try {
        if (dateStr === todayStr) {
          formattedDate = 'Today';
        } else if (dateStr === yesterdayStr) {
          formattedDate = 'Yesterday';
        } else {
          const [y, m, d] = dateStr.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          formattedDate = dt.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          });
        }
      } catch (e) {
        formattedDate = dateStr;
      }

      groupsMap.set(dateStr, {
        date: dateStr,
        formattedDate,
        total: 0,
        transactions: []
      });
    }

    const group = groupsMap.get(dateStr);
    group.transactions.push(tx);
    const amt = Number(tx.amount);
    group.total += isNaN(amt) ? 0 : amt;
  }

  // Round daily totals and return array
  const result = [];
  for (const group of groupsMap.values()) {
    group.total = Math.round(group.total * 100) / 100;
    result.push(group);
  }
  return result;
}

/**
 * Calculates current progress, accumulated savings, and recommended monthly pace for a savings goal.
 * @param {Object} goal - { id, name, targetAmount, targetDate?, icon?, color? }
 * @param {Array<Object>} records - Array of savings records
 * @param {string} [currentDateStr] - Reference date for remaining month calculation (default: today)
 * @returns {{ goalId: string, name: string, icon: string, color: string, targetAmount: number, targetDate: string|null, totalSaved: number, remainingAmount: number, percent: number, isCompleted: boolean, remainingMonths: number|null, recommendedMonthly: number|null }}
 */
function getGoalProgress(goal, records, currentDateStr = null) {
  const g = goal || {};
  const goalId = g.id || '';
  const name = g.name || 'Unnamed Goal';
  const icon = g.icon || '🎯';
  const color = g.color || '#007AFF';
  const rawTarget = Number(g.targetAmount);
  const targetAmount = isNaN(rawTarget) ? 0 : Math.max(0, Math.round(rawTarget * 100) / 100);
  const targetDate = g.targetDate ? String(g.targetDate).split('T')[0] : null;

  const goalRecords = Array.isArray(records) ? records.filter(r => r && r.goalId === goalId) : [];

  let deposits = 0;
  let withdrawals = 0;

  for (const r of goalRecords) {
    const amt = Number(r.amount) || 0;
    if (r.type === 'withdraw') {
      withdrawals += amt;
    } else {
      deposits += amt;
    }
  }

  const netSaved = Math.max(0, Math.round((deposits - withdrawals) * 100) / 100);
  const remainingAmount = Math.max(0, Math.round((targetAmount - netSaved) * 100) / 100);

  let percent = 0;
  if (targetAmount > 0) {
    percent = Number(((netSaved / targetAmount) * 100).toFixed(1));
  } else if (netSaved > 0) {
    percent = 100;
  }

  const isCompleted = targetAmount > 0 && netSaved >= targetAmount;

  let remainingMonths = null;
  let recommendedMonthly = null;

  if (targetDate && remainingAmount > 0) {
    const refKey = currentDateStr ? getCurrentMonthKey(currentDateStr) : getCurrentMonthKey();
    const [curYear, curMonth] = refKey.split('-').map(n => parseInt(n, 10));
    const [tgtYear, tgtMonth] = targetDate.split('-').map(n => parseInt(n, 10));

    if (!isNaN(curYear) && !isNaN(curMonth) && !isNaN(tgtYear) && !isNaN(tgtMonth)) {
      const monthDiff = (tgtYear - curYear) * 12 + (tgtMonth - curMonth);
      if (monthDiff > 0) {
        remainingMonths = monthDiff;
        recommendedMonthly = Math.ceil(remainingAmount / monthDiff);
      } else {
        remainingMonths = 0;
        recommendedMonthly = remainingAmount;
      }
    }
  }

  return {
    goalId,
    name,
    icon,
    color,
    targetAmount,
    targetDate,
    totalSaved: netSaved,
    remainingAmount,
    percent,
    isCompleted,
    remainingMonths,
    recommendedMonthly
  };
}

/**
 * Calculates total savings deposited, withdrawn, and net saved for a given month.
 * @param {Array<Object>} records - Array of savings records
 * @param {string} [monthKey] - optional 'YYYY-MM'
 * @returns {{ totalDeposited: number, totalWithdrawn: number, netSaved: number }}
 */
function getMonthlySavingsSummary(records, monthKey = null) {
  if (!Array.isArray(records)) {
    return { totalDeposited: 0, totalWithdrawn: 0, netSaved: 0 };
  }

  const filtered = monthKey
    ? records.filter(r => r && r.date && String(r.date).startsWith(monthKey))
    : records;

  let totalDeposited = 0;
  let totalWithdrawn = 0;

  for (const r of filtered) {
    const amt = Number(r.amount) || 0;
    if (r.type === 'withdraw') {
      totalWithdrawn += amt;
    } else {
      totalDeposited += amt;
    }
  }

  totalDeposited = Math.round(totalDeposited * 100) / 100;
  totalWithdrawn = Math.round(totalWithdrawn * 100) / 100;
  const netSaved = Math.round((totalDeposited - totalWithdrawn) * 100) / 100;

  return {
    totalDeposited,
    totalWithdrawn,
    netSaved
  };
}

/**
 * Calculates complete monthly financial breakdown separating consumable living expenses from savings goals,
 * and computing total monthly cash outflow.
 * @param {Array<Object>} categories
 * @param {Array<Object>} transactions
 * @param {Array<Object>} savingsRecords
 * @param {string} [monthKey] - 'YYYY-MM'
 * @returns {Object}
 */
function getOverallMonthlyBreakdown(categories, transactions, savingsRecords, monthKey = null) {
  const overall = getOverallMonthlyStatus(categories, transactions, monthKey);
  const savings = getMonthlySavingsSummary(savingsRecords, monthKey);
  const totalOutflow = Math.round((overall.totalSpent + savings.totalDeposited) * 100) / 100;

  return {
    // Living expenses
    totalBudget: overall.totalBudget,
    totalSpent: overall.totalSpent,
    totalRemaining: overall.totalRemaining,
    overallPercent: overall.overallPercent,
    status: overall.status,
    // Savings allocations
    savingsDeposited: savings.totalDeposited,
    savingsWithdrawn: savings.totalWithdrawn,
    netSaved: savings.netSaved,
    // Combined cash outflow
    totalOutflow
  };
}

// Bundle all calculation functions
const BudgetCalculations = {
  SUPPORTED_CURRENCIES,
  getCurrencyConfig,
  getCurrencySymbol,
  getCurrentMonthKey,
  shiftMonthKey,
  getPreviousMonthKey,
  getNextMonthKey,
  formatMonthDisplay,
  formatCurrency,
  getCategorySpending,
  getCategoryBudgetStatus,
  getOverallMonthlyStatus,
  groupTransactionsByDate,
  getGoalProgress,
  getMonthlySavingsSummary,
  getOverallMonthlyBreakdown
};

// Expose on globalThis / window for browser script tags
if (typeof globalThis !== 'undefined') {
  globalThis.BudgetCalculations = BudgetCalculations;
  Object.assign(globalThis, BudgetCalculations);
} else if (typeof window !== 'undefined') {
  window.BudgetCalculations = BudgetCalculations;
  Object.assign(window, BudgetCalculations);
}

// CommonJS support for test runners
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BudgetCalculations;
}
