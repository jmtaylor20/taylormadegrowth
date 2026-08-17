// Scenarios — the business draw as the one variable.
//
// Everything else in the app describes the situation as it stands. This page
// is for asking "what if": move the draw, move the split between everyday
// spending and debt, and watch the finish line move with it.

import * as store from '../store.js';
import { el, money, pct, stat, section, sheet, field, input, bar } from '../ui.js';
import { scenario, household, addMonths, amortizing, freedPayments } from '../calc.js';

const DRAW_MAX = 12000;
const SPEND_MAX = 4000;

export default function scenarios(state) {
  const wrap = el('div');
  const h = household(state);
  const saved = state.settings.scenario ?? {};

  let draw = saved.draw ?? 4500;
  let spending = saved.spending ?? (state.settings.monthlySpending ?? 1000);
  let includeAll = saved.includeAll ?? false;

  const hero = el('div.card.hero');
  const stats = el('div.stats');
  const split = el('div.card');
  const timeline = el('div');
  const table = el('div');

  const persist = () => store.commit((s) => {
    s.settings.scenario = { draw, spending, includeAll };
  });

  const drawSlider = el('input.slider', { type: 'range', min: '0', max: String(DRAW_MAX), step: '250', value: String(draw) });
  const spendSlider = el('input.slider', { type: 'range', min: '0', max: String(SPEND_MAX), step: '100', value: String(spending) });
  const drawOut = el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } });
  const spendOut = el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } });

  const scopeSeg = el('div.seg', { style: { marginTop: '4px' } });
  for (const [k, label] of [[false, 'Everything but the house'], [true, 'Include the mortgage']]) {
    const b = el('button', { type: 'button', text: label });
    b.dataset.k = String(k);
    b.addEventListener('click', () => { includeAll = k; persist(); paint(); });
    scopeSeg.append(b);
  }

  function paint() {
    const r = scenario(state, { draw, spending, includeAll });
    const sim = r.sim;

    drawOut.replaceChildren(
      el('div', { style: { fontSize: '28px', fontWeight: '680', letterSpacing: '-0.02em' }, class: 'num', text: money(draw) }),
      el('div.tiny', { text: 'drawn from TaylorMade each month' }),
    );
    spendOut.replaceChildren(
      el('div', { style: { fontSize: '28px', fontWeight: '680', letterSpacing: '-0.02em' }, class: 'num', text: money(r.toSpending) }),
      el('div.tiny', { text: 'of it to everyday spending' }),
    );
    [...scopeSeg.children].forEach((c) => c.classList.toggle('on', c.dataset.k === String(includeAll)));

    // ---- Headline ----------------------------------------------------------
    hero.replaceChildren(
      el('div.label', { text: includeAll ? 'Everything paid off' : 'Debt free, house aside' }),
      el('div.big', {
        text: sim.impossible ? 'never' : addMonths(sim.months),
        class: sim.impossible ? 'neg' : 'pos',
      }),
      el('div.note', {
        text: sim.impossible
          ? 'The payments do not cover the interest at this level.'
          : `${sim.months} months · ${money(sim.totalInterest)} of interest along the way`,
      }),
    );

    stats.replaceChildren(
      stat('To debt each month', money(r.extra), 'on top of minimums', r.extra > 0 ? 'pos' : 'mut'),
      stat('Every debt payment', money(r.totalMonthly), 'minimums plus extra', ''),
      stat('Sooner by', r.monthsSaved === null ? '—' : `${r.monthsSaved} mo`, 'vs minimums alone', 'pos'),
      stat('Interest saved', r.interestSaved === null ? '—' : money(r.interestSaved), 'vs minimums alone', 'pos'),
    );

    // ---- Where the money comes from ---------------------------------------
    split.replaceChildren(
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '10px' } }, 'Where the attack money comes from'),
      el('div.split', {}, [
        { v: r.fromSlack, c: 'var(--blue)' },
        { v: r.fromDraw, c: 'var(--josh)' },
      ].filter((x) => x.v > 0).map((x) =>
        el('i', { style: { width: `${(x.v / (r.extra || 1)) * 100}%`, background: x.c } }))),
      el('div.legend', {},
        el('div', {}, el('i', { style: { background: 'var(--blue)' } }), 'Left after bills ', el('b', { text: money(r.fromSlack) })),
        el('div', {}, el('i', { style: { background: 'var(--josh)' } }), 'From the draw ', el('b', { text: money(r.fromDraw) })),
      ),
      el('p.tiny', { style: { margin: '12px 0 0' } },
        `${money(h.left)} is what the paychecks leave after every recurring bill. Everyday spending comes out of the draw, not the bank accounts, so that money is free to attack debt.`),
      r.toSpending < spending
        ? el('p.tiny', { style: { margin: '8px 0 0' }, class: 'tiny warn' },
            `The draw is smaller than the ${money(spending)} you want for spending, so all of it goes there and nothing reaches the debt.`)
        : null,
      ...r.steps.map((x) => el('p.tiny', { style: { margin: '8px 0 0' }, class: 'tiny pos' },
        `+ ${money(x.amount)} a month from month ${x.fromMonth}, when the ${x.name.toLowerCase()} ends — assumed not to be replaced.`)),
    );

    // ---- Order things clear ------------------------------------------------
    const card = el('div.card.flush');
    const cleared = sim.debts.filter((d) => d.clearedMonth).sort((a, b) => a.clearedMonth - b.clearedMonth);
    if (!cleared.length) {
      card.append(el('div.empty', { text: 'Nothing clears at this level. Raise the draw.' }));
    }
    for (const [i, d] of cleared.entries()) {
      card.append(el('div.row', {},
        el('div.day', { text: String(i + 1) }),
        el('div.mid', {},
          el('div.nm', {}, el('span.t', { text: d.name })),
          el('div.meta', { text: `${pct(d.apr, 2)} · ${d.interest > 0 ? `${money(d.interest)} interest paid` : 'no interest'}` })),
        el('div', { style: { textAlign: 'right' } },
          el('div.amt.pos', { text: addMonths(d.clearedMonth) }),
          el('div.tiny', { text: `month ${d.clearedMonth}` })),
      ));
    }
    const stillOwing = sim.debts.filter((d) => !d.clearedMonth);
    for (const d of stillOwing) {
      card.append(el('div.row', {},
        el('div.day', { text: '—', style: { color: 'var(--red)' } }),
        el('div.mid', {},
          el('div.nm', {}, el('span.t', { text: d.name })),
          el('div.meta', { text: 'still owing at the end of the projection' })),
        el('div.amt.neg', { text: money(d.balance) }),
      ));
    }
    timeline.replaceChildren(section('Order they clear'), card);

    // ---- Draw levels side by side -----------------------------------------
    const levels = [0, 2000, 3500, 5000, 6500, 8000];
    const rows = levels.map((d) => {
      const x = scenario(state, { draw: d, spending, includeAll });
      return { draw: d, x };
    });
    table.replaceChildren(
      section('At other draw levels', `${money(spending)} to spending`),
      el('div.card.flush', {}, el('table.tbl', {},
        el('thead', {}, el('tr', {},
          el('th', { text: 'Draw' }), el('th.r', { text: 'To debt' }),
          el('th.r', { text: 'Free by' }), el('th.r', { text: 'Interest' }))),
        el('tbody', {}, rows.map(({ draw: d, x }) => el('tr', {
          style: d === Math.round(draw / 250) * 250 ? { background: 'var(--bg-raise)' } : {},
        },
          el('td', {}, money(d)),
          el('td.r', { text: money(x.extra) }),
          el('td.r', { text: x.sim.impossible ? 'never' : addMonths(x.sim.months) }),
          el('td.r.tiny', { text: x.sim.impossible ? '—' : money(x.sim.totalInterest) }),
        ))),
      )),
    );
  }

  drawSlider.addEventListener('input', () => { draw = Number(drawSlider.value); paint(); });
  drawSlider.addEventListener('change', persist);
  spendSlider.addEventListener('input', () => { spending = Number(spendSlider.value); paint(); });
  spendSlider.addEventListener('change', persist);

  wrap.append(
    hero,
    stats,
    section('The draw', 'the one variable'),
    el('div.card', {}, drawOut, drawSlider, spendOut, spendSlider, scopeSeg),
    split,
    timeline,
    table,
    section('What this assumes'),
    assumptions(state, includeAll),
  );

  paint();
  return wrap;
}

function assumptions(state, includeAll) {
  const est = state.debts.filter((d) => d.balance > 0 && d.confidence === 'likely');
  const missing = state.debts.filter((d) => d.balance <= 0 && d.minimum > 0 && !d.paidOff);
  const mortgage = state.debts.find((d) => d.escrow > 0);

  return el('div.card', {},
    el('p', { style: { margin: '0 0 10px', fontSize: '14px', lineHeight: '1.5' } },
      'The draw is treated as money already clear of tax. Interest accrues monthly on the running balance, every debt keeps its minimum, the target takes the rest, and a cleared debt’s payment rolls into the next one.'),
    mortgage && includeAll
      ? el('p', { style: { margin: '0 0 10px', fontSize: '14px', lineHeight: '1.5' } },
          `Only ${money(amortizing(mortgage))} of the ${money(mortgage.minimum)} mortgage payment pays the house down — the other ${money(mortgage.escrow)} is escrow for taxes and insurance. That part carries on after the loan clears, so "paid off" does not mean no housing payment.`)
      : null,
    est.length
      ? el('div.qbox', { style: { margin: '10px 0 0' } },
          el('b', { text: 'Estimates: ' }),
          est.map((d) => `${d.name} at ${money(d.balance)} / ${pct(d.apr, 2)}`).join(', ')
          + '. Swap in real figures and every number here moves.')
      : null,
    missing.length
      ? el('div.qbox', { style: { margin: '10px 0 0' } },
          el('b', { text: 'Not in the model: ' }),
          missing.map((d) => d.name).join(', ')
          + ` — the payments are in your bills but there is no balance or rate, so they never clear here. Their ${money(missing.reduce((s, d) => s + d.minimum, 0))} a month keeps going out either way.`)
      : null,
  );
}
