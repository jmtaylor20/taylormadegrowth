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
| Monthly report generator | `assets/js/report.js` |
| Database schema (reference) | `../../db/schema.sql` |
| Demo/starter data (reference) | `../../db/seed.sql` |

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
