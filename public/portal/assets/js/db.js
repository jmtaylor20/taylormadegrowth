// Supabase access for the portal.
//
// Every query here is written as though it could see everything, because the
// database makes sure it cannot. There is no client-side filtering by client id
// anywhere in this file — RLS scopes each request to the signed-in contact's own
// engagement. If a query here started returning another client's rows, the bug
// would be in a policy, not here, and db/tests/onboarding_isolation_test.sql
// would already be red.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { humanize, humanizeStorage } from './errors.js';

const { createClient } = window.supabase;
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const unwrap = ({ data, error }) => { if (error) throw humanize(error); return data; };

// ---- Who am I --------------------------------------------------------------

/** The caller's own client record — the safe seven-column view, never the CRM row. */
export async function myClient() {
  const rows = unwrap(await sb.from('onboarding_my_client').select('*').limit(1));
  return rows?.[0] || null;
}

export async function myContact() {
  const rows = unwrap(await sb.from('client_contacts').select('id,name,email,title,role').limit(50));
  return rows || [];
}

/**
 * Which of those contacts is the person sitting here.
 *
 * Matched on email rather than auth_user_id because the binding runs on the
 * first sign-in and a contact re-invited under a new auth user would otherwise
 * come back null. Used only for attribution on answers — never for access,
 * which is the database's job.
 */
export async function meAsContact(email) {
  if (!email) return null;
  const rows = unwrap(await sb.from('client_contacts')
    .select('id,name,email,title,role').ilike('email', String(email).trim()).limit(1));
  return rows?.[0] || null;
}

// ---- Engagement and sections -----------------------------------------------

export async function myEngagements() {
  return unwrap(await sb
    .from('onboarding_engagements')
    .select('id,title,status,due_date,vertical,template_key,invited_at,submitted_at')
    .order('created_at', { ascending: false })) || [];
}

/**
 * The sections activated on an engagement, with their library copy and their
 * computed progress. Three reads rather than one embedded query: the progress
 * view has no foreign key PostgREST can embed through, and stitching in JS is
 * clearer than fighting the query language for it.
 */
export async function sectionsFor(engagementId) {
  const [rows, library, progress] = await Promise.all([
    sb.from('onboarding_engagement_sections')
      .select('id,section_key,status,due_date,position,active,assigned_contact_id,submitted_at')
      .eq('engagement_id', engagementId).eq('active', true).order('position').then(unwrap),
    sb.from('onboarding_sections')
      .select('key,title,tier,intro,description,position').eq('active', true).then(unwrap),
    sb.from('onboarding_section_progress')
      .select('engagement_section_id,field_count,response_count,percent_complete').then(unwrap),
  ]);
  const byKey = Object.fromEntries((library || []).map((s) => [s.key, s]));
  const byId = Object.fromEntries((progress || []).map((p) => [p.engagement_section_id, p]));
  return (rows || []).map((r) => ({
    ...r,
    section: byKey[r.section_key] || { key: r.section_key, title: r.section_key },
    progress: byId[r.id] || { field_count: 0, response_count: 0, percent_complete: null },
  }));
}

/**
 * One activated section, looked up by its id alone.
 *
 * Deliberately NOT filtered by engagement here. Someone can arrive on this URL
 * from a forwarded link, and the only thing that should decide whether they see
 * it is the policy on the table — a client-side `engagement_id` filter would
 * make the page look safe while the guarantee lived in the wrong place. If the
 * row is not theirs, RLS returns nothing and the portal sends them home.
 */
export async function sectionById(engagementSectionId) {
  const rows = unwrap(await sb.from('onboarding_engagement_sections')
    .select('id,engagement_id,section_key,status,due_date,position,active,assigned_contact_id,submitted_at')
    .eq('id', engagementSectionId).limit(1));
  const row = rows?.[0];
  if (!row) return null;
  const lib = unwrap(await sb.from('onboarding_sections')
    .select('key,title,tier,intro').eq('key', row.section_key).limit(1));
  return { ...row, section: lib?.[0] || { key: row.section_key, title: row.section_key } };
}

export async function markSectionStatus(sectionRowId, status) {
  const patch = { status };
  if (status === 'in_progress') patch.started_at = new Date().toISOString();
  if (status === 'submitted') patch.submitted_at = new Date().toISOString();
  return unwrap(await sb.from('onboarding_engagement_sections')
    .update(patch).eq('id', sectionRowId).select().single());
}

// ---- Fields and answers ----------------------------------------------------

/** Top-level fields of a section. Repeating groups come later (phase 3). */
export async function fieldsFor(sectionKey) {
  return unwrap(await sb.from('onboarding_fields')
    .select('id,field_key,label,help_text,placeholder,field_kind,field_type,required,position,options,unit,min_rows,max_rows')
    .eq('section_key', sectionKey).eq('active', true)
    .is('parent_field_id', null).order('position')) || [];
}

export async function responsesFor(engagementSectionId) {
  return unwrap(await sb.from('onboarding_responses')
    .select('id,field_id,row_id,status,value_text,value_number,value_boolean,value_date,value_json')
    .eq('engagement_section_id', engagementSectionId).is('row_id', null)) || [];
}

/**
 * Write one answer.
 *
 * Insert-or-update by hand rather than upsert: the uniqueness rule is a PARTIAL
 * index (`where row_id is null`), which PostgREST's on_conflict cannot target.
 * The caller passes the existing row id when it has one.
 */
export async function saveResponse({ id, engagementSectionId, fieldId, status, value, contactId }) {
  const row = {
    status,
    value_text: null, value_number: null, value_boolean: null, value_date: null, value_json: null,
  };
  // Only `answered` carries a value. "Unknown" and "Not applicable" are answers
  // in their own right, stored with every value column null — which is what
  // makes a completion percentage mean something later.
  if (status === 'answered' && value !== undefined && value !== null) Object.assign(row, value);

  if (id) {
    row.updated_by_contact_id = contactId || null;
    return unwrap(await sb.from('onboarding_responses').update(row).eq('id', id).select().single());
  }
  row.engagement_section_id = engagementSectionId;
  row.field_id = fieldId;
  row.answered_by_contact_id = contactId || null;
  return unwrap(await sb.from('onboarding_responses').insert(row).select().single());
}

export async function deleteResponse(id) {
  return unwrap(await sb.from('onboarding_responses').delete().eq('id', id));
}

// ---- Files -----------------------------------------------------------------
// Bytes live in Supabase Storage; the row describing them lives here. The first
// path segment is the engagement id, and that IS the tenant boundary inside the
// bucket — the storage policy scopes on it and the assets trigger enforces the
// same prefix, so the two cannot drift apart.

const BUCKET = 'onboarding';

export async function assetsFor(engagementSectionId) {
  return unwrap(await sb.from('onboarding_assets')
    .select('id,field_id,row_id,storage_path,file_name,mime_type,byte_size,kind,caption,created_at')
    .eq('engagement_section_id', engagementSectionId).order('created_at')) || [];
}

/** Keep a filename recognisable to the person who uploaded it, and harmless as a path. */
function safeName(name) {
  return String(name || 'file')
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-80) || 'file';
}

/** What kind of thing this is, guessed from the question rather than the file. */
function assetKind(field, file) {
  const key = field?.field_key || '';
  if (/logo/.test(key)) return 'logo';
  if (/brand/.test(key)) return 'brand';
  if (/photo|portfolio|gallery|image/.test(key)) return 'photo';
  if ((file?.type || '').startsWith('image/')) return 'photo';
  return 'document';
}

export async function uploadAsset({ engagementId, sectionKey, engagementSectionId, field, file, contactId }) {
  const path = `${engagementId}/${sectionKey}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const up = await sb.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw humanizeStorage(up.error);

  try {
    return unwrap(await sb.from('onboarding_assets').insert({
      engagement_section_id: engagementSectionId,
      field_id: field?.id || null,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      kind: assetKind(field, file),
      uploaded_by_contact_id: contactId || null,
    }).select().single());
  } catch (err) {
    // The bytes are already in the bucket. If the row describing them is
    // refused, take them back out — an object nothing points at is invisible to
    // every screen we have and would sit there forever.
    await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    throw err;
  }
}

export async function deleteAsset(asset) {
  const rm = await sb.storage.from(BUCKET).remove([asset.storage_path]);
  if (rm.error) throw humanizeStorage(rm.error);
  return unwrap(await sb.from('onboarding_assets').delete().eq('id', asset.id));
}

/** A short-lived link, so a client can check they uploaded the right file. */
export async function assetPreviewUrl(asset, seconds = 300) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(asset.storage_path, seconds);
  if (error) throw humanizeStorage(error);
  return data?.signedUrl || null;
}
