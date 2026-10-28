/**
 * app.js - Main Application Controller for Budget Tracking PWA
 * Orchestrates navigation, state, modal workflows, quick numpad entry, and Service Worker.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // 1. App State
  let currentMonthKey = window.BudgetCalculations.getCurrentMonthKey();
  let pickerYear = parseInt(currentMonthKey.split('-')[0], 10);
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
    setupMonthPickerModal();
    setupQuickAddModal();
    setupCategoryEditModal();
    setupPassphraseModal();
    setupSettingsActions();
    initStoragePersistence();
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
  // Month Navigation (< Prev, Current, Next >, Jump to Month)
  // ==========================================================================
  function setupMonthNavigation() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnPrevMonth') || e.target.closest('.btn-prev-month')) {
        currentMonthKey = window.BudgetCalculations.getPreviousMonthKey(currentMonthKey);
        renderCurrentView();
      } else if (e.target.closest('#btnNextMonth') || e.target.closest('.btn-next-month')) {
        currentMonthKey = window.BudgetCalculations.getNextMonthKey(currentMonthKey);
        renderCurrentView();
      } else if (e.target.closest('#btnResetToCurrentMonth') || e.target.closest('.btn-reset-current-month')) {
        currentMonthKey = window.BudgetCalculations.getCurrentMonthKey();
        renderCurrentView();
      } else if (e.target.closest('#btnOpenMonthPicker') || e.target.closest('.btn-open-month-picker')) {
        openMonthPickerModal();
      }
    });
  }

  function setupMonthPickerModal() {
    const overlay = document.getElementById('monthPickerModal');
    const closeBtn = document.getElementById('btnMonthPickerClose');
    const prevYearBtn = document.getElementById('btnPickerPrevYear');
    const nextYearBtn = document.getElementById('btnPickerNextYear');
    const grid = document.getElementById('monthPickerGrid');
    const jumpCurrentBtn = document.getElementById('btnPickerJumpToCurrent');

    if (closeBtn) closeBtn.addEventListener('click', closeMonthPickerModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeMonthPickerModal();
      });
    }

    if (prevYearBtn) {
      prevYearBtn.addEventListener('click', () => {
        pickerYear -= 1;
        window.BudgetUI.renderMonthPicker(pickerYear, currentMonthKey);
      });
    }

    if (nextYearBtn) {
      nextYearBtn.addEventListener('click', () => {
        pickerYear += 1;
        window.BudgetUI.renderMonthPicker(pickerYear, currentMonthKey);
      });
    }

    if (grid) {
      grid.addEventListener('click', (e) => {
        const tile = e.target.closest('.month-picker-tile');
        if (tile) {
          const selectedMonth = tile.getAttribute('data-month');
          if (selectedMonth) {
            currentMonthKey = selectedMonth;
            closeMonthPickerModal();
            renderCurrentView();
          }
        }
      });
    }

    if (jumpCurrentBtn) {
      jumpCurrentBtn.addEventListener('click', () => {
        currentMonthKey = window.BudgetCalculations.getCurrentMonthKey();
        closeMonthPickerModal();
        renderCurrentView();
      });
    }
  }

  function openMonthPickerModal() {
    pickerYear = parseInt(currentMonthKey.split('-')[0], 10);
    if (isNaN(pickerYear)) {
      pickerYear = new Date().getFullYear();
    }
    window.BudgetUI.renderMonthPicker(pickerYear, currentMonthKey);
    const overlay = document.getElementById('monthPickerModal');
    if (overlay) overlay.classList.add('open');
  }

  function closeMonthPickerModal() {
    const overlay = document.getElementById('monthPickerModal');
    if (overlay) overlay.classList.remove('open');
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
  // Storage Durability & Cloud Backup Controllers
  // ==========================================================================
  let pendingPassphraseAction = null; // { type: 'file' | 'cloud', content?: string }

  function setupPassphraseModal() {
    const overlay = document.getElementById('passphraseModal');
    const closeBtn = document.getElementById('btnPassphraseModalClose');
    const submitBtn = document.getElementById('btnModalPassphraseSubmit');
    const input = document.getElementById('modalPassphraseInput');
    const toggleBtn = document.getElementById('btnModalPassphraseToggle');

    if (closeBtn) closeBtn.addEventListener('click', closePassphraseModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePassphraseModal();
      });
    }

    if (toggleBtn && input) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = input.getAttribute('type') === 'password';
        input.setAttribute('type', isPassword ? 'text' : 'password');
        toggleBtn.textContent = isPassword ? '🙈' : '👁️';
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', handlePassphraseSubmit);
    }
  }

  function openPassphraseModal(action) {
    pendingPassphraseAction = action;
    const overlay = document.getElementById('passphraseModal');
    const input = document.getElementById('modalPassphraseInput');
    if (input) {
      input.value = window.BudgetCloud ? window.BudgetCloud.getSessionPassphrase() : '';
      setTimeout(() => input.focus(), 100);
    }
    if (overlay) overlay.classList.add('open');
  }

  function closePassphraseModal() {
    const overlay = document.getElementById('passphraseModal');
    if (overlay) overlay.classList.remove('open');
    pendingPassphraseAction = null;
  }

  async function handlePassphraseSubmit() {
    const input = document.getElementById('modalPassphraseInput');
    const passphrase = (input ? input.value : '').trim();

    if (!passphrase) {
      window.BudgetUI.showToast('Please enter a passphrase');
      return;
    }

    if (window.BudgetCloud) {
      window.BudgetCloud.setSessionPassphrase(passphrase);
      const cloudInput = document.getElementById('inputCloudPassphrase');
      if (cloudInput) cloudInput.value = passphrase;
    }

    if (pendingPassphraseAction && pendingPassphraseAction.type === 'file') {
      const content = pendingPassphraseAction.content;
      try {
        const result = await window.BudgetStore.importDataJSONAsync(content, passphrase);
        if (result.success) {
          closePassphraseModal();
          updateCurrencyDisplay();
          window.BudgetUI.showToast(`Imported ${result.categoriesCount} categories and ${result.transactionsCount} transactions!`);
          renderCurrentView();
        } else {
          alert('Decryption failed: ' + (result.error || 'Incorrect passphrase'));
        }
      } catch (err) {
        alert('Decryption error: ' + err.message);
      }
    } else if (pendingPassphraseAction && pendingPassphraseAction.type === 'cloud') {
      try {
        const result = await window.BudgetCloud.restoreFromGoogleDrive({ passphrase });
        if (result.success) {
          closePassphraseModal();
          updateCurrencyDisplay();
          updateCloudSyncUI();
          window.BudgetUI.showToast(`Restored ${result.categoriesCount} categories and ${result.transactionsCount} transactions from Google Drive!`);
          renderCurrentView();
        } else {
          alert('Cloud restore failed: ' + (result.error || 'Incorrect passphrase'));
        }
      } catch (err) {
        alert('Cloud restore failed: ' + err.message);
      }
    }
  }

  function updateStorageDurabilityUI(isPersisted) {
    const badge = document.getElementById('storageStatusBadge');
    const badgeText = document.getElementById('storageStatusText');
    const desc = document.getElementById('storageStatusDesc');
    const btnRequest = document.getElementById('btnRequestPersistence');
    const meterWrap = document.getElementById('storageMeterWrap');
    const ratioEl = document.getElementById('storageUsageRatio');
    const progressFill = document.getElementById('storageProgressFill');

    if (badge && badgeText) {
      badge.className = 'status-pill ' + (isPersisted ? 'success' : 'warning');
      badgeText.textContent = isPersisted ? 'Protected (Persistent)' : 'Standard (Best-effort)';
    }

    if (desc) {
      desc.textContent = isPersisted
        ? 'Persistent storage active. Your budget data is registered as persistent app data and will never be automatically deleted by your browser during low disk space cleanups.'
        : 'Storage is currently best-effort. Tap "Enable Storage Protection" or add this PWA to your Home Screen to prevent automatic browser eviction.';
    }

    if (btnRequest) {
      btnRequest.style.display = isPersisted ? 'none' : 'flex';
    }

    if (window.BudgetStore && window.BudgetStore.getStorageEstimate) {
      window.BudgetStore.getStorageEstimate().then(est => {
        if (est && meterWrap && ratioEl && progressFill) {
          meterWrap.style.display = 'block';
          ratioEl.textContent = `${est.usageFormatted} / ${est.quotaFormatted}`;
          progressFill.style.width = `${Math.max(1, Math.min(100, est.percent))}%`;
        }
      });
    }
  }

  function initStoragePersistence() {
    if (window.BudgetStore && window.BudgetStore.requestStoragePersistence) {
      window.BudgetStore.requestStoragePersistence()
        .then(isPersisted => {
          updateStorageDurabilityUI(isPersisted);
        })
        .catch(() => updateStorageDurabilityUI(false));
    }
  }

  function updateCloudSyncUI() {
    const cloud = window.BudgetCloud;
    if (!cloud) return;

    const isConnected = cloud.isConnected();
    const badge = document.getElementById('cloudStatusBadge');
    const badgeText = document.getElementById('cloudStatusText');
    const btnConnectText = document.getElementById('btnConnectGDriveText');
    const btnBackup = document.getElementById('btnBackupGDrive');
    const btnRestore = document.getElementById('btnRestoreGDrive');
    const lastSyncRow = document.getElementById('cloudLastSyncRow');
    const lastSyncTime = document.getElementById('cloudLastSyncTime');

    if (badge && badgeText) {
      badge.className = 'status-pill ' + (isConnected ? 'success' : 'neutral');
      badgeText.textContent = isConnected ? 'Connected' : 'Disconnected';
    }

    if (btnConnectText) {
      const email = cloud.getUserEmail();
      btnConnectText.textContent = isConnected
        ? `Disconnect (${email || 'Google Drive'})`
        : 'Connect Google Drive';
    }

    if (btnBackup) btnBackup.style.display = isConnected ? 'flex' : 'none';
    if (btnRestore) btnRestore.style.display = isConnected ? 'flex' : 'none';

    const syncInfo = cloud.getLastSyncInfo();
    if (syncInfo && lastSyncRow && lastSyncTime) {
      lastSyncRow.style.display = 'flex';
      const date = new Date(syncInfo.timestamp);
      const encBadge = syncInfo.isEncrypted ? ' 🔒' : '';
      lastSyncTime.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + encBadge;
    } else if (lastSyncRow) {
      lastSyncRow.style.display = 'none';
    }

    const inputClientId = document.getElementById('inputGDriveClientId');
    if (inputClientId && !inputClientId.value) {
      inputClientId.value = cloud.getClientId();
    }

    const currentOriginCode = document.getElementById('currentOriginCode');
    if (currentOriginCode) {
      currentOriginCode.textContent = window.location.origin;
    }
  }

  // ==========================================================================
  // Settings & Data Export / Import
  // ==========================================================================
  function setupSettingsActions() {
    const selectCurrency = document.getElementById('selectCurrency');
    const btnExportJSON = document.getElementById('btnExportJSON');
    const btnExportEncryptedJSON = document.getElementById('btnExportEncryptedJSON');
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnImportJSON = document.getElementById('btnImportJSON');
    const fileImportInput = document.getElementById('fileImportInput');
    const btnResetData = document.getElementById('btnResetData');
    const btnRequestPersistence = document.getElementById('btnRequestPersistence');

    // Cloud Backup Elements
    const btnConnectGDrive = document.getElementById('btnConnectGDrive');
    const btnBackupGDrive = document.getElementById('btnBackupGDrive');
    const btnRestoreGDrive = document.getElementById('btnRestoreGDrive');
    const btnSaveCloudFolder = document.getElementById('btnSaveCloudFolder');
    const btnSaveGDriveClientId = document.getElementById('btnSaveGDriveClientId');
    const inputGDriveClientId = document.getElementById('inputGDriveClientId');
    const chkCloudEncryption = document.getElementById('chkCloudEncryption');
    const inputCloudPassphrase = document.getElementById('inputCloudPassphrase');
    const btnTogglePassphraseVisibility = document.getElementById('btnTogglePassphraseVisibility');

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

    // Storage Persistence Request
    if (btnRequestPersistence) {
      btnRequestPersistence.addEventListener('click', async () => {
        if (window.BudgetStore && window.BudgetStore.requestStoragePersistence) {
          const granted = await window.BudgetStore.requestStoragePersistence();
          updateStorageDurabilityUI(granted);
          if (granted) {
            window.BudgetUI.showToast('Storage durability protection enabled!');
          } else {
            alert('Storage persistence could not be granted automatically. Installing the PWA to your Home Screen provides permanent persistence.');
          }
        }
      });
    }

    // Encryption Settings Listeners
    if (chkCloudEncryption && window.BudgetCloud) {
      chkCloudEncryption.checked = window.BudgetCloud.isEncryptionEnabled();
      chkCloudEncryption.addEventListener('change', (e) => {
        window.BudgetCloud.setEncryptionEnabled(e.target.checked);
        const group = document.getElementById('cloudPassphraseGroup');
        if (group) group.style.display = e.target.checked ? 'flex' : 'none';
      });
    }

    if (inputCloudPassphrase && window.BudgetCloud) {
      inputCloudPassphrase.value = window.BudgetCloud.getSessionPassphrase();
      inputCloudPassphrase.addEventListener('input', (e) => {
        window.BudgetCloud.setSessionPassphrase(e.target.value);
      });
    }

    if (btnTogglePassphraseVisibility && inputCloudPassphrase) {
      btnTogglePassphraseVisibility.addEventListener('click', () => {
        const isPassword = inputCloudPassphrase.getAttribute('type') === 'password';
        inputCloudPassphrase.setAttribute('type', isPassword ? 'text' : 'password');
        btnTogglePassphraseVisibility.textContent = isPassword ? '🙈' : '👁️';
      });
    }

    // Google Client ID Save
    if (btnSaveGDriveClientId && inputGDriveClientId && window.BudgetCloud) {
      btnSaveGDriveClientId.addEventListener('click', () => {
        const id = inputGDriveClientId.value.trim();
        window.BudgetCloud.setClientId(id);
        window.BudgetUI.showToast(id ? 'Google Client ID saved' : 'Google Client ID cleared');
      });
    }

    // Google Drive Connect / Disconnect
    if (btnConnectGDrive && window.BudgetCloud) {
      btnConnectGDrive.addEventListener('click', async () => {
        if (window.BudgetCloud.isConnected()) {
          window.BudgetCloud.disconnectGoogleDrive();
          updateCloudSyncUI();
          window.BudgetUI.showToast('Disconnected Google Drive');
        } else {
          try {
            await window.BudgetCloud.connectGoogleDrive();
            updateCloudSyncUI();
            const email = window.BudgetCloud.getUserEmail();
            window.BudgetUI.showToast(`Connected to Google Drive${email ? ' (' + email + ')' : ''}!`);
          } catch (err) {
            alert('Google Drive connection failed: ' + err.message);
          }
        }
      });
    }

    // Google Drive Backup
    if (btnBackupGDrive && window.BudgetCloud) {
      btnBackupGDrive.addEventListener('click', async () => {
        try {
          if (window.BudgetCloud.isEncryptionEnabled() && !window.BudgetCloud.getSessionPassphrase()) {
            const pw = prompt('Please enter an encryption passphrase for this cloud backup:');
            if (!pw) return;
            window.BudgetCloud.setSessionPassphrase(pw);
            if (inputCloudPassphrase) inputCloudPassphrase.value = pw;
          }

          window.BudgetUI.showToast('Uploading backup to Google Drive...');
          const result = await window.BudgetCloud.backupToGoogleDrive();
          updateCloudSyncUI();
          window.BudgetUI.showToast(`Backup saved to Google Drive (${result.fileName})!`);
        } catch (err) {
          alert('Google Drive backup failed: ' + err.message);
        }
      });
    }

    // Google Drive Restore
    if (btnRestoreGDrive && window.BudgetCloud) {
      btnRestoreGDrive.addEventListener('click', async () => {
        if (!confirm('Restore your data from Google Drive? This will update your local categories and transactions.')) {
          return;
        }

        try {
          window.BudgetUI.showToast('Fetching backup from Google Drive...');
          const result = await window.BudgetCloud.restoreFromGoogleDrive();
          if (result.needsPassphrase) {
            openPassphraseModal({ type: 'cloud' });
          } else if (result.success) {
            updateCurrencyDisplay();
            updateCloudSyncUI();
            window.BudgetUI.showToast(`Restored ${result.categoriesCount} categories and ${result.transactionsCount} transactions!`);
            renderCurrentView();
          }
        } catch (err) {
          alert('Google Drive restore failed: ' + err.message);
        }
      });
    }

    // Synced Local Cloud Folder (iCloud / Dropbox)
    if (btnSaveCloudFolder && window.BudgetCloud) {
      btnSaveCloudFolder.addEventListener('click', async () => {
        try {
          let passphrase = window.BudgetCloud.getSessionPassphrase();
          if (window.BudgetCloud.isEncryptionEnabled() && !passphrase) {
            passphrase = prompt('Enter an encryption passphrase for this backup:');
            if (passphrase === null) return;
            if (passphrase) {
              window.BudgetCloud.setSessionPassphrase(passphrase);
              if (inputCloudPassphrase) inputCloudPassphrase.value = passphrase;
            }
          }

          const res = await window.BudgetCloud.saveToSyncedFolder(passphrase);
          if (res.success) {
            window.BudgetUI.showToast(`Saved ${res.filename}!`);
          }
        } catch (err) {
          alert('Folder save failed: ' + err.message);
        }
      });
    }

    // Plain JSON Export
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
        window.BudgetUI.showToast('Plain JSON backup downloaded');
      });
    }

    // Encrypted JSON Export
    if (btnExportEncryptedJSON) {
      btnExportEncryptedJSON.addEventListener('click', async () => {
        let passphrase = window.BudgetCloud ? window.BudgetCloud.getSessionPassphrase() : '';
        if (!passphrase) {
          passphrase = prompt('Enter a passphrase to encrypt this backup file:');
          if (!passphrase) return;
        }

        try {
          const encStr = await window.BudgetStore.exportData(passphrase);
          const blob = new Blob([encStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `budget_backup_encrypted_${new Date().toISOString().slice(0, 10)}.enc`;
          a.click();
          URL.revokeObjectURL(url);
          window.BudgetUI.showToast('Encrypted backup downloaded');
        } catch (err) {
          alert('Encryption export failed: ' + err.message);
        }
      });
    }

    // CSV Export
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

    // JSON / Encrypted Import
    if (btnImportJSON && fileImportInput) {
      btnImportJSON.addEventListener('click', () => fileImportInput.click());

      fileImportInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const fileContent = event.target.result;
          const currentPassphrase = window.BudgetCloud ? window.BudgetCloud.getSessionPassphrase() : null;

          const result = await window.BudgetStore.importDataJSONAsync(fileContent, currentPassphrase);
          if (result.success) {
            updateCurrencyDisplay();
            window.BudgetUI.showToast(`Imported ${result.categoriesCount} categories and ${result.transactionsCount} transactions!`);
            renderCurrentView();
          } else if (result.needsPassphrase) {
            openPassphraseModal({ type: 'file', content: fileContent });
          } else {
            alert('Import failed: ' + result.error);
          }
          fileImportInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    // Reset Data
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

    // Initialize UI states
    updateCloudSyncUI();
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

