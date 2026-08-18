/**
 * Wolf Creek Farms — outbound email sender (Google Apps Script).
 *
 * Runs inside russ@wolfcreeklands.com. Every few minutes it checks Supabase for
 * jobs the app has queued, and sends Wolf Creek-branded HTML emails FROM Russ's
 * Gmail:
 *   • Estimate  — when Russ quotes a job        (estimate_email_status = 'queued')
 *   • Invoice   — when a job is marked complete (invoice_email_status  = 'queued')
 *   • Receipt   — when a job is paid in full    (thankyou_email_status = 'queued')
 * Then it marks them 'sent' so they never double-send.
 *
 * SETUP (once):
 *   1. Sign in to script.google.com AS russ@wolfcreeklands.com.
 *   2. New project → paste this file → Save.
 *   3. Check REVIEW_URL below (swap in the real g.page review link).
 *   4. Run `installTrigger` → approve the Gmail + external-request prompts.
 *      ("Google hasn't verified this app" is expected — it's your own script.
 *       Advanced → Go to project.)
 */

// ---- CONFIG ----------------------------------------------------------------
var SUPABASE_URL = 'https://qbevslgvvkftdacsxmpl.supabase.co';
var SUPABASE_KEY = 'sb_publishable_avmIAUt-NRmBX56UjsMslw_nNz2o16Q';

// Logo shown at the top of every email. Update the host if the app moves.
var LOGO_URL = 'https://wolf-creek-app.netlify.app/assets/img/logo-mark.png';
// Google review link used in the thank-you email. Replace with the short
// "g.page/r/..." link from Wolf Creek's Google Business Profile when you have it.
var REVIEW_URL = 'https://www.google.com/search?q=Wolf+Creek+Farms+Notasulga+AL';
var COMPANY_NAME = 'Wolf Creek Farms';
var COMPANY_PHONE = '334-207-3331';
var COMPANY_EMAIL = 'russ@wolfcreeklands.com';
var COMPANY_WEBSITE = 'wolfcreeklands.com';
var COMPANY_ADDRESS = '3914 County Road 54 West, Notasulga, AL 36866';
var FROM_NAME = 'Wolf Creek Farms';
var REMIT_ADDRESS = '3914 County Road 54 West, Notasulga, AL 36866';  // shown on invoices
var CC_EMAIL = 'russ@wolfcreeklands.com';   // CC every estimate + invoice here (a copy lands in the inbox)

// How long a quoted price stands — drives "GOOD UNTIL" on the estimate.
var ESTIMATE_VALID_DAYS = 30;
// ---------------------------------------------------------------------------

// Palette matches wolfcreeklands.com (hunter greens + sage accent).
var GREEN = '#18382b', BORDER = '#c9d2c9';

function sendQueuedEmails() {
  sendEstimates_();
  sendInvoices_();
  sendThankYous_();
}

function sendInvoices_() {
  var jobs = sbGet_('invoice_email_status=eq.queued&email=not.is.null');
  jobs.forEach(function (j) {
    try {
      GmailApp.sendEmail(j.email, 'Your invoice from Wolf Creek Farms', invoicePlain_(j),
        { htmlBody: invoiceHtml_(j), name: FROM_NAME, cc: CC_EMAIL });
      sbPatch_(j.id, { invoice_email_status: 'sent' });
    } catch (e) { sbPatch_(j.id, { invoice_email_status: 'error' }); }
  });
}

function sendEstimates_() {
  var jobs = sbGet_('estimate_email_status=eq.queued&email=not.is.null');
  jobs.forEach(function (j) {
    try {
      GmailApp.sendEmail(j.email, 'Your estimate from Wolf Creek Farms', estimatePlain_(j),
        { htmlBody: estimateHtml_(j), name: FROM_NAME, cc: CC_EMAIL });
      sbPatch_(j.id, { estimate_email_status: 'sent' });
    } catch (e) { sbPatch_(j.id, { estimate_email_status: 'error' }); }
  });
}

function sendThankYous_() {
  var jobs = sbGet_('thankyou_email_status=eq.queued&email=not.is.null');
  jobs.forEach(function (j) {
    try {
      GmailApp.sendEmail(j.email, 'Your receipt from Wolf Creek Farms — paid in full', thankYouPlain_(j),
        { htmlBody: thankYouHtml_(j), name: FROM_NAME });
      sbPatch_(j.id, { thankyou_email_status: 'sent' });
    } catch (e) { sbPatch_(j.id, { thankyou_email_status: 'error' }); }
  });
}

// ---- Templates -------------------------------------------------------------
// Laid out to match Wolf Creek's printed estimate form: big wordmark and logo up
// top, a green meta bar, boxed customer fields, a scope block, a line-item table,
// and a stacked totals column with TOTAL DUE called out.
//
// Built as nested tables with inline styles because that is the only layout that
// survives Gmail, Apple Mail, and Outlook alike — no flexbox, no grid, no SVG.
// The paper form's watermark is left off for the same reason.

function money_(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy'); }
function fmtDay_(iso) { return iso ? Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'MMMM d, yyyy') : today_(); }
// When the job was completed — falls back to the scheduled work date for older jobs.
function completedOn_(j) { return j.completed_at || (j.scheduled_date ? j.scheduled_date + 'T00:00:00' : null); }

// Document number: stable, short, and derived from the job id so it never collides
// and never needs a counter. "WCF-1A2B3C4D".
function docNum_(j) { return 'WCF-' + String(j.id || '').replace(/-/g, '').slice(0, 8).toUpperCase(); }

// How long an estimate stands. Counted from today, since that's when it is sent.
function goodUntil_() {
  var d = new Date();
  d.setDate(d.getDate() + ESTIMATE_VALID_DAYS);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMMM d, yyyy');
}

// Proper-case a name by rule (matches the app): "john o'brien" -> "John O'Brien".
function properName_(s) {
  if (s == null) return s;
  function cap(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }
  return String(s).trim().replace(/\s+/g, ' ').split(' ').map(function (word) {
    var r = word.split(/([-'])/).map(function (p) { return (p === '-' || p === "'") ? p : cap(p); }).join('');
    return r.replace(/^Mc([a-z])/, function (m, c) { return 'Mc' + c.toUpperCase(); });
  }).join(' ');
}
var ADDR_UPPER_ = { N: 1, S: 1, E: 1, W: 1, NE: 1, NW: 1, SE: 1, SW: 1, US: 1, PO: 1, AL: 1, GA: 1, FL: 1, TN: 1, MS: 1, SR: 1, FM: 1, CR: 1, RR: 1 };
function properAddress_(s) {
  if (s == null) return s;
  function cap(w) { return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; }
  return String(s).trim().replace(/\s+/g, ' ').split(' ').map(function (w) {
    var bare = w.replace(/[.,]/g, '').toUpperCase();
    if (ADDR_UPPER_[bare]) return w.toUpperCase();
    if (/\d/.test(w)) return w.toLowerCase();
    return w.split(/([-'.])/).map(function (p) { return (p === '-' || p === "'" || p === '.') ? p : cap(p); }).join('');
  }).join(' ');
}

function scopeBullets_(job) {
  var text = job.scope_notes || (job.services || []).join(', ') || 'Work as discussed.';
  return text.split(/[\n;]+/).map(function (p) { return p.trim(); }).filter(Boolean);
}
// "Shorter, AL 36075" — comma after the city only, the way an address is written.
function cityLine_(j) {
  var cs = [j.city, j.state || 'AL'].filter(Boolean).join(', ');
  return [cs, j.zip].filter(Boolean).join(' ');
}

// ---- Building blocks -------------------------------------------------------

/** Masthead: oversized title on the left, logo on the right, contact block beneath. */
function masthead_(title) {
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="vertical-align:middle;">'
    + '<div style="font-size:44px;line-height:1;font-weight:bold;color:' + GREEN + ';letter-spacing:1px;">' + esc_(title) + '</div>'
    + '</td>'
    + '<td style="text-align:right;vertical-align:middle;width:190px;">'
    + '<img src="' + LOGO_URL + '" alt="' + esc_(COMPANY_NAME) + '" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;">'
    + '</td></tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;font-size:13px;color:#1c2b22;">'
    + '<tr><td style="padding:2px 0;">' + esc_(COMPANY_PHONE) + '</td>'
    + '<td style="padding:2px 0;">' + esc_(COMPANY_WEBSITE) + '</td></tr>'
    + '<tr><td style="padding:2px 0;">' + esc_(COMPANY_EMAIL) + '</td>'
    + '<td style="padding:2px 0;">' + esc_(COMPANY_ADDRESS) + '</td></tr>'
    + '</table>';
}

/** The green meta bar: header cells over value cells. Pass [[label, value], ...]. */
function metaBar_(cells) {
  var head = '', vals = '';
  var w = Math.floor(100 / cells.length);
  cells.forEach(function (c) {
    head += '<td width="' + w + '%" style="padding:8px 10px;background:' + GREEN + ';color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.5px;text-align:center;border-right:1px solid #ffffff;">' + esc_(c[0]) + '</td>';
    vals += '<td width="' + w + '%" style="padding:9px 10px;border:1px solid ' + BORDER + ';border-top:0;font-size:13px;text-align:center;">' + esc_(c[1] || '') + '</td>';
  });
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">'
    + '<tr>' + head + '</tr><tr>' + vals + '</tr></table>';
}

function sectionTitle_(t) {
  return '<div style="font-size:15px;font-weight:bold;color:' + GREEN + ';letter-spacing:.5px;margin:22px 0 8px;">' + esc_(t) + '</div>';
}

/** One boxed field: small caps label above the value, thin border — like the form. */
function fieldBox_(label, value) {
  return '<div style="border:1px solid ' + BORDER + ';padding:7px 10px;min-height:38px;">'
    + '<div style="font-size:10px;font-weight:bold;color:' + GREEN + ';letter-spacing:.5px;">' + esc_(label) + '</div>'
    + '<div style="font-size:14px;margin-top:2px;">' + esc_(value || '—') + '</div></div>';
}

/** Boxed fields, two per row. Pass [[label, value], ...]; odd counts fill the gap. */
function fieldGrid_(pairs) {
  var rows = '';
  for (var i = 0; i < pairs.length; i += 2) {
    var a = pairs[i], b = pairs[i + 1];
    rows += '<tr>'
      + '<td width="49%" style="padding:0 0 8px 0;vertical-align:top;">' + fieldBox_(a[0], a[1]) + '</td>'
      + '<td width="2%"></td>'
      + '<td width="49%" style="padding:0 0 8px 0;vertical-align:top;">' + (b ? fieldBox_(b[0], b[1]) : '') + '</td>'
      + '</tr>';
  }
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>';
}

/** Scope block: one bordered box, one line per bullet. */
function scopeBox_(bullets) {
  var rows = bullets.map(function (b) {
    return '<div style="padding:7px 10px;border-bottom:1px solid ' + BORDER + ';font-size:14px;">' + esc_(b) + '</div>';
  }).join('');
  return '<div style="border:1px solid ' + BORDER + ';">' + (rows || '<div style="padding:7px 10px;">&nbsp;</div>') + '</div>';
}

/** Line-item table: DESCRIPTION | AMOUNT. The app prices a job as a whole rather
 *  than by unit, so the form's QTY and UNIT PRICE columns are left off. */
function itemsTable_(items) {
  var head = '<tr>'
    + '<td style="padding:8px 10px;background:' + GREEN + ';color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.5px;">DESCRIPTION</td>'
    + '<td width="30%" style="padding:8px 10px;background:' + GREEN + ';color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.5px;text-align:right;">AMOUNT</td></tr>';
  var rows = items.map(function (it) {
    return '<tr>'
      + '<td style="padding:11px 10px;border:1px solid ' + BORDER + ';border-top:0;font-size:14px;">' + esc_(it[0]) + '</td>'
      + '<td style="padding:11px 10px;border:1px solid ' + BORDER + ';border-top:0;border-left:0;font-size:14px;text-align:right;font-weight:bold;">' + esc_(it[1]) + '</td></tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + head + rows + '</table>';
}

/** Totals stack, right-aligned. Pass [[label, value], ...]; the last row is the
 *  called-out one (green label cell), matching TOTAL DUE on the printed form. */
function totals_(rows) {
  var body = rows.map(function (r, i) {
    var last = i === rows.length - 1;
    return '<tr>'
      + '<td style="padding:9px 12px;text-align:right;font-size:12px;font-weight:bold;letter-spacing:.5px;'
      + (last ? 'background:' + GREEN + ';color:#ffffff;' : 'color:' + GREEN + ';border:1px solid ' + BORDER + ';border-right:0;') + '">' + esc_(r[0]) + '</td>'
      + '<td width="45%" style="padding:9px 12px;text-align:right;border:1px solid ' + BORDER + ';font-size:' + (last ? '16px' : '14px') + ';font-weight:bold;'
      + (last ? 'color:' + GREEN + ';' : '') + '">' + esc_(r[1]) + '</td></tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;"><tr>'
    + '<td width="45%"></td><td width="55%">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + body + '</table>'
    + '</td></tr></table>';
}

/** The whole page: masthead, body, logo, and the green footer bar. */
function shell_(title, metaCells, inner, footerNote) {
  return '<div style="max-width:660px;margin:0 auto;padding:22px;font-family:Arial,Helvetica,sans-serif;color:#14201a;background:#ffffff;">'
    + masthead_(title)
    + metaBar_(metaCells)
    + inner
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;"><tr>'
    + '<td style="vertical-align:middle;"><img src="' + LOGO_URL + '" alt="' + esc_(COMPANY_NAME) + '" width="150" style="max-width:150px;height:auto;border:0;"></td>'
    + '<td style="text-align:right;vertical-align:middle;font-size:12px;color:#5a665f;">' + esc_(COMPANY_PHONE) + '<br>' + esc_(COMPANY_EMAIL) + '</td>'
    + '</tr></table>'
    + '<div style="background:' + GREEN + ';color:#ffffff;font-style:italic;font-size:13px;text-align:center;padding:12px 16px;margin-top:14px;">' + esc_(footerNote) + '</div>'
    + '</div>';
}

// ---- Documents -------------------------------------------------------------

function estimateHtml_(j) {
  var svc = (j.services || []).join(', ') || 'Land work';
  if (j.acres) svc += ' — ' + j.acres + ' acres';
  var inner =
    sectionTitle_('CUSTOMER INFORMATION')
    + fieldGrid_([
      ['CUSTOMER NAME', properName_(j.customer_name)],
      ['EMAIL', j.email],
      ['JOB ADDRESS', properAddress_(j.address)],
      ['PHONE', j.phone],
      ['CITY, STATE, ZIP', cityLine_(j)],
      ['ESTIMATED START', j.lead_time],
    ])
    + sectionTitle_('SCOPE OF WORK / NOTES')
    + scopeBox_(scopeBullets_(j))
    + sectionTitle_('ESTIMATE DETAILS')
    + itemsTable_([[svc, money_(j.estimate_amount)]])
    + totals_([
      ['SUBTOTAL', money_(j.estimate_amount)],
      ['TOTAL', money_(j.estimate_amount)],
    ])
    + '<div style="margin-top:18px;border:1px solid ' + BORDER + ';padding:12px;font-size:12.5px;line-height:1.5;">'
    + '<div style="font-weight:bold;color:' + GREEN + ';font-size:11px;letter-spacing:.5px;">TERMS</div>'
    + '<div style="margin-top:5px;">This estimate is based on the site as we found it and is good until ' + esc_(goodUntil_()) + '. '
    + 'Rock, buried debris, utilities, or wet conditions can change the scope — if we run into something that does, we will talk it through with you before going further. '
    + 'Repairs to existing concrete, driveway, landscaping, or other property are not included. If ' + esc_(COMPANY_NAME) + ' causes property damage during the work, we will be responsible for repair or replacement.</div>'
    + '<div style="margin-top:8px;">Reply to this email or call ' + esc_(COMPANY_PHONE) + ' to get on the schedule.</div></div>';

  return shell_('ESTIMATE', [
    ['ESTIMATE #', docNum_(j)],
    ['DATE', today_()],
    ['GOOD UNTIL', goodUntil_()],
  ], inner, 'We appreciate the opportunity to provide an estimate of services for you. We look forward to working with you soon.');
}

function invoiceHtml_(j) {
  var amt = j.final_cost != null ? j.final_cost : j.estimate_amount;
  var paid = Number(j.amount_paid) || 0;
  var due = Math.max(Number(amt || 0) - paid, 0);
  var svc = (j.services || []).join(', ') || 'Land work';
  if (j.acres) svc += ' — ' + j.acres + ' acres';

  var rows = [['SUBTOTAL', money_(amt)]];
  if (paid > 0) rows.push(['DEPOSIT PAID', '-' + money_(paid)]);
  rows.push(['TOTAL DUE', money_(due)]);

  var inner =
    sectionTitle_('CUSTOMER INFORMATION')
    + fieldGrid_([
      ['CUSTOMER NAME', properName_(j.customer_name)],
      ['EMAIL', j.email],
      ['JOB ADDRESS', properAddress_(j.address)],
      ['PHONE', j.phone],
      ['CITY, STATE, ZIP', cityLine_(j)],
      ['WORK COMPLETED', fmtDay_(completedOn_(j))],
    ])
    + sectionTitle_('WORK PERFORMED')
    + scopeBox_(scopeBullets_(j))
    + sectionTitle_('INVOICE DETAILS')
    + itemsTable_([[svc, money_(amt)]])
    + totals_(rows)
    + '<div style="margin-top:18px;border:1px solid ' + BORDER + ';padding:12px;font-size:12.5px;line-height:1.5;">'
    + '<div style="font-weight:bold;color:' + GREEN + ';font-size:11px;letter-spacing:.5px;">REMIT PAYMENT TO</div>'
    + '<div style="margin-top:5px;">Make checks payable to <b>' + esc_(COMPANY_NAME) + '</b></div>'
    + (REMIT_ADDRESS ? '<div>' + esc_(REMIT_ADDRESS) + '</div>' : '')
    + '<div>' + esc_(COMPANY_PHONE) + ' &nbsp;·&nbsp; ' + esc_(COMPANY_EMAIL) + '</div></div>';

  return shell_('INVOICE', [
    ['INVOICE #', docNum_(j)],
    ['DATE', today_()],
    ['AMOUNT DUE', money_(due)],
  ], inner, 'Thank you for your business. We appreciate the opportunity to work on your property.');
}

/** Receipt — sent when the job is marked paid in full. Doubles as the thank-you. */
function thankYouHtml_(j) {
  var amt = j.final_cost != null ? j.final_cost : j.estimate_amount;
  var svc = (j.services || []).join(', ') || 'your project';
  if (j.acres) svc += ' — ' + j.acres + ' acres';
  var first = properName_((j.customer_name || '').split(' ')[0]) || 'there';
  var inner =
    sectionTitle_('CUSTOMER INFORMATION')
    + fieldGrid_([
      ['CUSTOMER NAME', properName_(j.customer_name)],
      ['EMAIL', j.email],
      ['JOB ADDRESS', properAddress_(j.address)],
      ['CITY, STATE, ZIP', cityLine_(j)],
    ])
    + sectionTitle_('WORK PERFORMED')
    + scopeBox_(scopeBullets_(j))
    + sectionTitle_('PAYMENT RECEIVED')
    + itemsTable_([[svc, money_(amt)]])
    + totals_([
      ['BALANCE DUE', money_(0)],
      ['AMOUNT PAID', money_(amt)],
    ])
    + '<div style="margin-top:20px;font-size:14px;line-height:1.55;">'
    + '<div style="font-size:17px;font-weight:bold;color:' + GREEN + ';">Thank you, ' + esc_(first) + '!</div>'
    + '<p style="margin:8px 0 0;">This is your receipt — paid in full, nothing further owed. It was a pleasure working with you, and we hope the property turned out just how you wanted it.</p>'
    + '<p style="margin:10px 0 0;">If you have a minute, a quick Google review means the world to a local business like ours and helps your neighbors find us.</p></div>'
    + '<div style="text-align:center;margin:20px 0 4px;"><a href="' + REVIEW_URL + '" style="background:' + GREEN + ';color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 26px;display:inline-block;">Leave us a Google review</a></div>'
    + '<div style="font-size:14px;line-height:1.55;margin-top:14px;">Need anything else — clearing, road work, drainage, pond work — just reply or give us a call.</div>';

  return shell_('RECEIPT', [
    ['RECEIPT #', docNum_(j)],
    ['DATE PAID', fmtDay_(j.paid_at)],
    ['AMOUNT PAID', money_(amt)],
  ], inner, 'Paid in full — thank you for your business. We appreciate the opportunity to work with you.');
}

// ---- Plain-text fallbacks --------------------------------------------------

function estimatePlain_(j) {
  return COMPANY_NAME + ' — ESTIMATE ' + docNum_(j)
    + '\nDate: ' + today_() + '   Good until: ' + goodUntil_()
    + '\n\nFor: ' + properName_(j.customer_name)
    + (j.address ? '\nJob address: ' + properAddress_(j.address) + ', ' + cityLine_(j) : '')
    + '\n\nScope of work:\n- ' + scopeBullets_(j).join('\n- ')
    + '\n\nTOTAL: ' + money_(j.estimate_amount)
    + (j.lead_time ? '\nEstimated start: ' + j.lead_time : '')
    + '\n\nReply or call ' + COMPANY_PHONE + ' to get on the schedule.'
    + '\n\n' + COMPANY_NAME + ' · ' + COMPANY_PHONE + ' · ' + COMPANY_EMAIL;
}

function invoicePlain_(j) {
  var amt = j.final_cost != null ? j.final_cost : j.estimate_amount;
  var paid = Number(j.amount_paid) || 0;
  var due = Math.max(Number(amt || 0) - paid, 0);
  return COMPANY_NAME + ' — INVOICE ' + docNum_(j)
    + '\nDate: ' + today_() + '   Work completed: ' + fmtDay_(completedOn_(j))
    + '\n\nFor: ' + properName_(j.customer_name)
    + (j.address ? '\nJob address: ' + properAddress_(j.address) + ', ' + cityLine_(j) : '')
    + '\n\nWork performed:\n- ' + scopeBullets_(j).join('\n- ')
    + '\n\nSubtotal: ' + money_(amt)
    + (paid > 0 ? '\nDeposit paid: -' + money_(paid) : '')
    + '\nTOTAL DUE: ' + money_(due)
    + '\n\nMake checks payable to ' + COMPANY_NAME
    + (REMIT_ADDRESS ? '\n' + REMIT_ADDRESS : '')
    + '\n' + COMPANY_PHONE + ' · ' + COMPANY_EMAIL
    + '\n\nThank you for your business!';
}

function thankYouPlain_(j) {
  var amt = j.final_cost != null ? j.final_cost : j.estimate_amount;
  return COMPANY_NAME + ' — RECEIPT ' + docNum_(j)
    + '\nDate paid: ' + fmtDay_(j.paid_at)
    + '\n\nFor: ' + properName_(j.customer_name)
    + '\n\nWork performed:\n- ' + scopeBullets_(j).join('\n- ')
    + '\n\nAMOUNT PAID: ' + money_(amt) + '\nBALANCE DUE: ' + money_(0)
    + '\n\nPaid in full — thank you for your business!'
    + '\nA quick Google review helps us a lot: ' + REVIEW_URL
    + '\n\n' + COMPANY_NAME + ' · ' + COMPANY_PHONE + ' · ' + COMPANY_EMAIL;
}

// ---- Supabase REST ---------------------------------------------------------
function sbGet_(filter) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/jobs?' + filter + '&select=*', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, muteHttpExceptions: true });
  try { return JSON.parse(res.getContentText()) || []; } catch (e) { return []; }
}
function sbPatch_(id, patch) {
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/jobs?id=eq.' + id, {
    method: 'patch', contentType: 'application/json',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify(patch), muteHttpExceptions: true });
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (tr.getHandlerFunction() === 'sendQueuedEmails') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('sendQueuedEmails').timeBased().everyMinutes(5).create();
  sendQueuedEmails();
}
