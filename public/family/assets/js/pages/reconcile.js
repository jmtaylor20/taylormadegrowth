// Reconcile — the loop that keeps everything else honest.
//
// The app knows every bill and both paychecks, so it can say what each account
// ought to read today. The only thing it cannot know is what the bank actually
// says. So that is all it asks for: two numbers, once a week.
//
// The gap is the useful part. A positive gap is nearly always a bill that has
// not cleared; a negative one is usually a bill that cost more than the figure
// on file. Naming which leaves the model truer than it found it, so the next
// prediction is closer — that is the whole point of doing this weekly rather
// than re-typing everything monthly.

import * as store from '../store.js';
import { el, fill, money, sheet, field, input, longDate, shortDate, today } from '../ui.js';
import { expectedBalance, explainGap, reconcileAccuracy } from '../calc.js';

// ---- The card on Home ------------------------------------------------------

export function reconcileCard(state) {
  const acc = reconcileAccuracy(state);
  const stale = !acc || acc.daysSince >= 7;

  const card = el('div.card');
  card.append(el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '4px' } },
    '🔍 Reconcile the accounts'));

  const rows = el('div', { style: { margin: '12px 0 4px' } });
  for (const a of state.accounts) {
    const exp = expectedBalance(state, a.id);
    rows.append(el('div', {
      style: {
        display: 'flex', alignItems: 'baseline', gap: '8px',
        padding: '7px 0', borderBottom: '1px solid var(--line)',
      },
    },
      el('span', { style: { fontSize: '14px', fontWeight: '550' }, text: a.owner }),
      el('span.tiny', { text: exp.days ? `${exp.days} day${exp.days === 1 ? '' : 's'} on` : 'confirmed today' }),
      el('span.num', {
        style: { marginLeft: 'auto', fontWeight: '650', fontSize: '16px' },
        class: exp.balance < 0 ? 'neg' : '',
        text: money(exp.balance),
      }),
    ));
  }
  card.append(rows);

  card.append(el('p.tiny', { style: { margin: '10px 0 0' } },
    acc
      ? `Last checked ${longDate(acc.last.date)}. Over the last ${Math.min(acc.count, 6)} check${Math.min(acc.count, 6) === 1 ? '' : 's'} the forecast has been out by ${money(acc.averageMiss)} on average.`
      : 'These are forecasts, walked forward from the last balances you confirmed. Check them against the banking app and the difference will tell you which bill moved.'));

  card.append(el('button.btn.wide' + (stale ? '.primary' : ''), {
    type: 'button', text: stale ? 'Check the balances' : 'Check again',
    style: { marginTop: '12px' },
    onclick: () => reconcileSheet(state),
  }));

  return card;
}

// ---- The flow --------------------------------------------------------------

export function reconcileSheet(state) {
  sheet('Reconcile', (close) => {
    const on = input({ type: 'date', value: today() });
    const wrap = el('div');
    const panes = new Map();

    // One pane per account: expected, an input for the actual, and whatever the
    // difference turns out to mean.
    for (const a of state.accounts) {
      const pane = accountPane(state, a, on);
      panes.set(a.id, pane);
      wrap.append(pane.node);
    }

    const save = el('button.btn.primary.wide', { type: 'button', text: 'Save', style: { marginTop: '16px' } });
    const note = el('div.tiny', { style: { margin: '10px 0 0', textAlign: 'center' } });

    const refresh = () => {
      const touched = [...panes.values()].filter((p) => p.hasValue());
      save.disabled = touched.length === 0;
      note.textContent = touched.length
        ? `${touched.length} of ${panes.size} filled in — the rest keep their current figures.`
        : 'Type at least one balance to save.';
    };
    for (const p of panes.values()) p.onChange(refresh);
    on.addEventListener('change', () => { for (const p of panes.values()) p.reprice(on.value); refresh(); });
    refresh();

    save.addEventListener('click', async () => {
      const date = on.value || today();
      const entries = [...panes.values()].filter((p) => p.hasValue()).map((p) => p.result());
      await store.commit((s) => {
        s.reconciliations ??= [];
        s.pending ??= [];

        for (const e of entries) {
          const account = s.accounts.find((x) => x.id === e.accountId);
          if (!account) continue;
          account.balance = e.actual;
          account.balanceAsOf = date;

          // Anything previously outstanding on this account is settled one way
          // or another: the balance just typed already reflects reality.
          s.pending = s.pending.filter((p) => p.account !== e.accountId || p.on > date);

          const pick = e.choice;
          if (pick?.type === 'late') {
            // Still to come, and its day of the month has gone by — so carry it
            // forward explicitly or the next forecast will be too optimistic.
            for (const ev of pick.events) {
              s.pending.push({
                id: store.uid('pend'), account: e.accountId, billId: ev.id,
                name: ev.name, amount: ev.amount, on: date,
              });
            }
          } else if (pick?.type === 'drift' && pick.billId) {
            const bill = s.recurring.find((r) => r.id === pick.billId);
            if (bill) {
              bill.observed = [...(bill.observed ?? []), { date, amount: bill.amount }];
              bill.amount = Math.round(pick.amount * 100) / 100;
              bill.confidence = 'confirmed';
            }
          }

          s.reconciliations.push({
            id: store.uid('rec'), date, account: e.accountId,
            expected: Math.round(e.expected * 100) / 100,
            actual: e.actual,
            gap: Math.round(e.gap * 100) / 100,
            resolved: pick ? pick.type : null,
          });
        }
      });
      close();
    });

    return el('div', {},
      el('p.tiny', { style: { margin: '0 0 14px' } },
        'Open the banking app and read the two balances. Everything else on this screen is worked out from bills already on file, so the difference is the only thing worth typing.'),
      field('As of', on),
      wrap,
      save,
      note,
    );
  });
}

// ---- One account -----------------------------------------------------------

function accountPane(state, account, dateInput) {
  const node = el('div', { style: { marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--line)' } });
  const amount = el('input', {
    type: 'number', step: '0.01', inputmode: 'decimal', placeholder: '0.00',
    style: {
      width: '100%', padding: '12px 14px', fontSize: '22px', fontWeight: '650',
      textAlign: 'center', background: 'var(--bg-raise)',
      border: '1px solid var(--line)', borderRadius: '12px',
      fontVariantNumeric: 'tabular-nums',
    },
  });
  const head = el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' } });
  const gapBox = el('div', { style: { marginTop: '10px' } });

  let exp = expectedBalance(state, account.id, dateInput.value || today());
  let choice = null;
  let picked = false;
  const listeners = [];

  const paintHead = () => {
    fill(head,
      el('span', { style: { fontWeight: '650', fontSize: '15px' }, text: `${account.owner} · ${account.bank}` }),
      el('span.tiny', { style: { marginLeft: 'auto' } }, 'should be ', el('b.num', { text: money(exp.balance, true) })),
    );
  };

  const paintGap = () => {
    const raw = amount.value.trim();
    if (raw === '') { fill(gapBox); return; }

    const actual = Number(raw) || 0;
    const gap = actual - exp.balance;

    if (Math.abs(gap) < 1) {
      fill(gapBox, el('div.tiny.pos', { style: { textAlign: 'center' } },
        'Spot on — nothing to explain.'));
      choice = null;
      return;
    }

    const candidates = explainGap(exp, gap);

    // One exact timing match is almost certainly the answer, and carrying a
    // bill forward is harmless if it turns out not to be — so make it the
    // default rather than something to tap. Never default a drift: that
    // rewrites the bill on file, and should always be a deliberate choice.
    if (!picked) {
      const top = candidates[0];
      const alone = candidates.filter((c) => c.type === top?.type).length === 1;
      choice = top && top.type !== 'drift' && top.events.length === 1 && alone ? top : null;
    }
    const bits = [el('div.tiny', { style: { textAlign: 'center', marginBottom: '10px' } },
      gap > 0
        ? el('span', {}, el('b.pos', { text: money(Math.abs(gap), true) }), ' more than expected — something has not come out yet.')
        : el('span', {}, el('b.neg', { text: money(Math.abs(gap), true) }), ' less than expected — a bill cost more, or something unlisted went out.'))];

    if (candidates.length) {
      bits.push(el('div.tiny', { style: { marginBottom: '6px' } }, 'Most likely:'));
      for (const c of candidates) {
        const b = el('button.btn.sm.ghost.wide', {
          type: 'button', style: { marginBottom: '6px', textAlign: 'left', justifyContent: 'flex-start' },
          text: describe(c),
        });
        // Pick, don't toggle. With a default already selected, toggling means
        // tapping the right answer turns it off — which reads as the app
        // rejecting it. "Just take the balance" is how you choose none.
        b.addEventListener('click', () => {
          picked = true;
          choice = c;
          paintGap();
        });
        if (choice?.key === c.key) b.classList.add('picked');
        bits.push(b);
      }
    }

    bits.push(el('button.btn.sm.ghost.wide', {
      type: 'button',
      style: { textAlign: 'left', justifyContent: 'flex-start' },
      class: choice === null ? 'picked' : '',
      text: gap > 0 ? 'Something else — just take the balance' : 'Unlisted spending — just take the balance',
      onclick: () => { picked = true; choice = null; paintGap(); },
    }));

    fill(gapBox, bits);
  };

  amount.addEventListener('input', () => { paintGap(); listeners.forEach((f) => f()); });

  paintHead();
  node.append(head, amount, gapBox);

  return {
    node,
    hasValue: () => amount.value.trim() !== '',
    onChange: (fn) => listeners.push(fn),
    reprice: (date) => {
      exp = expectedBalance(state, account.id, date || today());
      choice = null;
      picked = false;
      paintHead();
      paintGap();
    },
    result: () => {
      const actual = Number(amount.value) || 0;
      return { accountId: account.id, actual, expected: exp.balance, gap: actual - exp.balance, choice };
    },
  };
}

function describe(c) {
  const names = c.events.map((e) => e.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  if (c.type === 'late') return `${list} has not cleared yet (${money(c.amount, true)})`;
  if (c.type === 'shortIncome') return `${list} has not landed yet (${money(c.amount, true)})`;
  return `${list} was ${money(c.amount, true)}, not ${money(c.events[0].amount, true)}`;
}

// ---- History ---------------------------------------------------------------

export function reconcileHistory(state) {
  const rows = (state.reconciliations ?? []).slice(-10).reverse();
  if (!rows.length) return null;

  const card = el('div.card.flush');
  for (const r of rows) {
    const a = state.accounts.find((x) => x.id === r.account);
    const miss = Math.abs(r.gap);
    card.append(el('div.row', {},
      el('div.day', { text: shortDate(r.date).split(' ')[1] ?? '·' }),
      el('div.mid', {},
        el('div.nm', {}, el('span.t', { text: a?.owner ?? r.account })),
        el('div.meta', {
          text: miss < 1
            ? `${shortDate(r.date)} · forecast was exact`
            : `${shortDate(r.date)} · forecast said ${money(r.expected, true)}${r.resolved ? ` · ${LABELS[r.resolved]}` : ''}`,
        }),
      ),
      el('div', { style: { textAlign: 'right' } },
        el('div.amt', { text: money(r.actual, true) }),
        el('div.tiny', { class: miss < 1 ? 'pos' : miss < 100 ? '' : 'warn' }, miss < 1 ? 'exact' : `out by ${money(miss, true)}`),
      ),
    ));
  }
  return card;
}

const LABELS = {
  late: 'a bill had not cleared',
  shortIncome: 'a payment had not landed',
  drift: 'a bill amount corrected',
};
