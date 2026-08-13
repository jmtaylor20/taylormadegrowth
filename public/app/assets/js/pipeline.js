// Pipeline — leads → prospects → clients as a kanban board, filterable by
// category, with quick stage moves. This is the sales view.
import { Clients } from './db.js';
import { STAGES, STAGE_LABEL, CATEGORIES, SERVICE_LABEL } from './config.js';
import { el, clear, money, iconSvg, pageHeader, badge, emptyState, primaryBtn } from './ui.js';
import { openClient } from './client-detail.js';
import { openClientForm } from './forms.js';

const BOARD_STAGES = ['lead', 'prospect', 'client'];

export async function renderPipeline(root) {
  const state = { category: 'all', q: '' };
  root.append(pageHeader('Pipeline', 'Leads, prospects, and clients', primaryBtn('New', () => openClientForm(null, () => refresh()), 'plus')));

  const toolbar = el('div.toolbar');
  const search = el('div.search', {}, [
    el('span.ic', { html: iconSvg('search', 18) }),
    el('input', { placeholder: 'Search business…', oninput: (e) => { state.q = e.target.value.toLowerCase(); refresh(); } }),
  ]);
  const cats = el('div.segmented');
  ['all', ...CATEGORIES].forEach((c) => cats.append(el('button.seg' + (state.category === c ? '.on' : ''), {
    text: c === 'all' ? 'All' : c, dataset: { cat: c },
    onclick: () => { state.category = c; cats.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.cat === c)); refresh(); },
  })));
  toolbar.append(search, cats);
  root.append(toolbar);

  const boardWrap = el('div');
  root.append(boardWrap);

  let all = [];
  async function load() { all = await Clients.list({ order: { col: 'updated_at', asc: false } }); }
  function refresh() {
    clear(boardWrap);
    let items = all.filter((c) => BOARD_STAGES.includes(c.stage));
    if (state.category !== 'all') items = items.filter((c) => c.category === state.category);
    if (state.q) items = items.filter((c) => (c.business_name || '').toLowerCase().includes(state.q) || (c.contact_name || '').toLowerCase().includes(state.q));

    const board = el('div.board');
    BOARD_STAGES.forEach((stage) => {
      const col = el('div.board-col');
      const inStage = items.filter((c) => c.stage === stage);
      col.append(el('h4', {}, [STAGE_LABEL[stage], el('span.count', { text: String(inStage.length) })]));
      if (!inStage.length) col.append(el('div.muted', { style: 'padding:8px 4px;font-size:.82rem', text: 'Empty' }));
      inStage.forEach((c) => col.append(card(c)));
      board.append(col);
    });
    boardWrap.append(board);
    if (!items.length) boardWrap.append(emptyState('No one here yet. Add your first lead.', 'pipeline'));
  }

  function card(c) {
    const node = el('div.mini-card', { onclick: () => openClient(c.id, refreshAfter) }, [
      el('div.mini-title', { text: c.business_name }),
      el('div.mini-sub', { text: [c.category, c.city].filter(Boolean).join(' · ') || (c.contact_name || '') }),
      el('div.pill-row.mt-8', {}, [
        c.mrr ? badge(money(c.mrr) + '/mo', 'green') : null,
        c.priority === 'high' ? badge('High', 'red') : null,
        ...(c.services || []).slice(0, 2).map((s) => badge(SERVICE_LABEL[s] || s, 'gray')),
      ]),
    ]);
    // quick advance
    const idx = BOARD_STAGES.indexOf(c.stage);
    if (idx < BOARD_STAGES.length - 1) {
      node.append(el('button.btn.btn-ghost.btn-sm.mt-8', {
        html: `Move to ${STAGE_LABEL[BOARD_STAGES[idx + 1]]} ${iconSvg('chevron', 14)}`,
        onclick: async (e) => { e.stopPropagation(); await Clients.update(c.id, { stage: BOARD_STAGES[idx + 1] }); refreshAfter(); },
      }));
    }
    return node;
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}
