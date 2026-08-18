// Completed tab — jobs finished and waiting on payment. Send the invoice from here;
// marking a job paid in full clears it from the app (and sends the thank-you email)
// while keeping the record and its Drive PDFs.
import { h, clear, money, fmtDate, custName, toast, icon, field, parseNum, attachSheetDismiss } from './ui.js';
import { completedJobs, updateJob } from './db.js';
import { openJob } from './sheet.js';

export function renderCompleted(root) {
  clear(root);
  const body = h('div', {}, h('div', { class: 'muted center' }, 'Loading…'));
  root.append(
    h('div', { class: 'view-head' }, h('h1', {}, 'Completed'),
      h('p', {}, 'Finished jobs awaiting payment. Mark one paid and it clears from the app — the record and PDFs are kept.')),
    body,
  );

  async function load() {
    try {
      const jobs = await completedJobs();
      clear(body);
      if (!jobs.length) {
        body.append(h('div', { class: 'empty' },
          h('p', {}, 'All caught up.'),
          h('p', { class: 'muted' }, 'Completed jobs show here until they’re marked paid.')));
        return;
      }
      const outstanding = jobs.reduce((s, j) => s + balanceOf(j), 0);
      const partial = jobs.filter((j) => paidOf(j) > 0).length;
      body.append(h('div', { class: 'card' },
        h('div', { class: 'stat-grid' },
          stat('Awaiting payment', String(jobs.length), 'job' + (jobs.length !== 1 ? 's' : '') + (partial ? ' · ' + partial + ' partial' : '')),
          stat('Outstanding', money(outstanding), 'left to collect'))));
      jobs.forEach((j) => body.append(paidCard(j, load)));
    } catch (err) { console.error(err); clear(body); body.append(h('div', { class: 'muted center' }, 'Could not load.')); }
  }
  load();
}

function amountOf(j) { return Number(j.final_cost != null ? j.final_cost : (j.estimate_amount != null ? j.estimate_amount : 0)); }
function paidOf(j) { return Math.min(Math.max(Number(j.amount_paid) || 0, 0), amountOf(j)); }
function balanceOf(j) { return Math.max(amountOf(j) - paidOf(j), 0); }

function paidCard(j, reload) {
  const dateStr = j.completed_at || j.scheduled_date || j.updated_at;
  const invoiced = j.invoice_email_status === 'sent';
  const total = amountOf(j);
  const down = paidOf(j);
  const partial = down > 0;
  return h('div', { class: 'job-card col' },
    h('button', { type: 'button', class: 'job-card-hit', onclick: () => openJob(j, reload) },
      h('div', { class: 'job-card-top' },
        h('span', { class: 'job-name' }, custName(j)),
        h('span', { class: 'job-amount' }, money(partial ? balanceOf(j) : total))),
      h('div', { class: 'job-sub' }, 'Completed ' + fmtDate(dateStr)),
      partial ? h('div', { class: 'job-note note-inline pay-note' }, icon('paid', 14),
        'Paid ' + money(down) + ' of ' + money(total) + ' · ' + money(balanceOf(j)) + ' left') : null,
      invoiced ? h('div', { class: 'job-note note-inline' }, icon('mail', 14), 'Invoice sent') : null),
    h('div', { class: 'card-actions' },
      j.phone ? h('a', { class: 'qa sm', href: 'tel:' + j.phone, 'aria-label': 'Call' }, icon('phone')) : null,
      j.phone ? h('a', { class: 'qa sm', href: 'sms:' + j.phone, 'aria-label': 'Text' }, icon('message')) : null,
      h('button', { class: 'qa sm', onclick: () => sendInvoice(j, reload) }, icon('mail'), invoiced ? 'Resend' : 'Invoice'),
      h('button', { class: 'qa sm', onclick: () => recordPayment(j, reload) }, icon('paid'), 'Payment'),
      h('button', { class: 'qa sm primary', onclick: () => markPaid(j, reload) }, icon('check'), 'Paid in full')),
  );
}

async function sendInvoice(j, reload) {
  if (!j.email) { toast('No email on file — add one on the job first', 'err'); return; }
  if (!confirm(`Email an invoice for ${money(amountOf(j))} to ${custName(j)} at ${j.email}?`)) return;
  try {
    await updateJob(j.id, { invoice_email_status: 'queued' });
    toast('Invoice emailing to ' + custName(j).split(' ')[0]);
    reload();
  } catch (err) { console.error(err); toast('Could not send', 'err'); }
}

async function markPaid(j, reload) {
  const bal = balanceOf(j);
  const msg = paidOf(j) > 0
    ? `Settle the remaining ${money(bal)} for ${custName(j)} and mark paid in full?\n\nThis clears the job from the app. The record and its PDFs are kept.`
    : `Mark ${custName(j)} — ${money(amountOf(j))} — as paid?\n\nThis clears the job from the app. The record and its PDFs are kept.`;
  if (!confirm(msg)) return;
  try {
    await settle(j, amountOf(j), true);
    toast('Marked paid');
    reload();
  } catch (err) { console.error(err); toast('Could not update', 'err'); }
}

// Record a payment against a job — a partial down-payment or the final balance.
// When the running total reaches the job cost, it's paid off and clears the tab.
function recordPayment(j, reload) {
  const total = amountOf(j);
  const bal = balanceOf(j);
  const amount = h('input', { class: 'input input-amount', type: 'text', inputmode: 'decimal', placeholder: '0' });
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const sheet = h('div', { class: 'sheet' });
  const save = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Record payment');
  save.onclick = async () => {
    const amt = parseNum(amount.value);
    if (!amt || amt <= 0) { toast('Enter an amount', 'err'); amount.focus(); return; }
    save.disabled = true;
    const newTotal = Math.min(paidOf(j) + amt, total);
    try {
      await settle(j, newTotal, newTotal >= total - 0.005);
      toast(newTotal >= total - 0.005 ? 'Paid in full' : 'Payment recorded');
      close(); reload();
    } catch (err) { console.error(err); toast('Could not save', 'err'); save.disabled = false; }
  };
  sheet.append(
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Record a payment'), h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
    h('div', { class: 'card' },
      h('p', { class: 'muted', style: 'margin-bottom:10px' }, custName(j) + ' · ' + money(paidOf(j)) + ' of ' + money(total) + ' collected · ' + money(bal) + ' left'),
      field('Amount received', h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix' }, '$'), amount)),
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => { amount.value = String(bal); } }, 'Balance in full (' + money(bal) + ')')),
    h('div', { class: 'sheet-actions' }, save));
  overlay.append(sheet); document.body.append(overlay); document.body.style.overflow = 'hidden';
  attachSheetDismiss(overlay, sheet, close);
  function close() { document.body.style.overflow = ''; overlay.remove(); }
}

// Write the running paid total; when it clears the cost, mark paid + queue thank-you.
async function settle(j, newAmountPaid, payOff) {
  const patch = { amount_paid: Math.round(newAmountPaid * 100) / 100, last_payment_at: new Date().toISOString() };
  if (payOff) {
    patch.paid = true;
    patch.paid_at = new Date().toISOString();
    if (!j.thankyou_email_status) patch.thankyou_email_status = j.email ? 'queued' : 'skipped';
  }
  await updateJob(j.id, patch);
}

function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'stat-val' }, String(value)), h('div', { class: 'stat-label' }, label), sub ? h('div', { class: 'stat-sub' }, sub) : null);
}
