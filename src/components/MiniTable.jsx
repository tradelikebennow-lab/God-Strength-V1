// src/components/MiniTable.jsx
import React, { useState, useMemo } from 'react';

/**
 * Props:
 *   columns: [{ key, label, align?, format?, sortable? }]
 *   rows: array of objects
 *   defaultSort?: { key, direction: 'asc'|'desc' }
 *   onRowClick?: fn(row)
 *   maxRows?: number — limit visible rows
 *   stickyHeader?: boolean
 */
function MiniTable({ columns, rows, defaultSort, onRowClick, maxRows, stickyHeader }) {
  const [sort, setSort] = useState(defaultSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sort, columns]);

  const visible = maxRows ? sorted.slice(0, maxRows) : sorted;

  function handleSort(key) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortable) return;
    setSort((s) => {
      if (s?.key === key) {
        return { key, direction: s.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead style={stickyHeader ? { position: 'sticky', top: 0, zIndex: 1 } : undefined}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align || 'left',
                  cursor: col.sortable ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {col.sortable && sort?.key === col.key && (
                  <span style={{ marginLeft: 4, color: 'var(--primary)' }}>
                    {sort.direction === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--fg-dim)', padding: 'var(--space-xl)' }}>
                No data
              </td>
            </tr>
          )}
          {visible.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => {
                const raw = row[col.key];
                const formatted = col.format ? col.format(raw, row) : raw;
                const cellClass = col.align === 'right' ? 'num' : '';
                const toneClass = typeof raw === 'number' && col.tone ? (raw > 0 ? 'pos' : raw < 0 ? 'neg' : '') : '';
                return (
                  <td key={col.key} className={`${cellClass} ${toneClass}`} style={{ textAlign: col.align || 'left' }}>
                    {formatted ?? '—'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default React.memo(MiniTable);
