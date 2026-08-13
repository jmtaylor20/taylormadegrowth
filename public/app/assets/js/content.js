// Content — social/content calendar, the photo/video asset library, and the
// review-request tracker, all in one place with three sub-tabs.
import { Content, Assets, Reviews, Clients } from './db.js';
import { CONTENT_CHANNEL, CONTENT_STATUS, ASSET_KIND, REVIEW_STATUS } from './config.js';
import {
  el, clear, iconSvg, pageHeader, badge, statusBadge, labelOf, fmtDate, relDue,
  emptyState, primaryBtn, field, textInput, textArea, selectInput, dateInput,
  readForm, openSheet, toast, confirmDialog,
} from './ui.js';

let clientCache = null;
async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '—';
const clientOpts = (list) => [{ key: '', label: '— No client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];

export async function renderContent(root) {
  const state = { tab: 'calendar' };
  const head = pageHeader('Content', 'Calendar, assets & reviews');
  root.append(head);

  const seg = el('div.segmented');
  [['calendar', 'Calendar'], ['assets', 'Assets'], ['reviews', 'Reviews']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.tab === k ? '.on' : ''), { text: l, dataset: { t: k }, onclick: () => { state.tab = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.t === k)); render(); } })));
  const addBtn = primaryBtn('New', () => add(), 'plus');
  root.append(el('div.toolbar', {}, [seg, el('span.right'), addBtn]));

  const wrap = el('div');
  root.append(wrap);

  let list = [];
  function add() {
    if (state.tab === 'calendar') openContentForm({}, refresh, list);
    else if (state.tab === 'assets') openAssetForm({}, refresh, list);
    else openReviewFormFull({}, refresh, list);
  }

  async function render() {
    clear(wrap);
    list = await clients();
    if (state.tab === 'calendar') await calendar();
    else if (state.tab === 'assets') await assetsView();
    else await reviewsView();
  }

  async function calendar() {
    const items = await Content.list({ order: { col: 'scheduled_for', asc: true } });
    if (!items.length) { wrap.append(emptyState('No content scheduled. Plan your first post.', 'content')); return; }
    // group by status buckets
    const upcoming = items.filter((i) => i.status !== 'posted');
    const posted = items.filter((i) => i.status === 'posted');
    section('Planned & scheduled', upcoming);
    if (posted.length) section('Posted', posted);
    function section(title, arr) {
      if (!arr.length) return;
      wrap.append(el('div.section-title', {}, [el('h3', { text: title }), el('span.badge.badge-gray', { text: String(arr.length) })]));
      const rows = el('div.rows.card');
      arr.forEach((i) => rows.append(el('div.row.clickable', { onclick: () => openContentForm(i, refresh, list) }, [
        el('div.row-main', {}, [
          el('div.row-title', { text: i.title }),
          el('div.row-sub', {}, [badge(labelOf(CONTENT_CHANNEL, i.channel), 'blue'), el('span', { text: nameFor(list, i.client_id) }), i.scheduled_for ? el('span', { text: fmtDate(i.scheduled_for) }) : null]),
        ]),
        statusBadge(CONTENT_STATUS, i.status),
      ])));
      wrap.append(rows);
    }
  }

  async function assetsView() {
    const items = await Assets.list();
    if (!items.length) { wrap.append(emptyState('No assets linked. Add photo/video/logo links.', 'camera')); return; }
    const rows = el('div.rows.card');
    items.forEach((a) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openAssetForm(a, refresh, list) }, [
        el('div.row-title', { text: a.name }),
        el('div.row-sub', {}, [badge(labelOf(ASSET_KIND, a.kind), 'gray'), el('span', { text: nameFor(list, a.client_id) }), ...(a.tags || []).map((t) => badge(t, 'gold'))]),
      ]),
      a.url ? el('a.icon-btn', { href: a.url, target: '_blank', html: iconSvg('external', 18) }) : null,
    ])));
    wrap.append(rows);
  }

  async function reviewsView() {
    const items = await Reviews.list({ order: { col: 'requested_on', asc: false } });
    const left = items.filter((i) => i.status === 'left').length;
    wrap.append(el('div.grid.grid-3', {}, [
      el('div.stat', {}, [el('div.stat-value', { text: String(items.length) }), el('div.stat-label', { text: 'Requests' })]),
      el('div.stat.stat-gold', {}, [el('div.stat-value', { text: String(left) }), el('div.stat-label', { text: 'Reviews left' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(items.filter((i) => i.status === 'requested').length) }), el('div.stat-label', { text: 'Awaiting' })]),
    ]));
    if (!items.length) { wrap.append(emptyState('No review requests logged.', 'star')); return; }
    const rows = el('div.rows.card.mt-16');
    items.forEach((r) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openReviewFormFull(r, refresh, list) }, [
        el('div.row-title', { text: (r.customer_name || 'Customer') + ' · ' + nameFor(list, r.client_id) }),
        el('div.row-sub', {}, [badge(labelOf([{ key: 'google', label: 'Google' }, { key: 'facebook', label: 'Facebook' }, { key: 'other', label: 'Other' }], r.channel), 'gray'), r.requested_on ? fmtDate(r.requested_on) : '']),
      ]),
      statusBadge(REVIEW_STATUS, r.status),
    ])));
    wrap.append(rows);
  }

  async function refresh() { clientCache = null; await render(); }
  await render();
}

// ---- forms -----------------------------------------------------------------
function openContentForm(existing, onSaved, list) {
  const isNew = !existing.id;
  const node = el('div.form', {}, [
    field('Title', textInput('title', existing.title, { placeholder: 'Post idea / headline' })),
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOpts(list), existing.client_id || '')),
      field('Channel', selectInput('channel', CONTENT_CHANNEL, existing.channel || 'instagram')),
      field('Status', selectInput('status', CONTENT_STATUS, existing.status || 'idea')),
      field('Scheduled for', dateInput('scheduled_for', existing.scheduled_for)),
    ]),
    field('Caption / body', textArea('body', existing.body, { rows: 3 })),
    field('Asset link', textInput('asset_url', existing.asset_url, { placeholder: 'Drive / Canva link' })),
  ]);
  saveSheet(isNew ? 'New content' : 'Edit content', node, Content, existing, onSaved, (v) => { if (!v.title) return 'Title required'; if (!v.client_id) v.client_id = null; });
}

function openAssetForm(existing, onSaved, list) {
  const isNew = !existing.id;
  const node = el('div.form', {}, [
    field('Name', textInput('name', existing.name, { placeholder: 'Storefront photo' })),
    el('div.form-grid.cols-2', {}, [
      field('Client', selectInput('client_id', clientOpts(list), existing.client_id || '')),
      field('Kind', selectInput('kind', ASSET_KIND, existing.kind || 'photo')),
    ]),
    field('Link (Drive / Dropbox / URL)', textInput('url', existing.url, { placeholder: 'https://' })),
    field('Tags (comma separated)', textInput('__tags', (existing.tags || []).join(', '))),
    field('Notes', textInput('notes', existing.notes)),
  ]);
  saveSheet(isNew ? 'New asset' : 'Edit asset', node, Assets, existing, onSaved, (v) => {
    if (!v.name) return 'Name required';
    v.tags = (v.__tags || '').split(',').map((s) => s.trim()).filter(Boolean); delete v.__tags;
    if (!v.client_id) v.client_id = null;
  });
}

function openReviewFormFull(existing, onSaved, list) {
  const isNew = !existing.id;
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Customer', textInput('customer_name', existing.customer_name)),
      field('Client', selectInput('client_id', clientOpts(list), existing.client_id || '')),
      field('Channel', selectInput('channel', [{ key: 'google', label: 'Google' }, { key: 'facebook', label: 'Facebook' }, { key: 'other', label: 'Other' }], existing.channel || 'google')),
      field('Status', selectInput('status', REVIEW_STATUS, existing.status || 'requested')),
    ]),
    field('Notes', textInput('notes', existing.notes)),
  ]);
  saveSheet(isNew ? 'Review request' : 'Edit review', node, Reviews, existing, onSaved, (v) => { if (!v.client_id) v.client_id = null; });
}

function saveSheet(title, node, repo, existing, onSaved, prep) {
  const isNew = !existing.id;
  const { close } = openSheet({
    title, body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: isNew ? 'Add' : 'Save', tone: 'primary', onClick: async () => {
        const v = readForm(node);
        const err = prep?.(v); if (err) { toast(err, 'err'); return; }
        try { isNew ? await repo.create(v) : await repo.update(existing.id, v); toast('Saved'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this item?')) { await repo.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });
}
