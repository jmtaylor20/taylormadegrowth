// Household overview — the one screen that answers "are we okay this month?"

import { el, money, signed, stat, section, splitBar, legend, bar, ord, longDate } from '../ui.js';
import { checkInCard, envelopeCard } from './checkin.js';
import { windfallCard } from './windfall.js';
import {
  household, monthlyIncome, recurringTotals, leftover, byCategory,
  debtTotals, attackable, unknownDebts, simulate, goalSummary,
  payPeriods, rebalance, floatTarget, runwayHousehold, releaseHousehold,
} from '../calc.js';

export default function home(state) {
  const wrap = el('div');
  const h = household(state);
  const debt = debtTotals(state);
  const goals = goalSummary(state);
  const extra = state.settings.extraToDebt ?? 0;


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
    stat('Left after bills', money(h.left), 'before everyday spending', h.left < 0 ? 'neg' : 'pos'),
  ));

  // ---- Runway --------------------------------------------------------------

  const rw = runwayHousehold(state);
  wrap.append(section('Between now and the next paycheck'));
  wrap.append(el('div.card', {},
    el('div.stats', {},
      stat('In both accounts', money(rw.balance), 'right now', ''),
      stat('Still to clear', money(rw.billsTotal), 'scheduled bills', 'neg'),
      stat('Credits due', money(rw.creditsTotal), 'before payday', rw.creditsTotal > 0 ? 'pos' : 'mut'),
      stat('Free', money(rw.free), 'after every scheduled bill', rw.free < 0 ? 'neg' : 'pos'),
    ),
    el('p.tiny', { style: { margin: '12px 0 0' } },
      'Recurring only — no groceries, fuel or eating out in this figure. It is what is spoken for, not what will get spent.'),
    ...rw.parts.map(({ a, r }) => el('div.tiny', { style: { marginTop: '8px' } },
      `${a.owner}: ${money(r.balance)} − ${money(r.billsTotal)} in ${r.due.length} bill${r.due.length === 1 ? '' : 's'}`
      + (r.creditsTotal ? ` + ${money(r.creditsTotal)} credits` : '')
      + ` = ${money(r.free)} by ${longDate(r.nextPayday)}`)),
  ));

  // ---- Safe to sweep -------------------------------------------------------

  const rel = releaseHousehold(state, 250);
  if (rel.total > 100) {
    wrap.append(section('Idle cash', 'safe to move out'));
    wrap.append(el('div.card', { style: { borderColor: 'var(--josh)' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '6px' } }, '🧹 Sweep to the debt'),
      el('div', { style: { fontSize: '30px', fontWeight: '680', letterSpacing: '-0.02em' }, class: 'num pos', text: money(rel.total) }),
      el('p', { style: { margin: '8px 0 12px', fontSize: '14px', lineHeight: '1.5' } },
        'Once everyday spending runs off the business, whatever sits here beyond the bills is idle. This is how far each account can be swept without the cycle dipping below its buffer — measured at the low point, not today.'),
      ...rel.parts.map(({ a, r }) => el('div.tiny', { style: { marginTop: '6px' } },
        `${a.owner}: low of ${money(r.low)}${r.lowDate ? ` on ${longDate(r.lowDate)}` : ''} → release ${money(r.release)}, keep ${money(Math.min(r.balance, r.buffer + (r.balance - r.release - r.buffer)))}`)),
    ));
  }

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

  // ---- The honest read -----------------------------------------------------

  wrap.append(section('The honest read'));
  wrap.append(el('div.card', {}, verdict(state, h, debt)));

  return wrap;
}

function verdict(state, h, debt) {
  const lines = [];
  const commit = (h.household + h.business) / (h.income || 1);

  lines.push(`${Math.round(commit * 100)}% of your take-home is committed to recurring bills. Housing and debt alone are ${money(
    state.recurring.filter((r) => ['Housing', 'Debt'].includes(r.category) && !r.paused).reduce((s, r) => s + r.amount, 0))} a month.`);

  if (debt.monthlyInterest > 0) {
    lines.push(`Interest is costing ${money(debt.monthlyInterest)} a month — ${money(debt.monthlyInterest * 12)} a year that buys nothing.`);
  }

  const asks = state.recurring.filter((r) => r.question && !r.answered).length;
  if (asks) lines.push(`${asks} line items still need your read — they are flagged ASK on Josh's and Laci's tabs.`);

  return el('div', {}, lines.map((t, i) =>
    el('p', { text: t, style: { margin: i ? '10px 0 0' : '0', fontSize: '14px', lineHeight: '1.5' } })));
}
