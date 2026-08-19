-- Put a client into onboarding.
--
-- Until the staff-side screen exists (phase 6), this is how an engagement gets
-- created. Edit the three blocks marked EDIT, run the whole file in the Supabase
-- SQL editor, and read what it prints at the end — that is what goes in the
-- invitation email.
--
-- Safe to run twice for the same client: it refuses rather than making a second
-- engagement, and adding a contact who is already there does nothing.
--
-- ---------------------------------------------------------------------------
-- What the choices mean
-- ---------------------------------------------------------------------------
-- template_key   which sections switch on. Adding more later is one insert, so
--                start with the smaller one if you are unsure.
--                  website_build   4 sections   engagement details, brand,
--                                               digital access, communication
--                  website_ads     8 sections   the above + customer data,
--                                               boundaries, portfolio, leads
--                  growth_partner  13 sections  everything, including money
--
-- vertical       'millwork' switches on the Signature Specification module.
--                null for everybody else. It is not the client's industry —
--                it is whether we have a module written for it.
--
-- role           owner | operations | finance | marketing | contact
--                Sections get assigned by role in STEP 3, so this decides who
--                gets asked what. The owner answers money; operations answers
--                capacity and day-to-day.
--
-- The client must already exist in public.clients. This does not create one.

-- The three tables below hold what you edited. They are temporary — they exist
-- for this SQL editor session only and are dropped at the end of the file.
drop table if exists onboard_input;
drop table if exists onboard_contacts;
drop table if exists onboard_assignments;

-- ===========================================================================
-- EDIT 1 — who the engagement is for
-- ===========================================================================
create temporary table onboard_input as
select
  'CHANGE ME — exact business_name from public.clients'::text as client_name,
  'growth_partner'::text                                      as template_key,
  null::text                                                  as vertical,
  (current_date + 14)::date                                   as due_date;

-- ===========================================================================
-- EDIT 2 — the people who will use the portal
-- ===========================================================================
-- Their real email addresses: this is where the sign-in code goes, and it is
-- also what the database matches them on. One row per person.
create temporary table onboard_contacts as
select * from (values
  ('Full Name',        'them@theirbusiness.com', '(334) 555-0000', 'Owner',      'owner',      true),
  ('Second Person',    'other@theirbusiness.com', null,            'Shop lead',  'operations', false)
) as v(name, email, phone, title, role, is_primary);

-- ===========================================================================
-- EDIT 3 — who answers what
-- ===========================================================================
-- Left alone this is a sensible default. A section not listed here is left
-- unassigned, which the portal shows as "anyone can answer these" — that is a
-- real choice, not a gap, and it is the right one for questions any of them
-- could take.
create temporary table onboard_assignments as
select * from (values
  ('owner',      'engagement_details'),
  ('owner',      'financial_baseline'),
  ('owner',      'job_economics'),
  ('owner',      'marketing_boundaries'),
  ('operations', 'capacity'),
  ('operations', 'digital_access'),
  ('operations', 'portfolio'),
  ('operations', 'sales_process')
) as v(role, section_key);

-- ===========================================================================
-- Stop here. Everything below runs itself.
-- ===========================================================================

begin;

-- Refuse early and say why, rather than half-creating an engagement and leaving
-- somebody to work out what went wrong from a foreign key error.
do $$
declare i record; n int;
begin
  select * into i from onboard_input;

  if i.client_name like 'CHANGE ME%' then
    raise exception 'onboard_client: fill in EDIT 1 — client_name is still the placeholder';
  end if;

  select count(*) into n from public.clients where business_name = i.client_name;
  if n = 0 then
    raise exception 'onboard_client: no client named %. Check the spelling against public.clients.business_name', i.client_name;
  end if;
  if n > 1 then
    raise exception 'onboard_client: % matches more than one client', i.client_name;
  end if;

  if not exists (select 1 from public.onboarding_templates where key = i.template_key and active) then
    raise exception 'onboard_client: no active template %. Use website_build, website_ads or growth_partner', i.template_key;
  end if;

  if i.vertical is not null
     and not exists (select 1 from public.onboarding_sections where tier = 'vertical' and vertical = i.vertical) then
    raise exception 'onboard_client: no module for vertical %. Use null, or millwork', i.vertical;
  end if;

  if exists (
    select 1 from public.onboarding_engagements e
      join public.clients c on c.id = e.client_id
      join onboard_input i2 on i2.client_name = c.business_name
     where e.status <> 'archived'
  ) then
    raise exception 'onboard_client: % already has a live engagement. Archive it first, or add sections to it instead', i.client_name;
  end if;

  if exists (select 1 from onboard_contacts where email like '%theirbusiness.com') then
    raise exception 'onboard_client: fill in EDIT 2 — the contact emails are still placeholders';
  end if;

  if (select count(*) from onboard_contacts where is_primary) <> 1 then
    raise exception 'onboard_client: exactly one contact must be is_primary';
  end if;
end $$;

-- ---- Contacts --------------------------------------------------------------
-- Matched on lower(email) by the unique index, so re-running adds nobody twice.
insert into public.client_contacts (client_id, name, email, phone, title, role, is_primary)
select c.id, v.name, lower(v.email), v.phone, v.title, v.role, v.is_primary
from onboard_contacts v
join onboard_input i on true
join public.clients c on c.business_name = i.client_name
on conflict do nothing;

-- ---- Engagement ------------------------------------------------------------
insert into public.onboarding_engagements
  (client_id, template_key, title, vertical, status, due_date, invited_at)
select c.id, i.template_key, c.business_name || ' — onboarding', i.vertical, 'invited', i.due_date, now()
from onboard_input i
join public.clients c on c.business_name = i.client_name;

-- ---- Sections from the template -------------------------------------------
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, ts.section_key, ts.position
from public.onboarding_engagements e
join public.clients c on c.id = e.client_id
join onboard_input i on i.client_name = c.business_name
join public.onboarding_template_sections ts on ts.template_key = e.template_key
where e.status = 'invited'
on conflict (engagement_id, section_key) do nothing;

-- ---- The vertical module, if there is one ---------------------------------
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, s.key, s.position
from public.onboarding_engagements e
join public.clients c on c.id = e.client_id
join onboard_input i on i.client_name = c.business_name
join public.onboarding_sections s on s.tier = 'vertical' and s.vertical = e.vertical
where e.vertical is not null
on conflict (engagement_id, section_key) do nothing;

-- ---- Assignment ------------------------------------------------------------
update public.onboarding_engagement_sections es
   set assigned_contact_id = ct.id,
       due_date = i.due_date
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
  join onboard_input i on i.client_name = c.business_name
  join public.client_contacts ct on ct.client_id = c.id
  join onboard_assignments a on a.role = ct.role
 where es.engagement_id = e.id
   and es.section_key = a.section_key;

commit;

-- ===========================================================================
-- What to put in the invitation email
-- ===========================================================================
select
  ct.name,
  ct.email                                     as sign_in_with,
  'https://taylormadegrowth.com/portal/'       as portal,
  count(*) filter (where es.assigned_contact_id = ct.id) as sections_assigned_to_them,
  count(*) filter (where es.assigned_contact_id is null) as sections_anyone_can_answer,
  e.due_date
from public.onboarding_engagements e
join public.clients c on c.id = e.client_id
join onboard_input i on i.client_name = c.business_name
join public.client_contacts ct on ct.client_id = c.id
join public.onboarding_engagement_sections es on es.engagement_id = e.id
group by ct.name, ct.email, e.due_date
order by ct.name;

drop table onboard_input;
drop table onboard_contacts;
drop table onboard_assignments;
