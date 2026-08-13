// Proposals — build a proposal from line items, track its status, and track the
// contract through to signed. Generate a clean printable proposal to send.
import { Proposals, Clients } from './db.js';
import { PROPOSAL_STATUS, CONTRACT_STATUS, SERVICES, DOC_TYPE, SEND_STATUS, DRIVE_STATUS } from './config.js';
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
    field('Summary / cover note', textArea('summary', existing.summary, { rows: 2, placeholder: 'What you’ll do and why it matters.' })),
    field('Line items', el('div', {}, [itemsWrap, totalsBar])),
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

function previewProposal(p, clientName) {
  const items = p.line_items || [];
  const rows = items.map((it) => `<tr><td>${esc(it.label)}</td><td style="text-align:right">${it.monthly ? money(it.monthly) + '/mo' : '—'}</td><td style="text-align:right">${it.oneTime ? money(it.oneTime) : '—'}</td></tr>`).join('');
  const m = items.reduce((s, x) => s + Number(x.monthly || 0), 0);
  const o = items.reduce((s, x) => s + Number(x.oneTime || 0), 0);
  const html = `<!DOCTYPE html><html><head><title>${esc(p.title || 'Proposal')}</title><style>
    body{font-family:'Inter',system-ui,sans-serif;color:#101827;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.55}
    .head{display:flex;justify-content:space-between;border-bottom:3px solid #13294b;padding-bottom:14px;margin-bottom:22px}
    .brand{font-family:'Sora',sans-serif;font-weight:800;font-size:1.4rem;color:#081a33}.brand span{color:#d4af37}
    h1{font-size:1.3rem;color:#081a33;margin:0 0 6px}.muted{color:#64748b}
    table{width:100%;border-collapse:collapse;margin:18px 0}td,th{padding:9px 6px;border-bottom:1px solid #e6e9ef;font-size:.95rem}
    th{text-align:left;color:#64748b;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em}
    tfoot td{font-weight:800;color:#081a33;border-top:2px solid #13294b;border-bottom:0}
    .totals{display:flex;gap:14px;margin-top:8px}.chip{background:#13294b;color:#fff;padding:10px 16px;border-radius:12px;font-weight:700}
    .chip small{display:block;color:#d4af37;font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.05em}
  </style></head><body>
    <div class="head"><div class="brand">TaylorMade <span>Brands</span></div><div class="muted" style="text-align:right">${esc(labelOf(DOC_TYPE, p.doc_type || 'proposal'))}<br>${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
    <h1>${esc(p.title || 'Growth Proposal')}</h1>
    <div class="muted">Prepared for <b style="color:#101827">${esc(clientName || 'your business')}</b></div>
    ${p.summary ? `<p style="margin-top:16px">${esc(p.summary)}</p>` : ''}
    <table><thead><tr><th>Service</th><th style="text-align:right">Monthly</th><th style="text-align:right">One-time</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" class="muted">No line items</td></tr>'}</tbody>
      <tfoot><tr><td>Total</td><td style="text-align:right">${money(m)}/mo</td><td style="text-align:right">${money(o)}</td></tr></tfoot>
    </table>
    <div class="totals"><div class="chip"><small>Monthly</small>${money(m)}</div><div class="chip"><small>To start</small>${money(o)}</div></div>
    <p class="muted" style="margin-top:28px;border-top:1px solid #e6e9ef;padding-top:14px">TaylorMade Brands · taylormadegrowth.com · Let’s grow something great together.</p>
  </body></html>`;
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) { toast('Allow pop-ups to preview', 'err'); return; }
  w.document.write(html); w.document.close();
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
