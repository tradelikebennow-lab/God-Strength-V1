// src/data/schema.js
// Single source of truth for data shapes. No enforcement at runtime — these are reference shapes.

/**
 * Account
 * @typedef {Object} Account
 * @property {string} id              - stable unique id (e.g. "campus-fund")
 * @property {string} name            - display name
 * @property {"USD"|"EUR"} currency
 * @property {number} initialBalance  - in native currency
 * @property {number} riskPct         - default risk per trade (e.g. 0.005 = 0.5%)
 * @property {number|null} tierStart  - upgrade tier balance (null if N/A)
 * @property {number|null} breachFloor - hard breach floor (null if N/A)
 * @property {"static"|"trailing"} [drawdownType] - how the breach floor behaves:
 *   "static" = fixed floor (e.g. FTMO max loss); "trailing" = floor follows the
 *   balance high-water mark. Defaults to "static" when absent.
 * @property {"Unlocked"|"Locked"} status
 * @property {number} payoutSplit     - trader's share at payout (0.25 = trader gets 25%)
 * @property {number} fxRate          - rate to USD (1.0 for USD, ~1.1723 for EUR→USD)
 */

/**
 * Trade — mirrors xlsx Trade Log 30 columns
 * @typedef {Object} Trade
 * @property {string} id
 * @property {string} accountId
 * @property {string} filledDate      - ISO "YYYY-MM-DD"
 * @property {string|null} tp1Date
 * @property {string} closeDate
 * @property {"Forex"|"Indices"|"Metals & Energies"|"Crypto"|"Stocks"} market
 * @property {"Buy"|"Sell"} direction
 * @property {string} instrument
 * @property {"4H"|"Daily"|"Weekly"|"15 min"|"5 min"|"1H"|"2H"|"8H"|"12H"} timeframe
 * @property {"Open"|"Closed"} status
 * @property {"Yes"|"No"} beAt11      - BE at 1:1 moved?
 * @property {number} tp1R
 * @property {number} tp2R
 * @property {number} totalR
 * @property {number} tp1Pnl
 * @property {number} tp2Pnl
 * @property {number} totalPnl
 * @property {"Winner"|"Loser"|"Breakeven"} result
 * @property {number} entry
 * @property {number} stop
 * @property {number} tp1
 * @property {number} exitPrice
 * @property {number} streak
 * @property {0|1} isWinner
 * @property {0|1} nonBreakeven
 * @property {"Trend"|"Counter"|"Sideways"|"Anticipatory"} tradeType
 * @property {"Yes"|"No"} lol         - Level on Level
 * @property {"Yes"|"No"} mtfCoverage - Multi-TF Coverage
 * @property {"Yes"|"No"} loiFreshness
 * @property {number} riskPct         - actual risk taken on this trade
 * @property {string} remarks
 * @property {string[]} tags          - free-form trader tags (pre-trade), e.g. ["A+ setup","news"]
 * @property {number|null} plannedTarget - intended TP price at entry (clean planned R:R source)
 * @property {string|null} entryTime  - entry time-of-day "HH:MM" (for session analysis)
 */

/**
 * Transaction
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} accountId
 * @property {string} date            - ISO "YYYY-MM-DD"
 * @property {"Deposit"|"Payout"|"Upgrade"|"Adjustment"|"Withdrawal"} type
 * @property {number} amount          - in account's native currency
 * @property {number|null} newHardLimit
 * @property {number|null} profitSplit - 0..1 (for Payout type)
 * @property {string} notes
 */

/**
 * AppState — what gets persisted to localStorage
 * @typedef {Object} AppState
 * @property {number} version
 * @property {Account[]} accounts
 * @property {Trade[]} trades
 * @property {Transaction[]} transactions
 * @property {Object} settings
 * @property {"USD"|"EUR"|"BOTH"} settings.currencyMode
 * @property {string} updatedAt       - ISO timestamp
 */

export const SCHEMA_VERSION = 1;

export const TRADE_RESULTS = ['Winner', 'Loser', 'Breakeven'];
export const TRADE_TYPES = ['Trend', 'Counter', 'Sideways', 'Anticipatory'];
export const MARKETS = ['Forex', 'Indices', 'Metals & Energies', 'Crypto', 'Stocks'];
export const TIMEFRAMES = ['Weekly', 'Daily', '12H', '8H', '4H', '2H', '1H', '15 min', '5 min'];
export const DIRECTIONS = ['Buy', 'Sell'];
export const TRANSACTION_TYPES = ['Deposit', 'Payout', 'Upgrade', 'Adjustment', 'Withdrawal'];
export const ACCOUNT_STATUS = ['Unlocked', 'Locked'];
export const DRAWDOWN_TYPES = ['static', 'trailing'];
