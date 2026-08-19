// The engagement overview: every section a client has been asked to complete.
//
// This is the whole portal for most of the time someone is in it — they land
// here, pick something up, and come back to it. So it answers the three
// questions a client actually has, in order: what is left, who owns it, when is
// it due. Progress counts Unknown and Doesn't-apply as done, because they are.

import { el, clear, spinner, dueLabel } from './ui.js';
import { sectionsFor, myContact } from './db.js';

const STATUS_COPY = {
  not_started: { label: 'Not started', tone: 'idle' },
  in_progress: { label: 'In progress', tone: 'busy' },
  submitted:   { label: 'Submitted',   tone: 'done' },
  accepted:    { label: 'Accepted',    tone: 'done' },
  waived:      { label: 'Not needed',  tone: 'idle' },
};

export async function renderSections(mount, { engagement, onOpen }) {
  clear(mount);
  mount.append(spinner('Loading your sections…'));

  let rows, contacts;
  try {
    [rows, contacts] = await Promise.all([sectionsFor(engagement.id), myContact()]);
  } catch (err) {
    clear(mount);
    mount.append(el('div.empty', {}, [
      el('h2', { text: 'We could not load this' }),
      el('p', { text: err.message || 'Please try again in a moment.' }),
    ]));
    return;
  }

  const contactName = Object.fromEntries((contacts || []).map((c) => [c.id, c.name]));
  clear(mount);

  const open = rows.filter((r) => r.status !== 'submitted' && r.status !== 'accepted' && r.status !== 'waived');
  const done = rows.filter((r) => !open.includes(r));

  mount.append(el('header.page-head', {}, [
    el('h1.page-title', { text: engagement.title || 'Onboarding' }),
    el('p.page-sub', { text: summary(rows) }),
    progressBar(rows),
  ]));

  if (!rows.length) {
    mount.append(el('div.empty', {}, [
      el('h2', { text: "Nothing to fill in yet" }),
      el('p', { text: "We'll email you as soon as the first section is ready." }),
    ]));
    return;
  }

  if (open.length) {
    mount.append(el('h2.list-head', { text: open.length === rows.length ? 'Your sections' : 'Still to do' }));
    mount.append(el('div.cards', {}, open.map((r) => card(r, contactName, onOpen))));
  }
  if (done.length) {
    mount.append(el('h2.list-head', { text: 'Done' }));
    mount.append(el('div.cards', {}, done.map((r) => card(r, contactName, onOpen))));
  }
}

function summary(rows) {
  if (!rows.length) return '';
  const finished = rows.filter((r) => ['submitted', 'accepted', 'waived'].includes(r.status)).length;
  if (finished === rows.length) return "Everything's in. Thank you — we'll take it from here.";
  const left = rows.length - finished;
  return `${left} of ${rows.length} section${rows.length === 1 ? '' : 's'} left to complete.`;
}

function progressBar(rows) {
  const total = rows.reduce((n, r) => n + (r.progress.field_count || 0), 0);
  const filled = rows.reduce((n, r) => n + Math.min(r.progress.response_count || 0, r.progress.field_count || 0), 0);
  const pct = total ? Math.round((100 * filled) / total) : 0;
  return el('div.bar-wrap', {}, [
    el('div.bar', {}, [el('div.bar-fill', { style: `width:${pct}%` })]),
    el('span.bar-pct', { text: `${pct}%` }),
  ]);
}

function card(row, contactName, onOpen) {
  // A section carrying answers is in progress, whatever the stored status says.
  // The status column is written when someone opens a section in the portal, so
  // answers that arrived any other way — a staff import, a write that failed
  // after the answer landed — would otherwise read as "Not started" next to
  // "11 of 16 answered", which tells a client their work is missing.
  const effective = row.status === 'not_started' && (row.progress.response_count || 0) > 0
    ? 'in_progress' : row.status;
  const st = STATUS_COPY[effective] || STATUS_COPY.not_started;
  const due = dueLabel(row.due_date);
  const pct = row.progress.percent_complete;
  const assignee = row.assigned_contact_id ? contactName[row.assigned_contact_id] : null;

  return el('button.card', { type: 'button', onclick: () => onOpen(row) }, [
    el('div.card-top', {}, [
      el('h3.card-title', { text: row.section.title }),
      el('span.pill.' + st.tone, { text: st.label }),
    ]),
    row.section.intro ? el('p.card-intro', { text: row.section.intro }) : null,
    el('div.card-meta', {}, [
      row.progress.field_count
        ? el('span.meta', { text: `${Math.min(row.progress.response_count, row.progress.field_count)} of ${row.progress.field_count} answered` })
        : null,
      // Assignment is shown to everyone, not just the assignee: a client with
      // three people in the portal needs to see that Capacity is Marcus's, or
      // two of them fill it in twice.
      assignee ? el('span.meta', { text: `For ${assignee}` }) : null,
      due ? el('span.meta.' + due.tone, { text: due.text }) : null,
    ].filter(Boolean)),
    pct != null ? el('div.bar.thin', {}, [el('div.bar-fill', { style: `width:${pct}%` })]) : null,
  ].filter(Boolean));
}
