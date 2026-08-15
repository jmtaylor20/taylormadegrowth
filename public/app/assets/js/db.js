// Supabase data layer for TaylorMade Growth.
// One thin generic CRUD wrapper + a handful of purpose-built loaders.
// The Supabase client is loaded via a classic <script> in index.html (vendored
// locally at assets/vendor/supabase.js) and exposed as window.supabase.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const { createClient } = window.supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// True once real credentials are wired in (config still has placeholders
// until the Supabase project is created).
export const CONFIGURED = !SUPABASE_URL.startsWith('__') && !SUPABASE_KEY.startsWith('__');

// ---- Generic table helpers -------------------------------------------------
function table(name) {
  return {
    async list(opts = {}) {
      let q = sb.from(name).select('*');
      if (opts.eq) for (const [k, v] of Object.entries(opts.eq)) q = q.eq(k, v);
      if (opts.in) for (const [k, v] of Object.entries(opts.in)) q = q.in(k, v);
      if (opts.order) q = q.order(opts.order.col, { ascending: opts.order.asc ?? true, nullsFirst: false });
      else q = q.order('created_at', { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async create(row) {
      const { data, error } = await sb.from(name).insert(row).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { data, error } = await sb.from(name).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async remove(id) {
      const { error } = await sb.from(name).delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const Clients   = table('clients');
export const Tasks     = table('tasks');
export const Invoices  = table('invoices');
export const Content   = table('content_items');
export const Assets    = table('assets');
export const Reviews   = table('reviews');
export const Proposals = table('proposals');
export const Activities = table('activities');
export const Payments  = table('payments');
export const Reports   = table('reports');
export const Trips     = table('trips');
export const Meetings  = table('meetings');
export const TimeEntries = table('time_entries');
export const Expenses   = table('expenses');
export const AdMetrics  = table('ad_metrics');
export const Settings   = table('app_settings');

// App-wide settings (single-row key/value). getSetting returns the stored
// `data` object (or a default); setSetting upserts it.
export async function getSetting(id, dflt = {}) {
  const rows = await Settings.list({ eq: { id } });
  return (rows[0] && rows[0].data) || dflt;
}
export async function setSetting(id, data) {
  const rows = await Settings.list({ eq: { id } });
  if (rows[0]) return Settings.update(id, { data, updated_at: new Date().toISOString() });
  return Settings.create({ id, data });
}

// ---- Time tracking ---------------------------------------------------------
// The single currently-running timer (a time entry with no minutes yet), if any.
export async function runningTimer() {
  const { data, error } = await sb.from('time_entries').select('*').is('minutes', null).not('started_at', 'is', null).order('started_at', { ascending: false }).limit(1);
  if (error) throw error;
  return (data || [])[0] || null;
}
// Start a timer for a client (optionally tied to a task). Stops any other one.
export async function startTimer({ client_id = null, task_id = null, kind = 'task', notes = null }) {
  const open = await runningTimer();
  if (open) await stopTimer(open);
  return TimeEntries.create({ client_id, task_id, kind, notes, started_at: new Date().toISOString() });
}
// Stop a running timer, writing the elapsed minutes.
export async function stopTimer(entry) {
  const mins = Math.max(1, Math.round((Date.now() - Date.parse(entry.started_at)) / 60000));
  return TimeEntries.update(entry.id, { minutes: mins, entry_date: new Date().toISOString().slice(0, 10) });
}

// ---- Purpose-built loaders -------------------------------------------------

// Everything the dashboard needs, in parallel.
export async function loadOverview() {
  const [clients, invoices, tasks, activities] = await Promise.all([
    Clients.list({ order: { col: 'updated_at', asc: false } }),
    Invoices.list(),
    Tasks.list(),
    Activities.list(),
  ]);
  return { clients, invoices, tasks, activities };
}

// Tasks for a client (or all), newest-due first.
export async function tasksFor(clientId) {
  return Tasks.list({ eq: clientId ? { client_id: clientId } : undefined, order: { col: 'due_date', asc: true } });
}

// Child records tied to one client (for the detail sheet).
export async function clientBundle(clientId) {
  const [tasks, invoices, activities, content, assets, reviews, proposals, payments, time] = await Promise.all([
    Tasks.list({ eq: { client_id: clientId }, order: { col: 'due_date', asc: true } }),
    Invoices.list({ eq: { client_id: clientId }, order: { col: 'issued_on', asc: false } }),
    Activities.list({ eq: { client_id: clientId } }),
    Content.list({ eq: { client_id: clientId }, order: { col: 'scheduled_for', asc: true } }),
    Assets.list({ eq: { client_id: clientId } }),
    Reviews.list({ eq: { client_id: clientId } }),
    Proposals.list({ eq: { client_id: clientId } }),
    Payments.list({ eq: { client_id: clientId }, order: { col: 'paid_on', asc: false } }),
    TimeEntries.list({ eq: { client_id: clientId }, order: { col: 'created_at', asc: false } }),
  ]);
  return { tasks, invoices, activities, content, assets, reviews, proposals, payments, time };
}

// Move a client to a new stage. When they become a client for the first time
// (and have an email + haven't been welcomed), queue the welcome email.
// Returns { client, welcomed }.
export async function setStage(client, newStage) {
  const patch = { stage: newStage };
  let welcomed = false;
  if (newStage === 'client' && client.stage !== 'client' && !client.welcome_status && client.email) {
    patch.welcome_status = 'queued';
    patch.welcome_to = client.email;
    welcomed = true;
  }
  const updated = await Clients.update(client.id, patch);
  return { client: updated, welcomed };
}

// Financial rollup for one client, split into the two money buckets:
//   build   = initial one-time builds (build_fee / one_time invoices, build &
//             deposit payments)
//   monthly = recurring retainer (MRR, monthly invoices & payments)
const isBuildInvoice = (i) => i.type === 'build_fee' || i.type === 'one_time';
const n = (x) => Number(x || 0);

export function clientFinance(client, bundle) {
  const inv = bundle.invoices || [];
  const pays = bundle.payments || [];
  const sum = (arr) => arr.reduce((s, x) => s + n(x.amount), 0);

  // --- Build (initial) bucket ---
  const buildFee = n(client.build_fee);
  const buildCollected = sum(inv.filter((i) => isBuildInvoice(i) && i.status === 'paid'))
    + sum(pays.filter((p) => p.kind === 'build' || p.kind === 'deposit'));
  const buildOutstanding = client.build_fee_paid ? 0 : Math.max(0, buildFee - buildCollected);

  // --- Monthly (recurring) bucket ---
  const mrr = n(client.mrr);
  const monthlyCollected = sum(inv.filter((i) => i.type === 'monthly' && i.status === 'paid'))
    + sum(pays.filter((p) => p.kind === 'monthly'));
  const monthlyOutstanding = sum(inv.filter((i) => i.type === 'monthly' && (i.status === 'sent' || i.status === 'overdue')));

  return {
    buildFee, buildCollected, buildOutstanding,
    mrr, monthlyCollected, monthlyOutstanding,
    collected: buildCollected + monthlyCollected,
    outstanding: buildOutstanding + monthlyOutstanding,
  };
}
