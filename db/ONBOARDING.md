# Client onboarding — data model

Replaces the PDF onboarding packet with a portal: clients answer questions, upload
assets, and confirm platform access, and the answers land in tables you can query
across every client.

This is **schema and row-level security only**. No UI, no routes, no components.

## Applying it

Nothing here has been applied to the live project. The migrations are in
`supabase/migrations/`, named the same way the existing applied migrations are
(`YYYYMMDDHHMMSS_snake_case`), and go on in filename order:

| Migration | What it does |
| --- | --- |
| `…140000_client_contacts_and_staff` | `client_contacts`, `staff_users`, and the auth helper functions every policy calls |
| `…140100_onboarding_section_library` | Section, field, platform, and template definitions — the library |
| `…140200_onboarding_engagements` | Engagements, activated sections, responses, repeating-group rows, access grants, assets |
| `…140300_onboarding_rls` | Every policy, plus the three views |
| `…140400_onboarding_storage` | The `onboarding` bucket and its path-scoped policies |
| `…140500_lock_down_legacy_authenticated_policies` | Narrows the existing tables' `authenticated` access to staff — **read the note below** |

Then the seeds: `db/seed_onboarding_library.sql` (the questions — safe and
intended for production), and `db/seed_onboarding_test_clients.sql` (two fixture
clients, marked `[test]`, for the isolation test — not for production).

## Read this before applying the last migration

Every pre-existing ops table carries a policy granting `authenticated` full
read/write with `using (true)`. That has been harmless because the ops app is
PIN-gated and talks to Supabase as `anon` — nobody has ever had an auth session.

The onboarding portal ends that. The moment a client contact completes a magic
link they are `authenticated`, and those policies hand them the entire CRM:
every client, invoice, payment, expense, and time entry. No RLS on the
onboarding tables can contain that.

`…140500` replaces that unconditional access with a staff check. It does not
touch the `anon` policies, so the ops app keeps working byte-identically.

What it does **not** fix, because it is a different problem: the `anon` posture
itself. The PIN lives in the browser and the publishable key is in the page
source. That is a known tradeoff already documented in `public/app/README.md`.
It is worth fixing, and it is not what this pass is about.

## The model

```
clients  (existing CRM record — extended, not duplicated)
  └── client_contacts            people who can log in, N per client
  └── onboarding_engagements     one onboarding per client
        └── onboarding_engagement_sections    which sections are switched on,
              │                               who each is assigned to, its due
              │                               date and status
              ├── onboarding_responses        one answer per field
              ├── onboarding_response_rows    one per repeating-group instance
              │     └── onboarding_responses  (the row's answers hang off it)
              └── onboarding_assets           file metadata; bytes in Storage
        └── onboarding_access_grants          whether we have delegated access
                                              to each platform in scope
```

The library — `onboarding_sections`, `onboarding_fields`, `onboarding_platforms`,
`onboarding_platform_triggers`, `onboarding_templates`,
`onboarding_template_sections` — is definition data. Editing a question means
changing a row, not shipping a deploy. Activating a section on a live engagement
is an insert into `onboarding_engagement_sections`.

### Four things worth knowing

**Answers carry a status.** `answered`, `unknown`, `not_applicable`. `unknown` is
a real answer a client picks on purpose, stored with no value. That is what makes
completion percentages mean something and keeps a field comparable across clients.

**Field keys are global.** `financial_baseline.gross_margin` is unique across the
whole database and means the same thing for every client. Values live in typed
columns (`value_number`, `value_text`, …) chosen by the field's type and enforced
by a trigger, so cross-client queries are real comparisons, not casts:

```sql
select c.business_name, r.value_number as gross_margin
from onboarding_responses r
join onboarding_fields f on f.id = r.field_id
join onboarding_engagements e on e.id = r.engagement_id
join clients c on c.id = e.client_id
where f.field_key = 'financial_baseline.gross_margin'
  and r.status = 'answered';
```

**Repeating groups are rows.** A field with `field_kind = 'repeating_group'` has
child fields; each instance is an `onboarding_response_rows` row and its answers
hang off that. Twelve months of financials are twelve rows, not
`financial_baseline_month_3_revenue`.

**The platform list is derived.** `onboarding_platform_triggers` says what pulls
a platform onto a client's list — an activated section, a service on the client
record, or always. `onboarding_engagement_platforms` does the derivation. A
website-only client is never shown a Google Ads row.

### No column can hold a secret

Access is tracked as *whether TaylorMade has delegated access*, never as the
credential. There is no password, key, token, or secret column anywhere in this
schema, and the isolation suite asserts that structurally so one cannot be added
quietly. Every free-text column additionally carries a `CHECK` against
credential-shaped text (`public.looks_like_secret`). That is a tripwire, not a
filter — real validation belongs in the portal.

## Row-level security

Three callers:

| Caller | Access |
| --- | --- |
| `anon` | The PIN-gated ops app. Full access, unchanged from every other table. |
| `authenticated` + staff | Cross-client read/write. Identified by `public.is_staff()`. |
| `authenticated` + contact | Exactly their own client's rows. Nothing else. |

A contact is resolved by `public.onboarding_client_ids()`, which matches a bound
`auth_user_id` or, failing that, a **confirmed** email read from `auth.users`
rather than from a JWT claim. Signing up alone grants nothing: an auth session
with no matching contact row sees zero rows everywhere.

Contacts have no access to `public.clients` at all. The portal reads
`onboarding_my_client`, a view exposing only business name, city, state, website,
logo, and brand color — never `mrr`, `build_fee`, `cole_pct`, or `notes`.

Storage scoping is by path prefix: `<engagement_id>/<section_key>/<file>`. The
bucket policy enforces it, and `onboarding_assets`' trigger enforces the same
prefix on the metadata side, so the two cannot drift apart.

## Proving it

```sh
npm run db:test-rls          # full run, including negative controls
npm run db:test-rls -- --quick
```

This spins up a throwaway PostgreSQL 16 cluster, stands up the Supabase pieces
that live outside `public` (`db/tests/supabase_shim.sql`), applies the schema,
migrations, and seeds, and runs `db/tests/onboarding_isolation_test.sql` — 91
assertions across six personas. No Supabase project is touched and no Docker is
required.

Then it does the part that makes it a real check: for each negative control it
rebuilds the database, weakens exactly one policy the way a careless edit would,
and **requires the suite to go red**. A control that still passes is reported as
a failure, because it means nothing is actually testing that policy.

To run the assertions somewhere else — a Supabase development branch, say —
apply the migrations and both seeds, then run
`db/tests/onboarding_isolation_test.sql`. It is plain SQL with no psql-specific
syntax, so the SQL editor works. Do not run the shim there; Supabase provides
all of it.

## Types

```sh
npm run db:types -- "postgresql://…" src/types/database.ts
```

`supabase gen types typescript` needs Docker, which this project does not use.
`scripts/gen-db-types.mjs` reads the same catalogs through `psql` and emits the
same `Database` shape, so it drops straight into
`createClient<Database>(url, key)`. Point it at any database with the schema
applied.

A column whose `COMMENT` begins with `derived:` is written by a trigger and is
therefore optional on insert even when it is `NOT NULL` with no default — that
is how `engagement_id` stays out of the way on the three tables that denormalize
it.

## Not in this pass

No UI, no conditional field logic or branching, no email sending, no e-signature,
and no changes to existing ops tables beyond the RLS lockdown described above.
