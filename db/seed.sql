-- Demo / starter data for the TaylorMade Growth ops app.
-- Realistic sample records so the app is populated for day-one use and for
-- demoing to prospects. Safe to delete once real data replaces it.
-- Re-runnable: clears demo rows first (matched by a marker in notes).

begin;

-- Wipe any previous demo rows (child tables cascade from clients).
delete from public.clients where notes like '%[demo]%';
delete from public.invoices where description like '%[demo]%';
delete from public.tasks where detail like '%[demo]%';

-- ---- Clients (leads → prospects → clients) --------------------------------
insert into public.clients
  (business_name, contact_name, email, phone, website, city, state, category, source, stage, priority, rating,
   services, package_name, mrr, build_fee, build_fee_paid, start_date,
   website_status, build_url, gbp_status, gbp_url, ads_status, ads_budget,
   domain_name, domain_renews_on, hosting_provider, hosting_renews_on, email_provider, email_renews_on,
   next_follow_up, follow_up_note, onboarding, notes)
values
  ('Wolf Creek Outfitters', 'Derek Wolf', 'derek@wolfcreek.co', '(334) 555-0142', 'wolfcreekoutfitters.com', 'Auburn', 'AL', 'Retail / Boutique', 'Referral', 'client', 'high', 5,
   array['website','management','google_ads','gbp','social'], 'Growth Plan', 1200, 2500, true, '2026-03-01',
   'live', 'wolfcreekoutfitters.com', 'managing', 'https://g.page/wolfcreek', 'active', 800,
   'wolfcreekoutfitters.com', '2026-09-05', 'Netlify', '2027-03-01', 'Google Workspace', '2026-12-01',
   null, null,
   '[{"label":"Signed agreement / deposit","done":true},{"label":"Kickoff call booked","done":true},{"label":"Brand assets collected","done":true},{"label":"Domain / hosting / email access","done":true},{"label":"Google Business Profile access","done":true},{"label":"Added to monthly management calendar","done":true}]'::jsonb,
   'Flagship client. Great reviews engine. [demo]'),

  ('A&O Tree Service', 'Cole Anderson', 'cole@aotree.com', '(334) 555-0110', 'aotreeservice.com', 'Opelika', 'AL', 'Tree Service', 'Repeat / upsell', 'client', 'high', 5,
   array['website','management','gbp'], 'Local Presence', 900, 1800, true, '2026-05-15',
   'live', 'aotreeservice.com', 'managing', null, 'none', null,
   'aotreeservice.com', '2026-08-28', 'Netlify', '2027-05-15', 'Google Workspace', '2027-05-15',
   '2026-08-16', 'Send July report + review ask', '[{"label":"Signed agreement / deposit","done":true},{"label":"Google Business Profile access","done":true},{"label":"Added to monthly management calendar","done":true}]'::jsonb,
   'Also runs the field app. [demo]'),

  ('Green Thumb Landscaping', 'Maria Gomez', 'maria@greenthumb.com', '(334) 555-0187', 'greenthumbal.com', 'Auburn', 'AL', 'Landscaping / Lawn', 'Google search', 'client', 'normal', 4,
   array['website','management','gbp','print'], 'Growth Plan', 1000, 3000, false, '2026-07-20',
   'in_dev', 'staging.greenthumbal.com', 'optimizing', null, 'setup', 500,
   'greenthumbal.com', '2027-01-10', 'Netlify', '2027-07-20', 'Zoho Mail', '2027-07-20',
   '2026-08-14', 'Confirm homepage copy + collect job photos', '[{"label":"Signed agreement / deposit","done":true},{"label":"Kickoff call booked","done":true},{"label":"Brand assets collected","done":true},{"label":"Website content gathered","done":false},{"label":"Google Ads account access","done":false}]'::jsonb,
   'Build fee still outstanding. [demo]'),

  ('Cornerstone Realty', 'Bill Turner', 'bill@cornerstonerealty.com', '(334) 555-0165', 'cornerstonerealty.com', 'Montgomery', 'AL', 'Real Estate', 'Networking', 'client', 'normal', 4,
   array['website','google_ads','management'], 'Ads + Site', 1500, 3500, true, '2026-06-01',
   'live', 'cornerstonerealty.com', 'managing', null, 'active', 1500,
   'cornerstonerealty.com', '2026-11-15', 'Netlify', '2027-06-01', 'Google Workspace', '2027-06-01',
   null, null,
   '[{"label":"Signed agreement / deposit","done":true},{"label":"Google Ads account access","done":true},{"label":"Added to monthly management calendar","done":true}]'::jsonb,
   'Biggest ad spend. [demo]'),

  ('Bella Vista Salon', 'Nina Price', 'nina@bellavista.com', '(334) 555-0133', 'bellavistasalon.com', 'Opelika', 'AL', 'Beauty / Salon', 'Facebook / Instagram', 'client', 'normal', 3,
   array['social','gbp'], 'Social Starter', 650, 0, true, '2026-06-20',
   'none', null, 'managing', null, 'none', null,
   null, null, null, null, null, null,
   null, null,
   '[{"label":"Signed agreement / deposit","done":true},{"label":"Brand assets collected","done":true},{"label":"Added to monthly management calendar","done":true}]'::jsonb,
   'Social only for now — website upsell later. [demo]'),

  ('Precision Auto Detailing', 'Marcus Reed', 'marcus@precisiondetail.com', '(334) 555-0176', 'precisiondetail.com', 'Auburn', 'AL', 'Auto / Detailing', 'Referral', 'prospect', 'high', 4,
   array['website','gbp','social'], null, 0, 0, false, null,
   'not_started', null, 'none', null, 'none', null,
   null, null, null, null, null, null,
   '2026-08-15', 'Send proposal — very interested', '[]'::jsonb,
   'Hot prospect. Proposal drafted. [demo]'),

  ('Hometown Diner', 'Susan Hall', 'susan@hometowndiner.com', '(334) 555-0158', 'hometowndiner.com', 'Wetumpka', 'AL', 'Restaurant / Food', 'Walk-in', 'prospect', 'normal', 3,
   array['gbp','social','print'], null, 0, 0, false, null,
   'none', null, 'claiming', null, 'none', null,
   null, null, null, null, null, null,
   '2026-08-20', 'Follow up after menu redesign chat', '[]'::jsonb,
   'Wants menus + social. [demo]'),

  ('Summit Fitness', 'Jake Ellis', 'jake@summitfit.com', '(334) 555-0199', null, 'Prattville', 'AL', 'Fitness / Gym', 'Google search', 'lead', 'normal', null,
   array[]::text[], null, 0, 0, false, null,
   'none', null, 'none', null, 'none', null,
   null, null, null, null, null, null,
   '2026-08-13', 'First call — discovery', '[]'::jsonb,
   'New lead from website form. [demo]'),

  ('Riverside Plumbing', 'Tom Nguyen', 'tom@riversideplumbing.com', '(334) 555-0121', null, 'Tallassee', 'AL', 'Trades / Contractor', 'Cold outreach', 'lead', 'low', null,
   array[]::text[], null, 0, 0, false, null,
   'none', null, 'none', null, 'none', null,
   null, null, null, null, null, null,
   null, null, '[]'::jsonb,
   'Cold lead — needs nurturing. [demo]');

-- ---- Tasks ----------------------------------------------------------------
insert into public.tasks (client_id, title, assignee, category, status, due_date, recurring, detail)
select id, t.title, t.assignee, t.category, t.status, t.due::date, t.recurring, '[demo]'
from public.clients c
join (values
  ('Wolf Creek Outfitters','Publish 4 social posts','Wyatt','monthly','doing','2026-08-18',true),
  ('Wolf Creek Outfitters','Optimize Google Ads campaign','Josh','monthly','todo','2026-08-20',true),
  ('Wolf Creek Outfitters','Send August monthly report','Josh','monthly','todo','2026-08-25',true),
  ('A&O Tree Service','Google Business post + photos','Tony','monthly','todo','2026-08-15',true),
  ('A&O Tree Service','Request reviews from recent jobs','Cole','monthly','todo','2026-08-16',true),
  ('Green Thumb Landscaping','Build homepage + services page','Wyatt','build','doing','2026-08-14',false),
  ('Green Thumb Landscaping','Collect job site photos','Josh','onboarding','todo','2026-08-14',false),
  ('Green Thumb Landscaping','Set up Google Ads account','Josh','build','todo','2026-08-22',false),
  ('Cornerstone Realty','Monthly ad performance review','Josh','monthly','todo','2026-08-19',true),
  ('Cornerstone Realty','Refresh listing landing pages','Wyatt','monthly','todo','2026-08-24',true),
  ('Bella Vista Salon','Design + schedule 8 posts','Tony','content','todo','2026-08-17',true),
  ('Precision Auto Detailing','Send proposal','Josh','general','todo','2026-08-15',false)
) as t(biz,title,assignee,category,status,due,recurring) on t.biz = c.business_name;

-- ---- Invoices -------------------------------------------------------------
insert into public.invoices (client_id, number, description, type, amount, status, issued_on, due_on, paid_on, method)
select id, v.num, v.descr || ' [demo]', v.type, v.amount, v.status, v.issued::date, v.due::date, v.paid, v.method
from public.clients c
join (values
  ('Wolf Creek Outfitters','INV-1042','August retainer','monthly',1200,'paid','2026-08-01','2026-08-08','2026-08-05'::date,'Relay'),
  ('Wolf Creek Outfitters','INV-1001','Website build fee','build_fee',2500,'paid','2026-03-01','2026-03-08','2026-03-04'::date,'Relay'),
  ('A&O Tree Service','INV-1039','August retainer','monthly',900,'paid','2026-08-01','2026-08-08','2026-08-06'::date,'QuickBooks'),
  ('Green Thumb Landscaping','INV-1044','August retainer','monthly',1000,'sent','2026-08-01','2026-08-08',null,'Relay'),
  ('Green Thumb Landscaping','INV-1030','Website build fee (50%)','build_fee',1500,'sent','2026-07-20','2026-07-27',null,'Relay'),
  ('Cornerstone Realty','INV-1043','August retainer + ad mgmt','monthly',1500,'overdue','2026-07-28','2026-08-04',null,'QuickBooks'),
  ('Bella Vista Salon','INV-1045','August social management','monthly',650,'paid','2026-08-01','2026-08-08','2026-08-03'::date,'Card')
) as v(biz,num,descr,type,amount,status,issued,due,paid,method) on v.biz = c.business_name;

-- ---- Content items --------------------------------------------------------
insert into public.content_items (client_id, title, channel, scheduled_for, status, body)
select id, v.title, v.channel, v.sched::date, v.status, v.body
from public.clients c
join (values
  ('Wolf Creek Outfitters','Fall gear drop teaser','instagram','2026-08-18','scheduled','New arrivals hitting the shelves 🍂'),
  ('Wolf Creek Outfitters','Customer spotlight','facebook','2026-08-12','posted','Thanks for the love, Auburn!'),
  ('Bella Vista Salon','Before/after balayage','instagram','2026-08-17','draft',null),
  ('Bella Vista Salon','Meet the stylists','instagram','2026-08-10','posted',null),
  ('A&O Tree Service','Storm season prep tips','gbp','2026-08-15','scheduled','Get ahead of storm season.'),
  ('Green Thumb Landscaping','Lawn care checklist blog','blog','2026-08-21','idea',null)
) as v(biz,title,channel,sched,status,body) on v.biz = c.business_name;

-- ---- Reviews --------------------------------------------------------------
insert into public.reviews (client_id, customer_name, channel, status, rating, requested_on)
select id, v.name, v.channel, v.status, v.rating, v.req::date
from public.clients c
join (values
  ('Wolf Creek Outfitters','James P.','google','left',5,'2026-08-04'),
  ('Wolf Creek Outfitters','Kelsey R.','google','left',5,'2026-08-07'),
  ('Wolf Creek Outfitters','Mike D.','google','requested',null,'2026-08-11'),
  ('A&O Tree Service','Linda S.','google','left',5,'2026-08-02'),
  ('A&O Tree Service','Robert T.','google','requested',null,'2026-08-10'),
  ('Cornerstone Realty','The Harpers','facebook','left',5,'2026-08-06')
) as v(biz,name,channel,status,rating,req) on v.biz = c.business_name;

-- ---- Proposals ------------------------------------------------------------
insert into public.proposals (client_id, title, summary, line_items, monthly_total, build_total, status, sent_on, contract_status)
select id,
  'Growth Plan for Precision Auto Detailing',
  'A new website, claimed and optimized Google Business Profile, and monthly social to turn searches into booked details.',
  '[{"label":"Website build","monthly":0,"oneTime":2000},{"label":"Monthly management","monthly":500,"oneTime":0},{"label":"Google Business Profile","monthly":150,"oneTime":0},{"label":"Social / content","monthly":300,"oneTime":0}]'::jsonb,
  950, 2000, 'sent', '2026-08-10', 'sent'
from public.clients c where c.business_name = 'Precision Auto Detailing';

-- ---- Activities -----------------------------------------------------------
insert into public.activities (client_id, kind, body, created_at)
select id, v.kind, v.body, now() - (v.ago || ' days')::interval
from public.clients c
join (values
  ('Wolf Creek Outfitters','call','Monthly check-in — thrilled with ad results, wants to add email marketing.','3'),
  ('Precision Auto Detailing','meeting','Walked through the proposal. Loves the plan, reviewing with partner.','2'),
  ('Green Thumb Landscaping','note','Waiting on homepage copy approval before launch.','1'),
  ('Summit Fitness','email','Sent intro email + booking link for discovery call.','1')
) as v(biz,kind,body,ago) on v.biz = c.business_name;

commit;
