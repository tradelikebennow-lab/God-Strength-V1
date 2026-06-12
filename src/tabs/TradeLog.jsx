// src/tabs/TradeLog.jsx
import React, { useState, useMemo } from 'react';
import MiniTable from '../components/MiniTable.jsx';
import TradeForm from '../components/TradeForm.jsx';
import { dateYear } from '../utils/dates.js';
import { fmtCur, fmtR } from '../utils/currency.js';
import { matchesStrategy } from '../analytics/account.js';

export default function TradeLog({ state, setState, filters }) {
  const { accounts, trades, settings } = state;
  const currencyMode = settings.currencyMode;
  const eurFx = accounts.find((a) => a.currency === 'EUR')?.fxRate || 1.1723;
  const acctById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // { trade, isNew }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trades
      .filter((t) => {
        if (filters.year && dateYear(t.filledDate) !== filters.year) return false;
        if (filters.accountId && t.accountId !== filters.accountId) return false;
        if (filters.strategy && !matchesStrategy(t.timeframe, filters.strategy)) return false;
        if (q) {
          const acct = acctById[t.accountId]?.name || '';
          const hay = `${t.instrument} ${t.direction} ${t.result} ${t.tradeType} ${acct} ${t.filledDate} ${t.remarks || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.filledDate || '').localeCompare(a.filledDate || ''));
  }, [trades, filters, search, acctById]);

  function newTrade() {
    setEditing({ trade: null, isNew: true });
  }

  function editTrade(trade) {
    setEditing({ trade, isNew: false });
  }

  function duplicateTrade(trade) {
    setEditing({
      trade: {
        ...trade,
        id: '',
        filledDate: '',
        tp1Date: null,
        closeDate: '',
        entry: 0, stop: 0, tp1: 0, exitPrice: 0,
        tp1R: 0, tp2R: 0, totalR: 0,
        tp1Pnl: 0, tp2Pnl: 0, totalPnl: 0,
        result: 'Breakeven',
        isWinner: 0, nonBreakeven: 0, streak: 0,
        remarks: '',
      },
      isNew: true,
    });
  }

  function saveTrade(trade) {
    setState((s) => {
      const exists = s.trades.find((t) => t.id === trade.id);
      const newTrades = exists
        ? s.trades.map((t) => (t.id === trade.id ? trade : t))
        : [...s.trades, trade];
      return { ...s, trades: newTrades };
    });
    setEditing(null);
  }

  function deleteTrade(trade) {
    if (!confirm(`Delete ${trade.instrument} trade on ${trade.filledDate}?`)) return;
    setState((s) => ({ ...s, trades: s.trades.filter((t) => t.id !== trade.id) }));
  }

  function exportCSV() {
    const cols = [
      'filledDate', 'closeDate', 'accountId', 'instrument', 'market', 'direction', 'timeframe',
      'entry', 'stop', 'tp1', 'exitPrice', 'tp1R', 'tp2R', 'totalR', 'totalPnl', 'result',
      'tradeType', 'lol', 'mtfCoverage', 'loiFreshness', 'beAt11', 'riskPct', 'remarks',
    ];
    const header = cols.join(',');
    const lines = filtered.map((t) => cols.map((c) => {
      const v = t[c];
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${filters.year || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const rows = filtered.map((t) => ({
    ...t,
    accountName: acctById[t.accountId]?.name || t.accountId,
    accountCurrency: acctById[t.accountId]?.currency || 'USD',
  }));

  return (
    <div className="animate-in">
      <div className="flex justify-between items-center" style={{ marginBottom: 'var(--space-lg)', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Trade Log</h1>
        <div className="flex gap-md">
          <input
            type="text"
            placeholder="Search trades…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <button className="btn" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-primary" onClick={newTrade}>+ New Trade</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <div style={{ padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid var(--border)' }}>
          <span className="dim" style={{ fontSize: 'var(--text-sm)' }}>
            {filtered.length} of {trades.length} trades
          </span>
        </div>
        <MiniTable
          columns={[
            { key: 'filledDate', label: 'Filled', sortable: true },
            { key: 'accountName', label: 'Account', sortable: true },
            { key: 'instrument', label: 'Symbol', sortable: true },
            { key: 'direction', label: 'Dir' },
            { key: 'timeframe', label: 'TF' },
            { key: 'totalR', label: 'R', align: 'right', sortable: true, format: (v) => fmtR(v, 2, true), tone: true },
            { key: 'totalPnl', label: 'PnL', align: 'right', sortable: true,
              format: (v, row) => fmtCur(v, row.accountCurrency, currencyMode, eurFx),
              tone: true },
            { key: 'result', label: 'Result',
              format: (v) => (
                <span className={`badge ${v === 'Winner' ? 'badge-success' : v === 'Loser' ? 'badge-danger' : 'badge-muted'}`}>
                  {v}
                </span>
              ),
            },
            { key: 'tradeType', label: 'Type' },
            { key: 'actions', label: '',
              format: (_, row) => (
                <div className="flex gap-xs" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); editTrade(row); }} title="Edit">
                    ✎
                  </button>
                  <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); duplicateTrade(row); }} title="Duplicate">
                    ⎘
                  </button>
                  <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); deleteTrade(row); }} title="Delete">
                    🗑
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
          maxRows={100}
        />
      </div>

      <TradeForm
        open={editing !== null}
        trade={editing?.trade}
        accounts={accounts}
        onSave={saveTrade}
        onCancel={() => setEditing(null)}
      />
    </div>
  );
}
