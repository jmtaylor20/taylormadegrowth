// Entry point: sign-in → responsive shell (sidebar / bottom tabs) → hash router.
//
// How you get in depends on the profile's AUTH_MODE:
//
//   'supabase'  a real staff session, and nothing else. The database grants
//               `anon` no policy and no grant, so an unsigned-in app cannot
//               read a single row — the gate is the database, not this file.
//   'pin'       the legacy client-side PIN, still present only for contractor
//               copies whose Supabase projects have not been migrated. It
//               protects nothing; it stands in for protection until they have
//               real auth. See config.js.
import { APP_PIN, AUTH_MODE, FEATURES } from './config.js';
import { CONFIGURED } from './db.js';
import { renderSignIn, resolveAccess, signOut, onSessionLost } from './auth.js';
import { el, clear, iconSvg, fmtElapsedMs } from './ui.js';
import { renderClients } from './clients.js';
import { renderLeads } from './leads.js';
import { renderTasks } from './tasks.js';
import { renderFinancials } from './financials.js';
import { renderProposals } from './proposals.js';
import { renderReports } from './reports.js';
import { renderTracker } from './tracker.js';
import { renderApprovals } from './approvals.js';
import { renderOnboarding } from './onboarding.js';
import { openClient } from './client-detail.js';

const root = document.getElementById('root');

// Six-tab operating pipeline. First four show in the mobile tab bar; the rest
// live in "More".
export const NAV = [
  { id: 'clients',    label: 'Clients',   icon: 'users',    img: '/app/assets/img/tab-brand.png', render: renderClients, primary: true },
  { id: 'leads',      label: 'Leads',     icon: 'funnel',   render: renderLeads,      primary: true },
  { id: 'tasks',      label: 'Tasks',     icon: 'tasks',    render: renderTasks,      primary: true },
  { id: 'financials', label: 'Money',     icon: 'wallet',   render: renderFinancials, primary: true },
  { id: 'proposals',  label: 'Proposals', icon: 'proposal', render: renderProposals },
  { id: 'onboarding', label: 'Onboarding', icon: 'send',     render: renderOnboarding },
  { id: 'reports',    label: 'Reports',   icon: 'report',   render: renderReports },
  { id: 'tracker',    label: 'Tracker',   icon: 'car',      render: renderTracker },
];

// Owner-only: the approvals queue for contractors' proposals & builds.
if (FEATURES.approvalsInbox) {
  NAV.push({ id: 'approvals', label: 'Approvals', icon: 'inbox', render: renderApprovals });
}

// A NAV item's glyph: its brand logo image when set, else a line icon.
function navGlyph(n, size) {
  return n.img ? `<img class="glyph-img" src="${n.img}" alt="" width="${size}" height="${size}">` : iconSvg(n.icon, size);
}

let mainEl;

function currentRoute() {
  const raw = location.hash.replace(/^#\//, '');
  const [id, arg] = raw.split('/');
  return { id: id || 'clients', arg };
}

async function route() {
  const { id, arg } = currentRoute();

  // Deep link to a client detail: #/client/<id>
  if (id === 'client' && arg) {
    highlight('clients');
    openClient(arg);
    return;
  }

  const item = NAV.find((n) => n.id === id) || NAV[0];
  highlight(item.id);
  clear(mainEl);
  if (!CONFIGURED) mainEl.append(configBanner());
  mainEl.scrollTop = 0;
  try {
    // Second segment of the hash, for pages that have a detail view of their
    // own (#/onboarding/<engagement id>). Pages that don't simply ignore it.
    await item.render(mainEl, arg);
  } catch (e) {
    console.error(e);
    mainEl.append(el('div.banner', { html: `<b>Couldn't load.</b> ${escapeHtml(e.message || e)}` }));
  }
}

function highlight(id) {
  document.querySelectorAll('[data-nav]').forEach((n) => n.classList.toggle('on', n.dataset.nav === id));
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function configBanner() {
  return el('div.banner', {
    html: '<b>Demo mode.</b> The database isn\'t connected yet — add your Supabase URL &amp; key in <code>config.js</code> to go live.',
  });
}

// ---- Shell ----------------------------------------------------------------
function buildShell() {
  clear(root);
  const layout = el('div.layout');

  // Sidebar (desktop)
  const sidebar = el('aside.sidebar', {}, [
    el('div.side-brand', {}, [el('img.side-logo', { src: './assets/img/logo-wordmark.png', alt: 'TaylorMade Brands' })]),
  ]);
  NAV.forEach((n) => sidebar.append(navLink(n, 'side-link')));
  const foot = el('div.side-foot');
  if (signedInAs) {
    foot.append(el('div.side-user', { text: signedInAs }));
    foot.append(el('button.side-logout', {
      onclick: endSession,
      html: `<span class="ic">${iconSvg('logout', 18)}</span> Sign out`,
    }));
  } else {
    foot.append(el('button.side-logout', {
      onclick: lock,
      html: `<span class="ic">${iconSvg('logout', 18)}</span> Lock app`,
    }));
  }
  sidebar.append(foot);

  // Main
  mainEl = el('main.main');

  // Bottom tab bar (mobile)
  const tabbar = el('nav.tabbar', { 'aria-label': 'Primary' });
  NAV.filter((n) => n.primary).forEach((n) => tabbar.append(tabLink(n)));
  tabbar.append(moreTab());

  layout.append(sidebar, mainEl, tabbar);
  root.append(layout);
}

function navLink(n, cls) {
  return el('a.' + cls, {
    href: '#/' + n.id, dataset: { nav: n.id },
    html: `<span class="ic">${navGlyph(n, 20)}</span> ${n.label}`,
  });
}
function tabLink(n) {
  return el('a.tab', {
    href: '#/' + n.id, dataset: { nav: n.id },
    html: `<span class="tab-ic">${navGlyph(n, 24)}</span><span>${n.label}</span>`,
  });
}
const BUILD = 'v43';
function moreTab() {
  const overflow = NAV.filter((n) => !n.primary);
  const tab = el('a.tab.tab-more', {
    href: 'javascript:void 0', dataset: { nav: '__more' },
    html: `<span class="tab-ic">${iconSvg('dots', 22)}</span><span>More</span>`,
    onclick: (e) => { e.preventDefault(); toggleMore(overflow); },
  });
  return tab;
}
function toggleMore(items) {
  const existing = document.getElementById('more-pop');
  if (existing) { existing.remove(); return; }
  const pop = el('div#more-pop.more-pop');
  items.forEach((n) => pop.append(el('a', {
    href: '#/' + n.id, dataset: { nav: n.id },
    html: `<span class="ic">${iconSvg(n.icon, 18)}</span> ${n.label}`,
    onclick: () => setTimeout(() => pop.remove(), 0),
  })));

  // Sign out lives here as well as in the sidebar, because the sidebar is
  // desktop-only. With the PIN gone this is the only way to end a session on a
  // phone, and a session you cannot end is a session you cannot hand back.
  pop.append(el('a.more-signout', {
    href: 'javascript:void 0',
    html: `<span class="ic">${iconSvg('logout', 18)}</span> ${signedInAs ? 'Sign out' : 'Lock app'}`,
    onclick: (e) => {
      e.preventDefault();
      pop.remove();
      if (signedInAs) endSession(); else lock();
    },
  }));
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;height:env(safe-area-inset-top);width:env(safe-area-inset-bottom)';
  document.body.appendChild(probe);
  const sat = Math.round(probe.offsetHeight); const sab = Math.round(probe.offsetWidth);
  probe.remove();
  const tb = document.querySelector('.tabbar');
  const r = tb ? tb.getBoundingClientRect() : { top: 0, bottom: 0 };
  const dbg = `sat${sat} sab${sab} iH${Math.round(window.innerHeight)} ch${document.documentElement.clientHeight} sc${(window.screen || {}).height || '-'} tbT${Math.round(r.top)} tbB${Math.round(r.bottom)}`;
  pop.append(el('div', { text: 'Build ' + BUILD + ' · ' + dbg, style: 'font-size:.58rem;color:var(--muted);padding:8px 10px 2px;text-align:center;border-top:1px solid var(--line);margin-top:4px;word-break:break-all' }));
  document.body.append(pop);
  setTimeout(() => document.addEventListener('click', function close(ev) {
    if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', close); }
  }), 0);
}

// ---- Boot -----------------------------------------------------------------
function boot() {
  document.body.classList.remove('locked');
  buildShell();
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/clients';
  route();
  registerSW();
  startTimerTicker();
  startAppHeight();
}

// Pin the app frame to the REAL visible height. iOS mis-measures 100dvh in a
// standalone PWA (leaving the tab bar floating), so we read the actual visual
// viewport height in JS and expose it as --app-height, updated on resize.
function setAppHeight() {
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', Math.round(h) + 'px');
}
let appHeightWired = false;
function startAppHeight() {
  setAppHeight();
  if (appHeightWired) return;
  appHeightWired = true;
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);
}

// Keep any live running-timer labels ticking every second.
let timerTick = null;
function startTimerTicker() {
  if (timerTick) return;
  timerTick = setInterval(() => {
    const nodes = document.querySelectorAll('.timer-live[data-start]');
    nodes.forEach((e) => { e.textContent = fmtElapsedMs(Date.now() - Date.parse(e.dataset.start)); });
  }, 1000);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return; reloading = true; window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => { reg.update(); setInterval(() => reg.update(), 60 * 60 * 1000); })
    .catch(() => {});
}

// ---- Access ---------------------------------------------------------------
// Set once a staff session is confirmed; drives the sidebar's sign-out control.
let signedInAs = null;

function lock() {
  try { localStorage.removeItem('tmg_unlocked'); } catch {}
  location.hash = '';
  showLock();
}

async function endSession() {
  await signOut();
  signedInAs = null;
  lock();
}

// Swap the lock screen for the email sign-in panel and back.
function showSignInScreen() {
  document.body.classList.add('locked');
  clear(root);
  const shell = el('div.lock');
  root.append(shell);
  renderSignIn(
    shell,
    (email) => { signedInAs = email; boot(); },
    AUTH_MODE === 'pin' ? () => showLock() : null,
  );
}

function showLock() {
  document.body.classList.add('locked');
  clear(root);
  const wrap = el('div.lock-wrap');
  const brand = el('img.lock-logo', { src: './assets/img/logo-mark.png', alt: 'TaylorMade Brands' });
  const tag = el('div.lock-tag', { text: 'TaylorMade Brands — Operating System' });
  const title = el('h1.lock-title', { text: 'Enter PIN' });
  const dots = el('div.pin-dots');
  const pad = el('div.pin-pad');
  let entry = '';
  const paint = () => { clear(dots); for (let i = 0; i < 4; i++) dots.append(el('span.pin-dot' + (i < entry.length ? '.on' : ''))); };
  const check = () => {
    // No persisted unlock — the PIN is required every time the app is opened.
    if (entry === String(APP_PIN)) { boot(); }
    else { wrap.classList.add('shake'); title.textContent = 'Wrong PIN — try again'; entry = ''; paint(); setTimeout(() => wrap.classList.remove('shake'), 420); }
  };
  const press = (n) => { if (entry.length >= 4) return; entry += n; paint(); if (entry.length === 4) setTimeout(check, 130); };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((k) => {
    if (k === '') { pad.append(el('span')); return; }
    pad.append(el('button.pin-key', { type: 'button', text: k, onclick: () => (k === '⌫' ? (entry = entry.slice(0, -1), paint()) : press(k)) }));
  });
  paint();
  wrap.append(brand, tag, title, dots, pad);
  const shell = el('div.lock', {}, [wrap]);
  root.append(shell);
}

// Start by asking whether there is already a staff session. A signed-in staff
// member goes straight in; anyone else — including a session that is not on
// the staff list, which resolveAccess() signs out — gets the lock screen.
//
// The old `tmg_unlocked` flag is cleared unconditionally: it is a leftover from
// a persisted-unlock experiment, and leaving it readable invites someone to
// wire it back up.
try { localStorage.removeItem('tmg_unlocked'); } catch {}

(async function start() {
  if (AUTH_MODE === 'pin') {
    // Contractor copy against an unmigrated project: nothing to sign in with.
    showLock();
    return;
  }

  // Losing the session must take the app back to the door rather than leaving
  // it rendering over queries that now return nothing.
  onSessionLost(() => { signedInAs = null; showSignInScreen(); });

  let access = { state: 'anonymous' };
  try {
    access = await resolveAccess();
  } catch (err) {
    // A failed check must not strand the app on a blank screen — show the door.
    console.warn('access check failed:', err);
  }

  if (access.state === 'staff') {
    signedInAs = access.email;
    boot();
    return;
  }

  showSignInScreen();

  if (access.state === 'unauthorized') {
    const title = document.querySelector('.lock-title');
    if (title) title.textContent = 'That account is not on the staff list';
  }
})();
