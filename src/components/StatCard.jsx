// src/components/StatCard.jsx
import React from 'react';

/**
 * Props:
 *   label: string
 *   value: string | number   - primary value (already formatted)
 *   subValue?: string         - secondary line (e.g. EUR equivalent)
 *   delta?: { value: string, dir: 'pos'|'neg'|null }
 *   tone?: 'default'|'pos'|'neg'|'warn'
 *   children?: react node — for custom inline content (e.g. progress bar)
 */
function StatCard({ label, value, subValue, delta, tone = 'default', children }) {
  const valueClass = tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : tone === 'warn' ? 'warn' : '';
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${valueClass}`}>{value}</span>
      {subValue && <span className="stat-delta">{subValue}</span>}
      {delta && (
        <span className={`stat-delta ${delta.dir === 'pos' ? 'pos' : delta.dir === 'neg' ? 'neg' : ''}`}>
          {delta.value}
        </span>
      )}
      {children}
    </div>
  );
}

export default React.memo(StatCard);
