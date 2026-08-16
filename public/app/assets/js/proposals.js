// Proposals — build a proposal from line items, track its status, and track the
// contract through to signed. Generate a clean printable proposal to send.
import { Proposals, Clients } from './db.js';
import { PROPOSAL_STATUS, CONTRACT_STATUS, SERVICES, DOC_TYPE, SEND_STATUS, DRIVE_STATUS, BUSINESS, OWNER, CONTRACT_TERMS, PROPOSAL_SERVICES, FEATURES } from './config.js';

// Default scope-of-work areas for a growth partnership (editable per proposal).
const SCOPE_STARTER = [
  { area: 'Positioning & offer', detail: 'Refine the core offer, target customers, and messaging so it’s clear and easy to buy.' },
  { area: 'Digital foundation', detail: 'Website/landing strategy, Google Business Profile optimization, local SEO, and a review system.' },
  { area: 'Lead generation', detail: 'Organic search, referral/partner strategy, content direction, and paid search when the foundation is ready.' },
  { area: 'Monthly management', detail: 'Ongoing management, reporting, optimization, and next-step recommendations each month.' },
];
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, labelOf, fmtDate,
  emptyState, primaryBtn, field, textInput, numberInput, textArea, selectInput,
  dateInput, readForm, openSheet, toast, confirmDialog, todayISO, openDocPreview,
} from './ui.js';
import { queueDoc, docBadges } from './docs.js';

let clientCache = null;
async function clients() { if (!clientCache) clientCache = await Clients.list({ order: { col: 'business_name', asc: true } }); return clientCache; }
const nameFor = (list, id) => (list.find((c) => c.id === id) || {}).business_name || '—';

export async function renderProposals(root) {
  const state = { filter: 'all' };
  root.append(pageHeader('Proposals & contracts', 'Pitch, close, and paper it', primaryBtn('New', async () => openProposalForm({}, refreshAfter, await clients()), 'plus')));

  const seg = el('div.segmented');
  [['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.filter === k ? '.on' : ''), { text: l, dataset: { f: k }, onclick: () => { state.filter = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.f === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let all = [], list = [];
  async function load() { [all, list] = await Promise.all([Proposals.list({ order: { col: 'created_at', asc: false } }), clients()]); }

  function refresh() {
    clear(wrap);
    const accepted = all.filter((p) => p.status === 'accepted');
    const openMrr = all.filter((p) => p.status === 'sent').reduce((s, p) => s + Number(p.monthly_total || 0), 0);
    wrap.append(el('div.grid.grid-3', {}, [
      el('div.stat', {}, [el('div.stat-value', { text: String(all.filter((p) => p.status === 'sent').length) }), el('div.stat-label', { text: 'Out for signature' })]),
      el('div.stat.stat-gold', {}, [el('div.stat-value', { text: money(openMrr) }), el('div.stat-label', { text: 'MRR in play' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(accepted.length) }), el('div.stat-label', { text: 'Accepted' })]),
    ]));

    let items = all;
    if (state.filter !== 'all') items = items.filter((p) => p.status === state.filter);
    if (!items.length) { wrap.append(emptyState('No proposals yet. Draft your first.', 'proposal')); return; }
    const rows = el('div.rows.card.mt-16');
    items.forEach((p) => rows.append(el('div.row', {}, [
      el('div.row-main', { style: 'cursor:pointer', onclick: () => openProposalForm(p, refreshAfter, list) }, [
        el('div.row-title', { text: p.title }),
        el('div.row-sub', {}, [
          badge(labelOf(DOC_TYPE, p.doc_type || 'proposal'), 'gray'),
          el('span', { text: nameFor(list, p.client_id) }),
          p.monthly_total ? badge(money(p.monthly_total) + '/mo', 'green') : null,
          p.build_total ? badge(money(p.build_total) + ' build', 'gold') : null,
          ...docBadges(p),
          (FEATURES.proposalApproval && p.approval_status === 'rejected' && p.approval_note) ? el('span.text-red', { text: 'Note: ' + p.approval_note }) : null,
        ]),
      ]),
      el('div.row-right', {}, FEATURES.proposalApproval ? approvalActions(p, refreshAfter, list) : [
        statusBadge(PROPOSAL_STATUS, p.status),
        el('button.icon-btn', { title: 'Send to client (PDF email + save to Drive)', html: iconSvg('send', 18), onclick: () => queueDoc(Proposals, p, list.find((c) => c.id === p.client_id), { send: true, drive: true }, refreshAfter) }),
        el('button.icon-btn', { title: 'Save to Google Drive', html: iconSvg('cloud', 18), onclick: () => queueDoc(Proposals, p, list.find((c) => c.id === p.client_id), { drive: true }, refreshAfter) }),
        el('button.icon-btn', { title: 'Preview / print', html: iconSvg('external', 18), onclick: () => previewProposal(p, nameFor(list, p.client_id)) }),
      ]),
    ])));
    wrap.append(rows);
  }

  // Contractor proposals can't be emailed directly — they're submitted for the
  // owner's approval, and the owner sends the approved ones from their own email.
  function approvalActions(p, refresh, list) {
    const preview = el('button.icon-btn', { title: 'Preview / print', html: iconSvg('external', 18), onclick: () => previewProposal(p, nameFor(list, p.client_id)) });
    const submit = async (label) => {
      if (!p.client_id) { toast('Pick a client first', 'err'); return; }
      await Proposals.update(p.id, { approval_status: 'pending', approval_note: null, status: 'sent', sent_on: todayISO() });
      toast(label); refresh();
    };
    const st = p.approval_status;
    if (st === 'approved') return [badge('Approved', 'green'), preview];
    if (st === 'pending') return [badge('Awaiting approval', 'amber'), preview];
    if (st === 'rejected') return [badge('Changes requested', 'red'),
      el('button.btn.btn-gold.btn-sm', { text: 'Resubmit', onclick: () => submit('Resubmitted for approval') }), preview];
    return [el('button.btn.btn-primary.btn-sm', { text: 'Submit for approval', onclick: () => submit('Submitted for approval') }), preview];
  }

  async function refreshAfter() { clientCache = null; await load(); refresh(); }
  await load();
  refresh();
}

function openProposalForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const D = existing.details || {};
  const clientOptions = [{ key: '', label: '— Select client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];
  let items = (existing.line_items && existing.line_items.length) ? existing.line_items.map((x) => ({ ...x })) : [];

  const itemsWrap = el('div');
  const totalsBar = el('div', { style: 'display:flex;gap:16px;font-weight:700;color:var(--navy-dark);padding:6px 2px' });

  function renderItems() {
    clear(itemsWrap);
    items.forEach((it, i) => {
      const labelIn = textInput('l', it.label, { placeholder: 'Line item' });
      const monIn = numberInput('m', it.monthly ?? 0, { placeholder: 'Monthly' });
      const oneIn = numberInput('o', it.oneTime ?? 0, { placeholder: 'One-time' });
      labelIn.addEventListener('input', () => { it.label = labelIn.value; });
      monIn.addEventListener('input', () => { it.monthly = Number(monIn.value || 0); totals(); });
      oneIn.addEventListener('input', () => { it.oneTime = Number(oneIn.value || 0); totals(); });
      itemsWrap.append(el('div', { style: 'display:grid;grid-template-columns:1fr 90px 90px 32px;gap:6px;margin-bottom:6px' }, [
        labelIn, monIn, oneIn,
        el('button.icon-btn', { html: iconSvg('trash', 16), onclick: () => { items.splice(i, 1); renderItems(); totals(); } }),
      ]));
    });
    itemsWrap.append(el('div', { style: 'margin-top:4px' }, [
      el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('plus', 14)} Custom line`, onclick: () => { items.push({ label: '', monthly: 0, oneTime: 0 }); renderItems(); } }),
    ]));
  }
  function totals() {
    const m = items.reduce((s, x) => s + Number(x.monthly || 0), 0);
    const o = items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
    clear(totalsBar);
    totalsBar.append(el('span', { text: money(m) + ' / month' }), el('span', { text: money(o) + ' one-time' }));
  }
  renderItems(); totals();

  // Scope of work — repeatable {area, detail} rows.
  let scope = (D.scope_items && D.scope_items.length) ? D.scope_items.map((x) => ({ ...x })) : [];
  const scopeWrap = el('div');
  function renderScope() {
    clear(scopeWrap);
    scope.forEach((s, i) => {
      const a = textInput('sa', s.area, { placeholder: 'Focus area' });
      const d = textInput('sd', s.detail, { placeholder: 'What TaylorMade delivers' });
      a.addEventListener('input', () => { s.area = a.value; });
      d.addEventListener('input', () => { s.detail = d.value; });
      scopeWrap.append(el('div', { style: 'display:grid;grid-template-columns:1fr 1.5fr 32px;gap:6px;margin-bottom:6px' }, [
        a, d, el('button.icon-btn', { html: iconSvg('trash', 16), onclick: () => { scope.splice(i, 1); renderScope(); } }),
      ]));
    });
    scopeWrap.append(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px' }, [
      el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('plus', 14)} Scope area`, onclick: () => { scope.push({ area: '', detail: '' }); renderScope(); } }),
      el('button.btn.btn-ghost.btn-sm', { text: 'Starter set', onclick: () => { scope = SCOPE_STARTER.map((x) => ({ ...x })); renderScope(); } }),
    ]));
  }
  renderScope();

  // Service checkboxes — one tap adds/removes a priced line item + scope entry.
  const chipsWrap = el('div.chipset');
  const svcIdx = (svc) => items.findIndex((it) => it.svc === svc.key || it.label === svc.label);
  function toggleService(svc) {
    const i = svcIdx(svc);
    if (i >= 0) {
      items.splice(i, 1);
      const si = scope.findIndex((s) => s.svc === svc.key || s.area === svc.label);
      if (si >= 0) scope.splice(si, 1);
    } else {
      items.push({ label: svc.label, monthly: 0, oneTime: 0, svc: svc.key });
      if (!scope.some((s) => s.area === svc.label)) scope.push({ area: svc.label, detail: svc.scope || '', svc: svc.key });
    }
    renderChips(); renderItems(); totals(); renderScope();
  }
  function renderChips() {
    clear(chipsWrap);
    PROPOSAL_SERVICES.forEach((svc) => {
      const on = svcIdx(svc) >= 0;
      chipsWrap.append(el('button.chip' + (on ? '.on' : ''), { type: 'button', text: svc.label, onclick: () => toggleService(svc) }));
    });
  }
  renderChips();

  const node = el('div.form', {}, [
    field('Title', textInput('title', existing.title, { placeholder: 'Growth Partnership Proposal for ABC Co.' })),
    el('div.form-grid.cols-2', {}, [
      field('Document type', selectInput('doc_type', DOC_TYPE, existing.doc_type || 'proposal')),
      field('Client', selectInput('client_id', clientOptions, existing.client_id || '')),
      field('Status', selectInput('status', PROPOSAL_STATUS, existing.status || 'draft')),
      field('Agreement length', selectInput('contract_term', CONTRACT_TERMS, D.contract_term || 'No contract')),
    ]),
    field('Summary / cover note', textArea('summary', existing.summary, { rows: 3, placeholder: 'The objective and why it matters — sets up the proposal.' })),
    el('div.section-title', {}, [el('h3', { text: 'Services & investment' })]),
    el('div', {}, [el('span.field-hint', { text: 'Tap the services included — each adds a priced line and a scope entry you can edit.' }), chipsWrap]),
    el('div.mt-8', {}, [itemsWrap, totalsBar]),
    el('div.section-title', {}, [el('h3', { text: 'Scope of work' })]),
    el('div', {}, [el('span.field-hint', { text: 'Auto-filled from the services above — edit freely or add your own.' }), scopeWrap]),
    el('div.section-title', {}, [el('h3', { text: 'Partnership' })]),
    field('Monthly agreement / partnership terms', textArea('partnership_terms', D.partnership_terms, { rows: 3, placeholder: 'What the monthly retainer covers, cadence, review points, what each side owns…' })),
    el('details.form-more', {}, [
      el('summary', { text: 'More detail (optional)' }),
      el('div.form', {}, [
        el('div.form-grid.cols-2', {}, [
          field('Prepared by', textInput('prepared_by', D.prepared_by || OWNER)),
          field('Revision allowance', textInput('revision_allowance', D.revision_allowance, { placeholder: 'e.g. 2 rounds' })),
          field('Third-party costs', textInput('third_party_costs', D.third_party_costs, { placeholder: 'e.g. ad spend, photography' })),
          field('Approval method / deadline', textInput('approval_method', D.approval_method, { placeholder: 'e.g. Sign below by Fri' })),
        ]),
        field('Timeline & milestones', textArea('timeline', D.timeline, { rows: 2 })),
        field('Client responsibilities', textArea('client_responsibilities', D.client_responsibilities, { rows: 2 })),
        field('Not included', textArea('not_included', D.not_included, { rows: 2 })),
        el('div.section-title', {}, [el('h3', { text: 'Contract tracking' })]),
        el('div.form-grid.cols-2', {}, [
          field('Contract status', selectInput('contract_status', CONTRACT_STATUS, existing.contract_status || 'none')),
          field('Signed on', dateInput('contract_signed_on', existing.contract_signed_on)),
          field('Sent on', dateInput('sent_on', existing.sent_on)),
          field('Contract link', textInput('contract_url', existing.contract_url, { placeholder: 'e-sign link' })),
        ]),
      ]),
    ]),
  ]);

  const { close } = openSheet({
    title: isNew ? 'New proposal' : 'Edit proposal', body: node, wide: true,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      ...(FEATURES.proposalApproval ? [] : [{ label: 'Email now', tone: 'ghost', onClick: () => { const v = collect(); emailProposal({ ...existing, ...v }, list.find((c) => c.id === v.client_id)); } }]),
      { label: 'Preview', tone: 'ghost', onClick: () => { const v = collect(); previewProposal({ ...existing, ...v }, nameFor(list, v.client_id)); } },
      { label: isNew ? 'Add' : 'Save', tone: 'primary', onClick: async () => {
        const v = collect();
        if (!v.title) { toast('Title required', 'err'); return; }
        if (!v.client_id) v.client_id = null;
        try { isNew ? await Proposals.create(v) : await Proposals.update(existing.id, v); toast('Saved'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
      ...(isNew ? [] : [{ label: 'Delete', tone: 'danger', onClick: async () => { if (await confirmDialog('Delete this proposal?')) { await Proposals.remove(existing.id); toast('Deleted'); close(); onSaved?.(); } } }]),
    ],
  });

  function collect() {
    const v = readForm(node);
    v.line_items = items.filter((x) => x.label);
    v.monthly_total = v.line_items.reduce((s, x) => s + Number(x.monthly || 0), 0);
    v.build_total = v.line_items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
    // Pull the scope/terms fields out of the flat form object into `details`.
    const DETAIL_KEYS = ['prepared_by', 'timeline', 'revision_allowance', 'client_responsibilities',
      'third_party_costs', 'approval_method', 'not_included', 'partnership_terms', 'contract_term'];
    const details = {};
    DETAIL_KEYS.forEach((k) => { if (v[k] != null && String(v[k]).trim() !== '') details[k] = v[k]; delete v[k]; });
    details.scope_items = scope.filter((s) => s.area || s.detail);
    v.details = details;
    return v;
  }
}

// Open the user's email app with the proposal pre-filled, addressed to the
// client. Immediate "send from the app" with zero setup (real automated send +
// Drive archiving is handled by the Apps Script pipeline).
function emailProposal(p, client) {
  if (!client || !client.email) { toast('No email on file for this client', 'err'); return; }
  const items = p.line_items || [];
  const m = items.reduce((s, x) => s + Number(x.monthly || 0), 0);
  const o = items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
  const lines = items.map((it) => `• ${it.label}${it.monthly ? ` — ${money(it.monthly)}/mo` : ''}${it.oneTime ? ` — ${money(it.oneTime)} one-time` : ''}`).join('\n');
  const body = `Hi ${client.contact_name || ''},\n\n${p.summary || 'Here is the growth plan we put together for you.'}\n\n${lines}\n\nTotal: ${money(m)}/month${o ? ` + ${money(o)} to get started` : ''}\n\nReady to move forward? Just reply and we'll get you set up.\n\nThanks,\nJosh\nTaylorMade Brands\ntaylormadegrowth.com`;
  const url = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent('Your Proposal — ' + (p.title || 'TaylorMade Brands'))}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

// Fees / Payment schedule text derived from the line items.
function feesText(p) {
  const items = p.line_items || [];
  if (!items.length) return (p.details && p.details.fees_note) || '';
  const parts = items.map((it) => `${it.label}${it.monthly ? ` — ${money(it.monthly)}/mo` : ''}${it.oneTime ? ` — ${money(it.oneTime)} one-time` : ''}`);
  const m = items.reduce((s, x) => s + Number(x.monthly || 0), 0);
  const o = items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
  const totals = [];
  if (m) totals.push(`${money(m)}/mo`);
  if (o) totals.push(`${money(o)} to start`);
  return parts.join('; ') + (totals.length ? `.  Total: ${totals.join(' + ')}` : '');
}

// Build the branded partnership-proposal HTML (shared with the Apps Script PDF).
export function proposalDocHtml(p, clientName, opts = {}) {
  const D = p.details || {};
  const logo = opts.logo || 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  const docType = (labelOf(DOC_TYPE, p.doc_type || 'proposal')).toUpperCase();
  const dateStr = p.sent_on ? fmtDate(p.sent_on) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const items = p.line_items || [];
  const m = items.reduce((s, x) => s + Number(x.monthly || 0), 0);
  const o = items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
  const scopeItems = (D.scope_items || []).filter((s) => s.area || s.detail);
  const term = D.contract_term || 'No contract';
  const P = (txt) => (txt ? `<p class="body">${esc(txt)}</p>` : '');

  const scopeRows = scopeItems.length
    ? scopeItems.map((s) => `<tr><td class="area">${esc(s.area)}</td><td>${esc(s.detail)}</td></tr>`).join('')
    : (D.deliverables ? `<tr><td class="area">Deliverables</td><td>${esc(D.deliverables)}</td></tr>` : '<tr><td colspan="2" class="muted">To be scoped together.</td></tr>');
  const priceRows = items.length
    ? items.map((it) => `<tr><td>${esc(it.label)}</td><td class="r">${it.monthly ? money(it.monthly) + '/mo' : '—'}</td><td class="r">${it.oneTime ? money(it.oneTime) : '—'}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">To be scoped.</td></tr>';

  const extras = [
    ['Timeline & milestones', D.timeline],
    ['Revision allowance', D.revision_allowance],
    ['Client responsibilities', D.client_responsibilities],
    ['Not included', D.not_included],
    ['Approval', D.approval_method],
  ].filter(([, v]) => v);
  const extrasHtml = extras.length
    ? '<div class="sec">Terms</div>' + extras.map(([l, v]) => `<div class="trow"><span class="tl">${esc(l)}</span><span class="tv">${esc(v)}</span></div>`).join('')
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.title || docType)}</title><style>
    *{box-sizing:border-box}html,body{margin:0}
    body{font-family:Georgia,'Times New Roman',serif;color:#1b1b1b;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{max-width:720px;margin:0 auto;padding:24px 10px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid #13294b;padding-bottom:16px}
    .logo{width:230px;height:auto}
    .contact{text-align:right;font-size:13px;line-height:1.55;color:#333}
    .eyebrow{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:3px;font-size:12px;color:#b98d1a;margin-top:24px}
    h1{font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:1.15;color:#0d1b30;margin:4px 0 8px}
    .subline{font-size:15px;color:#444}
    .sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-size:13px;color:#0d1b30;border-bottom:1.5px solid #0d1b30;padding-bottom:5px;margin:26px 0 12px}
    .body{font-size:15px;line-height:1.6;margin:0 0 10px}
    table{width:100%;border-collapse:collapse}
    .scope td,.price td{padding:10px 8px;border-bottom:1px solid #e4e4e4;font-size:14.5px;vertical-align:top}
    .scope .area{font-family:Arial,Helvetica,sans-serif;font-weight:700;width:33%;color:#0d1b30}
    .price th{font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;font-size:11px;letter-spacing:.04em;color:#666;text-align:left;padding:6px 8px;border-bottom:1.5px solid #0d1b30}
    .price td.r,.price th.r{text-align:right}
    .price tfoot td{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px;border-top:2px solid #0d1b30;border-bottom:0;color:#0d1b30}
    .muted{color:#888}
    .chips{margin-top:14px}
    .chip{display:inline-block;background:#13294b;color:#fff;padding:12px 20px;border-radius:12px;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:16px;margin-right:10px}
    .chip small{display:block;color:#d4af37;font-weight:700;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
    .term{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:15px;color:#0d1b30;background:#f6f1df;border:1px solid #e6dcb8;border-radius:10px;padding:9px 15px;display:inline-block;margin-bottom:10px}
    .trow{display:flex;gap:12px;font-size:14px;line-height:1.5;margin:6px 0}
    .tl{font-family:Arial,Helvetica,sans-serif;font-weight:700;min-width:170px;color:#0d1b30}.tv{flex:1}
    .approve{font-size:15px;margin:8px 0}.box{font-size:17px;margin-right:8px}
    .sign{font-size:15px;margin-top:14px;display:flex;align-items:baseline;gap:8px}
    .sign .lbl{font-family:Arial,Helvetica,sans-serif;font-weight:bold}.sign .u{flex:1;border-bottom:1px solid #666;min-height:1.1em}
    .foot{margin-top:26px;border-top:1px solid #e4e4e4;padding-top:12px;text-align:center;color:#888;font-size:12px;font-family:Arial,Helvetica,sans-serif}
    .sec{page-break-after:avoid;break-after:avoid}
    h1,.subline{page-break-after:avoid}
    table,tr,.chips,.trow,.sign,.term,.top,.body{page-break-inside:avoid;break-inside:avoid}
    @page{margin:0.5in}
  </style></head><body><div class="page">
    <div class="top"><img class="logo" src="${logo}" alt="TaylorMade Brands"><div class="contact">${esc(BUSINESS.name)}<br>${esc(BUSINESS.address1)}<br>${esc(BUSINESS.address2)}<br>${esc(BUSINESS.phone)}<br>${esc(BUSINESS.email)}</div></div>
    <div class="eyebrow">${esc(docType)}</div>
    <h1>${esc(p.title || 'Growth Partnership Proposal')}</h1>
    <div class="subline">Prepared for <b>${esc(clientName || 'your business')}</b> · ${esc(dateStr)}${D.prepared_by ? ' · by ' + esc(D.prepared_by) : ''}</div>

    ${p.summary ? '<div class="sec">Proposal Summary</div>' + P(p.summary) : ''}

    <div class="sec">Scope of Work</div>
    <table class="scope"><tbody>${scopeRows}</tbody></table>

    <div class="sec">Investment</div>
    <table class="price"><thead><tr><th>Item</th><th class="r">Monthly</th><th class="r">One-time</th></tr></thead>
      <tbody>${priceRows}</tbody>
      <tfoot><tr><td>Total</td><td class="r">${money(m)}/mo</td><td class="r">${money(o)}</td></tr></tfoot></table>
    <div class="chips"><span class="chip"><small>Initial build</small>${money(o)}</span><span class="chip"><small>Monthly</small>${money(m)}</span></div>
    ${D.third_party_costs ? `<p class="body" style="margin-top:12px"><b>Third-party costs:</b> ${esc(D.third_party_costs)}</p>` : ''}

    <div class="sec">Partnership</div>
    <div class="term">Agreement: ${esc(term)}</div>
    ${P(D.partnership_terms)}

    ${extrasHtml}

    <div class="sec">Approve / Decline</div>
    <div class="approve"><span class="box">☐</span>Approve / Proceed &nbsp;&nbsp;&nbsp;&nbsp;<span class="box">☐</span>Decline</div>
    <div class="sign"><span class="lbl">Name:</span><span class="u"></span></div>
    <div class="sign"><span class="lbl">Signature:</span><span class="u"></span></div>
    <div class="sign"><span class="lbl">Date:</span><span class="u"></span></div>

    <div class="foot">${esc(BUSINESS.name)} · ${esc(BUSINESS.website)} · Let’s grow something great together.</div>
  </div></body></html>`;
}

function previewProposal(p, clientName) {
  openDocPreview(proposalDocHtml(p, clientName), p.title || 'Proposal');
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
