-- Onboarding library: the custom application build discovery.
--
-- This is the App Discovery Checklist turned into portal sections. The paper
-- version is two pages of checkboxes a client fills in at a meeting; this is
-- the same questions, answerable from a phone, at their own pace, with the
-- answers landing somewhere queryable instead of in a folder.
--
-- Definition data, like db/seed_onboarding_library.sql. Re-runnable: every
-- insert upserts on its natural key, so editing this file and running it again
-- is how you change a question.
--
-- Seven sections, matching the checklist's own seven numbered blocks — a client
-- who has seen the PDF recognises where they are. They are also the natural
-- assignment boundaries: the owner answers the money and priorities, whoever
-- runs the crew answers the field ones.
--
-- Deliberately NOT re-asked here: business name, owner, years in business,
-- employee count, phone and email. Those are already business_brand, which the
-- app_build template turns on. Asking a client the same question twice is how
-- a form starts feeling like homework.
--
-- The checklist's "N = need it now / L = add it later" marks become two lists
-- per group: what they need on day one, and what can wait. Same information,
-- and it survives being answered on a phone, which sixty tri-state rows would
-- not.

begin;

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------
-- Tier 'scope': activated when the engagement calls for it, never by default.
-- Positions start at 200 so these sort after the standing library.
insert into public.onboarding_sections (key, title, tier, vertical, position, intro, description) values
  ('app_operations', 'How The Business Runs Today', 'scope', null, 200,
   'Answer plainly. There are no wrong answers here — we are copying your process, not replacing it. If something is in your head rather than written down, say that; it is the most useful answer you can give us.',
   'App discovery 1. Roles, volume, seasonality, and the owner''s own words on what hurts.'),

  ('app_intake', 'How Work Comes In', 'scope', null, 210,
   'Everything between "someone gets in touch" and "they said yes." We are looking for where things fall through, so the honest version is worth more than the tidy one.',
   'App discovery 2. Lead sources, capture, pricing method, estimates.'),

  ('app_delivery', 'Doing The Work & Getting Paid', 'scope', null, 220,
   'How a job gets scheduled, done, invoiced, and paid for — and what happens to the paperwork afterwards.',
   'App discovery 3. Scheduling, field tracking, invoicing, payment, records.'),

  ('app_modules', 'What The System Should Do', 'scope', null, 230,
   'Now the fun part. For each group, tick what you need from day one, and separately what can wait until later. Nothing here is all-or-nothing — a smaller first build that you actually use beats a big one you do not.',
   'App discovery 4. Core operating modules, split into day-one and later.'),

  ('app_field_money', 'Field, Shop & The Numbers', 'scope', null, 240,
   'The tracking that happens away from a desk, and the numbers your pricing gets built on. The cost questions are the ones people skip — please do not. If you do not know one, mark it Unknown; that tells us something real.',
   'App discovery 5. Field/shop tracking, money tracking, cost inputs for pricing.'),

  ('app_growth', 'Growth, Reporting & Industry Fit', 'scope', null, 250,
   'What should happen after a job is done, what you want to be able to see, and which shape of build yours is closest to.',
   'App discovery 6. Follow-up, reporting, industry template selection.'),

  ('app_priorities', 'Priorities', 'scope', null, 260,
   'The most important page. Everything above tells us what is possible; this tells us what to build first. Short answers are fine — we will go through these with you.',
   'App discovery 7. Top three headaches, day-one scope, existing software, go-live.')
on conflict (key) do update set
  title = excluded.title, tier = excluded.tier, vertical = excluded.vertical,
  position = excluded.position, intro = excluded.intro, description = excluded.description;

-- ---------------------------------------------------------------------------
-- Fields — app_operations
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_operations','app_operations.what_you_sell','What do you sell?','multi_select',true,10,'Tick everything that applies.',
   '[{"value":"one_time","label":"One-time service jobs"},{"value":"recurring","label":"Recurring or contract service"},{"value":"custom_build","label":"Custom build / fabrication to order"},{"value":"products","label":"Products or materials"},{"value":"appointments","label":"Appointments or consultations"},{"value":"other","label":"Something else"}]'::jsonb,null),
  ('app_operations','app_operations.what_you_sell_other','If something else, what?','short_text',false,20,null,'[]'::jsonb,null),

  ('app_operations','app_operations.who_answers_phone','Who answers the phone?','short_text',false,100,'A name is fine. "Me" is fine.','[]'::jsonb,null),
  ('app_operations','app_operations.who_prices','Who prices and estimates work?','short_text',false,110,null,'[]'::jsonb,null),
  ('app_operations','app_operations.who_schedules','Who schedules the work?','short_text',false,120,null,'[]'::jsonb,null),
  ('app_operations','app_operations.who_runs_crew','Who runs the crew or the shop?','short_text',false,130,null,'[]'::jsonb,null),
  ('app_operations','app_operations.who_invoices','Who sends invoices and collects?','short_text',false,140,null,'[]'::jsonb,null),
  ('app_operations','app_operations.who_handles_receipts','Who handles receipts and expenses?','short_text',false,150,null,'[]'::jsonb,null),
  ('app_operations','app_operations.who_follows_up','Who follows up with past customers?','short_text',false,160,'If nobody does, say so — that is one of the most common gaps we fill.','[]'::jsonb,null),

  ('app_operations','app_operations.jobs_per_week','Jobs per week','number',false,200,'A rough average is fine.','[]'::jsonb,null),
  ('app_operations','app_operations.average_job','Average job','currency',false,210,null,'[]'::jsonb,'USD'),
  ('app_operations','app_operations.busy_season','Busy season','short_text',false,220,null,'[]'::jsonb,null),
  ('app_operations','app_operations.slow_season','Slow season','short_text',false,230,null,'[]'::jsonb,null),
  ('app_operations','app_operations.crews_running','Crews or trucks running','number',false,240,null,'[]'::jsonb,null),

  ('app_operations','app_operations.reality_check','Which of these are true right now?','multi_select',false,300,'Nobody is judging. These are the exact things a system is good at taking off you.',
   '[{"value":"owner_in_field","label":"The owner is still working in the field or shop daily"},{"value":"one_phone","label":"Everything runs through one person''s phone"},{"value":"work_missed","label":"Work gets missed when that person is busy"},{"value":"paperwork_limits","label":"Growth is limited by paperwork, not demand"}]'::jsonb,null),

  ('app_operations','app_operations.one_thing','If one thing ran itself tomorrow, what would it be?','long_text',true,400,null,'[]'::jsonb,null),
  ('app_operations','app_operations.tired_of','What are you tired of doing by hand?','long_text',true,410,null,'[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — app_intake
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_intake','app_intake.lead_sources','Where do leads come from?','multi_select',true,10,'Tick everything, even the small ones.',
   '[{"value":"phone","label":"Phone calls"},{"value":"website_form","label":"Website form"},{"value":"google","label":"Google / Google Business Profile"},{"value":"social","label":"Facebook or Instagram"},{"value":"referrals","label":"Referrals from past customers"},{"value":"trade","label":"Contractors, builders, or designers"},{"value":"repeat","label":"Repeat customers"},{"value":"signage","label":"Trucks, signs, word of mouth"},{"value":"other","label":"Something else"}]'::jsonb,null),
  ('app_intake','app_intake.lead_sources_other','If something else, what?','short_text',false,20,null,'[]'::jsonb,null),

  ('app_intake','app_intake.lead_capture','Where does a new lead get written down?','select',true,100,null,
   '[{"value":"notebook","label":"Notebook or paper"},{"value":"notes_app","label":"Notes app or text messages"},{"value":"spreadsheet","label":"Spreadsheet"},{"value":"software","label":"Software"},{"value":"nowhere","label":"Nowhere — we just remember it"}]'::jsonb,null),
  ('app_intake','app_intake.lead_capture_software','If software, which one?','short_text',false,110,null,'[]'::jsonb,null),
  ('app_intake','app_intake.response_time','How fast do you typically get back to a new lead?','short_text',false,120,'"Within the hour", "same day", "when I get off the job" — whatever is honest.','[]'::jsonb,null),
  ('app_intake','app_intake.leads_lost','Have leads been lost or forgotten before?','boolean',false,130,'Almost everyone answers yes. It is the single most expensive leak we fix.','[]'::jsonb,null),

  ('app_intake','app_intake.pricing_method','How do you price a job?','multi_select',true,200,null,
   '[{"value":"walk_job","label":"Walk the job in person"},{"value":"photos","label":"Photos or video from the customer"},{"value":"phone","label":"Over the phone"},{"value":"takeoff","label":"Measurements, drawings, or takeoff"},{"value":"price_list","label":"Price list or template"},{"value":"experience","label":"From experience — it is in my head"}]'::jsonb,null),

  ('app_intake','app_intake.estimate_delivery','How does the estimate go out?','multi_select',true,300,null,
   '[{"value":"verbal","label":"Verbally on site"},{"value":"text","label":"Text message"},{"value":"handwritten","label":"Handwritten"},{"value":"email_pdf","label":"Email or PDF"},{"value":"software","label":"Software"}]'::jsonb,null),
  ('app_intake','app_intake.estimate_software','If software, which one?','short_text',false,310,null,'[]'::jsonb,null),
  ('app_intake','app_intake.estimates_per_month','Estimates per month','number',false,320,null,'[]'::jsonb,null),
  ('app_intake','app_intake.close_rate','Roughly what share of them close?','number',false,330,'A guess is fine. If you have never counted, mark it Unknown.','[]'::jsonb,'%'),
  ('app_intake','app_intake.follow_up_estimates','Do you follow up on estimates that do not close?','boolean',false,340,null,'[]'::jsonb,null),
  ('app_intake','app_intake.require_deposit','Do you require a deposit before starting?','boolean',false,350,null,'[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — app_delivery
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_delivery','app_delivery.scheduling_method','How does work get scheduled?','multi_select',true,10,null,
   '[{"value":"paper","label":"Paper calendar or whiteboard"},{"value":"google_calendar","label":"Google Calendar"},{"value":"text_crew","label":"Text or phone call to the crew"},{"value":"software","label":"Software"},{"value":"in_my_head","label":"It is in my head"}]'::jsonb,null),
  ('app_delivery','app_delivery.scheduling_software','If software, which one?','short_text',false,20,null,'[]'::jsonb,null),
  ('app_delivery','app_delivery.multi_day_jobs','Do jobs commonly run more than one day?','boolean',false,30,null,'[]'::jsonb,null),
  ('app_delivery','app_delivery.track_hours','Do you track hours worked per job?','boolean',false,40,null,'[]'::jsonb,null),
  ('app_delivery','app_delivery.track_costs','Do you track fuel, equipment, or materials per job?','boolean',false,50,null,'[]'::jsonb,null),
  ('app_delivery','app_delivery.before_after_photos','Do you take before and after photos?','boolean',false,60,null,'[]'::jsonb,null),
  ('app_delivery','app_delivery.photo_storage','Where do those photos end up?','short_text',false,70,'"On my phone" is the most common answer and a perfectly good one.','[]'::jsonb,null),

  ('app_delivery','app_delivery.invoicing_method','How do invoices go out today?','multi_select',true,200,null,
   '[{"value":"handwritten","label":"Handwritten or carbon copy"},{"value":"word_excel","label":"Word or Excel"},{"value":"quickbooks","label":"QuickBooks"},{"value":"processor","label":"Square, Stripe, or PayPal"},{"value":"other","label":"Something else"}]'::jsonb,null),
  ('app_delivery','app_delivery.invoicing_other','If something else, what?','short_text',false,210,null,'[]'::jsonb,null),
  ('app_delivery','app_delivery.invoice_timing','When does the invoice go out?','select',false,220,null,
   '[{"value":"same_day","label":"Same day"},{"value":"weekly","label":"Weekly"},{"value":"when_i_get_to_it","label":"When I get to it"}]'::jsonb,null),

  ('app_delivery','app_delivery.payment_methods','How do customers pay?','multi_select',true,300,null,
   '[{"value":"cash","label":"Cash"},{"value":"check","label":"Check"},{"value":"card","label":"Card"},{"value":"ach","label":"Bank transfer or ACH"},{"value":"p2p","label":"Cash App, Venmo, Zelle"},{"value":"financing","label":"Financing"}]'::jsonb,null),
  ('app_delivery','app_delivery.days_to_paid','Average days to get paid','number',false,310,null,'[]'::jsonb,'days'),
  ('app_delivery','app_delivery.who_chases','Who chases unpaid invoices?','short_text',false,320,null,'[]'::jsonb,null),

  ('app_delivery','app_delivery.records_state','Which of these are true about your records?','multi_select',false,400,'Be honest on the bottom four. They decide whether we can build pricing that actually works.',
   '[{"value":"receipts_loose","label":"Receipts live in the truck, a drawer, or a phone"},{"value":"bookkeeper","label":"A bookkeeper or accountant handles it"},{"value":"know_job_profit","label":"We know what each job actually made"},{"value":"know_manhour","label":"We know our true cost per man-hour"},{"value":"know_machine","label":"We know what each machine costs per hour to run"},{"value":"own_numbers","label":"We price from our own numbers, not what others charge"}]'::jsonb,null),
  ('app_delivery','app_delivery.reports_used','Which reports do you actually look at?','long_text',false,410,'If the answer is none, say none.','[]'::jsonb,null),
  ('app_delivery','app_delivery.biggest_time_waster','Biggest time waster each week','long_text',true,420,null,'[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — app_modules
-- ---------------------------------------------------------------------------
-- Each group is asked twice against the same option list: what they need on
-- day one, and what can wait. That is the checklist's N/L marks, in a shape a
-- thumb can answer.
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_modules','app_modules.leads_now','Leads & customers — needed from day one','multi_select',true,10,null,
   '[{"value": "lead_capture", "label": "Website and ad leads drop straight into the system"}, {"value": "pipeline", "label": "Lead pipeline: new, contacted, estimated, won, lost"}, {"value": "auto_reply", "label": "Automatic reply the moment a lead comes in"}, {"value": "customer_file", "label": "Customer file with full job and payment history"}, {"value": "activity_log", "label": "Notes, calls, and texts logged to the customer"}]'::jsonb,null),

  ('app_modules','app_modules.estimates_now','Estimates — needed from day one','multi_select',true,110,null,
   '[{"value": "builder", "label": "Estimate builder using your own pricing and line items"}, {"value": "branded_pdf", "label": "Branded estimate PDF emailed automatically"}, {"value": "online_approval", "label": "Customer approves or signs online"}, {"value": "deposit", "label": "Deposit requested at approval"}, {"value": "auto_followup", "label": "Automatic follow-up on estimates not yet answered"}]'::jsonb,null),

  ('app_modules','app_modules.scheduling_now','Scheduling — needed from day one','multi_select',true,210,null,
   '[{"value": "calendar", "label": "Job calendar for the whole company"}, {"value": "crew_sheets", "label": "Crew assignment and daily job sheets"}, {"value": "multi_day", "label": "Multi-day and phased job tracking"}, {"value": "status_board", "label": "Owner status board — every job at a glance"}, {"value": "on_the_way", "label": "Customer notified when the crew is on the way"}]'::jsonb,null),

  ('app_modules','app_modules.invoicing_now','Invoicing & payment — needed from day one','multi_select',true,310,null,
   '[{"value": "from_job", "label": "Invoice built from the completed job"}, {"value": "branded", "label": "Branded invoice emailed automatically"}, {"value": "payment_link", "label": "Online payment link on the invoice"}, {"value": "receipt_back", "label": "Payment recorded and receipt sent back"}, {"value": "overdue", "label": "Automatic reminders on past-due invoices"}, {"value": "thank_you", "label": "Thank-you email after every completed job"}]'::jsonb,null),

  ('app_modules','app_modules.later','Anything above that can wait until later','multi_select',false,400,'One pass over everything in this section. Leave it empty if the day-one lists already say it all.',
   '[{"value": "lead_capture", "label": "Website and ad leads drop straight into the system"}, {"value": "pipeline", "label": "Lead pipeline: new, contacted, estimated, won, lost"}, {"value": "auto_reply", "label": "Automatic reply the moment a lead comes in"}, {"value": "customer_file", "label": "Customer file with full job and payment history"}, {"value": "activity_log", "label": "Notes, calls, and texts logged to the customer"}, {"value": "builder", "label": "Estimate builder using your own pricing and line items"}, {"value": "branded_pdf", "label": "Branded estimate PDF emailed automatically"}, {"value": "online_approval", "label": "Customer approves or signs online"}, {"value": "deposit", "label": "Deposit requested at approval"}, {"value": "auto_followup", "label": "Automatic follow-up on estimates not yet answered"}, {"value": "calendar", "label": "Job calendar for the whole company"}, {"value": "crew_sheets", "label": "Crew assignment and daily job sheets"}, {"value": "multi_day", "label": "Multi-day and phased job tracking"}, {"value": "status_board", "label": "Owner status board — every job at a glance"}, {"value": "on_the_way", "label": "Customer notified when the crew is on the way"}, {"value": "from_job", "label": "Invoice built from the completed job"}, {"value": "branded", "label": "Branded invoice emailed automatically"}, {"value": "payment_link", "label": "Online payment link on the invoice"}, {"value": "receipt_back", "label": "Payment recorded and receipt sent back"}, {"value": "overdue", "label": "Automatic reminders on past-due invoices"}, {"value": "thank_you", "label": "Thank-you email after every completed job"}]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — app_field_money
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_field_money','app_field_money.field_now','In the field / in the shop — needed from day one','multi_select',true,10,null,
   '[{"value": "mobile", "label": "Works on a phone or tablet, not just a desk"}, {"value": "crew_photos", "label": "Crew uploads job photos from their phone"}, {"value": "time_tracking", "label": "Time tracking by person and by job"}, {"value": "shop_vs_install", "label": "Shop hours vs. install hours tracked separately"}, {"value": "equipment", "label": "Equipment list with run hours and cost per hour"}, {"value": "fuel_mileage", "label": "Fuel and mileage tracking"}, {"value": "materials", "label": "Materials used per job"}, {"value": "purchase_orders", "label": "Purchase orders and supplier ordering"}, {"value": "subs", "label": "Subcontractor assignment and payouts"}, {"value": "change_orders", "label": "Change orders during the job"}, {"value": "punch_list", "label": "Final walkthrough or punch list sign-off"}, {"value": "warranty", "label": "Warranty and callback tracking"}]'::jsonb,null),

  ('app_field_money','app_field_money.money_now','Money & paperwork — needed from day one','multi_select',true,110,null,
   '[{"value": "receipts", "label": "Receipts filed from a photo, tied to the job that caused them"}, {"value": "job_costing", "label": "Job costing — what each job actually made"}, {"value": "documents", "label": "Contract, permit, and insurance storage"}, {"value": "backup", "label": "Everything backed up to Google Drive automatically"}]'::jsonb,null),

  ('app_field_money','app_field_money.later','Anything above that can wait until later','multi_select',false,150,'Tracking you want eventually but would not miss in the first version.',
   '[{"value": "mobile", "label": "Works on a phone or tablet, not just a desk"}, {"value": "crew_photos", "label": "Crew uploads job photos from their phone"}, {"value": "time_tracking", "label": "Time tracking by person and by job"}, {"value": "shop_vs_install", "label": "Shop hours vs. install hours tracked separately"}, {"value": "equipment", "label": "Equipment list with run hours and cost per hour"}, {"value": "fuel_mileage", "label": "Fuel and mileage tracking"}, {"value": "materials", "label": "Materials used per job"}, {"value": "purchase_orders", "label": "Purchase orders and supplier ordering"}, {"value": "subs", "label": "Subcontractor assignment and payouts"}, {"value": "change_orders", "label": "Change orders during the job"}, {"value": "punch_list", "label": "Final walkthrough or punch list sign-off"}, {"value": "warranty", "label": "Warranty and callback tracking"}, {"value": "receipts", "label": "Receipts filed from a photo, tied to the job that caused them"}, {"value": "job_costing", "label": "Job costing — what each job actually made"}, {"value": "documents", "label": "Contract, permit, and insurance storage"}, {"value": "backup", "label": "Everything backed up to Google Drive automatically"}]'::jsonb,null),

  ('app_field_money','app_field_money.rate_shop','Billed rate — shop','currency',false,200,'Per hour. Leave blank or mark Unknown if you do not bill shop time separately.','[]'::jsonb,'USD'),
  ('app_field_money','app_field_money.rate_field','Billed rate — field or install','currency',false,210,'Per hour.','[]'::jsonb,'USD'),
  ('app_field_money','app_field_money.crew_cost_hour','Crew cost per hour, including taxes and insurance','currency',false,220,'What an hour of crew time actually costs you, not what you pay them.','[]'::jsonb,'USD'),
  ('app_field_money','app_field_money.fuel_price','Fuel price per gallon','currency',false,230,null,'[]'::jsonb,'USD'),
  ('app_field_money','app_field_money.gallons_per_day','Gallons on a typical day','number',false,240,null,'[]'::jsonb,null),
  ('app_field_money','app_field_money.monthly_overhead','Monthly overhead','currency',false,250,'Rent, insurance, phones — what goes out whether or not you sell a job.','[]'::jsonb,'USD'),
  ('app_field_money','app_field_money.costing_practices','Which of these do you do today?','multi_select',false,300,'Anything you cannot tick is something the build can give you.',
   '[{"value":"true_manhour","label":"True cost per man-hour calculated, including non-billable time"},{"value":"machine_hour","label":"Cost per hour per machine — payment, fuel, maintenance, repairs"},{"value":"overhead_spread","label":"Overhead spread across jobs so pricing actually covers it"},{"value":"est_vs_actual","label":"Estimated hours vs. actual hours compared on every job"},{"value":"profit_breakdown","label":"Profit per job, per crew, and per service type"}]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — app_growth
-- ---------------------------------------------------------------------------
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_growth','app_growth.followup_now','Follow-up & growth — needed from day one','multi_select',true,10,null,
   '[{"value": "review_request", "label": "Review request sent after every completed job"}, {"value": "reminders", "label": "Seasonal or recurring service reminders"}, {"value": "remarketing", "label": "Past-customer re-marketing list"}, {"value": "referral_credit", "label": "Referral source tracked and credited"}, {"value": "branded_email", "label": "Branded emails written in your voice"}]'::jsonb,null),

  ('app_growth','app_growth.reporting_now','Reporting you will actually use — needed from day one','multi_select',true,110,null,
   '[{"value": "revenue", "label": "Revenue by week, month, and service type"}, {"value": "lead_sources", "label": "Where leads come from and what each source is worth"}, {"value": "close_rate", "label": "Close rate by estimator or by service"}, {"value": "crew_productivity", "label": "Crew productivity and cost per job"}, {"value": "aging", "label": "Outstanding invoices and aging"}, {"value": "dashboard", "label": "Dashboard on the owner''s phone"}]'::jsonb,null),

  ('app_growth','app_growth.later','Anything above that can wait until later','multi_select',false,150,'Worth having, but not what decides whether you use the thing.',
   '[{"value": "review_request", "label": "Review request sent after every completed job"}, {"value": "reminders", "label": "Seasonal or recurring service reminders"}, {"value": "remarketing", "label": "Past-customer re-marketing list"}, {"value": "referral_credit", "label": "Referral source tracked and credited"}, {"value": "branded_email", "label": "Branded emails written in your voice"}, {"value": "revenue", "label": "Revenue by week, month, and service type"}, {"value": "lead_sources", "label": "Where leads come from and what each source is worth"}, {"value": "close_rate", "label": "Close rate by estimator or by service"}, {"value": "crew_productivity", "label": "Crew productivity and cost per job"}, {"value": "aging", "label": "Outstanding invoices and aging"}, {"value": "dashboard", "label": "Dashboard on the owner''s phone"}]'::jsonb,null),

  ('app_growth','app_growth.industry_fit','Which of these is your operation closest to?','select',true,200,'Pick the nearest one. It decides which shape we start from — it is not a box you get stuck in.',
   '[{"value":"field_service","label":"Field service — tree, land, dirt, paving, electrical"},{"value":"millwork","label":"Cabinet / millwork shop — cut lists, CNC files, drawings, finish schedule"},{"value":"clinic","label":"Healthcare or clinic — appointments, intake forms, privacy-aware records"},{"value":"sports","label":"Sports organization — tryouts, rosters, teams, dues"},{"value":"ministry","label":"Church or ministry — events, volunteers, giving records"},{"value":"professional","label":"Professional or financial — client review cadence, compliance-aware records"},{"value":"retail","label":"Retail or product — orders, inventory, fulfillment"},{"value":"other","label":"None of these"}]'::jsonb,null),
  ('app_growth','app_growth.industry_fit_other','If none of these, describe it','short_text',false,210,null,'[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- Fields — app_priorities
-- ---------------------------------------------------------------------------
-- Three separate fields rather than a repeating group: the paper asks for
-- exactly three, and three named boxes read as three decisions in a way a
-- table with an Add Row button does not.
insert into public.onboarding_fields
  (section_key, field_key, label, field_type, required, position, help_text, options, unit) values
  ('app_priorities','app_priorities.headache_1','Headache to kill first','short_text',true,10,'The one that would change your week the most.','[]'::jsonb,null),
  ('app_priorities','app_priorities.headache_2','Second headache','short_text',true,20,null,'[]'::jsonb,null),
  ('app_priorities','app_priorities.headache_3','Third headache','short_text',true,30,null,'[]'::jsonb,null),
  ('app_priorities','app_priorities.weekly_savings','What would fixing those three save you per week?','long_text',false,40,'Hours, money, arguments — whatever it is measured in for you.','[]'::jsonb,null),

  ('app_priorities','app_priorities.day_one','What has to exist on day one?','long_text',true,100,'If the first version did only this, would you use it?','[]'::jsonb,null),
  ('app_priorities','app_priorities.phase_two','What can wait until phase two?','long_text',false,110,null,'[]'::jsonb,null),

  ('app_priorities','app_priorities.current_software','Software you pay for today','short_text',false,200,'All of it, even the bits you barely use.','[]'::jsonb,null),
  ('app_priorities','app_priorities.current_software_cost','What it costs monthly, all together','currency',false,210,null,'[]'::jsonb,'USD'),
  ('app_priorities','app_priorities.must_connect_to','What must the new system connect to?','short_text',false,220,'QuickBooks, a payment processor, Google Drive — anything you are keeping.','[]'::jsonb,null),

  ('app_priorities','app_priorities.users','Who will use it?','long_text',true,300,'Names and roles. It changes what each person sees when they open it.','[]'::jsonb,null),
  ('app_priorities','app_priorities.devices','On what?','multi_select',true,310,null,
   '[{"value":"phone","label":"Phone"},{"value":"tablet","label":"Tablet"},{"value":"desktop","label":"Desktop"}]'::jsonb,null),
  ('app_priorities','app_priorities.target_go_live','Target go-live date','date',false,320,'A rough target is fine. It tells us what to build first, not what to promise.','[]'::jsonb,null),
  ('app_priorities','app_priorities.notes','Anything else we should know','long_text',false,400,null,'[]'::jsonb,null)
on conflict (field_key) do update set
  section_key = excluded.section_key, label = excluded.label, field_type = excluded.field_type,
  required = excluded.required, position = excluded.position, help_text = excluded.help_text,
  options = excluded.options, unit = excluded.unit;

-- ---------------------------------------------------------------------------
-- The template
-- ---------------------------------------------------------------------------
insert into public.onboarding_templates (key, title, description, position) values
  ('app_build','Custom App Build','The App Discovery Checklist, plus the brand and contact basics a build needs. Two pages of paper, answerable from a phone.',40)
on conflict (key) do update set
  title = excluded.title, description = excluded.description, position = excluded.position;

delete from public.onboarding_template_sections where template_key = 'app_build';

-- Core sections carry the things every engagement needs and the app discovery
-- deliberately does not re-ask: legal name, brand, contacts, how we talk.
insert into public.onboarding_template_sections (template_key, section_key, position)
select 'app_build', s.key, s.position
from public.onboarding_sections s
where s.tier = 'core';

insert into public.onboarding_template_sections (template_key, section_key, position)
select 'app_build', s.key, s.position
from public.onboarding_sections s
where s.key in ('app_operations','app_intake','app_delivery','app_modules',
                'app_field_money','app_growth','app_priorities');

-- ---------------------------------------------------------------------------
-- Keep the app sections out of the marketing templates
-- ---------------------------------------------------------------------------
-- growth_partner was defined as "every non-vertical section", which quietly
-- means "every section anybody ever adds". Adding seven scope sections here
-- would have put an app-build discovery in front of every growth-partner
-- client. Templates should name what they include, so this one now does.
delete from public.onboarding_template_sections where template_key = 'growth_partner';

insert into public.onboarding_template_sections (template_key, section_key, position)
select 'growth_partner', s.key, s.position
from public.onboarding_sections s
where s.tier = 'core'
   or s.key in ('customer_data','sales_process','marketing_boundaries','portfolio',
                'financial_baseline','job_economics','capacity','lead_history',
                'professional_network');

commit;
