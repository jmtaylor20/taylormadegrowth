/**
 * Wolf Creek Farms — outbound email sender (Google Apps Script).
 *
 * Runs inside russ@wolfcreeklands.com. Every few minutes it checks Supabase for
 * jobs the app has queued, and sends Wolf Creek-branded HTML emails FROM Russ's
 * Gmail:
 *   • Estimate  — when Russ quotes a job        (estimate_email_status = 'queued')
 *   • Invoice   — when a job is marked complete (invoice_email_status  = 'queued')
 *   • Thank-you — when a job is paid in full    (thankyou_email_status = 'queued')
 * Then it marks them 'sent' so they never double-send.
 *
 * SETUP (once):
 *   1. Sign in to script.google.com AS russ@wolfcreeklands.com.
 *   2. New project → paste this file → Save.
 *   3. Check REMIT_ADDRESS and REVIEW_URL below.
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
var COMPANY_TAGLINE = 'Land Clearing, Site Prep & Dirt Work';
var COMPANY_PHONE = '(334) 207-3331';
var COMPANY_EMAIL = 'russ@wolfcreeklands.com';
var FROM_NAME = 'Wolf Creek Farms';
var REMIT_ADDRESS = '';              // mailing address shown on invoices — fill in to show it
var CC_EMAIL = 'russ@wolfcreeklands.com';   // CC every estimate + invoice here (a copy lands in the inbox)
// ---------------------------------------------------------------------------

// Palette matches wolfcreeklands.com (hunter greens + sage accent).
var GREEN = '#18382b', GREEN2 = '#2f6244', LIME = '#adc889', GRAYBOX = '#eef1ee', GREENBOX = '#eef3e7';

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
      GmailApp.sendEmail(j.email, 'Thank you from Wolf Creek Farms', thankYouPlain_(j),
        { htmlBody: thankYouHtml_(j), name: FROM_NAME });
      sbPatch_(j.id, { thankyou_email_status: 'sent' });
    } catch (e) { sbPatch_(j.id, { thankyou_email_status: 'error' }); }
  });
}

// ---- Templates -------------------------------------------------------------
function money_(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy'); }
function fmtDay_(iso) { return iso ? Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'MMMM d, yyyy') : today_(); }
// When the job was completed — falls back to the scheduled work date for older jobs.
function completedOn_(j) { return j.completed_at || (j.scheduled_date ? j.scheduled_date + 'T00:00:00' : null); }
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
  // One bullet per line; if it's a single line, one bullet.
  return text.split(/[\n;]+/).map(function (p) { return p.trim(); }).filter(Boolean);
}

function shell_(title, inner) {
  return '<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#173321;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:middle;"><img src="' + LOGO_URL + '" alt="Wolf Creek Farms" height="64" style="display:block;"></td>'
    + '<td style="text-align:right;vertical-align:middle;"><div style="font-size:34px;font-weight:bold;color:' + GREEN + ';letter-spacing:1px;">' + title + '</div>'
    + '<div style="height:3px;background:' + LIME + ';margin:6px 0 8px;"></div>'
    + '<div style="font-size:12px;color:' + GREEN2 + ';font-weight:bold;">' + today_() + '</div></td>'
    + '</tr></table>'
    + '<div style="height:2px;background:' + GREEN + ';margin:14px 0 20px;"></div>'
    + inner
    + '<div style="height:2px;background:' + GREEN + ';margin:24px 0 12px;"></div>'
    + '<div style="text-align:center;color:' + GREEN2 + ';font-weight:bold;">' + COMPANY_NAME + '</div>'
    + '<div style="text-align:center;color:#5a665f;font-size:13px;">' + COMPANY_TAGLINE + '</div>'
    + '<div style="text-align:center;color:#5a665f;font-size:13px;margin-top:4px;">' + COMPANY_PHONE + ' · ' + COMPANY_EMAIL + '</div>'
    + '</div>';
}

function estimateHtml_(j) {
  var addr = [properAddress_(j.address), [j.city, j.zip].filter(Boolean).join(', ')].filter(Boolean);
  var billTo = '<div style="font-weight:bold;">' + esc_(properName_(j.customer_name)) + '</div>'
    + (j.phone ? '<div style="font-size:13px;">' + esc_(j.phone) + '</div>' : '')
    + addr.map(function (a) { return '<div style="font-size:13px;">' + esc_(a) + '</div>'; }).join('');
  var bullets = scopeBullets_(j).map(function (b) {
    return '<tr><td style="width:18px;color:' + LIME + ';font-size:16px;vertical-align:top;">•</td><td style="padding-bottom:8px;">' + esc_(b) + '</td></tr>';
  }).join('');
  var svc = (j.services || []).join(', ') || 'Land work';
  var inner =
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="55%" style="vertical-align:top;background:' + GRAYBOX + ';border-radius:10px;padding:14px;">'
    + '<div style="font-size:12px;font-weight:bold;color:' + GREEN2 + ';letter-spacing:.5px;">BILL TO</div><div style="margin-top:6px;">' + billTo + '</div></td>'
    + '<td width="4%"></td>'
    + '<td width="41%" style="vertical-align:top;background:' + GREEN + ';border-radius:10px;padding:16px;color:#fff;">'
    + '<div style="font-size:12px;font-weight:bold;letter-spacing:.5px;">TOTAL ESTIMATE</div>'
    + '<div style="font-size:30px;font-weight:bold;margin-top:6px;">' + money_(j.estimate_amount) + '</div></td>'
    + '</tr></table>'
    + '<div style="font-size:15px;font-weight:bold;color:' + GREEN + ';margin:22px 0 4px;">SCOPE OF WORK</div>'
    + '<div style="height:2px;background:' + LIME + ';margin-bottom:12px;"></div>'
    + '<table cellpadding="0" cellspacing="0">' + bullets + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">'
    + '<tr style="background:' + GREENBOX + ';"><td style="padding:10px 12px;font-size:12px;font-weight:bold;color:' + GREEN2 + ';">SERVICE</td>'
    + '<td style="padding:10px 12px;font-size:12px;font-weight:bold;color:' + GREEN2 + ';text-align:right;">AMOUNT</td></tr>'
    + '<tr><td style="padding:12px;border-bottom:1px solid #ddd;">' + esc_(svc) + '</td>'
    + '<td style="padding:12px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;">' + money_(j.estimate_amount) + '</td></tr>'
    + '<tr><td style="padding:12px;text-align:right;font-weight:bold;color:' + GREEN + ';">TOTAL</td>'
    + '<td style="padding:12px;text-align:right;font-weight:bold;color:' + GREEN + ';font-size:16px;">' + money_(j.estimate_amount) + '</td></tr></table>'
    + (j.lead_time ? '<div style="margin-top:16px;background:' + GREENBOX + ';border-radius:10px;padding:12px;"><b style="color:' + GREEN2 + ';">Estimated timing:</b> ' + esc_(j.lead_time) + '</div>' : '')
    + '<div style="margin-top:16px;background:' + GREENBOX + ';border-radius:10px;padding:14px;font-size:13px;">'
    + '<div style="font-weight:bold;color:' + GREEN2 + ';">SERVICE NOTE</div>'
    + '<div style="margin-top:6px;">This is an estimate for the work described above, based on the site as we found it. Rock, buried debris, utilities, or wet conditions can change the scope — if we run into something that does, we will talk it through with you before going further. Repairs to existing concrete, driveway, landscaping, or other property are not included. If Wolf Creek Farms causes property damage during the work, we will be responsible for repair or replacement.</div>'
    + '<div style="margin-top:8px;">Reply to this email or call to get on the schedule. Thank you for the opportunity!</div></div>';
  return shell_('ESTIMATE', inner);
}

function thankYouHtml_(j) {
  var svc = (j.services || []).join(', ') || 'your project';
  var inner =
    '<div style="font-size:17px;font-weight:bold;color:' + GREEN + ';">Thank you, ' + esc_(properName_((j.customer_name || '').split(' ')[0]) || 'friend') + '!</div>'
    + '<p style="line-height:1.5;">Thank you for choosing <b>Wolf Creek Farms</b> for ' + esc_(svc) + '. It was a pleasure working with you, and we hope the property turned out just how you wanted it.</p>'
    + '<p style="line-height:1.5;">If you have a minute, a quick Google review means the world to a local business like ours and helps your neighbors find us.</p>'
    + '<div style="text-align:center;margin:22px 0;"><a href="' + REVIEW_URL + '" style="background:' + GREEN + ';color:#fff;text-decoration:none;font-weight:bold;padding:14px 26px;border-radius:10px;display:inline-block;">⭐ Leave us a Google review</a></div>'
    + '<p style="line-height:1.5;">Need anything else — clearing, road work, drainage, pond work — just reply or give us a call. We appreciate your business!</p>';
  return shell_('THANK YOU', inner);
}

function invoiceHtml_(j) {
  var amt = j.final_cost != null ? j.final_cost : j.estimate_amount;
  var addr = [properAddress_(j.address), [j.city, j.zip].filter(Boolean).join(', ')].filter(Boolean);
  var billTo = '<div style="font-weight:bold;">' + esc_(properName_(j.customer_name)) + '</div>'
    + (j.phone ? '<div style="font-size:13px;">' + esc_(j.phone) + '</div>' : '')
    + addr.map(function (a) { return '<div style="font-size:13px;">' + esc_(a) + '</div>'; }).join('');
  var bullets = scopeBullets_(j).map(function (b) {
    return '<tr><td style="width:18px;color:' + LIME + ';font-size:16px;vertical-align:top;">•</td><td style="padding-bottom:8px;">' + esc_(b) + '</td></tr>';
  }).join('');
  var svc = (j.services || []).join(', ') || 'Land work';
  var inner =
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="55%" style="vertical-align:top;background:' + GRAYBOX + ';border-radius:10px;padding:14px;">'
    + '<div style="font-size:12px;font-weight:bold;color:' + GREEN2 + ';letter-spacing:.5px;">BILL TO</div><div style="margin-top:6px;">' + billTo + '</div>'
    + '<div style="margin-top:10px;font-size:12px;font-weight:bold;color:' + GREEN2 + ';letter-spacing:.5px;">WORK COMPLETED</div>'
    + '<div style="font-size:13px;">' + fmtDay_(completedOn_(j)) + '</div></td>'
    + '<td width="4%"></td>'
    + '<td width="41%" style="vertical-align:top;background:' + GREEN + ';border-radius:10px;padding:16px;color:#fff;">'
    + '<div style="font-size:12px;font-weight:bold;letter-spacing:.5px;">AMOUNT DUE</div>'
    + '<div style="font-size:30px;font-weight:bold;margin-top:6px;">' + money_(amt) + '</div></td>'
    + '</tr></table>'
    + '<div style="font-size:15px;font-weight:bold;color:' + GREEN + ';margin:22px 0 4px;">WORK PERFORMED</div>'
    + '<div style="height:2px;background:' + LIME + ';margin-bottom:12px;"></div>'
    + '<table cellpadding="0" cellspacing="0">' + bullets + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">'
    + '<tr style="background:' + GREENBOX + ';"><td style="padding:10px 12px;font-size:12px;font-weight:bold;color:' + GREEN2 + ';">SERVICE</td>'
    + '<td style="padding:10px 12px;font-size:12px;font-weight:bold;color:' + GREEN2 + ';text-align:right;">AMOUNT</td></tr>'
    + '<tr><td style="padding:12px;border-bottom:1px solid #ddd;">' + esc_(svc) + '</td>'
    + '<td style="padding:12px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;">' + money_(amt) + '</td></tr>'
    + '<tr><td style="padding:12px;text-align:right;font-weight:bold;color:' + GREEN + ';">TOTAL DUE</td>'
    + '<td style="padding:12px;text-align:right;font-weight:bold;color:' + GREEN + ';font-size:16px;">' + money_(amt) + '</td></tr></table>'
    + '<div style="margin-top:16px;background:' + GREENBOX + ';border-radius:10px;padding:14px;font-size:13px;">'
    + '<div style="font-weight:bold;color:' + GREEN2 + ';">REMIT PAYMENT TO</div>'
    + '<div style="margin-top:6px;">Make checks payable to <b>' + COMPANY_NAME + '</b></div>'
    + (REMIT_ADDRESS ? '<div>Mail to: ' + esc_(REMIT_ADDRESS) + '</div>' : '')
    + '<div>' + COMPANY_PHONE + ' · ' + COMPANY_EMAIL + '</div>'
    + '<div style="margin-top:8px;">Thank you for your business!</div></div>';
  return shell_('INVOICE', inner);
}

function estimatePlain_(j) {
  return 'Estimate from Wolf Creek Farms\n\nTotal: ' + money_(j.estimate_amount)
    + '\n\nScope of work:\n- ' + scopeBullets_(j).join('\n- ')
    + (j.lead_time ? '\n\nEstimated timing: ' + j.lead_time : '')
    + '\n\nReply or call ' + COMPANY_PHONE + ' to schedule. Thank you!\n' + COMPANY_NAME;
}
function invoicePlain_(j) {
  var amt = j.final_cost != null ? j.final_cost : j.estimate_amount;
  return 'Invoice from Wolf Creek Farms\n\nAmount due: ' + money_(amt)
    + '\nWork completed: ' + fmtDay_(completedOn_(j))
    + '\n\nWork performed:\n- ' + scopeBullets_(j).join('\n- ')
    + '\n\nMake checks payable to Wolf Creek Farms' + (REMIT_ADDRESS ? '\nMail to: ' + REMIT_ADDRESS : '') + '\n' + COMPANY_PHONE
    + '\n\nThank you for your business!\n' + COMPANY_NAME;
}
function thankYouPlain_(j) {
  return 'Thank you for choosing Wolf Creek Farms! We hope the property turned out just how you wanted it.\n\n'
    + 'A quick Google review helps us a lot: ' + REVIEW_URL + '\n\n' + COMPANY_NAME + ' · ' + COMPANY_PHONE;
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
