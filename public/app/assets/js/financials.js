// Financials — the money command center. Build fees, collected, outstanding,
// MRR; one-click new invoice to any client/lead/prospect; record payments;
// editable statuses and amounts.
import { Clients, Invoices, Payments, Expenses, Trips, Contractors, getSetting, setSetting } from './db.js';
import { INVOICE_STATUS, INVOICE_TYPE, PAYMENT_KIND, INVOICE_NET_DAYS, ALLOCATION, mileageRateFor, FEATURES, PROFILE } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, labelOf, fmtDate,
  relDue, todayISO, emptyState, primaryBtn, selectInput, numberInput, toast, confirmDialog,
  openSheet, field,
} from './ui.js';
import { openInvoiceForm } from './invoices.js';
import { openPaymentForm } from './client-detail.js';
import { openExpenseForm } from './tracker.js';
import { queueDoc, docBadges } from './docs.js';

const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '—';

export async function renderFinancials(root) {
  const state = { view: FEATURES.invoicing ? 'invoices' : 'payments', filter: 'all' };
  root.append(pageHeader('Financials', FEATURES.invoicing ? 'Build fees, retainers, payments' : 'Your money & split'));

  const actions = el('div.toolbar', {}, [
    FEATURES.invoicing ? primaryBtn('New invoice', async () => openInvoiceForm({}, refreshAfter, null, await clients()), 'plus') : null,
    el('button.btn.btn-gold', { html: `${iconSvg('plus', 16)} Record payment`, onclick: async () => openPickClientThenPayment(await clients(), refreshAfter) }),
    el('button.btn.btn-ghost', { html: `${iconSvg('money', 16)} Add expense`, onclick: async () => openExpenseForm({}, refreshAfter, await clients()) }),
    FEATURES.invoicing ? el('button.btn.btn-ghost', { html: `${iconSvg('renew', 16)} Generate monthly`, title: 'Create this month’s retainer invoices', onclick: generateMonthly }) : null,
    FEATURES.splitDeposit ? el('button.btn.btn-ghost', { html: `${iconSvg('wallet', 16)} Split deposit`, title: 'Allocate an incoming payment across your buckets', onclick: async () => openSplitDeposit(await clients()) }) : null,
  ]);
  root.append(actions);

  const summary = el('div');
  root.append(summary);

  const seg = el('div.segmented.mt-16');
  const segTabs = [...(FEATURES.invoicing ? [['invoices', 'Invoices']] : []), ['payments', 'Payments'], ['expenses', 'Expenses'], ['clients', 'By client'],
    ...(FEATURES.contractorsTab ? [['contractors', 'Contractors']] : []), ['taxes', 'Taxes']];
  segTabs.forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let list = [], invoices = [], payments = [], expenses = [], trips = [], contractors = [], recurExp = [], taxRate = 0.25, taxReserve = 0, taxApr = 0;
  let clientCache = null;
  async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
  async function load() {
    clientCache = null;
    let tax, recur;
    [list, invoices, payments, expenses, trips, contractors, tax, recur] = await Promise.all([
      clients(), Invoices.list({ order: { col: 'issued_on', asc: false } }), Payments.list({ order: { col: 'paid_on', asc: false } }),
      Expenses.list(), Trips.list(), Contractors.list({ order: { col: 'name', asc: true } }), getSetting('tax', { effective_rate: 0.25 }),
      getSetting('recurring_expenses', { items: [] }),
    ]);
    recurExp = Array.isArray(recur.items) ? recur.items : [];
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

    // Projected monthly take-home from MRR: after Cole's commission, 30% to the
    // tax bucket (Cole is deductible, so tax is on your share), then your fixed
    // recurring monthly expenses. A projection off current MRR — before mileage
    // and owner's draw.
    if (FEATURES.splitDeposit) {
      const coleMo = active.reduce((s, c) => s + n(c.mrr) * (Number(c.cole_pct) || 0), 0);
      const afterCole = mrr - coleMo;
      const taxMo = afterCole * ALLOCATION.tax;
      const recurTotal = recurExp.reduce((s, x) => s + n(x.amount), 0);
      const available = afterCole - taxMo - recurTotal;
      summary.append(el('div.section-title', {}, [
        el('h3', { text: 'Projected monthly (from MRR)' }),
        el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('wallet', 14)} Recurring expenses`, onclick: () => openRecurringExpenses() }),
      ]));
      summary.append(el('div.grid.grid-4', {}, [
        el('div.stat', {}, [el('div.stat-value', { text: money(coleMo) }), el('div.stat-label', { text: 'Cole’s cut' })]),
        el('div.stat', {}, [el('div.stat-value', { text: money(taxMo) }), el('div.stat-label', { text: 'Tax (30%)' })]),
        el('div.stat', {}, [el('div.stat-value', { text: money(recurTotal) }), el('div.stat-label', { text: 'Recurring exp' }), el('div.stat-sub', { text: recurExp.length + ' items' })]),
        el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(available) }), el('div.stat-label', { text: 'Available / mo' })]),
      ]));
      summary.append(el('div.field-hint.mt-8', { text: `From ${money(mrr)} MRR: minus Cole’s commission, 30% for taxes, and ${money(recurTotal)} recurring expenses. Projection only — before mileage and owner’s draw.` }));
    }

    // Contractor copy (Tony): show his split on everything he's collected —
    // he keeps his %, the rest is TaylorMade's cut.
    if (FEATURES.revShareSelf) {
      const collectedAll = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + n(i.amount), 0)
        + payments.reduce((s, p) => s + n(p.amount), 0);
      const keep = collectedAll * (PROFILE.keepPct || 0);
      const agency = collectedAll - keep;
      summary.append(el('div.section-title', {}, [el('h3', { text: 'Your split' })]));
      summary.append(el('div.grid.grid-3', {}, [
        el('div.stat', {}, [el('div.stat-value', { text: money(collectedAll) }), el('div.stat-label', { text: 'Collected' })]),
        el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(keep) }), el('div.stat-label', { text: 'You keep' }), el('div.stat-sub', { text: Math.round((PROFILE.keepPct || 0) * 100) + '%' })]),
        el('div.stat', {}, [el('div.stat-value', { text: money(agency) }), el('div.stat-label', { text: 'TaylorMade' }), el('div.stat-sub', { text: Math.round((PROFILE.agencyPct || 0) * 100) + '%' })]),
      ]));
    }

    if (state.view === 'invoices') viewInvoices();
    else if (state.view === 'payments') viewPayments();
    else if (state.view === 'expenses') viewExpenses();
    else if (state.view === 'taxes') viewTaxes();
    else if (state.view === 'contractors' && FEATURES.contractorsTab) viewContractors();
    else viewByClient();
  }

  // Contractor rev-share payouts: for each contractor, what you've collected on
  // their invoices, what you owe them (their %), and what you keep. "Collected"
  // = paid invoices; "pipeline" = still-open invoices.
  function viewContractors() {
    const st = (v, l, sub, tone) => el('div.stat' + (tone ? '.stat-' + tone : ''), {}, [el('div.stat-value', { text: v }), el('div.stat-label', { text: l }), sub ? el('div.stat-sub', { text: sub }) : null]);
    wrap.append(el('div.section-title', {}, [
      el('h3', { text: 'Contractor payouts' }),
      el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('plus', 14)} Manage`, onclick: () => openContractorManager() }),
    ]));
    if (!contractors.length) { wrap.append(emptyState('No contractors yet. Tap Manage to add one.', 'users')); return; }

    contractors.forEach((c) => {
      const inv = invoices.filter((i) => i.rep === c.name);
      const paid = inv.filter((i) => i.status === 'paid');
      const collected = paid.reduce((s, i) => s + n(i.amount), 0);
      const owe = paid.reduce((s, i) => s + n(i.amount) * (i.rep_pct != null ? n(i.rep_pct) : n(c.split_pct)), 0);
      const yours = collected - owe;
      const openAmt = inv.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + n(i.amount), 0);
      wrap.append(el('div.section-title', {}, [el('h3', { text: c.name }), badge(Math.round(n(c.split_pct) * 100) + '% to them', 'violet')]));
      wrap.append(el('div.grid.grid-3', {}, [
        st(money(collected), 'Collected'),
        st(money(owe), 'Owe ' + c.name.split(' ')[0], null, owe > 0 ? 'gold' : null),
        st(money(yours), 'You keep'),
      ]));
      if (openAmt) wrap.append(el('div.field-hint.mt-8', { text: money(openAmt) + ' still open (unpaid) on their invoices' }));
    });
  }

  // Add / edit contractors and their split %.
  function openContractorManager() {
    const body = el('div.form');
    const listWrap = el('div');
    const render = () => {
      clear(listWrap);
      contractors.forEach((c) => {
        const nameIn = el('input.input', { value: c.name, style: 'flex:1' });
        const pctIn = numberInput('', Math.round(n(c.split_pct) * 100), { step: '1' }); pctIn.style.maxWidth = '80px';
        listWrap.append(el('div.field-row', { style: 'gap:8px;align-items:center;margin-bottom:8px' }, [
          nameIn, pctIn, el('span.field-hint', { text: '%' }),
          el('button.btn.btn-primary.btn-sm', { type: 'button', text: 'Save', onclick: async () => { await Contractors.update(c.id, { name: nameIn.value.trim(), split_pct: Number(pctIn.value || 0) / 100 }); toast('Saved'); await reload(); } }),
          el('button.icon-btn', { type: 'button', html: iconSvg('trash', 15), onclick: async () => { if (await confirmDialog('Remove ' + c.name + '?')) { await Contractors.remove(c.id); await reload(); } } }),
        ]));
      });
    };
    const reload = async () => { contractors = await Contractors.list({ order: { col: 'name', asc: true } }); render(); refresh(); };
    const newName = el('input.input', { placeholder: 'New contractor name', style: 'flex:1' });
    const newPct = numberInput('', '', { step: '1', placeholder: '%' }); newPct.style.maxWidth = '80px';
    body.append(
      el('div.section-title', {}, [el('h3', { text: 'Contractors & their split' })]),
      el('div.field-hint.mb-8', { text: 'The % each contractor keeps of their invoices. You keep the rest.' }),
      listWrap,
      el('div.field-row', { style: 'gap:8px;align-items:center;margin-top:6px' }, [
        newName, newPct, el('span.field-hint', { text: '%' }),
        el('button.btn.btn-gold.btn-sm', { type: 'button', text: 'Add', onclick: async () => { if (!newName.value.trim()) { toast('Name required', 'err'); return; } await Contractors.create({ name: newName.value.trim(), split_pct: Number(newPct.value || 50) / 100 }); newName.value = ''; newPct.value = ''; await reload(); } }),
      ]),
    );
    render();
    const { close } = openSheet({ title: 'Contractors', body, actions: [{ label: 'Done', tone: 'primary', onClick: () => close() }] });
  }

  // View / edit / add your fixed recurring monthly expenses. Saved to the
  // 'recurring_expenses' setting and subtracted from the projection.
  function openRecurringExpenses() {
    const items = recurExp.map((x) => ({ name: x.name, amount: n(x.amount) }));
    const body = el('div.form');
    const listWrap = el('div');
    const totalEl = el('b');
    const retotal = () => { totalEl.textContent = money(items.reduce((s, x) => s + n(x.amount), 0)); };
    const render = () => {
      clear(listWrap);
      items.forEach((it, idx) => {
        const nameIn = el('input.input', { value: it.name || '', placeholder: 'e.g. Adobe, Canva', style: 'flex:1' });
        const amtIn = numberInput('', it.amount ?? '', { step: '0.01' }); amtIn.style.maxWidth = '110px';
        nameIn.addEventListener('input', () => { it.name = nameIn.value; });
        amtIn.addEventListener('input', () => { it.amount = Number(amtIn.value || 0); retotal(); });
        listWrap.append(el('div.field-row', { style: 'gap:8px;align-items:center;margin-bottom:8px' }, [
          nameIn, el('span.field-hint', { text: '$/mo' }), amtIn,
          el('button.icon-btn', { type: 'button', html: iconSvg('trash', 15), onclick: () => { items.splice(idx, 1); render(); retotal(); } }),
        ]));
      });
    };
    body.append(
      el('div.field-hint.mb-8', { text: 'Fixed monthly costs subtracted from your projected take-home. For annual tools, enter the monthly equivalent (yearly ÷ 12).' }),
      listWrap,
      el('div.field-row', { style: 'justify-content:space-between;align-items:center;margin-top:6px' }, [
        el('button.btn.btn-gold.btn-sm', { type: 'button', html: iconSvg('plus', 14) + ' Add expense', onclick: () => { items.push({ name: '', amount: 0 }); render(); } }),
        el('div', {}, [el('span.field-hint', { text: 'Total ' }), totalEl]),
      ]),
    );
    render(); retotal();
    const { close } = openSheet({
      title: 'Recurring monthly expenses', body,
      actions: [
        { label: 'Cancel', tone: 'ghost', onClick: () => close() },
        { label: 'Save', tone: 'primary', onClick: async () => {
          const clean = items.filter((x) => (x.name || '').trim()).map((x) => ({ name: x.name.trim(), amount: n(x.amount) }));
          try { await setSetting('recurring_expenses', { items: clean }); recurExp = clean; toast('Saved'); close(); refresh(); }
          catch (e) { toast(e.message, 'err'); }
        } },
      ],
    });
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
          ...docBadges(i),
        ]),
      ]),
      el('div.row-right', {}, [
        el('span.row-amount', { text: money(i.amount) }),
        el('button.icon-btn', { title: (i.status === 'paid' ? 'Send receipt (PDF email + Drive)' : 'Send to client (PDF email + Drive)'), html: iconSvg('send', 18), onclick: () => queueDoc(Invoices, i, list.find((c) => c.id === i.client_id), { send: true, drive: true }, refreshAfter) }),
        el('button.icon-btn', { title: 'Save to Google Drive', html: iconSvg('cloud', 18), onclick: () => queueDoc(Invoices, i, list.find((c) => c.id === i.client_id), { drive: true }, refreshAfter) }),
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

  // Expense tracker: add / edit / delete business expenses, month + year totals.
  function viewExpenses() {
    const yr = String(new Date().getFullYear());
    const inYr = (d) => (d || '').slice(0, 4) === yr;
    const moTotal = expenses.filter((e) => e.expense_date && sameMonth(e.expense_date)).reduce((s, e) => s + n(e.amount), 0);
    const yrTotal = expenses.filter((e) => inYr(e.expense_date)).reduce((s, e) => s + n(e.amount), 0);
    wrap.append(el('div.section-title', {}, [
      el('h3', { text: 'Expenses' }),
      el('button.btn.btn-gold.btn-sm', { html: `${iconSvg('plus', 14)} Add expense`, onclick: () => openExpenseForm({}, refreshAfter, list) }),
    ]));
    wrap.append(el('div.grid.grid-3', {}, [
      el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(moTotal) }), el('div.stat-label', { text: 'This month' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(yrTotal) }), el('div.stat-label', { text: yr + ' total' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(expenses.length) }), el('div.stat-label', { text: 'Logged' })]),
    ]));
    if (!expenses.length) { wrap.append(emptyState('No expenses yet. Tap Add expense.', 'money')); return; }
    const rows = el('div.rows.card');
    expenses.slice().sort((a, b) => String(b.expense_date || '').localeCompare(String(a.expense_date || ''))).forEach((e) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openExpenseForm(e, refreshAfter, list) }, [
        el('div.row-title', { text: e.vendor || e.category || 'Expense' }),
        el('div.row-sub', {}, [
          e.category ? badge(e.category, 'gray') : null,
          e.expense_date ? el('span', { text: fmtDate(e.expense_date) }) : null,
          e.client_id ? el('span.muted', { text: nameFor(list, e.client_id) }) : null,
          e.notes ? el('span', { text: e.notes }) : null,
        ]),
      ]),
      el('div.row-right', {}, [
        el('span.row-amount', { text: money(e.amount) }),
        el('button.icon-btn', { title: 'Delete', html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this expense?')) { await Expenses.remove(e.id); refreshAfter(); } } }),
      ]),
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
    const cole = D * (n(colePct.value) / 100);
    const tax = (D - cole) * ALLOCATION.tax;   // Cole is deductible — tax only your share
    const topUp = Math.max(0, ALLOCATION.floor - n(chk.value));
    const draw = D * ALLOCATION.draw;
    const debt = D - cole - tax - topUp - draw;
    const row = (label, val, sub) => el('div.row', {}, [
      el('div.row-main', {}, [el('div.row-title', { text: label }), sub ? el('div.row-sub', {}, [el('span.muted', { text: sub })]) : null]),
      el('span.row-amount', { text: money(Math.max(0, val)) }),
    ]);
    out.append(el('div.rows.card', {}, [
      cole ? row('→ Cole', cole, n(colePct.value) + '% of deposit') : null,
      row('→ Tax Bucket', tax, Math.round(ALLOCATION.tax * 100) + '% of what’s left after Cole'),
      topUp ? row('→ Keep in Checking', topUp, 'top up to $' + ALLOCATION.floor) : null,
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
    el('div.field-hint', { text: `Cole's commission comes out first (it's a deductible expense, so it isn't taxed as your income), then 30% tax on what's left, then checking tops back to $${ALLOCATION.floor}, draw, and the rest to debt. Cole is 15% for clients he brought (5% for A&O), 0 otherwise — pick the client to auto-fill.` }),
    out,
  ]);
  const { close } = openSheet({ title: 'Split a deposit', body, actions: [{ label: 'Done', tone: 'ghost', onClick: () => close() }] });
}

const n = (x) => Number(x || 0);
function sameMonth(d) { const now = new Date(); const x = new Date(d + 'T00:00:00'); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth(); }
function due(date) { const d = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000; return d < 0 ? 'text-red' : d <= 5 ? 'text-amber' : 'muted'; }
function markOverdue(items) { const t = todayISO(); items.forEach((i) => { if (i.status === 'sent' && i.due_on && i.due_on < t) i.status = 'overdue'; }); }
