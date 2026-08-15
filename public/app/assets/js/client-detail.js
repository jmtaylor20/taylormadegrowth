// Client detail sheet — the hub that pulls a client's package, statuses,
// onboarding, tasks, invoices, activity, and monthly report into one place.
import { Clients, Invoices, Tasks, Activities, Reviews, Payments, clientBundle, clientFinance, setStage } from './db.js';
import {
  SERVICE_LABEL, STAGES, STAGE_LABEL, WEBSITE_STATUS, GBP_STATUS, ADS_STATUS,
  INVOICE_STATUS, INVOICE_TYPE, TASK_STATUS, REVIEW_STATUS, TEAM, MONTHLY_TEMPLATE, CONTRACT_STATUS,
  PAYMENT_KIND, PAYMENT_METHODS,
} from './config.js';
import {
  el, clear, money, fmtDate, relDue, todayISO, badge, statusBadge, labelOf,
  openSheet, closeSheet, confirmDialog, toast, iconSvg, field, textInput,
  numberInput, dateInput, textArea, selectInput, readForm, emptyState, primaryBtn,
  clientAvatar,
} from './ui.js';
import { openClientForm } from './forms.js';
import { openReport } from './report.js';
import { openInvoiceForm } from './invoices.js';
import { openTaskForm, markTaskDone } from './tasks.js';
import { RECUR_INTERVAL } from './config.js';

const initials = (name) => (name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export async function openClient(id, onChange) {
  let client, bundle;
  try {
    [client] = await Promise.all([Clients.list({ eq: { id } }).then((r) => r[0])]);
    if (!client) { toast('Client not found', 'err'); return; }
    bundle = await clientBundle(id);
  } catch (e) { toast(e.message || 'Load failed', 'err'); return; }

  const body = el('div');
  const sheet = openSheet({ title: '', body, wide: true, onClose: () => onChange?.() });
  // hide the empty default title bar text; we render our own hero
  sheet.sheet.querySelector('.sheet-title').style.display = 'none';

  const rerender = async () => {
    bundle = await clientBundle(id);
    client = (await Clients.list({ eq: { id } }))[0];
    paint();
  };
  const patch = async (p) => {
    try { client = await Clients.update(id, p); toast('Saved'); paint(); onChange?.(); }
    catch (e) { toast(e.message || 'Save failed', 'err'); }
  };

  let activeTab = 'overview';
  const TABS = [
    ['overview', 'Overview'], ['status', 'Services & status'], ['work', 'Work'],
    ['money', 'Money'], ['content', 'Content'], ['activity', 'Activity'],
  ];

  function paint() {
    clear(body);
    // Hero
    body.append(el('div.detail-hero', { style: client.brand_color ? `border-bottom:3px solid ${client.brand_color}` : '' }, [
      clientAvatar(client),
      el('div', {}, [
        el('div.detail-name', { text: client.business_name }),
        el('div.detail-meta', {}, [
          statusBadge(STAGES, client.stage),
          client.category ? badge(client.category, 'gold') : null,
          client.city ? el('span', { text: [client.city, client.state].filter(Boolean).join(', ') }) : null,
          client.mrr ? el('span.right', { text: money(client.mrr) + '/mo' }) : null,
        ]),
      ]),
    ]));
    // Contact actions
    const actions = el('div.contact-actions');
    if (client.phone) actions.append(el('a', { href: 'tel:' + client.phone, html: `${iconSvg('phone', 15)} Call` }));
    if (client.email) actions.append(el('a', { href: 'mailto:' + client.email, html: `${iconSvg('mail', 15)} Email` }));
    if (client.website) actions.append(el('a', { href: normUrl(client.website), target: '_blank', html: `${iconSvg('globe', 15)} Site` }));
    actions.append(el('a', { href: 'javascript:void 0', onclick: () => openClientForm(client, rerender), html: `${iconSvg('edit', 15)} Edit` }));
    actions.append(el('a', { href: 'javascript:void 0', onclick: () => openReport(client, bundle), html: `${iconSvg('report', 15)} Report` }));
    actions.append(el('a', { href: 'javascript:void 0', style: 'color:var(--red);border-color:#f3c9c9', onclick: async () => {
      if (await confirmDialog(`Delete ${client.business_name}? This permanently removes the client and all its tasks, invoices, content, reviews, proposals, and notes. This can't be undone.`, { confirmLabel: 'Delete client' })) {
        try { await Clients.remove(id); toast('Client deleted'); closeSheet(() => onChange?.()); }
        catch (e) { toast(e.message || 'Delete failed', 'err'); }
      }
    }, html: `${iconSvg('trash', 15)} Delete` }));
    body.append(actions);

    // Tab strip
    const strip = el('div.detail-tabs');
    TABS.forEach(([key, label]) => strip.append(el('button.detail-tab' + (activeTab === key ? '.on' : ''), {
      text: label, onclick: () => { activeTab = key; paint(); },
    })));
    body.append(strip);

    const pane = el('div');
    body.append(pane);
    ({ overview: paneOverview, status: paneStatus, work: paneWork, money: paneMoney, content: paneContent, activity: paneActivity }[activeTab])(pane);
  }

  // ---- Overview -----------------------------------------------------------
  function paneOverview(pane) {
    const fin = clientFinance(client, bundle);
    // Quick stage changer
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Pipeline stage' })]));
    const stageRow = el('div.pill-row');
    STAGES.forEach((s) => stageRow.append(el('button.chip' + (client.stage === s.key ? '.on' : ''), {
      text: s.label, onclick: async () => {
        try { const { client: updated, welcomed } = await setStage(client, s.key); client = updated; toast(welcomed ? 'Now a client 🎉 Welcome email queued' : 'Saved'); paint(); onChange?.(); }
        catch (e) { toast(e.message || 'Save failed', 'err'); }
      },
    })));
    pane.append(stageRow);

    // Follow-up
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Follow-up' })]));
    const fuCard = el('div.card.card-pad');
    if (client.next_follow_up) {
      fuCard.append(el('div', { html: `<b>${fmtDate(client.next_follow_up)}</b> · <span class="muted">${relDue(client.next_follow_up)}</span>` }));
      if (client.follow_up_note) fuCard.append(el('div.muted.mt-8', { text: client.follow_up_note }));
    } else fuCard.append(el('div.muted', { text: 'No follow-up scheduled.' }));
    fuCard.append(el('div.mt-16', {}, [el('button.btn.btn-ghost.btn-sm', { text: 'Set follow-up', onclick: () => openClientForm(client, rerender) })]));
    pane.append(fuCard);

    // Package
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Service package' })]));
    const pkg = el('div.card.card-pad');
    if ((client.services || []).length) {
      pkg.append(el('div.pill-row', {}, client.services.map((s) => badge(SERVICE_LABEL[s] || s, 'blue'))));
    } else pkg.append(el('div.muted', { text: 'No services selected yet.' }));
    pkg.append(el('dl.kv.mt-16', {}, [
      el('dt', { text: 'Package' }), el('dd', { text: client.package_name || '—' }),
      el('dt', { text: 'Monthly' }), el('dd', { text: money(client.mrr) }),
      el('dt', { text: 'Build fee' }), el('dd', { html: money(client.build_fee) + (client.build_fee ? ((client.build_fee_paid || fin.buildOutstanding === 0) ? ' · <span class="text-green">paid</span>' : ' · <span class="text-amber">' + money(fin.buildOutstanding) + ' left</span>') : '') }),
      el('dt', { text: 'Start date' }), el('dd', { text: client.start_date ? fmtDate(client.start_date) : '—' }),
    ]));
    pane.append(pkg);

    // Balance — reflects recorded payments (full detail lives in the Money tab)
    pane.append(el('div.section-title', {}, [
      el('h3', { text: 'Balance' }),
      el('button.btn.btn-ghost.btn-sm', { text: 'Money →', onclick: () => { activeTab = 'money'; paint(); } }),
    ]));
    pane.append(el('div.statstrip', {}, [
      el('div.stat', {}, [el('div.stat-value', { text: money(fin.collected) }), el('div.stat-label', { text: 'Collected' })]),
      el('div.stat' + (fin.outstanding ? '.stat-gold' : ''), {}, [el('div.stat-value', { text: money(fin.outstanding) }), el('div.stat-label', { text: 'Outstanding' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(fin.mrr) }), el('div.stat-label', { text: 'MRR' })]),
    ]));
    const lastPay = (bundle.payments || [])[0];
    pane.append(el('div.muted.mt-8', { text: lastPay ? `Last payment: ${money(lastPay.amount)}${lastPay.kind ? ' (' + labelOf(PAYMENT_KIND, lastPay.kind) + ')' : ''}${lastPay.paid_on ? ' · ' + fmtDate(lastPay.paid_on) : ''}` : 'No payments recorded yet.' }));

    if (client.notes) {
      pane.append(el('div.section-title', {}, [el('h3', { text: 'Notes' })]));
      pane.append(el('div.card.card-pad.muted', { text: client.notes }));
    }
  }

  // ---- Services & status --------------------------------------------------
  function paneStatus(pane) {
    const statusSelect = (labelText, name, vocab, value) => {
      const sel = selectInput(name, vocab, value);
      sel.addEventListener('change', () => patch({ [name]: sel.value }));
      return el('div.status-cell', {}, [el('div.lbl', { text: labelText }), el('div.val.mt-8', {}, [sel])]);
    };
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Delivery status' })]));
    pane.append(el('div.status-grid', {}, [
      statusSelect('Website build', 'website_status', WEBSITE_STATUS, client.website_status),
      statusSelect('Google Business', 'gbp_status', GBP_STATUS, client.gbp_status),
      statusSelect('Google Ads', 'ads_status', ADS_STATUS, client.ads_status),
      (() => {
        const inp = numberInput('ads_budget', client.ads_budget ?? '', { placeholder: 'Monthly $' });
        inp.addEventListener('change', () => patch({ ads_budget: inp.value === '' ? null : Number(inp.value) }));
        return el('div.status-cell', {}, [el('div.lbl', { text: 'Ads budget / mo' }), el('div.val.mt-8', {}, [inp])]);
      })(),
    ]));

    // Onboarding checklist
    const list = client.onboarding && client.onboarding.length ? client.onboarding : [];
    const doneCount = list.filter((i) => i.done).length;
    pane.append(el('div.section-title', {}, [
      el('h3', { text: 'Onboarding' }),
      el('span.muted', { text: `${doneCount}/${list.length}` }),
    ]));
    const card = el('div.card.card-pad');
    if (list.length) {
      card.append(el('div.progress', {}, [el('span', { style: `width:${list.length ? (doneCount / list.length * 100) : 0}%` })]));
      const cl = el('div.check-list.mt-16');
      list.forEach((item, i) => {
        const row = el('label.check-item' + (item.done ? '.done' : ''), {}, [
          el('input.checkbox', { type: 'checkbox', checked: item.done, onchange: (e) => {
            const next = client.onboarding.map((x, j) => j === i ? { ...x, done: e.target.checked } : x);
            patch({ onboarding: next });
          } }),
          el('span', { text: item.label }),
        ]);
        cl.append(row);
      });
      card.append(cl);
    } else card.append(el('div.muted', { text: 'No onboarding checklist. Edit the client to add the default steps.' }));
    pane.append(card);

    // Renewals
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Domains / hosting / email' })]));
    pane.append(el('dl.kv.card.card-pad', {}, [
      el('dt', { text: 'Domain' }), el('dd', { text: client.domain_name || '—' }),
      el('dt', { text: 'Domain renews' }), el('dd', { text: client.domain_renews_on ? fmtDate(client.domain_renews_on) : '—' }),
      el('dt', { text: 'Hosting' }), el('dd', { text: client.hosting_provider || '—' }),
      el('dt', { text: 'Hosting renews' }), el('dd', { text: client.hosting_renews_on ? fmtDate(client.hosting_renews_on) : '—' }),
      el('dt', { text: 'Email' }), el('dd', { text: client.email_provider || '—' }),
      el('dt', { text: 'Email renews' }), el('dd', { text: client.email_renews_on ? fmtDate(client.email_renews_on) : '—' }),
    ]));
    pane.append(el('div.pill-row.mt-8', {}, [
      el('button.btn.btn-ghost.btn-sm', { text: 'Edit renewals', onclick: () => openRenewalForm(client, rerender) }),
      el('button.btn.btn-ghost.btn-sm', { text: 'Add renewal tasks', title: 'Create annual renewal reminders from the dates above', onclick: async () => {
        const jobs = [
          ['Domain renewal', client.domain_name, client.domain_renews_on],
          ['Hosting renewal', client.hosting_provider, client.hosting_renews_on],
          ['Email renewal', client.email_provider, client.email_renews_on],
        ].filter(([, , date]) => date);
        if (!jobs.length) { toast('Add renewal dates first', 'err'); return; }
        try {
          for (const [title, who, date] of jobs) {
            await Tasks.create({ client_id: id, title: title + (who ? ` (${who})` : ''), category: 'renewal', recur_interval: 'annual', recurring: true, due_date: date, assignee: 'Josh' });
          }
          toast(`${jobs.length} renewal task(s) added`); rerender();
        } catch (e) { toast(e.message, 'err'); }
      } }),
    ]));
  }

  // ---- Work (tasks) -------------------------------------------------------
  function paneWork(pane) {
    pane.append(el('div.section-title', {}, [
      el('h3', { text: 'Tasks' }),
      el('div.pill-row', {}, [
        el('button.btn.btn-ghost.btn-sm', { text: '+ Monthly set', onclick: async () => {
          try {
            for (const title of MONTHLY_TEMPLATE) await Tasks.create({ client_id: id, title, category: 'monthly', recurring: true, recur_interval: 'monthly', assignee: 'Josh' });
            toast('Monthly tasks added'); rerender();
          } catch (e) { toast(e.message, 'err'); }
        } }),
        el('button.btn.btn-ghost.btn-sm', { text: '+ Renewal', onclick: () => openTaskForm({ client_id: id, category: 'renewal', recur_interval: 'annual' }, rerender, client) }),
        el('button.btn.btn-primary.btn-sm', { text: '+ Task', onclick: () => openTaskForm({ client_id: id }, rerender, client) }),
      ]),
    ]));
    const tasks = bundle.tasks;
    if (!tasks.length) { pane.append(emptyState('No tasks yet.', 'tasks')); return; }
    const rows = el('div.rows.card');
    tasks.forEach((t) => rows.append(taskRow(t, rerender)));
    pane.append(rows);
  }

  // ---- Money (balance, payments, invoices) --------------------------------
  function paneMoney(pane) {
    const inv = bundle.invoices;
    const pays = bundle.payments || [];
    const fin = clientFinance(client, bundle);

    const editInput = (name, value) => {
      const inp = numberInput(name, value ?? '', { placeholder: '0' });
      inp.addEventListener('change', () => patch({ [name]: inp.value === '' ? 0 : Number(inp.value) }));
      return inp;
    };

    // Bucket 1 — Initial build (one-time)
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Initial build' })]));
    pane.append(el('div.grid.grid-3', {}, [
      el('div.stat', {}, [el('div.stat-value.mt-8', {}, [editInput('build_fee', client.build_fee)]), el('div.stat-label', { text: 'Build fee' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(fin.buildCollected) }), el('div.stat-label', { text: 'Collected' })]),
      el('div.stat' + (fin.buildOutstanding ? '.stat-gold' : ''), {}, [el('div.stat-value', { text: money(fin.buildOutstanding) }), el('div.stat-label', { text: 'Outstanding' })]),
    ]));
    pane.append(el('label.field-row.mt-8', {}, [
      el('input.checkbox', { type: 'checkbox', checked: !!client.build_fee_paid, onchange: (e) => patch({ build_fee_paid: e.target.checked }) }),
      el('span', { text: 'Build fully paid' }),
    ]));

    // Bucket 2 — Monthly recurring
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Monthly recurring' })]));
    pane.append(el('div.grid.grid-3', {}, [
      el('div.stat', {}, [el('div.stat-value.mt-8', {}, [editInput('mrr', client.mrr)]), el('div.stat-label', { text: 'MRR' })]),
      el('div.stat', {}, [el('div.stat-value', { text: money(fin.monthlyCollected) }), el('div.stat-label', { text: 'Collected' })]),
      el('div.stat' + (fin.monthlyOutstanding ? '.stat-gold' : ''), {}, [el('div.stat-value', { text: money(fin.monthlyOutstanding) }), el('div.stat-label', { text: 'Outstanding' })]),
    ]));

    // Payments ledger
    pane.append(el('div.section-title', {}, [
      el('h3', { text: 'Payments received' }),
      el('button.btn.btn-gold.btn-sm', { html: `${iconSvg('plus', 14)} Record payment`, onclick: () => openPaymentForm({ client_id: id }, rerender) }),
    ]));
    if (pays.length) {
      const rows = el('div.rows.card');
      pays.forEach((p) => rows.append(el('div.row', {}, [
        el('div.row-main', {}, [
          el('div.row-title', { text: money(p.amount) + (p.kind ? ' · ' + labelOf(PAYMENT_KIND, p.kind) : '') }),
          el('div.row-sub', {}, [p.paid_on ? fmtDate(p.paid_on) : '', p.method || '', p.note || '']),
        ]),
        el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this payment?')) { await Payments.remove(p.id); rerender(); } } }),
      ])));
      pane.append(rows);
    } else pane.append(el('div.muted.mt-8', { text: 'No payments recorded yet.' }));

    // Invoices
    pane.append(el('div.section-title', {}, [
      el('h3', { text: 'Invoices' }),
      el('button.btn.btn-primary.btn-sm', { text: '+ Invoice', onclick: () => openInvoiceForm({ client_id: id }, rerender, client) }),
    ]));
    if (!inv.length) { pane.append(el('div.muted.mt-8', { text: 'No invoices yet.' })); return; }
    const rows = el('div.rows.card');
    inv.forEach((i) => rows.append(invoiceRow(i, rerender)));
    pane.append(rows);
  }

  // ---- Content ------------------------------------------------------------
  function paneContent(pane) {
    // Reviews
    pane.append(el('div.section-title', {}, [
      el('h3', { text: 'Review requests' }),
      el('button.btn.btn-ghost.btn-sm', { text: '+ Request', onclick: () => openReviewForm({ client_id: id }, rerender) }),
    ]));
    if (bundle.reviews.length) {
      const rows = el('div.rows.card');
      bundle.reviews.forEach((r) => rows.append(el('div.row', {}, [
        el('div.row-main', {}, [
          el('div.row-title', { text: r.customer_name || 'Customer' }),
          el('div.row-sub', {}, [labelOf([{ key: 'google', label: 'Google' }, { key: 'facebook', label: 'Facebook' }, { key: 'other', label: 'Other' }], r.channel), r.requested_on ? '· ' + fmtDate(r.requested_on) : '']),
        ]),
        statusBadge(REVIEW_STATUS, r.status),
      ])));
      pane.append(rows);
    } else pane.append(el('div.muted.mt-8', { text: 'No review requests logged.' }));

    // Content items
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Content' })]));
    if (bundle.content.length) {
      const rows = el('div.rows.card');
      bundle.content.forEach((ci) => rows.append(el('div.row', {}, [
        el('div.row-main', {}, [el('div.row-title', { text: ci.title }), el('div.row-sub', {}, [ci.channel, ci.scheduled_for ? '· ' + fmtDate(ci.scheduled_for) : ''])]),
        badge(ci.status, 'blue'),
      ])));
      pane.append(rows);
    } else pane.append(el('div.muted.mt-8', { html: 'No content scheduled. Manage the full calendar in the <b>Content</b> tab.' }));

    // Assets
    pane.append(el('div.section-title', {}, [el('h3', { text: 'Assets' })]));
    if (bundle.assets.length) {
      const rows = el('div.rows.card');
      bundle.assets.forEach((a) => rows.append(el('div.row', {}, [
        el('div.row-main', {}, [el('div.row-title', { text: a.name }), el('div.row-sub', {}, [a.kind])]),
        a.url ? el('a.icon-btn', { href: a.url, target: '_blank', html: iconSvg('external', 18) }) : null,
      ])));
      pane.append(rows);
    } else pane.append(el('div.muted.mt-8', { text: 'No assets linked yet.' }));
  }

  // ---- Activity -----------------------------------------------------------
  function paneActivity(pane) {
    const noteInput = textArea('body', '', { rows: 2, placeholder: 'Log a call, note, or next step…' });
    const kindSel = selectInput('kind', [
      { key: 'note', label: 'Note' }, { key: 'call', label: 'Call' }, { key: 'email', label: 'Email' },
      { key: 'meeting', label: 'Meeting' }, { key: 'follow_up', label: 'Follow-up' },
    ], 'note');
    const dueInput = dateInput('due_at', '');
    pane.append(el('div.card.card-pad', {}, [
      noteInput,
      el('div.field-row.mt-8', {}, [kindSel, dueInput,
        el('button.btn.btn-primary', { text: 'Add', onclick: async () => {
          if (!noteInput.value.trim()) return;
          try {
            await Activities.create({ client_id: id, kind: kindSel.value, body: noteInput.value.trim(), due_at: dueInput.value || null });
            toast('Logged'); rerender();
          } catch (e) { toast(e.message, 'err'); }
        } }),
      ]),
    ]));
    if (!bundle.activities.length) { pane.append(emptyState('No activity yet.', 'clock')); return; }
    const rows = el('div.rows.card.mt-16');
    bundle.activities.forEach((a) => rows.append(el('div.row', {}, [
      el('div.row-main', {}, [
        el('div.row-title', { text: a.body || labelOf([{ key: 'note', label: 'Note' }], a.kind) }),
        el('div.row-sub', {}, [badge(a.kind, 'gray'), a.due_at ? '· due ' + fmtDate(a.due_at) : '', '· ' + fmtDate(a.created_at)]),
      ]),
      el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { await Activities.remove(a.id); rerender(); } }),
    ])));
    pane.append(rows);
  }

  paint();
}

// ---- shared row renderers (exported for reuse) ----------------------------
export function taskRow(t, refresh) {
  const done = t.status === 'done';
  const recur = t.recur_interval && t.recur_interval !== 'none';
  const recurLabel = (RECUR_INTERVAL.find((r) => r.key === t.recur_interval) || {}).label;
  return el('div.row', {}, [
    el('input.checkbox', { type: 'checkbox', checked: done, onchange: async (e) => {
      const r = await markTaskDone(t, e.target.checked);
      if (r.recurred) toast('Recurring — next due ' + fmtDate(r.next));
      refresh?.();
    } }),
    el('div.row-main', {}, [
      el('div.row-title', { text: t.title, style: done ? 'text-decoration:line-through;color:var(--muted)' : '' }),
      el('div.row-sub', {}, [
        badge(t.assignee, 'gold'),
        badge(labelOf([{ key: 'monthly', label: 'Monthly' }, { key: 'onboarding', label: 'Onboarding' }, { key: 'build', label: 'Build' }, { key: 'content', label: 'Content' }, { key: 'renewal', label: 'Renewal' }, { key: 'general', label: 'General' }], t.category), t.category === 'renewal' ? 'violet' : 'gray'),
        t.due_date ? el('span', { class: dueClass(t.due_date, done), text: relDue(t.due_date) }) : null,
        recur ? badge(recurLabel, 'blue') : null,
      ]),
    ]),
    el('button.icon-btn', { html: iconSvg('trash', 16), onclick: async () => { if (await confirmDialog('Delete this task?')) { await Tasks.remove(t.id); refresh?.(); } } }),
  ]);
}

export function invoiceRow(i, refresh) {
  return el('div.row', {}, [
    el('div.row-main', {}, [
      el('div.row-title', { text: i.description || labelOf(INVOICE_TYPE, i.type) }),
      el('div.row-sub', {}, [
        badge(labelOf(INVOICE_TYPE, i.type), 'gray'),
        i.due_on ? el('span', { class: dueClass(i.due_on, i.status === 'paid'), text: i.status === 'paid' ? 'paid' : 'due ' + relDue(i.due_on) }) : null,
      ]),
    ]),
    el('div.row-right', {}, [
      el('span.row-amount', { text: money(i.amount) }),
      (() => { const s = selectInput('status', INVOICE_STATUS, i.status); s.classList.add('btn-sm'); s.style.width = 'auto'; s.addEventListener('change', async () => { await Invoices.update(i.id, { status: s.value, paid_on: s.value === 'paid' ? todayISO() : null }); refresh?.(); }); return s; })(),
    ]),
  ]);
}

function dueClass(date, done) {
  if (done) return 'text-green';
  const n = (new Date(date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000;
  return n < 0 ? 'text-red' : n <= 3 ? 'text-amber' : 'muted';
}
function normUrl(u) { return /^https?:\/\//.test(u) ? u : 'https://' + u; }

// ---- small sub-forms ------------------------------------------------------
function openRenewalForm(client, onSaved) {
  const node = el('div.form-grid.cols-2', {}, [
    field('Domain name', textInput('domain_name', client.domain_name)),
    field('Domain renews', dateInput('domain_renews_on', client.domain_renews_on)),
    field('Hosting provider', textInput('hosting_provider', client.hosting_provider)),
    field('Hosting renews', dateInput('hosting_renews_on', client.hosting_renews_on)),
    field('Email provider', textInput('email_provider', client.email_provider)),
    field('Email renews', dateInput('email_renews_on', client.email_renews_on)),
  ]);
  const { close } = openSheet({
    title: 'Renewals', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Save', tone: 'primary', onClick: async () => { await Clients.update(client.id, readForm(node)); toast('Saved'); close(); onSaved?.(); } },
    ],
  });
}

function openReviewForm(base, onSaved) {
  const node = el('div.form', {}, [
    field('Customer name', textInput('customer_name', '')),
    el('div.form-grid.cols-2', {}, [
      field('Channel', selectInput('channel', [{ key: 'google', label: 'Google' }, { key: 'facebook', label: 'Facebook' }, { key: 'other', label: 'Other' }], 'google')),
      field('Status', selectInput('status', REVIEW_STATUS, 'requested')),
    ]),
    field('Notes', textInput('notes', '')),
  ]);
  const { close } = openSheet({
    title: 'Review request', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Add', tone: 'primary', onClick: async () => { await Reviews.create({ ...base, ...readForm(node), requested_on: todayISO() }); toast('Added'); close(); onSaved?.(); } },
    ],
  });
}

// Record a payment / deposit against a client. Exported so the Financials tab
// can reuse it.
export function openPaymentForm(base, onSaved) {
  const node = el('div.form', {}, [
    el('div.form-grid.cols-2', {}, [
      field('Amount', numberInput('amount', '', { placeholder: '0' })),
      field('Type', selectInput('kind', PAYMENT_KIND, 'deposit')),
      field('Date', dateInput('paid_on', todayISO())),
      field('Method', selectInput('method', PAYMENT_METHODS, 'Relay')),
    ]),
    field('Note', textInput('note', '', { placeholder: 'e.g. 50% deposit on build' })),
  ]);
  const { close } = openSheet({
    title: 'Record payment', body: node,
    actions: [
      { label: 'Cancel', tone: 'ghost', onClick: () => close() },
      { label: 'Save', tone: 'gold', onClick: async () => {
        const v = readForm(node);
        v.amount = Number(v.amount || 0);
        if (!v.amount) { toast('Enter an amount', 'err'); return; }
        try { await Payments.create({ ...base, ...v }); toast('Payment recorded'); close(); onSaved?.(); }
        catch (e) { toast(e.message, 'err'); }
      } },
    ],
  });
}
