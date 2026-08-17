// Tiny DOM toolkit + formatters. No framework — el() builds everything.

export function el(spec, props = {}, ...kids) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className = [node.className, v].filter(Boolean).join(' ');
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

// ---- Money & dates ---------------------------------------------------------

export const money = (n, cents = false) => (n < 0 ? '-' : '') + '$' + Math.abs(n ?? 0).toLocaleString('en-US', {
  minimumFractionDigits: cents ? 2 : 0,
  maximumFractionDigits: cents ? 2 : 0,
});

export const signed = (n) => (n >= 0 ? '+' : '−') + money(Math.abs(n));

export const pct = (n, d = 0) => `${(n ?? 0).toFixed(d)}%`;

export const ord = (d) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const parseDay = (iso) => new Date(iso + 'T12:00:00');

export const shortDate = (iso) => parseDay(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const longDate = (iso) => parseDay(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const monthsBetween = (from, to) => {
  const a = parseDay(from), b = parseDay(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
};

export const today = () => new Date().toISOString().slice(0, 10);

// ---- Components ------------------------------------------------------------

export const stat = (k, v, s, cls = '') =>
  el('div.stat', {}, el('div.k', { text: k }), el('div.v' + (cls ? '.' + cls : ''), { text: v }), s ? el('div.s', { text: s }) : null);

export const section = (title, right) =>
  el('div.sect', {}, el('h2', { text: title }), right ? el('div.rt', { text: right }) : null);

export function bar(fraction, color) {
  return el('div.bar', {}, el('i', { style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, background: color } }));
}

export function splitBar(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return el('div.split', {}, parts.filter((p) => p.value > 0).map((p) =>
    el('i', { style: { width: `${(p.value / total) * 100}%`, background: p.color }, title: p.label })));
}

export function legend(parts, fmt = money) {
  return el('div.legend', {}, parts.filter((p) => p.value > 0).map((p) =>
    el('div', {}, el('i', { style: { background: p.color } }), `${p.label} `, el('b', { text: fmt(p.value) }))));
}

// Bottom sheet. `body(close)` returns the content; resolve by calling close().
export function sheet(title, body) {
  const scrim = el('div.scrim');
  const close = () => scrim.remove();
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  const panel = el('div.sheet', {}, el('h3', { text: title }), body(close));
  scrim.append(panel);
  document.body.append(scrim);
  const first = panel.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 60);
  return close;
}

export const field = (label, input) => el('label.f', {}, el('span', { text: label }), input);

export const input = (props = {}) => el('input', { type: 'text', ...props });

export const select = (opts, value, props = {}) =>
  el('select', props, opts.map((o) => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    return el('option', { value: v, selected: String(v) === String(value) }, t);
  }));

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const icon = (d) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = d;
  return svg;
};

export const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  josh: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  laci: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  pay: '<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><path d="M6.5 14.5h4"/>',
  pipe: '<path d="M3 6h18"/><path d="M6 12h12"/><path d="M10 18h4"/>',
  debt: '<path d="M4 19V5"/><path d="M4 15l5-5 4 4 7-8"/>',
  goal: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  what: '<path d="M3 17.5 9 11l4 4 8-8.5"/><path d="M15.5 6.5H21V12"/>',
};
