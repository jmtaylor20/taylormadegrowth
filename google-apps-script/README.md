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
- These two scripts run on **different platforms**, and that changes how each
  holds its credential:
  - **`tmg-doc-pipeline.gs`** is an Apps Script project. It reads the Supabase
    **secret key** (called `service_role` under its old name) from
    **Project Settings → Script properties → `SUPABASE_SECRET_KEY`**. Nothing
    is written into the file.
  - **`ads-metrics-sync.gs`** is a **Google Ads Script**, pasted into the Ads
    manager account under Tools → Bulk actions → Scripts. That runtime has no
    `PropertiesService`, so its key has to sit in a constant in the script body.
    Paste it in the Google Ads UI and leave the repo copy as a placeholder.
    Give it its own secret key named `ads-sync` rather than sharing `default`,
    so it can be rotated alone — anyone with Ads manager access can read it.
- Both run on Google's servers rather than in a browser, so a secret key is the
  correct credential in each rather than a workaround. Never commit either
  value: this repo is public and a secret key bypasses row-level security
  entirely.
- Send it on the `apikey` header only. Secret keys are not JWTs, so Supabase
  rejects them in an `Authorization: Bearer` header — the publishable key these
  scripts used to carry tolerated both.
- The contractor entries in `CONTRACTOR_SOURCES` still use each contractor's
  publishable key. Those are separate projects with their own RLS posture and
  have not been audited; switch them when they get the same treatment.
- If something fails, the app shows **Send failed / Save failed** and the error
  is stored on the record — re-tap the button to retry.
