// src/components/ProgressBar.jsx
import React from 'react';

/**
 * Props:
 *   value: number 0..1
 *   tone?: 'ok' | 'warn' | 'danger' | 'auto' — 'auto' picks based on value
 *   warnAt?: number (default 0.5)
 *   dangerAt?: number (default 0.75)
 *   label?: string
 *   showPct?: boolean
 */
function ProgressBar({ value, tone = 'auto', warnAt = 0.5, dangerAt = 0.75, label, showPct = false }) {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = (clamped * 100).toFixed(1);

  let resolvedTone = tone;
  if (tone === 'auto') {
    if (clamped >= dangerAt) resolvedTone = 'danger';
    else if (clamped >= warnAt) resolvedTone = 'warn';
    else resolvedTone = 'ok';
  }

  return (
    <div style={{ width: '100%' }}>
      {(label || showPct) && (
        <div className="flex justify-between" style={{ fontSize: 'var(--text-xs)', marginBottom: 4 }}>
          {label && <span className="dim">{label}</span>}
          {showPct && <span className="mono dim">{pct}%</span>}
        </div>
      )}
      <div className="progress">
        <div
          className={`progress-fill ${resolvedTone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default React.memo(ProgressBar);
