// The money math. Every page reads its numbers from here so a change to how
// something is counted lands everywhere at once.

import { monthsBetween, today } from './ui.js';

export const CATEGORY_COLORS = {
  Housing: '#5aa9f0',
  Debt: '#f4645f',
  Insurance: '#9b8cf0',
  Utilities: '#f4c04e',
  Kids: '#2fbf78',
  Transport: '#4fd0c0',
  Subscriptions: '#f0714a',
  Health: '#e46bb0',
  Business: '#6f89a3',
  Other: '#8ea3b8',
};

export const colorFor = (cat) => CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;

// Business spend runs through the personal checking account, so it is real
// money leaving — but it is not household spending, and mixing the two hides
// what the family actually costs. Counted separately everywhere.
export const isBusiness = (r) => r.category === 'Business';

export const forAccount = (list, id) => list.filter((x) => x.account === id);

// ---- Income ----------------------------------------------------------------

export function monthlyIncome(state, accountId) {
  return forAccount(state.income, accountId)
    .filter((i) => !i.excludeFromPlan)
    .reduce((s, i) => s + (i.monthly ?? 0), 0);
}

export function upsideIncome(state, accountId) {
  return forAccount(state.income, accountId)
    .filter((i) => i.excludeFromPlan)
    .reduce((s, i) => s + (i.amount ?? 0), 0);
}

// ---- Recurring -------------------------------------------------------------

export function recurringFor(state, accountId) {
  return forAccount(state.recurring, accountId)
    .filter((r) => !r.paused)
    .sort((a, b) => (a.day ?? 32) - (b.day ?? 32));
}

export function recurringTotals(state, accountId) {
  const rows = recurringFor(state, accountId);
  const household = rows.filter((r) => !isBusiness(r)).reduce((s, r) => s + r.amount, 0);
  const business = rows.filter(isBusiness).reduce((s, r) => s + r.amount, 0);
  return { household, business, all: household + business, count: rows.length };
}

export function byCategory(state, accountId, { includeBusiness = false } = {}) {
  const map = new Map();
  for (const r of recurringFor(state, accountId)) {
    if (!includeBusiness && isBusiness(r)) continue;
    map.set(r.category, (map.get(r.category) ?? 0) + r.amount);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value, color: colorFor(label) }))
    .sort((a, b) => b.value - a.value);
}

// What is left after the bills that hit this account, before groceries, gas
// and everything else that is not on a schedule.
export function leftover(state, accountId) {
  const income = monthlyIncome(state, accountId);
  const { household, business } = recurringTotals(state, accountId);
  return { income, household, business, left: income - household - business };
}

// The recurring list is only the scheduled half of the story. Statements show
// what actually left. The difference is the unplanned spend — groceries, fuel,
// eating out, one-offs — and it is usually the number people are missing.
export function actuals(state, accountId) {
  const a = state.accounts.find((x) => x.id === accountId);
  if (!a?.statements?.length) return null;
  const n = a.statements.length;
  // One-time events (a car payoff funded by a matching deposit) would swamp the
  // averages, so they are netted out.
  const avgOut = a.statements.reduce((s, x) => s + x.out - (x.oneOffOut ?? 0), 0) / n;
  const avgIn = a.statements.reduce((s, x) => s + x.in - (x.oneOffIn ?? 0), 0) / n;
  const { all } = recurringTotals(state, accountId);
  const payroll = monthlyIncome(state, accountId);
  return {
    avgIn,
    avgOut,
    recurring: all,
    unplanned: Math.max(0, avgOut - all),
    // Deposits arriving on top of payroll: business draws, Venmo, mobile
    // deposits, reimbursements. What is quietly holding the month together.
    nonPayrollIn: Math.max(0, avgIn - payroll),
  };
}

export function actualsHousehold(state) {
  const parts = state.accounts.map((a) => actuals(state, a.id)).filter(Boolean);
  if (!parts.length) return null;
  return parts.reduce((acc, p) => ({
    avgIn: acc.avgIn + p.avgIn,
    avgOut: acc.avgOut + p.avgOut,
    recurring: acc.recurring + p.recurring,
    unplanned: acc.unplanned + p.unplanned,
    nonPayrollIn: acc.nonPayrollIn + p.nonPayrollIn,
  }), { avgIn: 0, avgOut: 0, recurring: 0, unplanned: 0, nonPayrollIn: 0 });
}

export function household(state) {
  const ids = state.accounts.map((a) => a.id);
  const income = ids.reduce((s, id) => s + monthlyIncome(state, id), 0);
  const t = ids.reduce((acc, id) => {
    const r = recurringTotals(state, id);
    return { household: acc.household + r.household, business: acc.business + r.business };
  }, { household: 0, business: 0 });
  return { income, ...t, left: income - t.household - t.business };
}

// ---- Paydays ---------------------------------------------------------------
//
// Being paid twice a month while the bills cluster on the 1st–13th is a timing
// problem, not a budget problem — and it needs its own math. A paycheck landing
// on day D has to carry every bill until the next one lands, so the month is
// modelled as pay periods that wrap around the month boundary.

export function payDaysFor(state, accountId) {
  const days = new Set();
  for (const i of forAccount(state.income, accountId)) {
    if (i.excludeFromPlan) continue;
    for (const d of i.payDays ?? (i.day ? [i.day] : [])) days.add(d);
  }
  return [...days].sort((a, b) => a - b);
}

// Days covered by the period starting at `start`, walking forward (and wrapping
// past the 31st) until the next payday.
function daysInPeriod(start, next) {
  const out = [];
  let d = start;
  for (let guard = 0; guard < 31; guard += 1) {
    out.push(d);
    d = d === 31 ? 1 : d + 1;
    if (d === next) break;
  }
  return out;
}

export function payPeriods(state, accountId, overrides = {}) {
  const days = payDaysFor(state, accountId);
  if (!days.length) return [];

  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);

  return days.map((start, idx) => {
    const next = days[(idx + 1) % days.length];
    const span = daysInPeriod(start, next);
    const spanSet = new Set(span);

    const income = incomes
      .filter((i) => (i.payDays ?? [i.day]).includes(start))
      .reduce((s, i) => s + i.amount, 0);

    const items = bills.filter((b) => spanSet.has(overrides[b.id] ?? b.day));
    const outgo = items.reduce((s, b) => s + b.amount, 0);

    return {
      start, next, span, income, outgo, items,
      net: income - outgo,
      // A period that wraps the month end (e.g. the 30th through the 13th).
      wraps: next < start,
    };
  });
}

// Move bills between periods until the pain is shared. The target is not "every
// period positive" — that is impossible when the month as a whole is short — but
// each period carrying a share of the bills proportional to its paycheck.
export function rebalance(state, accountId) {
  const base = payPeriods(state, accountId);
  if (base.length < 2) return null;

  const totalIncome = base.reduce((s, p) => s + p.income, 0);
  const totalOutgo = base.reduce((s, p) => s + p.outgo, 0);
  if (!totalIncome) return null;

  const overrides = {};
  const moves = [];
  const fairShare = (p) => (p.income / totalIncome) * totalOutgo;

  // Every move is a phone call, so only suggest ones worth making: a period has
  // to be meaningfully out of balance, and the bill has to be big enough to
  // matter. Shaving $17 off a gap is not worth anyone's afternoon.
  const MIN_GAP = 150;
  const MIN_BILL = 75;

  // Greedy: repeatedly take the most over-loaded period and hand its largest
  // movable bill to the most under-loaded one, while that actually helps.
  for (let step = 0; step < 12; step += 1) {
    const periods = payPeriods(state, accountId, overrides);
    const scored = periods.map((p) => ({ p, gap: p.outgo - fairShare(p) }));
    const worst = scored.reduce((a, b) => (b.gap > a.gap ? b : a));
    const best = scored.reduce((a, b) => (b.gap < a.gap ? b : a));
    if (worst.p.start === best.p.start || worst.gap < MIN_GAP) break;

    const candidates = worst.p.items
      .filter((b) => b.movable !== false && !(b.id in overrides) && b.amount >= MIN_BILL)
      .sort((a, b) => b.amount - a.amount);

    // Prefer the bill that gets both periods closest to their fair share.
    const pick = candidates.find((b) => b.amount <= worst.gap - best.gap) ?? candidates[0];
    if (!pick) break;

    const before = Math.max(...scored.map((s) => Math.abs(s.gap)));
    const targetDay = best.p.span[Math.min(5, best.p.span.length - 1)];
    overrides[pick.id] = targetDay;

    const after = payPeriods(state, accountId, overrides)
      .map((p) => Math.abs(p.outgo - fairShare(p)));
    if (Math.max(...after) >= before) { delete overrides[pick.id]; break; }

    moves.push({ bill: pick, from: pick.day, to: targetDay, fromPeriod: worst.p.start, toPeriod: best.p.start });
  }

  return { before: base, after: payPeriods(state, accountId, overrides), moves, overrides };
}

// Day-by-day cash position across one cycle. The walk starts at the first
// payday, not the 1st of the month — a month-end paycheck is what funds the
// following 1st, and starting at the calendar boundary would count those bills
// with no money behind them and overstate the cushion by thousands.
export function runningBalance(state, accountId, opening = 0, overrides = {}) {
  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);
  const days = payDaysFor(state, accountId);
  const startDay = days.length ? days[days.length - 1] : 1;

  const points = [];
  let bal = opening;
  let low = { day: startDay, balance: opening };

  let day = startDay;
  for (let n = 0; n < 31; n += 1) {
    for (const i of incomes) {
      if ((i.payDays ?? [i.day]).includes(day)) bal += i.amount;
    }
    for (const b of bills) {
      if ((overrides[b.id] ?? b.day) === day) bal -= b.amount;
    }
    points.push({ day, balance: bal });
    if (bal < low.balance) low = { day, balance: bal };
    day = day === 31 ? 1 : day + 1;
  }

  return { points, low, close: bal, startDay };
}

// The cash cushion that keeps the lowest point of the month at zero.
export const floatTarget = (state, accountId, overrides = {}) =>
  Math.max(0, -runningBalance(state, accountId, 0, overrides).low.balance);

// ---- Pipeline --------------------------------------------------------------

// A one-off in four months costs a quarter of itself every month starting now.
// That is the number worth budgeting, not the lump.
export function monthlySetAside(item, from = today()) {
  const months = Math.max(1, monthsBetween(from, item.due) + 1);
  return item.amount / months;
}

export function pipelineSummary(state, from = today()) {
  const items = [...state.pipeline].sort((a, b) => a.due.localeCompare(b.due));
  const next90 = items.filter((i) => monthsBetween(from, i.due) <= 3);
  return {
    items,
    total: items.reduce((s, i) => s + i.amount, 0),
    setAside: items.reduce((s, i) => s + monthlySetAside(i, from), 0),
    next90: next90.reduce((s, i) => s + i.amount, 0),
    next90Count: next90.length,
  };
}

// ---- Debt ------------------------------------------------------------------

export const attackable = (state) =>
  state.debts.filter((d) => !d.excludeFromAttack && d.balance > 0);

export const unknownDebts = (state) =>
  state.debts.filter((d) => d.balance <= 0 && d.minimum > 0);

export function debtTotals(state) {
  const live = attackable(state);
  const balance = live.reduce((s, d) => s + d.balance, 0);
  const minimums = state.debts.filter((d) => !d.excludeFromAttack).reduce((s, d) => s + d.minimum, 0);
  const allMinimums = state.debts.reduce((s, d) => s + d.minimum, 0);
  const monthlyInterest = live.reduce((s, d) => s + (d.balance * (d.apr / 100)) / 12, 0);
  const weightedApr = balance > 0 ? live.reduce((s, d) => s + d.balance * d.apr, 0) / balance : 0;
  return { balance, minimums, allMinimums, monthlyInterest, weightedApr, count: live.length };
}

export function order(state, strategy) {
  const live = [...attackable(state)];
  return strategy === 'snowball'
    ? live.sort((a, b) => a.balance - b.balance || b.apr - a.apr)
    : live.sort((a, b) => b.apr - a.apr || a.balance - b.balance);
}

// Month-by-month simulation: everyone gets their minimum, the target debt gets
// the minimum plus every spare dollar, and a cleared debt's payment rolls into
// the next target. Interest accrues monthly on the running balance.
export function simulate(state, strategy, extra, cap = 600) {
  const debts = order(state, strategy).map((d) => ({
    id: d.id, name: d.name, apr: d.apr, minimum: d.minimum,
    balance: d.balance, paid: 0, interest: 0, clearedMonth: null,
  }));
  if (!debts.length) return { months: 0, totalInterest: 0, debts, timeline: [], impossible: false };

  const timeline = [];
  let month = 0;
  let totalInterest = 0;

  while (debts.some((d) => d.balance > 0.005) && month < cap) {
    month += 1;
    let pool = debts.reduce((s, d) => s + (d.balance > 0.005 ? d.minimum : 0), 0) + extra;
    let accrued = 0;

    // Interest first, then minimums, then everything spare at the front debt.
    for (const d of debts) {
      if (d.balance <= 0.005) continue;
      const i = (d.balance * (d.apr / 100)) / 12;
      d.balance += i;
      d.interest += i;
      accrued += i;
    }
    totalInterest += accrued;

    for (const d of debts) {
      if (d.balance <= 0.005) continue;
      const pay = Math.min(d.minimum, d.balance, pool);
      d.balance -= pay; d.paid += pay; pool -= pay;
      if (d.balance <= 0.005) { d.balance = 0; d.clearedMonth ??= month; }
    }
    for (const d of debts) {
      if (pool <= 0.005) break;
      if (d.balance <= 0.005) continue;
      const pay = Math.min(pool, d.balance);
      d.balance -= pay; d.paid += pay; pool -= pay;
      if (d.balance <= 0.005) { d.balance = 0; d.clearedMonth ??= month; }
    }

    timeline.push({ month, balance: debts.reduce((s, d) => s + d.balance, 0), interest: accrued });
  }

  return {
    months: month,
    totalInterest,
    debts,
    timeline,
    // Minimums alone can't cover the interest — the balance would grow forever.
    impossible: month >= cap,
  };
}

export function compare(state, extra) {
  const av = simulate(state, 'avalanche', extra);
  const sn = simulate(state, 'snowball', extra);
  const base = simulate(state, 'avalanche', 0);
  return { avalanche: av, snowball: sn, minimumsOnly: base };
}

export const addMonths = (n) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// ---- Goals -----------------------------------------------------------------

export function goalSummary(state) {
  const goals = [...state.goals].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const target = goals.reduce((s, g) => s + g.target, 0);
  const saved = goals.reduce((s, g) => s + g.saved, 0);
  return { goals, target, saved, remaining: target - saved };
}

export function goalPace(goal, from = today()) {
  const months = Math.max(1, monthsBetween(from, goal.targetDate) + 1);
  return { months, perMonth: Math.max(0, goal.target - goal.saved) / months };
}
