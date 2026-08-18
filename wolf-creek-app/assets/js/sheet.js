// Shared bottom-sheet editor + reschedule modal. Used across Estimates, Pending,
// Schedule, Completed, Reports.
import { h, clear, money, fmtDate, toast, field, selectBox, segmented, multiSelect, daysField, todayStr, custName, properName, properAddress, parseNum, icon, attachSheetDismiss } from './ui.js';
import { STATUS_CHOICES, SERVICES, SITE_CONDITIONS, HOURS_RESULTS, LEAD_TIMES, RESCHEDULE_REASONS, RESCHEDULE_CORRECTION, CITIES, CITY_ZIP, isLost, isLead } from './config.js';
import { updateJob, deleteJob, scheduledJobs } from './db.js';
import { conflictsFor, confirmConflicts, jobDays } from './sched.js';

// openJob(job, onChange, opts?) — opts.focus: 'quote'|'visit'|'schedule'|'complete'; opts.presetStatus.
export function openJob(job, onChange, opts = {}) {
  const j = { ...job };
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const sheet = h('div', { class: 'sheet' });
  overlay.append(sheet);
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  function close() { document.body.style.overflow = ''; overlay.remove(); }
  function done() { close(); onChange && onChange(); }

  const status = selectBox(STATUS_CHOICES, opts.presetStatus || j.status, () => syncBoxes());
  const lostNotes = h('input', { class: 'input', type: 'text', placeholder: 'Lost note (optional)', value: j.lost_notes || '' });
  const lostBox = h('div', { class: 'sub-box' }, field('Lost detail', lostNotes));

  // ---- Customer details (editable everywhere — e.g. add a name to a job that
  //      came in without one) ----
  const nameI = h('input', { class: 'input', type: 'text', placeholder: 'Customer name', value: j.customer_name || '' });
  const phoneI = h('input', { class: 'input', type: 'tel', placeholder: 'Phone', value: j.phone || '' });
  const emailI = h('input', { class: 'input', type: 'email', placeholder: 'Email', value: j.email || '' });
  const addressI = h('input', { class: 'input', type: 'text', placeholder: 'Street address', value: j.address || '' });
  const cityBox = selectBox(CITIES, j.city || '', null, 'City');
  const acresI = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Acres', value: j.acres != null ? j.acres : '' });
  const customerCard = card('Customer',
    field('Name', nameI),
    row(field('Phone', phoneI), field('Email', emailI)),
    field('Street address', addressI),
    row(field('City', cityBox.node), field('Acres', acresI, 'Optional')),
  );

  // ---- Scope (editable at any stage — the work often changes on site) ----
  const services = multiSelect(SERVICES, j.services || [], 'Work needed…');
  const conditions = multiSelect(SITE_CONDITIONS, j.site_conditions || [], 'Site conditions…');

  // ---- Quote (leads / quoted) ----
  const amount = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Estimate amount', value: j.estimate_amount || '' });
  const estHours = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Est. hours', value: j.estimated_hours || '' });
  const leadTime = selectBox(LEAD_TIMES, j.lead_time || '', null, 'Lead time');
  const scope = h('textarea', { class: 'input', rows: '3', placeholder: 'Scope of work (goes in the estimate email)', html: j.scope_notes || '' });
  const quoteBtn = h('button', { class: 'btn btn-primary btn-block', onclick: quoteAndSend }, icon('mail'), 'Quote & send estimate');
  const quoteBox = h('div', {},
    field('Work needed', services.node),
    field('Site conditions', conditions.node),
    row(field('Estimate amount', h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix' }, '$'), amount)), field('Est. hours', estHours)),
    field('Lead time', leadTime.node),
    field('Scope of work', scope),
    quoteBtn,
    j.estimate_email_status === 'sent' ? h('div', { class: 'muted note-inline', style: 'margin-top:6px' }, icon('check', 15), 'Estimate emailed to customer') : null,
    j.quote_pdf_url ? h('a', { class: 'muted note-inline', style: 'margin-top:6px', href: j.quote_pdf_url, target: '_blank' }, icon('mail', 15), 'View saved quote PDF') : null,
  );

  // ---- Estimate appointment ----
  const apptDate = h('input', { class: 'input', type: 'date', value: j.appointment_date || '' });
  const apptTime = h('input', { class: 'input', type: 'time', value: j.appointment_time || '' });

  // ---- Job scheduling ----
  const sched = daysField(jobDays(j));
  const schedTime = h('input', { class: 'input', type: 'time', value: j.scheduled_time || '' });
  const schedEndTime = h('input', { class: 'input', type: 'time', value: j.scheduled_end_time || '' });
  const jobNotes = h('textarea', { class: 'input', rows: '2', placeholder: 'Notes for the day', html: j.job_notes || '' });
  const scheduleBox = h('div', {},
    field('Work day(s)', sched.node),
    row(field('Start time', schedTime), field('End time', schedEndTime)),
    field('Job notes', jobNotes),
  );

  // ---- Completion ----
  const actualHours = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Actual hours', value: j.actual_hours || '' });
  const hoursDiff = h('span', { class: 'inline-note' });
  let hoursTouched = !!j.hours_result;
  const hoursResult = segmented(HOURS_RESULTS, j.hours_result || '', () => { hoursTouched = true; });
  const finalCost = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Final cost (actual)', value: j.final_cost || '' });
  const varianceBox = h('div', { class: 'variance-box' });
  const profit = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Profit $', value: j.profit || '' });
  const marginNote = h('span', { class: 'inline-note' });
  const varNotes = h('input', { class: 'input', type: 'text', placeholder: 'Quote vs actual — what differed?', value: j.quote_variance_notes || '' });
  const completeBox = h('div', {},
    h('div', { class: 'ref-row' },
      refItem('Quoted', j.estimate_amount != null ? money(j.estimate_amount) : '—'),
      refItem('Est. hours', j.estimated_hours != null ? j.estimated_hours : '—')),
    row(field('Actual hours', h('div', {}, actualHours, hoursDiff)), field('Final cost (actual)', finalCost)),
    field('Hours vs estimate', hoursResult.node),
    field('Quote vs actual', varianceBox),
    field('Profit', h('div', {}, profit, marginNote)),
    field('Discrepancy notes', varNotes),
    j.invoice_email_status === 'sent' ? h('div', { class: 'muted note-inline', style: 'margin-top:6px' }, icon('mail', 15), 'Invoice emailed to customer') : null,
    j.summary_pdf_url ? h('a', { class: 'muted note-inline', style: 'margin-top:4px', href: j.summary_pdf_url, target: '_blank' }, icon('check', 15), 'View saved job summary PDF') : null,
  );

  function recompute() {
    const est = j.estimated_hours, act = num(actualHours.value);
    if (est != null && act != null) {
      const d = +(act - est).toFixed(1);
      hoursDiff.textContent = `${d > 0 ? '+' : ''}${d} hrs vs estimate`;
      if (!hoursTouched) hoursResult.set(d > 0.5 ? 'over' : d < -0.5 ? 'under' : 'in_line');
    } else hoursDiff.textContent = '';
    const quoted = j.estimate_amount, actual = num(finalCost.value);
    if (quoted != null && actual != null) {
      const v = actual - quoted, pct = quoted ? Math.round((v / quoted) * 100) : 0;
      varianceBox.textContent = `${v >= 0 ? '+' : ''}${money(v)} vs quote  (${pct >= 0 ? '+' : ''}${pct}%)`;
      varianceBox.className = 'variance-box ' + (v > 0 ? 'over' : v < 0 ? 'under' : '');
    } else { varianceBox.textContent = 'Enter final cost to compare'; varianceBox.className = 'variance-box muted'; }
    const p = num(profit.value);
    marginNote.textContent = (p != null && actual) ? `${Math.round((p / actual) * 100)}% margin` : '';
  }
  actualHours.addEventListener('input', recompute);
  finalCost.addEventListener('input', recompute);
  profit.addEventListener('input', recompute);

  const quoteCard = card('Pricing & scope', quoteBox);
  const visitCard = card('Estimate appointment', row(field('Visit date', apptDate), field('Time', apptTime)));
  const schedCard = card('Schedule the job', scheduleBox);
  const compCard = card('Completion', completeBox);

  function syncBoxes() {
    const st = status.get();
    lostBox.style.display = isLost(st) ? 'block' : 'none';
    // Pricing & scope (amount, hours, scope) stays editable at every stage — e.g. to
    // add a price that was missed on a scheduled job. The send button only shows while
    // it's still a lead / quote, so a later stage never re-sends the estimate email.
    quoteCard.style.display = 'block';
    quoteBtn.style.display = (isLead(st) || st === 'estimate_given') ? '' : 'none';
    visitCard.style.display = (isLead(st) || st === 'estimate_given') ? 'block' : 'none';
    schedCard.style.display = (st === 'won' || st === 'scheduled' || st === 'completed') ? 'block' : 'none';
    compCard.style.display = (st === 'scheduled' || st === 'completed') ? 'block' : 'none';
  }

  sheet.append(
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-head' },
      h('div', {}, h('h2', {}, custName(j)),
        h('div', { class: 'muted' }, 'Received ' + fmtDate(j.received_at || j.created_at) + (j.reschedule_count ? ` · rescheduled ${j.reschedule_count}×` : ''))),
      h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, icon('x'))),
    h('div', { class: 'quick-actions' },
      j.phone ? h('a', { class: 'qa', href: 'tel:' + j.phone }, icon('phone'), 'Call') : null,
      j.phone ? h('a', { class: 'qa', href: 'sms:' + j.phone }, icon('message'), 'Text') : null,
      j.email ? h('a', { class: 'qa', href: 'mailto:' + j.email }, icon('mail'), 'Email') : null,
      j.address ? h('a', { class: 'qa', href: navHref(j), target: '_blank' }, icon('navigation'), 'Navigate') : null),
    customerCard,
    detailRows(j),
    card('Status', status.node, lostBox),
    quoteCard, visitCard, schedCard, compCard,
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn btn-danger-ghost', onclick: onDelete }, 'Delete'),
      h('button', { class: 'btn btn-primary', onclick: onSave }, 'Save')),
  );
  recompute(); syncBoxes();
  attachSheetDismiss(overlay, sheet, close);
  const focusEl = { quote: quoteCard, complete: compCard, schedule: schedCard, visit: visitCard }[opts.focus];
  if (focusEl) setTimeout(() => focusEl.scrollIntoView({ block: 'center' }), 50);

  function collect() {
    const cty = cityBox.get() || null;
    const days = sched.get();
    return {
      customer_name: properName(nameI.value),
      phone: phoneI.value.trim() || null,
      email: emailI.value.trim() || null,
      address: properAddress(addressI.value.trim()) || null,
      city: cty,
      zip: (cty && CITY_ZIP[cty]) ? CITY_ZIP[cty] : (j.zip || null),
      acres: num(acresI.value),
      services: services.get(),
      site_conditions: conditions.get(),
      estimate_amount: num(amount.value),
      estimated_hours: num(estHours.value),
      lead_time: leadTime.get() || null,
      scope_notes: scope.value.trim() || null,
      appointment_date: apptDate.value || null,
      appointment_time: apptTime.value || null,
      scheduled_date: days[0] || null,
      scheduled_dates: days.length > 1 ? days : null,
      scheduled_time: schedTime.value || null,
      scheduled_end_time: schedEndTime.value || null,
      job_notes: jobNotes.value.trim() || null,
      actual_hours: num(actualHours.value),
      hours_result: hoursResult.get() || null,
      final_cost: num(finalCost.value),
      profit: num(profit.value),
      quote_variance_notes: varNotes.value.trim() || null,
    };
  }

  // Explicit quote action → email the customer.
  async function quoteAndSend() {
    if (!num(amount.value)) { toast('Add an estimate amount', 'err'); amount.focus(); return; }
    const addr = emailI.value.trim();
    const to = properName(nameI.value) || custName(j);
    // Confirm before an email actually goes out (also covers re-sending a corrected quote).
    if (addr && !confirm('Email this estimate for ' + money(num(amount.value)) + ' to ' + to + ' at ' + addr + '?')) return;
    const patch = collect();
    patch.status = 'estimate_given';
    patch.estimate_email_status = addr ? 'queued' : 'skipped';
    try {
      await updateJob(j.id, patch);
      toast(addr ? 'Estimate emailing to ' + to.split(' ')[0] : 'Quoted (no email on file)');
      done();
    } catch (err) { console.error(err); toast('Could not save', 'err'); }
  }

  async function onSave() {
    let st = status.get();
    const patch = collect();
    patch.status = st;
    patch.lost_notes = isLost(st) ? (lostNotes.value.trim() || null) : null;
    // A win only moves to Scheduled once it actually has a work date on it.
    if (st === 'won' && patch.scheduled_date) patch.status = 'scheduled';
    // One crew, one place at a time — warn on a double-booked window.
    if (patch.status === 'scheduled' && patch.scheduled_date && patch.scheduled_time) {
      const conf = conflictsFor({
        id: j.id, scheduled_date: patch.scheduled_date, scheduled_dates: patch.scheduled_dates, scheduled_time: patch.scheduled_time,
        estimated_hours: patch.estimated_hours != null ? patch.estimated_hours : j.estimated_hours,
        scheduled_end_time: patch.scheduled_end_time,
      }, await scheduledJobs());
      if (conf.length && !(await confirmConflicts(conf))) return;
    }
    // Completing a job: stamp the completion date + queue the INVOICE email (once).
    // The thank-you email is sent later, when the job is marked paid in full.
    if (patch.status === 'completed' && j.status !== 'completed') {
      if (!j.completed_at) patch.completed_at = new Date().toISOString();
      if (!j.invoice_email_status) patch.invoice_email_status = j.email ? 'queued' : 'skipped';
    }
    try { await updateJob(j.id, patch); toast('Saved'); done(); }
    catch (err) { console.error(err); toast('Could not save', 'err'); }
  }

  async function onDelete() {
    if (!confirm('Delete this job permanently?')) return;
    try { await deleteJob(j.id); toast('Deleted'); done(); }
    catch (err) { console.error(err); toast('Could not delete', 'err'); }
  }
}

// Reschedule modal — new date (calendar) + reason. `kind` = 'appointment' | 'scheduled'.
export function openReschedule(job, kind, onChange) {
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const sheet = h('div', { class: 'sheet' });
  const dateField = kind === 'scheduled' ? 'scheduled_date' : 'appointment_date';
  const date = h('input', { class: 'input', type: 'date', value: job[dateField] || todayStr() });
  const reason = selectBox(RESCHEDULE_REASONS, '', null, 'Reason for reschedule');
  overlay.append(sheet); document.body.append(overlay); document.body.style.overflow = 'hidden';
  const close = () => { document.body.style.overflow = ''; overlay.remove(); };
  sheet.append(
    h('div', { class: 'sheet-grab' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Reschedule'), h('button', { class: 'icon-btn', onclick: close }, icon('x'))),
    h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, custName(job)),
      field('New date', date),
      field('Reason', reason.node)),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn btn-ghost', onclick: close }, 'Cancel'),
      h('button', { class: 'btn btn-primary', onclick: save }, 'Reschedule')),
  );
  attachSheetDismiss(overlay, sheet, close);
  async function save() {
    if (!reason.get()) { toast('Pick a reason', 'err'); return; }
    const patch = { [dateField]: date.value || null };
    // A "wrong day" correction just moves the date — it isn't counted as a reschedule.
    if (reason.get() !== RESCHEDULE_CORRECTION) {
      patch.reschedule_count = (job.reschedule_count || 0) + 1;
      patch.reschedule_reason = reason.get();
      patch.rescheduled_at = new Date().toISOString();
    }
    // Rescheduling collapses a multi-day job to the single new day.
    if (dateField === 'scheduled_date') patch.scheduled_dates = null;
    try { await updateJob(job.id, patch); toast(reason.get() === RESCHEDULE_CORRECTION ? 'Moved' : 'Rescheduled'); close(); onChange && onChange(); }
    catch (err) { console.error(err); toast('Could not move', 'err'); }
  }
}

const num = (v) => parseNum(v);
function card(title, ...children) { return h('div', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...children); }
function row(...children) { return h('div', { class: 'row' }, ...children); }
function refItem(k, v) { return h('div', { class: 'ref-item' }, h('div', { class: 'ref-k' }, k), h('div', { class: 'ref-v' }, String(v))); }
function navHref(j) { return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent([j.address, j.city, 'AL'].filter(Boolean).join(', ')); }

function detailRows(j) {
  const rows = [];
  const add = (label, val) => { if (val && val.length) rows.push(h('div', { class: 'dl-row' }, h('span', { class: 'dl-k' }, label), h('span', { class: 'dl-v' }, Array.isArray(val) ? val.join(', ') : val))); };
  add('Work', j.services);
  add('Site', j.site_conditions);
  add('Priority', j.priority);
  add('Reschedule', j.reschedule_reason ? `${j.reschedule_reason} (${j.reschedule_count}×)` : null);
  return rows.length ? h('div', { class: 'card dl' }, ...rows) : null;
}
