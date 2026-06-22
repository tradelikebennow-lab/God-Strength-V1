// src/tabs/Accounts.jsx
import React, { useState } from 'react';
import { ACCOUNT_STATUS, DRAWDOWN_TYPES } from '../data/schema.js';
import { fmtCur } from '../utils/currency.js';

const EMPTY_ACCT = (i) => ({
  id: `account-${i}`,
  name: `Account #${i}`,
  currency: 'USD',
  initialBalance: 0,
  riskPct: 0.01,
  tierStart: null,
  breachFloor: null,
  drawdownType: 'static',
  dailyLossLimit: null,
  status: 'Locked',
  payoutSplit: 0,
  fxRate: 1.0,
});

export default function Accounts({ state, setState }) {
  const { accounts, settings } = state;
  const currencyMode = settings.currencyMode;
  const eurFx = accounts.find((a) => a.currency === 'EUR')?.fxRate || 1.1723;
  const [editing, setEditing] = useState(null);

  function saveAccount(acct) {
    setState((s) => {
      const exists = s.accounts.find((a) => a.id === acct.id);
      const newAccts = exists
        ? s.accounts.map((a) => (a.id === acct.id ? acct : a))
        : [...s.accounts, acct];
      return { ...s, accounts: newAccts };
    });
    setEditing(null);
  }

  function addAccount() {
    const nextIdx = accounts.length + 1;
    if (nextIdx > 10) {
      alert('Maximum 10 account slots.');
      return;
    }
    setEditing(EMPTY_ACCT(nextIdx));
  }

  return (
    <div className="animate-in">
      <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Accounts</h1>
        <button className="btn btn-primary" onClick={addAccount} disabled={accounts.length >= 10}>
          + Add Account ({accounts.length}/10)
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 'var(--space-lg)' }}>
        {accounts.map((acc) => (
          <div key={acc.id} className="panel" onClick={() => setEditing(acc)} style={{ cursor: 'pointer' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-md)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)' }}>{acc.name}</h3>
              <span className={`badge ${acc.status === 'Unlocked' ? 'badge-success' : 'badge-muted'}`}>
                {acc.status}
              </span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <Field label="Currency" value={acc.currency} />
              <Field label="Risk %" value={(acc.riskPct * 100).toFixed(3) + '%'} />
              <Field label="Initial Balance" value={fmtCur(acc.initialBalance, acc.currency, currencyMode, eurFx, { decimals: 0 })} />
              <Field label="Payout Split" value={acc.payoutSplit ? (acc.payoutSplit * 100).toFixed(0) + '%' : '—'} />
              <Field label="Tier Start" value={acc.tierStart ? fmtCur(acc.tierStart, acc.currency, currencyMode, eurFx, { decimals: 0 }) : '—'} />
              <Field label="Breach Floor" value={acc.breachFloor ? fmtCur(acc.breachFloor, acc.currency, currencyMode, eurFx, { decimals: 0 }) : '—'} />
              <Field label="Drawdown" value={acc.breachFloor ? (acc.drawdownType === 'trailing' ? 'Trailing' : 'Static') : '—'} />
              <Field label="Daily Loss Limit" value={acc.dailyLossLimit ? fmtCur(acc.dailyLossLimit, acc.currency, currencyMode, eurFx, { decimals: 0 }) : '—'} />
              <Field label="FX → USD" value={(acc.fxRate ?? 1).toFixed(4)} />
              <Field label="Account ID" value={acc.id} mono />
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <AccountModal
          account={editing}
          onSave={saveAccount}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={mono ? 'mono' : ''} style={{ fontSize: 'var(--text-sm)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function AccountModal({ account, onSave, onCancel }) {
  const [form, setForm] = useState(account);
  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit {form.name}</h2>
          <button className="btn-icon" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label">Name</label>
              <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Currency</label>
              <select value={form.currency} onChange={(e) => setField('currency', e.target.value)}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Initial Balance</label>
              <input type="number" step="any" value={form.initialBalance} onChange={(e) => setField('initialBalance', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-field">
              <label className="form-label">Risk % (0.01 = 1%)</label>
              <input type="number" step="0.0001" value={form.riskPct} onChange={(e) => setField('riskPct', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-field">
              <label className="form-label">Tier Start (optional)</label>
              <input type="number" step="any" value={form.tierStart || ''} onChange={(e) => setField('tierStart', parseFloat(e.target.value) || null)} />
            </div>
            <div className="form-field">
              <label className="form-label">Breach Floor (optional)</label>
              <input type="number" step="any" value={form.breachFloor || ''} onChange={(e) => setField('breachFloor', parseFloat(e.target.value) || null)} />
            </div>
            <div className="form-field">
              <label className="form-label">Drawdown Type</label>
              <select value={form.drawdownType || 'static'} onChange={(e) => setField('drawdownType', e.target.value)}>
                {DRAWDOWN_TYPES.map((d) => <option key={d} value={d}>{d === 'trailing' ? 'Trailing' : 'Static'}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Daily Loss Limit (optional)</label>
              <input type="number" step="any" value={form.dailyLossLimit || ''} onChange={(e) => setField('dailyLossLimit', parseFloat(e.target.value) || null)} />
            </div>
            <div className="form-field">
              <label className="form-label">Status</label>
              <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
                {ACCOUNT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label">Payout Split (platform's share)</label>
              <input type="number" step="0.01" min="0" max="1" value={form.payoutSplit} onChange={(e) => setField('payoutSplit', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-field">
              <label className="form-label">FX Rate to USD</label>
              <input type="number" step="0.0001" value={form.fxRate} onChange={(e) => setField('fxRate', parseFloat(e.target.value) || 1)} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(form)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
