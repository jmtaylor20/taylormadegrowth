-- Machine identities for the Google scripts.
--
-- Both scripts authenticate to Supabase, and neither can hold a secret key:
-- Supabase rejects those with 401 matched on the User-Agent header, and Apps
-- Script sends a Mozilla/5.0 agent it will not let you override. See the
-- credential note at the top of each script.
--
-- So they sign in instead. Each script has its own Supabase Auth user and
-- exchanges a password for a normal user JWT on every run — the same
-- `authenticated` role a person gets, carrying the publishable key alongside
-- it, which is a combination the browser check has no quarrel with.
--
-- What that identity may touch is decided here rather than by the credential.
-- A leaked script password gets you exactly its scopes and nothing else, which
-- matters most for the Google Ads script: that runtime has no PropertiesService,
-- so its password necessarily sits in the script body where anyone with access
-- to the Ads manager account can read it. Scoping it to `ad_metrics` alone is
-- what makes that acceptable.

create table if not exists public.automation_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  label text not null,                      -- 'Document pipeline', 'Ads metrics sync'
  email text not null,                      -- the auth user it signs in as
  auth_user_id uuid unique,                 -- bound on first sign-in
  scopes text[] not null default '{}',      -- what it may reach; see automation_has_scope
  active boolean not null default true,
  notes text
);

create unique index if not exists automation_accounts_email_key
  on public.automation_accounts (lower(email));

drop trigger if exists automation_accounts_touch on public.automation_accounts;
create trigger automation_accounts_touch before update on public.automation_accounts
  for each row execute function public.touch_updated_at();

-- Does the caller hold this scope?
--
-- SECURITY DEFINER for the same reason as is_staff(): it reads auth.users and a
-- table the caller has no rights to, returns strictly a yes/no about the
-- caller's own identity, and running as owner keeps a policy that calls it from
-- recursing into itself. search_path is pinned.
create or replace function public.automation_has_scope(want text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.automation_accounts a
    where a.active
      and want = any (a.scopes)
      and (
        a.auth_user_id = auth.uid()
        or (a.auth_user_id is null and lower(a.email) = public.current_auth_email())
      )
  )
$$;

comment on function public.automation_has_scope(text) is
  'True when the current session is an active automation account holding the named scope. False for people, for staff, and for anonymous callers.';

revoke all on function public.automation_has_scope(text) from public, anon;
grant execute on function public.automation_has_scope(text) to authenticated, service_role;

-- Bind an automation account to its auth user on first sign-in, the same way
-- bind_auth_identity() does for staff and client contacts. Folded into that
-- function so every identity type binds through one path.
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

  update public.automation_accounts
     set auth_user_id = auth.uid()
   where lower(email) = v_email
     and auth_user_id is null;
end;
$$;

comment on function public.bind_auth_identity() is
  'Binds the current auth user to the contact, staff, or automation rows carrying its confirmed email. Idempotent; never overwrites an existing binding.';

-- An automation account is never a person: it must not resolve to a client, and
-- it must not be staff. Both already hold — it has no client_contacts row and no
-- staff_users row — but assert it so a future edit that blurs the line fails
-- loudly rather than quietly handing a script the run of the database.
create or replace function public.automation_accounts_validate() returns trigger as $$
begin
  if exists (select 1 from public.staff_users s where lower(s.email) = lower(new.email)) then
    raise exception 'automation_accounts: % is already a staff user; an automation identity must be separate', new.email;
  end if;
  if exists (select 1 from public.client_contacts c where c.email = lower(new.email)) then
    raise exception 'automation_accounts: % is already a client contact', new.email;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists automation_accounts_validate on public.automation_accounts;
create trigger automation_accounts_validate before insert or update on public.automation_accounts
  for each row execute function public.automation_accounts_validate();

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.automation_accounts to anon, authenticated, service_role;

alter table public.automation_accounts enable row level security;

-- Matches the posture of staff_users: anon keeps access until stage 3 closes it
-- globally, and no automation account or client contact can read this table.
drop policy if exists automation_accounts_anon_all on public.automation_accounts;
create policy automation_accounts_anon_all on public.automation_accounts
  for all to anon using (true) with check (true);

drop policy if exists automation_accounts_staff_all on public.automation_accounts;
create policy automation_accounts_staff_all on public.automation_accounts
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
