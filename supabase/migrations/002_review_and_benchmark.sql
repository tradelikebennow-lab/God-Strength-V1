-- ============================================================
-- God Strength V1 — Phase 4: weekly review access + benchmark data
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent). Replaces any earlier version of
-- review_data that had a hardcoded token.
-- ============================================================

-- ---------- INDEX CLOSES (shared benchmark data) ----------
-- Written weekly by a GitHub Action (service_role); readable by
-- everyone (it's public market data, nothing personal).
create table if not exists public.index_closes (
  symbol  text not null check (symbol in ('SPX', 'NDX')),
  date    date not null,
  close   numeric not null,
  primary key (symbol, date)
);

alter table public.index_closes enable row level security;

drop policy if exists "public read" on public.index_closes;
create policy "public read" on public.index_closes
  for select using (true);
-- No insert/update/delete policies: only service_role (which bypasses
-- RLS) can write — i.e. the GitHub Action.

-- ---------- WEEKLY REVIEW READ ACCESS (hashed token) ----------
-- The plaintext token is NEVER stored in the database or this repo.
-- Only its sha256 hash lives in review_tokens. The caller presents the
-- plaintext token; the function hashes it and compares.
-- REVOKE ANYTIME: delete the row from review_tokens (or let it expire).

create extension if not exists pgcrypto;

create table if not exists public.review_tokens (
  token_hash text primary key,          -- sha256 hex of the plaintext token
  user_id    uuid not null,             -- whose data this token may read
  label      text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- RLS on, no policies: not even authenticated users can read this table
-- via the API. Only service_role / the SQL editor / SECURITY DEFINER
-- functions can touch it.
alter table public.review_tokens enable row level security;

-- Replace ALL old hardcoded-token versions (v1 single-arg AND the
-- "windowed" v2 two-arg variant) if they exist.
drop function if exists public.review_data(text);
drop function if exists public.review_data(text, date);

create or replace function public.review_data(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'accounts', (
      select coalesce(jsonb_agg(to_jsonb(a) - 'user_id'), '[]'::jsonb)
      from public.accounts a where a.user_id = tk.user_id
    ),
    'trades', (
      select coalesce(jsonb_agg(to_jsonb(t) - 'user_id'), '[]'::jsonb)
      from public.trades t where t.user_id = tk.user_id
    ),
    'transactions', (
      select coalesce(jsonb_agg(to_jsonb(x) - 'user_id'), '[]'::jsonb)
      from public.transactions x where x.user_id = tk.user_id
    )
  )
  from public.review_tokens tk
  where tk.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and tk.expires_at > now()
  limit 1;
$$;

-- Anonymous callers may EXECUTE; the hashed token + expiry is the gate.
grant execute on function public.review_data(text) to anon;

-- ---------- REGISTER YOUR TOKEN ----------
-- Run this ONCE, substituting YOUR auth user id (Dashboard → Authentication
-- → Users → copy UUID). The hash below corresponds to the plaintext token
-- you received privately — the plaintext itself is not in this file.
--
-- insert into public.review_tokens (token_hash, user_id, label, expires_at)
-- values (
--   '0ae3588701370f60faded7036c39e99f5dc747b9ccba413dd012dbd7c9d96aec',
--   '<YOUR-USER-UUID>',
--   'cowork weekly review',
--   now() + interval '12 months'
-- )
-- on conflict (token_hash) do update set expires_at = excluded.expires_at;

-- ---------- VERIFICATION ----------
-- 1) With the real plaintext token (returns your data):
--    select public.review_data('<plaintext-token>');
-- 2) Wrong token (returns no rows / null):
--    select public.review_data('wrong-token');
