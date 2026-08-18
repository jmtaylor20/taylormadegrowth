// Tiny DOM + formatting helpers (no framework).

// Hyperscript: h('div', {class:'x', onclick:fn}, child, child)
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function money(n) {
  if (n == null || n === '') return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + (d.length <= 10 ? 'T00:00:00' : ''));
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// Like fmtDate, but appends the time of day when the value carries one (a full
// timestamp). Date-only values render exactly like fmtDate. Shown in local time.
export function fmtDateTime(d) {
  if (!d) return '';
  const hasTime = String(d).length > 10;
  const dt = new Date(d + (hasTime ? '' : 'T00:00:00'));
  const date = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (!hasTime) return date;
  const time = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '');
  return date + ' · ' + time;
}

// Parse a money/number field tolerantly: strips $, commas, spaces so "10,050.00",
// "$10,050" and "10050" all become 10050. Returns null when empty/invalid.
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '.' || s === '-') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

// Normalize a person's name to proper case by rule, since names get typed in a
// hurry: "john o'brien-smith" -> "John O'Brien-Smith", "mcdonald" -> "McDonald".
export function properName(s) {
  if (s == null) return s;
  const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);
  return String(s).trim().replace(/\s+/g, ' ').split(' ').map((word) => {
    // Capitalize across hyphens and apostrophes (keep the separators).
    const fixed = word.split(/([-'])/).map((p) => (p === '-' || p === "'" ? p : cap(p))).join('');
    return fixed.replace(/^Mc([a-z])/, (m, c) => 'Mc' + c.toUpperCase());
  }).join(' ');
}

// Proper-case a street address by rule: title-case words, keep directionals/state
// codes uppercase, leave number tokens (incl. ordinals like 21st) alone.
const ADDR_UPPER = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'NNE', 'NNW', 'SSE', 'SSW', 'ENE', 'ESE', 'WNW', 'WSW', 'US', 'PO', 'AL', 'GA', 'FL', 'TN', 'MS', 'SR', 'FM', 'CR', 'RR', 'NW.', 'SW.']);
export function properAddress(s) {
  if (s == null) return s;
  const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);
  return String(s).trim().replace(/\s+/g, ' ').split(' ').map((w) => {
    const bare = w.replace(/[.,]/g, '').toUpperCase();
    if (ADDR_UPPER.has(bare)) return w.toUpperCase();
    if (/\d/.test(w)) return w.toLowerCase();                 // 8686, 188, 21st, 36866
    return w.split(/([-'.])/).map((p) => (p === '-' || p === "'" || p === '.') ? p : cap(p)).join('');
  }).join(' ');
}

// Display name: the real customer name (proper-cased), or a clean "New lead"
// placeholder when we don't have one (hides legacy "Google LSA request" too).
function hasRealName(j) {
  const n = (j.customer_name || '').trim();
  return n && !/^google lsa/i.test(n);
}
export function custName(j) { return hasRealName(j) ? properName(j.customer_name) : 'New lead'; }
export function custFirst(j) { return hasRealName(j) ? properName(j.customer_name).split(' ')[0] : ''; }

// "today" / "1 day" / "5 days" since a timestamp — how long a lead has waited.
export function waitedLabel(ts) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : days + ' days';
}

// Toast notification.
let toastTimer;
export function toast(msg, kind = 'ok') {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.className = 'show ' + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 2600);
}

// A group of tap-to-toggle chips. Returns { node, get() } — get() reads selected.
export function chipGroup(options, selected = []) {
  const set = new Set(selected);
  const node = h('div', { class: 'chips' });
  options.forEach((opt) => {
    const chip = h('button', {
      type: 'button',
      class: 'chip' + (set.has(opt) ? ' on' : ''),
      onclick: () => {
        if (set.has(opt)) { set.delete(opt); chip.classList.remove('on'); }
        else { set.add(opt); chip.classList.add('on'); }
      },
    }, opt);
    node.append(chip);
  });
  return { node, get: () => options.filter((o) => set.has(o)) };
}

// A single-choice segmented control. Returns { node, get(), set(v) }.
export function segmented(options, value, onChange) {
  let current = value;
  const node = h('div', { class: 'segmented' });
  const btns = new Map();
  const paint = () => btns.forEach((b, v) => b.classList.toggle('on', v === current));
  options.forEach((opt) => {
    const label = typeof opt === 'string' ? opt : opt.label;
    const val = typeof opt === 'string' ? opt : opt.value;
    const b = h('button', {
      type: 'button', class: 'seg', onclick: () => { current = val; paint(); onChange && onChange(val); },
    }, label);
    btns.set(val, b); node.append(b);
  });
  paint();
  return { node, get: () => current, set: (v) => { current = v; paint(); } };
}

// ---- Icons ----------------------------------------------------------------
// Minimal monochrome line icons (inherit color via currentColor). Kept in one
// place so the whole app reads as one clean, professional set — no emoji.
const ICON_PATHS = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  hourglass: '<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.41L12 12l-4.41 4.42A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.41L12 12l4.41-4.42A2 2 0 0 0 17 6.17V2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18h-5"/><path d="M18 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.68-.95l-1.93-.64a1 1 0 0 1-.57-.5l-1.54-3.08A1 1 0 0 0 15.38 8H14"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  paid: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/>',
  droplet: '<path d="M12 2.5s6 6 6 10.5a6 6 0 0 1-12 0c0-4.5 6-10.5 6-10.5z"/>',
  import: '<path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  estimates: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  pending: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6M9 8h.01"/>',
  reports: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
};

// Icon markup (for innerHTML sinks like the tab bar).
export function iconSvg(name, size = 18) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}
// Icon element (for h(...) children).
export function icon(name, size = 18) {
  const tmp = document.createElement('span');
  tmp.innerHTML = iconSvg(name, size);
  return tmp.firstChild;
}
// A small icon + label pair for meta rows.
export function metaItem(name, text) { return h('span', { class: 'mi' }, icon(name, 14), text); }

// Pull-to-dismiss on a bottom sheet: drag the sheet (or its grab handle) down to
// close, like a native iOS sheet. Snaps back if not dragged far enough. Only
// engages when the sheet is scrolled to the top, so content still scrolls.
export function attachSheetDismiss(overlay, sheet, close) {
  let startY = 0, startX = 0, dy = 0, dragging = false, decided = false;
  const onStart = (e) => {
    if (sheet.scrollTop > 0) return;                 // let inner content scroll first
    if (e.target.closest('input, textarea, select')) return; // don't hijack field input
    const t = e.touches ? e.touches[0] : e;
    startY = t.clientY; startX = t.clientX; dy = 0; dragging = true; decided = false;
    sheet.style.transition = 'none';
  };
  const onMove = (e) => {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    dy = t.clientY - startY;
    if (!decided) {                                  // ignore mostly-horizontal swipes
      if (Math.abs(t.clientX - startX) > Math.abs(dy) && Math.abs(t.clientX - startX) > 8) { dragging = false; return; }
      if (Math.abs(dy) > 6) decided = true;
    }
    if (dy > 0 && sheet.scrollTop <= 0) {
      if (e.cancelable) e.preventDefault();          // stop the sheet's own rubber-banding
      sheet.style.transform = `translateY(${dy}px)`;
      overlay.style.background = `rgba(15,25,18,${(0.42 * Math.max(0, 1 - dy / 480)).toFixed(3)})`;
    }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = 'transform .2s ease';
    if (dy > 110) {
      sheet.style.transform = 'translateY(100%)';
      overlay.style.background = 'rgba(15,25,18,0)';
      setTimeout(close, 190);
    } else {
      sheet.style.transform = '';
      overlay.style.background = '';
    }
  };
  sheet.addEventListener('touchstart', onStart, { passive: true });
  sheet.addEventListener('touchmove', onMove, { passive: false });
  sheet.addEventListener('touchend', onEnd);
  sheet.addEventListener('touchcancel', onEnd);
  // Pointer fallback (desktop / non-touch), scoped to the grab handle so it never
  // fights with clicks on the sheet body.
  const grab = sheet.querySelector('.sheet-grab');
  if (grab && window.PointerEvent) {
    grab.style.touchAction = 'none';
    const pMove = (e) => onMove(e);
    const pUp = (e) => { onEnd(e); window.removeEventListener('pointermove', pMove); window.removeEventListener('pointerup', pUp); };
    grab.addEventListener('pointerdown', (e) => {
      onStart(e);
      window.addEventListener('pointermove', pMove);
      window.addEventListener('pointerup', pUp);
    });
  }
}

// Multi-day booking widget: a start date + a number of work days (consecutive,
// skipping weekends by default) plus any number of extra one-off days (which can be
// weekends). get() returns a sorted unique array of 'YYYY-MM-DD'. Pre-existing days
// beyond the first show as removable extra rows.
export function daysField(initialDays = []) {
  const days = (initialDays || []).slice().sort();
  const start = h('input', { class: 'input', type: 'date', value: days[0] || '' });
  const count = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: '1', placeholder: '1' });
  const extraWrap = h('div', { class: 'extra-days' });
  const addExtra = (val) => {
    const inp = h('input', { class: 'input', type: 'date', value: val || '' });
    const rowEl = h('div', { class: 'extra-day-row' }, inp,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove day', onclick: () => rowEl.remove() }, icon('x')));
    extraWrap.append(rowEl);
  };
  days.slice(1).forEach((d) => addExtra(d));
  const node = h('div', { class: 'days-field' },
    h('div', { class: 'row' }, field('Work date', start), field('Days', count, 'Skips weekends')),
    extraWrap,
    h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => addExtra() }, '＋ Add another day'),
  );
  function get() {
    const set = new Set();
    const s = start.value;
    if (s) {
      set.add(s);                                     // always include the chosen start day
      const n = Math.max(1, parseInt(count.value, 10) || 1);
      let d = new Date(s + 'T00:00:00'), added = 1, guard = 0;
      while (added < n && guard++ < 500) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;         // skip Sat/Sun
        set.add(fmtLocalDate(d)); added++;
      }
    }
    extraWrap.querySelectorAll('input[type="date"]').forEach((inp) => { if (inp.value) set.add(inp.value); });
    return [...set].sort();
  }
  return { node, get, start };
}
function fmtLocalDate(dt) { return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); }

export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}

// Native single-select (best mobile UX). Returns { node, get() }.
export function selectBox(options, value, onChange, placeholder) {
  const sel = h('select', { class: 'input select', onchange: (e) => onChange && onChange(e.target.value) });
  if (placeholder != null) {
    const p = h('option', { value: '' }, placeholder);
    if (!value) p.selected = true;
    sel.append(p);
  }
  options.forEach((o) => {
    const val = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    const opt = h('option', { value: val }, label);
    if (val === value) opt.selected = true;
    sel.append(opt);
  });
  return { node: sel, get: () => sel.value };
}

// Collapsible multi-select dropdown (tap to expand, check what applies).
// Returns { node, get() }.
export function multiSelect(options, selected = [], placeholder = 'Tap to choose…') {
  const set = new Set(selected);
  const summary = h('span', { class: 'ms-summary' });
  const caret = h('span', { class: 'ms-caret' }, '▾');
  const panel = h('div', { class: 'ms-panel' });
  const wrap = h('div', { class: 'ms' });

  const paint = () => {
    const arr = options.filter((o) => set.has(o));
    summary.textContent = arr.length ? `${arr.length} selected · ${arr.join(', ')}` : placeholder;
    summary.classList.toggle('placeholder', arr.length === 0);
  };
  const toggle = h('button', { type: 'button', class: 'ms-toggle', onclick: () => wrap.classList.toggle('open') }, summary, caret);

  options.forEach((o) => {
    const cb = h('input', { type: 'checkbox', onchange: (e) => { e.target.checked ? set.add(o) : set.delete(o); paint(); } });
    if (set.has(o)) cb.checked = true;
    panel.append(h('label', { class: 'ms-opt' }, cb, h('span', {}, o)));
  });

  wrap.append(toggle, panel);
  paint();
  return { node: wrap, get: () => options.filter((o) => set.has(o)) };
}
