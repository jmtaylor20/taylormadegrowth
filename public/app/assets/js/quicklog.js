// Shared quick-log: time, mileage, and expense — reusable from the Tasks tab
// (the primary place to log), the client sheet, and the Tracker. The trip and
// expense forms live in tracker.js; this adds the time form + a task chooser.
import { TimeEntries } from './db.js';
import {
  el, field, textInput, numberInput, dateInput, selectInput, readForm,
  openSheet, toast, todayISO, iconSvg,
} from './ui.js';
import { openTripForm, openExpenseForm } from './tracker.js';

// Log a chunk of time (optionally against a task). Flows to time_entries.
export function openTimeForm(base = {}, onSaved) {
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Hours', numberInput('hours', base.hours ?? '', { step: '0.25', placeholder: '1.5' })),
      field('Date', dateInput('entry_date', base.entry_date || todayISO())),
      field('Kind', selectInput('kind', [{ key: 'task', label: 'Task work' }, { key: 'build', label: 'Build' }, { key: 'meeting', label: 'Meeting' }, { key: 'general', label: 'General' }], base.kind || 'general')),
    ]),
    field('Note', textInput('notes', base.notes || '', { placeholder: 'What did you work on?' })),
  ]);
  const { close } = openSheet({
    title: 'Log time', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Save', tone: 'primary', onClick: async () => {
        const v = readForm(node);
        const hrs = Number(v.hours || 0);
        if (!hrs) { toast('Enter hours', 'err'); return; }
        try {
          await TimeEntries.create({ client_id: base.client_id || null, task_id: base.task_id || null, kind: v.kind, minutes: Math.round(hrs * 60), entry_date: v.entry_date || todayISO(), notes: v.notes });
          toast('Logged'); close(); onSaved?.();
        } catch (e) { toast(e.message, 'err'); }
      } },
    ],
  });
}

// Quick-log chooser tied to a task (or client). `list` is the clients available
// for the picker: pass [client] from a client sheet, or the full list elsewhere.
export function quickLogSheet(task = {}, list = [], onSaved) {
  const cid = task.client_id || null;
  const btn = (icon, label, tone, onClick) => el('button.btn.btn-block.' + tone, { html: iconSvg(icon, 16) + ' ' + label, onclick: () => { close(); onClick(); } });
  const body = el('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
    btn('timer', 'Log time', 'btn-primary', () => openTimeForm({ client_id: cid, task_id: task.id, kind: task.category === 'build' ? 'build' : 'task' }, onSaved)),
    btn('car', 'Log mileage', 'btn-ghost', () => openTripForm({ client_id: cid }, onSaved, list)),
    btn('money', 'Log expense', 'btn-ghost', () => openExpenseForm({ client_id: cid }, onSaved, list)),
  ]);
  const { close } = openSheet({
    title: task.title ? 'Log for: ' + task.title : 'Log',
    body,
    actions: [{ label: 'Close', tone: 'ghost', onClick: () => close() }],
  });
}
