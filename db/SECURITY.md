# Closing anon access

The onboarding schema went into a database whose front door was a client-side
PIN. This is the record of what that exposed, what has been done about it, and
what is left.

Staged deliberately: production is live and in daily use, so staff auth has to
work before the old door closes.

| Stage | What | Status |
| --- | --- | --- |
| 1 | Audit | Done — inventory below |
| 2 | Staff auth alongside the PIN, additive | Code done; needs two dashboard settings + a deploy |
| 3 | Drop anon, delete the PIN | Not started — gated on Stage 2 being verified |
| 4 | Regression test proving anon is dead | Not started |

Two items from Stage 3 were pulled forward because they carried no risk of
lockout. See "Already applied".

## Framing

The publishable key being in page source is normal and correct — that is how
Supabase is designed. Nothing here tries to hide it, proxy around it, or move
calls server-side to conceal it.

The problem is that the `anon` role has policies granting it data. The fix is
that `anon` ends up with zero policies on every application table.

The PIN is not a layer to preserve. It lives in the browser next to the key it
is supposedly protecting. It gets deleted in Stage 3 rather than kept, so that
nobody later mistakes it for doing work.

## Stage 1 — exposure inventory

Audited 2026-08-18 against `buubrapkkqyalecwbhkh`.

**The app is publicly served.** `https://taylormadegrowth.com/app/assets/js/config.js`
returns 200 to anyone. It contains two Supabase project URLs, two publishable
keys, and two PINs — this project and Tony's contractor project. The exposure
was never scoped to one database.

**Every table was readable.** Probed live with only the publishable key and no
PIN:

```
clients        11 rows    names, emails, phones, mrr, build_fee,
                          cole_pct, private notes
time_entries   71 rows
tasks          54 rows
trips          27 rows    addresses
ad_metrics     15 rows
expenses       14 rows
payments        9 rows
app_settings    4 rows    including a Mapbox token
contractors     2 rows    split_pct — contractor revenue shares
invoices        2 rows
```

Writes were equally open: `anon` held `SELECT, INSERT, UPDATE, DELETE, TRUNCATE`
on all 18 tables with `WITH CHECK (true)` policies. An unfiltered
`DELETE /rest/v1/clients` would have been accepted and cascaded through tasks,
invoices, payments, and activities. Not tested against production, for
obvious reasons — derived from the catalog.

**Anyone could have become `authenticated`.** `disable_signup` was false with
the email provider on, and fifteen tables carried
`FOR ALL TO authenticated USING (true)`. The path was: take the public key,
request a code for your own address, confirm it, and read and write the entire
CRM. No PIN, no contact record, no invitation.

Nobody did. `auth.users`, `auth.identities`, `auth.sessions`,
`auth.refresh_tokens` and `auth.audit_log_entries` were all zero — not one
sign-in was ever attempted. The door was open; no one walked through it.

**Two surfaces beyond policies.** Table-level grants survive policy drops. And
`ALTER DEFAULT PRIVILEGES` grants `anon` full DML on *every future table* in
`public`, so any new table is born open at the grant layer. Stage 3 has to fix
both or this recurs.

**Storage** was clean: no buckets, no policies.

## Already applied to production

Both were pulled forward from Stage 3 because they only touch the
`authenticated` role, which nobody occupied. `anon` is untouched, so the ops
app and both Apps Scripts kept working byte-identically.

- `20260818140000_client_contacts_and_staff` — `staff_users`, `client_contacts`,
  and the auth helpers (`is_staff()`, `onboarding_client_ids()`,
  `current_auth_email()`, `bind_auth_identity()`).
- `20260818140500_lock_down_legacy_authenticated_policies` — every
  unconditional `authenticated` policy replaced with an `is_staff()` check, and
  the three legacy `TO public` policy sets split into anon and staff halves.

Verified afterwards: zero unrestricted `authenticated` policies, zero
`TO public` policies, anon unchanged on all 18 tables, and the live REST API
still serving the ops app.

This closes the signup path. An auth session with no `staff_users` or
`client_contacts` row now matches no policy and reads nothing — which is why
open signup is no longer urgent, though Stage 3 should still disable it.

### Rollback

`supabase/rollback/20260818140500_…rollback.sql` restores the pre-lockdown
posture exactly. `scripts/test-legacy-lockdown-rollback.mjs` reproduces
production's audited 38-policy baseline, applies the migration forward,
asserts the posture changed as claimed, applies the rollback, and asserts the
policy set comes back byte-identical — then re-applies forward to prove the
pair is repeatable rather than single-use.

```sh
node scripts/test-legacy-lockdown-rollback.mjs
```

Running the rollback re-opens the hole. It exists so the forward migration is
not a one-way door, not because reverting is ever a good resting state.

## Stage 2 — staff auth

Supabase Auth, email one-time code, in `public/app/assets/js/auth.js`.

**Why a code rather than a magic link.** The ops app is installed to the home
screen as a PWA. A link tapped in Mail opens in Safari, so the session lands in
Safari's storage, not the PWA's — you would sign in successfully and still be
locked out of the app you were trying to reach. Typing a code keeps the
exchange inside whichever context you are actually using, and sidesteps the
redirect-URL allowlist entirely. A link arriving anyway still works on desktop,
because supabase-js parses a session out of the URL on load.

**Staff membership is asked of the database, not inferred in the browser.**
`isStaff()` calls the same `is_staff()` function every RLS policy calls, so the
app and the database cannot disagree about who is staff. A session that is not
staff is signed out rather than left sitting there.

Both doors work in this stage on purpose. The PIN pad gains a "Sign in with
email" link; a confirmed staff session skips the lock entirely.

### Two settings this needs

Neither can be set from a migration.

1. **Authentication → Email Templates → Magic Link.** The default template
   sends a link only. Add `{{ .Token }}` to send a code. Including both sends
   both, which is what you want — code for the phone, link for the desktop:

   ```html
   <h2>Your TaylorMade sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>This code expires in an hour.</p>
   <p>Or <a href="{{ .ConfirmationURL }}">sign in on this device</a>.</p>
   ```

2. **Authentication → URL Configuration.** Set Site URL to
   `https://taylormadegrowth.com` and add `https://taylormadegrowth.com/app/`
   to the redirect allowlist. Only needed for the link half; the code works
   without it.

## Stage 3 — not started

Gated on Stage 2 being verified on a real device.

- Drop every `anon` policy on every application table.
- Revoke table grants from `anon`, and fix `ALTER DEFAULT PRIVILEGES` so new
  tables are not born open.
- Delete the PIN and every reference (`config.js` lines 24, 52, 99, 102;
  `app.js` lines 2 and the lock block; `public/app/README.md`).
- Amend the four still-unapplied onboarding migrations so they never grant
  `anon` — including `…140400`, which currently creates an
  `onboarding_objects_anon_all` storage policy written for the old posture.
- Disable signup; invite staff and contacts explicitly.
- Confirm RLS on every table in `public`.

**Blocker that must be handled first.** Two Google Apps Scripts write to this
database with the anon key, and both break silently the moment anon policies
are dropped:

- `google-apps-script/ads-metrics-sync.gs` — upserts `ad_metrics` on a timer.
  This is why `ad_metrics` had hand-written `TO public` policies.
- `google-apps-script/tmg-doc-pipeline.gs` — SELECT and PATCH on `proposals`,
  `invoices`, `reports`, `clients`. This is invoice and proposal emailing and
  the Drive archive. It also reaches Tony's project with his anon key.

Apps Script looks like the obvious place for a server-side key. It is not, and
this was tried and reverted:

- Supabase rejects secret keys with 401 "Forbidden use of secret API key in
  browser", matched on the **User-Agent header**.
- Apps Script and Google Ads Scripts send
  `Mozilla/5.0 (compatible; Google-Apps-Script; ...)` and **strip any attempt to
  override User-Agent**. Google has had that feature request open for years.

So a secret key can never work from either script. **Resolved by giving each
script its own identity** (`20260819130000_automation_accounts`): it signs in as
a dedicated Supabase Auth user and uses the resulting JWT, the same
`authenticated` role a person gets, with the publishable key alongside it as the
project identifier.

Authority moved from the credential to the identity.
`public.automation_accounts.scopes` decides what each may reach, so a leaked
script password buys exactly its scopes:

| Script | Identity | Scope |
| --- | --- | --- |
| `tmg-doc-pipeline.gs` | `josh+docs-automation@` | `crm_documents` — proposals, invoices, reports, clients |
| `ads-metrics-sync.gs` | `josh+ads-automation@` | `ad_metrics` alone |

That split matters because the Google Ads Script cannot hide its password — that
runtime has no `PropertiesService`, so it lives in the script body where anyone
with Ads manager access can read it. Scoping it to `ad_metrics` is what makes
that acceptable rather than alarming.

The isolation suite carries an automation persona: eighteen assertions that a
script identity reads no client, invoice, payment, engagement, or storage
object, and cannot widen its own scopes or make itself staff.

**Stage 3 must add the scope checks** to the policies it writes — otherwise the
scripts lose access along with `anon`:

```sql
-- proposals, invoices, reports, clients
using (public.is_staff() or public.automation_has_scope('crm_documents'))
-- ad_metrics
using (public.is_staff() or public.automation_has_scope('ad_metrics'))
```

## MFA

Not yet — secure the inbox instead.

With an emailed code, the email account *is* the credential. Adding TOTP puts a
second factor on top of something already only as strong as the Google account.
If Workspace has 2SV enforced, ideally a hardware key, the code is already
protected in practice. A second seed to enrol, store, and recover for one to
three people buys little, and the recovery path is yours to build.

The `staff_users` allowlist is doing more work than MFA would: a valid session
that is not on it reads nothing.

Revisit when any of these is true — staff passes three, someone joins whose
inbox you do not administer, or a contractor gets staff access on a personal
address.

`is_staff()` is written so that requiring `auth.jwt()->>'aal' = 'aal2'` later is
a one-function change with no app edits.
