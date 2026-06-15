// src/data/validate.js
// Pure validation helpers for the import/restore flow. Kept separate from
// db.js so they carry no Supabase dependency and stay trivially testable.

/**
 * Find account IDs referenced by trades/transactions that don't exist in the
 * given accounts list. Every trade/transaction row carries an `accountId` with
 * a foreign key to accounts; if any is missing, the atomic replace_journal RPC
 * throws an opaque FK error and the whole import fails. Calling this first lets
 * us surface a friendly message instead.
 *
 * @returns {string[]} sorted unique list of missing accountIds (empty = OK)
 */
export function validateAccountRefs(accounts, trades = [], transactions = []) {
  const ids = new Set((accounts || []).map((a) => a.id));
  const missing = new Set();
  for (const t of trades || []) {
    if (t && t.accountId != null && !ids.has(t.accountId)) missing.add(t.accountId);
  }
  for (const x of transactions || []) {
    if (x && x.accountId != null && !ids.has(x.accountId)) missing.add(x.accountId);
  }
  return [...missing].sort();
}
