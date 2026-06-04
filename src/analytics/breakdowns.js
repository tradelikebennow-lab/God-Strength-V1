// src/analytics/breakdowns.js
import { matchesStrategy } from './account.js';
import { dateYear } from '../utils/dates.js';

const STRATEGIES = ['Swing 4H / Daily', 'Swing Daily / Weekly', 'Intraday 15 min / 1H', 'Intraday 5 min'];

/** Generic groupBy-with-stats helper. */
function statsForGroup(trades) {
  if (!trades.length) {
    return {
      count: 0,
      winners: 0,
      losers: 0,
      breakevens: 0,
      nonBE: 0,
      winRateExBE: 0,
      winRateAll: 0,
      totalR: 0,
      totalPnl: 0,
      profitFactor: 0,
      expectancy: 0,
      expectancyDollar: 0,
    };
  }
  const winners = trades.filter((t) => t.result === 'Winner');
  const losers = trades.filter((t) => t.result === 'Loser');
  const breakevens = trades.filter((t) => t.result === 'Breakeven');
  const nonBE = trades.filter((t) => t.nonBreakeven === 1);
  const grossWin = winners.reduce((s, t) => s + t.totalPnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.totalPnl, 0));
  return {
    count: trades.length,
    winners: winners.length,
    losers: losers.length,
    breakevens: breakevens.length,
    nonBE: nonBE.length,
    winRateExBE: nonBE.length ? winners.length / nonBE.length : 0,
    winRateAll: trades.length ? winners.length / trades.length : 0,
    totalR: trades.reduce((s, t) => s + (t.totalR || 0), 0),
    totalPnl: trades.reduce((s, t) => s + (t.totalPnl || 0), 0),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    expectancy: trades.length ? trades.reduce((s, t) => s + t.totalR, 0) / trades.length : 0,
    expectancyDollar: trades.length ? trades.reduce((s, t) => s + t.totalPnl, 0) / trades.length : 0,
  };
}

function applyFilters(trades, { accountId, year, strategy, month }) {
  return trades.filter((t) => {
    if (accountId && t.accountId !== accountId) return false;
    if (year && dateYear(t.closeDate || t.filledDate) !== year) return false;
    if (strategy && !matchesStrategy(t.timeframe, strategy)) return false;
    if (month && parseInt(String(t.closeDate || t.filledDate).slice(5, 7), 10) !== month) return false;
    return true;
  });
}

/** Strategy breakdown — by canonical strategy bucket. */
export function byStrategy(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  const result = {};
  for (const s of STRATEGIES) {
    const group = filtered.filter((t) => matchesStrategy(t.timeframe, s));
    result[s] = statsForGroup(group);
  }
  // Also aggregate parent "Swing" and "Intraday" buckets
  result['Swing'] = statsForGroup(filtered.filter((t) => matchesStrategy(t.timeframe, 'Swing')));
  result['Intraday'] = statsForGroup(filtered.filter((t) => matchesStrategy(t.timeframe, 'Intraday')));
  return result;
}

export function byDirection(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  return {
    Buy: statsForGroup(filtered.filter((t) => t.direction === 'Buy')),
    Sell: statsForGroup(filtered.filter((t) => t.direction === 'Sell')),
  };
}

export function byTradeType(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  return {
    Trend: statsForGroup(filtered.filter((t) => t.tradeType === 'Trend')),
    Counter: statsForGroup(filtered.filter((t) => t.tradeType === 'Counter')),
    Sideways: statsForGroup(filtered.filter((t) => t.tradeType === 'Sideways')),
    Anticipatory: statsForGroup(filtered.filter((t) => t.tradeType === 'Anticipatory')),
  };
}

export function byLOIFreshness(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  return {
    Yes: statsForGroup(filtered.filter((t) => t.loiFreshness === 'Yes')),
    No: statsForGroup(filtered.filter((t) => t.loiFreshness === 'No')),
  };
}

export function byLOL(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  return {
    Yes: statsForGroup(filtered.filter((t) => t.lol === 'Yes')),
    No: statsForGroup(filtered.filter((t) => t.lol === 'No')),
  };
}

export function byMarket(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  const markets = new Set(filtered.map((t) => t.market));
  const result = {};
  for (const m of markets) {
    result[m] = statsForGroup(filtered.filter((t) => t.market === m));
  }
  return result;
}

export function byInstrument(trades, filters = {}) {
  const filtered = applyFilters(trades, filters);
  const instruments = new Set(filtered.map((t) => t.instrument));
  const result = {};
  for (const i of instruments) {
    result[i] = statsForGroup(filtered.filter((t) => t.instrument === i));
  }
  // Sort by totalPnl desc when consumed
  return result;
}

/** All-accounts comparison — one row per account, with a specific strategy filter. */
export function allAccountsComparison(accounts, trades, transactions, filters = {}) {
  const result = [];
  for (const acc of accounts) {
    const filtered = applyFilters(trades, { ...filters, accountId: acc.id });
    const stats = statsForGroup(filtered);
    result.push({
      accountId: acc.id,
      accountName: acc.name,
      ...stats,
    });
  }
  return result;
}
