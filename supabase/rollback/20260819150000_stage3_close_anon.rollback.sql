-- Rollback for 20260819150000_stage3_close_anon.
--
-- Restores anon to full read/write across every application table, and puts
-- back the default privileges that hand new tables to anon automatically.
--
-- This re-opens the whole database to anyone holding the publishable key, which
-- is served in page source and committed to a public repo. It exists so the
-- forward migration is not a one-way door — if the ops app cannot sign in for
-- some reason and you need the CRM back this minute, this is the lever. It is
-- not a resting state. Put it back within the hour.
--
-- Tested by scripts/test-stage3-anon-rollback.mjs.

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant usage on schema public to anon;
grant all on all tables    in schema public to anon;
grant all on all sequences in schema public to anon;
grant execute on all functions in schema public to anon;

-- The auth helpers are deliberately not anon-callable even in the rolled-back
-- state: they answer questions about a session, and anon has none. Restoring
-- them would be restoring something that never existed.
revoke all on function public.current_auth_email()          from anon;
revoke all on function public.is_staff()                    from anon;
revoke all on function public.onboarding_client_ids()       from anon;
revoke all on function public.bind_auth_identity()          from anon;
revoke all on function public.automation_has_scope(text)    from anon;

do $$
begin
  if to_regprocedure('public.onboarding_engagement_ids()') is not null then
    revoke all on function public.onboarding_engagement_ids() from anon;
  end if;
end $$;

alter default privileges in schema public grant all on tables    to anon;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges in schema public grant execute on functions to anon;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Restores the `<table>_anon_all` shape this database carried before stage 3,
-- across every table that exists. Staff, contact and automation policies are
-- untouched — the forward migration never removed them, so there is nothing to
-- put back.
do $$
declare r record;
begin
  for r in
    select c.relname as tbl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname not like 'pg_%'
  loop
    execute format('alter table public.%I enable row level security;', r.tbl);
    execute format('drop policy if exists %I on public.%I;', r.tbl || '_anon_all', r.tbl);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true);',
      r.tbl || '_anon_all', r.tbl);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from storage.buckets where id = 'onboarding') then
    drop policy if exists onboarding_objects_anon_all on storage.objects;
    create policy onboarding_objects_anon_all on storage.objects
      for all to anon
      using (bucket_id = 'onboarding')
      with check (bucket_id = 'onboarding');
  end if;
end $$;
