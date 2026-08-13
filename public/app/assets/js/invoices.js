// Invoices — build fees, monthly retainers, one-offs, and payment status.
// Money summary up top. Exports openInvoiceForm for the client detail sheet.
import { Invoices, Clients } from './db.js';
import { INVOICE_STATUS, INVOICE_TYPE } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, relDue, fmtDate,
  todayISO, emptyState, primaryBtn, field, textInput, numberInput, textArea,
  selectInput, dateInput, readForm, openSheet, toast, confirmDialog, labelOf,
} from './ui.js';

let clientCache = null;
async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
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
          i.description ? el('span', { text: i.description }) : null,
          i.status === 'paid' ? el('span.text-green', { text: 'paid ' + (i.paid_on ? fmtDate(i.paid_on) : '') }) : (i.due_on ? el('span', { class: dueClass(i.due_on), text: 'due ' + relDue(i.due_on) }) : null),
        ]),
      ]),
      el('div.row-right', {}, [
        el('span.row-amount', { text: money(i.amount) }),
        (() => { const s = selectInput('status', INVOICE_STATUS, i.status); s.style.width = 'auto'; s.classList.add('btn-sm');
          s.addEventListener('change', async () => { await Invoices.update(i.id, { status: s.value, paid_on: s.value === 'paid' ? todayISO() : null }); refreshAfter(); }); return s; })(),
      ]),
    ]);
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}

// Shared invoice create/edit sheet.
export async function openInvoiceForm(existing = {}, onSaved, client, clientList) {
  const list = clientList || await clients();
  const isNew = !existing.id;
  const clientOptions = [{ key: '', label: '— No client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOptions, existing.client_id || (client && client.id) || '')),
      field('Invoice #', textInput('number', existing.number, { placeholder: 'INV-001' })),
      field('Type', selectInput('type', INVOICE_TYPE, existing.type || 'monthly')),
      field('Amount', numberInput('amount', existing.amount ?? '', { placeholder: '0' })),
      field('Status', selectInput('status', INVOICE_STATUS, existing.status || 'draft')),
      field('Method', textInput('method', existing.method, { placeholder: 'Relay / QuickBooks / card' })),
      field('Issued', dateInput('issued_on', existing.issued_on || todayISO())),
      field('Due', dateInput('due_on', existing.due_on)),
    ]),
    field('Description', textInput('description', existing.description, { placeholder: 'What is this for?' })),
  ]);
  const { close } = openSheet({
    title: isNew ? 'New invoice' : 'Edit invoice', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: isNew ? 'Add' : 'Save', tone: 'primary', onClick: async () => {
        const v = readForm(node);
        v.amount = Number(v.amount || 0);
        if (!v.client_id) v.client_id = null;
        if (v.status === 'paid' && !v.paid_on) v.paid_on = todayISO();
        try { isNew ? await Invoices.create(v) : await Invoices.update(existing.id, v); toast('Saved'); close(); clientCache = null; onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this invoice?')) { await Invoices.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}

const n = (x) => Number(x || 0);
function sameMonth(d) { const now = new Date(); const x = new Date(d + 'T00:00:00'); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }
function dueClass(date) { const d = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000; return d < 0 ? 'text-red' : d <= 5 ? 'text-amber' : 'muted'; }
function markOverdue(list) { const t = todayISO(); list.forEach((i) => { if (i.status === 'sent' && i.due_on && i.due_on < t) i.status = 'overdue'; }); }
