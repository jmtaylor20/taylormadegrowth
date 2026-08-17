// Household overview — the one screen that answers "are we okay this month?"

import { el, money, signed, stat, section, splitBar, legend, bar, ord } from '../ui.js';
import { checkInCard, envelopeCard } from './checkin.js';
import { windfallCard } from './windfall.js';
import {
  household, monthlyIncome, recurringTotals, leftover, byCategory,
  debtTotals, attackable, unknownDebts, simulate, pipelineSummary, goalSummary,
  actualsHousehold, payPeriods, rebalance, floatTarget,
} from '../calc.js';

export default function home(state) {
  const wrap = el('div');
  const h = household(state);
  const debt = debtTotals(state);
  const pipe = pipelineSummary(state);
  const goals = goalSummary(state);
  const extra = state.settings.extraToDebt ?? 0;

  // True monthly slack: income, minus every recurring bill, minus what the
  // pipeline needs set aside, minus what the goals need. Debt minimums are
  // already inside the recurring list, so they are not subtracted twice.
  const slack = h.left - pipe.setAside;

  wrap.append(
    el('div.card.hero', {},
      el('div.label', { text: 'Left after every bill' }),
      el('div.big', { text: money(h.left), class: h.left < 0 ? 'neg' : h.left < 800 ? 'warn' : 'pos' }),
      el('div.note', { text: `${money(h.income)} in · ${money(h.household + h.business)} committed` }),
    ),
  );

  wrap.append(el('div.stats', {},
    stat('Household bills', money(h.household), `${state.recurring.filter((r) => r.category !== 'Business' && !r.paused).length} recurring`, 'neg'),
    stat('Business on personal', money(h.business), 'move off these accounts', 'mut'),
    stat('Pipeline set-aside', money(pipe.setAside), `${pipe.items.length} known one-offs`, 'warn'),
    stat('Truly spare', money(slack), 'after pipeline funding', slack < 0 ? 'neg' : 'pos'),
  ));

  wrap.append(section('Keeping it honest'));
  wrap.append(checkInCard(state));
  wrap.append(envelopeCard(state));

  if ((state.windfalls ?? []).some((w) => !w.applied)) {
    wrap.append(section('Money coming in'));
    wrap.append(windfallCard(state));
  }

  // ---- Per person ----------------------------------------------------------

  wrap.append(section('By account'));
  for (const a of state.accounts) {
    const l = leftover(state, a.id);
    const cats = byCategory(state, a.id, { includeBusiness: true });
    wrap.append(el('button.card', {
      type: 'button', style: { display: 'block', width: '100%', textAlign: 'left' },
      onclick: () => { location.hash = a.id; },
    },
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' } },
        el('div', { style: { fontWeight: '650', fontSize: '16px' } }, a.owner),
        el('div.tiny', { text: `${a.bank} ····${a.mask}` }),
        el('div', { style: { marginLeft: 'auto', fontWeight: '650' }, class: l.left < 0 ? 'neg' : 'pos', text: `${signed(l.left)}/mo` }),
      ),
      splitBar(cats),
      el('div.tiny', { style: { marginTop: '8px' } },
        `${money(l.income)} in · ${money(l.household + l.business)} out · balance ${money(a.balance)}`),
    ));
  }

  // ---- Payday timing -------------------------------------------------------

  const tight = state.accounts
    .flatMap((a) => payPeriods(state, a.id).map((p) => ({ a, p })))
    .filter(({ p }) => p.net < 0)
    .sort((x, y) => x.p.net - y.p.net)[0];

  if (tight) {
    const fix = rebalance(state, tight.a.id);
    wrap.append(section('Payday timing', 'front-loaded'));
    wrap.append(el('button.card', {
      type: 'button', style: { display: 'block', width: '100%', textAlign: 'left' },
      onclick: () => { location.hash = 'paydays'; },
    },
      el('div.stats', {},
        stat('Worst stretch', money(tight.p.net), `${tight.a.owner}, ${ord(tight.p.start)}–${ord(tight.p.next === 1 ? 31 : tight.p.next - 1)}`, 'neg'),
        stat('Cushion needed', money(floatTarget(state, tight.a.id)), 'to never dip below zero', 'warn'),
      ),
      el('p', { style: { margin: '12px 0 0', fontSize: '14px', lineHeight: '1.5' } },
        fix && fix.moves.length
          ? `${money(Math.abs(tight.p.net))} more leaves than lands in that stretch. ${fix.moves.length === 1 ? 'Moving one due date' : `Moving ${fix.moves.length} due dates`} evens it out — no extra money required.`
          : `${money(Math.abs(tight.p.net))} more leaves than lands in that stretch.`),
    ));
  }

  // ---- Debt at a glance ----------------------------------------------------

  const plan = simulate(state, state.settings.strategy, extra);
  const missing = unknownDebts(state);

  wrap.append(section('Debt', `${debt.count} accounts`));
  wrap.append(el('button.card', {
    type: 'button', style: { display: 'block', width: '100%', textAlign: 'left' },
    onclick: () => { location.hash = 'debt'; },
  },
    el('div.stats', {},
      stat('Balance', money(debt.balance), `avg ${debt.weightedApr.toFixed(1)}% APR`, 'neg'),
      stat('Interest', money(debt.monthlyInterest), 'burned every month', 'neg'),
    ),
    el('div.tiny', { style: { marginTop: '12px' } },
      plan.impossible
        ? 'At the current payment the balances do not go down. Open the plan.'
        : `Clear in ${plan.months} months at ${money(debt.minimums + extra)}/mo — ${money(plan.totalInterest)} of interest along the way.`),
    missing.length
      ? el('div.qbox', { style: { margin: '12px 0 0' } },
          el('b', { text: `${missing.length} debts have no balance yet: ` }),
          missing.map((d) => d.name).join(', ') + '. Send me those and the plan gets real.')
      : null,
  ));

  // ---- Coming up -----------------------------------------------------------

  if (pipe.items.length) {
    const soon = pipe.items.slice(0, 3);
    wrap.append(section('Next up', `${money(pipe.next90)} in 90 days`));
    const c = el('div.card.flush');
    for (const p of soon) {
      c.append(el('button.row', { type: 'button', onclick: () => { location.hash = 'pipeline'; } },
        el('div.day', { text: new Date(p.due + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }) }),
        el('div.mid', {}, el('div.nm', {}, el('span.t', { text: p.name })),
          el('div.meta', { text: new Date(p.due + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) })),
        el('div.amt', { text: money(p.amount) })));
    }
    wrap.append(c);
  }

  // ---- Goals ---------------------------------------------------------------

  if (goals.goals.length) {
    wrap.append(section('Goals', `${money(goals.saved)} of ${money(goals.target)}`));
    const c = el('div.card');
    for (const g of goals.goals) {
      c.append(el('div', { style: { marginBottom: '14px' } },
        el('div', { style: { display: 'flex', gap: '8px', fontSize: '14px', marginBottom: '6px' } },
          el('span', { text: `${g.emoji ?? '🎯'} ${g.name}` }),
          el('span.tiny', { style: { marginLeft: 'auto' } }, `${money(g.saved)} / ${money(g.target)}`)),
        bar(g.saved / (g.target || 1), 'var(--gold)')));
    }
    c.lastChild.style.marginBottom = '0';
    wrap.append(c);
  }

  // ---- Planned vs actual ---------------------------------------------------

  const act = actualsHousehold(state);
  if (act) {
    wrap.append(section('Plan vs. statements', 'monthly average'));
    wrap.append(el('div.card', {},
      el('div.stats', {},
        stat('Actually leaves', money(act.avgOut), 'across both accounts', 'neg'),
        stat('Off the plan', money(act.unplanned), 'groceries, fuel, one-offs', 'warn'),
      ),
      el('p', { style: { margin: '12px 0 0', fontSize: '14px', lineHeight: '1.5' } },
        `The recurring list covers ${money(act.recurring)} a month. Statements show ${money(act.avgOut)} actually leaving — so ${money(act.unplanned)} a month is unscheduled spending. That is the part no bill schedule will ever catch, and it is where any real cut has to come from.`),
      act.nonPayrollIn > 500
        ? el('p', { style: { margin: '10px 0 0', fontSize: '14px', lineHeight: '1.5' } },
            `On the income side, ${money(act.nonPayrollIn)} a month is arriving on top of the two paychecks — business draws, Venmo, mobile deposits, reimbursements. Payroll alone does not cover this household right now; that extra money is what's holding it together. Worth knowing plainly, because it's the thing that would hurt most if it paused.`)
        : null,
    ));
  }

  // ---- The honest read -----------------------------------------------------

  wrap.append(section('The honest read'));
  wrap.append(el('div.card', {}, verdict(state, h, debt, pipe, slack, act)));

  return wrap;
}

function verdict(state, h, debt, pipe, slack, act) {
  const lines = [];
  const commit = (h.household + h.business) / (h.income || 1);

  lines.push(`${Math.round(commit * 100)}% of your take-home is spoken for before anyone buys groceries. Housing and debt alone are ${money(
    state.recurring.filter((r) => ['Housing', 'Debt'].includes(r.category) && !r.paused).reduce((s, r) => s + r.amount, 0))} a month.`);

  if (debt.monthlyInterest > 0) {
    lines.push(`Interest is costing ${money(debt.monthlyInterest)} a month — ${money(debt.monthlyInterest * 12)} a year that buys nothing. That is most of a Disney trip, every year, on autopilot.`);
  }

  if (slack < 0) {
    lines.push(`On paper the month comes up ${money(Math.abs(slack))} short once the pipeline is funded. That is why balances drift up. The fix is either less recurring or more income — the plan can't square it by itself.`);
  } else {
    lines.push(`There is roughly ${money(slack)} of genuine slack. Put it at the Chase Prime Visa first — highest rate and smallest balance, so there is no trade-off to argue about.`);
  }

  if (act && act.unplanned > 1000) {
    lines.push(`The lever nobody wants to hear about: ${money(act.unplanned)} a month leaves outside the bill schedule. Cutting a fifth of that frees ${money(act.unplanned * 0.2)} — more than any subscription you could cancel, and enough to change the payoff date by years.`);
  }

  const asks = state.recurring.filter((r) => r.question && !r.answered).length;
  if (asks) lines.push(`${asks} line items still need your read — they are flagged ASK on Josh's and Laci's tabs. A few of them look like they could just go away.`);

  return el('div', {}, lines.map((t, i) =>
    el('p', { text: t, style: { margin: i ? '10px 0 0' : '0', fontSize: '14px', lineHeight: '1.5' } })));
}
