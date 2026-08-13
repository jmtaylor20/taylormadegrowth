// Projects — website builds as a status board. Any client whose website_status
// is past "none" shows here; move them across the pipeline as the build moves.
import { Clients } from './db.js';
import { WEBSITE_STATUS, SERVICE_LABEL } from './config.js';
import { el, clear, iconSvg, pageHeader, badge, statusBadge, labelOf, emptyState, fmtDate } from './ui.js';
import { openClient } from './client-detail.js';

const BUILD_STAGES = ['not_started', 'in_design', 'in_dev', 'review', 'live'];

export async function renderProjects(root) {
  root.append(pageHeader('Projects', 'Website builds in flight'));
  const wrap = el('div');
  root.append(wrap);

  let all = [];
  async function load() { all = await Clients.list({ order: { col: 'updated_at', asc: false } }); }

  function refresh() {
    clear(wrap);
    const inBuild = all.filter((c) => c.website_status && c.website_status !== 'none');
    const active = inBuild.filter((c) => c.website_status !== 'live');
    const live = inBuild.filter((c) => c.website_status === 'live');

    wrap.append(el('div.grid.grid-3', {}, [
      el('div.stat', {}, [el('div.stat-value', { text: String(active.length) }), el('div.stat-label', { text: 'In progress' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(live.length) }), el('div.stat-label', { text: 'Live' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(inBuild.filter((c) => c.website_status === 'review').length) }), el('div.stat-label', { text: 'In client review' })]),
    ]));

    if (!inBuild.length) { wrap.append(emptyState('No website builds yet. Set a client’s website status to start tracking.', 'build')); return; }

    const board = el('div.board.mt-16');
    BUILD_STAGES.forEach((stage) => {
      const col = el('div.board-col');
      const items = inBuild.filter((c) => c.website_status === stage);
      col.append(el('h4', {}, [labelOf(WEBSITE_STATUS, stage), el('span.count', { text: String(items.length) })]));
      if (!items.length) col.append(el('div.muted', { style: 'padding:8px 4px;font-size:.82rem', text: '—' }));
      items.forEach((c) => col.append(card(c, stage)));
      board.append(col);
    });
    wrap.append(board);
  }

  function card(c, stage) {
    const node = el('div.mini-card', { onclick: () => openClient(c.id, refreshAfter) }, [
      el('div.mini-title', { text: c.business_name }),
      el('div.mini-sub', { text: c.build_url || c.website || 'No URL yet' }),
    ]);
    const idx = BUILD_STAGES.indexOf(stage);
    const bar = el('div.pill-row.mt-8');
    if (idx < BUILD_STAGES.length - 1) bar.append(el('button.btn.btn-ghost.btn-sm', {
      html: `${labelOf(WEBSITE_STATUS, BUILD_STAGES[idx + 1])} ${iconSvg('chevron', 13)}`,
      onclick: async (e) => { e.stopPropagation(); await Clients.update(c.id, { website_status: BUILD_STAGES[idx + 1] }); refreshAfter(); },
    }));
    node.append(bar);
    return node;
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}
