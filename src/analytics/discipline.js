// src/analytics/discipline.js
// Discipline score for the dashboard creature ("tamagotchi").
// Health reflects PROCESS, not P&L: a green week with broken rules
// still sickens the creature; a red week with clean process doesn't.
// All inputs are existing journal data — no new schema.
import { dateYear } from '../utils/dates.js';
import { deriveBreachFloor, dailyLossReport, openRiskExposure } from './extras.js';

const DAY = 86400e3;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// state thresholds (score 0–100)
export function disciplineState(score) {
  if (score == null) return { key: 'resting', label: 'Resting' };
  if (score >= 92) return { key: 'best', label: 'Best' };
  if (score >= 85) return { key: 'thriving', label: 'Thriving' };
  if (score >= 65) return { key: 'healthy', label: 'Healthy' };
  if (score >= 45) return { key: 'tired', label: 'Tired' };
  if (score >= 25) return { key: 'sick', label: 'Sick' };
  return { key: 'critical', label: 'Critical' };
}

/**
 * computeDiscipline(accounts, trades, transactions, { days = 14, now })
 * → { score|null, state, components[], windowStart, windowEnd, tradeCount }
 * Components with available:false are excluded and weights renormalized.
 * Period rule: closeDate || filledDate (app-wide convention).
 */
export function computeDiscipline(accounts, trades, transactions, opts = {}) {
  const { days = 14, now = new Date() } = opts;
  const windowEnd = iso(now);
  const windowStart = iso(new Date(now.getTime() - (days - 1) * DAY));
  const inWindow = (d) => d && d >= windowStart && d <= windowEnd;
  const periodDate = (t) => t.closeDate || t.filledDate;
  const wkTrades = trades.filter((t) => inWindow(periodDate(t)));
  const unlocked = accounts.filter((a) => a.status === 'Unlocked');
  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const components = [];

  /* 1 — Daily-loss adherence (w30). Only for accounts with a limit set. */
  {
    const withLimit = accounts.filter((a) => a.dailyLossLimit > 0);
    if (!withLimit.length) {
      components.push({ key: 'dailyLoss', label: 'Daily loss limit', weight: 30, available: false, detail: 'No daily loss limit configured' });
    } else {
      let breaches = 0, nears = 0;
      for (const a of withLimit) {
        const r = dailyLossReport(a, trades);
        breaches += r.breachedDays.filter((d) => inWindow(d.date)).length;
        nears += r.nearDays.filter((d) => inWindow(d.date)).length;
      }
      components.push({
        key: 'dailyLoss', label: 'Daily loss limit', weight: 30, available: true,
        score: clamp(100 - 60 * breaches - 20 * nears, 0, 100),
        detail: breaches ? `${breaches} breach day${breaches > 1 ? 's' : ''}` : nears ? `${nears} near-miss day${nears > 1 ? 's' : ''}` : 'No breaches',
      });
    }
  }

  /* 2 — Risk sizing vs plan (w25). Oversized = trade risk > 1.25× account base. */
  {
    if (!wkTrades.length) {
      components.push({ key: 'sizing', label: 'Risk sizing', weight: 25, available: false, detail: 'No trades in window' });
    } else {
      let over = 0, heavy = 0;
      for (const t of wkTrades) {
        const base = acctById[t.accountId]?.riskPct || 0.01;
        const r = t.riskPct ?? base;
        if (r > base * 2) heavy += 1;
        else if (r > base * 1.25) over += 1;
      }
      components.push({
        key: 'sizing', label: 'Risk sizing', weight: 25, available: true,
        score: clamp(100 - 15 * over - 35 * heavy, 0, 100),
        detail: heavy || over ? `${heavy + over} oversized trade${heavy + over > 1 ? 's' : ''}` : 'All trades within plan',
      });
    }
  }

  /* 3 — Breach buffer (w20). Worst unlocked account's distance to its floor. */
  {
    let worst = null; // { name, pct }
    for (const a of unlocked) {
      const { floor } = deriveBreachFloor(a, transactions);
      if (floor == null || !(floor > 0)) continue;
      const accTrades = trades.filter((t) => t.accountId === a.id);
      const bal = a.initialBalance
        + accTrades.reduce((s, t) => s + (t.totalPnl || 0), 0)
        + transactions.filter((x) => x.accountId === a.id).reduce((s, x) => s + (x.amount || 0), 0);
      const pct = (bal - floor) / bal;
      if (worst == null || pct < worst.pct) worst = { name: a.name, pct };
    }
    if (!worst) {
      components.push({ key: 'buffer', label: 'Breach buffer', weight: 20, available: false, detail: 'No breach floors derived' });
    } else {
      const p = worst.pct;
      const score = p >= 0.10 ? 100 : p >= 0.05 ? 60 + ((p - 0.05) / 0.05) * 40 : p >= 0.02 ? 30 + ((p - 0.02) / 0.03) * 30 : p >= 0 ? (p / 0.02) * 30 : 0;
      components.push({
        key: 'buffer', label: 'Breach buffer', weight: 20, available: true, score: clamp(score, 0, 100),
        detail: `${worst.name}: ${(p * 100).toFixed(1)}% above floor`,
      });
    }
  }

  /* 4 — Open risk exposure (w15). Live stops vs ~3× account base risk. */
  {
    let worstRatio = 0, openCount = 0, worstName = null;
    for (const a of unlocked) {
      const o = openRiskExposure(a, trades, 1); // only riskPct/openCount used
      openCount += o.openCount;
      const cap = (a.riskPct || 0.01) * 3;
      const ratio = cap > 0 ? o.riskPct / cap : 0;
      if (ratio > worstRatio) { worstRatio = ratio; worstName = a.name; }
    }
    components.push({
      key: 'openRisk', label: 'Open risk', weight: 15, available: true,
      score: clamp(100 - Math.max(0, worstRatio - 1) * 100, 0, 100),
      detail: openCount ? `${openCount} open · ${worstName ?? ''} at ${(worstRatio * 100).toFixed(0)}% of cap` : 'No open exposure',
    });
  }

  /* 5 — Journaling (w10). Remarks filled on window trades. */
  {
    if (!wkTrades.length) {
      components.push({ key: 'journal', label: 'Journaling', weight: 10, available: false, detail: 'No trades in window' });
    } else {
      const filled = wkTrades.filter((t) => (t.remarks || '').trim().length > 0).length;
      components.push({
        key: 'journal', label: 'Journaling', weight: 10, available: true,
        score: (filled / wkTrades.length) * 100,
        detail: `${filled}/${wkTrades.length} trades with remarks`,
      });
    }
  }

  const avail = components.filter((c) => c.available);
  const totalW = avail.reduce((s, c) => s + c.weight, 0);
  const score = totalW > 0 ? avail.reduce((s, c) => s + c.score * c.weight, 0) / totalW : null;
  return {
    score: score == null ? null : Math.round(score),
    state: disciplineState(score == null ? null : Math.round(score)),
    components, windowStart, windowEnd, tradeCount: wkTrades.length,
  };
}
