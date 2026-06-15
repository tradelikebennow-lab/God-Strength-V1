// src/data/validate.test.js
import { describe, it, expect } from 'vitest';
import { validateAccountRefs } from './validate.js';

const accounts = [{ id: 'a' }, { id: 'b' }];

describe('validateAccountRefs', () => {
  it('returns [] when every reference resolves', () => {
    const trades = [{ accountId: 'a' }, { accountId: 'b' }];
    const tx = [{ accountId: 'a' }];
    expect(validateAccountRefs(accounts, trades, tx)).toEqual([]);
  });

  it('returns sorted unique missing ids across trades and transactions', () => {
    const trades = [{ accountId: 'a' }, { accountId: 'c' }, { accountId: 'c' }];
    const tx = [{ accountId: 'd' }, { accountId: 'b' }];
    expect(validateAccountRefs(accounts, trades, tx)).toEqual(['c', 'd']);
  });

  it('ignores rows with null/undefined accountId', () => {
    const trades = [{ accountId: null }, {}];
    expect(validateAccountRefs(accounts, trades, [])).toEqual([]);
  });

  it('handles empty/omitted collections', () => {
    expect(validateAccountRefs(accounts)).toEqual([]);
    expect(validateAccountRefs([], [{ accountId: 'a' }])).toEqual(['a']);
  });
});
