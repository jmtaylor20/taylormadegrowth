// New-estimate form (opened via the + on the Estimates tab). Creates a lead;
// can also quote-and-send on the spot.
import { h, clear, multiSelect, selectBox, segmented, field, toast, properName, properAddress, parseNum, money } from './ui.js';
import { SERVICES, SITE_CONDITIONS, PRIORITIES, LEAD_TIMES, CITIES, CITY_ZIP } from './config.js';
import { createJob } from './db.js';

export function renderEstimate(root) {
  clear(root);

  const name = h('input', { class: 'input', type: 'text', placeholder: 'Customer name', required: true });
  const phone = h('input', { class: 'input', type: 'tel', placeholder: 'Phone', inputmode: 'tel' });
  const email = h('input', { class: 'input', type: 'email', placeholder: 'Email', inputmode: 'email' });
  const address = h('input', { class: 'input', type: 'text', placeholder: 'Street address', autocomplete: 'street-address' });
  const zip = h('input', { class: 'input', type: 'text', placeholder: 'ZIP', inputmode: 'numeric' });
  const city = selectBox(CITIES, '', (v) => { if (CITY_ZIP[v]) zip.value = CITY_ZIP[v]; }, 'Choose town / city');

  const services = multiSelect(SERVICES, [], 'Work needed…');
  const conditions = multiSelect(SITE_CONDITIONS, [], 'Site conditions…');

  // Money/number fields are plain text with a numeric keypad — type="number" mangles
  // whole-dollar entry into cents on iOS (e.g. 1005 -> 10.05). We parse them ourselves.
  const acres = h('input', { class: 'input', type: 'text', placeholder: 'e.g. 4.5', inputmode: 'decimal' });
  const priority = segmented(PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) })), 'normal');
  const estHours = h('input', { class: 'input', type: 'text', placeholder: 'Est. hours', inputmode: 'decimal' });
  const amount = h('input', { class: 'input input-amount', type: 'text', placeholder: '0', inputmode: 'decimal' });
  const leadTime = selectBox(LEAD_TIMES, '', null, 'Lead time (for the estimate email)');
  const notes = h('textarea', { class: 'input', rows: '3', placeholder: 'Scope of work / notes…' });

  const saveBtn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => save('lead') }, 'Save as lead');
  const quoteBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => save('quote') }, 'Quote & send estimate');

  root.append(
    h('div', { class: 'view-head' },
      h('a', { class: 'back-link', href: '#/estimates' }, '‹ Estimates'),
      h('h1', {}, 'New estimate'),
      h('p', {}, 'Only the name is required. Save as a lead, or quote it and email the customer.')),
    h('form', { class: 'view-form', onsubmit: (e) => e.preventDefault() },
      section('Customer', field('Name', name), row(field('Phone', phone), field('Email', email))),
      section('Location', field('Address', address), row(field('Town / city', city.node), field('ZIP', zip))),
      section('Job scope',
        field('Work needed', services.node),
        field('Site conditions', conditions.node),
        field('Acres', acres, 'Optional — leave blank if it doesn’t apply. Powers per-acre pricing in Reports.'),
        field('Scope of work / notes', notes)),
      section('Quote',
        field('Priority', priority.node),
        row(field('Est. hours', estHours),
            field('Estimate amount', h('div', { class: 'money-wrap' }, h('span', { class: 'money-prefix' }, '$'), amount))),
        field('Lead time', leadTime.node)),
      h('div', { class: 'sheet-actions' }, saveBtn, quoteBtn),
    ),
  );

  async function save(mode) {
    if (!name.value.trim()) { toast('Add a customer name', 'err'); name.focus(); return; }
    const quoting = mode === 'quote';
    if (quoting && parseNum(amount.value) == null) { toast('Add an estimate amount to quote', 'err'); amount.focus(); return; }
    const hasEmail = !!email.value.trim();
    // Confirm before an email actually goes out, so it's clear it triggered.
    if (quoting && hasEmail && !confirm('Email this estimate for ' + money(parseNum(amount.value)) + ' to ' + properName(name.value) + ' at ' + email.value.trim() + '?')) return;
    saveBtn.disabled = quoteBtn.disabled = true;
    const payload = {
      customer_name: properName(name.value),
      phone: phone.value.trim() || null,
      email: email.value.trim() || null,
      address: properAddress(address.value.trim()) || null,
      city: city.get() || null,
      zip: zip.value.trim() || null,
      services: services.get(),
      site_conditions: conditions.get(),
      acres: parseNum(acres.value),
      estimated_hours: parseNum(estHours.value),
      priority: priority.get(),
      estimate_amount: parseNum(amount.value),
      lead_time: leadTime.get() || null,
      scope_notes: notes.value.trim() || null,
      status: quoting ? 'estimate_given' : 'lead',
      received_at: new Date().toISOString(),
      estimate_email_status: quoting ? (hasEmail ? 'queued' : 'skipped') : null,
    };

    try {
      await createJob(payload);
      if (quoting) toast(hasEmail ? 'Estimate emailing to ' + properName(name.value).split(' ')[0] : 'Quoted (no email on file to send)');
      else toast('Saved to Estimates');
      location.hash = quoting ? '#/pending' : '#/estimates';
    } catch (err) {
      console.error(err);
      toast('Could not save — check connection', 'err');
      saveBtn.disabled = quoteBtn.disabled = false;
    }
  }
}

function section(title, ...children) {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...children);
}
function row(...children) { return h('div', { class: 'row' }, ...children); }
