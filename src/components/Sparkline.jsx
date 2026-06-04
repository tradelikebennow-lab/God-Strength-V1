// src/components/Sparkline.jsx
import React from 'react';

/**
 * Bar-style sparkline for avg win vs avg loss visualization.
 * Renders two horizontal bars: green bar for avg win, red bar for |avg loss|.
 * Lengths scaled relative to max(|avgWin|, |avgLoss|).
 *
 * Props:
 *   avgWin: number (positive)
 *   avgLoss: number (negative)
 *   width?: number (default 120)
 *   height?: number (default 36)
 *   showLabels?: boolean
 *   formatValue?: fn(num) -> string
 */
function Sparkline({ avgWin = 0, avgLoss = 0, width = 120, height = 36, showLabels = false, formatValue }) {
  const max = Math.max(Math.abs(avgWin), Math.abs(avgLoss), 0.0001);
  const winPct = (Math.abs(avgWin) / max) * 100;
  const lossPct = (Math.abs(avgLoss) / max) * 100;
  const barH = (height - 4) / 2;
  const fmt = formatValue || ((v) => v.toFixed(2));

  return (
    <svg width={width} height={height} role="img" aria-label="Avg win vs loss">
      {/* Win bar (top, green, left-aligned) */}
      <rect
        x={0}
        y={0}
        width={`${winPct}%`}
        height={barH}
        rx={2}
        fill="var(--success)"
        opacity="0.85"
      />
      {/* Loss bar (bottom, red, left-aligned) */}
      <rect
        x={0}
        y={barH + 4}
        width={`${lossPct}%`}
        height={barH}
        rx={2}
        fill="var(--danger)"
        opacity="0.85"
      />
      {showLabels && (
        <>
          <text x={width - 2} y={barH - 2} textAnchor="end" fontSize="10" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
            {fmt(avgWin)}
          </text>
          <text x={width - 2} y={height - 2} textAnchor="end" fontSize="10" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
            {fmt(avgLoss)}
          </text>
        </>
      )}
    </svg>
  );
}

export default React.memo(Sparkline);
