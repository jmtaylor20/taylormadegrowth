// Financials — the money command center. Build fees, collected, outstanding,
// MRR; one-click new invoice to any client/lead/prospect; record payments;
// editable statuses and amounts.
import { Clients, Invoices, Payments, Expenses, Trips, Contractors, DocJobs, getSetting, setSetting } from './db.js';
import { INVOICE_STATUS, INVOICE_TYPE, PAYMENT_KIND, INVOICE_NET_DAYS, ALLOCATION, mileageRateFor, FEATURES, PROFILE, BUSINESS } from './config.js';
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
    ...(FEATURES.contractorsTab ? [['contractors', 'Contractors']] : []), ['taxes', 'Taxes'],
    ...(FEATURES.splitDeposit ? [['documents', 'Binders']] : [])];
  segTabs.forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let list = [], invoices = [], payments = [], expenses = [], trips = [], contractors = [], recurExp = [], taxRate = 0.25, taxReserve = 0, taxApr = 0;
  // Full-liability planning: when taxMode==='full', TaylorMade covers the whole
  // household federal tax bill (agency tax + the wage tax the day-job paycheck
  // isn't withholding), offset by the spouse's withholding.
  let taxMode = 'agency', fedLiability = 0, spouseWH = 0, estPaid = 0, safeHarbor = 0;
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
    taxMode = tax.mode === 'full' ? 'full' : 'agency';
    fedLiability = Number(tax.fed_liability) || 0;
    spouseWH = Number(tax.spouse_withholding) || 0;
    estPaid = Number(tax.estimates_paid) || 0;
    safeHarbor = Number(tax.safe_harbor) || 0;
    markOverdue(invoices);
  }

  // Build the full tax setting object so partial saves never drop the other
  // fields (mode / full-liability plan / reserve balance all live together).
  const taxObj = (over) => Object.assign({
    effective_rate: taxRate, reserve_balance: taxReserve, reserve_apr: taxApr,
    mode: taxMode, fed_liability: fedLiability, spouse_withholding: spouseWH,
    estimates_paid: estPaid, safe_harbor: safeHarbor,
  }, over || {});
  // Annual amount TaylorMade must reserve toward the full federal bill, and the
  // months left in the year to spread it over.
  const monthsLeft = () => Math.max(1, 12 - new Date().getMonth());
  const annualReserveTarget = () => Math.max(0, fedLiability - spouseWH - estPaid);

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
      // Full-liability mode: reserve the whole federal bill (minus spouse
      // withholding) spread over the year. Otherwise the old flat % of MRR.
      const fullMo = annualReserveTarget() / 12;
      const taxMo = taxMode === 'full' ? fullMo : afterCole * ALLOCATION.tax;
      const taxLabel = taxMode === 'full' ? 'Tax reserve' : 'Tax (30%)';
      const recurTotal = recurExp.reduce((s, x) => s + n(x.amount), 0);
      const available = afterCole - taxMo - recurTotal;
      summary.append(el('div.section-title', {}, [
        el('h3', { text: 'Projected monthly (from MRR)' }),
        el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('wallet', 14)} Recurring expenses`, onclick: () => openRecurringExpenses() }),
      ]));
      summary.append(el('div.grid.grid-4', {}, [
        el('div.stat', {}, [el('div.stat-value', { text: money(coleMo) }), el('div.stat-label', { text: 'Cole’s cut' })]),
        el('div.stat' + (taxMode === 'full' ? '' : ''), {}, [el('div.stat-value', { text: money(taxMo) }), el('div.stat-label', { text: taxLabel }), taxMode === 'full' ? el('div.stat-sub', { text: 'full fed bill ÷ 12' }) : null]),
        el('div.stat', {}, [el('div.stat-value', { text: money(recurTotal) }), el('div.stat-label', { text: 'Recurring exp' }), el('div.stat-sub', { text: recurExp.length + ' items' })]),
        el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(available) }), el('div.stat-label', { text: 'Available / mo' })]),
      ]));
      summary.append(el('div.field-hint.mt-8', {
        text: taxMode === 'full'
          ? `From ${money(mrr)} MRR: minus Cole’s commission, ${money(taxMo)}/mo toward your full ${money(fedLiability)} federal bill (less ${money(spouseWH)} paycheck withholding), and ${money(recurTotal)} recurring expenses. See the Taxes tab to adjust. Before mileage and owner’s draw.`
          : `From ${money(mrr)} MRR: minus Cole’s commission, 30% for taxes, and ${money(recurTotal)} recurring expenses. Projection only — before mileage and owner’s draw.`,
      }));
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
    else if (state.view === 'documents' && FEATURES.splitDeposit) viewDocuments();
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
      st(money(estTax), 'Agency tax YTD', Math.round(taxRate * 100) + '% of net', 'gold'),
      st(money(projTax), 'Agency full year'),
      st(money(mileageDed), 'Mileage deduction'),
    ]));

    // --- Full-liability plan: TaylorMade covers the whole federal bill --------
    if (taxMode === 'full') {
      const netToReserve = annualReserveTarget();               // fed − spouse − estimates
      const stillToSave = Math.max(0, netToReserve - taxReserve);
      const monthlySet = stillToSave / monthsLeft();
      const prepaid = spouseWH + estPaid;
      const shortHarbor = Math.max(0, safeHarbor - prepaid);
      wrap.append(el('div.section-title', {}, [el('h3', { text: 'Full-year tax plan (out of TaylorMade)' })]));
      wrap.append(el('div.grid.grid-3', {}, [
        st(money(fedLiability), 'Total federal bill'),
        st('−' + money(spouseWH), 'Paycheck withholding'),
        st(money(netToReserve), 'TaylorMade covers', null, 'gold'),
      ]));
      wrap.append(el('div.grid.grid-3.mt-8', {}, [
        st(money(taxReserve), 'Saved in bucket'),
        st(money(stillToSave), 'Still to save'),
        st(money(monthlySet), 'Per month', monthsLeft() + ' mo left', 'gold'),
      ]));
      wrap.append(el('div.card.card-pad.mt-8' + (shortHarbor > 0 ? ' card-gold' : ''), {}, [
        el('div', { html: shortHarbor > 0
          ? `<b>Avoid the penalty:</b> you need ${money(safeHarbor)} prepaid (100% of last year’s tax). Withholding + estimates so far = ${money(prepaid)}, so make an estimated payment of about <b>${money(shortHarbor)}</b> (Q3 due Sep 15, Q4 due Jan 15). The rest can wait for your April return.`
          : `<b>Penalty-safe:</b> your ${money(prepaid)} in withholding + estimates already clears the ${money(safeHarbor)} safe harbor. Keep saving the balance in the bucket for April.` }),
      ]));
      // Edit the plan numbers.
      const fedIn = numberInput('fed', fedLiability || '', { step: '1' }); fedIn.style.maxWidth = '130px';
      const spIn = numberInput('sp', spouseWH || '', { step: '1' }); spIn.style.maxWidth = '130px';
      const esIn = numberInput('es', estPaid || '', { step: '1' }); esIn.style.maxWidth = '130px';
      const shIn = numberInput('sh', safeHarbor || '', { step: '1' }); shIn.style.maxWidth = '130px';
      wrap.append(el('div.card.card-pad.mt-8', {}, [
        el('div.field-row', { style: 'align-items:center;gap:10px;flex-wrap:wrap' }, [
          field('Total federal bill', fedIn), field('Paycheck withholding (both jobs)', spIn),
          field('Estimates paid', esIn), field('Safe harbor', shIn),
        ]),
        el('div.field-row.mt-8', { style: 'gap:10px;flex-wrap:wrap' }, [
          el('button.btn.btn-primary.btn-sm', { text: 'Save plan', onclick: async () => {
            fedLiability = Number(fedIn.value || 0); spouseWH = Number(spIn.value || 0);
            estPaid = Number(esIn.value || 0); safeHarbor = Number(shIn.value || 0);
            await setSetting('tax', taxObj()); toast('Plan saved'); refreshAfter();
          } }),
          el('button.btn.btn-ghost.btn-sm', { text: 'Switch to agency-only %', onclick: async () => { taxMode = 'agency'; await setSetting('tax', taxObj({ mode: 'agency' })); toast('Using agency rate'); refreshAfter(); } }),
        ]),
        el('div.field-hint.mt-8', { html: 'TaylorMade reserves your <b>whole federal bill</b> (agency tax + the wage tax your paychecks aren’t withholding), minus <b>all</b> paycheck withholding — yours and your wife’s combined. If you add some back to your own check, raise this number and TaylorMade’s share drops automatically.' }),
      ]));
    }

    // Actual reserve vs. what you should have set aside so far.
    const reserveTarget = taxMode === 'full' ? annualReserveTarget() : estTax;
    const cushion = taxReserve - reserveTarget;
    const interestYr = taxReserve * taxApr;
    wrap.append(el('div.section-title', {}, [el('h3', { text: 'Your tax reserve' })]));
    wrap.append(el('div.grid.grid-3', {}, [
      st(money(taxReserve), 'In tax account', taxApr ? (Math.round(taxApr * 1000) / 10) + '% APY' : null, 'gold'),
      st(money(reserveTarget), taxMode === 'full' ? 'Target (full year)' : 'Target (YTD)'),
      st((cushion >= 0 ? '+' : '−') + money(Math.abs(cushion)), cushion >= 0 ? 'Cushion (ahead)' : 'Short — set aside', null, cushion >= 0 ? null : 'gold'),
    ]));
    const balIn = numberInput('bal', taxReserve || '', { step: '0.01' }); balIn.style.maxWidth = '140px';
    const aprIn = numberInput('apr', taxApr ? Math.round(taxApr * 1000) / 10 : '', { step: '0.01' }); aprIn.style.maxWidth = '90px';
    wrap.append(el('div.card.card-pad.mt-8', {}, [
      el('div.field-row', { style: 'align-items:center;gap:10px;flex-wrap:wrap' }, [
        el('span', { text: 'Reserve $' }), balIn, el('span', { text: 'APY' }), aprIn, el('span', { text: '%' }),
        el('button.btn.btn-primary.btn-sm', { text: 'Save', onclick: async () => { taxReserve = Number(balIn.value || 0); taxApr = Number(aprIn.value || 0) / 100; await setSetting('tax', taxObj()); toast('Saved'); refreshAfter(); } }),
      ]),
      el('div.field-hint.mt-8', { text: taxApr ? `Earning about ${money(interestYr)}/yr at ${Math.round(taxApr * 1000) / 10}% — note that interest is taxable income.` : 'Update this as your reserve grows.' }),
    ]));

    const rateInput = numberInput('rate', Math.round(taxRate * 1000) / 10, { step: '0.1' });
    rateInput.style.maxWidth = '110px';
    wrap.append(el('div.card.card-pad.mt-16', {}, [
      el('div.field-row', { style: 'align-items:center;gap:10px;flex-wrap:wrap' }, [
        el('span', { text: 'Agency effective rate' }), rateInput, el('span', { text: '%' }),
        el('button.btn.btn-primary.btn-sm', { text: 'Save', onclick: async () => { taxRate = Number(rateInput.value || 0) / 100; await setSetting('tax', taxObj()); toast('Saved'); refreshAfter(); } }),
        el('button.btn.btn-ghost.btn-sm', { text: 'Calibrate from last year', onclick: openCalibrate }),
        taxMode === 'full' ? null : el('button.btn.btn-ghost.btn-sm', { text: 'Cover full federal bill from TaylorMade', onclick: async () => { taxMode = 'full'; await setSetting('tax', taxObj({ mode: 'full' })); toast('Full-liability plan on'); refreshAfter(); } }),
      ]),
      el('div.field-hint.mt-8', { html: 'The agency rate estimates tax on your <b>agency net profit alone</b>. The full-year plan above (when on) reserves your <b>entire federal bill</b> out of TaylorMade instead.' }),
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

  // Binders & exports: queue a Drive/email build. The Apps Script picks up the
  // job, builds a combined PDF (+ CSV), files it into Drive, and emails it.
  function viewDocuments() {
    const now = new Date();
    const monthOpts = [];
    for (let i = 0; i < 12; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); monthOpts.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }) }); }
    const yearOpts = []; for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) yearOpts.push({ key: String(y), label: String(y) });
    const quarterOpts = [];
    { let d = new Date(now.getFullYear(), now.getMonth(), 1); for (let i = 0; i < 6; i++) { const q = Math.floor(d.getMonth() / 3) + 1; const key = d.getFullYear() + '-Q' + q; if (!quarterOpts.find((o) => o.key === key)) quarterOpts.push({ key, label: 'Q' + q + ' ' + d.getFullYear() }); d = new Date(d.getFullYear(), d.getMonth() - 3, 1); } }
    const scope = { type: 'month' };
    const monthSel = selectInput('m', monthOpts, monthOpts[0].key);
    const quarterSel = selectInput('q', quarterOpts, quarterOpts[0].key); quarterSel.style.display = 'none';
    const yearSel = selectInput('y', yearOpts, yearOpts[0].key); yearSel.style.display = 'none';
    const sels = { month: monthSel, quarter: quarterSel, year: yearSel };
    const scopeSeg = el('div.segmented');
    [['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']].forEach(([k, l]) => scopeSeg.append(el('button.seg' + (scope.type === k ? '.on' : ''), {
      text: l, onclick: (e) => { scope.type = k; scopeSeg.querySelectorAll('.seg').forEach((s) => s.classList.remove('on')); e.target.classList.add('on'); Object.keys(sels).forEach((t) => { sels[t].style.display = t === k ? '' : 'none'; }); },
    })));
    const period = () => sels[scope.type].value;
    const build = async (kind, labelText) => {
      try {
        await DocJobs.create({ kind, period_type: scope.type, period: period(), status: 'queued', email: BUSINESS.email });
        toast(`Building your ${labelText} — you’ll get an email when it’s ready`);
        loadJobs();
      } catch (e) { toast(e.message, 'err'); }
    };
    wrap.append(el('div.section-title', {}, [el('h3', { text: 'Binders & exports' })]));
    wrap.append(el('div.field-hint.mb-8', { text: 'Builds a combined PDF (+ CSV) in your Google Drive and emails it to you. Receipts, mileage, income, and contractor pay are pulled automatically for the period. Monthly binders also build themselves on the 1st.' }));
    wrap.append(el('div.card.card-pad', {}, [
      el('div.field-row', { style: 'gap:10px;align-items:center;flex-wrap:wrap' }, [el('span', { text: 'Period' }), scopeSeg, monthSel, quarterSel, yearSel]),
      el('div.pill-row.mt-8', {}, [
        el('button.btn.btn-primary.btn-sm', { html: iconSvg('money', 14) + ' Expense binder', onclick: () => build('expense_binder', 'expense binder') }),
        el('button.btn.btn-gold.btn-sm', { html: iconSvg('car', 14) + ' Mileage log', onclick: () => build('mileage_log', 'mileage log') }),
        el('button.btn.btn-ghost.btn-sm', { html: iconSvg('money', 14) + ' Income register', onclick: () => build('income_register', 'income register') }),
        el('button.btn.btn-ghost.btn-sm', { html: iconSvg('report', 14) + ' Tax packet', onclick: () => build('tax_packet', 'tax packet') }),
        el('button.btn.btn-ghost.btn-sm', { html: iconSvg('users', 14) + ' Contractor 1099s', onclick: () => build('contractor_1099', 'contractor 1099 summary') }),
      ]),
    ]));
    const jobsWrap = el('div.mt-16');
    wrap.append(jobsWrap);
    async function loadJobs() {
      clear(jobsWrap);
      let jobs = [];
      try { jobs = await DocJobs.list({ order: { col: 'created_at', asc: false } }); } catch (e) { /* table may not exist yet */ }
      if (!jobs.length) { jobsWrap.append(el('div.field-hint', { text: 'No binders built yet.' })); return; }
      jobsWrap.append(el('div.section-title', {}, [el('h3', { text: 'Recent builds' }), el('button.btn.btn-ghost.btn-sm', { text: 'Refresh', onclick: loadJobs })]));
      const KIND = { expense_binder: 'Expense binder', mileage_log: 'Mileage log', income_register: 'Income register', tax_packet: 'Tax packet', contractor_1099: 'Contractor 1099s' };
      const TONE = { queued: 'gray', building: 'amber', done: 'green', error: 'red' };
      const rows = el('div.rows.card');
      jobs.slice(0, 20).forEach((j) => rows.append(el('div.row', {}, [
        el('div.row-main', {}, [
          el('div.row-title', { text: (KIND[j.kind] || j.kind) + ' · ' + j.period }),
          el('div.row-sub', {}, [badge(j.status, TONE[j.status] || 'gray'), j.built_at ? el('span', { text: fmtDate(j.built_at) }) : null, j.error ? el('span.text-red', { text: j.error }) : null]),
        ]),
        el('div.row-right', {}, [
          j.file_url ? el('a.icon-btn', { href: j.file_url, target: '_blank', title: 'Open PDF', html: iconSvg('external', 18) }) : null,
          j.drive_url ? el('a.icon-btn', { href: j.drive_url, target: '_blank', title: 'Open Drive folder', html: iconSvg('cloud', 18) }) : null,
        ]),
      ])));
      jobsWrap.append(rows);
    }
    loadJobs();
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
