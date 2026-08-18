// Proves tenant isolation on the client onboarding schema.
//
// Spins up a throwaway PostgreSQL 16 cluster, stands up the Supabase pieces
// that live outside the public schema (db/tests/supabase_shim.sql), applies the
// full schema + migrations + seeds, and runs db/tests/onboarding_isolation_test.sql.
//
// Then it does the part that makes this a real check rather than a smoke test:
// for each NEGATIVE CONTROL below it rebuilds the database, weakens exactly one
// policy the way a careless edit would, and requires the suite to go red. A
// control that still passes means the assertion covering it is not actually
// testing anything.
//
// Nothing here touches a Supabase project. Postgres runs as an unprivileged
// user in a temp directory that is deleted on exit.
//
//   node scripts/test-onboarding-rls.mjs          # full run
//   node scripts/test-onboarding-rls.mjs --quick  # skip the negative controls

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
const QUICK = process.argv.includes('--quick');

// Postgres refuses to run as root, so everything below runs as this uid.
const PG_UID = 1000;
const PG_GID = 1000;

const base = mkdtempSync(join(tmpdir(), 'tmb-rls-'));
const PGDATA = join(base, 'data');
const SOCKET = join(base, 'sock');
let server = null;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

// Run a command as the unprivileged Postgres user.
function asPg(cmd, args, opts = {}) {
  return run('setpriv', ['--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups', cmd, ...args], opts);
}

function psql(db, args, opts = {}) {
  return asPg(join(PGBIN, 'psql'), [
    '-h', SOCKET, '-U', 'pgtest', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args,
  ], opts);
}

const psqlFile = (db, file) => psql(db, ['-f', join(ROOT, file)]);
const psqlCmd  = (db, sql)  => psql(db, ['-c', sql]);

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
    try {
      asPg(join(PGBIN, 'pg_isready'), ['-h', SOCKET, '-U', 'pgtest', '-q']);
      return;
    } catch {
      execFileSync('sh', ['-c', 'sleep 0.2']);
    }
  }
  throw new Error('postgres did not become ready');
}

// The migrations, in the order the Supabase CLI would apply them.
const MIGRATIONS = [
  '20260818140000_client_contacts_and_staff.sql',
  '20260818140100_onboarding_section_library.sql',
  '20260818140200_onboarding_engagements.sql',
  '20260818140300_onboarding_rls.sql',
  '20260818140400_onboarding_storage.sql',
  '20260818140500_lock_down_legacy_authenticated_policies.sql',
];

let dbSeq = 0;
function buildDatabase() {
  const db = `tmb_${dbSeq++}`;
  asPg(join(PGBIN, 'createdb'), ['-h', SOCKET, '-U', 'pgtest', db]);

  // Supabase's roles, auth.users / auth.uid(), storage tables + foldername().
  psqlFile(db, 'db/tests/supabase_shim.sql');

  // The existing ops app schema, exactly as a fresh project would get it.
  psqlFile(db, 'supabase/schema.sql');

  // Supabase grants these by default on the public schema.
  psqlCmd(db, 'grant all on all tables in schema public to anon, authenticated, service_role;');

  for (const m of MIGRATIONS) psqlFile(db, `supabase/migrations/${m}`);

  psqlFile(db, 'db/seed_onboarding_library.sql');
  psqlFile(db, 'db/seed_onboarding_test_clients.sql');

  return db;
}

function runSuite(db) {
  try {
    const out = psql(db, ['-f', join(ROOT, 'db/tests/onboarding_isolation_test.sql')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { passed: true, output: out };
  } catch (err) {
    return {
      passed: false,
      output: `${err.stdout || ''}${err.stderr || ''}`,
    };
  }
}

// Each of these weakens exactly one thing. If the suite still passes with one
// applied, the assertion meant to catch it is not doing its job.
const NEGATIVE_CONTROLS = [
  {
    name: 'response read policy widened to using (true)',
    sql: `alter policy onboarding_responses_contact_all on public.onboarding_responses using (true);`,
  },
  {
    // Targets access grants rather than responses on purpose: the responses
    // validate trigger blocks a cross-tenant insert before RLS is consulted,
    // so widening WITH CHECK there proves nothing. Access grants have no such
    // trigger on the insert path, so this isolates the policy clause itself.
    name: 'access grant write policy widened to with check (true)',
    sql: `alter policy onboarding_access_grants_contact_all
            on public.onboarding_access_grants with check (true);`,
  },
  {
    name: 'legacy clients_auth_all policy restored (the pre-lockdown state)',
    sql: `create policy clients_auth_all on public.clients for all to authenticated using (true) with check (true);`,
  },
  {
    name: 'storage policy widened to the whole bucket',
    sql: `alter policy onboarding_objects_contact_all on storage.objects using (bucket_id = 'onboarding');`,
  },
  {
    name: 'engagement read policy dropped',
    sql: `drop policy onboarding_engagements_contact_read on public.onboarding_engagements;`,
  },
  {
    name: 'asset policy widened to using (true)',
    sql: `alter policy onboarding_assets_contact_all on public.onboarding_assets using (true);`,
  },
  {
    name: 'onboarding_client_ids() resolves to every client',
    sql: `create or replace function public.onboarding_client_ids() returns setof uuid
            language sql stable security definer set search_path = public, auth, pg_temp
            as $fn$ select id from public.clients $fn$;`,
  },
  {
    name: 'contact-scoped section read widened to using (true)',
    sql: `alter policy onboarding_engagement_sections_contact_read
            on public.onboarding_engagement_sections using (true);`,
  },
];

function cleanup() {
  if (server) {
    try { asPg(join(PGBIN, 'pg_ctl'), ['-D', PGDATA, '-m', 'immediate', 'stop']); } catch { /* already down */ }
    try { server.kill('SIGKILL'); } catch { /* already gone */ }
  }
  if (existsSync(base)) rmSync(base, { recursive: true, force: true });
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

let failures = 0;
try {
  console.log('Starting throwaway PostgreSQL 16…');
  startServer();

  console.log('Building database (shim + schema + migrations + seeds)…');
  const db = buildDatabase();

  console.log('\n=== Isolation suite ===\n');
  const main = runSuite(db);
  console.log(main.output.trim());

  if (!main.passed) {
    console.error('\nFAILED: the isolation suite did not pass against a clean build.');
    failures++;
  } else {
    console.log('\nPASS: isolation suite green on a clean build.');
  }

  if (!QUICK && main.passed) {
    console.log('\n=== Negative controls ===');
    console.log('Each rebuilds the database, weakens one policy, and requires the suite to go red.\n');

    for (const control of NEGATIVE_CONTROLS) {
      const cdb = buildDatabase();
      psqlCmd(cdb, control.sql);
      const result = runSuite(cdb);

      if (result.passed) {
        console.log(`  NOT DETECTED  ${control.name}`);
        console.log('                the suite still passed — nothing is testing this.');
        failures++;
      } else {
        const broke = (result.output.match(/^\s*\S+\s*\|.*\|\s*FAIL/gm) || []).length;
        const how = broke > 0
          ? `${broke} assertion${broke === 1 ? '' : 's'} went red`
          : 'suite aborted before reporting';
        console.log(`  detected      ${control.name}  (${how})`);
      }
    }
  } else if (QUICK) {
    console.log('\nSkipped negative controls (--quick).');
  }
} catch (err) {
  console.error('\nHarness error:', err.stderr || err.message);
  failures++;
}

console.log(failures === 0 ? '\nAll good.' : `\n${failures} problem(s).`);
process.exit(failures === 0 ? 0 : 1);
