// Renders one question and reports its answer back.
//
// The status buttons are the point of this file. "I don't know" and "Doesn't
// apply to us" sit beside every question as first-class choices, not hidden
// behind a blank box, because that is what the data model was built around: an
// unanswered field and a field someone deliberately marked Unknown mean very
// different things, and only one of them needs chasing.
//
// Each field owns its own value and hands `onChange({status, value})` back to
// the section, which is responsible for persisting it. Nothing here talks to
// the database.

import { el } from './ui.js';

// Which typed column each field type writes into. Mirrors
// onboarding_responses_validate() in the database — if these ever disagree, the
// database wins and the write is rejected, which is the right way round.
const COLUMN = {
  short_text: 'value_text', long_text: 'value_text', select: 'value_text',
  email: 'value_text', phone: 'value_text', url: 'value_text',
  number: 'value_number', currency: 'value_number',
  date: 'value_date',
  boolean: 'value_boolean', checklist_item: 'value_boolean',
  multi_select: 'value_json',
  file_upload: null,
};

export function valueColumn(fieldType) { return COLUMN[fieldType] ?? null; }

/** Pull the current answer out of a stored response row, for re-rendering. */
export function readStored(field, response) {
  if (!response) return { status: null, value: null };
  const col = COLUMN[field.field_type];
  return { status: response.status, value: col ? response[col] : null };
}

const INPUT_MODE = { number: 'decimal', currency: 'decimal', phone: 'tel', email: 'email', url: 'url' };

/**
 * Build a question.
 *
 * onChange({ status, value }) — value is already shaped for the typed column,
 * e.g. { value_number: 38.5 }. status is 'answered' | 'unknown' | 'not_applicable'.
 */
export function renderField(field, response, onChange) {
  const stored = readStored(field, response);
  let status = stored.status;
  let value = stored.value;

  const wrap = el('div.q', { dataset: { field: field.field_key } });
  const head = el('div.q-head', {}, [
    el('label.q-label', { text: field.label, for: 'f-' + field.id }),
    field.required ? el('span.q-req', { text: 'Required' }) : null,
  ].filter(Boolean));
  wrap.append(head);
  if (field.help_text) wrap.append(el('p.q-help', { text: field.help_text }));

  const body = el('div.q-body');
  wrap.append(body);

  const emit = () => onChange({ status, value: shape(field, value) });

  const control = buildControl(field, () => value, (v) => {
    value = v;
    // Typing into a field is an answer; it clears any Unknown mark.
    status = 'answered';
    paintStatus();
    emit();
  });
  body.append(control.node);

  // ---- Status row ----------------------------------------------------------
  const unknownBtn = el('button.q-flag', { type: 'button', text: "I don't know" });
  const naBtn = el('button.q-flag', { type: 'button', text: "Doesn't apply" });
  const saved = el('span.q-saved', { text: '' });
  const flags = el('div.q-flags', {}, [unknownBtn, naBtn, saved]);
  // A refusal needs its own line. Squeezing a sentence into the little "Saved"
  // slot crushes the buttons beside it into a column, which makes a message
  // about a mistake look like a second mistake.
  const problem = el('p.q-err');
  wrap.append(flags, problem);

  function setFlag(next) {
    // Tapping an active flag turns it off and hands the question back.
    status = status === next ? null : next;
    if (status && status !== 'answered') { value = null; control.set(null); }
    paintStatus();
    emit();
  }
  unknownBtn.onclick = () => setFlag('unknown');
  naBtn.onclick = () => setFlag('not_applicable');

  function paintStatus() {
    unknownBtn.classList.toggle('on', status === 'unknown');
    naBtn.classList.toggle('on', status === 'not_applicable');
    const off = status === 'unknown' || status === 'not_applicable';
    control.node.classList.toggle('is-disabled', off);
    control.disable(off);
    wrap.classList.toggle('is-flagged', off);
  }

  control.set(value);
  paintStatus();

  return {
    node: wrap,
    /** Called by the section after a successful write, so the client sees it landed. */
    markSaved(text = 'Saved') {
      problem.classList.remove('show');
      saved.textContent = text;
      saved.classList.add('show');
      setTimeout(() => saved.classList.remove('show'), 1600);
    },
    markError(text) {
      saved.classList.remove('show');
      problem.textContent = text;
      problem.classList.add('show');
    },
    get status() { return status; },
  };
}

/** Wrap a raw value into the typed column the database expects. */
function shape(field, value) {
  const col = COLUMN[field.field_type];
  if (!col) return null;
  if (value === '' || value === undefined) return null;
  if (col === 'value_number') {
    const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? { value_number: n } : null;
  }
  return { [col]: value };
}

// ---- Controls ---------------------------------------------------------------

function buildControl(field, get, set) {
  const t = field.field_type;

  if (t === 'long_text') {
    const n = el('textarea.q-input.q-textarea', {
      id: 'f-' + field.id, rows: 4, placeholder: field.placeholder || '',
      oninput: () => set(n.value),
    });
    return { node: n, set: (v) => { n.value = v ?? ''; }, disable: (d) => { n.disabled = d; } };
  }

  if (t === 'boolean' || t === 'checklist_item') {
    const yes = el('button.q-toggle', { type: 'button', text: t === 'checklist_item' ? 'Yes' : 'Yes' });
    const no = el('button.q-toggle', { type: 'button', text: 'No' });
    const n = el('div.q-toggles', {}, [yes, no]);
    const paint = (v) => { yes.classList.toggle('on', v === true); no.classList.toggle('on', v === false); };
    yes.onclick = () => { const v = get() === true ? null : true; paint(v); set(v); };
    no.onclick = () => { const v = get() === false ? null : false; paint(v); set(v); };
    return { node: n, set: paint, disable: (d) => { yes.disabled = d; no.disabled = d; } };
  }

  if (t === 'select') {
    const opts = field.options || [];
    const n = el('div.q-choices');
    const btns = opts.map((o) => {
      const b = el('button.q-choice', { type: 'button', text: o.label });
      b.onclick = () => { const v = get() === o.value ? null : o.value; paint(v); set(v); };
      return { b, value: o.value };
    });
    btns.forEach(({ b }) => n.append(b));
    const paint = (v) => btns.forEach(({ b, value }) => b.classList.toggle('on', v === value));
    return { node: n, set: paint, disable: (d) => btns.forEach(({ b }) => { b.disabled = d; }) };
  }

  if (t === 'multi_select') {
    const opts = field.options || [];
    const n = el('div.q-choices');
    const btns = opts.map((o) => {
      const b = el('button.q-choice', { type: 'button', text: o.label });
      b.onclick = () => {
        const cur = Array.isArray(get()) ? [...get()] : [];
        const i = cur.indexOf(o.value);
        if (i >= 0) cur.splice(i, 1); else cur.push(o.value);
        paint(cur); set(cur);
      };
      return { b, value: o.value };
    });
    btns.forEach(({ b }) => n.append(b));
    const paint = (v) => {
      const arr = Array.isArray(v) ? v : [];
      btns.forEach(({ b, value }) => b.classList.toggle('on', arr.includes(value)));
    };
    return { node: n, set: paint, disable: (d) => btns.forEach(({ b }) => { b.disabled = d; }) };
  }

  if (t === 'file_upload') {
    // Phase 4. Say so rather than rendering a control that does nothing.
    const n = el('div.q-soon', { text: 'File uploads are coming shortly — we\'ll email you when this section can take them.' });
    return { node: n, set: () => {}, disable: () => {} };
  }

  // Everything else is a single-line input, differing only in keyboard and prefix.
  const n = el('input.q-input', {
    id: 'f-' + field.id,
    type: t === 'date' ? 'date' : 'text',
    inputmode: INPUT_MODE[t] || undefined,
    placeholder: field.placeholder || '',
    autocapitalize: t === 'email' || t === 'url' ? 'off' : undefined,
    oninput: () => set(n.value),
  });
  const node = field.unit && t !== 'date'
    ? el('div.q-unit', {}, [
        field.unit === 'USD' ? el('span.q-prefix', { text: '$' }) : null,
        n,
        field.unit && field.unit !== 'USD' ? el('span.q-suffix', { text: field.unit }) : null,
      ].filter(Boolean))
    : n;
  return { node, set: (v) => { n.value = v ?? ''; }, disable: (d) => { n.disabled = d; } };
}
