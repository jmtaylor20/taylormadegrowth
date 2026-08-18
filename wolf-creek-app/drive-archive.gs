/**
 * Wolf Creek Farms — Google Drive PDF archive (Google Apps Script).
 *
 * OPTIONAL. The app works fine without this; it exists so every estimate and
 * finished job also lands in Drive as a filed PDF you can print or hand to an
 * accountant.
 *
 * Runs inside russ@wolfcreeklands.com. Every few minutes it checks Supabase and:
 *   • Saves a QUOTE PDF for each newly-quoted job    → Drive: Wolf Creek Farms/Quotes/<month>/
 *   • Saves a JOB SUMMARY PDF for each completed job → Drive: Wolf Creek Farms/Completed Jobs/<month>/
 * Then, monthly (and on demand), it combines a month's PDFs into two printable
 * "binder" documents:
 *   • Quotes Binder - <Month YYYY>.pdf
 *   • Completed Jobs Binder - <Month YYYY>.pdf   → Drive: Wolf Creek Farms/Monthly Binders/
 *
 * Nothing here sends email — email-sender.gs does that. This only files PDFs.
 *
 * SETUP (once):
 *   1. Sign in to script.google.com AS russ@wolfcreeklands.com.
 *      (Run it from josh@taylormadegrowth.com instead if you'd rather hold the
 *       archive — the only difference is whose Drive the folders live in.)
 *   2. New project → paste this file → Save.
 *   3. Run `installTriggers` → approve the Drive + external-request prompts.
 * That's it. Folders are created automatically the first time something is saved.
 *
 * To (re)build a specific month by hand: set TARGET_MONTH below to e.g. '2026-07'
 * and run `combineTargetMonth`. To rebuild last month, run `combineLastMonth`.
 */

// ---- CONFIG ----------------------------------------------------------------
var SUPABASE_URL = 'https://qbevslgvvkftdacsxmpl.supabase.co';
var SUPABASE_KEY = 'sb_publishable_avmIAUt-NRmBX56UjsMslw_nNz2o16Q';

var ROOT_FOLDER = 'Wolf Creek Farms';   // top-level folder in My Drive
var QUOTES_DIR = 'Quotes';
var COMPLETED_DIR = 'Completed Jobs';
var BINDERS_DIR = 'Monthly Binders';

var LOGO_URL = 'https://wolf-creek-app.netlify.app/assets/img/logo-mark.png';
var COMPANY_NAME = 'Wolf Creek Farms';
var COMPANY_TAGLINE = 'Land Clearing, Site Prep & Dirt Work';
var COMPANY_PHONE = '(334) 207-3331';
var COMPANY_EMAIL = 'russ@wolfcreeklands.com';

var BATCH = 25;                 // max PDFs to build per run (keeps under the time limit)
var TARGET_MONTH = '';          // 'YYYY-MM' — set this then run combineTargetMonth to rebuild one month

// ---------------------------------------------------------------------------

// Palette matches wolfcreeklands.com (hunter greens + sage accent).
var GREEN = '#18382b', GREEN2 = '#2f6244', LIME = '#adc889', GRAYBOX = '#eef1ee', GREENBOX = '#eef3e7', LINE = '#dddddd';

// ============================================================================
// ENTRY POINTS
// ============================================================================

/** Time-based trigger: save any pending quote / summary PDFs. */
function archiveToDrive() {
  saveQuotes_();
  saveSummaries_();
}

/** Monthly trigger (and manual): build last month's two binder PDFs. */
function combineLastMonth() {
  var d = new Date();
  d.setMonth(d.getMonth() - 1);
  combineMonth_(ym_(d));
}

/** Manual: build the binder PDFs for TARGET_MONTH (set it in CONFIG first). */
function combineTargetMonth() {
  if (!/^\d{4}-\d{2}$/.test(TARGET_MONTH)) throw new Error('Set TARGET_MONTH to "YYYY-MM" (e.g. "2026-07") first.');
  combineMonth_(TARGET_MONTH);
}

/** Manual: build this month's binders so far. */
function combineThisMonth() { combineMonth_(ym_(new Date())); }

// ============================================================================
// INDIVIDUAL PDFs
// ============================================================================

function saveQuotes_() {
  // Quoted jobs (an amount exists, past the bare-lead stage) not yet archived.
  var jobs = sbGet_('quote_pdf_status=is.null&estimate_amount=not.is.null&status=neq.lead&status=neq.pending&order=updated_at.asc&limit=' + BATCH);
  jobs.forEach(function (j) {
    try {
      var now = new Date();
      var folder = monthFolder_(QUOTES_DIR, now);
      var name = 'Quote - ' + safeName_(displayName_(j)) + ' - ' + fmtFile_(now) + ' - ' + shortId_(j.id);
      var file = savePdf_(folder, name, quoteHtml_(j));
      sbPatch_(j.id, { quote_pdf_status: 'saved', quote_pdf_url: file.getUrl(), quote_pdf_at: now.toISOString() });
    } catch (e) {
      sbPatch_(j.id, { quote_pdf_status: 'error' });
    }
  });
}

function saveSummaries_() {
  var jobs = sbGet_('summary_pdf_status=is.null&status=eq.completed&order=updated_at.asc&limit=' + BATCH);
  jobs.forEach(function (j) {
    try {
      var now = new Date();
      var folder = monthFolder_(COMPLETED_DIR, now);
      var name = 'Job Summary - ' + safeName_(displayName_(j)) + ' - ' + fmtFile_(now) + ' - ' + shortId_(j.id);
      var file = savePdf_(folder, name, summaryHtml_(j));
      sbPatch_(j.id, { summary_pdf_status: 'saved', summary_pdf_url: file.getUrl(), summary_pdf_at: now.toISOString() });
    } catch (e) {
      sbPatch_(j.id, { summary_pdf_status: 'error' });
    }
  });
}

// ============================================================================
// MONTHLY BINDERS (combine a month's items into one printable PDF each)
// ============================================================================

function combineMonth_(ym) {
  var range = monthRange_(ym);            // { startIso, endIso, label, key }
  var binders = getOrCreateFolder_(root_(), BINDERS_DIR);

  // Quotes archived in the month.
  var quotes = sbGet_('quote_pdf_status=eq.saved&quote_pdf_at=gte.' + range.startIso
    + '&quote_pdf_at=lt.' + range.endIso + '&order=quote_pdf_at.asc');
  if (quotes.length) {
    var qHtml = binderHtml_('ESTIMATES — ' + range.label, quotes, quoteHtml_);
    replacePdf_(binders, 'Quotes Binder - ' + range.label, qHtml);
  }

  // Jobs completed (summary archived) in the month.
  var done = sbGet_('summary_pdf_status=eq.saved&summary_pdf_at=gte.' + range.startIso
    + '&summary_pdf_at=lt.' + range.endIso + '&order=summary_pdf_at.asc');
  if (done.length) {
    var cHtml = binderHtml_('COMPLETED JOBS — ' + range.label, done, summaryHtml_);
    replacePdf_(binders, 'Completed Jobs Binder - ' + range.label, cHtml);
  }
}

// ============================================================================
// HTML TEMPLATES
// ============================================================================

function pageShell_(title, dateLabel, inner) {
  return '<div style="max-width:720px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#173321;padding:8px 4px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td style="vertical-align:middle;"><img src="' + LOGO_URL + '" alt="Wolf Creek Farms" height="60" style="display:block;"></td>'
    + '<td style="text-align:right;vertical-align:middle;"><div style="font-size:30px;font-weight:bold;color:' + GREEN + ';letter-spacing:1px;">' + esc_(title) + '</div>'
    + '<div style="height:3px;background:' + LIME + ';margin:6px 0 8px;"></div>'
    + '<div style="font-size:12px;color:' + GREEN2 + ';font-weight:bold;">' + esc_(dateLabel) + '</div></td>'
    + '</tr></table>'
    + '<div style="height:2px;background:' + GREEN + ';margin:12px 0 18px;"></div>'
    + inner
    + '<div style="height:2px;background:' + GREEN + ';margin:22px 0 10px;"></div>'
    + '<div style="text-align:center;color:' + GREEN2 + ';font-weight:bold;">' + COMPANY_NAME + '</div>'
    + '<div style="text-align:center;color:#5a665f;font-size:12px;">' + COMPANY_TAGLINE + ' · ' + COMPANY_PHONE + ' · ' + COMPANY_EMAIL + '</div>'
    + '</div>';
}

function billToBlock_(j) {
  var addr = [properAddress_(j.address), [j.city, j.zip].filter(Boolean).join(', ')].filter(Boolean);
  return '<div style="font-weight:bold;font-size:15px;">' + esc_(displayName_(j)) + '</div>'
    + (j.phone ? '<div style="font-size:13px;">' + esc_(j.phone) + '</div>' : '')
    + (j.email ? '<div style="font-size:13px;">' + esc_(j.email) + '</div>' : '')
    + addr.map(function (a) { return '<div style="font-size:13px;">' + esc_(a) + '</div>'; }).join('');
}

function scopeBullets_(job) {
  var text = job.scope_notes || (job.services || []).join(', ') || 'Tree service as discussed.';
  return text.split(/[\n;]+/).map(function (p) { return p.trim(); }).filter(Boolean);
}

/** Estimate / quote — matches the emailed estimate. */
function quoteHtml_(j) {
  var bullets = scopeBullets_(j).map(function (b) {
    return '<tr><td style="width:18px;color:' + LIME + ';font-size:16px;vertical-align:top;">•</td><td style="padding-bottom:8px;">' + esc_(b) + '</td></tr>';
  }).join('');
  var svc = (j.services || []).join(', ') || 'Tree service';
  var inner =
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="55%" style="vertical-align:top;background:' + GRAYBOX + ';border-radius:10px;padding:14px;">'
    + '<div style="font-size:12px;font-weight:bold;color:' + GREEN2 + ';letter-spacing:.5px;">BILL TO</div><div style="margin-top:6px;">' + billToBlock_(j) + '</div></td>'
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
    + '<tr><td style="padding:12px;border-bottom:1px solid ' + LINE + ';">' + esc_(svc) + '</td>'
    + '<td style="padding:12px;border-bottom:1px solid ' + LINE + ';text-align:right;font-weight:bold;">' + money_(j.estimate_amount) + '</td></tr>'
    + '<tr><td style="padding:12px;text-align:right;font-weight:bold;color:' + GREEN + ';">TOTAL</td>'
    + '<td style="padding:12px;text-align:right;font-weight:bold;color:' + GREEN + ';font-size:16px;">' + money_(j.estimate_amount) + '</td></tr></table>'
    + (j.lead_time ? '<div style="margin-top:16px;background:' + GREENBOX + ';border-radius:10px;padding:12px;"><b style="color:' + GREEN2 + ';">Estimated timing:</b> ' + esc_(j.lead_time) + '</div>' : '')
    + '<div style="margin-top:16px;background:' + GREENBOX + ';border-radius:10px;padding:14px;font-size:13px;">'
    + '<div style="font-weight:bold;color:' + GREEN2 + ';">SERVICE NOTE</div>'
    + '<div style="margin-top:6px;">This is an estimate for the work described above, based on the site as we found it. Rock, buried debris, utilities, or wet conditions can change the scope — if we run into something that does, we will talk it through with you before going further. Repairs to existing concrete, driveway, landscaping, or other property are not included. If Wolf Creek Farms causes property damage during the work, we will be responsible for repair or replacement.</div></div>';
  return pageShell_('ESTIMATE', 'Quoted ' + longDate_(j.quote_pdf_at || j.updated_at), inner);
}

/** Completed-job summary — every field on one page. */
function summaryHtml_(j) {
  var estAmt = num_(j.estimate_amount), finalCost = num_(j.final_cost), profit = num_(j.profit);
  var estHrs = num_(j.estimated_hours), actHrs = num_(j.actual_hours);
  var costVar = (estAmt != null && finalCost != null) ? finalCost - estAmt : null;
  var hrVar = (estHrs != null && actHrs != null) ? Math.round((actHrs - estHrs) * 10) / 10 : null;
  var margin = (profit != null && finalCost) ? Math.round((profit / finalCost) * 100) : null;

  var inner =
    // Customer + headline financials
    '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="55%" style="vertical-align:top;background:' + GRAYBOX + ';border-radius:10px;padding:14px;">'
    + '<div style="font-size:12px;font-weight:bold;color:' + GREEN2 + ';letter-spacing:.5px;">CUSTOMER</div><div style="margin-top:6px;">' + billToBlock_(j) + '</div></td>'
    + '<td width="4%"></td>'
    + '<td width="41%" style="vertical-align:top;background:' + GREEN + ';border-radius:10px;padding:16px;color:#fff;">'
    + '<div style="font-size:12px;font-weight:bold;letter-spacing:.5px;">FINAL COST</div>'
    + '<div style="font-size:30px;font-weight:bold;margin-top:6px;">' + money_(finalCost != null ? finalCost : estAmt) + '</div>'
    + (profit != null ? '<div style="font-size:13px;margin-top:6px;opacity:.9;">Profit ' + money_(profit) + (margin != null ? ' · ' + margin + '% margin' : '') + '</div>' : '')
    + '</td></tr></table>'

    // Work performed
    + section_('WORK PERFORMED')
    + kvTable_([
      ['Work performed', arr_(j.services)],
      ['Acres', j.acres != null ? String(j.acres) : '—'],
      ['Site conditions', arr_(j.site_conditions)],
      ['Scope of work', j.scope_notes || '—'],
      ['Job notes', j.job_notes || '—'],
    ])

    // Schedule
    + section_('SCHEDULE')
    + kvTable_([
      ['Estimate visit', dateTime_(j.appointment_date, j.appointment_time)],
      ['Work date', dateTime_(j.scheduled_date, j.scheduled_time)],
      ['Priority', cap_(j.priority)],
    ])

    // Quote vs actual
    + section_('QUOTE vs ACTUAL')
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:2px;">'
    + '<tr style="background:' + GREENBOX + ';">'
    + th_('') + th_('QUOTED', 'right') + th_('ACTUAL', 'right') + th_('DIFF', 'right') + '</tr>'
    + moneyRow_('Amount', estAmt, finalCost, costVar)
    + hoursRow_('Hours', estHrs, actHrs, hrVar, j.hours_result)
    + '</table>'
    + (j.quote_variance_notes ? '<div style="margin-top:12px;background:' + GREENBOX + ';border-radius:10px;padding:12px;font-size:13px;"><b style="color:' + GREEN2 + ';">Discrepancy notes:</b> ' + esc_(j.quote_variance_notes) + '</div>' : '');

  return pageShell_('JOB SUMMARY', 'Completed ' + longDate_(j.summary_pdf_at || j.updated_at), inner);
}

// ---- template helpers ----
function section_(t) {
  return '<div style="font-size:15px;font-weight:bold;color:' + GREEN + ';margin:20px 0 4px;">' + esc_(t) + '</div>'
    + '<div style="height:2px;background:' + LIME + ';margin-bottom:8px;"></div>';
}
function kvTable_(rows) {
  var body = rows.map(function (r) {
    return '<tr><td style="width:150px;vertical-align:top;padding:7px 10px 7px 0;color:' + GREEN2 + ';font-weight:bold;font-size:13px;">' + esc_(r[0]) + '</td>'
      + '<td style="vertical-align:top;padding:7px 0;border-bottom:1px solid ' + LINE + ';font-size:13px;">' + esc_(r[1]) + '</td></tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0">' + body + '</table>';
}
function th_(t, align) { return '<td style="padding:9px 12px;font-size:12px;font-weight:bold;color:' + GREEN2 + ';text-align:' + (align || 'left') + ';">' + esc_(t) + '</td>'; }
function moneyRow_(label, a, b, diff) {
  // Match the app: came in UNDER the quote = green (good), OVER = red.
  return '<tr><td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';font-weight:bold;">' + esc_(label) + '</td>'
    + td_(money_(a), 'right') + td_(money_(b), 'right')
    + '<td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';text-align:right;font-weight:bold;color:' + (diff > 0 ? '#a13333' : diff < 0 ? '#1e7d34' : GREEN2) + ';">'
    + (diff == null ? '—' : (diff > 0 ? '+' : '') + money_(diff)) + '</td></tr>';
}
function hoursRow_(label, a, b, diff, result) {
  var note = result ? ' (' + cap_(String(result).replace('_', ' ')) + ')' : '';
  return '<tr><td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';font-weight:bold;">' + esc_(label) + '</td>'
    + td_(a != null ? a + ' h' : '—', 'right') + td_(b != null ? b + ' h' : '—', 'right')
    + '<td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';text-align:right;font-weight:bold;color:' + (diff > 0 ? '#a13333' : diff < 0 ? '#1e7d34' : GREEN2) + ';">'
    + (diff == null ? '—' : (diff > 0 ? '+' : '') + diff + ' h' + note) + '</td></tr>';
}
function td_(t, align) { return '<td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';text-align:' + (align || 'left') + ';">' + esc_(t) + '</td>'; }

/** Combine many items into one document, each on its own page. */
function binderHtml_(title, items, renderFn) {
  var cover = '<div style="max-width:720px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;text-align:center;padding:120px 0;">'
    + '<img src="' + LOGO_URL + '" height="90" style="display:block;margin:0 auto 20px;">'
    + '<div style="font-size:34px;font-weight:bold;color:' + GREEN + ';">' + COMPANY_NAME + '</div>'
    + '<div style="height:3px;width:180px;background:' + LIME + ';margin:14px auto;"></div>'
    + '<div style="font-size:22px;font-weight:bold;color:' + GREEN2 + ';">' + esc_(title) + '</div>'
    + '<div style="font-size:15px;color:#5a665f;margin-top:10px;">' + items.length + (items.length === 1 ? ' record' : ' records') + '</div>'
    + '</div><div style="page-break-after:always;"></div>';
  var pages = items.map(function (j, i) {
    var brk = i < items.length - 1 ? '<div style="page-break-after:always;"></div>' : '';
    return renderFn(j) + brk;
  }).join('');
  return cover + pages;
}

function savePdf_(folder, name, html) {
  var blob = Utilities.newBlob(html, 'text/html', name + '.html').getAs('application/pdf').setName(name + '.pdf');
  return folder.createFile(blob);
}
/** Save a PDF, removing any older file of the same name first (for rebuilt binders). */
function replacePdf_(folder, name, html) {
  var existing = folder.getFilesByName(name + '.pdf');
  while (existing.hasNext()) existing.next().setTrashed(true);
  return savePdf_(folder, name, html);
}
function root_() { return getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER); }
function monthFolder_(sub, date) { return getOrCreateFolder_(getOrCreateFolder_(root_(), sub), monthName_(date)); }
function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ============================================================================
// SUPABASE REST
// ============================================================================

function sbGet_(filter, table) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + (table || 'jobs') + '?' + filter + '&select=*', {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }, muteHttpExceptions: true });
  try { return JSON.parse(res.getContentText()) || []; } catch (e) { return []; }
}
function sbPatch_(id, patch) {
  UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/jobs?id=eq.' + id, {
    method: 'patch', contentType: 'application/json',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    payload: JSON.stringify(patch), muteHttpExceptions: true });
}

// ============================================================================
// HELPERS
// ============================================================================

function num_(n) { return (n === '' || n == null) ? null : Number(n); }
function money_(n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function arr_(a) { return (a && a.length) ? a.join(', ') : '—'; }
function cap_(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }

function displayName_(j) { var n = (j.customer_name || '').trim(); return n ? properName_(j.customer_name) : 'New lead'; }
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
function safeName_(s) { return String(s || 'New lead').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
function shortId_(id) { return String(id || '').slice(0, 8); }

var TZ = function () { try { return Session.getScriptTimeZone(); } catch (e) { return 'America/Chicago'; } }();
function fmtFile_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function monthName_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM MMMM'); }   // "2026-08 August"
function longDate_(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'MMMM d, yyyy') : Utilities.formatDate(new Date(), TZ, 'MMMM d, yyyy'); }
function dateTime_(date, time) {
  if (!date) return '—';
  var d = Utilities.formatDate(new Date(date + 'T00:00:00'), TZ, 'EEE, MMM d, yyyy');
  return time ? d + ' · ' + time : d;
}
function ym_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
function monthRange_(ym) {
  var parts = ym.split('-'), y = +parts[0], m = +parts[1];
  var start = new Date(Date.UTC(y, m - 1, 1));
  var end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: Utilities.formatDate(start, 'UTC', 'MMMM yyyy'),   // "August 2026"
    key: ym,
  };
}

// ============================================================================
// TRIGGERS
// ============================================================================

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    var fn = tr.getHandlerFunction();
    if (fn === 'archiveToDrive' || fn === 'combineLastMonth') ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('archiveToDrive').timeBased().everyMinutes(10).create();
  // Build last month's binders early on the 1st of each month.
  ScriptApp.newTrigger('combineLastMonth').timeBased().onMonthDay(1).atHour(3).create();
  archiveToDrive();  // run once now
}
