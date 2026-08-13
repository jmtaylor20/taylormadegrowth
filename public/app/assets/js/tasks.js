// Tasks — monthly management, onboarding, build & content work, assignable to
// the team. Filter by assignee / category / status. Exports openTaskForm, which
// the client detail sheet reuses.
import { Tasks, Clients, tasksFor } from './db.js';
import { TEAM, TASK_CATEGORY, TASK_STATUS } from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, relDue, fmtDate, emptyState, primaryBtn,
  field, textInput, textArea, selectInput, dateInput, checkbox, readForm,
  openSheet, toast, confirmDialog, labelOf,
} from './ui.js';

let clientCache = null;
async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '';

export async function renderTasks(root) {
  const state = { assignee: 'all', status: 'open', q: '' };
  root.append(pageHeader('Tasks', 'Work across every client', primaryBtn('New', async () => openTaskForm({}, refreshAfter, null, await clients()), 'plus')));

  const toolbar = el('div.toolbar');
  const assignees = el('div.segmented');
  ['all', ...TEAM].forEach((a) => assignees.append(el('button.seg' + (state.assignee === a ? '.on' : ''), {
    text: a === 'all' ? 'Everyone' : a, dataset: { a }, onclick: () => { state.assignee = a; assignees.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.a === a)); refresh(); },
  })));
  const statuses = el('div.segmented');
  [['open', 'Open'], ['done', 'Done'], ['all', 'All']].forEach(([k, l]) => statuses.append(el('button.seg' + (state.status === k ? '.on' : ''), {
    text: l, dataset: { s: k }, onclick: () => { state.status = k; statuses.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.s === k)); refresh(); },
  })));
  toolbar.append(assignees, statuses);
  root.append(toolbar);

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

    if (!items.length) { wrap.append(emptyState('No tasks here.', 'tasks')); return; }

    // group by category
    const byCat = {};
    items.forEach((t) => { (byCat[t.category] = byCat[t.category] || []).push(t); });
    TASK_CATEGORY.forEach(({ key, label }) => {
      const group = byCat[key]; if (!group || !group.length) return;
      wrap.append(el('div.section-title', {}, [el('h3', { text: label }), el('span.badge.badge-gray', { text: String(group.length) })]));
      const rows = el('div.rows.card');
      group.sort((a, b) => (a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1)
        .forEach((t) => rows.append(row(t)));
      wrap.append(rows);
    });
  }

  function row(t) {
    const done = t.status === 'done';
    return el('div.row', {}, [
      el('input.checkbox', { type: 'checkbox', checked: done, onchange: async (e) => {
        await Tasks.update(t.id, { status: e.target.checked ? 'done' : 'todo', completed_at: e.target.checked ? new Date().toISOString() : null });
        refreshAfter();
      } }),
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openTaskForm(t, refreshAfter, null, list) }, [
        el('div.row-title', { text: t.title, style: done ? 'text-decoration:line-through;color:var(--muted)' : '' }),
        el('div.row-sub', {}, [
          badge(t.assignee, 'gold'),
          t.client_id ? el('span', { text: nameFor(list, t.client_id) }) : el('span.muted', { text: 'Internal' }),
          t.due_date ? el('span', { class: due(t.due_date, done), text: relDue(t.due_date) }) : null,
          t.recurring ? badge('Monthly', 'violet') : null,
        ]),
      ]),
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this task?')) { await Tasks.remove(t.id); refreshAfter(); } } }),
    ]);
  }

  async function refreshAfter() { await load(); refresh(); }
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
    field('Task', textInput('title', existing.title, { placeholder: 'e.g. Publish monthly GBP post' })),
    el('div.form-grid.cols-2', {}, [
      field('Assignee', selectInput('assignee', TEAM, existing.assignee || 'Josh')),
      field('Category', selectInput('category', TASK_CATEGORY, existing.category || 'general')),
      field('Client', selectInput('client_id', clientOptions, existing.client_id || (client && client.id) || '')),
      field('Due date', dateInput('due_date', existing.due_date)),
    ]),
    field('Details', textArea('detail', existing.detail, { rows: 2 })),
    el('label.field-row', {}, [checkbox('recurring', existing.recurring), el('span', { text: 'Recurring monthly task' })]),
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
        v.status = done ? 'done' : (existing.status && existing.status !== 'done' ? existing.status : 'todo');
        v.completed_at = done ? (existing.completed_at || new Date().toISOString()) : null;
        if (!v.client_id) v.client_id = null;
        try { isNew ? await Tasks.create(v) : await Tasks.update(existing.id, v); toast('Saved'); close(); clientCache = null; onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
    ],
  });
}
