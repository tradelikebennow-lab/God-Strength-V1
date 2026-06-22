-- ============================================================
-- God Strength V1 — per-account drawdown model (static | trailing)
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Run this BEFORE deploying the matching app build: the app now writes
-- the drawdown_type column on every account save.
-- ============================================================
alter table public.accounts
  add column if not exists drawdown_type text not null default 'static'
  check (drawdown_type in ('static', 'trailing'));

-- Backfill the accounts that use trailing drawdown (the rest stay static).
update public.accounts
  set drawdown_type = 'trailing'
  where id in ('5ers', 'fintokei');
