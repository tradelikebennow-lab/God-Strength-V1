// src/analytics/edge.js
// Edge Lab — statistical rigor layer over the journal. Framework-free, pure, deterministic.
//
// Two jobs the rest of the journal does NOT do:
//   1) tell a trader whether a pattern is SIGNAL or NOISE (gated discovery: exact
//      one-sided Student-t significance + Bonferroni multiple-comparisons + an
//      out-of-sample confirmation split), with a minimum-detectable-edge readout; and
//   2) flag features that are OUTCOME-COUPLED (a "planned" field overwritten by the
//      result) so traders don't mine their own outcomes (leakage check).
//
// This is a faithful JS port of the Python research engine; edge.test.js asserts the
// numbers match the Python on the real journal. DISCOVERY ONLY — not a signal, not advice.

/* ============================ exact Student-t ============================ */

function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function lgamma(z) {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let a = c[0];
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const bt = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** One-sided upper-tail P(T > t) for a Student-t with df degrees of freedom. */
export function studentTSf(t, df) {
  if (df <= 0 || Number.isNaN(t)) return NaN;
  if (!isFinite(t)) return t > 0 ? 0 : 1;
  const x = df / (df + t * t);
  const halfIb = 0.5 * betai(df / 2, 0.5, x);
  return t >= 0 ? halfIb : 1 - halfIb;
}

/** t such that one-sided P(T > t) == alpha for a Student-t with df. Bisection. */
export function tCritical(alpha, df) {
  if (!(alpha > 0 && alpha < 1) || df <= 0) return NaN;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    if (studentTSf(hi, df) <= alpha) break;
    hi *= 2;
    if (hi > 1e12) return NaN;
  }
  let lo = 0;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (studentTSf(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Smallest mean expectancy that could reach one-sided significance at `alpha`
 *  given n trades and per-trade std `sd` (df=n-1): tCrit*sd/sqrt(n). NaN if undefined. */
export function minDetectableEdge(n, sd, alpha) {
  if (n == null || sd == null) return NaN;
  n = Math.trunc(n);
  if (n < 2 || !isFinite(sd) || sd <= 0 || !(alpha > 0 && alpha < 1)) return NaN;
  const tc = tCritical(alpha, n - 1);
  if (!isFinite(tc)) return NaN;
  return (tc * sd) / Math.sqrt(n);
}

/* ============================ per-cut statistics ============================ */

/** n, expectancy (mean), winRate, sd (sample), t-stat and one-sided p for mean>0. */
export function evaluateCut(values) {
  const a = values.filter((v) => typeof v === 'number' && isFinite(v));
  const n = a.length;
  if (n === 0) return { n: 0, expectancy: NaN, winRate: NaN, sd: NaN, t: NaN, p: NaN };
  const mean = a.reduce((s, v) => s + v, 0) / n;
  const winRate = a.filter((v) => v > 0).length / n;
  if (n < 2) return { n, expectancy: mean, winRate, sd: NaN, t: NaN, p: NaN };
  const variance = a.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  let t, p;
  if (sd === 0) { t = mean > 0 ? Infinity : mean < 0 ? -Infinity : 0; p = mean > 0 ? 0 : mean < 0 ? 1 : 0.5; }
  else { t = mean / (sd / Math.sqrt(n)); p = studentTSf(t, n - 1); }
  return { n, expectancy: mean, winRate, sd, t, p };
}

/* ============================ derived features ============================ */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayOfWeek = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : DAY_NAMES[d.getUTCDay()];
};
const holdDays = (filled, close) => {
  if (!filled || !close) return null;
  const a = new Date(filled + 'T00:00:00Z'), b = new Date(close + 'T00:00:00Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
};

/** Planned reward:risk from raw prices, direction-agnostic (|tp1-entry|/|entry-stop|). */
export function plannedRR(entry, stop, tp1) {
  if (![entry, stop, tp1].every((v) => typeof v === 'number' && isFinite(v))) return null;
  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;
  return Math.abs(tp1 - entry) / risk;
}

const rrBucket = (rr) => (rr == null ? null : rr <= 1.5 ? 'RR<1.5' : rr <= 2.5 ? 'RR 1.5-2.5' : 'RR>=2.5');
const holdBucket = (h) => (h == null ? null : h <= 0 ? '0d intraday' : h <= 3 ? '1-3d' : h <= 7 ? '4-7d' : '>7d');
const riskBucket = (v) => (v == null || !isFinite(v) ? null : `${parseFloat((v * 100).toPrecision(3))}%`);

/** Attach mechanical pre-trade features used as discovery/leakage dimensions. Pure. */
export function enrichEdgeFeatures(trades) {
  return trades.map((t) => ({
    ...t,
    plannedRrBucket: rrBucket(plannedRR(t.entry, t.stop, t.tp1)),
    holdBucket: holdBucket(holdDays(t.filledDate, t.closeDate)),
    dow: dayOfWeek(t.filledDate),
    riskBucket: riskBucket(t.riskPct),
  }));
}

/* ============================ candidate cuts ============================ */

const uniqVals = (trades, dim) =>
  [...new Set(trades.map((t) => t[dim]).filter((v) => v != null))].sort((a, b) => String(a).localeCompare(String(b)));

/** (label, predicate) for single + (optionally) pairwise value cuts. */
export function candidateCuts(trades, dims, maxOrder = 2) {
  const present = dims.filter((d) => trades.some((t) => d in t));
  const cuts = [];
  for (const d of present)
    for (const v of uniqVals(trades, d)) cuts.push({ label: `${d}=${v}`, pred: (t) => t[d] === v });
  if (maxOrder >= 2) {
    for (let i = 0; i < present.length; i++)
      for (let j = i + 1; j < present.length; j++) {
        const d1 = present[i], d2 = present[j];
        for (const v1 of uniqVals(trades, d1))
          for (const v2 of uniqVals(trades, d2))
            cuts.push({ label: `${d1}=${v1} & ${d2}=${v2}`, pred: (t) => t[d1] === v1 && t[d2] === v2 });
      }
  }
  return cuts;
}

/* ============================ gated discovery (Loop B) ============================ */

const RANK = { CONFIRMED: 0, discovered_unconfirmed_oos: 1, discovered_failed_oos: 2,
  discovered_unconfirmed_insufficient_oos: 3, rejected_discovery: 4, insufficient: 5 };

const byCloseThenSeq = (a, b) =>
  String(a.closeDate).localeCompare(String(b.closeDate)) || ((a.seq ?? 0) - (b.seq ?? 0)) ||
  String(a.id ?? '').localeCompare(String(b.id ?? ''));

/** Gated discovery. CONFIRMED only if a cut clears the Bonferroni bar on the DISCOVER
 *  half AND shows a significant same-sign edge on the held-out CONFIRM tail. */
export function discoverThenConfirm(trades, { dims, valueKey = 'totalR', discoverFrac = 0.7,
  minN = 30, alpha = 0.05, maxOrder = 2 } = {}) {
  const sorted = [...trades].sort(byCloseThenSeq);
  const k = Math.trunc(sorted.length * discoverFrac);
  const disc = sorted.slice(0, k), conf = sorted.slice(k);
  const cuts = candidateCuts(sorted, dims, maxOrder);
  const nTested = cuts.length;
  const bonf = alpha / Math.max(1, nTested);

  const vals = (rows, pred) => rows.filter(pred).map((t) => t[valueKey]);
  const out = cuts.map(({ label, pred }) => {
    const de = evaluateCut(vals(disc, pred));
    de.mde = minDetectableEdge(de.n, de.sd, bonf);
    let status, ce = null;
    if (de.n < minN) status = 'insufficient';
    else if (!(de.expectancy > 0 && de.p < bonf)) status = 'rejected_discovery';
    else {
      ce = evaluateCut(vals(conf, pred));
      ce.mde = minDetectableEdge(ce.n, ce.sd, alpha);
      if (ce.n < minN) status = 'discovered_unconfirmed_insufficient_oos';
      else if (ce.expectancy > 0 && ce.p < alpha) status = 'CONFIRMED';
      else if (ce.expectancy > 0) status = 'discovered_unconfirmed_oos';
      else status = 'discovered_failed_oos';
    }
    return { cut: label, status, discover: de, confirm: ce };
  });
  out.sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) ||
    -((a.confirm ? a.confirm.expectancy : -9) - (b.confirm ? b.confirm.expectancy : -9)));
  return {
    nTested, bonferroniAlpha: bonf, confirmAlpha: alpha,
    discoverN: disc.length, confirmN: conf.length,
    nConfirmed: out.filter((r) => r.status === 'CONFIRMED').length,
    candidates: out,
    disclaimer: 'DISCOVERY ONLY. Every candidate needs a mechanical rationale and a forward ' +
      'test on small size before acting. Bias: insufficient evidence. Not a signal or financial advice.',
  };
}

/* ============================ leakage check ============================ */

export const LEAK_V = 0.4, LEAK_SPREAD = 0.45, REVIEW_V = 0.25, REVIEW_SPREAD = 0.35;

function vAndSpread(trades, dim, valueKey, minN) {
  const rows = trades.filter((t) => t[dim] != null && typeof t[valueKey] === 'number' && isFinite(t[valueKey]));
  const counts = new Map();
  for (const t of rows) counts.set(t[dim], (counts.get(t[dim]) || 0) + 1);
  const keep = [...counts.entries()].filter(([, c]) => c >= minN).map(([v]) => v);
  const kept = rows.filter((t) => keep.includes(t[dim]));
  const nb = new Set(kept.map((t) => t[dim])).size;
  const n = kept.length;
  if (nb < 2) return { v: NaN, spread: NaN, nb, n };
  // win-rate spread across kept buckets
  const wr = new Map();
  for (const v of keep) {
    const g = kept.filter((t) => t[dim] === v);
    wr.set(v, g.filter((t) => t[valueKey] > 0).length / g.length);
  }
  const wrs = [...wr.values()];
  const spread = Math.max(...wrs) - Math.min(...wrs);
  // contingency feature × win/lose
  const wins = kept.map((t) => t[valueKey] > 0);
  if (new Set(wins).size < 2) return { v: 0, spread, nb, n };
  const rowsK = keep;
  const table = rowsK.map((v) => {
    const g = kept.filter((t) => t[dim] === v);
    const w = g.filter((t) => t[valueKey] > 0).length;
    return [w, g.length - w];
  });
  const total = n;
  const rowSums = table.map((r) => r[0] + r[1]);
  const colSums = [table.reduce((s, r) => s + r[0], 0), table.reduce((s, r) => s + r[1], 0)];
  let chi2 = 0;
  for (let i = 0; i < table.length; i++)
    for (let j = 0; j < 2; j++) {
      const e = (rowSums[i] * colSums[j]) / total;
      if (e > 0) chi2 += (table[i][j] - e) ** 2 / e;
    }
  const r = table.length, c = 2;
  const v = Math.sqrt(chi2 / (total * Math.max(1, Math.min(r, c) - 1)));
  return { v, spread, nb, n };
}

/** Per-feature outcome-coupling scan. win = value>0. Returns { dim: {...} }. */
export function leakageScan(trades, dims, { valueKey = 'totalR', minN = 20 } = {}) {
  const present = dims.filter((d) => trades.some((t) => d in t));
  const valid = trades.filter((t) => typeof t[valueKey] === 'number' && isFinite(t[valueKey]));
  const winClasses = new Set(valid.map((t) => t[valueKey] > 0));
  const degenerate = valid.length < 2 || winClasses.size < 2;
  const out = {};
  for (const d of present) {
    if (degenerate) {
      out[d] = { cramersV: NaN, winRateSpread: NaN, nBuckets: 0, n: valid.length,
        flag: 'insufficient', reason: 'outcome has <2 win/lose classes' };
      continue;
    }
    const { v, spread, nb, n } = vAndSpread(valid, d, valueKey, minN);
    let flag, reason;
    if (nb < 2 || !(isFinite(v) && isFinite(spread))) { flag = 'insufficient'; reason = `<2 buckets with n>=${minN}`; }
    else if (v >= LEAK_V || spread >= LEAK_SPREAD) { flag = 'LEAKED'; reason = 'nearly determines win/lose — likely outcome-coupled, not pre-trade'; }
    else if (v >= REVIEW_V || spread >= REVIEW_SPREAD) { flag = 'REVIEW'; reason = 'moderately associated with outcome — inspect before trusting'; }
    else { flag = 'OK'; reason = 'no strong outcome coupling'; }
    out[d] = { cramersV: v, winRateSpread: spread, nBuckets: nb, n, flag, reason };
  }
  return out;
}

export const leakedDims = (scan, levels = ['LEAKED']) =>
  Object.keys(scan).filter((d) => levels.includes(scan[d].flag));

/* ============================ Loop A monitoring ============================ */

/** Overall + per-segment stats + cumulative curve, in the chosen unit. Pure. */
export function monitor(trades, { valueKey = 'totalR', segmentBy = [] } = {}) {
  const vals = trades.map((t) => t[valueKey]).filter((v) => typeof v === 'number' && isFinite(v));
  const base = evaluateCut(vals);
  const wins = vals.filter((v) => v > 0), losses = vals.filter((v) => v < 0);
  const grossWin = wins.reduce((s, v) => s + v, 0), grossLoss = -losses.reduce((s, v) => s + v, 0);
  const sorted = [...trades].sort(byCloseThenSeq);
  let run = 0; const cumulative = [0];
  for (const t of sorted) { const v = t[valueKey]; if (typeof v === 'number' && isFinite(v)) { run += v; cumulative.push(run); } }
  const segments = {};
  for (const dim of segmentBy) {
    const seg = {};
    for (const v of uniqVals(trades, dim)) {
      const g = trades.filter((t) => t[dim] === v).map((t) => t[valueKey]);
      const ev = evaluateCut(g);
      seg[v] = { n: ev.n, winRate: ev.winRate, expectancy: ev.expectancy,
        total: g.filter((x) => isFinite(x)).reduce((s, x) => s + x, 0), sufficientSample: ev.n >= 30 };
    }
    segments[dim] = seg;
  }
  return {
    nTrades: base.n, expectancy: base.expectancy, winRate: base.winRate,
    total: cumulative[cumulative.length - 1],
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : NaN,
    cumulative, segments,
  };
}
