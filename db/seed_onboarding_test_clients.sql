-- Two test clients on different templates, with contacts, answers, files, and
-- access grants. This is the fixture the isolation test runs against, and it
-- doubles as a worked example of the model.
--
-- Marked with [test] in notes, following the existing [demo] convention in
-- db/seed.sql. Re-runnable: it deletes its own rows first.
--
-- Emails use the reserved .test TLD, so no fixture can ever mail a real person.
--
-- Requires db/seed_onboarding_library.sql to have been run first.

begin;

-- ---- Clear previous fixture (children cascade from clients) ----------------
delete from public.clients where notes like '%[test]%';

-- ---- Clients ---------------------------------------------------------------
-- Deliberately different service packages as well as different templates: the
-- platform list a client sees is derived from both, and Harbor Lane must never
-- be shown a Google Ads row.
insert into public.clients
  (business_name, contact_name, email, phone, city, state, category, source, stage, priority,
   services, package_name, mrr, notes)
values
  ('Cedar & Pine Millwork', 'Ruth Calder', 'ruth@cedarandpine.test', '(334) 555-0301',
   'Auburn', 'AL', 'Trades / Contractor', 'Referral', 'client', 'high',
   array['website','management','google_ads','gbp','social'], 'Growth Partner', 2400,
   'Full advisory engagement, millwork vertical. [test]'),

  ('Harbor Lane Roofing', 'Dana Whitfield', 'dana@harborlane.test', '(334) 555-0302',
   'Opelika', 'AL', 'Trades / Contractor', 'Google search', 'client', 'normal',
   array['website','hosting'], 'Website Build', 0,
   'Website build only, no ad spend. [test]');

-- ---- Contacts --------------------------------------------------------------
-- Two people per client, because sections get assigned to different people:
-- the owner answers financials, the shop lead answers capacity.
insert into public.client_contacts (client_id, name, email, phone, title, role, is_primary)
select c.id, v.name, v.email, v.phone, v.title, v.role, v.is_primary
from public.clients c
join (values
  ('Cedar & Pine Millwork','Ruth Calder','ruth@cedarandpine.test','(334) 555-0301','Owner','owner',true),
  ('Cedar & Pine Millwork','Marcus Hale','marcus@cedarandpine.test','(334) 555-0303','Shop lead','operations',false),
  ('Harbor Lane Roofing','Dana Whitfield','dana@harborlane.test','(334) 555-0302','Owner','owner',true),
  ('Harbor Lane Roofing','Owen Pike','owen@harborlane.test','(334) 555-0304','Operations manager','operations',false)
) as v(biz,name,email,phone,title,role,is_primary) on v.biz = c.business_name;

-- ---- Engagements -----------------------------------------------------------
insert into public.onboarding_engagements (client_id, template_key, title, vertical, status, due_date, notes)
select c.id, v.template_key, v.title, v.vertical, v.status, v.due::date, v.notes
from public.clients c
join (values
  ('Cedar & Pine Millwork','growth_partner','Cedar & Pine — Growth Partner onboarding','millwork','in_progress','2026-09-15','[test]'),
  ('Harbor Lane Roofing','website_build','Harbor Lane — Website build onboarding',null,'invited','2026-09-01','[test]')
) as v(biz,template_key,title,vertical,status,due,notes) on v.biz = c.business_name;

-- ---- Activate the template's sections --------------------------------------
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, ts.section_key, ts.position
from public.onboarding_engagements e
join public.onboarding_template_sections ts on ts.template_key = e.template_key
where e.notes like '%[test]%';

-- Cedar & Pine is a millwork shop, so its vertical module comes on too. This
-- is the path vertical sections take — gated on the engagement's vertical
-- rather than listed in a template.
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, s.key, s.position
from public.onboarding_engagements e
join public.onboarding_sections s on s.tier = 'vertical' and s.vertical = e.vertical
where e.vertical is not null and e.notes like '%[test]%';

-- Adding a section to a live engagement is an ordinary insert, not a
-- migration. Harbor Lane asked a pricing question mid-build, so Financial
-- Baseline gets switched on even though their template does not include it.
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, 'financial_baseline', 900
from public.onboarding_engagements e
join public.clients c on c.id = e.client_id
where c.business_name = 'Harbor Lane Roofing';

-- ---- Assign sections to people ---------------------------------------------
-- The owner takes the money questions; operations takes the day-to-day ones.
update public.onboarding_engagement_sections es
   set assigned_contact_id = ct.id,
       due_date = '2026-09-10'
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
  join public.client_contacts ct on ct.client_id = c.id
 where es.engagement_id = e.id
   and c.notes like '%[test]%'
   and ct.role = 'owner'
   and es.section_key in ('engagement_details','financial_baseline','job_economics','marketing_boundaries');

update public.onboarding_engagement_sections es
   set assigned_contact_id = ct.id,
       due_date = '2026-09-12'
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
  join public.client_contacts ct on ct.client_id = c.id
 where es.engagement_id = e.id
   and c.notes like '%[test]%'
   and ct.role = 'operations'
   and es.section_key in ('capacity','digital_access','portfolio','sales_process');

-- ---- Answers ---------------------------------------------------------------
-- Scalar responses. Note the mix of statuses: `unknown` is a deliberate
-- answer, stored with no value, and it counts toward completion.
insert into public.onboarding_responses
  (engagement_section_id, field_id, status, value_text, value_number, value_boolean, value_json, answered_by_contact_id)
select es.id, f.id, v.status,
       v.value_text, v.value_number, v.value_boolean, v.value_json::jsonb,
       es.assigned_contact_id
from public.onboarding_engagement_sections es
join public.onboarding_engagements e on e.id = es.engagement_id
join public.clients c on c.id = e.client_id
join lateral (values
  ('Cedar & Pine Millwork','business_brand.legal_name','answered','Cedar & Pine Millwork LLC',null,null,null),
  ('Cedar & Pine Millwork','business_brand.service_area','answered','Lee County and 60 miles out of Auburn.',null,null,null),
  ('Cedar & Pine Millwork','business_brand.elevator_pitch','answered','We build custom cabinetry and architectural millwork for people who care what the inside of a drawer looks like.',null,null,null),
  ('Cedar & Pine Millwork','business_brand.differentiators','answered','Everything is built in our shop. No outsourced boxes.',null,null,null),
  ('Cedar & Pine Millwork','business_brand.year_founded','answered',null,2009,null,null),
  ('Cedar & Pine Millwork','business_brand.employees','answered',null,11,null,null),
  ('Cedar & Pine Millwork','business_brand.primary_phone','answered','(334) 555-0301',null,null,null),
  ('Cedar & Pine Millwork','business_brand.primary_email','answered','ruth@cedarandpine.test',null,null,null),
  ('Cedar & Pine Millwork','business_brand.has_brand_guide','answered',null,null,false,null),
  ('Cedar & Pine Millwork','business_brand.brand_colors','unknown',null,null,null,null),
  ('Cedar & Pine Millwork','business_brand.tone','answered',null,null,null,'["straightforward","premium","traditional"]'),
  ('Cedar & Pine Millwork','digital_access.who_manages_website','answered','Nobody since 2023.',null,null,null),
  ('Cedar & Pine Millwork','digital_access.website_platform','answered','wordpress',null,null,null),
  ('Cedar & Pine Millwork','digital_access.domain_registrar','unknown',null,null,null,null),
  ('Cedar & Pine Millwork','digital_access.has_google_business_profile','answered',null,null,true,null),
  ('Cedar & Pine Millwork','digital_access.confirm_no_credentials','answered',null,null,true,null),
  ('Cedar & Pine Millwork','digital_access.access_blockers','answered','The guy who built the site has the hosting login and has not answered an email since March.',null,null,null),
  ('Cedar & Pine Millwork','financial_baseline.annual_revenue','answered',null,1840000,null,null),
  ('Cedar & Pine Millwork','financial_baseline.gross_margin','answered',null,38.5,null,null),
  ('Cedar & Pine Millwork','financial_baseline.fixed_overhead_monthly','answered',null,47000,null,null),
  ('Cedar & Pine Millwork','financial_baseline.owner_comp','not_applicable',null,null,null,null),
  ('Cedar & Pine Millwork','financial_baseline.books_platform','answered','quickbooks',null,null,null),
  ('Cedar & Pine Millwork','lead_history.tracking_method','answered','notebook',null,null,null),

  ('Harbor Lane Roofing','business_brand.legal_name','answered','Harbor Lane Roofing Co.',null,null,null),
  ('Harbor Lane Roofing','business_brand.service_area','answered','Opelika, Auburn, Smiths Station.',null,null,null),
  ('Harbor Lane Roofing','business_brand.elevator_pitch','answered','Residential re-roofs and storm repair, done when we said we would.',null,null,null),
  ('Harbor Lane Roofing','business_brand.year_founded','answered',null,2018,null,null),
  ('Harbor Lane Roofing','business_brand.employees','answered',null,6,null,null),
  ('Harbor Lane Roofing','business_brand.primary_email','answered','dana@harborlane.test',null,null,null),
  ('Harbor Lane Roofing','business_brand.has_brand_guide','answered',null,null,false,null),
  ('Harbor Lane Roofing','digital_access.website_platform','answered','none',null,null,null),
  ('Harbor Lane Roofing','digital_access.has_google_business_profile','answered',null,null,true,null),
  ('Harbor Lane Roofing','digital_access.confirm_no_credentials','answered',null,null,true,null),
  -- The value the isolation test hunts for: Cedar & Pine must never see it.
  ('Harbor Lane Roofing','financial_baseline.annual_revenue','answered',null,612500,null,null),
  ('Harbor Lane Roofing','financial_baseline.gross_margin','answered',null,22.0,null,null),
  ('Harbor Lane Roofing','financial_baseline.owner_comp','answered',null,95000,null,null)
) as v(biz,field_key,status,value_text,value_number,value_boolean,value_json) on v.biz = c.business_name
join public.onboarding_fields f on f.field_key = v.field_key and f.section_key = es.section_key;

-- ---- Repeating group: twelve months of financials for Cedar & Pine ---------
-- Real rows, not indexed field keys. Each month is a row; each row's three
-- answers hang off it.
insert into public.onboarding_response_rows (engagement_section_id, group_field_id, position)
select es.id, g.id, m.n
from public.onboarding_engagement_sections es
join public.onboarding_engagements e on e.id = es.engagement_id
join public.clients c on c.id = e.client_id
join public.onboarding_fields g on g.field_key = 'financial_baseline.months'
cross join generate_series(1, 12) as m(n)
where c.business_name = 'Cedar & Pine Millwork' and es.section_key = 'financial_baseline';

insert into public.onboarding_responses (engagement_section_id, field_id, row_id, status, value_date)
select r.engagement_section_id, f.id, r.id, 'answered',
       (date '2025-08-01' + (r.position - 1) * interval '1 month')::date
from public.onboarding_response_rows r
join public.onboarding_fields g on g.id = r.group_field_id and g.field_key = 'financial_baseline.months'
join public.onboarding_fields f on f.field_key = 'financial_baseline.months.month';

insert into public.onboarding_responses (engagement_section_id, field_id, row_id, status, value_number)
select r.engagement_section_id, f.id, r.id, 'answered',
       120000 + (r.position * 7350) + ((r.position % 4) * 11200)
from public.onboarding_response_rows r
join public.onboarding_fields g on g.id = r.group_field_id and g.field_key = 'financial_baseline.months'
join public.onboarding_fields f on f.field_key = 'financial_baseline.months.revenue';

-- One month the client genuinely cannot reconstruct. Status carries that;
-- there is no value, and it still counts as answered for completion.
insert into public.onboarding_responses (engagement_section_id, field_id, row_id, status, value_number)
select r.engagement_section_id, f.id, r.id,
       case when r.position = 5 then 'unknown' else 'answered' end,
       case when r.position = 5 then null else 3 + (r.position % 5) end
from public.onboarding_response_rows r
join public.onboarding_fields g on g.id = r.group_field_id and g.field_key = 'financial_baseline.months'
join public.onboarding_fields f on f.field_key = 'financial_baseline.months.projects_completed';

-- ---- Repeating group: lead history for Cedar & Pine ------------------------
insert into public.onboarding_response_rows (engagement_section_id, group_field_id, position)
select es.id, g.id, m.n
from public.onboarding_engagement_sections es
join public.onboarding_engagements e on e.id = es.engagement_id
join public.clients c on c.id = e.client_id
join public.onboarding_fields g on g.field_key = 'lead_history.leads'
cross join generate_series(1, 4) as m(n)
where c.business_name = 'Cedar & Pine Millwork' and es.section_key = 'lead_history';

insert into public.onboarding_responses
  (engagement_section_id, field_id, row_id, status, value_text, value_number, value_boolean)
select r.engagement_section_id, f.id, r.id, 'answered',
       v.value_text, v.value_number, v.value_boolean
from public.onboarding_response_rows r
join public.onboarding_fields g on g.id = r.group_field_id and g.field_key = 'lead_history.leads'
join lateral (values
  (1,'lead_history.leads.source','referral',null,null),
  (1,'lead_history.leads.project','Kitchen + butler''s pantry, Moores Mill',null,null),
  (1,'lead_history.leads.estimated_value',null,68000,null),
  (1,'lead_history.leads.quoted',null,null,true),
  (1,'lead_history.leads.sold',null,null,true),
  (2,'lead_history.leads.source','google_search',null,null),
  (2,'lead_history.leads.project','Built-in bookcases',null,null),
  (2,'lead_history.leads.estimated_value',null,14500,null),
  (2,'lead_history.leads.quoted',null,null,true),
  (2,'lead_history.leads.sold',null,null,false),
  (3,'lead_history.leads.source','contractor',null,null),
  (3,'lead_history.leads.project','Trim package, 4,200 sq ft new build',null,null),
  (3,'lead_history.leads.estimated_value',null,52000,null),
  (3,'lead_history.leads.quoted',null,null,true),
  (3,'lead_history.leads.sold',null,null,true),
  (4,'lead_history.leads.source','unknown',null,null),
  (4,'lead_history.leads.project','Vanity, single bath',null,null),
  (4,'lead_history.leads.estimated_value',null,3800,null),
  (4,'lead_history.leads.quoted',null,null,false),
  (4,'lead_history.leads.sold',null,null,false)
) as v(pos,field_key,value_text,value_number,value_boolean) on v.pos = r.position
join public.onboarding_fields f on f.field_key = v.field_key;

insert into public.onboarding_responses (engagement_section_id, field_id, row_id, status, value_text)
select r.engagement_section_id, f.id, r.id, 'answered', v.reason
from public.onboarding_response_rows r
join public.onboarding_fields g on g.id = r.group_field_id and g.field_key = 'lead_history.leads'
join lateral (values
  (1,'Repeat customer, no competition.'),
  (2,'Lost on price. They went with a big-box install.'),
  (3,'Builder we have worked with for years.'),
  (4,'Never called back. Too small to chase.')
) as v(pos,reason) on v.pos = r.position
join public.onboarding_fields f on f.field_key = 'lead_history.leads.outcome_reason';

-- ---- Access grants ---------------------------------------------------------
-- Seeded from the derived platform list, so each client gets exactly the rows
-- their scope calls for. Harbor Lane has no google_ads service and no ad
-- sections, so no Google Ads row is created for them.
insert into public.onboarding_access_grants (engagement_id, platform_key, access_method, status)
select p.engagement_id, p.platform_key, 'unknown', 'pending'
from public.onboarding_engagement_platforms p
join public.onboarding_engagements e on e.id = p.engagement_id
where e.notes like '%[test]%'
on conflict (engagement_id, platform_key) do nothing;

-- A few worked states, including the one where the credential sits with
-- somebody who is not a contact at all.
update public.onboarding_access_grants g
   set access_method = 'delegated', status = 'verified', verified_at = now() - interval '3 days'
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
 where g.engagement_id = e.id and c.business_name = 'Cedar & Pine Millwork'
   and g.platform_key in ('google_business_profile','google_ads');

update public.onboarding_access_grants g
   set access_method = 'missing', status = 'blocked',
       holder_name = 'Previous web developer',
       holder_note = 'Built the site in 2021, unreachable since March. Registrar account is in his name.'
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
 where g.engagement_id = e.id and c.business_name = 'Cedar & Pine Millwork'
   and g.platform_key = 'website_host';

update public.onboarding_access_grants g
   set access_method = 'owner_holds', status = 'requested',
       holder_contact_id = ct.id
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
  join public.client_contacts ct on ct.client_id = c.id and ct.role = 'owner'
 where g.engagement_id = e.id and c.business_name = 'Harbor Lane Roofing'
   and g.platform_key = 'domain_registrar';

-- ---- Assets ----------------------------------------------------------------
-- Metadata rows plus the storage objects they describe, so the isolation test
-- can check both sides of the boundary. The path prefix is the engagement id;
-- the validate trigger refuses anything else.
insert into public.onboarding_assets
  (engagement_section_id, field_id, storage_path, file_name, mime_type, byte_size, kind, caption, uploaded_by_contact_id)
select es.id, f.id,
       e.id::text || '/business_brand/' || v.file_name,
       v.file_name, v.mime_type, v.byte_size, v.kind, v.caption, es.assigned_contact_id
from public.onboarding_engagement_sections es
join public.onboarding_engagements e on e.id = es.engagement_id
join public.clients c on c.id = e.client_id
join lateral (values
  ('Cedar & Pine Millwork','business_brand.logo_files','cedar-pine-logo.svg','image/svg+xml',18422,'logo','Primary logo, vector.'),
  ('Cedar & Pine Millwork','business_brand.brand_assets','shop-truck-door.jpg','image/jpeg',2841003,'brand','The green on the truck.'),
  ('Harbor Lane Roofing','business_brand.logo_files','harbor-lane-logo.png','image/png',94210,'logo','Only file they have.')
) as v(biz,field_key,file_name,mime_type,byte_size,kind,caption) on v.biz = c.business_name
join public.onboarding_fields f on f.field_key = v.field_key
where es.section_key = 'business_brand';

insert into storage.objects (bucket_id, name, owner, metadata)
select 'onboarding', a.storage_path, null,
       jsonb_build_object('mimetype', a.mime_type, 'size', a.byte_size)
from public.onboarding_assets a
join public.onboarding_engagements e on e.id = a.engagement_id
where e.notes like '%[test]%'
on conflict do nothing;

commit;
