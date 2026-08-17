// Shell: passphrase unlock → tab bar → hash router.

import * as store from './store.js';
import { el, clear, icon, ICONS, sheet, field, input, download, longDate } from './ui.js';

import home from './pages/home.js';
import account from './pages/account.js';
import paydays from './pages/paydays.js';
import pipeline from './pages/pipeline.js';
import debt from './pages/debt.js';
import goals from './pages/goals.js';

const root = document.getElementById('root');

const ROUTES = [
  { id: 'home', label: 'Home', icon: 'home', title: 'Taylor Family Money', render: home },
  { id: 'josh', label: 'Josh', icon: 'josh', title: 'Josh', render: (s) => account(s, 'josh'), tint: 'josh' },
  { id: 'laci', label: 'Laci', icon: 'laci', title: 'Laci', render: (s) => account(s, 'laci'), tint: 'laci' },
  { id: 'paydays', label: 'Paydays', icon: 'pay', title: 'Paydays vs. bills', render: paydays },
  { id: 'pipeline', label: 'Pipeline', icon: 'pipe', title: 'Coming down the pipe', render: pipeline },
  { id: 'debt', label: 'Debt', icon: 'debt', title: 'Debt attack plan', render: debt },
  { id: 'goals', label: 'Goals', icon: 'goal', title: 'Goals', render: goals },
];

const currentRoute = () => ROUTES.find((r) => r.id === location.hash.slice(1)) || ROUTES[0];

// ---- Lock screen -----------------------------------------------------------

function renderLock() {
  const pass = el('input', { type: 'password', placeholder: 'Passphrase', autocomplete: 'current-password', spellcheck: 'false' });
  const err = el('div.err');
  const go = el('button.go', { text: 'Unlock', type: 'button' });
  const inner = el('div.lock-inner', {},
    el('img.lock-mark', { src: './assets/img/icon-192.png', alt: '', width: '72', height: '72' }),
    el('h1', { text: 'Taylor Family Money' }),
    el('p', { text: 'Private. Everything stays on this device.' }),
    pass, go, err,
  );

  const submit = async () => {
    if (!pass.value) return;
    go.textContent = 'Unlocking…';
    go.disabled = true;
    try {
      await store.unlock(pass.value);
      renderApp();
      offerUpdate();
    } catch (e) {
      const missing = String(e.message || e).includes('vault.json');
      err.textContent = missing ? 'Could not load the vault file.' : 'That passphrase did not work.';
      inner.classList.add('shake');
      setTimeout(() => inner.classList.remove('shake'), 400);
      pass.value = '';
      pass.focus();
    } finally {
      go.textContent = 'Unlock';
      go.disabled = false;
    }
  };

  go.addEventListener('click', submit);
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  clear(root).append(el('div.lock', {}, inner));
  setTimeout(() => pass.focus(), 80);
}

// ---- App -------------------------------------------------------------------

function renderApp() {
  const state = store.get();
  if (!state) return renderLock();

  const route = currentRoute();
  const body = el('div.page');

  const shell = el('div.shell', {},
    el('header.topbar', {},
      el('h1', {}, route.title, el('span.sub', { text: subtitle(route, state) })),
      el('button.icon-btn', { text: '⋯', title: 'Settings', onclick: () => settingsSheet() }),
    ),
    body,
  );

  const tabs = el('nav.tabs', {}, ROUTES.map((r) =>
    el('button.tab' + (r.id === route.id ? '.on' : '') + (r.id === route.id && r.tint ? '.' + r.tint : ''), {
      type: 'button',
      onclick: () => { location.hash = r.id; },
    }, icon(ICONS[r.icon]), el('span', { text: r.label }))));

  clear(root).append(shell, tabs);
  body.append(route.render(state));
  window.scrollTo(0, 0);
}

function subtitle(route, state) {
  if (route.id === 'josh' || route.id === 'laci') {
    const a = state.accounts.find((x) => x.id === route.id);
    return a ? `${a.bank} ${a.product} ····${a.mask}` : '';
  }
  return `Updated ${longDate(state.updated)}`;
}

// ---- Data updates ----------------------------------------------------------

async function offerUpdate() {
  const update = await store.checkForUpdate();
  if (!update) return;
  sheet('Updated analysis available', (close) => el('div', {},
    el('p', { style: { margin: '0 0 14px', fontSize: '14px', lineHeight: '1.5' } },
      `A newer read of your statements has been published (v${update.version}). Loading it refreshes the accounts, income, recurring bills and debts.`),
    el('p.tiny', { style: { margin: '0 0 16px' } },
      'Your goals, pipeline, spend log, settings, any balances you filled in, and any question you already answered are all kept.'),
    el('button.btn.primary.wide', {
      type: 'button', text: 'Load it',
      onclick: async () => { await update.apply(); close(); },
    }),
    el('button.btn.wide.ghost', { type: 'button', text: 'Not now', style: { marginTop: '8px' }, onclick: close }),
  ));
}

// ---- Settings --------------------------------------------------------------

function settingsSheet() {
  sheet('Settings', (close) => {
    const saved = store.savedAt();
    const wrap = el('div');

    wrap.append(
      el('p.tiny', { text: saved ? `Last saved on this device ${new Date(saved).toLocaleString()}.` : 'Not yet saved on this device.' }),

      el('div.sect', {}, el('h2', { text: 'Backup' })),
      el('p.tiny', { text: 'The sealed file is safe to email, put in Drive, or commit — it is unreadable without the passphrase. The plain file is not: it is for your eyes only.' }),
      el('div.btnrow', { style: { marginTop: '10px' } },
        el('button.btn.sm', {
          text: 'Sealed backup', type: 'button',
          onclick: async () => download(await store.exportSealed(), `family-vault-${new Date().toISOString().slice(0, 10)}.json`),
        }),
        el('button.btn.sm.ghost', {
          text: 'Plain JSON', type: 'button',
          onclick: () => download(store.exportPlain(), `family-data-${new Date().toISOString().slice(0, 10)}.json`),
        }),
      ),

      el('div.sect', {}, el('h2', { text: 'Passphrase' })),
    );

    const p1 = input({ type: 'password', placeholder: 'New passphrase', autocomplete: 'new-password' });
    const msg = el('div.tiny');
    wrap.append(
      field('Change passphrase', p1),
      el('button.btn.sm', {
        text: 'Save passphrase', type: 'button',
        onclick: async () => {
          try { await store.changePassphrase(p1.value); msg.textContent = 'Changed. Use it next time you unlock.'; msg.className = 'tiny pos'; }
          catch (e) { msg.textContent = e.message; msg.className = 'tiny neg'; }
        },
      }),
      msg,

      el('div.sect', {}, el('h2', { text: 'Danger zone' })),
      el('p.tiny', { text: 'Wipes this device’s copy and every edit in it, then reloads from the file the app shipped with.' }),
      el('div.btnrow', { style: { marginTop: '10px' } },
        el('button.btn.sm.ghost', {
          text: 'Reset to shipped data', type: 'button',
          onclick: () => {
            if (!confirm('Delete this device’s data and start over from the shipped vault?')) return;
            store.resetToShipped();
            location.reload();
          },
        }),
        el('button.btn.sm.ghost', { text: 'Lock', type: 'button', onclick: () => { close(); store.lock(); renderLock(); } }),
      ),
    );

    return wrap;
  });
}

// ---- Boot ------------------------------------------------------------------

store.subscribe(() => { if (store.get()) renderApp(); });
window.addEventListener('hashchange', () => { if (store.get()) renderApp(); });

renderLock();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
