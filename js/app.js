/**
 * app.js - Main Application Controller for Budget Tracking PWA
 * Orchestrates navigation, state, modal workflows, quick numpad entry, and Service Worker.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 1. App State
  let currentMonthKey = window.BudgetCalculations.getCurrentMonthKey();
  let activeTab = 'dashboard';
  let selectedCategoryId = null;
  let editingCategoryId = null;

  // 2. Initialize Numpad Controller
  const amountDisplayEl = document.getElementById('numpadAmountDisplay');
  const numpad = new window.BudgetNumpad.NumpadController({
    onAmountChange: (buffer, numericValue) => {
      if (amountDisplayEl) {
        amountDisplayEl.textContent = buffer;
      }
    }
  });

  // 3. Service Worker Registration (Offline Caching)
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('PWA ServiceWorker registered with scope:', reg.scope);
        // Proactively check for Service Worker updates on launch
        if (typeof reg.update === 'function') {
          reg.update().catch(() => {});
        }
      })
      .catch(err => console.log('ServiceWorker registration skipped/failed:', err));
  }

  // 4. Initial Render
  initApp();

  function initApp() {
    setupTabNavigation();
    setupMonthNavigation();
    setupQuickAddModal();
    setupCategoryEditModal();
    setupSettingsActions();
    updateCurrencyDisplay();
    renderCurrentView();
  }

  // ==========================================================================
  // View Routing & Rendering
  // ==========================================================================
  function renderCurrentView() {
    if (activeTab === 'dashboard') {
      window.BudgetUI.renderMonthSelector(currentMonthKey, 'monthSelectorContainer');
      window.BudgetUI.renderSummaryCard(currentMonthKey, 'summaryCardContainer');
      window.BudgetUI.renderCategoryCards(currentMonthKey, 'categoryCardsContainer', (catId) => {
        openQuickAddModal(catId);
      });
    } else if (activeTab === 'history') {
      window.BudgetUI.renderMonthSelector(currentMonthKey, 'historyMonthSelectorContainer');
      window.BudgetUI.renderHistory(currentMonthKey, 'historyContainer', (txId) => {
        if (confirm('Delete this transaction?')) {
          window.BudgetStore.deleteTransaction(txId);
          window.BudgetUI.showToast('Transaction deleted');
          renderCurrentView();
        }
      });
    } else if (activeTab === 'categories') {
      window.BudgetUI.renderCategoriesManager('categoriesManagerContainer', (catId) => {
        openCategoryEditModal(catId);
      }, (catId) => {
        handleDeleteCategory(catId);
      });
    }
  }

  function handleDeleteCategory(catId) {
    const cat = window.BudgetStore.getCategoryById(catId);
    if (!cat) return;

    const txCount = window.BudgetStore.getTransactions({ categoryId: catId }).length;
    const note = txCount > 0 ? ` It has ${txCount} logged expense(s), which will be preserved as Uncategorized.` : '';
    if (confirm(`Are you sure you want to delete the category "${cat.name}"?${note}`)) {
      window.BudgetStore.deleteCategory(catId);
      window.BudgetUI.showToast(`Deleted ${cat.name}`);
      renderCurrentView();
    }
  }

  // ==========================================================================
  // Tab Navigation
  // ==========================================================================
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-item');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (targetTab === activeTab) return;

        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.view-section').forEach(view => {
          view.classList.remove('active');
        });

        const activeSection = document.getElementById(`view-${targetTab}`);
        if (activeSection) {
          activeSection.classList.add('active');
        }

        activeTab = targetTab;
        renderCurrentView();
      });
    });
  }

  // ==========================================================================
  // Month Navigation (< Prev, Current, Next >)
  // ==========================================================================
  function setupMonthNavigation() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnPrevMonth')) {
        currentMonthKey = window.BudgetCalculations.getPreviousMonthKey(currentMonthKey);
        renderCurrentView();
      } else if (e.target.closest('#btnNextMonth')) {
        currentMonthKey = window.BudgetCalculations.getNextMonthKey(currentMonthKey);
        renderCurrentView();
      } else if (e.target.closest('#btnResetToCurrentMonth')) {
        currentMonthKey = window.BudgetCalculations.getCurrentMonthKey();
        renderCurrentView();
      }
    });
  }

  // ==========================================================================
  // Quick-Add Modal & Tactile Numpad
  // ==========================================================================
  function setupQuickAddModal() {
    const overlay = document.getElementById('quickAddModal');
    const fabBtn = document.getElementById('fabQuickAdd');
    const closeBtn = document.getElementById('btnQuickAddClose');
    const saveBtn = document.getElementById('btnSaveExpense');
    const dateInput = document.getElementById('expenseDateInput');
    const noteInput = document.getElementById('expenseNoteInput');

    // Open from FAB
    if (fabBtn) {
      fabBtn.addEventListener('click', () => openQuickAddModal());
    }

    // Close
    if (closeBtn) {
      closeBtn.addEventListener('click', closeQuickAddModal);
    }

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeQuickAddModal();
      });
    }

    // Numpad key handlers
    document.querySelectorAll('.numpad-key').forEach(key => {
      key.addEventListener('click', () => {
        const action = key.getAttribute('data-action');
        const digit = key.getAttribute('data-digit');

        if (digit !== null) {
          numpad.pressDigit(digit);
        } else if (action === 'decimal') {
          numpad.pressDecimal();
        } else if (action === 'backspace') {
          numpad.pressBackspace();
        } else if (action === 'clear') {
          numpad.pressClear();
        }
      });
    });

    // Save transaction
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const amount = numpad.getNumericValue();
        if (amount <= 0) {
          window.BudgetUI.showToast('Please enter an amount greater than 0');
          return;
        }

        if (!selectedCategoryId) {
          window.BudgetUI.showToast('Please select a category');
          return;
        }

        const dateVal = dateInput.value || new Date().toISOString().split('T')[0];
        const noteVal = (noteInput.value || '').trim();

        window.BudgetStore.addTransaction({
          amount: amount,
          categoryId: selectedCategoryId,
          date: dateVal,
          note: noteVal
        });

        const cat = window.BudgetStore.getCategoryById(selectedCategoryId);
        const catName = cat ? cat.name : 'Expense';
        window.BudgetUI.showToast(`Logged ${window.BudgetCalculations.formatCurrency(amount)} for ${catName}!`);

        closeQuickAddModal();
        renderCurrentView();
      });
    }
  }

  function openQuickAddModal(preselectedCategoryId = null) {
    const overlay = document.getElementById('quickAddModal');
    const dateInput = document.getElementById('expenseDateInput');
    const noteInput = document.getElementById('expenseNoteInput');

    numpad.reset();
    if (noteInput) noteInput.value = '';
    if (dateInput) {
      // Default to today in YYYY-MM-DD
      const now = new Date();
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const categories = window.BudgetStore.getCategories();
    if (categories.length > 0) {
      selectedCategoryId = preselectedCategoryId || categories[0].id;
    }

    window.BudgetUI.renderQuickAddChips(selectedCategoryId, 'quickAddChipsContainer', (catId) => {
      selectedCategoryId = catId;
    });

    if (overlay) {
      overlay.classList.add('open');
    }
  }

  function closeQuickAddModal() {
    const overlay = document.getElementById('quickAddModal');
    if (overlay) overlay.classList.remove('open');
  }

  // ==========================================================================
  // Category Budget Limits Management
  // ==========================================================================
  function setupCategoryEditModal() {
    const overlay = document.getElementById('categoryEditModal');
    const closeBtn = document.getElementById('btnCategoryEditClose');
    const saveBtn = document.getElementById('btnSaveCategory');
    const deleteBtn = document.getElementById('btnDeleteCategory');

    if (closeBtn) closeBtn.addEventListener('click', closeCategoryEditModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCategoryEditModal();
      });
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnOpenAddCategoryModal')) {
        openCategoryEditModal(null); // Create new
      }
    });

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!editingCategoryId) return;
        const cat = window.BudgetStore.getCategoryById(editingCategoryId);
        if (!cat) return;

        const txCount = window.BudgetStore.getTransactions({ categoryId: editingCategoryId }).length;
        const note = txCount > 0 ? ` It has ${txCount} logged expense(s), which will be preserved as Uncategorized.` : '';
        if (confirm(`Are you sure you want to delete "${cat.name}"?${note}`)) {
          window.BudgetStore.deleteCategory(editingCategoryId);
          window.BudgetUI.showToast(`Deleted ${cat.name}`);
          closeCategoryEditModal();
          renderCurrentView();
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('editCategoryName');
        const iconInput = document.getElementById('editCategoryIcon');
        const limitInput = document.getElementById('editCategoryLimit');
        const colorInput = document.getElementById('editCategoryColor');

        const name = (nameInput.value || '').trim();
        const icon = (iconInput.value || '🏷️').trim();
        const limit = parseFloat(limitInput.value) || 0;
        const color = colorInput.value || '#007AFF';

        if (!name) {
          window.BudgetUI.showToast('Please enter a category name');
          return;
        }

        if (limit < 0) {
          window.BudgetUI.showToast('Budget limit cannot be negative');
          return;
        }

        window.BudgetStore.saveCategory({
          id: editingCategoryId || undefined,
          name: name,
          icon: icon,
          limit: limit,
          color: color
        });

        window.BudgetUI.showToast(`Saved ${name} with limit ${window.BudgetCalculations.formatCurrency(limit)}`);
        closeCategoryEditModal();
        renderCurrentView();
      });
    }
  }

  function openCategoryEditModal(categoryId = null) {
    editingCategoryId = categoryId;
    const overlay = document.getElementById('categoryEditModal');
    const titleEl = document.getElementById('categoryEditModalTitle');
    const nameInput = document.getElementById('editCategoryName');
    const iconInput = document.getElementById('editCategoryIcon');
    const limitInput = document.getElementById('editCategoryLimit');
    const colorInput = document.getElementById('editCategoryColor');
    const deleteBtn = document.getElementById('btnDeleteCategory');
    const limitLabel = document.getElementById('editCategoryLimitLabel');

    const symbol = window.BudgetCalculations.getCurrencySymbol();
    if (limitLabel) {
      limitLabel.textContent = `Monthly Limit (${symbol})`;
    }

    if (deleteBtn) {
      deleteBtn.style.display = categoryId ? 'block' : 'none';
    }

    if (categoryId) {
      const cat = window.BudgetStore.getCategoryById(categoryId);
      if (cat) {
        titleEl.textContent = 'Edit Category Budget Limit';
        nameInput.value = cat.name;
        iconInput.value = cat.icon || '🏷️';
        limitInput.value = cat.limit;
        colorInput.value = cat.color || '#007AFF';
      }
    } else {
      titleEl.textContent = 'Add New Category & Budget';
      nameInput.value = '';
      iconInput.value = '🏷️';
      limitInput.value = '200';
      colorInput.value = '#007AFF';
    }

    if (overlay) overlay.classList.add('open');
  }

  function closeCategoryEditModal() {
    const overlay = document.getElementById('categoryEditModal');
    if (overlay) overlay.classList.remove('open');
  }

  // ==========================================================================
  // Settings & Data Export / Import
  // ==========================================================================
  function setupSettingsActions() {
    const selectCurrency = document.getElementById('selectCurrency');
    const btnExportJSON = document.getElementById('btnExportJSON');
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnImportJSON = document.getElementById('btnImportJSON');
    const fileImportInput = document.getElementById('fileImportInput');
    const btnResetData = document.getElementById('btnResetData');

    if (selectCurrency) {
      const currencies = window.BudgetCalculations.SUPPORTED_CURRENCIES || {};
      selectCurrency.innerHTML = Object.values(currencies).map(c => {
        return `<option value="${c.code}">${c.name}</option>`;
      }).join('');

      selectCurrency.value = window.BudgetStore.getCurrency();

      selectCurrency.addEventListener('change', (e) => {
        const selected = e.target.value;
        window.BudgetStore.setCurrency(selected);
        updateCurrencyDisplay();
        window.BudgetUI.showToast(`Currency updated to ${selected}`);
        renderCurrentView();
      });
    }

    if (btnExportJSON) {
      btnExportJSON.addEventListener('click', () => {
        const jsonStr = window.BudgetStore.exportDataJSON();
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `budget_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        window.BudgetUI.showToast('Backup JSON downloaded');
      });
    }

    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => {
        const csvStr = window.BudgetStore.exportTransactionsCSV();
        const blob = new Blob([csvStr], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `budget_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        window.BudgetUI.showToast('CSV report downloaded');
      });
    }

    if (btnImportJSON && fileImportInput) {
      btnImportJSON.addEventListener('click', () => fileImportInput.click());

      fileImportInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const result = window.BudgetStore.importDataJSON(event.target.result);
          if (result.success) {
            updateCurrencyDisplay();
            window.BudgetUI.showToast(`Imported ${result.categoriesCount} categories and ${result.transactionsCount} transactions!`);
            renderCurrentView();
          } else {
            alert('Import failed: ' + result.error);
          }
          fileImportInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    if (btnResetData) {
      btnResetData.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all data back to defaults? All transactions will be cleared.')) {
          window.BudgetStore.resetToDefaultData();
          updateCurrencyDisplay();
          window.BudgetUI.showToast('Reset to default categories');
          renderCurrentView();
        }
      });
    }
  }

  function updateCurrencyDisplay() {
    const symbol = window.BudgetCalculations.getCurrencySymbol();
    const quickAddSymbol = document.getElementById('quickAddCurrencySymbol');
    if (quickAddSymbol) {
      quickAddSymbol.textContent = symbol;
    }
    const editLimitLabel = document.getElementById('editCategoryLimitLabel');
    if (editLimitLabel) {
      editLimitLabel.textContent = `Monthly Limit (${symbol})`;
    }
    const selectCurrency = document.getElementById('selectCurrency');
    if (selectCurrency) {
      selectCurrency.value = window.BudgetStore.getCurrency();
    }
  }
});

