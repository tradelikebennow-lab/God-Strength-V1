// src/tabs/EdgeLab.jsx
// Edge Lab — the rigor layer. Tells a trader whether a pattern is SIGNAL or NOISE,
// shows how many trades they'd need to confirm anything (min-detectable-edge), and
// flags features that are outcome-coupled (leakage). DISCOVERY ONLY — not advice.
import React, { useMemo, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import StatCard from '../components/StatCard.jsx';
import MiniTable from '../components/MiniTable.jsx';
import { matchesStrategy } from '../analytics/account.js';
import { tradesToUSD, fmtR, fmtCur, fmtPct } from '../utils/currency.js';
import { dateYear } from '../utils/dates.js';
import {
  enrichEdgeFeatures, monitor, leakageScan, leakedDims, discoverThenConfirm,
} from '../analytics/edge.js';

const PREREG_DIMS = ['plannedRrBucket', 'holdBucket'];
const EXPLORE_DIMS = ['tradeType', 'direction', 'market', 'timeframe', 'dow', 'riskBucket'];
const SEGMENT_DIMS = ['tradeType', 'direction', 'market', 'timeframe'];
const DIM_LABEL = {
  plannedRrBucket: 'Planned R:R', holdBucket: 'Hold duration', dow: 'Day of week',
  riskBucket: 'Risk size', tradeType: 'Trade type', direction: 'Direction',
  market: 'Market', timeframe: 'Timeframe',
};

const TONE_COLOR = { pos: 'var(--success)', neg: 'var(--danger)', warn: '#e8a13a', dim: 'var(--fg-dim)' };
const Pill = ({ tone = 'dim', children }) => (
  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1px solid currentColor', whiteSpace: 'nowrap', color: TONE_COLOR[tone] || 'var(--fg-dim)' }}>
    {children}
  </span>
);

const STATUS = {
  CONFIRMED: ['pos', 'confirmed'],
  discovered_unconfirmed_oos: ['warn', 'unconfirmed OOS'],
  discovered_unconfirmed_insufficient_oos: ['warn', 'needs more OOS'],
  discovered_failed_oos: ['neg', 'failed OOS'],
  rejected_discovery: ['dim', 'noise'],
  insufficient: ['dim', 'low n'],
};

export default function EdgeLab({ state, filters }) {
  const { accounts, trades, settings } = state;
  const { year, accountId, strategy } = filters;
  const eurFx = accounts.find((a) => a.currency === 'EUR')?.fxRate || 1.1723;
  const [unit, setUnit] = useState('R'); // 'R' | 'USD'

  const M = useMemo(() => {
    // same filtering the rest of the app uses; USD-normalise for cross-account sums
    const base = tradesToUSD(trades, accounts).filter((t) => {
      if (accountId && t.accountId !== accountId) return false;
      if (year && dateYear(t.closeDate || t.filledDate) !== year) return false;
      if (strategy && !matchesStrategy(t.timeframe, strategy)) return false;
      return t.status !== 'Open';
    });
    const rows = enrichEdgeFeatures(base);
    const valueKey = unit === 'R' ? 'totalR' : 'totalPnl';

    const mon = monitor(rows, { valueKey, segmentBy: SEGMENT_DIMS });
    const scan = leakageScan(rows, [...EXPLORE_DIMS, ...PREREG_DIMS], { valueKey });
    const leaked = new Set(leakedDims(scan));
    const run = (dims, maxOrder) => {
      const kept = dims.filter((d) => !leaked.has(d));
      const d = discoverThenConfirm(rows, { dims: kept, valueKey, maxOrder });
      d.excluded = dims.filter((x) => leaked.has(x));
      return d;
    };
    return { rows, valueKey, mon, scan, prereg: run(PREREG_DIMS, 1), explore: run(EXPLORE_DIMS, 2) };
  }, [trades, accounts, year, accountId, strategy, unit]);

  const { mon, scan, prereg, explore } = M;
  const money = (v) => (unit === 'R' ? fmtR(v, 2, true) : fmtCur(v, 'USD', settings.currencyMode, eurFx));
  const pVal = (p) => (p == null || Number.isNaN(p) ? '—' : p < 0.001 ? p.toExponential(1) : p.toFixed(3));

  if (!mon.nTrades) {
    return <div className="dashboard-grid animate-in"><div className="panel"><div className="dim" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>No closed trades in the current filter.</div></div></div>;
  }

  const equityData = mon.cumulative.map((v, i) => ({ i, v }));
  const segData = Object.entries(mon.segments.tradeType || {}).map(([name, s]) => ({ name, expectancy: s.expectancy }));

  /* ---- discovery table renderer (Loop B) ---- */
  const discoveryPanel = (title, disc) => {
    const rows = disc.candidates.slice(0, 14).map((c, idx) => {
      const d = c.discover;
      const reach = isFinite(d.mde) && isFinite(d.expectancy) && d.expectancy >= d.mde;
      const [tone, label] = STATUS[c.status] || ['dim', c.status];
      return {
        id: idx, cut: c.cut, _status: [tone, label],
        discover: `n${d.n} · ${money(d.expectancy)} · p ${pVal(d.p)}`,
        _need: isFinite(d.mde) ? [reach, `${money(d.mde)}`] : null,
        confirm: c.confirm ? `${money(c.confirm.expectancy)} · p ${pVal(c.confirm.p)}` : '—',
      };
    });
    return (
      <div className="panel">
        <div className="dash-section-title">{title}</div>
        <div className="dim" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-sm)' }}>
          {disc.nConfirmed} confirmed of {disc.nTested} cuts · Bonferroni p&lt;{pVal(disc.bonferroniAlpha)} · confirm needs OOS n≥30
          {disc.excluded?.length ? ` · excluded (leaked): ${disc.excluded.map((d) => DIM_LABEL[d] || d).join(', ')}` : ''}
        </div>
        <MiniTable
          columns={[
            { key: 'cut', label: 'Cut' },
            { key: '_status', label: 'Verdict', format: ([tone, label]) => <Pill tone={tone}>{label}</Pill> },
            { key: 'discover', label: 'Discover (n · exp · p)', align: 'right' },
            { key: '_need', label: 'Need ≥ (MDE)', align: 'right', format: (v) => v ? <span className={v[0] ? 'pos' : 'dim'}>{v[1]} {v[0] ? '✓' : ''}</span> : '—' },
            { key: 'confirm', label: 'Confirm (OOS)', align: 'right' },
          ]}
          rows={rows}
        />
      </div>
    );
  };

  return (
    <div className="dashboard-grid animate-in">
      {/* unit toggle + disclaimer */}
      <div className="panel" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
        <div className="flex items-center gap-md" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div className="flex items-center gap-md">
            <span className="dim" style={{ fontSize: 'var(--text-sm)' }}>Unit:</span>
            {['R', 'USD'].map((u) => (
              <button key={u} className={`filter-chip ${unit === u ? 'active' : ''}`} onClick={() => setUnit(u)}>{u}</button>
            ))}
          </div>
          <span className="dim" style={{ fontSize: 'var(--text-xs, 11px)' }}>
            Discovery only — a pattern here is a hypothesis, not a signal. Confirm out-of-sample + on small size before acting.
          </span>
        </div>
      </div>

      {/* Loop A — overall */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-md)' }}>
        <StatCard label={`Total (${unit})`} value={money(mon.total)} tone={mon.total >= 0 ? 'pos' : 'neg'} />
        <StatCard label="Expectancy / trade" value={money(mon.expectancy)} tone={mon.expectancy >= 0 ? 'pos' : 'neg'} />
        <StatCard label="Win rate" value={fmtPct(mon.winRate, 1, false)} />
        <StatCard label="Profit factor" value={isFinite(mon.profitFactor) ? mon.profitFactor.toFixed(2) : '∞'} />
      </div>

      {/* equity curve */}
      <div className="panel">
        <div className="dash-section-title">Cumulative P&amp;L ({unit})</div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={equityData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeOpacity={0.1} vertical={false} />
            <XAxis dataKey="i" tick={{ fontSize: 11 }} stroke="var(--fg-dim)" label={{ value: 'trade #', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'var(--fg-dim)' }} />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--fg-dim)" width={48} />
            <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => `trade ${l}`} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
            <Area type="monotone" dataKey="v" stroke="var(--primary)" fill="url(#eq)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* leakage check */}
      <div className="panel">
        <div className="dash-section-title">Feature leakage check — {leakedDims(scan).length} flagged outcome-coupled</div>
        <MiniTable
          columns={[
            { key: 'feature', label: 'Feature' },
            { key: 'n', label: 'n', align: 'right' },
            { key: 'buckets', label: 'Buckets', align: 'right' },
            { key: 'spread', label: 'Win-rate spread', align: 'right', format: (v) => fmtPct(v, 0, false) },
            { key: 'v', label: "Cramér's V", align: 'right', format: (v) => (isFinite(v) ? v.toFixed(2) : '—') },
            { key: '_flag', label: 'Verdict', format: ([tone, label]) => <Pill tone={tone}>{label}</Pill> },
          ]}
          rows={Object.entries(scan).map(([d, r], i) => ({
            id: i, feature: DIM_LABEL[d] || d, n: r.n, buckets: r.nBuckets,
            spread: r.winRateSpread, v: r.cramersV,
            _flag: r.flag === 'LEAKED' ? ['neg', 'LEAKED'] : r.flag === 'REVIEW' ? ['warn', 'REVIEW'] : r.flag === 'OK' ? ['pos', 'OK'] : ['dim', 'insufficient'],
          }))}
        />
        <div className="dim" style={{ fontSize: 'var(--text-xs, 11px)', marginTop: 'var(--space-sm)' }}>
          LEAKED = the feature nearly determines win/lose, so it can't be a pre-trade edge (e.g. a target overwritten by the exit). These are excluded from discovery below.
        </div>
      </div>

      {/* Loop B — discovery */}
      {discoveryPanel('Pre-registered — planned R:R + hold duration', prereg)}
      {discoveryPanel('Exploratory scan — clean pre-trade features', explore)}

      {/* segment expectancy */}
      <div className="panel">
        <div className="dash-section-title">Expectancy by trade type ({unit}/trade)</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={segData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeOpacity={0.1} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--fg-dim)" />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--fg-dim)" width={48} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
            <ReferenceLine y={0} stroke="var(--fg-dim)" />
            <Bar dataKey="expectancy">
              {segData.map((d, i) => <Cell key={i} fill={d.expectancy >= 0 ? 'var(--success)' : 'var(--danger)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
