// Proves the legacy-lockdown migration can be applied to a live database
// without being a one-way door.
//
// Reproduces production's audited RLS posture, snapshots it, applies
// 20260818140500 forward, asserts the posture actually changed in the way the
// migration claims, then applies the rollback and asserts the policy set comes
// back byte-identical to the snapshot.
//
//   node scripts/test-legacy-lockdown-rollback.mjs

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
const PG_UID = 1000, PG_GID = 1000;

const base = mkdtempSync(join(tmpdir(), 'tmb-rollback-'));
const PGDATA = join(base, 'data');
const SOCKET = join(base, 'sock');
let server = null;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
const asPg = (cmd, args, opts = {}) =>
  run('setpriv', ['--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups', cmd, ...args], opts);
const psql = (args) => asPg(join(PGBIN, 'psql'), ['-h', SOCKET, '-U', 'pgtest', '-d', 'rb', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args]);
const file = (f) => psql(['-f', join(ROOT, f)]);

// The eighteen tables that existed before this pass. Every assertion is scoped
// to them: migration …140000 adds its own tables and policies, and sweeping
// those into the counts would compare the baseline against a moving target.
const LEGACY = `(
  'clients','tasks','invoices','content_items','assets','reviews','proposals',
  'activities','payments','reports','trips','meetings','time_entries','expenses',
  'app_settings','ad_metrics','contractors','money_entries'
)`;

// The full policy set on those tables, normalised and ordered, as one
// comparable string.
const POLICY_SNAPSHOT = `
  select coalesce(string_agg(
    tablename || '|' || policyname || '|' || array_to_string(roles, '+') || '|' || cmd
      || '|' || coalesce(qual, '-') || '|' || coalesce(with_check, '-'),
    E'\\n' order by tablename, policyname), '')
  from pg_policies where schemaname = 'public' and tablename in ${LEGACY}
`;

const snapshot = () => psql(['-t', '-A', '-c', POLICY_SNAPSHOT]).trim();

function startServer() {
  run('mkdir', ['-p', PGDATA, SOCKET]);
  run('chown', ['-R', `${PG_UID}:${PG_GID}`, base]);
  run('chmod', ['700', PGDATA]);
  asPg(join(PGBIN, 'initdb'), ['-D', PGDATA, '-U', 'pgtest', '--auth=trust', '--encoding=UTF8', '--no-sync']);
  server = spawn('setpriv', [
    '--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups',
    join(PGBIN, 'postgres'), '-D', PGDATA, '-k', SOCKET, '-c', 'listen_addresses=', '-c', 'fsync=off',
  ], { stdio: 'ignore' });
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

try {
  console.log('Starting throwaway PostgreSQL 16…\n');
  startServer();
  asPg(join(PGBIN, 'createdb'), ['-h', SOCKET, '-U', 'pgtest', 'rb']);

  file('db/tests/supabase_shim.sql');
  file('supabase/schema.sql');
  psql(['-c', 'grant all on all tables in schema public to anon, authenticated, service_role;']);
  file('supabase/migrations/20260818140000_client_contacts_and_staff.sql');

  // Reproduce production's audited posture.
  file('db/tests/prod_policy_baseline.sql');
  const before = snapshot();
  const beforeCount = before.split('\n').filter(Boolean).length;
  console.log(`Production baseline reproduced: ${beforeCount} policies.\n`);
  check('baseline matches the audited production count (38)', beforeCount === 38, `${beforeCount} policies`);

  // Policies a signed-in user matches with no restriction at all: the fifteen
  // `_auth_all` pairs plus the eight hand-written `TO public` ones, which cover
  // anon and authenticated alike.
  const countAuthUnrestricted = () => Number(psql(['-t', '-A', '-c', `
    select count(*) from pg_policies
     where schemaname='public' and tablename in ${LEGACY}
       and ('authenticated' = any(roles) or 'public' = any(roles))
       and coalesce(qual,'true') = 'true' and coalesce(with_check,'true') = 'true'
  `]).trim());

  check('baseline leaves authenticated unrestricted via 23 policies across all 18 tables',
    countAuthUnrestricted() === 23, `${countAuthUnrestricted()}`);

  // --- Forward -------------------------------------------------------------
  console.log('\nApplying 20260818140500 (forward)…');
  file('supabase/migrations/20260818140500_lock_down_legacy_authenticated_policies.sql');
  const after = snapshot();

  check('forward migration changed the posture', after !== before);
  check('no policy grants authenticated unrestricted access any more', countAuthUnrestricted() === 0, `${countAuthUnrestricted()} remain`);
  check('anon keeps unconditional access on all 18 tables (the ops app is untouched)',
    Number(psql(['-t', '-A', '-c', `
      select count(*) from pg_policies
       where schemaname='public' and tablename in ${LEGACY}
         and roles = '{anon}' and qual = 'true' and with_check = 'true'
    `]).trim()) === 18);
  check('every authenticated policy now routes through is_staff()',
    Number(psql(['-t', '-A', '-c', `
      select count(*) from pg_policies
       where schemaname='public' and tablename in ${LEGACY}
         and 'authenticated' = any(roles) and qual not like '%is_staff%'
    `]).trim()) === 0);

  // --- Rollback ------------------------------------------------------------
  console.log('\nApplying the rollback…');
  file('supabase/rollback/20260818140500_lock_down_legacy_authenticated_policies.rollback.sql');
  const restored = snapshot();

  check('rollback restores the policy set byte-identically', restored === before,
    restored === before ? '' : 'policy set differs from the baseline');

  if (restored !== before) {
    const b = new Set(before.split('\n')), r = new Set(restored.split('\n'));
    for (const line of before.split('\n')) if (!r.has(line)) console.log(`      missing after rollback: ${line}`);
    for (const line of restored.split('\n')) if (!b.has(line)) console.log(`      unexpected after rollback: ${line}`);
  }

  // Forward again, to prove the pair is repeatable rather than single-use.
  console.log('\nRe-applying forward (idempotency)…');
  file('supabase/migrations/20260818140500_lock_down_legacy_authenticated_policies.sql');
  check('forward is repeatable and lands in the same state', snapshot() === after);
} catch (err) {
  check('harness completed', false, (err.stderr || err.message || '').split('\n')[0]);
}

const failed = checks.filter((c) => !c.passed).length;
console.log(failed === 0
  ? `\nAll ${checks.length} checks passed. The lockdown is reversible.`
  : `\n${failed} of ${checks.length} checks FAILED.`);
process.exit(failed === 0 ? 0 : 1);
