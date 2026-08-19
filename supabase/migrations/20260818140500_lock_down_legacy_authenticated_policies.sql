-- Close the door the onboarding portal would otherwise open.
--
-- Every pre-existing ops table carries a policy of the form
--
--   create policy <t>_auth_all on public.<t>
--     for all to authenticated using (true) with check (true);
--
-- That was harmless while nobody had an auth session: the app is PIN-gated and
-- talks to Supabase as `anon`. The onboarding portal ends that. The moment a
-- client contact completes a magic link they are `authenticated`, and those
-- policies would hand them full read/write on clients, invoices, payments,
-- expenses, time_entries — every client on the books. No amount of RLS on the
-- onboarding tables can contain that; it is a wide-open door two tables over.
--
-- This migration replaces unconditional `authenticated` access with a staff
-- check on all of them. Three tables (ad_metrics, contractors, money_entries)
-- granted `to public`, which covers anon AND authenticated, and get the same
-- treatment split in two.
--
-- What this does NOT change: the `anon` policies. The ops app uses the
-- publishable key with no auth session, so it keeps behaving byte-identically.
-- At the time of writing auth.users is empty, so nothing loses access.
--
-- The anon posture is still the weak point in this database — the PIN lives in
-- the browser and the publishable key is in the page source, so anyone who
-- finds them has the CRM. That is a known, pre-existing tradeoff documented in
-- public/app/README.md and is not what this migration is about. What matters
-- here is that signing a client in must not be the thing that hands them the
-- book of business.

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

    -- Drop every existing policy on the table, then restate the intended two.
    -- Rewriting rather than patching keeps this idempotent and makes the
    -- resulting posture readable in one place.
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I;', p, t);
    end loop;

    execute format('alter table public.%I enable row level security;', t);

    -- Unchanged: the PIN-gated ops app.
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true);',
      t || '_anon_all', t);

    -- Changed: authenticated is now staff-only. A client contact hits this
    -- policy, is_staff() returns false, and they get zero rows.
    execute format(
      $f$create policy %I on public.%I for all to authenticated
         using ((select public.is_staff())) with check ((select public.is_staff()));$f$,
      t || '_staff_all', t);
  end loop;
end $$;
