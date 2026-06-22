-- ============================================================
-- God Strength V1 — 008: richer trade-entry fields for Edge Lab
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Additive + idempotent. Existing rows get NULLs (Edge Lab treats those as
-- "not logged" and simply excludes them until enough new trades accrue).
--   tags           : free-form pre-trade tags (text[])
--   planned_target : intended TP price at entry — the CLEAN source for
--                    planned R:R (replaces the exit-derived, leaked version)
--   entry_time     : entry time-of-day, enables session breakdowns
-- RLS: the existing owner-only policy on public.trades already covers these
-- columns; no policy change needed.
-- ============================================================
alter table public.trades
  add column if not exists tags           text[],
  add column if not exists planned_target numeric,
  add column if not exists entry_time     time;

-- VERIFICATION (optional):
-- select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='trades'
--   and column_name in ('tags','planned_target','entry_time');

-- ------------------------------------------------------------
-- Refresh replace_journal (from 003) so the Import → Replace All / restore
-- path carries the three new fields instead of dropping them to NULL.
-- Same SECURITY INVOKER + RLS behaviour as before; only the column list grows.
-- ------------------------------------------------------------
create or replace function public.replace_journal(p_trades jsonb, p_transactions jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.trades where user_id = auth.uid();
  delete from public.transactions where user_id = auth.uid();

  insert into public.trades (
    id, account_id, filled_date, tp1_date, close_date, market, direction,
    instrument, timeframe, status, be_at_11, tp1_r, tp2_r, total_r,
    tp1_pnl, tp2_pnl, total_pnl, result, entry, stop, tp1, exit_price,
    streak, is_winner, non_breakeven, trade_type, lol, mtf_coverage,
    loi_freshness, risk_pct, remarks, tags, planned_target, entry_time
  )
  select
    r.id, r.account_id, r.filled_date, r.tp1_date, r.close_date, r.market, r.direction,
    r.instrument, r.timeframe, r.status, r.be_at_11, r.tp1_r, r.tp2_r, r.total_r,
    r.tp1_pnl, r.tp2_pnl, r.total_pnl, r.result, r.entry, r.stop, r.tp1, r.exit_price,
    r.streak, r.is_winner, r.non_breakeven, r.trade_type, r.lol, r.mtf_coverage,
    r.loi_freshness, r.risk_pct, r.remarks, r.tags, r.planned_target, r.entry_time
  from jsonb_to_recordset(coalesce(p_trades, '[]'::jsonb)) as r(
    id text, account_id text, filled_date date, tp1_date date, close_date date,
    market text, direction text, instrument text, timeframe text, status text,
    be_at_11 text, tp1_r numeric, tp2_r numeric, total_r numeric,
    tp1_pnl numeric, tp2_pnl numeric, total_pnl numeric, result text,
    entry numeric, stop numeric, tp1 numeric, exit_price numeric,
    streak numeric, is_winner smallint, non_breakeven smallint,
    trade_type text, lol text, mtf_coverage text, loi_freshness text,
    risk_pct numeric, remarks text, tags text[], planned_target numeric, entry_time time
  );

  insert into public.transactions (
    id, account_id, date, type, amount, new_hard_limit, profit_split, notes
  )
  select
    x.id, x.account_id, x.date, x.type, x.amount, x.new_hard_limit, x.profit_split, x.notes
  from jsonb_to_recordset(coalesce(p_transactions, '[]'::jsonb)) as x(
    id text, account_id text, date date, type text, amount numeric,
    new_hard_limit numeric, profit_split numeric, notes text
  );
end;
$$;

grant execute on function public.replace_journal(jsonb, jsonb) to authenticated;
