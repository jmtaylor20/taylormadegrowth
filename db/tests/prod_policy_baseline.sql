-- Production's RLS posture as audited on 2026-08-18, before any lockdown.
--
-- Reproduced verbatim from pg_policies on buubrapkkqyalecwbhkh so the rollback
-- test can prove that forward-then-back lands exactly where production started,
-- rather than merely somewhere plausible.
--
-- 38 policies across 18 tables. LOCAL TEST FIXTURE ONLY.

-- money_entries exists in production but not in supabase/schema.sql; create it
-- here so the local baseline covers all 18 tables.
create table if not exists public.money_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_id uuid,
  kind text,
  amount numeric default 0,
  note text
);
grant all on public.money_entries to anon, authenticated, service_role;

do $$
declare
  t text;
  p text;
begin
  foreach t in array array[
    'clients','tasks','invoices','content_items','assets','reviews','proposals',
    'activities','payments','reports','trips','meetings','time_entries','expenses',
    'app_settings','ad_metrics','contractors','money_entries'
  ] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I;', p, t);
    end loop;
    execute format('alter table public.%I enable row level security;', t);
  end loop;

  -- The fifteen tables carrying the _anon_all / _auth_all pair.
  foreach t in array array[
    'clients','tasks','invoices','content_items','assets','reviews','proposals',
    'activities','payments','reports','trips','meetings','time_entries','expenses',
    'app_settings'
  ] loop
    execute format('create policy %I on public.%I for all to anon using (true) with check (true);', t || '_anon_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true);', t || '_auth_all', t);
  end loop;
end $$;

-- The three that predate that pattern and grant TO public (anon AND authenticated).
create policy "ad_metrics read"   on public.ad_metrics for select to public using (true);
create policy "ad_metrics insert" on public.ad_metrics for insert to public with check (true);
create policy "ad_metrics update" on public.ad_metrics for update to public using (true) with check (true);

create policy "contractors read"   on public.contractors for select to public using (true);
create policy "contractors insert" on public.contractors for insert to public with check (true);
create policy "contractors update" on public.contractors for update to public using (true) with check (true);
create policy "contractors delete" on public.contractors for delete to public using (true);

create policy money_entries_all on public.money_entries for all to public using (true) with check (true);
