# Client onboarding — data model

Replaces the PDF onboarding packet with a portal: clients answer questions, upload
assets, and confirm platform access, and the answers land in tables you can query
across every client.

This is **schema and row-level security only**. No UI, no routes, no components.

## Applied 2026-08-19

Live on `buubrapkkqyalecwbhkh`: 12 tables, 3 views, 25 policies, the private
`onboarding` bucket, and the seeded question library — 14 sections, 56 fields
(4 repeating groups, 21 group children), 15 platforms, 3 templates.

Verified from outside afterwards: `npm run db:test-anon` reports **46 locked, 0
exposed**, with none of it reachable without a session.

The test-client fixture (`db/seed_onboarding_test_clients.sql`) was **not**
applied — it exists for the local suite, not production.

The migrations are in `supabase/migrations/`, named the way the existing ones
are (`YYYYMMDDHHMMSS_snake_case`), and go on in filename order:

| Migration | What it does |
| --- | --- |
| `…140000_client_contacts_and_staff` | `client_contacts`, `staff_users`, and the auth helper functions every policy calls |
| `…140100_onboarding_section_library` | Section, field, platform, and template definitions — the library |
| `…140200_onboarding_engagements` | Engagements, activated sections, responses, repeating-group rows, access grants, assets |
| `…140300_onboarding_rls` | Every policy, plus the three views |
| `…140400_onboarding_storage` | The `onboarding` bucket and its path-scoped policies |
| `…140500_lock_down_legacy_authenticated_policies` | Narrows the existing tables' `authenticated` access to staff — **read the note below** |

Then the seed: `db/seed_onboarding_library.sql` (the questions — safe and
intended for production, already applied). `db/seed_onboarding_test_clients.sql`
is two fixture clients marked `[test]` for the isolation suite, and must not be
applied to production.

### What does not exist yet

The schema holds this; nothing renders it. There is no client portal and no
staff screen for creating an engagement or assigning sections, so onboarding is
still run by PDF until that is built. Assignment lives in
`onboarding_engagement_sections.assigned_contact_id` / `due_date` / `status`,
and a trigger already refuses a contact who does not work at that client.

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

### The `onboarding_my_client` view is deliberately not `security_invoker`

It is a `security_barrier` definer view carrying its own `WHERE` clause, which
means that clause is the only thing between a contact and every client row. That
is a fair thing to be nervous about, so it was tested rather than argued:

| | Rows a contact sees through the view |
| --- | --- |
| As built (barrier + explicit predicate) | 1 — their own client |
| Switched to `security_invoker = true` | **0 — the view breaks** |

`security_invoker` fails because contacts hold no policy on `public.clients` at
all. Making it work would mean granting them one — and RLS is row-level, not
column-level, so `mrr`, `cole_pct` and `notes` would come back with it. The
seven-column view is the tighter of the two.

What protects it, then, is the column list and the predicate, so both are
asserted: the suite checks the view names no financial or internal column, that
each contact sees exactly their own client through it and no other, and a
negative control removes the predicate and requires the suite to go red.

### No column can hold a secret

Access is tracked as *whether TaylorMade has delegated access*, never as the
credential. There is no password, key, token, or secret column anywhere in this
schema, and the isolation suite asserts that structurally so one cannot be added
quietly. Every free-text column additionally carries a `CHECK` against
credential-shaped text (`public.looks_like_secret`). That is a tripwire, not a
filter — it will miss plenty, and that is fine; it exists to catch the obvious
case and to signal intent.

Because it is a CHECK constraint, a client who types a password into a notes
field would otherwise see `violates check constraint "..._secret_check"`, which
tells them nothing and looks like a crash. `db-errors.js` turns it into an
explanation — naming the field, and saying why we neither want the credential
nor keep it — and `db.js` runs every error through it, so every existing
`catch (e) { toast(e.message) }` gets the better wording without changing.
`npm run test:db-errors` covers the mapping.

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

## The sandbox, applied to production 2026-08-19

Two fake clients live in the production CRM so the portal can be clicked through
from a phone: **Sandbox Millwork Co.** (Growth Partner, 14 sections) and
**Ridgeline Sandbox Roofing** (Website Build, 5). Their contacts are plus-aliases
of the owner's address, so both deliver to one inbox and neither is the staff
address:

| Sign in as | You are | Distinctive figure |
| --- | --- | --- |
| `josh+sandbox1@taylormadegrowth.com` | Sandbox Millwork, owner | revenue 1,840,000 |
| `josh+sandbox1b@taylormadegrowth.com` | Sandbox Millwork, shop lead | — |
| `josh+sandbox2@taylormadegrowth.com` | Ridgeline, owner | revenue 612,500 |

Answer something as one, then sign in as the other and go looking for it. That is
the isolation guarantee felt rather than read. Everything else is left blank on
purpose — a sandbox you cannot fill in is not much of a sandbox.

Both clients appear in the ops app's client list, marked `[sandbox]` in notes.
**Run `db/teardown_portal_sandbox.sql` before onboarding a real client**, so
nobody ever sees a fake company next to a real one. It clears the storage objects
first (they live in another schema and do not cascade), then deletes the clients,
and reports zero on every row.

## The portal

`public/portal/` is the client-facing half of this: sign in by emailed code,
see your activated sections, answer them. Phases 1 and 2 are built — the
overview and every scalar field type, with "I don't know" and "Doesn't apply"
beside each question. See `public/portal/README.md`.

```sh
npm run test:portal          # the portal, in a real browser, against a real database
```

That test loads the portal's own files in headless Chromium and runs every query
as the signed-in contact against a throwaway cluster, so it checks the two things
SQL assertions cannot: that the page renders the right questions, and that a
section link forwarded to someone at another client does not open. It carries its
own negative control — widen the section-scope policy and the forwarded link is
required to start working.

## Not in this pass

Repeating groups, file upload, and access grants are not in the portal yet
(phases 3–5); the schema already carries all three and the portal names them in
place rather than hiding them. Still nothing here does conditional field logic or
branching, email sending, or e-signature, and nothing changes in the existing ops
tables beyond the RLS lockdown described above.
