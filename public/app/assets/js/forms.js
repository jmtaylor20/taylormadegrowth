// Shared client create/edit form (used by Pipeline, Clients, and detail view).
import { Clients } from './db.js';
import {
  CATEGORIES, SOURCES, SERVICES, STAGES, ONBOARDING_TEMPLATE, BILLING_MODES,
} from './config.js';
import {
  el, field, textInput, textArea, selectInput, numberInput, dateInput,
  chipSelect, readForm, openSheet, toast, iconSvg,
} from './ui.js';
import { logoField } from './logofield.js';

// Build the form body node. Returns { node, read } where read() gives the patch.
export function clientForm(c = {}) {
  const services = chipSelect('services', SERVICES, c.services || []);

  // Recurring add-ons: extra charges rolled into every monthly invoice
  // (e.g. A&O's managed Facebook Ads). label + amount rows.
  const addonsWrap = el('div');
  const addonRow = (a = {}) => {
    const label = el('input.input', { value: a.label || '', placeholder: 'e.g. Facebook Ads (managed)' });
    const amt = el('input.input', { type: 'number', step: '0.01', value: a.amount ?? '', placeholder: '0', style: 'max-width:104px' });
    const row = el('div.field-row', { style: 'gap:8px;align-items:center' }, [label, amt,
      el('button.icon-btn', { type: 'button', title: 'Remove', html: iconSvg('trash', 15), onclick: () => row.remove() })]);
    row._get = () => ({ label: label.value.trim(), amount: Number(amt.value || 0) });
    return row;
  };
  (Array.isArray(c.recurring_addons) ? c.recurring_addons : []).forEach((a) => addonsWrap.append(addonRow(a)));
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Business name', textInput('business_name', c.business_name, { placeholder: 'ABC Plumbing' })),
      field('Contact name', textInput('contact_name', c.contact_name, { placeholder: 'Owner / point of contact' })),
      field('Phone', textInput('phone', c.phone, { type: 'tel', placeholder: '(555) 123-4567' })),
      field('Email', textInput('email', c.email, { type: 'email', placeholder: 'name@business.com' })),
      field('Website', textInput('website', c.website, { placeholder: 'business.com' })),
      field('Category', selectInput('category', ['', ...CATEGORIES], c.category || '')),
      field('City', textInput('city', c.city)),
      field('State', textInput('state', c.state, { placeholder: 'AL' })),
      field('Stage', selectInput('stage', STAGES, c.stage || 'lead')),
      field('Source', selectInput('source', ['', ...SOURCES], c.source || '')),
      field('Priority', selectInput('priority', [
        { key: 'low', label: 'Low' }, { key: 'normal', label: 'Normal' }, { key: 'high', label: 'High' },
      ], c.priority || 'normal')),
      field('Fit / worth-it (1–5)', numberInput('rating', c.rating ?? '', { step: '1', min: '0' })),
    ]),
    field('Services', services),
    el('div.form-grid.cols-2', {}, [
      field('Package name', textInput('package_name', c.package_name, { placeholder: 'Growth Plan' })),
      field('Monthly (MRR)', numberInput('mrr', c.mrr ?? '', { placeholder: '0' })),
      field('Billing', selectInput('billing_mode', BILLING_MODES, c.billing_mode || 'advance')),
      field('Build fee', numberInput('build_fee', c.build_fee ?? '', { placeholder: '0' })),
      field('Start date', dateInput('start_date', c.start_date)),
      field('Next follow-up', dateInput('next_follow_up', c.next_follow_up)),
      field('Follow-up note', textInput('follow_up_note', c.follow_up_note, { placeholder: 'Call back re: proposal' })),
    ]),
    field('Recurring add-ons (billed every month)', el('div', {}, [
      addonsWrap,
      el('button.btn.btn-ghost.btn-sm.mt-8', { type: 'button', html: iconSvg('plus', 14) + ' Add recurring charge', onclick: () => addonsWrap.append(addonRow({})) }),
    ])),
    logoField(c),
    field('Notes', textArea('notes', c.notes, { rows: 3, placeholder: 'Anything worth remembering…' })),
  ]);

  const read = () => {
    const v = readForm(node);
    v.rating = v.rating == null ? null : Number(v.rating);
    v.mrr = Number(v.mrr || 0);
    v.build_fee = Number(v.build_fee || 0);
    const addons = [...addonsWrap.children].map((r) => r._get && r._get()).filter((a) => a && (a.label || a.amount));
    v.recurring_addons = addons.length ? addons : null;
    return v;
  };
  return { node, read };
}

// Open the client form in a sheet. onSaved(client) fires after save.
export function openClientForm(existing, onSaved) {
  const isNew = !existing?.id;
  const { node, read } = clientForm(existing || {});
  const { close } = openSheet({
    title: isNew ? 'New lead / client' : 'Edit ' + (existing.business_name || 'client'),
    body: node,
    wide: true,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      {
        label: isNew ? 'Add' : 'Save', tone: 'primary',
        onClick: async () => {
          const patch = read();
          if (!patch.business_name) { toast('Business name is required', 'err'); return; }
          try {
            let saved;
            if (isNew) {
              patch.onboarding = ONBOARDING_TEMPLATE.map((label) => ({ label, done: false }));
              saved = await Clients.create(patch);
            } else {
              saved = await Clients.update(existing.id, patch);
            }
            toast(isNew ? 'Added' : 'Saved');
            close();
            onSaved?.(saved);
          } catch (e) { toast(e.message || 'Save failed', 'err'); }
        },
      },
    ],
  });
}
