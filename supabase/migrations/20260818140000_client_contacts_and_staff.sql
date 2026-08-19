-- Client contacts, staff identity, and the auth helpers every onboarding
-- policy is built on.
--
-- Today the ops app is PIN-gated and talks to Supabase as `anon`; nobody has
-- a real auth session. The client onboarding portal changes that: client
-- contacts sign in with a Supabase email magic link and become `authenticated`.
-- Everything downstream of that needs a trustworthy answer to two questions —
-- "is this caller TaylorMade staff?" and "which client does this caller belong
-- to?" — so those answers live here, in one auditable place, and every policy
-- in later migrations calls these functions rather than rolling its own check.

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
-- Already present in production (db/schema.sql defines it for clients), but
-- restated here so this migration set applies cleanly to a fresh project too.
-- Identical body, so replacing it is a no-op where it already exists.
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Staff: TaylorMade's own people (cross-client access)
-- ---------------------------------------------------------------------------
-- Seeded by email so a staff member exists before they ever sign in;
-- `auth_user_id` is bound on first sign-in. No FK to auth.users on purpose —
-- that would make the row unseedable ahead of the account.
create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null,
  name text,
  auth_user_id uuid unique,
  active boolean not null default true
);

create unique index if not exists staff_users_email_key on public.staff_users (lower(email));

drop trigger if exists staff_users_touch on public.staff_users;
create trigger staff_users_touch before update on public.staff_users
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Client contacts: the people at a client who answer onboarding sections
-- ---------------------------------------------------------------------------
-- `clients.contact_name` / `clients.email` stay exactly as they are — they're
-- the primary contact shorthand the ops app already reads. This table is the
-- real N-people-per-client record: the owner answers financials, the shop lead
-- answers capacity, and each gets their own magic-link login.
create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_id uuid not null references public.clients(id) on delete cascade,

  name text not null,
  email text not null,
  phone text,
  title text,                                  -- "Owner", "Shop lead", "Bookkeeper"
  role text not null default 'contact',        -- owner | operations | finance | marketing | contact

  is_primary boolean not null default false,
  portal_access boolean not null default true, -- false = cannot use the portal at all

  -- Bound on first magic-link sign-in (see onboarding_client_ids below).
  auth_user_id uuid unique,

  notes text,

  constraint client_contacts_role_check
    check (role in ('owner','operations','finance','marketing','contact'))
);

-- One contact record per email per client.
create unique index if not exists client_contacts_client_email_key
  on public.client_contacts (client_id, lower(email));
-- At most one primary contact per client.
create unique index if not exists client_contacts_primary_key
  on public.client_contacts (client_id) where is_primary;
create index if not exists client_contacts_client_idx on public.client_contacts (client_id);
create index if not exists client_contacts_email_idx on public.client_contacts (lower(email));

drop trigger if exists client_contacts_touch on public.client_contacts;
create trigger client_contacts_touch before update on public.client_contacts
  for each row execute function public.touch_updated_at();

-- Store emails lowercased so the lookup below is an index hit, not a scan.
create or replace function public.client_contacts_normalize() returns trigger as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$ language plpgsql;

drop trigger if exists client_contacts_normalize on public.client_contacts;
create trigger client_contacts_normalize before insert or update on public.client_contacts
  for each row execute function public.client_contacts_normalize();

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------
-- These are SECURITY DEFINER on purpose. They read auth.users and the two
-- tables above, which the caller has no direct rights to, and they are the
-- ONLY thing that gets to make that read. Each one returns strictly the
-- caller's own scope, so running as owner leaks nothing. Running as owner also
-- means they are not themselves subject to RLS, which is what keeps a policy
-- that calls them from recursing into itself.
--
-- search_path is pinned on every one of them: an unpinned search_path on a
-- SECURITY DEFINER function is a privilege-escalation bug.

-- The caller's confirmed email, straight from auth.users — not from the JWT
-- body. A JWT claim is whatever was minted; auth.users.email_confirmed_at is
-- the database's own record that the address was actually proven.
create or replace function public.current_auth_email()
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
$$;

comment on function public.current_auth_email() is
  'Confirmed email of the current auth session, read from auth.users rather than trusting a JWT claim. NULL when anonymous or unconfirmed.';

-- Is the caller TaylorMade staff? Matches a bound auth user, or an active
-- staff row whose email the caller has proven.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.staff_users s
    where s.active
      and (
        s.auth_user_id = auth.uid()
        or (auth.uid() is not null and lower(s.email) = public.current_auth_email())
      )
  )
$$;

comment on function public.is_staff() is
  'True when the current auth session belongs to an active TaylorMade staff member. False for anonymous callers and for every client contact.';

-- The client ids the caller may see. A contact is resolved by bound auth user
-- first; falling back to a proven email covers the contact who was added to
-- the CRM after they already had an account. Both branches require a real
-- session — for `anon`, auth.uid() and current_auth_email() are both NULL and
-- every comparison lands on NULL, so this returns zero rows.
create or replace function public.onboarding_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select c.client_id
  from public.client_contacts c
  where c.portal_access
    and (
      c.auth_user_id = auth.uid()
      or (c.auth_user_id is null and c.email = public.current_auth_email())
    )
$$;

comment on function public.onboarding_client_ids() is
  'Client ids the current auth session may access as a client contact. Empty for staff and for anonymous callers — staff access is granted by is_staff(), not by this.';

-- Bind a contact/staff row to its auth user on first sign-in. Called by the
-- portal after the magic link resolves; safe to call repeatedly. Runs as owner
-- so it can write the binding, but will only ever bind a row whose email the
-- caller has already proven, and never re-points a binding that already exists.
create or replace function public.bind_auth_identity()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := public.current_auth_email();
begin
  if v_email is null then
    return;
  end if;

  update public.client_contacts
     set auth_user_id = auth.uid()
   where email = v_email
     and auth_user_id is null;

  update public.staff_users
     set auth_user_id = auth.uid()
   where lower(email) = v_email
     and auth_user_id is null;
end;
$$;

comment on function public.bind_auth_identity() is
  'Binds the current auth user to the contact/staff rows carrying its confirmed email. Idempotent; never overwrites an existing binding.';

-- Only a real session should be able to call these.
revoke all on function public.current_auth_email()     from public, anon;
revoke all on function public.is_staff()               from public, anon;
revoke all on function public.onboarding_client_ids()  from public, anon;
revoke all on function public.bind_auth_identity()     from public, anon;
grant execute on function public.current_auth_email()    to authenticated, service_role;
grant execute on function public.is_staff()              to authenticated, service_role;
grant execute on function public.onboarding_client_ids() to authenticated, service_role;
grant execute on function public.bind_auth_identity()    to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.staff_users     enable row level security;
alter table public.client_contacts enable row level security;

-- staff_users is never client-readable. `anon` keeps full access to match the
-- rest of the PIN-gated ops app; see the lockdown migration for why that is
-- the existing posture and what bounds it.
drop policy if exists staff_users_anon_all on public.staff_users;
create policy staff_users_anon_all on public.staff_users
  for all to anon using (true) with check (true);

drop policy if exists staff_users_staff_all on public.staff_users;
create policy staff_users_staff_all on public.staff_users
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists client_contacts_anon_all on public.client_contacts;
create policy client_contacts_anon_all on public.client_contacts
  for all to anon using (true) with check (true);

drop policy if exists client_contacts_staff_all on public.client_contacts;
create policy client_contacts_staff_all on public.client_contacts
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- A contact can see the other contacts at their own client (needed to show
-- "assigned to Derek"), and nobody else's. Read only — a client cannot add
-- people to their own account or hand themselves portal access.
drop policy if exists client_contacts_contact_read on public.client_contacts;
create policy client_contacts_contact_read on public.client_contacts
  for select to authenticated
  using (client_id in (select public.onboarding_client_ids()));
