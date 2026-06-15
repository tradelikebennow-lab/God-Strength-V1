// src/data/storage.js
// Persistence moved to Supabase (see data/db.js). This file now only holds the
// JSON backup/restore helpers; the old localStorage load/save/clear were removed.
import { SCHEMA_VERSION } from './schema.js';

/** Trigger a JSON download of current state. */
export function exportJSON(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `god-strength-v1_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Import state from a JSON file. Returns parsed state or throws. */
export async function importJSON(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON: not an object');
  }
  if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.trades) || !Array.isArray(parsed.transactions)) {
    throw new Error('Invalid JSON: missing accounts/trades/transactions arrays');
  }
  // Shape validation — a hand-edited or foreign backup must fail HERE,
  // not crash the app after the state has already been swapped in.
  if (!parsed.settings || typeof parsed.settings !== 'object' || Array.isArray(parsed.settings)) {
    throw new Error('Invalid backup: missing settings object');
  }
  if (!['USD', 'EUR', 'BOTH'].includes(parsed.settings.currencyMode)) {
    throw new Error(`Invalid backup: settings.currencyMode must be USD/EUR/BOTH (got "${parsed.settings.currencyMode}")`);
  }
  for (const [i, a] of parsed.accounts.entries()) {
    if (!a || typeof a !== 'object' || !a.id || typeof a.name !== 'string') {
      throw new Error(`Invalid backup: accounts[${i}] missing id/name`);
    }
  }
  for (const [i, t] of parsed.trades.entries()) {
    if (!t || typeof t !== 'object' || !t.id || !t.accountId || !t.filledDate) {
      throw new Error(`Invalid backup: trades[${i}] missing id/accountId/filledDate`);
    }
  }
  for (const [i, x] of parsed.transactions.entries()) {
    if (!x || typeof x !== 'object' || !x.id || !x.accountId || !x.date || typeof x.amount !== 'number') {
      throw new Error(`Invalid backup: transactions[${i}] missing id/accountId/date/amount`);
    }
  }
  return migrateIfNeeded(parsed);
}

/** Forward-compat: handle older schema versions if we ever bump SCHEMA_VERSION. */
function migrateIfNeeded(state) {
  if (!state.version || state.version < SCHEMA_VERSION) {
    // No migrations yet — just stamp the version.
    return { ...state, version: SCHEMA_VERSION };
  }
  return state;
}
