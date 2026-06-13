// src/utils/currency.js

const SYMBOLS = { USD: '$', EUR: '€' };

/** Format a number with commas + N decimals. */
function fmtNum(n, decimals = 2) {
  if (n == null || !isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const parts = abs.toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + parts.join('.');
}

/** Convert an amount from native currency to USD using fxRate. */
export function toUSD(amount, fxRate) {
  return amount * (fxRate || 1);
}

/**
 * Convert each trade's PnL fields to USD using its account's fxRate.
 * UI-level aggregations (sums across accounts) MUST use this first —
 * EUR and USD PnL cannot be added raw. Trades on USD accounts pass
 * through unchanged (same object, no copy).
 */
export function tradesToUSD(trades, accounts) {
  const fxById = Object.fromEntries(accounts.map((a) => [a.id, a.currency === 'USD' ? 1 : (a.fxRate || 1)]));
  return trades.map((t) => {
    const fx = fxById[t.accountId] ?? 1;
    if (fx === 1) return t;
    return {
      ...t,
      totalPnl: (t.totalPnl || 0) * fx,
      tp1Pnl: (t.tp1Pnl || 0) * fx,
      tp2Pnl: (t.tp2Pnl || 0) * fx,
    };
  });
}

/** Convert USD amount to EUR using the EUR/USD rate (~1.1723 means 1 EUR = 1.1723 USD). */
export function usdToEUR(usdAmount, eurFxRate) {
  if (!eurFxRate) return null;
  return usdAmount / eurFxRate;
}

/**
 * Format currency for display.
 * @param {number} amount       - amount in `nativeCurrency`
 * @param {"USD"|"EUR"} nativeCurrency
 * @param {"USD"|"EUR"|"BOTH"} displayMode
 * @param {number} eurFxRate    - EUR→USD rate (required for cross-currency display)
 * @param {Object} opts         - { decimals: 2, showSign: false, compact: false }
 */
export function fmtCur(amount, nativeCurrency, displayMode, eurFxRate, opts = {}) {
  const { decimals = 2, showSign = false, compact = false } = opts;
  if (amount == null || !isFinite(amount)) return '—';

  // Normalize to USD baseline
  const usdAmount = nativeCurrency === 'EUR' ? amount * (eurFxRate || 1) : amount;
  const eurAmount = eurFxRate ? usdAmount / eurFxRate : null;

  const formatOne = (val, sym) => {
    const prefix = showSign && val > 0 ? '+' : '';
    if (compact && Math.abs(val) >= 1000) {
      return `${prefix}${sym}${fmtNum(val / 1000, 1)}k`;
    }
    return `${prefix}${sym}${fmtNum(val, decimals)}`;
  };

  if (displayMode === 'USD') return formatOne(usdAmount, SYMBOLS.USD);
  if (displayMode === 'EUR') return eurAmount != null ? formatOne(eurAmount, SYMBOLS.EUR) : '—';
  // BOTH
  if (eurAmount == null) return formatOne(usdAmount, SYMBOLS.USD);
  return `${formatOne(usdAmount, SYMBOLS.USD)} / ${formatOne(eurAmount, SYMBOLS.EUR)}`;
}

/** Format a percentage. e.g. fmtPct(0.1398) → "+13.98%". */
export function fmtPct(value, decimals = 2, showSign = true) {
  if (value == null || !isFinite(value)) return '—';
  const pct = value * 100;
  const prefix = showSign && pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(decimals)}%`;
}

/** Format R-multiple. e.g. fmtR(2.37) → "2.37 R". */
export function fmtR(value, decimals = 2, showSign = true) {
  if (value == null || !isFinite(value)) return '—';
  const prefix = showSign && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)} R`;
}
