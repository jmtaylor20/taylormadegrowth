// Scheduling helpers: time windows, double-booking detection, and the
// conflict-warning modal.
//
// Wolf Creek runs one crew, so a conflict is simply two jobs whose windows
// overlap on the same day — there is no crew or equipment dimension to check.
import { h, custName, icon, attachSheetDismiss } from './ui.js';

// Every day a job occupies. Multi-day jobs carry the full set in scheduled_dates;
// single-day jobs just have scheduled_date.
export function jobDays(j) {
  const a = j.scheduled_dates;
  if (Array.isArray(a) && a.length) return a.slice().sort();
  return j.scheduled_date ? [j.scheduled_date] : [];
}

export function toMin(t) {
  if (!t) return null;
  const [H, M] = String(t).split(':');
  return (+H) * 60 + (+M || 0);
}
export function fmtT(m) {
  if (m == null) return '';
  const H = Math.floor(m / 60) % 24, M = m % 60;
  const ap = H < 12 ? 'am' : 'pm', h12 = H % 12 || 12;
  return h12 + (M ? ':' + String(M).padStart(2, '0') : '') + ap;
}

// A job's occupied window. Uses the explicit end time when set; otherwise falls
// back to start + estimated hours.
export function windowOf(j) {
  const s = toMin(j.scheduled_time);
  if (s == null) return null;
  const e = toMin(j.scheduled_end_time);
  if (e != null && e > s) return { start: s, end: e };
  const hrs = Number(j.estimated_hours) || 0;
  return { start: s, end: s + Math.round(hrs * 60) };
}
export function windowLabel(j) {
  const w = windowOf(j);
  return w ? fmtT(w.start) + '–' + fmtT(w.end) : (j.scheduled_time ? j.scheduled_time : 'no time');
}

// Conflicts for a candidate booking against existing scheduled jobs:
// a shared day with an overlapping time window.
export function conflictsFor(candidate, others) {
  const cw = windowOf(candidate);
  if (!cw) return []; // no start time on the candidate → nothing to compare
  const candDays = jobDays(candidate);
  const out = [];
  others.forEach((o) => {
    if (candidate.id && o.id === candidate.id) return;
    if (o.status !== 'scheduled') return;
    const shared = candDays.filter((d) => jobDays(o).includes(d));
    if (!shared.length) return;
    const ow = windowOf(o);
    const overlaps = ow ? (cw.start < ow.end && ow.start < cw.end) : true; // unknown other-time → treat as conflict
    if (!overlaps) return;
    out.push({ job: o, window: ow, day: shared[0] });
  });
  return out;
}

// Modal listing conflicts → resolves true if Russ books anyway, false to cancel.
export function confirmConflicts(conflicts) {
  return new Promise((resolve) => {
    const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) done(false); } });
    const sheet = h('div', { class: 'sheet' });
    const rows = conflicts.map((c) => h('div', { class: 'conflict-row' },
      h('span', { class: 'conflict-tag' }, 'Booked'),
      h('span', {}, `${custName(c.job)} — ${c.window ? fmtT(c.window.start) + '–' + fmtT(c.window.end) : 'that day'}`)));
    sheet.append(
      h('div', { class: 'sheet-grab' }),
      h('div', { class: 'sheet-head' }, h('h2', { class: 'note-inline' }, icon('alert', 18), 'Already booked'), h('button', { class: 'icon-btn', onclick: () => done(false) }, icon('x'))),
      h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'You already have work on the books at that time:'), ...rows),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn btn-ghost', onclick: () => done(false) }, 'Pick another time'),
        h('button', { class: 'btn btn-danger-ghost', onclick: () => done(true) }, 'Book anyway')));
    overlay.append(sheet);
    document.body.append(overlay); document.body.style.overflow = 'hidden';
    attachSheetDismiss(overlay, sheet, () => done(false));
    function done(v) { document.body.style.overflow = ''; overlay.remove(); resolve(v); }
  });
}
