// Proves an unauthenticated caller holding only the publishable key can reach
// nothing — over HTTP, against the real project.
//
// This is deliberately NOT a database test. db/tests/onboarding_isolation_test.sql
// already asserts the same boundary inside Postgres, and it runs on every
// `npm run db:test-rls`. But a test that lives inside the database can only ever
// see what the database sees. It would not notice the legacy JWT keys being
// re-enabled, a PostgREST or gateway setting changing what is exposed, a bucket
// flipped public in the dashboard, or an RPC becoming callable. Those are all
// ways this posture could regress without a single policy changing, so this
// probe goes through the whole stack the way a stranger would.
//
// It reads the URL and key straight out of the app's own config, so it tests
// exactly the credential that ships in page source rather than a copy that can
// drift.
//
//   npm run db:test-anon
//   node scripts/test-anon-lockout.mjs --url https://xxx.supabase.co --key sb_publishable_...
//
// Safety: every write it attempts is filtered to an id that cannot exist, so a
// regression is detected without destroying anything. The one exception is the
// INSERT probe, which by nature would create a row if the door were open — it
// is marked, and deleted again immediately if it lands.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

// ---- Target -----------------------------------------------------------------
function fromAppConfig() {
  const cfg = readFileSync(join(ROOT, 'public/app/assets/js/config.js'), 'utf8');
  // The owner profile is the first one declared.
  const url = (cfg.match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
  const key = (cfg.match(/supabaseKey:\s*'([^']+)'/) || [])[1];
  return { url, key };
}
const target = { ...fromAppConfig() };
if (argOf('--url')) target.url = argOf('--url');
if (argOf('--key')) target.key = argOf('--key');

if (!target.url || !target.key) {
  console.error('Could not determine the Supabase URL/key. Pass --url and --key.');
  process.exit(2);
}

// ---- What to probe ----------------------------------------------------------
// Discovered from the SQL rather than hardcoded, so a table added later is
// covered automatically. A list maintained by hand is a list that silently stops
// being complete.
function tablesFromSource() {
  const files = [
    join(ROOT, 'supabase/schema.sql'),
    ...readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => join(ROOT, 'supabase/migrations', f)),
  ];
  const found = new Set();
  for (const f of files) {
    const sql = readFileSync(f, 'utf8');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_0-9]+)/gi)) {
      found.add(m[1]);
    }
  }
  return [...found].sort();
}
function viewsFromSource() {
  const found = new Set();
  for (const f of readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.([a-z_0-9]+)/gi)) found.add(m[1]);
  }
  return [...found].sort();
}
// Functions anon must not be able to call. RPC is a separate surface from tables:
// a SECURITY DEFINER function callable by anon would hand out exactly what these
// policies are keeping back.
const RPCS = ['is_staff', 'current_auth_email', 'onboarding_client_ids',
              'onboarding_engagement_ids', 'bind_auth_identity'];

// ---- Probing ----------------------------------------------------------------
const H = { apikey: target.key, Authorization: `Bearer ${target.key}` };
const results = [];
const record = (name, verdict, detail = '') => {
  results.push({ name, verdict, detail });
  const tag = { LOCKED: 'ok  ', ABSENT: 'n/a ', EXPOSED: 'OPEN', ERROR: 'err ' }[verdict];
  console.log(`  ${tag}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function req(path, init = {}) {
  const res = await fetch(`${target.url}${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  let body = '';
  try { body = await res.text(); } catch { /* empty */ }
  return { status: res.status, body };
}

// A response is only acceptable if it refused, or if the object does not exist
// at all. Anything that returns data is a regression, and so is a 2xx on a write.
function classify(status, body) {
  if (status === 401 || status === 403) return 'LOCKED';
  // PGRST205 = table/view not in the schema cache; PGRST202 = no such function.
  if (status === 404 || /PGRST20[25]/.test(body)) return 'ABSENT';
  if (status >= 200 && status < 300) return 'EXPOSED';
  return 'LOCKED';
}
const short = (b) => {
  try { const d = JSON.parse(b); return (d.message || d.hint || '').slice(0, 48); }
  catch { return b.slice(0, 48); }
};

console.log(`Probing ${target.url} as an unauthenticated caller.`);
console.log(`Key: ${target.key.slice(0, 22)}… (publishable — this is meant to be public)\n`);

// --- Reads -------------------------------------------------------------------
const tables = tablesFromSource();
console.log(`Reads — ${tables.length} tables discovered from the SQL:`);
for (const t of tables) {
  const { status, body } = await req(`/rest/v1/${t}?select=*&limit=1`);
  record(`read ${t}`, classify(status, body), `HTTP ${status} ${short(body)}`);
}

const views = viewsFromSource();
console.log(`\nReads — ${views.length} views:`);
for (const v of views) {
  const { status, body } = await req(`/rest/v1/${v}?select=*&limit=1`);
  record(`read view ${v}`, classify(status, body), `HTTP ${status} ${short(body)}`);
}

// --- Writes ------------------------------------------------------------------
console.log('\nWrites:');
const NOWHERE = '00000000-0000-0000-0000-000000000000';

{
  const { status, body } = await req(`/rest/v1/clients?id=eq.${NOWHERE}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_name: 'anon-lockout-probe' }),
  });
  record('update clients', classify(status, body), `HTTP ${status} ${short(body)}`);
}
{
  const { status, body } = await req(`/rest/v1/clients?id=eq.${NOWHERE}`, { method: 'DELETE' });
  record('delete clients', classify(status, body), `HTTP ${status} ${short(body)}`);
}
{
  const marker = 'anon-lockout-probe — delete me';
  const { status, body } = await req('/rest/v1/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ business_name: marker }),
  });
  const verdict = classify(status, body);
  record('insert clients', verdict, `HTTP ${status} ${short(body)}`);
  if (verdict === 'EXPOSED') {
    // The door is open. Clean up after ourselves rather than leaving litter in
    // a database that evidently accepts anything.
    await req(`/rest/v1/clients?business_name=eq.${encodeURIComponent(marker)}`, { method: 'DELETE' });
    console.log('        (probe row removed — but anon INSERT succeeded, which is the finding)');
  }
}

// --- RPC ---------------------------------------------------------------------
console.log('\nRPC:');
for (const fn of RPCS) {
  const { status, body } = await req(`/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  record(`call ${fn}()`, classify(status, body), `HTTP ${status} ${short(body)}`);
}

// --- Storage -----------------------------------------------------------------
console.log('\nStorage:');
{
  const { status, body } = await req('/storage/v1/bucket');
  // An empty list is not a refusal, but it is also not a leak. Only a populated
  // list means anon can enumerate buckets.
  let verdict = classify(status, body);
  if (verdict === 'EXPOSED' && /^\s*\[\s*\]\s*$/.test(body)) verdict = 'LOCKED';
  record('list buckets', verdict, `HTTP ${status} ${short(body) || body.slice(0, 32)}`);
}
{
  const { status, body } = await req('/storage/v1/object/list/onboarding', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 5 }),
  });
  let verdict = classify(status, body);
  if (verdict === 'EXPOSED' && /^\s*\[\s*\]\s*$/.test(body)) verdict = 'LOCKED';
  record('list objects in onboarding bucket', verdict, `HTTP ${status} ${short(body) || body.slice(0, 32)}`);
}

// --- Schema disclosure -------------------------------------------------------
console.log('\nDisclosure:');
{
  const { status, body } = await req('/rest/v1/');
  // PostgREST serves an OpenAPI document listing whatever the caller may reach.
  // With no grants that should name none of our tables; if it names them, anon
  // can at least enumerate the shape of the database.
  const leaked = tables.filter((t) => new RegExp(`"/${t}"`).test(body));
  record('OpenAPI root names no tables', leaked.length === 0 ? 'LOCKED' : 'EXPOSED',
    leaked.length ? `leaks: ${leaked.slice(0, 5).join(', ')}` : `HTTP ${status}`);
}

// ---- Verdict ----------------------------------------------------------------
const exposed = results.filter((r) => r.verdict === 'EXPOSED');
const absent = results.filter((r) => r.verdict === 'ABSENT');
const locked = results.filter((r) => r.verdict === 'LOCKED');

console.log(`\n${'-'.repeat(64)}`);
console.log(`  locked: ${locked.length}    not present yet: ${absent.length}    EXPOSED: ${exposed.length}`);
if (absent.length) {
  console.log(`\n  Not present yet (cannot leak, will be probed once they ship):`);
  console.log(`    ${absent.map((r) => r.name.replace(/^read (view )?/, '')).join(', ')}`);
}
if (exposed.length) {
  console.log('\n  ANON CAN REACH THE FOLLOWING. This is a regression:');
  for (const r of exposed) console.log(`    - ${r.name}  (${r.detail})`);
  console.log('\n  Someone has restored a permissive anon policy or grant. See db/SECURITY.md.');
  process.exit(1);
}
console.log('\n  anon is locked out. The publishable key on its own is worth nothing.');
