// Monthly check-in, the spending budget, and measured debt progress.
//
// There is no bank connection and there does not need to be one. Balances drift;
// the recurring list barely moves. So the app stays current on a handful of
// numbers typed once a month, and it says plainly when they are stale.

import * as store from '../store.js';
import { el, money, signed, stat, sheet, field, input, today, longDate, bar } from '../ui.js';
import { checkInStatus, spendingStatus, debtTotals, attackable, debtTrend } from '../calc.js';

// ---- Check-in --------------------------------------------------------------

export function checkInCard(state) {
  const s = checkInStatus(state);
  const tone = s.stale ? 'neg' : s.due ? 'warn' : 'pos';

  return el('div.card', { style: s.due ? { borderColor: s.stale ? 'var(--red)' : 'var(--gold)' } : {} },
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px' } }, '🗓 Monthly check-in'),
      el('div', { style: { marginLeft: 'auto' }, class: `tiny ${tone}` },
        s.days === null ? 'never run' : s.days === 0 ? 'today' : `${s.days} days ago`),
    ),
    el('p.tiny', { style: { margin: '0 0 12px' } },
      s.days === null
        ? 'A handful of numbers, about five minutes. Run it when your statements land and everything here stays true.'
        : s.stale
          ? 'These figures are old enough to be misleading now. The projections are only as good as the last time you typed a balance in.'
          : s.due
            ? 'Statements should have landed. Worth five minutes.'
            : 'Everything is current. Nothing to do.'),
    el('button.btn.sm.wide', {
      type: 'button', class: s.due ? 'btn sm wide primary' : 'btn sm wide',
      text: s.days === null ? 'Run the first check-in' : 'Run check-in',
      onclick: () => runCheckIn(state),
    }),
    s.count > 1 ? el('div.tiny', { style: { marginTop: '10px', textAlign: 'center' } }, `${s.count} check-ins recorded`) : null,
  );
}

export function runCheckIn(state) {
  sheet('Monthly check-in', (close) => {
    const wrap = el('div');
    wrap.append(el('p.tiny', { style: { margin: '0 0 16px' } },
      'Open each app, read the balance, type it here. Leave anything blank to keep what is already stored.'));

    const acctInputs = state.accounts.map((a) => {
      const i = input({ type: 'number', step: '0.01', inputmode: 'decimal', placeholder: String(a.balance.toFixed(2)) });
      wrap.append(field(`${a.owner} — ${a.bank}`, i));
      return { a, i };
    });

    wrap.append(el('div.sect', {}, el('h2', { text: 'Debt balances' })));
    const debtInputs = attackable(state).map((d) => {
      const i = input({ type: 'number', step: '0.01', inputmode: 'decimal', placeholder: String(d.balance.toFixed(2)) });
      wrap.append(field(d.name, i));
      return { d, i };
    });

    const note = el('textarea', { rows: '2', placeholder: 'Anything that changed this month?' });
    wrap.append(field('Notes', note));

    wrap.append(el('button.btn.primary.wide', {
      type: 'button', text: 'Save check-in',
      onclick: async () => {
        const num = (i) => (i.value.trim() === '' ? null : Number(i.value));
        await store.commit((s) => {
          const stamp = today();
          const balances = {};
          for (const { a, i } of acctInputs) {
            const v = num(i);
            const t = s.accounts.find((x) => x.id === a.id);
            // Remember where this leg started so the next check-in can measure
            // the burn between them.
            if (v !== null && t) { t.baselineBalance = v; t.balance = v; t.balanceAsOf = stamp; }
            balances[a.id] = t?.balance ?? 0;
          }
          const debts = {};
          for (const { d, i } of debtInputs) {
            const v = num(i);
            const t = s.debts.find((x) => x.id === d.id);
            if (v !== null && t) { t.balance = v; t.asOf = stamp; t.confidence = 'confirmed'; }
            debts[d.id] = t?.balance ?? 0;
          }
          s.checkIns ??= [];
          s.checkIns.push({
            date: stamp,
            balances,
            debts,
            totalDebt: Object.values(debts).reduce((x, y) => x + y, 0),
            note: note.value.trim() || undefined,
          });
        });
        close();
      },
    }));

    return wrap;
  });
}

// ---- Monthly spending ------------------------------------------------------

export function envelopeCard(state) {
  const sp = spendingStatus(state);
  if (!sp.budget) return el('div');

  const pace = sp.budget * (sp.dayOfMonth / sp.daysInMonth);
  const tone = sp.over > 0 ? 'neg' : sp.sent > pace ? 'warn' : 'pos';

  return el('div.card', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px' } }, '💸 Everyday spending'),
      el('div.tiny', { style: { marginLeft: 'auto' }, text: `${money(sp.budget)} a month` }),
    ),
    el('div.stats', {},
      stat('Sent so far', money(sp.sent), 'this month', tone),
      stat('Left to send', money(sp.remaining), `${sp.daysLeft} days to go`, sp.remaining > 0 ? '' : 'mut'),
    ),
    el('div', { style: { marginTop: '12px' } },
      bar(sp.sent / (sp.budget || 1), sp.over > 0 ? 'var(--red)' : 'var(--josh)'),
      el('div.tiny', { style: { marginTop: '6px' } },
        sp.over > 0
          ? `${money(sp.over)} over budget for the month.`
          : `Allocate money on the Debt tab — the month's budget fills first, then everything else goes at the highest rate.`)),
  );
}

// ---- Debt trend ------------------------------------------------------------

export function trendCard(state) {
  const t = debtTrend(state);
  if (!t) {
    return el('div.card', {},
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '6px' } }, '📉 Actual progress'),
      el('p.tiny', { style: { margin: 0 } },
        'Everything else on this page is a forecast. Once you have run two check-ins, this becomes the measured line — what the balances actually did, which is the only number that settles the argument.'));
  }

  const W = 320, H = 90, P = 6;
  const vals = t.points.map((p) => p.total);
  const min = Math.min(...vals) * 0.98;
  const max = Math.max(...vals) * 1.02;
  const x = (i) => P + (i / (t.points.length - 1)) * (W - P * 2);
  const y = (v) => P + (1 - (v - min) / (max - min || 1)) * (H - P * 2);
  const d = t.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'display:block;height:90px';
  svg.innerHTML = `<path d="${d}" fill="none" stroke="${t.change <= 0 ? '#2fbf78' : '#f4645f'}"
    stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;

  return el('div.card', {},
    el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '10px' } }, '📉 Actual progress'),
    svg,
    el('div.stats', { style: { marginTop: '12px' } },
      stat('Change', signed(-t.change), `over ${t.months} month${t.months === 1 ? '' : 's'}`, t.change <= 0 ? 'pos' : 'neg'),
      stat('Per month', signed(-t.perMonth), 'measured, not forecast', t.perMonth <= 0 ? 'pos' : 'neg'),
    ),
  );
}
