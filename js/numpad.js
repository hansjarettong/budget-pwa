/**
 * numpad.js - Fast tactile calculator keypad controller for Budget PWA
 * Handles digit appending, decimal precision, backspace, and real-time formatting.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exportsObj = factory();
    root.BudgetNumpad = exportsObj;
    if (root && typeof root === 'object') {
      Object.assign(root, exportsObj);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Helper function to format numeric strings with comma thousands separators.
   * Splits integer and decimal parts (handling negative if needed).
   * Formats integer part using regex: parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',').
   * Preserves trailing decimal point (e.g. '1,000.' if user just pressed '.') and decimal digits (e.g. '1,000.50').
   */
  function formatWithCommas(valStr) {
    if (valStr === undefined || valStr === null || valStr === '') return '';
    const str = String(valStr);
    const isNegative = str.startsWith('-');
    const cleanStr = isNegative ? str.slice(1) : str;
    const parts = cleanStr.split('.');
    const intPart = parts[0] || '0';
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const sign = isNegative ? '-' : '';
    if (parts.length > 1) {
      return sign + formattedInt + '.' + parts.slice(1).join('');
    }
    return sign + formattedInt;
  }

  class NumpadController {
    constructor(options = {}) {
      this.currentBuffer = '0';
      this.maxAmount = 99999999;
      this.onAmountChange = options.onAmountChange || function () {};
    }

    reset() {
      this.currentBuffer = '0';
      this._notify();
    }

    setAmount(val) {
      const num = Number(val);
      if (isNaN(num) || num <= 0) {
        this.currentBuffer = '0';
      } else {
        this.currentBuffer = num.toFixed(2).replace(/\.00$/, '');
      }
      this._notify();
    }

    pressDigit(digit) {
      if (!/^[0-9]$/.test(digit)) return;

      if (this.currentBuffer === '0') {
        this.currentBuffer = digit;
      } else {
        // Check decimal places constraint
        if (this.currentBuffer.includes('.')) {
          const parts = this.currentBuffer.split('.');
          if (parts[1].length >= 2) {
            // Already 2 decimal places, ignore further digits
            return;
          }
        }
        
        // Prevent exceeding max amount
        const candidate = parseFloat(this.currentBuffer + digit);
        if (candidate > this.maxAmount) return;

        this.currentBuffer += digit;
      }

      this._notify();
    }

    pressDecimal() {
      if (!this.currentBuffer.includes('.')) {
        this.currentBuffer += '.';
        this._notify();
      }
    }

    pressBackspace() {
      if (this.currentBuffer.length <= 1) {
        this.currentBuffer = '0';
      } else {
        this.currentBuffer = this.currentBuffer.slice(0, -1);
        if (this.currentBuffer === '' || this.currentBuffer === '-') {
          this.currentBuffer = '0';
        }
      }
      this._notify();
    }

    pressClear() {
      this.reset();
    }

    getNumericValue() {
      const val = parseFloat(this.currentBuffer);
      return isNaN(val) ? 0 : Math.round(val * 100) / 100;
    }

    getDisplayString() {
      return formatWithCommas(this.currentBuffer);
    }

    _notify() {
      this.onAmountChange(this.getDisplayString(), this.getNumericValue(), this.currentBuffer);
    }
  }

  return {
    NumpadController,
    formatWithCommas
  };
});

