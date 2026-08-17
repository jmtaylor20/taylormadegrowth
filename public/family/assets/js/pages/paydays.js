// Paydays — the timing problem. Paid twice a month, billed on the 1st.
//
// This page treats the month as pay periods rather than one bucket, shows which
// period is carrying too much, and names the specific bills to move.

import * as store from '../store.js';
import { el, money, signed, ord, stat, section, sheet, field, input } from '../ui.js';
import {
  payPeriods, payDaysFor, rebalance, runningBalance, floatTarget, recurringFor,
  reimbursementGaps,
} from '../calc.js';

export default function paydays(state) {
  const wrap = el('div');

  const worst = state.accounts
    .map((a) => ({ a, periods: payPeriods(state, a.id) }))
    .flatMap(({ a, periods }) => periods.map((p) => ({ a, p })))
    .sort((x, y) => x.p.net - y.p.net)[0];

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'Tightest stretch of the month' }),
    el('div.big', { text: money(worst ? worst.p.net : 0), class: worst && worst.p.net < 0 ? 'neg' : 'pos' }),
    el('div.note', { text: worst ? `${worst.a.owner}, ${ord(worst.p.start)} through ${ord(prevDay(worst.p.next))}` : '—' }),
  ));

  wrap.append(el('p', { style: { margin: '4px 2px 0', fontSize: '14px', lineHeight: '1.5' } },
    'A paycheck has to carry every bill until the next one lands. Split the month that way and the problem shows up plainly: it is not that you earn too little across the month, it is that one stretch is asked to carry far more than its share.'));

  for (const acct of state.accounts) {
    wrap.append(accountBlock(state, acct));
  }

  return wrap;
}

const prevDay = (d) => (d === 1 ? 31 : d - 1);

function accountBlock(state, acct) {
  const block = el('div');
  const days = payDaysFor(state, acct.id);
  const periods = payPeriods(state, acct.id);

  block.append(section(`${acct.owner} — paid ${cadenceLabel(days)}`,
    days.map((d) => ord(d)).join(' & ')));

  if (!periods.length) {
    return block.append(el('div.card', {}, el('div.empty', { text: 'No pay schedule set.' }))), block;
  }

  // ---- Period cards --------------------------------------------------------

  for (const p of periods) {
    const card = el('div.card', {});
    const share = p.income > 0 ? p.outgo / p.income : 0;

    card.append(
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' } },
        el('div', { style: { fontWeight: '650', fontSize: '16px' }, text: `${ord(p.start)} → ${ord(prevDay(p.next))}` }),
        p.wraps ? el('span.pill', { text: 'crosses the month' }) : null,
        el('div', { style: { marginLeft: 'auto', fontWeight: '650' }, class: p.net < 0 ? 'neg' : 'pos', text: signed(p.net) }),
      ),
      el('div.stats', {},
        stat('Paycheck', money(p.income), null, 'pos'),
        stat('Bills due', money(p.outgo), `${p.items.length} items`, 'neg'),
      ),
      el('div', { style: { marginTop: '12px' } },
        el('div.split', {},
          el('i', { style: { width: `${Math.min(100, share * 100)}%`, background: share > 1 ? 'var(--red)' : 'var(--gold)' } })),
        el('div.tiny', { style: { marginTop: '6px' } },
          share > 1
            ? `Bills are ${Math.round(share * 100)}% of this paycheck — it cannot cover itself.`
            : `Bills take ${Math.round(share * 100)}% of this paycheck.`),
      ),
    );

    const list = el('div', { style: { marginTop: '12px' } });
    for (const b of [...p.items].sort((x, y) => y.amount - x.amount).slice(0, 6)) {
      list.append(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '13px' } },
        el('span.mut', { style: { flex: '0 0 34px' }, text: ord(b.day) }),
        el('span', { style: { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: b.name }),
        b.movable === false ? el('span.pill', { text: 'fixed' }) : null,
        el('span.num', { style: { flex: '0 0 62px', textAlign: 'right' }, text: money(b.amount) }),
      ));
    }
    if (p.items.length > 6) {
      list.append(el('div.tiny', { style: { paddingTop: '5px' }, text: `+ ${p.items.length - 6} smaller` }));
    }
    card.append(list);
    block.append(card);
  }

  // ---- The fix -------------------------------------------------------------

  const plan = rebalance(state, acct.id);
  if (plan && plan.moves.length) {
    block.append(el('div.card', { style: { borderColor: 'var(--josh)' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '8px' } }, '✅ The fix: move these due dates'),
      el('p', { style: { margin: '0 0 12px', fontSize: '14px', lineHeight: '1.5' } },
        `${plan.moves.length === 1 ? 'One call' : `${plan.moves.length} calls`}. Ask each biller to change the due date — most will, and it costs nothing. That alone rebalances the month.`),
      ...plan.moves.map((m) => el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderTop: '1px solid var(--line)' },
      },
        el('div', { style: { flex: '1' } },
          el('div', { style: { fontSize: '14px', fontWeight: '550' }, text: m.bill.name }),
          el('div.tiny', { text: `${ord(m.from)} → ${ord(m.to)}` })),
        el('div.num', { style: { fontWeight: '620' }, text: money(m.bill.amount) }),
      )),
      el('div', { style: { marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--line)' } },
        el('div.tiny', { style: { marginBottom: '8px' } }, 'Result:'),
        ...plan.after.map((p) => el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '3px 0' } },
          el('span', { style: { flex: '1', minWidth: '0' }, text: `${ord(p.start)} → ${ord(prevDay(p.next))}` }),
          el('span.mut.num', { style: { flex: '0 0 62px', textAlign: 'right' }, text: signed(before(plan.before, p.start)) }),
          el('span.mut', { text: '→' }),
          el('span.num', { style: { flex: '0 0 62px', textAlign: 'right' }, class: p.net < 0 ? 'neg' : 'pos', text: signed(p.net) }),
        ))),
      el('button.btn.sm.wide', {
        type: 'button', text: 'Apply these dates', style: { marginTop: '14px' },
        onclick: async () => {
          if (!confirm('Update the due dates in the app? Do this once you have actually changed them with the billers.')) return;
          await store.commit((s) => {
            for (const [id, day] of Object.entries(plan.overrides)) {
              const r = s.recurring.find((x) => x.id === id);
              if (r) r.day = day;
            }
          });
        },
      }),
    ));
  } else if (plan) {
    block.append(el('div.card', {}, el('p', { style: { margin: 0, fontSize: '14px' } },
      'The pay periods are already about as balanced as moving dates can make them. What is left is a size problem, not a timing one.')));
  }

  // ---- Reimbursement timing ------------------------------------------------

  const gaps = reimbursementGaps(state, acct.id);
  for (const g of gaps) {
    block.append(el('div.card', { style: { borderColor: 'var(--gold)' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '8px' } }, '⏱ You are floating a bill that pays you back'),
      el('p', { style: { margin: '0 0 12px', fontSize: '14px', lineHeight: '1.5' } },
        `${g.bill.name} leaves on the ${ord(g.bill.day)}, but the ${g.credit.name.toLowerCase()} that covers it does not land until the ${ord(g.creditDay)}. So every month you front ${money(g.bill.amount)} of your own money for ${g.creditDay - g.bill.day} day${g.creditDay - g.bill.day === 1 ? '' : 's'} — and those are the days the account is at its thinnest.`),
      el('p', { style: { margin: '0 0 12px', fontSize: '14px', lineHeight: '1.5' } },
        `Move it to the ${ord(g.suggested)} and it funds itself. Costs nothing, and it is the single cheapest fix on this page.`),
      el('button.btn.sm.wide', {
        type: 'button', text: `Move to the ${ord(g.suggested)}`,
        onclick: async () => {
          if (!confirm(`Set ${g.bill.name} to the ${ord(g.suggested)}? Do this once the biller has actually changed it.`)) return;
          await store.commit((s) => {
            const r = s.recurring.find((x) => x.id === g.bill.id);
            if (r) r.day = g.suggested;
          });
        },
      }),
    ));
  }

  // ---- Running balance -----------------------------------------------------

  // The "after" line reflects every fix offered above — rebalancing moves and
  // the reimbursement-timing move alike — so the curve matches the advice.
  const overrides = { ...(plan?.overrides ?? {}) };
  for (const g of gaps) overrides[g.bill.id] = g.suggested;

  const run = runningBalance(state, acct.id, 0);
  const need = floatTarget(state, acct.id);
  const runAfter = runningBalance(state, acct.id, 0, overrides);
  const needAfter = Math.max(0, -runAfter.low.balance);

  block.append(el('div.card', {},
    el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '4px' } }, 'Cushion needed'),
    el('div.tiny', { style: { marginBottom: '12px' } },
      `Starting from zero on the ${ord(run.startDay)} — the payday that funds the front of the month — and walking a full cycle day by day. This is how far below the line it dips.`),
    curve(run.points, runAfter.points),
    el('div.stats', { style: { marginTop: '14px' } },
      stat('As it stands', money(need), `low point on the ${ord(run.low.day)}`, need > 0 ? 'neg' : 'pos'),
      stat('After the fixes', money(needAfter), needAfter < need ? `${money(need - needAfter)} less to hold` : 'no change',
        needAfter > 0 ? 'warn' : 'pos'),
    ),
    el('p', { style: { margin: '12px 0 0', fontSize: '14px', lineHeight: '1.5' } },
      need <= 0
        ? 'The account never dips below zero across the month. The timing is fine.'
        : needAfter < need * 0.5
          ? `Make those changes and the cushion you need drops from ${money(need)} to ${money(needAfter)} — the dip all but disappears without a dollar of extra income. Until then, hold ${money(need)} you never touch.`
          : `Hold ${money(need)} in this account that you never spend and the front-end crunch stops happening. That buffer is worth more than it looks: it is what stops a tight week turning into a card swipe.`),
  ));

  return block;
}

const before = (periods, start) => periods.find((p) => p.start === start)?.net ?? 0;

function cadenceLabel(days) {
  if (days.length === 1) return 'monthly';
  if (days.length === 2) return 'twice a month';
  return `${days.length}× a month`;
}

// Two-line month curve: current shape vs. the shape after moving dates.
function curve(now, next) {
  const W = 320, H = 92, P = 4;
  const all = [...now, ...next].map((p) => p.balance);
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const range = max - min || 1;

  const x = (i, n) => P + (i / (n - 1)) * (W - P * 2);
  const y = (v) => P + (1 - (v - min) / range) * (H - P * 2);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i, pts.length).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';
  svg.style.height = `${H}px`;
  svg.innerHTML = `
    <line x1="${P}" y1="${y(0).toFixed(1)}" x2="${W - P}" y2="${y(0).toFixed(1)}"
          stroke="#6f89a3" stroke-width="1" stroke-dasharray="3 3"/>
    <path d="${path(now)}" fill="none" stroke="#f4645f" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${path(next)}" fill="none" stroke="#2fbf78" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="4 3"/>`;

  return el('div', {}, svg, el('div.legend', {},
    el('div', {}, el('i', { style: { background: '#f4645f' } }), 'Today'),
    el('div', {}, el('i', { style: { background: '#2fbf78' } }), 'After moving dates'),
  ));
}
