// Proposals — build a proposal from line items, track its status, and track the
// contract through to signed. Generate a clean printable proposal to send.
import { Proposals, Clients } from './db.js';
import { PROPOSAL_STATUS, CONTRACT_STATUS, SERVICES, DOC_TYPE, SEND_STATUS, DRIVE_STATUS, BUSINESS, OWNER } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, statusBadge, labelOf, fmtDate,
  emptyState, primaryBtn, field, textInput, numberInput, textArea, selectInput,
  dateInput, readForm, openSheet, toast, confirmDialog, todayISO,
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
        ]),
      ]),
      el('div.row-right', {}, [
        statusBadge(PROPOSAL_STATUS, p.status),
        el('button.icon-btn', { title: 'Send to client (PDF email + save to Drive)', html: iconSvg('send', 18), onclick: () => queueDoc(Proposals, p, list.find((c) => c.id === p.client_id), { send: true, drive: true }, refreshAfter) }),
        el('button.icon-btn', { title: 'Save to Google Drive', html: iconSvg('cloud', 18), onclick: () => queueDoc(Proposals, p, list.find((c) => c.id === p.client_id), { drive: true }, refreshAfter) }),
        el('button.icon-btn', { title: 'Preview / print', html: iconSvg('external', 18), onclick: () => previewProposal(p, nameFor(list, p.client_id)) }),
      ]),
    ])));
    wrap.append(rows);
  }

  async function refreshAfter() { clientCache = null; await load(); refresh(); }
  await load();
  refresh();
}

function openProposalForm(existing = {}, onSaved, list) {
  const isNew = !existing.id;
  const D = existing.details || {};
  const clientOptions = [{ key: '', label: '— Select client —' }, ...list.map((c) => ({ key: c.id, label: c.business_name }))];
  let items = (existing.line_items && existing.line_items.length) ? existing.line_items.map((x) => ({ ...x }))
    : [{ label: 'Website build', monthly: 0, oneTime: 0 }];

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
    itemsWrap.append(el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:4px' }, [
      el('button.btn.btn-ghost.btn-sm', { html: `${iconSvg('plus', 14)} Line`, onclick: () => { items.push({ label: '', monthly: 0, oneTime: 0 }); renderItems(); } }),
      ...SERVICES.map((s) => el('button.btn.btn-ghost.btn-sm', { text: '+ ' + s.label, onclick: () => { items.push({ label: s.label, monthly: 0, oneTime: 0 }); renderItems(); } })),
    ]));
  }
  function totals() {
    const m = items.reduce((s, x) => s + Number(x.monthly || 0), 0);
    const o = items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
    clear(totalsBar);
    totalsBar.append(el('span', { text: money(m) + ' / month' }), el('span', { text: money(o) + ' one-time' }));
  }
  renderItems(); totals();

  const node = el('div.form', {}, [
    field('Title', textInput('title', existing.title, { placeholder: 'Growth Plan for ABC Co.' })),
    el('div.form-grid.cols-2', {}, [
      field('Document type', selectInput('doc_type', DOC_TYPE, existing.doc_type || 'proposal')),
      field('Client', selectInput('client_id', clientOptions, existing.client_id || '')),
      field('Status', selectInput('status', PROPOSAL_STATUS, existing.status || 'draft')),
    ]),
    field('Summary / cover note', textArea('summary', existing.summary, { rows: 2, placeholder: 'What you’ll do and why it matters. (Used as “Desired outcome” if that’s blank.)' })),
    field('Line items', el('div', {}, [itemsWrap, totalsBar])),
    el('div.section-title', {}, [el('h3', { text: 'Scope & terms' })]),
    el('div.form-grid.cols-2', {}, [
      field('Prepared by', textInput('prepared_by', D.prepared_by || OWNER)),
      field('Revision allowance', textInput('revision_allowance', D.revision_allowance, { placeholder: 'e.g. 2 rounds' })),
    ]),
    field('Desired outcome', textArea('desired_outcome', D.desired_outcome, { rows: 2, placeholder: 'What success looks like for the client.' })),
    field('Deliverables', textArea('deliverables', D.deliverables, { rows: 2 })),
    field('Timeline & milestones', textArea('timeline', D.timeline, { rows: 2 })),
    field('Client responsibilities', textArea('client_responsibilities', D.client_responsibilities, { rows: 2 })),
    el('div.form-grid.cols-2', {}, [
      field('Third-party costs', textInput('third_party_costs', D.third_party_costs, { placeholder: 'e.g. hosting, stock photos' })),
      field('Approval method / deadline', textInput('approval_method', D.approval_method, { placeholder: 'e.g. Sign below by Fri' })),
    ]),
    field('Not included', textArea('not_included', D.not_included, { rows: 2 })),
    el('div.section-title', {}, [el('h3', { text: 'Changes (optional)' })]),
    field('Scope change notes', textArea('scope_change_notes', D.scope_change_notes, { rows: 2 })),
    field('Price difference & reasoning', textArea('price_difference', D.price_difference, { rows: 2 })),
    el('div.section-title', {}, [el('h3', { text: 'Contract' })]),
    el('div.form-grid.cols-2', {}, [
      field('Contract status', selectInput('contract_status', CONTRACT_STATUS, existing.contract_status || 'none')),
      field('Signed on', dateInput('contract_signed_on', existing.contract_signed_on)),
      field('Sent on', dateInput('sent_on', existing.sent_on)),
      field('Contract link', textInput('contract_url', existing.contract_url, { placeholder: 'e-sign link' })),
    ]),
  ]);

  const { close } = openSheet({
    title: isNew ? 'New proposal' : 'Edit proposal', body: node, wide: true,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Email now', tone: 'ghost', onClick: () => { const v = collect(); emailProposal({ ...existing, ...v }, list.find((c) => c.id === v.client_id)); } },
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
    const DETAIL_KEYS = ['prepared_by', 'desired_outcome', 'deliverables', 'timeline',
      'revision_allowance', 'client_responsibilities', 'third_party_costs', 'approval_method',
      'not_included', 'scope_change_notes', 'price_difference'];
    const details = {};
    DETAIL_KEYS.forEach((k) => { if (v[k] != null && String(v[k]).trim() !== '') details[k] = v[k]; delete v[k]; });
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

// Build the branded document HTML (shared shape used by the Apps Script PDF).
export function proposalDocHtml(p, clientName, opts = {}) {
  const D = p.details || {};
  const logo = opts.logo || 'https://taylormadegrowth.com/app/assets/img/logo-proposal.png';
  const docType = (labelOf(DOC_TYPE, p.doc_type || 'proposal')).toUpperCase();
  const scopeHead = (labelOf(DOC_TYPE, p.doc_type || 'proposal')) + ' &amp; Scope';
  const dateStr = p.sent_on ? fmtDate(p.sent_on) : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const services = (p.line_items || []).map((i) => i.label).filter(Boolean).join(', ');
  const row = (label, value) => `<div class="row"><span class="lbl">${esc(label)}:</span><span class="val${value ? '' : ' blank'}">${value ? esc(value) : ''}</span></div>`;
  const half = (label, value) => `<div class="row"><span class="lbl">${esc(label)}:</span><span class="val${value ? '' : ' blank'}">${value ? esc(value) : ''}</span></div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(p.title || docType)}</title><style>
    *{box-sizing:border-box}html,body{margin:0}
    body{font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .frame{border:2px solid #dcdcdc;border-radius:12px;margin:12px;padding:20px 30px 22px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
    .logo{width:238px;max-width:52%;height:auto}
    .contact{text-align:right;font-size:12.5px;line-height:1.5;color:#2a2a2a}
    .title{text-align:center;font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:27px;letter-spacing:3px;margin:6px 0 12px;color:#111}
    .sec{font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#111;border-bottom:1.5px solid #111;padding-bottom:3px;margin:13px 0 6px}
    .grid2{display:flex;gap:30px}.grid2>.row{flex:1}
    .row{display:flex;align-items:baseline;gap:8px;font-size:13.5px;line-height:1.45;margin:4px 0}
    .row .lbl{font-weight:bold;white-space:nowrap;font-family:Arial,Helvetica,sans-serif;font-size:12px}
    .row .val{flex:1}
    .row .val.blank{border-bottom:1px solid #666;min-height:1.05em;align-self:flex-end}
    .approve{display:flex;gap:46px;font-size:14.5px;margin:6px 0 3px}
    .box{font-family:Arial;font-size:16px;margin-right:7px}
    .dline{display:inline-block;border-bottom:1px solid #666;min-width:150px}
    .sign{font-size:13.5px;margin-top:10px;display:flex;align-items:baseline;gap:8px}
    .sign .lbl{font-family:Arial;font-weight:bold}.sign .u{flex:1;border-bottom:1px solid #666;min-height:1.05em}
    .foot{margin-top:14px;text-align:center;color:#888;font-size:11px;font-family:Arial}
    @page{margin:0}
  </style></head><body><div class="frame">
    <div class="top">
      <img class="logo" src="${logo}" alt="TaylorMade Brands">
      <div class="contact">${esc(BUSINESS.address1)}<br>${esc(BUSINESS.address2)}<br>${esc(BUSINESS.phone)}<br>${esc(BUSINESS.email)}</div>
    </div>
    <div class="title">${esc(docType)}</div>

    <div class="sec">Client / Project</div>
    <div class="grid2">${half('Client', clientName)}${half('Project', p.title)}</div>
    <div class="grid2">${half('Prepared by', D.prepared_by || 'Josh')}${half('Date', dateStr)}</div>

    <div class="sec">${scopeHead}</div>
    ${row('Desired outcome', D.desired_outcome || p.summary)}
    ${row('Services included', services)}
    ${row('Deliverables', D.deliverables)}
    ${row('Timeline and milestones', D.timeline)}
    ${row('Revision allowance', D.revision_allowance)}
    ${row('Client responsibilities', D.client_responsibilities)}
    ${row('Fees / Payment schedule', feesText(p))}
    ${row('Third-party costs', D.third_party_costs)}
    ${row('Not included', D.not_included)}
    ${row('Approval method / Deadline', D.approval_method)}

    <div class="sec">Changes</div>
    ${row('Scope Change Notes', D.scope_change_notes)}
    ${row('Price Difference & Reasoning', D.price_difference)}

    <div class="sec">Approve / Denial</div>
    <div class="approve"><span><span class="box">☐</span>Approve / Proceed</span><span><span class="box">☐</span>Denial / Reason: <span class="dline">&nbsp;</span></span></div>
    <div class="sign"><span class="lbl">Name:</span><span class="u"></span></div>
    <div class="sign"><span class="lbl">Signature:</span><span class="u"></span></div>
    <div class="sign"><span class="lbl">Date:</span><span class="u"></span></div>

    <div class="foot">${esc(BUSINESS.name)} · ${esc(BUSINESS.website)}</div>
  </div></body></html>`;
}

function previewProposal(p, clientName) {
  const w = window.open('', '_blank', 'width=880,height=1040');
  if (!w) { toast('Allow pop-ups to preview', 'err'); return; }
  w.document.write(proposalDocHtml(p, clientName)); w.document.close();
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
