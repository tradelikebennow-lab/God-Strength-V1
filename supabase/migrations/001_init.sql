-- ============================================================
-- God Strength V1 — Supabase initial schema
-- Phase 1 of the localStorage → Supabase migration.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotent-ish: uses IF NOT EXISTS where possible. Safe to re-run
-- on a fresh project; review before re-running on a populated one.
--
-- Design notes:
--  * Composite PK (user_id, id) everywhere — ids like 'campus-fund'
--    stay readable, and the schema stays correct if a second user
--    ever exists.
--  * user_id defaults to auth.uid(): the app never has to send it.
--  * Enum-ish CHECK constraints mirror src/data/schema.js. CHECKs
--    pass on NULL, so open trades with missing fields are fine.
--  * snake_case columns; the app's Phase 2 mapping layer converts
--    to/from camelCase.
-- ============================================================

-- ---------- ACCOUNTS ----------
create table if not exists public.accounts (
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id               text not null,                       -- e.g. 'campus-fund'
  name             text not null,
  currency         text not null check (currency in ('USD', 'EUR')),
  initial_balance  numeric not null,
  risk_pct         numeric,                             -- default risk per trade (0.005 = 0.5%)
  tier_start       numeric,
  breach_floor     numeric,
  status           text not null default 'Locked' check (status in ('Unlocked', 'Locked')),
  payout_split     numeric,                             -- trader's share (0.25 = 25%)
  fx_rate          numeric not null default 1.0,        -- to USD
  sort_order       integer not null default 0,          -- preserves display order from the app
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------- TRADES (mirrors xlsx Trade Log, 30 columns) ----------
create table if not exists public.trades (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id             text not null,
  account_id     text not null,
  filled_date    date not null,
  tp1_date       date,
  close_date     date,
  market         text check (market in ('Forex', 'Indices', 'Metals & Energies', 'Crypto', 'Stocks')),
  direction      text check (direction in ('Buy', 'Sell')),
  instrument     text,
  timeframe      text check (timeframe in ('Weekly', 'Daily', '12H', '8H', '4H', '2H', '1H', '15 min', '5 min')),
  status         text check (status in ('Open', 'Closed')),
  be_at_11       text check (be_at_11 in ('Yes', 'No')),   -- BE moved at 1:1?
  tp1_r          numeric,
  tp2_r          numeric,
  total_r        numeric,
  tp1_pnl        numeric,
  tp2_pnl        numeric,
  total_pnl      numeric,
  result         text check (result in ('Winner', 'Loser', 'Breakeven')),
  entry          numeric,
  stop           numeric,
  tp1            numeric,
  exit_price     numeric,
  streak         numeric,
  is_winner      smallint check (is_winner in (0, 1)),
  non_breakeven  smallint check (non_breakeven in (0, 1)),
  trade_type     text check (trade_type in ('Trend', 'Counter', 'Sideways', 'Anticipatory')),
  lol            text check (lol in ('Yes', 'No')),         -- Level on Level
  mtf_coverage   text check (mtf_coverage in ('Yes', 'No')),
  loi_freshness  text check (loi_freshness in ('Yes', 'No')),
  risk_pct       numeric,                                   -- actual risk taken on this trade
  remarks        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);

create index if not exists trades_user_account_idx on public.trades (user_id, account_id);
create index if not exists trades_user_filled_date_idx on public.trades (user_id, filled_date);

-- ---------- TRANSACTIONS ----------
create table if not exists public.transactions (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id              text not null,
  account_id      text not null,
  date            date not null,
  type            text not null check (type in ('Deposit', 'Payout', 'Upgrade', 'Adjustment', 'Withdrawal')),
  amount          numeric not null,                     -- native currency of the account
  new_hard_limit  numeric,
  profit_split    numeric,                              -- 0..1, for Payout type
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);

create index if not exists transactions_user_account_idx on public.transactions (user_id, account_id);

-- ---------- SETTINGS (one row per user) ----------
create table if not exists public.settings (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  currency_mode   text not null default 'BOTH' check (currency_mode in ('USD', 'EUR', 'BOTH')),
  schema_version  integer not null default 1,
  updated_at      timestamptz not null default now(),
  primary key (user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY — owner-only on every table.
-- Without a logged-in session, every query returns nothing.
-- ============================================================
alter table public.accounts     enable row level security;
alter table public.trades       enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

drop policy if exists "owner full access" on public.accounts;
create policy "owner full access" on public.accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner full access" on public.trades;
create policy "owner full access" on public.trades
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner full access" on public.transactions;
create policy "owner full access" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "owner full access" on public.settings;
create policy "owner full access" on public.settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- VERIFICATION (run as a separate query AFTER creating your user)
-- Expected: 4 rows, all with rowsecurity = true
-- ============================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--   and tablename in ('accounts', 'trades', 'transactions', 'settings');
