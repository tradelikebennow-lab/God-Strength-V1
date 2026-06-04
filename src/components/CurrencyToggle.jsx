// src/components/CurrencyToggle.jsx
import React from 'react';

const MODES = [
  { id: 'USD', label: 'USD' },
  { id: 'EUR', label: 'EUR' },
  { id: 'BOTH', label: 'BOTH' },
];

export default function CurrencyToggle({ value, onChange }) {
  return (
    <div className="currency-toggle" role="group" aria-label="Currency display mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={value === m.id ? 'active' : ''}
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
