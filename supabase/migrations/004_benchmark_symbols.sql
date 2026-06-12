-- ============================================================
-- God Strength V1 — add Gold + Bitcoin to benchmark symbols
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================
alter table public.index_closes
  drop constraint if exists index_closes_symbol_check;

alter table public.index_closes
  add constraint index_closes_symbol_check
  check (symbol in ('SPX', 'NDX', 'XAUUSD', 'BTCUSD'));
