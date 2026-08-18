-- Row-level security for the onboarding schema.
--
-- All clients share one database, so RLS is load-bearing: if one client can
-- read another's financial baseline, that is an engagement-ending event.
-- The browser never sees a service-role key and nothing is filtered
-- client-side. Every guarantee below is enforced by Postgres.
--
-- Three callers exist:
--   anon           the PIN-gated ops app (publishable key, no auth session).
--                  Full access, matching the existing posture of every other
--                  table in this database. See the lockdown migration.
--   authenticated  either TaylorMade staff (is_staff()) or a client contact
--                  who came through a magic link. A contact sees exactly their
--                  own client's rows and nothing else.
--   service_role   server-side only; bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- Scope helper
-- ---------------------------------------------------------------------------
-- Every client-data policy below reduces to "is this row's engagement one of
-- mine?". SECURITY DEFINER means this runs as owner and is therefore not
-- itself subject to RLS, which is what stops the policy on
-- onboarding_engagements from recursing into itself when it calls this.
create or replace function public.onboarding_engagement_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select e.id
  from public.onboarding_engagements e
  where e.client_id in (select public.onboarding_client_ids())
$$;

comment on function public.onboarding_engagement_ids() is
  'Engagement ids the current auth session may access as a client contact. Empty for staff and anonymous callers.';

revoke all on function public.onboarding_engagement_ids() from public, anon;
grant execute on function public.onboarding_engagement_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
-- Supabase grants these by default; spelled out here so the schema is
-- self-contained and so a local rebuild behaves identically to production.
grant usage on schema public to anon, authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'staff_users','client_contacts',
    'onboarding_sections','onboarding_fields',
    'onboarding_platforms','onboarding_platform_triggers',
    'onboarding_templates','onboarding_template_sections',
    'onboarding_engagements','onboarding_engagement_sections',
    'onboarding_response_rows','onboarding_responses',
    'onboarding_access_grants','onboarding_assets'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated, service_role;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Section library: definitions, not client data
-- ---------------------------------------------------------------------------
-- Readable by any authenticated user — a client needs the questions in order
-- to answer them, and there is nothing tenant-specific in a question. Writable
-- only by staff (and by the PIN app as anon), because the library is shared:
-- one client editing a field definition would change it for everyone.
do $$
declare t text;
begin
  foreach t in array array[
    'onboarding_sections','onboarding_fields',
    'onboarding_platforms','onboarding_platform_triggers',
    'onboarding_templates','onboarding_template_sections'
  ] loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists %I on public.%I;', t || '_anon_all', t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true);', t || '_anon_all', t);

    execute format('drop policy if exists %I on public.%I;', t || '_auth_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (true);', t || '_auth_read', t);

    execute format('drop policy if exists %I on public.%I;', t || '_staff_write', t);
    execute format($f$create policy %I on public.%I for all to authenticated
                     using ((select public.is_staff())) with check ((select public.is_staff()));$f$,
                   t || '_staff_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Client data
-- ---------------------------------------------------------------------------
alter table public.onboarding_engagements         enable row level security;
alter table public.onboarding_engagement_sections enable row level security;
alter table public.onboarding_response_rows       enable row level security;
alter table public.onboarding_responses           enable row level security;
alter table public.onboarding_access_grants       enable row level security;
alter table public.onboarding_assets              enable row level security;

-- anon (the PIN-gated ops app) and staff: unrestricted, as everywhere else.
do $$
declare t text;
begin
  foreach t in array array[
    'onboarding_engagements','onboarding_engagement_sections',
    'onboarding_response_rows','onboarding_responses',
    'onboarding_access_grants','onboarding_assets'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_anon_all', t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true);', t || '_anon_all', t);

    execute format('drop policy if exists %I on public.%I;', t || '_staff_all', t);
    execute format($f$create policy %I on public.%I for all to authenticated
                     using ((select public.is_staff())) with check ((select public.is_staff()));$f$,
                   t || '_staff_all', t);
  end loop;
end $$;

-- A contact reads their own engagements. They do not create or close them —
-- that is TaylorMade's call — so this is SELECT only.
drop policy if exists onboarding_engagements_contact_read on public.onboarding_engagements;
create policy onboarding_engagements_contact_read on public.onboarding_engagements
  for select to authenticated
  using (id in (select public.onboarding_engagement_ids()));

-- A contact reads the sections activated on their engagement, and may update
-- them (mark in progress, mark submitted). Activating or removing a section is
-- staff-only, so there is no contact INSERT or DELETE policy.
drop policy if exists onboarding_engagement_sections_contact_read on public.onboarding_engagement_sections;
create policy onboarding_engagement_sections_contact_read on public.onboarding_engagement_sections
  for select to authenticated
  using (engagement_id in (select public.onboarding_engagement_ids()));

drop policy if exists onboarding_engagement_sections_contact_update on public.onboarding_engagement_sections;
create policy onboarding_engagement_sections_contact_update on public.onboarding_engagement_sections
  for update to authenticated
  using (engagement_id in (select public.onboarding_engagement_ids()))
  with check (engagement_id in (select public.onboarding_engagement_ids()));

-- Answers, repeating-group rows, access grants, and asset metadata: a contact
-- has full read/write within their own engagement and no reach outside it.
-- Both USING and WITH CHECK are scoped — USING alone would let a contact
-- rewrite a row's engagement_id and push it into someone else's engagement.
do $$
declare t text;
begin
  foreach t in array array[
    'onboarding_response_rows','onboarding_responses',
    'onboarding_access_grants','onboarding_assets'
  ] loop
    execute format('drop policy if exists %I on public.%I;', t || '_contact_all', t);
    execute format($f$create policy %I on public.%I for all to authenticated
                     using (engagement_id in (select public.onboarding_engagement_ids()))
                     with check (engagement_id in (select public.onboarding_engagement_ids()));$f$,
                   t || '_contact_all', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- A note on why these are not security_invoker: two of them read
-- public.clients, which a client contact has no access to and should not get.
-- They run as owner and carry their own scoping predicate instead, so what a
-- caller sees is decided inside the view. security_barrier stops the planner
-- from pushing a user-supplied function below that predicate and leaking rows
-- through it.

-- The client's own record, cut down to what a portal header needs. Deliberately
-- omits mrr, build_fee, cole_pct, rating, notes and every other internal
-- column — this is why contacts are not simply granted a row on public.clients.
create or replace view public.onboarding_my_client
with (security_barrier = true) as
  select c.id, c.business_name, c.city, c.state, c.website, c.logo_url, c.brand_color
  from public.clients c
  where c.id in (select public.onboarding_client_ids());

comment on view public.onboarding_my_client is
  'Safe subset of the caller''s own client record for the portal. Never exposes financial or internal CRM columns.';

-- The platform list a given engagement should actually show. Derived from the
-- engagement's activated sections and the client's services, so a website-only
-- client is never asked about Google Ads.
create or replace view public.onboarding_engagement_platforms
with (security_barrier = true) as
  select distinct
    e.id as engagement_id,
    p.key as platform_key,
    p.label,
    p.category,
    p.description,
    p.position
  from public.onboarding_engagements e
  join public.clients cl on cl.id = e.client_id
  join public.onboarding_platform_triggers t on true
  join public.onboarding_platforms p on p.key = t.platform_key and p.active
  where (
      t.trigger_type = 'always'
      or (t.trigger_type = 'section' and exists (
            select 1 from public.onboarding_engagement_sections es
             where es.engagement_id = e.id
               and es.section_key = t.trigger_key
               and es.active))
      or (t.trigger_type = 'service' and t.trigger_key = any (cl.services))
    )
    and (
      (select public.is_staff())
      or e.id in (select public.onboarding_engagement_ids())
      -- The PIN-gated ops app reads as anon, which has full access to the
      -- underlying tables anyway. Keyed on the request role rather than on a
      -- null auth.uid(): a session that somehow reached the authenticated role
      -- without a sub claim should fall through to the checks above, not land
      -- in the anon branch and get every engagement id.
      or (select current_user) = 'anon'
    );

comment on view public.onboarding_engagement_platforms is
  'Platforms an engagement should collect access for, derived from its activated sections and the client''s services.';

-- Completion, counted honestly: `unknown` and `not_applicable` are answers, so
-- they count as complete. Blank is what does not.
create or replace view public.onboarding_section_progress
with (security_invoker = true) as
  select
    es.id as engagement_section_id,
    es.engagement_id,
    es.section_key,
    es.status,
    es.assigned_contact_id,
    es.due_date,
    fc.field_count,
    rc.response_count,
    rc.answered_count,
    rc.unknown_count,
    rc.not_applicable_count,
    case when fc.field_count = 0 then null
         else round(100.0 * least(rc.response_count, fc.field_count) / fc.field_count, 1)
    end as percent_complete
  from public.onboarding_engagement_sections es
  cross join lateral (
    select count(*) as field_count
      from public.onboarding_fields f
     where f.section_key = es.section_key
       and f.active
       and f.parent_field_id is null
  ) fc
  cross join lateral (
    select
      count(*) filter (where r.row_id is null) as response_count,
      count(*) filter (where r.status = 'answered') as answered_count,
      count(*) filter (where r.status = 'unknown') as unknown_count,
      count(*) filter (where r.status = 'not_applicable') as not_applicable_count
      from public.onboarding_responses r
     where r.engagement_section_id = es.id
  ) rc;

comment on view public.onboarding_section_progress is
  'Per-section completion. Counts unknown and not_applicable as answered, because they are deliberate answers rather than blanks.';

grant select on public.onboarding_my_client            to anon, authenticated, service_role;
grant select on public.onboarding_engagement_platforms to anon, authenticated, service_role;
grant select on public.onboarding_section_progress     to anon, authenticated, service_role;
