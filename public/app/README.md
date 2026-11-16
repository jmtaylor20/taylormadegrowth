# TaylorMade Brands — Ops app

Your internal operating system: CRM + sales pipeline, website build tracking,
monthly management tasks, invoices/MRR, content, proposals, renewals, and
client monthly reports. A no-build PWA (plain HTML/CSS/JS) on Supabase, served
by the main site at **taylormadegrowth.com/app**.

## Open it

- URL: `https://taylormadegrowth.com/app`
- Sign in with your email. Supabase sends an 8-digit code; there is no password
  and no PIN. Your address has to be in `public.staff_users` — a valid session
  that is not on that list reads nothing.
- On your phone: open the URL in Safari/Chrome → Share → **Add to Home Screen**.
  It installs like a native app (icon, full screen, offline shell).

> The gate is the database, not this app. `anon` holds no policy and no grant on
> any table, so the publishable key in this page's source is worth nothing on
> its own — that is the point of it being safe to publish. Signing out, or a
> session that stops refreshing, drops you straight back to the sign-in screen
> rather than leaving the app rendering over queries that return nothing.
>
> **Contractor copies are the exception.** They still use the old client-side
> PIN, because their Supabase projects have not been migrated to real auth and
> so have nothing to sign in with. That PIN protects nothing. See
> `../../db/SECURITY.md`.

## What's where

| Area | File |
| --- | --- |
| Config: keys, auth mode, team, dropdown option lists | `assets/js/config.js` |
| Supabase data layer (CRUD) | `assets/js/db.js` |
| Shared UI toolkit (buttons, forms, sheet, icons) | `assets/js/ui.js` |
| Shell: sign-in gate, nav, router | `assets/js/app.js` |
| Staff auth (email code, session, staff check) | `assets/js/auth.js` |
| Screens | `assets/js/{dashboard,pipeline,clients,projects,tasks,invoices,content,proposals,renewals}.js` |
| Client detail hub | `assets/js/client-detail.js` |
| Client onboarding (More → Onboarding) | `assets/js/onboarding.js` |
| Monthly report generator | `assets/js/report.js` |
| Client Margin (page + calculation service) | `assets/js/margin.js`, `assets/js/margin-calc.js` |
| Database schema (reference) | `../../db/schema.sql` |
| Demo/starter data (reference) | `../../db/seed.sql` |

## Onboarding a client

**More → Onboarding.** Start an engagement, decide which sections the client is
actually asked, hand each one to a named person, and send the invitation — the
whole job on one screen. What you set there is exactly what they see at
`taylormadegrowth.com/portal/`.

Two things worth knowing:

- **Switching a section off does not delete anything.** If they already answered
  it, the answers stay. Switch it back on and it is all still there.
- **Three ways to send**, one message per person, each counting their own
  sections. *Send* goes straight from the app through the
  `send-onboarding-invite` Edge Function; *Mail app* opens the same message in
  your own mail client, so it comes from your address and lands in your Sent;
  *Copy* hands you the text. If Resend is not set up yet, *Send* says so and
  points at *Mail app* — nothing is blocked.
- **There is no password to send anybody.** The portal signs people in with a
  one-time code that Supabase emails when they press the button, and it expires
  within the hour. The invitation says where to go; the code follows when they
  ask for it, which is why a forwarded invitation gives nobody anything.

`db/GO-LIVE.md` is the fuller runbook, including the one-time Supabase setup —
custom SMTP above all, because the built-in mailer allows only a handful of
sign-in codes an hour for the whole project.

`npm run test:onboarding-admin` drives that screen in a real browser against a
throwaway database, and checks the consequences rather than the clicks: that
switching a section off keeps the answers, that assignment is what the client's
portal then shows, and that each invitation carries the address that actually
signs that person in.

## Client Margin

**More → Client Margin.** Shows what each client actually keeps once the cost of
running the agency is spread across them, and flags anyone who is underwater or
below your minimum acceptable margin.

How allocation works (the math lives in `assets/js/margin-calc.js`, never in the
UI):

- The cost pool is your **recurring costs** (the "Recurring expenses" list, edited
  from either Money or Client Margin → **Manage costs**). Each cost is either
  **shared** (overhead) or tied to one **client**, and is billed **monthly** or
  **annual**. Annual costs are divided by 12 so everything compares per month.
- **Shared monthly cost** = the sum of all shared costs, normalized to monthly.
- **Allocated shared per client** = shared monthly cost ÷ the number of clients
  whose status is **active** or **dormant**. Inactive clients are left out of the
  split entirely.
- **Client total cost** = that allocated share plus the client's own
  client-specific costs.
- **Margin** = the client's monthly rate (`mrr`) minus their total cost; the page
  also shows margin percent and the break-even rate (the rate that would cover
  their cost exactly).
- **Minimum acceptable margin** is configurable on the page (default $60). Any
  client below it, or below zero, is highlighted.

A client's **status** (active / dormant / inactive) is set from the per-client
breakdown on this page. One-off expenses logged in Money also carry an
allocation type and billing period, so they can be tagged to a client, but the
margin figures above are driven by the recurring cost pool.

## Everyday tuning (no code)

Open `assets/js/config.js` to edit, as plain lists:

- `TEAM` — who tasks can be assigned to (Josh, Wyatt, Tony, Cole, …).
- `CATEGORIES` — prospect/client industries.
- `SERVICES` — what you sell (drives packages + proposals).
- `MONTHLY_TEMPLATE` / `ONBOARDING_TEMPLATE` — the default task/onboarding lists.
- Status vocabularies (website/GBP/Ads/invoice/etc.).

Save and push — Netlify redeploys the site and the app updates itself on next
launch.

## Data

- Supabase project: **taylormade-growth-app** (`buubrapkkqyalecwbhkh`), isolated
  from the A&O and Beehive projects.
- The browser uses the publishable (anon) key; every table has RLS enabled with
  anon policies suited to this internal tool.
- The demo rows (marked `[demo]` in notes) can be cleared anytime by re-running
  `db/seed.sql`'s delete, or deleting them in-app.
