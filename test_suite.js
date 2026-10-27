/**
 * Automated Test Suite for Budget Tracking PWA
 * Can be run via macOS built-in JavaScriptCore:
 *   /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc test_suite.js
 * Or via Node.js (if installed):
 *   node test_suite.js
 */

// Load core modules
if (typeof load === 'function') {
  // JavaScriptCore environment
  load('js/calculations.js');
  load('js/store.js');
  load('js/numpad.js');
} else if (typeof require === 'function') {
  // Node.js environment
  global.BudgetCalculations = require('./js/calculations.js');
  global.BudgetStore = require('./js/store.js');
  global.BudgetNumpad = require('./js/numpad.js');
  Object.assign(global, global.BudgetCalculations);
  Object.assign(global, global.BudgetStore);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (Expected: ${expected}, Got: ${actual})`);
  }
}

function test(name, fn) {
  try {
    fn();
    print ? print('  ✔ PASS: ' + name) : console.log('  ✔ PASS: ' + name);
    passed++;
  } catch (err) {
    print ? print('  ✖ FAIL: ' + name + '\n    ' + err.message) : console.error('  ✖ FAIL: ' + name, err.message);
    failed++;
  }
}

const log = typeof print === 'function' ? print : console.log;

log('\n=========================================');
log(' Running Budget PWA Unit & Logic Tests ');
log('=========================================\n');

// 1. Calculations & Date Arithmetic
test('Month key format and shifting across years', () => {
  assertEquals(shiftMonthKey('2026-01', -1), '2025-12', 'Previous month of Jan 2026 should be Dec 2025');
  assertEquals(shiftMonthKey('2026-12', 1), '2027-01', 'Next month of Dec 2026 should be Jan 2027');
  assertEquals(shiftMonthKey('2026-06', 0), '2026-06', 'Shifting 0 should remain 2026-06');
});

test('Month human display formatting', () => {
  const display = formatMonthDisplay('2026-10');
  assert(display.includes('October') && display.includes('2026'), 'Display should contain October 2026: ' + display);
});

test('Currency formatting', () => {
  const formatted = formatCurrency(4250.75);
  assert(formatted.includes('4,250.75') || formatted.includes('4250.75'), 'Formatted currency: ' + formatted);
});

test('Category spending aggregation', () => {
  const txs = [
    { categoryId: 'cat_dining', amount: 35.50, date: '2026-10-01' },
    { categoryId: 'cat_dining', amount: 14.50, date: '2026-10-12' },
    { categoryId: 'cat_groceries', amount: 80.00, date: '2026-10-05' },
    { categoryId: 'cat_dining', amount: 50.00, date: '2026-09-28' } // Different month
  ];

  const diningSpent = getCategorySpending(txs, 'cat_dining', '2026-10');
  assertEquals(diningSpent, 50.00, 'Dining spending in 2026-10 should be 50.00');

  const groceriesSpent = getCategorySpending(txs, 'cat_groceries', '2026-10');
  assertEquals(groceriesSpent, 80.00, 'Groceries spending in 2026-10 should be 80.00');
});

test('Budget limit thresholds and status indicators', () => {
  const category = { id: 'cat_test', limit: 200 };

  // Case 1: Under 80% -> safe
  const txSafe = [{ categoryId: 'cat_test', amount: 100, date: '2026-10-01' }];
  const statusSafe = getCategoryBudgetStatus(category, txSafe, '2026-10');
  assertEquals(statusSafe.status, 'safe', '50% consumption should be safe');
  assertEquals(statusSafe.percent, 50, 'Percent should be 50');
  assertEquals(statusSafe.remaining, 100, 'Remaining should be 100');

  // Case 2: 80% to 99% -> warning
  const txWarning = [{ categoryId: 'cat_test', amount: 170, date: '2026-10-01' }];
  const statusWarning = getCategoryBudgetStatus(category, txWarning, '2026-10');
  assertEquals(statusWarning.status, 'warning', '85% consumption should trigger warning');
  assertEquals(statusWarning.percent, 85, 'Percent should be 85');

  // Case 3: >= 100% -> danger
  const txDanger = [{ categoryId: 'cat_test', amount: 220, date: '2026-10-01' }];
  const statusDanger = getCategoryBudgetStatus(category, txDanger, '2026-10');
  assertEquals(statusDanger.status, 'danger', '110% consumption should trigger danger');
  assertEquals(statusDanger.percent, 110, 'Percent should be 110');
  assertEquals(statusDanger.remaining, -20, 'Remaining should be -20 (over budget)');
});

test('Overall monthly budget summary calculation', () => {
  const categories = [
    { id: 'cat_1', limit: 500 },
    { id: 'cat_2', limit: 300 }
  ];
  const txs = [
    { categoryId: 'cat_1', amount: 250, date: '2026-10-02' },
    { categoryId: 'cat_2', amount: 150, date: '2026-10-05' }
  ];

  const overall = getOverallMonthlyStatus(categories, txs, '2026-10');
  assertEquals(overall.totalBudget, 800, 'Total budget should be 800');
  assertEquals(overall.totalSpent, 400, 'Total spent should be 400');
  assertEquals(overall.totalRemaining, 400, 'Total remaining should be 400');
  assertEquals(overall.overallPercent, 50, 'Overall percent should be 50');
  assertEquals(overall.status, 'safe', 'Overall status should be safe');
});

test('Transaction grouping by date descending', () => {
  const txs = [
    { id: 't1', amount: 10, date: '2026-10-05', note: 'A' },
    { id: 't2', amount: 20, date: '2026-10-10', note: 'B' },
    { id: 't3', amount: 15, date: '2026-10-05', note: 'C' }
  ];

  const grouped = groupTransactionsByDate(txs);
  assertEquals(grouped.length, 2, 'Should group into 2 distinct date groups');
  assertEquals(grouped[0].date, '2026-10-10', 'First group should be newest date');
  assertEquals(grouped[0].total, 20, 'Total for 2026-10-10 should be 20');
  assertEquals(grouped[1].date, '2026-10-05', 'Second group should be 2026-10-05');
  assertEquals(grouped[1].total, 25, 'Total for 2026-10-05 should be 25');
  assertEquals(grouped[1].transactions.length, 2, 'Should have 2 transactions on 2026-10-05');
});

// 2. Data Store Tests
test('Default 10 categories initialization', () => {
  BudgetStore.resetToDefaultData();
  const cats = BudgetStore.getCategories();
  assertEquals(cats.length, 10, 'Should load 10 pre-configured default categories');
  assert(cats.some(c => c.name === 'Dining'), 'Should contain Dining');
  assert(cats.some(c => c.name === 'Groceries'), 'Should contain Groceries');
  assert(cats.some(c => c.name === 'Transport'), 'Should contain Transport');
});

test('Category updating and saving', () => {
  const cats = BudgetStore.getCategories();
  const dining = cats.find(c => c.id === 'cat_dining');
  assert(dining !== undefined, 'Dining category should exist');

  BudgetStore.saveCategory({
    id: 'cat_dining',
    name: 'Fine Dining',
    icon: '🍷',
    limit: 650,
    color: '#ff5500'
  });

  const updated = BudgetStore.getCategoryById('cat_dining');
  assertEquals(updated.name, 'Fine Dining', 'Name should be updated');
  assertEquals(updated.limit, 650, 'Limit should be updated to 650');
  assertEquals(updated.icon, '🍷', 'Icon should be updated to 🍷');
});

test('Option to delete default categories and guard against auto-reseeding', () => {
  BudgetStore.resetToDefaultData();
  let cats = BudgetStore.getCategories();
  assertEquals(cats.length, 10, 'Should start with 10 default categories');

  // Delete a default category (e.g. cat_dining)
  const deletedDining = BudgetStore.deleteCategory('cat_dining');
  assertEquals(deletedDining, true, 'deleteCategory(cat_dining) should return true');

  cats = BudgetStore.getCategories();
  assertEquals(cats.length, 9, 'Should have 9 categories after deleting Dining');
  assert(!cats.some(c => c.id === 'cat_dining'), 'Dining should no longer exist');

  // Delete another default category (e.g. cat_groceries)
  const deletedGroceries = BudgetStore.deleteCategory('cat_groceries');
  assertEquals(deletedGroceries, true, 'deleteCategory(cat_groceries) should return true');

  cats = BudgetStore.getCategories();
  assertEquals(cats.length, 8, 'Should have 8 categories remaining');

  // Delete all remaining categories down to 0
  for (const cat of [...cats]) {
    BudgetStore.deleteCategory(cat.id);
  }

  // Verify that getCategories() respects empty list and does NOT auto-resurrect defaults
  const emptyCats = BudgetStore.getCategories();
  assertEquals(emptyCats.length, 0, 'getCategories() should return empty array and not resurrect defaults');

  // Verify that resetToDefaultData restores them
  BudgetStore.resetToDefaultData();
  const restoredCats = BudgetStore.getCategories();
  assertEquals(restoredCats.length, 10, 'resetToDefaultData should restore 10 default categories');
});

test('Multi-currency configuration and formatting (JPY, PHP, EUR, GBP, USD)', () => {
  // Test JPY (0 fraction digits)
  BudgetStore.setCurrency('JPY');
  assertEquals(BudgetStore.getCurrency(), 'JPY', 'Active currency should be JPY');
  assertEquals(BudgetCalculations.getCurrencySymbol('JPY'), '¥', 'JPY symbol should be ¥');
  const jpyFormatted = BudgetCalculations.formatCurrency(1500);
  assert(jpyFormatted.includes('¥') || jpyFormatted.includes('JPY'), 'JPY format should include symbol: ' + jpyFormatted);
  assert(jpyFormatted.includes('1,500') || jpyFormatted.includes('1500'), 'JPY format should format integer: ' + jpyFormatted);
  assert(!jpyFormatted.includes('.00'), 'JPY format should NOT include decimal cents: ' + jpyFormatted);

  // Test PHP (2 fraction digits)
  BudgetStore.setCurrency('PHP');
  assertEquals(BudgetStore.getCurrency(), 'PHP', 'Active currency should be PHP');
  assertEquals(BudgetCalculations.getCurrencySymbol('PHP'), '₱', 'PHP symbol should be ₱');
  const phpFormatted = BudgetCalculations.formatCurrency(2500.5);
  assert(phpFormatted.includes('₱') || phpFormatted.includes('PHP'), 'PHP format should include symbol: ' + phpFormatted);
  assert(phpFormatted.includes('2,500.50') || phpFormatted.includes('2500.50'), 'PHP format should format 2 decimals: ' + phpFormatted);

  // Test EUR
  BudgetStore.setCurrency('EUR');
  assertEquals(BudgetCalculations.getCurrencySymbol('EUR'), '€', 'EUR symbol should be €');
  const eurFormatted = BudgetCalculations.formatCurrency(100);
  assert(eurFormatted.includes('€'), 'EUR format should include €');

  // Test GBP
  BudgetStore.setCurrency('GBP');
  assertEquals(BudgetCalculations.getCurrencySymbol('GBP'), '£', 'GBP symbol should be £');
  const gbpFormatted = BudgetCalculations.formatCurrency(100);
  assert(gbpFormatted.includes('£'), 'GBP format should include £');

  // Reset currency back to USD
  BudgetStore.setCurrency('USD');
  assertEquals(BudgetStore.getCurrency(), 'USD', 'Active currency should be USD');
  assertEquals(BudgetCalculations.getCurrencySymbol(), '$', 'USD symbol should be $');
});

test('Transaction lifecycle: Add, retrieve, filter, delete', () => {
  const tx = BudgetStore.addTransaction({
    categoryId: 'cat_groceries',
    amount: 64.25,
    date: '2026-10-18',
    note: 'Supermarket restock'
  });

  assert(tx.id && tx.id.startsWith('tx_'), 'Transaction should have valid ID: ' + tx.id);
  assertEquals(tx.amount, 64.25, 'Amount should match');

  const monthTxs = BudgetStore.getTransactions({ monthKey: '2026-10' });
  assert(monthTxs.some(t => t.id === tx.id), 'Transaction should be present in 2026-10 filter');

  const otherMonthTxs = BudgetStore.getTransactions({ monthKey: '2026-09' });
  assert(!otherMonthTxs.some(t => t.id === tx.id), 'Transaction should not be present in 2026-09');

  BudgetStore.deleteTransaction(tx.id);
  const afterDelete = BudgetStore.getTransactions();
  assert(!afterDelete.some(t => t.id === tx.id), 'Transaction should be deleted');
});

test('JSON Backup export and restore validation', () => {
  BudgetStore.setCurrency('PHP');
  BudgetStore.addTransaction({
    categoryId: 'cat_transport',
    amount: 15.00,
    date: '2026-10-12',
    note: 'Metro card'
  });

  const exportedJson = BudgetStore.exportDataJSON();
  assert(typeof exportedJson === 'string' && exportedJson.length > 50, 'Export JSON should be non-empty string');

  const parsed = JSON.parse(exportedJson);
  assertEquals(parsed.version, 1, 'Backup version should be 1');
  assertEquals(parsed.currency, 'PHP', 'Backup should preserve active currency PHP');
  assert(Array.isArray(parsed.categories), 'Should have categories array');
  assert(Array.isArray(parsed.transactions), 'Should have transactions array');

  // Change currency and import back to verify restoration
  BudgetStore.setCurrency('USD');
  assertEquals(BudgetStore.getCurrency(), 'USD', 'Currency switched to USD');

  const result = BudgetStore.importDataJSON(exportedJson);
  assertEquals(result.success, true, 'Import should succeed');
  assert(result.transactionsCount >= 1, 'Should import at least 1 transaction');
  assertEquals(BudgetStore.getCurrency(), 'PHP', 'Currency should be restored to PHP from backup');
});

test('CSV Export format validation', () => {
  const csv = BudgetStore.exportTransactionsCSV();
  const lines = csv.trim().split('\n');
  assertEquals(lines[0], 'Date,Category,Amount,Note', 'CSV header line should match');
  assert(lines.length >= 2, 'CSV should contain header and at least one row');
});

// 3. Tactile Numpad Controller Tests
test('Numpad keypad typing, decimal precision, backspace, max limit', () => {
  let displayed = '';
  const numpad = new BudgetNumpad.NumpadController({
    onAmountChange: (buf) => { displayed = buf; }
  });

  // Test typing 45.75
  numpad.pressDigit('4');
  numpad.pressDigit('5');
  numpad.pressDecimal();
  numpad.pressDigit('7');
  numpad.pressDigit('5');
  assertEquals(displayed, '45.75', 'Display should show 45.75');
  assertEquals(numpad.getNumericValue(), 45.75, 'Numeric value should be 45.75');

  // Attempting second decimal point should be ignored
  numpad.pressDecimal();
  assertEquals(displayed, '45.75', 'Second decimal should be ignored');

  // Attempting 3rd decimal digit should be ignored (cents only)
  numpad.pressDigit('9');
  assertEquals(displayed, '45.75', '3rd decimal digit should be ignored');

  // Test backspace
  numpad.pressBackspace();
  assertEquals(displayed, '45.7', 'Backspace should leave 45.7');
  numpad.pressBackspace();
  assertEquals(displayed, '45.', 'Backspace should leave 45.');
  numpad.pressBackspace();
  assertEquals(displayed, '45', 'Backspace should leave 45');

  // Test reset
  numpad.reset();
  assertEquals(displayed, '0', 'Reset should set buffer to 0');
  assertEquals(numpad.getNumericValue(), 0, 'Numeric value should be 0');

  // Test setting amount programmatically
  numpad.setAmount(120.5);
  assertEquals(numpad.getNumericValue(), 120.5, 'Programmatic amount should be 120.5');
});

log('\n-----------------------------------------');
log(` Tests completed: ${passed} passed, ${failed} failed`);
log('-----------------------------------------\n');

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
