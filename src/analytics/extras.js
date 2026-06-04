// src/analytics/extras.js
import { dateYear, dateMonth, dateSort, dateDiffDays, dayOfWeek, DOW_NAMES } from '../utils/dates.js';

/* ------------------------------------------------------------------ *
 *  Market Zone Sizes by Timeframe
 *  Avg distance from entry to stop, in pips (Forex) or points (Indices/Metals).
 * ------------------------------------------------------------------ */

function pipsOrPoints(trade) {
  const { market, entry, stop, instrument } = trade;
  if (!isFinite(entry) || !isFinite(stop)) return 0;
  const dist = Math.abs(entry - stop);
  if (market === 'Forex') {
    // JPY pairs: 1 pip = 0.01, others: 1 pip = 0.0001
    const inst = String(instrument).toUpperCase();
    const pipSize = inst.endsWith('JPY') ? 0.01 : 0.0001;
    return dist / pipSize;
  }
  // Indices, Metals, etc: raw points
  return dist;
}

export function marketZoneSizes(trades, filters = {}) {
  const filtered = trades.filter((t) => {
    if (filters.year && dateYear(t.closeDate || t.filledDate) !== filters.year) return false;
    return true;
  });
  const buckets = {};
  for (const t of filtered) {
    const key = `${t.market}|${t.timeframe}`;
    if (!buckets[key]) buckets[key] = { market: t.market, timeframe: t.timeframe, total: 0, count: 0 };
    buckets[key].total += pipsOrPoints(t);
    buckets[key].count += 1;
  }
  return Object.values(buckets)
    .map((b) => ({
      market: b.market,
      timeframe: b.timeframe,
      avgZoneSize: b.count ? b.total / b.count : 0,
      sampleSize: b.count,
    }))
    .sort((a, b) => {
      if (a.market !== b.market) return a.market.localeCompare(b.market);
      return a.timeframe.localeCompare(b.timeframe);
    });
}

/* ------------------------------------------------------------------ *
 *  Concurrent open trades — max + avg
 * ------------------------------------------------------------------ */

export function concurrentTrades(trades, filters = {}) {
  const filtered = trades.filter((t) => {
    if (filters.year && dateYear(t.filledDate) !== filters.year) return false;
    return true;
  });
  if (!filtered.length) return { max: 0, avg: 0 };

  // For each calendar day from first open to last close, count how many trades are open
  const firstOpen = filtered.reduce((a, t) => (t.filledDate < a ? t.filledDate : a), filtered[0].filledDate);
  const lastClose = filtered.reduce(
    (a, t) => ((t.closeDate || t.filledDate) > a ? t.closeDate || t.filledDate : a),
    filtered[0].closeDate || filtered[0].filledDate
  );
  const totalDays = dateDiffDays(firstOpen, lastClose) + 1;
  if (totalDays <= 0) return { max: 0, avg: 0 };

  // Build per-day open count via running sweep with day granularity
  // Open trades on day D = filledDate <= D AND closeDate >= D
  // Quick approach: sort by filledDate, then iterate days
  let max = 0;
  let totalOpen = 0;
  let activeDays = 0;
  // For efficiency, use interval counting via sweep
  const events = [];
  for (const t of filtered) {
    events.push({ date: t.filledDate, delta: +1 });
    events.push({ date: t.closeDate || t.filledDate, delta: -1, isClose: true });
  }
  // Sort: same-day opens before closes (so peak is captured)
  events.sort((a, b) => {
    const cmp = dateSort(a.date, b.date);
    if (cmp !== 0) return cmp;
    return a.delta > b.delta ? -1 : 1;
  });

  // Walk day by day from firstOpen to lastClose
  let evIdx = 0;
  let open = 0;
  // Iterate calendar days
  const startEpoch = Date.parse(firstOpen + 'T12:00:00Z');
  for (let i = 0; i < totalDays; i++) {
    const dayMs = startEpoch + i * 86400000;
    const dayISO = new Date(dayMs).toISOString().slice(0, 10);
    // Process opens on this day (delta +1)
    while (evIdx < events.length && events[evIdx].date === dayISO && events[evIdx].delta > 0) {
      open += events[evIdx].delta;
      evIdx++;
    }
    if (open > max) max = open;
    if (open > 0) {
      totalOpen += open;
      activeDays++;
    }
    // Process closes for this day (delta -1) — close at end of day
    while (evIdx < events.length && events[evIdx].date === dayISO && events[evIdx].delta < 0) {
      open += events[evIdx].delta;
      evIdx++;
    }
  }

  const avg = activeDays > 0 ? totalOpen / activeDays : 0;
  return { max, avg };
}

/* ------------------------------------------------------------------ *
 *  Pepperstone projected year-end balance
 *  Component model: current_balance * (1 + avg_monthly_return)^months_remaining
 * ------------------------------------------------------------------ */

export function projectedYearEndBalance(account, monthlyGrid, year) {
  if (!monthlyGrid?.months?.length) return null;
  const now = new Date();
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 12;
  const monthsPassed = Math.max(1, currentMonth);
  const monthsRemaining = 12 - monthsPassed;

  // Avg monthly TWR from months that have data
  const activeMonths = monthlyGrid.months.filter((m) => m.month <= currentMonth && (m.trades > 0));
  if (!activeMonths.length) return null;
  const avgMonthlyTwr = activeMonths.reduce((s, m) => s + m.twr, 0) / activeMonths.length;

  // Use account's current balance as starting point — need lookup via stats
  // The caller passes account stats with currentBalance
  if (!account.currentBalance) return null;
  const projected = account.currentBalance * Math.pow(1 + avgMonthlyTwr, monthsRemaining);
  return {
    currentBalance: account.currentBalance,
    avgMonthlyTwr,
    monthsRemaining,
    projectedYearEnd: projected,
  };
}

/* ------------------------------------------------------------------ *
 *  Payout projection (5-component model, mirrors xlsx)
 * ------------------------------------------------------------------ */

export function payoutProjection(account, transactions, year) {
  const accTx = transactions.filter((t) => t.accountId === account.id && t.type === 'Payout');
  const yearTx = accTx.filter((t) => dateYear(t.date) === year);
  if (!yearTx.length) {
    return {
      netBanked: 0,
      avgMonthlyGross: 0,
      futureSplitShare: 1 - (account.payoutSplit || 0),
      futureNet: 0,
      total: 0,
      monthsPassed: 0,
      monthsRemaining: 12,
    };
  }
  // Net banked = sum of (gross * (1 - split)) — note the split STORED is trader's share
  // From xlsx context, split column = profit split that ACCOUNT keeps (e.g. 0.25 = trader gets 25%)
  // So trader's banked = amount * profitSplit, OR amount * (1 - profitSplit)?
  // Looking at xlsx: payout 1453 with split 0.25 → net banked tracking shows 4102.45 total.
  // Treating "amount" as gross payout and "(1 - split)" as platform's share gives trader = amount * (1 - split)
  // But sample shows: payout amounts 1453 + 2562 + 1364 = 5379 total gross
  // xlsx C48 = "Net Banked (YTD)" = 4102.45 — which is NOT 5379*0.75 or *0.25
  // Looking more carefully at R8 (1453, split 0.25) and R16 (1364, split 0.20):
  //   1453 * (1 - 0.25) = 1089.75
  //   2562 * (1 - 0.25) = 1921.50
  //   1364 * (1 - 0.20) = 1091.20
  //   sum = 4102.45 ✓
  // So formula: trader_keeps = amount * (1 - split). The "split" field is platform's cut.
  const netBanked = yearTx.reduce((s, t) => s + t.amount * (1 - (t.profitSplit || 0)), 0);
  const grossTotal = yearTx.reduce((s, t) => s + t.amount, 0);

  // Months passed = month of the most recent payout (xlsx logic)
  // Avg = grossTotal / monthsPassed where monthsPassed = month number of last payout
  const sortedByDate = [...yearTx].sort((a, b) => dateSort(a.date, b.date));
  const lastPayoutMonth = dateMonth(sortedByDate[sortedByDate.length - 1].date);
  const monthsPassed = lastPayoutMonth;
  const monthsRemaining = 12 - monthsPassed;

  const avgMonthlyGross = monthsPassed > 0 ? grossTotal / monthsPassed : 0;
  const mostRecentSplit = sortedByDate[sortedByDate.length - 1]?.profitSplit ?? 0;
  const futureSplitShare = 1 - mostRecentSplit;
  const futureNet = avgMonthlyGross * futureSplitShare * monthsRemaining;
  const total = netBanked + futureNet;

  return {
    netBanked,
    avgMonthlyGross,
    futureSplitShare,
    futureNet,
    total,
    monthsPassed,
    monthsRemaining,
  };
}

/* ------------------------------------------------------------------ *
 *  R-multiple distribution histogram
 * ------------------------------------------------------------------ */

const R_BUCKETS = [
  { label: '< -2R', min: -Infinity, max: -2 },
  { label: '-2 to -1R', min: -2, max: -1 },
  { label: '-1 to 0R', min: -1, max: 0 },
  { label: '0 to 1R', min: 0, max: 1 },
  { label: '1 to 2R', min: 1, max: 2 },
  { label: '2 to 3R', min: 2, max: 3 },
  { label: '3 to 4R', min: 3, max: 4 },
  { label: '4R+', min: 4, max: Infinity },
];

export function rDistribution(trades, filters = {}) {
  const filtered = trades.filter((t) => {
    if (filters.year && dateYear(t.closeDate || t.filledDate) !== filters.year) return false;
    if (filters.accountId && t.accountId !== filters.accountId) return false;
    return true;
  });
  return R_BUCKETS.map((b) => {
    const count = filtered.filter((t) => t.totalR >= b.min && t.totalR < b.max).length;
    return { label: b.label, count };
  });
}

/* ------------------------------------------------------------------ *
 *  Day-of-week performance
 * ------------------------------------------------------------------ */

export function dayOfWeekStats(trades, filters = {}) {
  const filtered = trades.filter((t) => {
    if (filters.year && dateYear(t.closeDate || t.filledDate) !== filters.year) return false;
    if (filters.accountId && t.accountId !== filters.accountId) return false;
    return true;
  });
  const result = [];
  // Mon..Fri (1..5); skip weekends generally
  for (let d = 1; d <= 5; d++) {
    const dayTrades = filtered.filter((t) => dayOfWeek(t.filledDate) === d);
    const winners = dayTrades.filter((t) => t.result === 'Winner');
    const nonBE = dayTrades.filter((t) => t.nonBreakeven === 1);
    result.push({
      day: DOW_NAMES[d],
      trades: dayTrades.length,
      winRate: nonBE.length ? winners.length / nonBE.length : 0,
      totalR: dayTrades.reduce((s, t) => s + t.totalR, 0),
      avgR: dayTrades.length ? dayTrades.reduce((s, t) => s + t.totalR, 0) / dayTrades.length : 0,
    });
  }
  return result;
}

/* ------------------------------------------------------------------ *
 *  Hold time vs R correlation (scatter data)
 * ------------------------------------------------------------------ */

export function holdTimeVsR(trades, filters = {}) {
  const filtered = trades.filter((t) => {
    if (filters.year && dateYear(t.closeDate || t.filledDate) !== filters.year) return false;
    if (filters.accountId && t.accountId !== filters.accountId) return false;
    return true;
  });
  return filtered
    .map((t) => ({
      days: dateDiffDays(t.filledDate, t.closeDate),
      r: t.totalR,
      result: t.result,
      instrument: t.instrument,
    }))
    .filter((p) => p.days >= 0);
}
