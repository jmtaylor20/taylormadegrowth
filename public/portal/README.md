# Client onboarding portal

Where a client answers their onboarding questions. Lives at `/portal/`, served
by Netlify from this directory. Vanilla ES modules, no build step — the same
shape as `public/app`, deliberately: an edit here goes live on the next push
with nothing in between to break.

It is a separate app from the ops CRM, not a section of it. Nothing under
`/app` is reachable from here, and a client contact's session grants them
nothing there either — that is `is_staff()` in the policies, not a routing
decision.

## What phases 1 and 2 cover

* Sign-in by emailed code, resolved as a **client contact** via
  `onboarding_client_ids()`.
* The engagement overview: every activated section with its status, assignee,
  due date and honest completion count.
* One section at a time: every scalar field type, autosaved as you go.
* **"I don't know"** and **"Doesn't apply"** beside every question, saved as
  real answers with no value — which is the whole reason the schema stores a
  status per response.

Still to come: repeating groups (phase 3), file upload (4), access grants (5),
and staff-side engagement creation and assignment (6). The portal names each of
those in place rather than hiding them, so a client who was told to expect a
lead-history table can see it is coming.

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
npm run test:portal                    # 27 assertions
npm run test:portal -- --shots ./shots # …and save what each screen looks like
```

This loads these files unmodified in headless Chromium and points them at a
throwaway PostgreSQL 16 cluster carrying the full migration set and seeds. Only
the vendored Supabase bundle is swapped, for a shim that runs each query as the
signed-in contact — `set local role authenticated` with their claims — so the
rows the page renders are the rows RLS actually allows. GoTrue is the one piece
faked; there is no local email service to send a code to.

## Bumping the service worker

`sw.js` is network-first, so a push is live on the next launch. Bump `CACHE`
when the shell list changes.
