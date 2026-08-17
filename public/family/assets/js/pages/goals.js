// Goals — the reason any of the rest of it is worth doing.

import * as store from '../store.js';
import {
  el, money, stat, section, bar, sheet, field, input, longDate, today, monthsBetween,
} from '../ui.js';
import { goalSummary, goalPace, household, debtTotals } from '../calc.js';

export default function goals(state) {
  const wrap = el('div');
  const g = goalSummary(state);
  const h = household(state);
  const totals = debtTotals(state);
  const extra = state.settings.extraToDebt ?? 0;

  const totalPace = g.goals.reduce((s, x) => s + goalPace(x).perMonth, 0);
  const slack = h.left - extra;

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'Saved toward trips' }),
    el('div.big', { text: money(g.saved), class: g.saved > 0 ? 'pos' : 'mut' }),
    el('div.note', { text: `${money(g.remaining)} still to go of ${money(g.target)}` }),
  ));

  wrap.append(el('div.stats', {},
    stat('Needed / mo', money(totalPace), 'to hit every date', 'warn'),
    stat('Actually spare', money(slack), 'after bills and debt', slack < totalPace ? 'neg' : 'pos'),
  ));

  wrap.append(el('p.tiny', { style: { margin: '10px 2px 0' } }, tradeoff(state, totalPace, slack, extra, totals)));

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

  wrap.append(section('If you do them one at a time'));
  wrap.append(sequence(state, g, slack));

  // ---- Emergency fund ------------------------------------------------------

  wrap.append(section('Before any of it'));
  const ef = state.settings;
  wrap.append(el('div.card', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' } },
      el('span', { style: { fontWeight: '650' }, text: '🧯 Starter emergency fund' }),
      el('span', { style: { marginLeft: 'auto', fontWeight: '650' }, text: money(ef.emergencyFundTarget) })),
    el('div.tiny', { style: { marginBottom: '10px' } },
      'Both accounts have dipped under $250 in the last three months. One tire, one vet bill, one AC repair and it goes on a 22% card — which is how the balances got here. A small buffer is what stops the loop.'),
    bar(ef.emergencyFundSaved / (ef.emergencyFundTarget || 1), 'var(--blue)'),
    el('div.tiny', { style: { marginTop: '7px' } }, `${money(ef.emergencyFundSaved)} of ${money(ef.emergencyFundTarget)}`),
    el('button.btn.sm.ghost', {
      type: 'button', text: 'Update', style: { marginTop: '12px' },
      onclick: () => emergencySheet(state),
    }),
  ));

  return wrap;
}

function tradeoff(state, pace, slack, extra, totals) {
  if (slack >= pace) {
    return `The trips fit — ${money(pace)} a month covers all three on the dates you set, and you would still be putting ${money(extra)} at the debt.`;
  }
  const short = pace - slack;
  const interestYear = totals.monthlyInterest * 12;
  return `Funding all three on schedule needs ${money(pace)} a month and there is ${money(Math.max(0, slack))} spare — about ${money(short)} short. Two honest options: move a date out, or clear debt first. Interest is eating ${money(interestYear)} a year right now, so every month the cards stay open costs roughly ${money(totals.monthlyInterest)} that could have been trip money.`;
}

// Goals funded back to back rather than all at once — usually the realistic
// version, and it shows what each date actually costs the ones behind it.
function sequence(state, g, slack) {
  const card = el('div.card.flush');
  if (slack <= 0) {
    return el('div.card', {}, el('p.tiny', {
      style: { margin: 0 },
      text: 'There is no spare money in the plan right now, so a sequence would be fiction. Free up room on Josh’s or Laci’s tab first — the ASK-flagged lines are the place to look.',
    }));
  }

  const ordered = [...g.goals].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  let month = 0;
  for (const goal of ordered) {
    const need = Math.max(0, goal.target - goal.saved);
    const months = Math.ceil(need / slack);
    month += months;
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + month);
    const readyBy = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const late = monthsBetween(today(), goal.targetDate) + 1 < month;

    card.append(el('div.row', {},
      el('div.day', { text: goal.emoji ?? '🎯', style: { fontSize: '17px' } }),
      el('div.mid', {},
        el('div.nm', {}, el('span.t', { text: goal.name }),
          late ? el('span.flag.ask', { text: 'LATE' }) : null),
        el('div.meta', { text: `${months} months at ${money(slack)}/mo · funded by ${readyBy}` }),
      ),
      el('div.amt', { text: money(need) }),
    ));
  }

  card.append(el('div', { style: { padding: '12px 16px' } }, el('div.tiny', {
    text: `All three funded ${month} months out, one after another, at ${money(slack)} a month. Doing them in parallel does not make them arrive sooner — it just makes all three late at once.`,
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
