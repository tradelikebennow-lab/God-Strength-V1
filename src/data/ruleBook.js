// src/data/ruleBook.js
// Content extracted from xlsx Rule Book sheet — chat logs excluded.

export const PLAYBOOK = [
  '0.125% to 2% Risk Size depending on setup and account',
  'When placing trade, profit margin should at least be the inverse of expectancy',
  'Asymmetric trade management system',
  'Take 50% at next opposing zone (execution zone)',
  'Move stop loss to breakeven at 1:1',
  'Let the rest ride by trailing until market takes you out',
];

export const KPI_THRESHOLDS = [
  { metric: 'Profit Factor', bad: '< 1.0', avg: '1.1 – 1.5', good: '1.6 – 2.0', excellent: '> 2.0' },
  { metric: 'Expectancy (R)', bad: '< 0.0 R', avg: '0.05 – 0.20 R', good: '0.21 – 0.40 R', excellent: '> 0.40 R' },
  { metric: 'R-Multiple', bad: '< 0', avg: '0–2R / month', good: '2–4R / month', excellent: '> 4R / month' },
  { metric: 'Win Rate', bad: '< 30%', avg: '30 – 45%', good: '45 – 55%', excellent: '> 55%' },
];

export const RISK_MATRIX = [
  { account: 'Live Account', strategy: 'Swing', risk: '2%', dollar: 'Dynamic until 100k' },
  { account: 'Live Account', strategy: 'Intraday', risk: '1%', dollar: 'Dynamic until 100k' },
  { account: 'FTMO', strategy: 'Swing', risk: '1%', dollar: 'Static from initial balance' },
  { account: 'FTMO', strategy: 'Intraday', risk: '0.25%', dollar: 'Static from initial balance' },
  { account: 'Campus Fund', strategy: 'Swing', risk: '0.5%', dollar: 'Static from initial balance' },
  { account: 'Campus Fund', strategy: 'Intraday', risk: '0.139%', dollar: 'Static from initial balance' },
];

export const RULES = [
  { n: '1', text: 'Always mark and take preferred zones.' },
  { n: '1.1', text: 'Exception is with LOL. Wider version with LOL takes precedence.' },
  { n: '2', text: 'Explosive leg out on execution timeframe (70%+).' },
  { n: '3', text: 'Abnormally larger leg out than base.' },
  { n: '3.1', text: 'Ideally leg out should be bigger than leg in.' },
  { n: '3.2', text: "On execution timeframe, leg out shouldn't engulf the entire base." },
  { n: '4', text: 'Stop loss is 33% below demand zone / above supply zone.' },
  { n: '4.1', text: 'Unless profit margin is too little, then pivot the stop tighter.' },
  { n: '5', text: "Don't trade when a zone has too much sideways action above/below it." },
  { n: '6', text: 'Big Brother / Multi-timeframe coverage is a must.' },
  { n: '6.1', text: 'Always take a demand/supply level if HTF aligns.' },
  { n: '6.2', text: 'If HTF=LTF coverage is not possible, skip the trade.' },
  { n: '6.3', text: "Base candles shouldn't be decisive candles unless covered by HTF." },
  { n: '6.4', text: '50% of LTF must be in the HTF box.' },
  { n: '7', text: 'HTF freshness is not too important.' },
  { n: '8', text: 'LTF (LOI) is important. Check if wider version has been touched.' },
  { n: '8.1', text: 'If price touched and has traveled less than 1× the zone size, freshness still applies.' },
  { n: '8.2', text: "If price touched and has traveled more than 1×, freshness doesn't apply." },
  { n: '8.3', text: 'If there is LOL, freshness is not important to enter.' },
  { n: '8.4', text: 'If there is LOL, reaction from LOI must not be sharp.' },
  { n: '9', text: 'First TP at the first opposing zone (50% off), trail the rest.' },
  { n: '10', text: 'Trailing and opposing zone always on execution timeframe.' },
  { n: '11', text: 'Never take two trades where the correlation on the day is too aligned.' },
  { n: '11.1', text: 'Unless the first trade is Risk Off (BE moved).' },
  { n: '12', text: 'Never short at all-time high or long at all-time low.' },
  { n: '13', text: 'Never short indices. (Update: for intraday trading only).' },
  { n: '14', text: 'Take additional risk on trades only if in profit on the day.' },
  { n: '15', text: 'Maximum 1% daily / 3% weekly drawdown.' },
  { n: '16', text: 'For Weekly setups at 3% I am allowed to take the trade.' },
];
