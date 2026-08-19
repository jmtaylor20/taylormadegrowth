// Proves stage 3 closes anon completely, and that the rollback reopens it.
//
// Two questions, both answered against a throwaway database rather than by
// reading the SQL:
//
//   1. After the forward migration, does an `anon` caller get zero rows from
//      every application table, and are its writes refused?
//   2. Does the rollback restore the prior posture, so the migration is not a
//      one-way door on a live system?
//
// The permanent regression guard against anon access lives in
// db/tests/anon_lockout_test.sql, which runs as part of the main suite. This
// script is specifically about the migration and its reverse.
//
//   node scripts/test-stage3-anon-rollback.mjs

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
const PG_UID = 1000, PG_GID = 1000;

const base = mkdtempSync(join(tmpdir(), 'tmb-stage3-'));
const PGDATA = join(base, 'data');
const SOCKET = join(base, 'sock');
let server = null;

const run = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: 'pipe', ...o });
const asPg = (c, a, o = {}) =>
  run('setpriv', ['--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups', c, ...a], o);
const psql = (args) => asPg(join(PGBIN, 'psql'),
  ['-h', SOCKET, '-U', 'pgtest', '-d', 's3', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args]);
const file = (f) => psql(['-f', join(ROOT, f)]);
const scalar = (sql) => psql(['-t', '-A', '-c', sql]).trim();

const MIGRATIONS = [
  '20260818140000_client_contacts_and_staff.sql',
  '20260818140100_onboarding_section_library.sql',
  '20260818140200_onboarding_engagements.sql',
  '20260818140300_onboarding_rls.sql',
  '20260818140400_onboarding_storage.sql',
  '20260818140500_lock_down_legacy_authenticated_policies.sql',
  '20260819130000_automation_accounts.sql',
  '20260819140000_automation_scope_policies.sql',
];

function startServer() {
  run('mkdir', ['-p', PGDATA, SOCKET]);
  run('chown', ['-R', `${PG_UID}:${PG_GID}`, base]);
  run('chmod', ['700', PGDATA]);
  asPg(join(PGBIN, 'initdb'), ['-D', PGDATA, '-U', 'pgtest', '--auth=trust', '--encoding=UTF8', '--no-sync']);
  server = spawn('setpriv', ['--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups',
    join(PGBIN, 'postgres'), '-D', PGDATA, '-k', SOCKET, '-c', 'listen_addresses=', '-c', 'fsync=off'],
    { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { asPg(join(PGBIN, 'pg_isready'), ['-h', SOCKET, '-U', 'pgtest', '-q']); return; }
    catch { execFileSync('sh', ['-c', 'sleep 0.2']); }
  }
  throw new Error('postgres did not become ready');
}

function cleanup() {
  if (server) {
    try { asPg(join(PGBIN, 'pg_ctl'), ['-D', PGDATA, '-m', 'immediate', 'stop']); } catch { /* down */ }
    try { server.kill('SIGKILL'); } catch { /* gone */ }
  }
  if (existsSync(base)) rmSync(base, { recursive: true, force: true });
}
process.on('exit', cleanup);

const checks = [];
const check = (name, passed, detail = '') => {
  checks.push({ name, passed, detail });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// Counts, as anon, across every table anon could previously reach.
const anonPolicies = () => Number(scalar(`
  select count(*) from pg_policies
   where schemaname in ('public','storage')
     and ('anon' = any(roles) or 'public' = any(roles))`));
const anonGrants = () => Number(scalar(`
  select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'`));
const anonDefaults = () => Number(scalar(`
  select count(*) from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and array_to_string(d.defaclacl, ',') like '%anon=%'`));
const rlsOff = () => Number(scalar(`
  select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`));

try {
  console.log('Starting throwaway PostgreSQL 16…\n');
  startServer();
  asPg(join(PGBIN, 'createdb'), ['-h', SOCKET, '-U', 'pgtest', 's3']);

  file('db/tests/supabase_shim.sql');
  file('supabase/schema.sql');
  psql(['-c', 'grant all on all tables in schema public to anon, authenticated, service_role;']);
  psql(['-c', 'alter default privileges in schema public grant all on tables to anon;']);
  for (const m of MIGRATIONS) file(`supabase/migrations/${m}`);
  file('db/seed_onboarding_library.sql');
  file('db/seed_onboarding_test_clients.sql');

  console.log('=== Before stage 3 ===');
  const before = { p: anonPolicies(), g: anonGrants(), d: anonDefaults() };
  console.log(`  anon policies: ${before.p}   anon table grants: ${before.g}   anon default privileges: ${before.d}\n`);
  check('anon starts with policies (there is something to close)', before.p > 0, `${before.p}`);
  check('anon starts with table grants', before.g > 0, `${before.g}`);

  console.log('\n=== Applying stage 3 ===');
  file('supabase/migrations/20260819150000_stage3_close_anon.sql');

  check('zero anon policies remain, in public and storage', anonPolicies() === 0, `${anonPolicies()}`);
  check('zero anon table grants remain', anonGrants() === 0, `${anonGrants()}`);
  check('no default privilege grants anon anything on future tables', anonDefaults() === 0, `${anonDefaults()}`);
  check('RLS is enabled on every table in public', rlsOff() === 0, `${rlsOff()} without it`);
  check('no storage bucket is public',
    Number(scalar(`select count(*) from storage.buckets where public`)) === 0);

  // A new table created after the migration must not be reachable by anon —
  // this is the check that catches default privileges creeping back.
  psql(['-c', 'create table public.canary_after_stage3 (id int);']);
  check('a table created AFTER stage 3 grants anon nothing',
    Number(scalar(`select count(*) from information_schema.role_table_grants
                    where table_schema='public' and grantee='anon'
                      and table_name='canary_after_stage3'`)) === 0);
  psql(['-c', 'drop table public.canary_after_stage3;']);

  // And the thing that actually matters: as anon, nothing is reachable at all.
  //
  // Note this is stronger than "returns zero rows". With the grant revoked as
  // well as the policies, anon is refused at the privilege layer and never gets
  // as far as RLS — the table may as well not exist. Asserting only emptiness
  // would also pass against a table that is merely policy-filtered, so assert
  // the refusal itself.
  for (const tbl of ['clients', 'invoices', 'payments', 'onboarding_responses', 'client_contacts']) {
    let denied = false, detail = '';
    try {
      psql(['-c', `set role anon; select count(*) from public.${tbl};`]);
    } catch (e) {
      detail = ((e.stderr || '').match(/ERROR:.*/) || [''])[0].trim();
      denied = /permission denied/i.test(detail);
    }
    check(`as anon, public.${tbl} is refused outright`, denied, detail.slice(0, 60));
  }

  console.log('\n=== Applying the rollback ===');
  file('supabase/rollback/20260819150000_stage3_close_anon.rollback.sql');
  check('rollback restores anon policies', anonPolicies() > 0, `${anonPolicies()}`);
  check('rollback restores anon table grants', anonGrants() > 0, `${anonGrants()}`);
  check('rollback makes data readable as anon again',
    Number(scalar(`set role anon; select count(*) from public.clients`)) > 0);

  console.log('\n=== Re-applying stage 3 (repeatable) ===');
  file('supabase/migrations/20260819150000_stage3_close_anon.sql');
  check('forward is repeatable: anon closed again', anonPolicies() === 0 && anonGrants() === 0);
} catch (err) {
  check('harness completed', false, (err.stderr || err.message || '').split('\n').slice(0, 3).join(' | '));
}

const failed = checks.filter((c) => !c.passed).length;
console.log(failed === 0
  ? `\nAll ${checks.length} checks passed. anon is closed, and the migration reverses cleanly.`
  : `\n${failed} of ${checks.length} checks FAILED.`);
process.exit(failed === 0 ? 0 : 1);
