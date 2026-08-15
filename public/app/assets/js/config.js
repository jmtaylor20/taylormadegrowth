// TaylorMade Brands — internal ops app configuration.
// This is the ONE file you edit to tune the app: keys, PIN, team, and the
// option lists that populate every dropdown. No build step — just save + push.
//
// The Supabase publishable key is safe for the browser (governed by RLS).

export const SUPABASE_URL = 'https://buubrapkkqyalecwbhkh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_h-KXdNNW7Tc_BFut25s_sQ_ypIidBJB';

// Light access gate. NOTE: the PIN lives in the client, so it deters casual
// access rather than being real security. Swap for Supabase logins when you
// want a true lock-down (the database is already RLS-ready).
export const APP_PIN = '4280';

// ---- Team (task assignment) ----------------------------------------------
export const OWNER = 'Josh';
export const TEAM = ['Josh', 'Wyatt', 'Tony', 'Cole'];

// ---- Business info (shown on proposals / quotes / estimates / invoices) ----
export const BUSINESS = {
  name: 'TaylorMade Brands',
  address1: '1346 Tallapoosa Street',
  address2: 'Notasulga, AL 36866',
  phone: '334.391.6641',
  email: 'josh@taylormadegrowth.com',
  website: 'taylormadegrowth.com',
};

// ---- Prospect / client categories (industries you target) -----------------
export const CATEGORIES = [
  'Home Services', 'Trades / Contractor', 'Landscaping / Lawn', 'Tree Service',
  'Auto / Detailing', 'Restaurant / Food', 'Retail / Boutique', 'Health / Wellness',
  'Beauty / Salon', 'Fitness / Gym', 'Real Estate', 'Professional Services',
  'Church / Nonprofit', 'Events / Rentals', 'Other',
];

// ---- Lead sources ---------------------------------------------------------
export const SOURCES = [
  'Referral', 'Google search', 'Facebook / Instagram', 'Cold outreach',
  'Networking', 'Repeat / upsell', 'Walk-in', 'Website form', 'Other',
];

// ---- Services you sell (drives the service package + proposals) -----------
// key = stored value, label = what shows in the UI.
export const SERVICES = [
  { key: 'website',    label: 'Website build' },
  { key: 'management', label: 'Monthly management' },
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'gbp',        label: 'Google Business Profile' },
  { key: 'branding',   label: 'Logo & branding' },
  { key: 'social',     label: 'Social / content' },
  { key: 'print',      label: 'Print materials' },
  { key: 'hosting',    label: 'Hosting / domain / email' },
];
export const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.key, s.label]));

// Common services offered as one-tap checkboxes on the proposal builder.
// Checking one adds a priced line item + a scope-of-work entry (both editable).
// bucket: 'oneTime' or 'monthly' → which price column it defaults into.
export const PROPOSAL_SERVICES = [
  { key: 'website_build',      label: 'Website build',            bucket: 'oneTime', scope: 'Design and build a fast, mobile-friendly website with the pages needed to convert visitors.' },
  { key: 'branding',          label: 'Logo & branding',           bucket: 'oneTime', scope: 'Logo design and a cohesive brand identity.' },
  { key: 'google_ads',        label: 'Google Ads campaign',       bucket: 'oneTime', scope: 'Build, structure, and launch Google Ads campaigns targeted to the right service area.' },
  { key: 'ads_management',    label: 'Ads management',            bucket: 'monthly', scope: 'Ongoing Google Ads management, optimization, and reporting.' },
  { key: 'gbp',               label: 'Google Business Profile',   bucket: 'monthly', scope: 'Claim, optimize, and manage the Google Business Profile with posts and review requests.' },
  { key: 'monthly_management',label: 'Monthly management',        bucket: 'monthly', scope: 'Ongoing management, reporting, optimization, and next-step recommendations each month.' },
  { key: 'social',            label: 'Social / content',          bucket: 'monthly', scope: 'Monthly social content creation and scheduling.' },
  { key: 'print',             label: 'Print materials',           bucket: 'oneTime', scope: 'Design of business cards, flyers, and other print materials.' },
  { key: 'hosting',           label: 'Hosting / domain / email',  bucket: 'monthly', scope: 'Hosting, domain, and business email setup and management.' },
];

// ---- Pipeline stages ------------------------------------------------------
export const STAGES = [
  { key: 'lead',       label: 'Lead',        hint: 'New — needs first contact' },
  { key: 'prospect',   label: 'Prospect',    hint: 'In conversation / quoting' },
  { key: 'client',     label: 'Client',      hint: 'Active, paying' },
  { key: 'deferred',   label: 'Deferred',    hint: 'On hold / revisit later' },
  { key: 'past_client',label: 'Past client', hint: 'Former client' },
  { key: 'lost',       label: 'Lost',        hint: 'Did not close' },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

// Stage badge tones.
export const STAGE_TONE = { lead: 'gray', prospect: 'blue', client: 'green', deferred: 'amber', past_client: 'gray', lost: 'red' };

// ---- Payments (deposits / payments received) ------------------------------
export const PAYMENT_KIND = [
  { key: 'deposit',  label: 'Deposit' },
  { key: 'build',    label: 'Build fee' },
  { key: 'monthly',  label: 'Monthly' },
  { key: 'other',    label: 'Other' },
];
export const PAYMENT_METHODS = ['Relay', 'QuickBooks', 'Card', 'Cash', 'Check', 'Zelle', 'Venmo', 'Other'];

// ---- Status vocabularies (label + color token) ----------------------------
export const WEBSITE_STATUS = [
  { key: 'none',        label: 'No website', tone: 'gray' },
  { key: 'not_started', label: 'Not started', tone: 'gray' },
  { key: 'in_design',   label: 'In design',   tone: 'amber' },
  { key: 'in_dev',      label: 'In build',    tone: 'blue' },
  { key: 'review',      label: 'Client review', tone: 'violet' },
  { key: 'live',        label: 'Live',        tone: 'green' },
];
export const GBP_STATUS = [
  { key: 'none',       label: 'None',       tone: 'gray' },
  { key: 'claiming',   label: 'Claiming',   tone: 'amber' },
  { key: 'optimizing', label: 'Optimizing', tone: 'blue' },
  { key: 'managing',   label: 'Managing',   tone: 'green' },
];
export const ADS_STATUS = [
  { key: 'none',   label: 'None',   tone: 'gray' },
  { key: 'setup',  label: 'Setup',  tone: 'amber' },
  { key: 'active', label: 'Active', tone: 'green' },
  { key: 'paused', label: 'Paused', tone: 'red' },
];
export const INVOICE_STATUS = [
  { key: 'draft',   label: 'Draft',   tone: 'gray' },
  { key: 'sent',    label: 'Sent',    tone: 'blue' },
  { key: 'paid',    label: 'Paid',    tone: 'green' },
  { key: 'overdue', label: 'Overdue', tone: 'red' },
];
export const INVOICE_TYPE = [
  { key: 'monthly',   label: 'Monthly retainer' },
  { key: 'build_fee', label: 'Build fee' },
  { key: 'one_time',  label: 'One-time' },
];
export const TASK_CATEGORY = [
  { key: 'monthly',    label: 'Monthly mgmt' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'build',      label: 'Website build' },
  { key: 'content',    label: 'Content' },
  { key: 'renewal',    label: 'Renewal' },
  { key: 'general',    label: 'General' },
];
export const TASK_STATUS = [
  { key: 'todo',  label: 'To do',       tone: 'gray' },
  { key: 'doing', label: 'In progress', tone: 'blue' },
  { key: 'done',  label: 'Done',        tone: 'green' },
];

// Recurrence intervals (renewals use the longer ones).
export const RECUR_INTERVAL = [
  { key: 'none',       label: 'One-time',   months: 0 },
  { key: 'weekly',     label: 'Weekly',     months: 0, days: 7 },
  { key: 'biweekly',   label: 'Every 2 weeks', months: 0, days: 14 },
  { key: 'monthly',    label: 'Monthly',    months: 1 },
  { key: 'quarterly',  label: 'Quarterly',  months: 3 },
  { key: 'semiannual', label: 'Every 6 mo', months: 6 },
  { key: 'annual',     label: 'Annually',   months: 12 },
  { key: 'triennial',  label: 'Every 3 yrs',months: 36 },
];
export const CONTENT_CHANNEL = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook',  label: 'Facebook' },
  { key: 'gbp',       label: 'Google Business' },
  { key: 'blog',      label: 'Blog' },
  { key: 'other',     label: 'Other' },
];
export const CONTENT_STATUS = [
  { key: 'idea',      label: 'Idea',      tone: 'gray' },
  { key: 'draft',     label: 'Draft',     tone: 'amber' },
  { key: 'scheduled', label: 'Scheduled', tone: 'blue' },
  { key: 'posted',    label: 'Posted',    tone: 'green' },
];
export const ASSET_KIND = [
  { key: 'photo', label: 'Photo' },
  { key: 'video', label: 'Video' },
  { key: 'logo',  label: 'Logo' },
  { key: 'doc',   label: 'Document' },
  { key: 'other', label: 'Other' },
];
export const REVIEW_STATUS = [
  { key: 'requested', label: 'Requested', tone: 'amber' },
  { key: 'left',      label: 'Left',      tone: 'green' },
  { key: 'declined',  label: 'Declined',  tone: 'red' },
];
export const PROPOSAL_STATUS = [
  { key: 'draft',    label: 'Draft',    tone: 'gray' },
  { key: 'sent',     label: 'Sent',     tone: 'blue' },
  { key: 'accepted', label: 'Accepted', tone: 'green' },
  { key: 'declined', label: 'Declined', tone: 'red' },
];
export const CONTRACT_STATUS = [
  { key: 'none',   label: 'No contract', tone: 'gray' },
  { key: 'sent',   label: 'Sent',        tone: 'amber' },
  { key: 'signed', label: 'Signed',      tone: 'green' },
];

// A proposal can be presented as a proposal, a quote, or an estimate.
export const DOC_TYPE = [
  { key: 'proposal', label: 'Proposal' },
  { key: 'quote',    label: 'Quote' },
  { key: 'estimate', label: 'Estimate' },
];

// Partnership / agreement length options.
export const CONTRACT_TERMS = ['No contract', 'Month-to-month', '3-month', '6-month', '12-month', '24-month'];

// Monthly report metrics. Any left blank are omitted from the report.
export const REPORT_METRICS = [
  { key: 'impressions',  label: 'Impressions' },
  { key: 'reach',        label: 'Reach' },
  { key: 'engagements',  label: 'Engagements' },
  { key: 'clicks',       label: 'Clicks' },
  { key: 'ctr',          label: 'Click-through rate', suffix: '%' },
  { key: 'sessions',     label: 'Website visits' },
  { key: 'calls',        label: 'Phone calls' },
  { key: 'forms',        label: 'Form submissions' },
  { key: 'conversions',  label: 'Conversions / leads' },
  { key: 'reviews',      label: 'New reviews' },
  { key: 'ad_spend',     label: 'Ad spend', prefix: '$' },
  { key: 'cost_per_lead',label: 'Cost per lead', prefix: '$' },
  { key: 'hours',        label: 'Hours worked', suffix: 'h', decimals: 1, internal: true },
  { key: 'miles',        label: 'Miles driven', suffix: ' mi', internal: true },
];

// Universal prefill language for a monthly report (edit per report).
export const REPORT_HIGHLIGHTS_TEMPLATE =
  'Here’s your growth snapshot for the month. We continued managing your digital presence — optimizing your Google Business Profile, publishing content, and monitoring performance across channels. The numbers below show the reach and engagement your business earned, and what we’re focused on next.';
export const REPORT_NEXTSTEPS_TEMPLATE =
  'Next month we’ll keep building on what’s working — sharpening the highest-performing channels, requesting more reviews, and refining the offer to turn more attention into booked business.';

// Welcome email fired when a lead/proposal becomes a client.
export const WELCOME_SUBJECT = 'Welcome to the TaylorMade family 🎉';

// Document pipeline state (email send + Google Drive archive), driven by the
// Google Apps Script in /google-apps-script.
export const SEND_STATUS = [
  { key: 'queued', label: 'Send queued', tone: 'amber' },
  { key: 'sent',   label: 'Emailed',     tone: 'green' },
  { key: 'error',  label: 'Send failed', tone: 'red' },
];
export const DRIVE_STATUS = [
  { key: 'queued', label: 'Saving…',  tone: 'amber' },
  { key: 'saved',  label: 'In Drive', tone: 'green' },
  { key: 'error',  label: 'Save failed', tone: 'red' },
];

// ---- Default onboarding checklist (applied to a new client) ---------------
export const ONBOARDING_TEMPLATE = [
  'Signed agreement / deposit',
  'Kickoff call booked',
  'Brand assets collected (logo, photos)',
  'Domain / hosting / email access',
  'Google Business Profile access',
  'Google Ads account access',
  'Website content gathered',
  'Added to monthly management calendar',
  'Welcome email sent',
];

// ---- Default monthly management tasks (applied per client) -----------------
export const MONTHLY_TEMPLATE = [
  'Publish social / content posts',
  'Google Business Profile update + post',
  'Review Google Ads performance + optimize',
  'Request reviews from recent customers',
  'Website updates / tweaks',
  'Send monthly report',
];

// ---- Mileage & meetings ----------------------------------------------------
// IRS standard business mileage rates ($/mile), newest first. The IRS raised
// the 2026 rate mid-year (72.5¢ Jan–Jun, 76¢ from Jul 1). Add new brackets on
// top as they change.
export const MILEAGE_RATES = [
  { from: '2026-07-01', rate: 0.76 },
  { from: '2026-01-01', rate: 0.725 },
  { from: '2025-01-01', rate: 0.70 },
];
// Rate in effect on a given date (defaults to today / newest bracket).
export function mileageRateFor(dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10);
  return (MILEAGE_RATES.find((b) => d >= b.from) || MILEAGE_RATES[0]).rate;
}
// Current default rate (today).
export const MILEAGE_RATE = mileageRateFor();
export const TRIP_PURPOSES = ['Client meeting', 'Site visit', 'Sales call', 'Delivery / drop-off', 'Networking', 'Errand', 'Other'];
export const MEETING_TYPES = ['In person', 'Phone', 'Video', 'On site'];

// ---- Expenses & invoicing --------------------------------------------------
export const EXPENSE_CATEGORIES = ['Software / SaaS', 'Advertising', 'Subcontractor', 'Equipment', 'Office', 'Travel', 'Meals', 'Domains / Hosting', 'Fees', 'Other'];
// Net terms (days until due) for auto-generated monthly retainer invoices.
export const INVOICE_NET_DAYS = 15;

// Retainer billing timing. 'advance' = bill (in the last week) for next month;
// 'arrears' = bill at the end of the current service month.
export const BILLING_MODES = [
  { key: 'advance', label: 'Advance (bill for next month)' },
  { key: 'arrears', label: 'Arrears (bill for current month)' },
];

// The Mapbox public token for the trip mileage calculator is stored in the
// database (app_settings id='mapbox'), not here — GitHub push-protection flags
// pk.* tokens, and keeping it in the DB lets it be rotated without a redeploy.
