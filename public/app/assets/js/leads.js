// Leads & Prospects — the sales side of the pipeline. Leads and prospects
// (and deferred), grouped by stage, each with quick Won / Lost / Deferred
// actions. Won → becomes a client; Lost/Deferred move it out of the active list.
import { Clients } from './db.js';
import { STAGES, STAGE_LABEL, STAGE_TONE, CATEGORIES, SERVICE_LABEL } from './config.js';
import { el, clear, money, iconSvg, pageHeader, badge, statusBadge, fmtDate, relDue, daysUntil, emptyState, primaryBtn, toast, confirmDialog } from './ui.js';
import { openClient } from './client-detail.js';
import { openClientForm } from './forms.js';

const ACTIVE = ['lead', 'prospect', 'deferred'];

export async function renderLeads(root) {
  const state = { view: 'active', q: '' };
  root.append(pageHeader('Leads & Prospects', 'Your sales pipeline', primaryBtn('New', () => openClientForm({ stage: 'lead' }, refreshAfter), 'plus')));

  const toolbar = el('div.toolbar');
  toolbar.append(el('div.search', {}, [
    el('span.ic', { html: iconSvg('search', 18) }),
    el('input', { placeholder: 'Search…', oninput: (e) => { state.q = e.target.value.toLowerCase(); refresh(); } }),
  ]));
  const seg = el('div.segmented');
  [['active', 'Active'], ['won', 'Won'], ['lost', 'Lost/Deferred']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.view === k ? '.on' : ''), { text: l, dataset: { v: k }, onclick: () => { state.view = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.v === k)); refresh(); } })));
  toolbar.append(seg);
  root.append(toolbar);

  const wrap = el('div');
  root.append(wrap);

  let all = [];
  async function load() { all = await Clients.list({ order: { col: 'updated_at', asc: false } }); }

  function refresh() {
    clear(wrap);
    let items = all;
    if (state.view === 'active') items = items.filter((c) => ACTIVE.includes(c.stage));
    else if (state.view === 'won') items = items.filter((c) => c.stage === 'client');
    else items = items.filter((c) => c.stage === 'lost' || c.stage === 'past_client');
    if (state.q) items = items.filter((c) => (c.business_name || '').toLowerCase().includes(state.q) || (c.contact_name || '').toLowerCase().includes(state.q));

    // counts
    wrap.append(el('div.grid.grid-4', {}, [
      tile('Leads', all.filter((c) => c.stage === 'lead').length),
      tile('Prospects', all.filter((c) => c.stage === 'prospect').length),
      tile('Deferred', all.filter((c) => c.stage === 'deferred').length),
      tile('Won (clients)', all.filter((c) => c.stage === 'client').length),
    ]));

    if (!items.length) { wrap.append(emptyState('Nothing here yet.', 'pipeline')); return; }

    if (state.view === 'active') {
      ['lead', 'prospect', 'deferred'].forEach((stage) => {
        const group = items.filter((c) => c.stage === stage);
        if (!group.length) return;
        wrap.append(el('div.section-title', {}, [el('h3', { text: STAGE_LABEL[stage] }), el('span.badge.badge-gray', { text: String(group.length) })]));
        const rows = el('div.rows.card');
        group.forEach((c) => rows.append(leadRow(c)));
        wrap.append(rows);
      });
    } else {
      const rows = el('div.rows.card.mt-8');
      items.forEach((c) => rows.append(leadRow(c)));
      wrap.append(rows);
    }
  }

  function leadRow(c) {
    const follow = c.next_follow_up ? el('span', { class: daysUntil(c.next_follow_up) < 0 ? 'text-red' : (daysUntil(c.next_follow_up) <= 3 ? 'text-amber' : 'muted'), text: 'follow-up ' + relDue(c.next_follow_up) }) : null;
    const row = el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openClient(c.id, refreshAfter) }, [
        el('div.row-title', { text: c.business_name }),
        el('div.row-sub', {}, [
          badge(STAGE_LABEL[c.stage], STAGE_TONE[c.stage] || 'gray'),
          c.category ? el('span', { text: c.category }) : null,
          c.mrr ? badge(money(c.mrr) + '/mo', 'green') : null,
          follow,
          c.follow_up_note ? el('span.muted', { text: '· ' + c.follow_up_note }) : null,
        ]),
      ]),
    ]);
    if (ACTIVE.includes(c.stage)) {
      row.append(el('div.row-right', {}, [
        el('button.btn.btn-sm.btn-primary', { text: 'Won', title: 'Mark won → client', onclick: (e) => { e.stopPropagation(); mark(c, 'client', 'Won! Now a client.'); } }),
        el('button.btn.btn-sm.btn-ghost', { text: 'Defer', onclick: (e) => { e.stopPropagation(); mark(c, 'deferred', 'Deferred'); } }),
        el('button.btn.btn-sm.btn-ghost', { text: 'Lost', onclick: async (e) => { e.stopPropagation(); if (await confirmDialog(`Mark ${c.business_name} as lost?`, { confirmLabel: 'Mark lost', tone: 'danger' })) mark(c, 'lost', 'Marked lost'); } }),
      ]));
    } else {
      row.append(el('div.row-right', {}, [el('span.icon-btn', { html: iconSvg('chevron', 18) })]));
    }
    return row;
  }

  async function mark(c, stage, msg) {
    try { await Clients.update(c.id, { stage }); toast(msg); refreshAfter(); }
    catch (e) { toast(e.message, 'err'); }
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}

function tile(label, n) {
  return el('div.stat', {}, [el('div.stat-value', { text: String(n) }), el('div.stat-label', { text: label })]);
}
