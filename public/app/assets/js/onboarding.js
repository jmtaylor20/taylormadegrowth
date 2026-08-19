// Onboarding — the staff side of the client portal.
//
// One screen for the whole job: start an engagement, decide which sections a
// client actually gets, hand each one to a named person, and send the
// invitation. Everything a client sees at /portal/ is decided here.
//
// Two ideas worth holding on to while reading this:
//
//   * Leaving a section OUT is a normal thing to do, not an edge case. A
//     website build has no business being asked about gross margin. So the
//     section list is a set of switches over the whole library rather than a
//     fixed template, and turning one off keeps whatever was answered — a
//     section switched off and back on has not lost anything.
//
//   * Assignment is how a five-person client stops being a mess. The shop lead
//     answers capacity, the owner answers money, and each of them opens the
//     portal to their own short list rather than everybody's long one.
//
// Sending is a mailto: on purpose. The first message a client gets about this
// should come from Josh's own address — it lands in his Sent, it threads when
// they reply, and it does not depend on a mail service being wired up. The
// message text lives in inviteText() below, one place to change it.
import {
  el, clear, iconSvg, pageHeader, primaryBtn, badge, emptyState, toast,
  openSheet, closeSheet, confirmDialog, field, textInput, dateInput, selectInput,
  fmtDate, todayISO, relDue, sectionTitle,
} from './ui.js';
import {
  Clients, Contacts, OnbSections, OnbTemplates, OnbEngagements, OnbEngSections, sb,
} from './db.js';
import { humanizeDbError } from './db-errors.js';

const PORTAL_URL = 'https://taylormadegrowth.com/portal/';

const ENGAGEMENT_STATUS = [
  { key: 'draft',       label: 'Draft',       tone: 'gray' },
  { key: 'invited',     label: 'Invited',     tone: 'blue' },
  { key: 'in_progress', label: 'In progress', tone: 'blue' },
  { key: 'submitted',   label: 'Submitted',   tone: 'green' },
  { key: 'complete',    label: 'Complete',    tone: 'green' },
  { key: 'archived',    label: 'Archived',    tone: 'gray' },
];

const ROLES = [
  { key: 'owner',      label: 'Owner' },
  { key: 'operations', label: 'Operations' },
  { key: 'finance',    label: 'Finance' },
  { key: 'marketing',  label: 'Marketing' },
  { key: 'contact',    label: 'Other contact' },
];

// Who gets what, when a section is switched on and nobody has said otherwise.
// Not a rule — every one of these is changeable on the row — just a starting
// point that is right more often than "unassigned" is.
const DEFAULT_ROLE_FOR = {
  engagement_details: 'owner',
  financial_baseline: 'owner',
  job_economics: 'owner',
  marketing_boundaries: 'owner',
  capacity: 'operations',
  digital_access: 'operations',
  portfolio: 'operations',
  sales_process: 'operations',
};

export async function renderOnboarding(root, engagementId) {
  return engagementId ? renderEngagement(root, engagementId) : renderList(root);
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------
async function renderList(root) {
  const wrap = el('div');
  root.append(pageHeader('Onboarding', 'Send it, assign it, watch it come back',
    primaryBtn('Start onboarding', () => openStart(() => refresh()), 'plus')));
  root.append(wrap);

  async function refresh() {
    clear(wrap);
    wrap.append(el('p.field-hint', { text: 'Loading…' }));

    const [engagements, clients, progress] = await Promise.all([
      OnbEngagements.list({ order: { col: 'created_at', asc: false } }),
      Clients.list(),
      progressByEngagement(),
    ]);

    clear(wrap);
    const live = engagements.filter((e) => e.status !== 'archived');
    if (!live.length) {
      wrap.append(emptyState('Nobody is onboarding yet. Start one above.', 'tasks'));
      return;
    }

    const rows = el('div.cards-grid');
    live.forEach((e) => rows.append(engagementCard(e, clients, progress[e.id])));
    wrap.append(rows);

    const archived = engagements.filter((e) => e.status === 'archived');
    if (archived.length) {
      wrap.append(sectionTitle('Archived'));
      const old = el('div.cards-grid');
      archived.forEach((e) => old.append(engagementCard(e, clients, progress[e.id])));
      wrap.append(old);
    }
  }

  await refresh();
}

function engagementCard(e, clients, prog) {
  const client = clients.find((c) => c.id === e.client_id) || {};
  const pct = prog ? prog.pct : 0;
  const st = ENGAGEMENT_STATUS.find((s) => s.key === e.status) || ENGAGEMENT_STATUS[0];

  return el('a.card.onb-card', { href: '#/onboarding/' + e.id }, [
    el('div.onb-card-top', {}, [
      el('h3.onb-card-title', { text: client.business_name || 'Unknown client' }),
      badge(st.label, st.tone),
    ]),
    el('div.onb-bar', {}, [el('div.onb-bar-fill', { style: `width:${pct}%` })]),
    el('div.onb-card-meta', {}, [
      el('span', { text: prog ? `${prog.answered} of ${prog.fields} answered` : 'No sections yet' }),
      prog && prog.sections ? el('span', { text: `${prog.sections} section${prog.sections === 1 ? '' : 's'}` }) : null,
      e.due_date ? el('span', { text: 'Due ' + fmtDate(e.due_date) + ' · ' + relDue(e.due_date) }) : null,
    ].filter(Boolean)),
  ]);
}

/** Completion per engagement, counted the same way the portal counts it. */
async function progressByEngagement() {
  const { data, error } = await sb
    .from('onboarding_section_progress')
    .select('engagement_id,field_count,response_count,engagement_section_id');
  if (error) throw humanizeDbError(error);
  const out = {};
  for (const r of data || []) {
    const o = out[r.engagement_id] || (out[r.engagement_id] = { fields: 0, answered: 0, sections: 0, pct: 0 });
    o.fields += r.field_count || 0;
    o.answered += Math.min(r.response_count || 0, r.field_count || 0);
    o.sections += 1;
  }
  for (const o of Object.values(out)) o.pct = o.fields ? Math.round((100 * o.answered) / o.fields) : 0;
  return out;
}

// ---------------------------------------------------------------------------
// Starting one
// ---------------------------------------------------------------------------
async function openStart(onDone) {
  const [clients, templates, engagements, library] = await Promise.all([
    Clients.list(), OnbTemplates.list({ order: { col: 'position', asc: true } }),
    OnbEngagements.list(), OnbSections.list({ order: { col: 'position', asc: true } }),
  ]);

  // A client with a live engagement is not offered again: two open engagements
  // for one client is confusion, not a feature.
  const taken = new Set(engagements.filter((e) => e.status !== 'archived').map((e) => e.client_id));
  const available = clients
    .filter((c) => !taken.has(c.id))
    .sort((a, b) => (a.business_name || '').localeCompare(b.business_name || ''));

  if (!available.length) {
    toast('Every client already has an onboarding open.', 'warn');
    return;
  }

  const verticals = [...new Set(library.filter((s) => s.tier === 'vertical').map((s) => s.vertical))];
  const body = el('div.form-grid');
  const clientSel = selectInput('client_id', available.map((c) => ({ key: c.id, label: c.business_name })));
  const tplSel = selectInput('template_key',
    templates.filter((t) => t.active).map((t) => ({ key: t.key, label: t.title })), 'website_build');
  const vertSel = selectInput('vertical',
    [{ key: '', label: 'None' }, ...verticals.map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1) }))]);
  const dueInp = dateInput('due_date', plusDays(14));

  body.append(
    field('Client', clientSel),
    field('Starting sections', tplSel,
      'A starting point, not a cage — you switch individual sections on and off on the next screen.'),
    field('Industry module', vertSel,
      'Only set this if we have a module written for their trade. It adds the extra section for it.'),
    field('Due date', dueInp, 'Shown to the client, and used for every section unless you change one.'),
  );

  const { close } = openSheet({
    title: 'Start onboarding',
    body,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      {
        label: 'Create',
        tone: 'primary',
        onClick: async () => {
          try {
            const id = await createEngagement({
              client_id: clientSel.value,
              template_key: tplSel.value,
              vertical: vertSel.value || null,
              due_date: dueInp.value || null,
              clients: available,
            });
            close();
            onDone?.();
            location.hash = '#/onboarding/' + id;
          } catch (err) {
            toast(err.message || 'Could not create that.', 'warn');
          }
        },
      },
    ],
  });
}

async function createEngagement({ client_id, template_key, vertical, due_date, clients }) {
  const client = clients.find((c) => c.id === client_id) || {};
  const engagement = await OnbEngagements.create({
    client_id, template_key, vertical, due_date,
    title: (client.business_name || 'Client') + ' — onboarding',
    status: 'draft',
  });

  // The template's sections, plus the vertical module if there is one. Both are
  // ordinary inserts; nothing here is fixed at creation time.
  const { data: tpl, error } = await sb
    .from('onboarding_template_sections').select('section_key,position').eq('template_key', template_key);
  if (error) throw humanizeDbError(error);

  const rows = (tpl || []).map((t) => ({
    engagement_id: engagement.id, section_key: t.section_key, position: t.position,
    due_date,
  }));
  if (vertical) {
    const { data: vs } = await sb.from('onboarding_sections')
      .select('key,position').eq('tier', 'vertical').eq('vertical', vertical).eq('active', true);
    for (const s of vs || []) rows.push({ engagement_id: engagement.id, section_key: s.key, position: s.position, due_date });
  }
  if (rows.length) {
    const { error: e2 } = await sb.from('onboarding_engagement_sections').insert(rows);
    if (e2) throw humanizeDbError(e2);
  }
  return engagement.id;
}

// ---------------------------------------------------------------------------
// One engagement
// ---------------------------------------------------------------------------
async function renderEngagement(root, id) {
  const wrap = el('div');
  root.append(wrap);
  wrap.append(el('p.field-hint', { text: 'Loading…' }));

  let state = null;

  async function load() {
    const [engRows, library, progress] = await Promise.all([
      sb.from('onboarding_engagements').select('*').eq('id', id).limit(1).then(unwrap),
      OnbSections.list({ order: { col: 'position', asc: true } }),
      sb.from('onboarding_section_progress').select('*').eq('engagement_id', id).then(unwrap),
    ]);
    const engagement = engRows?.[0];
    if (!engagement) throw new Error('That onboarding no longer exists.');

    const [clientRows, contacts, sections] = await Promise.all([
      sb.from('clients').select('*').eq('id', engagement.client_id).limit(1).then(unwrap),
      Contacts.list({ eq: { client_id: engagement.client_id } }),
      OnbEngSections.list({ eq: { engagement_id: id }, order: { col: 'position', asc: true } }),
    ]);
    state = {
      engagement,
      client: clientRows?.[0] || {},
      contacts: (contacts || []).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
      sections,
      library: library.filter((s) => s.active),
      progress: Object.fromEntries((progress || []).map((p) => [p.engagement_section_id, p])),
    };
  }

  async function refresh() { await load(); paint(); }

  function paint() {
    clear(wrap);
    const { engagement, client } = state;
    const st = ENGAGEMENT_STATUS.find((s) => s.key === engagement.status) || ENGAGEMENT_STATUS[0];

    wrap.append(el('a.back-link', { href: '#/onboarding', html: `${iconSvg('back', 16)} All onboarding` }));
    wrap.append(pageHeader(client.business_name || 'Client', engagement.title,
      primaryBtn('Send invitation', () => openInvite(state, refresh), 'mail')));

    wrap.append(el('div.onb-head-meta', {}, [
      badge(st.label, st.tone),
      engagement.due_date ? el('span.field-hint', { text: 'Due ' + fmtDate(engagement.due_date) }) : null,
      engagement.invited_at ? el('span.field-hint', { text: 'Invited ' + fmtDate(engagement.invited_at) }) : null,
      el('button.linkish', { type: 'button', text: 'Settings', onclick: () => openSettings(state, refresh) }),
    ].filter(Boolean)));

    paintPeople();
    paintSections();
  }

  function paintPeople() {
    const { contacts } = state;
    wrap.append(sectionTitle('Who is filling this in',
      el('button.linkish', { type: 'button', text: '+ Add person', onclick: () => openContact(state, null, refresh) })));

    if (!contacts.length) {
      wrap.append(el('div.banner', {
        html: '<b>Nobody can sign in yet.</b> Add at least one person — their email address is how the portal knows who they are.',
      }));
      return;
    }
    const rows = el('div.rows.card');
    contacts.forEach((c) => {
      const owned = state.sections.filter((s) => s.active && s.assigned_contact_id === c.id).length;
      rows.append(el('div.row.clickable.onb-person', { onclick: () => openContact(state, c, refresh) }, [
        el('div.row-main', {}, [
          el('div.row-title', { text: c.name + (c.is_primary ? ' · primary' : '') }),
          el('div.row-sub', { text: c.email + (c.title ? ' — ' + c.title : '') }),
        ]),
        el('span.field-hint', { text: owned ? `${owned} section${owned === 1 ? '' : 's'}` : 'nothing assigned' }),
      ]));
    });
    wrap.append(rows);
  }

  function paintSections() {
    const { engagement, sections, library, contacts, progress } = state;

    // Vertical modules for other trades are not offered at all: the database
    // refuses them, and an option that always errors is worse than no option.
    const offered = library.filter((s) => s.tier !== 'vertical' || s.vertical === engagement.vertical);
    const on = sections.filter((s) => s.active).length;

    wrap.append(sectionTitle('Sections',
      el('span.field-hint', { text: `${on} of ${offered.length} switched on` })));
    wrap.append(el('p.field-hint.mb-8', {
      text: 'Switch off anything they should not be asked. Nothing already answered is lost — switch it back on and it is all still there.',
    }));

    const list = el('div.rows.card');
    offered.forEach((lib) => list.append(sectionRow(lib)));
    wrap.append(list);

    function sectionRow(lib) {
      const row = state.sections.find((s) => s.section_key === lib.key);
      const active = !!(row && row.active);
      const prog = row ? progress[row.id] : null;

      const toggle = el('input.checkbox', { type: 'checkbox', checked: active });
      const body = el('div.onb-sec-body');

      const node = el('div.row.onb-sec' + (active ? '' : '.is-off'), {}, [
        el('label.onb-sec-toggle', {}, [toggle]),
        el('div.row-main', {}, [
          el('div.row-title', { text: lib.title }),
          el('div.row-sub', { text: lib.description || lib.intro || '' }),
          body,
        ]),
      ]);

      toggle.onchange = async () => {
        toggle.disabled = true;
        try {
          await setSectionActive(state, lib, toggle.checked);
          await refresh();
        } catch (err) {
          toggle.checked = !toggle.checked;
          toggle.disabled = false;
          toast(err.message || 'Could not change that.', 'warn');
        }
      };

      if (!active) return node;

      // Assignment and its own due date, only once the section is on — there is
      // nothing to assign otherwise, and the controls would just be noise.
      const who = selectInput('assigned', [
        { key: '', label: 'Anyone at the client' },
        ...contacts.map((c) => ({ key: c.id, label: c.name })),
      ], row.assigned_contact_id || '');
      who.onchange = () => save({ assigned_contact_id: who.value || null }, who);

      const dueInp = dateInput('due', row.due_date || '');
      dueInp.onchange = () => save({ due_date: dueInp.value || null }, dueInp);

      body.append(el('div.onb-sec-controls', {}, [
        el('label.onb-mini', {}, [el('span', { text: 'Assigned to' }), who]),
        el('label.onb-mini', {}, [el('span', { text: 'Due' }), dueInp]),
      ]));

      if (prog && prog.field_count) {
        const pct = Math.round((100 * Math.min(prog.response_count, prog.field_count)) / prog.field_count);
        body.append(el('div.onb-sec-prog', {}, [
          el('div.onb-bar.thin', {}, [el('div.onb-bar-fill', { style: `width:${pct}%` })]),
          el('span.field-hint', { text: `${Math.min(prog.response_count, prog.field_count)} of ${prog.field_count} answered` }),
        ]));
      }

      async function save(patch, control) {
        control.disabled = true;
        try {
          await OnbEngSections.update(row.id, patch);
          Object.assign(row, patch);
          toast('Saved');
        } catch (err) {
          toast(err.message || 'Could not save that.', 'warn');
          await refresh();
        } finally {
          control.disabled = false;
        }
      }

      return node;
    }
  }

  try {
    await refresh();
  } catch (err) {
    clear(wrap);
    wrap.append(el('div.banner', { html: `<b>Couldn't load.</b> ${err.message || err}` }));
  }
}

const unwrap = ({ data, error }) => { if (error) throw humanizeDbError(error); return data; };

/**
 * Switch a section on or off.
 *
 * Off is `active = false`, never a delete. A client's answers are the expensive
 * part of this whole system, and a mis-click that destroyed them would be
 * unrecoverable — so the row stays, and switching back on brings everything
 * with it.
 */
async function setSectionActive(state, lib, on) {
  const existing = state.sections.find((s) => s.section_key === lib.key);
  if (existing) return OnbEngSections.update(existing.id, { active: on });
  if (!on) return null;

  const role = DEFAULT_ROLE_FOR[lib.key];
  const assignee = role ? state.contacts.find((c) => c.role === role) : null;
  return OnbEngSections.create({
    engagement_id: state.engagement.id,
    section_key: lib.key,
    position: lib.position,
    due_date: state.engagement.due_date,
    assigned_contact_id: assignee?.id || null,
  });
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
function openContact(state, existing, onSaved) {
  const body = el('div.form-grid');
  const name = textInput('name', existing?.name || '');
  const email = textInput('email', existing?.email || '', { type: 'email', placeholder: 'them@theirbusiness.com' });
  const title = textInput('title', existing?.title || '', { placeholder: 'Owner, Shop lead, Bookkeeper' });
  const role = selectInput('role', ROLES, existing?.role || 'contact');

  body.append(
    field('Name', name),
    field('Email', email, 'This is how they sign in, and how the database knows who they are. It has to be right.'),
    field('Title', title),
    field('Role', role, 'Decides who gets handed which sections by default when you switch one on.'),
  );

  const actions = [{ label: 'Cancel', tone: 'ghost', onClick: () => closeSheet() }];
  if (existing) {
    actions.push({
      label: 'Remove',
      tone: 'danger',
      onClick: async () => {
        const assigned = state.sections.filter((s) => s.assigned_contact_id === existing.id).length;
        const warning = assigned
          ? `${existing.name} has ${assigned} section${assigned === 1 ? '' : 's'} assigned. Removing them leaves those for anyone at the client to answer. Their answers stay.`
          : `Remove ${existing.name}? They will not be able to sign in any more.`;
        if (!(await confirmDialog(warning, { confirmLabel: 'Remove' }))) return;
        try {
          await Contacts.remove(existing.id);
          closeSheet();
          toast('Removed');
          onSaved?.();
        } catch (err) { toast(err.message || 'Could not remove that.', 'warn'); }
      },
    });
  }
  actions.push({
    label: 'Save',
    tone: 'primary',
    onClick: async () => {
      const patch = {
        name: name.value.trim(),
        email: email.value.trim().toLowerCase(),
        title: title.value.trim() || null,
        role: role.value,
      };
      if (!patch.name || !patch.email) { toast('Name and email are both needed.', 'warn'); return; }
      try {
        if (existing) {
          await Contacts.update(existing.id, patch);
          toast('Saved');
        } else {
          const created = await Contacts.create({
            ...patch, client_id: state.engagement.client_id, is_primary: !state.contacts.length,
          });
          const n = await applyDefaultAssignments(state, created);
          toast(n ? `Added — and handed them ${n} section${n === 1 ? '' : 's'}` : 'Added');
        }
        closeSheet();
        onSaved?.();
      } catch (err) { toast(err.message || 'Could not save that.', 'warn'); }
    },
  });

  openSheet({ title: existing ? 'Edit person' : 'Add person', body, actions });
}

/**
 * Hand a newly added person the sections their role usually answers.
 *
 * The engagement is created before anybody exists on it, so the sections that
 * come from the template start out unassigned and would stay that way — the
 * defaults in DEFAULT_ROLE_FOR only fire when a section is switched on, and by
 * then the template's are already there. Somebody adding the owner and the shop
 * lead would get a screen where every single section says "anyone", and would
 * have to set eight dropdowns by hand to get what they meant.
 *
 * Only ever fills gaps: a section already assigned to somebody is left alone,
 * and the toast says how many moved so this is never silent.
 */
async function applyDefaultAssignments(state, contact) {
  const wanted = state.sections.filter((s) =>
    s.active && !s.assigned_contact_id && DEFAULT_ROLE_FOR[s.section_key] === contact.role);
  if (!wanted.length) return 0;
  await Promise.all(wanted.map((s) => OnbEngSections.update(s.id, { assigned_contact_id: contact.id })));
  return wanted.length;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function openSettings(state, onSaved) {
  const { engagement } = state;
  const body = el('div.form-grid');
  const due = dateInput('due_date', engagement.due_date || '');
  const status = selectInput('status', ENGAGEMENT_STATUS, engagement.status);

  body.append(
    field('Due date', due, 'Changing this does not move the dates already set on individual sections.'),
    field('Status', status, 'Archive it to take it off the list without deleting anything.'),
  );

  openSheet({
    title: 'Engagement settings',
    body,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => closeSheet() },
      {
        label: 'Save',
        tone: 'primary',
        onClick: async () => {
          try {
            await OnbEngagements.update(engagement.id, {
              due_date: due.value || null,
              status: status.value,
            });
            closeSheet();
            toast('Saved');
            onSaved?.();
          } catch (err) { toast(err.message || 'Could not save that.', 'warn'); }
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// The invitation
// ---------------------------------------------------------------------------
/**
 * What the client actually reads.
 *
 * The paragraph about credentials is not boilerplate. The database refuses
 * anything that looks like a password, and somebody who has been told that up
 * front reads the refusal as care rather than a malfunction.
 */
export function inviteText(contact, state) {
  const { client, engagement, sections } = state;
  const mine = sections.filter((s) => s.active && s.assigned_contact_id === contact.id).length;
  const anyones = sections.filter((s) => s.active && !s.assigned_contact_id).length;
  const due = engagement.due_date ? fmtDate(engagement.due_date) : null;

  const whose = mine
    ? `${mine} section${mine === 1 ? ' is' : 's are'} marked for you${anyones ? `, and ${anyones} anyone at ${client.business_name || 'your team'} can answer` : ''}.`
    : `There ${anyones === 1 ? 'is' : 'are'} ${anyones} section${anyones === 1 ? '' : 's'} to work through, and anyone on your team can answer them.`;

  const body = [
    `Hi ${(contact.name || '').split(' ')[0] || 'there'},`,
    '',
    `Before we get started, there's a short set of questions to work through. It's at:`,
    '',
    PORTAL_URL,
    '',
    `Enter ${contact.email} and it'll email you a sign-in code — there's no password to set up. If it's easier, you can add it to your phone's home screen and it behaves like an app.`,
    '',
    whose + (due ? ` We're aiming to have it back by ${due}.` : ''),
    '',
    `It doesn't need doing in one sitting — it saves as you go. And if you don't know an answer, say so: there's an "I don't know" button on every question, and it's genuinely more useful to us than a guess.`,
    '',
    `One thing: please don't put any passwords or logins in there. The form will refuse them anyway. We only ever record whether we have access to something, never the credential itself — we'll sort access out together on a call.`,
    '',
    'Thanks,',
    'Josh',
  ].join('\n');

  return {
    subject: `Getting started with ${client.business_name || 'your project'} — a few questions`,
    body,
  };
}

function openInvite(state, onSent) {
  const { contacts, sections } = state;
  const body = el('div');

  if (!contacts.length) {
    body.append(el('div.banner', { html: '<b>Add someone first.</b> There is nobody to send this to yet.' }));
    openSheet({ title: 'Send invitation', body, actions: [{ label: 'Close', tone: 'ghost', onClick: () => closeSheet() }] });
    return;
  }
  if (!sections.some((s) => s.active)) {
    body.append(el('div.banner', { html: '<b>Every section is switched off.</b> They would open the portal to nothing.' }));
    openSheet({ title: 'Send invitation', body, actions: [{ label: 'Close', tone: 'ghost', onClick: () => closeSheet() }] });
    return;
  }

  body.append(el('p.field-hint', {
    text: 'Opens your mail app with the message ready. It sends from your own address, so their reply comes back to you.',
  }));

  const rows = el('div.rows.card');
  contacts.forEach((c) => {
    const { subject, body: text } = inviteText(c, state);
    const mine = sections.filter((s) => s.active && s.assigned_contact_id === c.id).length;

    rows.append(el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: c.name }),
        el('div.row-sub', { text: `${c.email} · ${mine ? `${mine} section${mine === 1 ? '' : 's'}` : 'no sections of their own'}` }),
      ]),
      el('div.onb-send', {}, [
        el('button.btn.btn-ghost.btn-sm', {
          type: 'button', text: 'Copy',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast('Message copied');
            } catch { toast('Could not copy — open it instead.', 'warn'); }
          },
        }),
        el('a.btn.btn-primary.btn-sm', {
          text: 'Email',
          href: `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
          onclick: () => markInvited(state, onSent),
        }),
      ]),
    ]));
  });
  body.append(rows);

  body.append(el('details.onb-preview', {}, [
    el('summary', { text: 'Read the message' }),
    el('pre.onb-preview-text', { text: inviteText(contacts[0], state).body }),
  ]));

  openSheet({
    title: 'Send invitation',
    body,
    wide: true,
    actions: [{ label: 'Done', tone: 'ghost', onClick: () => { closeSheet(); onSent?.(); } }],
  });
}

/** Record that it went out. Best effort — a failure here must not eat the email. */
async function markInvited(state, onSent) {
  const { engagement } = state;
  if (engagement.status !== 'draft') return;
  try {
    await OnbEngagements.update(engagement.id, { status: 'invited', invited_at: new Date().toISOString() });
    engagement.status = 'invited';
    onSent?.();
  } catch { /* the mail client is already opening; do not interrupt it */ }
}

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
