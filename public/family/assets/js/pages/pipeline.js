// Coming down the pipe — the irregular stuff that wrecks a month when it
// arrives unfunded. Every item is shown as both a lump and a monthly set-aside.

import * as store from '../store.js';
import {
  el, money, stat, section, sheet, field, input, select, longDate, today, monthsBetween, bar,
} from '../ui.js';
import { pipelineSummary, monthlySetAside, colorFor, household } from '../calc.js';

const CATEGORIES = ['Housing', 'Kids', 'Transport', 'Utilities', 'Health', 'Insurance', 'Other'];
const CADENCES = [['once', 'One time'], ['yearly', 'Every year'], ['seasonal', 'Seasonal'], ['quarterly', 'Quarterly']];

export default function pipeline(state) {
  const wrap = el('div');
  const p = pipelineSummary(state);
  const h = household(state);

  wrap.append(
    el('div.card.hero', {},
      el('div.label', { text: 'Set aside monthly to be ready' }),
      el('div.big', { text: money(p.setAside), class: p.setAside > h.left ? 'neg' : 'warn' }),
      el('div.note', { text: `${money(p.total)} of known expenses across ${p.items.length} items` }),
    ),
  );

  wrap.append(el('div.stats', {},
    stat('Next 90 days', money(p.next90), `${p.next90Count} items landing`, p.next90 > h.left ? 'neg' : ''),
    stat('Room for it', money(h.left), 'left after recurring', h.left < p.setAside ? 'neg' : 'pos'),
  ));

  wrap.append(el('p.tiny', { style: { margin: '10px 2px 0' } },
    p.setAside > h.left
      ? `The set-aside is bigger than what's left after bills. When these land they go on a card — which is exactly how the balances got here. Something in the recurring list has to give, or these items need to shrink.`
      : `The set-aside fits inside what's left after bills. Move it to a separate savings account on payday so it isn't sitting in checking looking spendable.`));

  // ---- Timeline ------------------------------------------------------------

  wrap.append(section('Timeline'));
  const card = el('div.card.flush');

  if (!p.items.length) {
    card.append(el('div.empty', { text: 'Nothing queued up yet.' }));
  } else {
    let lastYear = null;
    for (const item of p.items) {
      const months = Math.max(0, monthsBetween(today(), item.due));
      const year = item.due.slice(0, 4);
      if (year !== lastYear) {
        card.append(el('div.row', { style: { background: 'var(--bg-raise)' } },
          el('div.mid', {}, el('div.nm', {}, el('span.t', { text: year })))));
        lastYear = year;
      }

      const owner = state.accounts.find((a) => a.id === item.account);
      const flags = el('span', { style: { display: 'contents' } });
      if (item.confidence === 'unsure') flags.append(el('span.flag.ask', { text: 'ASK' }));
      else if (item.confidence === 'likely') flags.append(el('span.flag.guess', { text: 'GUESS' }));

      card.append(el('button.row', { type: 'button', onclick: () => editItem(state, item) },
        el('div.day', {
          text: new Date(item.due + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }),
          style: { background: colorFor(item.category), color: '#08131f', fontSize: '11px' },
        }),
        el('div.mid', {},
          el('div.nm', {}, el('span.t', { text: item.name }), flags),
          el('div.meta', { text: `${longDate(item.due)} · ${months === 0 ? 'this month' : `${months} mo away`} · ${owner?.owner ?? '—'}` }),
        ),
        el('div', { style: { textAlign: 'right' } },
          el('div.amt', { text: money(item.amount) }),
          el('div.tiny', { text: `${money(monthlySetAside(item))}/mo` }),
        ),
      ));
    }
  }
  wrap.append(card);

  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Add something coming', type: 'button', style: { marginTop: '10px' },
    onclick: () => editItem(state, null),
  }));

  // ---- Funding progress ----------------------------------------------------

  wrap.append(section('Sinking funds'));
  const fund = el('div.card');
  for (const item of p.items) {
    const saved = item.saved ?? 0;
    fund.append(el('div', { style: { marginBottom: '14px' } },
      el('div', { style: { display: 'flex', gap: '8px', fontSize: '14px', marginBottom: '6px' } },
        el('span', { text: item.name }),
        el('span.tiny', { style: { marginLeft: 'auto' } }, `${money(saved)} / ${money(item.amount)}`)),
      bar(saved / (item.amount || 1), colorFor(item.category))));
  }
  if (fund.lastChild) fund.lastChild.style.marginBottom = '0';
  else fund.append(el('div.empty', { text: 'Add items above to track funding.' }));
  wrap.append(fund);

  wrap.append(el('p.tiny', { style: { margin: '10px 2px 0' } },
    'Tap an item to record what you have already put toward it.'));

  return wrap;
}

function editItem(state, item) {
  const isNew = !item;
  const draft = item ?? {
    id: store.uid('p'), name: '', amount: 0, due: today(), cadence: 'once',
    account: state.accounts[0]?.id, category: 'Other', confidence: 'confirmed', saved: 0,
  };

  sheet(isNew ? 'Add upcoming expense' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'What is it?' });
    const amount = input({ type: 'number', step: '1', value: draft.amount, inputmode: 'decimal' });
    const saved = input({ type: 'number', step: '1', value: draft.saved ?? 0, inputmode: 'decimal' });
    const due = input({ type: 'date', value: draft.due });
    const cadence = select(CADENCES, draft.cadence);
    const cat = select(CATEGORIES, draft.category);
    const acct = select(state.accounts.map((a) => [a.id, `${a.owner} — ${a.bank}`]), draft.account);
    const note = el('textarea', { rows: '2', placeholder: 'Note (optional)' });
    note.value = draft.note ?? '';

    const body = el('div');
    if (draft.note && !isNew) body.append(el('p.tiny', { style: { margin: '0 0 14px' }, text: draft.note }));

    body.append(
      field('What', name),
      el('div.f2', {}, field('Total cost', amount), field('Already saved', saved)),
      el('div.f2', {}, field('Needed by', due), field('Repeats', cadence)),
      el('div.f2', {}, field('Category', cat), field('Paid from', acct)),
      field('Note', note),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            amount: Number(amount.value) || 0,
            saved: Number(saved.value) || 0,
            due: due.value || draft.due,
            cadence: cadence.value,
            category: cat.value,
            account: acct.value,
            note: note.value.trim() || undefined,
            confidence: 'confirmed',
          };
          await store.commit((s) => {
            const t = s.pipeline.find((x) => x.id === draft.id);
            if (t) Object.assign(t, patch);
            else s.pipeline.push({ ...draft, ...patch });
          });
          close();
        },
      }),
      !isNew && el('button.btn.wide.ghost', {
        type: 'button', text: 'Delete', style: { marginTop: '8px', color: 'var(--red)' },
        onclick: async () => {
          if (!confirm(`Delete ${draft.name}?`)) return;
          await store.commit((s) => { s.pipeline = s.pipeline.filter((x) => x.id !== draft.id); });
          close();
        },
      }),
    );

    return body;
  });
}
