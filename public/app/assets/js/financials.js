// Financials — the money command center. Build fees, collected, outstanding,
// MRR; one-click new invoice to any client/lead/prospect; record payments;
// editable statuses and amounts.
import { Clients, Invoices, Payments } from './db.js';
import { INVOICE_STATUS, INVOICE_TYPE, PAYMENT_KIND, INVOICE_NET_DAYS } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, labelOf, fmtDate,
  relDue, todayISO, emptyState, primaryBtn, selectInput, toast, confirmDialog,
  openSheet, field,
} from './ui.js';
import { openInvoiceForm } from './invoices.js';
import { openPaymentForm } from './client-detail.js';

const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '—';

export async function renderFinancials(root) {
  const state = { view: 'invoices', filter: 'all' };
  root.append(pageHeader('Financials', 'Build fees, retainers, payments'));

  const actions = el('div.toolbar', {}, [
    primaryBtn('New invoice', async () => openInvoiceForm({}, refreshAfter, null, await clients()), 'plus'),
    el('button.btn.btn-gold', { html: `${iconSvg('plus', 16)} Record payment`, onclick: async () => openPickClientThenPayment(await clients(), refreshAfter) }),
    el('button.btn.btn-ghost', { html: `${iconSvg('renew', 16)} Generate monthly`, title: 'Create this month’s retainer invoices', onclick: generateMonthly }),
  ]);
  root.append(actions);

  const summary = el('div');
  root.append(summary);

  const seg = el('div.segmented.mt-16');
  [['invoices', 'Invoices'], ['payments', 'Payments'], ['clients', 'By client']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let list = [], invoices = [], payments = [];
  let clientCache = null;
  async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
  async function load() {
    clientCache = null;
    [list, invoices, payments] = await Promise.all([clients(), Invoices.list({ order: { col: 'issued_on', asc: false } }), Payments.list({ order: { col: 'paid_on', asc: false } })]);
    markOverdue(invoices);
  }

  function refresh() {
    clear(summary); clear(wrap);
    const active = list.filter((c) => c.stage === 'client');
    const isBuildInv = (i) => i.type === 'build_fee' || i.type === 'one_time';

    // --- Bucket 1: Initial builds (one-time) ---
    const buildCollectedBy = {};
    payments.filter((p) => p.kind === 'build' || p.kind === 'deposit').forEach((p) => { buildCollectedBy[p.client_id] = (buildCollectedBy[p.client_id] || 0) + n(p.amount); });
    invoices.filter((i) => isBuildInv(i) && i.status === 'paid').forEach((i) => { buildCollectedBy[i.client_id] = (buildCollectedBy[i.client_id] || 0) + n(i.amount); });
    const buildFeesTotal = list.reduce((s, c) => s + n(c.build_fee), 0);
    const buildCollected = Object.values(buildCollectedBy).reduce((a, b) => a + b, 0)
      + payments.filter((p) => (p.kind === 'build' || p.kind === 'deposit') && !p.client_id).reduce((s, p) => s + n(p.amount), 0);
    const buildOutstanding = list.reduce((s, c) => s + (c.build_fee_paid ? 0 : Math.max(0, n(c.build_fee) - (buildCollectedBy[c.id] || 0))), 0);

    // --- Bucket 2: Monthly recurring ---
    const mrr = active.reduce((s, c) => s + n(c.mrr), 0);
    const monthlyCollectedMo = invoices.filter((i) => i.type === 'monthly' && i.status === 'paid' && i.paid_on && sameMonth(i.paid_on)).reduce((s, i) => s + n(i.amount), 0)
      + payments.filter((p) => p.kind === 'monthly' && p.paid_on && sameMonth(p.paid_on)).reduce((s, p) => s + n(p.amount), 0);
    const monthlyOutstanding = invoices.filter((i) => i.type === 'monthly' && (i.status === 'sent' || i.status === 'overdue')).reduce((s, i) => s + n(i.amount), 0);

    summary.append(el('div.section-title', {}, [el('h3', { text: 'Initial builds' })]));
    summary.append(el('div.grid.grid-3', {}, [
      el('div.stat', {}, [el('div.stat-value', { text: money(buildFeesTotal) }), el('div.stat-label', { text: 'Build fees' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(buildCollected) }), el('div.stat-label', { text: 'Collected' })]),
      el('div.stat' + (buildOutstanding ? '.stat-gold' : ''), {}, [el('div.stat-value', { text: money(buildOutstanding) }), el('div.stat-label', { text: 'Outstanding' })]),
    ]));
    summary.append(el('div.section-title', {}, [el('h3', { text: 'Monthly recurring' })]));
    summary.append(el('div.grid.grid-3', {}, [
      el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(mrr) }), el('div.stat-label', { text: 'MRR' }), el('div.stat-sub', { text: active.length + ' clients' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(monthlyCollectedMo) }), el('div.stat-label', { text: 'Collected (mo)' })]),
      el('div.stat' + (monthlyOutstanding ? '.stat-gold' : ''), {}, [el('div.stat-value', { text: money(monthlyOutstanding) }), el('div.stat-label', { text: 'Outstanding' })]),
    ]));

    if (state.view === 'invoices') viewInvoices();
    else if (state.view === 'payments') viewPayments();
    else viewByClient();
  }

  function viewInvoices() {
    const fseg = el('div.segmented');
    [['all', 'All'], ['sent', 'Sent'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Draft']].forEach(([k, l]) =>
      fseg.append(el('button.seg' + (state.filter === k ? '.on' : ''), { text: l, dataset: { f: k }, onclick: () => { state.filter = k; refresh(); } })));
    wrap.append(el('div.toolbar', {}, [fseg]));
    let items = invoices;
    if (state.filter !== 'all') items = items.filter((i) => i.status === state.filter);
    if (!items.length) { wrap.append(emptyState('No invoices.', 'money')); return; }
    const rows = el('div.rows.card');
    items.forEach((i) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openInvoiceForm(i, refreshAfter, null, list) }, [
        el('div.row-title', { text: (i.number ? i.number + ' · ' : '') + nameFor(list, i.client_id) }),
        el('div.row-sub', {}, [
          badge(labelOf(INVOICE_TYPE, i.type), 'gray'),
          i.description ? el('span', { text: i.description }) : null,
          i.status === 'paid' ? el('span.text-green', { text: 'paid ' + (i.paid_on ? fmtDate(i.paid_on) : '') }) : (i.due_on ? el('span', { class: due(i.due_on), text: 'due ' + relDue(i.due_on) }) : null),
        ]),
      ]),
      el('div.row-right', {}, [
        el('span.row-amount', { text: money(i.amount) }),
        (() => { const s = selectInput('status', INVOICE_STATUS, i.status); s.style.width = 'auto'; s.classList.add('btn-sm'); s.addEventListener('change', async () => { await Invoices.update(i.id, { status: s.value, paid_on: s.value === 'paid' ? todayISO() : null }); refreshAfter(); }); return s; })(),
      ]),
    ])));
    wrap.append(rows);
  }

  function viewPayments() {
    if (!payments.length) { wrap.append(emptyState('No payments recorded.', 'money')); return; }
    const rows = el('div.rows.card');
    payments.forEach((p) => rows.append(el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: money(p.amount) + ' · ' + nameFor(list, p.client_id) }),
        el('div.row-sub', {}, [badge(labelOf(PAYMENT_KIND, p.kind), 'green'), p.paid_on ? fmtDate(p.paid_on) : '', p.method || '', p.note || '']),
      ]),
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this payment?')) { await Payments.remove(p.id); refreshAfter(); } } }),
    ])));
    wrap.append(rows);
  }

  function viewByClient() {
    const clientsWithMoney = list.filter((c) => c.stage === 'client' || invoices.some((i) => i.client_id === c.id) || payments.some((p) => p.client_id === c.id));
    if (!clientsWithMoney.length) { wrap.append(emptyState('No client financials yet.', 'users')); return; }
    const rows = el('div.rows.card');
    clientsWithMoney.forEach((c) => {
      const open = invoices.filter((i) => i.client_id === c.id && (i.status === 'sent' || i.status === 'overdue')).reduce((s, i) => s + n(i.amount), 0);
      const collected = invoices.filter((i) => i.client_id === c.id && i.status === 'paid').reduce((s, i) => s + n(i.amount), 0)
        + payments.filter((p) => p.client_id === c.id).reduce((s, p) => s + n(p.amount), 0);
      rows.append(el('div.row', {}, [
        el('div.row-main', {}, [
          el('div.row-title', { text: c.business_name }),
          el('div.row-sub', {}, [c.mrr ? badge(money(c.mrr) + '/mo', 'green') : null, el('span.muted', { text: 'collected ' + money(collected) })]),
        ]),
        el('div.row-right', {}, [open ? badge(money(open) + ' owed', 'amber') : badge('paid up', 'green')]),
      ]));
    });
    wrap.append(rows);
  }

  // One-tap: create this month's monthly retainer invoice for every active
  // client with an MRR that hasn't already been billed this month. Saved as
  // drafts so you review before sending.
  async function generateMonthly() {
    const now = new Date();
    const monthKey = now.toISOString().slice(0, 7);
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const billed = new Set(invoices.filter((i) => i.type === 'monthly' && (i.issued_on || '').slice(0, 7) === monthKey).map((i) => i.client_id));
    const targets = list.filter((c) => c.stage === 'client' && n(c.mrr) > 0 && !billed.has(c.id));
    if (!targets.length) { toast(`All active clients already invoiced for ${monthName}`); return; }
    if (!await confirmDialog(`Create ${targets.length} monthly invoice${targets.length > 1 ? 's' : ''} for ${monthName}? They’ll be saved as drafts for you to review and send.`, { confirmLabel: 'Create drafts' })) return;
    let maxNum = invoices.reduce((m, i) => { const mm = /(\d+)/.exec(i.number || ''); return mm ? Math.max(m, parseInt(mm[1], 10)) : m; }, 0);
    const due = new Date(now); due.setDate(due.getDate() + INVOICE_NET_DAYS);
    const dueStr = due.toISOString().slice(0, 10);
    try {
      for (const c of targets) {
        maxNum += 1;
        const label = `${monthName} — Monthly management`;
        await Invoices.create({ client_id: c.id, number: 'INV-' + String(maxNum).padStart(4, '0'), type: 'monthly', amount: n(c.mrr), status: 'draft', method: 'Relay', issued_on: todayISO(), due_on: dueStr, description: label, items: [{ label, amount: n(c.mrr) }] });
      }
      toast(`Created ${targets.length} draft invoice${targets.length > 1 ? 's' : ''}`);
      refreshAfter();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}

// Pick a client, then record a payment for them.
function openPickClientThenPayment(list, onSaved) {
  const sel = selectInput('client_id', [{ key: '', label: '— Select client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))], '');
  const { close } = openSheet({
    title: 'Record payment — pick client', body: field('Client', sel),
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Next', tone: 'primary', onClick: () => {
        if (!sel.value) { toast('Pick a client', 'err'); return; }
        const cid = sel.value; close();
        openPaymentForm({ client_id: cid }, onSaved);
      } },
    ],
  });
}

const n = (x) => Number(x || 0);
function sameMonth(d) { const now = new Date(); const x = new Date(d + 'T00:00:00'); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }
function due(date) { const d = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000; return d < 0 ? 'text-red' : d <= 5 ? 'text-amber' : 'muted'; }
function markOverdue(items) { const t = todayISO(); items.forEach((i) => { if (i.status === 'sent' && i.due_on && i.due_on < t) i.status = 'overdue'; }); }
