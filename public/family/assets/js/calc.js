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

// Everything with a balance, including the mortgages the attack plan leaves
// alone — scenarios ask when *every* obligation ends, not just the expensive ones.
export const allDebts = (state) => state.debts.filter((d) => d.balance > 0);

export function order(state, strategy, { includeAll = false } = {}) {
  const live = [...(includeAll ? allDebts(state) : attackable(state))];
  return strategy === 'snowball'
    ? live.sort((a, b) => a.balance - b.balance || b.apr - a.apr)
    : live.sort((a, b) => b.apr - a.apr || a.balance - b.balance);
}

// Month-by-month simulation: everyone gets their minimum, the target debt gets
// the minimum plus every spare dollar, and a cleared debt's payment rolls into
// the next target. Interest accrues monthly on the running balance.
// The part of a payment that actually pays the debt down. A mortgage payment
// carries escrow for taxes and insurance, which never amortizes and never goes
// away — counting it as principal would make the house look years cheaper than
// it is.
export const amortizing = (d) => Math.max(0, d.minimum - (d.escrow ?? 0));

// A minimum that does not even cover the interest would leave the balance
// growing forever — which is a data artefact, not reality. Card issuers set the
// minimum at roughly interest plus 1% of the balance, so fall back to that
// whenever the recorded figure cannot amortize. Captured statements often show
// $0 due simply because autopay had already settled that cycle.
function effectiveMinimum(d) {
  const interest = (d.balance * (d.apr / 100)) / 12;
  const pay = amortizing(d);
  return pay > interest ? pay : Math.max(pay, interest + d.balance * 0.01);
}

// Recurring payments with a known end date — a lease running out, a loan on a
// fixed term. When one stops, that money is free without anyone earning more.
export function freedPayments(state) {
  return (state.recurring ?? [])
    // A term ending only frees money if nothing takes its place. A lease that
    // will be rolled into another vehicle is a payment that continues, and
    // treating its end date as a windfall would flatter every projection.
    .filter((r) => !r.paused && r.endsAfterMonths > 0 && !r.replaced)
    .map((r) => ({ fromMonth: r.endsAfterMonths + 1, amount: r.amount, name: r.name }))
    .sort((a, b) => a.fromMonth - b.fromMonth);
}

export function simulate(state, strategy, extra, cap = 600, opts = {}) {
  const steps = opts.steps ?? [];
  const debts = order(state, strategy, opts).map((d) => ({
    id: d.id, name: d.name, apr: d.apr, minimum: d.minimum, escrow: d.escrow ?? 0,
    balance: d.balance, paid: 0, interest: 0, clearedMonth: null,
  }));
  if (!debts.length) return { months: 0, totalInterest: 0, debts, timeline: [], impossible: false };

  const timeline = [];
  let month = 0;
  let totalInterest = 0;

  while (debts.some((d) => d.balance > 0.005) && month < cap) {
    month += 1;
    const stepped = steps.reduce((s, x) => s + (month >= x.fromMonth ? x.amount : 0), 0);
    let pool = debts.reduce((s, d) => s + (d.balance > 0.005 ? effectiveMinimum(d) : 0), 0) + extra + stepped;
    let accrued = 0;

    // Whoever is at the front of the queue this month is the target. Read it
    // before anything moves: after the payments it would miss a debt that its
    // own minimum finished off, and after the interest the opening balance
    // would be quoted a month's interest higher than what is actually owed.
    const target = debts.find((d) => d.balance > 0.005) ?? null;
    const targetStart = target?.balance ?? 0;
    let toTarget = 0;
    const cleared = [];

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
      if (d === target) toTarget += pay;
      if (d.balance <= 0.005) { d.balance = 0; d.clearedMonth ??= month; cleared.push(d); }
    }
    for (const d of debts) {
      if (pool <= 0.005) break;
      if (d.balance <= 0.005) continue;
      const pay = Math.min(pool, d.balance);
      d.balance -= pay; d.paid += pay; pool -= pay;
      if (d === target) toTarget += pay;
      if (d.balance <= 0.005) { d.balance = 0; d.clearedMonth ??= month; cleared.push(d); }
    }

    timeline.push({
      month,
      balance: debts.reduce((s, d) => s + d.balance, 0),
      interest: accrued,
      targetId: target?.id ?? null,
      targetName: target?.name ?? null,
      targetApr: target?.apr ?? 0,
      targetStart,
      toTarget,
      cleared: cleared.map((d) => ({ id: d.id, name: d.name, minimum: effectiveMinimum(d) })),
    });
  }

  return {
    months: month,
    totalInterest,
    debts,
    timeline,
    // Escrow keeps being paid after the loan clears — worth stating separately
    // so "debt free" is not mistaken for "no housing payment".
    escrowAfter: debts.reduce((s, d) => s + (d.escrow ?? 0), 0),
    // Minimums alone can't cover the interest — the balance would grow forever.
    impossible: month >= cap,
  };
}

// The path, not just the next payment.
//
// "Put it on the Chase card" is obvious and useless on its own — the question
// that changes decisions is what happens after that card dies, and when. So walk
// the simulation and cut it into phases: contiguous runs where the money is
// pointed at the same debt. Each phase is one line you can read and plan around.
export function projection(state, strategy, extra, months = 60, opts = {}) {
  const sim = simulate(state, strategy, extra, 600, opts);
  const span = sim.timeline.slice(0, months);
  if (!span.length) return null;

  const startBalance = attackable(state).reduce((s, d) => s + d.balance, 0);

  const phases = [];
  for (const t of span) {
    const last = phases.at(-1);
    if (last && last.id === t.targetId) {
      last.toMonth = t.month;
      last.poured += t.toTarget;
    } else {
      phases.push({
        id: t.targetId, name: t.targetName, apr: t.targetApr,
        startBalance: t.targetStart, fromMonth: t.month, toMonth: t.month,
        poured: t.toTarget,
      });
    }
  }
  for (const p of phases) {
    const d = sim.debts.find((x) => x.id === p.id);
    p.months = p.toMonth - p.fromMonth + 1;
    p.clearedMonth = d?.clearedMonth ?? null;
    // A phase that runs to the edge of the window has not finished — it is
    // simply where the five years ran out.
    p.clears = !!p.clearedMonth && p.clearedMonth <= months;
    p.endBalance = p.clears ? 0 : (d?.balance ?? 0);
  }

  // Every payment freed by a debt clearing inside the window. This is the
  // compounding part of the plan and the reason later phases move so fast.
  const freed = span.flatMap((t) => t.cleared);

  const years = [];
  for (let y = 1; y * 12 - 11 <= span.length; y += 1) {
    const slice = span.slice((y - 1) * 12, y * 12);
    if (!slice.length) break;
    years.push({
      year: y,
      from: (y - 1) * 12 === 0 ? startBalance : span[(y - 1) * 12 - 1].balance,
      to: slice.at(-1).balance,
      interest: slice.reduce((s, t) => s + t.interest, 0),
      cleared: slice.flatMap((t) => t.cleared),
      months: slice.length,
    });
  }

  return {
    sim,
    span,
    phases,
    years,
    freed,
    startBalance,
    endBalance: span.at(-1).balance,
    interest: span.reduce((s, t) => s + t.interest, 0),
    // Did the whole thing finish inside the window?
    done: !sim.impossible && sim.months <= months,
    monthsToFree: sim.impossible ? null : sim.months,
    window: months,
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

// ---- Runway to the next paycheck -------------------------------------------
//
// The most useful number day to day: of what is sitting in the account right
// now, how much is already committed to scheduled bills before the next
// paycheck lands, and how much is genuinely free. Discretionary spending is
// deliberately excluded — this answers "what is spoken for", not "what will I
// spend".

export function untilNextPayday(state, accountId, from = new Date()) {
  const a = state.accounts.find((x) => x.id === accountId);
  const payDays = payDaysFor(state, accountId);
  if (!a || !payDays.length) return null;

  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);

  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const due = [];
  const credits = [];
  let nextPayday = null;
  let days = 0;

  // Start tomorrow: anything dated today is assumed already reflected in the
  // balance that was just read off the banking app.
  for (let n = 0; n < 62; n += 1) {
    cursor.setDate(cursor.getDate() + 1);
    days += 1;
    const dom = cursor.getDate();
    const lastDom = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const hits = (d) => d === dom || (d > lastDom && dom === lastDom);

    if (payDays.some(hits)) {
      nextPayday = new Date(cursor);
      break;
    }
    for (const b of bills) if (hits(b.day)) due.push({ ...b, on: cursor.toISOString().slice(0, 10) });
    for (const i of incomes) if (incomeDays(i).some(hits)) credits.push({ ...i, on: cursor.toISOString().slice(0, 10) });
  }

  const billsTotal = due.reduce((s, b) => s + b.amount, 0);
  const creditsTotal = credits.reduce((s, i) => s + i.amount, 0);
  const paycheck = incomes
    .filter((i) => isWage(i) && nextPayday && incomeDays(i).includes(nextPayday.getDate()))
    .reduce((s, i) => s + i.amount, 0);

  return {
    nextPayday: nextPayday ? nextPayday.toISOString().slice(0, 10) : null,
    daysAway: days,
    due: due.sort((x, y) => x.day - y.day),
    billsTotal,
    credits,
    creditsTotal,
    paycheck,
    // What is left once every scheduled bill between now and payday has cleared.
    free: a.balance - billsTotal + creditsTotal,
    balance: a.balance,
  };
}

export function runwayHousehold(state, from = new Date()) {
  const parts = state.accounts
    .map((a) => ({ a, r: untilNextPayday(state, a.id, from) }))
    .filter((x) => x.r);
  return {
    parts,
    balance: parts.reduce((s, x) => s + x.r.balance, 0),
    billsTotal: parts.reduce((s, x) => s + x.r.billsTotal, 0),
    creditsTotal: parts.reduce((s, x) => s + x.r.creditsTotal, 0),
    free: parts.reduce((s, x) => s + x.r.free, 0),
  };
}

// ---- Safe to release -------------------------------------------------------
//
// Once everyday spending moves off an account, whatever sits in it beyond the
// bills is idle. But "free today" is the wrong measure — what matters is the
// account's lowest point across the coming cycle, because that is where an
// overdraft would happen. Sweep down to that low, less a buffer, and no more.

export function safeToRelease(state, accountId, buffer = 250, horizonDays = 45) {
  const a = state.accounts.find((x) => x.id === accountId);
  if (!a) return null;

  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);

  let bal = a.balance;
  let low = { balance: bal, date: null };
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  for (let n = 0; n < horizonDays; n += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const dom = cursor.getDate();
    const lastDom = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const hits = (d) => d === dom || (d > lastDom && dom === lastDom);

    for (const b of bills) if (hits(b.day)) bal -= b.amount;
    for (const i of incomes) if (incomeDays(i).some(hits)) bal += i.amount;
    if (bal < low.balance) low = { balance: bal, date: cursor.toISOString().slice(0, 10) };
  }

  return {
    low: low.balance,
    lowDate: low.date,
    buffer,
    release: Math.max(0, low.balance - buffer),
    balance: a.balance,
  };
}

export function releaseHousehold(state, buffer = 250) {
  const parts = state.accounts
    .map((a) => ({ a, r: safeToRelease(state, a.id, buffer) }))
    .filter((x) => x.r);
  return { parts, total: parts.reduce((s, x) => s + x.r.release, 0) };
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

// ---- Monthly spending budget -----------------------------------------------
//
// One number a month for everyday spending, funded from the business. Money is
// allocated to it as it arrives rather than in a single transfer, so what
// matters is how much of the month's budget has already been sent.

export const monthKey = (iso) => iso.slice(0, 7);

export function spendingThisMonth(state, month = today().slice(0, 7)) {
  return (state.allocations ?? [])
    .filter((a) => monthKey(a.date) === month)
    .reduce((s, a) => s + (a.toSpending ?? 0), 0);
}

export function spendingStatus(state) {
  const budget = state.settings?.monthlySpending ?? 0;
  const sent = spendingThisMonth(state);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    budget, sent,
    remaining: Math.max(0, budget - sent),
    over: Math.max(0, sent - budget),
    dayOfMonth: now.getDate(),
    daysInMonth,
    daysLeft: daysInMonth - now.getDate(),
  };
}

// Top the month's spending budget up first, then everything else goes at the
// highest rate. Splitting the other way round would just mean borrowing at 25%
// to cover groceries later in the month.
export function allocate(state, amount, strategy = 'avalanche') {
  const s = spendingStatus(state);
  const toSpending = Math.min(Math.max(0, amount), s.remaining);
  const toDebt = Math.max(0, amount - toSpending);
  const target = order(state, strategy)[0] ?? null;
  return {
    amount,
    toSpending,
    toDebt,
    target,
    // How much of the debt share this particular account can absorb.
    clears: target ? toDebt >= target.balance : false,
    spending: s,
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

// Business money arrives gross. A fixed share is reserved for tax before any of
// it is spendable, so a windfall's headline figure is not what can be deployed.
// Monthly figures are entered net and are unaffected.
export function windfallNet(state, w) {
  const rate = w.gross === false ? 0 : (state.settings?.taxReserveRate ?? 0);
  const reserve = w.amount * rate;
  return { gross: w.amount, reserve, net: w.amount - reserve, rate };
}

export function committedGoals(state, horizonMonths = 12) {
  return [...(state.goals ?? [])]
    .filter((g) => g.committed && g.saved < g.target)
    .map((g) => ({ ...g, need: g.target - g.saved, monthsUntil: Math.max(0, monthsBetween(today(), g.targetDate)) }))
    .filter((g) => g.monthsUntil <= horizonMonths)
    .sort((a, b) => a.monthsUntil - b.monthsUntil);
}

// What is actually going toward goals each month. This is a stated rate rather
// than slack inferred from the bill schedule — money left after bills does not
// reach a trip fund on its own, and treating it as though it does is how a plan
// ends up describing a life nobody is living.
export const monthlyCapacity = (state) => state.settings?.monthlyToGoals ?? 0;

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

// ---- Scenarios -------------------------------------------------------------
//
// The business draw is the lever. Split it between everyday spending and debt,
// and the rest of the plan follows: household slack after bills is already free
// (spending no longer comes out of the bank accounts), so it stacks on top.

export function scenario(state, {
  draw = 0, spending = 0, slack = null, includeAll = false,
  strategy = 'avalanche', useFreed = true,
} = {}) {
  const fromSlack = slack === null ? Math.max(0, household(state).left) : slack;
  const toSpending = Math.min(spending, draw);
  const fromDraw = Math.max(0, draw - toSpending);
  const extra = fromSlack + fromDraw;
  const steps = useFreed ? freedPayments(state) : [];

  const sim = simulate(state, strategy, extra, 600, { includeAll, steps });
  const base = simulate(state, strategy, 0, 600, { includeAll, steps });
  const minimums = (includeAll ? allDebts(state) : attackable(state))
    .reduce((s, d) => s + d.minimum, 0);

  return {
    draw, toSpending, fromDraw, fromSlack, extra, minimums, includeAll, steps,
    sim, base,
    monthsSaved: base.impossible ? null : base.months - sim.months,
    interestSaved: base.impossible ? null : base.totalInterest - sim.totalInterest,
    // Every dollar leaving for debt each month, minimums included.
    totalMonthly: minimums + extra,
  };
}

// ---- Goals -----------------------------------------------------------------

export function goalSummary(state) {
  // Dated goals first, in priority order; anything with no deadline sorts to
  // the back regardless of priority, because it is never the thing being
  // raced against a date.
  const goals = [...state.goals].sort((a, b) =>
    Number(!!a.flexible) - Number(!!b.flexible) || (b.priority ?? 0) - (a.priority ?? 0));
  const target = goals.reduce((s, g) => s + g.target, 0);
  const saved = goals.reduce((s, g) => s + g.saved, 0);
  const dated = goals.filter((g) => !g.flexible);
  return {
    goals,
    dated,
    flexible: goals.filter((g) => g.flexible),
    target,
    saved,
    remaining: target - saved,
    // What is actually on a clock — the figure the monthly rate has to beat.
    datedRemaining: dated.reduce((s, g) => s + Math.max(0, g.target - g.saved), 0),
  };
}

export function goalPace(goal, from = today()) {
  // No deadline, no pace. Being repaid at your own pace by a family member is
  // not an obligation with a monthly number attached, and inventing one would
  // make the rate you need look larger than it is.
  if (goal.flexible) return { months: null, perMonth: 0 };
  const months = Math.max(1, monthsBetween(from, goal.targetDate) + 1);
  return { months, perMonth: Math.max(0, goal.target - goal.saved) / months };
}

// ---- Reconciliation --------------------------------------------------------
//
// Everyday spending runs off the business now, so the two checking accounts
// carry bills and nothing else — which makes them the most predictable thing
// here. Every charge, every date and both paychecks are known, so the app can
// say what a balance ought to be today and the only input worth asking for is
// what it actually is.
//
// The gap between the two is the number that matters. It is nearly always one
// of two things: a bill that has not cleared yet, or a bill that cost more than
// the figure on file. Naming which turns a monthly re-typing chore into a
// weekly correction that leaves the model truer than it found it.

const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const daysBetween = (from, to) =>
  Math.round((parseDay(to) - parseDay(from)) / 86400000);

// Every scheduled movement on an account between two dates — exclusive of the
// start, whose balance is already known, and inclusive of the end.
export function accountEvents(state, accountId, from, to) {
  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);
  const events = [];

  // Charges known to be outstanding from a previous reconcile. A bill you
  // confirmed had not cleared yet still has to come out of the balance, and its
  // day of the month has already gone by.
  for (const p of (state.pending ?? [])) {
    if (p.account !== accountId) continue;
    if (p.on > to) continue;
    events.push({ kind: 'out', on: p.on, id: p.billId ?? p.id, name: p.name, amount: p.amount, late: true });
  }

  const end = parseDay(to);
  const cur = parseDay(from);
  cur.setDate(cur.getDate() + 1);

  for (let guard = 0; cur <= end && guard < 800; guard += 1) {
    const dim = daysInMonth(cur);
    const dom = cur.getDate();
    const on = isoOf(cur);
    // A bill dated the 31st still comes out of a thirty-day month.
    const lands = (day) => day === dom || (day > dim && dom === dim);

    for (const i of incomes) {
      if (incomeDays(i).some(lands)) events.push({ kind: 'in', on, id: i.id, name: i.name, amount: i.amount });
    }
    for (const b of bills) {
      if (lands(b.day ?? 0)) {
        events.push({ kind: 'out', on, id: b.id, name: b.name, amount: b.amount, variable: !!b.variable });
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  return events.sort((a, b) => a.on.localeCompare(b.on));
}

// What the balance should read on a given day, walking forward from the last
// figure that was actually confirmed.
export function expectedBalance(state, accountId, to = today()) {
  const account = state.accounts.find((x) => x.id === accountId);
  if (!account) return null;
  const from = account.balanceAsOf ?? today();
  const opening = account.balance ?? 0;
  const events = accountEvents(state, accountId, from, to);
  const inflow = events.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0);
  const outflow = events.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
  return {
    account, from, to, opening, events, inflow, outflow,
    days: Math.max(0, daysBetween(from, to)),
    balance: opening + inflow - outflow,
  };
}

// Candidate explanations for a difference, best first. Nothing here is applied
// on its own — each one is an offer the user accepts or ignores.
export function explainGap(exp, gap, tolerance = 2) {
  const near = (a, b) => Math.abs(a - b) <= Math.max(tolerance, b * 0.02);
  const outs = exp.events.filter((e) => e.kind === 'out');
  const ins = exp.events.filter((e) => e.kind === 'in');
  const found = [];

  if (gap > 0) {
    // More money than expected: something was subtracted that has not happened.
    for (const e of outs) {
      if (near(gap, e.amount)) found.push({ type: 'late', events: [e], amount: e.amount, rank: 0 });
    }
    for (let i = 0; i < outs.length; i += 1) {
      for (let j = i + 1; j < outs.length; j += 1) {
        if (near(gap, outs[i].amount + outs[j].amount)) {
          found.push({ type: 'late', events: [outs[i], outs[j]], amount: outs[i].amount + outs[j].amount, rank: 1 });
        }
      }
    }
  } else if (gap < 0) {
    // Less money than expected: a payment landed late, or a bill cost more.
    for (const e of ins) {
      if (near(-gap, e.amount)) found.push({ type: 'shortIncome', events: [e], amount: e.amount, rank: 0 });
    }
    for (const e of outs) {
      if (e.late) continue;
      const actual = e.amount - gap;
      // A bill doubling is not drift, it is a different explanation entirely.
      if (actual > e.amount * 2.5) continue;
      found.push({
        type: 'drift', events: [e], amount: actual, billId: e.id,
        rank: e.variable ? 1 : 2 + Math.abs(gap) / (e.amount || 1),
      });
    }
  }

  // A stable identity, because the caller rebuilds this list on every keystroke
  // and needs to know which one is still the chosen one. Object identity would
  // quietly lose the selection on the next repaint.
  for (const f of found) f.key = `${f.type}:${f.events.map((e) => e.id).join('+')}:${f.amount.toFixed(2)}`;
  return found.sort((a, b) => a.rank - b.rank).slice(0, 5);
}

// How close the model has been running. This is the only honest answer to
// "can I trust the number on the front page".
export function reconcileAccuracy(state) {
  const all = (state.reconciliations ?? []).filter((r) => typeof r.gap === 'number');
  if (!all.length) return null;
  const recent = all.slice(-6);
  return {
    count: all.length,
    last: all.at(-1),
    averageMiss: recent.reduce((s, r) => s + Math.abs(r.gap), 0) / recent.length,
    daysSince: daysBetween(all.at(-1).date, today()),
  };
}

// ---- The front of the month ------------------------------------------------
//
// Being paid twice a month while the bills cluster at the front is a timing
// problem, not a budget one: the stretch can be comfortably in the black across
// its whole span and still run dry in the middle of it. So what matters is the
// low point, not the closing figure — walk from the 1st to the next payday and
// find the worst moment.

export function frontOfMonth(state, accountId) {
  const days = payDaysFor(state, accountId);
  if (!days.length) return null;

  const incomes = forAccount(state.income, accountId).filter((i) => !i.excludeFromPlan);
  const bills = recurringFor(state, accountId);

  // The paycheck that lands at the end of the previous month is what the 1st
  // opens with; the next payday is where this stretch ends.
  const opensWith = incomes
    .filter((i) => incomeDays(i).includes(days.at(-1)))
    .reduce((s, i) => s + i.amount, 0);
  // The stretch runs from the 1st until the next payday lands.
  const until = days[0];

  let balance = 0;
  let low = { day: 1, balance: 0 };
  for (let d = 1; d <= until; d += 1) {
    for (const i of incomes) if (incomeDays(i).includes(d) && d !== days.at(-1)) balance += i.amount;
    for (const b of bills) if (b.day === d) balance -= b.amount;
    if (balance < low.balance) low = { day: d, balance };
  }

  const need = Math.abs(low.balance);
  return {
    need,               // what has to be sitting there on the 1st
    lowDay: low.day,    // the day it is tightest
    until,              // the payday that ends the stretch
    opensWith,          // the previous month's last paycheck
    carry: need - opensWith, // what has to survive from the month before
  };
}
