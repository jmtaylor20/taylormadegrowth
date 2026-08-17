// Windfall allocator — where a lump sum should actually go, and why.

import * as store from '../store.js';
import { el, money, stat, sheet, field, input, longDate, today } from '../ui.js';
import { allocateWindfall, windfallCompare } from '../calc.js';

export function windfallCard(state) {
  const pending = (state.windfalls ?? []).filter((w) => !w.applied);
  if (!pending.length) {
    return el('div.card', {},
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '6px' } }, '💰 Windfall'),
      el('p.tiny', { style: { margin: '0 0 12px' } },
        'Money arriving outside the normal month — a build fee, a bonus, a refund. Worth deciding deliberately rather than letting it soak into the account.'),
      el('button.btn.sm.wide.ghost', { type: 'button', text: 'Plan one', onclick: () => addSheet(state) }));
  }

  const wrap = el('div');
  for (const w of pending) wrap.append(plan(state, w));
  return wrap;
}

function plan(state, w) {
  const cmp = windfallCompare(state, w.amount);
  const a = cmp.smart;

  const card = el('div.card', { style: { borderColor: 'var(--gold)' } },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px' } }, `💰 ${w.name}`),
      el('div', { style: { marginLeft: 'auto', fontWeight: '680', fontSize: '18px' }, class: 'num pos', text: money(w.amount) }),
    ),
    el('div.tiny', { style: { marginBottom: '14px' } },
      w.expected ? `Expected ${longDate(w.expected)}${w.note ? ` · ${w.note}` : ''}` : (w.note ?? '')),
  );

  for (const [i, s] of a.steps.entries()) {
    card.append(el('div', {
      style: { display: 'flex', gap: '11px', padding: '11px 0', borderTop: '1px solid var(--line)' },
    },
      el('div.day', {
        text: String(i + 1),
        style: { flex: '0 0 30px', height: '30px', fontSize: '13px',
          background: s.kind === 'goal' ? 'var(--gold)' : s.kind === 'debt' ? 'var(--red)' : 'var(--blue)',
          color: '#08131f' },
      }),
      el('div', { style: { flex: '1', minWidth: '0' } },
        el('div', { style: { fontSize: '14px', fontWeight: '600' }, text: s.name }),
        el('div.tiny', { style: { marginTop: '2px' }, text: s.why })),
      el('div.num', { style: { fontWeight: '650', flex: '0 0 auto' }, text: money(s.amount) }),
    ));
  }

  if (a.unallocated > 0.5) {
    card.append(el('div.tiny', { style: { paddingTop: '11px', borderTop: '1px solid var(--line)' } },
      `${money(a.unallocated)} unallocated — every goal and debt is covered.`));
  }

  // The comparison that makes the case — or doesn't, honestly either way.
  card.append(el('div', { style: { marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--line)' } },
    el('div.tiny', { style: { marginBottom: '8px' } },
      `Interest cost over the next ${cmp.horizonMonths} months, each plan:`),
    el('div.stats.three', {},
      stat('This plan', money(cmp.planned.interest), 'recommended', 'pos'),
      stat('All to debt', money(cmp.allToDebt.interest), 'then charge the trips', ''),
      stat('All to trips', money(cmp.allToGoals.interest), 'nothing to debt', ''),
    ),
    el('p', { style: { margin: '12px 0 0', fontSize: '14px', lineHeight: '1.5' } },
      cmp.vsAllToGoals > 1
        ? `Putting all of it into the trips would cost ${money(cmp.vsAllToGoals)} more — the later trips have months of cashflow behind them and do not need a lump sum.`
        : 'Splitting beats sending it all to the trips.'),
    // Straight-to-debt often wins on paper. Say so, then say what it assumes.
    cmp.vsAllToDebt < -1
      ? el('p', { style: { margin: '10px 0 0', fontSize: '14px', lineHeight: '1.5' } },
          `Straight to the debt is ${money(-cmp.vsAllToDebt)} cheaper on paper — but only because it assumes the ${money(cmp.committed)} of trips gets charged to a card instead. That ends the year with more debt than you started with. This plan puts nothing on a card and buys a buffer; ${money(-cmp.vsAllToDebt)} over ${cmp.horizonMonths} months is what that costs.`)
      : el('p', { style: { margin: '10px 0 0', fontSize: '14px', lineHeight: '1.5' } },
          `It also beats sending everything to the debt, because the trips would only come back as card balances at ${cmp.apr.toFixed(2)}%.`),
  ));

  card.append(el('div.btnrow', { style: { marginTop: '14px' } },
    el('button.btn.sm.primary', {
      type: 'button', text: 'Apply this plan',
      onclick: async () => {
        if (!confirm('Record this allocation? Do it once the money has actually landed and been moved.')) return;
        await store.commit((s) => {
          for (const step of a.steps) {
            if (step.kind === 'goal') {
              const g = s.goals.find((x) => x.id === step.id);
              if (g) g.saved += step.amount;
            } else if (step.kind === 'debt') {
              const d = s.debts.find((x) => x.id === step.id);
              if (d) { d.balance = Math.max(0, d.balance - step.amount); d.asOf = today(); }
            } else if (step.kind === 'emergency') {
              s.settings.emergencyFundSaved += step.amount;
            }
          }
          const t = s.windfalls.find((x) => x.id === w.id);
          if (t) { t.applied = true; t.appliedOn = today(); }
        });
      },
    }),
    el('button.btn.sm.ghost', {
      type: 'button', text: 'Edit',
      onclick: () => addSheet(state, w),
    }),
  ));

  return card;
}

function addSheet(state, existing) {
  sheet(existing ? 'Edit windfall' : 'Plan a windfall', (close) => {
    const name = input({ value: existing?.name ?? '', placeholder: 'Where is it from?' });
    const amount = input({ type: 'number', step: '100', inputmode: 'decimal', value: existing?.amount ?? '' });
    const when = input({ type: 'date', value: existing?.expected ?? today() });

    return el('div', {},
      field('What', name),
      field('Amount', amount),
      field('Expected', when),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const amt = Number(amount.value) || 0;
          if (!amt) return close();
          await store.commit((s) => {
            s.windfalls ??= [];
            const patch = { name: name.value.trim() || 'Windfall', amount: amt, expected: when.value };
            const t = s.windfalls.find((x) => x.id === existing?.id);
            if (t) Object.assign(t, patch);
            else s.windfalls.push({ id: store.uid('w'), ...patch });
          });
          close();
        },
      }),
      existing && el('button.btn.wide.ghost', {
        type: 'button', text: 'Delete', style: { marginTop: '8px', color: 'var(--red)' },
        onclick: async () => {
          await store.commit((s) => { s.windfalls = s.windfalls.filter((x) => x.id !== existing.id); });
          close();
        },
      }),
    );
  });
}
