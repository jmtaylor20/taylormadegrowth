/**
 * TaylorMade Brands — document pipeline
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
  // "TaylorMade Brands — Client Documents" in your Drive.
  DRIVE_FOLDER_ID: '16xWJ-y8zEJtX6X16m7ZXQDTjGej6Moko',
  PER_CLIENT_SUBFOLDERS: true,   // file each client's docs in their own subfolder
  FROM_NAME: 'TaylorMade Brands',
  BUSINESS_NAME: 'TaylorMade Brands',
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
  var D = p.details || {};
  var LOGO = 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  var docType = titleCase_(p.doc_type || 'proposal').toUpperCase();
  var dateStr = p.sent_on ? p.sent_on : dateNice_();
  var items = p.line_items || [];
  var m = sum_(items, 'monthly'), o = sum_(items, 'oneTime');
  var scopeItems = (D.scope_items || []).filter(function (s) { return s.area || s.detail; });
  var term = D.contract_term || 'No contract';
  var e = esc_;
  var scopeRows = scopeItems.length
    ? scopeItems.map(function (s) { return '<tr><td class="area">' + e(s.area) + '</td><td>' + e(s.detail) + '</td></tr>'; }).join('')
    : (D.deliverables ? '<tr><td class="area">Deliverables</td><td>' + e(D.deliverables) + '</td></tr>' : '<tr><td colspan="2" class="muted">To be scoped together.</td></tr>');
  var priceRows = items.length
    ? items.map(function (it) { return '<tr><td>' + e(it.label) + '</td><td class="r">' + (it.monthly ? money_(it.monthly) + '/mo' : '—') + '</td><td class="r">' + (it.oneTime ? money_(it.oneTime) : '—') + '</td></tr>'; }).join('')
    : '<tr><td colspan="3" class="muted">To be scoped.</td></tr>';
  var extras = [['Timeline & milestones', D.timeline], ['Revision allowance', D.revision_allowance], ['Client responsibilities', D.client_responsibilities], ['Not included', D.not_included], ['Approval', D.approval_method]].filter(function (x) { return x[1]; });
  var extrasHtml = extras.length ? '<div class="sec">Terms</div>' + extras.map(function (x) { return '<div class="trow"><span class="tl">' + e(x[0]) + '</span><span class="tv">' + e(x[1]) + '</span></div>'; }).join('') : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0}body{font-family:Georgia,"Times New Roman",serif;color:#1b1b1b}' +
    '.page{padding:26px 34px 34px}' +
    '.top{display:flex;justify-content:space-between;border-bottom:3px solid #13294b;padding-bottom:14px}' +
    '.logo{width:220px;height:auto}.contact{text-align:right;font-size:12.5px;line-height:1.5;color:#333}' +
    '.eyebrow{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:3px;font-size:12px;color:#b98d1a;margin-top:20px}' +
    'h1{font-family:Arial,Helvetica,sans-serif;font-size:28px;color:#0d1b30;margin:3px 0 6px}.subline{font-size:14px;color:#444}' +
    '.sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-size:12.5px;color:#0d1b30;border-bottom:1.5px solid #0d1b30;padding-bottom:4px;margin:20px 0 10px}' +
    '.body{font-size:14.5px;line-height:1.55;margin:0 0 9px}table{width:100%;border-collapse:collapse}' +
    '.scope td,.price td{padding:8px 6px;border-bottom:1px solid #e4e4e4;font-size:14px;vertical-align:top}' +
    '.scope .area{font-family:Arial,Helvetica,sans-serif;font-weight:700;width:33%;color:#0d1b30}' +
    '.price th{font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;font-size:11px;color:#666;text-align:left;padding:5px 6px;border-bottom:1.5px solid #0d1b30}' +
    '.price td.r,.price th.r{text-align:right}.price tfoot td{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:14.5px;border-top:2px solid #0d1b30;border-bottom:0;color:#0d1b30}' +
    '.muted{color:#888}' +
    '.chips{margin-top:10px}.chip{display:inline-block;border:2px solid #13294b;border-radius:10px;padding:8px 16px;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px;color:#0d1b30;margin-right:10px}.chip small{display:block;color:#b98d1a;font-weight:700;font-size:10px;letter-spacing:.06em;text-transform:uppercase}' +
    '.term{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px;color:#0d1b30;border:1.5px solid #b98d1a;border-radius:9px;padding:8px 14px;display:inline-block;margin-bottom:8px}' +
    '.trow{display:flex;font-size:13.5px;line-height:1.5;margin:5px 0}.tl{font-family:Arial,Helvetica,sans-serif;font-weight:700;min-width:165px;color:#0d1b30;padding-right:10px}.tv{flex:1}' +
    '.approve{font-size:15px;margin:8px 0}.box{font-size:16px;margin-right:8px}' +
    '.sign{font-size:14px;margin-top:12px;display:flex}.sign .lbl{font-family:Arial,Helvetica,sans-serif;font-weight:bold;padding-right:8px}.sign .u{flex:1;border-bottom:1px solid #666}' +
    '.foot{margin-top:22px;border-top:1px solid #e4e4e4;padding-top:10px;text-align:center;color:#888;font-size:11px;font-family:Arial,Helvetica,sans-serif}' +
    '.sec{page-break-after:avoid}table,tr,.chips,.trow,.sign,.term,.top{page-break-inside:avoid}' +
    '</style></head><body><div class="page">' +
    '<div class="top"><img class="logo" src="' + LOGO + '"><div class="contact">TaylorMade Brands<br>1346 Tallapoosa Street<br>Notasulga, AL 36866<br>334.391.6641<br>josh@taylormadegrowth.com</div></div>' +
    '<div class="eyebrow">' + e(docType) + '</div><h1>' + e(p.title || 'Growth Partnership Proposal') + '</h1>' +
    '<div class="subline">Prepared for <b>' + e(client.business_name || 'your business') + '</b> · ' + e(dateStr) + (D.prepared_by ? ' · by ' + e(D.prepared_by) : '') + '</div>' +
    (p.summary ? '<div class="sec">Proposal Summary</div><p class="body">' + e(p.summary) + '</p>' : '') +
    '<div class="sec">Scope of Work</div><table class="scope"><tbody>' + scopeRows + '</tbody></table>' +
    '<div class="sec">Investment</div><table class="price"><thead><tr><th>Item</th><th class="r">Monthly</th><th class="r">One-time</th></tr></thead><tbody>' + priceRows + '</tbody><tfoot><tr><td>Total</td><td class="r">' + money_(m) + '/mo</td><td class="r">' + money_(o) + '</td></tr></tfoot></table>' +
    '<div class="chips"><span class="chip"><small>Initial build</small>' + money_(o) + '</span><span class="chip"><small>Monthly</small>' + money_(m) + '</span></div>' +
    (D.third_party_costs ? '<p class="body"><b>Third-party costs:</b> ' + e(D.third_party_costs) + '</p>' : '') +
    '<div class="sec">Partnership</div><div class="term">Agreement: ' + e(term) + '</div>' + (D.partnership_terms ? '<p class="body">' + e(D.partnership_terms) + '</p>' : '') +
    extrasHtml +
    '<div class="sec">Approve / Decline</div><div class="approve"><span class="box">&#9744;</span>Approve / Proceed &nbsp;&nbsp;&nbsp;&nbsp;<span class="box">&#9744;</span>Decline</div>' +
    '<div class="sign"><span class="lbl">Name:</span><span class="u"></span></div>' +
    '<div class="sign"><span class="lbl">Signature:</span><span class="u"></span></div>' +
    '<div class="sign"><span class="lbl">Date:</span><span class="u"></span></div>' +
    '<div class="foot">TaylorMade Brands · taylormadegrowth.com · Let’s grow something great together.</div>' +
    '</div></body></html>';
}

function invoiceHtml_(inv, client) {
  var LOGO = 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  var cityState = [client.city, client.state].filter(Boolean).join(', ');
  function detail(label, value) {
    return '<div class="drow"><span class="dl">' + esc_(label) + '</span><span class="dv">' + esc_(value || '—') + '</span></div>';
  }
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0}body{font-family:Georgia,"Times New Roman",serif;color:#1c1c1c}' +
    '.frame{border:2px solid #dcdcdc;padding:20px 30px 22px;margin:12px}' +
    '.top{display:flex;justify-content:space-between}' +
    '.logo{width:238px;height:auto}' +
    '.contact{text-align:right;font-size:12.5px;line-height:1.5;color:#2a2a2a}' +
    '.title{text-align:center;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:27px;letter-spacing:3px;margin:6px 0 14px;color:#111}' +
    '.sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:12px;letter-spacing:1.2px;color:#111;border-bottom:1.5px solid #111;padding-bottom:3px;margin:14px 0 8px}' +
    '.cols{display:flex;justify-content:space-between}' +
    '.col{font-size:13.5px;line-height:1.6}.col.right{text-align:right}' +
    '.billname{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px}' +
    '.drow{margin:1px 0}.dl{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:12px;padding-right:8px}' +
    'table{width:100%;border-collapse:collapse;margin:16px 0}' +
    'th,td{padding:9px 4px;border-bottom:1px solid #e0e0e0;font-size:13.5px}' +
    'th{text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.04em;color:#555}' +
    'th.r,td.r{text-align:right}' +
    'tfoot td{font-weight:800;font-family:Arial,Helvetica,sans-serif;border-top:2px solid #111;border-bottom:0;font-size:15px}' +
    '.pay{font-size:13px;color:#444}.foot{margin-top:20px;text-align:center;color:#888;font-size:11px;font-family:Arial}' +
    '</style></head><body><div class="frame">' +
    '<div class="top"><img class="logo" src="' + LOGO + '"><div class="contact">1346 Tallapoosa Street<br>Notasulga, AL 36866<br>334.391.6641<br>josh@taylormadegrowth.com</div></div>' +
    '<div class="title">INVOICE</div>' +
    '<div class="cols">' +
      '<div class="col"><div class="sec" style="margin-top:0">BILL TO</div>' +
        '<div class="billname">' + esc_(client.business_name || '') + '</div>' +
        (client.contact_name ? esc_(client.contact_name) + '<br>' : '') + esc_(cityState) + '</div>' +
      '<div class="col right"><div class="sec" style="margin-top:0">DETAILS</div>' +
        detail('Invoice #', inv.number) + detail('Issued', inv.issued_on) + detail('Due', inv.due_on) + '</div>' +
    '</div>' +
    '<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>' +
    '<tbody><tr><td>' + esc_(inv.description || titleCase_(inv.type || 'Service')) + '</td><td class="r">' + money_(inv.amount) + '</td></tr></tbody>' +
    '<tfoot><tr><td>Total due</td><td class="r">' + money_(inv.amount) + '</td></tr></tfoot></table>' +
    (inv.method ? '<div class="pay">Payment method: ' + esc_(inv.method) + '</div>' : '') +
    '<div class="foot">Thank you for your business.  TaylorMade Brands · taylormadegrowth.com</div>' +
    '</div></body></html>';
}

function header_(right) {
  return '<div class="head"><div class="brand">TaylorMade <span>Brands</span></div>' +
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
