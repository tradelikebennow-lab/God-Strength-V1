// src/data/benchmarks.js
// Daily benchmark closes from the index_closes table (refreshed weekly by
// the GitHub Action). Falls back to the embedded monthly S&P data in
// sp500.js when the table has no rows for a symbol yet.
import { supabase } from './supabaseClient.js';

export const BENCHMARKS = [
  { symbol: 'SPX', label: 'S&P 500' },
  { symbol: 'NDX', label: 'Nasdaq 100' },
];

/** Fetch all closes for all benchmark symbols. Returns { SPX: [{date, close}], ... } */
export async function loadIndexCloses() {
  const { data, error } = await supabase
    .from('index_closes')
    .select('symbol, date, close')
    .order('date', { ascending: true });
  if (error) {
    console.error('[benchmarks] load failed', error);
    return {};
  }
  const by = {};
  for (const r of data || []) {
    (by[r.symbol] ||= []).push({ date: r.date, close: Number(r.close) });
  }
  return by;
}

/**
 * Build a cumulative-return curve aligned to the portfolio TWR curve,
 * anchored at the first dated point (i.e. the first trade of the
 * selected period). Same contract as sp500.js buildBenchmarkCurve.
 */
export function buildBenchmarkCurveFromCloses(twrCurve, closes) {
  if (!twrCurve?.length || !closes?.length) return [];
  const dated = twrCurve.filter((p) => p.date != null);
  if (!dated.length) return [];

  const lookup = (isoDate) => {
    // latest close on or before isoDate (closes sorted ascending)
    let lo = 0, hi = closes.length - 1, res = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (closes[mid].date <= isoDate) { res = closes[mid].close; lo = mid + 1; }
      else hi = mid - 1;
    }
    return res ?? closes[0].close;
  };

  const anchor = lookup(dated[0].date);
  if (!anchor) return [];
  return dated.map((p) => ({ date: p.date, benchmark: lookup(p.date) / anchor - 1 }));
}
