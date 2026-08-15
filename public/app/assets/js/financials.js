// Financials — the money command center. Build fees, collected, outstanding,
// MRR; one-click new invoice to any client/lead/prospect; record payments;
// editable statuses and amounts.
import { Clients, Invoices, Payments, Expenses, Trips, getSetting, setSetting } from './db.js';
import { INVOICE_STATUS, INVOICE_TYPE, PAYMENT_KIND, INVOICE_NET_DAYS, ALLOCATION, mileageRateFor } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, labelOf, fmtDate,
  relDue, todayISO, emptyState, primaryBtn, selectInput, numberInput, toast, confirmDialog,
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
    el('button.btn.btn-ghost', { html: `${iconSvg('wallet', 16)} Split deposit`, title: 'Allocate an incoming payment across your buckets', onclick: async () => openSplitDeposit(await clients()) }),
  ]);
  root.append(actions);

  const summary = el('div');
  root.append(summary);

  const seg = el('div.segmented.mt-16');
  [['invoices', 'Invoices'], ['payments', 'Payments'], ['clients', 'By client'], ['taxes', 'Taxes']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let list = [], invoices = [], payments = [], expenses = [], trips = [], taxRate = 0.25, taxReserve = 0, taxApr = 0;
  let clientCache = null;
  async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
  async function load() {
    clientCache = null;
    let tax;
    [list, invoices, payments, expenses, trips, tax] = await Promise.all([
      clients(), Invoices.list({ order: { col: 'issued_on', asc: false } }), Payments.list({ order: { col: 'paid_on', asc: false } }),
      Expenses.list(), Trips.list(), getSetting('tax', { effective_rate: 0.25 }),
    ]);
    taxRate = Number(tax.effective_rate) || 0.25;
    taxReserve = Number(tax.reserve_balance) || 0;
    taxApr = Number(tax.reserve_apr) || 0;
    markOverdue(invoices);
  }

  function refresh() {
    clear(summary); clear(wrap);
    const active = list.filter((c) => c.stage === 'client');
    const isBuildInv = (i) => i.type === 'build_fee' || i.type === 'one_time';

    // --- Bucket 1: Initial builds (one-time) ---
    // Only signed clients count toward build-fee totals — leads/prospects have
    // quoted build fees but haven't accepted, so they must not inflate the money.
    const billableIds = new Set(active.map((c) => c.id));
    const buildCollectedBy = {};
    payments.filter((p) => (p.kind === 'build' || p.kind === 'deposit') && billableIds.has(p.client_id)).forEach((p) => { buildCollectedBy[p.client_id] = (buildCollectedBy[p.client_id] || 0) + n(p.amount); });
    invoices.filter((i) => isBuildInv(i) && i.status === 'paid' && billableIds.has(i.client_id)).forEach((i) => { buildCollectedBy[i.client_id] = (buildCollectedBy[i.client_id] || 0) + n(i.amount); });
    const buildFeesTotal = active.reduce((s, c) => s + n(c.build_fee), 0);
    const buildCollected = Object.values(buildCollectedBy).reduce((a, b) => a + b, 0);
    const buildOutstanding = active.reduce((s, c) => s + (c.build_fee_paid ? 0 : Math.max(0, n(c.build_fee) - (buildCollectedBy[c.id] || 0))), 0);

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
    else if (state.view === 'taxes') viewTaxes();
    else viewByClient();
  }

  // Rolling tax estimate: net profit (income − deductions) × effective rate.
  function viewTaxes() {
    const yr = String(new Date().getFullYear());
    const inYr = (d) => (d || '').slice(0, 4) === yr;
    const st = (v, l, sub, tone) => el('div.stat' + (tone ? '.stat-' + tone : ''), {}, [el('div.stat-value', { text: v }), el('div.stat-label', { text: l }), sub ? el('div.stat-sub', { text: sub }) : null]);

    const incomeInv = invoices.filter((i) => i.status === 'paid' && inYr(i.paid_on || i.issued_on)).reduce((s, i) => s + n(i.amount), 0);
    const incomePay = payments.filter((p) => inYr(p.paid_on)).reduce((s, p) => s + n(p.amount), 0);
    const income = incomeInv + incomePay;
    const expTotal = expenses.filter((e) => inYr(e.expense_date)).reduce((s, e) => s + n(e.amount), 0);
    const mileageDed = trips.filter((t) => inYr(t.trip_date)).reduce((s, t) => s + n(t.miles) * (t.rate == null ? mileageRateFor(t.trip_date) : n(t.rate)), 0);
    const deductions = expTotal + mileageDed;
    const net = Math.max(0, income - deductions);
    const estTax = net * taxRate;
    // Annualize from the first month with activity this year (so a mid-year
    // start doesn't understate the projection).
    const curMonth = new Date().getMonth() + 1;
    const months = [];
    const pushM = (d) => { if (inYr(d)) months.push(Number((d || '').slice(5, 7))); };
    invoices.forEach((i) => { if (i.status === 'paid') pushM(i.paid_on || i.issued_on); });
    payments.forEach((p) => pushM(p.paid_on));
    expenses.forEach((e) => pushM(e.expense_date));
    trips.forEach((t) => pushM(t.trip_date));
    const monthsActive = Math.max(1, curMonth - (months.length ? Math.min.apply(null, months) : curMonth) + 1);
    const projTax = (net / monthsActive) * 12 * taxRate;

    wrap.append(el('div.section-title', {}, [el('h3', { text: `${yr} so far` })]));
    wrap.append(el('div.statstrip', {}, [
      st(money(income), 'Income'),
      st(money(deductions), 'Deductions'),
      st(money(net), 'Net profit'),
    ]));
    wrap.append(el('div.section-title', {}, [el('h3', { text: 'Estimated tax to set aside' })]));
    wrap.append(el('div.grid.grid-3', {}, [
      st(money(estTax), 'Owed so far (YTD)', Math.round(taxRate * 100) + '% effective', 'gold'),
      st(money(projTax), 'Projected full year'),
      st(money(mileageDed), 'Mileage deduction'),
    ]));

    // Actual reserve vs. what you should have set aside so far.
    const cushion = taxReserve - estTax;
    const interestYr = taxReserve * taxApr;
    wrap.append(el('div.section-title', {}, [el('h3', { text: 'Your tax reserve' })]));
    wrap.append(el('div.grid.grid-3', {}, [
      st(money(taxReserve), 'In tax account', taxApr ? (Math.round(taxApr * 1000) / 10) + '% APY' : null, 'gold'),
      st(money(estTax), 'Target (YTD)'),
      st((cushion >= 0 ? '+' : '−') + money(Math.abs(cushion)), cushion >= 0 ? 'Cushion (ahead)' : 'Short — set aside', null, cushion >= 0 ? null : 'gold'),
    ]));
    const balIn = numberInput('bal', taxReserve || '', { step: '0.01' }); balIn.style.maxWidth = '140px';
    const aprIn = numberInput('apr', taxApr ? Math.round(taxApr * 1000) / 10 : '', { step: '0.01' }); aprIn.style.maxWidth = '90px';
    wrap.append(el('div.card.card-pad.mt-8', {}, [
      el('div.field-row', { style: 'align-items:center;gap:10px;flex-wrap:wrap' }, [
        el('span', { text: 'Reserve $' }), balIn, el('span', { text: 'APY' }), aprIn, el('span', { text: '%' }),
        el('button.btn.btn-primary.btn-sm', { text: 'Save', onclick: async () => { taxReserve = Number(balIn.value || 0); taxApr = Number(aprIn.value || 0) / 100; await setSetting('tax', { effective_rate: taxRate, reserve_balance: taxReserve, reserve_apr: taxApr }); toast('Saved'); refreshAfter(); } }),
      ]),
      el('div.field-hint.mt-8', { text: taxApr ? `Earning about ${money(interestYr)}/yr at ${Math.round(taxApr * 1000) / 10}% — note that interest is taxable income.` : 'Update this as your reserve grows.' }),
    ]));

    const rateInput = numberInput('rate', Math.round(taxRate * 1000) / 10, { step: '0.1' });
    rateInput.style.maxWidth = '110px';
    wrap.append(el('div.card.card-pad.mt-16', {}, [
      el('div.field-row', { style: 'align-items:center;gap:10px;flex-wrap:wrap' }, [
        el('span', { text: 'Effective tax rate' }), rateInput, el('span', { text: '%' }),
        el('button.btn.btn-primary.btn-sm', { text: 'Save', onclick: async () => { taxRate = Number(rateInput.value || 0) / 100; await setSetting('tax', { effective_rate: taxRate, reserve_balance: taxReserve, reserve_apr: taxApr }); toast('Saved'); refreshAfter(); } }),
        el('button.btn.btn-ghost.btn-sm', { text: 'Calibrate from last year', onclick: openCalibrate }),
      ]),
      el('div.field-hint.mt-8', { html: 'Rough estimate: <b>net profit × your effective rate</b> (income tax + ~15.3% self-employment tax + state). As income and expenses change through the year, this updates so you can adjust what you set aside.' }),
    ]));
  }

  function openCalibrate() {
    const taxIn = numberInput('t', '', { placeholder: '0' });
    const incIn = numberInput('i', '', { placeholder: '0' });
    const node = el('div.form', {}, [
      field('Total tax paid last year', taxIn),
      field('Net business income last year', incIn),
      el('div.field-hint', { text: 'Your effective rate = total tax ÷ net income. Use last year’s Schedule C net profit and the total federal + self-employment + state tax that income drove.' }),
    ]);
    const { close } = openSheet({
      title: 'Calibrate tax rate', body: node,
      actions: [
        { label: 'Cancel', tone: 'ghost', onClick: () => close() },
        { label: 'Set rate', tone: 'primary', onClick: async () => {
          const t = Number(taxIn.value || 0), i = Number(incIn.value || 0);
          if (!i) { toast('Enter last year’s net income', 'err'); return; }
          taxRate = Math.round((t / i) * 1000) / 1000;
          await setSetting('tax', { effective_rate: taxRate, reserve_balance: taxReserve, reserve_apr: taxApr });
          toast('Effective rate set to ' + Math.round(taxRate * 100) + '%'); close(); refreshAfter();
        } },
      ],
    });
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
    const nextMonthName = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const billed = new Set(invoices.filter((i) => i.type === 'monthly' && (i.issued_on || '').slice(0, 7) === monthKey).map((i) => i.client_id));
    const targets = list.filter((c) => c.stage === 'client' && n(c.mrr) > 0 && !billed.has(c.id));
    if (!targets.length) { toast(`All active clients already invoiced for ${monthName}`); return; }
    if (!await confirmDialog(`Create ${targets.length} monthly invoice${targets.length > 1 ? 's' : ''}? Each client is billed per their setting (advance clients for ${nextMonthName}, arrears for ${monthName}). Saved as drafts to review and send.`, { confirmLabel: 'Create drafts' })) return;
    let maxNum = invoices.reduce((m, i) => { const mm = /(\d+)/.exec(i.number || ''); return mm ? Math.max(m, parseInt(mm[1], 10)) : m; }, 0);
    const due = new Date(now); due.setDate(due.getDate() + INVOICE_NET_DAYS);
    const dueStr = due.toISOString().slice(0, 10);
    try {
      for (const c of targets) {
        maxNum += 1;
        const periodName = c.billing_mode === 'arrears' ? monthName : nextMonthName;
        const label = `${periodName} — Monthly management`;
        const addons = Array.isArray(c.recurring_addons) ? c.recurring_addons : [];
        const items = [{ label, amount: n(c.mrr) }, ...addons.map((a) => ({ label: a.label, amount: n(a.amount) }))];
        const total = items.reduce((s, it) => s + n(it.amount), 0);
        await Invoices.create({ client_id: c.id, number: 'INV-' + String(maxNum).padStart(4, '0'), type: 'monthly', amount: total, status: 'draft', method: 'Relay', issued_on: todayISO(), due_on: dueStr, description: items.map((it) => it.label).join(', '), items });
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

// "Split a deposit" — Josh's Relay allocation waterfall, done in the order Relay
// won't allow: 30% tax off the FULL deposit first, then top checking back to the
// floor, then Cole + Owner's Draw, remainder to debt. Cole's commission is
// per-client (15% for accounts he brought, 5% for A&O, 0 otherwise) — picking
// the client auto-fills his %, still editable. Pure calculator — no writes.
function openSplitDeposit(list = []) {
  const clientOpts = [{ key: '', label: '— No specific client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];
  const clientSel = selectInput('splitclient', clientOpts, '');
  const amt = numberInput('amt', '', { placeholder: '0', step: '0.01' });
  const chk = numberInput('chk', ALLOCATION.floor, { step: '0.01' });
  const colePct = numberInput('cole', 0, { step: '1' });
  [amt, chk, colePct].forEach((i) => { i.style.maxWidth = '150px'; });
  clientSel.addEventListener('change', () => {
    const c = list.find((x) => x.id === clientSel.value);
    colePct.value = c ? Math.round((Number(c.cole_pct) || 0) * 100) : 0;
    render();
  });
  const out = el('div.mt-8');

  function render() {
    const D = n(amt.value);
    clear(out);
    if (!D) { out.append(el('div.field-hint', { text: 'Enter a deposit amount to see the split.' })); return; }
    const tax = D * ALLOCATION.tax;
    const topUp = Math.max(0, ALLOCATION.floor - n(chk.value));
    const cole = D * (n(colePct.value) / 100);
    const draw = D * ALLOCATION.draw;
    const debt = D - tax - topUp - cole - draw;
    const row = (label, val, sub) => el('div.row', {}, [
      el('div.row-main', {}, [el('div.row-title', { text: label }), sub ? el('div.row-sub', {}, [el('span.muted', { text: sub })]) : null]),
      el('span.row-amount', { text: money(Math.max(0, val)) }),
    ]);
    out.append(el('div.rows.card', {}, [
      row('→ Tax Bucket', tax, Math.round(ALLOCATION.tax * 100) + '% off the top'),
      topUp ? row('→ Keep in Checking', topUp, 'top up to $' + ALLOCATION.floor) : null,
      row('→ Cole', cole, n(colePct.value) + '%'),
      row('→ Owner’s Draw', draw, Math.round(ALLOCATION.draw * 100) + '%'),
      row('→ Personal Debt', debt, 'remainder'),
    ]));
    if (debt < 0) out.append(el('div.field-hint.mt-8', { text: 'Heads up: this deposit is too small to cover the fixed pieces — nothing left for debt.' }));
  }
  [amt, chk, colePct].forEach((i) => i.addEventListener('input', render));
  render();

  const body = el('div.form', {}, [
    field('Client (sets Cole’s %)', clientSel),
    el('div.form-grid.cols-2', {}, [field('Deposit amount', amt), field('Cole % (auto)', colePct)]),
    field('Current checking balance', chk),
    el('div.field-hint', { text: `Tax comes off the full deposit first, then checking tops back to $${ALLOCATION.floor}, then Cole + draw, and the rest goes to debt. Cole is 15% for clients he brought (5% for A&O), 0 otherwise — pick the client to auto-fill.` }),
    out,
  ]);
  const { close } = openSheet({ title: 'Split a deposit', body, actions: [{ label: 'Done', tone: 'ghost', onClick: () => close() }] });
}

const n = (x) => Number(x || 0);
function sameMonth(d) { const now = new Date(); const x = new Date(d + 'T00:00:00'); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }
function due(date) { const d = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000; return d < 0 ? 'text-red' : d <= 5 ? 'text-amber' : 'muted'; }
function markOverdue(items) { const t = todayISO(); items.forEach((i) => { if (i.status === 'sent' && i.due_on && i.due_on < t) i.status = 'overdue'; }); }
