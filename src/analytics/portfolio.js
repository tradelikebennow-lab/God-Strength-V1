// src/analytics/portfolio.js
import { computeAccountStats } from './account.js';
import { dateSort, dateYear, dateDiffDays } from '../utils/dates.js';

/**
 * Portfolio value = SUM(currentBalance * fxRate) for UNLOCKED accounts only.
 */
export function computePortfolioValue(accounts, accountStats) {
  let usdTotal = 0;
  for (const acc of accounts) {
    if (acc.status !== 'Unlocked') continue;
    const stats = accountStats[acc.id];
    if (!stats) continue;
    usdTotal += stats.currentBalance * (acc.fxRate || 1);
  }
  return usdTotal;
}

/**
 * Total deposits + payouts across all live (unlocked) accounts, converted to USD.
 */
export function aggregateFlows(accounts, transactions) {
  let totalDeposits = 0;
  let totalPayouts = 0;
  const byAcct = Object.fromEntries(accounts.map((a) => [a.id, a]));
  for (const tx of transactions) {
    const acc = byAcct[tx.accountId];
    if (!acc) continue;
    const usdAmount = tx.amount * (acc.fxRate || 1);
    if (tx.type === 'Deposit') totalDeposits += usdAmount;
    if (tx.type === 'Payout') totalPayouts += usdAmount;
  }
  return { totalDeposits, totalPayouts };
}

/**
 * YTD growth (USD): sum of YTD PnL + payouts (cash withdrawn) across unlocked accounts, FX-corrected.
 * Payouts taken count as portfolio growth because they're realized profit.
 */
export function computeYTDGrowth(accounts, accountStats, transactions) {
  let usdYTD = 0;
  let usdBaseline = 0;
  const byAcct = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const currentYear = new Date().getFullYear();

  for (const acc of accounts) {
    if (acc.status !== 'Unlocked') continue;
    const stats = accountStats[acc.id];
    if (!stats) continue;
    usdYTD += stats.ytdPnl * (acc.fxRate || 1);
    // Year-start balance approximation: currentBalance - ytdPnl (in native), then FX
    usdBaseline += (stats.currentBalance - stats.ytdPnl) * (acc.fxRate || 1);
  }

  // Add payouts taken this year — they're realized profit, count toward growth
  for (const tx of transactions) {
    const acc = byAcct[tx.accountId];
    if (!acc || acc.status !== 'Unlocked') continue;
    if (tx.type !== 'Payout') continue;
    if (parseInt(String(tx.date).slice(0, 4), 10) !== currentYear) continue;
    usdYTD += tx.amount * (acc.fxRate || 1);
  }

  const ytdPct = usdBaseline > 0 ? usdYTD / usdBaseline : 0;
  return { usdYTD, ytdPct };
}

/**
 * Portfolio TWR (Time-Weighted Return).
 * For each chronological trade, factor = 1 + (pnl / balanceBefore).
 * Portfolio TWR = PRODUCT(factors) - 1.
 * Deposits/payouts are excluded from factors (they adjust balance but not return).
 *
 * Computed at portfolio level by walking all unlocked-account trades sorted by date,
 * and using PORTFOLIO balance before each trade.
 */
export function computePortfolioTWR(accounts, trades, transactions, opts = {}) {
  const { yearFilter = null } = opts;
  const unlockedIds = new Set(accounts.filter((a) => a.status === 'Unlocked').map((a) => a.id));
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  // Build a chronological event stream across all unlocked accounts (USD-normalized)
  const events = [];
  for (const t of trades) {
    if (!unlockedIds.has(t.accountId)) continue;
    const acc = acctById[t.accountId];
    events.push({
      date: t.closeDate || t.filledDate,
      kind: 'trade',
      accountId: t.accountId,
      usdAmount: (t.totalPnl || 0) * (acc.fxRate || 1),
      ref: t,
    });
  }
  for (const tx of transactions) {
    if (!unlockedIds.has(tx.accountId)) continue;
    const acc = acctById[tx.accountId];
    if (tx.type === 'Deposit') {
      events.push({
        date: tx.date,
        kind: 'deposit',
        accountId: tx.accountId,
        usdAmount: tx.amount * (acc.fxRate || 1),
      });
    } else if (tx.type === 'Payout' || tx.type === 'Withdrawal') {
      events.push({
        date: tx.date,
        kind: 'payout',
        accountId: tx.accountId,
        usdAmount: -Math.abs(tx.amount * (acc.fxRate || 1)),
      });
    } else if (tx.type === 'Adjustment' || tx.type === 'Upgrade') {
      // Treat as flow not affecting return
      events.push({
        date: tx.date,
        kind: 'adjustment',
        accountId: tx.accountId,
        usdAmount: tx.amount * (acc.fxRate || 1),
      });
    }
  }
  events.sort((a, b) => dateSort(a.date, b.date));

  // Starting USD balance = sum of initial balances of unlocked accounts, FX-corrected
  let bal = 0;
  for (const acc of accounts) {
    if (acc.status === 'Unlocked') bal += acc.initialBalance * (acc.fxRate || 1);
  }

  let twr = 1;
  const curve = [{ date: null, balance: bal, twr: 0 }];
  for (const ev of events) {
    if (yearFilter && dateYear(ev.date) !== yearFilter) {
      // Apply flows only to balance, not yearly twr scoping
      if (ev.kind === 'trade') bal += ev.usdAmount;
      else bal += ev.usdAmount;
      continue;
    }
    if (ev.kind === 'trade') {
      if (bal > 0) {
        const factor = 1 + ev.usdAmount / bal;
        twr *= factor;
      }
      bal += ev.usdAmount;
    } else {
      bal += ev.usdAmount;
    }
    curve.push({ date: ev.date, balance: bal, twr: twr - 1 });
  }

  return { twr: twr - 1, curve, finalBalance: bal };
}

/**
 * Weighted Portfolio R: sum of (totalR * tradeRisk/accountBaseRisk) for all trades.
 * Normalizes R across different risk percentages.
 */
export function computeWeightedR(accounts, trades) {
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  let weighted = 0;
  for (const t of trades) {
    const acc = acctById[t.accountId];
    if (!acc) continue;
    const baseRisk = acc.riskPct || 1;
    const tradeRisk = t.riskPct || baseRisk;
    weighted += (t.totalR || 0) * (tradeRisk / baseRisk);
  }
  return weighted;
}

/**
 * Portfolio Max DD — walk USD-normalized portfolio balance curve.
 */
export function computePortfolioDD(accounts, trades, transactions, opts = {}) {
  const { yearFilter = null } = opts;
  const result = computePortfolioTWR(accounts, trades, transactions, { yearFilter });
  const curve = result.curve;
  // The synthetic start point (date: null) carries the all-time initial
  // balance — exclude it under a year filter so pre-year P&L doesn't
  // register as drawdown (or mask it).
  const pts = yearFilter ? curve.filter((p) => p.date !== null) : curve;
  if (pts.length === 0) return { maxDD: 0, currentDD: 0, curve };
  let peak = pts[0].balance || 0;
  let maxDD = 0;
  for (const p of pts) {
    if (p.balance > peak) peak = p.balance;
    const dd = peak > 0 ? (p.balance - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }
  const currentDD = peak > 0 ? (pts[pts.length - 1].balance - peak) / peak : 0;
  return { maxDD, currentDD, curve };
}

/**
 * Portfolio Calmar.
 */
export function computePortfolioCalmar(accounts, trades, transactions, accountStats, opts = {}) {
  const { yearFilter = null } = opts;
  const { maxDD } = computePortfolioDD(accounts, trades, transactions, { yearFilter });
  if (Math.abs(maxDD) === 0) return 0;

  // Annualization — day span of in-scope trades
  const scopedTrades = trades.filter((t) => {
    const acc = accounts.find((a) => a.id === t.accountId);
    if (!acc || acc.status !== 'Unlocked') return false;
    if (yearFilter && dateYear(t.closeDate || t.filledDate) !== yearFilter) return false;
    return true;
  });
  if (!scopedTrades.length) return 0;
  const sorted = [...scopedTrades].sort((a, b) =>
    dateSort(a.closeDate || a.filledDate, b.closeDate || b.filledDate)
  );
  const days = Math.max(
    1,
    dateDiffDays(sorted[0].closeDate || sorted[0].filledDate, sorted[sorted.length - 1].closeDate)
  );

  let periodReturn;
  if (yearFilter) {
    periodReturn = computePortfolioTWR(accounts, trades, transactions, { yearFilter }).twr;
  } else {
    const portfolioValue = computePortfolioValue(accounts, accountStats);
    const { totalDeposits } = aggregateFlows(accounts, transactions);
    let totalInitial = 0;
    for (const acc of accounts) {
      if (acc.status === 'Unlocked') totalInitial += acc.initialBalance * (acc.fxRate || 1);
    }
    const pnl = portfolioValue - totalInitial - totalDeposits;
    periodReturn = totalInitial > 0 ? pnl / totalInitial : 0;
  }
  return (periodReturn * (365 / days)) / Math.abs(maxDD);
}

/**
 * One-stop portfolio metrics object.
 */
export function computePortfolioMetrics(accounts, trades, transactions, opts = {}) {
  const { yearFilter = null, strategyFilter = null, accountFilter = null } = opts;
  // accountStats always covers ALL accounts — the Balances and Breach panels
  // iterate every account regardless of filters.
  const accountStats = {};
  for (const acc of accounts) {
    accountStats[acc.id] = computeAccountStats(acc, trades, transactions, {
      yearFilter,
      strategyFilter,
    });
  }

  // Scope for portfolio-level metrics. When a single account is selected,
  // portfolio metrics collapse to that account. The account is coerced to
  // 'Unlocked' inside the scope so Locked challenge accounts still show
  // their own numbers when explicitly selected.
  let scopeAccounts = accounts;
  let scopeTrades = trades;
  let scopeTx = transactions;
  let scopeStats = accountStats;
  if (accountFilter) {
    scopeAccounts = accounts
      .filter((a) => a.id === accountFilter)
      .map((a) => ({ ...a, status: 'Unlocked' }));
    scopeTrades = trades.filter((t) => t.accountId === accountFilter);
    scopeTx = transactions.filter((t) => t.accountId === accountFilter);
    scopeStats = { [accountFilter]: accountStats[accountFilter] };
  }

  const portfolioValue = computePortfolioValue(scopeAccounts, scopeStats);
  const ytd = computeYTDGrowth(scopeAccounts, scopeStats, scopeTx);
  const flows = aggregateFlows(scopeAccounts, scopeTx);
  const twr = computePortfolioTWR(scopeAccounts, scopeTrades, scopeTx, { yearFilter });
  const dd = computePortfolioDD(scopeAccounts, scopeTrades, scopeTx, { yearFilter });
  const calmar = computePortfolioCalmar(scopeAccounts, scopeTrades, scopeTx, scopeStats, { yearFilter });
  const weightedR = computeWeightedR(
    scopeAccounts,
    yearFilter
      ? scopeTrades.filter((t) => dateYear(t.closeDate || t.filledDate) === yearFilter)
      : scopeTrades
  );

  return {
    portfolioValue,
    ytdGrowthUsd: ytd.usdYTD,
    ytdGrowthPct: ytd.ytdPct,
    ytdTwr: twr.twr,
    twrCurve: twr.curve,
    totalDeposits: flows.totalDeposits,
    totalPayouts: flows.totalPayouts,
    maxDD: dd.maxDD,
    currentDD: dd.currentDD,
    calmar,
    weightedR,
    accountStats,
  };
}
