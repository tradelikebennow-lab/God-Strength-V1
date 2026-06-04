// src/tabs/Transactions.jsx
import React, { useState, useMemo } from 'react';
import MiniTable from '../components/MiniTable.jsx';
import { TRANSACTION_TYPES } from '../data/schema.js';
import { fmtCur } from '../utils/currency.js';
import { todayISO } from '../utils/dates.js';

const EMPTY_TX = () => ({
  id: '',
  accountId: '',
  date: todayISO(),
  type: 'Deposit',
  amount: 0,
  newHardLimit: null,
  profitSplit: null,
  notes: '',
});

export default function Transactions({ state, setState }) {
  const { accounts, transactions, settings } = state;
  const currencyMode = settings.currencyMode;
  const eurFx = accounts.find((a) => a.currency === 'EUR')?.fxRate || 1.1723;
  const acctById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  const [editing, setEditing] = useState(null);

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [transactions]
  );

  function saveTx(tx) {
    if (!tx.id) tx.id = `tx-${Date.now()}`;
    setState((s) => {
      const exists = s.transactions.find((t) => t.id === tx.id);
      const newTx = exists
        ? s.transactions.map((t) => (t.id === tx.id ? tx : t))
        : [...s.transactions, tx];
      return { ...s, transactions: newTx };
    });
    setEditing(null);
  }

  function deleteTx(tx) {
    const acct = acctById[tx.accountId]?.name || tx.accountId;
    if (!confirm(`Delete ${tx.type} of ${tx.amount} on ${acct} (${tx.date})?`)) return;
    setState((s) => ({ ...s, transactions: s.transactions.filter((t) => t.id !== tx.id) }));
  }

  const rows = sorted.map((tx) => ({
    ...tx,
    accountName: acctById[tx.accountId]?.name || tx.accountId,
    accountCurrency: acctById[tx.accountId]?.currency || 'USD',
  }));

  return (
    <div className="animate-in">
      <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Transactions</h1>
        <button className="btn btn-primary" onClick={() => setEditing(EMPTY_TX())}>+ New Transaction</button>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <MiniTable
          columns={[
            { key: 'date', label: 'Date', sortable: true },
            { key: 'accountName', label: 'Account', sortable: true },
            { key: 'type', label: 'Type', sortable: true,
              format: (v) => <span className={`badge ${
                v === 'Deposit' ? 'badge-success' :
                v === 'Payout' ? 'badge-success' :
                v === 'Withdrawal' ? 'badge-danger' :
                'badge-muted'
              }`}>{v}</span> },
            { key: 'amount', label: 'Amount', align: 'right', sortable: true,
              format: (v, row) => {
                const sign = row.type === 'Withdrawal' ? -1 : 1;
                return fmtCur(v * sign, row.accountCurrency, currencyMode, eurFx);
              } },
            { key: 'newHardLimit', label: 'New Limit', align: 'right',
              format: (v, row) => v ? fmtCur(v, row.accountCurrency, currencyMode, eurFx, { decimals: 0 }) : '—' },
            { key: 'profitSplit', label: 'Split',
              format: (v) => v != null ? (v * 100).toFixed(0) + '%' : '—' },
            { key: 'notes', label: 'Notes' },
            { key: 'actions', label: '',
              format: (_, row) => (
                <div className="flex gap-xs" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); setEditing(row); }} title="Edit">✎</button>
                  <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); deleteTx(row); }} title="Delete">🗑</button>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </div>

      {editing && (
        <TxModal
          tx={editing}
          accounts={accounts}
          onSave={saveTx}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TxModal({ tx, accounts, onSave, onCancel }) {
  const [form, setForm] = useState(tx);
  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  function handleSave() {
    if (!form.accountId || !form.date || !form.type || !form.amount) {
      alert('Account, Date, Type, and Amount are required.');
      return;
    }
    onSave(form);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{tx.id ? 'Edit' : 'New'} Transaction</h2>
          <button className="btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Account</label>
              <select value={form.accountId} onChange={(e) => setField('accountId', e.target.value)}>
                <option value="">— Select —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Type</label>
              <select value={form.type} onChange={(e) => setField('type', e.target.value)}>
                {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Amount</label>
              <input type="number" step="any" value={form.amount} onChange={(e) => setField('amount', parseFloat(e.target.value) || 0)} />
            </div>
            {form.type === 'Upgrade' && (
              <div className="form-field">
                <label className="form-label">New Hard Limit</label>
                <input type="number" step="any" value={form.newHardLimit || ''} onChange={(e) => setField('newHardLimit', parseFloat(e.target.value) || null)} />
              </div>
            )}
            {form.type === 'Payout' && (
              <div className="form-field">
                <label className="form-label">Profit Split (platform's share, 0-1)</label>
                <input type="number" step="0.01" min="0" max="1" value={form.profitSplit || ''} onChange={(e) => setField('profitSplit', parseFloat(e.target.value) || null)} />
              </div>
            )}
          </div>
          <div className="form-field mt-lg">
            <label className="form-label">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setField('notes', e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
