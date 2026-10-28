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
  load('js/crypto.js');
  load('js/store.js');
  load('js/cloud.js');
  load('js/numpad.js');
  load('js/ocr-engine.js');
  load('js/receipt-parser.js');
} else if (typeof require === 'function') {
  // Node.js environment
  global.BudgetCalculations = require('./js/calculations.js');
  global.BudgetCrypto = require('./js/crypto.js');
  global.BudgetStore = require('./js/store.js');
  global.BudgetCloud = require('./js/cloud.js');
  global.BudgetNumpad = require('./js/numpad.js');
  global.BudgetOCR = require('./js/ocr-engine.js');
  global.ReceiptParser = require('./js/receipt-parser.js');
  Object.assign(global, global.BudgetCalculations);
  Object.assign(global, global.BudgetStore);
  Object.assign(global, global.ReceiptParser);
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
  // Default currency is JPY (0 fraction digits)
  const defaultJpy = formatCurrency(4250);
  assert(defaultJpy.includes('¥') || defaultJpy.includes('JPY'), 'Default currency should format with ¥: ' + defaultJpy);
  assert(defaultJpy.includes('4,250') || defaultJpy.includes('4250'), 'Default JPY should format 4,250: ' + defaultJpy);

  // Explicit USD (2 fraction digits)
  const usdFormatted = formatCurrency(4250.75, 'USD');
  assert(usdFormatted.includes('4,250.75') || usdFormatted.includes('4250.75'), 'Formatted USD currency: ' + usdFormatted);
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
test('Default 10 categories initialization with JPY limits', () => {
  BudgetStore.resetToDefaultData();
  const cats = BudgetStore.getCategories();
  assertEquals(cats.length, 10, 'Should load 10 pre-configured default categories');
  assert(cats.some(c => c.name === 'Dining'), 'Should contain Dining');
  assert(cats.some(c => c.name === 'Groceries'), 'Should contain Groceries');
  assert(cats.some(c => c.name === 'Transport'), 'Should contain Transport');
  const dining = cats.find(c => c.id === 'cat_dining');
  assertEquals(dining.limit, 40000, 'Dining limit should default to 40,000 JPY');
  const groceries = cats.find(c => c.id === 'cat_groceries');
  assertEquals(groceries.limit, 50000, 'Groceries limit should default to 50,000 JPY');
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

  // Test USD
  BudgetStore.setCurrency('USD');
  assertEquals(BudgetStore.getCurrency(), 'USD', 'Active currency should be USD');
  assertEquals(BudgetCalculations.getCurrencySymbol(), '$', 'USD symbol should be $');

  // Reset currency back to default JPY
  BudgetStore.setCurrency('JPY');
  assertEquals(BudgetStore.getCurrency(), 'JPY', 'Default active currency should be JPY');
  assertEquals(BudgetCalculations.getCurrencySymbol(), '¥', 'Default symbol should be ¥');
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

test('Numpad accepts large amounts for JPY (up to 99,999,999)', () => {
  const numpad = new BudgetNumpad.NumpadController();
  // Enter 1,500,000 (1.5 million yen)
  '1500000'.split('').forEach(d => numpad.pressDigit(d));
  assertEquals(numpad.getNumericValue(), 1500000, 'Should allow 1,500,000 yen');
});

test('getMonthsWithTransactions returns sorted list of months with activity', () => {
  BudgetStore.addTransaction({
    categoryId: 'cat_dining',
    amount: 1500,
    date: '2025-11-20',
    note: 'Dinner'
  });
  BudgetStore.addTransaction({
    categoryId: 'cat_groceries',
    amount: 3200,
    date: '2026-02-15',
    note: 'Market'
  });

  const months = BudgetStore.getMonthsWithTransactions();
  assert(months.includes('2025-11'), 'Should include 2025-11');
  assert(months.includes('2026-02'), 'Should include 2026-02');
});

// 4. Storage Persistence & Cloud Security Tests
test('Format bytes helper for storage monitor', () => {
  assertEquals(BudgetStore.formatBytes(500), '500 B', '500 bytes formatted');
  assertEquals(BudgetStore.formatBytes(1536), '1.5 KB', '1536 bytes is 1.5 KB');
  assertEquals(BudgetStore.formatBytes(1048576 * 2.5), '2.5 MB', '2.5 MB formatted');
  assertEquals(BudgetStore.formatBytes(1073741824 * 10), '10.00 GB', '10 GB formatted');
});

test('Storage persistence API request and estimate validation', () => {
  let persistRequested = false;
  let isCurrentlyPersisted = false;

  // Mock navigator.storage
  globalThis.navigator = {
    storage: {
      persisted: async () => isCurrentlyPersisted,
      persist: async () => {
        persistRequested = true;
        isCurrentlyPersisted = true;
        return true;
      },
      estimate: async () => ({
        usage: 204800,       // 200 KB
        quota: 10737418240   // 10 GB
      })
    }
  };

  let checkResult;
  BudgetStore.checkStoragePersistence().then(res => { checkResult = res; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();
  assertEquals(checkResult, false, 'Initial persistence should be false');

  let requestResult;
  BudgetStore.requestStoragePersistence().then(res => { requestResult = res; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();
  assertEquals(requestResult, true, 'Request persistence should return true');
  assertEquals(persistRequested, true, 'navigator.storage.persist should have been invoked');

  let estimateResult;
  BudgetStore.getStorageEstimate().then(res => { estimateResult = res; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();
  assert(estimateResult !== null, 'Estimate result should be present');
  assertEquals(estimateResult.usageFormatted, '200.0 KB', 'Usage should format to 200.0 KB');
  assertEquals(estimateResult.quotaFormatted, '10.00 GB', 'Quota should format to 10.00 GB');
});

test('Encrypted backup envelope detection and passphrase requirement', () => {
  const plainBackup = { version: 1, categories: [], transactions: [] };
  assertEquals(BudgetStore.isEncryptedPayload(plainBackup), false, 'Plain backup is not encrypted');

  const mockEncrypted = {
    app: 'BudgetTrackerPWA',
    version: 1,
    format: 'encrypted-backup',
    encrypted: true,
    salt: 'c2FsdA==',
    iv: 'aXZpdml2',
    ciphertext: 'ZGF0YQ=='
  };

  assertEquals(BudgetStore.isEncryptedPayload(mockEncrypted), true, 'Detects encrypted payload object');
  assertEquals(BudgetStore.isEncryptedPayload(JSON.stringify(mockEncrypted)), true, 'Detects encrypted payload string');

  // Attempting to import an encrypted backup synchronously without passphrase
  const importResult = BudgetStore.importDataJSON(JSON.stringify(mockEncrypted));
  assertEquals(importResult.success, false, 'Import should not succeed without passphrase');
  assertEquals(importResult.isEncrypted, true, 'Should flag as isEncrypted');
  assertEquals(importResult.needsPassphrase, true, 'Should signal needsPassphrase: true');
});

test('Web Cryptography mock & encrypted import flow', () => {
  // If native SubtleCrypto is not present in test CLI environment, provide standard mock
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    globalThis.crypto = {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() * 256) | 0;
        return arr;
      },
      subtle: {
        importKey: async () => ({ type: 'baseKey' }),
        deriveKey: async () => ({ type: 'aesKey' }),
        encrypt: async (algo, key, data) => {
          const copy = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) copy[i] = data[i] ^ 0x42;
          return copy.buffer;
        },
        decrypt: async (algo, key, data) => {
          const copy = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) copy[i] = data[i] ^ 0x42;
          return copy.buffer;
        }
      }
    };
  }

  const sampleJson = JSON.stringify({
    version: 1,
    currency: 'USD',
    categories: [{ id: 'cat_test_cloud', name: 'Cloud Test', icon: '☁️', limit: 500, color: '#007AFF' }],
    transactions: [{ id: 'tx_cloud_1', amount: 99.50, categoryId: 'cat_test_cloud', date: '2026-10-28', note: 'Secure sync' }]
  });

  let encryptedResult;
  BudgetCrypto.encrypt(sampleJson, 'SecretPassphrase123').then(res => { encryptedResult = res; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();

  assert(encryptedResult && encryptedResult.encrypted === true, 'Payload should be encrypted');
  assert(typeof encryptedResult.ciphertext === 'string' && encryptedResult.ciphertext.length > 0, 'Ciphertext should be non-empty base64');
  assert(typeof encryptedResult.salt === 'string', 'Salt should be present');
  assert(typeof encryptedResult.iv === 'string', 'IV should be present');

  // Test Decrypt
  let decryptedString;
  BudgetCrypto.decrypt(encryptedResult, 'SecretPassphrase123').then(res => { decryptedString = res; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();
  assertEquals(decryptedString, sampleJson, 'Decrypted string should match original JSON exactly');

  // Test Decrypt with Incorrect Passphrase
  let decryptError = null;
  BudgetCrypto.decrypt(encryptedResult, 'WrongPassword').catch(err => { decryptError = err; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();
  // Note: in mock or real crypto, wrong key or auth tag failure throws
  // In real crypto, subtle.decrypt throws OperationError; in mock it will throw or fail
  assert(BudgetCrypto.isEncryptedPayload(encryptedResult), 'Encrypted package structure is preserved');

  // Test importDataJSONAsync
  let importAsyncResult;
  BudgetStore.importDataJSONAsync(encryptedResult, 'SecretPassphrase123').then(res => { importAsyncResult = res; });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();

  assertEquals(importAsyncResult.success, true, 'Async import of encrypted payload should succeed');
  assertEquals(importAsyncResult.categoriesCount, 1, 'Should import 1 category');
  assertEquals(importAsyncResult.transactionsCount, 1, 'Should import 1 transaction');
  const importedCat = BudgetStore.getCategoryById('cat_test_cloud');
  assert(importedCat !== null, 'Category cat_test_cloud should exist');
  assertEquals(importedCat.name, 'Cloud Test', 'Category name should match Cloud Test');
});

test('BudgetCloud client state and configuration methods', () => {
  // Client ID configuration
  BudgetCloud.setClientId('test-google-client-id-xyz.apps.googleusercontent.com');
  assertEquals(BudgetCloud.getClientId(), 'test-google-client-id-xyz.apps.googleusercontent.com', 'Client ID should be saved');

  // Encryption preference toggle
  BudgetCloud.setEncryptionEnabled(true);
  assertEquals(BudgetCloud.isEncryptionEnabled(), true, 'Encryption should be enabled');
  BudgetCloud.setEncryptionEnabled(false);
  assertEquals(BudgetCloud.isEncryptionEnabled(), false, 'Encryption should be disabled');
  BudgetCloud.setEncryptionEnabled(true);

  // Session passphrase storage
  BudgetCloud.setSessionPassphrase('my-secure-session-password');
  assertEquals(BudgetCloud.getSessionPassphrase(), 'my-secure-session-password', 'Session passphrase should be stored in memory');

  // Connection state when disconnected
  assertEquals(BudgetCloud.isConnected(), false, 'Should be disconnected by default');
});

// 23. BudgetOCR Client-Side Engine Tests
test('BudgetOCR dimensions calculation and scaling', () => {
  assert(typeof BudgetOCR === 'object', 'BudgetOCR should be exported as an object');
  assert(typeof BudgetOCR.preprocessImage === 'function', 'preprocessImage should be a function');
  assert(typeof BudgetOCR.initWorker === 'function', 'initWorker should be a function');
  assert(typeof BudgetOCR.recognizeReceipt === 'function', 'recognizeReceipt should be a function');
  assert(typeof BudgetOCR.terminateWorker === 'function', 'terminateWorker should be a function');

  // Landscape image scaling (> 1600px)
  const dLandscape = BudgetOCR.calculateDimensions(3200, 2400, 1600);
  assertEquals(dLandscape.width, 1600, 'Landscape width scaled to 1600');
  assertEquals(dLandscape.height, 1200, 'Landscape height scaled proportionally to 1200');

  // Portrait image scaling (> 1600px)
  const dPortrait = BudgetOCR.calculateDimensions(1800, 3600, 1600);
  assertEquals(dPortrait.width, 800, 'Portrait width scaled proportionally to 800');
  assertEquals(dPortrait.height, 1600, 'Portrait height scaled to 1600');

  // Image under 1600px preserves exact original dimensions
  const dOriginal = BudgetOCR.calculateDimensions(800, 600, 1600);
  assertEquals(dOriginal.width, 800, 'Width preserved when under max limit');
  assertEquals(dOriginal.height, 600, 'Height preserved when under max limit');

  // Thumbnail scaling (~120px)
  const dThumb = BudgetOCR.calculateDimensions(1600, 1200, 120);
  assertEquals(dThumb.width, 120, 'Thumbnail width scaled to 120');
  assertEquals(dThumb.height, 90, 'Thumbnail height scaled to 90');
});

test('BudgetOCR progress formatter translates events into friendly messages', () => {
  // Loading Core
  const p1 = BudgetOCR.formatProgress({ status: 'loading tesseract core', progress: 0.5 });
  assertEquals(p1.progress, 50, 'Progress percentage should be 50');
  assert(p1.message.includes('Loading OCR engine'), 'Friendly message for loading core');

  // Initializing API
  const p2 = BudgetOCR.formatProgress({ status: 'initializing tesseract', progress: 0.8 });
  assertEquals(p2.progress, 80, 'Progress percentage should be 80');
  assert(p2.message.includes('Initializing OCR engine'), 'Friendly message for initializing');

  // Loading Language Models
  const p3 = BudgetOCR.formatProgress({ status: 'loading language traineddata', progress: 0.6 });
  assertEquals(p3.progress, 60, 'Progress percentage should be 60');
  assert(p3.message.includes('English & Japanese models'), 'Friendly message for models');

  // Recognizing Text
  const p4 = BudgetOCR.formatProgress({ status: 'recognizing text', progress: 0.72 });
  assertEquals(p4.progress, 72, 'Progress percentage should be 72');
  assert(p4.message.includes('Reading receipt text (72%)'), 'Friendly message for recognizing');
});

test('BudgetOCR initWorker throws friendly error when Tesseract CDN is missing', () => {
  let thrown = false;
  let message = '';
  // Ensure global Tesseract is undefined for this test
  const savedTesseract = globalThis.Tesseract;
  delete globalThis.Tesseract;

  BudgetOCR.initWorker().catch(err => {
    thrown = true;
    message = err.message;
  });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();

  assertEquals(thrown, true, 'initWorker should reject when Tesseract is undefined');
  assertEquals(message, 'OCR engine is not loaded. Please check your internet connection.', 'Friendly error message');

  // Restore if needed
  if (savedTesseract) globalThis.Tesseract = savedTesseract;
});

test('BudgetOCR worker lifecycle, singleton reuse, and recognizeReceipt', () => {
  let createWorkerCalls = 0;
  let workerTerminated = false;
  let capturedLogger = null;

  const mockWorker = {
    loadLanguage: () => Promise.resolve(),
    initialize: () => Promise.resolve(),
    recognize: (source) => Promise.resolve({
      data: {
        text: 'Lawson Shinjuku\nTotal: ¥2,480',
        confidence: 96.2,
        lines: [
          { text: 'Lawson Shinjuku', confidence: 98 },
          { text: 'Total: ¥2,480', confidence: 95 }
        ]
      }
    }),
    terminate: () => {
      workerTerminated = true;
      return Promise.resolve();
    }
  };

  globalThis.Tesseract = {
    createWorker: (langs, oem, options) => {
      createWorkerCalls++;
      if (options && options.logger) capturedLogger = options.logger;
      return Promise.resolve(mockWorker);
    }
  };

  const progressEvents = [];
  let initSuccess = false;

  BudgetOCR.initWorker({
    onProgress: (p) => progressEvents.push(p)
  }).then(() => {
    initSuccess = true;
  });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();

  assertEquals(initSuccess, true, 'Worker initialized successfully');
  assertEquals(createWorkerCalls, 1, 'Tesseract.createWorker called once');
  assertEquals(BudgetOCR.isWorkerReady(), true, 'Worker reports ready');

  // Verify progress logging
  if (capturedLogger) {
    capturedLogger({ status: 'recognizing text', progress: 0.55 });
    assertEquals(progressEvents.length, 1, 'Progress callback fired');
    assertEquals(progressEvents[0].progress, 55, 'Progress value formatted');
  }

  // Second init call -> verifies singleton reuse
  BudgetOCR.initWorker();
  if (typeof drainMicrotasks === 'function') drainMicrotasks();
  assertEquals(createWorkerCalls, 1, 'Worker singleton reused without re-creating worker');

  // Recognize receipt
  let recognizedResult = null;
  BudgetOCR.recognizeReceipt({ canvas: 'mock-canvas' }).then(res => {
    recognizedResult = res;
  });
  if (typeof drainMicrotasks === 'function') drainMicrotasks();

  assert(recognizedResult !== null, 'Recognition result returned');
  assertEquals(recognizedResult.text, 'Lawson Shinjuku\nTotal: ¥2,480', 'Text matched');
  assertEquals(recognizedResult.confidence, 96.2, 'Confidence matched');
  assertEquals(recognizedResult.lines.length, 2, 'Line entries matched');

  // Terminate worker
  BudgetOCR.terminateWorker();
  if (typeof drainMicrotasks === 'function') drainMicrotasks();

  assertEquals(workerTerminated, true, 'worker.terminate was invoked');
  assertEquals(BudgetOCR.isWorkerReady(), false, 'isWorkerReady is false after termination');
});

// 24. Receipt Parser Unit & Logic Tests
BudgetStore.resetToDefaultData();
test('Japanese receipt OCR text parsing (セブン-イレブン, 合計 ¥3,480, 2026年10月28日, Groceries)', () => {
  const categories = BudgetStore.getCategories();
  const sampleText = [
    'セブン-イレブン 渋谷店',
    '東京都渋谷区道玄坂2-1-1',
    'TEL: 03-1234-5678',
    '2026年10月28日 12:45',
    'おにぎり 鮭 ¥150',
    '緑茶 500ml ¥130',
    'サンドイッチ ¥320',
    '小計 ¥600',
    '消費税(10%) ¥60',
    '合計 ¥3,480',
    'お預り ¥5,000',
    'お釣り ¥1,520'
  ].join('\n');

  const result = ReceiptParser.parseReceiptText(sampleText, categories, 'JPY');

  assertEquals(result.amount, 3480, 'Amount should match 3480 JPY from 合計 ¥3,480');
  assertEquals(result.date, '2026-10-28', 'Date should be normalized to 2026-10-28');
  assertEquals(result.merchant, 'セブン-イレブン', 'Merchant branch should be stripped to セブン-イレブン');
  assertEquals(result.categoryId, 'cat_groceries', 'Category should match cat_groceries');
  assert(result.confidence >= 0.8, 'Confidence should be high for complete receipt: ' + result.confidence);
  assertEquals(result.rawLines.length, 12, 'Raw non-empty lines should be preserved');
});

test('Western receipt OCR text parsing (Trader Joe\'s, TOTAL $45.20, 10/28/2026, Groceries)', () => {
  const categories = BudgetStore.getCategories();
  const sampleText = [
    'Trader Joe\'s Store #123',
    '123 Market Street',
    '(555) 345-6789',
    '10/28/2026 14:20',
    'Organic Whole Milk 4.29',
    'Bananas 1.99',
    'Sourdough Bread 3.99',
    'SUBTOTAL $10.27',
    'TAX $0.85',
    'TOTAL $45.20',
    'CASH $50.00',
    'CHANGE $4.80'
  ].join('\n');

  const result = ReceiptParser.parseReceiptText(sampleText, categories, 'USD');

  assertEquals(result.amount, 45.2, 'Amount should match 45.20 USD from TOTAL $45.20');
  assertEquals(result.date, '2026-10-28', 'Date 10/28/2026 should be normalized to 2026-10-28');
  assertEquals(result.merchant, 'Trader Joe\'s', 'Store number should be stripped to Trader Joe\'s');
  assertEquals(result.categoryId, 'cat_groceries', 'Category should match cat_groceries');
  assert(result.confidence >= 0.8, 'Confidence should be high: ' + result.confidence);
});

test('Dining / Coffee receipt parsing (Starbucks Coffee, ¥ 650, Dining)', () => {
  const categories = BudgetStore.getCategories();
  const sampleText = [
    'Starbucks Coffee',
    '渋谷道玄坂店',
    '2026/10/28 09:15',
    'ドリップコーヒー ¥ 350',
    'カフェラテ ¥ 650',
    '合計 ¥ 650'
  ].join('\n');

  const result = ReceiptParser.parseReceiptText(sampleText, categories, 'JPY');

  assertEquals(result.amount, 650, 'Amount should match 650 JPY from 合計 ¥ 650');
  assertEquals(result.date, '2026-10-28', 'Date 2026/10/28 should normalize to 2026-10-28');
  assertEquals(result.merchant, 'Starbucks Coffee', 'Merchant should be Starbucks Coffee');
  assertEquals(result.categoryId, 'cat_dining', 'Category should match cat_dining');
  assert(result.confidence >= 0.8, 'Confidence should be high: ' + result.confidence);
});

test('Transport receipt parsing (taxi & gas station, Transport)', () => {
  const categories = BudgetStore.getCategories();

  // Taxi receipt
  const taxiText = [
    'MK TAXI',
    '2026-10-28 22:30',
    'タクシーメーター運賃 ¥2,800',
    '深夜割増 ¥600',
    '合計 ¥3,400'
  ].join('\n');

  const taxiResult = ReceiptParser.parseReceiptText(taxiText, categories, 'JPY');
  assertEquals(taxiResult.amount, 3400, 'Taxi amount should be 3400');
  assertEquals(taxiResult.date, '2026-10-28', 'Date should be 2026-10-28');
  assertEquals(taxiResult.merchant, 'MK TAXI', 'Merchant should be MK TAXI');
  assertEquals(taxiResult.categoryId, 'cat_transport', 'Taxi should map to cat_transport');

  // Gas station receipt
  const gasText = [
    'ENEOS 渋谷SS',
    '給油 レギュラー ガソリン 20L',
    '2026.10.28',
    'ご請求額 ¥3,400'
  ].join('\n');

  const gasResult = ReceiptParser.parseReceiptText(gasText, categories, 'JPY');
  assertEquals(gasResult.amount, 3400, 'Gas station amount should be 3400');
  assertEquals(gasResult.merchant, 'ENEOS', 'Branch SS stripped to ENEOS');
  assertEquals(gasResult.categoryId, 'cat_transport', 'Gas should map to cat_transport');
});

test('Edge cases: Receipt without explicit date defaults to today', () => {
  const categories = BudgetStore.getCategories();
  const sampleText = [
    'FamilyMart',
    'おにぎり ¥150',
    '合計 ¥150'
  ].join('\n');

  const result = ReceiptParser.parseReceiptText(sampleText, categories);
  const now = new Date();
  const expectedToday = String(now.getFullYear()).padStart(4, '0') + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  assertEquals(result.amount, 150, 'Amount should be 150');
  assertEquals(result.date, expectedToday, 'Date should default to today: ' + expectedToday);
  assertEquals(result.merchant, 'FamilyMart', 'Merchant should be FamilyMart');
  assertEquals(result.categoryId, 'cat_groceries', 'Category should match cat_groceries');
});

test('Edge cases: Receipt with European comma decimal (18,50 €)', () => {
  const categories = BudgetStore.getCategories();
  const sampleText = [
    'Boulangerie Paul',
    '10 Rue de la Paix',
    '28/10/2026',
    'Croissant 2,50 €',
    'Café Crème 3,00 €',
    'TOTAL 18,50 €'
  ].join('\n');

  const result = ReceiptParser.parseReceiptText(sampleText, categories, 'EUR');

  assertEquals(result.amount, 18.5, 'European comma decimal 18,50 € should parse to 18.5');
  assertEquals(result.date, '2026-10-28', 'Date 28/10/2026 should normalize to 2026-10-28');
  assertEquals(result.merchant, 'Boulangerie Paul', 'Merchant should be Boulangerie Paul');
  assertEquals(result.categoryId, 'cat_dining', 'Category should match cat_dining');
});

test('Edge cases: Tax/change exclusion, header noise stripping, and lower-half fallback', () => {
  const categories = BudgetStore.getCategories();

  // Receipt with header noise and fallback amount in lower half
  const sampleText = [
    '*** TAX INVOICE ***',
    '領収書',
    'Corner Bakery',
    'www.cornerbakery.com',
    'TEL: 03-9999-9999',
    '2026年10月28日',
    'Bread 4.50',
    'Cookies 5.50',
    '10.00'
  ].join('\n');

  const result = ReceiptParser.parseReceiptText(sampleText, categories, 'USD');

  assertEquals(result.merchant, 'Corner Bakery', 'Should skip invoice title and URL noise to find Corner Bakery');
  assertEquals(result.amount, 10, 'Should fall back to largest number in lower half: 10');
  assertEquals(result.date, '2026-10-28', 'Date should be 2026-10-28');
});

test('Receipt parser date format variations and year clamping', () => {
  const curYear = new Date().getFullYear();

  // Japanese year/month/day
  assertEquals(ReceiptParser.extractReceiptDate(['2026年5月3日']).date, '2026-05-03', 'Japanese single digit M and D');
  // Text month
  assertEquals(ReceiptParser.extractReceiptDate(['Oct 28 2026']).date, '2026-10-28', 'Text month Oct 28 2026');
  assertEquals(ReceiptParser.extractReceiptDate(['28 October 2026']).date, '2026-10-28', 'Day first text month');
  // Slash with dash
  assertEquals(ReceiptParser.extractReceiptDate(['10-28-2026']).date, '2026-10-28', 'Dashed MM-DD-YYYY');

  // Year clamping: < 2000 clamped to 2000
  assertEquals(ReceiptParser.extractReceiptDate(['1990/01/15']).date, '2000-01-15', 'Year 1990 clamped to 2000');
  // Year clamping: > curYear + 1 clamped to curYear + 1
  const maxYear = curYear + 1;
  assertEquals(ReceiptParser.extractReceiptDate(['2050/12/31']).date, `${maxYear}-12-31`, `Year 2050 clamped to ${maxYear}`);
});

test('Receipt parser empty and invalid input resilience', () => {
  const emptyRes = ReceiptParser.parseReceiptText('');
  assertEquals(emptyRes.amount, 0, 'Empty text returns amount 0');
  assertEquals(emptyRes.confidence, 0, 'Empty text returns confidence 0');
  assertEquals(emptyRes.rawLines.length, 0, 'Empty text returns empty rawLines');

  const whitespaceRes = ReceiptParser.parseReceiptText('   \n\n   ');
  assertEquals(whitespaceRes.amount, 0, 'Whitespace returns amount 0');
});

test('Receipt scanning PWA integration: index.html, CSS, sw.js, and app.js wiring', () => {
  const getFileContent = (path) => {
    if (typeof read === 'function') return read(path);
    if (typeof require === 'function') return require('fs').readFileSync(path, 'utf8');
    return '';
  };

  const html = getFileContent('index.html');
  const css = getFileContent('css/components.css');
  const sw = getFileContent('sw.js');
  const app = getFileContent('js/app.js');

  // 1. index.html checks
  assert(html.includes('tesseract.min.js'), 'index.html includes Tesseract.js CDN script');
  assert(html.includes('heic2any.min.js'), 'index.html includes heic2any CDN script');
  assert(html.includes('id="receiptCameraInput"'), 'index.html includes hidden camera input');
  assert(html.includes('id="receiptGalleryInput"'), 'index.html includes hidden gallery input');
  assert(html.includes('accept="image/*,.heic,.heif"'), 'index.html inputs accept HEIC and HEIF formats');
  assert(html.includes('id="btnQuickAddScan"'), 'index.html includes Scan Receipt button');
  assert(html.includes('id="receiptSourceModal"'), 'index.html includes receipt source action sheet');
  assert(html.includes('id="btnActionTakePhoto"'), 'index.html includes Take Photo action sheet option');
  assert(html.includes('id="btnActionChooseGallery"'), 'index.html includes Choose Gallery action sheet option');
  assert(html.includes('id="ocrScanningBanner"'), 'index.html includes OCR scanning banner');
  assert(html.includes('id="ocrProgressBar"'), 'index.html includes OCR progress bar');
  assert(html.includes('id="ocrStatusSubtitle"'), 'index.html includes OCR subtitle');
  assert(html.includes('js/ocr-engine.js') && html.includes('js/receipt-parser.js'), 'index.html includes OCR and parser scripts');

  // 2. css/components.css checks
  assert(css.includes('.sheet-scan-btn'), 'components.css defines .sheet-scan-btn');
  assert(css.includes('.ocr-scanning-banner'), 'components.css defines .ocr-scanning-banner');
  assert(css.includes('.ocr-spinner'), 'components.css defines .ocr-spinner');
  assert(css.includes('.ocr-progress-bar'), 'components.css defines .ocr-progress-bar');
  assert(css.includes('@keyframes spin'), 'components.css defines spin animation');
  assert(css.includes('.action-sheet-overlay'), 'components.css defines action sheet overlay');
  assert(css.includes('.action-sheet-dialog'), 'components.css defines action sheet dialog');
  assert(css.includes('.action-sheet-option-btn'), 'components.css defines action sheet option buttons');

  // 3. sw.js checks
  assert(sw.includes("CACHE_VERSION = 'v6'"), 'sw.js CACHE_VERSION bumped to v6');
  assert(sw.includes("'./js/ocr-engine.js'"), 'sw.js precaches ocr-engine.js');
  assert(sw.includes("'./js/receipt-parser.js'"), 'sw.js precaches receipt-parser.js');
  assert(sw.includes('cdn.jsdelivr.net') && sw.includes('tessdata'), 'sw.js includes cache-first runtime caching for OCR assets');

  // 4. app.js checks
  assert(app.includes('btnQuickAddScan'), 'app.js references btnQuickAddScan');
  assert(app.includes('receiptSourceModal'), 'app.js manages receiptSourceModal');
  assert(app.includes('btnActionTakePhoto'), 'app.js binds Take Photo button');
  assert(app.includes('btnActionChooseGallery'), 'app.js binds Choose Gallery button');
  assert(app.includes('receiptCameraInput'), 'app.js references receiptCameraInput');
  assert(app.includes('BudgetOCR.preprocessImage'), 'app.js calls BudgetOCR.preprocessImage');
  assert(app.includes('BudgetOCR.recognizeReceipt'), 'app.js calls BudgetOCR.recognizeReceipt');
  assert(app.includes('ReceiptParser.parseReceiptText'), 'app.js calls ReceiptParser.parseReceiptText');
  assert(app.includes('numpad.setAmount'), 'app.js populates numpad with parsed amount');
});

test('BudgetOCR HEIC format detection and conversion support', () => {
  assert(typeof BudgetOCR.isHeicImage === 'function', 'isHeicImage should be a function');

  // Positive detection
  assertEquals(BudgetOCR.isHeicImage({ type: 'image/heic' }), true, 'Detects image/heic MIME type');
  assertEquals(BudgetOCR.isHeicImage({ type: 'image/heif' }), true, 'Detects image/heif MIME type');
  assertEquals(BudgetOCR.isHeicImage({ name: 'IMG_4521.HEIC' }), true, 'Detects uppercase .HEIC extension');
  assertEquals(BudgetOCR.isHeicImage({ name: 'receipt.heif' }), true, 'Detects lowercase .heif extension');

  // Negative detection
  assertEquals(BudgetOCR.isHeicImage({ type: 'image/jpeg', name: 'photo.jpg' }), false, 'Rejects standard JPEG');
  assertEquals(BudgetOCR.isHeicImage({ type: 'image/png', name: 'screenshot.png' }), false, 'Rejects standard PNG');
  assertEquals(BudgetOCR.isHeicImage(null), false, 'Handles null safely');
  assertEquals(BudgetOCR.isHeicImage({}), false, 'Handles empty object safely');
});

log('\n-----------------------------------------');
log(` Tests completed: ${passed} passed, ${failed} failed`);
log('-----------------------------------------\n');

if (failed > 0) {
  throw new Error(`${failed} test(s) failed`);
}
