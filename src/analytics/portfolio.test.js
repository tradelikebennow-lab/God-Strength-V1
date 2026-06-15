// src/analytics/portfolio.test.js
import { describe, it, expect } from 'vitest';
import { computeWeightedR } from './portfolio.js';

describe('computeWeightedR', () => {
  it('weights each trade by its risk relative to the account base risk', () => {
    const accounts = [{ id: 'a', riskPct: 0.01 }];
    const trades = [
      { accountId: 'a', totalR: 2, riskPct: 0.01 }, // weight 1 → 2
      { accountId: 'a', totalR: 1, riskPct: 0.02 }, // weight 2 → 2
    ];
    expect(computeWeightedR(accounts, trades)).toBeCloseTo(4);
  });

  it('uses a 1% default base risk when the account riskPct is missing (regression guard)', () => {
    // With the old `|| 1` fallback this collapsed to ~0.03; the fix makes it 3.
    const accounts = [{ id: 'a' }]; // no riskPct
    const trades = [{ accountId: 'a', totalR: 3, riskPct: 0.01 }];
    expect(computeWeightedR(accounts, trades)).toBeCloseTo(3);
  });

  it('skips trades whose account is unknown', () => {
    const accounts = [{ id: 'a', riskPct: 0.01 }];
    const trades = [{ accountId: 'ghost', totalR: 5, riskPct: 0.01 }];
    expect(computeWeightedR(accounts, trades)).toBe(0);
  });
});
