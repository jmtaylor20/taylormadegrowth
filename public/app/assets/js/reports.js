// Reports — monthly client reports. (Phase 1: pick a client and generate the
// current monthly snapshot; a full metrics form + email/Drive send comes next.)
import { Clients, clientBundle } from './db.js';
import { el, clear, iconSvg, pageHeader, badge, emptyState, toast, money } from './ui.js';
import { openReport } from './report.js';

const initials = (n) => (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export async function renderReports(root) {
  root.append(pageHeader('Reports', 'Monthly client snapshots'));
  root.append(el('div.banner', { html: 'Pick a client to generate this month’s report. A full metrics form (impressions, clicks, CTR, conversions…) with one-click email + Drive is coming next.' }));

  const wrap = el('div');
  root.append(wrap);
  const clients = (await Clients.list({ order: { col: 'business_name', asc: true } })).filter((c) => c.stage === 'client');
  if (!clients.length) { wrap.append(emptyState('No active clients yet.', 'report')); return; }

  const rows = el('div.rows.card');
  clients.forEach((c) => rows.append(el('div.row', {}, [
    el('div.avatar', { text: initials(c.business_name) }),
    el('div.row-main', {}, [el('div.row-title', { text: c.business_name }), el('div.row-sub', {}, [c.mrr ? badge(money(c.mrr) + '/mo', 'green') : null, c.category || ''])]),
    el('button.btn.btn-primary.btn-sm', { html: `${iconSvg('report', 15)} Report`, onclick: async () => {
      try { const bundle = await clientBundle(c.id); openReport(c, bundle); } catch (e) { toast(e.message, 'err'); }
    } }),
  ])));
  wrap.append(rows);
}
