// src/components/MonthlyGrid.jsx
import React, { useMemo } from 'react';
import { computeMonthlyGrid } from '../analytics/monthly.js';
import { fmtPct } from '../utils/currency.js';
import { MONTH_NAMES } from '../utils/dates.js';

/**
 * Per-account monthly performance grid.
 * For each account: 3 rows (WR ex BE, Total R, % Return TWR) × 12 months + YTD column.
 *
 * Props:
 *   accounts: Account[]
 *   trades: Trade[]
 *   transactions: Transaction[]
 *   year: number
 *   strategyFilter?: string
 */
function MonthlyGrid({ accounts, trades, transactions, year, strategyFilter }) {
  const grids = useMemo(
    () => accounts.map((acc) => ({
      account: acc,
      grid: computeMonthlyGrid(acc, trades, transactions, { year, strategyFilter }),
    })),
    [accounts, trades, transactions, year, strategyFilter]
  );

  return (
    <div className="monthly-grid-wrapper">
      <table className="monthly-grid">
        <thead>
          <tr>
            <th className="grid-account-col">Account</th>
            <th className="grid-metric-col">Metric</th>
            {MONTH_NAMES.map((m) => (
              <th key={m}>{m}</th>
            ))}
            <th className="grid-ytd-col">YTD</th>
          </tr>
        </thead>
        <tbody>
          {grids.map(({ account, grid }) => (
            <AccountRows key={account.id} account={account} grid={grid} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountRows({ account, grid }) {
  return (
    <>
      <tr className="grid-row-wr">
        <td rowSpan={3} className="grid-account-cell">
          <div className="grid-account-name">{account.name}</div>
          <div className="grid-account-meta">{account.currency} · {account.status}</div>
        </td>
        <td className="grid-metric-cell">Win Rate</td>
        {grid.months.map((m) => (
          <td key={m.month} className="num">
            {m.nonBE > 0 ? (m.winRate * 100).toFixed(0) + '%' : '—'}
          </td>
        ))}
        <td className="num grid-ytd-cell">
          {grid.ytd.winRate > 0 ? (grid.ytd.winRate * 100).toFixed(0) + '%' : '—'}
        </td>
      </tr>
      <tr className="grid-row-r">
        <td className="grid-metric-cell">Total R</td>
        {grid.months.map((m) => (
          <td key={m.month} className={`num ${m.totalR > 0 ? 'pos' : m.totalR < 0 ? 'neg' : ''}`}>
            {m.trades > 0 ? m.totalR.toFixed(2) : '—'}
          </td>
        ))}
        <td className={`num grid-ytd-cell ${grid.ytd.totalR > 0 ? 'pos' : grid.ytd.totalR < 0 ? 'neg' : ''}`}>
          {grid.ytd.totalR.toFixed(2)}
        </td>
      </tr>
      <tr className="grid-row-twr">
        <td className="grid-metric-cell">% Return</td>
        {grid.months.map((m) => (
          <td key={m.month} className={`num ${m.twr > 0 ? 'pos' : m.twr < 0 ? 'neg' : ''}`}>
            {m.trades > 0 ? fmtPct(m.twr, 2, false) : '—'}
          </td>
        ))}
        <td className={`num grid-ytd-cell ${grid.ytd.twr > 0 ? 'pos' : grid.ytd.twr < 0 ? 'neg' : ''}`}>
          {fmtPct(grid.ytd.twr, 2, true)}
        </td>
      </tr>
    </>
  );
}

export default React.memo(MonthlyGrid);
