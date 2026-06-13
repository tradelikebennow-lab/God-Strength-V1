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
import { payoutProjection, projectedYearEndBalance, deriveBreachFloor, dailyLossReport, openRiskExposure } from '../analytics/extras.js';
import { computeDiscipline } from '../analytics/discipline.js';
import Creature from '../components/Creature.jsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { buildBenchmarkCurve } from '../data/sp500.js';
import { BENCHMARKS, loadIndexCloses, buildBenchmarkCurveFromCloses } from '../data/benchmarks.js';
import { fmtCur, fmtPct, fmtR, tradesToUSD } from '../utils/currency.js';
import { dateYear } from '../utils/dates.js';

export default function Dashboard({ state, filters }) {
  const { accounts, trades, transactions, settings } = state;

  /* ----- Benchmark selection + daily closes (loaded once) ----- */
  const [benchSymbol, setBenchSymbol] = React.useState('SPX');
  const [monthlyMode, setMonthlyMode] = React.useState('TWR'); // 'TWR' | 'USD' | 'R'
  const [indexCloses, setIndexCloses] = React.useState(null); // null = loading, {} = none
  React.useEffect(() => {
    let active = true;
    loadIndexCloses().then((by) => { if (active) setIndexCloses(by); });
    return () => { active = false; };
  }, []);
  const { year, accountId, strategy } = filters;
  const discipline = useMemo(() => computeDiscipline(accounts, trades, transactions), [accounts, trades, transactions]);
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

    // USD-normalized trades for UI-level aggregation: EUR-account PnL is
    // FX-converted BEFORE summing (portfolio.js does its own conversion;
    // these panel sums previously added EUR + USD raw).
    const usdTrades = tradesToUSD(trades, accounts);

    // Filtered trades for stats panel — must respect ALL three filters
    const filteredTrades = usdTrades.filter((t) => {
      if (year && dateYear(t.closeDate || t.filledDate) !== year) return false;
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

    // Instrument breakdown (USD-normalized PnL)
    const instBd = byInstrument(usdTrades, { year, accountId, strategy });
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

    // Benchmark cumulative return aligned to the same dates (percent units).
    // Daily closes from index_closes when available; embedded monthly S&P
    // data as fallback (e.g. before the GitHub Action's first run).
    const dailyCloses = indexCloses?.[benchSymbol];
    const benchmarkRaw = dailyCloses?.length
      ? buildBenchmarkCurveFromCloses(port.twrCurve, dailyCloses)
      : benchSymbol === 'SPX'
        ? buildBenchmarkCurve(port.twrCurve)
        : [];
    const benchmarkChartData = benchmarkRaw.map((p) => ({ date: p.date, value: p.benchmark * 100 }));

    // Risk rows: derived breach floor (newHardLimit-aware), daily-loss
    // report, and open-trade exposure per account.
    const riskRows = accounts.map((acc) => {
      const { floor, updatedBy } = deriveBreachFloor(acc, transactions);
      const daily = dailyLossReport(acc, trades, year);
      const exposure = openRiskExposure(acc, trades, accountStats[acc.id]?.currentBalance);
      return { acc, floor, floorUpdatedBy: updatedBy, daily, exposure };
    });

    // Monthly TWR returns derived from the SAME portfolio curve as the
    // chart above — respects year/account/strategy scope. Months without
    // events are skipped.
    const byMonthEnd = new Map();
    for (const pt of port.twrCurve) {
      if (pt.date) byMonthEnd.set(pt.date.slice(0, 7), pt.twr);
    }
    const monthKeys = [...byMonthEnd.keys()].sort();
    let prevTwr = 0;
    const monthlyReturns = monthKeys.map((k) => {
      const end = byMonthEnd.get(k);
      const ret = ((1 + end) / (1 + prevTwr) - 1) * 100;
      prevTwr = end;
      return { month: k, ret };
    });

    // USD + R per close-month from the same filtered, USD-normalized trades
    // as the stats panel (TWR ignores capital; these show dollars and pure R).
    const aggByMonth = new Map();
    for (const t of filteredTrades) {
      const k = String(t.closeDate || t.filledDate || '').slice(0, 7);
      if (!k) continue;
      const cur = aggByMonth.get(k) || { pnl: 0, r: 0 };
      cur.pnl += t.totalPnl || 0;
      cur.r += t.totalR || 0;
      aggByMonth.set(k, cur);
    }
    const monthlyPnlR = [...aggByMonth.keys()].sort().map((k) => ({
      month: k,
      pnl: aggByMonth.get(k).pnl,
      r: aggByMonth.get(k).r,
    }));

    return { port, filteredStats, instRows, cfPayoutProj, pepProj, twrChartData, benchmarkChartData, riskRows, monthlyReturns, monthlyPnlR };
  }, [accounts, trades, transactions, year, accountId, strategy, indexCloses, benchSymbol]);

  const { port, filteredStats, instRows, cfPayoutProj, pepProj, twrChartData, benchmarkChartData, riskRows, monthlyReturns, monthlyPnlR } = M;

  /* ----- Monthly chart: active series + formatter per mode ----- */
  const monthlyChart =
    monthlyMode === 'TWR'
      ? monthlyReturns.map((m) => ({ month: m.month, val: m.ret }))
      : monthlyPnlR.map((m) => ({ month: m.month, val: monthlyMode === 'USD' ? m.pnl : m.r }));
  const monthlyFmt = (v) =>
    monthlyMode === 'TWR'
      ? v.toFixed(2) + '%'
      : monthlyMode === 'USD'
        ? fmtCur(v, 'USD', currencyMode, fxRate, { compact: true })
        : fmtR(v, 2, true);
  const monthlyAxisFmt = (v) =>
    monthlyMode === 'TWR'
      ? v.toFixed(1) + '%'
      : monthlyMode === 'USD'
        ? (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)))
        : v.toFixed(1);
  const monthlyLabel = monthlyMode === 'TWR' ? 'Monthly TWR' : monthlyMode === 'USD' ? 'Net P&L' : 'Total R';
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
          <div className="dash-section-title">Discipline</div>
          <div className="creature-panel-row">
            <Creature discipline={discipline} />
            <div className="creature-meta">
              <div className="creature-state" style={{ color: { best: '#ffce5c', thriving: 'var(--success)', healthy: 'var(--primary)', tired: 'var(--warning)', sick: 'var(--danger)', critical: 'var(--danger)' }[discipline.state.key] || 'var(--fg-dim)' }}>{discipline.state.label}</div>
              <div className="creature-score">
                {discipline.score != null ? `${discipline.score}/100 · last 14 days · ${discipline.tradeCount} trade${discipline.tradeCount === 1 ? '' : 's'}` : 'No recent activity to judge'}
              </div>
              <div className="creature-rules">
                {discipline.components
                  .filter((c) => c.available)
                  .sort((a, b) => a.score - b.score)
                  .slice(0, 3)
                  .map((c) => (
                    <div className="creature-rule" key={c.key}>
                      <span className="stat-label">{c.label}</span>
                      <span className="creature-rule-detail">{c.detail}</span>
                      <span className="creature-rule-score mono" style={{ color: c.score >= 65 ? 'var(--success)' : c.score >= 40 ? 'var(--warning)' : 'var(--danger)' }}>{Math.round(c.score)}</span>
                    </div>
                  ))}
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
          {riskRows.filter((r) => r.floor != null || r.daily.limit).map(({ acc, floor, floorUpdatedBy, daily, exposure }) => {
            const stats = port.accountStats[acc.id];
            if (!stats) return null;
            // Buffer measured against the account's balance high-water mark,
            // not initialBalance — trailing-drawdown accounts (e.g. scaled
            // prop accounts) can have a breach floor ABOVE initial balance.
            const peakBalance = Math.max(
              acc.initialBalance,
              ...(stats.timeline || []).map((p) => p.balance)
            );
            const buffer = floor != null ? Math.max(0, stats.currentBalance - floor) : null;
            const totalBuffer = floor != null ? Math.max(0, peakBalance - floor) : null;
            const usedPct = totalBuffer > 0 ? 1 - Math.min(1, buffer / totalBuffer) : floor != null ? 1 : 0;
            return (
              <div key={acc.id} className="breach-row">
                <div className="breach-info">
                  <div className="breach-name">{acc.name}</div>
                  {floor != null && (
                    <div className="breach-detail">
                      {fmtCur(Math.max(0, totalBuffer - buffer), acc.currency, currencyMode, eurFx, { decimals: 0 })} / {fmtCur(totalBuffer, acc.currency, currencyMode, eurFx, { decimals: 0 })} used
                      {floorUpdatedBy && (
                        <span className="dim"> · floor {fmtCur(floor, acc.currency, currencyMode, eurFx, { decimals: 0 })} (set {floorUpdatedBy.date})</span>
                      )}
                    </div>
                  )}
                  {daily.limit && (
                    <div className="breach-detail">
                      Daily limit {fmtCur(daily.limit, acc.currency, currencyMode, eurFx, { decimals: 0 })}
                      {daily.lastDay && (
                        <span className={daily.lastDay.pnl <= -daily.limit ? 'neg' : daily.lastDay.pnl <= -0.8 * daily.limit ? 'neg' : 'dim'}>
                          {' '}· last day {fmtCur(daily.lastDay.pnl, acc.currency, currencyMode, eurFx, { decimals: 0 })}
                        </span>
                      )}
                      {daily.breachedDays.length > 0 && (
                        <span className="neg"> · {daily.breachedDays.length} breached day{daily.breachedDays.length > 1 ? 's' : ''}</span>
                      )}
                      {daily.breachedDays.length === 0 && daily.nearDays.length > 0 && (
                        <span> · {daily.nearDays.length} near-miss</span>
                      )}
                    </div>
                  )}
                  {exposure.openCount > 0 && (
                    <div className="breach-detail dim">
                      Open: {exposure.openCount} trade{exposure.openCount > 1 ? 's' : ''} · {(exposure.riskPct * 100).toFixed(2)}% at risk
                    </div>
                  )}
                </div>
                {floor != null && (
                  <div className="breach-bar-wrapper">
                    <ProgressBar value={Math.max(0, Math.min(1, usedPct))} warnAt={0.5} dangerAt={0.75} showPct />
                  </div>
                )}
              </div>
            );
          })}
          {riskRows.filter((r) => r.floor != null || r.daily.limit).length === 0 && (
            <div className="dim" style={{ padding: 'var(--space-xl) 0', textAlign: 'center' }}>
              No accounts with breach floors or daily loss limits configured.
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
                    {fmtCur(stats.currentBalance, acc.currency, currencyMode, eurFx, { decimals: 2 })}
                  </div>
                  <div className="balance-meta">Current</div>
                </div>
                <div>
                  <div className={`balance-pnl ${stats.ytdPnl > 0 ? 'pos' : stats.ytdPnl < 0 ? 'neg' : ''}`}>
                    {stats.ytdPnl >= 0 ? '+' : ''}{fmtCur(stats.ytdPnl, acc.currency, currencyMode, eurFx, { decimals: 2 })}
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
        <div className="flex" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="dash-section-title">Portfolio TWR Curve vs {BENCHMARKS.find((b) => b.symbol === benchSymbol)?.label}</div>
          <div className="filter-chips" style={{ marginBottom: 'var(--space-md)' }}>
            {BENCHMARKS.map((b) => (
              <button
                key={b.symbol}
                className={`filter-chip ${benchSymbol === b.symbol ? 'active' : ''}`}
                onClick={() => setBenchSymbol(b.symbol)}
              >
                {b.symbol}
              </button>
            ))}
          </div>
        </div>
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
            label: BENCHMARKS.find((b) => b.symbol === benchSymbol)?.label || benchSymbol,
            color: 'var(--warning)',
          }}
        />
      </div>

      {/* ---- MONTHLY GRID ---- */}
      <div>
        <div className="dash-section-title">Monthly Performance · {year || new Date().getFullYear()}</div>
        <MonthlyGrid
          accounts={accounts.filter((a) => a.status === 'Unlocked' || port.accountStats[a.id]?.totalTrades > 0)}
          trades={trades}
          transactions={transactions}
          year={year || new Date().getFullYear()}
          strategyFilter={strategy}
        />
      </div>

      {/* ---- MONTHLY RETURNS BAR CHART ---- */}
      {(monthlyReturns.length > 0 || monthlyPnlR.length > 0) && (
        <div className="panel">
          <div className="flex" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="dash-section-title">Monthly Returns · {year || 'All Years'}</div>
            <div className="filter-chips" style={{ marginBottom: 'var(--space-md)' }}>
              {['TWR', 'USD', 'R'].map((m) => (
                <button
                  key={m}
                  className={`filter-chip ${monthlyMode === m ? 'active' : ''}`}
                  onClick={() => setMonthlyMode(m)}
                >
                  {m === 'TWR' ? 'TWR %' : m}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--fg-dim)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tickFormatter={(m) => (year ? m.slice(5) : m)}
              />
              <YAxis
                tick={{ fill: 'var(--fg-dim)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={monthlyAxisFmt}
                width={60}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: 'var(--fg)' }}
                itemStyle={{ color: 'var(--fg)' }}
                formatter={(v) => [monthlyFmt(v), monthlyLabel]}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <ReferenceLine y={0} stroke="var(--fg-dim)" strokeDasharray="3 3" />
              <Bar dataKey="val" radius={[4, 4, 0, 0]} maxBarSize={42}>
                {monthlyChart.map((m, i) => (
                  <Cell key={i} fill={m.val >= 0 ? 'var(--success)' : 'var(--danger)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

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

      {/* ---- PROJECTIONS (each panel independent) ---- */}
      {((cfPayoutProj && cfPayoutProj.total > 0) || pepProj) && (
        <div className="dash-two-col">
          {cfPayoutProj && cfPayoutProj.total > 0 && (
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
          )}

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
                    {fmtPct(Math.pow(1 + pepProj.avgMonthlyTwr, 12) - 1, 1, true)}
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
