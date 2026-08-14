// Tasks — every client's to-dos, grouped by client. One-time and recurring
// (weekly → every-3-years), renewals included. Completing a recurring task rolls
// it forward to the next cycle instead of closing it. Exports openTaskForm +
// markTaskDone, reused by the client detail sheet.
import { Tasks, Clients, tasksFor } from './db.js';
import { TEAM, TASK_CATEGORY, TASK_STATUS, RECUR_INTERVAL } from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, relDue, fmtDate, daysUntil, emptyState, primaryBtn,
  field, textInput, textArea, selectInput, dateInput, checkbox, readForm,
  openSheet, toast, confirmDialog, labelOf,
} from './ui.js';

let clientCache = null;
async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '';
const intervalLabel = (k) => (RECUR_INTERVAL.find((r) => r.key === k) || {}).label || '';

// Advance a date string by a recurrence interval.
export function advanceDate(dateStr, interval) {
  const item = RECUR_INTERVAL.find((r) => r.key === interval) || { months: 1 };
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (item.days) base.setDate(base.getDate() + item.days);
  else base.setMonth(base.getMonth() + (item.months || 1));
  return base.toISOString().slice(0, 10);
}

// Mark a task done/undone. Recurring tasks roll forward to the next due date
// (and stay open) instead of closing. Returns {recurred, next}.
export async function markTaskDone(t, done) {
  const interval = t.recur_interval && t.recur_interval !== 'none' ? t.recur_interval : null;
  if (done && interval) {
    const next = advanceDate(t.due_date, interval);
    await Tasks.update(t.id, { due_date: next, status: 'todo', completed_at: null });
    return { recurred: true, next };
  }
  await Tasks.update(t.id, { status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null });
  return { recurred: false };
}

export async function renderTasks(root) {
  const state = { assignee: 'all', status: 'open', due: 'any' };
  root.append(pageHeader('Tasks', 'By client — one-time & recurring', el('div.pill-row', {}, [
    el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('renew', 15)} Renewal`, onclick: async () => openTaskForm({ category: 'renewal', recur_interval: 'annual' }, refreshAfter, null, await clients()) }),
    primaryBtn('Task', async () => openTaskForm({}, refreshAfter, null, await clients()), 'plus'),
  ])));

  const assignees = el('div.segmented');
  ['all', ...TEAM].forEach((a) => assignees.append(el('button.seg' + (state.assignee === a ? '.on' : ''), {
    text: a === 'all' ? 'Everyone' : a, dataset: { a }, onclick: () => { state.assignee = a; assignees.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.a === a)); refresh(); },
  })));
  root.append(el('div.toolbar', {}, [assignees]));

  const statuses = el('div.segmented');
  [['open', 'Open'], ['done', 'Done'], ['all', 'All']].forEach(([k, l]) => statuses.append(el('button.seg' + (state.status === k ? '.on' : ''), {
    text: l, dataset: { s: k }, onclick: () => { state.status = k; statuses.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.s === k)); refresh(); },
  })));
  const dues = el('div.segmented');
  [['any', 'Any time'], ['overdue', 'Overdue'], ['week', 'This week'], ['month', 'This month']].forEach(([k, l]) => dues.append(el('button.seg' + (state.due === k ? '.on' : ''), {
    text: l, dataset: { d: k }, onclick: () => { state.due = k; dues.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.d === k)); refresh(); },
  })));
  root.append(el('div.toolbar', {}, [statuses, dues]));

  const wrap = el('div');
  root.append(wrap);

  let all = [], list = [];
  async function load() { [all, list] = await Promise.all([tasksFor(null), clients()]); }

  function refresh() {
    clear(wrap);
    let items = all.slice();
    if (state.assignee !== 'all') items = items.filter((t) => t.assignee === state.assignee);
    if (state.status === 'open') items = items.filter((t) => t.status !== 'done');
    else if (state.status === 'done') items = items.filter((t) => t.status === 'done');
    if (state.due !== 'any') {
      items = items.filter((t) => {
        if (!t.due_date) return false;
        const d = daysUntil(t.due_date);
        if (state.due === 'overdue') return d < 0;
        if (state.due === 'week') return d <= 7;
        return d <= 31;
      });
    }

    if (!items.length) { wrap.append(emptyState('No tasks match.', 'tasks')); return; }

    // Group by client, ordered by client name; internal (no client) last.
    const groups = new Map();
    items.forEach((t) => { const k = t.client_id || '__internal'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    const ordered = list.map((c) => c.id).filter((id) => groups.has(id));
    if (groups.has('__internal')) ordered.push('__internal');

    ordered.forEach((key) => {
      const group = groups.get(key).sort((a, b) => (a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1);
      const name = key === '__internal' ? 'Internal / no client' : nameFor(list, key);
      const openCount = group.filter((t) => t.status !== 'done').length;
      const head = el('div.section-title', {}, [
        el('h3', { text: name, style: key !== '__internal' ? 'cursor:pointer;text-decoration:underline;text-decoration-color:var(--line)' : '', onclick: key !== '__internal' ? () => { location.hash = '#/client/' + key; } : undefined }),
        el('span.badge.badge-gray', { text: openCount + ' open' }),
      ]);
      wrap.append(head);
      const rows = el('div.rows.card');
      group.forEach((t) => rows.append(row(t)));
      wrap.append(rows);
    });
  }

  function row(t) {
    const done = t.status === 'done';
    const recur = t.recur_interval && t.recur_interval !== 'none';
    return el('div.row', {}, [
      el('input.checkbox', { type: 'checkbox', checked: done, onchange: async (e) => {
        const r = await markTaskDone(t, e.target.checked);
        if (r.recurred) toast('Recurring — next due ' + fmtDate(r.next));
        refreshAfter();
      } }),
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openTaskForm(t, refreshAfter, null, list) }, [
        el('div.row-title', { text: t.title, style: done ? 'text-decoration:line-through;color:var(--muted)' : '' }),
        el('div.row-sub', {}, [
          badge(t.assignee, 'gold'),
          badge(labelOf(TASK_CATEGORY, t.category), t.category === 'renewal' ? 'violet' : 'gray'),
          t.due_date ? el('span', { class: due(t.due_date, done), text: relDue(t.due_date) }) : null,
          recur ? badge(intervalLabel(t.recur_interval), 'blue') : null,
        ]),
      ]),
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this task?')) { await Tasks.remove(t.id); refreshAfter(); } } }),
    ]);
  }

  async function refreshAfter() { clientCache = null; await load(); refresh(); }
  await load();
  refresh();
}

function due(date, done) {
  if (done) return 'text-green';
  const n = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000;
  return n < 0 ? 'text-red' : n <= 3 ? 'text-amber' : 'muted';
}

// Shared task create/edit sheet. clientList optional (loaded if omitted).
export async function openTaskForm(existing = {}, onSaved, client, clientList) {
  const list = clientList || await clients();
  const isNew = !existing.id;
  const clientOptions = [{ key: '', label: 'Internal (no client)' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];
  const node = el('div.form', {}, [
    field('Task', textInput('title', existing.title, { placeholder: 'e.g. Publish monthly GBP post, or Renew domain' })),
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOptions, existing.client_id || (client && client.id) || '')),
      field('Assignee', selectInput('assignee', TEAM, existing.assignee || 'Josh')),
      field('Category', selectInput('category', TASK_CATEGORY, existing.category || 'general')),
      field('Repeat', selectInput('recur_interval', RECUR_INTERVAL, existing.recur_interval || 'none')),
      field('Due date', dateInput('due_date', existing.due_date)),
    ]),
    field('Details', textArea('detail', existing.detail, { rows: 2 })),
    isNew ? null : el('label.field-row', {}, [checkbox('__done', existing.status === 'done'), el('span', { text: 'Completed' })]),
  ]);
  const { close } = openSheet({
    title: isNew ? 'New task' : 'Edit task', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: isNew ? 'Add' : 'Save', tone: 'primary', onClick: async () => {
        const v = readForm(node);
        if (!v.title) { toast('Task name required', 'err'); return; }
        const done = v.__done; delete v.__done;
        v.recurring = v.recur_interval && v.recur_interval !== 'none';
        v.status = done ? 'done' : (existing.status && existing.status !== 'done' ? existing.status : 'todo');
        v.completed_at = done ? (existing.completed_at || new Date().toISOString()) : null;
        if (!v.client_id) v.client_id = null;
        try { isNew ? await Tasks.create(v) : await Tasks.update(existing.id, v); toast('Saved'); close(); clientCache = null; onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
    ],
  });
}
