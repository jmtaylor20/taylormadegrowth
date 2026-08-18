// Estimates tab — the running list of leads to quote, oldest (longest-waiting)
// first, with any booked estimate visits pinned above them.
import { h, clear, fmtDate, fmtDateTime, waitedLabel, custName, icon } from './ui.js';
import { leadsList } from './db.js';
import { openJob } from './sheet.js';

export function renderEstimates(root) {
  clear(root);
  const body = h('div', {}, h('div', { class: 'muted center' }, 'Loading…'));
  root.append(
    h('div', { class: 'view-head' },
      h('div', { class: 'head-row' },
        h('h1', {}, 'Estimates'),
        h('a', { class: 'add-btn', href: '#/new', 'aria-label': 'New estimate' }, '＋')),
      h('p', {}, 'Leads to quote — longest-waiting on top. Tap one to price it and email the customer.')),
    body,
  );

  async function load() {
    try {
      const leads = await leadsList();
      clear(body);
      if (!leads.length) {
        body.append(h('div', { class: 'empty' },
          h('p', {}, 'No estimates waiting.'),
          h('p', { class: 'muted' }, 'Tap ＋ to add one.')));
        return;
      }
      // Anything with a visit booked goes to the top — that's the day's driving.
      const booked = leads.filter((j) => j.appointment_date).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
      const rest = leads.filter((j) => !j.appointment_date);
      if (booked.length) {
        body.append(h('div', { class: 'group-head' }, 'Visits booked', h('span', { class: 'group-count' }, booked.length)));
        booked.forEach((j) => body.append(leadCard(j, load, true)));
      }
      if (rest.length) {
        if (booked.length) body.append(h('div', { class: 'group-head' }, 'Waiting on a quote', h('span', { class: 'group-count' }, rest.length)));
        rest.forEach((j) => body.append(leadCard(j, load, false)));
      }
    } catch (err) { console.error(err); clear(body); body.append(h('div', { class: 'muted center' }, 'Could not load.')); }
  }
  load();
}

function leadCard(j, reload, showVisit) {
  const waited = waitedLabel(j.received_at || j.created_at);
  return h('div', { class: 'job-card col' },
    h('button', { type: 'button', class: 'job-card-hit', onclick: () => openJob(j, reload, { focus: showVisit ? 'visit' : 'quote' }) },
      h('div', { class: 'job-card-top' },
        h('span', { class: 'job-name' + (custName(j) === 'New lead' ? ' unnamed' : '') }, custName(j)),
        h('span', { class: 'wait-pill' + (waited.includes('day') && parseInt(waited) >= 7 ? ' hot' : '') }, icon('hourglass', 13), waited)),
      h('div', { class: 'job-sub' }, [j.address, j.city].filter(Boolean).join(', ') || 'No address'),
      h('div', { class: 'job-meta' },
        h('span', {}, (j.services || []).slice(0, 2).join(', ') || '—'),
        h('span', { class: 'muted' }, 'Received ' + fmtDateTime(j.received_at || j.created_at))),
      showVisit ? h('div', { class: 'job-note note-inline' }, icon('calendar', 14),
        'Visit ' + fmtDate(j.appointment_date) + (j.appointment_time ? ' · ' + fmtTime(j.appointment_time) : '')) : null,
    ),
    h('div', { class: 'card-actions' },
      j.phone ? h('a', { class: 'qa sm', href: 'tel:' + j.phone }, icon('phone'), 'Call') : null,
      j.phone ? h('a', { class: 'qa sm', href: 'sms:' + j.phone }, icon('message'), 'Text') : null,
      j.address ? h('a', { class: 'qa sm', href: navHref(j), target: '_blank', 'aria-label': 'Navigate' }, icon('navigation')) : null,
      h('button', { class: 'qa sm primary', onclick: () => openJob(j, reload, { focus: 'quote' }) }, 'Quote'),
    ),
  );
}

function fmtTime(t) {
  if (!t) return '';
  const [H, M] = t.split(':'); const h12 = +H % 12 || 12; const ap = +H < 12 ? 'am' : 'pm';
  return h12 + (M && M !== '00' ? ':' + M : '') + ap;
}
function navHref(j) { return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent([j.address, j.city, 'AL'].filter(Boolean).join(', ')); }
