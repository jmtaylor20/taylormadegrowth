// Shared UI toolkit: DOM builder, icons, formatters, badges, toasts,
// modal sheet, and form-field factories. Everything visual funnels through here
// so the whole app stays consistent.

// ---- tiny DOM builder ------------------------------------------------------
// el('div.card#id', { onclick }, [children | 'text'])
export function el(spec, props = {}, kids = []) {
  const [tagAndId, ...classes] = spec.split('.');
  const [tag, id] = tagAndId.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node && k !== 'list') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

// ---- formatters ------------------------------------------------------------
export const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
export const money2 = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtDate(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtDateShort(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function daysUntil(d) {
  if (!d) return null;
  const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt)) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((dt - t) / 86400000);
}
export function relDue(d) {
  const n = daysUntil(d);
  if (n == null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n}d overdue`;
  return `in ${n}d`;
}

// ---- badges ----------------------------------------------------------------
export function badge(label, tone = 'gray') {
  return el('span.badge.badge-' + tone, { text: label });
}
// Look up {key,label,tone} vocab entries from config and render a badge.
export function statusBadge(vocab, key) {
  const item = (vocab || []).find((v) => v.key === key) || { label: key, tone: 'gray' };
  return badge(item.label, item.tone);
}
export const labelOf = (vocab, key) => (vocab.find((v) => v.key === key) || {}).label || key;

// ---- toast -----------------------------------------------------------------
let toastTimer;
export function toast(msg, tone = 'ok') {
  let t = document.getElementById('toast');
  if (!t) { t = el('div#toast.toast'); document.body.append(t); }
  t.className = 'toast show ' + tone;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

// ---- modal sheet -----------------------------------------------------------
// openSheet({ title, body: node, actions: [{label, tone, onClick}], wide })
export function openSheet({ title, body, actions = [], wide = false, onClose }) {
  closeSheet();
  const overlay = el('div#sheet-overlay.overlay');
  const sheet = el('div.sheet' + (wide ? '.sheet-wide' : ''));
  const head = el('div.sheet-head', {}, [
    el('h2.sheet-title', { text: title || '' }),
    el('button.icon-btn', { type: 'button', title: 'Close', onclick: () => closeSheet(onClose), html: iconSvg('x', 22) }),
  ]);
  const content = el('div.sheet-body', {}, [body]);
  const foot = actions.length ? el('div.sheet-foot') : null;
  actions.forEach((a) => {
    foot.append(el('button.btn.btn-' + (a.tone || 'ghost'), {
      type: 'button', text: a.label,
      onclick: async (ev) => { const r = a.onClick?.(ev); if (r instanceof Promise) await r; },
    }));
  });
  sheet.append(head, content); if (foot) sheet.append(foot);
  overlay.append(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(onClose); });
  document.body.append(overlay);
  document.body.classList.add('no-scroll');
  return { overlay, sheet, body: content, close: () => closeSheet(onClose) };
}
export function closeSheet(onClose) {
  const o = document.getElementById('sheet-overlay');
  if (o) o.remove();
  document.body.classList.remove('no-scroll');
  if (typeof onClose === 'function') onClose();
}

export function confirmDialog(message, { confirmLabel = 'Delete', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    const { close } = openSheet({
      title: 'Are you sure?',
      body: el('p.confirm-msg', { text: message }),
      actions: [
        { label: 'Cancel', tone: 'ghost', onClick: () => { close(); resolve(false); } },
        { label: confirmLabel, tone, onClick: () => { close(); resolve(true); } },
      ],
    });
  });
}

// ---- form field factories --------------------------------------------------
// Each returns a wrapper node; read values from the returned `.input` refs via
// buildForm below, which collects them into a plain object.
export function field(label, control, hint) {
  return el('label.field', {}, [
    el('span.field-label', { text: label }),
    control,
    hint ? el('span.field-hint', { text: hint }) : null,
  ]);
}

export function textInput(name, value = '', { placeholder = '', type = 'text' } = {}) {
  return el('input.input', { name, value: value ?? '', placeholder, type });
}
export function numberInput(name, value = '', { placeholder = '', step = '0.01', min } = {}) {
  return el('input.input', { name, value: value ?? '', placeholder, type: 'number', step, min });
}
export function dateInput(name, value = '') {
  return el('input.input', { name, value: value || '', type: 'date' });
}
export function textArea(name, value = '', { placeholder = '', rows = 3 } = {}) {
  return el('textarea.input.textarea', { name, placeholder, rows }, [value || '']);
}
export function selectInput(name, options, value) {
  const sel = el('select.input.select', { name });
  options.forEach((o) => {
    const opt = typeof o === 'string' ? { key: o, label: o } : o;
    const node = el('option', { value: opt.key }, [opt.label]);
    if (String(opt.key) === String(value)) node.selected = true;
    sel.append(node);
  });
  return sel;
}
export function checkbox(name, checked = false) {
  return el('input.checkbox', { name, type: 'checkbox', checked: !!checked });
}

// Multi-select chip control. Returns node; read selected via node._value().
export function chipSelect(name, options, selected = []) {
  const set = new Set(selected || []);
  const wrap = el('div.chipset', { name });
  options.forEach((o) => {
    const opt = typeof o === 'string' ? { key: o, label: o } : o;
    const chip = el('button.chip' + (set.has(opt.key) ? '.on' : ''), {
      type: 'button', text: opt.label,
      onclick: () => { if (set.has(opt.key)) { set.delete(opt.key); chip.classList.remove('on'); } else { set.add(opt.key); chip.classList.add('on'); } },
    });
    wrap.append(chip);
  });
  wrap._value = () => [...set];
  return wrap;
}

// Collect a { name: value } object from a container of inputs.
export function readForm(container) {
  const out = {};
  container.querySelectorAll('input, select, textarea, .chipset').forEach((n) => {
    const name = n.getAttribute('name'); if (!name) return;
    if (n.classList.contains('chipset')) out[name] = n._value();
    else if (n.type === 'checkbox') out[name] = n.checked;
    else if (n.type === 'number') out[name] = n.value === '' ? null : Number(n.value);
    else out[name] = n.value === '' ? null : n.value;
  });
  return out;
}

// ---- misc UI bits ----------------------------------------------------------
export function emptyState(msg, icon = 'inbox') {
  return el('div.empty', {}, [el('div.empty-icon', { html: iconSvg(icon, 40) }), el('p', { text: msg })]);
}
export function sectionTitle(text, right) {
  return el('div.section-title', {}, [el('h3', { text }), right || null]);
}
export function statTile(label, value, sub, tone) {
  return el('div.stat' + (tone ? '.stat-' + tone : ''), {}, [
    el('div.stat-value', { text: value }),
    el('div.stat-label', { text: label }),
    sub ? el('div.stat-sub', { text: sub }) : null,
  ]);
}
export function pageHeader(title, subtitle, action) {
  return el('div.page-head', {}, [
    el('div', {}, [el('h1.page-title', { text: title }), subtitle ? el('p.page-sub', { text: subtitle }) : null]),
    action || null,
  ]);
}
export function primaryBtn(label, onClick, icon) {
  return el('button.btn.btn-primary', { type: 'button', onclick: onClick }, [
    icon ? el('span.btn-ic', { html: iconSvg(icon, 18) }) : null, label,
  ]);
}

// ---- icons (inline SVG, stroke = currentColor) -----------------------------
const P = {
  dashboard: '<path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6V11h-6v9zm0-16v5h6V4h-6z"/>',
  pipeline: '<path d="M3 5h18M6 12h12M10 19h4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>',
  build: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/>',
  tasks: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  money: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  content: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  proposal: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  renew: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  report: '<path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  star: '<path d="M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.7l1.8-7.3L1.5 9.5 9 8.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.5A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.5z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/>',
  location: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  ads: '<path d="M3 11h3l7-5v14l-7-5H3z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
};
export function iconSvg(name, size = 24) {
  const body = P[name] || P.dashboard;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
