// Shared start/stop timer button for tasks (and client-level work).
// `running` is the currently-open time entry (or null). onChange() re-renders.
import { startTimer, stopTimer } from './db.js';
import { el, iconSvg, fmtElapsedMs, toast } from './ui.js';

// ctx: { client_id, task_id?, kind } — what a fresh timer should be tagged with.
// match: returns true if `running` is the timer for this ctx.
export function timerButton(ctx, running, onChange, match) {
  const isThis = running && (match ? match(running) : (ctx.task_id && running.task_id === ctx.task_id));
  if (isThis) {
    const live = el('span.timer-live', { dataset: { start: running.started_at }, text: fmtElapsedMs(Date.now() - Date.parse(running.started_at)) });
    return el('button.btn.btn-sm.btn-danger.timer-stop', {
      title: 'Stop timer', onclick: async (e) => {
        e.stopPropagation();
        try { await stopTimer(running); toast('Time logged'); onChange?.(); } catch (err) { toast(err.message, 'err'); }
      },
    }, [el('span.btn-ic', { html: iconSvg('stop', 13) }), live]);
  }
  return el('button.icon-btn.timer-start', {
    title: 'Start timer', html: iconSvg('play', 16), onclick: async (e) => {
      e.stopPropagation();
      try { await startTimer(ctx); onChange?.(); } catch (err) { toast(err.message, 'err'); }
    },
  });
}
