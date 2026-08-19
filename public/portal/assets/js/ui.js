// Minimal DOM toolkit for the portal.
//
// Deliberately not the ops app's ui.js. That one carries badges, sheets, stat
// tiles and a CRM's worth of vocabulary the portal has no use for, and importing
// it would tie a client-facing page to the staff app's path. This is the handful
// of helpers the portal actually needs.

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
    else if (k in node && k !== 'list' && k !== 'style') { try { node[k] = v; } catch { node.setAttribute(k, v); } }
    else node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

let toastTimer;
export function toast(msg, tone = 'ok') {
  let t = document.getElementById('toast');
  if (!t) { t = el('div#toast.toast'); document.body.append(t); }
  t.className = 'toast show ' + tone;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

export function fmtDate(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** A bare date does not land. "Due in 3 days" does. */
export function dueLabel(iso) {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso + 'T00:00:00');
  const days = Math.round((due - today) / 86400000);
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  if (days < 0) return { text: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, tone: 'late' };
  if (days <= 3) return { text: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'soon' };
  return { text: `Due ${fmtDate(iso)}`, tone: 'ok' };
}

export function spinner(label = 'Loading…') {
  return el('div.loading', {}, [el('div.spinner'), el('span', { text: label })]);
}

/** Debounce, so autosave fires when someone stops typing rather than per key. */
export function debounce(fn, ms = 700) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
