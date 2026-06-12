// src/components/ImportModal.jsx
import React, { useState } from 'react';
import {
  parseWorkbook,
  detectSheets,
  parseTrades,
  parseTransactions,
  buildReplacementState,
} from '../data/import.js';
import { importJSON } from '../data/storage.js';

/**
 * Props:
 *   open: boolean
 *   accounts: Account[]
 *   onClose(): void
 *   onReplace(state): void
 */
export default function ImportModal({ open, accounts, onClose, onReplace, onRestoreFull }) {
  const [step, setStep] = useState('upload'); // upload | configure | preview | json-confirm | done
  const [mode, setMode] = useState('xlsx'); // xlsx | json
  const [wb, setWb] = useState(null);
  const [detected, setDetected] = useState(null);
  const [previewTrades, setPreviewTrades] = useState([]);
  const [previewTx, setPreviewTx] = useState([]);
  const [jsonState, setJsonState] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function reset() {
    setStep('upload');
    setMode('xlsx');
    setWb(null);
    setDetected(null);
    setPreviewTrades([]);
    setPreviewTx([]);
    setJsonState(null);
    setErrors([]);
    setBusy(false);
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors([]);
    const name = file.name.toLowerCase();
    const isJson = name.endsWith('.json');
    try {
      if (isJson) {
        setMode('json');
        const restored = await importJSON(file);
        setJsonState(restored);
        setStep('json-confirm');
      } else {
        setMode('xlsx');
        const workbook = await parseWorkbook(file);
        const det = detectSheets(workbook);
        setWb(workbook);
        setDetected(det);
        setStep('configure');
      }
    } catch (err) {
      setErrors([`Failed to parse file: ${err.message}`]);
    }
    // Reset input so re-uploading the same file fires onChange
    e.target.value = '';
  }

  async function handleJsonConfirm() {
    if (!jsonState || busy) return;
    setBusy(true);
    setErrors([]);
    try {
      // JSON restore replaces everything (accounts, settings, trades, transactions).
      // The handler writes to the database FIRST — "done" means actually saved.
      const handler = typeof onRestoreFull === 'function' ? onRestoreFull : onReplace;
      await handler(jsonState);
      setPreviewTrades(jsonState.trades || []);
      setPreviewTx(jsonState.transactions || []);
      setStep('done');
    } catch (err) {
      setErrors([`Restore failed — nothing was changed in the database: ${err.message}`]);
    } finally {
      setBusy(false);
    }
  }

  function handleParse() {
    if (!wb || !detected) return;
    const allErrors = [];
    let trades = [];
    let tx = [];
    if (detected.tradeSheet) {
      const r = parseTrades(wb, detected.tradeSheet, accounts);
      trades = r.trades;
      allErrors.push(...r.errors);
    }
    if (detected.txSheet) {
      const r = parseTransactions(wb, detected.txSheet, accounts);
      tx = r.transactions;
      allErrors.push(...r.errors);
    }
    setPreviewTrades(trades);
    setPreviewTx(tx);
    setErrors(allErrors);
    setStep('preview');
  }

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setErrors([]);
    try {
      const newState = buildReplacementState(previewTrades, previewTx, accounts);
      // Awaits the atomic DB write — the success screen is never shown
      // before the data is actually persisted.
      await onReplace(newState);
      setStep('done');
    } catch (err) {
      setErrors([`Import failed — your existing data is untouched: ${err.message}`]);
    } finally {
      setBusy(false);
    }
  }

  function handleDone() {
    reset();
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleDone}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Data</h2>
          <button className="btn-icon" onClick={handleDone}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {step === 'upload' && (
            <div className="step-upload">
              <p>Select an <strong>.xlsx</strong> file (initial migration) or a <strong>.json</strong> backup (restore).</p>
              <p className="muted">
                <strong>Replace All mode:</strong> this will wipe existing trades and transactions
                and replace them with the file's contents. Accounts are preserved for xlsx imports;
                JSON restores include accounts and settings from the backup.
              </p>
              {errors.length > 0 && (
                <div className="warn-box">
                  <strong>Error:</strong>
                  <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              <label className="btn btn-primary">
                Choose File
                <input
                  type="file"
                  accept=".xlsx,.xls,.json"
                  onChange={handleFile}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}

          {step === 'configure' && (
            <div className="step-configure">
              <p>Detected sheets in your workbook:</p>
              <ul className="detection-list">
                <li>
                  Trade Log:{' '}
                  {detected.tradeSheet ? (
                    <span className="ok">✓ {detected.tradeSheet}</span>
                  ) : (
                    <span className="err">✗ not found</span>
                  )}
                </li>
                <li>
                  Transactions:{' '}
                  {detected.txSheet ? (
                    <span className="ok">✓ {detected.txSheet}</span>
                  ) : (
                    <span className="err">✗ not found</span>
                  )}
                </li>
              </ul>
              <p className="muted">All other sheets (Dashboard, Helper, Data, etc.) are ignored.</p>
              <div className="modal-actions">
                <button className="btn" onClick={reset}>
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleParse}
                  disabled={!detected.tradeSheet && !detected.txSheet}
                >
                  Parse & Preview
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="step-preview">
              <div className="preview-summary">
                <div className="preview-stat">
                  <div className="preview-stat-label">Trades</div>
                  <div className="preview-stat-value">{previewTrades.length}</div>
                </div>
                <div className="preview-stat">
                  <div className="preview-stat-label">Transactions</div>
                  <div className="preview-stat-value">{previewTx.length}</div>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="warn-box">
                  <strong>{errors.length} warning(s):</strong>
                  <ul>
                    {errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {errors.length > 5 && <li>… and {errors.length - 5} more</li>}
                  </ul>
                </div>
              )}

              <div className="danger-box">
                ⚠ Confirming will <strong>wipe all existing trades and transactions</strong> and
                load these {previewTrades.length} trades + {previewTx.length} transactions.
              </div>

              <div className="modal-actions">
                <button className="btn" onClick={reset} disabled={busy}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleConfirm} disabled={busy}>
                  {busy ? 'Writing to database…' : 'Replace All Data'}
                </button>
              </div>
            </div>
          )}

          {step === 'json-confirm' && jsonState && (
            <div className="step-preview">
              <p>Restoring from JSON backup:</p>
              <div className="preview-summary">
                <div className="preview-stat">
                  <div className="preview-stat-label">Accounts</div>
                  <div className="preview-stat-value">{(jsonState.accounts || []).length}</div>
                </div>
                <div className="preview-stat">
                  <div className="preview-stat-label">Trades</div>
                  <div className="preview-stat-value">{(jsonState.trades || []).length}</div>
                </div>
                <div className="preview-stat">
                  <div className="preview-stat-label">Transactions</div>
                  <div className="preview-stat-value">{(jsonState.transactions || []).length}</div>
                </div>
              </div>

              {jsonState.updatedAt && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Backup taken: {String(jsonState.updatedAt).slice(0, 19).replace('T', ' ')}
                </p>
              )}

              <div className="danger-box">
                ⚠ This will <strong>wipe ALL current data</strong> (accounts, trades, transactions, settings)
                and replace it with the backup contents. This cannot be undone.
              </div>

              {errors.length > 0 && (
                <div className="warn-box">
                  <strong>Error:</strong>
                  <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn" onClick={reset} disabled={busy}>Cancel</button>
                <button className="btn btn-danger" onClick={handleJsonConfirm} disabled={busy}>
                  {busy ? 'Writing to database…' : 'Restore Backup'}
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="step-done">
              <h3>✓ {mode === 'json' ? 'Backup Restored' : 'Data Replaced'}</h3>
              <p>
                Loaded {previewTrades.length} trades and {previewTx.length} transactions.
              </p>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleDone}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
