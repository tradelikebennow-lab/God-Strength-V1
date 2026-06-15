// src/analytics/trade.test.js
import { describe, it, expect } from 'vitest';
import {
  computeTP1R,
  computeTP2R,
  computeTotalR,
  classifyResult,
  detectMarket,
  enrichTrade,
} from './trade.js';

describe('computeTP1R', () => {
  it('buy: reward / risk', () => {
    expect(computeTP1R(100, 90, 120, 'Buy')).toBeCloseTo(2); // risk 10, reward 20
  });
  it('sell: reward / risk', () => {
    expect(computeTP1R(100, 110, 80, 'Sell')).toBeCloseTo(2); // risk 10, reward 20
  });
  it('returns 0 when risk <= 0 (stop on wrong side / equal to entry)', () => {
    expect(computeTP1R(100, 100, 120, 'Buy')).toBe(0);
    expect(computeTP1R(100, 110, 120, 'Buy')).toBe(0); // stop above entry on a buy
  });
  it('returns 0 for non-finite inputs', () => {
    expect(computeTP1R(NaN, 90, 120, 'Buy')).toBe(0);
  });
});

describe('computeTotalR', () => {
  it('is the 50/50 average of TP1 and TP2 R', () => {
    expect(computeTotalR(2, 4)).toBeCloseTo(3);
    expect(computeTP2R(100, 90, 130, 'Buy')).toBeCloseTo(3); // sanity on TP2 alias
  });
});

describe('classifyResult', () => {
  it('Winner needs a real TP1 hit AND positive total', () => {
    expect(classifyResult(2, 3)).toBe('Winner');
  });
  it('Loser when total < 0', () => {
    expect(classifyResult(-0.5, -0.4)).toBe('Loser');
  });
  it('Breakeven when total is 0 even with a TP1 move', () => {
    expect(classifyResult(0.5, 0)).toBe('Breakeven');
  });
  it('tiny TP1 move with zero total is Breakeven, not Winner', () => {
    expect(classifyResult(0.05, 0)).toBe('Breakeven');
  });
});

describe('detectMarket', () => {
  it('classifies known tickers', () => {
    expect(detectMarket('EURUSD')).toBe('Forex');
    expect(detectMarket('XAUUSD')).toBe('Metals & Energies');
    expect(detectMarket('US100')).toBe('Indices');
    expect(detectMarket('BTCUSD')).toBe('Crypto');
    expect(detectMarket('AAPL')).toBe('Stocks');
  });
  it('defaults to Forex on empty', () => {
    expect(detectMarket('')).toBe('Forex');
  });
});

describe('enrichTrade', () => {
  it('derives R-multiples, result, and flags together', () => {
    const out = enrichTrade({
      entry: 100, stop: 90, tp1: 120, exitPrice: 130, direction: 'Buy', instrument: 'EURUSD',
    });
    expect(out.tp1R).toBeCloseTo(2);
    expect(out.tp2R).toBeCloseTo(3);
    expect(out.totalR).toBeCloseTo(2.5);
    expect(out.result).toBe('Winner');
    expect(out.isWinner).toBe(1);
    expect(out.nonBreakeven).toBe(1);
    expect(out.market).toBe('Forex');
  });
  it('falls back to tp1 when exitPrice is missing', () => {
    const out = enrichTrade({ entry: 100, stop: 90, tp1: 120, direction: 'Buy', instrument: 'EURUSD' });
    expect(out.tp2R).toBeCloseTo(2); // exit defaults to tp1
  });
});
