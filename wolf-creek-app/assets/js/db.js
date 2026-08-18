// Supabase data layer for Wolf Creek Farms.
// The Supabase client is loaded via a classic <script> in index.html (vendored
// locally at assets/vendor/supabase.js) and exposed as window.supabase, so the
// app still boots on a weak signal with only the cached shell.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const { createClient } = window.supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function createJob(data) {
  const { data: row, error } = await sb.from('jobs').insert(data).select().single();
  if (error) throw error;
  return row;
}

export async function updateJob(id, patch) {
  const { data: row, error } = await sb.from('jobs').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return row;
}

export async function deleteJob(id) {
  const { error } = await sb.from('jobs').delete().eq('id', id);
  if (error) throw error;
}

export async function allJobs() {
  const { data, error } = await sb.from('jobs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Estimates tab: unquoted leads, OLDEST first (longest-waiting on top).
export async function leadsList() {
  const { data, error } = await sb
    .from('jobs').select('*')
    .in('status', ['lead', 'pending'])
    .order('received_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Pending tab: quoted jobs only (awaiting decision / ready to schedule).
export async function pendingJobs() {
  const { data, error } = await sb
    .from('jobs').select('*')
    .in('status', ['estimate_given', 'won'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Scheduled tab: work on the books, by date.
export async function scheduledJobs() {
  const { data, error } = await sb
    .from('jobs').select('*')
    .eq('status', 'scheduled')
    .order('scheduled_date', { ascending: true });
  if (error) throw error;
  return data;
}

// Completed tab: finished jobs still awaiting payment. Once marked paid they
// drop out here (and everywhere in the app) but stay in the database + Drive.
export async function completedJobs() {
  const { data, error } = await sb
    .from('jobs').select('*')
    .eq('status', 'completed').eq('paid', false)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ---- Expenses tab (mileage log + business expenses) ----
export async function expenseEntries() {
  const { data, error } = await sb.from('expenses').select('*')
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function addExpense(data) {
  const { data: row, error } = await sb.from('expenses').insert(data).select().single();
  if (error) throw error;
  return row;
}
export async function updateExpense(id, patch) {
  const { data: row, error } = await sb.from('expenses').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return row;
}
export async function deleteExpense(id) {
  const { error } = await sb.from('expenses').delete().eq('id', id);
  if (error) throw error;
}
