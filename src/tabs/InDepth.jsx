// src/tabs/InDepth.jsx
import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, ZAxis } from 'recharts';
import StatCard from '../components/StatCard.jsx';
import MiniTable from '../components/MiniTable.jsx';
import { computeAccountStats, matchesStrategy } from '../analytics/account.js';
import { byStrategy, byDirection, byTradeType, byLOIFreshness, byMarket, byInstrument, allAccountsComparison } from '../analytics/breakdowns.js';
import { marketZoneSizes, concurrentTrades, rDistribution, dayOfWeekStats, holdTimeVsR } from '../analytics/extras.js';
import { enrichEdgeFeatures, leakageScan, evaluateCut } from '../analytics/edge.js';
import { fmtCur, fmtPct, fmtR, tradesToUSD } from '../utils/currency.js';
import { dateMonth, dateYear } from '../utils/dates.js';

const MONTHS = ['All', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Edge Lab rigor badge: is a breakdown row signal, noise, low-n, or outcome-coupled?
const VTONE = { pos: 'var(--success)', neg: 'var(--danger)', warn: '#e8a13a', dim: 'var(--fg-dim)' };
const Verdict = ({ tone = 'dim', children }) => (
  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1px solid currentColor', color: VTONE[tone] || 'var(--fg-dim)', whiteSpace: 'nowrap' }}>{children}</span>
);

export default function InDepth({ state, filters }) {
  const { accounts, trades, transactions, settings } = state;
  const { year, accountId, strategy } = filters;
  const currencyMode = settings.currencyMode;
  const eurFx = accounts.find((a) => a.currency === 'EUR')?.fxRate || 1.1723;
  const [monthFilter, setMonthFilter] = useState(0); // 0 = all

  const account = accountId ? accounts.find((a) => a.id === accountId) : null;
  const monthFilterApplied = monthFilter > 0 ? monthFilter : null;

  const M = useMemo(() => {
    // Account stats for the filtered account (or all-accounts aggregate)
    let accStats = null;
    if (account) {
      accStats = computeAccountStats(account, trades, transactions, { yearFilter: year, strategyFilter: strategy });
    }

    const filters2 = { accountId, year, strategy, month: monthFilterApplied };

    // USD-normalized PnL for cross-account aggregation (EUR + USD must not
    // be summed raw). R-multiples and win rates are currency-agnostic.
    const usdTrades = tradesToUSD(trades, accounts);

    const strategyBd = byStrategy(usdTrades, filters2);
    const directionBd = byDirection(usdTrades, filters2);
    const typeBd = byTradeType(usdTrades, filters2);
    const loiBd = byLOIFreshness(usdTrades, filters2);
    const marketBd = byMarket(usdTrades, filters2);
    const instBd = byInstrument(usdTrades, filters2);
    const compareRows = allAccountsComparison(accounts, usdTrades, transactions, { year, strategy, month: monthFilterApplied });

    // Apply strategy + month to the extras sections too, so every panel
    // on this page answers the same filtered question (previously these
    // ignored the strategy filter and the month chips).
    const extrasTrades = trades.filter((t) => {
      if (strategy && !matchesStrategy(t.timeframe, strategy)) return false;
      if (monthFilterApplied && parseInt(String(t.closeDate || t.filledDate).slice(5, 7), 10) !== monthFilterApplied) return false;
      return true;
    });

    const zones = marketZoneSizes(extrasTrades, { year });
    const concurrent = accountId
      ? concurrentTrades(extrasTrades.filter((t) => t.accountId === accountId), { year })
      : concurrentTrades(extrasTrades, { year });

    const rDist = rDistribution(extrasTrades, { year, accountId });
    const dow = dayOfWeekStats(extrasTrades, { year, accountId });
    const holdScatter = holdTimeVsR(extrasTrades, { year, accountId });

    // significance + leakage verdicts for the breakdown badges (Edge Lab rigor layer)
    const edgeBase = enrichEdgeFeatures(usdTrades.filter((t) => {
      if (accountId && t.accountId !== accountId) return false;
      if (year && dateYear(t.closeDate || t.filledDate) !== year) return false;
      if (strategy && !matchesStrategy(t.timeframe, strategy)) return false;
      if (monthFilterApplied && parseInt(String(t.closeDate || t.filledDate).slice(5, 7), 10) !== monthFilterApplied) return false;
      return true;
    }));
    const VDIMS = ['direction', 'tradeType', 'loiFreshness', 'market'];
    const vscan = leakageScan(edgeBase, VDIMS, { valueKey: 'totalR' });
    const verdicts = {};
    for (const dim of VDIMS) {
      const vals = [...new Set(edgeBase.map((t) => t[dim]).filter((v) => v != null))];
      const bonf = 0.05 / Math.max(1, vals.length);
      const leaked = vscan[dim]?.flag === 'LEAKED';
      const vm = {};
      for (const v of vals) {
        const ev = evaluateCut(edgeBase.filter((t) => t[dim] === v).map((t) => t.totalR));
        vm[v] = leaked ? ['warn', 'leaked'] : ev.n < 30 ? ['dim', 'low n'] : (ev.expectancy > 0 && ev.p < bonf) ? ['pos', 'edge (prelim)'] : ['dim', 'noise'];
      }
      verdicts[dim] = vm;
    }

    return { accStats, strategyBd, directionBd, typeBd, loiBd, marketBd, instBd, compareRows, zones, concurrent, rDist, dow, holdScatter, verdicts };
  }, [accounts, trades, transactions, year, accountId, strategy, monthFilterApplied]);

  const { accStats, strategyBd, directionBd, typeBd, loiBd, marketBd, instBd, compareRows, zones, concurrent, rDist, dow, holdScatter, verdicts } = M;
  // $ — native currency of the selected account (single-account stat cards).
  // $usd — breakdown tables, whose PnL is always USD-normalized above.
  const $ = (v) => fmtCur(v, account?.currency || 'USD', currencyMode, eurFx);
  const $usd = (v) => fmtCur(v, 'USD', currencyMode, eurFx);

  /* --- Helpers --- */
  const renderBreakdown = (title, groups, dim) => {
    const vmap = dim ? (verdicts?.[dim] || {}) : null;
    const rows = Object.entries(groups)
      .filter(([_, s]) => s.count > 0)
      .map(([name, s]) => ({
        name,
        count: s.count,
        winRate: s.winRateExBE,
        totalR: s.totalR,
        profitFactor: s.profitFactor,
        expectancy: s.expectancy,
        _verdict: vmap ? (vmap[name] || ['dim', '—']) : null,
      }));
    if (rows.length === 0) {
      return (
        <div className="panel">
          <div className="dash-section-title">{title}</div>
          <div className="dim" style={{ textAlign: 'center', padding: 'var(--space-xl) 0' }}>No data</div>
        </div>
      );
    }
    return (
      <div className="panel">
        <div className="dash-section-title">{title}</div>
        <MiniTable
          columns={[
            { key: 'name', label: title.split(' ')[0] },
            { key: 'count', label: '#', align: 'right' },
            { key: 'winRate', label: 'WR', align: 'right', format: (v) => fmtPct(v, 0, false) },
            { key: 'totalR', label: 'Total R', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
            { key: 'profitFactor', label: 'PF', align: 'right', format: (v) => isFinite(v) ? v.toFixed(2) : '∞' },
            { key: 'expectancy', label: 'Exp', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
            ...(vmap ? [{ key: '_verdict', label: 'Verdict', format: (v) => (v ? <Verdict tone={v[0]}>{v[1]}</Verdict> : '—') }] : []),
          ]}
          rows={rows}
        />
        {vmap && <div className="dim" style={{ fontSize: 'var(--text-xs, 11px)', marginTop: 'var(--space-sm)' }}>Preliminary, corrected within this breakdown only — the Edge Lab tab runs the stricter all-features + out-of-sample test; trust that for confirmation. Leaked = outcome-coupled. Discovery only, not advice.</div>}
      </div>
    );
  };

  return (
    <div className="dashboard-grid animate-in">
      {/* ---- Month filter ---- */}
      <div className="panel" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
        <div className="flex items-center gap-md" style={{ flexWrap: 'wrap' }}>
          <span className="dim" style={{ fontSize: 'var(--text-sm)' }}>Month:</span>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              className={`filter-chip ${monthFilter === i ? 'active' : ''}`}
              onClick={() => setMonthFilter(i)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Summary stats (account-specific or all) ---- */}
      {accStats && (
        <div className="dash-kpi-strip">
          <StatCard label="Total PnL" value={$(accStats.totalPnl)} tone={accStats.totalPnl > 0 ? 'pos' : 'neg'} />
          <StatCard label="Trades" value={accStats.totalTrades} subValue={`${accStats.winners}W / ${accStats.losers}L / ${accStats.breakevens}BE`} />
          <StatCard label="Profit Factor" value={isFinite(accStats.profitFactor) ? accStats.profitFactor.toFixed(2) : '∞'} />
          <StatCard label="Expectancy" value={fmtR(accStats.expectancyR)} subValue={$(accStats.expectancyDollar)} />
          <StatCard label="Avg Hold" value={`${accStats.avgHoldDays.toFixed(1)}d`} subValue={`Winners: ${accStats.avgWinnerHoldDays.toFixed(1)}d`} />
          <StatCard label="Streaks" value={`${accStats.maxWinStreak}W / ${accStats.maxLossStreak}L`} subValue="Max consecutive" />
        </div>
      )}

      {/* ---- Concurrent trades + max W/L ---- */}
      <div className="dash-kpi-strip">
        <StatCard label="Max Concurrent" value={concurrent.max} subValue="Open at same time" />
        <StatCard label="Avg Concurrent" value={concurrent.avg.toFixed(2)} subValue="Across active days" />
        {accStats && <StatCard label="Largest Win" value={$(accStats.largestWin)} tone="pos" />}
        {accStats && <StatCard label="Largest Loss" value={$(accStats.largestLoss)} tone="neg" />}
        {accStats && <StatCard label="Avg Win R" value={fmtR(accStats.avgWinR)} tone="pos" />}
        {accStats && <StatCard label="Avg Loss R" value={fmtR(accStats.avgLossR)} tone="neg" />}
      </div>

      {/* ---- Breakdowns 2x2 ---- */}
      <div className="dash-two-col">
        {renderBreakdown('Strategy Breakdown', strategyBd)}
        {renderBreakdown('Direction Breakdown', directionBd, 'direction')}
      </div>
      <div className="dash-two-col">
        {renderBreakdown('Trade Type Breakdown', typeBd, 'tradeType')}
        {renderBreakdown('LOI Freshness Breakdown', loiBd, 'loiFreshness')}
      </div>

      {/* ---- Market breakdown ---- */}
      <div className="panel">
        <div className="dash-section-title">Markets Statistics</div>
        <MiniTable
          columns={[
            { key: 'market', label: 'Market' },
            { key: 'count', label: 'Trades', align: 'right' },
            { key: 'winRate', label: 'WR', align: 'right', format: (v) => fmtPct(v, 0, false) },
            { key: 'totalR', label: 'Total R', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
            { key: 'totalPnl', label: 'PnL', align: 'right', format: (v) => $usd(v), tone: true },
            { key: 'expectancy', label: 'Exp', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
            { key: 'profitFactor', label: 'PF', align: 'right', format: (v) => isFinite(v) ? v.toFixed(2) : '∞' },
          ]}
          rows={Object.entries(marketBd).map(([name, s]) => ({
            market: name,
            count: s.count,
            winRate: s.winRateExBE,
            totalR: s.totalR,
            totalPnl: s.totalPnl,
            expectancy: s.expectancy,
            profitFactor: s.profitFactor,
          }))}
        />
      </div>

      {/* ---- Market Zone Sizes ---- */}
      <div className="panel">
        <div className="dash-section-title">Market Zone Sizes by Timeframe</div>
        <MiniTable
          columns={[
            { key: 'market', label: 'Market' },
            { key: 'timeframe', label: 'TF' },
            { key: 'avgZoneSize', label: 'Avg Zone (pips/pts)', align: 'right', format: (v) => v.toFixed(2) },
            { key: 'sampleSize', label: 'n', align: 'right' },
          ]}
          rows={zones}
        />
      </div>

      {/* ---- All accounts comparison ---- */}
      {!accountId && (
        <div className="panel">
          <div className="dash-section-title">All Accounts Comparison</div>
          <MiniTable
            columns={[
              { key: 'accountName', label: 'Account' },
              { key: 'count', label: 'Trades', align: 'right' },
              { key: 'winRate', label: 'WR', align: 'right', format: (v) => fmtPct(v, 0, false) },
              { key: 'totalR', label: 'Total R', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
              { key: 'totalPnl', label: 'PnL', align: 'right', format: (v) => $usd(v), tone: true },
              { key: 'profitFactor', label: 'PF', align: 'right', format: (v) => isFinite(v) ? v.toFixed(2) : '∞' },
              { key: 'expectancy', label: 'Exp', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
            ]}
            rows={compareRows.map((r) => ({
              accountName: r.accountName,
              count: r.count,
              winRate: r.winRateExBE,
              totalR: r.totalR,
              totalPnl: r.totalPnl,
              profitFactor: r.profitFactor,
              expectancy: r.expectancy,
            }))}
          />
        </div>
      )}

      {/* ---- New analytics: 3 charts ---- */}
      <div className="dash-two-col">
        <div className="panel">
          <div className="dash-section-title">R-Multiple Distribution</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={rDist}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--fg-dim)', fontSize: 11 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--fg-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: 'var(--fg)' }}
                itemStyle={{ color: 'var(--fg)' }}
              />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="dash-section-title">Day-of-Week Performance</div>
          <MiniTable
            columns={[
              { key: 'day', label: 'Day' },
              { key: 'trades', label: 'Trades', align: 'right' },
              { key: 'winRate', label: 'WR', align: 'right', format: (v) => fmtPct(v, 0, false) },
              { key: 'totalR', label: 'Total R', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
              { key: 'avgR', label: 'Avg R', align: 'right', format: (v) => fmtR(v, 2, true), tone: true },
            ]}
            rows={dow}
          />
        </div>
      </div>

      <div className="panel">
        <div className="dash-section-title">Hold Time vs R-Multiple</div>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="days"
              name="Hold Days"
              unit="d"
              tick={{ fill: 'var(--fg-dim)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              type="number"
              dataKey="r"
              name="R"
              tick={{ fill: 'var(--fg-dim)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--fg-dim)' }}
              contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: 'var(--fg)' }}
              itemStyle={{ color: 'var(--fg)' }}
              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(2) : v, name]}
            />
            <Scatter
              data={holdScatter.filter(p => p.result === 'Winner')}
              fill="var(--success)"
              name="Winners"
            />
            <Scatter
              data={holdScatter.filter(p => p.result === 'Loser')}
              fill="var(--danger)"
              name="Losers"
            />
            <Scatter
              data={holdScatter.filter(p => p.result === 'Breakeven')}
              fill="var(--fg-dim)"
              name="Breakevens"
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* ---- Instrument Statistics ---- */}
      <div className="panel">
        <div className="dash-section-title">Instruments {monthFilterApplied ? `· ${MONTHS[monthFilterApplied]}` : ''}</div>
        <MiniTable
          columns={[
            { key: 'instrument', label: 'Instrument', sortable: true },
            { key: 'count', label: 'Trades', align: 'right', sortable: true },
            { key: 'winRate', label: 'WR', align: 'right', sortable: true, format: (v) => fmtPct(v, 0, false) },
            { key: 'totalR', label: 'Total R', align: 'right', sortable: true, format: (v) => fmtR(v, 2, true), tone: true },
            { key: 'totalPnl', label: 'PnL', align: 'right', sortable: true, format: (v) => $usd(v), tone: true },
          ]}
          rows={Object.entries(instBd).map(([name, s]) => ({
            instrument: name,
            count: s.count,
            winRate: s.winRateExBE,
            totalR: s.totalR,
            totalPnl: s.totalPnl,
          }))}
          defaultSort={{ key: 'totalPnl', direction: 'desc' }}
          maxRows={20}
        />
      </div>
    </div>
  );
}
