-- ============================================================
-- God Strength V1 — per-account daily loss limit
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================
alter table public.accounts
  add column if not exists daily_loss_limit numeric;
