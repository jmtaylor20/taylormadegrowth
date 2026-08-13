// Dashboard — the "operating system" home screen. Money, what needs attention,
// and the pipeline at a glance.
import { loadOverview } from './db.js';
import {
  el, money, fmtDate, relDue, daysUntil, statTile, sectionTitle, emptyState,
  badge, iconSvg, pageHeader,
} from './ui.js';
import { STAGE_LABEL, STAGES } from './config.js';
import { openClient } from './client-detail.js';

export async function renderDashboard(root) {
  root.append(pageHeader('Dashboard', 'Your business at a glance'));
  const loading = el('div.muted', { text: 'Loading…' });
  root.append(loading);

  const { clients, invoices, tasks, activities } = await loadOverview();
  loading.remove();

  const active = clients.filter((c) => c.stage === 'client');
  const mrr = active.reduce((s, c) => s + Number(c.mrr || 0), 0);
  const unpaidBuild = clients.filter((c) => Number(c.build_fee) > 0 && !c.build_fee_paid).reduce((s, c) => s + Number(c.build_fee), 0);
  const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.amount || 0), 0);
  const collectedThisMonth = invoices.filter((i) => i.status === 'paid' && i.paid_on && sameMonth(i.paid_on)).reduce((s, i) => s + Number(i.amount || 0), 0);

  // ---- Stat tiles ----
  root.append(el('div.grid.grid-4', {}, [
    el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(mrr) }), el('div.stat-label', { text: 'MRR' }), el('div.stat-sub', { text: active.length + ' active clients' })]),
    statTile('Collected this month', money(collectedThisMonth)),
    statTile('Outstanding', money(outstanding), outstanding ? 'awaiting payment' : 'all clear'),
    statTile('Unpaid build fees', money(unpaidBuild)),
  ]));

  // ---- Needs attention ----
  const overdueInv = invoices.filter((i) => i.status === 'overdue' || (i.status === 'sent' && i.due_on && daysUntil(i.due_on) < 0));
  const followups = clients.filter((c) => c.next_follow_up && daysUntil(c.next_follow_up) <= 3)
    .sort((a, b) => (a.next_follow_up > b.next_follow_up ? 1 : -1));
  const dueTasks = tasks.filter((t) => t.status !== 'done' && t.due_date && daysUntil(t.due_date) <= 3)
    .sort((a, b) => (a.due_date > b.due_date ? 1 : -1));
  const renewals = collectRenewals(clients).filter((r) => r.days != null && r.days <= 30).sort((a, b) => a.days - b.days);

  root.append(sectionTitle('Needs attention'));
  const attn = el('div.grid.grid-2');

  attn.append(attnCard('Follow-ups due', 'phone', followups.map((c) => ({
    title: c.business_name, sub: relDue(c.next_follow_up) + (c.follow_up_note ? ' · ' + c.follow_up_note : ''),
    tone: daysUntil(c.next_follow_up) < 0 ? 'red' : 'amber', onClick: () => openClient(c.id, () => renderDashboard(clear(root))),
  }))));

  attn.append(attnCard('Money owed', 'money', overdueInv.map((i) => ({
    title: nameFor(clients, i.client_id) || i.description || 'Invoice', sub: money(i.amount) + ' · ' + (i.due_on ? relDue(i.due_on) : 'overdue'),
    tone: 'red', onClick: i.client_id ? () => openClient(i.client_id, () => renderDashboard(clear(root))) : null,
  }))));

  attn.append(attnCard('Tasks due soon', 'tasks', dueTasks.map((t) => ({
    title: t.title, sub: badge(t.assignee, 'gold').outerHTML + ' ' + relDue(t.due_date), html: true,
    tone: daysUntil(t.due_date) < 0 ? 'red' : 'amber', onClick: t.client_id ? () => openClient(t.client_id, () => renderDashboard(clear(root))) : null,
  }))));

  attn.append(attnCard('Renewals within 30 days', 'renew', renewals.map((r) => ({
    title: r.client + ' · ' + r.kind, sub: fmtDate(r.date) + ' · ' + relDue(r.date),
    tone: r.days <= 7 ? 'red' : 'amber', onClick: () => openClient(r.id, () => renderDashboard(clear(root))),
  }))));

  root.append(attn);

  // ---- Pipeline snapshot ----
  root.append(sectionTitle('Pipeline'));
  const counts = STAGES.map((s) => ({ ...s, n: clients.filter((c) => c.stage === s.key).length }));
  root.append(el('div.grid.grid-4', {}, counts.slice(0, 4).map((s) =>
    el('div.stat', { style: 'cursor:pointer', onclick: () => { location.hash = '#/pipeline'; } }, [
      el('div.stat-value', { text: String(s.n) }), el('div.stat-label', { text: s.label }),
    ])
  )));
}

function attnCard(title, icon, items) {
  const card = el('div.card');
  card.append(el('div.section-title', { style: 'margin:14px 14px 6px' }, [el('h3', { html: `${iconSvg(icon, 16)} ${title}` }), el('span.badge.badge-gray', { text: String(items.length) })]));
  if (!items.length) { card.append(el('div.card-pad.muted', { text: 'Nothing right now — nice.' })); return card; }
  const rows = el('div.rows');
  items.slice(0, 6).forEach((it) => {
    rows.append(el('div.row' + (it.onClick ? '.clickable' : ''), { onclick: it.onClick || undefined }, [
      el('div.row-main', {}, [
        el('div.row-title', { text: it.title }),
        el('div.row-sub', it.html ? { html: it.sub } : { text: it.sub }),
      ]),
      it.tone ? el('span.dot', { style: `width:8px;height:8px;background:var(--${it.tone})` }) : null,
    ]));
  });
  card.append(rows);
  return card;
}

function collectRenewals(clients) {
  const out = [];
  for (const c of clients) {
    for (const [kind, date] of [['Domain', c.domain_renews_on], ['Hosting', c.hosting_renews_on], ['Email', c.email_renews_on]]) {
      if (date) out.push({ id: c.id, client: c.business_name, kind, date, days: daysUntil(date) });
    }
  }
  return out;
}

const nameFor = (clients, id) => (clients.find((c) => c.id === id) || {}).business_name;
function sameMonth(d) { const n = new Date(); const x = new Date(d + 'T00:00:00'); return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth(); }
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
