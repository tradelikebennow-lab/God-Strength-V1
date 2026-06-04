// src/components/FilterPopover.jsx
import React, { useState, useRef, useEffect } from 'react';

const STRATEGIES = [
  { id: null, label: 'All Strategies' },
  { id: 'Swing', label: 'Swing' },
  { id: 'Swing 4H / Daily', label: 'Swing 4H / Daily' },
  { id: 'Swing Daily / Weekly', label: 'Swing Daily / Weekly' },
  { id: 'Intraday', label: 'Intraday' },
  { id: 'Intraday 15 min / 1H', label: 'Intraday 15 min / 1H' },
  { id: 'Intraday 5 min', label: 'Intraday 5 min' },
];

export default function FilterPopover({
  yearFilter,
  onYearChange,
  accountFilter,
  onAccountChange,
  strategyFilter,
  onStrategyChange,
  accounts,
  availableYears,
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (popoverRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Count active filters
  const activeCount =
    (yearFilter !== null ? 1 : 0) +
    (accountFilter !== null ? 1 : 0) +
    (strategyFilter !== null ? 1 : 0);

  const clearAll = () => {
    onYearChange(null);
    onAccountChange(null);
    onStrategyChange(null);
  };

  const accountName = accountFilter
    ? accounts.find((a) => a.id === accountFilter)?.name
    : null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        className={`btn ${activeCount > 0 ? 'btn-filter-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 3h10M3.5 7h7M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>Filters</span>
        {activeCount > 0 && <span className="filter-pill">{activeCount}</span>}
      </button>

      {open && (
        <div ref={popoverRef} className="filter-popover">
          <div className="filter-popover-header">
            <span className="panel-title" style={{ margin: 0 }}>Filters</span>
            {activeCount > 0 && (
              <button className="btn-ghost-text" onClick={clearAll}>Clear all</button>
            )}
          </div>

          <div className="filter-section">
            <label className="filter-label">Year</label>
            <div className="filter-chips">
              <Chip active={yearFilter === null} onClick={() => onYearChange(null)}>All</Chip>
              {availableYears.map((y) => (
                <Chip key={y} active={yearFilter === y} onClick={() => onYearChange(y)}>{y}</Chip>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label className="filter-label">Account</label>
            <div className="filter-chips">
              <Chip active={accountFilter === null} onClick={() => onAccountChange(null)}>All</Chip>
              {accounts.map((a) => (
                <Chip key={a.id} active={accountFilter === a.id} onClick={() => onAccountChange(a.id)}>
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <label className="filter-label">Strategy</label>
            <div className="filter-chips">
              {STRATEGIES.map((s) => (
                <Chip key={s.label} active={strategyFilter === s.id} onClick={() => onStrategyChange(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>

          {activeCount > 0 && (
            <div className="filter-summary">
              <span className="dim">Active:</span>{' '}
              {yearFilter && <span className="badge badge-muted">Year: {yearFilter}</span>}{' '}
              {accountName && <span className="badge badge-muted">Acct: {accountName}</span>}{' '}
              {strategyFilter && <span className="badge badge-muted">{strategyFilter}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      className={`filter-chip ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
