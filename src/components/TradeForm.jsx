// src/components/TradeForm.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { enrichTrade, detectMarket } from '../analytics/trade.js';
import { TIMEFRAMES, DIRECTIONS, TRADE_TYPES } from '../data/schema.js';
import { todayISO } from '../utils/dates.js';

const EMPTY_TRADE = () => ({
  id: '',
  accountId: '',
  filledDate: todayISO(),
  tp1Date: null,
  closeDate: todayISO(),
  market: 'Forex',
  direction: 'Buy',
  instrument: '',
  timeframe: '4H',
  status: 'Closed',
  beAt11: 'No',
  tp1R: 0, tp2R: 0, totalR: 0,
  tp1Pnl: 0, tp2Pnl: 0, totalPnl: 0,
  result: 'Breakeven',
  entry: 0, stop: 0, tp1: 0, exitPrice: 0,
  streak: 0, isWinner: 0, nonBreakeven: 0,
  tradeType: 'Sideways',
  lol: 'No', mtfCoverage: 'No', loiFreshness: 'No',
  riskPct: 0.005,
  remarks: '',
});

/**
 * Props:
 *   open: boolean
 *   trade: Trade | null (null = new trade)
 *   accounts: Account[]
 *   onSave(trade): void
 *   onCancel(): void
 */
export default function TradeForm({ open, trade, accounts, onSave, onCancel }) {
  const [form, setForm] = useState(() => trade || EMPTY_TRADE());
  const [errors, setErrors] = useState({});

  // Sync incoming trade prop
  useEffect(() => {
    if (open) {
      setForm(trade || EMPTY_TRADE());
      setErrors({});
    }
  }, [open, trade]);

  // Auto-fill computed fields whenever prices change
  const enriched = useMemo(() => {
    if (!form.entry || !form.stop || !form.tp1) return form;
    return enrichTrade({
      ...form,
      market: form.market || detectMarket(form.instrument),
    });
  }, [form.entry, form.stop, form.tp1, form.exitPrice, form.direction, form.instrument]);

  function setField(key, value) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  // Auto-detect market when instrument changes
  function handleInstrumentChange(value) {
    const upper = value.toUpperCase();
    setForm((s) => ({ ...s, instrument: upper, market: detectMarket(upper) }));
  }

  function validate() {
    const e = {};
    if (!form.accountId) e.accountId = 'Required';
    if (!form.instrument) e.instrument = 'Required';
    if (!form.entry) e.entry = 'Required';
    if (!form.stop) e.stop = 'Required';
    if (!form.filledDate) e.filledDate = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const final = enrichTrade({
      ...form,
      market: form.market || detectMarket(form.instrument),
    });
    if (!final.id) final.id = `t-${Date.now()}`;
    if (!final.tp1) final.tp1 = final.entry; // sane default
    if (!final.exitPrice) final.exitPrice = final.tp1;
    // Estimate PnL roughly from R-multiple × risk if not provided
    if (!final.totalPnl && final.riskPct) {
      const acct = accounts.find((a) => a.id === final.accountId);
      if (acct) final.totalPnl = final.totalR * (acct.initialBalance * final.riskPct);
    }
    onSave(final);
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{trade ? 'Edit Trade' : 'New Trade'}</h2>
          <button className="btn-icon" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body">
          <div className="form-section">
            <div className="form-section-title">Setup</div>
            <div className="form-grid">
              <Field label="Account" error={errors.accountId} required>
                <select value={form.accountId} onChange={(e) => setField('accountId', e.target.value)}>
                  <option value="">— Select —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Instrument" error={errors.instrument} required>
                <input
                  type="text"
                  placeholder="e.g. EURUSD"
                  value={form.instrument}
                  onChange={(e) => handleInstrumentChange(e.target.value)}
                />
              </Field>
              <Field label="Market (auto)">
                <input type="text" value={form.market} readOnly className="readonly-input" />
              </Field>
              <Field label="Direction">
                <select value={form.direction} onChange={(e) => setField('direction', e.target.value)}>
                  {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Timeframe">
                <select value={form.timeframe} onChange={(e) => setField('timeframe', e.target.value)}>
                  {TIMEFRAMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Risk %">
                <input type="number" step="0.0001" value={form.riskPct} onChange={(e) => setField('riskPct', parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Dates</div>
            <div className="form-grid">
              <Field label="Filled Date" error={errors.filledDate} required>
                <input type="date" value={form.filledDate} onChange={(e) => setField('filledDate', e.target.value)} />
              </Field>
              <Field label="TP1 Date">
                <input type="date" value={form.tp1Date || ''} onChange={(e) => setField('tp1Date', e.target.value || null)} />
              </Field>
              <Field label="Close Date">
                <input type="date" value={form.closeDate} onChange={(e) => setField('closeDate', e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Prices · R-multiples auto-fill</div>
            <div className="form-grid">
              <Field label="Entry" error={errors.entry} required>
                <input type="number" step="any" value={form.entry || ''} onChange={(e) => setField('entry', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Stop Loss" error={errors.stop} required>
                <input type="number" step="any" value={form.stop || ''} onChange={(e) => setField('stop', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="TP1 Price">
                <input type="number" step="any" value={form.tp1 || ''} onChange={(e) => setField('tp1', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Trailing/Exit">
                <input type="number" step="any" value={form.exitPrice || ''} onChange={(e) => setField('exitPrice', parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Total PnL">
                <input type="number" step="any" value={form.totalPnl || ''} onChange={(e) => setField('totalPnl', parseFloat(e.target.value) || 0)} />
              </Field>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Setup Quality</div>
            <div className="form-grid">
              <Field label="Trade Type">
                <select value={form.tradeType} onChange={(e) => setField('tradeType', e.target.value)}>
                  {TRADE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="LOL">
                <YesNo value={form.lol} onChange={(v) => setField('lol', v)} />
              </Field>
              <Field label="Multi-TF">
                <YesNo value={form.mtfCoverage} onChange={(v) => setField('mtfCoverage', v)} />
              </Field>
              <Field label="LOI Fresh">
                <YesNo value={form.loiFreshness} onChange={(v) => setField('loiFreshness', v)} />
              </Field>
              <Field label="BE at 1:1">
                <YesNo value={form.beAt11} onChange={(v) => setField('beAt11', v)} />
              </Field>
            </div>
          </div>

          {/* Computed preview */}
          {(enriched.tp1R !== 0 || enriched.totalR !== 0) && (
            <div className="form-preview">
              <div className="form-preview-title">Computed</div>
              <div className="flex gap-xl" style={{ flexWrap: 'wrap' }}>
                <Preview label="TP1 R" value={enriched.tp1R.toFixed(3)} tone={enriched.tp1R > 0 ? 'pos' : 'neg'} />
                <Preview label="TP2 R" value={enriched.tp2R.toFixed(3)} tone={enriched.tp2R > 0 ? 'pos' : 'neg'} />
                <Preview label="Total R" value={enriched.totalR.toFixed(3)} tone={enriched.totalR > 0 ? 'pos' : enriched.totalR < 0 ? 'neg' : 'default'} />
                <Preview label="Result" value={enriched.result} tone={enriched.result === 'Winner' ? 'pos' : enriched.result === 'Loser' ? 'neg' : 'default'} />
              </div>
            </div>
          )}

          <div className="form-section">
            <Field label="Remarks">
              <textarea
                rows={2}
                placeholder="Optional notes…"
                value={form.remarks}
                onChange={(e) => setField('remarks', e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </Field>
          </div>

          <div className="modal-actions">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit}>{trade ? 'Save Changes' : 'Add Trade'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, error, required }) {
  return (
    <div className="form-field">
      <label className="form-label">
        {label}{required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      {children}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

function YesNo({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        type="button"
        className={`filter-chip ${value === 'Yes' ? 'active' : ''}`}
        onClick={() => onChange('Yes')}
        style={{ flex: 1 }}
      >Yes</button>
      <button
        type="button"
        className={`filter-chip ${value === 'No' ? 'active' : ''}`}
        onClick={() => onChange('No')}
        style={{ flex: 1 }}
      >No</button>
    </div>
  );
}

function Preview({ label, value, tone }) {
  const toneClass = tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : '';
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`mono ${toneClass}`} style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
