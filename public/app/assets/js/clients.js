// Clients — the CRM directory. Defaults to active clients; filterable to any
// stage. Search by name. Rows open the detail sheet.
import { Clients } from './db.js';
import { STAGES, STAGE_LABEL, SERVICE_LABEL } from './config.js';
import { el, clear, money, iconSvg, pageHeader, badge, statusBadge, emptyState, primaryBtn, clientAvatar } from './ui.js';
import { openClient } from './client-detail.js';
import { openClientForm } from './forms.js';

export async function renderClients(root) {
  const state = { stage: 'client', q: '' };
  root.append(pageHeader('Clients', 'Your book of business', primaryBtn('New', () => openClientForm(null, refreshAfter), 'plus')));

  const toolbar = el('div.toolbar');
  toolbar.append(el('div.search', {}, [
    el('span.ic', { html: iconSvg('search', 18) }),
    el('input', { placeholder: 'Search…', oninput: (e) => { state.q = e.target.value.toLowerCase(); refresh(); } }),
  ]));
  const seg = el('div.segmented');
  [['client', 'Active'], ['prospect', 'Prospects'], ['lead', 'Leads'], ['past_client', 'Past'], ['all', 'All']].forEach(([k, label]) =>
    seg.append(el('button.seg' + (state.stage === k ? '.on' : ''), { text: label, dataset: { s: k },
      onclick: () => { state.stage = k; seg.querySelectorAll('.seg').forEach((x) => x.classList.toggle('on', x.dataset.s === k)); refresh(); } })));
  toolbar.append(seg);
  root.append(toolbar);

  const summary = el('div.statstrip.mt-8');
  root.append(summary);
  const listWrap = el('div.mt-16');
  root.append(listWrap);

  let all = [];
  async function load() { all = await Clients.list({ order: { col: 'business_name', asc: true } }); }

  function refresh() {
    clear(summary); clear(listWrap);
    const active = all.filter((c) => c.stage === 'client');
    summary.append(
      el('div.stat', {}, [el('div.stat-value', { text: String(active.length) }), el('div.stat-label', { text: 'Active clients' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(active.reduce((s, c) => s + Number(c.mrr || 0), 0)) }), el('div.stat-label', { text: 'Total MRR' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(active.length ? active.reduce((s, c) => s + Number(c.mrr || 0), 0) / active.length : 0) }), el('div.stat-label', { text: 'Avg / client' })]),
    );

    let items = all;
    if (state.stage !== 'all') items = items.filter((c) => c.stage === state.stage);
    if (state.q) items = items.filter((c) => (c.business_name || '').toLowerCase().includes(state.q) || (c.contact_name || '').toLowerCase().includes(state.q));

    if (!items.length) { listWrap.append(emptyState('No clients match.', 'users')); return; }
    const rows = el('div.rows.card');
    items.forEach((c) => rows.append(el('div.row.clickable' + (c.brand_color ? '.row-branded' : ''), { onclick: () => openClient(c.id, refreshAfter), style: c.brand_color ? `--brand:${c.brand_color}` : '' }, [
      clientAvatar(c),
      el('div.row-main', {}, [
        el('div.row-title', { text: c.business_name }),
        el('div.row-sub', {}, [
          c.category ? badge(c.category, 'gold') : null,
          c.mrr ? badge(money(c.mrr) + '/mo', 'green') : null,
          ...(c.services || []).slice(0, 2).map((s) => badge(SERVICE_LABEL[s] || s, 'gray')),
          (c.services || []).length > 2 ? badge('+' + ((c.services || []).length - 2), 'gray') : null,
        ]),
      ]),
      el('div.row-right', {}, [
        state.stage === 'all' ? statusBadge(STAGES, c.stage) : null,
        el('span.icon-btn', { html: iconSvg('chevron', 18) }),
      ]),
    ])));
    listWrap.append(rows);
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}
