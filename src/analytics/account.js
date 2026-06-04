// src/analytics/account.js
import { dateSort, dateDiffDays, dateYear } from '../utils/dates.js';

/**
 * Build per-trade balance timeline for one account, neutralizing deposits/payouts for DD.
 *
 * Balance includes all flows (trades + deposits + payouts).
 * "Peak" tracks rolling high water; on payout we subtract the payout amount from peak
 * so the cash-out doesn't register as drawdown.
 *
 * @returns {Array<{date, type, amount, balance, peak, dd}>}
 */
export function buildBalanceTimeline(account, trades, transactions) {
  const accTrades = trades
    .filter((t) => t.accountId === account.id)
    .map((t) => ({
      date: t.closeDate || t.filledDate,
      type: 'Trade',
      amount: t.totalPnl,
      ref: t,
    }));
  const accTx = transactions
    .filter((t) => t.accountId === account.id)
    .map((t) => ({
      date: t.date,
      type: t.type,
      amount: t.amount,
      ref: t,
    }));
  const events = [...accTrades, ...accTx].sort((a, b) => dateSort(a.date, b.date));

  let bal = account.initialBalance;
  let peak = bal;
  const timeline = [];
  for (const ev of events) {
    if (ev.type === 'Trade') {
      bal += ev.amount;
    } else if (ev.type === 'Deposit') {
      bal += ev.amount;
      peak += ev.amount; // deposits raise the floor for DD calc
    } else if (ev.type === 'Payout' || ev.type === 'Withdrawal') {
      bal -= Math.abs(ev.amount);
      peak -= Math.abs(ev.amount); // payouts lower the peak — they're not drawdown
    } else if (ev.type === 'Upgrade') {
      // Upgrades reset tier but don't change balance directly in our model
      // unless an amount is provided; treat amount as deposit-equivalent
      bal += ev.amount;
      peak += ev.amount;
    } else if (ev.type === 'Adjustment') {
      bal += ev.amount;
      peak += ev.amount;
    }
    if (bal > peak) peak = bal;
    const dd = peak > 0 ? (bal - peak) / peak : 0;
    timeline.push({
      date: ev.date,
      type: ev.type,
      amount: ev.amount,
      balance: bal,
      peak,
      dd,
    });
  }
  return timeline;
}

/**
 * Per-account stats for a filtered slice of trades.
 * filter: optional fn(trade) -> bool
 */
export function computeAccountStats(account, trades, transactions, opts = {}) {
  const { yearFilter = null, strategyFilter = null } = opts;

  const allTrades = trades.filter((t) => t.accountId === account.id);
  const filteredTrades = allTrades.filter((t) => {
    if (yearFilter && dateYear(t.closeDate || t.filledDate) !== yearFilter) return false;
    if (strategyFilter && !matchesStrategy(t.timeframe, strategyFilter)) return false;
    return true;
  });

  const timeline = buildBalanceTimeline(account, allTrades, transactions);
  const currentBalance = timeline.length ? timeline[timeline.length - 1].balance : account.initialBalance;

  // Max DD across full timeline (not just filtered)
  let maxDD = 0;
  for (const p of timeline) {
    if (p.dd < maxDD) maxDD = p.dd;
  }
  const currentDD = timeline.length ? timeline[timeline.length - 1].dd : 0;

  // Trade-level stats on filtered set
  const winners = filteredTrades.filter((t) => t.result === 'Winner');
  const losers = filteredTrades.filter((t) => t.result === 'Loser');
  const breakevens = filteredTrades.filter((t) => t.result === 'Breakeven');
  const nonBE = filteredTrades.filter((t) => t.nonBreakeven === 1);

  const totalPnl = filteredTrades.reduce((s, t) => s + (t.totalPnl || 0), 0);
  const totalR = filteredTrades.reduce((s, t) => s + (t.totalR || 0), 0);

  const grossWin = winners.reduce((s, t) => s + (t.totalPnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.totalPnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);

  const avgWin = winners.length ? grossWin / winners.length : 0;
  const avgLoss = losers.length ? -grossLoss / losers.length : 0;
  const avgWinR = winners.length ? winners.reduce((s, t) => s + t.totalR, 0) / winners.length : 0;
  const avgLossR = losers.length ? losers.reduce((s, t) => s + t.totalR, 0) / losers.length : 0;

  const winRateExBE = nonBE.length ? winners.length / nonBE.length : 0;
  const winRateAll = filteredTrades.length ? winners.length / filteredTrades.length : 0;

  const expectancyR = filteredTrades.length ? totalR / filteredTrades.length : 0;
  const expectancyDollar = filteredTrades.length ? totalPnl / filteredTrades.length : 0;

  const largestWin = winners.length ? Math.max(...winners.map((t) => t.totalPnl)) : 0;
  const largestLoss = losers.length ? Math.min(...losers.map((t) => t.totalPnl)) : 0;

  // Holding time
  const holdDays = filteredTrades
    .map((t) => dateDiffDays(t.filledDate, t.closeDate))
    .filter((d) => d >= 0);
  const avgHoldDays = holdDays.length ? holdDays.reduce((a, b) => a + b, 0) / holdDays.length : 0;
  const winnerHoldDays = winners
    .map((t) => dateDiffDays(t.filledDate, t.closeDate))
    .filter((d) => d >= 0);
  const avgWinnerHoldDays = winnerHoldDays.length
    ? winnerHoldDays.reduce((a, b) => a + b, 0) / winnerHoldDays.length
    : 0;

  // Consecutive streaks (across full filtered trade sequence by close date)
  const seq = [...filteredTrades].sort((a, b) =>
    dateSort(a.closeDate || a.filledDate, b.closeDate || b.filledDate)
  );
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const t of seq) {
    if (t.result === 'Winner') {
      curWin += 1;
      curLoss = 0;
      if (curWin > maxWinStreak) maxWinStreak = curWin;
    } else if (t.result === 'Loser') {
      curLoss += 1;
      curWin = 0;
      if (curLoss > maxLossStreak) maxLossStreak = curLoss;
    } else {
      // BE breaks both streaks
      curWin = 0;
      curLoss = 0;
    }
  }

  // Calmar (annualized) — uses period-start balance as denominator for proper return calculation
  let calmar = 0;
  if (seq.length >= 1 && Math.abs(maxDD) > 0) {
    const firstDate = seq[0].closeDate || seq[0].filledDate;
    const lastDate = seq[seq.length - 1].closeDate || seq[seq.length - 1].filledDate;
    const days = Math.max(1, dateDiffDays(firstDate, lastDate));
    // Use period-start balance: what was the balance before the first filtered trade?
    let periodStartBalance = account.initialBalance;
    if (yearFilter) {
      // Walk timeline up to just before the first trade in our period
      const firstFilledDate = seq[0].filledDate;
      for (const p of timeline) {
        if (p.date < firstFilledDate) {
          periodStartBalance = p.balance;
        } else {
          break;
        }
      }
    }
    const periodReturn = periodStartBalance > 0 ? totalPnl / periodStartBalance : 0;
    calmar = (periodReturn * (365 / days)) / Math.abs(maxDD);
  }

  // YTD PnL — sum trades in current year (or yearFilter)
  const yearForYTD = yearFilter ?? new Date().getFullYear();
  const ytdPnl = allTrades
    .filter((t) => dateYear(t.closeDate || t.filledDate) === yearForYTD)
    .reduce((s, t) => s + (t.totalPnl || 0), 0);

  // Deposits / Payouts
  const deposits = transactions
    .filter((t) => t.accountId === account.id && t.type === 'Deposit')
    .reduce((s, t) => s + t.amount, 0);
  const payouts = transactions
    .filter((t) => t.accountId === account.id && t.type === 'Payout')
    .reduce((s, t) => s + t.amount, 0);

  return {
    accountId: account.id,
    currentBalance,
    initialBalance: account.initialBalance,
    deposits,
    payouts,
    ytdPnl,
    totalPnl,
    totalR,
    winners: winners.length,
    losers: losers.length,
    breakevens: breakevens.length,
    totalTrades: filteredTrades.length,
    winRateExBE,
    winRateAll,
    profitFactor,
    expectancyR,
    expectancyDollar,
    avgWin,
    avgLoss,
    avgWinR,
    avgLossR,
    largestWin,
    largestLoss,
    avgHoldDays,
    avgWinnerHoldDays,
    maxWinStreak,
    maxLossStreak,
    maxDD,
    currentDD,
    calmar,
    timeline,
  };
}

/**
 * Strategy → timeframe filter mapping (matches xlsx).
 */
export function matchesStrategy(timeframe, strategy) {
  if (!strategy || strategy === 'All Strategies') return true;
  const SWING = ['4H', 'Daily', 'Weekly', '12H', '8H'];
  const INTRADAY = ['15 min', '5 min', '1H', '2H'];
  switch (strategy) {
    case 'Swing':
      return SWING.includes(timeframe);
    case 'Swing 4H / Daily':
      return timeframe === '4H' || timeframe === 'Daily';
    case 'Swing Daily / Weekly':
      return timeframe === 'Daily' || timeframe === 'Weekly';
    case 'Intraday':
      return INTRADAY.includes(timeframe);
    case 'Intraday 15 min / 1H':
      return timeframe === '15 min' || timeframe === '1H';
    case 'Intraday 5 min':
      return timeframe === '5 min';
    default:
      return true;
  }
}
