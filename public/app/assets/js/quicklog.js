// Quick-log chooser — the shared task/client "Log" sheet. The three log forms
// (time, mileage, expense) live in tracker.js; this re-exports them so every
// entry point imports from one place, and adds the chooser.
import { el, openSheet, iconSvg } from './ui.js';
import { openTripForm, openExpenseForm, openTimeForm } from './tracker.js';
export { openTripForm, openExpenseForm, openTimeForm } from './tracker.js';

// One clean chooser for everything you log: a task (with its hours), mileage,
// an expense, or a standalone chunk of time. Used as the primary "Create"
// action, and from a task/client row to log against that record. `list` is the
// clients available for the picker; `cid` tags the new record to a client.
export function quickLogSheet(task = {}, list = [], onSaved) {
  const cid = task.client_id || null;
  const fromTask = !!task.id;
  const btn = (icon, label, tone, sub, onClick) => el('button.btn.btn-block.' + tone, {
    style: 'text-align:left;display:flex;align-items:center;gap:10px;padding:14px',
    html: iconSvg(icon, 18) + `<span style="display:flex;flex-direction:column;line-height:1.25"><span style="font-weight:600">${label}</span>${sub ? `<span style="font-size:.8em;opacity:.7">${sub}</span>` : ''}</span>`,
    onclick: () => { close(); onClick(); },
  });
  const body = el('div', { style: 'display:flex;flex-direction:column;gap:10px' }, [
    fromTask ? null : btn('plus', 'New task', 'btn-primary', 'Pick a task, set hours, done', async () => { const { openTaskForm } = await import('./tasks.js'); openTaskForm({ client_id: cid }, onSaved, null, list); }),
    btn('car', 'Log mileage', 'btn-ghost', 'Two taps: From → To', () => openTripForm({ client_id: cid }, onSaved, list)),
    btn('money', 'Log expense', 'btn-ghost', 'Tap a preset or type it', () => openExpenseForm({ client_id: cid }, onSaved, list)),
    btn('timer', 'Log time', 'btn-ghost', 'Just hours, no task', () => openTimeForm({ client_id: cid, task_id: task.id, kind: task.category === 'build' ? 'build' : 'task' }, onSaved)),
  ].filter(Boolean));
  const { close } = openSheet({
    title: task.title ? 'Log for: ' + task.title : 'Create',
    body,
    actions: [{ label: 'Close', tone: 'ghost', onClick: () => close() }],
  });
}
