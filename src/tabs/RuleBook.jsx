// src/tabs/RuleBook.jsx
import React from 'react';
import MiniTable from '../components/MiniTable.jsx';
import { PLAYBOOK, KPI_THRESHOLDS, RISK_MATRIX, RULES } from '../data/ruleBook.js';

export default function RuleBook() {
  return (
    <div className="dashboard-grid animate-in">
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)' }}>Rule Book</h1>
        <p className="dim" style={{ marginTop: 4 }}>Playbook, KPI thresholds, risk size matrix, and numbered trading rules.</p>
      </div>

      <div className="panel">
        <div className="dash-section-title">Playbook</div>
        <ul style={{ paddingLeft: 'var(--space-xl)', lineHeight: 1.8 }}>
          {PLAYBOOK.map((p, i) => (
            <li key={i} style={{ color: 'var(--fg-muted)' }}>{p}</li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <div className="dash-section-title">KPI Thresholds</div>
        <MiniTable
          columns={[
            { key: 'metric', label: 'Metric' },
            { key: 'bad', label: 'Bad (Losing)', format: (v) => <span className="neg">{v}</span> },
            { key: 'avg', label: 'Average (Small Edge)', format: (v) => <span className="dim">{v}</span> },
            { key: 'good', label: 'Good (Solid Edge)', format: (v) => <span className="pos">{v}</span> },
            { key: 'excellent', label: 'Excellent', format: (v) => <span className="pos" style={{ fontWeight: 600 }}>{v}</span> },
          ]}
          rows={KPI_THRESHOLDS}
        />
      </div>

      <div className="panel">
        <div className="dash-section-title">Risk Size Matrix</div>
        <MiniTable
          columns={[
            { key: 'account', label: 'Account' },
            { key: 'strategy', label: 'Strategy' },
            { key: 'risk', label: 'Risk %', align: 'right' },
            { key: 'dollar', label: '$ Risk Mode' },
          ]}
          rows={RISK_MATRIX}
        />
      </div>

      <div className="panel">
        <div className="dash-section-title">Trading Rules</div>
        <div className="rules-list">
          {RULES.map((r) => {
            const isSubrule = r.n.includes('.');
            return (
              <div key={r.n} className={`rule-item ${isSubrule ? 'rule-sub' : ''}`}>
                <span className="rule-num">{r.n}.</span>
                <span className="rule-text">{r.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
