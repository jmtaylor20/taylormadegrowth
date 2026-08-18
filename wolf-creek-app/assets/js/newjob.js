// Add-a-scheduled-job form (opened via the + on the Schedule tab).
// Creates a job straight into 'scheduled' — no estimate email is ever sent.
import { h, clear, multiSelect, selectBox, field, toast, todayStr, properName, properAddress, parseNum, daysField } from './ui.js';
import { SERVICES, CITIES, CITY_ZIP } from './config.js';
import { createJob, scheduledJobs } from './db.js';
import { conflictsFor, confirmConflicts } from './sched.js';

export function renderNewJob(root) {
  clear(root);

  const name = h('input', { class: 'input', type: 'text', placeholder: 'Customer name', required: true });
  const phone = h('input', { class: 'input', type: 'tel', placeholder: 'Phone', inputmode: 'tel' });
  const email = h('input', { class: 'input', type: 'email', placeholder: 'Email (optional)', inputmode: 'email' });
  const address = h('input', { class: 'input', type: 'text', placeholder: 'Street address' });
  const zip = h('input', { class: 'input', type: 'text', placeholder: 'ZIP', inputmode: 'numeric' });
  const city = selectBox(CITIES, '', (v) => { if (CITY_ZIP[v]) zip.value = CITY_ZIP[v]; }, 'Choose town / city');

  const services = multiSelect(SERVICES, [], 'Work needed…');
  const acres = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Acres' });
  const estHours = h('input', { class: 'input', type: 'text', inputmode: 'decimal', placeholder: 'Est. hours' });
  const sched = daysField([todayStr()]);
  const schedTime = h('input', { class: 'input', type: 'time' });
  const schedEndTime = h('input', { class: 'input', type: 'time' });
  const amount = h('input', { class: 'input input-amount', type: 'text', inputmode: 'decimal', placeholder: '0' });
  const notes = h('textarea', { class: 'input', rows: '2', placeholder: 'Scope / job notes…' });

  const saveBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: save }, 'Add to schedule');

  root.append(
    h('div', { class: 'view-head' },
      h('a', { class: 'back-link', href: '#/scheduled' }, '‹ Schedule'),
      h('h1', {}, 'Add scheduled job'),
      h('p', {}, 'Drops straight onto the schedule — no estimate email is sent.')),
    h('form', { class: 'view-form', onsubmit: (e) => e.preventDefault() },
      section('Customer', field('Name', name), row(field('Phone', phone), field('Email', email))),
      section('Location', field('Address', address), row(field('Town / city', city.node), field('ZIP', zip))),
      section('Job',
        field('Work needed', services.node),
        row(field('Acres', acres), field('Est. hours', estHours)),
        field('Scope / notes', notes)),
      section('Schedule',
        field('Work day(s)', sched.node),
        row(field('Start time', schedTime), field('End time', schedEndTime)),
        field('Amount', h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix' }, '$'), amount))),
      saveBtn,
    ),
  );

  async function save() {
    if (!name.value.trim()) { toast('Add a customer name', 'err'); name.focus(); return; }
    saveBtn.disabled = true;
    const days = sched.get();
    const payload = {
      customer_name: properName(name.value),
      phone: phone.value.trim() || null,
      email: email.value.trim() || null,
      address: properAddress(address.value.trim()) || null,
      city: city.get() || null,
      zip: zip.value.trim() || null,
      services: services.get(),
      acres: parseNum(acres.value),
      estimated_hours: parseNum(estHours.value),
      scheduled_date: days[0] || todayStr(),
      scheduled_dates: days.length > 1 ? days : null,
      scheduled_time: schedTime.value || null,
      scheduled_end_time: schedEndTime.value || null,
      estimate_amount: parseNum(amount.value),
      scope_notes: notes.value.trim() || null,
      status: 'scheduled',       // straight onto the schedule
      received_at: new Date().toISOString(),
      // no estimate_email_status → no estimate email is ever queued
    };
    if (payload.scheduled_time) {
      const conf = conflictsFor({
        scheduled_date: payload.scheduled_date, scheduled_dates: payload.scheduled_dates,
        scheduled_time: payload.scheduled_time, scheduled_end_time: payload.scheduled_end_time,
        estimated_hours: payload.estimated_hours,
      }, await scheduledJobs());
      if (conf.length && !(await confirmConflicts(conf))) { saveBtn.disabled = false; return; }
    }
    try {
      await createJob(payload);
      toast('Added to the schedule');
      location.hash = '#/scheduled';
    } catch (err) {
      console.error(err);
      toast('Could not save — check connection', 'err');
      saveBtn.disabled = false;
    }
  }
}

function section(title, ...children) {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...children);
}
function row(...children) { return h('div', { class: 'row' }, ...children); }
