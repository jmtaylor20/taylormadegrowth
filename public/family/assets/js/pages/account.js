// Josh (Regions) / Laci (Wells Fargo) — dashboard on top, recurring beneath,
// then the metrics that actually change a decision.

import * as store from '../store.js';
import {
  el, money, signed, ord, stat, section, splitBar, legend, sheet, field, input, select,
  shortDate, today, longDate,
} from '../ui.js';
import {
  recurringFor, recurringTotals, byCategory, leftover, monthlyIncome, upsideIncome,
  forAccount, isBusiness, colorFor, pipelineSummary, monthlySetAside, actuals,
  endedFor, cancelList,
} from '../calc.js';

const CATEGORIES = ['Housing', 'Debt', 'Insurance', 'Utilities', 'Kids', 'Transport', 'Subscriptions', 'Health', 'Business', 'Other'];

export default function account(state, id) {
  const acct = state.accounts.find((a) => a.id === id);
  const wrap = el('div');
  if (!acct) return el('div.empty', { text: 'Account not found.' });

  const { income, household, business, left } = leftover(state, id);
  const rows = recurringFor(state, id);
  const asks = rows.filter((r) => r.question && !r.answered);

  // ---- Dashboard -----------------------------------------------------------

  wrap.append(
    el('div.card.hero', {},
      el('div.label', { text: 'Balance' }),
      el('div.big', { text: money(acct.balance, true) }),
      el('div.note', { text: `${acct.bank} · as of ${longDate(acct.balanceAsOf)}` }),
    ),
  );

  const upside = upsideIncome(state, id);
  wrap.append(el('div.stats', {},
    stat('Income in', money(income), 'per month, take-home', 'pos'),
    stat('Recurring out', money(household + business), `${rows.length} bills`, 'neg'),
    stat('Left over', money(left), 'before groceries & gas', left < 0 ? 'neg' : left < 500 ? 'warn' : 'pos'),
    stat('Bill load', `${income > 0 ? Math.round(((household + business) / income) * 100) : 0}%`,
      'of income already committed', (household + business) / (income || 1) > 0.8 ? 'neg' : 'warn'),
  ));

  if (upside > 0) {
    wrap.append(el('p.tiny', { style: { margin: '10px 2px 0' } },
      `Not counted above: ${money(upside)} of irregular deposits (${forAccount(state.income, id).filter((i) => i.excludeFromPlan).map((i) => i.name).join(', ')}). The plan holds without them — anything that lands is ahead of plan.`));
  }

  // ---- Where it goes -------------------------------------------------------

  const cats = byCategory(state, id, { includeBusiness: true });
  wrap.append(section('Where it goes', `${money(household + business)}/mo`));
  wrap.append(el('div.card', {}, splitBar(cats), legend(cats)));

  // ---- Bill calendar -------------------------------------------------------

  wrap.append(section('When it hits', 'day of month'));
  wrap.append(el('div.card', {}, billCalendar(rows), el('p.tiny', { style: { marginTop: '12px', marginBottom: 0 } },
    heaviestWeek(rows, income))));

  // ---- Questions -----------------------------------------------------------

  if (asks.length) {
    wrap.append(section('Need your read', `${asks.length} to confirm`));
    const box = el('div.card.flush', {});
    for (const r of asks) {
      box.append(
        el('div.row', {},
          el('div.day', { text: '?' }),
          el('div.mid', {}, el('div.nm', {}, el('span.t', { text: r.name })), el('div.meta', { text: `${money(r.amount, true)} · ${r.category}` })),
        ),
        el('div.qbox', {}, r.question, ' ',
          el('button.btn.sm', {
            text: 'Answer', type: 'button', style: { marginTop: '8px', display: 'block' },
            onclick: () => editRecurring(state, r),
          }),
        ),
      );
    }
    wrap.append(box);
  }

  // ---- Recurring -----------------------------------------------------------

  let mode = 'date';
  const listCard = el('div.card.flush');
  const paint = () => {
    listCard.replaceChildren();
    (mode === 'date' ? byDate(state, rows) : byCat(state, rows)).forEach((n) => listCard.append(n));
  };

  wrap.append(section('Recurring', `${money(household + business)}/mo`));
  const seg = el('div.seg', { style: { marginBottom: '10px' } },
    ...['date', 'category'].map((m) => el('button' + (m === mode ? '.on' : ''), {
      type: 'button', text: m === 'date' ? 'By date' : 'By category',
      onclick: (e) => {
        mode = m;
        [...seg.children].forEach((c) => c.classList.toggle('on', c === e.currentTarget));
        paint();
      },
    })));
  wrap.append(seg, listCard);
  paint();

  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Add a recurring bill', type: 'button', style: { marginTop: '10px' },
    onclick: () => editRecurring(state, null, id),
  }));

  // ---- Decided to cut ------------------------------------------------------

  const cutting = cancelList(state, id);
  if (cutting.length) {
    const total = cutting.reduce((s, r) => s + r.amount, 0);
    wrap.append(section('Decided to cut', `${money(total)}/mo`));
    const c = el('div.card.flush');
    for (const r of cutting) {
      c.append(el('div.row', {},
        el('div.day', { text: '✕', style: { color: 'var(--gold)' } }),
        el('div.mid', {}, el('div.nm', {}, el('span.t', { text: r.name })),
          el('div.meta', { text: r.note ?? 'Still being charged.' })),
        el('div', { style: { textAlign: 'right' } },
          el('div.amt', { text: money(r.amount, true) }),
          el('div.tiny', { text: `${money(r.amount * 12)}/yr` })),
      ));
      if (r.howTo?.length) {
        c.append(el('div', { style: { padding: '0 16px 14px' } },
          el('div.tiny', { style: { marginBottom: '6px' } }, 'How to kill it:'),
          el('ol', { style: { margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: '1.55', color: 'var(--ink-2)' } },
            r.howTo.map((step) => el('li', { text: step, style: { marginBottom: '5px' } })))));
      }
    }
    c.append(el('div', { style: { padding: '12px 16px' } },
      el('button.btn.sm.wide', {
        type: 'button', text: 'Mark as cancelled',
        onclick: async () => {
          if (!confirm('Mark these as cancelled and take them out of the plan?')) return;
          await store.commit((s) => {
            for (const r of s.recurring) if (r.action === 'cancel') { r.paused = true; delete r.action; }
          });
        },
      })));
    wrap.append(c);
    wrap.append(el('p.tiny', { style: { margin: '8px 2px 0' } },
      `Still leaving the account until you actually cancel. ${money(total * 12)} a year once done.`));
  }

  // ---- No longer running ---------------------------------------------------

  const ended = endedFor(state, id);
  if (ended.length) {
    const saved = ended.reduce((s, r) => s + r.amount, 0);
    wrap.append(section('No longer running', `${money(saved)}/mo off`));
    const c = el('div.card.flush');
    for (const r of ended) {
      c.append(el('button.row', { type: 'button', onclick: () => editRecurring(state, r) },
        el('div.day', { text: '✓', style: { background: 'rgba(47,191,120,.16)', color: 'var(--josh)' } }),
        el('div.mid', {},
          el('div.nm', {}, el('span.t.strike', { text: r.name })),
          el('div.meta', { text: r.note ?? 'Stopped.' })),
        el('div.amt.mut.strike', { text: money(r.amount, true) }),
      ));
    }
    wrap.append(c);
    wrap.append(el('p.tiny', { style: { margin: '8px 2px 0' } },
      `${money(saved)} a month that used to leave this account and no longer does — ${money(saved * 12)} a year. Tap any of them to put one back if it restarts.`));
  }

  // ---- Business commingling ------------------------------------------------

  if (business > 0) {
    const bizRows = rows.filter(isBusiness);
    wrap.append(section('Business money in a personal account'));
    wrap.append(el('div.card', {},
      el('p', { style: { margin: '0 0 10px', fontSize: '14px' } },
        `${money(business)}/mo of TaylorMade spend runs through this account — ${bizRows.map((r) => r.name).join(', ')}. Moving it to the business card does two things: it makes what the family actually costs legible, and it puts the deduction where your accountant can find it.`),
      el('div.stats', {},
        stat('Household bills', money(household), 'the real number', ''),
        stat('Business bills', money(business), 'move these off', 'mut'),
      ),
    ));
  }

  // ---- What's coming -------------------------------------------------------

  const pipe = forAccount(state.pipeline, id).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
  if (pipe.length) {
    wrap.append(section('Coming down the pipe', `${money(pipe.reduce((s, p) => s + monthlySetAside(p), 0))}/mo to be ready`));
    const c = el('div.card.flush');
    for (const p of pipe) {
      c.append(el('div.row', {},
        el('div.day', { text: shortDate(p.due).split(' ')[0] }),
        el('div.mid', {}, el('div.nm', {}, el('span.t', { text: p.name })),
          el('div.meta', { text: `${shortDate(p.due)} · set aside ${money(monthlySetAside(p))}/mo` })),
        el('div.amt', { text: money(p.amount) }),
      ));
    }
    wrap.append(c);
  }

  // ---- Statement history ---------------------------------------------------

  wrap.append(section('Statement history'));
  const tbl = el('table.tbl', {},
    el('thead', {}, el('tr', {},
      el('th', { text: 'Period' }), el('th.r', { text: 'In' }), el('th.r', { text: 'Out' }), el('th.r', { text: 'Net' }), el('th.r', { text: 'Close' }))),
    el('tbody', {}, acct.statements.map((s) => {
      const net = s.in - s.out;
      return el('tr', {},
        el('td', { text: s.period }),
        el('td.r.pos', { text: money(s.in) }),
        el('td.r.neg', { text: money(s.out) }),
        el('td.r', { text: signed(net), class: net >= 0 ? 'pos' : 'neg' }),
        el('td.r', { text: money(s.close) }));
    })),
  );
  wrap.append(el('div.card.flush', {}, tbl));

  const net3 = acct.statements.reduce((s, x) => s + (x.in - x.out), 0);
  wrap.append(el('p.tiny', { style: { margin: '8px 2px 0' } },
    net3 < 0
      ? `Across these statements the account ran ${money(Math.abs(net3))} behind — more went out than came in. That gap is what the debt plan has to close.`
      : `Across these statements the account finished ${money(net3)} ahead.`));

  // ---- Planned vs actual ---------------------------------------------------

  const act = actuals(state, id);
  if (act) {
    wrap.append(section('Off the plan', 'monthly average'));
    wrap.append(el('div.card', {},
      el('div.stats', {},
        stat('Leaves per month', money(act.avgOut), 'per the statements', 'neg'),
        stat('Not on the list', money(act.unplanned), 'unscheduled spending', 'warn'),
      ),
      el('p', { style: { margin: '12px 0 0', fontSize: '14px', lineHeight: '1.5' } },
        `${money(act.recurring)} of that is the recurring above. The other ${money(act.unplanned)} is groceries, fuel, eating out and one-offs — ${Math.round((act.unplanned / (act.avgOut || 1)) * 100)}% of everything leaving this account.`),
      act.sinceEnded > 0
        ? el('p.tiny', { style: { margin: '10px 0 0' } },
            `These averages come from statements that predate your recent changes, so ${money(act.sinceEnded)} of now-cancelled bills has been credited back out of the unplanned figure. Next month's statement is the one that will confirm it.`)
        : null,
      act.nonPayrollIn > 400
        ? el('p', { style: { margin: '10px 0 0', fontSize: '14px', lineHeight: '1.5' } },
            `${money(act.nonPayrollIn)} a month lands here beyond payroll. Without it this account does not balance.`)
        : null,
    ));
  }

  // ---- Spend log -----------------------------------------------------------

  wrap.append(section('Spend log', 'optional'));
  const logged = state.log.filter((l) => l.account === id).slice(-6).reverse();
  const logCard = el('div.card.flush');
  if (logged.length) {
    for (const l of logged) {
      logCard.append(el('div.row', {},
        el('div.day', { text: shortDate(l.date).split(' ')[1] }),
        el('div.mid', {}, el('div.nm', {}, el('span.t', { text: l.name })), el('div.meta', { text: `${shortDate(l.date)} · ${l.category}` })),
        el('div.amt', { text: money(l.amount, true) }),
      ));
    }
  } else {
    logCard.append(el('div.empty', { text: 'Nothing logged. Only worth using for the off-plan stuff you want to remember — the recurring is already tracked above.' }));
  }
  wrap.append(logCard);
  wrap.append(el('button.btn.wide.ghost', {
    text: '+ Log a one-off', type: 'button', style: { marginTop: '10px' },
    onclick: () => logSheet(id),
  }));

  return wrap;
}

// ---- Row rendering ---------------------------------------------------------

function recurringRow(state, r) {
  const flags = el('span', { style: { display: 'contents' } });
  if (r.confidence === 'unsure') flags.append(el('span.flag.ask', { text: 'ASK' }));
  else if (r.confidence === 'likely') flags.append(el('span.flag.guess', { text: 'GUESS' }));
  if (r.variable) flags.append(el('span.flag.var', { text: 'VARIES' }));
  if (isBusiness(r)) flags.append(el('span.flag.biz', { text: 'BIZ' }));
  if (r.reimbursed) flags.append(el('span.flag', { text: 'REIMBURSED', style: { background: 'rgba(47,191,120,.16)', color: 'var(--josh)' } }));
  if (r.action === 'cancel') flags.append(el('span.flag.ask', { text: 'CANCELLING' }));

  const meta = [r.category, r.day ? `${ord(r.day)} of the month` : null, r.observed ? `seen ${r.observed.length}×` : null]
    .filter(Boolean).join(' · ');

  return el('button.row', {
    type: 'button',
    onclick: () => editRecurring(state, r),
  },
    el('div.day', { text: r.day ?? '–' }),
    el('div.mid', {},
      el('div.nm', {}, el('span.t', { text: r.name }), flags),
      el('div.meta', { text: meta }),
    ),
    el('div.amt', { text: money(r.amount, true), class: isBusiness(r) ? 'mut' : '' }),
  );
}

function byDate(state, rows) {
  return rows.map((r) => recurringRow(state, r));
}

function byCat(state, rows) {
  const out = [];
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.category)) groups.set(r.category, []);
    groups.get(r.category).push(r);
  }
  const sorted = [...groups.entries()].sort((a, b) =>
    b[1].reduce((s, r) => s + r.amount, 0) - a[1].reduce((s, r) => s + r.amount, 0));

  for (const [cat, items] of sorted) {
    const sum = items.reduce((s, r) => s + r.amount, 0);
    out.push(el('div.row', { style: { background: 'var(--bg-raise)' } },
      el('div.day', { style: { background: colorFor(cat), color: '#08131f' }, text: items.length }),
      el('div.mid', {}, el('div.nm', {}, el('span.t', { text: cat }))),
      el('div.amt', { text: money(sum) }),
    ));
    items.sort((a, b) => b.amount - a.amount).forEach((r) => out.push(recurringRow(state, r)));
  }
  return out;
}

// ---- Bill calendar ---------------------------------------------------------

function billCalendar(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (!r.day) continue;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.amount);
  }
  const max = Math.max(1, ...byDay.values());
  const nowDay = new Date().getDate();

  const cal = el('div.cal');
  for (let d = 1; d <= 31; d += 1) {
    const amt = byDay.get(d) ?? 0;
    const cls = ['d', amt > 0 ? 'has' : '', amt > max * 0.4 ? 'big' : '', d === nowDay ? 'today' : ''].filter(Boolean).join(' ');
    cal.append(el('div', { class: cls, title: amt ? `${ord(d)}: ${money(amt)}` : ord(d) }, String(d)));
  }
  return cal;
}

// The week that hurts: which 7-day stretch of the month carries the most.
function heaviestWeek(rows, income) {
  const days = Array(32).fill(0);
  for (const r of rows) if (r.day) days[r.day] += r.amount;
  let best = { start: 1, sum: 0 };
  for (let s = 1; s <= 25; s += 1) {
    const sum = days.slice(s, s + 7).reduce((a, b) => a + b, 0);
    if (sum > best.sum) best = { start: s, sum };
  }
  const share = income > 0 ? Math.round((best.sum / income) * 100) : 0;
  return `Heaviest stretch is the ${ord(best.start)}–${ord(best.start + 6)}: ${money(best.sum)} leaves in seven days, about ${share}% of the month's income. Keep that much parked before it starts.`;
}

// ---- Editors ---------------------------------------------------------------

function editRecurring(state, r, accountId) {
  const isNew = !r;
  const draft = r ?? {
    id: store.uid('r'), account: accountId, name: '', amount: 0, day: 1,
    category: 'Other', confidence: 'confirmed',
  };

  sheet(isNew ? 'Add recurring bill' : draft.name, (close) => {
    const name = input({ value: draft.name, placeholder: 'Name' });
    const amount = input({ type: 'number', step: '0.01', value: draft.amount, inputmode: 'decimal' });
    const day = input({ type: 'number', min: '1', max: '31', value: draft.day ?? 1, inputmode: 'numeric' });
    const cat = select(CATEGORIES, draft.category);
    const note = el('textarea', { rows: '2', placeholder: 'Note (optional)' });
    note.value = draft.note ?? '';

    const body = el('div');

    if (draft.question && !draft.answered) {
      body.append(el('div.qbox', { style: { margin: '0 0 14px' } }, el('b', { text: 'Question: ' }), draft.question));
    }

    if (draft.observed?.length) {
      body.append(el('p.tiny', { style: { margin: '0 0 14px' } },
        'Seen: ' + draft.observed.map((o) => `${shortDate(o.date)} ${money(o.amount, true)}`).join(' · ')));
    }

    body.append(
      field('Name', name),
      el('div.f2', {}, field('Amount', amount), field('Day of month', day)),
      field('Category', cat),
      field('Note', note),
    );

    const pauseBtn = !isNew && el('button.btn.sm.ghost', {
      type: 'button', text: draft.paused ? 'Resume' : 'Pause (cancelled)',
      onclick: async () => {
        await store.commit((s) => {
          const t = s.recurring.find((x) => x.id === draft.id);
          if (t) t.paused = !t.paused;
        });
        close();
      },
    });

    const delBtn = !isNew && el('button.btn.sm.ghost', {
      type: 'button', text: 'Delete', style: { color: 'var(--red)' },
      onclick: async () => {
        if (!confirm(`Delete ${draft.name}?`)) return;
        await store.commit((s) => { s.recurring = s.recurring.filter((x) => x.id !== draft.id); });
        close();
      },
    });

    body.append(
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          const patch = {
            name: name.value.trim() || draft.name,
            amount: Number(amount.value) || 0,
            day: Math.min(31, Math.max(1, Number(day.value) || 1)),
            category: cat.value,
            note: note.value.trim() || undefined,
            answered: draft.question ? true : undefined,
            confidence: draft.question ? 'confirmed' : draft.confidence,
          };
          await store.commit((s) => {
            const t = s.recurring.find((x) => x.id === draft.id);
            if (t) Object.assign(t, patch);
            else s.recurring.push({ ...draft, ...patch });
          });
          close();
        },
      }),
      (pauseBtn || delBtn) && el('div.btnrow', { style: { marginTop: '8px' } }, pauseBtn, delBtn),
    );

    return body;
  });
}

function logSheet(accountId) {
  sheet('Log a one-off', (close) => {
    const name = input({ placeholder: 'What was it?' });
    const amount = input({ type: 'number', step: '0.01', inputmode: 'decimal', placeholder: '0.00' });
    const date = input({ type: 'date', value: today() });
    const cat = select(CATEGORIES, 'Other');

    return el('div', {},
      el('p.tiny', { style: { margin: '0 0 14px' } },
        'For the things worth remembering — a repair, a trip, a surprise bill. Day-to-day groceries and gas are not worth typing in; the leftover number already accounts for them.'),
      field('What', name),
      el('div.f2', {}, field('Amount', amount), field('Date', date)),
      field('Category', cat),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          if (!name.value.trim() || !Number(amount.value)) return close();
          await store.commit((s) => s.log.push({
            id: store.uid('l'), account: accountId, name: name.value.trim(),
            amount: Number(amount.value), date: date.value, category: cat.value,
          }));
          close();
        },
      }),
    );
  });
}
