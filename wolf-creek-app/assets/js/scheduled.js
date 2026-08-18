// Schedule tab — the job board: what's booked, by day, with past-due work
// pinned to the top so nothing quietly falls off the calendar.
import { h, clear, money, fmtDate, todayStr, custName, icon, metaItem } from './ui.js';
import { scheduledJobs } from './db.js';
import { openJob, openReschedule } from './sheet.js';
import { jobDays } from './sched.js';

export function renderScheduled(root) {
  clear(root);
  const body = h('div', {}, h('div', { class: 'muted center' }, 'Loading…'));
  root.append(
    h('div', { class: 'view-head' },
      h('div', { class: 'head-row' }, h('h1', {}, 'Schedule'), h('a', { class: 'add-btn', href: '#/new-job', 'aria-label': 'Add scheduled job' }, '＋')),
      h('p', {}, 'Work on the books, day by day. Tap Done when a job is finished to invoice it.')),
    body);

  (async () => {
    let jobs = [];
    try { jobs = await scheduledJobs(); } catch (err) { console.error(err); clear(body); body.append(h('div', { class: 'muted center' }, 'Could not load.')); return; }
    clear(body);
    renderJobs(body, jobs, root);
  })();
}

function renderJobs(body, jobs, root) {
  if (!jobs.length) { body.append(h('div', { class: 'empty' }, h('p', {}, 'Nothing scheduled.'), h('p', { class: 'muted' }, 'Win an estimate and set a work date, or tap ＋.'))); return; }
  const today = todayStr();
  const byTime = (a, b) => (a.scheduled_time || '').localeCompare(b.scheduled_time || '');
  // A multi-day job appears under each of its booked days.
  const byDate = {};
  jobs.forEach((j) => {
    const days = jobDays(j);
    if (!days.length) { (byDate.Undated ||= []).push(j); return; }
    days.forEach((d) => { (byDate[d] ||= []).push(j); });
  });
  const dated = Object.keys(byDate).filter((k) => k !== 'Undated').sort();
  const past = dated.filter((d) => d < today);
  const future = dated.filter((d) => d >= today);

  if (past.length) {
    const count = past.reduce((s, d) => s + byDate[d].length, 0);
    body.append(h('div', { class: 'group-head overdue' }, icon('alert', 15), 'Past due — mark done or reschedule', h('span', { class: 'group-count' }, count)));
    past.forEach((d) => {
      body.append(h('div', { class: 'group-head sub overdue' }, fmtDate(d), h('span', { class: 'group-count' }, byDate[d].length)));
      byDate[d].sort(byTime).forEach((j) => body.append(schedCard(j, true, root, d)));
    });
  }
  future.forEach((d) => {
    body.append(h('div', { class: 'group-head' }, fmtDate(d), h('span', { class: 'group-count' }, byDate[d].length)));
    byDate[d].sort(byTime).forEach((j) => body.append(schedCard(j, false, root, d)));
  });
  if (byDate.Undated) {
    body.append(h('div', { class: 'group-head' }, 'No date set', h('span', { class: 'group-count' }, byDate.Undated.length)));
    byDate.Undated.forEach((j) => body.append(schedCard(j, false, root, null)));
  }
}

function schedCard(j, isOverdue, root, day) {
  const reload = () => renderScheduled(root);
  const days = jobDays(j);
  const multi = days.length > 1;
  const dayIdx = day ? days.indexOf(day) + 1 : 0;
  return h('div', { class: 'job-card col' + (isOverdue ? ' overdue-card' : '') },
    h('button', { type: 'button', class: 'job-card-hit', onclick: () => openJob(j, reload) },
      h('div', { class: 'job-card-top' },
        h('span', { class: 'job-name' }, custName(j)),
        h('span', { class: 'job-amount' }, money(j.final_cost != null ? j.final_cost : j.estimate_amount))),
      h('div', { class: 'job-sub' }, [j.address, j.city].filter(Boolean).join(', ') || 'No address'),
      h('div', { class: 'job-meta' },
        h('span', { class: 'meta-items' },
          isOverdue ? metaItem('calendar', fmtDate(day || j.scheduled_date)) : null,
          j.scheduled_time ? metaItem('clock', fmtTime(j.scheduled_time) + (j.scheduled_end_time ? '–' + fmtTime(j.scheduled_end_time) : '')) : null,
          j.acres ? metaItem('estimates', j.acres + ' ac') : null),
        h('span', {}, (j.services || []).slice(0, 2).join(', ') || '—')),
      multi ? h('div', { class: 'job-note note-inline' }, icon('calendar', 14),
        (dayIdx ? 'Day ' + dayIdx + ' of ' + days.length : days.length + ' days') + ' · ' + fmtDate(days[0]) + ' – ' + fmtDate(days[days.length - 1])) : null,
      j.job_notes ? h('div', { class: 'job-note note-inline' }, icon('pending', 14), j.job_notes) : null),
    h('div', { class: 'card-actions' },
      j.phone ? h('a', { class: 'qa sm', href: 'tel:' + j.phone }, icon('phone'), 'Call') : null,
      j.phone ? h('a', { class: 'qa sm', href: 'sms:' + j.phone, 'aria-label': 'Text' }, icon('message')) : null,
      j.address ? h('a', { class: 'qa sm', href: navHref(j), target: '_blank', 'aria-label': 'Navigate' }, icon('navigation')) : null,
      h('button', { class: 'qa sm', onclick: () => openReschedule(j, 'scheduled', reload), 'aria-label': 'Reschedule' }, icon('refresh')),
      h('button', { class: 'qa sm primary', onclick: () => openJob(j, reload, { focus: 'complete', presetStatus: 'completed' }) }, icon('check'), 'Done')),
  );
}

function fmtTime(t) {
  if (!t) return '';
  const [H, M] = t.split(':'); const h12 = +H % 12 || 12; const ap = +H < 12 ? 'am' : 'pm';
  return h12 + (M && M !== '00' ? ':' + M : '') + ap;
}
function navHref(j) { return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent([j.address, j.city, 'AL'].filter(Boolean).join(', ')); }
