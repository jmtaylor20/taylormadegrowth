-- Engagements and the answers clients give.
--
-- An engagement is one client's onboarding: a list of activated sections, each
-- assignable to a person, each collecting responses. Answers carry a status —
-- `unknown` is a real answer a client picks on purpose, not an empty string —
-- which is what makes completion percentages mean something and what keeps a
-- field key comparable across clients.

-- ---------------------------------------------------------------------------
-- Credential tripwire
-- ---------------------------------------------------------------------------
-- There is deliberately no column anywhere in this schema that can hold a
-- password, API key, or secret: access is tracked as *whether TaylorMade has
-- delegated access*, never as the credential itself. Free-text notes are the
-- one place a client could paste one anyway, so every free-text column in this
-- schema carries a CHECK against the obvious shapes.
--
-- This is a tripwire, not a filter — it catches the pasted API key and the
-- "password: hunter2" line, and it is not trying to catch a determined typist.
-- Real validation belongs in the portal. Its value is that the schema refuses
-- the obvious case instead of quietly accepting it.
--
-- Note: a CHECK constraint is not re-validated when the function behind it
-- changes, so widening the pattern later means a VALIDATE CONSTRAINT pass over
-- existing rows.
create or replace function public.looks_like_secret(t text)
returns boolean
language sql
immutable
parallel safe
as $$
  select t is not null and t ~* (
    'sk-[a-zA-Z0-9]{16,}'                              -- OpenAI-style key
    '|AKIA[0-9A-Z]{16}'                                -- AWS access key id
    '|gh[pousr]_[a-zA-Z0-9]{20,}'                      -- GitHub token
    '|xox[baprs]-[a-zA-Z0-9-]{10,}'                    -- Slack token
    '|-----BEGIN [A-Z ]*PRIVATE KEY-----'              -- PEM private key
    '|(password|passwd|pwd|api[ _-]?key|secret[ _-]?key|access[ _-]?token|client[ _-]?secret)\s*[:=]\s*\S'
  )
$$;

comment on function public.looks_like_secret(text) is
  'Tripwire for credential-shaped text. Used in CHECK constraints so no onboarding free-text column silently accepts a pasted secret.';

-- ---------------------------------------------------------------------------
-- Engagements
-- ---------------------------------------------------------------------------
-- Hangs off the existing public.clients record — the master CRM row is still
-- the single source of truth for who the client is.
create table if not exists public.onboarding_engagements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  client_id uuid not null references public.clients(id) on delete cascade,
  template_key text references public.onboarding_templates(key)
    on update cascade on delete set null,

  title text,
  vertical text,                             -- 'millwork'; gates vertical sections
  status text not null default 'draft',

  due_date date,
  invited_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  notes text,

  constraint onboarding_engagements_status_check
    check (status in ('draft','invited','in_progress','submitted','complete','archived')),
  constraint onboarding_engagements_notes_secret_check
    check (not public.looks_like_secret(notes))
);

create index if not exists onboarding_engagements_client_idx on public.onboarding_engagements (client_id);
create index if not exists onboarding_engagements_status_idx on public.onboarding_engagements (status);

drop trigger if exists onboarding_engagements_touch on public.onboarding_engagements;
create trigger onboarding_engagements_touch before update on public.onboarding_engagements
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Activated sections
-- ---------------------------------------------------------------------------
-- One row per section turned on for an engagement. This is where assignment
-- lives: the shop lead gets Capacity, the owner gets Financial Baseline, each
-- with its own due date and status.
create table if not exists public.onboarding_engagement_sections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  engagement_id uuid not null references public.onboarding_engagements(id) on delete cascade,
  section_key text not null references public.onboarding_sections(key) on update cascade,

  assigned_contact_id uuid references public.client_contacts(id) on delete set null,
  due_date date,
  status text not null default 'not_started',
  position int not null default 0,
  active boolean not null default true,

  started_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  notes text,

  constraint onboarding_engagement_sections_status_check
    check (status in ('not_started','in_progress','submitted','accepted','waived')),
  constraint onboarding_engagement_sections_notes_secret_check
    check (not public.looks_like_secret(notes)),
  unique (engagement_id, section_key)
);

create index if not exists onboarding_engagement_sections_engagement_idx
  on public.onboarding_engagement_sections (engagement_id, position);
create index if not exists onboarding_engagement_sections_assignee_idx
  on public.onboarding_engagement_sections (assigned_contact_id);

drop trigger if exists onboarding_engagement_sections_touch on public.onboarding_engagement_sections;
create trigger onboarding_engagement_sections_touch before update on public.onboarding_engagement_sections
  for each row execute function public.touch_updated_at();

-- A section can only be assigned to someone who works at that client, and a
-- vertical section can only be activated on an engagement in that vertical.
-- Both are cross-row rules, so they need a trigger.
create or replace function public.onboarding_engagement_sections_validate() returns trigger as $$
declare
  v_client_id uuid;
  v_vertical text;
  v_section record;
begin
  select e.client_id, e.vertical into v_client_id, v_vertical
    from public.onboarding_engagements e
   where e.id = new.engagement_id;

  select tier, vertical into v_section
    from public.onboarding_sections
   where key = new.section_key;

  if v_section.tier = 'vertical' and v_section.vertical is distinct from v_vertical then
    raise exception 'onboarding_engagement_sections: section % is for the % vertical, engagement is %',
      new.section_key, v_section.vertical, coalesce(v_vertical, 'unset');
  end if;

  if new.assigned_contact_id is not null then
    if not exists (
      select 1 from public.client_contacts c
       where c.id = new.assigned_contact_id and c.client_id = v_client_id
    ) then
      raise exception 'onboarding_engagement_sections: contact % does not belong to this engagement''s client',
        new.assigned_contact_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists onboarding_engagement_sections_validate on public.onboarding_engagement_sections;
create trigger onboarding_engagement_sections_validate
  before insert or update on public.onboarding_engagement_sections
  for each row execute function public.onboarding_engagement_sections_validate();

-- ---------------------------------------------------------------------------
-- Repeating group rows
-- ---------------------------------------------------------------------------
-- One row per instance of a repeating group: a month of the financial
-- baseline, a lead in the lead history, a person in the professional network.
-- The answers for that instance hang off it in onboarding_responses.
create table if not exists public.onboarding_response_rows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Denormalized from the parent section by trigger so every RLS policy is a
  -- single indexed lookup instead of a two-hop join. The trigger overwrites
  -- whatever the client sends, so it cannot be spoofed.
  engagement_id uuid not null references public.onboarding_engagements(id) on delete cascade,
  engagement_section_id uuid not null references public.onboarding_engagement_sections(id) on delete cascade,
  group_field_id uuid not null references public.onboarding_fields(id) on delete cascade,
  position int not null default 0
);

create index if not exists onboarding_response_rows_section_idx
  on public.onboarding_response_rows (engagement_section_id, group_field_id, position);
create index if not exists onboarding_response_rows_engagement_idx
  on public.onboarding_response_rows (engagement_id);

drop trigger if exists onboarding_response_rows_touch on public.onboarding_response_rows;
create trigger onboarding_response_rows_touch before update on public.onboarding_response_rows
  for each row execute function public.touch_updated_at();

create or replace function public.onboarding_response_rows_validate() returns trigger as $$
declare
  v_section_key text;
  v_engagement_id uuid;
  fld record;
begin
  select es.section_key, es.engagement_id into v_section_key, v_engagement_id
    from public.onboarding_engagement_sections es
   where es.id = new.engagement_section_id;

  if not found then
    raise exception 'onboarding_response_rows: engagement section % does not exist', new.engagement_section_id;
  end if;

  select field_kind, section_key into fld
    from public.onboarding_fields
   where id = new.group_field_id;

  if fld.field_kind <> 'repeating_group' then
    raise exception 'onboarding_response_rows: field % is not a repeating group', new.group_field_id;
  end if;
  if fld.section_key <> v_section_key then
    raise exception 'onboarding_response_rows: group % does not belong to section %',
      new.group_field_id, v_section_key;
  end if;

  new.engagement_id = v_engagement_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists onboarding_response_rows_validate on public.onboarding_response_rows;
create trigger onboarding_response_rows_validate
  before insert or update on public.onboarding_response_rows
  for each row execute function public.onboarding_response_rows_validate();

-- ---------------------------------------------------------------------------
-- Responses
-- ---------------------------------------------------------------------------
-- Every response carries a status. `unknown` and `not_applicable` are
-- first-class answers the client selects deliberately — the PDF packet this
-- replaces says so explicitly — so a section that is 100% answered with
-- "unknown" reads as complete-and-unknown, not as blank.
--
-- Values are stored in typed columns rather than one jsonb blob so that
-- `financial_baseline.gross_margin` is a real numeric across every client and
-- can be compared, averaged, and indexed without casting.
create table if not exists public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  engagement_id uuid not null references public.onboarding_engagements(id) on delete cascade,
  engagement_section_id uuid not null references public.onboarding_engagement_sections(id) on delete cascade,
  field_id uuid not null references public.onboarding_fields(id) on delete cascade,
  row_id uuid references public.onboarding_response_rows(id) on delete cascade,

  status text not null default 'answered',

  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_json jsonb,

  -- Attribution: who first answered, and who last touched it. Both are needed
  -- — one for audit, one for chasing a stalled section.
  answered_by_contact_id uuid references public.client_contacts(id) on delete set null,
  answered_by_staff_id   uuid references public.staff_users(id) on delete set null,
  answered_at timestamptz not null default now(),
  updated_by_contact_id uuid references public.client_contacts(id) on delete set null,
  updated_by_staff_id   uuid references public.staff_users(id) on delete set null,

  constraint onboarding_responses_status_check
    check (status in ('answered','unknown','not_applicable')),
  constraint onboarding_responses_answered_by_check
    check (answered_by_contact_id is null or answered_by_staff_id is null),
  constraint onboarding_responses_updated_by_check
    check (updated_by_contact_id is null or updated_by_staff_id is null),
  constraint onboarding_responses_value_text_secret_check
    check (not public.looks_like_secret(value_text))
);

-- One answer per field per section, and one per field per repeating-group row.
create unique index if not exists onboarding_responses_scalar_key
  on public.onboarding_responses (engagement_section_id, field_id) where row_id is null;
create unique index if not exists onboarding_responses_row_key
  on public.onboarding_responses (row_id, field_id) where row_id is not null;

create index if not exists onboarding_responses_engagement_idx on public.onboarding_responses (engagement_id);
create index if not exists onboarding_responses_section_idx    on public.onboarding_responses (engagement_section_id);
-- Cross-client queries on one field key start here.
create index if not exists onboarding_responses_field_idx      on public.onboarding_responses (field_id, status);

drop trigger if exists onboarding_responses_touch on public.onboarding_responses;
create trigger onboarding_responses_touch before update on public.onboarding_responses
  for each row execute function public.touch_updated_at();

-- Keeps a response honest: the field belongs to the section, a group-child
-- answer sits on a row of the right group, and the value lands in the column
-- its field type says it should. Without this last part the typed columns are
-- a suggestion, and cross-client queries quietly miss rows.
create or replace function public.onboarding_responses_validate() returns trigger as $$
declare
  fld record;
  es  record;
  rw  record;
  expected text;
  filled  int;
begin
  select f.field_kind, f.field_type, f.section_key, f.parent_field_id, f.field_key
    into fld
    from public.onboarding_fields f
   where f.id = new.field_id;

  if not found then
    raise exception 'onboarding_responses: field % does not exist', new.field_id;
  end if;
  if fld.field_kind = 'repeating_group' then
    raise exception 'onboarding_responses: % is a repeating group and holds no answer of its own', fld.field_key;
  end if;

  select es2.section_key, es2.engagement_id into es
    from public.onboarding_engagement_sections es2
   where es2.id = new.engagement_section_id;

  if not found then
    raise exception 'onboarding_responses: engagement section % does not exist', new.engagement_section_id;
  end if;
  if es.section_key <> fld.section_key then
    raise exception 'onboarding_responses: field % belongs to section %, not %',
      fld.field_key, fld.section_key, es.section_key;
  end if;

  -- Scalar answers have no row; group-child answers must have exactly the
  -- right one.
  if fld.parent_field_id is null then
    if new.row_id is not null then
      raise exception 'onboarding_responses: % is not part of a repeating group but was given a row', fld.field_key;
    end if;
  else
    if new.row_id is null then
      raise exception 'onboarding_responses: % is part of a repeating group and needs a row', fld.field_key;
    end if;
    select group_field_id, engagement_section_id into rw
      from public.onboarding_response_rows where id = new.row_id;
    if not found then
      raise exception 'onboarding_responses: row % does not exist', new.row_id;
    end if;
    if rw.group_field_id <> fld.parent_field_id then
      raise exception 'onboarding_responses: row % belongs to a different repeating group', new.row_id;
    end if;
    if rw.engagement_section_id <> new.engagement_section_id then
      raise exception 'onboarding_responses: row % belongs to a different engagement section', new.row_id;
    end if;
  end if;

  new.engagement_id = es.engagement_id;

  -- Which typed column this field type is allowed to use. file_upload keeps
  -- its payload in onboarding_assets, so it fills none of them.
  expected := case fld.field_type
    when 'short_text' then 'value_text'
    when 'long_text'  then 'value_text'
    when 'select'     then 'value_text'
    when 'email'      then 'value_text'
    when 'phone'      then 'value_text'
    when 'url'        then 'value_text'
    when 'number'     then 'value_number'
    when 'currency'   then 'value_number'
    when 'date'       then 'value_date'
    when 'boolean'    then 'value_boolean'
    when 'checklist_item' then 'value_boolean'
    when 'multi_select'   then 'value_json'
    when 'file_upload'    then null
  end;

  filled := (new.value_text is not null)::int
          + (new.value_number is not null)::int
          + (new.value_boolean is not null)::int
          + (new.value_date is not null)::int
          + (new.value_json is not null)::int;

  -- "unknown" and "not_applicable" are answers, not values.
  if new.status <> 'answered' then
    if filled > 0 then
      raise exception 'onboarding_responses: % is marked % and must carry no value', fld.field_key, new.status;
    end if;
    return new;
  end if;

  if expected is null then
    if filled > 0 then
      raise exception 'onboarding_responses: % is a file upload; its files live in onboarding_assets', fld.field_key;
    end if;
    return new;
  end if;

  if filled <> 1
     or (expected = 'value_text'    and new.value_text    is null)
     or (expected = 'value_number'  and new.value_number  is null)
     or (expected = 'value_boolean' and new.value_boolean is null)
     or (expected = 'value_date'    and new.value_date    is null)
     or (expected = 'value_json'    and new.value_json    is null) then
    raise exception 'onboarding_responses: % is a % and must fill exactly %', fld.field_key, fld.field_type, expected;
  end if;

  if fld.field_type = 'multi_select' and jsonb_typeof(new.value_json) <> 'array' then
    raise exception 'onboarding_responses: % is a multi_select and needs a JSON array', fld.field_key;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists onboarding_responses_validate on public.onboarding_responses;
create trigger onboarding_responses_validate before insert or update on public.onboarding_responses
  for each row execute function public.onboarding_responses_validate();

-- ---------------------------------------------------------------------------
-- Access grants
-- ---------------------------------------------------------------------------
-- Tracks WHETHER TaylorMade has delegated access to a platform. It does not,
-- and must not, hold the credential. `holder_*` records who has it — sometimes
-- a contact, sometimes "the guy who built the old site".
create table if not exists public.onboarding_access_grants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  engagement_id uuid not null references public.onboarding_engagements(id) on delete cascade,
  platform_key text not null references public.onboarding_platforms(key) on update cascade,

  access_method text not null default 'unknown',
  status text not null default 'pending',

  holder_contact_id uuid references public.client_contacts(id) on delete set null,
  holder_name text,                          -- when the holder isn't a contact record
  holder_note text,

  verified_at timestamptz,
  verified_by_staff_id uuid references public.staff_users(id) on delete set null,
  notes text,

  constraint onboarding_access_grants_method_check
    check (access_method in ('delegated','shared','owner_holds','unknown','missing')),
  constraint onboarding_access_grants_status_check
    check (status in ('pending','requested','granted','verified','blocked','not_applicable')),
  constraint onboarding_access_grants_notes_secret_check
    check (not public.looks_like_secret(notes)),
  constraint onboarding_access_grants_holder_note_secret_check
    check (not public.looks_like_secret(holder_note)),
  unique (engagement_id, platform_key)
);

create index if not exists onboarding_access_grants_engagement_idx
  on public.onboarding_access_grants (engagement_id);

drop trigger if exists onboarding_access_grants_touch on public.onboarding_access_grants;
create trigger onboarding_access_grants_touch before update on public.onboarding_access_grants
  for each row execute function public.touch_updated_at();

-- A grant's holder must work at the engagement's client.
create or replace function public.onboarding_access_grants_validate() returns trigger as $$
declare
  v_client_id uuid;
begin
  if new.holder_contact_id is null then
    return new;
  end if;

  select client_id into v_client_id from public.onboarding_engagements where id = new.engagement_id;

  if not exists (
    select 1 from public.client_contacts c
     where c.id = new.holder_contact_id and c.client_id = v_client_id
  ) then
    raise exception 'onboarding_access_grants: holder % does not belong to this engagement''s client',
      new.holder_contact_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists onboarding_access_grants_validate on public.onboarding_access_grants;
create trigger onboarding_access_grants_validate
  before insert or update on public.onboarding_access_grants
  for each row execute function public.onboarding_access_grants_validate();

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------
-- Metadata here, bytes in Supabase Storage. Named onboarding_assets because
-- public.assets already exists — that's the ops app's photo/logo URL library
-- and is a different thing.
--
-- storage_path is forced to start with the engagement id so the bucket policy
-- can scope by path prefix. The trigger rewrites engagement_id from the parent
-- section, so a client cannot claim a path under someone else's engagement.
create table if not exists public.onboarding_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  engagement_id uuid not null references public.onboarding_engagements(id) on delete cascade,
  engagement_section_id uuid not null references public.onboarding_engagement_sections(id) on delete cascade,
  field_id uuid references public.onboarding_fields(id) on delete set null,
  row_id uuid references public.onboarding_response_rows(id) on delete cascade,

  storage_bucket text not null default 'onboarding',
  storage_path text not null unique,          -- '<engagement_id>/<section_key>/<uuid>-<name>'
  file_name text not null,
  mime_type text,
  byte_size bigint,
  kind text not null default 'other',
  caption text,

  uploaded_by_contact_id uuid references public.client_contacts(id) on delete set null,
  uploaded_by_staff_id   uuid references public.staff_users(id) on delete set null,

  constraint onboarding_assets_kind_check
    check (kind in ('logo','brand','photo','document','other')),
  constraint onboarding_assets_uploader_check
    check (uploaded_by_contact_id is null or uploaded_by_staff_id is null),
  constraint onboarding_assets_caption_secret_check
    check (not public.looks_like_secret(caption)),
  constraint onboarding_assets_byte_size_check
    check (byte_size is null or byte_size >= 0)
);

create index if not exists onboarding_assets_engagement_idx on public.onboarding_assets (engagement_id);
create index if not exists onboarding_assets_section_idx    on public.onboarding_assets (engagement_section_id);

drop trigger if exists onboarding_assets_touch on public.onboarding_assets;
create trigger onboarding_assets_touch before update on public.onboarding_assets
  for each row execute function public.touch_updated_at();

create or replace function public.onboarding_assets_validate() returns trigger as $$
declare
  es record;
begin
  select es2.engagement_id, es2.section_key into es
    from public.onboarding_engagement_sections es2
   where es2.id = new.engagement_section_id;

  if not found then
    raise exception 'onboarding_assets: engagement section % does not exist', new.engagement_section_id;
  end if;

  new.engagement_id = es.engagement_id;

  -- The storage path prefix IS the tenant boundary in the bucket. Enforce it
  -- here so the database and the bucket policy can never disagree.
  if new.storage_path not like es.engagement_id::text || '/%' then
    raise exception 'onboarding_assets: storage_path must start with %/, got %',
      es.engagement_id, new.storage_path;
  end if;

  if new.row_id is not null then
    if not exists (
      select 1 from public.onboarding_response_rows r
       where r.id = new.row_id and r.engagement_section_id = new.engagement_section_id
    ) then
      raise exception 'onboarding_assets: row % belongs to a different engagement section', new.row_id;
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists onboarding_assets_validate on public.onboarding_assets;
create trigger onboarding_assets_validate before insert or update on public.onboarding_assets
  for each row execute function public.onboarding_assets_validate();

-- These three columns are filled in by their table's validate trigger from the
-- parent section, and any value a caller supplies is discarded. Marked here so
-- the type generator knows not to demand them on insert.
comment on column public.onboarding_response_rows.engagement_id is
  'derived: set from the parent engagement section by trigger. Do not supply on insert.';
comment on column public.onboarding_responses.engagement_id is
  'derived: set from the parent engagement section by trigger. Do not supply on insert.';
comment on column public.onboarding_assets.engagement_id is
  'derived: set from the parent engagement section by trigger. Do not supply on insert.';
