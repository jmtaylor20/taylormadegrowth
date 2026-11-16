// Client Margin — what each client keeps after their share of costs. The page
// only renders; every number comes from the margin-calc service. From here you
// can edit the recurring cost pool, set the minimum acceptable margin, open a
// per-client breakdown, and change a client's billing status.
import { Clients, setSetting } from './db.js';
import { CLIENT_STATUS } from './config.js';
import {
  el, clear, money, money2, pageHeader, sectionTitle, statusBadge, emptyState,
  numberInput, selectInput, toast, openSheet, iconSvg, field,
} from './ui.js';
import { loadMarginInputs, computeMargins, normalizeMonthly } from './margin-calc.js';
import { openCostEditor } from './tracker.js';

const pctTxt = (p) => (p == null ? '—' : (Math.round(p * 10) / 10) + '%');
const signed = (v) => (v < 0 ? '-' : '') + money2(Math.abs(v));
const toneOf = (r) => (r.negative ? 'text-red' : (r.below ? 'text-amber' : ''));

export async function renderMargin(root) {
  let data = null;      // { clients, costItems, minMargin }
  let result = null;    // computeMargins() output

  root.append(pageHeader('Client Margin', 'What each client keeps after their share of costs'));
  const toolbar = el('div.toolbar'); root.append(toolbar);
  const summary = el('div'); root.append(summary);
  const wrap = el('div'); root.append(wrap);

  async function load() { data = await loadMarginInputs(); result = computeMargins(data); }
  async function refresh() { await load(); paint(); }

  function paint() {
    clear(toolbar); clear(summary); clear(wrap);

    toolbar.append(
      el('button.btn.btn-gold', { html: `${iconSvg('wallet', 16)} Manage costs`, onclick: () => openCostEditor(() => refresh(), data.clients) }),
      minMarginControl(),
    );

    // --- Summary cards ---
    const t = result.totals;
    summary.append(sectionTitle('This month'));
    summary.append(el('div.grid.grid-4', {}, [
      stat(money(t.revenue), 'Revenue / mo'),
      stat(money(t.cost), 'Cost / mo'),
      stat(signed(t.margin), 'Total margin', null, 'gold'),
      stat(money2(t.breakEvenRate), 'Break-even rate', 'overhead / client'),
    ]));
    summary.append(el('div.field-hint.mt-8', {
      text: `${money(result.sharedMonthly)} shared overhead split across ${result.activeCount} active/dormant client${result.activeCount === 1 ? '' : 's'} = ${money2(result.allocatedShared)} each. Minimum acceptable margin ${money(result.minMargin)}.`,
    }));

    if (!result.rows.length) { wrap.append(emptyState('No active clients yet. Mark a client active to see their margin.', 'users')); return; }

    // --- Table ---
    wrap.append(sectionTitle('By client'));
    const scroll = el('div.table-scroll');
    const table = el('table.margin-table');
    table.append(el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Client' }),
      ...['Rate', 'Shared', 'Direct', 'Cost', 'Margin', '%'].map((h) => el('th.num', { text: h })),
    ])]));
    const tbody = el('tbody');
    result.rows.forEach((r) => {
      const tone = toneOf(r);
      tbody.append(el('tr' + (r.negative ? '.margin-neg' : (r.below ? '.margin-low' : '')), { onclick: () => openDetail(r) }, [
        el('td', {}, [el('div.margin-name', { text: r.client.business_name }), statusBadge(CLIENT_STATUS, r.client.status)]),
        el('td.num', { text: money(r.rate) }),
        el('td.num', { text: money2(r.allocatedShared) }),
        el('td.num', { text: money2(r.direct) }),
        el('td.num', { text: money2(r.totalCost) }),
        el('td.num' + (tone ? '.' + tone : ''), { text: signed(r.marginDollars) }),
        el('td.num' + (tone ? '.' + tone : ''), { text: pctTxt(r.marginPct) }),
      ]));
    });
    table.append(tbody);
    scroll.append(table);
    wrap.append(el('div.card', { style: 'overflow:hidden' }, [scroll]));

    const belowCount = result.rows.filter((r) => r.below).length;
    wrap.append(el('div.field-hint.mt-8', {
      text: belowCount
        ? `${belowCount} client${belowCount === 1 ? '' : 's'} below the ${money(result.minMargin)} minimum margin (highlighted). Tap a row for the breakdown.`
        : 'Tap a row for the full breakdown of how its costs were split.',
    }));
  }

  function minMarginControl() {
    const inp = numberInput('min', result.minMargin, { step: '1', min: '0' }); inp.style.maxWidth = '84px';
    return el('div.field-row', { style: 'gap:8px;align-items:center' }, [
      el('span.field-hint', { text: 'Min margin $' }), inp,
      el('button.btn.btn-ghost.btn-sm', {
        type: 'button', text: 'Save',
        onclick: async () => {
          try { await setSetting('client_margin', { min_margin: Number(inp.value || 0) }); toast('Saved'); await refresh(); }
          catch (e) { toast(e.message, 'err'); }
        },
      }),
    ]);
  }

  // Per-client breakdown: the shared pool and how it was split, this client's
  // direct costs, and a quick billing-status switch.
  function openDetail(r) {
    const c = r.client;
    const body = el('div.form');

    const statusSel = selectInput('status', CLIENT_STATUS, c.status);
    statusSel.addEventListener('change', async () => {
      try { await Clients.update(c.id, { status: statusSel.value }); toast('Status updated'); close(); await refresh(); }
      catch (e) { toast(e.message, 'err'); }
    });
    body.append(el('div.form-grid.cols-2', {}, [
      field('Monthly rate', readonly(money(r.rate))),
      field('Billing status', statusSel),
    ]));

    body.append(sectionTitle('Margin'));
    body.append(el('div.grid.grid-3', {}, [
      stat(money2(r.totalCost), 'Total cost / mo'),
      stat(signed(r.marginDollars), 'Margin', pctTxt(r.marginPct), r.negative ? 'gold' : null),
      stat(money2(r.breakEven), 'Break-even rate'),
    ]));

    body.append(sectionTitle('Shared overhead'));
    const sharedRows = el('div.rows.card');
    if (result.sharedItems.length) {
      result.sharedItems.forEach((it) => sharedRows.append(line(it.name || 'Cost', monthlyLabel(it))));
    } else {
      sharedRows.append(line('No shared costs', money2(0)));
    }
    sharedRows.append(line('Shared total', money2(result.sharedMonthly), true));
    sharedRows.append(line(`Your share (split ${result.activeCount} ways)`, money2(r.allocatedShared), true));
    body.append(sharedRows);

    body.append(sectionTitle('Client-specific costs'));
    if (r.directItems.length) {
      const dRows = el('div.rows.card');
      r.directItems.forEach((it) => dRows.append(line(it.name || 'Cost', monthlyLabel(it))));
      dRows.append(line('Direct total', money2(r.direct), true));
      body.append(dRows);
    } else {
      body.append(el('div.field-hint', { text: 'None. Tag a recurring cost to this client in Manage costs to add one.' }));
    }

    const { close } = openSheet({ title: c.business_name, body, wide: true, actions: [{ label: 'Done', tone: 'primary', onClick: () => close() }] });
  }

  await load();
  paint();
}

// ---- small render helpers --------------------------------------------------
function stat(value, label, sub, tone) {
  return el('div.stat' + (tone ? '.stat-' + tone : ''), {}, [
    el('div.stat-value', { text: value }),
    el('div.stat-label', { text: label }),
    sub ? el('div.stat-sub', { text: sub }) : null,
  ]);
}
function line(label, value, strong) {
  return el('div.row', {}, [
    el('div.row-main', {}, [el('div' + (strong ? '.row-title' : '.row-title.muted'), { text: label })]),
    el('span.row-amount', { text: value }),
  ]);
}
function monthlyLabel(it) {
  const mo = normalizeMonthly(it.amount, it.billing_period);
  return money2(mo) + (it.billing_period === 'annual' ? '/mo (annual)' : '');
}
function readonly(text) {
  const inp = el('input.input', { value: text, readOnly: true });
  inp.style.background = 'transparent';
  return inp;
}
