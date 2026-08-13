/**
 * TaylorMade Growth — document pipeline
 * ------------------------------------------------------------------------
 * Turns queued proposals/quotes/estimates and invoices from the ops app into
 * real PDFs that get:
 *   1. filed in your Google Drive folder (a subfolder per client), and
 *   2. emailed to the client from your Gmail — with the PDF attached.
 *
 * It runs on a time trigger (every 10 min), reads rows the app flagged as
 * "queued", does the work, and writes the status back so the app shows
 * "Emailed" / "In Drive" with a link to the file.
 *
 * SETUP (one time — see README.md in this folder for the walkthrough):
 *   1. script.google.com → New project → paste this file.
 *   2. The CONFIG below is already filled in for your project + Drive folder.
 *   3. Run `authorizeOnce` once and grant the permissions it asks for.
 *   4. Run `installTrigger` once to start the every-10-minute schedule.
 * ------------------------------------------------------------------------
 */

// ==== CONFIG ================================================================
var CONFIG = {
  SUPABASE_URL: 'https://buubrapkkqyalecwbhkh.supabase.co',
  // Publishable (anon) key — browser-safe, same key the app uses.
  SUPABASE_KEY: 'sb_publishable_h-KXdNNW7Tc_BFut25s_sQ_ypIidBJB',
  // "TaylorMade Growth — Client Documents" in your Drive.
  DRIVE_FOLDER_ID: '16Xdj5h0uetqWPtu3gHuL94_lhdYYf1iO',
  PER_CLIENT_SUBFOLDERS: true,   // file each client's docs in their own subfolder
  FROM_NAME: 'TaylorMade Growth',
  BUSINESS_NAME: 'TaylorMade Growth',
  WEBSITE: 'taylormadegrowth.com',
  REPLY_TO: 'josh@taylormadegrowth.com',
};

// ==== ENTRY POINTS =========================================================

/** Main worker — runs on the trigger. Safe to run manually anytime. */
function processQueue() {
  processTable_('proposals');
  processTable_('invoices');
}

/** Run once to grant Drive + Gmail + external-request permissions. */
function authorizeOnce() {
  DriveApp.getRootFolder();
  GmailApp.getAliases();
  UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/', { headers: authHeaders_(), muteHttpExceptions: true });
  Logger.log('Authorized. Now run installTrigger once.');
}

/** Run once to schedule processQueue every 10 minutes. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(10).create();
  Logger.log('Trigger installed — processQueue runs every 10 minutes.');
}

// ==== CORE =================================================================

function processTable_(table) {
  var rows = sbGet_(table + '?or=(send_status.eq.queued,drive_status.eq.queued)&select=*');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    try {
      processRow_(table, row);
    } catch (err) {
      var f = (row.send_status === 'queued') ? 'send' : 'drive';
      var patch = {};
      patch[f + '_status'] = 'error';
      patch[f + '_error'] = String(err).slice(0, 400);
      sbPatch_(table, row.id, patch);
      Logger.log('Error on ' + table + ' ' + row.id + ': ' + err);
    }
  }
}

function processRow_(table, row) {
  var client = row.client_id ? (sbGet_('clients?id=eq.' + row.client_id + '&select=business_name,contact_name,email,phone,city,state')[0] || {}) : {};
  var isProposal = table === 'proposals';
  var docLabel = isProposal ? titleCase_(row.doc_type || 'proposal') : 'Invoice';
  var fileName = [client.business_name || 'Client', docLabel, dateStamp_()].join(' - ') + (isProposal && row.title ? '' : (row.number ? ' ' + row.number : '')) + '.pdf';

  var html = isProposal ? proposalHtml_(row, client) : invoiceHtml_(row, client);
  var pdf = Utilities.newBlob(html, 'text/html', fileName).getAs('application/pdf').setName(fileName);

  var patch = {};

  // ---- Save to Drive (needed for the archive AND to attach when emailing) ----
  var driveUrl = row.drive_url || null;
  var needDrive = row.drive_status === 'queued' || row.send_status === 'queued';
  if (needDrive && row.drive_status !== 'saved') {
    var folder = targetFolder_(client.business_name);
    var file = folder.createFile(pdf);
    driveUrl = file.getUrl();
    patch.drive_status = 'saved';
    patch.drive_url = driveUrl;
    patch.drive_saved_at = nowIso_();
    patch.drive_error = null;
  }

  // ---- Email to client -------------------------------------------------------
  if (row.send_status === 'queued') {
    var to = row.sent_to || client.email;
    if (!to) {
      patch.send_status = 'error';
      patch.send_error = 'No client email on file';
    } else {
      var subject = isProposal
        ? ('Your ' + docLabel + ' from ' + CONFIG.BUSINESS_NAME + (row.title ? ' — ' + row.title : ''))
        : ('Invoice ' + (row.number || '') + ' from ' + CONFIG.BUSINESS_NAME).trim();
      GmailApp.sendEmail(to, subject, emailPlain_(isProposal, row, client), {
        name: CONFIG.FROM_NAME,
        replyTo: CONFIG.REPLY_TO,
        htmlBody: emailHtml_(isProposal, row, client),
        attachments: [pdf],
      });
      patch.send_status = 'sent';
      patch.sent_at = nowIso_();
      patch.sent_to = to;
      patch.send_error = null;
    }
  }

  if (Object.keys(patch).length) sbPatch_(table, row.id, patch);
}

// ==== DRIVE ================================================================

function targetFolder_(clientName) {
  var root = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
  if (!CONFIG.PER_CLIENT_SUBFOLDERS || !clientName) return root;
  var name = String(clientName).replace(/[\\/:*?"<>|]/g, '').trim() || 'Client';
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// ==== SUPABASE REST ========================================================

function authHeaders_() {
  return { apikey: CONFIG.SUPABASE_KEY, Authorization: 'Bearer ' + CONFIG.SUPABASE_KEY };
}
function sbGet_(path) {
  var res = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + path, {
    method: 'get', headers: authHeaders_(), muteHttpExceptions: true,
  });
  var body = res.getContentText();
  if (res.getResponseCode() >= 300) throw new Error('GET ' + path + ' -> ' + res.getResponseCode() + ' ' + body);
  return JSON.parse(body || '[]');
}
function sbPatch_(table, id, patch) {
  var res = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
    method: 'patch',
    headers: Object.assign(authHeaders_(), { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    payload: JSON.stringify(patch), muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('PATCH ' + table + ' -> ' + res.getResponseCode() + ' ' + res.getContentText());
}

// ==== HTML BUILDERS ========================================================

var CSS = '<style>' +
  "body{font-family:Arial,Helvetica,sans-serif;color:#101827;max-width:720px;margin:28px auto;padding:0 26px;line-height:1.5}" +
  '.head{display:flex;justify-content:space-between;border-bottom:3px solid #13294b;padding-bottom:14px;margin-bottom:22px}' +
  '.brand{font-weight:800;font-size:20px;color:#081a33}.brand span{color:#d4af37}' +
  'h1{font-size:20px;color:#081a33;margin:0 0 6px}.muted{color:#64748b}' +
  'table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:9px 6px;border-bottom:1px solid #e6e9ef;font-size:14px}' +
  'th{text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.04em}' +
  'tfoot td{font-weight:800;color:#081a33;border-top:2px solid #13294b;border-bottom:0}' +
  '.totals{margin-top:10px}.chip{display:inline-block;background:#13294b;color:#fff;padding:10px 16px;border-radius:12px;font-weight:700;margin-right:10px}' +
  '.chip small{display:block;color:#d4af37;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em}' +
  '.foot{margin-top:28px;border-top:1px solid #e6e9ef;padding-top:14px;color:#64748b;font-size:12px}' +
  '</style>';

function proposalHtml_(p, client) {
  var items = p.line_items || [];
  var m = sum_(items, 'monthly'), o = sum_(items, 'oneTime');
  var rows = items.map(function (it) {
    return '<tr><td>' + esc_(it.label) + '</td><td style="text-align:right">' + (it.monthly ? money_(it.monthly) + '/mo' : '—') +
      '</td><td style="text-align:right">' + (it.oneTime ? money_(it.oneTime) : '—') + '</td></tr>';
  }).join('') || '<tr><td colspan="3" class="muted">No line items</td></tr>';
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' + CSS + '</head><body>' +
    header_(titleCase_(p.doc_type || 'proposal')) +
    '<h1>' + esc_(p.title || 'Growth Proposal') + '</h1>' +
    '<div class="muted">Prepared for <b style="color:#101827">' + esc_(client.business_name || 'your business') + '</b></div>' +
    (p.summary ? '<p>' + esc_(p.summary) + '</p>' : '') +
    '<table><thead><tr><th>Service</th><th style="text-align:right">Monthly</th><th style="text-align:right">One-time</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '<tfoot><tr><td>Total</td><td style="text-align:right">' + money_(m) + '/mo</td><td style="text-align:right">' + money_(o) + '</td></tr></tfoot></table>' +
    '<div class="totals"><span class="chip"><small>Monthly</small>' + money_(m) + '</span><span class="chip"><small>To start</small>' + money_(o) + '</span></div>' +
    footer_() + '</body></html>';
}

function invoiceHtml_(inv, client) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' + CSS + '</head><body>' +
    header_('Invoice' + (inv.number ? ' ' + inv.number : '')) +
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
      '<div><div class="muted">Bill to</div><b>' + esc_(client.business_name || '') + '</b><br>' +
        esc_(client.contact_name || '') + '<br>' + esc_([client.city, client.state].filter(Boolean).join(', ')) + '</div>' +
      '<div style="text-align:right"><div class="muted">Issued</div>' + esc_(inv.issued_on || '') +
        '<div class="muted" style="margin-top:6px">Due</div>' + esc_(inv.due_on || '—') + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>' +
    '<tbody><tr><td>' + esc_(inv.description || titleCase_(inv.type || 'Service')) + '</td><td style="text-align:right">' + money_(inv.amount) + '</td></tr></tbody>' +
    '<tfoot><tr><td>Total due</td><td style="text-align:right">' + money_(inv.amount) + '</td></tr></tfoot></table>' +
    (inv.method ? '<div class="muted">Payment: ' + esc_(inv.method) + '</div>' : '') +
    footer_() + '</body></html>';
}

function header_(right) {
  return '<div class="head"><div class="brand">TaylorMade <span>Growth</span></div>' +
    '<div class="muted" style="text-align:right">' + esc_(right) + '<br>' + dateNice_() + '</div></div>';
}
function footer_() {
  return '<div class="foot">' + esc_(CONFIG.BUSINESS_NAME) + ' · ' + esc_(CONFIG.WEBSITE) + ' · Let’s grow something great together.</div>';
}

// ==== EMAIL BODIES =========================================================

function emailPlain_(isProposal, row, client) {
  var hi = 'Hi ' + (client.contact_name || '') + ',\n\n';
  if (isProposal) {
    return hi + (row.summary || 'Here is the ' + (row.doc_type || 'proposal') + ' we put together for you.') +
      '\n\nThe full details are in the attached PDF. Ready to move forward? Just reply and we’ll get you set up.\n\n' +
      'Thanks,\n' + CONFIG.FROM_NAME + '\n' + CONFIG.WEBSITE;
  }
  return hi + 'Please find your invoice' + (row.number ? ' ' + row.number : '') + ' attached' +
    (row.due_on ? ', due ' + row.due_on : '') + '. The amount due is ' + money_(row.amount) + '.\n\n' +
    'Thanks for your business,\n' + CONFIG.FROM_NAME + '\n' + CONFIG.WEBSITE;
}
function emailHtml_(isProposal, row, client) {
  return '<div style="font-family:Arial,sans-serif;color:#101827;line-height:1.55">' +
    '<p>Hi ' + esc_(client.contact_name || '') + ',</p>' +
    (isProposal
      ? '<p>' + esc_(row.summary || 'Here is the ' + (row.doc_type || 'proposal') + ' we put together for you.') +
        '</p><p>The full details are in the attached PDF. Ready to move forward? Just reply and we’ll get you set up.</p>'
      : '<p>Please find your invoice' + (row.number ? ' ' + esc_(row.number) : '') + ' attached' +
        (row.due_on ? ', due ' + esc_(row.due_on) : '') + '. The amount due is <b>' + money_(row.amount) + '</b>.</p>') +
    '<p style="margin-top:18px">Thanks,<br><b>' + esc_(CONFIG.FROM_NAME) + '</b><br>' +
    '<a href="https://' + esc_(CONFIG.WEBSITE) + '">' + esc_(CONFIG.WEBSITE) + '</a></p></div>';
}

// ==== HELPERS ==============================================================

function sum_(items, key) { return (items || []).reduce(function (s, x) { return s + Number(x[key] || 0); }, 0); }
function money_(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function titleCase_(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function nowIso_() { return new Date().toISOString(); }
function dateStamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function dateNice_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy'); }
