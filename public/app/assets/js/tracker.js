// Tracker — mileage log (with IRS-rate deduction) + meeting log. One tab, two
// views. Both can be tied to a client and filed newest-first.
import { Trips, Meetings, Clients, Expenses } from './db.js';
import { MILEAGE_RATE, mileageRateFor, TRIP_PURPOSES, MEETING_TYPES, EXPENSE_CATEGORIES } from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, fmtDate, relDue, daysUntil, money, todayISO, emptyState, primaryBtn,
  field, textInput, numberInput, textArea, selectInput, dateInput, readForm,
  openSheet, toast, confirmDialog,
} from './ui.js';
import { photoToDataUrl } from './logofield.js';
import { mapboxReady, drivingMiles, loadMapbox } from './mapbox.js';

const n = (x) => Number(x || 0);
const usd = (x) => '$' + n(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const miFmt = (x) => n(x).toLocaleString('en-US', { maximumFractionDigits: 1 });
const tripDeduction = (t) => n(t.miles) * (t.rate == null ? mileageRateFor(t.trip_date) : n(t.rate));
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '';

export async function renderTracker(root) {
  const state = { view: 'mileage' };
  function logCurrent() {
    if (state.view === 'mileage') openTripForm({}, refreshAfter, clients);
    else if (state.view === 'meetings') openMeetingForm({}, refreshAfter, clients);
    else if (state.view === 'expenses') openExpenseForm({}, refreshAfter, clients);
    else toast('Renewals come from each client’s saved dates — open a client to edit them.');
  }
  root.append(pageHeader('Tracker', 'Mileage · meetings · expenses · renewals', primaryBtn('Log', logCurrent, 'plus')));

  const seg = el('div.segmented');
  [['mileage', 'Mileage'], ['meetings', 'Meetings'], ['expenses', 'Expenses'], ['renewals', 'Renewals']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let clients = [], trips = [], meetings = [], expenses = [];
  async function load() {
    [clients, trips, meetings, expenses] = await Promise.all([
      Clients.list({ order: { col: 'business_name', asc: true } }),
      Trips.list({ order: { col: 'trip_date', asc: false } }),
      Meetings.list({ order: { col: 'meeting_date', asc: false } }),
      Expenses.list({ order: { col: 'expense_date', asc: false } }),
      loadMapbox(),
    ]);
  }

  function refresh() {
    clear(wrap);
    if (state.view === 'mileage') renderMileage();
    else if (state.view === 'meetings') renderMeetings();
    else if (state.view === 'expenses') renderExpenses();
    else renderRenewals();
  }

  function renderMileage() {
    // month + YTD rollups
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const yr = String(now.getFullYear());
    const inMonth = trips.filter((t) => (t.trip_date || '').slice(0, 7) === ym);
    const inYear = trips.filter((t) => (t.trip_date || '').slice(0, 4) === yr);
    const sumMi = (a) => a.reduce((s, t) => s + n(t.miles), 0);
    const sumDed = (a) => a.reduce((s, t) => s + tripDeduction(t), 0);
    wrap.append(el('div.statstrip.mt-8', {}, [
      stat(miFmt(sumMi(inMonth)) + ' mi', 'This month'),
      stat(usd(sumDed(inMonth)), 'Deduction (mo)'),
      stat(usd(sumDed(inYear)), 'Deduction (YTD)'),
    ]));
    wrap.append(el('div.field-hint.mt-8', { text: `Deduction uses the IRS rate for each trip's date (currently $${MILEAGE_RATE.toFixed(3)}/mile).` }));

    if (!trips.length) { wrap.append(emptyState('No trips logged yet. Tap Log to add one.', 'money')); return; }
    const rows = el('div.rows.card.mt-16');
    trips.forEach((t) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openTripForm(t, refreshAfter, clients) }, [
        el('div.row-title', { text: miFmt(t.miles) + ' mi · ' + usd(tripDeduction(t)) }),
        el('div.row-sub', {}, [
          t.trip_date ? fmtDate(t.trip_date) : '',
          t.purpose ? badge(t.purpose, 'gray') : null,
          nameFor(clients, t.client_id) ? el('span', { text: nameFor(clients, t.client_id) }) : null,
        ]),
      ]),
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this trip?')) { await Trips.remove(t.id); refreshAfter(); } } }),
    ])));
    wrap.append(rows);
  }

  function renderMeetings() {
    if (!meetings.length) { wrap.append(emptyState('No meetings logged yet. Tap Log to add one.', 'clock')); return; }
    const rows = el('div.rows.card.mt-16');
    meetings.forEach((m) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openMeetingForm(m, refreshAfter, clients) }, [
        el('div.row-title', { text: m.title || (nameFor(clients, m.client_id) || 'Meeting') }),
        el('div.row-sub', {}, [
          m.meeting_date ? fmtDate(m.meeting_date) + (m.meeting_time ? ' · ' + m.meeting_time : '') : '',
          m.type ? badge(m.type, 'blue') : null,
          nameFor(clients, m.client_id) ? el('span', { text: nameFor(clients, m.client_id) }) : null,
          m.location ? el('span.muted', { text: '· ' + m.location }) : null,
          m.follow_up_on ? badge('follow-up ' + fmtDate(m.follow_up_on), 'amber') : null,
        ]),
      ]),
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this meeting?')) { await Meetings.remove(m.id); refreshAfter(); } } }),
    ])));
    wrap.append(rows);
  }

  function renderExpenses() {
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const yr = String(now.getFullYear());
    const sum = (a) => a.reduce((s, e) => s + n(e.amount), 0);
    wrap.append(el('div.statstrip.mt-8', {}, [
      stat(money(sum(expenses.filter((e) => (e.expense_date || '').slice(0, 7) === ym))), 'This month'),
      stat(money(sum(expenses.filter((e) => (e.expense_date || '').slice(0, 4) === yr))), 'This year'),
      stat(String(expenses.length), 'Entries'),
    ]));
    if (!expenses.length) { wrap.append(emptyState('No expenses logged yet. Tap Log to add one (snap a receipt).', 'money')); return; }
    const rows = el('div.rows.card.mt-16');
    expenses.forEach((e) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openExpenseForm(e, refreshAfter, clients) }, [
        el('div.row-title', { text: money(e.amount) + (e.vendor ? ' · ' + e.vendor : '') }),
        el('div.row-sub', {}, [
          e.expense_date ? fmtDate(e.expense_date) : '',
          e.category ? badge(e.category, 'gray') : null,
          nameFor(clients, e.client_id) ? el('span', { text: nameFor(clients, e.client_id) }) : null,
          e.receipt_url ? badge('receipt', 'blue') : null,
        ]),
      ]),
      e.receipt_url ? el('a.icon-btn', { href: e.receipt_url, target: '_blank', title: 'View receipt', html: iconSvg('external', 16) }) : null,
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this expense?')) { await Expenses.remove(e.id); refreshAfter(); } } }),
    ])));
    wrap.append(rows);
  }

  function renderRenewals() {
    // Pull domain / hosting / email renewal dates off every client into one radar.
    const items = [];
    clients.forEach((c) => {
      [['Domain', c.domain_name, c.domain_renews_on], ['Hosting', c.hosting_provider, c.hosting_renews_on], ['Email', c.email_provider, c.email_renews_on]]
        .forEach(([kind, provider, date]) => { if (date) items.push({ c, kind, provider, date }); });
    });
    items.sort((a, b) => (a.date > b.date ? 1 : -1));
    const soon = items.filter((i) => daysUntil(i.date) <= 30).length;
    wrap.append(el('div.statstrip.mt-8', {}, [
      stat(String(items.length), 'Tracked'),
      stat(String(soon), 'Due ≤30 days'),
      stat(String(items.filter((i) => daysUntil(i.date) < 0).length), 'Overdue'),
    ]));
    if (!items.length) { wrap.append(el('div.banner.mt-8', { html: 'No renewal dates yet. Add domain / hosting / email renewal dates on a client (Services &amp; status tab) and they’ll appear here.' })); return; }
    const rows = el('div.rows.card.mt-16');
    items.forEach((i) => {
      const d = daysUntil(i.date);
      const tone = d < 0 ? 'red' : d <= 30 ? 'amber' : 'green';
      rows.append(el('div.row.clickable', { onclick: () => { location.hash = '#/client/' + i.c.id; } }, [
        el('div.row-main', {}, [
          el('div.row-title', { text: i.c.business_name + ' — ' + i.kind + ' renewal' }),
          el('div.row-sub', {}, [i.provider ? el('span', { text: i.provider }) : null, el('span', { text: fmtDate(i.date) })]),
        ]),
        el('div.row-right', {}, [badge((d < 0 ? Math.abs(d) + 'd overdue' : 'in ' + d + 'd'), tone)]),
      ]));
    });
    wrap.append(rows);
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}

function stat(value, label) {
  return el('div.stat', {}, [el('div.stat-value', { text: value }), el('div.stat-label', { text: label })]);
}
function clientOptions(list) {
  return [{ key: '', label: '— No client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];
}

export function openTripForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const milesInput = numberInput('miles', existing.miles ?? '', { step: '0.1', placeholder: '0' });
  const fromInput = textInput('from_address', existing.from_address, { placeholder: 'Start address' });
  const toInput = textInput('to_address', existing.to_address, { placeholder: 'Destination address' });
  const roundChk = el('input.checkbox', { type: 'checkbox', name: 'round_trip', checked: !!existing.round_trip });
  const status = el('span.field-hint');

  async function calc() {
    const from = fromInput.value.trim(), to = toInput.value.trim();
    if (!from || !to) { status.textContent = 'Enter both addresses first'; return; }
    status.textContent = 'Calculating…';
    try {
      let mi = await drivingMiles(from, to);
      const label = mi + ' mi each way';
      if (roundChk.checked) mi = Math.round(mi * 2 * 10) / 10;
      milesInput.value = mi;
      status.textContent = roundChk.checked ? `${label} → ${mi} mi round trip` : `${mi} mi`;
    } catch (e) { status.textContent = e.message || 'Could not calculate'; }
  }

  const calcBlock = mapboxReady()
    ? el('div', {}, [
        field('From', fromInput),
        field('To', toInput),
        el('div.field-row.mt-8', { style: 'align-items:center;gap:12px' }, [
          el('label.field-row', { style: 'gap:6px' }, [roundChk, el('span', { text: 'Round trip' })]),
          el('button.btn.btn-ghost.btn-sm', { type: 'button', html: iconSvg('location', 15) + ' Calculate miles', onclick: calc }),
        ]),
        el('div.mt-8', {}, [status]),
      ])
    : el('div', {}, [
        field('From', fromInput),
        field('To', toInput),
        el('div.field-hint.mt-8', { text: 'Add a Mapbox token in config to auto-calculate miles from these addresses.' }),
      ]);

  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Date', dateInput('trip_date', existing.trip_date || todayISO())),
      field('Client', selectInput('client_id', clientOptions(list), existing.client_id || '')),
      field('Purpose', selectInput('purpose', TRIP_PURPOSES, existing.purpose || TRIP_PURPOSES[0])),
      field('Rate ($/mi)', numberInput('rate', existing.rate ?? mileageRateFor(existing.trip_date), { step: '0.005' })),
    ]),
    calcBlock,
    field('Miles', milesInput),
    field('Notes', textInput('notes', existing.notes, { placeholder: 'Anything worth noting' })),
  ]);
  const collect = () => {
    const v = readForm(node);
    v.miles = Number(v.miles || 0);
    v.rate = v.rate === '' || v.rate == null ? mileageRateFor(v.trip_date) : Number(v.rate);
    if (!v.client_id) v.client_id = null;
    return v;
  };
  const { close } = openSheet({
    title: isNew ? 'Log trip' : 'Edit trip', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Save', tone: 'primary', onClick: async () => {
        const v = collect();
        if (!v.miles) { toast('Enter the miles', 'err'); return; }
        try { isNew ? await Trips.create(v) : await Trips.update(existing.id, v); toast('Saved'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this trip?')) { await Trips.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}

function openMeetingForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const node = el('div.form', {}, [
    field('Title', textInput('title', existing.title, { placeholder: 'Kickoff call, site walk-through…' })),
    el('div.form-grid.cols-2', {}, [
      field('Date', dateInput('meeting_date', existing.meeting_date || todayISO())),
      field('Time', textInput('meeting_time', existing.meeting_time, { placeholder: '2:00 PM' })),
      field('Client', selectInput('client_id', clientOptions(list), existing.client_id || '')),
      field('Type', selectInput('type', MEETING_TYPES, existing.type || MEETING_TYPES[0])),
      field('Location', textInput('location', existing.location, { placeholder: 'Address / link' })),
      field('Follow-up on', dateInput('follow_up_on', existing.follow_up_on)),
    ]),
    field('Attendees', textInput('attendees', existing.attendees, { placeholder: 'Who was there' })),
    field('Notes', textArea('notes', existing.notes, { rows: 3, placeholder: 'What was discussed, next steps…' })),
  ]);
  const collect = () => {
    const v = readForm(node);
    if (!v.client_id) v.client_id = null;
    if (!v.follow_up_on) v.follow_up_on = null;
    return v;
  };
  const { close } = openSheet({
    title: isNew ? 'Log meeting' : 'Edit meeting', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Save', tone: 'primary', onClick: async () => {
        const v = collect();
        if (!v.title && !v.client_id) { toast('Add a title or client', 'err'); return; }
        try { isNew ? await Meetings.create(v) : await Meetings.update(existing.id, v); toast('Saved'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this meeting?')) { await Meetings.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}

export function openExpenseForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const receipt = el('input', { type: 'hidden', name: 'receipt_url', value: existing.receipt_url || '' });
  const status = el('span.field-hint', { text: existing.receipt_url ? 'Receipt attached ✓' : 'No receipt' });
  const fileInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    status.textContent = 'Processing…';
    try { receipt.value = await photoToDataUrl(f); status.textContent = 'Receipt attached ✓'; }
    catch (err) { status.textContent = 'Could not read image'; }
  } });
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Amount', numberInput('amount', existing.amount ?? '', { step: '0.01', placeholder: '0.00' })),
      field('Date', dateInput('expense_date', existing.expense_date || todayISO())),
      field('Category', selectInput('category', EXPENSE_CATEGORIES, existing.category || EXPENSE_CATEGORIES[0])),
      field('Vendor', textInput('vendor', existing.vendor, { placeholder: 'e.g. Canva, Google Ads' })),
      field('Client (optional)', selectInput('client_id', clientOptions(list), existing.client_id || '')),
    ]),
    field('Notes', textInput('notes', existing.notes, { placeholder: 'What was it for?' })),
    el('div.field-row.mt-8', { style: 'align-items:center;gap:10px' }, [
      el('button.btn.btn-ghost.btn-sm', { type: 'button', html: iconSvg('camera', 15) + ' Receipt photo', onclick: () => fileInput.click() }),
      status,
    ]),
    fileInput, receipt,
  ]);
  const collect = () => { const v = readForm(node); v.amount = Number(v.amount || 0); if (!v.client_id) v.client_id = null; return v; };
  const { close } = openSheet({
    title: isNew ? 'Log expense' : 'Edit expense', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Save', tone: 'primary', onClick: async () => {
        const v = collect();
        if (!v.amount) { toast('Enter an amount', 'err'); return; }
        try { isNew ? await Expenses.create(v) : await Expenses.update(existing.id, v); toast('Saved'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this expense?')) { await Expenses.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}
