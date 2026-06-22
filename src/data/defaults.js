// src/data/defaults.js
import { SCHEMA_VERSION } from './schema.js';

export const DEFAULT_ACCOUNTS = [
  {
    id: 'campus-fund',
    name: 'Campus Fund',
    currency: 'USD',
    initialBalance: 89999.75,
    riskPct: 0.005,
    tierStart: 180000,
    breachFloor: 172000,
    status: 'Unlocked',
    payoutSplit: 0.25,
    fxRate: 1.0,
  },
  {
    id: 'pepperstone',
    name: 'Pepperstone',
    currency: 'EUR',
    initialBalance: 571.24,
    riskPct: 0.02,
    tierStart: null,
    breachFloor: null,
    status: 'Unlocked',
    payoutSplit: 0,
    fxRate: 1.1723,
  },
  {
    id: 'ftmo',
    name: 'FTMO',
    currency: 'USD',
    initialBalance: 50000.0,
    riskPct: 0.01,
    tierStart: 50000,
    breachFloor: 45000,
    status: 'Locked',
    payoutSplit: 0,
    fxRate: 1.0,
  },
  {
    id: '5ers',
    name: '5ers',
    currency: 'USD',
    initialBalance: 100000.0,
    riskPct: 0.01,
    tierStart: 100000,
    breachFloor: 90000,
    drawdownType: 'trailing',
    status: 'Locked',
    payoutSplit: 0,
    fxRate: 1.0,
  },
  {
    id: 'fintokei',
    name: 'Fintokei',
    currency: 'USD',
    initialBalance: 50000.0,
    riskPct: 0.01,
    tierStart: 50000,
    breachFloor: 45000,
    drawdownType: 'trailing',
    status: 'Locked',
    payoutSplit: 0,
    fxRate: 1.0,
  },
];

export function makeDefaultState() {
  return {
    version: SCHEMA_VERSION,
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    trades: [],
    transactions: [],
    settings: {
      currencyMode: 'BOTH',
    },
    updatedAt: new Date().toISOString(),
  };
}
