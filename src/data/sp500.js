// src/data/sp500.js
//
// S&P 500 (^GSPC) monthly closes. Used to compute a benchmark cumulative-return
// curve overlaid on the Portfolio TWR chart.
//
// Source: Yahoo Finance ^GSPC interval=1mo, fetched 2026-05-24.
// Each entry is the close as of the first trading day of that month.
// The Dec 2024 anchor lets curves starting in Jan 2025 begin at 0%.
//
// To refresh: pull monthly closes from Yahoo Finance, replace the array.
// Quarterly refresh cadence is fine — staleness ≤ 3 months affects ~5pp at most.

export const SP500_MONTHLY = [
  { date: '2024-12-01', close: 5881.63 },
  { date: '2025-01-01', close: 6040.53 },
  { date: '2025-02-01', close: 5954.50 },
  { date: '2025-03-01', close: 5611.85 },
  { date: '2025-04-01', close: 5569.06 },
  { date: '2025-05-01', close: 5911.69 },
  { date: '2025-06-01', close: 6204.95 },
  { date: '2025-07-01', close: 6339.39 },
  { date: '2025-08-01', close: 6460.26 },
  { date: '2025-09-01', close: 6688.46 },
  { date: '2025-10-01', close: 6840.20 },
  { date: '2025-11-01', close: 6849.09 },
  { date: '2025-12-01', close: 6845.50 },
  { date: '2026-01-01', close: 6939.03 },
  { date: '2026-02-01', close: 6878.88 },
  { date: '2026-03-01', close: 6528.52 },
  { date: '2026-04-01', close: 7209.01 },
  { date: '2026-05-01', close: 7473.47 },
  { date: '2026-05-22', close: 7473.47 }, // latest spot close
];

/**
 * Build a benchmark cumulative-return curve aligned to a portfolio TWR curve.
 *
 * For each point in the TWR curve, find the most recent S&P close at or before
 * that date and compute the % return from the curve's anchor (first non-null date).
 *
 * Returns the same date array as the input, with a `benchmark` field (% return).
 * If the TWR curve starts before our SP500 data, falls back to the earliest SP500 close.
 *
 * @param {Array<{date: string|null, twr: number}>} twrCurve
 * @returns {Array<{date: string, benchmark: number}>}
 */
export function buildBenchmarkCurve(twrCurve) {
  if (!twrCurve || twrCurve.length === 0) return [];

  const dated = twrCurve.filter((p) => p.date != null);
  if (dated.length === 0) return [];

  // Anchor = first event date in the user's curve
  const anchorDate = dated[0].date;
  const anchorClose = lookupCloseOnOrBefore(anchorDate);
  if (anchorClose == null) return [];

  return dated.map((p) => {
    const c = lookupCloseOnOrBefore(p.date);
    const ret = c != null ? c / anchorClose - 1 : 0;
    return { date: p.date, benchmark: ret };
  });
}

/** Binary search for the latest SP500 close on or before the given ISO date. */
function lookupCloseOnOrBefore(isoDate) {
  let lo = 0;
  let hi = SP500_MONTHLY.length - 1;
  let result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (SP500_MONTHLY[mid].date <= isoDate) {
      result = SP500_MONTHLY[mid].close;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // If isoDate is before our earliest data point, return the earliest anyway
  if (result == null && SP500_MONTHLY.length > 0) result = SP500_MONTHLY[0].close;
  return result;
}
