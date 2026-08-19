-- Stage 3: close the anon door.
--
-- Until now every table in this database has been readable and writable by
-- anyone holding the publishable key, which is served in page source at
-- taylormadegrowth.com/app and committed to a public repository. The PIN in
-- front of it lives in the same file. See db/SECURITY.md for the audited
-- exposure that posture produced.
--
-- After this migration `anon` has no policies and no grants anywhere in
-- `public`. An unauthenticated caller holding the publishable key can read
-- nothing, write nothing, and enumerate nothing. Every remaining path is:
--
--   staff       is_staff()
--   contacts    onboarding_client_ids() / onboarding_engagement_ids()
--   scripts     automation_has_scope()
--
-- DESTRUCTIVE. The ops app must already be signing in as staff before this is
-- applied, or it goes dark. Rollback:
--   supabase/rollback/20260819150000_stage3_close_anon.rollback.sql

-- ---------------------------------------------------------------------------
-- 1. Every anon policy, gone
-- ---------------------------------------------------------------------------
-- Matches `TO public` as well as `TO anon`: `public` is every role including
-- anon, so a policy granted to it is an anon policy wearing a different hat.
do $$
declare r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and ('anon' = any (roles) or 'public' = any (roles))
  loop
    execute format('drop policy %I on public.%I;', r.policyname, r.tablename);
    raise notice 'dropped anon policy %.%', r.tablename, r.policyname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Table grants, gone
-- ---------------------------------------------------------------------------
-- Policies are not the only surface. A table with RLS enabled and no policy
-- already denies everything, but leaving the grant in place means the next
-- person to add a permissive policy re-opens the door without noticing they
-- did. Take the grant away too.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- ---------------------------------------------------------------------------
-- 3. Stop new tables being born open
-- ---------------------------------------------------------------------------
-- This is the one that would have quietly undone everything above. Supabase
-- ships ALTER DEFAULT PRIVILEGES granting anon full DML on every future table
-- in `public`, so any table added later arrives already reachable. Revoking the
-- default is what makes this migration hold rather than decay.
--
-- Default privileges are recorded per GRANTING role, and clearing them requires
-- naming that role exactly. So read the roles out of pg_default_acl rather than
-- assuming which ones are there — a hardcoded list silently misses whichever
-- role actually holds the grant, which is indistinguishable from success until
-- somebody adds a table months later.
--
-- A role we lack rights over is reported rather than raised: better a loud
-- warning naming the gap than a migration that refuses to finish.
do $$
declare r record;
begin
  for r in
    select distinct pg_get_userbyid(d.defaclrole) as grantor
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
     where n.nspname = 'public'
       and array_to_string(d.defaclacl, ',') like '%anon=%'
  loop
    begin
      execute format('alter default privileges for role %I in schema public revoke all on tables from anon;', r.grantor);
      execute format('alter default privileges for role %I in schema public revoke all on sequences from anon;', r.grantor);
      execute format('alter default privileges for role %I in schema public revoke all on functions from anon;', r.grantor);
      raise notice 'cleared default privileges granted by %', r.grantor;
    exception when insufficient_privilege or undefined_object then
      raise warning 'could NOT clear default privileges for role % (%). Tables created by that role will still grant anon — check pg_default_acl.', r.grantor, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Storage: no public buckets, no anon policies
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where public;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and ('anon' = any (roles) or 'public' = any (roles))
  loop
    execute format('drop policy %I on storage.objects;', r.policyname);
    raise notice 'dropped anon storage policy %', r.policyname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. RLS on, everywhere
-- ---------------------------------------------------------------------------
-- Without a policy a table with RLS enabled denies everything, so a table that
-- somehow has RLS *off* is the one hole this migration would otherwise leave
-- wide open. Enable rather than warn: a table nobody remembered to protect is
-- exactly the one that needs it.
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security;', r.relname);
    raise warning 'RLS was NOT enabled on public.% — enabled it now', r.relname;
  end loop;
end $$;
