// src/utils/dates.js
// All dates are ISO strings "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS".
// We work on strings to avoid timezone drift around midnight UTC.

export function dateYear(iso) {
  return parseInt(String(iso).slice(0, 4), 10);
}

export function dateMonth(iso) {
  // Returns 1..12
  return parseInt(String(iso).slice(5, 7), 10);
}

export function dateDay(iso) {
  return parseInt(String(iso).slice(8, 10), 10);
}

/** Compare two ISO date strings. Returns -1, 0, or 1. */
export function dateSort(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Day-difference between two ISO dates (b - a). Anchors at noon to avoid DST drift. */
export function dateDiffDays(a, b) {
  if (!a || !b) return 0;
  const ta = Date.parse(String(a).slice(0, 10) + 'T12:00:00Z');
  const tb = Date.parse(String(b).slice(0, 10) + 'T12:00:00Z');
  if (!isFinite(ta) || !isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86400000);
}

/** Day-of-week 0..6 (Sun..Sat). */
export function dayOfWeek(iso) {
  const t = Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z');
  return new Date(t).getUTCDay();
}

export const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today's ISO date in local time. */
export function todayISO() {
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}

/** "Jan", "Feb", ... from 1..12. */
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
