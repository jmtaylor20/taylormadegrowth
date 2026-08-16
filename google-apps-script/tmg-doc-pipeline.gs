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
  // ---- Auto monthly invoicing (off by default — flip on when you want it) ----
  AUTO_MONTHLY_INVOICES: false,  // set true to auto-generate monthly retainer invoices
  BILLING_DAYS_FROM_END: 6,      // generate in the last week: fires when <= this many days remain in the month
  INVOICE_NET_DAYS: 15,          // due this many days after issue
  AUTO_SEND_MONTHLY: false,      // false = save as DRAFTS and email you a review prompt; true = also email clients
  NOTIFY_EMAIL: 'josh@taylormadegrowth.com',  // where the "drafts ready to review" prompt is sent
  // ---- Contractor apps (separate databases) ----------------------------------
  // Each contractor runs their own isolated Supabase project. Proposals they
  // create are only emailed AFTER you approve them in your app's Approvals tab
  // (which sets approval_status='approved' and queues the send). This script
  // then emails those from YOUR Gmail, exactly like your own proposals.
  CONTRACTOR_SOURCES: [
    { name: 'Tony', url: 'https://obweziktfdhdswtwzzmh.supabase.co', key: 'sb_publishable_JTKaZ1V3rU0nUiCk6OgVeQ_BaRJ2weB' },
  ],
};

// The Supabase project the DB helpers currently point at. Defaults to your own
// project; processContractorProposals_ swaps it per contractor and restores it.
var ACTIVE = { url: CONFIG.SUPABASE_URL, key: CONFIG.SUPABASE_KEY };

// ==== ENTRY POINTS =========================================================

/** Main worker — runs on the trigger. Safe to run manually anytime. */
function processQueue() {
  generateMonthlyInvoices_();
  processTable_('proposals');
  processTable_('invoices');
  processTable_('reports');
  processWelcome_();
  processContractorProposals_();
}

// Email contractors' APPROVED proposals from your Gmail. A proposal is only
// ever sent once you've approved it in the app (approval_status='approved')
// AND it's been queued (send_status='queued'). Reuses the same PDF + email
// path as your own proposals, pointed at each contractor's own database.
function processContractorProposals_() {
  var sources = CONFIG.CONTRACTOR_SOURCES || [];
  for (var s = 0; s < sources.length; s++) {
    var src = sources[s];
    ACTIVE = { url: src.url, key: src.key };
    try {
      var rows = sbGet_('proposals?approval_status=eq.approved&or=(send_status.eq.queued,drive_status.eq.queued)&select=*');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        try {
          processRow_('proposals', row);
        } catch (err) {
          var f = (row.send_status === 'queued') ? 'send' : 'drive';
          var patch = {};
          patch[f + '_status'] = 'error';
          patch[f + '_error'] = String(err).slice(0, 400);
          sbPatch_('proposals', row.id, patch);
          Logger.log('Contractor(' + src.name + ') proposal ' + row.id + ' error: ' + err);
        }
      }
    } catch (err2) {
      Logger.log('Contractor source ' + src.name + ' failed: ' + err2);
    } finally {
      ACTIVE = { url: CONFIG.SUPABASE_URL, key: CONFIG.SUPABASE_KEY };
    }
  }
}

// ==== AUTO MONTHLY INVOICES ================================================
// Fires only in the last week of the month (when <= BILLING_DAYS_FROM_END days
// remain), creating this month's retainer invoice for each active client with
// an MRR. Deduped by (client, month) so repeated runs never double-bill. With
// AUTO_SEND_MONTHLY off (the default) it saves DRAFTS and emails you a review
// prompt — nothing goes to a client until you send it from the app.
function generateMonthlyInvoices_() {
  if (!CONFIG.AUTO_MONTHLY_INVOICES) return;
  var now = new Date();
  var tz = Session.getScriptTimeZone();
  var dom = Number(Utilities.formatDate(now, tz, 'd'));
  var lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if ((lastDay - dom) > CONFIG.BILLING_DAYS_FROM_END) return;   // only the last week of the month
  var monthStart = Utilities.formatDate(now, tz, 'yyyy-MM') + '-01';
  var clients = sbGet_('clients?stage=eq.client&mrr=gt.0&select=id,business_name,email,mrr,billing_mode,recurring_addons');
  if (!clients.length) return;
  var billed = {};
  sbGet_('invoices?type=eq.monthly&issued_on=gte.' + monthStart + '&select=client_id').forEach(function (i) { billed[i.client_id] = true; });
  var nums = sbGet_('invoices?select=number');
  var maxNum = 0;
  nums.forEach(function (i) { var m = /(\d+)/.exec(i.number || ''); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
  var monthName = Utilities.formatDate(now, tz, 'MMMM yyyy');
  var nextMonthName = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 1), tz, 'MMMM yyyy');
  var issued = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var dueDate = new Date(now.getTime()); dueDate.setDate(dueDate.getDate() + CONFIG.INVOICE_NET_DAYS);
  var due = Utilities.formatDate(dueDate, tz, 'yyyy-MM-dd');
  var created = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    if (billed[c.id]) continue;
    maxNum++;
    // Advance clients (default) are billed for next month; arrears for the current month.
    var periodName = (c.billing_mode === 'arrears') ? monthName : nextMonthName;
    var label = periodName + ' — Monthly management';
    var num = 'INV-' + ('000' + maxNum).slice(-4);
    var items = [{ label: label, amount: Number(c.mrr) }];
    var addons = (c.recurring_addons && c.recurring_addons.length) ? c.recurring_addons : [];
    for (var a = 0; a < addons.length; a++) items.push({ label: addons[a].label, amount: Number(addons[a].amount || 0) });
    var total = items.reduce(function (s, it) { return s + Number(it.amount || 0); }, 0);
    var row = {
      client_id: c.id, number: num, type: 'monthly',
      amount: total, status: CONFIG.AUTO_SEND_MONTHLY ? 'sent' : 'draft', method: 'Relay',
      issued_on: issued, due_on: due, description: items.map(function (it) { return it.label; }).join(', '), items: items,
    };
    if (CONFIG.AUTO_SEND_MONTHLY && c.email) { row.send_status = 'queued'; row.sent_to = c.email; row.drive_status = 'queued'; }
    try { sbInsert_('invoices', row); created.push({ name: c.business_name, num: num, amount: Number(c.mrr) }); }
    catch (err) { Logger.log('Invoice create failed for ' + c.business_name + ': ' + err); }
  }
  if (created.length && !CONFIG.AUTO_SEND_MONTHLY && CONFIG.NOTIFY_EMAIL) notifyDraftInvoices_(created, monthName, due);
}

// Email Josh a summary of the drafts that were just generated, so he's
// prompted to review + send them from the app.
function notifyDraftInvoices_(created, monthName, due) {
  var total = 0;
  var lines = created.map(function (x) { total += x.amount; return x.num + '   ' + x.name + '   ' + money_(x.amount); });
  var body = 'You have ' + created.length + ' draft invoice(s) ready to review for ' + monthName + ' (due ' + due + ').\n\n' +
    lines.join('\n') + '\n\nTotal: ' + money_(total) + '\n\n' +
    'Open the app → Financials to review, add any extras a client asked for, then send them. Nothing has been emailed to clients yet.';
  try {
    GmailApp.sendEmail(CONFIG.NOTIFY_EMAIL, created.length + ' draft invoice(s) to review — ' + monthName, body, { name: CONFIG.FROM_NAME });
  } catch (err) { Logger.log('Notify failed: ' + err); }
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
  var type = table === 'proposals' ? 'proposal' : (table === 'reports' ? 'report' : 'invoice');
  var docLabel = type === 'proposal' ? titleCase_(row.doc_type || 'proposal') : (type === 'report' ? 'Report' : 'Invoice');
  var stamp = type === 'report' ? (row.period || dateStamp_()) : dateStamp_();
  var fileName = [client.business_name || 'Client', docLabel, stamp].join(' - ') + (type === 'invoice' && row.number ? ' ' + row.number : '') + '.pdf';

  var html = type === 'proposal' ? proposalHtml_(row, client) : (type === 'report' ? reportHtml_(row, client) : invoiceHtml_(row, client));
  var pdf = Utilities.newBlob(html, 'text/html', fileName).getAs('application/pdf').setName(fileName);

  var patch = {};

  // ---- Save to Drive (needed for the archive AND to attach when emailing) ----
  var needDrive = row.drive_status === 'queued' || row.send_status === 'queued';
  if (needDrive && row.drive_status !== 'saved') {
    var folder = targetFolder_(client.business_name);
    var file = folder.createFile(pdf);
    patch.drive_status = 'saved';
    patch.drive_url = file.getUrl();
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
      var subject;
      if (type === 'proposal') subject = 'Your ' + docLabel + ' from ' + CONFIG.BUSINESS_NAME + (row.title ? ' — ' + row.title : '');
      else if (type === 'report') subject = 'Your ' + (row.period ? row.period + ' ' : '') + 'growth report from ' + CONFIG.BUSINESS_NAME;
      else subject = ('Invoice ' + (row.number || '') + ' from ' + CONFIG.BUSINESS_NAME).trim();
      GmailApp.sendEmail(to, subject, emailPlain_(type, row, client), {
        name: CONFIG.FROM_NAME,
        replyTo: CONFIG.REPLY_TO,
        htmlBody: emailHtml_(type, row, client),
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

// ==== WELCOME EMAILS =======================================================

function processWelcome_() {
  var rows = sbGet_('clients?welcome_status=eq.queued&select=id,business_name,contact_name,email,welcome_to');
  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    try {
      var to = c.welcome_to || c.email;
      if (!to) { sbPatch_('clients', c.id, { welcome_status: 'error', welcome_error: 'No email' }); continue; }
      GmailApp.sendEmail(to, 'Welcome to the TaylorMade family', welcomePlain_(c), {
        name: CONFIG.FROM_NAME, replyTo: CONFIG.REPLY_TO, htmlBody: welcomeHtml_(c),
      });
      sbPatch_('clients', c.id, { welcome_status: 'sent', welcome_sent_at: nowIso_(), welcome_to: to, welcome_error: null });
    } catch (err) {
      sbPatch_('clients', c.id, { welcome_status: 'error', welcome_error: String(err).slice(0, 400) });
      Logger.log('Welcome error ' + c.id + ': ' + err);
    }
  }
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
  return { apikey: ACTIVE.key, Authorization: 'Bearer ' + ACTIVE.key };
}
function sbGet_(path) {
  var res = UrlFetchApp.fetch(ACTIVE.url + '/rest/v1/' + path, {
    method: 'get', headers: authHeaders_(), muteHttpExceptions: true,
  });
  var body = res.getContentText();
  if (res.getResponseCode() >= 300) throw new Error('GET ' + path + ' -> ' + res.getResponseCode() + ' ' + body);
  return JSON.parse(body || '[]');
}
function sbInsert_(table, row) {
  var res = UrlFetchApp.fetch(ACTIVE.url + '/rest/v1/' + table, {
    method: 'post',
    headers: Object.assign(authHeaders_(), { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    payload: JSON.stringify(row), muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) throw new Error('POST ' + table + ' -> ' + res.getResponseCode() + ' ' + res.getContentText());
}
function sbPatch_(table, id, patch) {
  var res = UrlFetchApp.fetch(ACTIVE.url + '/rest/v1/' + table + '?id=eq.' + id, {
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
  var items = (inv.items && inv.items.length) ? inv.items : [{ label: inv.description || titleCase_(inv.type || 'Service'), amount: inv.amount }];
  var total = items.reduce(function (s, it) { return s + Number(it.amount || 0); }, 0) || Number(inv.amount || 0);
  var itemRows = items.map(function (it) { return '<tr><td>' + esc_(it.label || '') + '</td><td class="r">' + money_(Number(it.amount || 0)) + '</td></tr>'; }).join('');
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
    '<tbody>' + itemRows + '</tbody>' +
    '<tfoot><tr><td>Total due</td><td class="r">' + money_(total) + '</td></tr></tfoot></table>' +
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

function emailPlain_(type, row, client) {
  var hi = 'Hi ' + (client.contact_name || '') + ',\n\n';
  var sign = '\n\nThanks,\n' + CONFIG.FROM_NAME + '\n' + CONFIG.WEBSITE;
  if (type === 'proposal') {
    return hi + (row.summary || 'Here is the ' + (row.doc_type || 'proposal') + ' we put together for you.') +
      '\n\nThe full details are in the attached PDF. Ready to move forward? Just reply and we’ll get you set up.' + sign;
  }
  if (type === 'report') {
    return hi + 'Here’s your ' + (row.period ? row.period + ' ' : '') + 'growth report — a snapshot of your marketing this month is attached.' +
      (row.highlights ? '\n\n' + row.highlights : '') + sign;
  }
  return hi + 'Please find your invoice' + (row.number ? ' ' + row.number : '') + ' attached' +
    (row.due_on ? ', due ' + row.due_on : '') + '. The amount due is ' + money_(row.amount) + '.\n\nThanks for your business,\n' + CONFIG.FROM_NAME + '\n' + CONFIG.WEBSITE;
}
function emailHtml_(type, row, client) {
  var body;
  if (type === 'proposal') {
    body = '<p>' + esc_(row.summary || 'Here is the ' + (row.doc_type || 'proposal') + ' we put together for you.') +
      '</p><p>The full details are in the attached PDF. Ready to move forward? Just reply and we’ll get you set up.</p>';
  } else if (type === 'report') {
    body = '<p>Here’s your ' + (row.period ? esc_(row.period) + ' ' : '') + 'growth report — a snapshot of your marketing this month is attached.</p>' +
      (row.highlights ? '<p>' + esc_(row.highlights) + '</p>' : '');
  } else {
    body = '<p>Please find your invoice' + (row.number ? ' ' + esc_(row.number) : '') + ' attached' +
      (row.due_on ? ', due ' + esc_(row.due_on) : '') + '. The amount due is <b>' + money_(row.amount) + '</b>.</p>';
  }
  return '<div style="font-family:Arial,sans-serif;color:#101827;line-height:1.55">' +
    '<p>Hi ' + esc_(client.contact_name || '') + ',</p>' + body +
    '<p style="margin-top:18px">Thanks,<br><b>' + esc_(CONFIG.FROM_NAME) + '</b><br>' +
    '<a href="https://' + esc_(CONFIG.WEBSITE) + '">' + esc_(CONFIG.WEBSITE) + '</a></p></div>';
}

// ==== REPORT PDF ===========================================================

var REPORT_METRICS_ = [
  { key: 'impressions', label: 'Impressions' }, { key: 'reach', label: 'Reach' },
  { key: 'engagements', label: 'Engagements' }, { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'Click-through rate', suffix: '%' }, { key: 'sessions', label: 'Website visits' },
  { key: 'calls', label: 'Phone calls' }, { key: 'forms', label: 'Form submissions' },
  { key: 'conversions', label: 'Conversions / leads' }, { key: 'reviews', label: 'New reviews' },
  { key: 'ad_spend', label: 'Ad spend', prefix: '$' }, { key: 'cost_per_lead', label: 'Cost per lead', prefix: '$' },
  { key: 'hours', label: 'Hours worked', suffix: 'h' }, { key: 'miles', label: 'Miles driven', suffix: ' mi' },
];
var REPORT_HEAD_ = ['conversions', 'clicks', 'impressions', 'ctr', 'calls', 'forms', 'reach', 'sessions'];
function reportFmt_(v, m) {
  return (m.prefix || '') + Number(v).toLocaleString('en-US', { maximumFractionDigits: (m.key === 'ctr' || m.key === 'hours') ? 1 : 0 }) + (m.suffix || '');
}
function reportHtml_(r, client) {
  var LOGO = 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  var metrics = r.metrics || {};
  var byKey = {};
  for (var j = 0; j < REPORT_METRICS_.length; j++) byKey[REPORT_METRICS_[j].key] = REPORT_METRICS_[j];
  var has = function (k) { return metrics[k] != null && metrics[k] !== ''; };
  // Headline KPIs (up to 4).
  var head = '', count = 0;
  for (var h = 0; h < REPORT_HEAD_.length && count < 4; h++) {
    var hk = REPORT_HEAD_[h]; if (!has(hk)) continue; count++;
    head += '<div class="kpi"><div class="kv">' + reportFmt_(metrics[hk], byKey[hk]) + '</div><div class="kl">' + esc_(byKey[hk].label) + '</div></div>';
  }
  if (!head) head = '<div class="muted">Add this month’s metrics to populate the report.</div>';
  // Full grid (skip internal-only metrics).
  var tiles = '';
  for (var i = 0; i < REPORT_METRICS_.length; i++) {
    var m = REPORT_METRICS_[i]; if (m.key === 'hours' || m.key === 'miles' || !has(m.key)) continue;
    tiles += '<div class="tile"><div class="tv">' + reportFmt_(metrics[m.key], m) + '</div><div class="tl">' + esc_(m.label) + '</div></div>';
  }
  if (!tiles) tiles = '<div class="muted">No metrics entered yet.</div>';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
    'html,body{margin:0}body{font-family:Georgia,"Times New Roman",serif;color:#1b1b1b}' +
    '.page{padding:26px 34px 34px}.p2{page-break-before:always}' +
    '.top{display:flex;justify-content:space-between;border-bottom:3px solid #13294b;padding-bottom:14px}' +
    '.logo{width:220px;height:auto}.contact{text-align:right;font-size:12.5px;line-height:1.5;color:#333}' +
    '.eyebrow{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:3px;font-size:12px;color:#b98d1a;margin-top:20px}' +
    'h1{font-family:Arial,Helvetica,sans-serif;font-size:30px;color:#0d1b30;margin:3px 0 6px}.subline{font-size:14px;color:#444}' +
    '.sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-size:12.5px;color:#0d1b30;border-bottom:1.5px solid #0d1b30;padding-bottom:4px;margin:22px 0 12px;page-break-after:avoid}' +
    '.body{font-size:14.5px;line-height:1.6;margin:0 0 9px}' +
    '.kpis{display:flex;gap:14px;margin-top:6px}' +
    '.kpi{flex:1;border:2px solid #13294b;border-radius:14px;padding:18px 12px;text-align:center;page-break-inside:avoid}' +
    '.kpi .kv{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:28px;color:#0d1b30;line-height:1}' +
    '.kpi .kl{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#b98d1a;font-family:Arial,Helvetica,sans-serif;font-weight:700;margin-top:8px}' +
    '.grid{display:flex;flex-wrap:wrap;gap:12px}' +
    '.tile{border:1.5px solid #d8dbe2;border-radius:12px;padding:12px 15px;min-width:150px;page-break-inside:avoid}' +
    '.tile .tv{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:23px;color:#0d1b30}' +
    '.tile .tl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#666;font-family:Arial,Helvetica,sans-serif;margin-top:3px}' +
    '.muted{color:#888}' +
    '.cta{border:2px solid #b98d1a;border-radius:14px;padding:16px 18px;margin-top:22px;page-break-inside:avoid}.cta .h{font-family:Arial,Helvetica,sans-serif;font-weight:800;color:#0d1b30;font-size:14px;margin-bottom:4px}' +
    '.foot{margin-top:24px;border-top:1px solid #e4e4e4;padding-top:10px;text-align:center;color:#888;font-size:11px;font-family:Arial,Helvetica,sans-serif}' +
    '</style></head><body>' +
    '<div class="page">' +
    '<div class="top"><img class="logo" src="' + LOGO + '"><div class="contact">TaylorMade Brands<br>334.391.6641<br>josh@taylormadegrowth.com</div></div>' +
    '<div class="eyebrow">MONTHLY GROWTH REPORT</div><h1>' + esc_(client.business_name || 'Your business') + '</h1>' +
    '<div class="subline">' + esc_(r.period || '') + '</div>' +
    '<div class="sec">Executive Summary</div><p class="body">' + esc_(r.highlights || 'Here’s a snapshot of your marketing performance this month, the results it drove, and where we’re focused next.') + '</p>' +
    '<div class="sec">Performance at a Glance</div><div class="kpis">' + head + '</div>' +
    '</div>' +
    '<div class="page p2">' +
    '<div class="sec">The Numbers</div><div class="grid">' + tiles + '</div>' +
    (r.notes ? '<div class="sec">What We Focused On</div><p class="body">' + esc_(r.notes) + '</p>' : '') +
    (r.next_steps ? '<div class="sec">What’s Next</div><p class="body">' + esc_(r.next_steps) + '</p>' : '') +
    '<div class="cta"><div class="h">Let’s keep the momentum going.</div><div class="body" style="margin:0">Questions about anything in this report, or want to talk about scaling what’s working? Just reply to this email or give us a call.</div></div>' +
    '<div class="foot">TaylorMade Brands · taylormadegrowth.com · Growing your business, together.</div>' +
    '</div></body></html>';
}

// ==== WELCOME EMAIL ========================================================

function welcomePlain_(c) {
  return 'Hi ' + (c.contact_name || '') + ',\n\nWelcome to the TaylorMade family! We’re thrilled to partner with ' +
    (c.business_name || 'you') + '. Our whole focus now is helping your business grow — and you’ll start seeing us get to work right away.\n\n' +
    'We’ll be in touch shortly with your onboarding steps. In the meantime, just reply here if you have any questions.\n\n' +
    'Here’s to growing something great together,\n' + CONFIG.FROM_NAME + '\n' + CONFIG.WEBSITE;
}
function welcomeHtml_(c) {
  var BANNER = 'https://taylormadegrowth.com/app/assets/img/welcome-banner.png';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#101827;line-height:1.6;max-width:600px">' +
    '<img src="' + BANNER + '" alt="TaylorMade Brands" style="width:100%;border-radius:14px;display:block">' +
    '<h1 style="font-size:26px;color:#0d1b30;margin:22px 0 6px">Welcome to the TaylorMade family!</h1>' +
    '<p>Hi ' + esc_(c.contact_name || '') + ',</p>' +
    '<p>We’re thrilled to partner with <b>' + esc_(c.business_name || 'you') + '</b>. Our whole focus now is helping your business grow — and you’ll start seeing us get to work right away.</p>' +
    '<p>We’ll follow up shortly with your onboarding steps. In the meantime, just reply here with anything at all.</p>' +
    '<p style="margin-top:18px">Here’s to growing something great together,<br><b>' + esc_(CONFIG.FROM_NAME) + '</b><br>' +
    '<a href="https://' + esc_(CONFIG.WEBSITE) + '" style="color:#13294b">' + esc_(CONFIG.WEBSITE) + '</a></p></div>';
}

// ==== HELPERS ==============================================================

function sum_(items, key) { return (items || []).reduce(function (s, x) { return s + Number(x[key] || 0); }, 0); }
function money_(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function titleCase_(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function nowIso_() { return new Date().toISOString(); }
function dateStamp_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function dateNice_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy'); }
