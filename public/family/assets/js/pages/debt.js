// Debt — the order to kill them in, and a way to record a payment.
//
// No extra-payment dial and no trajectory. What you can put toward this varies
// month to month, so a projection built on a number you have not committed to
// is a guess dressed as a plan. The order is the durable part: highest rate
// first, work down. Everything here is the balances as they stand today.

import * as store from '../store.js';
import { el, money, pct, stat, section, sheet, field, input, select, longDate, today, bar } from '../ui.js';
import { debtTotals, attackable, order, allDebts } from '../calc.js';

const TYPES = ['Credit card', 'Installment loan', 'Auto loan', 'Student loan', 'Mortgage', 'Other'];

export default function debt(state) {
  const wrap = el('div');
  const totals = debtTotals(state);

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'What you owe' }),
    el('div.big.neg', { text: money(totals.balance) }),
    el('div.note', { text: `${totals.count} accounts · ${pct(totals.weightedApr, 1)} average · mortgage aside` }),
  ));

  wrap.append(el('div.stats', {},
    stat('Interest / mo', money(totals.monthlyInterest), 'just to stand still', 'neg'),
    stat('Minimums', money(totals.minimums), 'already in your bills', ''),
  ));

  // ---- The order -----------------------------------------------------------

  wrap.append(section('Pay in this order', 'highest rate first'));

  const list = order(state, 'avalanche');
  const card = el('div.card.flush');
  if (!list.length) card.append(el('div.empty', { text: 'Nothing here yet.' }));

  for (const [i, d] of list.entries()) {
    const first = i === 0;
    const util = d.limit > 0 ? d.balance / d.limit : null;

    card.append(el('div.row', { style: first ? { background: 'rgba(47,191,120,.07)' } : {} },
      el('button.rowtap', { type: 'button', onclick: () => editDebt(state, d) },
        el('div.day', {
          text: String(i + 1),
          style: first ? { background: 'var(--josh)', color: '#08131f' } : {},
        }),
        el('div.mid', {},
          el('div.nm', {}, el('span.t', { text: d.name }),
            first ? el('span.flag', { text: 'THIS ONE', style: { background: 'rgba(47,191,120,.18)', color: 'var(--josh)' } }) : null),
          el('div.meta', { text: `${pct(d.apr, 2)} · min ${money(d.minimum)} · ${money((d.balance * (d.apr / 100)) / 12, true)} interest this month` }),
          util !== null ? el('div', { style: { marginTop: '7px' } },
            bar(util, util > 0.7 ? 'var(--red)' : util > 0.3 ? 'var(--gold)' : 'var(--josh)')) : null,
          util !== null ? el('div.tiny', { style: { marginTop: '4px' } },
            `${pct(util * 100)} of ${money(d.limit)} used`) : null,
        ),
        el('div', { style: { textAlign: 'right', flex: '0 0 auto' } },
          el('div.amt', { text: money(d.balance) }),
          d.asOf ? el('div.tiny', { text: longDate(d.asOf) }) : null,
        ),
      ),
      el('button.paybtn', { type: 'button', text: 'Pay', onclick: () => payDebt(state, d) }),
    ));
  }
  wrap.append(card);

  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Add a debt', type: 'button', style: { marginTop: '10px' },
    onclick: () => editDebt(state, null),
  }));

  // ---- Payments you have recorded ------------------------------------------

  const paid = (state.payments ?? []).slice(-10).reverse();
  if (paid.length) {
    const thisMonth = (state.payments ?? [])
      .filter((p) => p.date.slice(0, 7) === today().slice(0, 7))
      .reduce((s, p) => s + p.amount, 0);

    wrap.append(section('Payments', thisMonth > 0 ? `${money(thisMonth)} this month` : null));
    const log = el('div.card.flush');
    for (const p of paid) {
      const d = allDebts(state).find((x) => x.id === p.debtId);
      log.append(el('div.row', {},
        el('div.mid', {},
          el('div.nm', {}, el('span.t', { text: d?.name ?? 'Debt' })),
          el('div.meta', { text: longDate(p.date) }),
        ),
        el('div.amt.pos', { text: money(p.amount, true) }),
      ));
    }
    wrap.append(log);
  }

  // ---- Anything with no numbers yet ----------------------------------------

  const missing = allDebts(state).filter((d) => !(d.balance > 0) && d.minimum > 0);
  if (missing.length) {
    wrap.append(el('div.qbox', { style: { margin: '18px 0 0' } },
      el('b', { text: 'No balance yet: ' }),
      `${missing.map((d) => d.name).join(', ')}. The payment is in your bills but there is no balance, so it sits outside the order.`));
  }

  return wrap;
}

// ---- Record a payment ------------------------------------------------------

function payDebt(state, d) {
  sheet(`Pay ${d.name}`, (close) => {
    const amount = el('input', {
      type: 'number', step: '0.01', inputmode: 'decimal', placeholder: '0.00',
      style: {
        width: '100%', padding: '14px 16px', fontSize: '26px', fontWeight: '680',
        textAlign: 'center', background: 'var(--bg-raise)',
        border: '1px solid var(--line)', borderRadius: '12px',
        fontVariantNumeric: 'tabular-nums',
      },
    });
    const date = input({ type: 'date', value: today() });
    const out = el('div.tiny', { style: { margin: '10px 0 0', textAlign: 'center' } });
    const save = el('button.btn.primary.wide', { type: 'button', text: 'Record payment', style: { marginTop: '14px' } });

    const paint = () => {
      const v = Number(amount.value) || 0;
      const after = Math.max(0, d.balance - v);
      out.replaceChildren(
        document.createTextNode(`${money(d.balance, true)} → `),
        el('b.pos', { text: money(after, true) }),
      );
      save.disabled = v <= 0;
    };
    amount.addEventListener('input', paint);
    paint();

    const chip = (label, value) => el('button.btn.sm.ghost', {
      type: 'button', text: label,
      onclick: () => { amount.value = String(Math.round(value * 100) / 100); paint(); },
    });

    save.addEventListener('click', async () => {
      const v = Number(amount.value) || 0;
      if (v <= 0) return;
      await store.commit((s) => {
        s.payments ??= [];
        s.payments.push({ id: store.uid('p'), date: date.value || today(), debtId: d.id, amount: v });
        const t = s.debts.find((x) => x.id === d.id);
        if (t) { t.balance = Math.max(0, t.balance - v); t.asOf = date.value || today(); }
      });
      close();
    });

    const mine = (state.payments ?? []).filter((x) => x.debtId === d.id).slice(-4).reverse();

    return el('div', {},
      el('p.tiny', { style: { margin: '0 0 12px' } },
        `${money(d.balance, true)} at ${pct(d.apr, 2)}${d.asOf ? `, as of ${longDate(d.asOf)}` : ''}.`),
      amount,
      el('div.btnrow', { style: { marginTop: '10px', justifyContent: 'center' } },
        chip(`Minimum ${money(d.minimum)}`, d.minimum),
        chip('Pay it off', d.balance),
      ),
      out,
      field('Date', date),
      save,
      mine.length
        ? el('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--line)' } },
            el('div.tiny', { style: { marginBottom: '6px' } }, 'Recorded on this one'),
            ...mine.map((r) => el('div.tiny', { style: { padding: '3px 0' } }, `${longDate(r.date)} — ${money(r.amount, true)}`)))
        : null,
    );
  });
}

// ---- Editor ----------------------------------------------------------------

function editDebt(state, d) {
  const isNew = !d;
  const draft = d ?? {
    id: store.uid('d'), name: '', type: 'Credit card', balance: 0,
    apr: 0, minimum: 0, limit: 0, asOf: today(),
  };

  sheet(isNew ? 'Add a debt' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'Who is it with?' });
    const type = select(TYPES, draft.type);
    const balance = input({ type: 'number', step: '0.01', value: draft.balance || '', inputmode: 'decimal' });
    const apr = input({ type: 'number', step: '0.01', value: draft.apr || '', inputmode: 'decimal' });
    const minimum = input({ type: 'number', step: '0.01', value: draft.minimum || '', inputmode: 'decimal' });
    const limit = input({ type: 'number', step: '1', value: draft.limit || '', inputmode: 'decimal' });
    const asOf = input({ type: 'date', value: draft.asOf ?? today() });

    return el('div', {},
      field('Name', name),
      field('Type', type),
      el('div.f2', {}, field('Balance', balance), field('Rate %', apr)),
      el('div.f2', {}, field('Minimum', minimum), field('Limit (cards)', limit)),
      field('As of', asOf),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save', style: { marginTop: '4px' },
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            type: type.value,
            balance: Number(balance.value) || 0,
            apr: Number(apr.value) || 0,
            minimum: Number(minimum.value) || 0,
            limit: Number(limit.value) || 0,
            asOf: asOf.value || today(),
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
  });
}
