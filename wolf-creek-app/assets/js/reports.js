// Reports tab — the scoreboard Russ actually asked for:
//   1. Estimates won vs. lost, and the win rate.
//   2. Money won (the value of jobs he landed) vs. money collected.
//   3. Every customer and what they've paid.
//
// Deliberately simple: no road time, no equipment hours, no crew throughput.
// "All time" is the default because a dirt-work year is lumpy; the month filter
// is there when he wants to compare.
import { h, clear, money, fmtDate, todayStr, custName, icon } from './ui.js';
import { isLost, isWonish } from './config.js';
import { allJobs, expenseEntries } from './db.js';
import { openJob } from './sheet.js';

let range = 'all';        // 'all' | 'ytd' | 'month'
let monthCursor = null;   // 'YYYY-MM' when range === 'month'

export function renderReports(root) {
  clear(root);
  const body = h('div', {}, h('div', { class: 'muted center' }, 'Loading…'));
  root.append(
    h('div', { class: 'view-head' }, h('h1', {}, 'Reports'), h('p', {}, 'How the estimates are landing, and what has actually come in.')),
    h('div', { class: 'filter-bar' },
      rangeBtn('All time', 'all', root), rangeBtn('This year', 'ytd', root), rangeBtn('By month', 'month', root)),
    body);

  (async () => {
    let jobs = [], expenses = [];
    try { [jobs, expenses] = await Promise.all([allJobs(), expenseEntries()]); }
    catch (err) { console.error(err); clear(body); body.append(h('div', { class: 'muted center' }, 'Could not load.')); return; }
    clear(body);
    paint(body, jobs, expenses, () => renderReports(root));
  })();
}

function rangeBtn(label, value, root) {
  return h('button', { type: 'button', class: 'filter' + (range === value ? ' on' : ''), onclick: () => { range = value; renderReports(root); } }, label);
}

function paint(body, jobs, expenses, reload) {
  const month = monthCursor || todayStr().slice(0, 7);
  if (range === 'month') {
    body.append(h('div', { class: 'month-bar' },
      h('button', { class: 'icon-btn', onclick: () => { monthCursor = shiftMonth(month, -1); reload(); }, 'aria-label': 'Previous month' }, '‹'),
      h('span', { class: 'month-label' }, monthName(month)),
      h('button', { class: 'icon-btn', onclick: () => { monthCursor = shiftMonth(month, 1); reload(); }, 'aria-label': 'Next month' }, '›')));
  }

  // A job counts toward a period by the date it was decided: completed jobs by
  // their completion date, everything else by when the lead came in.
  const decidedOn = (j) => (j.completed_at || j.received_at || j.created_at || '').slice(0, 10);
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    if (range === 'all') return true;
    if (range === 'ytd') return dateStr.slice(0, 4) === todayStr().slice(0, 4);
    return dateStr.slice(0, 7) === month;
  };

  const scoped = jobs.filter((j) => inRange(decidedOn(j)));

  // ---- 1. Wins and losses -------------------------------------------------
  // Only jobs that got a price count as decided — an unquoted lead is neither.
  const won = scoped.filter((j) => isWonish(j.status));
  const lost = scoped.filter((j) => isLost(j.status));
  const openQuotes = scoped.filter((j) => j.status === 'estimate_given');
  const decided = won.length + lost.length;
  const winRate = decided ? Math.round((won.length / decided) * 100) : null;

  const wonValue = won.reduce((s, j) => s + amountOf(j), 0);
  const lostValue = lost.reduce((s, j) => s + amountOf(j), 0);
  const openValue = openQuotes.reduce((s, j) => s + amountOf(j), 0);

  body.append(h('div', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Estimates'),
    h('div', { class: 'stat-grid' },
      stat('Won', String(won.length), money(wonValue)),
      stat('Lost', String(lost.length), money(lostValue))),
    h('div', { class: 'stat-grid' },
      stat('Win rate', winRate == null ? '—' : winRate + '%', decided ? decided + ' decided' : 'nothing decided yet'),
      stat('Still out', String(openQuotes.length), money(openValue) + ' pending')),
  ));

  // Why the lost ones were lost — the only breakdown worth the space.
  if (lost.length) {
    const reasons = {};
    lost.forEach((j) => { const k = LOST_LABEL[j.status] || 'Lost'; reasons[k] = (reasons[k] || 0) + 1; });
    const c = h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'Why estimates were lost'));
    Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
      c.append(h('div', { class: 'dl-row' }, h('span', { class: 'dl-k' }, k), h('span', { class: 'dl-v' }, String(v)))));
    body.append(c);
  }

  // ---- 2. Money won vs. collected -----------------------------------------
  // "Won" is the value of work landed. "Collected" is cash actually received,
  // including partial payments on jobs that aren't settled yet.
  const collected = scoped.reduce((s, j) => s + collectedOf(j), 0);
  const outstanding = scoped
    .filter((j) => j.status === 'completed' && !j.paid)
    .reduce((s, j) => s + Math.max(amountOf(j) - collectedOf(j), 0), 0);

  const spendRows = expenses.filter((e) => inRange(e.entry_date));
  const spent = spendRows.filter((e) => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);

  body.append(h('div', { class: 'card' },
    h('h2', { class: 'card-title' }, 'Money'),
    h('div', { class: 'stat-grid' },
      stat('Work won', money(wonValue), won.length + ' job' + (won.length === 1 ? '' : 's')),
      stat('Collected', money(collected), 'cash in hand')),
    h('div', { class: 'stat-grid' },
      stat('Still owed', money(outstanding), 'completed, unpaid'),
      stat('Expenses logged', money(spent), 'from the Expenses tab')),
  ));

  // ---- 3. Customers and what they've paid ---------------------------------
  // Grouped by customer name, since the same person may hire him repeatedly.
  const byCustomer = {};
  scoped.filter((j) => isWonish(j.status)).forEach((j) => {
    const key = custName(j);
    const c = (byCustomer[key] ||= { name: key, jobs: 0, billed: 0, paid: 0, last: '', job: j });
    c.jobs += 1;
    c.billed += amountOf(j);
    c.paid += collectedOf(j);
    const d = decidedOn(j);
    if (d > c.last) { c.last = d; c.job = j; }
  });
  const customers = Object.values(byCustomer).sort((a, b) => b.paid - a.paid);

  body.append(h('div', { class: 'group-head' }, 'Customers', h('span', { class: 'group-count' }, customers.length)));
  if (!customers.length) {
    body.append(h('div', { class: 'empty' }, h('p', {}, 'No won work in this period.')));
    return;
  }
  customers.forEach((c) => {
    const owed = Math.max(c.billed - c.paid, 0);
    body.append(h('div', { class: 'job-card col' },
      h('button', { type: 'button', class: 'job-card-hit', onclick: () => openJob(c.job, reload) },
        h('div', { class: 'job-card-top' },
          h('span', { class: 'job-name' }, c.name),
          h('span', { class: 'job-amount' }, money(c.paid))),
        h('div', { class: 'job-sub' }, c.jobs + ' job' + (c.jobs === 1 ? '' : 's') + ' · billed ' + money(c.billed) + ' · last ' + fmtDate(c.last)),
        owed > 0.005 ? h('div', { class: 'job-note note-inline pay-note' }, icon('paid', 14), money(owed) + ' still owed') : null)));
  });
}

const LOST_LABEL = {
  lost_lower_quote: 'Someone quoted lower',
  lost_overbid: 'Bid high on purpose',
  lost_no_time: "Couldn't get to it",
};

// What the job is worth: the final cost once it's set, otherwise the estimate.
function amountOf(j) { return Number(j.final_cost != null ? j.final_cost : (j.estimate_amount != null ? j.estimate_amount : 0)); }
// Cash actually received. Paid-in-full jobs count fully even if amount_paid was
// never itemized; otherwise the running partial total, capped at the job value.
function collectedOf(j) {
  const total = amountOf(j);
  if (j.paid) return total;
  return Math.min(Math.max(Number(j.amount_paid) || 0, 0), total);
}

function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-val' }, String(value)), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null);
}
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthName(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
