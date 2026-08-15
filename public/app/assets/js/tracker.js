// Tracker — mileage log (with IRS-rate deduction) + meeting log. One tab, two
// views. Both can be tied to a client and filed newest-first.
import { Trips, Meetings, Clients } from './db.js';
import { MILEAGE_RATE, mileageRateFor, TRIP_PURPOSES, MEETING_TYPES } from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, fmtDate, todayISO, emptyState, primaryBtn,
  field, textInput, numberInput, textArea, selectInput, dateInput, readForm,
  openSheet, toast, confirmDialog,
} from './ui.js';

const n = (x) => Number(x || 0);
const usd = (x) => '$' + n(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const miFmt = (x) => n(x).toLocaleString('en-US', { maximumFractionDigits: 1 });
const tripDeduction = (t) => n(t.miles) * (t.rate == null ? mileageRateFor(t.trip_date) : n(t.rate));
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '';

export async function renderTracker(root) {
  const state = { view: 'mileage' };
  root.append(pageHeader('Tracker', 'Mileage & meetings', primaryBtn('Log', () => (state.view === 'mileage' ? openTripForm({}, refreshAfter, clients) : openMeetingForm({}, refreshAfter, clients)), 'plus')));

  const seg = el('div.segmented');
  [['mileage', 'Mileage'], ['meetings', 'Meetings']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let clients = [], trips = [], meetings = [];
  async function load() {
    [clients, trips, meetings] = await Promise.all([
      Clients.list({ order: { col: 'business_name', asc: true } }),
      Trips.list({ order: { col: 'trip_date', asc: false } }),
      Meetings.list({ order: { col: 'meeting_date', asc: false } }),
    ]);
  }

  function refresh() {
    clear(wrap);
    state.view === 'mileage' ? renderMileage() : renderMeetings();
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

function openTripForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Date', dateInput('trip_date', existing.trip_date || todayISO())),
      field('Miles', numberInput('miles', existing.miles ?? '', { step: '0.1', placeholder: '0' })),
      field('Client', selectInput('client_id', clientOptions(list), existing.client_id || '')),
      field('Purpose', selectInput('purpose', TRIP_PURPOSES, existing.purpose || TRIP_PURPOSES[0])),
      field('Rate ($/mi)', numberInput('rate', existing.rate ?? mileageRateFor(existing.trip_date), { step: '0.005' })),
    ]),
    field('Notes', textInput('notes', existing.notes, { placeholder: 'Where to / from, or anything worth noting' })),
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
