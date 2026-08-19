# Client onboarding portal

Where a client answers their onboarding questions. Lives at `/portal/`, served
by Netlify from this directory. Vanilla ES modules, no build step — the same
shape as `public/app`, deliberately: an edit here goes live on the next push
with nothing in between to break.

It is a separate app from the ops CRM, not a section of it. Nothing under
`/app` is reachable from here, and a client contact's session grants them
nothing there either — that is `is_staff()` in the policies, not a routing
decision.

## What's built

* Sign-in by emailed code, resolved as a **client contact** via
  `onboarding_client_ids()`.
* The engagement overview, **grouped by who owns each section** — yours,
  anyone's, waiting on a colleague, done. On a fourteen-section list the first
  question anybody has is "which of these are mine", and a single list sorted by
  position makes that something you work out card by card.
* One section at a time: every scalar field type, autosaved as you go.
* **"I don't know"** and **"Doesn't apply"** beside every question, saved as
  real answers with no value — which is the whole reason the schema stores a
  status per response.
* **File upload.** Bytes go to a private bucket under
  `<engagement_id>/<section_key>/<uuid>-<name>`; the row describing them goes to
  `onboarding_assets`. That first path segment is the tenant boundary, enforced
  on both sides. If the metadata row is refused after the bytes land, the bytes
  are taken back out — an object nothing points at is invisible to every screen
  we have and would sit there forever.

Still to come: repeating groups (phase 3), access grants (5), and staff-side
engagement creation and assignment (6). The portal names each of those in place
rather than hiding them, so a client who was told to expect a lead-history table
can see it is coming.

## Files

| File | What it does |
| --- | --- |
| `assets/js/app.js` | Shell, hash router, boot |
| `assets/js/auth.js` | Emailed-code sign-in and identity resolution |
| `assets/js/db.js` | Every query the portal makes |
| `assets/js/sections.js` | The engagement overview |
| `assets/js/section.js` | One section, its questions, and autosave |
| `assets/js/fields.js` | One question: control, status flags, value shaping |
| `assets/js/errors.js` | Database errors said in words a client can act on |
| `assets/js/ui.js` | The handful of DOM helpers this app needs |
| `assets/js/config.js` | Project URL, publishable key, code length |

## The publishable key is in `config.js` on purpose

It is meant to be public. On its own it grants nothing: `anon` holds no policy
and no grant on any table in this schema, which
`npm run db:test-anon` proves over HTTP against production. Every row a client
sees is decided by their session and the policies in the database.

There is no service-role key here, no proxy, and no client-side filtering by
client id anywhere in `db.js`. Section pages are fetched **by id with no
engagement filter of our own** — whether a forwarded link opens is the database's
call, and `scripts/test-portal-flow.mjs` proves it by widening that one policy
and requiring the link to start working.

## Proving it

```sh
npm run test:portal                    # 42 assertions
npm run test:portal -- --shots ./shots # …and save what each screen looks like
```

This loads these files unmodified in headless Chromium and points them at a
throwaway PostgreSQL 16 cluster carrying the full migration set and seeds. Only
the vendored Supabase bundle is swapped, for a shim that runs each query as the
signed-in contact — `set local role authenticated` with their claims — so the
rows the page renders are the rows RLS actually allows. GoTrue is the one piece
faked; there is no local email service to send a code to.

## Sign-in codes are rate limited

Supabase's built-in mailer allows only a handful of messages an hour, per
project, and is explicitly not meant for production. Three people signing in to
the same engagement in one sitting can exhaust it. The portal says so plainly
when it happens — "we've sent as many codes as we're allowed to for the moment"
rather than something that reads as "your email is wrong" — but the real fix is
custom SMTP under Authentication → Emails in the Supabase dashboard, which also
lets the hourly limit be raised.

## Bumping the service worker

`sw.js` is network-first, so a push is live on the next launch. Bump `CACHE`
when the shell list changes.
