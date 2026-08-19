# Onboarding a real client

Everything here is a one-time setup step or a per-client step. Do the setup once;
the per-client part takes about five minutes.

## Before the first client — do this once

### 1. Custom SMTP (do not skip this one)

Supabase's built-in mailer allows only a handful of messages per hour for the
whole project and is explicitly not meant for production. Three people signing
in to one engagement in the same sitting will exhaust it, and they will read the
failure as "my email is wrong" and stop. It happened in the sandbox on the third
address.

Set it up under **Authentication → Emails → SMTP Settings** in the Supabase
dashboard. Resend's free tier is 3,000 messages a month and takes about ten
minutes, most of which is a DNS record on `taylormadegrowth.com`. Once custom
SMTP is on, raise the hourly rate limit under **Authentication → Rate Limits** —
it stays low until you do.

### 2. Check the sign-in email reads like a client email

One Supabase project sends for both the staff app and the client portal, so
there is one template and a client will read it. Under **Authentication →
Emails → Magic Link**, make sure the wording works for somebody outside the
company — "your TaylorMade Brands sign-in code", not anything about ops or
admin. The template must contain `{{ .Token }}`, which is what makes it send a
code rather than a link; the portal signs people in with a code on purpose, so a
link would break it.

### 3. Confirm new sign-ups are allowed

A new contact has no auth user until the first time they ask for a code, so
**Authentication → Sign In / Providers → Allow new users to sign up** has to be
on. It is what lets a stranger's address become a session — which grants them
nothing, because `onboarding_client_ids()` returns empty for anyone who is not
on a client's contact list, and the portal signs them straight back out.

### 4. Clear the sandbox

`db/teardown_portal_sandbox.sql`. Read its header first: it cannot delete
uploaded files, because Supabase refuses to let SQL touch `storage.objects` at
all. It lists them instead, and they come out through the dashboard's
**Storage → onboarding** browser. Take the files out first — once the asset rows
are gone, nothing names the objects any more.

## For each client

### 1. The client must exist in the CRM

Add them in the ops app first if they are not there. `db/onboard_client.sql`
matches on `business_name` exactly and refuses if it cannot find them.

### 2. Run `db/onboard_client.sql`

Three blocks to edit at the top: who it is for, who their people are, and who
answers what. Paste the whole file into the Supabase SQL editor and run it.

It refuses rather than half-creating an engagement: a placeholder left in, a
misspelled client name, an unknown template, two primary contacts, or a client
who already has a live engagement all come back as a sentence saying which.
`npm run test:onboard` exercises every one of those refusals against a throwaway
database.

Choosing the template: adding sections later is one insert, so start smaller if
you are unsure.

| Template | Sections | For |
| --- | --- | --- |
| `website_build` | 4 | a site, nothing else |
| `website_ads` | 8 | site plus ad management |
| `growth_partner` | 13 | the full engagement, including the money questions |

Set `vertical` to `millwork` only for a millwork shop — it switches on the
Signature Specification module. `null` for everybody else. It is not the
client's industry; it is whether we have a module written for it.

### 3. Send the invitation

The script prints each person's name, the address they sign in with, and how
many sections are theirs. Nothing emails them automatically — that is deliberate
for now, because the first message a client gets about this should come from you.

Something like:

> Hi [name] — before we start, there's a short set of questions to work through.
> It's at **taylormadegrowth.com/portal/** — enter this email address and it'll
> send you a code, no password to set up. You can add it to your phone's home
> screen if that's easier.
>
> [N] sections are marked for you, and the rest anyone at [company] can answer.
> It doesn't have to be done in one sitting; it saves as you go.
>
> One thing: don't put any passwords or logins in there. The form will refuse
> them anyway. We only ever record whether we have access to something, never
> the credential itself — we'll sort access out on a call.

That last paragraph matters. The database refuses anything that looks like a
credential, and a client who has been warned reads the refusal as care rather
than a malfunction.

### 4. Watch it come in

There is no staff-side screen yet (phase 6). To see where things stand:

```sql
select c.business_name, s.title, p.status, p.percent_complete,
       p.response_count || ' of ' || p.field_count as answered, ct.name as assigned_to
  from public.onboarding_section_progress p
  join public.onboarding_engagement_sections es on es.id = p.engagement_section_id
  join public.onboarding_engagements e on e.id = es.engagement_id
  join public.clients c on c.id = e.client_id
  join public.onboarding_sections s on s.key = es.section_key
  left join public.client_contacts ct on ct.id = es.assigned_contact_id
 order by c.business_name, es.position;
```

And to read what somebody actually said:

```sql
select f.field_key, f.label, r.status,
       coalesce(r.value_text, r.value_number::text, r.value_boolean::text,
                r.value_date::text, r.value_json::text, '—') as answer
  from public.onboarding_responses r
  join public.onboarding_fields f on f.id = r.field_id
  join public.onboarding_engagement_sections es on es.id = r.engagement_section_id
  join public.onboarding_engagements e on e.id = es.engagement_id
  join public.clients c on c.id = e.client_id
 where c.business_name = 'THE CLIENT'
   and r.row_id is null
 order by es.position, f.position;
```

`unknown` and `not_applicable` come back with no value on purpose. They are
answers, and a section full of them tells you more than a blank one does.

## Adding a section to a live engagement

An ordinary insert. No migration, no redeploy — the client sees it next time
they open the portal.

```sql
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, 'financial_baseline', 900
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
 where c.business_name = 'THE CLIENT'
on conflict (engagement_id, section_key) do nothing;
```

## Adding a person mid-engagement

```sql
insert into public.client_contacts (client_id, name, email, title, role)
select c.id, 'Their Name', 'them@theirbusiness.com', 'Bookkeeper', 'finance'
  from public.clients c where c.business_name = 'THE CLIENT';
```

They can sign in as soon as the row exists. Nothing else needs doing — the
database matches them on their confirmed email address.

## What is not built yet

* **Repeating groups** (phase 3). Lead History and the twelve-month table say so
  in place rather than pretending. If a client needs those now, take them on a
  call and enter them yourself.
* **Access grants** (phase 5). The Website & Digital Access section collects the
  questions around access, but the per-platform grant tracker is not in the
  portal yet.
* **The staff screen** (phase 6). Hence this file.
