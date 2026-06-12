// src/components/TopBar.jsx
import React from 'react';
import TabNav from './TabNav.jsx';
import CurrencyToggle from './CurrencyToggle.jsx';
import FilterPopover from './FilterPopover.jsx';

export default function TopBar({
  activeTab,
  onTabChange,
  currencyMode,
  onCurrencyChange,
  yearFilter,
  onYearChange,
  accountFilter,
  onAccountChange,
  strategyFilter,
  onStrategyChange,
  accounts,
  availableYears,
  onImportClick,
  onExportClick,
  onSignOut,
  saveStatus = 'saved',
  onRetrySave,
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">G</div>
          <div className="flex items-center gap-sm">
            <span className="brand-name">God Strength</span>
            <span className="brand-version">v1</span>
          </div>
        </div>

        <TabNav active={activeTab} onChange={onTabChange} />

        <div className="filter-bar">
          {saveStatus === 'saving' && (
            <span className="save-pill save-pill-saving" title="Writing changes to the database…">Saving…</span>
          )}
          {saveStatus === 'error' && (
            <button
              className="save-pill save-pill-error"
              onClick={onRetrySave}
              title="Last save failed — your latest changes are NOT in the database yet. Click to retry."
            >
              ⚠ Save failed — Retry
            </button>
          )}

          <CurrencyToggle value={currencyMode} onChange={onCurrencyChange} />

          <FilterPopover
            yearFilter={yearFilter}
            onYearChange={onYearChange}
            accountFilter={accountFilter}
            onAccountChange={onAccountChange}
            strategyFilter={strategyFilter}
            onStrategyChange={onStrategyChange}
            accounts={accounts}
            availableYears={availableYears}
          />

          <button className="btn btn-ghost btn-icon" onClick={onImportClick} title="Import xlsx">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v9m0 0l-3-3m3 3l3-3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="btn btn-ghost btn-icon" onClick={onExportClick} title="Export JSON backup">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 11V2m0 0l-3 3m3-3l3 3M3 13h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(180 8 8)" />
            </svg>
          </button>
          <button className="btn btn-ghost btn-icon" onClick={onSignOut} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
