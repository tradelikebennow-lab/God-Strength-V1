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
export function computeYTDGrowth(accounts, accountStats, transactions, opts = {}) {
  // Uses the SAME year as accountStats.ytdPnl (yearFilter ?? current year)
  // so the trade P&L and the flow adjustments can never mix years.
  const { yearFilter = null } = opts;
  const year = yearFilter ?? new Date().getFullYear();
  let usdYTD = 0;
  let usdBaseline = 0;

  for (const acc of accounts) {
    if (acc.status !== 'Unlocked') continue;
    const stats = accountStats[acc.id];
    if (!stats) continue;
    const fx = acc.fxRate || 1;

    // In-year flows for this account (native currency)
    let depositsInYear = 0;
    let payoutsInYear = 0;
    for (const tx of transactions) {
      if (tx.accountId !== acc.id) continue;
      if (parseInt(String(tx.date).slice(0, 4), 10) !== year) continue;
      if (tx.type === 'Deposit' || tx.type === 'Upgrade' || tx.type === 'Adjustment') {
        depositsInYear += tx.amount;
      } else if (tx.type === 'Payout' || tx.type === 'Withdrawal') {
        payoutsInYear += Math.abs(tx.amount);
      }
    }

    usdYTD += (stats.ytdPnl + payoutsInYear) * fx;
    // True year-start balance: back out this year's trade P&L AND flows.
    // currentBalance = yearStart + ytdPnl + deposits − payouts
    usdBaseline += (stats.currentBalance - stats.ytdPnl - depositsInYear + payoutsInYear) * fx;
  }

  const ytdPct = usdBaseline > 0 ? usdYTD / usdBaseline : 0;
  return { usdYTD, ytdPct };
}

/**
 * Portfolio TWR (Time-Weighted Return).
 * For each chronological trade, factor = 1 + (pnl / balanceBefore).
 * Portfolio TWR = PRODUCT(factors) - 1.
 * Deposits/payouts are excluded from factors (they adjust balance but not return).
 */
export function computePortfolioTWR(accounts, trades, transactions, opts = {}) {
  const { yearFilter = null } = opts;
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  // Build a chronological event stream across ALL accounts (USD-normalized).
  // Locked accounts stay in history — locking an account must not
  // retroactively erase its trades (survivorship bias).
  // rank orders same-date events: capital(0) → flows(1) → trades(2),
  // so money is in the denominator before the day's returns apply.
  const events = [];
  for (const t of trades) {
    const acc = acctById[t.accountId];
    if (!acc) continue;
    events.push({
      date: t.closeDate || t.filledDate,
      kind: 'trade',
      rank: 2,
      accountId: t.accountId,
      usdAmount: (t.totalPnl || 0) * (acc.fxRate || 1),
      ref: t,
    });
  }
  for (const tx of transactions) {
    const acc = acctById[tx.accountId];
    if (!acc) continue;
    if (tx.type === 'Deposit') {
      events.push({
        date: tx.date,
        kind: 'deposit',
        rank: 1,
        accountId: tx.accountId,
        usdAmount: tx.amount * (acc.fxRate || 1),
      });
    } else if (tx.type === 'Payout' || tx.type === 'Withdrawal') {
      events.push({
        date: tx.date,
        kind: 'payout',
        rank: 1,
        accountId: tx.accountId,
        usdAmount: -Math.abs(tx.amount * (acc.fxRate || 1)),
      });
    } else if (tx.type === 'Adjustment' || tx.type === 'Upgrade') {
      // Treat as flow not affecting return
      events.push({
        date: tx.date,
        kind: 'adjustment',
        rank: 1,
        accountId: tx.accountId,
        usdAmount: tx.amount * (acc.fxRate || 1),
      });
    }
  }

  // Time-aware capital base: each account's initialBalance enters as a
  // flow on the date of its FIRST event, not on day zero. Accounts that
  // were funded later no longer dilute early trade factors. Accounts
  // with no events contribute no capital (they never traded).
  const firstEventDate = {};
  for (const ev of events) {
    if (!firstEventDate[ev.accountId] || dateSort(ev.date, firstEventDate[ev.accountId]) < 0) {
      firstEventDate[ev.accountId] = ev.date;
    }
  }
  for (const acc of accounts) {
    const d = firstEventDate[acc.id];
    if (!d) continue;
    events.push({
      date: d,
      kind: 'capital',
      rank: 0,
      accountId: acc.id,
      usdAmount: (acc.initialBalance || 0) * (acc.fxRate || 1),
    });
  }

  events.sort((a, b) => dateSort(a.date, b.date) || a.rank - b.rank);

  let bal = 0;
  let twr = 1;
  let startBal = 0; // balance entering the filter scope (pre-year state)
  let seenInScope = false;
  const points = [];
  for (const ev of events) {
    const inScope = !yearFilter || dateYear(ev.date) === yearFilter;
    if (!inScope) {
      // Outside the filter year: events adjust balance but never the TWR.
      bal += ev.usdAmount;
      if (!seenInScope) startBal = bal;
      continue;
    }
    seenInScope = true;
    if (ev.kind === 'trade') {
      if (bal > 0) {
        const factor = 1 + ev.usdAmount / bal;
        twr *= factor;
      }
      bal += ev.usdAmount;
      points.push({ date: ev.date, balance: bal, twr: twr - 1, flow: 0 });
    } else {
      // capital / deposit / payout / adjustment — a flow, not a return.
      bal += ev.usdAmount;
      points.push({ date: ev.date, balance: bal, twr: twr - 1, flow: ev.usdAmount });
    }
  }

  // Synthetic start point carries the balance at scope entry as a "flow"
  // so drawdown walks seed their peak correctly (incl. under a year filter).
  const curve = [{ date: null, balance: startBal, twr: 0, flow: startBal }, ...points];

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
    const baseRisk = acc.riskPct || 0.01; // 1% default, matches account.js / discipline.js
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
  if (curve.length === 0) return { maxDD: 0, currentDD: 0, curve };

  // Flow-neutralized drawdown (mirrors buildBalanceTimeline in account.js):
  // deposits/capital raise the peak, payouts lower it — cash moving in or
  // out of the portfolio is NOT a drawdown or a recovery.
  let peak = 0;
  let maxDD = 0;
  let lastDD = 0;
  for (const p of curve) {
    peak += p.flow || 0;
    if (p.balance > peak) peak = p.balance;
    const dd = peak > 0 ? (p.balance - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
    lastDD = dd;
  }
  return { maxDD, currentDD: lastDD, curve };
}

/**
 * Portfolio Calmar.
 */
export function computePortfolioCalmar(accounts, trades, transactions, accountStats, opts = {}) {
  const { yearFilter = null } = opts;
  const { maxDD } = computePortfolioDD(accounts, trades, transactions, { yearFilter });
  if (Math.abs(maxDD) === 0) return 0;

  // Annualization — day span of in-scope trades (all accounts; Locked
  // history is included, consistent with computePortfolioTWR).
  const acctIds = new Set(accounts.map((a) => a.id));
  const scopedTrades = trades.filter((t) => {
    if (!acctIds.has(t.accountId)) return false;
    if (yearFilter && dateYear(t.closeDate || t.filledDate) !== yearFilter) return false;
    return true;
  });
  if (!scopedTrades.length) return 0;
  const sorted = [...scopedTrades].sort((a, b) =>
    dateSort(a.closeDate || a.filledDate, b.closeDate || b.filledDate)
  );
  const last = sorted[sorted.length - 1];
  const days = Math.max(
    1,
    dateDiffDays(sorted[0].closeDate || sorted[0].filledDate, last.closeDate || last.filledDate)
  );

  // Period return = TWR over the same scope. TWR is flow-aware by
  // construction, so payouts/deposits can no longer distort the numerator.
  const periodReturn = computePortfolioTWR(accounts, trades, transactions, { yearFilter }).twr;
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
  const ytd = computeYTDGrowth(scopeAccounts, scopeStats, scopeTx, { yearFilter });
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
