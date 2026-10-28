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
    const savingsRecords = Store().getSavingsRecords ? Store().getSavingsRecords() : [];
    const breakdown = Calc().getOverallMonthlyBreakdown
      ? Calc().getOverallMonthlyBreakdown(categories, transactions, savingsRecords, monthKey)
      : {
          totalBudget: 0,
          totalSpent: 0,
          totalRemaining: 0,
          overallPercent: 0,
          status: 'safe',
          savingsDeposited: 0,
          savingsWithdrawn: 0,
          netSaved: 0,
          totalOutflow: 0
        };

    const spentFormatted = Calc().formatCurrency(breakdown.totalSpent);
    const limitFormatted = Calc().formatCurrency(breakdown.totalBudget);
    const remainingFormatted = Calc().formatCurrency(Math.abs(breakdown.totalRemaining));
    const savingsDepositedFormatted = Calc().formatCurrency(breakdown.savingsDeposited);
    const totalOutflowFormatted = Calc().formatCurrency(breakdown.totalOutflow);

    const statusClass = breakdown.status; // 'safe' | 'warning' | 'danger'
    const fillPercent = Math.min(breakdown.overallPercent, 100);

    let statusLabel = `${breakdown.overallPercent}% consumed`;
    if (breakdown.totalBudget === 0 && breakdown.totalSpent > 0) {
      statusLabel = 'No budget set';
    } else if (breakdown.totalRemaining < 0) {
      statusLabel = 'Over Budget!';
    }

    container.innerHTML = `
      <div class="summary-card status-${statusClass}">
        <div class="summary-header">
          <div>
            <div class="summary-label">Living Expenses</div>
            <div class="summary-spent-amount">${spentFormatted}</div>
            <div class="summary-limit-subtext">Monthly Limit: ${limitFormatted}</div>
          </div>
          <div class="summary-status-pill ${statusClass}">${statusLabel}</div>
        </div>

        <div class="progress-bar-container">
          <div class="progress-bar-fill ${statusClass}" style="width: ${fillPercent}%;"></div>
        </div>

        <div class="summary-footer-stats">
          <div>
            <span class="stat-item-label">Remaining: </span>
            <span class="stat-item-value ${breakdown.totalRemaining >= 0 ? 'positive' : 'negative'}">
              ${breakdown.totalRemaining >= 0 ? remainingFormatted : `-${remainingFormatted} Over`}
            </span>
          </div>
          <div>
            <span class="stat-item-label">Categories: </span>
            <span class="stat-item-value">${categories.length} tracked</span>
          </div>
        </div>

        <!-- Monthly Financial Outflow Breakdown -->
        <div class="summary-outflow-divider"></div>
        <div class="summary-outflow-row">
          <div class="outflow-col">
            <span class="outflow-label">🏦 Saved This Month</span>
            <span class="outflow-value savings">${savingsDepositedFormatted}</span>
          </div>
          <div class="outflow-divider-vertical"></div>
          <div class="outflow-col">
            <span class="outflow-label">💳 Total Cash Outflow</span>
            <span class="outflow-value total">${totalOutflowFormatted}</span>
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
   * Renders Savings Goal Selection Chips in the Quick-Add modal (Savings mode)
   */
  function renderSavingsGoalChips(selectedGoalId, containerId = 'quickAddChipsContainer', onSelect = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const goals = Store().getSavingsGoals ? Store().getSavingsGoals() : [];

    if (!goals.length) {
      container.innerHTML = `<span style="font-size: 13px; color: var(--text-secondary); padding: 6px 0;">No savings goals yet. Create one in the Savings tab first!</span>`;
      return;
    }

    container.innerHTML = goals.map(goal => {
      const isSelected = goal.id === selectedGoalId;
      return `
        <button type="button" class="chip-btn ${isSelected ? 'selected' : ''}" data-goal-id="${goal.id}">
          <span class="chip-icon">${goal.icon || '🎯'}</span>
          <span>${escapeHtml(goal.name)}</span>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const goalId = btn.getAttribute('data-goal-id');
        container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (typeof onSelect === 'function') onSelect(goalId);
      });
    });
  }

  /**
   * Renders the Savings Overview Hero Card
   */
  function renderSavingsOverviewCard(monthKey, containerId = 'savingsOverviewCardContainer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const goals = Store().getSavingsGoals ? Store().getSavingsGoals() : [];
    const records = Store().getSavingsRecords ? Store().getSavingsRecords() : [];
    const monthSummary = Calc().getMonthlySavingsSummary ? Calc().getMonthlySavingsSummary(records, monthKey) : { totalDeposited: 0, totalWithdrawn: 0, netSaved: 0 };

    let totalAccumulated = 0;
    for (const g of goals) {
      const progress = Calc().getGoalProgress(g, records);
      totalAccumulated += progress.totalSaved;
    }

    const totalAccumulatedStr = Calc().formatCurrency(totalAccumulated);
    const monthDepositedStr = Calc().formatCurrency(monthSummary.totalDeposited);

    container.innerHTML = `
      <div class="savings-hero-card">
        <div class="savings-hero-top">
          <div>
            <div class="savings-hero-label">Total Accumulated Savings</div>
            <div class="savings-hero-amount">${totalAccumulatedStr}</div>
          </div>
          <div class="savings-hero-badge">${goals.length} Active ${goals.length === 1 ? 'Goal' : 'Goals'}</div>
        </div>
        <div class="savings-hero-bottom">
          <div class="savings-hero-stat">
            <span class="savings-hero-stat-label">This Month Deposited:</span>
            <span class="savings-hero-stat-value positive">+${monthDepositedStr}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Renders Savings Goal Cards with live progress and action buttons
   */
  function renderSavingsGoals(monthKey, containerId = 'savingsGoalsContainer', onDeposit = null, onWithdraw = null, onEdit = null, onDelete = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const goals = Store().getSavingsGoals ? Store().getSavingsGoals() : [];
    const records = Store().getSavingsRecords ? Store().getSavingsRecords() : [];

    if (!goals.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏦</div>
          <div class="empty-state-title">No Savings Goals Yet</div>
          <div class="empty-state-desc">Create your first goal to set aside money for trips, emergency funds, or tech purchases.</div>
        </div>
      `;
      return;
    }

    const cardsHtml = goals.map(goal => {
      const progress = Calc().getGoalProgress(goal, records);
      const savedStr = Calc().formatCurrency(progress.totalSaved);
      const targetStr = Calc().formatCurrency(progress.targetAmount);
      const remainingStr = Calc().formatCurrency(progress.remainingAmount);
      const fillWidth = Math.min(progress.percent, 100);

      // Month specific contribution
      const monthGoalRecords = records.filter(r => r.goalId === goal.id && r.date && r.date.startsWith(monthKey));
      const monthDeposited = monthGoalRecords
        .filter(r => r.type !== 'withdraw')
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const monthDepositedStr = Calc().formatCurrency(monthDeposited);

      let paceHtml = '';
      if (progress.targetDate) {
        const formattedTargetDate = goal.targetDate;
        if (progress.isCompleted) {
          paceHtml = `<div class="goal-pace-badge completed">🎉 Target Reached!</div>`;
        } else if (progress.recommendedMonthly !== null) {
          const recStr = Calc().formatCurrency(progress.recommendedMonthly);
          const mosText = progress.remainingMonths > 0 ? `${progress.remainingMonths} mos left` : 'Due this month';
          paceHtml = `<div class="goal-pace-badge">🎯 Target: ${escapeHtml(formattedTargetDate)} • Save <strong>${recStr}/mo</strong> (${mosText})</div>`;
        }
      } else if (progress.isCompleted) {
        paceHtml = `<div class="goal-pace-badge completed">🎉 Target Reached!</div>`;
      }

      return `
        <div class="savings-goal-card" data-goal-id="${goal.id}">
          <div class="goal-card-top">
            <div class="goal-info-left">
              <div class="goal-icon-badge" style="background-color: ${goal.color || '#007AFF'}20; color: ${goal.color || '#007AFF'};">
                ${goal.icon || '🎯'}
              </div>
              <div class="goal-name-wrap">
                <span class="goal-card-name">${escapeHtml(goal.name)}</span>
                <span class="goal-fraction-text">
                  <span class="goal-saved-bold">${savedStr}</span> / ${targetStr}
                </span>
              </div>
            </div>
            <div class="goal-badge-percent" style="background-color: ${goal.color || '#007AFF'}18; color: ${goal.color || '#007AFF'};">
              ${progress.percent}%
            </div>
          </div>

          <div class="goal-progress-track">
            <div class="goal-progress-fill" style="width: ${fillWidth}%; background-color: ${goal.color || '#007AFF'};"></div>
          </div>

          <div class="goal-card-stats-row">
            <span class="goal-remaining-text">${progress.isCompleted ? 'Goal fully funded!' : `${remainingStr} remaining`}</span>
            ${monthDeposited > 0 ? `<span class="goal-month-deposit-tag">+${monthDepositedStr} this mo</span>` : ''}
          </div>

          ${paceHtml}

          <div class="goal-card-actions">
            <button type="button" class="goal-action-btn deposit" data-deposit-goal="${goal.id}">+ Deposit</button>
            <button type="button" class="goal-action-btn withdraw" data-withdraw-goal="${goal.id}">- Withdraw</button>
            <button type="button" class="goal-action-btn icon-btn" data-edit-goal="${goal.id}" title="Edit Goal">✎</button>
            <button type="button" class="goal-action-btn icon-btn delete" data-delete-goal="${goal.id}" title="Delete Goal">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="savings-goals-grid">${cardsHtml}</div>`;

    if (typeof onDeposit === 'function') {
      container.querySelectorAll('[data-deposit-goal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onDeposit(btn.getAttribute('data-deposit-goal'));
        });
      });
    }

    if (typeof onWithdraw === 'function') {
      container.querySelectorAll('[data-withdraw-goal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onWithdraw(btn.getAttribute('data-withdraw-goal'));
        });
      });
    }

    if (typeof onEdit === 'function') {
      container.querySelectorAll('[data-edit-goal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onEdit(btn.getAttribute('data-edit-goal'));
        });
      });
    }

    if (typeof onDelete === 'function') {
      container.querySelectorAll('[data-delete-goal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onDelete(btn.getAttribute('data-delete-goal'));
        });
      });
    }
  }

  /**
   * Renders the Savings Goals snapshot on the Dashboard
   */
  function renderDashboardSavingsSnapshot(monthKey, containerId = 'dashboardSavingsContainer', onDeposit = null, onViewAll = null) {
    const container = document.getElementById(containerId);
    const headerEl = document.getElementById('dashboardSavingsHeader');
    if (!container) return;

    const goals = Store().getSavingsGoals ? Store().getSavingsGoals() : [];
    const records = Store().getSavingsRecords ? Store().getSavingsRecords() : [];

    if (!goals.length) {
      if (headerEl) headerEl.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    if (headerEl) headerEl.style.display = 'flex';

    const itemsHtml = goals.map(goal => {
      const progress = Calc().getGoalProgress(goal, records);
      const savedStr = Calc().formatCurrency(progress.totalSaved);
      const targetStr = Calc().formatCurrency(progress.targetAmount);
      const fillWidth = Math.min(progress.percent, 100);

      return `
        <div class="dashboard-savings-card" data-goal-id="${goal.id}">
          <div class="dash-goal-top">
            <span class="dash-goal-icon" style="background-color: ${goal.color || '#007AFF'}20; color: ${goal.color || '#007AFF'};">${goal.icon || '🎯'}</span>
            <div class="dash-goal-title-wrap">
              <span class="dash-goal-name">${escapeHtml(goal.name)}</span>
              <span class="dash-goal-fraction">${savedStr} / ${targetStr}</span>
            </div>
            <button type="button" class="dash-goal-deposit-btn" data-dash-deposit="${goal.id}">+ Deposit</button>
          </div>
          <div class="dash-goal-progress-track">
            <div class="dash-goal-progress-fill" style="width: ${fillWidth}%; background-color: ${goal.color || '#007AFF'};"></div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="dashboard-savings-grid">${itemsHtml}</div>`;

    if (typeof onDeposit === 'function') {
      container.querySelectorAll('[data-dash-deposit]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onDeposit(btn.getAttribute('data-dash-deposit'));
        });
      });
    }

    const viewAllBtn = document.getElementById('btnDashboardViewAllSavings');
    if (viewAllBtn && typeof onViewAll === 'function') {
      viewAllBtn.onclick = onViewAll;
    }
  }

  /**
   * Renders the History View (Transactions & Savings Records grouped by date)
   */
  function renderHistory(monthKey, containerId = 'historyContainer', onDelete = null, onDeleteSavings = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const transactions = Store().getTransactions();
    const categories = Store().getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    const savingsRecords = Store().getSavingsRecords ? Store().getSavingsRecords() : [];
    const goals = Store().getSavingsGoals ? Store().getSavingsGoals() : [];
    const goalMap = new Map(goals.map(g => [g.id, g]));

    // Normalize both transactions and savings records for unified timeline
    const allItems = [
      ...transactions.map(t => ({ ...t, isSavings: false })),
      ...savingsRecords.map(r => ({ ...r, isSavings: true }))
    ];

    const dateGroups = Calc().groupTransactionsByDate(allItems, monthKey);

    if (!dateGroups.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-title">No Activity Yet</div>
          <div class="empty-state-desc">You haven't logged any expenses or savings for this month. Tap "+" below to start!</div>
        </div>
      `;
      return;
    }

    const html = dateGroups.map(group => {
      const expenseTotal = group.transactions
        .filter(t => !t.isSavings)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const dayTotalFormatted = Calc().formatCurrency(expenseTotal);

      const itemsHtml = group.transactions.map(t => {
        if (t.isSavings) {
          const goal = goalMap.get(t.goalId) || { name: 'Savings Goal', icon: '🎯', color: '#007AFF' };
          const amountStr = Calc().formatCurrency(t.amount);
          const isDeposit = t.type !== 'withdraw';
          const sign = isDeposit ? '+' : '-';
          const badgeLabel = isDeposit ? 'Goal Deposit' : 'Withdrawal';
          const colorClass = isDeposit ? 'savings-deposit' : 'savings-withdraw';

          return `
            <div class="transaction-row savings-record-row" data-savings-id="${t.id}">
              <div class="transaction-left">
                <div class="transaction-icon" style="background-color: ${goal.color || '#007AFF'}20; color: ${goal.color || '#007AFF'};">
                  ${goal.icon || '🏦'}
                </div>
                <div class="transaction-details">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="transaction-cat-name">${escapeHtml(goal.name)}</span>
                    <span class="savings-type-pill ${colorClass}">${badgeLabel}</span>
                  </div>
                  ${t.note ? `<span class="transaction-note">${escapeHtml(t.note)}</span>` : ''}
                </div>
              </div>
              <div class="transaction-right">
                <span class="transaction-amount ${colorClass}">${sign}${amountStr}</span>
                <button class="transaction-delete-btn" data-delete-savings-id="${t.id}" aria-label="Delete Savings Record">✕</button>
              </div>
            </div>
          `;
        }

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
            <span class="history-day-total">Spend: ${dayTotalFormatted}</span>
          </div>
          <div class="history-items-list">${itemsHtml}</div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    if (typeof onDelete === 'function') {
      container.querySelectorAll('.transaction-delete-btn[data-delete-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-delete-id');
          onDelete(id);
        });
      });
    }

    if (typeof onDeleteSavings === 'function') {
      container.querySelectorAll('.transaction-delete-btn[data-delete-savings-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-delete-savings-id');
          onDeleteSavings(id);
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
    renderSavingsGoalChips,
    renderSavingsOverviewCard,
    renderSavingsGoals,
    renderDashboardSavingsSnapshot,
    renderHistory,
    renderCategoriesManager,
    escapeHtml
  };
});

