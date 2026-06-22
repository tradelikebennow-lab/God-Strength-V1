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
  enrichEdgeFeatures, expandTagDims, monitor, leakageScan, leakedDims, discoverThenConfirm, coachVerdicts,
} from '../analytics/edge.js';

const PREREG_DIMS = ['plannedRrBucket', 'holdBucket'];
const EXPLORE_DIMS = ['tradeType', 'direction', 'market', 'timeframe', 'dow', 'riskBucket', 'session'];
const SEGMENT_DIMS = ['tradeType', 'direction', 'market', 'timeframe', 'session'];
const DIM_LABEL = {
  plannedRrBucket: 'Planned R:R', holdBucket: 'Hold duration', dow: 'Day of week',
  riskBucket: 'Risk size', tradeType: 'Trade type', direction: 'Direction',
  market: 'Market', timeframe: 'Timeframe', session: 'Session',
};
const prettyDim = (d) => DIM_LABEL[d] || (d && d.startsWith('tag:') ? `tag "${d.slice(4)}"` : d);

const TONE_COLOR = { pos: 'var(--success)', neg: 'var(--danger)', warn: '#e8a13a', dim: 'var(--fg-dim)' };
const Pill = ({ tone = 'dim', children }) => (
  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, border: '1px solid currentColor', whiteSpace: 'nowrap', color: TONE_COLOR[tone] || 'var(--fg-dim)' }}>
    {children}
  </span>
);

const Hdr = ({ title, children }) => (
  <span title={title} style={{ borderBottom: '1px dotted var(--fg-faint)', cursor: 'help' }}>{children}</span>
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
    const enriched0 = enrichEdgeFeatures(base);
    const { trades: rows, dims: tagDims } = expandTagDims(enriched0);
    const valueKey = unit === 'R' ? 'totalR' : 'totalPnl';
    const exploreDims = [...EXPLORE_DIMS, ...tagDims];

    const mon = monitor(rows, { valueKey, segmentBy: SEGMENT_DIMS });
    const scan = leakageScan(rows, [...exploreDims, ...PREREG_DIMS], { valueKey });
    const leaked = new Set(leakedDims(scan));
    const run = (dims, maxOrder) => {
      const kept = dims.filter((d) => !leaked.has(d));
      const d = discoverThenConfirm(rows, { dims: kept, valueKey, maxOrder });
      d.excluded = dims.filter((x) => leaked.has(x));
      return d;
    };
    return { rows, valueKey, mon, scan, coach: coachVerdicts(rows, { valueKey, dims: exploreDims }), prereg: run(PREREG_DIMS, 1), explore: run(exploreDims, 2) };
  }, [trades, accounts, year, accountId, strategy, unit]);

  const { mon, scan, coach, prereg, explore } = M;
  const money = (v) => (unit === 'R' ? fmtR(v, 2, true) : fmtCur(v, 'USD', settings.currencyMode, eurFx));
  const pVal = (p) => (p == null || Number.isNaN(p) ? '—' : p < 0.001 ? p.toExponential(1) : p.toFixed(3));
  const mag = (v) => (unit === 'R' ? `${Math.abs(v).toFixed(2)}R` : fmtCur(Math.abs(v), 'USD', settings.currencyMode, eurFx));
  const coachWhat = (c) => c.dim === 'direction' ? `${c.value} trades`
    : c.dim === 'market' ? c.value
    : c.dim === 'timeframe' ? `the ${c.value} timeframe`
    : c.dim === 'dow' ? c.value
    : c.dim === 'session' ? `the ${c.value} session`
    : c.dim === 'riskBucket' ? `risking ${c.value}`
    : c.dim.startsWith('tag:') ? `trades ${c.value === 'yes' ? '' : 'not '}tagged "${c.dim.slice(4)}"`
    : `${c.value} (${DIM_LABEL[c.dim] || c.dim})`;
  const coachLine = (c) => {
    const pf = isFinite(c.profitFactor) ? c.profitFactor.toFixed(2) : '∞';
    const conf = c.sig ? "consistent enough that it's unlikely to be luck" : 'though at this sample it could still be luck';
    const what = coachWhat(c);
    if (c.action === 'STOP') return `${what}: across ${c.n} trades this lost about ${mag(c.expectancy)} per trade (profit factor ${pf}) — ${conf}. Worth cutting or reworking the setup.`;
    if (c.action === 'KEEP') return `${what}: across ${c.n} trades this made about ${mag(c.expectancy)} per trade (profit factor ${pf}) — ${conf}.${c.sig ? ' Keep leaning into it.' : ' Keep doing it, but it is not proven yet — keep logging.'}`;
    if (c.action === 'WATCH') return `${what}: only ${c.n} trades so far — too few to call either way. Keep collecting.`;
    return `${what}: about breakeven across ${c.n} trades — no clear edge either way.`;
  };

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
          {disc.excluded?.length ? ` · excluded (leaked): ${disc.excluded.map((d) => prettyDim(d)).join(', ')}` : ''}
        </div>
        <MiniTable
          columns={[
            { key: 'cut', label: <Hdr title="A slice of your trades being tested — e.g. tradeType=Trend, or a pair like direction=Buy & market=Indices.">Cut</Hdr> },
            { key: '_status', label: <Hdr title="confirmed = significant in-sample AND out-of-sample · noise = not distinguishable from luck · low n = too few trades · needs more OOS = promising but not enough held-out trades yet">Verdict</Hdr>, format: ([tone, label]) => <Pill tone={tone}>{label}</Pill> },
            { key: 'discover', label: <Hdr title="On the in-sample (older 70%) trades — n = trades in this cut · exp = average result per trade (R or $) · p = probability the edge is luck (one-sided; must beat the Bonferroni bar)">Discover (n · exp · p)</Hdr>, align: 'right' },
            { key: '_need', label: <Hdr title="Minimum detectable edge — the smallest expectancy that could even reach significance at this sample size. Greyed = you don't have enough trades to confirm anything here yet.">Need ≥ (MDE)</Hdr>, align: 'right', format: (v) => v ? <span className={v[0] ? 'pos' : 'dim'}>{v[1]} {v[0] ? '✓' : ''}</span> : '—' },
            { key: 'confirm', label: <Hdr title="On the held-out newest 30% of trades — the same cut's expectancy and p-value. A real edge should survive here too.">Confirm (OOS)</Hdr>, align: 'right' },
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

      {/* Coach's read */}
      <div className="panel">
        <div className="dash-section-title">Coach&apos;s read — what to keep, what to fix</div>
        <div className="dim" style={{ fontSize: 'var(--text-xs, 11px)', marginBottom: 'var(--space-md)' }}>
          A plain-language take on your clean pre-trade features (outcome-coupled ones are left out). Based on your own history — descriptive, not a guarantee or a signal.
        </div>
        {(() => {
          const actionable = coach.filter((c) => c.action === 'STOP' || c.action === 'KEEP');
          const top = (actionable.length ? actionable : coach).slice(0, 6);
          if (!top.length) return <div className="dim">Not enough trades yet to call anything keep-or-stop.</div>;
          const PL = { STOP: ['neg', 'stop / fix'], KEEP: ['pos', 'keep'], WATCH: ['dim', 'more data'], NEUTRAL: ['dim', 'no edge'] };
          return top.map((c, i) => (
            <div key={`${c.dim}-${c.value}`} style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'baseline', padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span style={{ flex: '0 0 84px' }}><Pill tone={PL[c.action][0]}>{PL[c.action][1]}</Pill></span>
              <span style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>{coachLine(c)}</span>
            </div>
          ));
        })()}
        <div className="dim" style={{ fontSize: 'var(--text-xs, 11px)', marginTop: 'var(--space-md)' }}>
          &ldquo;Unlikely to be luck&rdquo; is a basic check; the stricter multiple-comparisons test is in the Discovery section below.
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
            <Tooltip formatter={(v) => money(v)} labelFormatter={(l) => `trade ${l}`} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }} itemStyle={{ color: 'var(--fg)' }} labelStyle={{ color: 'var(--fg-muted)' }} />
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
            { key: 'buckets', label: <Hdr title="Distinct groups inside this feature (e.g. Trend / Counter / Sideways). Only buckets with at least 20 trades are scored.">Buckets</Hdr>, align: 'right' },
            { key: 'spread', label: <Hdr title="Gap between the best and worst bucket's win rate. A big gap means the feature strongly separates winners from losers.">Win-rate spread</Hdr>, align: 'right', format: (v) => fmtPct(v, 0, false) },
            { key: 'v', label: <Hdr title="Association between the feature and win/lose, from 0 (no relationship) to 1 (perfectly predicts the result).">Cramér's V</Hdr>, align: 'right', format: (v) => (isFinite(v) ? v.toFixed(2) : '—') },
            { key: '_flag', label: <Hdr title="OK = usable pre-trade feature · REVIEW = somewhat outcome-coupled · LEAKED = nearly determines the result, auto-excluded from discovery">Verdict</Hdr>, format: ([tone, label]) => <Pill tone={tone}>{label}</Pill> },
          ]}
          rows={Object.entries(scan).map(([d, r], i) => ({
            id: i, feature: prettyDim(d), n: r.n, buckets: r.nBuckets,
            spread: r.winRateSpread, v: r.cramersV,
            _flag: r.flag === 'LEAKED' ? ['neg', 'LEAKED'] : r.flag === 'REVIEW' ? ['warn', 'REVIEW'] : r.flag === 'OK' ? ['pos', 'OK'] : ['dim', 'insufficient'],
          }))}
        />
        <div className="dim" style={{ fontSize: 'var(--text-xs, 11px)', marginTop: 'var(--space-sm)' }}>
          Reads each feature for outcome leakage. <b>Buckets</b> = the distinct groups within a feature (e.g. Trend / Counter / Sideways), scored only when they have ≥20 trades. <b>Win-rate spread</b> = gap between the best and worst bucket's win rate. <b>Cramér's V</b> = how strongly the feature predicts win/lose (0–1). <b>LEAKED</b> (V ≥ 0.40 or spread ≥ 45%) = the feature nearly determines the result, so it can't be a real pre-trade edge (e.g. a target field overwritten by the exit) — these are auto-excluded from the discovery tests below.
        </div>
      </div>

      {/* Loop B — discovery */}
      <div className="panel" style={{ padding: 'var(--space-md) var(--space-lg)' }}>
        <div className="dim" style={{ fontSize: 'var(--text-xs, 11px)', lineHeight: 1.6 }}>
          <b>How to read discovery (Loop B):</b> each <b>Cut</b> is a slice of your trades. <b>Discover</b> uses the older 70% of trades to find candidates; <b>Confirm</b> holds out the newest 30% to re-test them. <b>n · exp · p</b> = number of trades · average result per trade · probability it's luck (one-sided p-value). <b>Need ≥</b> is the minimum-detectable-edge — below it you simply don't have enough trades to confirm anything. A cut is <b>confirmed</b> only if it beats the (Bonferroni-corrected) bar in-sample <i>and</i> stays significant out-of-sample. Discovery only — not a signal.
        </div>
      </div>
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
            <Tooltip formatter={(v) => money(v)} contentStyle={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8 }} itemStyle={{ color: 'var(--fg)' }} labelStyle={{ color: 'var(--fg-muted)' }} />
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
