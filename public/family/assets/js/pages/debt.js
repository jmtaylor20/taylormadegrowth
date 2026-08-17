// Debt attack plan. Avalanche vs snowball, simulated month by month, with the
// extra payment as the one dial that matters.

import * as store from '../store.js';
import {
  el, money, pct, stat, section, bar, sheet, field, input, select, longDate, ord, today,
} from '../ui.js';
import { trendCard } from './checkin.js';
import {
  debtTotals, attackable, unknownDebts, order, simulate, compare, addMonths, household,
  payoffTargets, allocate, spendingStatus,
} from '../calc.js';

const TYPES = ['Credit card', 'Installment loan', 'Auto loan', 'Student loan', 'Mortgage', 'Other'];

export default function debt(state) {
  const wrap = el('div');
  const totals = debtTotals(state);
  const missing = unknownDebts(state);
  const h = household(state);
  let extra = state.settings.extraToDebt ?? 0;
  let strategy = state.settings.strategy ?? 'avalanche';

  // ---- Allocator -----------------------------------------------------------

  wrap.append(allocator(state, strategy));

  // ---- Dashboard -----------------------------------------------------------

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'Attackable debt' }),
    el('div.big.neg', { text: money(totals.balance) }),
    el('div.note', { text: `${totals.count} accounts · ${pct(totals.weightedApr, 1)} average rate · mortgages excluded` }),
  ));

  wrap.append(el('div.stats', {},
    stat('Interest / mo', money(totals.monthlyInterest), `${money(totals.monthlyInterest * 12)} a year`, 'neg'),
    stat('Minimums', money(totals.minimums), 'already in your bills', ''),
    stat('Extra available', money(h.left), 'left after everything', h.left < 0 ? 'neg' : 'pos'),
    stat('Interest share', pct(totals.minimums > 0 ? (totals.monthlyInterest / totals.minimums) * 100 : 0),
      'of each payment is interest', 'warn'),
  ));

  if (missing.length) {
    wrap.append(el('div.qbox', { style: { margin: '12px 0 0' } },
      el('b', { text: 'Incomplete: ' }),
      `${missing.map((d) => d.name).join(', ')} — I know the payments but not the balances or rates, so they sit outside the plan. Add them and the ordering may change.`,
      el('button.btn.sm', {
        type: 'button', text: 'Fill these in', style: { marginTop: '10px', display: 'block' },
        onclick: () => editDebt(state, missing[0]),
      })));
  }

  wrap.append(section('Measured, not forecast'));
  wrap.append(trendCard(state));

  // ---- The dial ------------------------------------------------------------

  wrap.append(section('Extra payment', 'the only dial that matters'));
  const dialCard = el('div.card');
  const readout = el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } });
  const slider = el('input.slider', {
    type: 'range', min: '0', max: '3000', step: '25', value: String(extra),
  });
  const summary = el('div');
  const stratSeg = el('div.seg', { style: { marginTop: '14px' } });

  const repaint = () => {
    readout.replaceChildren(
      el('div', { style: { fontSize: '30px', fontWeight: '680', letterSpacing: '-0.02em' }, class: 'num', text: money(extra) }),
      el('div.tiny', { text: 'a month on top of minimums' }),
    );
    summary.replaceChildren(planSummary(state, strategy, extra));
    [...stratSeg.children].forEach((c) => c.classList.toggle('on', c.dataset.k === strategy));
  };

  slider.addEventListener('input', () => { extra = Number(slider.value); repaint(); });
  slider.addEventListener('change', () => store.commit((s) => { s.settings.extraToDebt = extra; }));

  for (const [k, label] of [['avalanche', 'Avalanche — cheapest'], ['snowball', 'Snowball — fastest wins']]) {
    const b = el('button', { type: 'button', text: label });
    b.dataset.k = k;
    b.addEventListener('click', () => {
      strategy = k;
      store.commit((s) => { s.settings.strategy = k; });
      repaint();
    });
    stratSeg.append(b);
  }

  dialCard.append(readout, slider, el('div.tiny', { text: `Left after every recurring bill: ${money(h.left)}` }), stratSeg, summary);
  wrap.append(dialCard);
  repaint();

  // ---- Payoff order --------------------------------------------------------

  wrap.append(section('Attack order'));
  wrap.append(orderList(state, strategy, extra));

  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Add a debt', type: 'button', style: { marginTop: '10px' },
    onclick: () => editDebt(state, null),
  }));

  // ---- What TaylorMade has to produce --------------------------------------

  wrap.append(section('What it takes', 'pick a finish line'));
  wrap.append(targets(state, strategy, h));

  // ---- Strategy comparison -------------------------------------------------

  wrap.append(section('Avalanche vs snowball', `at ${money(extra)}/mo extra`));
  wrap.append(comparison(state, extra));

  // ---- Why this order ------------------------------------------------------

  wrap.append(section('Why this order'));
  wrap.append(el('div.card', {}, rationale(state, strategy, extra)));

  return wrap;
}

// ---- Allocator -------------------------------------------------------------
//
// "I have this much — where does it go?" The month's everyday-spending budget
// fills first, because the alternative is covering groceries later on a card at
// 25%. Whatever is left goes at the highest rate.

function allocator(state, strategy) {
  const card = el('div.card', { style: { borderColor: 'var(--blue)' } });
  const amount = el('input', {
    type: 'number', step: '50', inputmode: 'decimal', placeholder: '0',
    style: {
      width: '100%', padding: '14px 16px', fontSize: '26px', fontWeight: '680',
      textAlign: 'center', background: 'var(--bg-raise)',
      border: '1px solid var(--line)', borderRadius: '12px',
      fontVariantNumeric: 'tabular-nums',
    },
  });
  const out = el('div');

  const paint = () => {
    const v = Number(amount.value) || 0;
    const a = allocate(state, v, strategy);
    const sp = a.spending;

    if (!v) {
      out.replaceChildren(el('p.tiny', { style: { margin: '12px 0 0' } },
        sp.remaining > 0
          ? `${money(sp.sent)} of this month's ${money(sp.budget)} spending budget has gone out. The next ${money(sp.remaining)} tops it up; anything beyond that goes at the debt.`
          : `This month's ${money(sp.budget)} spending budget is already covered. Everything you put in goes straight at the debt.`));
      return;
    }

    out.replaceChildren(
      el('div', { style: { marginTop: '14px' } },
        row('💸', 'Everyday spending', a.toSpending,
          a.toSpending > 0
            ? `Tops the month up to ${money(sp.sent + a.toSpending)} of ${money(sp.budget)}`
            : 'Budget already covered this month'),
        row('🔥', a.target ? a.target.name : 'Debt', a.toDebt,
          !a.target ? 'No balances entered'
            : a.clears ? `Clears it outright — ${money(a.target.balance)} balance`
            : `Highest rate at ${pct(a.target.apr, 2)} · leaves ${money(a.target.balance - a.toDebt)}`),
      ),
      a.toDebt > 0 && a.target
        ? el('p.tiny', { style: { margin: '12px 0 0' } },
            `Saves about ${money((a.toDebt * a.target.apr) / 100)} of interest a year.`)
        : null,
      el('button.btn.primary.wide', {
        type: 'button', text: 'Record it', style: { marginTop: '14px' },
        onclick: async () => {
          await store.commit((s) => {
            s.allocations ??= [];
            s.allocations.push({
              id: store.uid('a'), date: today(), amount: v,
              toSpending: a.toSpending, toDebt: a.toDebt,
              debtId: a.target?.id ?? null,
            });
            if (a.toDebt > 0 && a.target) {
              const d = s.debts.find((x) => x.id === a.target.id);
              if (d) { d.balance = Math.max(0, d.balance - a.toDebt); d.asOf = today(); }
            }
          });
        },
      }),
    );
  };

  amount.addEventListener('input', paint);

  card.append(
    el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '4px' } }, '💵 I have money to put somewhere'),
    el('p.tiny', { style: { margin: '0 0 12px' } }, 'Type what you have. Spending budget fills first, then the rest goes at the highest rate.'),
    amount, out,
  );
  paint();

  const recent = (state.allocations ?? []).slice(-3).reverse();
  if (recent.length) {
    card.append(el('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--line)' } },
      el('div.tiny', { style: { marginBottom: '6px' } }, 'Recent'),
      ...recent.map((r) => el('div.tiny', { style: { padding: '3px 0' } },
        `${longDate(r.date)} — ${money(r.amount)}: ${money(r.toSpending)} spending, ${money(r.toDebt)} debt`))));
  }

  return card;
}

const row = (emoji, name, value, note) => el('div', {
  style: { display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 0', borderTop: '1px solid var(--line)' },
},
  el('span', { style: { fontSize: '19px' } }, emoji),
  el('div', { style: { flex: '1', minWidth: '0' } },
    el('div', { style: { fontSize: '14px', fontWeight: '600' }, text: name }),
    el('div.tiny', { text: note })),
  el('div.num', { style: { fontWeight: '680', fontSize: '17px' }, class: value > 0 ? 'pos' : 'mut', text: money(value) }),
);

// ---- Pieces ----------------------------------------------------------------

function planSummary(state, strategy, extra) {
  const totals = debtTotals(state);
  const now = simulate(state, strategy, extra);
  const base = simulate(state, strategy, 0);

  if (now.impossible) {
    return el('div.qbox', { style: { marginTop: '14px' } },
      el('b', { text: 'Minimums are not enough. ' }),
      `At ${money(totals.minimums + extra)} a month the interest outruns the payments and the balances never clear. Raise the extra payment until this message goes away — that is your true floor.`);
  }

  const savedMonths = base.impossible ? null : base.months - now.months;
  const savedInterest = base.impossible ? null : base.totalInterest - now.totalInterest;

  return el('div', { style: { marginTop: '14px' } },
    el('div.stats.three', {},
      stat('Debt free', addMonths(now.months), `${now.months} months`, 'pos'),
      stat('Interest paid', money(now.totalInterest), 'over the whole run', 'neg'),
      stat('Total out', money(now.debts.reduce((s, d) => s + d.paid, 0)), 'principal + interest', ''),
    ),
    savedMonths !== null && extra > 0
      ? el('p.tiny', { style: { margin: '10px 0 0' } },
          `That extra ${money(extra)} a month pulls the finish line in by ${savedMonths} months and saves ${money(savedInterest)} in interest — a return of about ${pct((savedInterest / (extra * now.months)) * 100)} on the money.`)
      : null,
  );
}

function orderList(state, strategy, extra) {
  const sim = simulate(state, strategy, extra);
  const card = el('div.card.flush');
  const live = order(state, strategy);

  if (!live.length) return el('div.card', {}, el('div.empty', { text: 'No balances entered yet.' }));

  live.forEach((d, i) => {
    const s = sim.debts.find((x) => x.id === d.id);
    const target = i === 0;
    const util = d.limit > 0 ? d.balance / d.limit : null;
    const acct = state.accounts.find((a) => a.id === d.payFrom);

    const flags = el('span', { style: { display: 'contents' } });
    if (d.confidence === 'unsure') flags.append(el('span.flag.ask', { text: 'ASK' }));
    else if (d.confidence === 'likely') flags.append(el('span.flag.guess', { text: 'GUESS' }));

    card.append(el('button.row', {
      type: 'button',
      style: target ? { background: 'rgba(47,191,120,.07)' } : {},
      onclick: () => editDebt(state, d),
    },
      el('div.day', {
        text: String(i + 1),
        style: target ? { background: 'var(--josh)', color: '#08131f' } : {},
      }),
      el('div.mid', {},
        el('div.nm', {}, el('span.t', { text: d.name }), flags,
          target ? el('span.flag', { text: 'TARGET', style: { background: 'rgba(47,191,120,.18)', color: 'var(--josh)' } }) : null),
        el('div.meta', {
          text: [
            pct(d.apr, 2),
            `min ${money(d.minimum)}`,
            acct ? `${acct.owner}'s account` : null,
            d.dueDay ? `due ${ord(d.dueDay)}` : null,
          ].filter(Boolean).join(' · '),
        }),
        util !== null ? el('div', { style: { marginTop: '7px' } },
          bar(util, util > 0.7 ? 'var(--red)' : util > 0.3 ? 'var(--gold)' : 'var(--josh)')) : null,
        util !== null ? el('div.tiny', { style: { marginTop: '4px' } },
          `${pct(util * 100)} of ${money(d.limit)} limit used${util > 0.3 ? ' — above 30% this is dragging your score' : ''}`) : null,
      ),
      el('div', { style: { textAlign: 'right', flex: '0 0 auto' } },
        el('div.amt', { text: money(d.balance) }),
        s?.clearedMonth ? el('div.tiny', { text: `gone ${addMonths(s.clearedMonth)}` }) : null,
      ),
    ));

    if (d.question) card.append(el('div.qbox', {}, d.question));
    if (d.note) card.append(el('div', { style: { padding: '0 16px 12px', marginTop: '-4px' } }, el('div.tiny', { text: d.note })));
  });

  return card;
}

// The business is the lever now, so state the ask in the business's own terms:
// a monthly number it has to clear, after tax, to hit each finish line.
function targets(state, strategy, h) {
  const rows = payoffTargets(state, strategy);
  const slack = Math.max(0, h.left);
  const base = simulate(state, strategy, 0);

  const tbl = el('table.tbl', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Debt free in' }),
      el('th.r', { text: 'Extra / mo' }),
      el('th.r', { text: 'From TMB' }),
      el('th.r', { text: 'Interest' }))),
    el('tbody', {}, rows.map((r) => {
      const fromBiz = Math.max(0, (r.extra ?? 0) - slack);
      return el('tr', {},
        el('td', {}, `${r.years} years`),
        el('td.r', { text: r.extra === null ? '—' : money(r.extra) }),
        el('td.r', { class: fromBiz > 0 ? 'warn' : 'pos', text: r.extra === null ? '—' : money(fromBiz) }),
        el('td.r.tiny', { text: r.interest === null ? '—' : money(r.interest) }));
    })),
  );

  const five = rows.find((r) => r.years === 5);
  return el('div', {},
    el('div.card.flush', {}, tbl),
    el('p', { style: { margin: '10px 2px 0', fontSize: '14px', lineHeight: '1.5' } },
      `"Extra" is on top of every minimum. "From TMB" is what is left once the ${money(slack)} of household slack is already applied — that is the number the business actually has to clear, after tax and after Cole.`),
    !base.impossible
      ? el('p', { style: { margin: '10px 2px 0', fontSize: '14px', lineHeight: '1.5' } },
          `Doing nothing extra takes ${Math.round(base.months / 12)} years and ${money(base.totalInterest)} in interest. ${five && five.extra !== null ? `Getting to five years costs ${money(five.extra)} a month and saves ${money(base.totalInterest - five.interest)} of it.` : ''} Every month you delay, ${money(debtTotals(state).monthlyInterest)} goes to lenders instead of to you.`)
      : null,
    el('p.tiny', { style: { margin: '10px 2px 0' } },
      'Set the slider above to the number you commit to. A figure the business can hold every month beats a bigger one it can only manage twice.'),
  );
}

function comparison(state, extra) {
  const c = compare(state, extra);
  const rows = [
    ['Minimums only', c.minimumsOnly],
    ['Avalanche', c.avalanche],
    ['Snowball', c.snowball],
  ];
  const best = c.avalanche.totalInterest <= c.snowball.totalInterest ? 'Avalanche' : 'Snowball';

  const tbl = el('table.tbl', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Plan' }), el('th.r', { text: 'Months' }), el('th.r', { text: 'Interest' }), el('th.r', { text: 'First win' }))),
    el('tbody', {}, rows.map(([label, sim]) => {
      const first = [...sim.debts].filter((d) => d.clearedMonth).sort((a, b) => a.clearedMonth - b.clearedMonth)[0];
      return el('tr', {},
        el('td', {}, label === best ? el('b', { text: label }) : label),
        el('td.r', { text: sim.impossible ? 'never' : String(sim.months) }),
        el('td.r', { text: sim.impossible ? '—' : money(sim.totalInterest) }),
        el('td.r.tiny', { text: first ? `${first.name.split(' ').slice(0, 2).join(' ')} · ${addMonths(first.clearedMonth)}` : '—' }));
    })),
  );

  const diff = Math.abs(c.avalanche.totalInterest - c.snowball.totalInterest);
  return el('div', {},
    el('div.card.flush', {}, tbl),
    el('p.tiny', { style: { margin: '8px 2px 0' } },
      c.avalanche.impossible || c.snowball.impossible
        ? 'One of these never finishes at the current payment — raise the extra payment above.'
        : diff < 50
          ? `The two plans land within ${money(diff)} of each other. Pick whichever you will actually stick to.`
          : `Avalanche saves ${money(diff)} in interest. Snowball clears its first account sooner, which is worth something if momentum is what keeps you going.`),
  );
}

function rationale(state, strategy, extra) {
  const live = order(state, strategy);
  const lines = [];
  if (!live.length) return el('p', { text: 'Add balances to see the reasoning.' });

  const first = live[0];
  const highest = [...live].sort((a, b) => b.apr - a.apr)[0];
  const smallest = [...live].sort((a, b) => a.balance - b.balance)[0];

  if (highest.id === smallest.id) {
    lines.push(`${first.name} is both the highest rate (${pct(first.apr, 2)}) and the smallest balance (${money(first.balance)}). Avalanche and snowball point at the same account, so there is nothing to argue about — it goes first.`);
  } else {
    lines.push(strategy === 'avalanche'
      ? `${first.name} carries the highest rate at ${pct(first.apr, 2)}, so every extra dollar there kills the most interest.`
      : `${first.name} has the smallest balance at ${money(first.balance)}, so it clears soonest and its ${money(first.minimum)} minimum rolls into the next target.`);
  }

  const cheap = [...live].sort((a, b) => a.apr - b.apr)[0];
  if (cheap.apr > 0 && cheap.apr < 8) {
    lines.push(`${cheap.name} sits at ${pct(cheap.apr, 2)} — cheap money. Pay it exactly on schedule and nothing more until the cards are gone.`);
  }

  const cards = live.filter((d) => d.limit > 0);
  const overUtil = cards.filter((d) => d.balance / d.limit > 0.3);
  if (overUtil.length) {
    lines.push(`${overUtil.length === cards.length ? 'Every card' : `${overUtil.length} of ${cards.length} cards`} is above 30% utilization. Clearing the smallest one first drops your reported utilization fastest, which usually shows up in your score within a cycle or two.`);
  }

  const autopayMins = state.debts.filter((d) => d.autopay && d.minimum > 0 && d.balance > 0);
  if (autopayMins.length) {
    lines.push(`All of these are on autopay at the minimum. Leave the autopay alone as your safety net, and make the extra payment as a separate manual payment on ${first.name} — that way a tight month never turns into a missed payment.`);
  }

  if (extra === 0) {
    lines.push('Right now the extra payment is set to zero, so this is just the minimums. Drag the dial above to whatever you can genuinely hold every month — a number you keep beats a bigger number you abandon.');
  }

  return el('div', {}, lines.map((t, i) =>
    el('p', { text: t, style: { margin: i ? '10px 0 0' : '0', fontSize: '14px', lineHeight: '1.5' } })));
}

// ---- Editor ----------------------------------------------------------------

function editDebt(state, d) {
  const isNew = !d;
  const draft = d ?? {
    id: store.uid('d'), name: '', mask: '', type: 'Credit card', balance: 0, limit: 0,
    apr: 0, minimum: 0, payFrom: state.accounts[0]?.id, autopay: false, dueDay: 1, confidence: 'confirmed',
  };

  sheet(isNew ? 'Add a debt' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'Lender / card' });
    const balance = input({ type: 'number', step: '0.01', value: draft.balance || '', inputmode: 'decimal' });
    const apr = input({ type: 'number', step: '0.01', value: draft.apr || '', inputmode: 'decimal' });
    const minimum = input({ type: 'number', step: '0.01', value: draft.minimum || '', inputmode: 'decimal' });
    const limit = input({ type: 'number', step: '1', value: draft.limit || '', inputmode: 'decimal' });
    const dueDay = input({ type: 'number', min: '1', max: '31', value: draft.dueDay ?? 1, inputmode: 'numeric' });
    const type = select(TYPES, draft.type);
    const payFrom = select(state.accounts.map((a) => [a.id, `${a.owner} — ${a.bank}`]), draft.payFrom);

    const body = el('div');
    if (draft.question) body.append(el('div.qbox', { style: { margin: '0 0 14px' } }, draft.question));
    if (draft.note) body.append(el('p.tiny', { style: { margin: '0 0 14px' }, text: draft.note }));

    body.append(
      field('Name', name),
      el('div.f2', {}, field('Balance', balance), field('APR %', apr)),
      el('div.f2', {}, field('Minimum payment', minimum), field('Credit limit', limit)),
      el('div.f2', {}, field('Type', type), field('Due day', dueDay)),
      field('Paid from', payFrom),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            balance: Number(balance.value) || 0,
            apr: Number(apr.value) || 0,
            minimum: Number(minimum.value) || 0,
            limit: Number(limit.value) || 0,
            dueDay: Math.min(31, Math.max(1, Number(dueDay.value) || 1)),
            type: type.value,
            payFrom: payFrom.value,
            confidence: 'confirmed',
            question: undefined,
          };
          await store.commit((s) => {
            const t = s.debts.find((x) => x.id === draft.id);
            if (t) Object.assign(t, patch);
            else s.debts.push({ ...draft, ...patch });
          });
          close();
        },
      }),
      !isNew && el('button.btn.wide.ghost', {
        type: 'button', text: 'Delete', style: { marginTop: '8px', color: 'var(--red)' },
        onclick: async () => {
          if (!confirm(`Delete ${draft.name}?`)) return;
          await store.commit((s) => { s.debts = s.debts.filter((x) => x.id !== draft.id); });
          close();
        },
      }),
    );

    return body;
  });
}
