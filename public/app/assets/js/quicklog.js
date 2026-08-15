// Quick-log chooser — the shared task/client "Log" sheet. The three log forms
// (time, mileage, expense) live in tracker.js; this re-exports them so every
// entry point imports from one place, and adds the chooser.
import { el, openSheet, iconSvg } from './ui.js';
import { openTripForm, openExpenseForm, openTimeForm } from './tracker.js';
export { openTripForm, openExpenseForm, openTimeForm } from './tracker.js';

// Chooser tied to a task (or client). `list` is the clients available for the
// picker: pass [client] from a client sheet, or the full list elsewhere.
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
