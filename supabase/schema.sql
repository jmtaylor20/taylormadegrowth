-- TaylorMade Growth — full schema for a fresh project (owner or contractor copy).
-- Mirrors the production `taylormade-growth-app` database. Apply to a new
-- Supabase project to stand up an identical, isolated data store. RLS is
-- permissive (the app is gated by a client PIN and uses the publishable key).

-- ---- Clients --------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  city text,
  state text,
  category text,
  source text,
  stage text not null default 'lead',
  priority text not null default 'normal',
  rating integer,
  services text[] not null default '{}',
  package_name text,
  mrr numeric not null default 0,
  build_fee numeric not null default 0,
  build_fee_paid boolean not null default false,
  start_date date,
  website_status text not null default 'none',
  build_url text,
  gbp_status text not null default 'none',
  gbp_url text,
  ads_status text not null default 'none',
  ads_budget numeric,
  domain_name text,
  domain_renews_on date,
  hosting_provider text,
  hosting_renews_on date,
  email_provider text,
  email_renews_on date,
  onboarding jsonb not null default '[]',
  next_follow_up date,
  follow_up_note text,
  notes text,
  welcome_status text,
  welcome_to text,
  welcome_sent_at timestamptz,
  welcome_error text,
  logo_url text,
  brand_color text,
  billing_mode text default 'advance',
  recurring_addons jsonb,
  google_ads_id text,
  cole_pct numeric default 0,
  build_review_status text default 'none',
  build_review_note text
);

-- ---- Tasks ----------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  title text not null,
  detail text,
  assignee text not null default 'Josh',
  category text not null default 'general',
  status text not null default 'todo',
  priority text not null default 'normal',
  due_date date,
  recurring boolean not null default false,
  completed_at timestamptz,
  recur_interval text not null default 'none',
  due_time text
);

-- ---- Invoices -------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  number text,
  description text,
  type text not null default 'monthly',
  amount numeric not null default 0,
  status text not null default 'draft',
  issued_on date default now(),
  due_on date,
  paid_on date,
  method text,
  send_status text,
  sent_to text,
  sent_at timestamptz,
  send_error text,
  drive_status text,
  drive_url text,
  drive_saved_at timestamptz,
  drive_error text,
  items jsonb,
  rep text,
  rep_pct numeric,
  contact_name text
);

-- ---- Content items --------------------------------------------------------
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  title text not null,
  channel text not null default 'instagram',
  scheduled_for date,
  status text not null default 'idea',
  body text,
  asset_url text,
  notes text
);

-- ---- Assets ---------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  name text not null,
  kind text not null default 'photo',
  url text,
  tags text[] not null default '{}',
  notes text
);

-- ---- Reviews --------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  customer_name text,
  channel text not null default 'google',
  status text not null default 'requested',
  rating integer,
  requested_on date default now(),
  notes text
);

-- ---- Proposals ------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  title text not null,
  summary text,
  line_items jsonb not null default '[]',
  monthly_total numeric not null default 0,
  build_total numeric not null default 0,
  status text not null default 'draft',
  sent_on date,
  contract_status text not null default 'none',
  contract_signed_on date,
  contract_url text,
  doc_type text not null default 'proposal',
  send_status text,
  sent_to text,
  sent_at timestamptz,
  send_error text,
  drive_status text,
  drive_url text,
  drive_saved_at timestamptz,
  drive_error text,
  details jsonb not null default '{}',
  approval_status text,
  approval_note text,
  approved_at timestamptz
);

-- ---- Activities -----------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  kind text not null default 'note',
  body text,
  due_at date,
  done boolean not null default false
);

-- ---- Payments -------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  amount numeric not null default 0,
  paid_on date default now(),
  method text,
  kind text not null default 'deposit',
  note text
);

-- ---- Reports --------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid,
  period text,
  period_start date,
  metrics jsonb not null default '{}',
  highlights text,
  notes text,
  next_steps text,
  send_status text,
  sent_to text,
  sent_at timestamptz,
  send_error text,
  drive_status text,
  drive_url text,
  drive_saved_at timestamptz,
  drive_error text
);

-- ---- Trips (mileage) ------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  trip_date date default current_date,
  client_id uuid,
  purpose text,
  miles numeric default 0,
  rate numeric,
  notes text,
  from_address text,
  to_address text,
  round_trip boolean default false
);

-- ---- Meetings -------------------------------------------------------------
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  meeting_date date default current_date,
  meeting_time text,
  client_id uuid,
  title text,
  location text,
  attendees text,
  notes text,
  follow_up_on date
);

-- ---- Time entries ---------------------------------------------------------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_id uuid,
  task_id uuid,
  kind text default 'task',
  minutes numeric,
  entry_date date default current_date,
  notes text,
  started_at timestamptz
);

-- ---- Expenses -------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  expense_date date default current_date,
  client_id uuid,
  category text,
  vendor text,
  amount numeric default 0,
  notes text,
  receipt_url text
);

-- ---- App settings (key/value) ---------------------------------------------
create table if not exists public.app_settings (
  id text primary key,
  data jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- ---- Ad metrics (Google Ads sync) -----------------------------------------
create table if not exists public.ad_metrics (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  account_name text,
  period_month date not null,
  period text,
  clicks integer default 0,
  impressions bigint default 0,
  cost numeric default 0,
  conversions numeric default 0,
  ctr numeric default 0,
  avg_cpc numeric default 0,
  source text default 'google_ads',
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (customer_id, period_month)
);

-- ---- Contractors (rev-share) ----------------------------------------------
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  split_pct numeric not null default 0.5,
  active boolean default true,
  created_at timestamptz default now()
);

-- ---- Row-level security ----------------------------------------------------
-- Permissive: the app is PIN-gated and uses the publishable (anon) key.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','tasks','invoices','content_items','assets','reviews','proposals',
    'activities','payments','reports','trips','meetings','time_entries','expenses',
    'app_settings','ad_metrics','contractors'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_all', t);
    execute format('create policy %I on public.%I for all to public using (true) with check (true);', t || '_all', t);
  end loop;
end $$;
