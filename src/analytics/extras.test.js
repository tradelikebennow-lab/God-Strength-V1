// src/analytics/extras.test.js
import { describe, it, expect } from 'vitest';
import { payoutProjection, concurrentTrades, rDistribution, computeBreachBuffer } from './extras.js';

describe('payoutProjection', () => {
  it('nets each payout by (1 - profitSplit) — the xlsx worked example', () => {
    // 1453*.75 + 2562*.75 + 1364*.80 = 4102.45
    const account = { id: 'x', payoutSplit: 0.25 };
    const tx = [
      { accountId: 'x', type: 'Payout', date: '2025-02-10', amount: 1453, profitSplit: 0.25 },
      { accountId: 'x', type: 'Payout', date: '2025-04-12', amount: 2562, profitSplit: 0.25 },
      { accountId: 'x', type: 'Payout', date: '2025-06-08', amount: 1364, profitSplit: 0.20 },
      { accountId: 'x', type: 'Deposit', date: '2025-01-01', amount: 9999, profitSplit: 0 }, // ignored
    ];
    const out = payoutProjection(account, tx, 2025);
    expect(out.netBanked).toBeCloseTo(4102.45, 2);
  });

  it('returns a zeroed projection when there are no payouts in the year', () => {
    const out = payoutProjection({ id: 'x' }, [], 2025);
    expect(out.netBanked).toBe(0);
    expect(out.total).toBe(0);
  });
});

describe('concurrentTrades year filter (closeDate||filledDate, regression guard)', () => {
  const trades = [
    { accountId: 'a', filledDate: '2025-12-30', closeDate: '2026-01-05' },
  ];
  it('attributes a Dec-filled / Jan-closed trade to the CLOSE year', () => {
    expect(concurrentTrades(trades, { year: 2026 }).max).toBe(1);
  });
  it('excludes it from the fill year (old behavior would have included it)', () => {
    expect(concurrentTrades(trades, { year: 2025 })).toEqual({ max: 0, avg: 0 });
  });
});

describe('rDistribution', () => {
  it('buckets trades by total R into the fixed histogram bins', () => {
    const trades = [
      { totalR: -2.5, closeDate: '2025-01-01' }, // < -2R
      { totalR: -0.3, closeDate: '2025-01-02' }, // -1 to 0R
      { totalR: 0.5, closeDate: '2025-01-03' },  // 0 to 1R
      { totalR: 2.4, closeDate: '2025-01-04' },  // 2 to 3R
      { totalR: 9, closeDate: '2025-01-05' },    // 4R+
    ];
    const dist = rDistribution(trades, { year: 2025 });
    const byLabel = Object.fromEntries(dist.map((d) => [d.label, d.count]));
    expect(byLabel['< -2R']).toBe(1);
    expect(byLabel['-1 to 0R']).toBe(1);
    expect(byLabel['0 to 1R']).toBe(1);
    expect(byLabel['2 to 3R']).toBe(1);
    expect(byLabel['4R+']).toBe(1);
  });
});

describe('computeBreachBuffer', () => {
  // FTMO-style: static floor, ran up to 55k then pulled back to 51.2k.
  const ftmoTimeline = [
    { date: '2026-02-01', balance: 50000, peak: 50000 },
    { date: '2026-03-01', balance: 55003, peak: 55003 },
    { date: '2026-06-01', balance: 51225.65, peak: 55003 },
  ];

  it('static account above its reference reads ~0% used (the FTMO bug)', () => {
    const acc = { initialBalance: 50000, drawdownType: 'static' };
    const bb = computeBreachBuffer(acc, ftmoTimeline, 51225.65, 45000, null);
    expect(bb.ddType).toBe('static');
    expect(bb.maxLoss).toBe(5000);          // 50,000 − 45,000
    expect(bb.usedAmount).toBe(0);          // in profit vs reference → nothing used
    expect(bb.usedPct).toBe(0);
    expect(bb.remaining).toBeCloseTo(6225.65, 2);
  });

  it('static account drawn below reference uses buffer proportionally', () => {
    const acc = { initialBalance: 50000, drawdownType: 'static' };
    const tl = [{ date: '2026-02-01', balance: 50000, peak: 50000 }, { date: '2026-06-01', balance: 48000, peak: 50000 }];
    const bb = computeBreachBuffer(acc, tl, 48000, 45000, null);
    expect(bb.usedAmount).toBe(2000);       // 50,000 − 48,000
    expect(bb.usedPct).toBeCloseTo(0.4, 5); // 2,000 / 5,000
  });

  it('trailing account measures the pullback from peak against the allowance', () => {
    const acc = { initialBalance: 100000, drawdownType: 'trailing' };
    const tl = [{ date: '2026-01-01', balance: 100000, peak: 100000 }, { date: '2026-05-01', balance: 110000, peak: 110000 }, { date: '2026-06-01', balance: 104000, peak: 110000 }];
    const bb = computeBreachBuffer(acc, tl, 104000, 90000, null);
    expect(bb.ddType).toBe('trailing');
    expect(bb.maxLoss).toBe(10000);                 // 100,000 − 90,000
    expect(bb.effectiveFloor).toBe(100000);         // peak 110k − 10k allowance
    expect(bb.usedAmount).toBe(6000);               // 110k − 104k pullback
    expect(bb.usedPct).toBeCloseTo(0.6, 5);
  });

  it('returns null when the account has no floor', () => {
    expect(computeBreachBuffer({ initialBalance: 1000 }, [], 1000, null, null)).toBeNull();
  });
});
