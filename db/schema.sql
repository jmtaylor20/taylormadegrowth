-- TaylorMade Growth — internal operations app schema.
-- Applied to the dedicated "taylormade-growth-app" Supabase project.
-- Kept here for reference / rebuilding.
--
-- Design: one master `clients` table holds leads, prospects, and active
-- clients (separated by `stage`), so a record flows through the pipeline
-- without moving between tables. Everything else (tasks, invoices, content,
-- assets, reviews, proposals, activities) hangs off a client.

-- ---------------------------------------------------------------------------
-- Master CRM: leads → prospects → clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  business_name text not null,
  contact_name  text,
  email text,
  phone text,
  website text,
  city  text,
  state text,
  category text,                 -- industry / prospect category
  source   text,                 -- referral, google, social, walk-in…

  stage    text not null default 'lead',    -- lead | prospect | client | past_client | lost
  priority text not null default 'normal',  -- low | normal | high
  rating   int,                             -- 1–5 "worth the time" fit score

  -- Service package -----------------------------------------------------------
  services   text[] not null default '{}',  -- website, google_ads, gbp, branding, print, social, hosting
  package_name text,
  mrr        numeric(10,2) not null default 0,   -- monthly recurring revenue
  build_fee  numeric(10,2) not null default 0,
  build_fee_paid boolean not null default false,
  start_date date,

  -- Website build -------------------------------------------------------------
  website_status text not null default 'none', -- none | not_started | in_design | in_dev | review | live
  build_url text,

  -- Google Business Profile ---------------------------------------------------
  gbp_status text not null default 'none',     -- none | claiming | optimizing | managing
  gbp_url text,

  -- Google Ads ----------------------------------------------------------------
  ads_status text not null default 'none',     -- none | setup | active | paused
  ads_budget numeric(10,2),

  -- Renewals ------------------------------------------------------------------
  domain_name text,
  domain_renews_on date,
  hosting_provider text,
  hosting_renews_on date,
  email_provider text,
  email_renews_on date,

  -- Onboarding + follow-up ----------------------------------------------------
  onboarding jsonb not null default '[]'::jsonb, -- [{label, done}]
  next_follow_up date,
  follow_up_note  text,

  notes text,

  constraint clients_stage_check    check (stage    in ('lead','prospect','client','past_client','lost')),
  constraint clients_priority_check check (priority in ('low','normal','high'))
);

-- ---------------------------------------------------------------------------
-- Tasks: monthly management, onboarding, build, content, general
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  detail text,
  assignee text not null default 'Josh',    -- Josh | Wyatt | Tony | Cole | …
  category text not null default 'general', -- monthly | onboarding | build | content | general
  status   text not null default 'todo',    -- todo | doing | done
  priority text not null default 'normal',
  due_date date,
  recurring boolean not null default false,  -- monthly recurring management task
  completed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Invoices: build fees, monthly retainers, one-offs + payment status
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete set null,
  number text,
  description text,
  type   text not null default 'monthly',  -- build_fee | monthly | one_time
  amount numeric(10,2) not null default 0,
  status text not null default 'draft',    -- draft | sent | paid | overdue
  issued_on date default now(),
  due_on  date,
  paid_on date,
  method  text                             -- Relay, QuickBooks, cash, card…
);

-- ---------------------------------------------------------------------------
-- Content calendar
-- ---------------------------------------------------------------------------
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  channel text not null default 'instagram', -- instagram | facebook | gbp | blog | other
  scheduled_for date,
  status text not null default 'idea',       -- idea | draft | scheduled | posted
  body  text,
  asset_url text,
  notes text
);

-- ---------------------------------------------------------------------------
-- Photo / video / logo asset library (URL references)
-- ---------------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  name text not null,
  kind text not null default 'photo',        -- photo | video | logo | doc | other
  url  text,
  tags text[] not null default '{}',
  notes text
);

-- ---------------------------------------------------------------------------
-- Review request tracker
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  customer_name text,
  channel text not null default 'google',    -- google | facebook | other
  status  text not null default 'requested', -- requested | left | declined
  rating  int,
  requested_on date default now(),
  notes text
);

-- ---------------------------------------------------------------------------
-- Proposals + contract tracking
-- ---------------------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  summary text,
  line_items jsonb not null default '[]'::jsonb, -- [{label, monthly, oneTime}]
  monthly_total numeric(10,2) not null default 0,
  build_total   numeric(10,2) not null default 0,
  status text not null default 'draft',          -- draft | sent | accepted | declined
  sent_on date,
  contract_status text not null default 'none',  -- none | sent | signed
  contract_signed_on date,
  contract_url text
);

-- ---------------------------------------------------------------------------
-- Activity timeline / follow-ups / reminders
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  client_id uuid references public.clients(id) on delete cascade,
  kind text not null default 'note',   -- note | call | email | meeting | follow_up
  body text,
  due_at date,
  done boolean not null default false
);

-- ---------------------------------------------------------------------------
-- updated_at trigger for clients
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists clients_stage_idx   on public.clients (stage);
create index if not exists clients_follow_idx   on public.clients (next_follow_up);
create index if not exists tasks_status_idx     on public.tasks (status);
create index if not exists tasks_due_idx        on public.tasks (due_date);
create index if not exists tasks_client_idx     on public.tasks (client_id);
create index if not exists invoices_status_idx  on public.invoices (status);
create index if not exists invoices_client_idx  on public.invoices (client_id);
create index if not exists content_sched_idx    on public.content_items (scheduled_for);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Internal, PIN-gated tool: the browser uses the publishable (anon) key, so we
-- enable RLS and add permissive anon policies. This matches the A&O app's
-- posture — swap these for auth-scoped policies when real logins are added.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clients','tasks','invoices','content_items','assets','reviews','proposals','activities']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_anon_all', t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true);', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I;', t || '_auth_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true);', t || '_auth_all', t);
  end loop;
end $$;
