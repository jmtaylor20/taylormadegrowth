// Trips — a list you tap to say what you have put aside so far.
//
// No monthly rate, no pace, no sequencing. Money goes toward these when it goes
// toward them; the only thing worth keeping is a running total per trip.

import * as store from '../store.js';
import { el, money, section, sheet, field, input, bar, longDate, today } from '../ui.js';

export default function goals(state) {
  const wrap = el('div');
  const list = [...state.goals].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const saved = list.reduce((s, g) => s + (g.saved ?? 0), 0);
  const target = list.reduce((s, g) => s + (g.target ?? 0), 0);

  wrap.append(el('div.card.hero', {},
    el('div.label', { text: 'Put aside so far' }),
    el('div.big', { text: money(saved), class: saved > 0 ? 'pos' : 'mut' }),
    el('div.note', { text: `of ${money(target)} across ${list.length} trip${list.length === 1 ? '' : 's'}` }),
  ));

  wrap.append(section('Trips', 'tap to add money'));

  for (const g of list) {
    const done = (g.saved ?? 0) >= g.target;
    const left = Math.max(0, g.target - (g.saved ?? 0));
    wrap.append(el('button.card', {
      type: 'button', style: { display: 'block', width: '100%', textAlign: 'left' },
      onclick: () => goalSheet(g),
    },
      el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '9px', marginBottom: '6px' } },
        el('span', { style: { fontSize: '19px' }, text: g.emoji ?? '🎯' }),
        el('span', { style: { fontWeight: '650', fontSize: '16px' }, text: g.name }),
        el('span', { style: { marginLeft: 'auto', fontWeight: '650' }, class: done ? 'pos' : '', text: money(g.saved ?? 0) }),
      ),
      bar((g.saved ?? 0) / (g.target || 1), done ? 'var(--josh)' : 'var(--gold)'),
      el('div.tiny', { style: { marginTop: '7px' } },
        done ? 'Funded. Go book it.' : `${money(left)} to go of ${money(g.target)}`),
    ));
  }

  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Add a trip', type: 'button', style: { marginTop: '4px' },
    onclick: () => goalSheet(null),
  }));

  return wrap;
}

function goalSheet(g) {
  const isNew = !g;
  const draft = g ?? { id: store.uid('g'), name: '', target: 0, saved: 0, emoji: '🎯', priority: 1, contributions: [] };

  sheet(isNew ? 'Add a trip' : draft.name, (close) => {
    const body = el('div');

    if (!isNew) {
      // The common action by far: put more money against this one.
      const add = el('input', {
        type: 'number', step: '25', inputmode: 'decimal', placeholder: '0',
        style: {
          width: '100%', padding: '13px 16px', fontSize: '26px', fontWeight: '680',
          textAlign: 'center', background: 'var(--bg-raise)',
          border: '1px solid var(--line)', borderRadius: '12px',
          fontVariantNumeric: 'tabular-nums',
        },
      });
      const out = el('div.tiny', { style: { textAlign: 'center', margin: '10px 0 0' } });
      const put = el('button.btn.primary.wide', { type: 'button', text: 'Add it', style: { marginTop: '12px' } });

      const paint = () => {
        const v = Number(add.value) || 0;
        const next = (draft.saved ?? 0) + v;
        out.replaceChildren(
          document.createTextNode(`${money(draft.saved ?? 0)} → `),
          el('b.pos', { text: money(next) }),
          document.createTextNode(next >= draft.target ? ' — funded' : ` · ${money(draft.target - next)} still to go`),
        );
        put.disabled = v <= 0;
      };
      add.addEventListener('input', paint);
      paint();

      put.addEventListener('click', async () => {
        const v = Number(add.value) || 0;
        if (v <= 0) return;
        await store.commit((s) => {
          const t = s.goals.find((x) => x.id === draft.id);
          if (!t) return;
          t.saved = (t.saved ?? 0) + v;
          t.contributions = [...(t.contributions ?? []), { date: today(), amount: v }];
          t.edited = true;
        });
        close();
      });

      body.append(
        el('p.tiny', { style: { margin: '0 0 10px' } }, 'How much are you putting toward this?'),
        add, out, put,
      );

      const history = (draft.contributions ?? []).slice(-5).reverse();
      if (history.length) {
        body.append(el('div', { style: { marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--line)' } },
          el('div.tiny', { style: { marginBottom: '6px' } }, 'Added so far'),
          ...history.map((c) => el('div.tiny', { style: { padding: '3px 0' } }, `${longDate(c.date)} — ${money(c.amount)}`))));
      }
    }

    // Editing the trip itself is the rarer job, so it sits underneath.
    const name = input({ value: draft.name, placeholder: 'Where to?' });
    const targetIn = input({ type: 'number', step: '50', value: draft.target || '', inputmode: 'decimal' });
    const savedIn = input({ type: 'number', step: '25', value: draft.saved ?? 0, inputmode: 'decimal' });
    const emoji = input({ value: draft.emoji ?? '🎯', maxlength: '4' });

    body.append(
      el('div.sect', { style: { marginTop: isNew ? '0' : '22px' } },
        el('h2', { text: isNew ? 'The trip' : 'Edit the trip' })),
      field('Name', name),
      el('div.f2', {}, field('Cost', targetIn), field('Put aside', savedIn)),
      field('Emoji', emoji),
      el('button.btn' + (isNew ? '.primary' : '') + '.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            target: Number(targetIn.value) || 0,
            saved: Number(savedIn.value) || 0,
            emoji: emoji.value || '🎯',
            edited: true,
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

    return body;
  });
}
