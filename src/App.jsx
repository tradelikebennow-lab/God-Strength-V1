// src/App.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './data/supabaseClient.js';
import { loadStateFromDb, persistDiff, replaceJournal } from './data/db.js';
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
  // lastSavedRef always holds the last state CONFIRMED to be in the database.
  // It only advances when a write succeeds, so no failure ordering can ever
  // orphan a diff. stateRef mirrors the latest state for use inside the
  // serialized save queue.
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'error'
  const lastSavedRef = useRef(null);
  const stateRef = useRef(null);
  stateRef.current = state;
  const queueRef = useRef(Promise.resolve());

  // Keyed on the USER id, not the session object: hourly TOKEN_REFRESHED
  // events produce a new session object and must NOT re-fetch the DB over
  // unsaved local state.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setState(null);
      lastSavedRef.current = null;
      setSaveStatus('saved');
      return;
    }
    let active = true;
    setLoadError(null);
    loadStateFromDb()
      .then((s) => {
        if (!active) return;
        lastSavedRef.current = s;
        setState(s);
        setSaveStatus('saved');
      })
      .catch((err) => {
        console.error('[app] load failed', err);
        if (active) setLoadError(err.message || 'Failed to load data');
      });
    return () => { active = false; };
  }, [userId]);

  // ---- Serialized persistence queue ----
  // Each queued run diffs from the last CONFIRMED db state to the LATEST
  // app state. Runs never overlap, so concurrent upserts/deletes can't land
  // out of order, and a failed save leaves lastSavedRef untouched — the
  // next run (or a manual Retry) picks the full outstanding diff back up.
  const schedulePersist = useCallback(() => {
    queueRef.current = queueRef.current.then(async () => {
      const base = lastSavedRef.current;
      const target = stateRef.current;
      if (!base || !target || base === target) return;
      setSaveStatus('saving');
      try {
        await persistDiff(base, target);
        lastSavedRef.current = target;
        setSaveStatus(stateRef.current === target ? 'saved' : 'saving');
      } catch (err) {
        console.error('[app] save failed', err);
        setSaveStatus('error');
      }
    });
  }, []);

  useEffect(() => {
    if (!state || !lastSavedRef.current || state === lastSavedRef.current) return;
    schedulePersist();
  }, [state, schedulePersist]);

  const handleRetrySave = useCallback(() => {
    schedulePersist();
  }, [schedulePersist]);

  // ---- Warn before closing the tab with unsaved changes ----
  useEffect(() => {
    function onBeforeUnload(e) {
      if (saveStatus !== 'saved' || (state && lastSavedRef.current !== state)) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveStatus, state]);

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
  // Writes to the DB FIRST (atomic RPC), then swaps local state. The
  // ImportModal awaits this, so its "done" screen means actually done.
  const handleReplace = useCallback(async (newState) => {
    const s = stateRef.current;
    const next = {
      ...newState,
      accounts: s.accounts, // preserve account config
      settings: s.settings,
    };
    await replaceJournal(next.trades, next.transactions);
    lastSavedRef.current = next;
    setState(next);
    setSaveStatus('saved');
  }, []);

  // ---- Restore handler (JSON backup — replaces everything) ----
  // trades/transactions go through the atomic RPC; account/settings
  // changes ride the normal diff queue afterwards.
  const handleRestoreFull = useCallback(async (newState) => {
    const s = stateRef.current;
    await replaceJournal(newState.trades, newState.transactions);
    lastSavedRef.current = {
      ...newState,
      accounts: s.accounts,
      settings: s.settings,
    };
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
        saveStatus={saveStatus}
        onRetrySave={handleRetrySave}
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
