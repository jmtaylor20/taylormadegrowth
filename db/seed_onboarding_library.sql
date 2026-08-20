-- Onboarding section library: the questions, not the answers.
--
-- This is definition data. It is meant to be edited by changing rows — in the
-- app, in the SQL editor, or by re-running this file — never by a deploy.
-- Re-runnable: every insert upserts on its natural key.
--
-- Coverage note: the two core sections a client opens first —
-- engagement_details and communication_decisions — are written out in full,
-- because an empty section is the worst thing to put in front of somebody on
-- their first visit. business_brand, digital_access, financial_baseline and
-- lead_history are filled in too, and between them they exercise every
-- mechanism in the schema — scalars of each type, checklists, file uploads, and
-- repeating groups. professional_network and portfolio get their repeating
-- groups defined because those shapes were specified. customer_data,
-- sales_process, marketing_boundaries, job_economics, capacity and
-- signature_spec are still stubs: title and intro copy only, ready to fill in.

begin;

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------
insert into public.onboarding_sections (key, title, tier, vertical, position, intro, description) values
  ('engagement_details', 'Engagement Details', 'core', null, 10,
   'Let''s start with the basics of what we''re building together and who''s involved. This takes about five minutes.',
   'Scope, timeline, decision makers, and what success looks like.'),

  ('business_brand', 'Business & Brand', 'core', null, 20,
   'Tell us about your business in your own words. We''d rather hear how you actually describe yourself than a polished paragraph — that''s what we''ll build the messaging from.',
   'Identity, positioning, service area, brand assets.'),

  ('digital_access', 'Website & Digital Access', 'core', null, 30,
   'We need delegated access to the platforms your business already lives on. To be clear: we never ask for your passwords. Delegated access means you add us as a user on the account, and you can remove us at any time.',
   'Platform access tracking. Never credentials.'),

  ('communication_decisions', 'Communication & Decision Making', 'core', null, 40,
   'How you want to hear from us, how often, and who signs off on what. Getting this right up front saves everybody a lot of chasing.',
   'Cadence, channels, approval chain.'),

  ('customer_data', 'Existing Customer Data', 'scope', null, 50,
   'Anything you already have on your customers — a list, a spreadsheet, a shoebox of invoices. If it''s messy, send it messy. We''d rather see the real thing.',
   'Lists, CRM exports, historical customer records.'),

  ('sales_process', 'Current Sales Process', 'scope', null, 60,
   'Walk us through what happens between "someone calls" and "money changes hands." Every step, including the ones that annoy you.',
   'Intake, quoting, follow-up, close.'),

  ('marketing_boundaries', 'Customer & Marketing Boundaries', 'scope', null, 70,
   'The work you want more of, the work you''d rather stop taking, and anything we should never say in your name.',
   'Target customer, exclusions, brand safety.'),

  ('portfolio', 'Project Portfolio', 'scope', null, 80,
   'Your best work. Photos, projects you''re proud of, the ones you show people at parties. This is what sells the next job.',
   'Featured projects and supporting photography.'),

  ('financial_baseline', 'Financial Baseline', 'advisory', null, 90,
   'This is the section people skip. Please don''t. We can''t advise on pricing or capacity without knowing the shape of the business. If you don''t know a number, mark it Unknown — that''s a real answer and it tells us something.',
   'Revenue, margin, overhead, twelve-month history.'),

  ('job_economics', 'Job Economics', 'advisory', null, 100,
   'What a typical job actually costs you to deliver, and what''s left over when it''s done.',
   'Cost structure per job, materials, labor, margin by type.'),

  ('capacity', 'Capacity', 'advisory', null, 110,
   'How much work you can take on before something breaks. Usually best answered by whoever runs the shop rather than whoever runs the business.',
   'Throughput, constraints, lead times, crew.'),

  ('lead_history', 'Lead History', 'advisory', null, 120,
   'The last twenty to thirty leads you can remember, and what happened to each. This is the single most useful thing you can give us — it tells us where your business actually comes from, which is almost never where people assume.',
   'Source attribution and win/loss reasons.'),

  ('professional_network', 'Professional Network', 'advisory', null, 130,
   'Architects, designers, general contractors, suppliers, past collaborators. Referral networks are usually a business''s best channel and the one nobody maintains on purpose.',
   'Referral relationships worth cultivating.'),

  ('signature_spec', 'Signature Specification', 'vertical', 'millwork', 140,
   'The details that make your work yours — species, joinery, finishes, the standards you won''t compromise on.',
   'Millwork-specific craft specification.')
on conflict (key) do update set
  title = excluded.title, tier = excluded.tier, vertical = excluded.vertical,
  position = excluded.position, intro = excluded.intro, description = excluded.description;

-- ---------------------------------------------------------------------------
-- Fields — engagement_details
-- ---------------------------------------------------------------------------
-- The first section anybody opens, so it sets the tone for the whole thing:
-- short, plain, and about them rather than about us. It runs on every template,
-- so nothing here may assume a website, an ad account, or a build.
--
-- The questions that earn their place are the ones whose absence costs money
-- later — what they think they are buying, who can actually say yes, and what
-- went wrong the last time somebody did this for them.
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('engagement_details','engagement_details.what_we_are_building','In your own words, what are we doing for you?','long_text',true,10,
   'However you would explain it to a friend. If your version and ours differ, we would much rather find that out now.','[]'::jsonb,null),
  ('engagement_details','engagement_details.why_now','Why now? What changed?','long_text',false,20,
   'Something usually prompts this — a busy season coming, a competitor, a system that finally broke.','[]'::jsonb,null),
  ('engagement_details','engagement_details.success_looks_like','Six months from now, what has to be true for this to have been worth it?','long_text',true,30,
   'Be specific if you can. "More leads" is harder to aim at than "the phone rings twice a week from Google".','[]'::jsonb,null),

  ('engagement_details','engagement_details.decision_maker','Who has the final say?','short_text',true,100,
   'One name. Everything ends up waiting on this person, so it helps to know who they are.','[]'::jsonb,null),
  ('engagement_details','engagement_details.others_involved','Who else needs to weigh in, and on what?','long_text',false,110,
   'A spouse, a partner, an office manager, a board. Better to know now than to find out at approval.','[]'::jsonb,null),

  ('engagement_details','engagement_details.target_date','Is there a date this needs to be done by?','date',false,200,
   'Leave it blank if there genuinely is not one.','[]'::jsonb,null),
  ('engagement_details','engagement_details.date_driver','What is driving that date?','short_text',false,210,
   'A show, a season, a lease, a launch. A real reason changes what we build first.','[]'::jsonb,null),

  ('engagement_details','engagement_details.worked_with_someone_before','Have you hired someone for this kind of work before?','boolean',false,300,null,'[]'::jsonb,null),
  ('engagement_details','engagement_details.previous_experience','If so, how did it go?','long_text',false,310,
   'The bad ones are more useful to us than the good ones. We would rather not repeat somebody else''s mistake.','[]'::jsonb,null),

  ('engagement_details','engagement_details.constraints','Anything that could get in the way?','long_text',false,400,
   'Busy season, staff changes, someone who hates change, a system you are stuck with. Not a complaint — just the terrain.','[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — communication_decisions
-- ---------------------------------------------------------------------------
-- Almost every engagement that goes badly goes badly here first: somebody
-- waiting on an approval that nobody knew they owned, or an update sent to a
-- channel the client does not read. Cheap to ask, expensive to guess.
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('communication_decisions','communication_decisions.best_channel','How do you want us to reach you?','select',true,10,
   'The one you actually read, not the one you feel you should say.',
   '[{"value":"email","label":"Email"},{"value":"text","label":"Text message"},{"value":"phone","label":"Phone call"},{"value":"whatever","label":"Whichever is fastest at the time"}]'::jsonb,null),
  ('communication_decisions','communication_decisions.reach_notes','When are you easiest to reach?','short_text',false,20,
   'Early mornings, after five, never on Fridays — whatever is true.','[]'::jsonb,null),
  ('communication_decisions','communication_decisions.response_expectation','How quickly do you normally get back to things?','select',false,30,
   'This sets our expectations, not yours. Knowing you are on a roof all day is useful.',
   '[{"value":"same_day","label":"Same day, usually"},{"value":"couple_days","label":"Within a couple of days"},{"value":"week","label":"A week is realistic"},{"value":"chase_me","label":"Honestly, chase me"}]'::jsonb,null),

  ('communication_decisions','communication_decisions.checkin_cadence','How often do you want to hear from us?','select',true,100,null,
   '[{"value":"weekly","label":"Weekly"},{"value":"biweekly","label":"Every couple of weeks"},{"value":"monthly","label":"Monthly"},{"value":"as_needed","label":"Only when there is something to decide"}]'::jsonb,null),
  ('communication_decisions','communication_decisions.checkin_format','In what form?','select',false,110,null,
   '[{"value":"call","label":"A short call"},{"value":"written","label":"A written update I can read whenever"},{"value":"either","label":"Whichever suits the week"}]'::jsonb,null),
  ('communication_decisions','communication_decisions.bad_news','How do you want to hear it when something slips or goes wrong?','long_text',false,120,
   'We would rather tell you early and plainly. Tell us how you want that delivered.','[]'::jsonb,null),

  ('communication_decisions','communication_decisions.who_approves','Who signs off before something goes live?','short_text',true,200,
   'Can be the same person as the decision maker, or not.','[]'::jsonb,null),
  ('communication_decisions','communication_decisions.approval_speed','Realistically, how long does an approval take?','select',false,210,
   'An honest answer here is what stops a build stalling with nobody quite sure why.',
   '[{"value":"same_day","label":"Same day"},{"value":"few_days","label":"A few days"},{"value":"depends","label":"It depends who is around"},{"value":"slow","label":"Longer than either of us would like"}]'::jsonb,null),
  ('communication_decisions','communication_decisions.copy_in','Anyone else who should be copied in?','long_text',false,220,
   'Names and email addresses. A bookkeeper, an office manager, a business partner.','[]'::jsonb,null),

  ('communication_decisions','communication_decisions.ask_first','Anything we should never do without checking with you first?','long_text',false,300,
   'Publishing a page, replying to a review, changing a phone number, emailing your customers — that kind of thing.','[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — business_brand (scalars of most types + file uploads)
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('business_brand','business_brand.legal_name','Legal business name','short_text',true,10,null,'[]'::jsonb,null),
  ('business_brand','business_brand.dba','Doing business as (if different)','short_text',false,20,null,'[]'::jsonb,null),
  ('business_brand','business_brand.year_founded','Year founded','number',false,30,null,'[]'::jsonb,null),
  ('business_brand','business_brand.employees','Number of employees','number',false,40,'Include yourself. Part-time counts.','[]'::jsonb,null),
  ('business_brand','business_brand.service_area','Service area','long_text',true,50,'Cities, counties, or a radius — however you actually think about it.','[]'::jsonb,null),
  ('business_brand','business_brand.elevator_pitch','How do you describe what you do?','long_text',true,60,'In your own words, the way you''d say it to someone at a job site.','[]'::jsonb,null),
  ('business_brand','business_brand.differentiators','What makes you different from the next guy?','long_text',true,70,null,'[]'::jsonb,null),
  ('business_brand','business_brand.ideal_customer','Who is your best customer?','long_text',false,80,'Think of a specific one and describe them.','[]'::jsonb,null),
  ('business_brand','business_brand.primary_phone','Main business phone','phone',true,90,null,'[]'::jsonb,null),
  ('business_brand','business_brand.primary_email','Main business email','email',true,100,null,'[]'::jsonb,null),
  ('business_brand','business_brand.website_url','Current website','url',false,110,'Leave blank if you don''t have one yet.','[]'::jsonb,null),
  ('business_brand','business_brand.has_brand_guide','Do you have a brand guide or style sheet?','boolean',false,120,null,'[]'::jsonb,null),
  ('business_brand','business_brand.brand_colors','Brand colors','short_text',false,130,'Hex codes if you have them, "the green on the truck" if you don''t.','[]'::jsonb,null),
  ('business_brand','business_brand.tone','How should your marketing sound?','multi_select',false,140,'Pick as many as fit.',
   '[{"value":"straightforward","label":"Straightforward"},{"value":"premium","label":"Premium"},{"value":"friendly","label":"Friendly"},{"value":"technical","label":"Technical"},{"value":"traditional","label":"Traditional"},{"value":"modern","label":"Modern"},{"value":"local","label":"Local / hometown"}]'::jsonb, null),
  ('business_brand','business_brand.logo_files','Logo files','file_upload',true,150,'Vector (AI, EPS, SVG) if you have it. A photo of a business card is better than nothing.','[]'::jsonb,null),
  ('business_brand','business_brand.brand_assets','Other brand assets','file_upload',false,160,'Truck wraps, signage, letterhead, uniforms — anything with the brand on it.','[]'::jsonb,null)
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, required = excluded.required,
  position = excluded.position, help_text = excluded.help_text, options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — digital_access (checklist items + selects)
-- ---------------------------------------------------------------------------
-- Note what is NOT here: any field that could hold a credential. Which
-- platforms this client is actually asked about is derived at read time from
-- onboarding_engagement_platforms, and the answers land in
-- onboarding_access_grants rather than in responses.
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('digital_access','digital_access.who_manages_website','Who currently manages your website?','short_text',false,10,'A person, an agency, a nephew — whoever actually has the login.','[]'::jsonb,null),
  ('digital_access','digital_access.website_platform','What is the website built on?','select',false,20,null,
   '[{"value":"wordpress","label":"WordPress"},{"value":"squarespace","label":"Squarespace"},{"value":"wix","label":"Wix"},{"value":"shopify","label":"Shopify"},{"value":"godaddy","label":"GoDaddy builder"},{"value":"custom","label":"Custom build"},{"value":"none","label":"No website"},{"value":"unknown","label":"Not sure"}]'::jsonb, null),
  ('digital_access','digital_access.domain_registrar','Where is your domain registered?','short_text',false,30,'GoDaddy, Namecheap, Google Domains… "not sure" is fine.','[]'::jsonb,null),
  ('digital_access','digital_access.hosting_provider','Who hosts the website?','short_text',false,40,null,'[]'::jsonb,null),
  ('digital_access','digital_access.has_google_business_profile','Do you have a Google Business Profile?','boolean',false,50,'The listing with your hours and reviews that shows up in Maps.','[]'::jsonb,null),
  ('digital_access','digital_access.analytics_in_place','Which of these are already set up?','multi_select',false,60,null,
   '[{"value":"google_analytics","label":"Google Analytics"},{"value":"search_console","label":"Google Search Console"},{"value":"tag_manager","label":"Google Tag Manager"},{"value":"call_tracking","label":"Call tracking"},{"value":"pixel","label":"Meta pixel"},{"value":"none","label":"None of these"}]'::jsonb, null),
  ('digital_access','digital_access.access_blockers','Anything standing in the way of granting access?','long_text',false,70,'Former web developer who won''t respond, a login nobody has, an account in an ex-employee''s name — tell us now rather than later.','[]'::jsonb,null),
  ('digital_access','digital_access.confirm_no_credentials','I understand TaylorMade will never ask for my passwords','checklist_item',true,80,'We request delegated access — you add us as a user and can remove us any time. If anyone ever asks you for a password in our name, it is not us.','[]'::jsonb,null),
  ('digital_access','digital_access.confirm_access_reviewed','I have reviewed the platform list above and marked where we stand','checklist_item',true,90,null,'[]'::jsonb,null)
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, required = excluded.required,
  position = excluded.position, help_text = excluded.help_text, options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — financial_baseline (scalars + a 12-row repeating group)
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('financial_baseline','financial_baseline.annual_revenue','Last full year of revenue','currency',false,10,'Best estimate is fine. Unknown is also fine.','[]'::jsonb,'USD'),
  ('financial_baseline','financial_baseline.gross_margin','Gross margin','number',false,20,'Revenue minus the direct cost of doing the work, as a percentage. If you have never calculated it, mark Unknown — we would rather know that than get a guess.','[]'::jsonb,'%'),
  ('financial_baseline','financial_baseline.fixed_overhead_monthly','Monthly fixed overhead','currency',false,30,'Rent, insurance, payroll, truck notes — what goes out whether or not you sell a job.','[]'::jsonb,'USD'),
  ('financial_baseline','financial_baseline.owner_comp','What do you pay yourself annually?','currency',false,40,'This stays between us. It matters for pricing advice.','[]'::jsonb,'USD'),
  ('financial_baseline','financial_baseline.books_platform','Where do you keep the books?','select',false,50,null,
   '[{"value":"quickbooks","label":"QuickBooks"},{"value":"xero","label":"Xero"},{"value":"wave","label":"Wave"},{"value":"spreadsheet","label":"Spreadsheet"},{"value":"accountant","label":"My accountant has it"},{"value":"none","label":"Nothing formal"}]'::jsonb, null)
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, required = excluded.required,
  position = excluded.position, help_text = excluded.help_text, options = excluded.options, unit = excluded.unit;

insert into public.onboarding_fields
  (section_key, field_key, label, field_kind, field_type, position, help_text, min_rows, max_rows) values
  ('financial_baseline','financial_baseline.months','Last twelve months','repeating_group',null,60,
   'One row per month. If a month is a blur, mark the row Unknown rather than guessing.',12,12)
on conflict (field_key) do update set
  label = excluded.label, position = excluded.position, help_text = excluded.help_text,
  min_rows = excluded.min_rows, max_rows = excluded.max_rows;

insert into public.onboarding_fields
  (section_key, parent_field_id, field_key, label, field_type, position, unit)
select 'financial_baseline', g.id, v.field_key, v.label, v.field_type, v.position, v.unit
from public.onboarding_fields g,
     (values
       ('financial_baseline.months.month','Month','date',10,null),
       ('financial_baseline.months.revenue','Revenue','currency',20,'USD'),
       ('financial_baseline.months.projects_completed','Projects completed','number',30,null)
     ) as v(field_key,label,field_type,position,unit)
where g.field_key = 'financial_baseline.months'
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, position = excluded.position, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — lead_history (a 20-30 row repeating group)
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options) values
  ('lead_history','lead_history.tracking_method','How do you track leads today?','select',false,10,null,
   '[{"value":"crm","label":"A CRM"},{"value":"spreadsheet","label":"Spreadsheet"},{"value":"notebook","label":"Notebook / whiteboard"},{"value":"memory","label":"Memory"},{"value":"none","label":"We don''t"}]'::jsonb)
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, required = excluded.required,
  position = excluded.position, help_text = excluded.help_text, options = excluded.options;

insert into public.onboarding_fields
  (section_key, field_key, label, field_kind, field_type, position, help_text, min_rows, max_rows) values
  ('lead_history','lead_history.leads','Recent leads','repeating_group',null,20,
   'The last twenty to thirty you can reconstruct. Won and lost both — the lost ones are usually more instructive.',20,30)
on conflict (field_key) do update set
  label = excluded.label, position = excluded.position, help_text = excluded.help_text,
  min_rows = excluded.min_rows, max_rows = excluded.max_rows;

insert into public.onboarding_fields
  (section_key, parent_field_id, field_key, label, field_type, position, unit, options)
select 'lead_history', g.id, v.field_key, v.label, v.field_type, v.position, v.unit, v.options::jsonb
from public.onboarding_fields g,
     (values
       ('lead_history.leads.source','Where did it come from?','select',10,null,
        '[{"value":"referral","label":"Referral"},{"value":"repeat","label":"Repeat customer"},{"value":"google_search","label":"Google search"},{"value":"google_maps","label":"Google Maps"},{"value":"facebook","label":"Facebook / Instagram"},{"value":"sign_truck","label":"Sign or truck"},{"value":"word_of_mouth","label":"Word of mouth"},{"value":"contractor","label":"GC / builder"},{"value":"unknown","label":"No idea"}]'),
       ('lead_history.leads.project','What was the project?','short_text',20,null,'[]'),
       ('lead_history.leads.estimated_value','Estimated value','currency',30,'USD','[]'),
       ('lead_history.leads.quoted','Did you quote it?','boolean',40,null,'[]'),
       ('lead_history.leads.sold','Did you win it?','boolean',50,null,'[]'),
       ('lead_history.leads.outcome_reason','Why won or lost?','long_text',60,null,'[]')
     ) as v(field_key,label,field_type,position,unit,options)
where g.field_key = 'lead_history.leads'
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, position = excluded.position,
  unit = excluded.unit, options = excluded.options;

-- ---------------------------------------------------------------------------
-- Fields — the other two specified repeating groups
-- ---------------------------------------------------------------------------
-- These sections are otherwise stubs, but their shapes were specified, so the
-- groups are defined here rather than left to be guessed at later.
insert into public.onboarding_fields
  (section_key, field_key, label, field_kind, field_type, position, help_text, min_rows, max_rows) values
  ('professional_network','professional_network.contacts','People in your network','repeating_group',null,10,
   'Architects, designers, GCs, suppliers, anyone who has sent you work or could.',null,null),
  ('portfolio','portfolio.featured_projects','Featured projects','repeating_group',null,20,
   'The work you would put on the homepage.',null,null)
on conflict (field_key) do update set
  label = excluded.label, position = excluded.position, help_text = excluded.help_text;

insert into public.onboarding_fields
  (section_key, parent_field_id, field_key, label, field_type, position, options)
select 'professional_network', g.id, v.field_key, v.label, v.field_type, v.position, v.options::jsonb
from public.onboarding_fields g,
     (values
       ('professional_network.contacts.name','Name','short_text',10,'[]'),
       ('professional_network.contacts.company','Company','short_text',20,'[]'),
       ('professional_network.contacts.type','Type','select',30,
        '[{"value":"architect","label":"Architect"},{"value":"designer","label":"Interior designer"},{"value":"gc","label":"General contractor"},{"value":"builder","label":"Builder"},{"value":"supplier","label":"Supplier"},{"value":"trade","label":"Other trade"},{"value":"other","label":"Other"}]'),
       ('professional_network.contacts.email','Email','email',40,'[]'),
       ('professional_network.contacts.phone','Phone','phone',50,'[]'),
       ('professional_network.contacts.relationship','Relationship','long_text',60,'[]')
     ) as v(field_key,label,field_type,position,options)
where g.field_key = 'professional_network.contacts'
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, position = excluded.position, options = excluded.options;

insert into public.onboarding_fields
  (section_key, parent_field_id, field_key, label, field_type, position)
select 'portfolio', g.id, v.field_key, v.label, v.field_type, v.position
from public.onboarding_fields g,
     (values
       ('portfolio.featured_projects.name','Project / city','short_text',10),
       ('portfolio.featured_projects.type','Project type','short_text',20),
       ('portfolio.featured_projects.species_finish','Species / finish','short_text',30),
       ('portfolio.featured_projects.year','Year','number',40),
       ('portfolio.featured_projects.story','What made it special?','long_text',50),
       ('portfolio.featured_projects.photos','Photos','file_upload',60)
     ) as v(field_key,label,field_type,position)
where g.field_key = 'portfolio.featured_projects'
on conflict (field_key) do update set
  label = excluded.label, field_type = excluded.field_type, position = excluded.position;

-- ---------------------------------------------------------------------------
-- Platform catalog
-- ---------------------------------------------------------------------------
insert into public.onboarding_platforms (key, label, category, position, description) values
  ('domain_registrar','Domain registrar','website',10,'Where the domain name is registered. We need access to point DNS.'),
  ('website_host','Website hosting','website',20,'Where the site is served from.'),
  ('website_cms','Website admin / CMS','website',30,'The login that edits the site itself.'),
  ('business_email','Business email','email',40,'Google Workspace, Microsoft 365, or your mail host.'),
  ('google_business_profile','Google Business Profile','listings',50,'Your Maps listing. Delegated as a Manager.'),
  ('review_platform','Review platform','listings',60,'Wherever reviews are collected outside of Google.'),
  ('google_ads','Google Ads','advertising',70,'Linked to our manager account. You keep ownership and billing.'),
  ('google_analytics','Google Analytics','analytics',80,'Read and edit access to the property.'),
  ('google_search_console','Google Search Console','analytics',90,'Verified property access.'),
  ('google_tag_manager','Google Tag Manager','analytics',100,'Container access for conversion tracking.'),
  ('call_tracking','Call tracking','analytics',110,'CallRail or similar, if you use one.'),
  ('meta_business','Meta Business Suite','social',120,'Partner access to the business account.'),
  ('facebook_page','Facebook Page','social',130,'Page role, not a shared login.'),
  ('instagram','Instagram','social',140,'Linked through the Meta business account.'),
  ('crm','CRM','other',150,'Whatever system holds your customers and jobs.')
on conflict (key) do update set
  label = excluded.label, category = excluded.category,
  position = excluded.position, description = excluded.description;

-- What pulls each platform onto a client's list. Rows are OR'd. A website-only
-- client matches nothing that requires the google_ads or social services, so
-- Google Ads never appears on their page.
insert into public.onboarding_platform_triggers (platform_key, trigger_type, trigger_key) values
  ('domain_registrar','always',null),
  ('website_host','always',null),
  ('website_cms','service','website'),
  ('website_cms','service','hosting'),
  ('business_email','service','hosting'),
  ('google_business_profile','service','gbp'),
  ('review_platform','service','gbp'),
  ('google_ads','service','google_ads'),
  ('google_analytics','service','website'),
  ('google_analytics','service','google_ads'),
  ('google_search_console','service','website'),
  ('google_tag_manager','service','google_ads'),
  ('call_tracking','section','lead_history'),
  ('meta_business','service','social'),
  ('facebook_page','service','social'),
  ('instagram','service','social'),
  ('crm','section','sales_process'),
  ('crm','section','customer_data')
on conflict (platform_key, trigger_type, coalesce(trigger_key, '')) do nothing;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
-- A template is a starting set, not a cage — activating another section on a
-- live engagement is an ordinary insert into onboarding_engagement_sections.
--
-- Vertical sections are deliberately absent from every template: they are
-- gated on the engagement's `vertical`, so listing signature_spec in
-- growth_partner would make the template fail to apply to any non-millwork
-- client. Activate vertical sections from the engagement's vertical instead.
insert into public.onboarding_templates (key, title, description, position) values
  ('website_build','Website Build','Core sections only. A site build with no ongoing advisory work.',10),
  ('website_ads','Website + Ads','Core sections plus the customer, market, portfolio, and lead-source context an ad program needs.',20),
  ('growth_partner','Growth Partner','Everything. Full advisory engagement — pricing, capacity, CRM, the lot.',30)
on conflict (key) do update set
  title = excluded.title, description = excluded.description, position = excluded.position;

delete from public.onboarding_template_sections
 where template_key in ('website_build','website_ads','growth_partner');

-- Core: every template gets all four.
insert into public.onboarding_template_sections (template_key, section_key, position)
select t.key, s.key, s.position
from (values ('website_build'),('website_ads'),('growth_partner')) as t(key)
join public.onboarding_sections s on s.tier = 'core';

insert into public.onboarding_template_sections (template_key, section_key, position)
select 'website_ads', s.key, s.position
from public.onboarding_sections s
where s.key in ('customer_data','marketing_boundaries','portfolio','lead_history');

-- Growth partner: every non-vertical section.
insert into public.onboarding_template_sections (template_key, section_key, position)
select 'growth_partner', s.key, s.position
from public.onboarding_sections s
where s.tier in ('scope','advisory');

commit;
