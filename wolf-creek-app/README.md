# Wolf Creek Farms — Field App

A mobile-first web app that behaves like a native iPhone app once saved to the home
screen. It's Russ's tool for writing estimates, emailing them, scheduling the work,
invoicing when it's done, and keeping a clean mileage and expense record for taxes.

Live data lives in **Supabase**; the front end is plain HTML/CSS/JS (no build step).

Adapted from the A&O Tree Service field app. What's different is listed under
[What was removed](#what-was-removed-and-why).

## Access

The app opens to a **PIN pad** (currently `1234`, set in [`config.js`](assets/js/config.js)).
This is a light gate — the PIN lives in the client, so it deters casual access rather
than being real security. See [Security](#security) before this holds many real
customers.

## The tabs

1. **Estimates** — leads waiting on a price, longest-waiting on top. Anything with a
   site visit booked is pinned above the rest. Tap ＋ to add one by hand; tap a card to
   price it and email the estimate.
2. **Pending** — quoted jobs, in two groups: *Won — schedule it* and *Quoted — awaiting
   decision*. A win stays here until it has a work date on it; setting one moves it to
   Schedule automatically.
3. **Schedule** — the job board by day, with past-due work pinned at the top so nothing
   quietly falls off. Multi-day jobs appear under each booked day. **Done** marks the job
   complete and queues the invoice.
4. **Completed** — finished jobs awaiting payment. Send or resend the **Invoice**, record
   a partial **Payment**, or mark **Paid in full** — which sends the thank-you email and
   clears the job from the app (the record and its PDFs are kept).
5. **Expenses** — the manual IRS record: a **mileage log** (date, miles, destination,
   business purpose — exactly what the IRS asks for) and **business expenses** by
   category, with a month navigator and a by-category breakdown.
6. **Reports** — wins and losses on estimates with a win rate, why the lost ones were
   lost, money won vs. money collected vs. still owed, and every customer with what
   they've paid. Filter by all time, this year, or a single month.

**Call / Text / Email / Navigate** are on the job detail sheet and on the tab cards
throughout — one tap from anywhere a customer appears.

## The email chain

Three emails go out automatically as a job moves along, sent by
[`email-sender.gs`](email-sender.gs) running in **russ@wolfcreeklands.com**:

| Trigger | Email |
| --- | --- |
| **Quote & send estimate** on a lead | **Estimate** — scope, total, lead time |
| Job marked **Completed** | **Invoice** — work performed, final price, remit-to |
| Job marked **Paid in full** | **Thank-you** — with a Google review link |

Each one is confirmed in the app before it queues, so an email never goes out by
surprise, and each is marked `sent` so it can never double-send. A job with no email
address on file is marked `skipped` rather than blocking.

## Setup

### 1. Supabase (done)

Project **`wolf-creek-app`** (`qbevslgvvkftdacsxmpl`), isolated from the A&O, Beehive,
and TaylorMade projects. The schema in [`schema.sql`](schema.sql) is already applied.
The browser uses the publishable key, and RLS is on in open-link mode.

### 2. Deploy (Netlify)

Static site, no build command — Netlify serves the files as-is via
[`netlify.toml`](netlify.toml). New Project → import this repo → deploy. Then on the
iPhone, open the site → **Share → Add to Home Screen**.

### 3. Customer emails (about 5 minutes, once)

1. Sign in to [script.google.com](https://script.google.com) **as russ@wolfcreeklands.com**.
2. New project → paste in [`email-sender.gs`](email-sender.gs) → Save.
3. Check `REMIT_ADDRESS` (blank by default — fill it in to print a mailing address on
   invoices) and `REVIEW_URL` (currently a Google search; swap in the real
   `g.page/r/…` review link from the Google Business Profile).
4. Run `installTrigger` → approve the Gmail + external-request prompts. ("Google hasn't
   verified this app" is expected — it's your own script. Advanced → Go to project.)

It then checks for queued emails every 5 minutes.

### 4. Drive PDF archive (optional)

[`drive-archive.gs`](drive-archive.gs) files a **quote PDF** for every quoted job and a
**job summary PDF** for every completed one into Drive, then combines each month into
printable binders. Same install steps, run `installTriggers`. The app shows a link to
the saved PDF on the job's detail sheet once it exists. The app works fine without this.

## Configuration

Everything tunable is in [`assets/js/config.js`](assets/js/config.js) as plain lists:

- `APP_PIN` — the access PIN.
- `CITY_ZIP` — towns served, each with a ZIP that auto-fills on the estimate form.
- `SERVICES` — the nine services from wolfcreeklands.com, broken into pickable line items.
- `SITE_CONDITIONS` — what changes the price on a dirt job (rock, wet ground, tight access…).
- `MILEAGE_RATE` — **update every January.** The IRS resets the standard mileage rate
  annually; the Expenses tab values every logged trip at this number. Set
  `MILEAGE_RATE_YEAR` to match so the app shows which year's rate is in force.
- `EXPENSE_CATEGORIES`, `TRIP_PURPOSES`, `LEAD_TIMES`, `RESCHEDULE_REASONS` — dropdown lists.
- `COMPANY` — name, phone, email shown in the app.

Save and push — Netlify redeploys and the app updates itself on next launch.

## What was removed, and why

Carried over from the A&O app but deliberately left out:

| Removed | Why |
| --- | --- |
| **Mapbox mileage tracking** | Mileage is entered by hand on the Expenses tab. No Mapbox token, no geocoding, no route optimization, no `lat`/`lng`. |
| **My Day** | Built to route a heavy daily estimate load. Russ won't run enough estimates to need it — booked visits now surface at the top of the Estimates tab instead. |
| **Money (payroll)** | No payroll to calculate. Replaced by the Expenses tab. |
| **Equipment per job** | Everything goes to every job, so there was nothing to track or avoid double-booking. |
| **Crews** | One crew. A scheduling conflict is now simply two jobs overlapping on the same day. |
| **Rain flag** | Not relevant to this work. |
| **Lead parsing / Gmail import** | Russ enters estimates by hand. `gmail-lead-import.gs` and `parse.js` were not carried over — easy to add back later if lead emails start arriving. |
| **Monthly metrics PDF** | It was built from road time, equipment hours, and per-tree figures — all of which are gone. The Quotes and Completed Jobs binders are unaffected. |

The database columns for the Drive PDF links are kept, so the archive script works
without a schema change.

## Design

Colors are pulled from **wolfcreeklands.com** (`css/agency.css`): hunter greens
(`#18382b`, `#2f6244`, `#53825c`), charcoal (`#0d1210`), sage accent (`#adc889`), and
sand (`#d8c7a5`). The website runs a dark theme; the app keeps a **light** content
surface because it's read outdoors in daylight, and puts the brand's dark greens on the
topbar, the PIN screen, and every button and accent.

## Database

Two tables: `public.jobs` holds each estimate through its whole lifecycle, and
`public.expenses` holds the mileage log and business expenses. Full DDL in
[`schema.sql`](schema.sql).

Currently **open-link mode** — RLS is enabled but anon can read and write everything, so
anyone with the URL and the PIN has full access. Adding real logins later is a policy
change, not a rewrite.

## Security

Worth knowing before this holds a lot of real customer data:

- The PIN is client-side. Anyone who views source can read it.
- The publishable key is in the repo (that's what it's for — it's meant for browsers),
  but with open-link RLS it grants full read/write to every row. **Keep this repo private.**
- The app holds third-party personal data — customer names, phone numbers, emails, and
  addresses. When it's holding more than a handful, swap the PIN for Supabase Auth and
  tighten the RLS policies to authenticated-only. The schema is already RLS-ready.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
