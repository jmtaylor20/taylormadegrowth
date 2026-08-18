-- Wolf Creek Farms — database schema for the field app.
-- Applied to the dedicated "wolf-creek-app" Supabase project. Kept here for
-- reference / rebuilding. See README.md for the walkthrough.
--
-- Derived from the A&O Tree Service schema, minus the pieces Wolf Creek doesn't
-- need: crew assignment (one crew), per-job equipment (everything goes to every
-- job), rain flags, and the Mapbox route/mileage tables.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Customer -----------------------------------------------------------------
  customer_name text not null,
  phone text,
  email text,
  address text,
  city text,
  state text default 'AL',
  zip text,

  -- Scope --------------------------------------------------------------------
  services text[] not null default '{}',
  site_conditions text[] not null default '{}',
  scope_notes text,
  acres numeric(8,2),      -- optional job size (powers per-acre metrics)

  estimate_amount numeric(10,2),
  estimated_hours numeric(6,1),
  lead_time text,
  priority text not null default 'normal',

  status text not null default 'lead',
  lost_notes text,

  -- Dates --------------------------------------------------------------------
  received_at timestamptz,   -- when the lead came in (drives the wait timer)
  appointment_date date,     -- estimate visit
  appointment_time text,
  scheduled_date date,       -- work date (primary / first day)
  scheduled_dates date[],    -- all booked days for a multi-day job (null = single-day)
  scheduled_time text,
  scheduled_end_time text,   -- explicit end time; drives the booked window

  reschedule_count int not null default 0,
  reschedule_reason text,
  rescheduled_at timestamptz,

  -- Completion ---------------------------------------------------------------
  actual_hours numeric(6,1),
  hours_result text,           -- under | in_line | over
  final_cost numeric(10,2),
  profit numeric(10,2),
  quote_variance_notes text,
  job_notes text,
  completed_at timestamptz,

  -- Payment ------------------------------------------------------------------
  paid boolean not null default false,  -- once paid, the job leaves the Completed tab (data kept)
  paid_at timestamptz,
  amount_paid numeric(10,2) not null default 0, -- running total collected (supports partial payments)
  last_payment_at timestamptz,

  -- Outbound email lifecycle (see email-sender.gs). null | queued | sent | skipped | error.
  estimate_email_status text,  -- queued when quoted
  invoice_email_status text,   -- queued when the job is completed
  thankyou_email_status text,  -- queued when the job is marked paid in full

  -- Google Drive PDF archive (see drive-archive.gs). null until saved.
  quote_pdf_status text,   -- null | 'saved' | 'error'
  quote_pdf_url text,
  quote_pdf_at timestamptz,
  summary_pdf_status text,
  summary_pdf_url text,
  summary_pdf_at timestamptz,

  constraint jobs_status_check check (status in (
    'lead','pending','estimate_given','won','scheduled','completed',
    'lost_lower_quote','lost_overbid','lost_no_time'
  )),
  constraint jobs_priority_check check (priority in ('low','normal','urgent'))
);

create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_appointment_date_idx on public.jobs (appointment_date);
create index if not exists jobs_scheduled_date_idx on public.jobs (scheduled_date);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

-- Expenses tab: manual mileage log + business expenses, kept for the IRS.
-- Mileage rows store the miles driven; the deduction is computed in the app from
-- MILEAGE_RATE in config.js, so a rate change never rewrites history incorrectly.
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  type        text not null check (type in ('mileage','expense')),
  entry_date  date not null,
  amount      numeric(10,2),          -- expense only: dollars spent
  miles       numeric(8,1),           -- mileage only: round-trip miles driven
  purpose     text,                   -- mileage only: Job site / Parts run / …
  destination text,                   -- mileage only: where he drove
  category    text,                   -- expense only: Fuel / Repairs / …
  vendor      text,                   -- expense only: who he paid
  note        text
);
create index if not exists expenses_date_idx on public.expenses (entry_date desc);
create index if not exists expenses_type_idx on public.expenses (type);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

-- OPEN-LINK MODE: RLS on, but anon can do everything. Swap these for
-- authenticated-only / per-user policies when logins are added.
alter table public.jobs enable row level security;
drop policy if exists "anon read jobs" on public.jobs;
drop policy if exists "anon insert jobs" on public.jobs;
drop policy if exists "anon update jobs" on public.jobs;
drop policy if exists "anon delete jobs" on public.jobs;
create policy "anon read jobs"   on public.jobs for select using (true);
create policy "anon insert jobs" on public.jobs for insert with check (true);
create policy "anon update jobs" on public.jobs for update using (true) with check (true);
create policy "anon delete jobs" on public.jobs for delete using (true);

alter table public.expenses enable row level security;
drop policy if exists "anon all expenses" on public.expenses;
create policy "anon all expenses" on public.expenses for all using (true) with check (true);
