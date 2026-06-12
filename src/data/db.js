// src/data/db.js
// Supabase persistence layer.
//
// Strategy: the app keeps its existing in-memory AppState shape and
// camelCase field names — every tab and analytics file is untouched.
// This module is the only place that knows about the database:
//   * loadStateFromDb(): fetch all rows, assemble AppState (seeds the
//     5 default accounts + settings for a brand-new user).
//   * persistDiff(prev, next): compare two AppStates, write only the
//     rows that changed (batched upserts + deletes).
//
// Column names are snake_case in Postgres; the FIELD_MAPS below are the
// single source of truth for the conversion.
import { supabase } from './supabaseClient.js';
import { makeDefaultState } from './defaults.js';
import { SCHEMA_VERSION } from './schema.js';

/* ----------------------------------------------------------------
 * Field maps: app (camelCase) → db (snake_case)
 * ---------------------------------------------------------------- */
const ACCOUNT_MAP = {
  id: 'id',
  name: 'name',
  currency: 'currency',
  initialBalance: 'initial_balance',
  riskPct: 'risk_pct',
  tierStart: 'tier_start',
  breachFloor: 'breach_floor',
  status: 'status',
  payoutSplit: 'payout_split',
  fxRate: 'fx_rate',
};

const TRADE_MAP = {
  id: 'id',
  accountId: 'account_id',
  filledDate: 'filled_date',
  tp1Date: 'tp1_date',
  closeDate: 'close_date',
  market: 'market',
  direction: 'direction',
  instrument: 'instrument',
  timeframe: 'timeframe',
  status: 'status',
  beAt11: 'be_at_11',
  tp1R: 'tp1_r',
  tp2R: 'tp2_r',
  totalR: 'total_r',
  tp1Pnl: 'tp1_pnl',
  tp2Pnl: 'tp2_pnl',
  totalPnl: 'total_pnl',
  result: 'result',
  entry: 'entry',
  stop: 'stop',
  tp1: 'tp1',
  exitPrice: 'exit_price',
  streak: 'streak',
  isWinner: 'is_winner',
  nonBreakeven: 'non_breakeven',
  tradeType: 'trade_type',
  lol: 'lol',
  mtfCoverage: 'mtf_coverage',
  loiFreshness: 'loi_freshness',
  riskPct: 'risk_pct',
  remarks: 'remarks',
};

const TX_MAP = {
  id: 'id',
  accountId: 'account_id',
  date: 'date',
  type: 'type',
  amount: 'amount',
  newHardLimit: 'new_hard_limit',
  profitSplit: 'profit_split',
  notes: 'notes',
};

// date-typed columns reject '' — normalize empties to null
const DATE_FIELDS = new Set(['filledDate', 'tp1Date', 'closeDate', 'date']);

// Postgres `numeric` columns come back from PostgREST as STRINGS (precision
// safety). The app's analytics do arithmetic on these fields, so they must
// be coerced back to JS numbers on load.
const NUMERIC_FIELDS = new Set([
  // accounts
  'initialBalance', 'riskPct', 'tierStart', 'breachFloor', 'payoutSplit', 'fxRate',
  // trades
  'tp1R', 'tp2R', 'totalR', 'tp1Pnl', 'tp2Pnl', 'totalPnl',
  'entry', 'stop', 'tp1', 'exitPrice', 'streak', 'isWinner', 'nonBreakeven',
  // transactions
  'amount', 'newHardLimit', 'profitSplit',
]);

function toDb(row, map) {
  const out = {};
  for (const [appKey, dbKey] of Object.entries(map)) {
    let v = row[appKey];
    if (v === undefined) v = null;
    if (DATE_FIELDS.has(appKey) && v === '') v = null;
    if (v !== null && v !== '' && NUMERIC_FIELDS.has(appKey)) {
      const n = Number(v);
      if (!Number.isNaN(n)) v = n;
    }
    out[dbKey] = v;
  }
  return out;
}

function fromDb(row, map) {
  const out = {};
  for (const [appKey, dbKey] of Object.entries(map)) {
    let v = row[dbKey] === undefined ? null : row[dbKey];
    if (v !== null && NUMERIC_FIELDS.has(appKey)) v = Number(v);
    out[appKey] = v;
  }
  return out;
}

function throwIf(error, ctx) {
  if (error) throw new Error(`[db] ${ctx}: ${error.message}`);
}

/* ----------------------------------------------------------------
 * Load
 * ---------------------------------------------------------------- */
export async function loadStateFromDb() {
  const [acc, tr, tx, st] = await Promise.all([
    supabase.from('accounts').select('*').order('sort_order', { ascending: true }),
    supabase.from('trades').select('*').order('filled_date', { ascending: true }),
    supabase.from('transactions').select('*').order('date', { ascending: true }),
    supabase.from('settings').select('*').maybeSingle(),
  ]);
  throwIf(acc.error, 'load accounts');
  throwIf(tr.error, 'load trades');
  throwIf(tx.error, 'load transactions');
  throwIf(st.error, 'load settings');

  // Brand-new user: seed the default accounts + settings, return defaults.
  if (!acc.data || acc.data.length === 0) {
    return seedDefaults();
  }

  return {
    version: st.data?.schema_version ?? SCHEMA_VERSION,
    accounts: acc.data.map((r) => fromDb(r, ACCOUNT_MAP)),
    trades: tr.data.map((r) => fromDb(r, TRADE_MAP)),
    transactions: tx.data.map((r) => fromDb(r, TX_MAP)),
    settings: { currencyMode: st.data?.currency_mode ?? 'BOTH' },
    updatedAt: st.data?.updated_at ?? new Date().toISOString(),
  };
}

async function seedDefaults() {
  const defaults = makeDefaultState();
  const accountRows = defaults.accounts.map((a, i) => ({ ...toDb(a, ACCOUNT_MAP), sort_order: i }));
  const { error: accErr } = await supabase.from('accounts').upsert(accountRows);
  throwIf(accErr, 'seed accounts');
  const { error: setErr } = await supabase.from('settings').upsert({
    currency_mode: defaults.settings.currencyMode,
    schema_version: defaults.version ?? SCHEMA_VERSION,
  });
  throwIf(setErr, 'seed settings');
  return defaults;
}

/* ----------------------------------------------------------------
 * Replace All (atomic, via RPC — see migrations/003_replace_journal.sql)
 * Deletes + inserts trades/transactions in ONE database transaction,
 * so a partial failure can never leave old and new rows mixed.
 * ---------------------------------------------------------------- */
export async function replaceJournal(trades, transactions) {
  const { error } = await supabase.rpc('replace_journal', {
    p_trades: (trades || []).map((t) => toDb(t, TRADE_MAP)),
    p_transactions: (transactions || []).map((t) => toDb(t, TX_MAP)),
  });
  throwIf(error, 'replace journal');
}

/* ----------------------------------------------------------------
 * Persist (diff-based)
 * ---------------------------------------------------------------- */
function diffCollection(prevArr = [], nextArr = [], map) {
  const prevById = new Map(prevArr.map((r) => [r.id, r]));
  const nextById = new Map(nextArr.map((r) => [r.id, r]));
  const upserts = [];
  const deletes = [];
  for (const [id, row] of nextById) {
    const before = prevById.get(id);
    if (!before || JSON.stringify(toDb(before, map)) !== JSON.stringify(toDb(row, map))) {
      upserts.push(toDb(row, map));
    }
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) deletes.push(id);
  }
  return { upserts, deletes };
}

/**
 * Write only what changed between two AppStates.
 * Order matters: account upserts first (FK targets), then child rows,
 * then child deletes, then account deletes (cascade would handle the
 * children anyway, but explicit is safer).
 */
export async function persistDiff(prev, next) {
  const acc = diffCollection(prev.accounts, next.accounts, ACCOUNT_MAP);
  const tr = diffCollection(prev.trades, next.trades, TRADE_MAP);
  const tx = diffCollection(prev.transactions, next.transactions, TX_MAP);

  // Preserve display order on any account change
  if (acc.upserts.length > 0) {
    const orderById = new Map(next.accounts.map((a, i) => [a.id, i]));
    for (const row of acc.upserts) row.sort_order = orderById.get(row.id) ?? 0;
  }

  if (acc.upserts.length) {
    const { error } = await supabase.from('accounts').upsert(acc.upserts);
    throwIf(error, 'upsert accounts');
  }
  if (tr.upserts.length) {
    const { error } = await supabase.from('trades').upsert(tr.upserts);
    throwIf(error, 'upsert trades');
  }
  if (tx.upserts.length) {
    const { error } = await supabase.from('transactions').upsert(tx.upserts);
    throwIf(error, 'upsert transactions');
  }
  if (tr.deletes.length) {
    const { error } = await supabase.from('trades').delete().in('id', tr.deletes);
    throwIf(error, 'delete trades');
  }
  if (tx.deletes.length) {
    const { error } = await supabase.from('transactions').delete().in('id', tx.deletes);
    throwIf(error, 'delete transactions');
  }
  if (acc.deletes.length) {
    const { error } = await supabase.from('accounts').delete().in('id', acc.deletes);
    throwIf(error, 'delete accounts');
  }

  if (prev.settings?.currencyMode !== next.settings?.currencyMode) {
    const { error } = await supabase.from('settings').upsert({
      currency_mode: next.settings.currencyMode,
      schema_version: next.version ?? SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
    });
    throwIf(error, 'update settings');
  }
}
