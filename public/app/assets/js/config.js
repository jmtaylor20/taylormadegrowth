// TaylorMade Brands — internal ops app configuration.
// This is the ONE file you edit to tune the app: keys, PIN, team, and the
// option lists that populate every dropdown. No build step — just save + push.
//
// The Supabase publishable key is safe for the browser (governed by RLS).

// ---- Deployment profiles ---------------------------------------------------
// ONE codebase serves both TaylorMade's full ops app (Josh) and stripped-down
// "clean copies" for contractors (Tony, later Wyatt). The active profile is
// picked by hostname, so the same push deploys to every site — a contractor
// copy is just a config entry + its own Supabase project + its own subdomain.
//
//   mode      'owner'      = the full app (everything on)
//             'contractor' = a contractor's private copy (admin bits stripped)
//   auth      'supabase'   = real sign-in required; every request carries a
//                            staff JWT and the database enforces the rest
//             'pin'        = the old client-side PIN. Deters nothing; it is
//                            kept ONLY for contractor copies whose Supabase
//                            projects have not been migrated to real auth yet.
//                            Remove it from a profile the moment its project
//                            has staff_users and is_staff().
//   features  per-surface switches read across the app (see FEATURES below)
//   keepPct / agencyPct   contractor's take vs. TaylorMade's cut (contractor mode)
const PROFILES = {
  // Josh — the full TaylorMade Brands operating system.
  owner: {
    mode: 'owner',
    auth: 'supabase',
    brand: 'TaylorMade Brands',
    supabaseUrl: 'https://buubrapkkqyalecwbhkh.supabase.co',
    supabaseKey: 'sb_publishable_h-KXdNNW7Tc_BFut25s_sQ_ypIidBJB',
    owner: 'Josh',
    team: ['Josh', 'Wyatt', 'Tony', 'Cole'],
    features: {
      assignee: true,        // "assigned to" picker on tasks
      contractorsTab: true,  // Financials → Contractors payout tab
      splitDeposit: true,    // Split-deposit waterfall (Josh's Relay buckets)
      welcomeEmail: true,    // auto welcome email when a lead becomes a client
      repPicker: true,       // per-invoice contractor/rep split picker
      revShareSelf: false,   // show "you keep X% · TaylorMade Y%" summaries
      invoicing: true,       // create/send invoices
      proposalApproval: false, // proposals need owner sign-off before sending
      buildReview: false,    // website builds submitted for owner review
      approvalsInbox: true,  // owner sees a queue of contractors' pending items
    },
  },
  // Tony — TaylorMade-branded, operates under Josh's umbrella. Keeps the
  // marketing tools (Reports + Google Ads); admin bits stripped. Flat 25% of
  // everything he collects goes to TaylorMade (he keeps 75%).
  tony: {
    mode: 'contractor',
    // PENDING: Tony's Supabase project still runs the old permissive posture —
    // anon has full read/write and his publishable key is in this public repo.
    // Deferred on 2026-08-19 because that database is currently EMPTY, so the
    // hole is real but there is nothing behind it yet.
    //
    // That makes this a dated decision, not a permanent one. It expires the
    // moment he puts a client in there. Until his project gets client_contacts
    // / staff_users / is_staff() he has nothing to sign in WITH, so the PIN
    // stays — not as security, but as a placeholder for it. See db/SECURITY.md.
    auth: 'pin',
    brand: 'TaylorMade Brands',
    contractor: 'Tony',
    host: 'tony',
    keepPct: 0.75,
    agencyPct: 0.25,
    supabaseUrl: 'https://obweziktfdhdswtwzzmh.supabase.co',
    supabaseKey: 'sb_publishable_JTKaZ1V3rU0nUiCk6OgVeQ_BaRJ2weB',
    pin: '0519',   // Tony's PIN
    owner: 'Tony',
    team: ['Tony'],
    features: {
      assignee: false,
      contractorsTab: false,
      splitDeposit: false,
      welcomeEmail: false,
      repPicker: false,
      revShareSelf: true,
      invoicing: false,        // Tony doesn't invoice
      proposalApproval: true,  // his proposals need Josh's sign-off before sending
      buildReview: true,       // his website builds get submitted for Josh's review
      approvalsInbox: false,
    },
  },
};

// Pick the active profile by hostname. Tony's copy lives at a `tony.*`
// subdomain (e.g. tony.taylormadegrowth.com) pointed at the same site; every
// other host is Josh's full app.
function resolveProfile() {
  const h = (typeof location !== 'undefined' ? location.hostname : '').toLowerCase();
  // A contractor profile owns any host that starts with its token (e.g.
  // tony.taylormadegrowth.com, wyatt-taylormade.netlify.app) or carries it as
  // a label. Everything else is the full owner app.
  for (const key of Object.keys(PROFILES)) {
    const p = PROFILES[key];
    if (!p.host) continue;
    if (h === p.host || h.startsWith(p.host + '.') || h.startsWith(p.host + '-') || h.includes('.' + p.host + '.') || h.includes('.' + p.host + '-')) return p;
  }
  return PROFILES.owner;
}
export const PROFILE = resolveProfile();
export const FEATURES = PROFILE.features;

// Contractor databases the owner app reads for the Approvals queue. Each entry
// is a separate Supabase project (a contractor's isolated data). The owner app
// connects to these read/write to approve proposals and build reviews.
export const CONTRACTOR_DBS = Object.values(PROFILES)
  .filter((p) => p.mode === 'contractor' && !String(p.supabaseUrl).startsWith('__'))
  .map((p) => ({ name: p.contractor, url: p.supabaseUrl, key: p.supabaseKey, keepPct: p.keepPct, agencyPct: p.agencyPct }));

// The Supabase publishable key is safe for the browser (governed by RLS).
export const SUPABASE_URL = PROFILE.supabaseUrl;
export const SUPABASE_KEY = PROFILE.supabaseKey;

// How this profile gets in. 'supabase' means a real session is required and
// there is no other door; 'pin' is the legacy client-side gate, still present
// only for contractor copies whose projects have not been migrated.
export const AUTH_MODE = PROFILE.auth || 'pin';

// Only ever set on a profile still using AUTH_MODE 'pin'. The PIN lives in the
// browser next to the key it supposedly protects, so it deters a curious
// passer-by and nothing else.
export const APP_PIN = PROFILE.pin || null;

// ---- Team (task assignment) ----------------------------------------------
export const OWNER = PROFILE.owner;
export const TEAM = PROFILE.team;

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

// Common tasks Josh logs — power the one-tap task picker on the task form.
// `cat` maps to a TASK_CATEGORY key so choosing a task auto-sets its category.
// Choose "Other" in the picker to type a custom title.
export const TASK_PRESETS = [
  { label: 'Website updates',                              cat: 'build' },
  { label: 'Web build',                                    cat: 'build' },
  { label: 'Website integration (forms / analytics)',      cat: 'build' },
  { label: 'App updates',                                  cat: 'general' },
  { label: 'Google Ads optimization & changes',            cat: 'monthly' },
  { label: 'Google Ads analysis',                          cat: 'monthly' },
  { label: 'Google Ads campaign setup',                    cat: 'onboarding' },
  { label: 'Monthly report',                               cat: 'monthly' },
  { label: 'Social media content creation & posting',      cat: 'content' },
  { label: 'Facebook ad — post creation & promotion',      cat: 'content' },
  { label: 'Facebook ads management & review',             cat: 'monthly' },
  { label: 'Google Business Profile updates',              cat: 'monthly' },
  { label: 'Google Business Profile post',                 cat: 'content' },
  { label: 'Google Business Profile reputation management', cat: 'monthly' },
  { label: 'Consultation / client meeting',                cat: 'general' },
  { label: 'Needs assessment',                             cat: 'onboarding' },
  { label: 'Branding / logo design',                       cat: 'general' },
  { label: 'Print / marketing design',                     cat: 'content' },
  { label: 'Apparel design & order',                       cat: 'general' },
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

// Deposit allocation waterfall (Josh's Relay bucket split). Tax comes off the
// FULL deposit first (before the checking floor is topped back up — the order
// Relay won't allow), then Cole + Owner's Draw, with the remainder to debt.
// Percentages are of the gross deposit; Cole varies per job so his % is a
// default you can override per deposit.
export const ALLOCATION = { floor: 500, tax: 0.30, cole: 0.12, draw: 0.12 };

// Retainer billing timing. 'advance' = bill (in the last week) for next month;
// 'arrears' = bill at the end of the current service month.
export const BILLING_MODES = [
  { key: 'advance', label: 'Advance (bill for next month)' },
  { key: 'arrears', label: 'Arrears (bill for current month)' },
];

// The Mapbox public token for the trip mileage calculator is stored in the
// database (app_settings id='mapbox'), not here — GitHub push-protection flags
// pk.* tokens, and keeping it in the DB lets it be rotated without a redeploy.
