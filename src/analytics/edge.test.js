// src/analytics/edge.test.js
// Edge Lab engine — unit tests + a full PARITY check against the Python research
// engine (fixture generated from the real 213-trade journal). If the JS ever drifts
// from the Python, the parity block fails loudly.
import { describe, it, expect } from 'vitest';
import {
  studentTSf, tCritical, minDetectableEdge, evaluateCut, plannedRR,
  enrichEdgeFeatures, discoverThenConfirm, leakageScan, leakedDims, monitor, coachVerdicts,
} from './edge.js';
import fx from './__fixtures__/edge_parity.json';

const close = (a, b, tol = 1e-6) => {
  const an = a == null || Number.isNaN(a), bn = b == null || Number.isNaN(b);
  return an || bn ? an && bn : Math.abs(a - b) <= tol * (1 + Math.abs(b));
};

describe('Student-t survival + critical value', () => {
  it('t-critical matches known z / t-table values', () => {
    expect(tCritical(0.05, 1e6)).toBeCloseTo(1.6449, 3);
    expect(tCritical(0.025, 1e6)).toBeCloseTo(1.96, 3);
    expect(tCritical(0.05, 9)).toBeCloseTo(1.8331, 3);
  });
  it('survival is monotone and bounded', () => {
    expect(studentTSf(0, 30)).toBeCloseTo(0.5, 6);
    expect(studentTSf(10, 30)).toBeLessThan(studentTSf(1, 30));
  });
});

describe('minimum detectable edge', () => {
  it('= tCrit * sd / sqrt(n) and shrinks with n', () => {
    expect(minDetectableEdge(40, 1, 0.05)).toBeCloseTo(tCritical(0.05, 39) / Math.sqrt(40), 9);
    expect(minDetectableEdge(200, 1, 0.05)).toBeLessThan(minDetectableEdge(40, 1, 0.05));
  });
  it('guards: n<2, sd<=0, bad alpha -> NaN', () => {
    for (const x of [minDetectableEdge(1, 1, 0.05), minDetectableEdge(40, 0, 0.05), minDetectableEdge(40, 1, 0)])
      expect(Number.isNaN(x)).toBe(true);
  });
  it('expectancy >= MDE(alpha) iff one-sided p < alpha', () => {
    const ev = evaluateCut([0.6, 0.6, 0.6, 0.6, -0.2, 0.6, 0.6, -0.2, 0.6, 0.6]);
    const mde = minDetectableEdge(ev.n, ev.sd, 0.05);
    expect(ev.expectancy >= mde).toBe(ev.p < 0.05);
  });
});

describe('feature derivation', () => {
  it('planned R:R is direction-agnostic |tp1-entry|/|entry-stop|', () => {
    expect(plannedRR(100, 90, 120)).toBeCloseTo(2);
    expect(plannedRR(100, 110, 70)).toBeCloseTo(3);  // sell-shaped prices, same ratio
    expect(plannedRR(100, 100, 120)).toBe(null);     // zero risk -> null
  });
  it('buckets match the Python edges', () => {
    const t = enrichEdgeFeatures([{ entry: 100, stop: 99, tp1: 102, filledDate: '2025-01-06', closeDate: '2025-01-06', riskPct: 0.01 }])[0];
    expect(t.plannedRrBucket).toBe('RR 1.5-2.5');
    expect(t.holdBucket).toBe('0d intraday');
    expect(t.dow).toBe('Monday');
    expect(t.riskBucket).toBe('1%');
  });
});

describe('leakage scan', () => {
  it('flags a perfect win/lose encoder, clears a random feature', () => {
    const tr = Array.from({ length: 120 }, (_, i) => {
      const win = i % 2 === 0;
      return { totalR: win ? 1 : -1, leak: win ? 'W' : 'L', clean: ['a', 'b', 'c'][i % 3] };
    });
    const s = leakageScan(tr, ['leak', 'clean']);
    expect(s.leak.flag).toBe('LEAKED');
    expect(leakedDims(s)).toContain('leak');
  });
});

describe('PARITY with the Python engine (real 213-trade journal)', () => {
  const raw = fx.trades.map(({ plannedRrBucket, holdBucket, dow, riskBucket, ...t }) => t);
  const enriched = enrichEdgeFeatures(raw);

  it('derives the same features the Python did', () => {
    enriched.forEach((t, i) => {
      for (const f of ['plannedRrBucket', 'holdBucket', 'dow', 'riskBucket'])
        expect(t[f] ?? null).toBe(fx.trades[i][f] ?? null);
    });
  });

  it('matches overall stats', () => {
    const m = monitor(enriched, { valueKey: 'totalR' });
    const o = fx.reference.overall;
    expect(m.nTrades).toBe(o.n);
    expect(close(m.expectancy, o.expectancy)).toBe(true);
    expect(close(m.winRate, o.winRate)).toBe(true);
    expect(close(m.profitFactor, o.profitFactor)).toBe(true);
  });

  it('matches the leakage verdict on every feature', () => {
    const scan = leakageScan(enriched, fx.reference.leakage_dims, { valueKey: 'totalR' });
    for (const d of fx.reference.leakage_dims) {
      expect(scan[d].flag).toBe(fx.reference.leakage[d].flag);
      expect(close(scan[d].cramersV, fx.reference.leakage[d].cramers_v)).toBe(true);
      expect(close(scan[d].winRateSpread, fx.reference.leakage[d].win_rate_spread)).toBe(true);
    }
  });

  it('matches gated discovery on every cut (status, n, expectancy, p, MDE)', () => {
    const disc = discoverThenConfirm(enriched, { dims: fx.reference.discovery_dims, valueKey: 'totalR', maxOrder: 2 });
    expect(disc.nTested).toBe(fx.reference.discovery.n_tested);
    expect(disc.nConfirmed).toBe(fx.reference.discovery.n_confirmed);
    const byCut = Object.fromEntries(disc.candidates.map((c) => [c.cut, c]));
    for (const [cut, r] of Object.entries(fx.reference.discovery.cuts)) {
      const c = byCut[cut];
      expect(c, `missing cut ${cut}`).toBeTruthy();
      expect(c.status).toBe(r.status);
      expect(c.discover.n).toBe(r.n);
      expect(close(c.discover.expectancy, r.expectancy)).toBe(true);
      expect(close(c.discover.p, r.p, 1e-5)).toBe(true);
      expect(close(c.discover.mde, r.mde, 1e-5)).toBe(true);
    }
  });
});

describe('coachVerdicts', () => {
  it('calls a losing bucket STOP, a strong winner KEEP, a thin bucket WATCH, and skips leaked features', () => {
    // mixed win/lose within each type (so tradeType itself isn't outcome-coupled),
    // but clearly different expectancy per type.
    const mk = (type, r) => ({ tradeType: type, totalR: r, leak: r > 0 ? 'W' : 'L' });
    const trades = [
      ...Array.from({ length: 18 }, () => mk('Counter', 0.5)),
      ...Array.from({ length: 22 }, () => mk('Counter', -1.0)),   // Counter: -0.325R, PF 0.41 -> STOP
      ...Array.from({ length: 22 }, () => mk('Trend', 1.5)),
      ...Array.from({ length: 18 }, () => mk('Trend', -0.5)),     // Trend: +0.6R, PF 3.67 -> KEEP
      ...Array.from({ length: 10 }, () => mk('Sideways', 0.5)),
      ...Array.from({ length: 10 }, () => mk('Sideways', -0.5)),  // Sideways: n=20 (<30) -> WATCH
    ];
    const out = coachVerdicts(trades, { dims: ['tradeType', 'leak'], valueKey: 'totalR' });
    const byVal = Object.fromEntries(out.map((c) => [c.value, c]));
    expect(byVal.Counter.action).toBe('STOP');
    expect(byVal.Trend.action).toBe('KEEP');
    expect(byVal.Sideways.action).toBe('WATCH');
    expect(out.some((c) => c.dim === 'leak')).toBe(false);   // perfectly-leaked feature excluded
    expect(out[0]._prio).toBe(2);                            // actionable rows sort first
  });
});
