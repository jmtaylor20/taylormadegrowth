-- The onboarding section library: definitions, not answers.
--
-- Onboarding intensity varies by engagement — a website build and a full
-- growth-partner engagement are the same portal with different sections turned
-- on. So this is a library of self-contained sections, and an engagement is a
-- list of activated sections. Adding a section to a live engagement is an
-- UPDATE, not a migration.
--
-- Everything in this file is definition data: sections, the fields inside them,
-- the platform catalog, and the templates. It is edited by changing rows, not
-- by deploying. Nothing here is client data, so it is readable by any
-- authenticated user (see the RLS migration).

-- ---------------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------------
-- Four tiers:
--   core      always activated, every engagement
--   scope     activated when the engagement's scope calls for it
--   advisory  activated for consulting / growth-partner work
--   vertical  one module per industry; `vertical` names which one
create table if not exists public.onboarding_sections (
  key text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  title text not null,
  tier text not null,
  vertical text,                          -- 'millwork' — set iff tier = 'vertical'

  intro text,                             -- intro copy the client reads
  description text,                       -- internal note, never shown to a client
  position int not null default 0,
  active boolean not null default true,

  constraint onboarding_sections_tier_check
    check (tier in ('core','scope','advisory','vertical')),
  -- A vertical section names its vertical; a non-vertical section must not.
  constraint onboarding_sections_vertical_check
    check ((tier = 'vertical') = (vertical is not null)),
  constraint onboarding_sections_key_check
    check (key ~ '^[a-z][a-z0-9_]*$')
);

create index if not exists onboarding_sections_tier_idx on public.onboarding_sections (tier, position);

drop trigger if exists onboarding_sections_touch on public.onboarding_sections;
create trigger onboarding_sections_touch before update on public.onboarding_sections
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fields
-- ---------------------------------------------------------------------------
-- `field_key` is the stable, globally unique identifier — `financial_baseline.
-- gross_margin` means the same thing for every client, forever. It is what
-- makes one field queryable across every engagement without joining through
-- per-client schemas, so it is a real unique key, not a label.
--
-- Two kinds of field:
--   scalar          one answer per section
--   repeating_group a table of N rows; its child fields carry parent_field_id
--                   and each row's answers hang off a response row.
-- Repeating groups are modelled as real rows, never flattened into indexed
-- keys like `lead_history_row_3_source`.
create table if not exists public.onboarding_fields (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  section_key text not null references public.onboarding_sections(key)
    on update cascade on delete cascade,
  parent_field_id uuid references public.onboarding_fields(id) on delete cascade,

  field_key text not null unique,          -- 'financial_baseline.months.revenue'
  label text not null,
  help_text text,
  placeholder text,

  field_kind text not null default 'scalar',
  field_type text,                         -- null iff field_kind = 'repeating_group'

  required boolean not null default false,
  position int not null default 0,
  options jsonb not null default '[]'::jsonb, -- select/multi_select/checklist: [{value,label}]
  unit text,                                  -- 'USD', 'months', 'sq ft'
  min_rows int,                               -- repeating_group only
  max_rows int,
  active boolean not null default true,

  constraint onboarding_fields_kind_check
    check (field_kind in ('scalar','repeating_group')),
  constraint onboarding_fields_type_check
    check (field_type is null or field_type in (
      'short_text','long_text','number','currency','date','email','phone','url',
      'boolean','select','multi_select','file_upload','checklist_item'
    )),
  -- A group has no type of its own; a scalar always has one.
  constraint onboarding_fields_kind_type_check
    check ((field_kind = 'repeating_group') = (field_type is null)),
  -- Row bounds belong to groups only.
  constraint onboarding_fields_rows_check
    check (field_kind = 'repeating_group' or (min_rows is null and max_rows is null)),
  constraint onboarding_fields_rows_order_check
    check (min_rows is null or max_rows is null or min_rows <= max_rows),
  -- The global key is namespaced by its section, so reading a key tells you
  -- where it came from.
  constraint onboarding_fields_key_prefix_check
    check (field_key like section_key || '.%')
);

create index if not exists onboarding_fields_section_idx on public.onboarding_fields (section_key, position);
create index if not exists onboarding_fields_parent_idx  on public.onboarding_fields (parent_field_id);

drop trigger if exists onboarding_fields_touch on public.onboarding_fields;
create trigger onboarding_fields_touch before update on public.onboarding_fields
  for each row execute function public.touch_updated_at();

-- Nesting rules a CHECK can't see, because they span rows:
--   * a child's parent must be a repeating_group
--   * a child must live in the same section as its group
--   * groups do not nest
create or replace function public.onboarding_fields_validate() returns trigger as $$
declare
  p record;
begin
  if new.parent_field_id is null then
    return new;
  end if;

  select field_kind, section_key, parent_field_id
    into p
    from public.onboarding_fields
   where id = new.parent_field_id;

  if not found then
    raise exception 'onboarding_fields: parent % does not exist', new.parent_field_id;
  end if;
  if p.field_kind <> 'repeating_group' then
    raise exception 'onboarding_fields: % may only be a child of a repeating_group', new.field_key;
  end if;
  if p.section_key <> new.section_key then
    raise exception 'onboarding_fields: % must live in the same section as its group (% vs %)',
      new.field_key, new.section_key, p.section_key;
  end if;
  if new.field_kind = 'repeating_group' then
    raise exception 'onboarding_fields: repeating groups do not nest (%)', new.field_key;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists onboarding_fields_validate on public.onboarding_fields;
create trigger onboarding_fields_validate before insert or update on public.onboarding_fields
  for each row execute function public.onboarding_fields_validate();

-- ---------------------------------------------------------------------------
-- Platform catalog (for the Website & Digital Access section)
-- ---------------------------------------------------------------------------
-- The catalog is every platform TaylorMade might ever need delegated access
-- to. Which ones a given client actually sees is DERIVED (see the triggers
-- table below) — a website-only client is never shown a Google Ads row.
create table if not exists public.onboarding_platforms (
  key text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  label text not null,
  category text not null default 'other',  -- website | advertising | listings | analytics | social | email | other
  description text,                        -- what "delegated access" means for this platform
  position int not null default 0,
  active boolean not null default true,

  constraint onboarding_platforms_category_check
    check (category in ('website','advertising','listings','analytics','social','email','other'))
);

drop trigger if exists onboarding_platforms_touch on public.onboarding_platforms;
create trigger onboarding_platforms_touch before update on public.onboarding_platforms
  for each row execute function public.touch_updated_at();

-- What makes a platform relevant to an engagement. A platform can be pulled in
-- by an activated section, by a service on the client record, or always.
-- Rows are OR'd: any matching trigger puts the platform on the client's list.
create table if not exists public.onboarding_platform_triggers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  platform_key text not null references public.onboarding_platforms(key)
    on update cascade on delete cascade,
  trigger_type text not null,     -- always | section | service
  trigger_key text,               -- section key, or a public.clients.services value

  constraint onboarding_platform_triggers_type_check
    check (trigger_type in ('always','section','service')),
  constraint onboarding_platform_triggers_key_check
    check ((trigger_type = 'always') = (trigger_key is null))
);

create unique index if not exists onboarding_platform_triggers_key
  on public.onboarding_platform_triggers (platform_key, trigger_type, coalesce(trigger_key, ''));

-- ---------------------------------------------------------------------------
-- Engagement templates
-- ---------------------------------------------------------------------------
-- A template is a starting set of sections, not a constraint. Activating an
-- extra section on a live engagement is an ordinary insert.
create table if not exists public.onboarding_templates (
  key text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  title text not null,
  description text,
  position int not null default 0,
  active boolean not null default true
);

drop trigger if exists onboarding_templates_touch on public.onboarding_templates;
create trigger onboarding_templates_touch before update on public.onboarding_templates
  for each row execute function public.touch_updated_at();

create table if not exists public.onboarding_template_sections (
  template_key text not null references public.onboarding_templates(key)
    on update cascade on delete cascade,
  section_key text not null references public.onboarding_sections(key)
    on update cascade on delete cascade,
  position int not null default 0,
  primary key (template_key, section_key)
);
