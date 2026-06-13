// src/analytics/monthly.js
import { dateYear, dateMonth, dateSort, MONTH_NAMES } from '../utils/dates.js';
import { matchesStrategy } from './account.js';
import { buildBalanceTimeline } from './account.js';

/**
 * Per-month performance for one account.
 *
 * % Return TWR for the month:
 *   For each trade in the month, factor = 1 + (pnl / balanceBefore)
 *   Month return = PRODUCT(factors) - 1
 *   Deposits/payouts within the month adjust balance but not return.
 *
 * Returns { months: [{ month: 1..12, winRate, totalR, twr }], ytd: { winRate, totalR, twr } }
 */
export function computeMonthlyGrid(account, trades, transactions, opts = {}) {
  const { year, strategyFilter = null } = opts;
  if (!year) throw new Error('computeMonthlyGrid: year required');

  // Filter trades + tx for this account
  const accTrades = trades.filter((t) => t.accountId === account.id);
  const accTx = transactions.filter((t) => t.accountId === account.id);

  // Build full timeline (all events) to know balance before each event
  const events = [];
  for (const t of accTrades) {
    if (strategyFilter && !matchesStrategy(t.timeframe, strategyFilter)) continue;
    events.push({
      date: t.closeDate || t.filledDate,
      filledDate: t.filledDate,
      kind: 'trade',
      pnl: t.totalPnl || 0,
      r: t.totalR || 0,
      result: t.result,
      nonBE: t.nonBreakeven === 1,
      ref: t,
    });
  }
  for (const tx of accTx) {
    if (tx.type === 'Deposit') {
      events.push({ date: tx.date, kind: 'deposit', amount: tx.amount });
    } else if (tx.type === 'Payout' || tx.type === 'Withdrawal') {
      events.push({ date: tx.date, kind: 'payout', amount: -Math.abs(tx.amount) });
    } else if (tx.type === 'Adjustment' || tx.type === 'Upgrade') {
      events.push({ date: tx.date, kind: 'adjustment', amount: tx.amount });
    }
  }
  events.sort((a, b) => dateSort(a.date, b.date));

  // Walk the timeline
  let bal = account.initialBalance;
  const monthData = {};
  for (let m = 1; m <= 12; m++) {
    monthData[m] = {
      month: m,
      winners: 0,
      losers: 0,
      breakevens: 0,
      nonBE: 0,
      totalR: 0,
      twrFactor: 1,
      pnl: 0,
    };
  }

  for (const ev of events) {
    if (ev.kind === 'trade') {
      // CLOSE date decides month attribution — P&L belongs to the period
      // it landed in (app-wide rule; previously filledDate, which dropped
      // cross-period trades from the closing month entirely).
      const evYear = dateYear(ev.date);
      const evMonth = dateMonth(ev.date);
      if (evYear === year) {
        // Counts/P&L/R always; the balance guard only protects the
        // TWR division (a blown account still has countable trades).
        if (bal > 0) {
          monthData[evMonth].twrFactor *= 1 + ev.pnl / bal;
        }
        monthData[evMonth].pnl += ev.pnl;
        monthData[evMonth].totalR += ev.r;
        if (ev.result === 'Winner') monthData[evMonth].winners += 1;
        else if (ev.result === 'Loser') monthData[evMonth].losers += 1;
        else monthData[evMonth].breakevens += 1;
        if (ev.nonBE) monthData[evMonth].nonBE += 1;
      }
      bal += ev.pnl;
    } else {
      bal += ev.amount;
    }
  }

  const months = [];
  let ytdFactor = 1;
  let ytdR = 0;
  let ytdWinners = 0;
  let ytdNonBE = 0;
  for (let m = 1; m <= 12; m++) {
    const md = monthData[m];
    const twr = md.twrFactor - 1;
    const winRate = md.nonBE > 0 ? md.winners / md.nonBE : 0;
    months.push({
      month: m,
      name: MONTH_NAMES[m - 1],
      winRate,
      totalR: md.totalR,
      twr,
      pnl: md.pnl,
      trades: md.winners + md.losers + md.breakevens,
      nonBE: md.nonBE, // needed by MonthlyGrid to decide whether to render WR
      winners: md.winners,
      losers: md.losers,
    });
    if (md.twrFactor !== 1 || md.winners + md.losers + md.breakevens > 0) {
      ytdFactor *= md.twrFactor;
      ytdR += md.totalR;
      ytdWinners += md.winners;
      ytdNonBE += md.nonBE;
    }
  }

  return {
    accountId: account.id,
    months,
    ytd: {
      winRate: ytdNonBE > 0 ? ytdWinners / ytdNonBE : 0,
      totalR: ytdR,
      twr: ytdFactor - 1,
    },
  };
}
