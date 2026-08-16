// Approvals — the owner's sign-off queue for contractors' work.
// Each contractor runs a separate, isolated Supabase project (their own data);
// the owner app connects to each one read/write to approve proposals and
// website builds. Approved proposals are queued to send from the OWNER's Gmail
// (the doc-pipeline Apps Script watches the contractor DBs too), so nothing
// goes to a client without the owner's sign-off.
import { CONTRACTOR_DBS } from './config.js';
import {
  el, clear, money, iconSvg, pageHeader, badge, emptyState, toast,
  openSheet, field, textArea, fmtDate, todayISO,
} from './ui.js';
import { proposalDocHtml } from './proposals.js';

const { createClient } = window.supabase;
const nowISO = () => new Date().toISOString();

export async function renderApprovals(root) {
  root.append(pageHeader('Approvals', 'Sign off on your contractors’ work'));
  const wrap = el('div');
  root.append(wrap);

  if (!CONTRACTOR_DBS.length) {
    wrap.append(emptyState('No contractor apps connected yet.', 'users'));
    return;
  }

  // Cache one client per contractor DB.
  const conns = CONTRACTOR_DBS.map((db) => ({ db, sb: createClient(db.url, db.key) }));

  async function load() {
    const groups = [];
    for (const { db, sb } of conns) {
      const [props, clients] = await Promise.all([
        sb.from('proposals').select('*').in('approval_status', ['pending', 'approved']).is('send_status', null).order('created_at', { ascending: true }),
        sb.from('clients').select('*'),
      ]);
      const clientList = clients.data || [];
      groups.push({
        db, sb,
        clients: clientList,
        pending: (props.data || []).filter((p) => p.approval_status === 'pending'),
        approved: (props.data || []).filter((p) => p.approval_status === 'approved'),
        builds: clientList.filter((c) => c.build_review_status === 'pending'),
      });
    }
    return groups;
  }

  async function refresh() { render(await load()); }

  function render(groups) {
    clear(wrap);
    const total = groups.reduce((s, g) => s + g.pending.length + g.approved.length + g.builds.length, 0);
    if (!total) { wrap.append(emptyState('Nothing waiting for approval.', 'check')); return; }

    groups.forEach((g) => {
      if (!(g.pending.length + g.approved.length + g.builds.length)) return;
      const nameFor = (id) => (g.clients.find((c) => c.id === id) || {}).business_name || '—';
      const clientFor = (id) => g.clients.find((c) => c.id === id) || {};
      wrap.append(el('div.section-title', {}, [el('h3', { text: g.db.name }), badge((g.pending.length + g.builds.length) + ' to review', 'gold')]));

      if (g.pending.length) {
        wrap.append(el('div.field-hint.mb-8', { text: 'Proposals awaiting your approval' }));
        const rows = el('div.rows.card');
        g.pending.forEach((p) => rows.append(proposalRow(g, p, nameFor)));
        wrap.append(rows);
      }
      if (g.approved.length) {
        wrap.append(el('div.field-hint.mb-8.mt-16', { text: 'Approved — send from your email' }));
        const rows = el('div.rows.card');
        g.approved.forEach((p) => rows.append(approvedRow(g, p, nameFor, clientFor)));
        wrap.append(rows);
      }
      if (g.builds.length) {
        wrap.append(el('div.field-hint.mb-8.mt-16', { text: 'Website builds submitted for review' }));
        const rows = el('div.rows.card');
        g.builds.forEach((c) => rows.append(buildRow(g, c)));
        wrap.append(rows);
      }
    });
  }

  // --- Proposal pending approval: Preview / Approve / Request changes ---
  function proposalRow(g, p, nameFor) {
    const preview = el('button.icon-btn', { title: 'Preview / print', html: iconSvg('external', 18), onclick: () => previewDoc(p, nameFor(p.client_id)) });
    const approve = el('button.btn.btn-primary.btn-sm', { text: 'Approve', onclick: async () => {
      await g.sb.from('proposals').update({ approval_status: 'approved', approved_at: nowISO() }).eq('id', p.id);
      toast('Approved'); refresh();
    } });
    const reject = el('button.btn.btn-ghost.btn-sm', { text: 'Request changes', onclick: () => openReject(async (note) => {
      await g.sb.from('proposals').update({ approval_status: 'rejected', approval_note: note || null, status: 'draft' }).eq('id', p.id);
      toast('Sent back'); refresh();
    }) });
    return el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: p.title || 'Untitled proposal' }),
        el('div.row-sub', {}, [
          el('span', { text: nameFor(p.client_id) }),
          p.monthly_total ? badge(money(p.monthly_total) + '/mo', 'green') : null,
          p.build_total ? badge(money(p.build_total) + ' build', 'gold') : null,
        ]),
      ]),
      el('div.row-right', {}, [preview, approve, reject]),
    ]);
  }

  // --- Approved proposal: send from owner's email (queues in the contractor DB) ---
  function approvedRow(g, p, nameFor, clientFor) {
    const preview = el('button.icon-btn', { title: 'Preview / print', html: iconSvg('external', 18), onclick: () => previewDoc(p, nameFor(p.client_id)) });
    const send = el('button.btn.btn-gold.btn-sm', { html: `${iconSvg('send', 14)} Send from my email`, onclick: async () => {
      const c = clientFor(p.client_id);
      if (!c.email) { toast('No client email on file — add it in ' + g.db.name + '’s app first', 'err'); return; }
      await g.sb.from('proposals').update({ send_status: 'queued', sent_to: c.email, drive_status: 'queued', send_error: null, status: 'sent', sent_on: todayISO() }).eq('id', p.id);
      toast('Queued — will email from your Gmail'); refresh();
    } });
    return el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: p.title || 'Untitled proposal' }),
        el('div.row-sub', {}, [badge('Approved', 'green'), el('span', { text: nameFor(p.client_id) })]),
      ]),
      el('div.row-right', {}, [preview, send]),
    ]);
  }

  // --- Website build submitted for review: Approve / Request changes ---
  function buildRow(g, c) {
    const link = c.build_url ? el('button.icon-btn', { title: 'Open build', html: iconSvg('external', 18), onclick: () => window.open(c.build_url, '_blank') }) : null;
    const approve = el('button.btn.btn-primary.btn-sm', { text: 'Approve', onclick: async () => {
      await g.sb.from('clients').update({ build_review_status: 'approved', build_review_note: null }).eq('id', c.id);
      toast('Build approved'); refresh();
    } });
    const reject = el('button.btn.btn-ghost.btn-sm', { text: 'Request changes', onclick: () => openReject(async (note) => {
      await g.sb.from('clients').update({ build_review_status: 'rejected', build_review_note: note || null }).eq('id', c.id);
      toast('Sent back'); refresh();
    }) });
    return el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: c.business_name }),
        el('div.row-sub', {}, [badge('Website build', 'blue'), c.build_url ? el('span.muted', { text: c.build_url }) : el('span.muted', { text: 'No build link yet' })]),
      ]),
      el('div.row-right', {}, [link, approve, reject]),
    ]);
  }

  function openReject(onSend) {
    const note = textArea('note', '', { rows: 3, placeholder: 'What needs to change before it can go out?' });
    const { close } = openSheet({
      title: 'Request changes', body: el('div.form', {}, [field('Note to contractor (optional)', note)]),
      actions: [
        { label: 'Cancel', tone: 'ghost', onClick: () => close() },
        { label: 'Send back', tone: 'primary', onClick: async () => { await onSend(note.value.trim()); close(); } },
      ],
    });
  }

  await refresh();
}

function previewDoc(p, clientName) {
  const w = window.open('', '_blank', 'width=880,height=1040');
  if (!w) { toast('Allow pop-ups to preview', 'err'); return; }
  w.document.write(proposalDocHtml(p, clientName)); w.document.close();
}
