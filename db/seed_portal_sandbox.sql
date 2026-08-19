-- Sandbox fixture for the client onboarding portal, meant to run against the
-- LIVE database so it can be clicked through from a phone.
--
-- Two made-up clients on different templates, each with a contact whose email
-- is a plus-alias of the owner's real address — so you can sign in as a client,
-- answer questions, then sign in as the OTHER client and see that none of the
-- first one's answers are reachable. That second half is the point: it is the
-- isolation guarantee, felt rather than read.
--
-- Marked [sandbox] in notes, following the [demo] and [test] conventions in
-- db/seed.sql and db/seed_onboarding_test_clients.sql. Everything it creates is
-- removed by db/teardown_portal_sandbox.sql, which is the file to run the
-- moment a real client is being onboarded.
--
-- Deliberately NOT db/seed_onboarding_test_clients.sql: that fixture's contacts
-- use the reserved .test TLD, so nobody can ever receive a sign-in code at one.
-- It also arrives pre-answered, and a sandbox you cannot fill in is not much of
-- a sandbox.
--
-- Requires db/seed_onboarding_library.sql to have been run first.

begin;

-- Re-runnable: children cascade from clients, and the two aliases below are the
-- only contacts that ever existed on them.
delete from public.clients where notes like '%[sandbox]%';

-- ---- Clients ---------------------------------------------------------------
-- Different service packages as well as different templates, because the
-- platform list a client is asked about is derived from both: Ridgeline has no
-- ad spend and must never be shown a Google Ads row.
insert into public.clients
  (business_name, contact_name, email, phone, city, state, category, source, stage, priority,
   services, package_name, mrr, notes)
values
  ('Sandbox Millwork Co.', 'Sandbox Owner', 'josh+sandbox1@taylormadegrowth.com', '(334) 555-0101',
   'Auburn', 'AL', 'Trades / Contractor', 'Referral', 'client', 'normal',
   array['website','management','google_ads','gbp','social'], 'Growth Partner', 0,
   'Portal sandbox — delete with db/teardown_portal_sandbox.sql. [sandbox]'),

  ('Ridgeline Sandbox Roofing', 'Sandbox Owner', 'josh+sandbox2@taylormadegrowth.com', '(334) 555-0102',
   'Opelika', 'AL', 'Trades / Contractor', 'Google search', 'client', 'normal',
   array['website','hosting'], 'Website Build', 0,
   'Portal sandbox — delete with db/teardown_portal_sandbox.sql. [sandbox]');

-- ---- Contacts --------------------------------------------------------------
-- Plus-aliases, so both deliver to the same inbox and neither is the staff
-- address. Signing in as one of these is a CLIENT session: is_staff() is false,
-- and every row that comes back is one a policy allowed.
insert into public.client_contacts (client_id, name, email, phone, title, role, is_primary)
select c.id, v.name, v.email, v.phone, v.title, v.role, v.is_primary
from public.clients c
join (values
  ('Sandbox Millwork Co.','Sandbox Owner','josh+sandbox1@taylormadegrowth.com','(334) 555-0101','Owner','owner',true),
  ('Sandbox Millwork Co.','Sandbox Shop Lead','josh+sandbox1b@taylormadegrowth.com','(334) 555-0103','Shop lead','operations',false),
  ('Ridgeline Sandbox Roofing','Sandbox Owner','josh+sandbox2@taylormadegrowth.com','(334) 555-0102','Owner','owner',true)
) as v(biz,name,email,phone,title,role,is_primary) on v.biz = c.business_name;

-- ---- Engagements -----------------------------------------------------------
insert into public.onboarding_engagements (client_id, template_key, title, vertical, status, due_date, notes)
select c.id, v.template_key, v.title, v.vertical, v.status, (current_date + v.days)::date, v.notes
from public.clients c
join (values
  ('Sandbox Millwork Co.','growth_partner','Sandbox Millwork — Growth Partner onboarding','millwork','in_progress',21,'[sandbox]'),
  ('Ridgeline Sandbox Roofing','website_build','Ridgeline — Website build onboarding',null,'invited',14,'[sandbox]')
) as v(biz,template_key,title,vertical,status,days,notes) on v.biz = c.business_name;

-- ---- Activate the template's sections --------------------------------------
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, ts.section_key, ts.position
from public.onboarding_engagements e
join public.onboarding_template_sections ts on ts.template_key = e.template_key
where e.notes like '%[sandbox]%';

-- A vertical module is gated on the engagement's vertical, not listed in a
-- template. Sandbox Millwork is a millwork shop, so its module comes on too.
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, s.key, s.position
from public.onboarding_engagements e
join public.onboarding_sections s on s.tier = 'vertical' and s.vertical = e.vertical
where e.vertical is not null and e.notes like '%[sandbox]%';

-- Adding a section to a live engagement is an ordinary insert, not a migration.
-- Ridgeline's template does not include Financial Baseline, but they asked a
-- pricing question mid-build, so it gets switched on. It is also what gives both
-- sandbox clients the same section to compare across.
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, 'financial_baseline', 900
from public.onboarding_engagements e
join public.clients c on c.id = e.client_id
where c.business_name = 'Ridgeline Sandbox Roofing'
on conflict (engagement_id, section_key) do nothing;

-- ---- Assign sections to people ---------------------------------------------
-- The owner takes the money questions; operations takes the day-to-day ones.
-- This is what makes a section say "For Sandbox Shop Lead" on the overview.
update public.onboarding_engagement_sections es
   set assigned_contact_id = ct.id, due_date = (current_date + 10)::date
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
  join public.client_contacts ct on ct.client_id = c.id
 where es.engagement_id = e.id
   and c.notes like '%[sandbox]%'
   and ct.role = 'owner'
   and es.section_key in ('engagement_details','financial_baseline','job_economics','marketing_boundaries');

update public.onboarding_engagement_sections es
   set assigned_contact_id = ct.id, due_date = (current_date + 14)::date
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
  join public.client_contacts ct on ct.client_id = c.id
 where es.engagement_id = e.id
   and c.notes like '%[sandbox]%'
   and ct.role = 'operations'
   and es.section_key in ('capacity','digital_access','portfolio','sales_process');

-- ---- One answer each, and only one -----------------------------------------
-- Everything else is left blank on purpose: the sandbox is for filling in. But
-- each client gets a distinctive revenue figure so the isolation check has
-- something concrete to look for. Sign in as one, note the number, sign in as
-- the other, and confirm it is nowhere.
insert into public.onboarding_responses
  (engagement_section_id, field_id, status, value_number, answered_by_contact_id)
select es.id, f.id, 'answered', v.amount, es.assigned_contact_id
from public.onboarding_engagement_sections es
join public.onboarding_engagements e on e.id = es.engagement_id
join public.clients c on c.id = e.client_id
join lateral (values
  ('Sandbox Millwork Co.', 1840000),
  ('Ridgeline Sandbox Roofing', 612500)
) as v(biz,amount) on v.biz = c.business_name
join public.onboarding_fields f on f.field_key = 'financial_baseline.annual_revenue'
where es.section_key = 'financial_baseline';

commit;

-- What you just made.
select c.business_name,
       ct.email as sign_in_as,
       count(distinct es.id) as sections,
       e.due_date
  from public.clients c
  join public.client_contacts ct on ct.client_id = c.id and ct.is_primary
  join public.onboarding_engagements e on e.client_id = c.id
  join public.onboarding_engagement_sections es on es.engagement_id = e.id
 where c.notes like '%[sandbox]%'
 group by c.business_name, ct.email, e.due_date
 order by c.business_name;
