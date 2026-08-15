// Entry point: PIN lock → responsive shell (sidebar / bottom tabs) → hash router.
import { APP_PIN } from './config.js';
import { CONFIGURED } from './db.js';
import { el, clear, iconSvg } from './ui.js';
import { renderClients } from './clients.js';
import { renderLeads } from './leads.js';
import { renderTasks } from './tasks.js';
import { renderFinancials } from './financials.js';
import { renderProposals } from './proposals.js';
import { renderReports } from './reports.js';
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
  { id: 'reports',    label: 'Reports',   icon: 'report',   render: renderReports },
];

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
  window.scrollTo(0, 0);
  try {
    await item.render(mainEl);
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
  sidebar.append(el('div.side-foot', {}, [
    el('button.side-logout', { onclick: lock, html: `<span class="ic">${iconSvg('logout', 18)}</span> Lock app` }),
  ]));

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

// ---- PIN lock -------------------------------------------------------------
function lock() {
  try { localStorage.removeItem('tmg_unlocked'); } catch {}
  location.hash = '';
  showLock();
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

// Always start locked — the PIN is required on every launch.
try { localStorage.removeItem('tmg_unlocked'); } catch {}
showLock();
