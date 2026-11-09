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

  // Savings State
  let quickAddMode = 'expense'; // 'expense' | 'savings'
  let selectedGoalId = null;
  let editingGoalId = null;
  let withdrawingGoalId = null;

  // Reordering State
  let isReorderingDashboardCategories = false;
  let isReorderingDashboardSavings = false;
  let isReorderingLimitsCategories = false;
  let isReorderingTabSavings = false;

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
          reg.update().catch(() => { });
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
    setupSavingsGoalModal();
    setupSavingsWithdrawModal();
    setupPassphraseModal();
    setupSettingsActions();
    setupReorderingControls();
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
      window.BudgetUI.renderCategoryCards(
        currentMonthKey,
        'categoryCardsContainer',
        (catId) => {
          openQuickAddModal(catId, null, 'expense');
        },
        isReorderingDashboardCategories,
        (catId, direction) => {
          window.BudgetStore.moveCategory(catId, direction);
          renderCurrentView();
        }
      );
      window.BudgetUI.renderDashboardSavingsSnapshot(
        currentMonthKey,
        'dashboardSavingsContainer',
        (goalId) => {
          openQuickAddModal(null, goalId, 'savings');
        },
        () => {
          switchTab('savings');
        },
        isReorderingDashboardSavings,
        (goalId, direction) => {
          window.BudgetStore.moveSavingsGoal(goalId, direction);
          renderCurrentView();
        }
      );
    } else if (activeTab === 'savings') {
      window.BudgetUI.renderMonthSelector(currentMonthKey, 'savingsMonthSelectorContainer');
      window.BudgetUI.renderSavingsOverviewCard(currentMonthKey, 'savingsOverviewCardContainer');
      window.BudgetUI.renderSavingsGoals(
        currentMonthKey,
        'savingsGoalsContainer',
        (goalId) => {
          openQuickAddModal(null, goalId, 'savings');
        },
        (goalId) => {
          openSavingsWithdrawModal(goalId);
        },
        (goalId) => {
          openSavingsGoalModal(goalId);
        },
        (goalId) => {
          handleDeleteSavingsGoal(goalId);
        },
        isReorderingTabSavings,
        (goalId, direction) => {
          window.BudgetStore.moveSavingsGoal(goalId, direction);
          renderCurrentView();
        }
      );
    } else if (activeTab === 'history') {
      window.BudgetUI.renderMonthSelector(currentMonthKey, 'historyMonthSelectorContainer');
      window.BudgetUI.renderHistory(
        currentMonthKey,
        'historyContainer',
        (txId) => {
          if (confirm('Delete this transaction?')) {
            window.BudgetStore.deleteTransaction(txId);
            window.BudgetUI.showToast('Transaction deleted');
            renderCurrentView();
          }
        },
        (srecId) => {
          if (confirm('Delete this savings record?')) {
            window.BudgetStore.deleteSavingsRecord(srecId);
            window.BudgetUI.showToast('Savings record deleted');
            renderCurrentView();
          }
        }
      );
    } else if (activeTab === 'categories') {
      window.BudgetUI.renderLimitsHeroCard('limitsHeroCardContainer');
      window.BudgetUI.renderCategoriesManager(
        'categoriesManagerContainer',
        (catId) => {
          openCategoryEditModal(catId);
        },
        (catId) => {
          handleDeleteCategory(catId);
        },
        isReorderingLimitsCategories,
        (catId, direction) => {
          window.BudgetStore.moveCategory(catId, direction);
          renderCurrentView();
        }
      );
    }
  }

  function resetReorderStates() {
    isReorderingDashboardCategories = false;
    isReorderingDashboardSavings = false;
    isReorderingLimitsCategories = false;
    isReorderingTabSavings = false;

    const btnDashCat = document.getElementById('btnToggleReorderDashboardCategories');
    if (btnDashCat) {
      btnDashCat.classList.remove('active');
      btnDashCat.textContent = '↕ Reorder';
    }
    const btnDashSavings = document.getElementById('btnToggleReorderDashboardSavings');
    if (btnDashSavings) {
      btnDashSavings.classList.remove('active');
      btnDashSavings.textContent = '↕ Reorder';
    }
    const btnLimitsCat = document.getElementById('btnToggleReorderLimitsTab');
    if (btnLimitsCat) {
      btnLimitsCat.classList.remove('active');
      btnLimitsCat.textContent = '↕ Reorder';
    }
    const btnSavingsTab = document.getElementById('btnToggleReorderSavingsTab');
    if (btnSavingsTab) {
      btnSavingsTab.classList.remove('active');
      btnSavingsTab.textContent = '↕ Reorder';
    }
  }

  function switchTab(targetTab) {
    resetReorderStates();
    const tabButtons = document.querySelectorAll('.tab-item');
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === targetTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.view-section').forEach(view => {
      view.classList.remove('active');
    });

    const activeSection = document.getElementById(`view-${targetTab}`);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    activeTab = targetTab;
    renderCurrentView();
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

  function handleDeleteSavingsGoal(goalId) {
    const goal = window.BudgetStore.getSavingsGoalById(goalId);
    if (!goal) return;

    const records = window.BudgetStore.getSavingsRecords({ goalId });
    const note = records.length > 0 ? ` It will also remove ${records.length} associated deposit/withdrawal record(s).` : '';
    if (confirm(`Are you sure you want to delete the savings goal "${goal.name}"?${note}`)) {
      window.BudgetStore.deleteSavingsGoal(goalId);
      window.BudgetUI.showToast(`Deleted ${goal.name}`);
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
        switchTab(targetTab);
      });
    });
  }

  // ==========================================================================
  // Category & Savings Reordering Controls (Feature 2)
  // ==========================================================================
  function setupReorderingControls() {
    const btnDashCat = document.getElementById('btnToggleReorderDashboardCategories');
    if (btnDashCat) {
      btnDashCat.addEventListener('click', () => {
        isReorderingDashboardCategories = !isReorderingDashboardCategories;
        btnDashCat.classList.toggle('active', isReorderingDashboardCategories);
        btnDashCat.textContent = isReorderingDashboardCategories ? '✓ Done' : '↕ Reorder';
        renderCurrentView();
      });
    }

    const btnDashSavings = document.getElementById('btnToggleReorderDashboardSavings');
    if (btnDashSavings) {
      btnDashSavings.addEventListener('click', () => {
        isReorderingDashboardSavings = !isReorderingDashboardSavings;
        btnDashSavings.classList.toggle('active', isReorderingDashboardSavings);
        btnDashSavings.textContent = isReorderingDashboardSavings ? '✓ Done' : '↕ Reorder';
        renderCurrentView();
      });
    }

    const btnLimitsCat = document.getElementById('btnToggleReorderLimitsTab');
    if (btnLimitsCat) {
      btnLimitsCat.addEventListener('click', () => {
        isReorderingLimitsCategories = !isReorderingLimitsCategories;
        btnLimitsCat.classList.toggle('active', isReorderingLimitsCategories);
        btnLimitsCat.textContent = isReorderingLimitsCategories ? '✓ Done' : '↕ Reorder';
        renderCurrentView();
      });
    }

    const btnSavingsTab = document.getElementById('btnToggleReorderSavingsTab');
    if (btnSavingsTab) {
      btnSavingsTab.addEventListener('click', () => {
        isReorderingTabSavings = !isReorderingTabSavings;
        btnSavingsTab.classList.toggle('active', isReorderingTabSavings);
        btnSavingsTab.textContent = isReorderingTabSavings ? '✓ Done' : '↕ Reorder';
        renderCurrentView();
      });
    }
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

    // Receipt Scanning OCR Elements & Action Sheet Modal
    const scanBtn = document.getElementById('btnQuickAddScan');
    const cameraInput = document.getElementById('receiptCameraInput');
    const galleryInput = document.getElementById('receiptGalleryInput');
    const ocrScanningBanner = document.getElementById('ocrScanningBanner');
    const ocrStatusTitle = document.getElementById('ocrStatusTitle');
    const ocrStatusSubtitle = document.getElementById('ocrStatusSubtitle');
    const ocrProgressBar = document.getElementById('ocrProgressBar');

    const sourceModal = document.getElementById('receiptSourceModal');
    const btnActionTakePhoto = document.getElementById('btnActionTakePhoto');
    const btnActionChooseGallery = document.getElementById('btnActionChooseGallery');
    const btnActionCancel = document.getElementById('btnActionCancel');

    const openSourceModal = () => {
      if (sourceModal) sourceModal.classList.add('open');
    };

    const closeSourceModal = () => {
      if (sourceModal) sourceModal.classList.remove('open');
    };

    if (scanBtn) {
      scanBtn.addEventListener('click', openSourceModal);
    }

    if (btnActionTakePhoto && cameraInput) {
      btnActionTakePhoto.addEventListener('click', () => {
        closeSourceModal();
        cameraInput.click();
      });
    }

    if (btnActionChooseGallery && galleryInput) {
      btnActionChooseGallery.addEventListener('click', () => {
        closeSourceModal();
        galleryInput.click();
      });
    }

    if (btnActionCancel) {
      btnActionCancel.addEventListener('click', closeSourceModal);
    }

    if (sourceModal) {
      sourceModal.addEventListener('click', (e) => {
        if (e.target === sourceModal) closeSourceModal();
      });
    }

    const handleReceiptFileChange = async (event) => {
      const input = event.target;
      const file = input && input.files && input.files[0];
      if (!file) return;

      // Show inline progress banner & reset progress state
      if (ocrScanningBanner) {
        ocrScanningBanner.style.display = 'flex';
      }
      if (ocrStatusTitle) {
        ocrStatusTitle.textContent = 'Scanning receipt...';
      }
      if (ocrStatusSubtitle) {
        const isHeic = window.BudgetOCR && typeof window.BudgetOCR.isHeicImage === 'function' && window.BudgetOCR.isHeicImage(file);
        ocrStatusSubtitle.textContent = isHeic ? 'Converting iPhone HEIC photo...' : 'Preparing photo...';
      }
      if (ocrProgressBar) {
        ocrProgressBar.style.width = '0%';
      }

      try {
        if (!window.BudgetOCR || typeof window.BudgetOCR.preprocessImage !== 'function') {
          throw new Error('OCR engine is not loaded. Please check your internet connection.');
        }

        const prep = await window.BudgetOCR.preprocessImage(file);

        if (ocrStatusSubtitle) {
          ocrStatusSubtitle.textContent = 'Reading receipt text...';
        }

        const result = await window.BudgetOCR.recognizeReceipt(prep.canvas, (p) => {
          if (ocrProgressBar) {
            ocrProgressBar.style.width = `${p.progress || 0}%`;
          }
          if (ocrStatusSubtitle) {
            ocrStatusSubtitle.textContent = p.message || 'Scanning receipt...';
          }
        });

        if (!window.ReceiptParser || typeof window.ReceiptParser.parseReceiptText !== 'function') {
          throw new Error('Receipt parser module is not loaded.');
        }

        const parsed = window.ReceiptParser.parseReceiptText(
          result.text,
          window.BudgetStore.getCategories(),
          window.BudgetStore.getCurrency()
        );

        // Update Quick Add inputs with recognized receipt fields
        if (parsed.amount > 0) {
          numpad.setAmount(parsed.amount);
        }
        if (parsed.date && dateInput) {
          dateInput.value = parsed.date;
        }
        if (parsed.merchant && noteInput) {
          noteInput.value = parsed.merchant;
        }
        if (parsed.categoryId) {
          selectedCategoryId = parsed.categoryId;
          window.BudgetUI.renderQuickAddChips(selectedCategoryId, 'quickAddChipsContainer', (catId) => {
            selectedCategoryId = catId;
          });
        }

        window.BudgetUI.showToast('Receipt scanned! Review & tap Save.');
      } catch (err) {
        console.error('Receipt scanning failed:', err);
        window.BudgetUI.showToast(err.message || 'Failed to scan receipt. Please enter manually.');
      } finally {
        if (ocrScanningBanner) {
          ocrScanningBanner.style.display = 'none';
        }
        if (input) {
          input.value = '';
        }
      }
    };

    if (cameraInput) {
      cameraInput.addEventListener('change', handleReceiptFileChange);
    }
    if (galleryInput) {
      galleryInput.addEventListener('change', handleReceiptFileChange);
    }

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

    // Desktop keyboard support for Quick Add (digits 0-9, '.', Backspace, Escape, Enter)
    window.addEventListener('keydown', (e) => {
      const quickAddOverlay = document.getElementById('quickAddModal');
      if (!quickAddOverlay || !quickAddOverlay.classList.contains('open')) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea') {
        if (e.key === 'Escape') {
          closeQuickAddModal();
        }
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        numpad.pressDigit(e.key);
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        numpad.pressDecimal();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        numpad.pressBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeQuickAddModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (saveBtn) saveBtn.click();
      }
    });

    // Mode Toggle: Expense vs Savings
    const btnTypeExpense = document.getElementById('btnTypeExpense');
    const btnTypeSavings = document.getElementById('btnTypeSavings');

    if (btnTypeExpense) {
      btnTypeExpense.addEventListener('click', () => setQuickAddMode('expense'));
    }
    if (btnTypeSavings) {
      btnTypeSavings.addEventListener('click', () => setQuickAddMode('savings'));
    }

    // Save transaction or savings contribution
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const amount = numpad.getNumericValue();
        if (amount <= 0) {
          window.BudgetUI.showToast('Please enter an amount greater than 0');
          return;
        }

        const dateVal = dateInput.value || new Date().toISOString().split('T')[0];
        const noteVal = (noteInput.value || '').trim();

        if (quickAddMode === 'savings') {
          if (!selectedGoalId) {
            window.BudgetUI.showToast('Please select a savings goal');
            return;
          }

          window.BudgetStore.addSavingsRecord({
            goalId: selectedGoalId,
            amount: amount,
            type: 'deposit',
            date: dateVal,
            note: noteVal
          });

          const goal = window.BudgetStore.getSavingsGoalById(selectedGoalId);
          const goalName = goal ? goal.name : 'Savings Goal';
          window.BudgetUI.showToast(`Saved ${window.BudgetCalculations.formatCurrency(amount)} to ${goalName}!`);

          closeQuickAddModal();
          renderCurrentView();
          return;
        }

        // Default Expense Mode
        if (!selectedCategoryId) {
          window.BudgetUI.showToast('Please select a category');
          return;
        }

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

  function setQuickAddMode(mode) {
    quickAddMode = mode === 'savings' ? 'savings' : 'expense';
    const btnTypeExpense = document.getElementById('btnTypeExpense');
    const btnTypeSavings = document.getElementById('btnTypeSavings');
    const sheetTitle = document.getElementById('quickAddSheetTitle');
    const amountLabel = document.getElementById('quickAddAmountLabel');
    const chipsHeader = document.getElementById('quickAddChipsHeaderTitle');
    const scanBtn = document.getElementById('btnQuickAddScan');
    const saveBtn = document.getElementById('btnSaveExpense');

    if (btnTypeExpense) {
      if (quickAddMode === 'expense') btnTypeExpense.classList.add('active');
      else btnTypeExpense.classList.remove('active');
    }
    if (btnTypeSavings) {
      if (quickAddMode === 'savings') btnTypeSavings.classList.add('active');
      else btnTypeSavings.classList.remove('active');
    }

    if (quickAddMode === 'savings') {
      if (sheetTitle) sheetTitle.textContent = 'Set Aside Savings';
      if (amountLabel) amountLabel.textContent = 'Amount to Save';
      if (chipsHeader) chipsHeader.textContent = 'Select Goal';
      if (scanBtn) scanBtn.style.display = 'none';
      if (saveBtn) saveBtn.textContent = 'Save to Goal';

      const goals = window.BudgetStore.getSavingsGoals();
      if (!selectedGoalId && goals.length > 0) {
        selectedGoalId = goals[0].id;
      }
      window.BudgetUI.renderSavingsGoalChips(selectedGoalId, 'quickAddChipsContainer', (goalId) => {
        selectedGoalId = goalId;
      });
    } else {
      if (sheetTitle) sheetTitle.textContent = 'Log Expense';
      if (amountLabel) amountLabel.textContent = 'Amount Spent';
      if (chipsHeader) chipsHeader.textContent = 'Select Category';
      if (scanBtn) scanBtn.style.display = 'inline-flex';
      if (saveBtn) saveBtn.textContent = 'Save Expense';

      const categories = window.BudgetStore.getCategories();
      if (!selectedCategoryId && categories.length > 0) {
        selectedCategoryId = categories[0].id;
      }
      window.BudgetUI.renderQuickAddChips(selectedCategoryId, 'quickAddChipsContainer', (catId) => {
        selectedCategoryId = catId;
      });
    }
  }

  function openQuickAddModal(preselectedCategoryId = null, preselectedGoalId = null, mode = 'expense') {
    const overlay = document.getElementById('quickAddModal');
    const dateInput = document.getElementById('expenseDateInput');
    const noteInput = document.getElementById('expenseNoteInput');
    const ocrScanningBanner = document.getElementById('ocrScanningBanner');
    if (ocrScanningBanner) ocrScanningBanner.style.display = 'none';

    numpad.reset();
    if (noteInput) noteInput.value = '';
    if (dateInput) {
      const now = new Date();
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    if (preselectedCategoryId) {
      selectedCategoryId = preselectedCategoryId;
    }
    if (preselectedGoalId) {
      selectedGoalId = preselectedGoalId;
    }

    setQuickAddMode(mode);

    if (overlay) {
      overlay.classList.add('open');
    }
  }

  function closeQuickAddModal() {
    const overlay = document.getElementById('quickAddModal');
    if (overlay) overlay.classList.remove('open');
    const sourceModal = document.getElementById('receiptSourceModal');
    if (sourceModal) sourceModal.classList.remove('open');
    const ocrScanningBanner = document.getElementById('ocrScanningBanner');
    if (ocrScanningBanner) ocrScanningBanner.style.display = 'none';
  }

  // ==========================================================================
  // Currency Input Formatting & Parsing Helpers
  // ==========================================================================

  /**
   * Strips thousands comma separators and parses a numeric amount.
   */
  function parseInputAmount(str) {
    if (typeof str === 'number') return isNaN(str) ? 0 : str;
    if (!str) return 0;
    const cleaned = String(str).replace(/,/g, '').trim();
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  /**
   * Helper function to format input fields with commas as the user types,
   * preserving cursor position and handling backspace/delete on commas.
   */
  function attachCurrencyInputFormatter(input) {
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        const pos = input.selectionStart;
        if (pos === input.selectionEnd && pos > 0 && input.value[pos - 1] === ',') {
          // Deleting comma with Backspace: delete the digit before the comma instead
          e.preventDefault();
          const val = input.value;
          input.value = val.slice(0, pos - 2) + val.slice(pos - 1);
          input.setSelectionRange(pos - 1, pos - 1);
          input.dispatchEvent(new Event('input'));
        }
      } else if (e.key === 'Delete') {
        const pos = input.selectionStart;
        if (pos === input.selectionEnd && pos < input.value.length && input.value[pos] === ',') {
          // Deleting comma with Delete: delete comma and the digit after it
          e.preventDefault();
          const val = input.value;
          input.value = val.slice(0, pos) + val.slice(pos + 2);
          input.setSelectionRange(pos, pos);
          input.dispatchEvent(new Event('input'));
        }
      }
    });

    input.addEventListener('input', () => {
      const originalValue = input.value;
      const selectionStart = input.selectionStart;

      // Count non-comma characters before the caret
      const nonCommasBeforeCaret = (originalValue.slice(0, selectionStart).match(/[^,]/g) || []).length;

      // Strip everything except digits and decimal point
      let cleaned = originalValue.replace(/[^0-9.]/g, '');

      // Keep only first decimal point
      const firstDot = cleaned.indexOf('.');
      if (firstDot !== -1) {
        cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
      }

      // Strip redundant leading zeros (e.g. "05" -> "5", but keep "0" or "0.")
      if (/^0[0-9]/.test(cleaned)) {
        cleaned = cleaned.replace(/^0+/, '');
        if (cleaned === '') cleaned = '0';
      }

      if (cleaned === '') {
        input.value = '';
        return;
      }

      const formatter = (window.BudgetNumpad && window.BudgetNumpad.formatWithCommas) ||
                        (typeof formatWithCommas === 'function' ? formatWithCommas : null);
      const formatted = formatter ? formatter(cleaned) : cleaned;
      input.value = formatted;

      // Restore caret position based on nonCommasBeforeCaret
      let newCaretPos = 0;
      let count = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] !== ',') {
          count++;
        }
        if (count === nonCommasBeforeCaret) {
          newCaretPos = i + 1;
          break;
        }
      }

      if (nonCommasBeforeCaret === 0) {
        newCaretPos = 0;
      } else if (count < nonCommasBeforeCaret) {
        newCaretPos = formatted.length;
      }

      input.setSelectionRange(newCaretPos, newCaretPos);
    });
  }

  // ==========================================================================
  // Category Budget Limits Management
  // ==========================================================================
  function setSelectedSwatch(containerId, color) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const target = (color || '').toLowerCase();
    container.querySelectorAll('.color-swatch-btn').forEach(btn => {
      const btnColor = (btn.getAttribute('data-color') || '').toLowerCase();
      if (btnColor === target) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });
  }

  function updateCategoryLivePreview() {
    const badge = document.getElementById('categoryEditPreviewBadge');
    const nameEl = document.getElementById('categoryEditPreviewName');
    const subEl = document.getElementById('categoryEditPreviewSub');
    const nameInput = document.getElementById('editCategoryName');
    const iconInput = document.getElementById('editCategoryIcon');
    const limitInput = document.getElementById('editCategoryLimit');
    const colorInput = document.getElementById('editCategoryColor');

    const color = (colorInput && colorInput.value) || '#fed7aa';
    const icon = (iconInput && iconInput.value.trim()) || '🏷️';
    const name = (nameInput && nameInput.value.trim()) || 'Category Name';

    if (badge) {
      badge.style.backgroundColor = color;
      badge.textContent = icon;
    }
    if (nameEl) {
      nameEl.textContent = name;
    }
    if (subEl) {
      const limitVal = limitInput ? parseInputAmount(limitInput.value) : 0;
      if (limitVal > 0) {
        const formatted = (window.BudgetCalculations && window.BudgetCalculations.formatCurrency)
          ? window.BudgetCalculations.formatCurrency(limitVal)
          : `¥${limitVal}`;
        subEl.textContent = `${formatted} monthly limit`;
      } else {
        subEl.textContent = 'No budget limit';
      }
    }
  }

  function setupCategoryEditModal() {
    const overlay = document.getElementById('categoryEditModal');
    const closeBtn = document.getElementById('btnCategoryEditClose');
    const saveBtn = document.getElementById('btnSaveCategory');
    const deleteBtn = document.getElementById('btnDeleteCategory');
    const nameInput = document.getElementById('editCategoryName');
    const iconInput = document.getElementById('editCategoryIcon');
    const limitInput = document.getElementById('editCategoryLimit');
    const colorInput = document.getElementById('editCategoryColor');
    const swatchesContainer = document.getElementById('categoryColorSwatches');

    if (limitInput) {
      attachCurrencyInputFormatter(limitInput);
    }

    [nameInput, iconInput, limitInput].forEach(input => {
      if (input) {
        input.addEventListener('input', updateCategoryLivePreview);
      }
    });

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        setSelectedSwatch('categoryColorSwatches', colorInput.value);
        updateCategoryLivePreview();
      });
    }

    if (swatchesContainer) {
      swatchesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-swatch-btn');
        if (!btn) return;
        const color = btn.getAttribute('data-color');
        if (color) {
          if (colorInput) colorInput.value = color;
          setSelectedSwatch('categoryColorSwatches', color);
          updateCategoryLivePreview();
        }
      });
    }

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
        const name = (nameInput.value || '').trim();
        const icon = (iconInput.value || '🏷️').trim();
        const limit = parseInputAmount(limitInput.value);
        const color = colorInput.value || '#fed7aa';

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
        const formatter = (window.BudgetNumpad && window.BudgetNumpad.formatWithCommas) ||
                          (typeof formatWithCommas === 'function' ? formatWithCommas : null);
        limitInput.value = formatter ? formatter(cat.limit) : cat.limit;
        colorInput.value = cat.color || '#fed7aa';
      }
    } else {
      titleEl.textContent = 'Add New Category & Budget';
      nameInput.value = '';
      iconInput.value = '🏷️';
      const defaultLimit = window.BudgetStore.getCurrency() === 'JPY' ? 50000 : 200;
      const formatter = (window.BudgetNumpad && window.BudgetNumpad.formatWithCommas) ||
                        (typeof formatWithCommas === 'function' ? formatWithCommas : null);
      limitInput.value = formatter ? formatter(defaultLimit) : String(defaultLimit);
      colorInput.value = '#fed7aa';
    }

    setSelectedSwatch('categoryColorSwatches', colorInput.value);
    updateCategoryLivePreview();

    if (overlay) overlay.classList.add('open');
  }

  function closeCategoryEditModal() {
    const overlay = document.getElementById('categoryEditModal');
    if (overlay) overlay.classList.remove('open');
  }

  // ==========================================================================
  // Savings Goals Management & Withdrawals
  // ==========================================================================
  function updateGoalLivePreview() {
    const badge = document.getElementById('goalEditPreviewBadge');
    const nameEl = document.getElementById('goalEditPreviewName');
    const subEl = document.getElementById('goalEditPreviewSub');
    const nameInput = document.getElementById('goalInputName');
    const iconInput = document.getElementById('goalInputIcon');
    const targetInput = document.getElementById('goalInputTarget');
    const colorInput = document.getElementById('goalInputColor');

    const color = (colorInput && colorInput.value) || '#bae6fd';
    const icon = (iconInput && iconInput.value.trim()) || '🎯';
    const name = (nameInput && nameInput.value.trim()) || 'Goal Name';

    if (badge) {
      badge.style.backgroundColor = color;
      badge.textContent = icon;
    }
    if (nameEl) {
      nameEl.textContent = name;
    }
    if (subEl) {
      const targetVal = targetInput ? parseInputAmount(targetInput.value) : 0;
      if (targetVal > 0) {
        const formatted = (window.BudgetCalculations && window.BudgetCalculations.formatCurrency)
          ? window.BudgetCalculations.formatCurrency(targetVal)
          : `¥${targetVal}`;
        subEl.textContent = `Target: ${formatted}`;
      } else {
        subEl.textContent = 'No target amount';
      }
    }
  }

  function setupSavingsGoalModal() {
    const overlay = document.getElementById('savingsGoalModal');
    const closeBtn = document.getElementById('btnSavingsGoalClose');
    const saveBtn = document.getElementById('btnSaveSavingsGoal');
    const deleteBtn = document.getElementById('btnDeleteSavingsGoal');
    const nameInput = document.getElementById('goalInputName');
    const iconInput = document.getElementById('goalInputIcon');
    const targetInput = document.getElementById('goalInputTarget');
    const dateInput = document.getElementById('goalInputTargetDate');
    const colorInput = document.getElementById('goalInputColor');
    const swatchesContainer = document.getElementById('goalColorSwatches');

    if (targetInput) {
      attachCurrencyInputFormatter(targetInput);
    }

    [nameInput, iconInput, targetInput].forEach(input => {
      if (input) {
        input.addEventListener('input', updateGoalLivePreview);
      }
    });

    if (colorInput) {
      colorInput.addEventListener('input', () => {
        setSelectedSwatch('goalColorSwatches', colorInput.value);
        updateGoalLivePreview();
      });
    }

    if (swatchesContainer) {
      swatchesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-swatch-btn');
        if (!btn) return;
        const color = btn.getAttribute('data-color');
        if (color) {
          if (colorInput) colorInput.value = color;
          setSelectedSwatch('goalColorSwatches', color);
          updateGoalLivePreview();
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeSavingsGoalModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSavingsGoalModal();
      });
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnOpenAddSavingsGoalModal')) {
        openSavingsGoalModal(null);
      }
    });

    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (!editingGoalId) return;
        handleDeleteSavingsGoal(editingGoalId);
        closeSavingsGoalModal();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const name = (nameInput.value || '').trim();
        const icon = (iconInput.value || '🎯').trim();
        const targetAmount = parseInputAmount(targetInput.value);
        const targetDate = dateInput.value || null;
        const color = colorInput.value || '#bae6fd';

        if (!name) {
          window.BudgetUI.showToast('Please enter a goal name');
          return;
        }

        if (targetAmount <= 0) {
          window.BudgetUI.showToast('Target amount must be greater than 0');
          return;
        }

        window.BudgetStore.saveSavingsGoal({
          id: editingGoalId || undefined,
          name: name,
          icon: icon,
          targetAmount: targetAmount,
          targetDate: targetDate,
          color: color
        });

        window.BudgetUI.showToast(`Saved goal "${name}"!`);
        closeSavingsGoalModal();
        renderCurrentView();
      });
    }
  }

  function openSavingsGoalModal(goalId = null) {
    editingGoalId = goalId;
    const overlay = document.getElementById('savingsGoalModal');
    const titleEl = document.getElementById('savingsGoalModalTitle');
    const nameInput = document.getElementById('goalInputName');
    const iconInput = document.getElementById('goalInputIcon');
    const targetInput = document.getElementById('goalInputTarget');
    const dateInput = document.getElementById('goalInputTargetDate');
    const colorInput = document.getElementById('goalInputColor');
    const deleteBtn = document.getElementById('btnDeleteSavingsGoal');
    const targetLabel = document.getElementById('goalInputTargetLabel');

    const symbol = window.BudgetCalculations.getCurrencySymbol();
    if (targetLabel) {
      targetLabel.textContent = `Target Amount (${symbol})`;
    }

    if (deleteBtn) {
      deleteBtn.style.display = goalId ? 'block' : 'none';
    }

    if (goalId) {
      const goal = window.BudgetStore.getSavingsGoalById(goalId);
      if (goal) {
        titleEl.textContent = 'Edit Savings Goal';
        nameInput.value = goal.name;
        iconInput.value = goal.icon || '🎯';
        const formatter = (window.BudgetNumpad && window.BudgetNumpad.formatWithCommas) ||
                          (typeof formatWithCommas === 'function' ? formatWithCommas : null);
        targetInput.value = formatter ? formatter(goal.targetAmount) : goal.targetAmount;
        dateInput.value = goal.targetDate || '';
        colorInput.value = goal.color || '#bae6fd';
      }
    } else {
      titleEl.textContent = 'Create Savings Goal';
      nameInput.value = '';
      iconInput.value = '🎯';
      targetInput.value = '';
      dateInput.value = '';
      colorInput.value = '#bae6fd';
    }

    setSelectedSwatch('goalColorSwatches', colorInput.value);
    updateGoalLivePreview();

    if (overlay) overlay.classList.add('open');
  }

  function closeSavingsGoalModal() {
    const overlay = document.getElementById('savingsGoalModal');
    if (overlay) overlay.classList.remove('open');
  }

  function setupSavingsWithdrawModal() {
    const overlay = document.getElementById('savingsWithdrawModal');
    const closeBtn = document.getElementById('btnSavingsWithdrawClose');
    const submitBtn = document.getElementById('btnSubmitWithdrawal');
    const amountInput = document.getElementById('inputWithdrawAmount');
    const dateInput = document.getElementById('inputWithdrawDate');
    const noteInput = document.getElementById('inputWithdrawNote');

    if (amountInput) {
      attachCurrencyInputFormatter(amountInput);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeSavingsWithdrawModal);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSavingsWithdrawModal();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (!withdrawingGoalId) return;

        const amount = parseInputAmount(amountInput.value);
        if (amount <= 0) {
          window.BudgetUI.showToast('Please enter a valid withdrawal amount');
          return;
        }

        const dateVal = dateInput.value || new Date().toISOString().split('T')[0];
        const noteVal = (noteInput.value || '').trim();

        window.BudgetStore.addSavingsRecord({
          goalId: withdrawingGoalId,
          amount: amount,
          type: 'withdraw',
          date: dateVal,
          note: noteVal
        });

        const goal = window.BudgetStore.getSavingsGoalById(withdrawingGoalId);
        const goalName = goal ? goal.name : 'Savings Goal';
        window.BudgetUI.showToast(`Recorded withdrawal of ${window.BudgetCalculations.formatCurrency(amount)} from ${goalName}`);

        closeSavingsWithdrawModal();
        renderCurrentView();
      });
    }
  }

  function openSavingsWithdrawModal(goalId) {
    withdrawingGoalId = goalId;
    const overlay = document.getElementById('savingsWithdrawModal');
    const titleEl = document.getElementById('savingsWithdrawModalTitle');
    const subtitleEl = document.getElementById('savingsWithdrawSubtitle');
    const amountInput = document.getElementById('inputWithdrawAmount');
    const dateInput = document.getElementById('inputWithdrawDate');
    const noteInput = document.getElementById('inputWithdrawNote');
    const labelEl = document.getElementById('savingsWithdrawAmountLabel');

    const goal = window.BudgetStore.getSavingsGoalById(goalId);
    const goalName = goal ? goal.name : 'Goal';
    const symbol = window.BudgetCalculations.getCurrencySymbol();

    if (titleEl) titleEl.textContent = `Withdraw from ${goalName}`;
    if (subtitleEl) subtitleEl.textContent = `Record a payout or withdrawal from "${goalName}" (e.g. paying for trip costs or reallocating cash).`;
    if (labelEl) labelEl.textContent = `Withdrawal Amount (${symbol})`;
    if (amountInput) amountInput.value = '';
    if (noteInput) noteInput.value = '';
    if (dateInput) {
      const now = new Date();
      dateInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    if (overlay) overlay.classList.add('open');
  }

  function closeSavingsWithdrawModal() {
    const overlay = document.getElementById('savingsWithdrawModal');
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
    const goalTargetLabel = document.getElementById('goalInputTargetLabel');
    if (goalTargetLabel) {
      goalTargetLabel.textContent = `Target Amount (${symbol})`;
    }
    const withdrawAmountLabel = document.getElementById('savingsWithdrawAmountLabel');
    if (withdrawAmountLabel) {
      withdrawAmountLabel.textContent = `Withdrawal Amount (${symbol})`;
    }
    const selectCurrency = document.getElementById('selectCurrency');
    if (selectCurrency) {
      selectCurrency.value = window.BudgetStore.getCurrency();
    }
  }
});

