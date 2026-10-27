/**
 * ui.js - View rendering and DOM manipulation for Budget Tracking PWA
 * Renders Dashboard, Category Budget Progress Cards, History, Categories Manager, and Modals.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exportsObj = factory();
    root.BudgetUI = exportsObj;
    if (root && typeof root === 'object') {
      Object.assign(root, exportsObj);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Dependencies assumed on global/window: BudgetStore, BudgetCalculations
  const Store = () => window.BudgetStore;
  const Calc = () => window.BudgetCalculations;

  /**
   * Displays a brief toast notification on screen
   */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fadeout');
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  /**
   * Renders the Month Selector Bar
   */
  function renderMonthSelector(monthKey, containerId = 'monthSelectorContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentActual = Calc().getCurrentMonthKey();
    const isCurrent = monthKey === currentActual;
    const title = Calc().formatMonthDisplay(monthKey);

    container.innerHTML = `
      <div class="month-selector-bar">
        <button class="month-nav-btn btn-prev-month" id="btnPrevMonth" aria-label="Previous Month">‹</button>
        <div class="month-title-wrap">
          <button class="month-title-btn btn-open-month-picker" id="btnOpenMonthPicker" aria-label="Jump to Month">
            <span class="month-calendar-icon">📅</span>
            <span class="month-title-text">${title}</span>
            <span class="month-dropdown-caret">▾</span>
          </button>
          ${!isCurrent ? `<button class="month-today-badge btn-reset-current-month" id="btnResetToCurrentMonth">Back to Current Month</button>` : ''}
        </div>
        <button class="month-nav-btn btn-next-month" id="btnNextMonth" aria-label="Next Month">›</button>
      </div>
    `;
  }

  /**
   * Renders the 12-Month Grid and Year display inside the Month Picker Modal
   */
  function renderMonthPicker(pickerYear, currentActiveMonthKey) {
    const yearDisplay = document.getElementById('pickerYearDisplay');
    const gridContainer = document.getElementById('monthPickerGrid');
    if (yearDisplay) {
      yearDisplay.textContent = pickerYear;
    }
    if (!gridContainer) return;

    const actualCurrentMonthKey = Calc().getCurrentMonthKey();
    const recordedMonths = Store().getMonthsWithTransactions ? Store().getMonthsWithTransactions() : [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let html = '';
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const monthKey = `${pickerYear}-${monthStr}`;
      const isActive = monthKey === currentActiveMonthKey;
      const isCurrent = monthKey === actualCurrentMonthKey;
      const hasData = recordedMonths.includes(monthKey);
      const name = monthNames[m - 1];

      html += `
        <button class="month-picker-tile ${isActive ? 'is-active' : ''} ${isCurrent ? 'is-current' : ''}" data-month="${monthKey}">
          <span>${name}</span>
          ${hasData ? '<span class="tile-dot" title="Has expenses"></span>' : ''}
        </button>
      `;
    }

    gridContainer.innerHTML = html;
  }

  /**
   * Renders the Monthly Summary Header Card
   */
  function renderSummaryCard(monthKey, containerId = 'summaryCardContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = Store().getCategories();
    const transactions = Store().getTransactions();
    const overall = Calc().getOverallMonthlyStatus(categories, transactions, monthKey);

    const spentFormatted = Calc().formatCurrency(overall.totalSpent);
    const limitFormatted = Calc().formatCurrency(overall.totalBudget);
    const remainingFormatted = Calc().formatCurrency(Math.abs(overall.totalRemaining));

    const statusClass = overall.status; // 'safe' | 'warning' | 'danger'
    const fillPercent = Math.min(overall.overallPercent, 100);

    let statusLabel = `${overall.overallPercent}% consumed`;
    if (overall.totalBudget === 0 && overall.totalSpent > 0) {
      statusLabel = 'No budget set';
    } else if (overall.totalRemaining < 0) {
      statusLabel = 'Over Budget!';
    }

    container.innerHTML = `
      <div class="summary-card status-${statusClass}">
        <div class="summary-header">
          <div>
            <div class="summary-label">Total Monthly Spending</div>
            <div class="summary-spent-amount">${spentFormatted}</div>
            <div class="summary-limit-subtext">Budget Limit: ${limitFormatted}</div>
          </div>
          <div class="summary-status-pill ${statusClass}">${statusLabel}</div>
        </div>

        <div class="progress-bar-container">
          <div class="progress-bar-fill ${statusClass}" style="width: ${fillPercent}%;"></div>
        </div>

        <div class="summary-footer-stats">
          <div>
            <span class="stat-item-label">Remaining: </span>
            <span class="stat-item-value ${overall.totalRemaining >= 0 ? 'positive' : 'negative'}">
              ${overall.totalRemaining >= 0 ? remainingFormatted : `-${remainingFormatted} Over`}
            </span>
          </div>
          <div>
            <span class="stat-item-label">Categories: </span>
            <span class="stat-item-value">${categories.length} tracked</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders Category Budget Cards with Live Consumption Bars (Focal Feature)
   */
  function renderCategoryCards(monthKey, containerId = 'categoryCardsContainer', onCategoryTap = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = Store().getCategories();
    const transactions = Store().getTransactions();

    if (!categories.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏷️</div>
          <div class="empty-state-title">No Categories Found</div>
          <div class="empty-state-desc">Tap below to add your first budget category.</div>
        </div>
      `;
      return;
    }

    const cardsHtml = categories.map(cat => {
      const status = Calc().getCategoryBudgetStatus(cat, transactions, monthKey);
      const spentStr = Calc().formatCurrency(status.spent);
      const limitStr = Calc().formatCurrency(status.limit);
      const remainingStr = Calc().formatCurrency(Math.abs(status.remaining));
      const fillWidth = Math.min(status.percent, 100);

      let remainingText = '';
      if (status.limit <= 0) {
        remainingText = `<span class="category-remaining-text warning">No limit set</span>`;
      } else if (status.remaining >= 0) {
        remainingText = `<span class="category-remaining-text safe">${remainingStr} left</span>`;
      } else {
        remainingText = `<span class="category-remaining-text danger">+${remainingStr} over budget!</span>`;
      }

      return `
        <div class="category-budget-card" data-category-id="${cat.id}">
          <div class="category-card-top">
            <div class="category-info-left">
              <div class="category-icon-badge" style="background-color: ${cat.color || '#007AFF'}20; color: ${cat.color || '#007AFF'};">
                ${cat.icon || '🏷️'}
              </div>
              <div class="category-name-wrap">
                <span class="category-card-name">${escapeHtml(cat.name)}</span>
                <span class="category-spending-fraction">
                  <span class="spent-bold">${spentStr}</span> / ${limitStr}
                </span>
              </div>
            </div>
            <div class="category-badge-percent ${status.status}">
              ${status.percent}%
            </div>
          </div>

          <div class="category-progress-track">
            <div class="category-progress-fill ${status.status}" style="width: ${fillWidth}%;"></div>
          </div>

          <div class="category-card-bottom">
            ${remainingText}
            <span class="category-limit-badge">Limit: ${limitStr}</span>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="categories-grid">${cardsHtml}</div>`;

    // Attach click listeners to cards to quickly open add-modal for that category
    if (typeof onCategoryTap === 'function') {
      container.querySelectorAll('.category-budget-card').forEach(card => {
        card.addEventListener('click', () => {
          const catId = card.getAttribute('data-category-id');
          onCategoryTap(catId);
        });
      });
    }
  }

  /**
   * Renders Category Selection Chips in the Quick-Add modal
   */
  function renderQuickAddChips(selectedCategoryId, containerId = 'quickAddChipsContainer', onSelect = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = Store().getCategories();

    if (!categories.length) {
      container.innerHTML = `<span style="font-size: 13px; color: var(--text-secondary); padding: 6px 0;">No categories yet. Please add a category first in the Limits tab.</span>`;
      return;
    }

    container.innerHTML = categories.map(cat => {
      const isSelected = cat.id === selectedCategoryId;
      return `
        <button type="button" class="chip-btn ${isSelected ? 'selected' : ''}" data-cat-id="${cat.id}">
          <span class="chip-icon">${cat.icon || '🏷️'}</span>
          <span>${escapeHtml(cat.name)}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.getAttribute('data-cat-id');
        container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (typeof onSelect === 'function') onSelect(catId);
      });
    });
  }

  /**
   * Renders the History View (Transactions grouped by date)
   */
  function renderHistory(monthKey, containerId = 'historyContainer', onDelete = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const transactions = Store().getTransactions();
    const categories = Store().getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const dateGroups = Calc().groupTransactionsByDate(transactions, monthKey);

    if (!dateGroups.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-title">No Expenses Yet</div>
          <div class="empty-state-desc">You haven't logged any expenses for this month. Tap "+" below to track your first expense!</div>
        </div>
      `;
      return;
    }

    const html = dateGroups.map(group => {
      const dayTotalFormatted = Calc().formatCurrency(group.total);

      const itemsHtml = group.transactions.map(t => {
        const cat = categoryMap.get(t.categoryId) || { name: 'Uncategorized', icon: '❓', color: '#8E8E93' };
        const amountStr = Calc().formatCurrency(t.amount);

        return `
          <div class="transaction-row" data-transaction-id="${t.id}">
            <div class="transaction-left">
              <div class="transaction-icon" style="background-color: ${cat.color}20; color: ${cat.color};">
                ${cat.icon}
              </div>
              <div class="transaction-details">
                <span class="transaction-cat-name">${escapeHtml(cat.name)}</span>
                ${t.note ? `<span class="transaction-note">${escapeHtml(t.note)}</span>` : ''}
              </div>
            </div>
            <div class="transaction-right">
              <span class="transaction-amount">-${amountStr}</span>
              <button class="transaction-delete-btn" data-delete-id="${t.id}" aria-label="Delete">✕</button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="history-date-group">
          <div class="history-date-header">
            <span class="history-date-title">${group.displayDate}</span>
            <span class="history-day-total">Total: ${dayTotalFormatted}</span>
          </div>
          <div class="history-items-list">${itemsHtml}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    if (typeof onDelete === 'function') {
      container.querySelectorAll('.transaction-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-delete-id');
          onDelete(id);
        });
      });
    }
  }

  /**
   * Renders Category Manager Screen (Set & Edit Monthly Budget Limits)
   */
  function renderCategoriesManager(containerId = 'categoriesManagerContainer', onEdit = null, onDelete = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const categories = Store().getCategories();

    let listHtml = '';
    if (!categories.length) {
      listHtml = `
        <div class="empty-state" style="padding: 24px 16px; margin-bottom: 14px;">
          <div class="empty-state-icon">🏷️</div>
          <div class="empty-state-title">No Categories</div>
          <div class="empty-state-desc">You haven't set up any budget categories yet. Tap "+ Add New Category" below or restore defaults in Settings.</div>
        </div>
      `;
    } else {
      const itemsHtml = categories.map(cat => {
        const limitFormatted = Calc().formatCurrency(cat.limit);
        return `
          <div class="category-manager-item" data-id="${cat.id}">
            <div class="category-manager-left">
              <div class="category-icon-badge" style="background-color: ${cat.color}20; color: ${cat.color};">
                ${cat.icon}
              </div>
              <div>
                <div class="category-card-name">${escapeHtml(cat.name)}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">Monthly Budget</div>
              </div>
            </div>
            <div class="category-manager-right">
              <button class="category-manager-limit" data-edit-id="${cat.id}" title="Edit Category Limit">
                ${limitFormatted} ✎
              </button>
              <button class="category-manager-delete-btn" data-delete-id="${cat.id}" aria-label="Delete Category" title="Delete Category">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');
      listHtml = `<div class="categories-manager-list">${itemsHtml}</div>`;
    }

    container.innerHTML = `
      ${listHtml}
      <button class="add-category-btn" id="btnOpenAddCategoryModal" style="margin-top: 12px;">+ Add New Category</button>
    `;

    if (typeof onEdit === 'function') {
      container.querySelectorAll('.category-manager-limit').forEach(btn => {
        btn.addEventListener('click', () => {
          const catId = btn.getAttribute('data-edit-id');
          onEdit(catId);
        });
      });
    }

    if (typeof onDelete === 'function') {
      container.querySelectorAll('.category-manager-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const catId = btn.getAttribute('data-delete-id');
          onDelete(catId);
        });
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    showToast,
    renderMonthSelector,
    renderMonthPicker,
    renderSummaryCard,
    renderCategoryCards,
    renderQuickAddChips,
    renderHistory,
    renderCategoriesManager,
    escapeHtml
  };
});

