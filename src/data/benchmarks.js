// src/data/benchmarks.js
// Daily benchmark closes from the index_closes table (refreshed weekly by
// the GitHub Action). Falls back to the embedded monthly S&P data in
// sp500.js when the table has no rows for a symbol yet.
import { supabase } from './supabaseClient.js';

export const BENCHMARKS = [
  { symbol: 'SPX', label: 'S&P 500' },
  { symbol: 'NDX', label: 'Nasdaq 100' },
  { symbol: 'XAUUSD', label: 'Gold' },
  { symbol: 'BTCUSD', label: 'Bitcoin' },
];

/** Fetch all closes for all benchmark symbols. Returns { SPX: [{date, close}], ... }
 * Paginated: Supabase caps each request at 1000 rows, and with 4 symbols the
 * table exceeds that — a single query would silently drop the newest dates
 * and flatten every benchmark to 0%. */
export async function loadIndexCloses() {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('index_closes')
      .select('symbol, date, close')
      .order('symbol', { ascending: true })
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('[benchmarks] load failed', error);
      return {};
    }
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  const by = {};
  for (const r of all) {
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
