// Wolf Creek Farms — app configuration.
// The Supabase publishable key is designed for browser use (governed by RLS).

export const SUPABASE_URL = 'https://qbevslgvvkftdacsxmpl.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_avmIAUt-NRmBX56UjsMslw_nNz2o16Q';

// Light access gate. NOTE: this lives in the client, so it deters casual access
// rather than being real security. Swap for a real login when you want lock-down.
export const APP_PIN = '1234';

// ---- Towns served, with a default ZIP that auto-fills (still editable) ----
// Wolf Creek runs out of Notasulga across Macon, Lee, Elmore, Montgomery, and
// Tallapoosa counties. Add towns freely — the estimate form reads this list.
export const CITY_ZIP = {
  'Notasulga': '36866',
  'Opelika': '36801',
  'Auburn': '36830',
  'Tuskegee': '36083',
  'Shorter': '36075',
  'Eclectic': '36024',
  'Pike Road': '36064',
  'Montgomery': '36117',
  'Wetumpka': '36092',
  'Tallassee': '36078',
  'Dadeville': '36853',
  'Lake Martin': '36853',
  'Alexander City': '35010',
  'Union Springs': '36089',
  'Valley': '36854',
  'Waverly': '36879',
  'Other': '',
};
export const CITIES = Object.keys(CITY_ZIP);

// ---- Multi-select option lists (edit freely) ----
// Mirrors the nine services on wolfcreeklands.com.
export const SERVICES = [
  'Land clearing', 'Lot / brush clearing', 'Forestry mulching', 'Land preparation',
  'House pads / site prep', 'Road building', 'Driveway repair', 'Culvert install',
  'Pond building', 'Pond repair', 'Drainage work', 'Erosion control',
  'Demolition', 'Debris removal / haul-off', 'Clay gravel delivery', 'Topsoil / fill dirt',
  'Hunting land development', 'Food plots', 'Trail cutting', 'Grading / leveling',
  'Stump removal', 'Fence line clearing', 'Other',
];

// Things that change the price or the approach on a dirt job.
export const SITE_CONDITIONS = [
  'Steep terrain', 'Soft / wet ground', 'Standing water', 'Rock', 'Heavy timber',
  'Thick underbrush', 'Tight access', 'Gate too narrow', 'Long haul distance',
  'Overhead power lines', 'Underground utilities', 'Septic tank / field',
  'Near structures', 'Near property line', 'Existing fence', 'Livestock on site',
  'Needs survey / staking', 'Permit required', 'Creek / wetland nearby', 'Other',
];

export const PRIORITIES = ['low', 'normal', 'urgent'];

// Rough lead time Russ picks when quoting — included in the estimate email.
export const LEAD_TIMES = ['Scheduling now', '1–2 weeks', '2–4 weeks', '4–6 weeks', 'Weather permitting'];

// Reasons a scheduled job gets pushed.
// "Booked on wrong day" is a correction, not a real reschedule — it doesn't count
// toward the reschedule metric (see RESCHEDULE_CORRECTION).
export const RESCHEDULE_CORRECTION = 'Booked on wrong day (correction)';
export const RESCHEDULE_REASONS = [RESCHEDULE_CORRECTION, 'Weather', 'Ground too wet', 'Equipment down', 'Running behind', 'Customer request', 'Ran out of time'];

// Statuses Russ can set from the detail sheet.
export const STATUS_CHOICES = [
  { value: 'lead', label: 'Lead (needs estimate)' },
  { value: 'estimate_given', label: 'Quoted' },
  { value: 'won', label: 'Won' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'lost_lower_quote', label: 'Lost – lower quote' },
  { value: 'lost_overbid', label: 'Lost – over bid' },
  { value: 'lost_no_time', label: 'Lost – no time' },
];

// Company details (email templates carry their own copy too).
export const REVIEW_URL = 'https://www.google.com/search?q=Wolf+Creek+Farms+Notasulga+AL';
export const COMPANY = {
  name: 'Wolf Creek Farms',
  tagline: 'Land Clearing, Site Prep & Dirt Work',
  email: 'russ@wolfcreeklands.com',
  phone: '334-207-3331',
  website: 'wolfcreeklands.com',
};

// Every status: label (full), short (for pills), and color.
export const STATUS = {
  lead:             { label: 'Lead',                        short: 'Lead',      color: '#8a5a1e' },
  pending:          { label: 'Pending',                     short: 'Pending',   color: '#c98a00' }, // legacy
  estimate_given:   { label: 'Quoted',                      short: 'Quoted',    color: '#2563a8' },
  won:              { label: 'Won',                         short: 'Won',       color: '#2f6244' },
  scheduled:        { label: 'Scheduled',                   short: 'Scheduled', color: '#53825c' },
  completed:        { label: 'Completed',                   short: 'Completed', color: '#5a665f' },
  lost_lower_quote: { label: 'Lost – lower quote',          short: 'Lost',      color: '#b23b3b' },
  lost_overbid:     { label: 'Lost – over bid on purpose',  short: 'Lost',      color: '#b23b3b' },
  lost_no_time:     { label: "Lost – couldn't get to it",   short: 'Lost',      color: '#b23b3b' },
};

// Completion: how actual hours came in vs the estimate.
export const HOURS_RESULTS = [
  { value: 'under', label: 'Under' },
  { value: 'in_line', label: 'In line' },
  { value: 'over', label: 'Over' },
];

// ---- Expenses tab (IRS record-keeping) ------------------------------------
// The standard mileage rate Russ deducts, in dollars per mile. The IRS resets
// this every January — update it here and the mileage log recalculates.
export const MILEAGE_RATE = 0.70;
export const MILEAGE_RATE_YEAR = '2025';

// Business expense buckets for the monthly expense report.
export const EXPENSE_CATEGORIES = [
  'Fuel / diesel', 'Equipment payments', 'Equipment repairs', 'Parts & supplies',
  'Attachments / tooling', 'Insurance', 'Licenses & permits', 'Dump fees',
  'Materials (gravel, pipe, seed)', 'Subcontractor', 'Advertising',
  'Office / software', 'Meals (business)', 'Other',
];

// Common trip purposes, so the mileage log is two taps instead of typing.
export const TRIP_PURPOSES = ['Job site', 'Estimate visit', 'Parts run', 'Equipment haul', 'Fuel run', 'Dump run', 'Other'];

export const isLost = (s) => s && s.startsWith('lost_');
export const isWonish = (s) => s === 'won' || s === 'scheduled' || s === 'completed';
export const isLead = (s) => s === 'lead' || s === 'pending'; // pending = legacy lead
export const isQuoted = (s) => s === 'estimate_given' || s === 'won';
