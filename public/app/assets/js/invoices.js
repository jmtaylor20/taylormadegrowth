// Invoices — build fees, monthly retainers, one-offs, and payment status.
// Money summary up top. Exports openInvoiceForm for the client detail sheet.
import { Invoices, Clients, Contractors } from './db.js';
import { INVOICE_STATUS, INVOICE_TYPE, BUSINESS, FEATURES } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, relDue, fmtDate,
  todayISO, emptyState, primaryBtn, field, textInput, numberInput, textArea,
  selectInput, dateInput, readForm, openSheet, toast, confirmDialog, labelOf,
} from './ui.js';
import { queueDoc, docBadges } from './docs.js';

let clientCache = null;
async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
let contractorCache = null;
async function contractorsList() { if (!contractorCache) contractorCache = await Contractors.list({ order: { col: 'name', asc: true } }); return contractorCache; }
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '—';

export async function renderInvoices(root) {
  const state = { filter: 'all' };
  root.append(pageHeader('Invoices', 'Billing & payment status', primaryBtn('New', async () => openInvoiceForm({}, refreshAfter, null, await clients()), 'plus')));

  const summary = el('div.grid.grid-4');
  root.append(summary);

  const toolbar = el('div.toolbar.mt-16');
  const seg = el('div.segmented');
  [['all', 'All'], ['sent', 'Sent'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Draft']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.filter === k ? '.on' : ''), { text: l, dataset: { f: k }, onclick: () => { state.filter = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.f === k)); refresh(); } })));
  toolbar.append(seg);
  root.append(toolbar);

  const wrap = el('div');
  root.append(wrap);

  let all = [], list = [];
  async function load() { [all, list] = await Promise.all([Invoices.list({ order: { col: 'issued_on', asc: false } }), clients()]); markOverdue(all); }

  function refresh() {
    clear(summary); clear(wrap);
    const paidThisMonth = all.filter((i) => i.status === 'paid' && i.paid_on && sameMonth(i.paid_on)).reduce((s, i) => s + n(i.amount), 0);
    const outstanding = all.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + n(i.amount), 0);
    const overdue = all.filter((i) => i.status === 'overdue').reduce((s, i) => s + n(i.amount), 0);
    const buildFees = all.filter((i) => i.type === 'build_fee').reduce((s, i) => s + n(i.amount), 0);
    summary.append(
      el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(paidThisMonth) }), el('div.stat-label', { text: 'Paid this month' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(outstanding) }), el('div.stat-label', { text: 'Outstanding' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(overdue) }), el('div.stat-label', { text: 'Overdue' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(buildFees) }), el('div.stat-label', { text: 'Build fees (all)' })]),
    );

    let items = all;
    if (state.filter !== 'all') items = items.filter((i) => i.status === state.filter);
    if (!items.length) { wrap.append(emptyState('No invoices here.', 'money')); return; }
    const rows = el('div.rows.card');
    items.forEach((i) => rows.append(row(i)));
    wrap.append(rows);
  }

  function row(i) {
    return el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openInvoiceForm(i, refreshAfter, null, list) }, [
        el('div.row-title', { text: (i.number ? i.number + ' · ' : '') + nameFor(list, i.client_id) }),
        el('div.row-sub', {}, [
          badge(labelOf(INVOICE_TYPE, i.type), 'gray'),
          i.rep ? badge(i.rep + ' ' + Math.round((i.rep_pct || 0) * 100) + '%', 'violet') : null,
          i.description ? el('span', { text: i.description }) : null,
          i.status === 'paid' ? el('span.text-green', { text: 'paid ' + (i.paid_on ? fmtDate(i.paid_on) : '') }) : (i.due_on ? el('span', { class: dueClass(i.due_on), text: 'due ' + relDue(i.due_on) }) : null),
          ...docBadges(i),
        ]),
      ]),
      el('div.row-right', {}, [
        el('span.row-amount', { text: money(i.amount) }),
        el('button.icon-btn', { title: 'Send to client (PDF email + save to Drive)', html: iconSvg('send', 18), onclick: () => queueDoc(Invoices, i, list.find((c) => c.id === i.client_id), { send: true, drive: true }, refreshAfter) }),
        el('button.icon-btn', { title: 'Save to Google Drive', html: iconSvg('cloud', 18), onclick: () => queueDoc(Invoices, i, list.find((c) => c.id === i.client_id), { drive: true }, refreshAfter) }),
        (() => { const s = selectInput('status', INVOICE_STATUS, i.status); s.style.width = 'auto'; s.classList.add('btn-sm');
          s.addEventListener('change', async () => { await Invoices.update(i.id, { status: s.value, paid_on: s.value === 'paid' ? todayISO() : null }); refreshAfter(); }); return s; })(),
      ]),
    ]);
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}

// Shared invoice create/edit sheet — with line items (base retainer + add-ons).
export async function openInvoiceForm(existing = {}, onSaved, client, clientList) {
  const list = clientList || await clients();
  const isNew = !existing.id;
  const clientOptions = [{ key: '', label: '— No client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];

  // ---- Contractor / rev-share ----
  const reps = (await contractorsList()).filter((r) => r.active !== false);
  const repOptions = [{ key: '', label: 'Just me — no split' }, ...reps.map((r) => ({ key: r.name, label: `${r.name} (${Math.round((r.split_pct || 0) * 100)}% to them)` }))];
  const repSelect = selectInput('rep', repOptions, existing.rep || '');
  const splitEl = el('div.field-hint.mt-8');
  const repPctFor = (name) => { const r = reps.find((x) => x.name === name); return r ? Number(r.split_pct) : (name && name === existing.rep ? Number(existing.rep_pct || 0) : 0); };
  function updateSplit() {
    const rep = repSelect.value;
    const total = currentItems().reduce((s, i) => s + i.amount, 0);
    if (!rep || !total) { splitEl.style.display = 'none'; return; }
    const pct = repPctFor(rep); const theirs = total * pct;
    splitEl.style.display = '';
    splitEl.textContent = `Split: ${rep} gets ${money(theirs)} (${Math.round(pct * 100)}%) · you keep ${money(total - theirs)}`;
  }
  repSelect.addEventListener('change', updateSplit);

  // ---- Line items editor ----
  const startItems = (existing.items && existing.items.length)
    ? existing.items
    : [{ label: existing.description || '', amount: existing.amount ?? '' }];
  const itemsWrap = el('div.inv-items');
  const totalEl = el('span.row-amount');
  function recalc() { totalEl.textContent = money(currentItems().reduce((s, i) => s + i.amount, 0)); updateSplit(); }
  function currentItems() { return [...itemsWrap.children].map((r) => r._get()).filter((i) => i.label || i.amount); }
  function itemRow(it) {
    const label = el('input.input', { value: it.label || '', placeholder: 'e.g. Monthly management, extra blog post' });
    const amt = el('input.input', { type: 'number', step: '0.01', value: it.amount ?? '', placeholder: '0', style: 'max-width:104px', oninput: recalc });
    const row = el('div.field-row', { style: 'gap:8px;align-items:center' }, [
      label, amt,
      el('button.icon-btn', { type: 'button', title: 'Remove', html: iconSvg('trash', 15), onclick: () => { row.remove(); recalc(); } }),
    ]);
    row._get = () => ({ label: label.value.trim(), amount: Number(amt.value || 0) });
    return row;
  }
  startItems.forEach((it) => itemsWrap.append(itemRow(it)));

  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOptions, existing.client_id || (client && client.id) || '')),
      field('Contact person', textInput('contact_name', existing.contact_name, { placeholder: 'Customer contact name' })),
      FEATURES.repPicker ? field('Contractor / rep', repSelect) : null,
      field('Invoice #', textInput('number', existing.number, { placeholder: 'INV-001' })),
      field('Type', selectInput('type', INVOICE_TYPE, existing.type || 'monthly')),
      field('Status', selectInput('status', INVOICE_STATUS, existing.status || 'draft')),
      field('Method', textInput('method', existing.method, { placeholder: 'Relay / QuickBooks / card' })),
      field('Issued', dateInput('issued_on', existing.issued_on || todayISO())),
      field('Due', dateInput('due_on', existing.due_on)),
    ]),
    field('Line items', el('div', {}, [
      itemsWrap,
      el('div.field-row', { style: 'justify-content:space-between;align-items:center;margin-top:8px' }, [
        el('button.btn.btn-ghost.btn-sm', { type: 'button', html: iconSvg('plus', 14) + ' Add item', onclick: () => itemsWrap.append(itemRow({})) }),
        el('div', {}, [el('span.field-hint', { text: 'Total ' }), totalEl]),
      ]),
      splitEl,
    ])),
  ]);
  recalc();

  function collect() {
    const v = readForm(node);
    const items = currentItems();
    v.items = items.length ? items : null;
    v.amount = items.reduce((s, i) => s + i.amount, 0);
    v.description = items.map((i) => i.label).filter(Boolean).join(', ') || null;
    if (!v.client_id) v.client_id = null;
    v.contact_name = v.contact_name || null;
    // Rep split: keep the historical % on edit unless the rep changed.
    if (v.rep) v.rep_pct = (v.rep === existing.rep && existing.rep_pct != null) ? existing.rep_pct : (repPctFor(v.rep) || null);
    else { v.rep = null; v.rep_pct = null; }
    if (v.status === 'paid' && !v.paid_on) v.paid_on = todayISO();
    return v;
  }

  const { close } = openSheet({
    title: isNew ? 'New invoice' : 'Edit invoice', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Preview', tone: 'ghost', onClick: () => { const v = collect(); previewInvoice({ ...existing, ...v }, list.find((c) => c.id === v.client_id) || {}); } },
      { label: isNew ? 'Add' : 'Save', tone: 'primary', onClick: async () => {
        const v = collect();
        if (!v.amount) { toast('Add at least one line item', 'err'); return; }
        try { isNew ? await Invoices.create(v) : await Invoices.update(existing.id, v); toast('Saved'); close(); clientCache = null; onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this invoice?')) { await Invoices.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}

// Branded invoice HTML (mirrors the Apps Script PDF) for in-app preview.
export function invoiceDocHtml(inv, client = {}) {
  const logo = 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = (inv.items && inv.items.length) ? inv.items : [{ label: inv.description || labelOf(INVOICE_TYPE, inv.type), amount: inv.amount }];
  const total = items.reduce((s, it) => s + Number(it.amount || 0), 0) || Number(inv.amount || 0);
  const cityState = [client.city, client.state].filter(Boolean).join(', ');
  const rows = items.map((it) => `<tr><td>${esc(it.label || '')}</td><td class="r">${money(Number(it.amount || 0))}</td></tr>`).join('');
  const detail = (l, v) => `<div class="drow"><span class="dl">${esc(l)}</span> <span>${esc(v || '—')}</span></div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0}body{font-family:Georgia,'Times New Roman',serif;color:#1c1c1c}
    .frame{border:2px solid #dcdcdc;padding:20px 30px 22px;margin:12px;max-width:720px}
    .top{display:flex;justify-content:space-between}.logo{width:238px;height:auto}
    .contact{text-align:right;font-size:12.5px;line-height:1.5;color:#2a2a2a}
    .title{text-align:center;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:27px;letter-spacing:3px;margin:6px 0 14px;color:#111}
    .sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:12px;letter-spacing:1.2px;color:#111;border-bottom:1.5px solid #111;padding-bottom:3px;margin:14px 0 8px}
    .cols{display:flex;justify-content:space-between}.col{font-size:13.5px;line-height:1.6}.col.right{text-align:right}
    .billname{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px}
    .drow{margin:1px 0}.dl{font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:12px}
    table{width:100%;border-collapse:collapse;margin:16px 0}th,td{padding:9px 4px;border-bottom:1px solid #e0e0e0;font-size:13.5px}
    th{text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.04em;color:#555}
    th.r,td.r{text-align:right}tfoot td{font-weight:800;font-family:Arial,Helvetica,sans-serif;border-top:2px solid #111;border-bottom:0;font-size:15px}
    .pay{font-size:13px;color:#444}.foot{margin-top:20px;text-align:center;color:#888;font-size:11px;font-family:Arial}
  </style></head><body><div class="frame">
    <div class="top"><img class="logo" src="${logo}"><div class="contact">${esc(BUSINESS.address1)}<br>${esc(BUSINESS.address2)}<br>${esc(BUSINESS.phone)}<br>${esc(BUSINESS.email)}</div></div>
    <div class="title">INVOICE</div>
    <div class="cols">
      <div class="col"><div class="sec" style="margin-top:0">BILL TO</div><div class="billname">${esc(client.business_name || '')}</div>${(inv.contact_name || client.contact_name) ? esc(inv.contact_name || client.contact_name) + '<br>' : ''}${esc(cityState)}</div>
      <div class="col right"><div class="sec" style="margin-top:0">DETAILS</div>${detail('Invoice #', inv.number)}${detail('Issued', inv.issued_on)}${detail('Due', inv.due_on)}</div>
    </div>
    <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>Total due</td><td class="r">${money(total)}</td></tr></tfoot></table>
    ${inv.method ? `<div class="pay">Payment method: ${esc(inv.method)}</div>` : ''}
    <div class="foot">Thank you for your business.  ${esc(BUSINESS.name)} · ${esc(BUSINESS.website)}</div>
  </div></body></html>`;
}

function previewInvoice(inv, client) {
  const w = window.open('', '_blank', 'width=880,height=1040');
  if (!w) { toast('Allow pop-ups to preview', 'err'); return; }
  w.document.write(invoiceDocHtml(inv, client)); w.document.close();
}

const n = (x) => Number(x || 0);
function sameMonth(d) { const now = new Date(); const x = new Date(d + 'T00:00:00'); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }
function dueClass(date) { const d = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000; return d < 0 ? 'text-red' : d <= 5 ? 'text-amber' : 'muted'; }
function markOverdue(list) { const t = todayISO(); list.forEach((i) => { if (i.status === 'sent' && i.due_on && i.due_on < t) i.status = 'overdue'; }); }
