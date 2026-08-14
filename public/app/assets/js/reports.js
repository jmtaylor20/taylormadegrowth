// Reports — monthly client growth reports. Enter the month's metrics (most
// language prefilled), then Send to email the client a branded report and file
// it to Drive. Same pipeline as proposals/invoices.
import { Reports, Clients } from './db.js';
import {
  REPORT_METRICS, REPORT_HIGHLIGHTS_TEMPLATE, REPORT_NEXTSTEPS_TEMPLATE, BUSINESS,
} from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, fmtDate, money, emptyState, primaryBtn,
  field, textInput, numberInput, textArea, selectInput, readForm, openSheet,
  toast, confirmDialog,
} from './ui.js';
import { queueDoc, docBadges } from './docs.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: MONTHS[d.getMonth()] + ' ' + d.getFullYear(), label: MONTHS[d.getMonth()] + ' ' + d.getFullYear() });
  }
  return out;
}
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '—';

export async function renderReports(root) {
  root.append(pageHeader('Reports', 'Monthly client growth reports', primaryBtn('New report', async () => openReportForm({}, refreshAfter, await clients()), 'plus')));
  const wrap = el('div');
  root.append(wrap);

  let list = [], reports = [];
  let clientCache = null;
  async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
  async function load() { clientCache = null; [list, reports] = await Promise.all([clients(), Reports.list({ order: { col: 'created_at', asc: false } })]); }

  function refresh() {
    clear(wrap);
    const activeClients = list.filter((c) => c.stage === 'client');
    if (!reports.length) {
      wrap.append(el('div.banner', { html: 'Create a monthly report: pick a client, drop in the metrics (impressions, clicks, CTR, conversions…), and Send — it emails a branded report and files it to Drive.' }));
    }
    if (reports.length) {
      const rows = el('div.rows.card');
      reports.forEach((r) => rows.append(el('div.row', {}, [
        el('div.row-main', { style: 'cursor:pointer', onclick: () => openReportForm(r, refreshAfter, list) }, [
          el('div.row-title', { text: nameFor(list, r.client_id) + ' — ' + (r.period || 'Report') }),
          el('div.row-sub', {}, [fmtDate(r.created_at), ...docBadges(r)]),
        ]),
        el('div.row-right', {}, [
          el('button.icon-btn', { title: 'Send to client (email + Drive)', html: iconSvg('send', 18), onclick: () => queueDoc(Reports, r, list.find((c) => c.id === r.client_id), { send: true, drive: true }, refreshAfter) }),
          el('button.icon-btn', { title: 'Preview', html: iconSvg('external', 18), onclick: () => previewReport(r, nameFor(list, r.client_id)) }),
        ]),
      ])));
      wrap.append(el('div.section-title', {}, [el('h3', { text: 'Recent reports' })]));
      wrap.append(rows);
    }
    // quick "new report for…" list of active clients
    if (activeClients.length) {
      wrap.append(el('div.section-title', {}, [el('h3', { text: 'New report for…' })]));
      const grid = el('div.rows.card');
      activeClients.forEach((c) => grid.append(el('div.row.clickable', { onclick: () => openReportForm({ client_id: c.id }, refreshAfter, list) }, [
        el('div.row-main', {}, [el('div.row-title', { text: c.business_name })]),
        el('span.icon-btn', { html: iconSvg('plus', 18) }),
      ])));
      wrap.append(grid);
    } else if (!reports.length) {
      wrap.append(emptyState('Add an active client first.', 'report'));
    }
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}

function openReportForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const M = existing.metrics || {};
  const clientOptions = [{ key: '', label: '— Select client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];

  // metric number inputs (2-col grid)
  const metricFields = REPORT_METRICS.map((m) => field(m.label + (m.suffix ? ` (${m.suffix})` : m.prefix ? ` (${m.prefix})` : ''), numberInput('mx_' + m.key, M[m.key] ?? '', { placeholder: '—' })));

  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOptions, existing.client_id || '')),
      field('Period', selectInput('period', monthOptions(), existing.period || monthOptions()[0].key)),
    ]),
    field('Highlights (intro)', textArea('highlights', existing.highlights ?? REPORT_HIGHLIGHTS_TEMPLATE, { rows: 3 })),
    el('div.section-title', {}, [el('h3', { text: 'Metrics' }), el('span.field-hint', { text: 'Leave any blank to omit' })]),
    el('div.form-grid.cols-2', {}, metricFields),
    field('Notes (anything else worth sharing)', textArea('notes', existing.notes, { rows: 3, placeholder: 'Wins, context, what a number means…' })),
    field('What’s next', textArea('next_steps', existing.next_steps ?? REPORT_NEXTSTEPS_TEMPLATE, { rows: 2 })),
  ]);

  function collect() {
    const v = readForm(node);
    const metrics = {};
    REPORT_METRICS.forEach((m) => { const val = v['mx_' + m.key]; delete v['mx_' + m.key]; if (val != null && val !== '') metrics[m.key] = Number(val); });
    // auto CTR if clicks + impressions given and CTR blank
    if ((metrics.ctr == null) && metrics.clicks != null && metrics.impressions) metrics.ctr = Math.round((metrics.clicks / metrics.impressions) * 1000) / 10;
    v.metrics = metrics;
    if (!v.client_id) v.client_id = null;
    return v;
  }

  const { close } = openSheet({
    title: isNew ? 'New report' : 'Edit report', body: node, wide: true,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Preview', tone: 'ghost', onClick: () => { const v = collect(); previewReport({ ...existing, ...v }, nameFor(list, v.client_id)); } },
      { label: isNew ? 'Save' : 'Save', tone: 'primary', onClick: async () => {
        const v = collect();
        if (!v.client_id) { toast('Pick a client', 'err'); return; }
        try { isNew ? await Reports.create(v) : await Reports.update(existing.id, v); toast('Saved'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this report?')) { await Reports.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}

function fmtMetric(v, m) {
  const num = Number(v);
  const s = m.key === 'ctr' ? num.toLocaleString('en-US', { maximumFractionDigits: 1 }) : num.toLocaleString('en-US');
  return (m.prefix || '') + s + (m.suffix || '');
}

// Branded monthly-report HTML (shared shape with the Apps Script PDF).
export function reportDocHtml(r, clientName, opts = {}) {
  const logo = opts.logo || 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  const metrics = r.metrics || {};
  const shown = REPORT_METRICS.filter((m) => metrics[m.key] != null && metrics[m.key] !== '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tiles = shown.map((m) => `<div class="tile"><div class="tv">${esc(fmtMetric(metrics[m.key], m))}</div><div class="tl">${esc(m.label)}</div></div>`).join('') || '<div class="muted">No metrics entered.</div>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(clientName)} — ${esc(r.period || 'Report')}</title><style>
    *{box-sizing:border-box}html,body{margin:0}
    body{font-family:Georgia,'Times New Roman',serif;color:#1b1b1b;background:#fff}
    .page{max-width:720px;margin:0 auto;padding:24px 10px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid #13294b;padding-bottom:16px}
    .logo{width:220px;height:auto}.contact{text-align:right;font-size:12.5px;line-height:1.5;color:#333}
    .eyebrow{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:3px;font-size:12px;color:#b98d1a;margin-top:22px}
    h1{font-family:Arial,Helvetica,sans-serif;font-size:28px;color:#0d1b30;margin:3px 0 6px}.subline{font-size:14.5px;color:#444}
    .sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-size:12.5px;color:#0d1b30;border-bottom:1.5px solid #0d1b30;padding-bottom:4px;margin:22px 0 12px;page-break-after:avoid}
    .body{font-size:15px;line-height:1.6;margin:0 0 10px}
    .grid{display:flex;flex-wrap:wrap;gap:12px}
    .tile{border:1.5px solid #d8dbe2;border-radius:12px;padding:14px 16px;min-width:150px;flex:1;page-break-inside:avoid}
    .tile .tv{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:24px;color:#0d1b30}
    .tile .tl{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#666;font-family:Arial,Helvetica,sans-serif;margin-top:3px}
    .muted{color:#888}.body,.tile{page-break-inside:avoid}
    .foot{margin-top:26px;border-top:1px solid #e4e4e4;padding-top:12px;text-align:center;color:#888;font-size:12px;font-family:Arial,Helvetica,sans-serif}
    @page{margin:0.5in}
  </style></head><body><div class="page">
    <div class="top"><img class="logo" src="${logo}" alt="TaylorMade Brands"><div class="contact">${esc(BUSINESS.name)}<br>${esc(BUSINESS.phone)}<br>${esc(BUSINESS.email)}</div></div>
    <div class="eyebrow">MONTHLY GROWTH REPORT</div>
    <h1>${esc(clientName || 'Your business')}</h1>
    <div class="subline">${esc(r.period || '')}</div>
    ${r.highlights ? '<div class="sec">Highlights</div><p class="body">' + esc(r.highlights) + '</p>' : ''}
    <div class="sec">The Numbers</div>
    <div class="grid">${tiles}</div>
    ${r.notes ? '<div class="sec">Notes</div><p class="body">' + esc(r.notes) + '</p>' : ''}
    ${r.next_steps ? '<div class="sec">What’s Next</div><p class="body">' + esc(r.next_steps) + '</p>' : ''}
    <div class="foot">${esc(BUSINESS.name)} · ${esc(BUSINESS.website)} · Growing your business, together.</div>
  </div></body></html>`;
}

function previewReport(r, clientName) {
  const w = window.open('', '_blank', 'width=880,height=1040');
  if (!w) { toast('Allow pop-ups to preview', 'err'); return; }
  w.document.write(reportDocHtml(r, clientName)); w.document.close();
}
