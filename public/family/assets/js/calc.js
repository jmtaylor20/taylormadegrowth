// The money math. Every page reads its numbers from here so a change to how
// something is counted lands everywhere at once.

import { monthsBetween, today, parseDay } from './ui.js';

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

// Bills that have stopped — a carrier switch, a payment that ended, spend that
// moved to the business account. Kept visible rather than deleted: seeing what
// came off is half the point of tracking it.
export const endedFor = (state, accountId) =>
  forAccount(state.recurring, accountId).filter((r) => r.paused);

// Still being paid, but you have decided to stop them.
export const cancelList = (state, accountId) =>
  forAccount(state.recurring, accountId).filter((r) => r.action === 'cancel' && !r.paused);

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
  // Statements are history. Bills that have since stopped were part of that
  // outflow, so they have to be credited back or the unplanned figure absorbs
  // them and looks worse than reality.
  const sinceEnded = endedFor(state, accountId).reduce((s, r) => s + r.amount, 0);
  return {
    avgIn,
    avgOut,
    recurring: all,
    sinceEnded,
    unplanned: Math.max(0, avgOut - all - sinceEnded),
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
    sinceEnded: acc.sinceEnded + p.sinceEnded,
    nonPayrollIn: acc.nonPayrollIn + p.nonPayrollIn,
  }), { avgIn: 0, avgOut: 0, recurring: 0, unplanned: 0, sinceEnded: 0, nonPayrollIn: 0 });
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

export const incomeDays = (i) => i.payDays ?? (i.day ? [i.day] : []);

// Periods are defined by paychecks, not by every deposit. A reimbursement
// landing mid-month is income inside whatever period it falls in — treating it
// as its own payday would chop the month into stretches nobody is actually
// budgeting against.
const isWage = (i) => i.kind !== 'credit';

export function payDaysFor(state, accountId) {
  const days = new Set();
  for (const i of forAccount(state.income, accountId)) {
    if (i.excludeFromPlan || !isWage(i)) continue;
    for (const d of incomeDays(i)) days.add(d);
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

    // The paycheck that opens the period, plus any credit landing inside it.
    const income = incomes
      .filter((i) => (isWage(i) ? [start] : span).some((d) => incomeDays(i).includes(d)))
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

// A bill that is reimbursed, but leaves the account before the reimbursement
// lands, forces you to float it out of pocket every single month. Moving it a
// few days later makes it self-funding — no money required, just a date.
export function reimbursementGaps(state, accountId) {
  const out = [];
  for (const r of recurringFor(state, accountId)) {
    if (!r.reimbursedBy || !r.day) continue;
    const src = state.income.find((i) => i.id === r.reimbursedBy);
    const creditDay = src && incomeDays(src)[0];
    if (!creditDay || r.day > creditDay) continue;
    out.push({ bill: r, credit: src, creditDay, suggested: Math.min(28, creditDay + 2) });
  }
  return out;
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
      if (incomeDays(i).includes(day)) bal += i.amount;
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
// A minimum that does not even cover the interest would leave the balance
// growing forever — which is a data artefact, not reality. Card issuers set the
// minimum at roughly interest plus 1% of the balance, so fall back to that
// whenever the recorded figure cannot amortize. Captured statements often show
// $0 due simply because autopay had already settled that cycle.
function effectiveMinimum(d) {
  const interest = (d.balance * (d.apr / 100)) / 12;
  return d.minimum > interest ? d.minimum : Math.max(d.minimum, interest + d.balance * 0.01);
}

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
    let pool = debts.reduce((s, d) => s + (d.balance > 0.005 ? effectiveMinimum(d) : 0), 0) + extra;
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
      const pay = Math.min(effectiveMinimum(d), d.balance, pool);
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

// Run the payoff backwards: given a deadline, what does the extra payment have
// to be? Binary search over the simulation, since there is no closed form once
// freed-up minimums start rolling into the next debt.
export function extraNeededFor(state, targetMonths, strategy = 'avalanche') {
  const feasible = (extra) => {
    const s = simulate(state, strategy, extra, targetMonths + 1);
    return !s.impossible && s.months <= targetMonths;
  };
  let lo = 0;
  let hi = 250;
  // Grow the ceiling until the deadline is reachable, then bisect.
  while (!feasible(hi)) {
    hi *= 2;
    if (hi > 200_000) return null;
  }
  for (let i = 0; i < 26; i += 1) {
    const mid = (lo + hi) / 2;
    if (feasible(mid)) hi = mid; else lo = mid;
  }
  return Math.ceil(hi / 25) * 25;
}

// What a business contribution buys, at a glance: pick a finish line, get the
// monthly number that reaches it.
export function payoffTargets(state, strategy = 'avalanche', years = [5, 4, 3, 2]) {
  return years.map((y) => {
    const months = y * 12;
    const extra = extraNeededFor(state, months, strategy);
    const sim = extra === null ? null : simulate(state, strategy, extra);
    return { years: y, months, extra, interest: sim?.totalInterest ?? null };
  });
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

// ---- Balance variance ------------------------------------------------------
//
// Walk from the last recorded balance to today, adding each paycheck and
// subtracting each bill on the day it lands. Where the balance *should* be,
// minus where it actually is, is money spent outside the plan — measured over
// days you actually lived, rather than inferred from statements months old.

export function expectedBalance(state, accountId, asOf = new Date()) {
  const a = state.accounts.find((x) => x.id === accountId);
  if (!a?.balanceAsOf) return null;

  const from = parseDay(a.balanceAsOf);
  const to = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 12);
  const days = Math.round((to - from) / DAY);
  if (days <= 0) return null;

  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);

  let expected = a.baselineBalance ?? a.balanceAtLastCheck ?? null;
  // Without a stored starting point there is nothing to compare against.
  if (expected === null) return null;

  let income = 0;
  let spent = 0;
  const cursor = new Date(from);
  for (let n = 0; n < days; n += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const dom = cursor.getDate();
    // A payday or bill dated later than this month's length lands on its last day.
    const lastDom = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const hits = (d) => d === dom || (d > lastDom && dom === lastDom);

    for (const i of incomes) if (incomeDays(i).some(hits)) { expected += i.amount; income += i.amount; }
    for (const b of bills) if (hits(b.day)) { expected -= b.amount; spent += b.amount; }
  }

  const gap = a.balance - expected;
  return {
    days, expected, actual: a.balance, gap,
    income, billsPaid: spent,
    // Negative gap is unscheduled spending; positive means money arrived that
    // the plan does not know about.
    perDay: gap / days,
    perMonth: (gap / days) * 30,
  };
}

// ---- Check-ins -------------------------------------------------------------
//
// No bank linking. The app stays current on a handful of numbers typed once a
// month — balances drift, the recurring list barely moves — so the only thing
// worth chasing is whether those numbers are stale.

export const DAY = 86_400_000;

export function checkInStatus(state) {
  const last = state.checkIns?.at(-1) ?? null;
  const days = last ? Math.floor((Date.now() - parseDay(last.date).getTime()) / DAY) : null;
  return {
    last,
    days,
    // A month is the natural rhythm — it is when statements land.
    due: days === null || days >= 28,
    stale: days !== null && days >= 45,
    count: state.checkIns?.length ?? 0,
  };
}

// Total attackable debt at each check-in — the one line that proves the plan is
// working. Everything else is forecast; this is measured.
export function debtTrend(state) {
  const points = (state.checkIns ?? [])
    .filter((c) => c.totalDebt != null)
    .map((c) => ({ date: c.date, total: c.totalDebt }));
  const now = debtTotals(state).balance;
  const lastDate = points.at(-1)?.date;
  if (!lastDate || lastDate !== today()) points.push({ date: today(), total: now });
  if (points.length < 2) return null;

  const first = points[0];
  const latest = points.at(-1);
  const months = Math.max(1, monthsBetween(first.date, latest.date));
  return {
    points,
    change: latest.total - first.total,
    perMonth: (latest.total - first.total) / months,
    months,
  };
}

// ---- Spending envelope -----------------------------------------------------
//
// Move a fixed amount to a separate account each payday and spend only from
// there. It caps discretionary spending by construction instead of by willpower,
// and it collapses a hundred card swipes into one transfer.

export function envelopeStatus(state) {
  const e = state.envelope ?? {};
  const perPeriod = e.perPeriod ?? 0;
  const cadence = e.cadence ?? 'semimonthly';
  const perMonth = cadence === 'semimonthly' ? perPeriod * 2 : perPeriod;

  const asOf = e.asOf ?? null;
  const daysIn = asOf ? Math.floor((Date.now() - parseDay(asOf).getTime()) / DAY) : null;
  const periodDays = cadence === 'semimonthly' ? 15 : 30;

  // Straight-line burn: where the balance should be this far into the period.
  const expected = perPeriod > 0 && daysIn !== null
    ? Math.max(0, perPeriod * (1 - Math.min(1, daysIn / periodDays)))
    : null;
  const balance = e.balance ?? 0;

  return {
    ...e, perPeriod, cadence, perMonth, balance, asOf, daysIn, periodDays, expected,
    ahead: expected === null ? null : balance - expected,
    daysLeft: daysIn === null ? null : Math.max(0, periodDays - daysIn),
    configured: perPeriod > 0,
  };
}

// What the envelope has to be capped at for the debt plan to work on household
// income alone. Any business draw on top reduces the cut required.
export function envelopeTarget(state) {
  const act = actualsHousehold(state);
  const h = household(state);
  if (!act) return null;
  const extra = state.settings.extraToDebt ?? 0;
  const shortfall = Math.max(0, extra - Math.max(0, h.left));
  return {
    current: act.unplanned,
    target: Math.max(0, act.unplanned - shortfall),
    cut: shortfall,
    slack: h.left,
    extra,
  };
}

// ---- Windfalls -------------------------------------------------------------
//
// The instinct with a lump sum is to throw it at the highest rate. That is the
// wrong first move when a dated, committed expense is sitting just ahead of it:
// paying down a card and then charging the trip back onto that same card leaves
// you worse off by the whole trip, and it happens at the same interest rate. So
// committed spending inside the horizon gets funded first — not as indulgence,
// but because it is the cheapest debt avoidance available.

export function committedGoals(state, horizonMonths = 12) {
  return [...(state.goals ?? [])]
    .filter((g) => g.committed && g.saved < g.target)
    .map((g) => ({ ...g, need: g.target - g.saved, monthsUntil: Math.max(0, monthsBetween(today(), g.targetDate)) }))
    .filter((g) => g.monthsUntil <= horizonMonths)
    .sort((a, b) => a.monthsUntil - b.monthsUntil);
}

// Money the household can put toward goals and extra debt each month: the slack
// left after every bill, plus whatever the business has committed to sending.
export const monthlyCapacity = (state) =>
  Math.max(0, household(state).left) + (state.settings?.businessContribution ?? 0);

// A lump sum should only cover what monthly cashflow cannot reach in time —
// and "in time" is cumulative, not per-goal. By the month a trip falls due,
// cashflow has produced capacity × months, and every earlier trip has already
// drawn on it. Only the running shortfall needs the windfall; everything left
// belongs on the highest rate, because a dollar there always beats a dollar
// sitting in a trip fund that cashflow was going to reach anyway.
export function allocateWindfall(state, amount, { horizonMonths = 6 } = {}) {
  const steps = [];
  let left = amount;

  const goals = committedGoals(state, horizonMonths);
  const cardApr = Math.max(0, ...attackable(state).filter((d) => d.limit > 0).map((d) => d.apr));
  const capacity = monthlyCapacity(state);

  let cumNeed = 0;
  let earmarked = 0;
  for (const g of goals) {
    if (left <= 0.5) break;
    cumNeed += g.need;
    const fromCashflow = capacity * g.monthsUntil;
    const shortfall = cumNeed - fromCashflow - earmarked;
    if (shortfall <= 0.5) continue;

    const give = Math.min(shortfall, left);
    left -= give;
    earmarked += give;
    steps.push({
      kind: 'goal', id: g.id, name: g.name, amount: give,
      avoids: give * (cardApr / 100) * (Math.max(1, g.monthsUntil) / 12),
      why: g.monthsUntil <= 1
        ? `${longDateISO(g.targetDate)} — too close to save for. Unfunded it goes on a card at ${cardApr.toFixed(2)}%.`
        : `${longDateISO(g.targetDate)}. ${money0(fromCashflow)} of cashflow arrives by then; this covers the ${money0(shortfall)} gap.`,
    });
  }

  const ef = state.settings ?? {};
  const efGap = Math.max(0, (ef.emergencyFundTarget ?? 0) - (ef.emergencyFundSaved ?? 0));
  if (left > 0.5 && efGap > 0) {
    const give = Math.min(efGap, left);
    left -= give;
    steps.push({
      kind: 'emergency', id: 'ef', name: 'Starter emergency fund', amount: give,
      avoids: 0,
      why: 'Both accounts have dipped under $250 this year. Without a buffer the next surprise becomes card debt at full rate.',
    });
  }

  for (const d of order(state, 'avalanche')) {
    if (left <= 0.5) break;
    const give = Math.min(d.balance, left);
    left -= give;
    steps.push({
      kind: 'debt', id: d.id, name: d.name, amount: give,
      avoids: give * (d.apr / 100),
      why: `Highest rate left at ${d.apr.toFixed(2)}%.`,
    });
  }

  return {
    amount,
    steps,
    unallocated: left,
    avoidedInterest: steps.reduce((s, x) => s + x.avoids, 0),
    goalsCovered: steps.filter((s) => s.kind === 'goal').length,
  };
}

const money0 = (n) => '$' + Math.round(n).toLocaleString('en-US');

const longDateISO = (iso) =>
  parseDay(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// Both plans end the horizon at the same balance — the trips cost what they
// cost. What separates them is *when* money is on the books, so the only honest
// comparison is interest accrued month by month across the horizon.
export function windfallCompare(state, amount, opts = {}) {
  const { horizonMonths = 6 } = opts;
  const smart = allocateWindfall(state, amount, { horizonMonths });
  const goals = committedGoals(state, horizonMonths);
  const committed = goals.reduce((s, g) => s + g.need, 0);
  const apr = Math.max(0, ...attackable(state).filter((d) => d.limit > 0).map((d) => d.apr));

  // Walk the horizon: an unfunded trip lands on a card in the month it happens.
  const run = (fundedByGoal) => {
    const fundedTotal = Object.values(fundedByGoal).reduce((s, x) => s + x, 0);
    let delta = -(amount - fundedTotal); // negative = debt paid down today
    let interest = 0;
    for (let m = 1; m <= horizonMonths; m += 1) {
      for (const g of goals) {
        if (g.monthsUntil === m) delta += g.need - (fundedByGoal[g.id] ?? 0);
      }
      interest += Math.max(0, delta) * (apr / 100) / 12;
      if (delta < 0) interest += delta * (apr / 100) / 12; // paydown earns the same rate back
    }
    return { interest, endDelta: delta };
  };

  const smartFunded = Object.fromEntries(
    smart.steps.filter((s) => s.kind === 'goal').map((s) => [s.id, s.amount]),
  );
  const planned = run(smartFunded);
  const allToDebt = run({});
  const allToGoals = run(Object.fromEntries(goals.map((g) => [g.id, Math.min(g.need, amount)])));

  return {
    smart, committed, apr, horizonMonths,
    planned, allToDebt, allToGoals,
    // Positive = the recommended plan costs less interest over the horizon.
    vsAllToDebt: allToDebt.interest - planned.interest,
    vsAllToGoals: allToGoals.interest - planned.interest,
    sameEndBalance: Math.abs(planned.endDelta - allToDebt.endDelta) < 1,
  };
}

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
