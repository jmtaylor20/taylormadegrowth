# TaylorMade Growth — Ops app

Your internal operating system: CRM + sales pipeline, website build tracking,
monthly management tasks, invoices/MRR, content, proposals, renewals, and
client monthly reports. A no-build PWA (plain HTML/CSS/JS) on Supabase, served
by the main site at **taylormadegrowth.com/app**.

## Open it

- URL: `https://taylormadegrowth.com/app`
- PIN: **1225** (change in `assets/js/config.js` → `APP_PIN`)
- On your phone: open the URL in Safari/Chrome → Share → **Add to Home Screen**.
  It installs like a native app (icon, full screen, offline shell).

> The PIN is a light gate that lives in the browser — it deters casual access,
> it is not hard security. When you want real per-user logins (needed before a
> client-facing dashboard), we swap it for Supabase Auth; the database is
> already RLS-ready.

## What's where

| Area | File |
| --- | --- |
| Config: keys, PIN, team, dropdown option lists | `assets/js/config.js` |
| Supabase data layer (CRUD) | `assets/js/db.js` |
| Shared UI toolkit (buttons, forms, sheet, icons) | `assets/js/ui.js` |
| Shell: PIN, nav, router | `assets/js/app.js` |
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
