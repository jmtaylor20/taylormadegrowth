// Monthly report generator. Builds a clean, printable one-pager for a client
// from their live data — services delivered, work completed, content, reviews,
// and results — ready to print to PDF or screenshot and send.
import { SERVICE_LABEL, WEBSITE_STATUS, GBP_STATUS, ADS_STATUS } from './config.js';
import { el, money, fmtDate, labelOf, openSheet, iconSvg, badge } from './ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function openReport(client, bundle) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const label = MONTHS[now.getMonth()] + ' ' + now.getFullYear();

  const doneThisMonth = (bundle.tasks || []).filter((t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= monthStart);
  const postedThisMonth = (bundle.content || []).filter((c) => c.status === 'posted' && c.scheduled_for && new Date(c.scheduled_for + 'T00:00:00') >= monthStart);
  const reviewsLeft = (bundle.reviews || []).filter((r) => r.status === 'left');

  const doc = el('div.report', {}, [
    el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--navy);padding-bottom:14px;margin-bottom:18px' }, [
      el('div', {}, [
        el('div', { style: 'font-family:var(--head);font-weight:800;font-size:1.3rem;color:var(--navy-dark)', html: 'TaylorMade <span style="color:var(--gold)">Brands</span>' }),
        el('div.muted', { style: 'font-size:.85rem', text: 'Monthly Growth Report' }),
      ]),
      el('div', { style: 'text-align:right' }, [
        el('div', { style: 'font-weight:700;color:var(--navy-dark)', text: client.business_name }),
        el('div.muted', { style: 'font-size:.85rem', text: label }),
      ]),
    ]),

    reportSection('Services delivered', el('div.pill-row', {}, (client.services || []).length ? client.services.map((s) => badge(SERVICE_LABEL[s] || s, 'blue')) : [el('span.muted', { text: 'No services on file' })])),

    reportSection('Channel status', el('dl.kv', {}, [
      el('dt', { text: 'Website' }), el('dd', { text: labelOf(WEBSITE_STATUS, client.website_status) }),
      el('dt', { text: 'Google Business' }), el('dd', { text: labelOf(GBP_STATUS, client.gbp_status) }),
      el('dt', { text: 'Google Ads' }), el('dd', { text: labelOf(ADS_STATUS, client.ads_status) + (client.ads_budget ? ' · ' + money(client.ads_budget) + '/mo' : '') }),
    ])),

    reportSection(`Work completed (${doneThisMonth.length})`, doneThisMonth.length
      ? el('ul', { style: 'margin:0;padding-left:18px' }, doneThisMonth.map((t) => el('li', { text: t.title })))
      : el('span.muted', { text: 'No tasks marked complete this month yet.' })),

    reportSection(`Content published (${postedThisMonth.length})`, postedThisMonth.length
      ? el('ul', { style: 'margin:0;padding-left:18px' }, postedThisMonth.map((c) => el('li', { text: `${c.title} — ${labelOf([{ key: 'instagram', label: 'Instagram' }, { key: 'facebook', label: 'Facebook' }, { key: 'gbp', label: 'Google Business' }, { key: 'blog', label: 'Blog' }, { key: 'other', label: 'Other' }], c.channel)}` })))
      : el('span.muted', { text: 'No posts published this month yet.' })),

    reportSection(`Reviews earned (${reviewsLeft.length})`, reviewsLeft.length
      ? el('ul', { style: 'margin:0;padding-left:18px' }, reviewsLeft.map((r) => el('li', { text: (r.customer_name || 'Customer') + (r.rating ? ` — ${r.rating}★` : '') })))
      : el('span.muted', { text: 'No new reviews recorded this month.' })),

    el('div', { style: 'margin-top:24px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:.82rem' }, [
      el('span', { text: 'Prepared by TaylorMade Brands · taylormadegrowth.com' }),
    ]),
  ]);

  openSheet({
    title: 'Monthly report — ' + label,
    body: doc,
    wide: true,
    actions: [
      { label: 'Print / Save PDF', tone: 'primary', onClick: () => printReport(doc, client, label) },
    ],
  });
}

function reportSection(title, content) {
  return el('div', { style: 'margin-bottom:16px' }, [
    el('h4', { style: 'font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:var(--gold);margin-bottom:7px', text: title }),
    content,
  ]);
}

// Open a clean print window so the app chrome doesn't bleed into the PDF.
function printReport(doc, client, label) {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) { window.print(); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>${client.business_name} — ${label}</title>
    <style>
      body{font-family:'Inter',system-ui,sans-serif;color:#101827;max-width:720px;margin:32px auto;padding:0 24px;line-height:1.5}
      dl{display:grid;grid-template-columns:150px 1fr;gap:5px 14px;margin:0}dt{color:#64748b}dd{margin:0;font-weight:600}
      ul{margin:0;padding-left:18px}li{margin:2px 0}
      .badge{display:inline-block;padding:3px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:.75rem;font-weight:700;margin:0 4px 4px 0}
      .pill-row{display:flex;flex-wrap:wrap}.muted{color:#64748b}
      h4{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:#b45309;margin:18px 0 6px}
    </style></head><body>${doc.innerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 300);
}
