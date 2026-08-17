// Monthly check-in and the spending envelope.
//
// There is no bank connection and there does not need to be one. Balances drift;
// the recurring list barely moves. So the app stays current on about eight
// numbers typed once a month, and it tells you plainly when they are stale.

import * as store from '../store.js';
import { el, money, signed, stat, sheet, field, input, select, today, longDate, bar } from '../ui.js';
import { checkInStatus, envelopeStatus, envelopeTarget, debtTotals, attackable, debtTrend } from '../calc.js';

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
        ? 'Eight numbers, about five minutes. Run it when your statements land and everything here stays true.'
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

    const env = envelopeStatus(state);
    let envInput = null;
    if (env.configured) {
      wrap.append(el('div.sect', {}, el('h2', { text: 'Spending money' })));
      envInput = input({ type: 'number', step: '0.01', inputmode: 'decimal', placeholder: String(env.balance.toFixed(2)) });
      wrap.append(field('Venmo balance right now', envInput));
    }

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
            if (v !== null && t) { t.balance = v; t.balanceAsOf = stamp; }
            balances[a.id] = t?.balance ?? 0;
          }
          const debts = {};
          for (const { d, i } of debtInputs) {
            const v = num(i);
            const t = s.debts.find((x) => x.id === d.id);
            if (v !== null && t) { t.balance = v; t.asOf = stamp; t.confidence = 'confirmed'; }
            debts[d.id] = t?.balance ?? 0;
          }
          if (envInput) {
            const v = num(envInput);
            if (v !== null) { s.envelope.balance = v; s.envelope.asOf = stamp; }
          }
          s.checkIns ??= [];
          s.checkIns.push({
            date: stamp,
            balances,
            debts,
            totalDebt: Object.values(debts).reduce((x, y) => x + y, 0),
            envelope: s.envelope?.balance ?? null,
            note: note.value.trim() || undefined,
          });
        });
        close();
      },
    }));

    return wrap;
  });
}

// ---- Envelope --------------------------------------------------------------

export function envelopeCard(state) {
  const e = envelopeStatus(state);
  const t = envelopeTarget(state);

  if (!e.configured) {
    return el('div.card', {},
      el('div', { style: { fontWeight: '650', fontSize: '15px', marginBottom: '6px' } }, '💸 Spending money'),
      el('p', { style: { margin: '0 0 12px', fontSize: '14px', lineHeight: '1.5' } },
        t
          ? `You already know the trick — move the spare money somewhere separate and spend from there. It is worth restarting, because ${money(t.current)} a month currently leaves these accounts outside the bill schedule, and right now that number is discovered rather than decided.`
          : 'Move a set amount somewhere separate each payday and spend only from there.'),
      t && t.cut > 0
        ? el('p', { style: { margin: '0 0 12px', fontSize: '14px', lineHeight: '1.5' } },
            `To fund ${money(t.extra)} a month at the debt out of household income, this needs to land near ${money(t.target)} a month — a cut of about ${money(t.cut)}. Anything TaylorMade sends reduces that.`)
        : null,
      el('button.btn.sm.wide.primary', { type: 'button', text: 'Set it up', onclick: () => envelopeSheet(state) }),
    );
  }

  const pace = e.ahead;
  const tone = pace === null ? '' : pace < -e.perPeriod * 0.15 ? 'neg' : pace > 0 ? 'pos' : 'warn';

  return el('div.card', {},
    el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' } },
      el('div', { style: { fontWeight: '650', fontSize: '15px' } }, '💸 Spending money'),
      el('div.tiny', { style: { marginLeft: 'auto' } },
        `${money(e.perPeriod)} ${e.cadence === 'semimonthly' ? 'per payday' : 'per month'}`),
    ),
    el('div.stats', {},
      stat('In the envelope', money(e.balance), e.asOf ? `as of ${longDate(e.asOf)}` : 'not yet recorded', e.balance > 0 ? '' : 'neg'),
      stat('Days left', e.daysLeft === null ? '—' : String(e.daysLeft), 'in this period', ''),
    ),
    e.expected !== null
      ? el('div', { style: { marginTop: '12px' } },
          bar(e.balance / (e.perPeriod || 1), tone === 'neg' ? 'var(--red)' : 'var(--josh)'),
          el('div.tiny', { style: { marginTop: '6px' }, class: `tiny ${tone}` },
            pace >= 0
              ? `${money(pace)} ahead of an even burn — that is real slack, not luck.`
              : `${money(Math.abs(pace))} behind an even burn. At this rate the envelope empties before the next top-up.`))
      : null,
    el('div.btnrow', { style: { marginTop: '14px' } },
      el('button.btn.sm', { type: 'button', text: 'Top up', onclick: () => fundSheet(state) }),
      el('button.btn.sm.ghost', { type: 'button', text: 'Settings', onclick: () => envelopeSheet(state) }),
    ),
    t && t.current > 0
      ? el('p.tiny', { style: { margin: '12px 0 0' } },
          `Statements show ${money(t.current)} a month of unscheduled spending. Funding this envelope at ${money(e.perMonth)} a month is what turns that into a decision.`)
      : null,
  );
}

function envelopeSheet(state) {
  const e = envelopeStatus(state);
  const t = envelopeTarget(state);

  sheet('Spending money', (close) => {
    const suggested = t ? Math.round((t.target / (e.cadence === 'monthly' ? 1 : 2)) / 25) * 25 : 0;
    const per = input({ type: 'number', step: '25', inputmode: 'decimal', value: e.perPeriod || suggested || '' });
    const cadence = select([['semimonthly', 'Every payday (twice a month)'], ['monthly', 'Once a month']], e.cadence);
    const balance = input({ type: 'number', step: '0.01', inputmode: 'decimal', value: e.balance || '' });

    return el('div', {},
      t ? el('p.tiny', { style: { margin: '0 0 14px' } },
        `Suggested: about ${money(suggested)} per payday. That works back from ${money(t.current)} of current unscheduled spending, less the ${money(t.cut)} a month the debt plan needs.`) : null,
      field('Amount per top-up', per),
      field('How often', cadence),
      field('In the envelope right now', balance),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Save',
        onclick: async () => {
          await store.commit((s) => {
            s.envelope = {
              ...(s.envelope ?? {}),
              perPeriod: Number(per.value) || 0,
              cadence: cadence.value,
              balance: Number(balance.value) || 0,
              asOf: today(),
              funded: s.envelope?.funded ?? [],
            };
          });
          close();
        },
      }),
    );
  });
}

function fundSheet(state) {
  const e = envelopeStatus(state);
  sheet('Top up the envelope', (close) => {
    const amount = input({ type: 'number', step: '25', inputmode: 'decimal', value: e.perPeriod || '' });
    const from = select(state.accounts.map((a) => [a.id, `${a.owner} — ${a.bank}`]), state.accounts[0]?.id);
    const date = input({ type: 'date', value: today() });

    return el('div', {},
      el('p.tiny', { style: { margin: '0 0 14px' } },
        'Log the transfer once you have actually moved it. This resets the burn clock and drops the balance out of the checking account.'),
      field('Amount', amount),
      field('From', from),
      field('Date', date),
      el('button.btn.primary.wide', {
        type: 'button', text: 'Record top-up',
        onclick: async () => {
          const amt = Number(amount.value) || 0;
          if (!amt) return close();
          await store.commit((s) => {
            s.envelope ??= { perPeriod: amt, cadence: 'semimonthly', balance: 0, funded: [] };
            s.envelope.balance = (s.envelope.balance ?? 0) + amt;
            s.envelope.asOf = date.value || today();
            s.envelope.funded ??= [];
            s.envelope.funded.push({ date: date.value || today(), amount: amt, from: from.value });
            const acct = s.accounts.find((a) => a.id === from.value);
            if (acct) acct.balance = Math.max(0, acct.balance - amt);
          });
          close();
        },
      }),
    );
  });
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
