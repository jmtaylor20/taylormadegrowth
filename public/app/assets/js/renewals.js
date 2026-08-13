// Renewals — every domain / hosting / email renewal date across clients, plus a
// snapshot of Google Business Profile and Google Ads status. Nothing lapses.
import { Clients } from './db.js';
import { GBP_STATUS, ADS_STATUS } from './config.js';
import { el, clear, iconSvg, pageHeader, badge, statusBadge, fmtDate, relDue, daysUntil, emptyState, money } from './ui.js';
import { openClient } from './client-detail.js';

export async function renderRenewals(root) {
  const state = { tab: 'renewals' };
  root.append(pageHeader('Renewals & channels', 'Domains, hosting, email, GBP & Ads'));

  const seg = el('div.segmented');
  [['renewals', 'Renewals'], ['gbp', 'Google Business'], ['ads', 'Google Ads']].forEach(([k, l]) =>
    seg.append(el('button.seg' + (state.tab === k ? '.on' : ''), { text: l, dataset: { t: k }, onclick: () => { state.tab = k; seg.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.dataset.t === k)); refresh(); } })));
  root.append(el('div.toolbar', {}, [seg]));

  const wrap = el('div');
  root.append(wrap);

  let all = [];
  async function load() { all = await Clients.list({ order: { col: 'business_name', asc: true } }); }

  function refresh() {
    clear(wrap);
    if (state.tab === 'renewals') renewalsView();
    else if (state.tab === 'gbp') channelView('gbp_status', GBP_STATUS, 'Google Business Profile', 'gbp_url');
    else channelView('ads_status', ADS_STATUS, 'Google Ads', null);
  }

  function renewalsView() {
    const items = [];
    all.forEach((c) => {
      [['Domain', c.domain_name, c.domain_renews_on], ['Hosting', c.hosting_provider, c.hosting_renews_on], ['Email', c.email_provider, c.email_renews_on]]
        .forEach(([kind, provider, date]) => { if (date) items.push({ id: c.id, client: c.business_name, kind, provider, date, days: daysUntil(date) }); });
    });
    items.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

    const soon = items.filter((i) => i.days <= 30).length;
    wrap.append(el('div.grid.grid-3', {}, [
      el('div.stat' + (soon ? '.stat-gold' : ''), {}, [el('div.stat-value', { text: String(soon) }), el('div.stat-label', { text: 'Renewing ≤ 30 days' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(items.length) }), el('div.stat-label', { text: 'Tracked items' })]),
      el('div.stat', {}, [el('div.stat-value', { text: String(items.filter((i) => i.days < 0).length) }), el('div.stat-label', { text: 'Lapsed' })]),
    ]));

    if (!items.length) { wrap.append(emptyState('No renewal dates recorded yet. Add them from a client’s Services & status tab.', 'renew')); return; }
    const rows = el('div.rows.card.mt-16');
    items.forEach((i) => rows.append(el('div.row.clickable', { onclick: () => openClient(i.id, refreshAfter) }, [
      el('div.row-main', {}, [
        el('div.row-title', { text: i.client + ' · ' + i.kind }),
        el('div.row-sub', {}, [i.provider || '', el('span', { text: fmtDate(i.date) })]),
      ]),
      badge(relDue(i.date), i.days < 0 ? 'red' : i.days <= 30 ? 'amber' : 'gray'),
    ])));
    wrap.append(rows);
  }

  function channelView(statusField, vocab, title, urlField) {
    const managed = all.filter((c) => c[statusField] && c[statusField] !== 'none');
    const counts = vocab.filter((v) => v.key !== 'none').map((v) => ({ ...v, n: all.filter((c) => c[statusField] === v.key).length }));
    wrap.append(el('div.grid.grid-4', {}, counts.map((v) => el('div.stat', {}, [el('div.stat-value', { text: String(v.n) }), el('div.stat-label', { text: v.label })]))));

    if (!managed.length) { wrap.append(emptyState('No ' + title + ' work tracked yet.', 'ads')); return; }
    const rows = el('div.rows.card.mt-16');
    managed.forEach((c) => rows.append(el('div.row.clickable', { onclick: () => openClient(c.id, refreshAfter) }, [
      el('div.row-main', {}, [
        el('div.row-title', { text: c.business_name }),
        el('div.row-sub', {}, [
          statusField === 'ads_status' && c.ads_budget ? el('span', { text: money(c.ads_budget) + '/mo budget' }) : null,
          urlField && c[urlField] ? el('span', { text: c[urlField] }) : null,
        ]),
      ]),
      statusBadge(vocab, c[statusField]),
    ])));
    wrap.append(rows);
  }

  async function refreshAfter() { await load(); refresh(); }
  await load();
  refresh();
}
