// TaylorMade Growth — internal ops app configuration.
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

// ---- Pipeline stages ------------------------------------------------------
export const STAGES = [
  { key: 'lead',       label: 'Lead',        hint: 'New — needs first contact' },
  { key: 'prospect',   label: 'Prospect',    hint: 'In conversation / quoting' },
  { key: 'client',     label: 'Client',      hint: 'Active, paying' },
  { key: 'past_client',label: 'Past client', hint: 'Former client' },
  { key: 'lost',       label: 'Lost',        hint: 'Did not close' },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

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
  { key: 'general',    label: 'General' },
];
export const TASK_STATUS = [
  { key: 'todo',  label: 'To do',       tone: 'gray' },
  { key: 'doing', label: 'In progress', tone: 'blue' },
  { key: 'done',  label: 'Done',        tone: 'green' },
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
