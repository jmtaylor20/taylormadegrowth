// Pending tab — quoted jobs: awaiting the customer's decision, and wins to schedule.
// A win only leaves this tab once it has a work date on it.
import { h, clear, money, custName, icon } from './ui.js';
import { STATUS } from './config.js';
import { pendingJobs } from './db.js';
import { openJob } from './sheet.js';

export function renderPending(root) {
  clear(root);
  const body = h('div', {}, h('div', { class: 'muted center' }, 'Loading…'));
  root.append(h('div', { class: 'view-head' }, h('h1', {}, 'Pending'), h('p', {}, 'Quoted jobs — awaiting the customer, and wins ready to schedule.')), body);

  async function load() {
    try {
      const jobs = await pendingJobs();
      clear(body);
      const groups = [
        { title: 'Won — schedule it', filter: (j) => j.status === 'won', cta: 'Schedule job', focus: 'schedule' },
        { title: 'Quoted — awaiting decision', filter: (j) => j.status === 'estimate_given', cta: 'Open', focus: null },
      ];
      let any = false;
      groups.forEach((g) => {
        const items = jobs.filter(g.filter);
        if (!items.length) return;
        any = true;
        body.append(h('div', { class: 'group-head' }, g.title, h('span', { class: 'group-count' }, items.length)));
        items.forEach((j) => body.append(pipeCard(j, g, load)));
      });
      if (!any) body.append(h('div', { class: 'empty' }, h('p', {}, 'Nothing pending.'), h('p', { class: 'muted' }, 'Quote a lead from Estimates and it lands here.')));
    } catch (err) { console.error(err); clear(body); body.append(h('div', { class: 'muted center' }, 'Could not load.')); }
  }
  load();
}

function pipeCard(j, group, reload) {
  const s = STATUS[j.status] || STATUS.estimate_given;
  const open = (focus) => openJob(j, reload, { focus });
  return h('div', { class: 'job-card col' },
    h('button', { type: 'button', class: 'job-card-hit', onclick: () => open(null) },
      h('div', { class: 'job-card-top' },
        h('span', { class: 'job-name' }, custName(j)),
        h('span', { class: 'pill', style: `--pill:${s.color}` }, s.short)),
      h('div', { class: 'job-sub' }, [j.address, j.city].filter(Boolean).join(', ') || 'No address'),
      h('div', { class: 'job-meta' },
        h('span', {}, (j.services || []).slice(0, 2).join(', ') || '—'),
        h('span', { class: 'job-amount' }, money(j.estimate_amount))),
      j.estimate_email_status === 'sent' ? h('div', { class: 'job-note note-inline' }, icon('mail', 14), 'Estimate sent') : null,
    ),
    h('div', { class: 'card-actions' },
      j.phone ? h('a', { class: 'qa sm', href: 'tel:' + j.phone }, icon('phone'), 'Call') : null,
      j.phone ? h('a', { class: 'qa sm', href: 'sms:' + j.phone }, icon('message'), 'Text') : null,
      j.email ? h('a', { class: 'qa sm', href: 'mailto:' + j.email, 'aria-label': 'Email' }, icon('mail')) : null,
      h('button', { class: 'qa sm primary', onclick: () => open(group.focus) }, group.cta)),
  );
}
