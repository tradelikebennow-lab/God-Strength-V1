// scripts/weekly-review.mjs — God Strength V1 weekly review generator.
// Runs OUTSIDE the app (node). Consumes the review_data RPC JSON +
// optional index_closes JSON, reuses the app's analytics modules so all
// math is identical to the live site, and emits a self-contained
// Apple Glass-styled HTML report.
//
// Usage:
//   node scripts/weekly-review.mjs --data review-data.json \
//     [--closes index-closes.json] [--week-end YYYY-MM-DD] --out outDir
//
// NOTE: field maps below mirror src/data/db.js (kept separate so this
// script never imports the supabase client).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { computePortfolioMetrics } = await import(join(ROOT, 'src/analytics/portfolio.js'));
const { computeAccountStats } = await import(join(ROOT, 'src/analytics/account.js'));
const { deriveBreachFloor, dailyLossReport, openRiskExposure } = await import(join(ROOT, 'src/analytics/extras.js'));

/* ---------------- field maps (mirror src/data/db.js) ---------------- */
const ACCOUNT_MAP = { id:'id', name:'name', currency:'currency', initialBalance:'initial_balance', riskPct:'risk_pct', tierStart:'tier_start', breachFloor:'breach_floor', status:'status', payoutSplit:'payout_split', fxRate:'fx_rate', dailyLossLimit:'daily_loss_limit' };
const TRADE_MAP = { id:'id', accountId:'account_id', filledDate:'filled_date', tp1Date:'tp1_date', closeDate:'close_date', market:'market', direction:'direction', instrument:'instrument', timeframe:'timeframe', status:'status', beAt11:'be_at_11', tp1R:'tp1_r', tp2R:'tp2_r', totalR:'total_r', tp1Pnl:'tp1_pnl', tp2Pnl:'tp2_pnl', totalPnl:'total_pnl', result:'result', entry:'entry', stop:'stop', tp1:'tp1', exitPrice:'exit_price', streak:'streak', isWinner:'is_winner', nonBreakeven:'non_breakeven', tradeType:'trade_type', lol:'lol', mtfCoverage:'mtf_coverage', loiFreshness:'loi_freshness', riskPct:'risk_pct', remarks:'remarks' };
const TX_MAP = { id:'id', accountId:'account_id', date:'date', type:'type', amount:'amount', newHardLimit:'new_hard_limit', profitSplit:'profit_split', notes:'notes' };
const NUMERIC_FIELDS = new Set(['initialBalance','riskPct','tierStart','breachFloor','payoutSplit','fxRate','dailyLossLimit','tp1R','tp2R','totalR','tp1Pnl','tp2Pnl','totalPnl','entry','stop','tp1','exitPrice','streak','isWinner','nonBreakeven','amount','newHardLimit','profitSplit']);

function fromDb(row, map) {
  const out = {};
  for (const [appKey, dbKey] of Object.entries(map)) {
    let v = row[dbKey];
    if (v === undefined) continue;
    if (v !== null && NUMERIC_FIELDS.has(appKey)) v = Number(v);
    out[appKey] = v;
  }
  if (row.sort_order !== undefined) out.sortOrder = Number(row.sort_order);
  return out;
}

/* ---------------- args ---------------- */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!args.data || !args.out) { console.error('need --data and --out'); process.exit(1); }

/* ---------------- load + map state ---------------- */
const raw = JSON.parse(readFileSync(args.data, 'utf8'));
const accounts = (raw.accounts || []).map((r) => fromDb(r, ACCOUNT_MAP)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
const trades = (raw.trades || []).map((r) => fromDb(r, TRADE_MAP)).sort((a, b) => String(a.filledDate).localeCompare(String(b.filledDate)));
const transactions = (raw.transactions || []).map((r) => fromDb(r, TX_MAP)).sort((a, b) => String(a.date).localeCompare(String(b.date)));

/* ---------------- week window: last completed Mon..Sun ---------------- */
const fmt = (d) => d.toISOString().slice(0, 10);
let weekEnd; // Sunday
if (args['week-end']) {
  weekEnd = new Date(args['week-end'] + 'T00:00:00Z');
} else {
  const now = new Date(Date.now() + 8 * 3600e3); // GMT+8 wall clock
  const dow = now.getUTCDay(); // 0=Sun
  const back = dow === 0 ? 7 : dow; // most recent completed Sunday
  weekEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back));
}
const weekStart = new Date(weekEnd.getTime() - 6 * 86400e3); // Monday
const WS = fmt(weekStart), WE = fmt(weekEnd);
const periodDate = (t) => t.closeDate || t.filledDate; // app-wide period rule
const inWeek = (d) => d && d >= WS && d <= WE;

/* ---------------- portfolio + week metrics ---------------- */
const port = computePortfolioMetrics(accounts, trades, transactions, {});
const twrAt = (cut) => {
  let v = 0;
  for (const p of port.twrCurve) { if (p.date && p.date > cut) break; if (p.date) v = p.twr; }
  return v;
};
const weekTwr = (1 + twrAt(WE)) / (1 + twrAt(fmt(new Date(weekStart.getTime() - 86400e3)))) - 1;

const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));
const usd = (t) => (t.totalPnl || 0) * (acctById[t.accountId]?.fxRate || 1);
const wkTrades = trades.filter((t) => inWeek(periodDate(t)));
const wins = wkTrades.filter((t) => t.result === 'Winner');
const losses = wkTrades.filter((t) => t.result === 'Loser');
const nonBE = wkTrades.filter((t) => t.nonBreakeven === 1);
const wkPnlUsd = wkTrades.reduce((s, t) => s + usd(t), 0);
const wkR = wkTrades.reduce((s, t) => s + (t.totalR || 0), 0);
const winRate = nonBE.length ? wins.length / nonBE.length : null;
const best = wkTrades.length ? wkTrades.reduce((a, b) => ((b.totalR || 0) > (a.totalR || 0) ? b : a)) : null;
const worst = wkTrades.length ? wkTrades.reduce((a, b) => ((b.totalR || 0) < (a.totalR || 0) ? b : a)) : null;

/* ---------------- per-account rows ---------------- */
const acctRows = accounts.map((a) => {
  const stats = port.accountStats[a.id] || computeAccountStats(a, trades, transactions, {});
  const aw = wkTrades.filter((t) => t.accountId === a.id);
  const floor = deriveBreachFloor(a, transactions);
  const open = openRiskExposure(a, trades, stats.currentBalance);
  const dl = dailyLossReport(a, trades);
  const wkDays = dl.days.filter((d) => inWeek(d.date));
  const wkBreached = (dl.limit ? wkDays.filter((d) => d.pnl <= -dl.limit) : []);
  const wkNear = (dl.limit ? wkDays.filter((d) => d.pnl > -dl.limit && d.pnl <= -0.8 * dl.limit) : []);
  return { a, stats, weekTrades: aw.length, weekPnl: aw.reduce((s, t) => s + (t.totalPnl || 0), 0), weekR: aw.reduce((s, t) => s + (t.totalR || 0), 0), floor, open, wkBreached, wkNear };
});

/* ---------------- benchmarks (optional) ---------------- */
let bench = [];
if (args.closes) {
  const closes = JSON.parse(readFileSync(args.closes, 'utf8'));
  const bySym = {};
  for (const r of closes) (bySym[r.symbol] ||= []).push({ date: r.date, close: Number(r.close) });
  const LBL = { SPX: 'S&P 500', NDX: 'Nasdaq 100', XAUUSD: 'Gold', BTCUSD: 'Bitcoin' };
  for (const [sym, rows] of Object.entries(bySym)) {
    rows.sort((x, y) => x.date.localeCompare(y.date));
    let start = null, end = null;
    for (const r of rows) { if (r.date < WS) start = r; if (r.date <= WE) end = r; }
    if (start && end && start.date !== end.date) bench.push({ sym, label: LBL[sym] || sym, pct: end.close / start.close - 1 });
  }
  bench.sort((x, y) => y.pct - x.pct);
}

/* ---------------- render ---------------- */
const pct = (v, dp = 2) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(dp)}%`);
const money = (v, cur = 'USD') => (v == null ? '—' : `${v < 0 ? '−' : ''}${cur === 'USD' ? '$' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}${cur !== 'USD' ? ' ' + cur : ''}`);
const r2 = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`);
const cls = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const tradeLine = (t, tag) => t ? `<tr><td class="dim">${tag}</td><td>${esc(t.instrument)} ${esc(t.direction)}</td><td>${esc(acctById[t.accountId]?.name || '')}</td><td>${esc(periodDate(t))}</td><td class="num ${cls(t.totalR)}">${r2(t.totalR)}</td><td class="num ${cls(t.totalPnl)}">${money(t.totalPnl, acctById[t.accountId]?.currency)}</td></tr>` : '';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>God Strength — Weekly Review ${WS} → ${WE}</title>
<style>
:root{--bg:#000;--panel:rgba(29,29,31,.62);--border:rgba(255,255,255,.08);--border-s:rgba(255,255,255,.16);
--fg:#f5f5f7;--dim:#a1a1a6;--faint:#6e6e73;--green:#30d158;--red:#ff453a;--orange:#ff9f0a;--blue:#2997ff}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Roboto,sans-serif;
-webkit-font-smoothing:antialiased;letter-spacing:-.01em;padding:48px 24px;max-width:980px;margin:0 auto}
h1{font-size:28px;font-weight:600;letter-spacing:-.02em}
.sub{color:var(--dim);margin:6px 0 32px;font-size:15px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:28px}
.panel{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px 20px;
backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);box-shadow:0 1px 0 rgba(255,255,255,.06) inset}
.k{font-size:12px;color:var(--faint);margin-bottom:6px}
.v{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.pos{color:var(--green)}.neg{color:var(--red)}.flat{color:var(--dim)}.warn{color:var(--orange)}
h2{font-size:17px;font-weight:600;margin:34px 0 12px}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{color:var(--faint);font-weight:500;text-align:left;padding:8px 10px;border-bottom:1px solid var(--border-s)}
td{padding:9px 10px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums}
.num{text-align:right}th.num{text-align:right}.dim{color:var(--dim)}
.note{color:var(--faint);font-size:12.5px;margin-top:40px}
.flag{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;margin-left:6px}
.flag.b{background:rgba(255,69,58,.14);color:var(--red)}.flag.n{background:rgba(255,159,10,.14);color:var(--orange)}
</style></head><body>
<h1>Weekly review</h1>
<div class="sub">${WS} → ${WE} · generated ${new Date(Date.now() + 8 * 3600e3).toISOString().replace('T', ' ').slice(0, 16)} GMT+8 · data as of ${esc(raw.generated_at || '')}</div>

<div class="grid">
<div class="panel"><div class="k">Week P&amp;L (USD)</div><div class="v ${cls(wkPnlUsd)}">${money(wkPnlUsd)}</div></div>
<div class="panel"><div class="k">Week TWR</div><div class="v ${cls(weekTwr)}">${pct(weekTwr)}</div></div>
<div class="panel"><div class="k">Trades</div><div class="v">${wkTrades.length}</div></div>
<div class="panel"><div class="k">Win rate (ex-BE)</div><div class="v">${winRate == null ? '—' : (winRate * 100).toFixed(0) + '%'}</div></div>
<div class="panel"><div class="k">Week R</div><div class="v ${cls(wkR)}">${r2(wkR)}</div></div>
<div class="panel"><div class="k">Portfolio value</div><div class="v">${money(port.portfolioValue)}</div></div>
</div>

${bench.length ? `<h2>Week vs benchmarks</h2><table><tr><th></th><th class="num">Week</th></tr>
<tr><td><strong>God Strength (TWR)</strong></td><td class="num ${cls(weekTwr)}"><strong>${pct(weekTwr)}</strong></td></tr>
${bench.map((b) => `<tr><td>${b.label}</td><td class="num ${cls(b.pct)}">${pct(b.pct)}</td></tr>`).join('')}</table>` : ''}

<h2>Accounts</h2>
<table><tr><th>Account</th><th class="num">Balance</th><th class="num">Wk trades</th><th class="num">Wk P&amp;L</th><th class="num">Wk R</th><th class="num">Current DD</th><th class="num">Buffer to floor</th><th class="num">Open risk</th></tr>
${acctRows.map(({ a, stats, weekTrades, weekPnl, weekR, floor, open, wkBreached, wkNear }) => {
  const buffer = floor != null ? stats.currentBalance - floor : null;
  const flags = `${wkBreached.length ? `<span class="flag b">daily-loss breach ×${wkBreached.length}</span>` : ''}${wkNear.length ? `<span class="flag n">near miss ×${wkNear.length}</span>` : ''}`;
  return `<tr><td>${esc(a.name)} <span class="dim">${a.status === 'Locked' ? '· locked' : ''}</span>${flags}</td>
<td class="num">${money(stats.currentBalance, a.currency)}</td>
<td class="num">${weekTrades || '—'}</td>
<td class="num ${cls(weekPnl)}">${weekTrades ? money(weekPnl, a.currency) : '—'}</td>
<td class="num ${cls(weekR)}">${weekTrades ? r2(weekR) : '—'}</td>
<td class="num ${stats.currentDD < -0.05 ? 'warn' : 'dim'}">${pct(stats.currentDD, 1)}</td>
<td class="num ${buffer != null && buffer < 0 ? 'neg' : 'dim'}">${buffer != null ? money(buffer, a.currency) : '—'}</td>
<td class="num ${open.riskPct > 0.02 ? 'warn' : 'dim'}">${open.openCount ? pct(open.riskPct, 1) + ' · ' + open.openCount + ' open' : '—'}</td></tr>`;
}).join('')}</table>

${best || worst ? `<h2>Notable trades</h2><table><tr><th></th><th>Trade</th><th>Account</th><th>Date</th><th class="num">R</th><th class="num">P&amp;L</th></tr>
${best ? tradeLine(best, 'Best') : ''}${worst && worst !== best ? tradeLine(worst, 'Worst') : ''}</table>` : ''}

<h2>Year to date</h2>
<div class="grid">
<div class="panel"><div class="k">YTD TWR</div><div class="v ${cls(port.ytdTwr)}">${pct(port.ytdTwr)}</div></div>
<div class="panel"><div class="k">YTD growth (USD)</div><div class="v ${cls(port.ytdGrowthUsd)}">${money(port.ytdGrowthUsd)}</div></div>
<div class="panel"><div class="k">Max DD</div><div class="v ${cls(port.maxDD)}">${pct(port.maxDD, 1)}</div></div>
<div class="panel"><div class="k">Calmar</div><div class="v">${port.calmar == null ? '—' : port.calmar.toFixed(2)}</div></div>
<div class="panel"><div class="k">Weighted R (all time)</div><div class="v ${cls(port.weightedR)}">${r2(port.weightedR)}</div></div>
<div class="panel"><div class="k">Payouts taken</div><div class="v">${money(port.totalPayouts)}</div></div>
</div>

<div class="note">Math identical to the live app (same analytics modules). Period rule: closeDate || filledDate. ${wkTrades.length === 0 ? 'No trades closed this week.' : ''}</div>
</body></html>`;

mkdirSync(args.out, { recursive: true });
const outPath = join(args.out, `GS-Weekly-${WE}.html`);
writeFileSync(outPath, html);
console.log(JSON.stringify({ out: outPath, week: [WS, WE], trades: wkTrades.length, weekPnlUsd: Math.round(wkPnlUsd), weekTwr: +(weekTwr * 100).toFixed(3) + '%', portfolioValue: Math.round(port.portfolioValue), bench: bench.map((b) => b.sym) }));
