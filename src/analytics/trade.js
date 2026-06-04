// src/analytics/trade.js
// Per-trade derived values: R-multiples, result, market detection.

/* ------------------------------------------------------------------ *
 *  Instrument → Market detection
 * ------------------------------------------------------------------ */

const INDICES_TICKERS = new Set([
  'US100', 'US500', 'US30', 'US2000', 'UK100', 'GER40', 'EU50',
  'JP225', 'AUS200', 'HK50', 'FRA40', 'ESP35',
  'SPX', 'NDX', 'DJI', 'NQ', 'ES', 'YM', 'RTY',
  'NDX100', 'SPX500', 'DJ30', 'NAS100',
]);

const METALS_ENERGIES_TICKERS = new Set([
  'XAUUSD', 'XAGUSD', 'GOLD', 'SILVER',
  'WTIUSD', 'BCOUSD', 'NATGAS', 'NGAS', 'USOIL', 'UKOIL',
  'XPDUSD', 'XPTUSD',
]);

const CRYPTO_TICKERS = new Set([
  'BTCUSD', 'ETHUSD', 'BTCUSDT', 'ETHUSDT', 'BTC', 'ETH',
  'SOLUSD', 'ADAUSD', 'XRPUSD', 'DOGEUSD', 'LTCUSD',
]);

/**
 * Detect market category from instrument ticker.
 * @param {string} instrument
 * @returns {"Forex"|"Indices"|"Metals & Energies"|"Crypto"|"Stocks"}
 */
export function detectMarket(instrument) {
  if (!instrument) return 'Forex';
  const t = String(instrument).toUpperCase().trim();
  if (INDICES_TICKERS.has(t)) return 'Indices';
  if (METALS_ENERGIES_TICKERS.has(t)) return 'Metals & Energies';
  if (CRYPTO_TICKERS.has(t)) return 'Crypto';
  // Forex heuristic: 6-letter ticker with all alphabetic chars
  if (/^[A-Z]{6}$/.test(t)) return 'Forex';
  // Default
  return 'Stocks';
}

/* ------------------------------------------------------------------ *
 *  R-multiple computation
 * ------------------------------------------------------------------ */

/**
 * Compute TP1 R-multiple from prices.
 * Buy:  (TP1 - Entry) / (Entry - Stop)
 * Sell: (Entry - TP1) / (Stop - Entry)
 */
export function computeTP1R(entry, stop, tp1, direction) {
  if (!isFinite(entry) || !isFinite(stop) || !isFinite(tp1)) return 0;
  const risk = direction === 'Buy' ? entry - stop : stop - entry;
  if (risk <= 0) return 0; // invalid setup
  const reward = direction === 'Buy' ? tp1 - entry : entry - tp1;
  return reward / risk;
}

/**
 * Compute TP2 (trailing/exit) R-multiple.
 * Same formula as TP1 but uses exitPrice.
 */
export function computeTP2R(entry, stop, exitPrice, direction) {
  return computeTP1R(entry, stop, exitPrice, direction);
}

/** Total R = 50% TP1 + 50% TP2 (matches xlsx 50/50 split). */
export function computeTotalR(tp1R, tp2R) {
  return tp1R * 0.5 + tp2R * 0.5;
}

/* ------------------------------------------------------------------ *
 *  Result classification
 * ------------------------------------------------------------------ */

/**
 * Classify trade result.
 * Winner if |TP1_R| > 0.1 AND totalR > 0
 * Loser if totalR < 0
 * else Breakeven
 */
export function classifyResult(tp1R, totalR) {
  if (Math.abs(tp1R) > 0.1 && totalR > 0) return 'Winner';
  if (totalR < 0) return 'Loser';
  return 'Breakeven';
}

/* ------------------------------------------------------------------ *
 *  Enrichment — apply all derived fields to a trade
 * ------------------------------------------------------------------ */

/**
 * Given a partial trade with prices and direction, derive all computed fields.
 * Used by the Trade Log form's smart auto-fill.
 */
export function enrichTrade(trade) {
  const { entry, stop, tp1, exitPrice, direction, instrument } = trade;
  const tp1R = computeTP1R(entry, stop, tp1, direction);
  const tp2R = computeTP2R(entry, stop, exitPrice ?? tp1, direction);
  const totalR = computeTotalR(tp1R, tp2R);
  const result = classifyResult(tp1R, totalR);
  return {
    ...trade,
    market: trade.market || detectMarket(instrument),
    tp1R,
    tp2R,
    totalR,
    result,
    isWinner: result === 'Winner' ? 1 : 0,
    nonBreakeven: result === 'Breakeven' ? 0 : 1,
  };
}

/* ------------------------------------------------------------------ *
 *  Streak counter — populated AFTER all trades are sorted
 * ------------------------------------------------------------------ */

/**
 * Walk trades sorted by close date; assign streak counter per account.
 * Streak = consecutive trades with same is-Winner flag.
 */
export function applyStreaks(trades) {
  const byAcct = {};
  // Sort by closeDate, then filledDate
  const sorted = [...trades].sort((a, b) => {
    const cmp = String(a.closeDate || '').localeCompare(String(b.closeDate || ''));
    return cmp !== 0 ? cmp : String(a.filledDate || '').localeCompare(String(b.filledDate || ''));
  });
  for (const t of sorted) {
    const acct = t.accountId;
    if (!byAcct[acct]) byAcct[acct] = { lastWinner: null, count: 0 };
    const state = byAcct[acct];
    if (state.lastWinner === t.isWinner) {
      state.count += 1;
    } else {
      state.count = 1;
      state.lastWinner = t.isWinner;
    }
    t.streak = state.count;
  }
  return sorted;
}
