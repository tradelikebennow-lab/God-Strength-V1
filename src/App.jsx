// src/App.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './data/supabaseClient.js';
import { loadStateFromDb, persistDiff } from './data/db.js';
import { exportJSON } from './data/storage.js';
import { dateYear } from './utils/dates.js';
import AuthGate from './components/AuthGate.jsx';
import TopBar from './components/TopBar.jsx';
import ImportModal from './components/ImportModal.jsx';
import Dashboard from './tabs/Dashboard.jsx';
import InDepth from './tabs/InDepth.jsx';
import TradeLog from './tabs/TradeLog.jsx';
import Transactions from './tabs/Transactions.jsx';
import Accounts from './tabs/Accounts.jsx';
import RuleBook from './tabs/RuleBook.jsx';

export default function App() {
  // ---- Auth session ----
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- App state (persisted in Supabase) ----
  // prevStateRef always holds the last state KNOWN to be in the database;
  // the persist effect diffs against it and writes only what changed.
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const prevStateRef = useRef(null);

  useEffect(() => {
    if (!session) {
      setState(null);
      prevStateRef.current = null;
      return;
    }
    let active = true;
    setLoadError(null);
    loadStateFromDb()
      .then((s) => {
        if (!active) return;
        prevStateRef.current = s;
        setState(s);
      })
      .catch((err) => {
        console.error('[app] load failed', err);
        if (active) setLoadError(err.message || 'Failed to load data');
      });
    return () => { active = false; };
  }, [session]);

  // ---- Persist changes (diff against last-saved state) ----
  useEffect(() => {
    if (!state || !prevStateRef.current || state === prevStateRef.current) return;
    const prev = prevStateRef.current;
    prevStateRef.current = state;
    persistDiff(prev, state).catch((err) => {
      console.error('[app] save failed', err);
      // Roll the baseline back so the failed change is retried on next save.
      prevStateRef.current = prev;
      alert(`Save failed: ${err.message}\n\nYour last change was NOT saved — check your connection and retry.`);
    });
  }, [state]);

  // ---- UI state (ephemeral) ----
  const [activeTab, setActiveTab] = useState('dashboard');
  const [yearFilter, setYearFilter] = useState(null);
  const [accountFilter, setAccountFilter] = useState(null);
  const [strategyFilter, setStrategyFilter] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // ---- Derived: available years from data ----
  const availableYears = useMemo(() => {
    const years = new Set();
    for (const t of state?.trades || []) {
      if (t.filledDate) years.add(dateYear(t.filledDate));
    }
    return [...years].sort((a, b) => b - a);
  }, [state?.trades]);

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
    setState((s) => ({
      ...newState,
      accounts: s.accounts, // preserve account config
      settings: s.settings,
    }));
  }, []);

  // ---- Restore handler (JSON backup — replaces everything verbatim) ----
  const handleRestoreFull = useCallback((newState) => {
    setState(newState);
  }, []);

  // ---- Export handler ----
  const handleExport = useCallback(() => {
    exportJSON(state);
  }, [state]);

  // ---- Sign out ----
  const handleSignOut = useCallback(() => {
    supabase.auth.signOut();
  }, []);

  // ---- Filters object passed to tabs ----
  const filters = useMemo(
    () => ({ year: yearFilter, accountId: accountFilter, strategy: strategyFilter }),
    [yearFilter, accountFilter, strategyFilter]
  );

  // ---- Gates: auth boot → login → data load ----
  if (!authReady) {
    return <div className="app-loading">Loading…</div>;
  }
  if (!session) {
    return <AuthGate />;
  }
  if (loadError) {
    return (
      <div className="app-loading" style={{ flexDirection: 'column', gap: 12 }}>
        <div style={{ color: 'var(--danger)' }}>Failed to load: {loadError}</div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }
  if (!state) {
    return <div className="app-loading">Loading your journal…</div>;
  }

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
        onSignOut={handleSignOut}
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
