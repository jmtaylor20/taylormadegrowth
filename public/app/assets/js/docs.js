// Document pipeline helpers shared by Proposals and Invoices.
// Queuing a Send / Save flags the row in the database; the Google Apps Script in
// /google-apps-script picks it up, renders a PDF, files it in Drive, emails the
// client from Gmail, and writes the status back.
import { SEND_STATUS, DRIVE_STATUS } from './config.js';
import { el, statusBadge, toast, todayISO } from './ui.js';

// Render the send/drive status chips for a row (drive chip links to the file).
export function docBadges(row) {
  const out = [];
  if (row.send_status) out.push(statusBadge(SEND_STATUS, row.send_status));
  if (row.drive_status) {
    const chip = statusBadge(DRIVE_STATUS, row.drive_status);
    out.push(row.drive_url ? el('a', { href: row.drive_url, target: '_blank', title: 'Open in Drive' }, [chip]) : chip);
  }
  return out;
}

// Queue a document to be emailed and/or archived. `repo` is a db.js table
// wrapper (Proposals/Invoices). Sending implies a PDF, so it also ensures the
// Drive archive is queued. Emailing needs the client's email on file.
export async function queueDoc(repo, row, client, opts, refresh) {
  const patch = {};
  if (opts.send) {
    if (!client || !client.email) { toast('Add the client’s email first', 'err'); return; }
    patch.send_status = 'queued';
    patch.sent_to = client.email;
    patch.send_error = null;
    if (row.drive_status !== 'saved') patch.drive_status = 'queued';
    patch.drive_error = null;
    // reflect that it's been sent in the proposal's own lifecycle
    if (row.status === 'draft') { patch.status = 'sent'; patch.sent_on = todayISO(); }
  } else if (opts.drive) {
    patch.drive_status = 'queued';
    patch.drive_error = null;
  }
  try {
    await repo.update(row.id, patch);
    toast(opts.send ? 'Queued — will email + file to Drive' : 'Queued to save to Drive');
    refresh?.();
  } catch (e) { toast(e.message || 'Failed', 'err'); }
}
