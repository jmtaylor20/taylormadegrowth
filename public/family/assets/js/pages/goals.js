// Goals — the reason any of the rest of it is worth doing.
//
// What goes toward trips is a decision, not something to be inferred from what
// is left over after bills. So the rate is set here and everything else follows
// from it: what each goal needs, when each one lands, and which dates the
// current rate will not reach.

import * as store from '../store.js';
import {
  el, money, stat, section, bar, sheet, field, input, longDate, today, monthsBetween,
} from '../ui.js';
import { goalSummary, goalPace } from '../calc.js';

export default function goals(state) {
  const wrap = el('div');
  const g = goalSummary(state);
  const rate = state.settings.monthlyToGoals ?? 0;
  const needed = g.goals.reduce((s, x) => s + goalPace(x).perMonth, 0);

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'Saved toward trips' }),
    el('div.big', { text: money(g.saved), class: g.saved > 0 ? 'pos' : 'mut' }),
    el('div.note', { text: `${money(g.remaining)} still to go of ${money(g.target)}` }),
  ));

  wrap.append(el('div.stats', {},
    stat('Putting in', money(rate), 'each month', rate > 0 ? 'pos' : 'mut'),
    stat('Needed', money(needed), 'to hit every date', needed > rate ? 'warn' : 'pos'),
  ));

  // ---- The rate ------------------------------------------------------------

  wrap.append(section('What you are putting toward trips'));
  const rateCard = el('div.card');
  const rateInput = el('input', {
    type: 'number', step: '25', inputmode: 'decimal', value: rate || '',
    placeholder: '0',
    style: {
      width: '100%', padding: '13px 16px', fontSize: '24px', fontWeight: '680',
      textAlign: 'center', background: 'var(--bg-raise)',
      border: '1px solid var(--line)', borderRadius: '12px',
      fontVariantNumeric: 'tabular-nums',
    },
  });
  rateCard.append(
    rateInput,
    el('p.tiny', { style: { margin: '10px 0 0' } },
      'A month at a time, from wherever you choose to fund it. Everything below is worked out from this number, so it is worth being honest rather than optimistic.'),
    el('button.btn.sm.wide', {
      type: 'button', text: 'Save', style: { marginTop: '12px' },
      onclick: () => store.commit((s) => { s.settings.monthlyToGoals = Number(rateInput.value) || 0; }),
    }),
  );
  wrap.append(rateCard);

  // ---- Goals ---------------------------------------------------------------

  wrap.append(section('The list', `${g.goals.length} trips`));
  for (const goal of g.goals) {
    const pace = goalPace(goal);
    const done = goal.saved >= goal.target;
    wrap.append(el('button.card', {
      type: 'button', style: { display: 'block', width: '100%', textAlign: 'left' },
      onclick: () => editGoal(state, goal),
    },
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '4px' } },
        el('span', { style: { fontSize: '19px' }, text: goal.emoji ?? '🎯' }),
        el('span', { style: { fontWeight: '650', fontSize: '16px' }, text: goal.name }),
        el('span', { style: { marginLeft: 'auto', fontWeight: '650' }, class: done ? 'pos' : '', text: money(goal.target) }),
      ),
      el('div.tiny', { style: { marginBottom: '10px' } },
        done
          ? 'Funded. Go book it.'
          : `${longDate(goal.targetDate)} · ${pace.months} months out · ${money(pace.perMonth)}/mo to make it`),
      bar(goal.saved / (goal.target || 1), done ? 'var(--josh)' : 'var(--gold)'),
      el('div.tiny', { style: { marginTop: '7px' } }, `${money(goal.saved)} saved · ${money(Math.max(0, goal.target - goal.saved))} to go`),
    ));
  }

  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Add a goal', type: 'button', style: { marginTop: '4px' },
    onclick: () => editGoal(state, null),
  }));

  // ---- Sequencing ----------------------------------------------------------

  wrap.append(section('One at a time', rate > 0 ? `at ${money(rate)}/mo` : null));
  wrap.append(sequence(state, g, rate));

  // ---- Emergency fund ------------------------------------------------------

  wrap.append(section('Before any of it'));
  const ef = state.settings;
  wrap.append(el('div.card', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' } },
      el('span', { style: { fontWeight: '650' }, text: '🧯 Starter emergency fund' }),
      el('span', { style: { marginLeft: 'auto', fontWeight: '650' }, text: money(ef.emergencyFundTarget) })),
    el('div.tiny', { style: { marginBottom: '10px' } },
      'A small buffer that is not the credit cards. Without one, the next tyre or vet bill becomes a balance at 25% — which is the loop worth breaking first.'),
    bar(ef.emergencyFundSaved / (ef.emergencyFundTarget || 1), 'var(--blue)'),
    el('div.tiny', { style: { marginTop: '7px' } }, `${money(ef.emergencyFundSaved)} of ${money(ef.emergencyFundTarget)}`),
    el('button.btn.sm.ghost', {
      type: 'button', text: 'Update', style: { marginTop: '12px' },
      onclick: () => emergencySheet(state),
    }),
  ));

  return wrap;
}

// Funded back to back rather than all at once — usually the realistic version,
// and it shows what each date costs the ones behind it.
function sequence(state, g, rate) {
  if (rate <= 0) {
    return el('div.card', {}, el('p.tiny', {
      style: { margin: 0 },
      text: 'Set a monthly amount above and this fills in with the date each trip is actually funded by.',
    }));
  }

  const card = el('div.card.flush');
  const ordered = [...g.goals].filter((x) => x.saved < x.target)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  if (!ordered.length) {
    return el('div.card', {}, el('div.empty', { text: 'Every goal is funded.' }));
  }

  let month = 0;
  let anyLate = false;
  for (const goal of ordered) {
    const need = goal.target - goal.saved;
    month += Math.ceil(need / rate);
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + month);
    const readyBy = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const late = monthsBetween(today(), goal.targetDate) + 1 < month;
    if (late) anyLate = true;

    card.append(el('div.row', {},
      el('div.day', { text: goal.emoji ?? '🎯', style: { fontSize: '17px' } }),
      el('div.mid', {},
        el('div.nm', {}, el('span.t', { text: goal.name }),
          late ? el('span.flag.ask', { text: 'LATE' }) : null),
        el('div.meta', { text: `funded by ${readyBy} · wanted ${longDate(goal.targetDate)}` }),
      ),
      el('div.amt', { text: money(need) }),
    ));
  }

  card.append(el('div', { style: { padding: '12px 16px' } }, el('div.tiny', {
    text: anyLate
      ? `At ${money(rate)} a month the trips flagged LATE are funded after the date you wanted them. Either the rate goes up or those dates move.`
      : `All of them funded ${month} months out at ${money(rate)} a month, one after another.`,
  })));

  return card;
}

// ---- Editors ---------------------------------------------------------------

function editGoal(state, goal) {
  const isNew = !goal;
  const draft = goal ?? {
    id: store.uid('g'), name: '', target: 0, saved: 0,
    targetDate: today(), emoji: '🎯', priority: 1,
  };

  sheet(isNew ? 'Add a goal' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'Where to?' });
    const target = input({ type: 'number', step: '50', value: draft.target || '', inputmode: 'decimal' });
    const saved = input({ type: 'number', step: '25', value: draft.saved || 0, inputmode: 'decimal' });
    const date = input({ type: 'date', value: draft.targetDate });
    const emoji = input({ value: draft.emoji ?? '🎯', maxlength: '4' });
    const priority = input({ type: 'number', min: '1', max: '9', value: draft.priority ?? 1, inputmode: 'numeric' });

    return el('div', {},
      field('Name', name),
      el('div.f2', {}, field('Target', target), field('Saved so far', saved)),
      el('div.f2', {}, field('Want it by', date), field('Order (higher = first)', priority)),
      field('Emoji', emoji),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            target: Number(target.value) || 0,
            saved: Number(saved.value) || 0,
            targetDate: date.value || draft.targetDate,
            emoji: emoji.value || '🎯',
            priority: Number(priority.value) || 1,
          };
          await store.commit((s) => {
            const t = s.goals.find((x) => x.id === draft.id);
            if (t) Object.assign(t, patch);
            else s.goals.push({ ...draft, ...patch });
          });
          close();
        },
      }),
      !isNew && el('button.btn.wide.ghost', {
        type: 'button', text: 'Delete', style: { marginTop: '8px', color: 'var(--red)' },
        onclick: async () => {
          if (!confirm(`Delete ${draft.name}?`)) return;
          await store.commit((s) => { s.goals = s.goals.filter((x) => x.id !== draft.id); });
          close();
        },
      }),
    );
  });
}

function emergencySheet(state) {
  sheet('Emergency fund', (close) => {
    const target = input({ type: 'number', step: '100', value: state.settings.emergencyFundTarget, inputmode: 'decimal' });
    const saved = input({ type: 'number', step: '25', value: state.settings.emergencyFundSaved, inputmode: 'decimal' });
    return el('div', {},
      el('div.f2', {}, field('Target', target), field('Saved', saved)),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          await store.commit((s) => {
            s.settings.emergencyFundTarget = Number(target.value) || 0;
            s.settings.emergencyFundSaved = Number(saved.value) || 0;
          });
          close();
        },
      }),
    );
  });
}
