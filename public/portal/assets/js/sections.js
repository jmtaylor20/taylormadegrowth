// The engagement overview: every section a client has been asked to complete.
//
// This is the whole portal for most of the time someone is in it — they land
// here, pick something up, and come back to it. So it answers the three
// questions a client actually has, in order: what is left, who owns it, when is
// it due. Progress counts Unknown and Doesn't-apply as done, because they are.

import { el, clear, spinner, dueLabel } from './ui.js';
import { sectionsFor, myContact } from './db.js';
import { assignmentLabel } from './section.js';

const STATUS_COPY = {
  not_started: { label: 'Not started', tone: 'idle' },
  in_progress: { label: 'In progress', tone: 'busy' },
  submitted:   { label: 'Submitted',   tone: 'done' },
  accepted:    { label: 'Accepted',    tone: 'done' },
  waived:      { label: 'Not needed',  tone: 'idle' },
};

export async function renderSections(mount, { engagement, contactId, onOpen }) {
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

  clear(mount);

  mount.append(el('header.page-head', {}, [
    el('h1.page-title', { text: engagement.title || 'Onboarding' }),
    el('p.page-sub', { text: summary(rows, contactId) }),
    progressBar(rows),
  ]));

  if (!rows.length) {
    mount.append(el('div.empty', {}, [
      el('h2', { text: "Nothing to fill in yet" }),
      el('p', { text: "We'll email you as soon as the first section is ready." }),
    ]));
    return;
  }

  // Grouped by who owns it, not by status. On a three-person engagement the
  // first question anyone has is "which of these are mine" — a single list
  // sorted by position makes that something you work out card by card.
  // Nothing is hidden: a colleague's section is still listed and still opens,
  // because people cover for each other.
  const finished = (r) => ['submitted', 'accepted', 'waived'].includes(r.status);
  const mine     = rows.filter((r) => !finished(r) && contactId && r.assigned_contact_id === contactId);
  const anyones  = rows.filter((r) => !finished(r) && !r.assigned_contact_id);
  const theirs   = rows.filter((r) => !finished(r) && r.assigned_contact_id && !mine.includes(r));
  const done     = rows.filter(finished);

  const group = (heading, note, list) => {
    if (!list.length) return;
    mount.append(el('h2.list-head', { text: heading }));
    if (note) mount.append(el('p.list-note', { text: note }));
    mount.append(el('div.cards', {}, list.map((r) => card(r, contacts, contactId, onOpen))));
  };

  group('Yours to answer', null, mine);
  group('Anyone can answer these', null, anyones);
  group('Waiting on a colleague',
        'Listed so you know where things stand. You can still fill one in if it is quicker.', theirs);
  group('Done', null, done);
}

function summary(rows, contactId) {
  if (!rows.length) return '';
  const finished = rows.filter((r) => ['submitted', 'accepted', 'waived'].includes(r.status)).length;
  if (finished === rows.length) return "Everything's in. Thank you — we'll take it from here.";

  // Lead with the number that is actually this person's problem. "14 sections
  // left" is true and useless to someone who owns four of them.
  const mine = contactId
    ? rows.filter((r) => r.assigned_contact_id === contactId
        && !['submitted', 'accepted', 'waived'].includes(r.status)).length
    : 0;
  const left = rows.length - finished;
  if (mine) return `${mine} section${mine === 1 ? '' : 's'} assigned to you, ${left} left across the whole engagement.`;
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

function card(row, contacts, contactId, onOpen) {
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
  const owner = assignmentLabel(row, contactId, contacts);

  return el('button.card' + (owner?.tone === 'mine' ? '.is-mine' : ''), { type: 'button', onclick: () => onOpen(row) }, [
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
      owner ? el('span.meta.' + owner.tone, { text: owner.text }) : null,
      due ? el('span.meta.' + due.tone, { text: due.text }) : null,
    ].filter(Boolean)),
    pct != null ? el('div.bar.thin', {}, [el('div.bar-fill', { style: `width:${pct}%` })]) : null,
  ].filter(Boolean));
}
