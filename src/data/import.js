// src/data/import.js
import * as XLSX from 'xlsx';
import { DEFAULT_ACCOUNTS } from './defaults.js';
import {
  SCHEMA_VERSION,
  TRADE_RESULTS,
  TRADE_TYPES,
  MARKETS,
  TIMEFRAMES,
  TRANSACTION_TYPES,
} from './schema.js';

/* ------------------------------------------------------------------ *
 *  Header normalization
 * ------------------------------------------------------------------ */

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Column header → canonical field name. Fuzzy match against known aliases. */
const TRADE_COL_MAP = {
  filledDate: ['filleddate', 'filled', 'opendate', 'entrydate'],
  tp1Date: ['tp1date', 'firsttargetdate'],
  closeDate: ['closedate', 'closed', 'exitdate'],
  accountName: ['accounttype', 'account'],
  market: ['market', 'assetclass'],
  direction: ['buysell', 'direction', 'side'],
  instrument: ['instrument', 'symbol', 'pair', 'ticker'],
  timeframe: ['executiontimeframe', 'timeframe', 'tf'],
  status: ['status'],
  beAt11: ['beat11', 'breakevenat11', 'beat1to1'],
  tp1R: ['tp1rmultiple', 'tp1r'],
  tp2R: ['tp2rmultiple', 'tp2r'],
  totalR: ['totalrmultiple', 'totalr'],
  tp1Pnl: ['tp1pnl'],
  tp2Pnl: ['tp2pnl'],
  totalPnl: ['totalpnl', 'pnl', 'profitloss'],
  result: ['traderesult', 'result'],
  entry: ['entryprice', 'entry'],
  stop: ['stoploss', 'stop', 'sl'],
  tp1: ['tp1price', 'tp1', 'firsttarget'],
  exitPrice: ['trailingexitprice', 'exitprice', 'closeprice'],
  streak: ['streakcounter', 'streak'],
  isWinner: ['iswinner'],
  nonBreakeven: ['nonbreakeven'],
  tradeType: ['tradetype'],
  lol: ['levelonlevellol', 'lol', 'levelonlevel'],
  mtfCoverage: ['multitfcoverage', 'mtf'],
  loiFreshness: ['loifreshness', 'freshness'],
  riskPct: ['risksize', 'risk', 'risksizepct'],
  remarks: ['remarks', 'notes', 'comment'],
};

const TX_COL_MAP = {
  date: ['date'],
  accountName: ['account', 'accountname'],
  type: ['transactiontype', 'type'],
  amount: ['amount'],
  newHardLimit: ['newhardlimit', 'newlimit'],
  profitSplit: ['profitsplit', 'split'],
  notes: ['notes', 'remarks'],
};

function buildHeaderIndex(headers, colMap) {
  const idx = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(colMap)) {
      if (aliases.includes(n)) {
        if (idx[field] === undefined) idx[field] = i;
      }
    }
  });
  return idx;
}

/* ------------------------------------------------------------------ *
 *  Type coercion
 * ------------------------------------------------------------------ */

/** Excel serial date → ISO "YYYY-MM-DD" (timezone-safe). */
function excelDateToISO(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'string') {
    // Already a date string
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    // Non-ISO string (e.g. "5/12/2025"): use LOCAL date components.
    // toISOString() here would convert local midnight to UTC and shift
    // the date back one day in GMT+8.
    const d = new Date(val);
    if (!isNaN(d)) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    // Excel epoch: 1900-01-00 = serial 0. Day 60 doesn't exist (1900 leap bug).
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + val * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

function num(val, fallback = 0) {
  if (val == null || val === '') return fallback;
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  return isFinite(n) ? n : fallback;
}

function str(val, fallback = '') {
  if (val == null) return fallback;
  return String(val).trim();
}

/**
 * Coerce a value to one of the allowed enum values (Postgres CHECK
 * constraints reject anything else — and one bad cell would fail the
 * ENTIRE multi-row insert). Case-insensitive match; otherwise fallback
 * with a warning pushed to `errors`.
 */
function coerceEnum(val, allowed, fallback, errors, rowNum, field) {
  const s = str(val);
  if (!s) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  if (hit) return hit;
  errors.push(`Row ${rowNum}: invalid ${field} "${s}" → using "${fallback}"`);
  return fallback;
}

/* ------------------------------------------------------------------ *
 *  Account name → ID resolution
 * ------------------------------------------------------------------ */

function resolveAccountId(name, accounts) {
  const target = norm(name);
  for (const a of accounts) {
    if (norm(a.name) === target) return a.id;
    if (norm(a.id) === target) return a.id;
  }
  // Strip suffixes like "FTMO Challenge" → "FTMO"
  for (const a of accounts) {
    if (target.startsWith(norm(a.name))) return a.id;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 *  Sheet auto-detection
 * ------------------------------------------------------------------ */

const TRADE_SHEET_HINTS = ['tradelog', 'trades', 'tradejournal'];
const TX_SHEET_HINTS = ['transactions', 'transaction', 'banking'];

function detectSheet(workbook, hints) {
  for (const name of workbook.SheetNames) {
    if (hints.includes(norm(name))) return name;
  }
  // Fuzzy contains
  for (const name of workbook.SheetNames) {
    const n = norm(name);
    for (const h of hints) if (n.includes(h)) return name;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 *  Public API
 * ------------------------------------------------------------------ */

export async function parseWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  return wb;
}

export function detectSheets(wb) {
  return {
    tradeSheet: detectSheet(wb, TRADE_SHEET_HINTS),
    txSheet: detectSheet(wb, TX_SHEET_HINTS),
    allSheets: wb.SheetNames,
  };
}

export function parseTrades(wb, sheetName, accounts = DEFAULT_ACCOUNTS) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { trades: [], errors: ['Sheet not found: ' + sheetName] };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (rows.length < 2) return { trades: [], errors: ['Empty trade sheet'] };

  const headers = rows[0];
  const idx = buildHeaderIndex(headers, TRADE_COL_MAP);
  const errors = [];

  const trades = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v == null || v === '')) continue;
    const accountName = str(row[idx.accountName]);
    if (!accountName) continue;
    const accountId = resolveAccountId(accountName, accounts);
    if (!accountId) {
      errors.push(`Row ${i + 1}: unknown account "${accountName}"`);
      continue;
    }
    const filledDate = excelDateToISO(row[idx.filledDate]);
    if (!filledDate) {
      errors.push(`Row ${i + 1}: missing filled date`);
      continue;
    }
    trades.push({
      id: `imp-${i}-${Date.now()}`,
      accountId,
      filledDate,
      tp1Date: excelDateToISO(row[idx.tp1Date]),
      closeDate: excelDateToISO(row[idx.closeDate]) ?? filledDate,
      market: coerceEnum(row[idx.market], MARKETS, 'Forex', errors, i + 1, 'market'),
      direction: str(row[idx.direction]) === 'Sell' ? 'Sell' : 'Buy',
      instrument: str(row[idx.instrument]).toUpperCase(),
      timeframe: coerceEnum(row[idx.timeframe], TIMEFRAMES, '4H', errors, i + 1, 'timeframe'),
      status: coerceEnum(row[idx.status], ['Open', 'Closed'], 'Closed', errors, i + 1, 'status'),
      beAt11: str(row[idx.beAt11]) === 'Yes' ? 'Yes' : 'No',
      tp1R: num(row[idx.tp1R]),
      tp2R: num(row[idx.tp2R]),
      totalR: num(row[idx.totalR]),
      tp1Pnl: num(row[idx.tp1Pnl]),
      tp2Pnl: num(row[idx.tp2Pnl]),
      totalPnl: num(row[idx.totalPnl]),
      result: coerceEnum(row[idx.result], TRADE_RESULTS, 'Breakeven', errors, i + 1, 'result'),
      entry: num(row[idx.entry]),
      stop: num(row[idx.stop]),
      tp1: num(row[idx.tp1]),
      exitPrice: num(row[idx.exitPrice]),
      streak: num(row[idx.streak]),
      isWinner: num(row[idx.isWinner]) ? 1 : 0,
      nonBreakeven: num(row[idx.nonBreakeven]) ? 1 : 0,
      tradeType: coerceEnum(row[idx.tradeType], TRADE_TYPES, 'Sideways', errors, i + 1, 'tradeType'),
      lol: str(row[idx.lol]) === 'Yes' ? 'Yes' : 'No',
      mtfCoverage: str(row[idx.mtfCoverage]) === 'Yes' ? 'Yes' : 'No',
      loiFreshness: str(row[idx.loiFreshness]) === 'Yes' ? 'Yes' : 'No',
      riskPct: num(row[idx.riskPct]),
      remarks: str(row[idx.remarks]),
    });
  }
  return { trades, errors };
}

export function parseTransactions(wb, sheetName, accounts = DEFAULT_ACCOUNTS) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return { transactions: [], errors: ['Sheet not found: ' + sheetName] };
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  if (rows.length < 2) return { transactions: [], errors: ['Empty transaction sheet'] };

  const headers = rows[0];
  const idx = buildHeaderIndex(headers, TX_COL_MAP);
  const errors = [];

  const transactions = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v == null || v === '')) continue;
    const date = excelDateToISO(row[idx.date]);
    const accountName = str(row[idx.accountName]);
    const rawType = str(row[idx.type]);
    const amount = num(row[idx.amount], NaN);
    if (!date || !accountName || !rawType || !isFinite(amount)) continue;
    const type = TRANSACTION_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase());
    if (!type) {
      errors.push(`Row ${i + 1}: invalid transaction type "${rawType}" — skipped`);
      continue;
    }
    const accountId = resolveAccountId(accountName, accounts);
    if (!accountId) {
      errors.push(`Row ${i + 1}: unknown account "${accountName}"`);
      continue;
    }
    transactions.push({
      id: `imp-tx-${i}-${Date.now()}`,
      accountId,
      date,
      type,
      amount,
      newHardLimit: row[idx.newHardLimit] != null ? num(row[idx.newHardLimit]) : null,
      profitSplit: row[idx.profitSplit] != null ? num(row[idx.profitSplit]) : null,
      notes: str(row[idx.notes]),
    });
  }
  return { transactions, errors };
}

/** Combine parsed pieces into a fresh AppState for Replace-All mode. */
export function buildReplacementState(trades, transactions, currentAccounts) {
  return {
    version: SCHEMA_VERSION,
    accounts: currentAccounts.map((a) => ({ ...a })),
    trades,
    transactions,
    settings: { currencyMode: 'BOTH' },
    updatedAt: new Date().toISOString(),
  };
}
