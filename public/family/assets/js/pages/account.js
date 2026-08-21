// One account, at a glance.
//
// Three numbers at the top — what comes in, what goes out, what is left — and
// underneath them the lists those numbers are made of, each row tappable to
// fix. Everything else that used to live here has gone: this is a page you
// check and update, not one you study.

import * as store from '../store.js';
import {
  el, money, stat, section, sheet, field, input, select, longDate, shortDate, today, ord,
} from '../ui.js';
import { leftover, recurringFor, endedFor, forAccount, incomeDays, isBusiness } from '../calc.js';

const CATEGORIES = ['Housing', 'Debt', 'Insurance', 'Utilities', 'Kids', 'Transport', 'Subscriptions', 'Health', 'Business', 'Other'];

export default function account(state, id) {
  const wrap = el('div');
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return el('div.empty', { text: 'No such account.' });

  const sums = leftover(state, id);
  const out = sums.household + sums.business;

  // ---- The three numbers ---------------------------------------------------

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'Left each month' }),
    el('div.big', { text: money(sums.left), class: sums.left < 0 ? 'neg' : 'pos' }),
    el('div.note', { text: `${money(sums.income)} in · ${money(out)} out` }),
  ));

  wrap.append(el('div.stats', {},
    stat('Money in', money(sums.income), 'every month', 'pos'),
    stat('Bills out', money(out), `${recurringFor(state, id).length} charges`, 'neg'),
  ));

  // ---- Balance and the two buttons that change it --------------------------

  wrap.append(el('div.card', { style: { marginTop: '12px' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } },
      el('div', {},
        el('div.tiny', { text: 'In the account' }),
        el('div.num', { style: { fontSize: '26px', fontWeight: '680', letterSpacing: '-0.02em' }, text: money(a.balance ?? 0, true) }),
        el('div.tiny', { text: a.balanceAsOf ? `as of ${longDate(a.balanceAsOf)}` : 'never set' }),
      ),
      el('button.btn.sm.ghost', {
        type: 'button', text: 'Update', style: { marginLeft: 'auto' },
        onclick: () => balanceSheet(a),
      }),
    ),
    el('div.btnrow', { style: { marginTop: '14px' } },
      el('button.btn.sm.wide', { type: 'button', text: '− Expense', onclick: () => moveSheet(a, 'out') }),
      el('button.btn.sm.wide', { type: 'button', text: '+ Deposit', onclick: () => moveSheet(a, 'in') }),
    ),
  ));

  // ---- Money in ------------------------------------------------------------

  const incomes = forAccount(state.income, id);
  wrap.append(section('Money in', 'tap to edit'));
  const inCard = el('div.card.flush');
  if (!incomes.length) inCard.append(el('div.empty', { text: 'Nothing recorded yet.' }));
  for (const i of incomes) {
    const days = incomeDays(i);
    inCard.append(el('button.row', { type: 'button', onclick: () => incomeSheet(i, id) },
      el('div.day', { text: days.length ? String(days[0]) : '–' }),
      el('div.mid', {},
        el('div.nm', {}, el('span.t', { text: i.name }),
          i.excludeFromPlan ? el('span.flag.guess', { text: 'NOT COUNTED' }) : null),
        el('div.meta', {
          text: days.length ? days.map((d) => ord(d)).join(' & ') : 'no date set',
        }),
      ),
      el('div.amt.pos', { text: money(i.amount, true) }),
    ));
  }
  inCard.append(el('button.row', { type: 'button', onclick: () => incomeSheet(null, id) },
    el('div.day', { text: '+' }),
    el('div.mid', {}, el('div.nm', {}, el('span.t', { text: 'Add income' }))),
  ));
  wrap.append(inCard);

  // ---- Bills out -----------------------------------------------------------

  const bills = recurringFor(state, id);
  wrap.append(section('Bills out', `${money(out)} a month`));
  const outCard = el('div.card.flush');
  if (!bills.length) outCard.append(el('div.empty', { text: 'No bills on this account.' }));
  for (const r of bills) {
    outCard.append(el('button.row', { type: 'button', onclick: () => editRecurring(state, r, id) },
      el('div.day', { text: r.day ?? '–' }),
      el('div.mid', {},
        el('div.nm', {}, el('span.t', { text: r.name }),
          isBusiness(r) ? el('span.flag.biz', { text: 'BIZ' }) : null),
        el('div.meta', { text: r.day ? `${ord(r.day)} of the month` : 'no date set' }),
      ),
      el('div.amt', { text: money(r.amount, true) }),
    ));
  }
  outCard.append(el('button.row', { type: 'button', onclick: () => editRecurring(state, null, id) },
    el('div.day', { text: '+' }),
    el('div.mid', {}, el('div.nm', {}, el('span.t', { text: 'Add a bill' }))),
  ));
  wrap.append(outCard);

  // ---- What you have logged ------------------------------------------------

  const mine = (state.log ?? []).filter((l) => l.account === id).slice(-12).reverse();
  if (mine.length) {
    wrap.append(section('Recent', `${mine.length} logged`));
    const logCard = el('div.card.flush');
    for (const l of mine) {
      const isIn = l.kind === 'in';
      logCard.append(el('div.row', {},
        el('div.day', { text: shortDate(l.date).split(' ')[1] ?? '·' }),
        el('div.mid', {},
          el('div.nm', {}, el('span.t', { text: l.name })),
          el('div.meta', { text: `${shortDate(l.date)}${l.category ? ` · ${l.category}` : ''}` }),
        ),
        el('div.amt', { class: isIn ? 'pos' : '', text: `${isIn ? '+' : '−'}${money(l.amount, true)}` }),
      ));
    }
    wrap.append(logCard);
  }

  // ---- Stopped -------------------------------------------------------------

  const ended = endedFor(state, id);
  if (ended.length) {
    wrap.append(section('Stopped', `${ended.length}`));
    const card = el('div.card.flush');
    for (const r of ended) {
      card.append(el('button.row', { type: 'button', onclick: () => editRecurring(state, r, id) },
        el('div.day', { text: r.day ?? '–' }),
        el('div.mid', {}, el('div.nm', {}, el('span.t.strike', { text: r.name }))),
        el('div.amt.mut', { text: money(r.amount, true) }),
      ));
    }
    wrap.append(card);
  }

  return wrap;
}

// ---- Balance ---------------------------------------------------------------

function balanceSheet(a) {
  sheet(`${a.owner} · ${a.bank}`, (close) => {
    const amount = bigNumber(a.balance ?? 0);
    const date = input({ type: 'date', value: today() });
    return el('div', {},
      el('p.tiny', { style: { margin: '0 0 12px' } }, 'What the banking app says right now.'),
      amount,
      field('As of', date),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          await store.commit((s) => {
            const t = s.accounts.find((x) => x.id === a.id);
            if (t) { t.balance = Number(amount.value) || 0; t.balanceAsOf = date.value || today(); }
          });
          close();
        },
      }),
    );
  });
}

// An expense or a deposit. Both move the balance and land in the log — the
// difference is only the direction.
function moveSheet(a, dir) {
  const isIn = dir === 'in';
  sheet(isIn ? 'Add a deposit' : 'Add an expense', (close) => {
    const name = input({ placeholder: isIn ? 'Where from?' : 'What for?' });
    const amount = bigNumber('');
    const date = input({ type: 'date', value: today() });
    const cat = select(CATEGORIES, 'Other');
    const after = el('div.tiny', { style: { textAlign: 'center', margin: '10px 0 0' } });
    const save = el('button.btn.primary.wide', { type: 'button', text: 'Save', style: { marginTop: '14px' } });

    const paint = () => {
      const v = Number(amount.value) || 0;
      const next = (a.balance ?? 0) + (isIn ? v : -v);
      after.replaceChildren(
        document.createTextNode(`${money(a.balance ?? 0, true)} → `),
        el('b', { class: next < 0 ? 'neg' : 'pos', text: money(next, true) }),
      );
      save.disabled = v <= 0;
    };
    amount.addEventListener('input', paint);
    paint();

    save.addEventListener('click', async () => {
      const v = Number(amount.value) || 0;
      if (v <= 0) return;
      await store.commit((s) => {
        s.log ??= [];
        s.log.push({
          id: store.uid('l'), account: a.id, kind: isIn ? 'in' : 'out',
          name: name.value.trim() || (isIn ? 'Deposit' : 'Expense'),
          amount: v, date: date.value || today(),
          category: isIn ? undefined : cat.value,
        });
        const t = s.accounts.find((x) => x.id === a.id);
        if (t) {
          t.balance = (t.balance ?? 0) + (isIn ? v : -v);
          t.balanceAsOf = date.value || today();
        }
      });
      close();
    });

    return el('div', {},
      field(isIn ? 'From' : 'What', name),
      amount,
      after,
      el('div.f2', { style: { marginTop: '12px' } },
        field('Date', date),
        isIn ? null : field('Category', cat)),
      save,
    );
  });
}

// ---- Income ----------------------------------------------------------------

function incomeSheet(i, accountId) {
  const isNew = !i;
  const draft = i ?? { id: store.uid('i'), account: accountId, name: '', amount: 0, payDays: [], kind: 'wage' };

  sheet(isNew ? 'Add income' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'Name' });
    const amount = input({ type: 'number', step: '0.01', value: draft.amount || '', inputmode: 'decimal' });
    const days = input({ value: incomeDays(draft).join(', '), placeholder: 'e.g. 14, 30', inputmode: 'numeric' });
    const kind = select([['wage', 'Paycheck'], ['credit', 'Credit or reimbursement']], draft.kind ?? 'wage');

    return el('div', {},
      el('p.tiny', { style: { margin: '0 0 12px' } },
        'Take-home, after tax and deductions — the figure that actually lands in the account. Change it here whenever your withholdings change.'),
      field('Name', name),
      el('div.f2', {}, field('Amount each time', amount), field('Days of the month', days)),
      field('Type', kind),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const parsed = days.value.split(/[,\s]+/).map(Number)
            .filter((n) => n >= 1 && n <= 31);
          const each = Number(amount.value) || 0;
          const patch = {
            name: name.value.trim() || draft.name,
            amount: each,
            payDays: parsed,
            kind: kind.value,
            // What the account sees in a month: the same figure once per payday.
            monthly: each * Math.max(1, parsed.length),
          };
          await store.commit((s) => {
            const t = s.income.find((x) => x.id === draft.id);
            if (t) Object.assign(t, patch);
            else s.income.push({ ...draft, ...patch });
          });
          close();
        },
      }),
      !isNew && el('button.btn.wide.ghost', {
        type: 'button', text: 'Delete', style: { marginTop: '8px', color: 'var(--red)' },
        onclick: async () => {
          if (!confirm(`Delete ${draft.name}?`)) return;
          await store.commit((s) => { s.income = s.income.filter((x) => x.id !== draft.id); });
          close();
        },
      }),
    );
  });
}

// ---- Bills -----------------------------------------------------------------

function editRecurring(state, r, accountId) {
  const isNew = !r;
  const draft = r ?? {
    id: store.uid('r'), account: accountId, name: '', amount: 0, day: 1,
    category: 'Other', confidence: 'confirmed',
  };

  sheet(isNew ? 'Add a bill' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'Name' });
    const amount = input({ type: 'number', step: '0.01', value: draft.amount, inputmode: 'decimal' });
    const day = input({ type: 'number', min: '1', max: '31', value: draft.day ?? 1, inputmode: 'numeric' });
    const cat = select(CATEGORIES, draft.category);

    const body = el('div');
    if (draft.observed?.length) {
      body.append(el('p.tiny', { style: { margin: '0 0 12px' } },
        'Seen: ' + draft.observed.map((o) => `${shortDate(o.date)} ${money(o.amount, true)}`).join(' · ')));
    }

    body.append(
      field('Name', name),
      el('div.f2', {}, field('Amount', amount), field('Day of month', day)),
      field('Category', cat),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            amount: Number(amount.value) || 0,
            day: Math.min(31, Math.max(1, Number(day.value) || 1)),
            category: cat.value,
            answered: true,
            confidence: 'confirmed',
            question: undefined,
          };
          await store.commit((s) => {
            const t = s.recurring.find((x) => x.id === draft.id);
            if (t) Object.assign(t, patch);
            else s.recurring.push({ ...draft, ...patch });
          });
          close();
        },
      }),
    );

    if (!isNew) {
      body.append(el('div.btnrow', { style: { marginTop: '8px' } },
        el('button.btn.sm.ghost', {
          type: 'button', text: draft.paused ? 'Resume' : 'Stop this bill',
          onclick: async () => {
            await store.commit((s) => {
              const t = s.recurring.find((x) => x.id === draft.id);
              if (t) t.paused = !t.paused;
            });
            close();
          },
        }),
        el('button.btn.sm.ghost', {
          type: 'button', text: 'Delete', style: { color: 'var(--red)' },
          onclick: async () => {
            if (!confirm(`Delete ${draft.name}?`)) return;
            await store.commit((s) => { s.recurring = s.recurring.filter((x) => x.id !== draft.id); });
            close();
          },
        }),
      ));
    }

    return body;
  });
}

// A centred amount field, big enough to read and to hit.
function bigNumber(value) {
  return el('input', {
    type: 'number', step: '0.01', inputmode: 'decimal', placeholder: '0.00',
    value: value === '' ? '' : String(value),
    style: {
      width: '100%', padding: '13px 16px', fontSize: '26px', fontWeight: '680',
      textAlign: 'center', background: 'var(--bg-raise)',
      border: '1px solid var(--line)', borderRadius: '12px',
      fontVariantNumeric: 'tabular-nums', marginTop: '10px',
    },
  });
}
