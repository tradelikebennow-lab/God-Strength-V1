-- ============================================================
-- God Strength V1 — 006: paged review access
-- Run in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent).
--
-- WHY: review_data() returns the whole journal in one JSON blob
-- (~168KB and growing). The weekly-review automation fetches over
-- a transport capped at ~64KB per response, so it needs the same
-- data in pages. Same hashed-token gate as review_data (002).
-- review_data(text) itself is unchanged and still works.
-- ============================================================

drop function if exists public.review_data_page(text, text, int, int);

create or replace function public.review_data_page(
  p_token  text,
  p_part   text,              -- 'meta' | 'accounts' | 'trades' | 'transactions'
  p_offset int default 0,
  p_limit  int default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_out  jsonb;
begin
  select tk.user_id into v_user
  from public.review_tokens tk
  where tk.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and tk.expires_at > now()
  limit 1;
  if v_user is null then return null; end if;

  -- clamp paging inputs
  p_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  if p_part = 'meta' then
    select jsonb_build_object(
      'generated_at', now(),
      'counts', jsonb_build_object(
        'accounts',     (select count(*) from public.accounts     a where a.user_id = v_user),
        'trades',       (select count(*) from public.trades       t where t.user_id = v_user),
        'transactions', (select count(*) from public.transactions x where x.user_id = v_user)
      )
    ) into v_out;
  elsif p_part = 'accounts' then
    select coalesce(jsonb_agg(to_jsonb(s) - 'user_id'), '[]'::jsonb) into v_out
    from (select * from public.accounts a where a.user_id = v_user
          order by a.sort_order, a.id limit p_limit offset p_offset) s;
  elsif p_part = 'trades' then
    select coalesce(jsonb_agg(to_jsonb(s) - 'user_id'), '[]'::jsonb) into v_out
    from (select * from public.trades t where t.user_id = v_user
          order by t.filled_date, t.id limit p_limit offset p_offset) s;
  elsif p_part = 'transactions' then
    select coalesce(jsonb_agg(to_jsonb(s) - 'user_id'), '[]'::jsonb) into v_out
    from (select * from public.transactions x where x.user_id = v_user
          order by x.date, x.id limit p_limit offset p_offset) s;
  else
    v_out := null;
  end if;

  return v_out;
end;
$$;

grant execute on function public.review_data_page(text, text, int, int) to anon;

-- ---------- VERIFICATION ----------
-- 1) select public.review_data_page('<plaintext-token>', 'meta');
--    → {"counts": {"accounts": 6, "trades": 214, ...}, ...}
-- 2) select jsonb_array_length(public.review_data_page('<plaintext-token>', 'trades', 0, 50));
--    → 50
-- 3) select public.review_data_page('wrong-token', 'meta');
--    → null
