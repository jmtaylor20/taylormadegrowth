-- Tenant isolation test for the client onboarding schema.
--
-- All clients share one database. If contact A can read client B's financial
-- baseline, that is an engagement-ending event. This file is the proof that
-- they cannot.
--
-- It is a real check, not a smoke test. Every assertion names a specific
-- policy: remove that policy and the assertion goes red. The negative control
-- in scripts/test-onboarding-rls.mjs proves that by dropping policies one at a
-- time and confirming the suite fails each time.
--
-- Personas exercised:
--   anon        the PIN-gated ops app. Must keep working, unchanged.
--   Ruth        Cedar & Pine contact, bound to her auth user.
--   Marcus      Cedar & Pine contact, NOT bound — resolved by confirmed email.
--   Dana        Harbor Lane contact. The mirror image of Ruth.
--   Stranger    a real auth session with no contact record. Signing up must
--               grant nothing.
--   Staff       TaylorMade. Sees everything.
--
-- Run against a database that has the migrations, the library seed, and the
-- test-client seed applied. Pure SQL — no psql backslash commands — so it also
-- runs from the Supabase SQL editor or any client.
--
-- Requires superuser / owner rights for setup; the assertions themselves all
-- run as anon or authenticated.

-- ===========================================================================
-- Harness
-- ===========================================================================
drop schema if exists test cascade;
create schema test;

create table test.results (
  id serial primary key,
  persona text not null,
  name text not null,
  passed boolean not null,
  detail text
);

-- SECURITY DEFINER so an unprivileged persona can record a result without
-- being granted anything on the results table.
create or replace function test.record(persona text, name text, passed boolean, detail text default null)
returns void language plpgsql security definer as $$
begin
  insert into test.results (persona, name, passed, detail) values (persona, name, passed, detail);
end $$;

create or replace function test.expect(persona text, name text, actual bigint, want bigint)
returns void language plpgsql security definer as $$
begin
  insert into test.results (persona, name, passed, detail)
  values (persona, name, actual = want, format('got %s, want %s', actual, want));
end $$;

create or replace function test.expect_num(persona text, name text, actual numeric, want numeric)
returns void language plpgsql security definer as $$
begin
  insert into test.results (persona, name, passed, detail)
  values (persona, name, actual is not distinct from want, format('got %s, want %s', actual, want));
end $$;

grant usage on schema test to anon, authenticated, public;
grant execute on function test.record(text,text,boolean,text)   to anon, authenticated, public;
grant execute on function test.expect(text,text,bigint,bigint)  to anon, authenticated, public;
grant execute on function test.expect_num(text,text,numeric,numeric) to anon, authenticated, public;

-- ===========================================================================
-- Fixtures: auth sessions
-- ===========================================================================
delete from auth.users where email in (
  'ruth@cedarandpine.test','marcus@cedarandpine.test',
  'dana@harborlane.test','owen@harborlane.test',
  'stranger@example.test','staff@taylormadegrowth.test','automation@example.test'
);

insert into auth.users (email, email_confirmed_at) values
  ('ruth@cedarandpine.test',      now()),
  ('marcus@cedarandpine.test',    now()),
  ('dana@harborlane.test',        now()),
  ('owen@harborlane.test',        now()),
  ('stranger@example.test',       now()),
  ('staff@taylormadegrowth.test', now()),
  ('automation@example.test',     now());

delete from public.staff_users where email = 'staff@taylormadegrowth.test';
insert into public.staff_users (email, name) values ('staff@taylormadegrowth.test', 'TaylorMade Staff');

-- A machine identity, scoped the way the Google Ads script's will be: it may
-- reach ad_metrics and nothing else.
delete from public.automation_accounts where email = 'automation@example.test';
insert into public.automation_accounts (label, email, scopes)
values ('Test automation', 'automation@example.test', array['ad_metrics']);

-- ===========================================================================
-- Fixtures: ids and expected counts, stashed in session GUCs
-- ===========================================================================
-- Held in GUCs rather than psql variables so this file stays plain SQL and so
-- the values survive into the DO blocks that test writes.
do $$ begin
  perform set_config('test.jwt_ruth',     format('{"sub":"%s","role":"authenticated"}', id), false) from auth.users where email = 'ruth@cedarandpine.test';
  perform set_config('test.jwt_marcus',   format('{"sub":"%s","role":"authenticated"}', id), false) from auth.users where email = 'marcus@cedarandpine.test';
  perform set_config('test.jwt_dana',     format('{"sub":"%s","role":"authenticated"}', id), false) from auth.users where email = 'dana@harborlane.test';
  perform set_config('test.jwt_stranger', format('{"sub":"%s","role":"authenticated"}', id), false) from auth.users where email = 'stranger@example.test';
  perform set_config('test.jwt_staff',    format('{"sub":"%s","role":"authenticated"}', id), false) from auth.users where email = 'staff@taylormadegrowth.test';
  perform set_config('test.jwt_automation', format('{"sub":"%s","role":"authenticated"}', id), false) from auth.users where email = 'automation@example.test';

  perform set_config('test.cedar_client',  c.id::text, false) from public.clients c where c.business_name = 'Cedar & Pine Millwork';
  perform set_config('test.harbor_client', c.id::text, false) from public.clients c where c.business_name = 'Harbor Lane Roofing';

  perform set_config('test.cedar_engagement', e.id::text, false)
    from public.onboarding_engagements e join public.clients c on c.id = e.client_id
   where c.business_name = 'Cedar & Pine Millwork';
  perform set_config('test.harbor_engagement', e.id::text, false)
    from public.onboarding_engagements e join public.clients c on c.id = e.client_id
   where c.business_name = 'Harbor Lane Roofing';

  -- A concrete write target inside Harbor Lane, the kind of id an attacker would
  -- have if they ever saw one leak.
  perform set_config('test.harbor_section', es.id::text, false)
    from public.onboarding_engagement_sections es
    join public.onboarding_engagements e on e.id = es.engagement_id
    join public.clients c on c.id = e.client_id
   where c.business_name = 'Harbor Lane Roofing' and es.section_key = 'business_brand';
  perform set_config('test.cedar_section', es.id::text, false)
    from public.onboarding_engagement_sections es
    join public.onboarding_engagements e on e.id = es.engagement_id
    join public.clients c on c.id = e.client_id
   where c.business_name = 'Cedar & Pine Millwork' and es.section_key = 'business_brand';
  perform set_config('test.field_legal_name', id::text, false)
    from public.onboarding_fields where field_key = 'business_brand.legal_name';

  -- A business_brand field Harbor Lane has NOT answered. The adversarial
  -- insert must target one of these: aiming at an answered field would trip
  -- the unique index first and pass for the wrong reason, hiding a broken
  -- WITH CHECK.
  perform set_config('test.field_unanswered', f.id::text, false)
    from public.onboarding_fields f
   where f.section_key = 'business_brand'
     and f.field_kind = 'scalar'
     and f.field_type <> 'file_upload'
     and not exists (
       select 1 from public.onboarding_responses r
        where r.field_id = f.id
          and r.engagement_id = current_setting('test.harbor_engagement')::uuid)
   order by f.position
   limit 1;

  perform set_config('test.harbor_response', r.id::text, false)
    from public.onboarding_responses r
    join public.onboarding_fields f on f.id = r.field_id
   where r.engagement_id = current_setting('test.harbor_engagement')::uuid
     and f.field_key = 'financial_baseline.gross_margin';

  -- Expected sizes of each tenant's own data, computed rather than hardcoded so
  -- the seed can grow without the test rotting. The isolation assertions —
  -- the ones that matter — are hardcoded zeros.
  perform set_config('test.cedar_sections',  count(*)::text, false) from public.onboarding_engagement_sections where engagement_id = current_setting('test.cedar_engagement')::uuid;
  perform set_config('test.cedar_responses', count(*)::text, false) from public.onboarding_responses           where engagement_id = current_setting('test.cedar_engagement')::uuid;
  perform set_config('test.cedar_rows',      count(*)::text, false) from public.onboarding_response_rows       where engagement_id = current_setting('test.cedar_engagement')::uuid;
  perform set_config('test.cedar_assets',    count(*)::text, false) from public.onboarding_assets              where engagement_id = current_setting('test.cedar_engagement')::uuid;
  perform set_config('test.cedar_grants',    count(*)::text, false) from public.onboarding_access_grants       where engagement_id = current_setting('test.cedar_engagement')::uuid;
  perform set_config('test.harbor_sections', count(*)::text, false) from public.onboarding_engagement_sections where engagement_id = current_setting('test.harbor_engagement')::uuid;
  perform set_config('test.harbor_responses',count(*)::text, false) from public.onboarding_responses           where engagement_id = current_setting('test.harbor_engagement')::uuid;
  perform set_config('test.section_count',   count(*)::text, false) from public.onboarding_sections;

  -- ===========================================================================
  -- Schema guard: nothing here can hold a secret
  -- ===========================================================================
  -- Requirement, stated plainly: there must be no column anywhere in this schema
  -- that can hold a password, API key, or secret. This asserts it structurally,
  -- so adding one later trips the suite.
  perform test.expect('schema', 'no onboarding column is named like a credential',
    (select count(*) from information_schema.columns
      where table_schema = 'public'
        and (table_name like 'onboarding\_%' or table_name in ('client_contacts','staff_users'))
        and column_name ~* '(password|passwd|pwd|secret|api_?key|token|credential|private_?key|passphrase)'),
    0);
end $$;

-- And the tripwire on the free-text columns actually fires.
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.onboarding_access_grants (engagement_id, platform_key, notes)
    values (current_setting('test.harbor_engagement')::uuid, 'crm',
            'login is admin, password: hunter2 — do not lose this');
  exception when check_violation then
    blocked := true;
  end;
  perform test.record('schema', 'credential-shaped notes are rejected by CHECK', blocked);
  delete from public.onboarding_access_grants
   where engagement_id = current_setting('test.harbor_engagement')::uuid and platform_key = 'crm';
end $$;

-- ===========================================================================
-- Persona: anon — the PIN-gated ops app must be untouched
-- ===========================================================================
set role anon;
do $$ begin
  perform set_config('request.jwt.claims', '', false);

  perform test.expect('anon', 'still reads the CRM (ops app unbroken)',
    (select count(*) from public.clients where notes like '%[test]%'), 2);
  perform test.expect('anon', 'still reads both engagements',
    (select count(*) from public.onboarding_engagements), 2);
  perform test.expect('anon', 'still reads all onboarding responses',
    (select count(*) from public.onboarding_responses),
    (current_setting('test.cedar_responses')::bigint + current_setting('test.harbor_responses')::bigint));
  perform test.expect('anon', 'still reads storage objects',
    (select count(*) from storage.objects where bucket_id = 'onboarding'), 3);
end $$;

reset role;

-- ===========================================================================
-- Bind two of the four contacts to their auth users
-- ===========================================================================
-- Ruth and Dana go through bind_auth_identity(), the path the portal uses
-- after a magic link resolves. Marcus and Owen stay unbound on purpose, so the
-- confirmed-email fallback is exercised too.
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_ruth'), false);
end $$;
select public.bind_auth_identity();
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_dana'), false);
end $$;
select public.bind_auth_identity();
reset role;

do $$ begin
  perform test.expect('setup', 'bind_auth_identity bound exactly the two contacts',
    (select count(*) from public.client_contacts where auth_user_id is not null), 2);
  perform test.record('setup', 'binding did not touch the other client''s contact',
    (select auth_user_id is null from public.client_contacts where email = 'marcus@cedarandpine.test'));
end $$;

-- ===========================================================================
-- Persona: Ruth — Cedar & Pine, bound
-- ===========================================================================
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_ruth'), false);

  -- --- She is not staff, and she can see her own scope ------------------------
  perform test.record('ruth', 'is not staff', (select not public.is_staff()));
  perform test.expect('ruth', 'resolves to exactly one client',
    (select count(*) from public.onboarding_client_ids()), 1);

  -- --- Engagements: hers, and only hers ---------------------------------------
  perform test.expect('ruth', 'sees exactly one engagement (cannot enumerate)',
    (select count(*) from public.onboarding_engagements), 1);
  perform test.expect('ruth', 'the engagement she sees is her own',
    (select count(*) from public.onboarding_engagements where id = current_setting('test.cedar_engagement')::uuid), 1);
  perform test.expect('ruth', 'Harbor Lane engagement is invisible even by exact id',
    (select count(*) from public.onboarding_engagements where id = current_setting('test.harbor_engagement')::uuid), 0);

  -- --- Sections ---------------------------------------------------------------
  perform test.expect('ruth', 'sees all of her own activated sections',
    (select count(*) from public.onboarding_engagement_sections), current_setting('test.cedar_sections')::bigint);
  perform test.expect('ruth', 'sees none of Harbor Lane''s sections',
    (select count(*) from public.onboarding_engagement_sections
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);

  -- --- Responses: the financial baseline is the whole point --------------------
  perform test.expect('ruth', 'sees all of her own responses',
    (select count(*) from public.onboarding_responses), current_setting('test.cedar_responses')::bigint);
  perform test.expect('ruth', 'sees zero of Harbor Lane''s responses',
    (select count(*) from public.onboarding_responses
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);
  perform test.expect('ruth', 'cannot read Harbor Lane''s response by exact row id',
    (select count(*) from public.onboarding_responses
      where id = current_setting('test.harbor_response')::uuid), 0);
  perform test.expect('ruth', 'sees exactly one gross_margin — her own',
    (select count(*) from public.onboarding_responses r
       join public.onboarding_fields f on f.id = r.field_id
      where f.field_key = 'financial_baseline.gross_margin'), 1);
  -- Summed rather than selected: if isolation broke, this returns 60.5 (both
  -- tenants) instead of erroring on a multi-row subquery, so the breach shows
  -- up as a red line in the report rather than killing the run.
  perform test.expect_num('ruth', 'the gross_margin she can read is hers (38.5), not Harbor Lane''s (22.0)',
    (select sum(r.value_number) from public.onboarding_responses r
       join public.onboarding_fields f on f.id = r.field_id
      where f.field_key = 'financial_baseline.gross_margin'), 38.5);
  perform test.expect_num('ruth', 'cannot aggregate her way to another tenant''s revenue',
    (select coalesce(sum(r.value_number), 0) from public.onboarding_responses r
       join public.onboarding_fields f on f.id = r.field_id
      where f.field_key = 'financial_baseline.annual_revenue'
        and r.engagement_id <> current_setting('test.cedar_engagement')::uuid), 0);

  -- --- Repeating group rows ---------------------------------------------------
  perform test.expect('ruth', 'sees her own repeating-group rows',
    (select count(*) from public.onboarding_response_rows), current_setting('test.cedar_rows')::bigint);
  perform test.expect('ruth', 'sees no rows belonging to Harbor Lane',
    (select count(*) from public.onboarding_response_rows
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);

  -- --- Assets and storage -----------------------------------------------------
  perform test.expect('ruth', 'sees her own asset metadata',
    (select count(*) from public.onboarding_assets), current_setting('test.cedar_assets')::bigint);
  perform test.expect('ruth', 'sees no Harbor Lane asset metadata',
    (select count(*) from public.onboarding_assets
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);
  perform test.expect('ruth', 'sees only her own storage objects',
    (select count(*) from storage.objects where bucket_id = 'onboarding'), current_setting('test.cedar_assets')::bigint);
  perform test.expect('ruth', 'cannot list objects under Harbor Lane''s path prefix',
    (select count(*) from storage.objects
      where bucket_id = 'onboarding'
        and name like current_setting('test.harbor_engagement') || '/%'), 0);

  -- --- Access grants ----------------------------------------------------------
  perform test.expect('ruth', 'sees her own access grants',
    (select count(*) from public.onboarding_access_grants), current_setting('test.cedar_grants')::bigint);
  perform test.expect('ruth', 'sees no Harbor Lane access grants',
    (select count(*) from public.onboarding_access_grants
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);

  -- --- Contacts ---------------------------------------------------------------
  perform test.expect('ruth', 'sees the two contacts at her own client',
    (select count(*) from public.client_contacts), 2);
  perform test.expect('ruth', 'cannot enumerate Harbor Lane''s contacts',
    (select count(*) from public.client_contacts
      where client_id = current_setting('test.harbor_client')::uuid), 0);
  perform test.expect('ruth', 'cannot read the staff table',
    (select count(*) from public.staff_users), 0);

  -- --- The CRM itself ---------------------------------------------------------
  -- This is what the lockdown migration bought. Before it, every one of these
  -- returned the whole book of business.
  perform test.expect('ruth', 'cannot read public.clients at all',
    (select count(*) from public.clients), 0);
  perform test.expect('ruth', 'cannot read invoices',   (select count(*) from public.invoices), 0);
  perform test.expect('ruth', 'cannot read payments',   (select count(*) from public.payments), 0);
  perform test.expect('ruth', 'cannot read expenses',   (select count(*) from public.expenses), 0);
  perform test.expect('ruth', 'cannot read tasks',      (select count(*) from public.tasks), 0);
  perform test.expect('ruth', 'cannot read time_entries',(select count(*) from public.time_entries), 0);
  perform test.expect('ruth', 'cannot read proposals',  (select count(*) from public.proposals), 0);

  -- --- Foreign-key traversal --------------------------------------------------
  -- Joining out of a row she legitimately owns must not pull in rows she does
  -- not. If public.clients were readable this join would return her client row
  -- and the boundary would be decorative.
  perform test.expect('ruth', 'cannot traverse engagement -> clients',
    (select count(*) from public.onboarding_engagements e join public.clients c on c.id = e.client_id), 0);
  perform test.expect('ruth', 'cannot traverse response -> another tenant''s section',
    (select count(*) from public.onboarding_responses r
       join public.onboarding_engagement_sections es on es.id = r.engagement_section_id
      where es.engagement_id <> current_setting('test.cedar_engagement')::uuid), 0);

  -- --- The safe view is the only way she reaches her client record ------------
  perform test.expect('ruth', 'onboarding_my_client returns exactly her client',
    (select count(*) from public.onboarding_my_client), 1);
  perform test.record('ruth', 'onboarding_my_client names Cedar & Pine',
    (select bool_and(business_name = 'Cedar & Pine Millwork') from public.onboarding_my_client));
  perform test.expect('ruth', 'progress view is scoped to her sections',
    (select count(*) from public.onboarding_section_progress), current_setting('test.cedar_sections')::bigint);
  perform test.expect('ruth', 'derived platform list is scoped to her engagement',
    (select count(*) from public.onboarding_engagement_platforms
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);

  -- --- Definitions are shared, and readable -----------------------------------
  perform test.expect('ruth', 'can read the section library',
    (select count(*) from public.onboarding_sections), current_setting('test.section_count')::bigint);
  perform test.record('ruth', 'can read field definitions',
    (select count(*) > 0 from public.onboarding_fields));
end $$;

-- --- Writes -----------------------------------------------------------------
do $$
declare blocked boolean := false; n int;
begin
  -- Insert straight into another tenant's section, using ids as literals — the
  -- adversarial case where an id has leaked. The BEFORE trigger rewrites
  -- engagement_id from the parent section, so WITH CHECK sees the truth.
  begin
    insert into public.onboarding_responses (engagement_section_id, field_id, status, value_text)
    values (current_setting('test.harbor_section')::uuid,
            current_setting('test.field_unanswered')::uuid,
            'answered', 'injected by another tenant');
  exception when others then
    blocked := true;
  end;
  perform test.record('ruth', 'INSERT into Harbor Lane''s section is refused', blocked);

  -- Move one of her own rows into the other tenant's engagement.
  blocked := false;
  begin
    update public.onboarding_responses
       set engagement_section_id = current_setting('test.harbor_section')::uuid
     where engagement_section_id = current_setting('test.cedar_section')::uuid;
    get diagnostics n = row_count;
    if n = 0 then blocked := true; end if;
  exception when others then
    blocked := true;
  end;
  perform test.record('ruth', 'cannot re-parent her own row into Harbor Lane', blocked);

  -- Update and delete another tenant's rows: must affect nothing.
  begin
    update public.onboarding_responses set value_number = 999
     where id = current_setting('test.harbor_response')::uuid;
    get diagnostics n = row_count;
  exception when others then
    -- Reaching the row at all is already a failure; -1 says so out loud.
    n := -1;
  end;
  perform test.record('ruth', 'UPDATE of Harbor Lane''s response affects 0 rows', n = 0, format('rows=%s', n));

  begin
    delete from public.onboarding_assets
     where engagement_id = current_setting('test.harbor_engagement')::uuid;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  perform test.record('ruth', 'DELETE of Harbor Lane''s assets affects 0 rows', n = 0, format('rows=%s', n));

  -- Activating a section for herself is staff-only: no contact INSERT policy.
  blocked := false;
  begin
    insert into public.onboarding_engagement_sections (engagement_id, section_key)
    values (current_setting('test.cedar_engagement')::uuid, 'job_economics');
  exception when others then
    blocked := true;
  end;
  perform test.record('ruth', 'cannot activate a section on her own engagement', blocked);

  -- The insert above is refused by onboarding_responses_validate() before RLS
  -- even weighs in: that trigger runs as the caller, so the other tenant's
  -- section is invisible to it too. Useful defense in depth, but it means that
  -- assertion does not on its own prove the policy's WITH CHECK works.
  --
  -- Access grants have no such trigger on this path, so here the WITH CHECK
  -- clause is the only thing standing in the way. This is the assertion that
  -- proves the write half of the policy is real.
  blocked := false;
  begin
    insert into public.onboarding_access_grants (engagement_id, platform_key, access_method)
    values (current_setting('test.harbor_engagement')::uuid, 'crm', 'delegated');
  exception when others then
    blocked := true;
  end;
  perform test.record('ruth', 'INSERT of an access grant into Harbor Lane''s engagement is refused (WITH CHECK)', blocked);

  -- Storage: writing under another tenant's prefix.
  blocked := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('onboarding', current_setting('test.harbor_engagement') || '/business_brand/stolen.png');
  exception when others then
    blocked := true;
  end;
  perform test.record('ruth', 'cannot write a storage object under Harbor Lane''s prefix', blocked);

  -- Storage: writing under her own prefix is allowed. A test that only proves
  -- everything is denied has proved nothing.
  blocked := false;
  begin
    insert into storage.objects (bucket_id, name)
    values ('onboarding', current_setting('test.cedar_engagement') || '/business_brand/legit.png');
  exception when others then
    blocked := true;
  end;
  perform test.record('ruth', 'CAN write a storage object under her own prefix', not blocked);

  -- Remove it again, which doubles as the delete-your-own check and keeps the
  -- fixture counts the later personas assert against stable.
  delete from storage.objects
   where bucket_id = 'onboarding'
     and name = current_setting('test.cedar_engagement') || '/business_brand/legit.png';
  get diagnostics n = row_count;
  perform test.record('ruth', 'CAN delete her own storage object', n = 1, format('rows=%s', n));

  -- Likewise: she can actually answer her own questions.
  blocked := false;
  begin
    update public.onboarding_responses set value_text = 'Cedar & Pine Millwork LLC (updated)'
     where engagement_section_id = current_setting('test.cedar_section')::uuid
       and field_id = current_setting('test.field_legal_name')::uuid;
    get diagnostics n = row_count;
  exception when others then
    blocked := true; n := 0;
  end;
  perform test.record('ruth', 'CAN update her own answer', (not blocked) and n = 1, format('rows=%s', n));
end $$;

reset role;

-- ===========================================================================
-- Persona: Marcus — Cedar & Pine, NOT bound (confirmed-email fallback)
-- ===========================================================================
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_marcus'), false);

  perform test.expect('marcus', 'unbound contact still resolves to his client',
    (select count(*) from public.onboarding_client_ids()), 1);
  perform test.expect('marcus', 'sees his client''s engagement',
    (select count(*) from public.onboarding_engagements), 1);
  perform test.expect('marcus', 'sees zero Harbor Lane responses',
    (select count(*) from public.onboarding_responses
      where engagement_id = current_setting('test.harbor_engagement')::uuid), 0);
  perform test.expect('marcus', 'cannot read the CRM',
    (select count(*) from public.clients), 0);
end $$;

reset role;

-- ===========================================================================
-- Persona: Dana — Harbor Lane. The mirror image.
-- ===========================================================================
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_dana'), false);

  perform test.expect('dana', 'sees exactly one engagement',
    (select count(*) from public.onboarding_engagements), 1);
  perform test.expect('dana', 'Cedar & Pine engagement is invisible by exact id',
    (select count(*) from public.onboarding_engagements where id = current_setting('test.cedar_engagement')::uuid), 0);
  perform test.expect('dana', 'sees zero of Cedar & Pine''s responses',
    (select count(*) from public.onboarding_responses
      where engagement_id = current_setting('test.cedar_engagement')::uuid), 0);
  perform test.expect('dana', 'sees zero of Cedar & Pine''s repeating-group rows',
    (select count(*) from public.onboarding_response_rows
      where engagement_id = current_setting('test.cedar_engagement')::uuid), 0);
  perform test.expect_num('dana', 'the gross_margin she can read is hers (22.0), not Cedar & Pine''s (38.5)',
    (select sum(r.value_number) from public.onboarding_responses r
       join public.onboarding_fields f on f.id = r.field_id
      where f.field_key = 'financial_baseline.gross_margin'), 22.0);
  perform test.expect('dana', 'sees no Cedar & Pine assets',
    (select count(*) from public.onboarding_assets
      where engagement_id = current_setting('test.cedar_engagement')::uuid), 0);
  perform test.expect('dana', 'sees no Cedar & Pine storage objects',
    (select count(*) from storage.objects
      where bucket_id = 'onboarding' and name like current_setting('test.cedar_engagement') || '/%'), 0);
  perform test.expect('dana', 'cannot enumerate Cedar & Pine''s contacts',
    (select count(*) from public.client_contacts
      where client_id = current_setting('test.cedar_client')::uuid), 0);
  perform test.expect('dana', 'cannot read the CRM',
    (select count(*) from public.clients), 0);

  -- Scope derivation: Harbor Lane bought a website, not ads. Google Ads must not
  -- appear on their platform list at all.
  perform test.expect('dana', 'is not shown a Google Ads access row',
    (select count(*) from public.onboarding_engagement_platforms
      where engagement_id = current_setting('test.harbor_engagement')::uuid
        and platform_key = 'google_ads'), 0);
  perform test.record('dana', 'IS shown the platforms her scope does call for',
    (select count(*) > 0 from public.onboarding_engagement_platforms
      where engagement_id = current_setting('test.harbor_engagement')::uuid
        and platform_key in ('domain_registrar','website_host','google_business_profile')));
end $$;

reset role;

-- Cedar & Pine bought ads, so they do see the row.
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_ruth'), false);
  perform test.expect('ruth', 'IS shown a Google Ads access row (her scope includes ads)',
    (select count(*) from public.onboarding_engagement_platforms
      where engagement_id = current_setting('test.cedar_engagement')::uuid
        and platform_key = 'google_ads'), 1);
end $$;
reset role;

-- ===========================================================================
-- Persona: Stranger — a real session with no contact record
-- ===========================================================================
-- Supabase will mint a session for anyone who can receive mail at an address.
-- That must be worth nothing on its own.
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_stranger'), false);

  perform test.record('stranger', 'is not staff', (select not public.is_staff()));
  perform test.expect('stranger', 'resolves to no client',   (select count(*) from public.onboarding_client_ids()), 0);
  perform test.expect('stranger', 'sees no engagements',     (select count(*) from public.onboarding_engagements), 0);
  perform test.expect('stranger', 'sees no responses',       (select count(*) from public.onboarding_responses), 0);
  perform test.expect('stranger', 'sees no assets',          (select count(*) from public.onboarding_assets), 0);
  perform test.expect('stranger', 'sees no storage objects', (select count(*) from storage.objects where bucket_id = 'onboarding'), 0);
  perform test.expect('stranger', 'sees no contacts',        (select count(*) from public.client_contacts), 0);
  perform test.expect('stranger', 'sees no clients',         (select count(*) from public.clients), 0);
  perform test.expect('stranger', 'sees no invoices',        (select count(*) from public.invoices), 0);
  -- Definitions stay readable — they are not client data.
  perform test.record('stranger', 'can still read the section library',
    (select count(*) > 0 from public.onboarding_sections));
end $$;

reset role;

-- ===========================================================================
-- Persona: Automation — a script's machine identity
-- ===========================================================================
-- The Google scripts sign in as these. The Ads script in particular cannot hide
-- its password — that runtime has no PropertiesService — so what it can reach
-- has to be bounded by the identity rather than by the credential. These
-- assertions are what makes "scoped to ad_metrics alone" a fact rather than an
-- intention.
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_automation'), false);

  perform public.bind_auth_identity();

  perform test.record('automation', 'holds the scope it was granted',
    (select public.automation_has_scope('ad_metrics')));
  perform test.record('automation', 'does NOT hold a scope it was not granted',
    (select not public.automation_has_scope('crm_documents')));
  perform test.record('automation', 'is not staff', (select not public.is_staff()));
  perform test.expect('automation', 'resolves to no client',
    (select count(*) from public.onboarding_client_ids()), 0);

  -- A script identity must be worth nothing against client data.
  perform test.expect('automation', 'sees no engagements',      (select count(*) from public.onboarding_engagements), 0);
  perform test.expect('automation', 'sees no responses',        (select count(*) from public.onboarding_responses), 0);
  perform test.expect('automation', 'sees no repeating rows',   (select count(*) from public.onboarding_response_rows), 0);
  perform test.expect('automation', 'sees no assets',           (select count(*) from public.onboarding_assets), 0);
  perform test.expect('automation', 'sees no access grants',    (select count(*) from public.onboarding_access_grants), 0);
  perform test.expect('automation', 'sees no storage objects',
    (select count(*) from storage.objects where bucket_id = 'onboarding'), 0);
  perform test.expect('automation', 'sees no client contacts',  (select count(*) from public.client_contacts), 0);
  perform test.expect('automation', 'cannot read the CRM',      (select count(*) from public.clients), 0);
  perform test.expect('automation', 'cannot read invoices',     (select count(*) from public.invoices), 0);
  perform test.expect('automation', 'cannot read payments',     (select count(*) from public.payments), 0);
  perform test.expect('automation', 'cannot read the staff table', (select count(*) from public.staff_users), 0);
  -- Nor should it be able to read, or grant itself, other scopes.
  perform test.expect('automation', 'cannot read the automation table itself',
    (select count(*) from public.automation_accounts), 0);
end $$;

do $$
declare blocked boolean := false;
begin
  -- The obvious privilege escalation: hand yourself another scope.
  begin
    update public.automation_accounts set scopes = array['ad_metrics','crm_documents']
     where email = 'automation@example.test';
    if not found then blocked := true; end if;
  exception when others then
    blocked := true;
  end;
  perform test.record('automation', 'cannot widen its own scopes', blocked);

  blocked := false;
  begin
    insert into public.staff_users (email, name) values ('automation@example.test', 'sneaky');
  exception when others then
    blocked := true;
  end;
  perform test.record('automation', 'cannot make itself staff', blocked);
end $$;
reset role;

-- ===========================================================================
-- Persona: Staff — cross-client access
-- ===========================================================================
set role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', current_setting('test.jwt_staff'), false);

  perform test.record('staff', 'is staff', (select public.is_staff()));
  perform test.expect('staff', 'sees both engagements', (select count(*) from public.onboarding_engagements), 2);
  perform test.expect('staff', 'sees every response',
    (select count(*) from public.onboarding_responses),
    (current_setting('test.cedar_responses')::bigint + current_setting('test.harbor_responses')::bigint));
  perform test.expect('staff', 'sees both clients'' assets', (select count(*) from public.onboarding_assets), 3);
  perform test.expect('staff', 'sees every storage object',
    (select count(*) from storage.objects where bucket_id = 'onboarding'), 3);
  perform test.expect('staff', 'sees all four contacts', (select count(*) from public.client_contacts), 4);
  perform test.record('staff', 'can read the CRM', (select count(*) > 0 from public.clients));
end $$;

do $$
declare ok boolean := true;
begin
  begin
    insert into public.onboarding_engagement_sections (engagement_id, section_key)
    values (current_setting('test.harbor_engagement')::uuid, 'capacity');
  exception when others then
    ok := false;
  end;
  perform test.record('staff', 'can activate a section on any engagement', ok);
end $$;

reset role;

-- ===========================================================================
-- Report
-- ===========================================================================
select persona, name, case when passed then 'PASS' else 'FAIL' end as result, detail
from test.results order by id;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from test.results;

do $$
declare failed int;
begin
  select count(*) into failed from test.results where not passed;
  if failed > 0 then
    raise exception 'ISOLATION TEST FAILED: % of % assertions failed',
      failed, (select count(*) from test.results);
  end if;
  raise notice 'ISOLATION TEST PASSED: % assertions', (select count(*) from test.results);
end $$;
