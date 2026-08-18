// Entry point: PIN lock, hash router, and bottom tab bar.
import { APP_PIN } from './config.js';
import { iconSvg } from './ui.js';
import { renderEstimates } from './estimates.js';
import { renderEstimate } from './estimate.js';
import { renderNewJob } from './newjob.js';
import { renderPending } from './pending.js';
import { renderScheduled } from './scheduled.js';
import { renderCompleted } from './completed.js';
import { renderExpenses } from './expenses.js';
import { renderReports } from './reports.js';

const app = document.getElementById('app');

const TABS = [
  { id: 'estimates', label: 'Estimates', icon: 'estimates', render: renderEstimates },
  { id: 'pending', label: 'Pending', icon: 'pending', render: renderPending },
  { id: 'scheduled', label: 'Schedule', icon: 'calendar', render: renderScheduled },
  { id: 'completed', label: 'Completed', icon: 'done', render: renderCompleted },
  { id: 'expenses', label: 'Expenses', icon: 'dollar', render: renderExpenses },
  { id: 'reports', label: 'Reports', icon: 'reports', render: renderReports },
];

function route() {
  const id = location.hash.replace('#/', '') || 'estimates';
  // Non-tab forms: highlight the tab they belong to.
  if (id === 'new') {
    app.className = 'view view-new';
    renderEstimate(app);
    document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('on', el.dataset.id === 'estimates'));
    window.scrollTo(0, 0);
    return;
  }
  if (id === 'new-job') {
    app.className = 'view view-new';
    renderNewJob(app);
    document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('on', el.dataset.id === 'scheduled'));
    window.scrollTo(0, 0);
    return;
  }
  const tab = TABS.find((t) => t.id === id) || TABS[0];
  app.className = 'view view-' + tab.id;
  tab.render(app);
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('on', el.dataset.id === tab.id));
  window.scrollTo(0, 0);
}

function buildTabBar() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = '';
  TABS.forEach((t) => {
    const a = document.createElement('a');
    a.href = '#/' + t.id;
    a.className = 'tab';
    a.dataset.id = t.id;
    a.innerHTML = `<span class="tab-icon">${iconSvg(t.icon, 23)}</span><span class="tab-label">${t.label}</span>`;
    bar.append(a);
  });
}

function boot() {
  document.body.classList.remove('locked');
  buildTabBar();
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  route();
  registerSW();
}

// Keep the home-screen app on the latest version automatically.
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return; reloading = true;      // a newer version took over
    window.location.reload();                      // swap to it, once
  });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update();                                // check for an update every launch
      setInterval(() => reg.update(), 60 * 60 * 1000);
    })
    .catch(() => {});
}

// ---- PIN lock (light gate) ----
function showLock() {
  document.body.classList.add('locked');
  app.className = 'view lock';
  app.innerHTML = '';
  let entry = '';
  const dots = document.createElement('div'); dots.className = 'pin-dots';
  const paint = () => { dots.innerHTML = ''; for (let i = 0; i < 4; i++) { const d = document.createElement('span'); d.className = 'pin-dot' + (i < entry.length ? ' on' : ''); dots.append(d); } };
  const wrap = document.createElement('div'); wrap.className = 'lock-wrap';
  const title = document.createElement('h1'); title.className = 'lock-title'; title.textContent = 'Enter PIN';
  const pad = document.createElement('div'); pad.className = 'pin-pad';

  const press = (n) => {
    if (entry.length >= 4) return;
    entry += n; paint();
    if (entry.length === 4) setTimeout(check, 120);
  };
  const check = () => {
    if (entry === APP_PIN) { try { localStorage.setItem('wcf_unlocked', '1'); } catch {} boot(); }
    else { wrap.classList.add('shake'); title.textContent = 'Wrong PIN — try again'; entry = ''; paint(); setTimeout(() => wrap.classList.remove('shake'), 400); }
  };
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((k) => {
    if (k === '') { pad.append(document.createElement('span')); return; }
    const b = document.createElement('button'); b.className = 'pin-key'; b.textContent = k; b.type = 'button';
    b.onclick = () => (k === '⌫' ? (entry = entry.slice(0, -1), paint()) : press(k));
    pad.append(b);
  });

  paint();
  wrap.append(title, dots, pad);
  app.append(wrap);
}

let unlocked = false;
try { unlocked = localStorage.getItem('wcf_unlocked') === '1'; } catch {}
if (unlocked) boot(); else showLock();
