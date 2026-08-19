// One section, one screen.
//
// Autosave rather than a Save button, for a plain reason: this gets filled in
// on a phone, in pieces, between other work. A client who answers four
// questions and closes the tab should lose nothing. Each answer is written on
// its own, so a failure on one question never costs the others.
//
// Ordering matters here too. The section is rendered from `position`, which is
// the order a person would naturally think through it, not the order the fields
// happen to have been created in.

import { el, clear, spinner, debounce, toast, dueLabel } from './ui.js';
import { fieldsFor, responsesFor, saveResponse, deleteResponse, markSectionStatus,
         assetsFor, uploadAsset, deleteAsset, assetPreviewUrl } from './db.js';
import { renderField } from './fields.js';

export async function renderSection(mount, { row, contactId, contacts, onBack, onChanged }) {
  clear(mount);
  mount.append(spinner('Loading questions…'));

  let fields, responses, assets;
  try {
    [fields, responses, assets] = await Promise.all([
      fieldsFor(row.section_key), responsesFor(row.id), assetsFor(row.id),
    ]);
  } catch (err) {
    clear(mount);
    mount.append(backBar(onBack), el('div.empty', {}, [
      el('h2', { text: 'We could not load this section' }),
      el('p', { text: err.message || 'Please try again in a moment.' }),
    ]));
    return;
  }

  // Opening a section is the honest signal that it has been started. Fire and
  // forget: a client should never be blocked by a status write.
  if (row.status === 'not_started') {
    markSectionStatus(row.id, 'in_progress')
      .then(() => { row.status = 'in_progress'; onChanged?.(); })
      .catch(() => {});
  }

  const byField = new Map((responses || []).map((r) => [r.field_id, r]));
  clear(mount);
  mount.append(backBar(onBack));

  const due = dueLabel(row.due_date);
  // Who owns this one, said plainly. A client with three people in the portal
  // needs to know at a glance whether they are looking at their own work or
  // somebody else's — the overview says the same thing, and they must agree.
  const owner = assignmentLabel(row, contactId, contacts);
  mount.append(el('header.page-head', {}, [
    el('h1.page-title', { text: row.section.title }),
    row.section.intro ? el('p.page-sub', { text: row.section.intro }) : null,
    el('div.card-meta', {}, [
      owner ? el('span.meta.' + owner.tone, { text: owner.text }) : null,
      due ? el('span.meta.' + due.tone, { text: due.text }) : null,
    ].filter(Boolean)),
  ].filter(Boolean)));

  mount.append(el('p.q-note', {
    text: "Answer what you can. If you don't know something, say so — \"I don't know\" is a real answer here and tells us more than a blank box does.",
  }));

  const list = el('div.qs');
  mount.append(list);

  const scalars = fields.filter((f) => f.field_kind === 'scalar');
  const groups = fields.filter((f) => f.field_kind === 'repeating_group');

  const byFieldAssets = (fieldId) => (assets || []).filter((a) => a.field_id === fieldId && !a.row_id);

  for (const field of scalars) {
    const stored = byField.get(field.id) || null;
    const view = renderField(
      field, stored,
      makeSaver(field, stored, row, contactId, () => view, onChanged),
      field.field_type === 'file_upload' ? fileHandlers(field, row, contactId, onChanged, byFieldAssets(field.id)) : null,
    );
    list.append(view.node);
  }

  // Repeating groups are phase 3. Naming them beats omitting them: a client who
  // was told there would be a lead-history table needs to see it is coming, not
  // wonder whether they missed it.
  for (const group of groups) {
    list.append(el('div.q.q-group', {}, [
      el('div.q-head', {}, [el('label.q-label', { text: group.label })]),
      group.help_text ? el('p.q-help', { text: group.help_text }) : null,
      el('div.q-soon', { text: "This one's a table — we're finishing it now and will email you the moment it's ready." }),
    ].filter(Boolean)));
  }

  if (!scalars.length && !groups.length) {
    list.append(el('div.empty', {}, [el('p', { text: 'This section has no questions yet.' })]));
  }

  // ---- Submit --------------------------------------------------------------
  const done = ['submitted', 'accepted'].includes(row.status);
  const submit = el('button.btn-primary', {
    type: 'button',
    text: done ? 'Submitted — thank you' : "I'm done with this section",
    disabled: done,
  });
  submit.onclick = async () => {
    submit.disabled = true; submit.textContent = 'Submitting…';
    try {
      await markSectionStatus(row.id, 'submitted');
      row.status = 'submitted';
      submit.textContent = 'Submitted — thank you';
      toast('Section submitted. We have it.');
      onChanged?.();
    } catch (err) {
      submit.disabled = false; submit.textContent = "I'm done with this section";
      toast(err.message || 'That did not go through. Try again in a moment.', 'err');
    }
  };
  mount.append(el('div.section-foot', {}, [
    el('p.foot-note', {
      text: 'You can come back and change anything until we start work on it.',
    }),
    submit,
  ]));
}

/**
 * Persist one answer.
 *
 * Debounced, so typing saves once when someone stops rather than per keystroke,
 * and serialised per field via `inflight` so a fast typist cannot land two
 * inserts for the same question and trip the uniqueness index.
 */
function makeSaver(field, stored, row, contactId, getView, onChanged) {
  let responseId = stored?.id || null;
  let inflight = Promise.resolve();

  const write = async ({ status, value }) => {
    const view = getView();
    // Clearing a question back to blank means deleting the answer, not storing
    // an empty one — otherwise "answered with nothing" becomes a third state
    // nobody asked for.
    if (!status) {
      if (!responseId) return;
      const id = responseId; responseId = null;
      await deleteResponse(id);
      view?.markSaved('Cleared');
      onChanged?.();
      return;
    }
    if (status === 'answered' && (value == null)) return;

    const saved = await saveResponse({
      id: responseId,
      engagementSectionId: row.id,
      fieldId: field.id,
      status, value, contactId,
    });
    responseId = saved?.id || responseId;
    view?.markSaved();
    onChanged?.();
  };

  const run = (payload) => {
    inflight = inflight.then(() => write(payload)).catch((err) => {
      getView()?.markError(err.message || 'Not saved');
      toast(err.message || 'That answer did not save.', 'err');
    });
    return inflight;
  };

  const slow = debounce(run, 700);
  // A tap is a decision and saves at once; typing waits for a pause. Which is
  // which is decided by the field type, not by what the value looks like — a
  // dropdown's answer is a string too.
  const TYPED = new Set(['short_text', 'long_text', 'number', 'currency', 'email', 'phone', 'url', 'date']);

  return (payload) => {
    (TYPED.has(field.field_type) && payload.status === 'answered' ? slow : run)(payload);
  };
}

/**
 * The three things a file control needs from the outside world.
 *
 * Kept here rather than in fields.js so that file continues to hold no database
 * access of its own — it renders a question and reports what happened, and
 * every write in the portal goes through db.js.
 */
function fileHandlers(field, row, contactId, onChanged, assets) {
  return {
    assets,
    onUpload: async (file) => {
      const asset = await uploadAsset({
        engagementId: row.engagement_id,
        sectionKey: row.section_key,
        engagementSectionId: row.id,
        field, file, contactId,
      });
      onChanged?.();
      return asset;
    },
    onRemove: async (asset) => { await deleteAsset(asset); onChanged?.(); },
    onPreview: (asset) => assetPreviewUrl(asset),
  };
}

/** "Yours" when it is, the person's name when it is not, nothing when unassigned. */
export function assignmentLabel(row, contactId, contacts) {
  if (!row.assigned_contact_id) return null;
  if (contactId && row.assigned_contact_id === contactId) return { text: 'Yours to answer', tone: 'mine' };
  const name = (contacts || []).find((c) => c.id === row.assigned_contact_id)?.name;
  return { text: name ? `For ${name}` : 'Assigned to a colleague', tone: 'theirs' };
}

function backBar(onBack) {
  return el('div.back-bar', {}, [
    el('button.back', { type: 'button', text: '‹ All sections', onclick: onBack }),
  ]);
}
