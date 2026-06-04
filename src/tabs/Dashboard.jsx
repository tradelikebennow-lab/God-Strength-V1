// src/tabs/Dashboard.jsx
import React, { useMemo } from 'react';
import StatCard from '../components/StatCard.jsx';
import MiniTable from '../components/MiniTable.jsx';
import ProgressBar from '../components/ProgressBar.jsx';
import EquityChart from '../components/EquityChart.jsx';
import MonthlyGrid from '../components/MonthlyGrid.jsx';
import { computePortfolioMetrics } from '../analytics/portfolio.js';
import { matchesStrategy } from '../analytics/account.js';
import { computeMonthlyGrid } from '../analytics/monthly.js';
import { byInstrument } from '../analytics/breakdowns.js';
import { payoutProjection, projectedYearEndBalance } from '../analytics/extras.js';
import { buildBenchmarkCurve } from '../data/sp500.js';
import { fmtCur, fmtPct, fmtR } from '../utils/currency.js';
import { dateYear } from '../utils/dates.js';

export default function Dashboard({ state, filters }) {
  const { accounts, trades, transactions, settings } = state;
  const { year, accountId, strategy } = filters;
  const currencyMode = settings.currencyMode;
  const eurAccount = accounts.find((a) => a.currency === 'EUR');
  const fxRate = eurAccount?.fxRate || 1.1723;

  /* ----- All computed values (single memo) ----- */
  const M = useMemo(() => {
    const port = computePortfolioMetrics(accounts, trades, transactions, {
      yearFilter: year,
      strategyFilter: strategy,
      accountFilter: accountId,
    });
    const accountStats = port.accountStats;

    // Filtered trades for stats panel — must respect ALL three filters
    const filteredTrades = trades.filter((t) => {
      if (year && dateYear(t.filledDate) !== year) return false;
      if (accountId && t.accountId !== accountId) return false;
      if (strategy && !matchesStrategy(t.timeframe, strategy)) return false;
      return true;
    });

    // Aggregate filtered stats
    const winners = filteredTrades.filter((t) => t.result === 'Winner');
    const losers = filteredTrades.filter((t) => t.result === 'Loser');
    const nonBE = filteredTrades.filter((t) => t.nonBreakeven === 1);
    const filteredPnl = filteredTrades.reduce((s, t) => s + (t.totalPnl || 0), 0);
    const grossWin = winners.reduce((s, t) => s + t.totalPnl, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.totalPnl, 0));
    const filteredStats = {
      totalPnl: filteredPnl,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      winRateExBE: nonBE.length ? winners.length / nonBE.length : 0,
      winRateAll: filteredTrades.length ? winners.length / filteredTrades.length : 0,
      avgWin: winners.length ? grossWin / winners.length : 0,
      avgLoss: losers.length ? -grossLoss / losers.length : 0,
      avgWinR: winners.length ? winners.reduce((s, t) => s + t.totalR, 0) / winners.length : 0,
      avgLossR: losers.length ? losers.reduce((s, t) => s + t.totalR, 0) / losers.length : 0,
      largestWin: winners.length ? Math.max(...winners.map((t) => t.totalPnl)) : 0,
      largestLoss: losers.length ? Math.min(...losers.map((t) => t.totalPnl)) : 0,
      expectancyR: filteredTrades.length ? filteredTrades.reduce((s, t) => s + t.totalR, 0) / filteredTrades.length : 0,
      expectancyDollar: filteredTrades.length ? filteredPnl / filteredTrades.length : 0,
      totalTrades: filteredTrades.length,
      winners: winners.length,
      losers: losers.length,
      breakevens: filteredTrades.length - winners.length - losers.length,
    };

    // Instrument breakdown
    const instBd = byInstrument(trades, { year, accountId, strategy });
    const instRows = Object.entries(instBd)
      .map(([name, s]) => ({
        instrument: name,
        winners: s.winners,
        breakevens: s.breakevens,
        losers: s.losers,
        winRate: s.winRateExBE,
        totalR: s.totalR,
        totalPnl: s.totalPnl,
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    // Payout projection (Campus Fund — primary prop with payouts)
    const cfAccount = accounts.find((a) => a.id === 'campus-fund');
    const cfPayoutProj = cfAccount ? payoutProjection(cfAccount, transactions, year || new Date().getFullYear()) : null;

    // Pepperstone projected year-end balance
    const pepAccount = accounts.find((a) => a.id === 'pepperstone');
    const pepMonthly = pepAccount ? computeMonthlyGrid(pepAccount, trades, transactions, { year: year || new Date().getFullYear() }) : null;
    const pepProj = pepAccount && pepMonthly ? projectedYearEndBalance(
      { ...pepAccount, currentBalance: accountStats['pepperstone']?.currentBalance },
      pepMonthly,
      year || new Date().getFullYear()
    ) : null;

    // Equity curve data points for the portfolio chart
    const twrChartData = port.twrCurve
      .filter((p) => p.date !== null)
      .map((p) => ({ date: p.date, value: p.twr * 100 }));

    // S&P 500 benchmark cumulative return, aligned to the same dates (percent units)
    const benchmarkRaw = buildBenchmarkCurve(port.twrCurve);
    const benchmarkChartData = benchmarkRaw.map((p) => ({ date: p.date, value: p.benchmark * 100 }));

    return { port, filteredStats, instRows, cfPayoutProj, pepProj, twrChartData, benchmarkChartData };
  }, [accounts, trades, transactions, year, accountId, strategy]);

  const { port, filteredStats, instRows, cfPayoutProj, pepProj, twrChartData, benchmarkChartData } = M;
  const eurFx = fxRate;

  /* ----- Currency formatters bound to current mode ----- */
  const $ = (v, opts) => fmtCur(v, 'USD', currencyMode, eurFx, opts);
  const $compact = (v) => fmtCur(v, 'USD', currencyMode, eurFx, { compact: true });

  /* ----- Avg Win / Loss bar widths (scaled to the larger of the two) ----- */
  const wlMax = Math.max(Math.abs(filteredStats.avgWin), Math.abs(filteredStats.avgLoss), 0.0001);
  const wlWinPct = (Math.abs(filteredStats.avgWin) / wlMax) * 100;
  const wlLossPct = (Math.abs(filteredStats.avgLoss) / wlMax) * 100;

  return (
    <div className="dashboard-grid animate-in">
      {/* ---- HERO ROW: Portfolio + KPIs ---- */}
      <div className="dash-hero-row">
        <div className="hero-card">
          <div className="hero-label">Total Portfolio Value</div>
          <div className="hero-value">{$(port.portfolioValue)}</div>
          <div className="hero-secondary">
            <span className={port.ytdGrowthUsd > 0 ? 'pos' : port.ytdGrowthUsd < 0 ? 'neg' : ''}>
              {port.ytdGrowthUsd > 0 ? '▲' : '▼'} {fmtCur(Math.abs(port.ytdGrowthUsd), 'USD', currencyMode, eurFx)}{' '}
              ({fmtPct(port.ytdGrowthPct, 2, true)})
            </span>
            <span className="dim" style={{ marginLeft: 12 }}>YTD</span>
          </div>
          <div className="hero-kpis">
            <div>
              <div className="stat-label">YTD TWR</div>
              <div className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: port.ytdTwr >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmtPct(port.ytdTwr, 2, true)}
              </div>
            </div>
            <div>
              <div className="stat-label">Total Payouts</div>
              <div className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--success)' }}>
                {$(port.totalPayouts)}
              </div>
            </div>
            <div>
              <div className="stat-label">Total Deposits</div>
              <div className="mono" style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}>
                {$(port.totalDeposits)}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="dash-section-title">Filtered Statistics</div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)' }}>
            <StatCard label="Total PnL" value={$(filteredStats.totalPnl)} tone={filteredStats.totalPnl > 0 ? 'pos' : filteredStats.totalPnl < 0 ? 'neg' : 'default'} />
            <StatCard label="Profit Factor" value={isFinite(filteredStats.profitFactor) ? filteredStats.profitFactor.toFixed(2) : '∞'} />
            <StatCard label="Expectancy" value={fmtR(filteredStats.expectancyR)} subValue={$(filteredStats.expectancyDollar)} />
            <StatCard label="Win Rate (ex BE)" value={fmtPct(filteredStats.winRateExBE, 1, false)} subValue={`${filteredStats.winners}/${filteredStats.losers}/${filteredStats.breakevens} W/L/BE`} />
          </div>
          <div className="mt-lg">
            <div className="stat-label">Avg Win / Avg Loss</div>
            <div className="wl-bars">
              <div className="wl-row">
                <span className="wl-label">Avg Win</span>
                <div className="wl-track">
                  <div className="wl-fill win" style={{ width: `${wlWinPct}%` }} />
                  <span className="wl-value pos">{$(filteredStats.avgWin)}</span>
                </div>
              </div>
              <div className="wl-row">
                <span className="wl-label">Avg Loss</span>
                <div className="wl-track">
                  <div className="wl-fill loss" style={{ width: `${wlLossPct}%` }} />
                  <span className="wl-value neg">{$(filteredStats.avgLoss)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- KPI STRIP ---- */}
      <div className="dash-kpi-strip">
        <StatCard
          label="Win Rate"
          value={fmtPct(filteredStats.winRateExBE, 1, false)}
          tone={filteredStats.winRateExBE >= 0.4 ? 'pos' : 'default'}
        />
        <StatCard
          label="Profit Factor"
          value={isFinite(filteredStats.profitFactor) ? filteredStats.profitFactor.toFixed(2) : '∞'}
          tone={filteredStats.profitFactor >= 1.3 ? 'pos' : filteredStats.profitFactor < 1 ? 'neg' : 'default'}
        />
        <StatCard
          label="Max Drawdown"
          value={fmtPct(port.maxDD, 2, false)}
          tone={Math.abs(port.maxDD) > 0.1 ? 'neg' : Math.abs(port.maxDD) > 0.05 ? 'warn' : 'default'}
        />
        <StatCard
          label="Current DD"
          value={fmtPct(port.currentDD, 2, false)}
          tone={port.currentDD <= -0.05 ? 'neg' : port.currentDD <= -0.02 ? 'warn' : 'pos'}
        />
        <StatCard
          label="Calmar Ratio"
          value={isFinite(port.calmar) ? port.calmar.toFixed(2) : '—'}
        />
        <StatCard
          label="Weighted R"
          value={fmtR(port.weightedR)}
          tone={port.weightedR > 0 ? 'pos' : 'neg'}
        />
      </div>

      {/* ---- TWO COLUMNS: Breach Buffers + Account Balances ---- */}
      <div className="dash-two-col">
        <div className="panel">
          <div className="dash-section-title">Breach Buffers</div>
          {accounts.filter((a) => a.breachFloor != null).map((acc) => {
            const stats = port.accountStats[acc.id];
            if (!stats) return null;
            // Buffer measured against the account's balance high-water mark,
            // not initialBalance — trailing-drawdown accounts (e.g. scaled
            // prop accounts) can have a breach floor ABOVE initial balance.
            const peakBalance = Math.max(
              acc.initialBalance,
              ...(stats.timeline || []).map((p) => p.balance)
            );
            const buffer = Math.max(0, stats.currentBalance - acc.breachFloor);
            const totalBuffer = Math.max(0, peakBalance - acc.breachFloor);
            const usedPct = totalBuffer > 0 ? 1 - Math.min(1, buffer / totalBuffer) : 0;
            return (
              <div key={acc.id} className="breach-row">
                <div className="breach-info">
                  <div className="breach-name">{acc.name}</div>
                  <div className="breach-detail">
                    {fmtCur(Math.max(0, totalBuffer - buffer), acc.currency, 'USD', eurFx, { decimals: 0 })} / {fmtCur(totalBuffer, acc.currency, 'USD', eurFx, { decimals: 0 })} used
                  </div>
                </div>
                <div className="breach-bar-wrapper">
                  <ProgressBar value={Math.max(0, Math.min(1, usedPct))} warnAt={0.5} dangerAt={0.75} showPct />
                </div>
              </div>
            );
          })}
          {accounts.filter((a) => a.breachFloor != null).length === 0 && (
            <div className="dim" style={{ padding: 'var(--space-xl) 0', textAlign: 'center' }}>
              No accounts with breach floors configured.
            </div>
          )}
        </div>

        <div className="panel">
          <div className="dash-section-title">Account Balances</div>
          {accounts.map((acc) => {
            const stats = port.accountStats[acc.id];
            if (!stats) return null;
            return (
              <div key={acc.id} className="balance-row">
                <div>
                  <div className="balance-name">{acc.name}</div>
                  <div className="balance-meta">
                    <span className={`badge ${acc.status === 'Unlocked' ? 'badge-success' : 'badge-muted'}`}>{acc.status}</span>
                    <span style={{ marginLeft: 6 }}>{acc.currency} · FX {acc.fxRate}</span>
                  </div>
                </div>
                <div>
                  <div className="balance-amount">
                    {fmtCur(stats.currentBalance, acc.currency, 'USD', eurFx, { decimals: 2 })}
                  </div>
                  <div className="balance-meta">Current</div>
                </div>
                <div>
                  <div className={`balance-pnl ${stats.ytdPnl > 0 ? 'pos' : stats.ytdPnl < 0 ? 'neg' : ''}`}>
                    {stats.ytdPnl >= 0 ? '+' : ''}{fmtCur(stats.ytdPnl, acc.currency, 'USD', eurFx, { decimals: 2 })}
                  </div>
                  <div className="balance-meta">YTD PnL</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---- PORTFOLIO TWR CHART ---- */}
      <div className="panel">
        <div className="dash-section-title">Portfolio TWR Curve vs S&amp;P 500</div>
        <EquityChart
          data={twrChartData}
          color="auto"
          height={280}
          yFormat={(v) => v.toFixed(2) + '%'}
          xFormat={(d) => d?.slice(5, 10)}
          showZeroLine
          primaryLabel="Portfolio TWR"
          benchmark={{
            data: benchmarkChartData,
            label: 'S&P 500',
            color: 'var(--warning)',
          }}
        />
      </div>

      {/* ---- MONTHLY GRID ---- */}
      <div>
        <div className="dash-section-title">Monthly Performance · {year || 'All Years'}</div>
        <MonthlyGrid
          accounts={accounts.filter((a) => a.status === 'Unlocked' || port.accountStats[a.id]?.totalTrades > 0)}
          trades={trades}
          transactions={transactions}
          year={year || new Date().getFullYear()}
          strategyFilter={strategy}
        />
      </div>

      {/* ---- INSTRUMENT BREAKDOWN ---- */}
      <div className="panel">
        <div className="dash-section-title">Instruments {accountId ? `· ${accounts.find(a => a.id === accountId)?.name}` : '· All Accounts'}</div>
        <MiniTable
          columns={[
            { key: 'instrument', label: 'Instrument', sortable: true },
            { key: 'winners', label: 'W', align: 'right', sortable: true },
            { key: 'breakevens', label: 'BE', align: 'right', sortable: true },
            { key: 'losers', label: 'L', align: 'right', sortable: true },
            { key: 'winRate', label: 'WR', align: 'right', sortable: true, format: (v) => fmtPct(v, 0, false) },
            { key: 'totalR', label: 'Total R', align: 'right', sortable: true, format: (v) => fmtR(v, 2, true), tone: true },
            { key: 'totalPnl', label: 'Total PnL', align: 'right', sortable: true, format: (v) => $(v), tone: true },
          ]}
          rows={instRows}
          defaultSort={{ key: 'totalPnl', direction: 'desc' }}
          maxRows={15}
        />
      </div>

      {/* ---- PAYOUT PROJECTION ---- */}
      {cfPayoutProj && cfPayoutProj.total > 0 && (
        <div className="dash-two-col">
          <div className="panel">
            <div className="dash-section-title">Payout Projection · Campus Fund {year || ''}</div>
            <div className="payout-component">
              <div>
                <div className="payout-component-label">1. Net Banked YTD</div>
                <div className="payout-component-detail">Σ (gross × (1 − split)) actual payouts taken</div>
              </div>
              <div className="payout-component-value">{$(cfPayoutProj.netBanked)}</div>
            </div>
            <div className="payout-component">
              <div>
                <div className="payout-component-label">2. Avg Monthly Gross</div>
                <div className="payout-component-detail">Total gross ÷ {cfPayoutProj.monthsPassed} months passed</div>
              </div>
              <div className="payout-component-value">{$(cfPayoutProj.avgMonthlyGross)}</div>
            </div>
            <div className="payout-component">
              <div>
                <div className="payout-component-label">3. Future Split Share</div>
                <div className="payout-component-detail">1 − most recent split</div>
              </div>
              <div className="payout-component-value">{(cfPayoutProj.futureSplitShare * 100).toFixed(0)}%</div>
            </div>
            <div className="payout-component">
              <div>
                <div className="payout-component-label">4. Future Net (Est)</div>
                <div className="payout-component-detail">Avg gross × share × {cfPayoutProj.monthsRemaining} months left</div>
              </div>
              <div className="payout-component-value">{$(cfPayoutProj.futureNet)}</div>
            </div>
            <div className="payout-total">
              <div className="payout-total-label">Projected Annual</div>
              <div className="payout-total-value">{$(cfPayoutProj.total)}</div>
            </div>
          </div>

          {pepProj && (
            <div className="panel">
              <div className="dash-section-title">Pepperstone · Year-End Projection</div>
              <StatCard
                label="Projected Year-End Balance"
                value={fmtCur(pepProj.projectedYearEnd, 'EUR', currencyMode, eurFx)}
                subValue={`Current: ${fmtCur(pepProj.currentBalance, 'EUR', currencyMode, eurFx)}`}
                tone="pos"
              />
              <div className="mt-lg">
                <div className="payout-component">
                  <div className="payout-component-label">Avg Monthly TWR</div>
                  <div className={`payout-component-value ${pepProj.avgMonthlyTwr > 0 ? 'pos' : 'neg'}`}>
                    {fmtPct(pepProj.avgMonthlyTwr, 2, true)}
                  </div>
                </div>
                <div className="payout-component">
                  <div className="payout-component-label">Months Remaining</div>
                  <div className="payout-component-value">{pepProj.monthsRemaining}</div>
                </div>
                <div className="payout-component">
                  <div className="payout-component-label">Estimated Annual Return</div>
                  <div className={`payout-component-value ${pepProj.projectedYearEnd > pepProj.currentBalance ? 'pos' : 'neg'}`}>
                    {fmtPct((pepProj.projectedYearEnd / accounts.find(a => a.id === 'pepperstone').initialBalance) - 1, 1, true)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
