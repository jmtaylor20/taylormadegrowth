-- Rollback for 20260818140500_lock_down_legacy_authenticated_policies.
--
-- Restores the pre-lockdown posture exactly: `anon` and `authenticated` each
-- get unconditional ALL on every legacy table, and the three tables that
-- predate the `_anon_all` / `_auth_all` naming get their original `TO public`
-- policies back under their original names.
--
-- Running this re-opens the hole the forward migration closed: any signed-in
-- user regains full read/write on the entire CRM. It exists so the forward
-- migration can be applied to a live database without being a one-way door,
-- not because reverting is ever a good resting state.
--
-- Tested by scripts/test-legacy-lockdown-rollback.mjs, which applies the
-- forward migration and this one in sequence and asserts the policy set comes
-- back byte-identical to what production carried beforehand.

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
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;

    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I;', p, t);
    end loop;

    execute format('alter table public.%I enable row level security;', t);

    -- The three tables below carried hand-written `TO public` policies rather
    -- than the `_anon_all` / `_auth_all` pair. Restore them under their
    -- original names so a diff against a pre-lockdown snapshot is empty.
    if t = 'ad_metrics' then
      create policy "ad_metrics read"   on public.ad_metrics for select to public using (true);
      create policy "ad_metrics insert" on public.ad_metrics for insert to public with check (true);
      create policy "ad_metrics update" on public.ad_metrics for update to public using (true) with check (true);
    elsif t = 'contractors' then
      create policy "contractors read"   on public.contractors for select to public using (true);
      create policy "contractors insert" on public.contractors for insert to public with check (true);
      create policy "contractors update" on public.contractors for update to public using (true) with check (true);
      create policy "contractors delete" on public.contractors for delete to public using (true);
    elsif t = 'money_entries' then
      create policy money_entries_all on public.money_entries for all to public using (true) with check (true);
    else
      execute format(
        'create policy %I on public.%I for all to anon using (true) with check (true);',
        t || '_anon_all', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (true) with check (true);',
        t || '_auth_all', t);
    end if;
  end loop;
end $$;
