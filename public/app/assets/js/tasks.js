// Tasks — every client's to-dos, grouped by client. One-time and recurring
// (weekly → every-3-years), renewals included. Completing a recurring task rolls
// it forward to the next cycle instead of closing it. Exports openTaskForm +
// markTaskDone, reused by the client detail sheet.
import { Tasks, Clients, TimeEntries, tasksFor } from './db.js';
import { TEAM, OWNER, FEATURES, TASK_CATEGORY, TASK_PRESETS, DETAIL_PRESETS, RECUR_INTERVAL, SUPABASE_URL } from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, relDue, fmtDate, fmtTime, fmtHours, daysUntil, emptyState, primaryBtn, clientAvatar,
  field, textInput, textArea, selectInput, numberInput, dateInput, checkbox, readForm, hoursSelect,
  openSheet, toast, confirmDialog, labelOf,
} from './ui.js';
import { quickLogSheet, openTripForm, openExpenseForm } from './quicklog.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Compact hours picker for a task row — logs a time entry the moment you pick.
export function hoursQuickSelect(t, onDone) {
  const sel = hoursSelect('', '');
  if (sel.options[0]) sel.options[0].text = '+ hrs';
  sel.style.maxWidth = '96px'; sel.title = 'Log hours for this task';
  sel.onchange = async () => {
    const h = Number(sel.value || 0);
    if (!h) return;
    try {
      await TimeEntries.create({ client_id: t.client_id || null, task_id: t.id, kind: t.category === 'build' ? 'build' : 'task', minutes: Math.round(h * 60), entry_date: todayStr(), notes: t.title });
      toast(fmtHours(Math.round(h * 60)) + ' logged'); sel.value = ''; onDone?.();
    } catch (e) { toast(e.message, 'err'); }
  };
  return sel;
}

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
  root.append(pageHeader('Tasks', 'Sorted by due date — soonest first', el('div.pill-row', {}, [
    el('button.btn.btn-ghost.btn-sm', { html: 'Sync Calendar', title: 'Subscribe to your tasks as a live iOS/Google calendar', onclick: () => subscribeCalendar() }),
    el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('renew', 15)} Renewal`, onclick: async () => openTaskForm({ category: 'renewal', recur_interval: 'annual' }, refreshAfter, null, await clients()) }),
    primaryBtn('Create', async () => quickLogSheet({}, await clients(), refreshAfter), 'plus'),
  ])));

  // Subscribe to the live task feed. webcal:// is handled by iOS Calendar
  // directly (no download), and it auto-refreshes as tasks change.
  function subscribeCalendar() {
    const feed = SUPABASE_URL.replace(/^https?:/, 'webcal:') + '/functions/v1/calendar';
    window.location.href = feed;
    toast('Opening Calendar — tap “Subscribe”');
  }

  // Assignee filter — only shown when the profile has a team (owner mode).
  // A contractor copy is a team of one, so the picker is hidden.
  if (FEATURES.assignee) {
    const assignees = el('div.segmented');
    ['all', ...TEAM].forEach((a) => assignees.append(el('button.seg' + (state.assignee === a ? '.on' : ''), {
      text: a === 'all' ? 'Everyone' : a, dataset: { a }, onclick: () => { state.assignee = a; assignees.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.a === a)); refresh(); },
    })));
    root.append(el('div.toolbar', {}, [assignees]));
  }

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

    // Flat list sorted by due date/time — soonest (and overdue) at the top,
    // undated tasks last. Client is shown by logo/avatar on each row.
    const key = (t) => (t.due_date ? t.due_date + 'T' + (t.due_time || '00:00') : '9999-12-31T99:99');
    items.sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -1 : ka > kb ? 1 : 0; });

    const rows = el('div.rows.card');
    items.forEach((t) => rows.append(row(t)));
    wrap.append(rows);
  }

  // A task is a single-line reminder: check it off, tap to edit, or delete.
  // Logging (hours / mileage / expense) lives on the Create button, not here.
  function row(t) {
    const done = t.status === 'done';
    const client = list.find((c) => c.id === t.client_id);
    // The client's logo right after the check tells you who it's for at a glance.
    let av = null;
    if (client) {
      av = clientAvatar(client);
      av.style.width = '26px'; av.style.height = '26px'; av.style.fontSize = '.66rem'; av.style.flex = '0 0 auto'; av.style.cursor = 'pointer';
      av.title = client.business_name;
      av.onclick = (e) => { e.stopPropagation(); location.hash = '#/client/' + client.id; };
    }
    return el('div.row', {}, [
      el('input.checkbox', { type: 'checkbox', checked: done, title: 'Mark complete', onchange: async (e) => {
        const r = await markTaskDone(t, e.target.checked);
        if (r.recurred) toast('Next due ' + fmtDate(r.next));
        refreshAfter();
      } }),
      av,
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openTaskForm(t, refreshAfter, null, list) }, [
        el('div.row-title', { text: t.title, style: done ? 'text-decoration:line-through;color:var(--muted)' : '' }),
      ]),
      t.due_date ? el('span', { class: due(t.due_date, done), style: 'margin-left:auto;white-space:nowrap;font-size:.82rem', text: relDue(t.due_date) + (t.due_time ? ' · ' + fmtTime(t.due_time) : '') }) : null,
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

// Shared task create/edit sheet — one screen does it all: pick the task (or
// type a custom one), set client + date, optionally punch in hours, and check
// "complete". A single Save creates/updates the task, logs the hours as a time
// entry, and marks it done (rolling recurring tasks forward). clientList
// optional (loaded if omitted).
export async function openTaskForm(existing = {}, onSaved, client, clientList) {
  const list = clientList || await clients();
  const isNew = !existing.id;
  const clientOptions = [{ key: '', label: 'Internal (no client)' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];

  // Task picker: presets + "Other" (reveals a free-text box).
  const isPreset = existing.title && TASK_PRESETS.some((p) => p.label === existing.title);
  const presetOptions = [
    { key: '', label: '— Pick a task —' },
    ...TASK_PRESETS.map((p) => ({ key: p.label, label: p.label })),
    { key: '__other__', label: 'Other / custom…' },
  ];
  const presetSel = selectInput('preset', presetOptions, isNew ? '' : (isPreset ? existing.title : '__other__'));
  const otherInput = textInput('title_other', isPreset ? '' : existing.title, { placeholder: 'Describe the task' });
  const otherField = field('Custom task', otherInput);
  const catSel = selectInput('category', TASK_CATEGORY, existing.category || 'general');
  const hoursSel = hoursSelect('hours', '');
  const syncOther = () => { otherField.style.display = presetSel.value === '__other__' ? '' : 'none'; };
  presetSel.addEventListener('change', () => {
    syncOther();
    const p = TASK_PRESETS.find((x) => x.label === presetSel.value);
    if (p) { catSel.value = p.cat; if (p.hrs && isNew) hoursSel.value = String(p.hrs); rebuildDetails(true); }
    if (presetSel.value === '__other__') otherInput.focus();
  });

  // Details: a category-aware dropdown that pre-fills a vague description of the
  // category's work; pick "Other" to open a box and write the specifics.
  const detailSel = el('select.input', { name: '__detail_pick' });
  const detailOther = textArea('detail_other', '', { rows: 2, placeholder: 'Write the specifics…' });
  const detailOtherField = field('Specific details', detailOther);
  const catDesc = () => DETAIL_PRESETS[catSel.value] || DETAIL_PRESETS.general;
  function syncDetailOther() { detailOtherField.style.display = detailSel.value === '__other__' ? '' : 'none'; }
  function rebuildDetails(selectDefault) {
    const keep = detailSel.value;
    const def = catDesc();
    detailSel.innerHTML = '';
    detailSel.add(new Option(def, def));
    detailSel.add(new Option('Other — write your own…', '__other__'));
    detailSel.value = (!selectDefault && keep === '__other__') ? '__other__' : def;
    syncDetailOther();
  }
  detailSel.onchange = () => { syncDetailOther(); if (detailSel.value === '__other__') detailOther.focus(); };
  catSel.addEventListener('change', () => rebuildDetails(true));

  const node = el('div.form', {}, [
    field('Task', presetSel),
    otherField,
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOptions, existing.client_id || (client && client.id) || '')),
      FEATURES.assignee ? field('Assignee', selectInput('assignee', TEAM, existing.assignee || OWNER)) : null,
      field('Category', catSel),
      field('Date', dateInput('due_date', existing.due_date || todayStr())),
      field('Time', el('input.input', { type: 'time', name: 'due_time', value: existing.due_time || (isNew ? '10:00' : '') })),
    ]),
    field('Details', detailSel),
    detailOtherField,
    el('div.form-grid.cols-2', {}, [
      field('Hours worked (optional)', hoursSel),
      el('label.field-row', { style: 'align-items:center;gap:8px;margin-top:24px' }, [checkbox('__done', existing.status === 'done'), el('span', { text: 'Mark complete' })]),
    ]),
    // Mileage / expense (need addresses / amounts, so they open their own form).
    // Available on new tasks too — pulls the client you've selected above.
    el('div.pill-row', {}, [
      el('button.btn.btn-ghost.btn-sm', { type: 'button', html: iconSvg('car', 15) + ' Add mileage', onclick: () => { const cid = node.querySelector('[name=client_id]')?.value || null; close(); openTripForm({ client_id: cid }, onSaved, list); } }),
      el('button.btn.btn-ghost.btn-sm', { type: 'button', html: iconSvg('money', 15) + ' Add expense', onclick: () => { const cid = node.querySelector('[name=client_id]')?.value || null; close(); openExpenseForm({ client_id: cid }, onSaved, list); } }),
    ]),
  ]);
  syncOther();
  // Seed details from the current category, or restore a custom one on edit.
  rebuildDetails(true);
  if (existing.detail && existing.detail !== catDesc()) { detailSel.value = '__other__'; detailOther.value = existing.detail; syncDetailOther(); }

  const { close } = openSheet({
    title: isNew ? 'New task' : 'Edit task', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this task?')) { await Tasks.remove(existing.id); toast('Deleted'); close(); clientCache = null; onSaved?.(); } } }]),
      { label: 'Save', tone: 'primary', onClick: async () => {
        const v = readForm(node);
        const title = (v.preset === '__other__' ? (v.title_other || '') : (v.preset || '') || existing.title || '').trim();
        if (!title) { toast('Pick or name a task', 'err'); return; }
        const done = !!v.__done;
        const hours = Number(v.hours || 0);
        const cid = v.client_id || null;
        // Repeat isn't shown any more (tasks are reminders) — keep whatever the
        // record already had so renewals still recur.
        const recur = existing.recur_interval || 'none';
        const detail = (detailSel.value === '__other__' ? (detailOther.value || '').trim() : detailSel.value) || null;
        const patch = {
          title,
          client_id: cid,
          assignee: v.assignee || OWNER,
          category: v.category || 'general',
          recur_interval: recur,
          recurring: recur !== 'none',
          due_date: v.due_date || null,
          due_time: v.due_time || null,
          detail,
        };
        try {
          let taskId = existing.id;
          if (isNew) {
            patch.status = done ? 'done' : 'todo';
            patch.completed_at = done ? new Date().toISOString() : null;
            taskId = (await Tasks.create(patch)).id;
          } else {
            await Tasks.update(existing.id, patch);
            if (done && existing.status !== 'done') {
              const r = await markTaskDone({ ...existing, ...patch }, true);
              if (r.recurred) toast('Recurring — next due ' + fmtDate(r.next));
            } else if (!done && existing.status === 'done') {
              await Tasks.update(existing.id, { status: 'todo', completed_at: null });
            }
          }
          if (hours > 0) {
            await TimeEntries.create({
              client_id: cid, task_id: taskId,
              kind: patch.category === 'build' ? 'build' : 'task',
              minutes: Math.round(hours * 60),
              entry_date: patch.due_date || todayStr(),
              notes: title,
            });
          }
          toast(hours > 0 ? `Saved · ${hours}h logged` : 'Saved');
          close(); clientCache = null; onSaved?.();
        } catch (e) { toast(e.message, 'err'); }
      } },
    ],
  });
}
