// Expenses tab — a manual IRS record: the mileage log and business expenses.
//
// Mileage is entered by hand (odometer or maps), not tracked automatically. Each
// row stores the MILES driven; the dollar deduction is computed at read time from
// MILEAGE_RATE in config.js, so correcting the rate never rewrites history wrong.
// The IRS wants date, miles, destination, and business purpose on every trip —
// that's exactly the four fields the mileage form asks for.
import { h, clear, money, fmtDate, todayStr, toast, field, selectBox, segmented, parseNum, icon, attachSheetDismiss } from './ui.js';
import { EXPENSE_CATEGORIES, TRIP_PURPOSES, MILEAGE_RATE, MILEAGE_RATE_YEAR } from './config.js';
import { expenseEntries, addExpense, deleteExpense } from './db.js';

let monthCursor = null;   // 'YYYY-MM'; null = current month

export function renderExpenses(root) {
  clear(root);
  const body = h('div', {}, h('div', { class: 'muted center' }, 'Loading…'));
  root.append(
    h('div', { class: 'view-head' },
      h('div', { class: 'head-row' },
        h('h1', {}, 'Expenses'),
        h('button', { class: 'add-btn', 'aria-label': 'Add entry', onclick: () => openEntry(() => renderExpenses(root)) }, '＋')),
      h('p', {}, 'Your mileage log and business spending, kept for taxes. Entered by hand.')),
    body);

  (async () => {
    let rows = [];
    try { rows = await expenseEntries(); } catch (err) { console.error(err); clear(body); body.append(h('div', { class: 'muted center' }, 'Could not load.')); return; }
    clear(body);
    paint(body, rows, () => renderExpenses(root));
  })();
}

function paint(body, rows, reload) {
  const month = monthCursor || todayStr().slice(0, 7);
  const inMonth = rows.filter((r) => (r.entry_date || '').slice(0, 7) === month);
  const mileage = inMonth.filter((r) => r.type === 'mileage');
  const spend = inMonth.filter((r) => r.type === 'expense');

  const miles = mileage.reduce((s, r) => s + (Number(r.miles) || 0), 0);
  const deduction = miles * MILEAGE_RATE;
  const spent = spend.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // Month navigator
  body.append(h('div', { class: 'month-bar' },
    h('button', { class: 'icon-btn', onclick: () => { monthCursor = shiftMonth(month, -1); reload(); }, 'aria-label': 'Previous month' }, '‹'),
    h('span', { class: 'month-label' }, monthName(month)),
    h('button', { class: 'icon-btn', onclick: () => { monthCursor = shiftMonth(month, 1); reload(); }, 'aria-label': 'Next month' }, '›')));

  body.append(h('div', { class: 'card' },
    h('div', { class: 'stat-grid' },
      stat('Miles driven', miles ? miles.toFixed(1) : '0', money(deduction) + ' deduction'),
      stat('Expenses', money(spent), spend.length + ' entr' + (spend.length === 1 ? 'y' : 'ies'))),
    h('p', { class: 'muted', style: 'margin-top:10px;font-size:13px' },
      `Mileage valued at $${MILEAGE_RATE.toFixed(3)}/mile (IRS standard rate, ${MILEAGE_RATE_YEAR}). Update it in config.js each January.`)));

  // Expenses by category, biggest first — what the year-end summary is built from.
  if (spend.length) {
    const byCat = {};
    spend.forEach((r) => { byCat[r.category || 'Other'] = (byCat[r.category || 'Other'] || 0) + (Number(r.amount) || 0); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const catCard = h('div', { class: 'card' }, h('h2', { class: 'card-title' }, 'By category'));
    cats.forEach(([c, v]) => catCard.append(h('div', { class: 'dl-row' },
      h('span', { class: 'dl-k' }, c), h('span', { class: 'dl-v' }, money(v)))));
    body.append(catCard);
  }

  if (!inMonth.length) {
    body.append(h('div', { class: 'empty' },
      h('p', {}, 'Nothing logged for ' + monthName(month) + '.'),
      h('p', { class: 'muted' }, 'Tap ＋ to add a trip or an expense.')));
    return;
  }

  if (mileage.length) {
    body.append(h('div', { class: 'group-head' }, 'Mileage log', h('span', { class: 'group-count' }, mileage.length)));
    mileage.forEach((r) => body.append(entryCard(r, reload)));
  }
  if (spend.length) {
    body.append(h('div', { class: 'group-head' }, 'Expenses', h('span', { class: 'group-count' }, spend.length)));
    spend.forEach((r) => body.append(entryCard(r, reload)));
  }
}

function entryCard(r, reload) {
  const isMiles = r.type === 'mileage';
  const title = isMiles ? (r.destination || r.purpose || 'Trip') : (r.vendor || r.category || 'Expense');
  const value = isMiles ? Number(r.miles || 0).toFixed(1) + ' mi' : money(r.amount);
  const sub = isMiles
    ? [r.purpose, money((Number(r.miles) || 0) * MILEAGE_RATE) + ' deduction'].filter(Boolean).join(' · ')
    : (r.category || '');
  return h('div', { class: 'job-card col' },
    h('div', { class: 'job-card-hit static' },
      h('div', { class: 'job-card-top' },
        h('span', { class: 'job-name' }, title),
        h('span', { class: 'job-amount' }, value)),
      h('div', { class: 'job-sub' }, fmtDate(r.entry_date) + (sub ? ' · ' + sub : '')),
      r.note ? h('div', { class: 'job-note' }, r.note) : null),
    h('div', { class: 'card-actions' },
      h('button', { class: 'qa sm', onclick: () => remove(r, reload) }, icon('trash'), 'Delete')));
}

async function remove(r, reload) {
  if (!confirm('Delete this entry?')) return;
  try { await deleteExpense(r.id); toast('Deleted'); reload(); }
  catch (err) { console.error(err); toast('Could not delete', 'err'); }
}

// ---- Add sheet: one form, two modes ----
function openEntry(onSaved) {
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const sheet = h('div', { class: 'sheet' });
  const close = () => { document.body.style.overflow = ''; overlay.remove(); };

  const kind = segmented([{ value: 'mileage', label: 'Mileage' }, { value: 'expense', label: 'Expense' }], 'mileage', () => sync());
  const date = h('input', { class: 'input', type: 'date', value: todayStr() });

  // Mileage fields
  const milesI = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'e.g. 42.5' });
  const destI = h('input', { class: 'input', type: 'text', placeholder: 'Where to (address or job site)' });
  const purpose = selectBox(TRIP_PURPOSES, 'Job site', null);
  const deductNote = h('div', { class: 'variance-box muted' }, 'Enter miles to see the deduction');
  milesI.addEventListener('input', () => {
    const m = parseNum(milesI.value);
    deductNote.textContent = m ? money(m * MILEAGE_RATE) + ' deduction at $' + MILEAGE_RATE.toFixed(3) + '/mile' : 'Enter miles to see the deduction';
    deductNote.className = 'variance-box' + (m ? '' : ' muted');
  });
  const mileBox = h('div', {},
    field('Miles driven', milesI, 'Round trip. Odometer or the maps app — whichever you use.'),
    field('Deduction', deductNote),
    field('Destination', destI),
    field('Business purpose', purpose.node));

  // Expense fields
  const amountI = h('input', { class: 'input input-amount', type: 'text', inputmode: 'decimal', placeholder: '0' });
  const category = selectBox(EXPENSE_CATEGORIES, '', null, 'Choose a category');
  const vendorI = h('input', { class: 'input', type: 'text', placeholder: 'Who you paid' });
  const spendBox = h('div', {},
    field('Amount', h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix' }, '$'), amountI)),
    field('Category', category.node),
    field('Vendor', vendorI));

  const note = h('textarea', { class: 'input', rows: '2', placeholder: 'Note (optional)' });
  const saveBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Save entry');

  function sync() {
    const m = kind.get() === 'mileage';
    mileBox.style.display = m ? 'block' : 'none';
    spendBox.style.display = m ? 'none' : 'block';
  }

  saveBtn.onclick = async () => {
    const isMiles = kind.get() === 'mileage';
    const payload = { type: isMiles ? 'mileage' : 'expense', entry_date: date.value || todayStr(), note: note.value.trim() || null };
    if (isMiles) {
      const m = parseNum(milesI.value);
      if (!m || m <= 0) { toast('Enter the miles driven', 'err'); milesI.focus(); return; }
      if (!destI.value.trim()) { toast('Add where you drove — the IRS wants it', 'err'); destI.focus(); return; }
      payload.miles = m;
      payload.destination = destI.value.trim();
      payload.purpose = purpose.get() || null;
    } else {
      const a = parseNum(amountI.value);
      if (!a || a <= 0) { toast('Enter an amount', 'err'); amountI.focus(); return; }
      if (!category.get()) { toast('Pick a category', 'err'); return; }
      payload.amount = a;
      payload.category = category.get();
      payload.vendor = vendorI.value.trim() || null;
    }
    saveBtn.disabled = true;
    try { await addExpense(payload); toast('Saved'); close(); onSaved && onSaved(); }
    catch (err) { console.error(err); toast('Could not save', 'err'); saveBtn.disabled = false; }
  };

  sheet.append(
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Add entry'), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, icon('x'))),
    h('div', { class: 'card' }, field('Type', kind.node), field('Date', date)),
    h('div', { class: 'card' }, mileBox, spendBox, field('Note', note)),
    h('div', { class: 'sheet-actions' }, saveBtn));
  overlay.append(sheet); document.body.append(overlay); document.body.style.overflow = 'hidden';
  attachSheetDismiss(overlay, sheet, close);
  sync();
}

function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-val' }, String(value)), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null);
}
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthName(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
