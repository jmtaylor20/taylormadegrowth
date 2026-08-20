# Onboarding a real client

Everything here is a one-time setup step or a per-client step. Do the setup once;
the per-client part takes about five minutes.

## Before the first client — do this once

### 1. Resend, once — it covers both emails

Two different emails go to a client, and both need this.

**The invitation** — "here's your portal" — is sent by the ops app through the
`send-onboarding-invite` Edge Function. **The sign-in code** is sent by Supabase
Auth when they press the button. One Resend account serves both.

1. Create the account and **verify `taylormadegrowth.com`** — a few DNS records.
   Until the domain is verified Resend will only deliver to your own address, so
   this is the step that actually blocks a real client.
2. Supabase dashboard → **Edge Functions → Secrets** → add `RESEND_API_KEY`.
   Optionally `INVITE_FROM` (defaults to
   `TaylorMade Brands <onboarding@taylormadegrowth.com>`) and `INVITE_REPLY_TO`
   (defaults to josh@).
3. Then do the SMTP half below, which is the same key in a different box.

Until the key is set, **Send** in the app says so and points at **Mail app**,
which opens the same message in your own mail client. Nothing is blocked; it is
just one more step.

### 2. Custom SMTP (do not skip this one)

This is the sign-in codes, and it is the half most likely to break a real
onboarding. Supabase's built-in mailer allows only a handful of messages per
hour for the whole project and is explicitly not meant for production. Three
people signing in to one engagement in the same sitting will exhaust it, and
they will read the failure as "my email is wrong" and stop. That happened in the
sandbox on the third address.

**Authentication → Emails → SMTP Settings**, using the Resend credentials from
step 1. Then raise the hourly limit under **Authentication → Rate Limits** — it
stays low until custom SMTP is on.

### 3. Check the sign-in email reads like a client email

One Supabase project sends for both the staff app and the client portal, so
there is one template and a client will read it. Under **Authentication →
Emails → Magic Link**, make sure the wording works for somebody outside the
company — "your TaylorMade Brands sign-in code", not anything about ops or
admin. The template must contain `{{ .Token }}`, which is what makes it send a
code rather than a link; the portal signs people in with a code on purpose, so a
link would break it.

### 4. Confirm new sign-ups are allowed

A new contact has no auth user until the first time they ask for a code, so
**Authentication → Sign In / Providers → Allow new users to sign up** has to be
on. It is what lets a stranger's address become a session — which grants them
nothing, because `onboarding_client_ids()` returns empty for anyone who is not
on a client's contact list, and the portal signs them straight back out.

### 5. Clear the sandbox

`db/teardown_portal_sandbox.sql`. Read its header first: it cannot delete
uploaded files, because Supabase refuses to let SQL touch `storage.objects` at
all. It lists them instead, and they come out through the dashboard's
**Storage → onboarding** browser. Take the files out first — once the asset rows
are gone, nothing names the objects any more.

## For each client — from the ops app

**More → Onboarding.** The whole job is on that one screen.

### 1. The client must exist in the CRM

Add them under Clients first. The onboarding screen only offers clients who do
not already have a live engagement — two open engagements for one client is
confusion, not a feature.

### 2. Start onboarding

Pick the client, a starting set of sections, and a due date. The starting set is
a starting point, not a cage: every section is a switch on the next screen.

| Starting set | Sections | For |
| --- | --- | --- |
| Website Build | 4 | a site, nothing else |
| Website + Ads | 8 | site plus ad management |
| Growth Partner | 13 | the full engagement, including the money questions |
| Custom App Build | 11 | a client getting software built — the App Discovery Checklist |

Custom App Build only appears once `db/seed_app_build_library.sql` has been run
against the database. See `db/ONBOARDING.md`.

Set the industry module only for a trade we have one written for — today that is
millwork, which adds Signature Specification. It is not the client's industry;
it is whether we have a module for it. Modules for other trades are not offered,
because the database refuses them and an option that always errors is worse than
no option.

### 3. Add their people

Name, email, title, role. **The email is the whole thing** — it is what the code
gets sent to and what the database matches them on when they sign in.

Adding someone hands them the sections their role usually answers, and says how
many it moved. Owner takes the money questions; operations takes capacity and
the day-to-day ones. Change any of them on the section rows.

### 4. Decide what they actually get asked

Switch off anything that does not apply. A website build has no business being
asked about gross margin, and leaving a section out is a normal thing to do.

Switching a section off **does not delete anything**. If they already answered
it, the answers stay; switch it back on and it is all still there.

Each section that is on can carry its own assignee and its own due date.

### 5. Send the invitation

**Send invitation** writes one message per person, each counting their own
sections, and gives you three ways out:

* **Send** — goes straight from the app, through the Edge Function. One tap.
* **Mail app** — opens the same message in your own mail client, so it comes
  from your address and sits in your Sent. Use this if Resend is not set up yet.
* **Copy** — the text, to paste wherever.

The link in the message carries their address, so the portal opens with it
already filled in and there is nothing to type on a phone. That is a prefill and
nothing more: the sign-in code still has to arrive in their inbox.

**There is no password to send them.** Nobody has one — not them, not you. The
portal signs people in with a one-time code that Supabase emails when they press
the button, and it expires within the hour. So the invitation tells them where to
go; the code follows when they ask for it. That is why a forwarded invitation
gives nobody anything.

The message warns them off putting passwords in. Keep that paragraph: the
database refuses anything that looks like a credential, and a client who has been
told reads the refusal as care rather than a malfunction.

Sending marks the engagement invited and records when.

### 6. Read what comes back

The Onboarding list shows each client's progress. Open one and every switched-on
section carries a **Read N answers** link — that is the answers themselves, in
the order they were asked, with who gave them.

Three things stay distinct there, because they mean three different things:

| On screen | What it means |
| --- | --- |
| The answer | They answered it |
| *They don't know* | A deliberate answer. Finished work. |
| *Doesn't apply to them* | Also a deliberate answer. Finished work. |
| **Not answered yet** | The only one worth chasing |

**Copy all** puts the whole section on the clipboard as plain text, for pasting
into a brief or a proposal. Uploaded files open through a link that expires in
five minutes.

`unknown` and `not_applicable` count toward the completion percentage, because
they are answers. A section full of them tells you more than a blank one does.

### Turning it into a brief

**Brief**, next to Settings on an engagement. Two buttons, two jobs:

- **Copy for Claude Code** — the whole engagement as markdown, every answer
  still attached to the question that produced it, with a **Still unanswered**
  list at the end and an instruction not to invent those. That list is the point:
  a brief that quietly omits its gaps invites whatever reads it to fill them
  with something plausible, which is the expensive failure here.
- **Print / Save PDF** — the same content, printable, for sending back to the
  client or filing. A worse input to anything automated, because getting the
  text out again means parsing it back.

### Sending an existing client something new

An engagement is not only for new clients. To send somebody who onboarded months
ago a fresh set of questions — an app discovery, say:

1. Their previous engagement has to be **complete** or **archived** first. Open
   it, **Settings**, set the status. A client with something still in flight is
   not offered, because two open at once is confusion. **A client who has never
   onboarded through the portal at all needs none of this** — they have no
   engagement, so they are already in the list.
2. **Start onboarding** → pick them (they are labelled *has answered before*) →
   pick the closest template.
3. Switch off everything they should not be asked again. For an app discovery
   that usually means leaving only the seven `app_*` sections on.

Their old engagement and every answer in it stay exactly where they are. If both
end up open at once, the portal shows them a switcher rather than hiding one.

## The same thing, in SQL

`db/onboard_client.sql` does what the screen does, for when the screen is not
handy or something needs doing in bulk. Three blocks to edit at the top, run the
whole file in the Supabase SQL editor.

It refuses rather than half-creating an engagement: a placeholder left in, a
misspelled client name, an unknown template, two primary contacts, or a client
who already has a live engagement all come back as a sentence saying which.
`npm run test:onboard` exercises every one of those refusals against a throwaway
database.

## Reading the answers, in SQL

The screen shows progress; these read the answers themselves.

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

## Adding a section to a live engagement, in SQL

Ordinarily this is one switch on the Onboarding screen. As SQL it is an ordinary
insert — no migration, no redeploy, and the client sees it next time they open
the portal.

```sql
insert into public.onboarding_engagement_sections (engagement_id, section_key, position)
select e.id, 'financial_baseline', 900
  from public.onboarding_engagements e
  join public.clients c on c.id = e.client_id
 where c.business_name = 'THE CLIENT'
on conflict (engagement_id, section_key) do nothing;
```

## Adding a person mid-engagement, in SQL

```sql
insert into public.client_contacts (client_id, name, email, title, role)
select c.id, 'Their Name', 'them@theirbusiness.com', 'Bookkeeper', 'finance'
  from public.clients c where c.business_name = 'THE CLIENT';
```

Also one button on the Onboarding screen. Either way they can sign in as soon as
the row exists: the database matches them on their confirmed email address.

## What is not built yet

* **Repeating groups** (phase 3). Lead History and the twelve-month table say so
  in place rather than pretending. If a client needs those now, take them on a
  call and enter them yourself.
* **Access grants** (phase 5). The Website & Digital Access section collects the
  questions around access, but the per-platform grant tracker is not in the
  portal yet.
