# TaylorMade Brands — document pipeline (Google Apps Script)

This is the helper that makes **Send** and **Save to Drive** in the ops app
actually work. When you tap those buttons, the app flags the proposal/quote/
estimate or invoice as *queued*. This script (running in **your** Google
account) picks it up, builds a PDF, files it in your Drive folder, emails it to
the client from your Gmail, and marks it done in the app.

Same idea as the A&O `drive-archive.gs` / `email-sender.gs` scripts.

## What you get

- **PDFs** of proposals, quotes, estimates, and invoices — clean, branded.
- **Filed in Drive** under **TaylorMade Brands — Client Documents**, in a
  subfolder per client.
- **Emailed to the client** from your Gmail, with the PDF attached.
- The app shows **Emailed** / **In Drive** (with a link) once it's done.

## One-time setup (about 3 minutes)

1. Go to **[script.google.com](https://script.google.com)** → **New project**.
2. Delete the sample code, and paste in the contents of
   [`tmg-doc-pipeline.gs`](./tmg-doc-pipeline.gs).
3. The `CONFIG` block at the top is **already filled in** for your project and
   your Drive folder — nothing to change. (You can tweak `REPLY_TO`,
   `PER_CLIENT_SUBFOLDERS`, etc. if you want.)
4. In the function dropdown, choose **`authorizeOnce`** and click **Run**.
   Google will ask you to grant permissions (Drive, Gmail, external requests) —
   approve them. *(You'll see a "Google hasn't verified this app" screen because
   it's your own script — click **Advanced → Go to project**.)*
5. Choose **`installTrigger`** and click **Run** once. That's it — it now checks
   the queue every 10 minutes.

## Using it

- In the app, open **Proposals** or **Invoices**.
- **✈️ Send** = email the client the PDF **and** save it to Drive.
- **☁️ Save to Drive** = just file the PDF (no email).
- Within ~10 minutes the row shows **Emailed** / **In Drive**. The Drive chip
  links straight to the file.

Want it faster than 10 minutes? Open the script and run **`processQueue`**
manually anytime, or change `everyMinutes(10)` in `installTrigger`.

## Notes

- Emails send **from your Gmail** (the account that owns the script), with
  replies going to `REPLY_TO`. Gmail's daily send limit applies (plenty for
  this).
- **Neither script carries a Supabase key with any authority.** Each signs in as
  its own Supabase Auth user and uses the resulting JWT, exactly as a person's
  session does. The publishable key still travels on `apikey` — that is the
  project identifier and is meant to be public.
- A *secret* key cannot be used here at all: Supabase rejects those with 401
  matched on the User-Agent header, and both runtimes send a
  `Mozilla/5.0 (compatible; Google-Apps-Script; ...)` agent they will not let
  you override. Don't try it — it was tried and reverted.
- What each identity may reach is set in `public.automation_accounts.scopes`,
  not by the credential. The document pipeline holds `crm_documents`; the Ads
  sync holds `ad_metrics` alone.
- The two scripts run on **different platforms**, which decides where each keeps
  its password:
  - **`tmg-doc-pipeline.gs`** is an Apps Script project. Its password lives in
    **Project Settings → Script properties → `SUPABASE_AUTOMATION_PASSWORD`**,
    never in the file.
  - **`ads-metrics-sync.gs`** is a **Google Ads Script**, pasted into the Ads
    manager account under Tools → Bulk actions → Scripts. That runtime has no
    `PropertiesService`, so its password sits in a constant in the script body
    where anyone with Ads manager access can read it. That is exactly why its
    identity is scoped to `ad_metrics` alone — the worst a leak buys is the
    ability to write ad statistics.
- Fill passwords in through the Google UI and leave the repo copies as
  placeholders. This repository is public.
- If something fails, the app shows **Send failed / Save failed** and the error
  is stored on the record — re-tap the button to retry.
