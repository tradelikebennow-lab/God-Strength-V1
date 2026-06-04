// src/App.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { loadState, saveState, exportJSON } from './data/storage.js';
import { dateYear } from './utils/dates.js';
import TopBar from './components/TopBar.jsx';
import ImportModal from './components/ImportModal.jsx';
import Dashboard from './tabs/Dashboard.jsx';
import InDepth from './tabs/InDepth.jsx';
import TradeLog from './tabs/TradeLog.jsx';
import Transactions from './tabs/Transactions.jsx';
import Accounts from './tabs/Accounts.jsx';
import RuleBook from './tabs/RuleBook.jsx';

export default function App() {
  // ---- App state (persisted) ----
  const [state, setState] = useState(() => loadState());

  // ---- UI state (ephemeral) ----
  const [activeTab, setActiveTab] = useState('dashboard');
  const [yearFilter, setYearFilter] = useState(null);
  const [accountFilter, setAccountFilter] = useState(null);
  const [strategyFilter, setStrategyFilter] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // ---- Persist state changes ----
  useEffect(() => {
    saveState(state);
  }, [state]);

  // ---- Derived: available years from data ----
  const availableYears = useMemo(() => {
    const years = new Set();
    for (const t of state.trades) {
      if (t.filledDate) years.add(dateYear(t.filledDate));
    }
    return [...years].sort((a, b) => b - a);
  }, [state.trades]);

  // ---- Auto-select most recent year ONCE when trades first load ----
  // Runs a single time (guarded by ref) so the user can later pick "All"
  // (null) without this effect snapping the filter back to the latest year.
  const yearInitialized = useRef(false);
  useEffect(() => {
    if (!yearInitialized.current && availableYears.length > 0) {
      yearInitialized.current = true;
      if (yearFilter === null) setYearFilter(availableYears[0]);
    }
  }, [availableYears, yearFilter]);

  // ---- Currency mode change ----
  const setCurrencyMode = useCallback((mode) => {
    setState((s) => ({ ...s, settings: { ...s.settings, currencyMode: mode } }));
  }, []);

  // ---- Import handler (xlsx — preserves accounts + settings) ----
  const handleReplace = useCallback((newState) => {
    setState({
      ...newState,
      accounts: state.accounts, // preserve account config
      settings: state.settings,
    });
  }, [state.accounts, state.settings]);

  // ---- Restore handler (JSON backup — replaces everything verbatim) ----
  const handleRestoreFull = useCallback((newState) => {
    setState(newState);
  }, []);

  // ---- Export handler ----
  const handleExport = useCallback(() => {
    exportJSON(state);
  }, [state]);

  // ---- Filters object passed to tabs ----
  const filters = useMemo(
    () => ({ year: yearFilter, accountId: accountFilter, strategy: strategyFilter }),
    [yearFilter, accountFilter, strategyFilter]
  );

  return (
    <div className="app-shell">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currencyMode={state.settings.currencyMode}
        onCurrencyChange={setCurrencyMode}
        yearFilter={yearFilter}
        onYearChange={setYearFilter}
        accountFilter={accountFilter}
        onAccountChange={setAccountFilter}
        strategyFilter={strategyFilter}
        onStrategyChange={setStrategyFilter}
        accounts={state.accounts}
        availableYears={availableYears}
        onImportClick={() => setImportOpen(true)}
        onExportClick={handleExport}
      />

      <main className="app-main animate-in">
        {activeTab === 'dashboard' && <Dashboard state={state} filters={filters} />}
        {activeTab === 'in-depth' && <InDepth state={state} filters={filters} />}
        {activeTab === 'trade-log' && <TradeLog state={state} setState={setState} filters={filters} />}
        {activeTab === 'transactions' && <Transactions state={state} setState={setState} />}
        {activeTab === 'accounts' && <Accounts state={state} setState={setState} />}
        {activeTab === 'rule-book' && <RuleBook />}
      </main>

      <ImportModal
        open={importOpen}
        accounts={state.accounts}
        onClose={() => setImportOpen(false)}
        onReplace={handleReplace}
        onRestoreFull={handleRestoreFull}
      />
    </div>
  );
}
