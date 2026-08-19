// The shared rig behind scripts/test-portal-flow.mjs and
// scripts/test-onboarding-admin.mjs.
//
// Stands up a throwaway PostgreSQL 16 cluster with the full migration set, and
// serves one of the apps over HTTP with the vendored Supabase bundle swapped for
// a shim that runs every query against that cluster AS THE SIGNED-IN USER —
// `set local role authenticated` with their jwt claims. So what a page renders
// is what RLS allows, not what a fixture handed it. Supabase Auth is the one
// piece faked; there is no local mail service to send a sign-in code to.
//
// Nothing here touches a Supabase project. Postgres runs as an unprivileged
// user in a temp directory that the caller deletes on exit.

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
const PG_UID = 1000, PG_GID = 1000;
// One server per app, each pinned to its own directory: a suite can stand up
// the ops app and the portal side by side and drive both in one browser.
const servers = [];

const require = createRequire(import.meta.url);
// playwright lives in the global prefix here, not in a package.json.
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = require(join(globalRoot, 'playwright'));

const base = mkdtempSync(join(tmpdir(), 'tmb-harness-'));
const PGDATA = join(base, 'data');
const SOCKET = join(base, 'sock');
const SCRATCH = base;
let pg = null;
let DB = null;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
const asPg = (cmd, args, opts = {}) =>
  run('setpriv', ['--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups', cmd, ...args], opts);

function psql(args, opts = {}) {
  return asPg(join(PGBIN, 'psql'), ['-h', SOCKET, '-U', 'pgtest', '-d', DB || 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args], opts);
}

export function startPostgres() {
  run('mkdir', ['-p', PGDATA, SOCKET]);
  run('chown', ['-R', `${PG_UID}:${PG_GID}`, base]);
  run('chmod', ['700', PGDATA]);
  asPg(join(PGBIN, 'initdb'), ['-D', PGDATA, '-U', 'pgtest', '--auth=trust', '--encoding=UTF8', '--no-sync']);
  pg = spawn('setpriv', [
    '--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups',
    join(PGBIN, 'postgres'), '-D', PGDATA, '-k', SOCKET, '-c', 'listen_addresses=', '-c', 'fsync=off',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { asPg(join(PGBIN, 'pg_isready'), ['-h', SOCKET, '-U', 'pgtest', '-q']); return; }
    catch { execFileSync('sh', ['-c', 'sleep 0.2']); }
  }
  throw new Error('postgres did not become ready');
}

const MIGRATIONS = [
  '20260818140000_client_contacts_and_staff.sql',
  '20260818140100_onboarding_section_library.sql',
  '20260818140200_onboarding_engagements.sql',
  '20260818140300_onboarding_rls.sql',
  '20260818140400_onboarding_storage.sql',
  '20260818140500_lock_down_legacy_authenticated_policies.sql',
  '20260819130000_automation_accounts.sql',
  '20260819140000_automation_scope_policies.sql',
  '20260819150000_stage3_close_anon.sql',
];

export function buildDatabase({ seedTestClients = true, authEmails = [] } = {}) {
  asPg(join(PGBIN, 'createdb'), ['-h', SOCKET, '-U', 'pgtest', 'tmb_harness']);
  DB = 'tmb_harness';
  psql(['-f', join(ROOT, 'db/tests/supabase_shim.sql')]);
  psql(['-f', join(ROOT, 'supabase/schema.sql')]);
  psql(['-c', 'grant all on all tables in schema public to anon, authenticated, service_role;']);
  for (const m of MIGRATIONS) psql(['-f', join(ROOT, 'supabase/migrations', m)]);
  psql(['-f', join(ROOT, 'db/seed_onboarding_library.sql')]);
  if (seedTestClients) psql(['-f', join(ROOT, 'db/seed_onboarding_test_clients.sql')]);

  // Auth users for whoever the browser will sign in as. Confirmed, because
  // both onboarding_client_ids() and is_staff() only match a confirmed address.
  for (const email of authEmails) {
    psql(['-c', `insert into auth.users (email, email_confirmed_at) values ('${email}', now())
                 on conflict (email) do update set email_confirmed_at = now();`]);
  }

  VOID_FNS = new Set(psql(['-t', '-A', '-c', `
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'void'::regtype`]).trim().split('\n').filter(Boolean));
  SET_FNS = new Set(psql(['-t', '-A', '-c', `
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proretset`]).trim().split('\n').filter(Boolean));
}

// ---- SQL as the signed-in contact -------------------------------------------

const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v) || typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(String(s))) throw new Error(`unsafe identifier: ${s}`);
  return s;
};

/** Run one statement as a contact, and hand back rows or a PostgREST-shaped error. */
function asContact(session, sql) {
  const claims = session
    ? JSON.stringify({ sub: session.user.id, role: 'authenticated', email: session.user.email })
    : JSON.stringify({ role: 'anon' });
  const role = session ? 'authenticated' : 'anon';
  const script = [
    `\\set VERBOSITY verbose`,
    `begin;`,
    `select set_config('request.jwt.claims', ${lit(claims)}, true);`,
    `set local role ${role};`,
    // The marker is appended by the statement itself rather than wrapped around
    // it: a data-modifying CTE has to stay at the top level, so it cannot be
    // pushed into a subquery.
    `${sql};`,
    `commit;`,
  ].join('\n');
  try {
    const out = psql(['-t', '-A', '-f', '-'], { input: script });
    const m = /<<<([\s\S]*)>>>/.exec(out);
    return { data: m ? JSON.parse(m[1]) : null, error: null };
  } catch (err) {
    const text = `${err.stdout || ''}${err.stderr || ''}`;
    // psql prefixes the line with `psql:<stdin>:6: `, so this cannot anchor to ^.
    const m = /ERROR:\s+([0-9A-Z]{5}):\s*(.*)/.exec(text);
    return { data: null, error: { code: m ? m[1] : 'XX000', message: m ? m[2].trim() : text.trim() } };
  }
}

const WHERE = (filters) => {
  if (!filters.length) return '';
  const parts = filters.map(([op, col, val]) => {
    const c = ident(col);
    if (op === 'is') return `${c} is ${val === null ? 'null' : lit(val)}`;
    if (op === 'ilike') return `${c} ilike ${lit(val)}`;
    return `${c} = ${lit(val)}`;
  });
  return ' where ' + parts.join(' and ');
};

/** Translate the shim's query descriptor into SQL. A deliberately small subset. */
function toSql(q) {
  const table = ident(q.table);
  const cols = q.columns === '*' ? '*' : q.columns.split(',').map((c) => ident(c.trim())).join(', ');
  const where = WHERE(q.filters);

  // Every shape ends the same way: one row, one column, the rows as JSON
  // wrapped in markers the harness can find in psql's output.
  const emit = (inner) => `select '<<<' || coalesce((select json_agg(t)::text from (${inner}) t), 'null') || '>>>'`;
  const emitCte = (cte, inner) => `with ${cte}, j as (select json_agg(t)::text as s from (${inner}) t)
            select '<<<' || coalesce(j.s, 'null') || '>>>' from j`;

  if (q.action === 'select') {
    const order = q.order.length ? ' order by ' + q.order.map(([c, d]) => `${ident(c)} ${d}`).join(', ') : '';
    const limit = q.limit ? ` limit ${Number(q.limit)}` : '';
    return emit(`select ${cols} from public.${table}${where}${order}${limit}`);
  }
  if (q.action === 'insert') {
    // PostgREST takes an array as a multi-row insert. The union of keys across
    // the rows becomes the column list, and a row that omits one sends null,
    // which is what the server does too.
    const payloads = Array.isArray(q.payload) ? q.payload : [q.payload];
    const keys = [...new Set(payloads.flatMap((r) => Object.keys(r)))].map(ident);
    const tuples = payloads.map((r) => `(${keys.map((k) => lit(r[k])).join(', ')})`);
    return emitCte(`w as (insert into public.${table} (${keys.join(', ')}) values ${tuples.join(', ')} returning *)`,
                   `select ${cols} from w`);
  }
  if (q.action === 'update') {
    const sets = Object.keys(q.payload).map((k) => `${ident(k)} = ${lit(q.payload[k])}`);
    return emitCte(`w as (update public.${table} set ${sets.join(', ')}${where} returning *)`,
                   `select ${cols} from w`);
  }
  if (q.action === 'delete') {
    return emitCte(`w as (delete from public.${table}${where} returning *)`, `select * from w`);
  }
  throw new Error('unknown action ' + q.action);
}

function handleQuery(session, q) {
  const { data, error } = asContact(session, toSql(q));
  if (error) return { data: null, error };
  const rows = data || [];
  if (q.single) {
    // PostgREST's .single() is an error when the row count is not exactly one —
    // which is how a write blocked by RLS surfaces to the page.
    if (rows.length !== 1) {
      return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    return { data: rows[0], error: null };
  }
  return { data: rows, error: null };
}

// PostgREST answers an RPC with an array only when the function returns a SET;
// a scalar function answers with the scalar itself. Getting that wrong is not
// cosmetic — `is_staff()` is read as `data === true`, and `[true]` fails it. And
// json_agg has nothing to aggregate over a void return, so those are called for
// their effect and answered with null.
let VOID_FNS = new Set();
let SET_FNS = new Set();

function handleRpc(session, fn, args) {
  const f = ident(fn);
  const argSql = Object.entries(args || {}).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ');
  if (VOID_FNS.has(f)) {
    const r = asContact(session, `select '<<<' || 'null' || '>>>' from (select public.${f}(${argSql})) x`);
    return { data: null, error: r.error };
  }
  if (SET_FNS.has(f)) {
    return asContact(session,
      `select '<<<' || coalesce((select json_agg(t.v)::text from (select public.${f}(${argSql}) as v) t), '[]') || '>>>'`);
  }
  return asContact(session,
    `select '<<<' || coalesce(to_jsonb(public.${f}(${argSql}))::text, 'null') || '>>>'`);
}

function handleStorage(session, body) {
  const bucket = String(body.bucket || '');
  if (body.fn === 'upload') {
    const r = asContact(session, `with w as (
        insert into storage.objects (bucket_id, name, owner, metadata)
        values (${lit(bucket)}, ${lit(body.path)}, null, ${lit(body.meta || {})})
        returning id, name
      ), j as (select json_agg(t)::text as s from (select * from w) t)
      select '<<<' || coalesce(j.s, 'null') || '>>>' from j`);
    if (r.error) return { data: null, error: { message: r.error.message, statusCode: statusFor(r.error.code) } };
    return { data: { path: body.path }, error: null };
  }
  if (body.fn === 'remove') {
    const names = (body.paths || []).map(lit).join(', ');
    const r = asContact(session, `with w as (
        delete from storage.objects
         where bucket_id = ${lit(bucket)} and name in (${names || 'null'}) returning name
      ), j as (select json_agg(t)::text as s from (select * from w) t)
      select '<<<' || coalesce(j.s, 'null') || '>>>' from j`);
    if (r.error) return { data: null, error: { message: r.error.message, statusCode: statusFor(r.error.code) } };
    return { data: r.data || [], error: null };
  }
  return { data: null, error: { message: 'unsupported storage call ' + body.fn, statusCode: 400 } };
}

// Storage reports an RLS refusal as HTTP 403, not a SQLSTATE, so the shim has to
// translate — otherwise humanizeStorage() would never see the shape it handles.
const statusFor = (code) => (code === '42501' ? 403 : 400);

// ---- Static server ----------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export function startHttp(serveDir, { basePath = '' } = {}) {
  const SERVE = serveDir || join(ROOT, 'public/portal');
  return new Promise((done) => {
    const http = createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/__pg') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        let out;
        try {
          out = body.op === 'rpc' ? handleRpc(body.session, body.fn, body.args)
              : body.op === 'storage' ? handleStorage(body.session, body)
              : handleQuery(body.session, body.q);
        } catch (err) {
          out = { data: null, error: { code: 'XX000', message: err.message } };
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(out));
      }

      // The one file that is swapped: the vendored Supabase bundle.
      if (req.url.endsWith('/assets/vendor/supabase.js')) {
        res.writeHead(200, { 'content-type': 'text/javascript' });
        return res.end(readFileSync(join(ROOT, 'scripts/portal-test-shim.js')));
      }

      // The ops app references a couple of assets by absolute path (/app/...),
      // because in production it is mounted there. Honour that here rather than
      // letting them 404 and muddy the "no errors on the page" assertion.
      let path = decodeURIComponent(req.url.split('?')[0]);
      if (basePath && path.startsWith(basePath + '/')) path = path.slice(basePath.length);
      const rel = normalize(path).replace(/^(\.\.[/\\])+/, '');
      const file = join(SERVE, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(SERVE) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    servers.push(http);
    http.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${http.address().port}`));
  });
}


// ---- Lifecycle --------------------------------------------------------------

export const SCRATCH_DIR = () => base;
export const psqlRaw = (args, opts) => psql(args, opts);
/** Read the database directly, as owner, to check what a page actually wrote. */
export const sql = (q) => psql(['-t', '-A', '-c', q]).trim();

export function launchBrowser() {
  return chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
}

export function sessionFor(email) {
  return { user: { id: sql(`select id from auth.users where email = '${email}'`), email } };
}

export function shutdown() {
  for (const s of servers) { try { s.close(); } catch {} }
  try { pg?.kill('SIGQUIT'); } catch {}
  try { rmSync(base, { recursive: true, force: true }); } catch {}
}

/** Everything the page is showing, markup AND form values. */
export const shown = async (pg2) =>
  (await pg2.content()) + '\n' + (await pg2.$$eval('input, textarea, select', (ns) => ns.map((n) => n.value).join('\n')));

/** Poll a predicate for up to ~6s. Writes are debounced; the database is the judge. */
export async function waitFor(fn, ms = 6000) {
  const stop = Date.now() + ms;
  for (;;) {
    try { if (fn()) return true; } catch { /* keep waiting */ }
    if (Date.now() > stop) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** A tiny result collector, so both suites report the same way. */
export function reporter() {
  const results = [];
  const check = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    console.log(`  ${passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${passed || !detail ? '' : `\n      ${detail}`}`);
  };
  const report = () => {
    const failed = results.filter((r) => !r.passed);
    console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
    if (failed.length) {
      console.log('FAILED:');
      for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? `  — ${f.detail}` : ''}`);
      process.exitCode = 1;
    }
  };
  return { check, report, results };
}
