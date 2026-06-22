// src/components/TabNav.jsx
import React from 'react';

export const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'in-depth', label: 'In Depth' },
  { id: 'edge-lab', label: 'Edge Lab' },
  { id: 'trade-log', label: 'Trade Log' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'rule-book', label: 'Rule Book' },
];

export default function TabNav({ active, onChange }) {
  return (
    <nav className="tabnav" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`tab-btn ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
