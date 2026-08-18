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
var COMPANY_PHONE = '334-207-3331';
var COMPANY_EMAIL = 'russ@wolfcreeklands.com';
var COMPANY_WEBSITE = 'wolfcreeklands.com';
var COMPANY_ADDRESS = '3914 County Road 54 West, Notasulga, AL 36866';

var BATCH = 25;                 // max PDFs to build per run (keeps under the time limit)
var TARGET_MONTH = '';          // 'YYYY-MM' — set this then run combineTargetMonth to rebuild one month

// ---------------------------------------------------------------------------

// Palette matches wolfcreeklands.com (hunter greens + sage accent).
var GREEN = '#18382b', BORDER = '#c9d2c9';

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

// Laid out to match Wolf Creek's printed estimate form and the emailed documents:
// oversized title with the logo, a green meta bar, boxed fields, a scope block,
// a line-item table, and a stacked totals column.

// ---- Building blocks -------------------------------------------------------

function masthead_(title) {
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="vertical-align:middle;">'
    + '<div style="font-size:42px;line-height:1;font-weight:bold;color:' + GREEN + ';letter-spacing:1px;">' + esc_(title) + '</div></td>'
    + '<td style="text-align:right;vertical-align:middle;width:190px;">'
    + '<img src="' + LOGO_URL + '" alt="' + esc_(COMPANY_NAME) + '" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;"></td>'
    + '</tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;font-size:12.5px;color:#1c2b22;">'
    + '<tr><td style="padding:2px 0;">' + esc_(COMPANY_PHONE) + '</td><td style="padding:2px 0;">' + esc_(COMPANY_WEBSITE) + '</td></tr>'
    + '<tr><td style="padding:2px 0;">' + esc_(COMPANY_EMAIL) + '</td><td style="padding:2px 0;">' + esc_(COMPANY_ADDRESS) + '</td></tr>'
    + '</table>';
}

function metaBar_(cells) {
  var head = '', vals = '', w = Math.floor(100 / cells.length);
  cells.forEach(function (c) {
    head += '<td width="' + w + '%" style="padding:8px 10px;background:' + GREEN + ';color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.5px;text-align:center;border-right:1px solid #ffffff;">' + esc_(c[0]) + '</td>';
    vals += '<td width="' + w + '%" style="padding:9px 10px;border:1px solid ' + BORDER + ';border-top:0;font-size:13px;text-align:center;">' + esc_(c[1] || '') + '</td>';
  });
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>' + head + '</tr><tr>' + vals + '</tr></table>';
}

function sectionTitle_(t) {
  return '<div style="font-size:14px;font-weight:bold;color:' + GREEN + ';letter-spacing:.5px;margin:20px 0 8px;">' + esc_(t) + '</div>';
}

function fieldBox_(label, value) {
  return '<div style="border:1px solid ' + BORDER + ';padding:7px 10px;">'
    + '<div style="font-size:10px;font-weight:bold;color:' + GREEN + ';letter-spacing:.5px;">' + esc_(label) + '</div>'
    + '<div style="font-size:13.5px;margin-top:2px;">' + esc_(value || '—') + '</div></div>';
}

function fieldGrid_(pairs) {
  var rows = '';
  for (var i = 0; i < pairs.length; i += 2) {
    var a = pairs[i], b = pairs[i + 1];
    rows += '<tr><td width="49%" style="padding:0 0 8px 0;vertical-align:top;">' + fieldBox_(a[0], a[1]) + '</td>'
      + '<td width="2%"></td>'
      + '<td width="49%" style="padding:0 0 8px 0;vertical-align:top;">' + (b ? fieldBox_(b[0], b[1]) : '') + '</td></tr>';
  }
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + rows + '</table>';
}

function scopeBox_(bullets) {
  var rows = bullets.map(function (b) {
    return '<div style="padding:7px 10px;border-bottom:1px solid ' + BORDER + ';font-size:13.5px;">' + esc_(b) + '</div>';
  }).join('');
  return '<div style="border:1px solid ' + BORDER + ';">' + (rows || '<div style="padding:7px 10px;">&nbsp;</div>') + '</div>';
}

function itemsTable_(items) {
  var head = '<tr><td style="padding:8px 10px;background:' + GREEN + ';color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.5px;">DESCRIPTION</td>'
    + '<td width="30%" style="padding:8px 10px;background:' + GREEN + ';color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:.5px;text-align:right;">AMOUNT</td></tr>';
  var rows = items.map(function (it) {
    return '<tr><td style="padding:11px 10px;border:1px solid ' + BORDER + ';border-top:0;font-size:13.5px;">' + esc_(it[0]) + '</td>'
      + '<td style="padding:11px 10px;border:1px solid ' + BORDER + ';border-top:0;border-left:0;font-size:13.5px;text-align:right;font-weight:bold;">' + esc_(it[1]) + '</td></tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + head + rows + '</table>';
}

function totals_(rows) {
  var body = rows.map(function (r, i) {
    var last = i === rows.length - 1;
    return '<tr><td style="padding:9px 12px;text-align:right;font-size:12px;font-weight:bold;letter-spacing:.5px;'
      + (last ? 'background:' + GREEN + ';color:#ffffff;' : 'color:' + GREEN + ';border:1px solid ' + BORDER + ';border-right:0;') + '">' + esc_(r[0]) + '</td>'
      + '<td width="45%" style="padding:9px 12px;text-align:right;border:1px solid ' + BORDER + ';font-size:' + (last ? '16px' : '13.5px') + ';font-weight:bold;'
      + (last ? 'color:' + GREEN + ';' : '') + '">' + esc_(r[1]) + '</td></tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td width="45%"></td><td width="55%">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0">' + body + '</table></td></tr></table>';
}

function pageShell_(title, metaCells, inner, footerNote) {
  return '<div style="max-width:720px;margin:0 auto;padding:14px 10px;font-family:Arial,Helvetica,sans-serif;color:#14201a;background:#ffffff;">'
    + masthead_(title)
    + metaBar_(metaCells)
    + inner
    + '<div style="background:' + GREEN + ';color:#ffffff;font-style:italic;font-size:12.5px;text-align:center;padding:11px 14px;margin-top:22px;">' + esc_(footerNote) + '</div>'
    + '</div>';
}

// Document number: stable, short, derived from the job id. "WCF-1A2B3C4D".
function docNum_(j) { return 'WCF-' + String(j.id || '').replace(/-/g, '').slice(0, 8).toUpperCase(); }
function cityLine_(j) {
  var cs = [j.city, j.state || 'AL'].filter(Boolean).join(', ');
  return [cs, j.zip].filter(Boolean).join(' ');
}
function scopeBullets_(job) {
  var text = job.scope_notes || (job.services || []).join(', ') || 'Work as discussed.';
  return text.split(/[\n;]+/).map(function (p) { return p.trim(); }).filter(Boolean);
}
function svcLine_(j) {
  var svc = (j.services || []).join(', ') || 'Land work';
  if (j.acres) svc += ' — ' + j.acres + ' acres';
  return svc;
}

// ---- Documents -------------------------------------------------------------

/** Estimate / quote — mirrors the emailed estimate. */
function quoteHtml_(j) {
  var inner =
    sectionTitle_('CUSTOMER INFORMATION')
    + fieldGrid_([
      ['CUSTOMER NAME', displayName_(j)],
      ['EMAIL', j.email],
      ['JOB ADDRESS', properAddress_(j.address)],
      ['PHONE', j.phone],
      ['CITY, STATE, ZIP', cityLine_(j)],
      ['ESTIMATED START', j.lead_time],
    ])
    + sectionTitle_('SCOPE OF WORK / NOTES')
    + scopeBox_(scopeBullets_(j))
    + sectionTitle_('ESTIMATE DETAILS')
    + itemsTable_([[svcLine_(j), money_(j.estimate_amount)]])
    + totals_([['SUBTOTAL', money_(j.estimate_amount)], ['TOTAL', money_(j.estimate_amount)]]);

  return pageShell_('ESTIMATE', [
    ['ESTIMATE #', docNum_(j)],
    ['DATE', longDate_(j.quote_pdf_at || j.updated_at)],
    ['STATUS', cap_(j.status).replace(/_/g, ' ')],
  ], inner, 'We appreciate the opportunity to provide an estimate of services for you. We look forward to working with you soon.');
}

/** Completed-job summary — the internal record, so it also carries the numbers
 *  the customer never sees (hours, profit, quote-vs-actual). */
function summaryHtml_(j) {
  var estAmt = num_(j.estimate_amount), finalCost = num_(j.final_cost), profit = num_(j.profit);
  var estHrs = num_(j.estimated_hours), actHrs = num_(j.actual_hours);
  var costVar = (estAmt != null && finalCost != null) ? finalCost - estAmt : null;
  var hrVar = (estHrs != null && actHrs != null) ? Math.round((actHrs - estHrs) * 10) / 10 : null;
  var margin = (profit != null && finalCost) ? Math.round((profit / finalCost) * 100) : null;
  var paid = Number(j.amount_paid) || 0;

  var total = Number(finalCost != null ? finalCost : (estAmt || 0));
  var totalRows = [['SUBTOTAL', money_(total)]];
  if (j.paid) {
    totalRows.push(['PAID IN FULL', money_(total)]);
  } else {
    if (paid > 0) totalRows.push(['COLLECTED', money_(paid)]);
    totalRows.push(['BALANCE DUE', money_(Math.max(total - paid, 0))]);
  }

  var inner =
    sectionTitle_('CUSTOMER INFORMATION')
    + fieldGrid_([
      ['CUSTOMER NAME', displayName_(j)],
      ['EMAIL', j.email],
      ['JOB ADDRESS', properAddress_(j.address)],
      ['PHONE', j.phone],
      ['CITY, STATE, ZIP', cityLine_(j)],
      ['WORK COMPLETED', longDate_(j.completed_at)],
    ])
    + sectionTitle_('WORK PERFORMED')
    + scopeBox_(scopeBullets_(j))
    + sectionTitle_('JOB DETAILS')
    + kvTable_([
      ['Work', arr_(j.services)],
      ['Acres', j.acres != null ? String(j.acres) : '—'],
      ['Site conditions', arr_(j.site_conditions)],
      ['Priority', cap_(j.priority)],
      ['Estimate visit', dateTime_(j.appointment_date, j.appointment_time)],
      ['Work date', dateTime_(j.scheduled_date, j.scheduled_time)],
      ['Job notes', j.job_notes || '—'],
    ])
    + sectionTitle_('QUOTE vs ACTUAL')
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:2px;">'
    + '<tr style="background:' + GREEN + ';">'
    + th_('') + th_('QUOTED', 'right') + th_('ACTUAL', 'right') + th_('DIFF', 'right') + '</tr>'
    + moneyRow_('Amount', estAmt, finalCost, costVar)
    + hoursRow_('Hours', estHrs, actHrs, hrVar, j.hours_result)
    + '</table>'
    + (profit != null
      ? '<div style="margin-top:10px;border:1px solid ' + BORDER + ';padding:10px;font-size:13px;"><b style="color:' + GREEN + ';">Profit:</b> '
        + esc_(money_(profit)) + (margin != null ? ' · ' + margin + '% margin' : '') + '</div>'
      : '')
    + (j.quote_variance_notes
      ? '<div style="margin-top:8px;border:1px solid ' + BORDER + ';padding:10px;font-size:13px;"><b style="color:' + GREEN + ';">Discrepancy notes:</b> ' + esc_(j.quote_variance_notes) + '</div>'
      : '')
    + sectionTitle_('BILLING')
    + itemsTable_([[svcLine_(j), money_(finalCost != null ? finalCost : estAmt)]])
    + totals_(totalRows);

  return pageShell_('JOB SUMMARY', [
    ['JOB #', docNum_(j)],
    ['COMPLETED', longDate_(j.completed_at)],
    ['STATUS', j.paid ? 'Paid in full' : 'Awaiting payment'],
  ], inner, 'Internal job record — ' + COMPANY_NAME + '.');
}

// ---- template helpers ------------------------------------------------------
function section_(t) { return sectionTitle_(t); }
function kvTable_(rows) {
  var body = rows.map(function (r) {
    return '<tr><td width="30%" style="padding:8px 10px;border:1px solid ' + BORDER + ';border-top:0;font-size:11px;font-weight:bold;color:' + GREEN + ';letter-spacing:.4px;vertical-align:top;">' + esc_(String(r[0]).toUpperCase()) + '</td>'
      + '<td style="padding:8px 10px;border:1px solid ' + BORDER + ';border-top:0;border-left:0;font-size:13.5px;">' + esc_(r[1]) + '</td></tr>';
  }).join('');
  return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' + BORDER + ';">' + body + '</table>';
}
function th_(t, align) { return '<td style="padding:8px 10px;font-size:11px;font-weight:bold;color:#ffffff;letter-spacing:.5px;text-align:' + (align || 'left') + ';">' + esc_(t) + '</td>'; }
function td_(t, align) { return '<td style="padding:9px 10px;border:1px solid ' + BORDER + ';border-top:0;text-align:' + (align || 'left') + ';font-size:13.5px;">' + esc_(t) + '</td>'; }
function moneyRow_(label, a, b, diff) {
  return '<tr>' + td_(label) + td_(a != null ? money_(a) : '—', 'right') + td_(b != null ? money_(b) : '—', 'right')
    + td_(diff != null ? (diff >= 0 ? '+' : '') + money_(diff) : '—', 'right') + '</tr>';
}
function hoursRow_(label, a, b, diff, result) {
  var d = diff != null ? (diff >= 0 ? '+' : '') + diff + ' h' : '—';
  if (result) d += ' (' + cap_(result.replace('_', ' ')) + ')';
  return '<tr>' + td_(label) + td_(a != null ? a + ' h' : '—', 'right') + td_(b != null ? b + ' h' : '—', 'right') + td_(d, 'right') + '</tr>';
}

/** Combine many items into one document, each on its own page. */
function binderHtml_(title, items, renderFn) {
  var cover = '<div style="max-width:720px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;text-align:center;padding:150px 0;">'
    + '<img src="' + LOGO_URL + '" width="240" style="display:block;margin:0 auto 26px;max-width:240px;height:auto;border:0;">'
    + '<div style="font-size:26px;font-weight:bold;color:' + GREEN + ';letter-spacing:1px;">' + esc_(title) + '</div>'
    + '<div style="height:3px;width:180px;background:' + GREEN + ';margin:16px auto;"></div>'
    + '<div style="font-size:15px;color:#5a665f;">' + items.length + (items.length === 1 ? ' record' : ' records') + '</div>'
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
