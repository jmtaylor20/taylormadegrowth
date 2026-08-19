// Drives the client onboarding portal in a real browser, against a real database.
//
// The portal's job is to be the only thing a client ever touches, so "the SQL is
// right" is not enough — the page has to render the right questions, save the
// right column, and refuse to show another client's engagement. This test proves
// all three by loading the actual portal files in headless Chromium and pointing
// them at a throwaway Postgres carrying the full migration set and seeds.
//
// Nothing is mocked below the auth line. Every read and write goes through
// `set local role authenticated` with the signed-in contact's jwt claims, so the
// rows the page shows are the rows RLS allows. GoTrue is the one piece faked —
// there is no local email service to send a code to — and which contact is
// signed in is injected by the harness.
//
//   node scripts/test-portal-flow.mjs
//   node scripts/test-portal-flow.mjs --headed   (keeps the browser visible logs)

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// --shots <dir> saves what each stage actually looks like. Useful for eyeballing
// copy and spacing without standing the whole thing up by hand.
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
const PGBIN = '/usr/lib/postgresql/16/bin';
const PG_UID = 1000, PG_GID = 1000;
const PORTAL = join(ROOT, 'public/portal');

const require = createRequire(import.meta.url);
// playwright lives in the global prefix here, not in a package.json.
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const { chromium } = require(join(globalRoot, 'playwright'));

const base = mkdtempSync(join(tmpdir(), 'tmb-portal-'));
const PGDATA = join(base, 'data');
const SOCKET = join(base, 'sock');
let pg = null, http = null, browser = null;
let DB = null;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
const asPg = (cmd, args, opts = {}) =>
  run('setpriv', ['--reuid', String(PG_UID), '--regid', String(PG_GID), '--clear-groups', cmd, ...args], opts);

function psql(args, opts = {}) {
  return asPg(join(PGBIN, 'psql'), ['-h', SOCKET, '-U', 'pgtest', '-d', DB || 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', ...args], opts);
}

function startPostgres() {
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

function buildDatabase() {
  asPg(join(PGBIN, 'createdb'), ['-h', SOCKET, '-U', 'pgtest', 'tmb_portal']);
  DB = 'tmb_portal';
  psql(['-f', join(ROOT, 'db/tests/supabase_shim.sql')]);
  psql(['-f', join(ROOT, 'supabase/schema.sql')]);
  psql(['-c', 'grant all on all tables in schema public to anon, authenticated, service_role;']);
  for (const m of MIGRATIONS) psql(['-f', join(ROOT, 'supabase/migrations', m)]);
  psql(['-f', join(ROOT, 'db/seed_onboarding_library.sql')]);
  psql(['-f', join(ROOT, 'db/seed_onboarding_test_clients.sql')]);

  // Auth users for the two contacts the browser will sign in as. Confirmed,
  // because onboarding_client_ids() only matches a confirmed address.
  psql(['-c', `
    insert into auth.users (email, email_confirmed_at)
    values ('ruth@cedarandpine.test', now()), ('dana@harborlane.test', now())
    on conflict (email) do update set email_confirmed_at = now();
  `]);

  VOID_FNS = new Set(psql(['-t', '-A', '-c', `
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prorettype = 'void'::regtype`]).trim().split('\n').filter(Boolean));
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
    const keys = Object.keys(q.payload).map(ident);
    const vals = keys.map((k) => lit(q.payload[k]));
    return emitCte(`w as (insert into public.${table} (${keys.join(', ')}) values (${vals.join(', ')}) returning *)`,
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

// json_agg has nothing to aggregate over a void return, so those are called for
// their effect and answered with null — which is what the client library does too.
let VOID_FNS = new Set();

function handleRpc(session, fn, args) {
  const f = ident(fn);
  const argSql = Object.entries(args || {}).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ');
  if (VOID_FNS.has(f)) {
    const r = asContact(session, `select '<<<' || 'null' || '>>>' from (select public.${f}(${argSql})) x`);
    return { data: null, error: r.error };
  }
  return asContact(session,
    `select '<<<' || coalesce((select json_agg(t.v)::text from (select public.${f}(${argSql}) as v) t), 'null') || '>>>'`);
}

// ---- Static server ----------------------------------------------------------

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function startHttp() {
  return new Promise((done) => {
    http = createServer(async (req, res) => {
      if (req.method === 'POST' && req.url === '/__pg') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        let out;
        try {
          out = body.op === 'rpc'
            ? handleRpc(body.session, body.fn, body.args)
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

      const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
      const file = join(PORTAL, rel === '/' ? 'index.html' : rel);
      if (!file.startsWith(PORTAL) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    http.listen(0, '127.0.0.1', () => done(`http://127.0.0.1:${http.address().port}`));
  });
}

// ---- Assertions -------------------------------------------------------------

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed, detail });
  console.log(`  ${passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${passed || !detail ? '' : `\n      ${detail}`}`);
};

/** Read the database directly, as owner, to verify what the page actually wrote. */
const sql = (q) => psql(['-t', '-A', '-c', q]).trim();

/**
 * Everything the page is showing, markup AND form values.
 *
 * page.content() alone is not enough: an input's value is set as a property, so
 * a leaked answer sitting in a text box would not appear in the serialised HTML
 * and a "nothing leaked" assertion would pass without looking at it.
 */
const shown = async (pg) =>
  (await pg.content()) + '\n' + (await pg.$$eval('input, textarea', (ns) => ns.map((n) => n.value).join('\n')));

function authUser(email) {
  return sql(`select id from auth.users where email = '${email}'`);
}
const sessionFor = (email) => ({ user: { id: authUser(email), email } });

async function main() {
  console.log('\nPortal flow — real browser, real database\n');
  startPostgres();
  buildDatabase();
  const origin = await startHttp();
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const goto = async (session, hash = '') => {
    await page.addInitScript((s) => { window.__PORTAL_TEST__ = { session: s }; }, session);
    await page.goto(origin + '/index.html' + (hash ? '#' + hash : ''), { waitUntil: 'load' });
  };

  // ---- Signed out --------------------------------------------------------
  await goto(null);
  await page.waitForSelector('.gate-wrap', { timeout: 10000 });
  await shot(page, '1-signin');
  const gateNote = await page.textContent('.gate-note');
  check('signed out lands on the sign-in screen', await page.isVisible('.gate-input'));
  check('sign-in copy names the real code length (8)', /8 digits/.test(gateNote), gateNote);

  // ---- Ruth: Cedar & Pine ------------------------------------------------
  const ruth = sessionFor('ruth@cedarandpine.test');
  await goto(ruth);
  await page.waitForSelector('.card', { timeout: 15000 });

  await shot(page, '2-sections');
  check('header shows the signed-in contact\'s own client',
    (await page.textContent('.top-name')) === 'Cedar & Pine Millwork',
    await page.textContent('.top-name'));
  check('header names the person, not the account',
    /Ruth Calder/.test(await page.textContent('.top-sub')),
    await page.textContent('.top-sub'));

  const cardTitles = await page.$$eval('.card-title', (n) => n.map((x) => x.textContent));
  const wantSections = Number(sql(`
    select count(*) from public.onboarding_engagement_sections es
    join public.onboarding_engagements e on e.id = es.engagement_id
    join public.clients c on c.id = e.client_id
    where c.business_name = 'Cedar & Pine Millwork' and es.active`));
  check('every activated section is listed', cardTitles.length === wantSections,
    `rendered ${cardTitles.length}, database has ${wantSections}`);

  const harborTitle = sql(`select title from public.onboarding_engagements e join public.clients c on c.id = e.client_id where c.business_name = 'Harbor Lane Roofing'`);
  check("the other client's engagement is nowhere on the page",
    !(await page.content()).includes(harborTitle), harborTitle);

  // ---- Open a section ----------------------------------------------------
  const sectionRow = JSON.parse(sql(`
    select json_build_object('id', es.id, 'key', es.section_key, 'title', s.title)
      from public.onboarding_engagement_sections es
      join public.onboarding_sections s on s.key = es.section_key
      join public.onboarding_engagements e on e.id = es.engagement_id
      join public.clients c on c.id = e.client_id
     where c.business_name = 'Cedar & Pine Millwork' and es.section_key = 'financial_baseline'`));

  await page.goto(origin + '/index.html#/s/' + sectionRow.id, { waitUntil: 'load' });
  await page.waitForSelector('.q', { timeout: 15000 });
  check('opening a section renders its questions',
    (await page.textContent('.page-title')) === sectionRow.title,
    await page.textContent('.page-title'));

  await shot(page, '3-section');
  const wantFields = Number(sql(`
    select count(*) from public.onboarding_fields
     where section_key = 'financial_baseline' and active and parent_field_id is null`));
  const gotFields = await page.$$eval('.q', (n) => n.length);
  check('every top-level field of the section is on screen', gotFields === wantFields,
    `rendered ${gotFields}, library has ${wantFields}`);

  check('opening a section marks it in progress',
    await waitFor(() => sql(`select status from public.onboarding_engagement_sections where id = '${sectionRow.id}'`) === 'in_progress'),
    sql(`select status from public.onboarding_engagement_sections where id = '${sectionRow.id}'`));

  // ---- Changing an existing answer ---------------------------------------
  // The seed already answered this one, so this exercises the update path: the
  // portal has to recognise the stored response and rewrite it rather than
  // insert a second row and trip the uniqueness index.
  const revenue = JSON.parse(sql(`
    select json_build_object('id', id, 'key', field_key)
      from public.onboarding_fields where field_key = 'financial_baseline.annual_revenue'`));
  const answerRow = (fieldId) => sql(`
    select coalesce(status,'') || '|' || coalesce(value_text,'') || coalesce(value_number::text,'')
        || coalesce(value_boolean::text,'') || coalesce(value_date::text,'') || coalesce(value_json::text,'')
      from public.onboarding_responses
     where engagement_section_id = '${sectionRow.id}' and field_id = '${fieldId}' and row_id is null`);

  check('a stored answer is shown back to the client',
    (await page.inputValue(`.q[data-field="${revenue.key}"] .q-input`)) ===
      sql(`select value_number::text from public.onboarding_responses where engagement_section_id = '${sectionRow.id}' and field_id = '${revenue.id}' and row_id is null`),
    await page.inputValue(`.q[data-field="${revenue.key}"] .q-input`));

  await page.fill(`.q[data-field="${revenue.key}"] .q-input`, '425000');
  await page.click('.page-title');
  check('editing it autosaves into the typed column, over the old value',
    await waitFor(() => answerRow(revenue.id) === 'answered|425000'), answerRow(revenue.id));
  check('and leaves exactly one answer for that question, not two',
    sql(`select count(*) from public.onboarding_responses where engagement_section_id = '${sectionRow.id}' and field_id = '${revenue.id}' and row_id is null`) === '1');
  check('the change is attributed to the contact who made it',
    sql(`select ct.name from public.onboarding_responses r join public.client_contacts ct on ct.id = r.updated_by_contact_id
          where r.engagement_section_id = '${sectionRow.id}' and r.field_id = '${revenue.id}' and r.row_id is null`) === 'Ruth Calder');

  // ---- Submit ------------------------------------------------------------
  await page.click('.btn-primary');
  check('submitting the section records it',
    await waitFor(() => sql(`select status from public.onboarding_engagement_sections where id = '${sectionRow.id}'`) === 'submitted'),
    sql(`select status from public.onboarding_engagement_sections where id = '${sectionRow.id}'`));

  // ---- A section nobody has touched yet -----------------------------------
  // Business & Brand is unanswered in the seed, so this is the insert path, the
  // "I don't know" path, and the credential tripwire — all on blank questions.
  const brand = JSON.parse(sql(`
    select json_build_object('id', es.id, 'title', s.title)
      from public.onboarding_engagement_sections es
      join public.onboarding_sections s on s.key = es.section_key
      join public.onboarding_engagements e on e.id = es.engagement_id
      join public.clients c on c.id = e.client_id
     where c.business_name = 'Cedar & Pine Millwork' and es.section_key = 'business_brand'`));

  await page.goto(origin + '/index.html#/s/' + brand.id, { waitUntil: 'load' });
  await page.waitForSelector('.q', { timeout: 15000 });

  const blank = (type) => JSON.parse(sql(`
    select json_build_object('id', id, 'key', field_key)
      from public.onboarding_fields
     where section_key = 'business_brand' and active and parent_field_id is null and field_type = '${type}'
       and id not in (select field_id from public.onboarding_responses where engagement_section_id = '${brand.id}')
     order by position limit 1`));
  const brandRow = (fieldId) => sql(`
    select coalesce(status,'') || '|' || coalesce(value_text,'') || coalesce(value_number::text,'')
        || coalesce(value_boolean::text,'') || coalesce(value_date::text,'') || coalesce(value_json::text,'')
      from public.onboarding_responses
     where engagement_section_id = '${brand.id}' and field_id = '${fieldId}' and row_id is null`);

  const shortText = blank('short_text');
  await page.fill(`.q[data-field="${shortText.key}"] .q-input`, 'Cedar & Pine, since 1998');
  await page.click('.page-title');
  check('a first answer inserts, with the text in value_text',
    await waitFor(() => brandRow(shortText.id) === 'answered|Cedar & Pine, since 1998'), brandRow(shortText.id));

  // "I don't know" is the constraint the whole schema was built around: it is an
  // answer, stored with every value column null, not a blank.
  const unknownField = blank('long_text');
  await page.click(`.q[data-field="${unknownField.key}"] .q-flag:has-text("I don't know")`);
  check('"I don\'t know" saves as a deliberate answer carrying no value',
    await waitFor(() => brandRow(unknownField.id) === 'unknown|'), brandRow(unknownField.id));

  // Tapping it again hands the question back, and must not leave a blank row —
  // otherwise "answered with nothing" becomes a fourth state nobody asked for.
  await page.click(`.q[data-field="${unknownField.key}"] .q-flag:has-text("I don't know")`);
  check('un-marking it removes the answer rather than storing an empty one',
    await waitFor(() => brandRow(unknownField.id) === ''), brandRow(unknownField.id));

  await shot(page, '4-answers');

  // ---- The credential tripwire, seen from the client's side ---------------
  const secretField = blank('long_text');
  // Navigating by hash keeps the document, so an earlier toast can still be on
  // screen. Take it away first, or this asserts on the wrong message.
  await page.evaluate(() => document.getElementById('toast')?.remove());
  await page.fill(`.q[data-field="${secretField.key}"] .q-textarea`, 'the login is admin / password: Hunter2Hunter2!');
  await page.click('.page-title');
  const toastText = await page.waitForSelector('.toast.show', { timeout: 8000 })
    .then((h) => h.textContent()).catch(() => '(no toast)');
  check('a password typed into an answer is refused in words a client can act on',
    /credential/i.test(toastText) && !/constraint|23514|violates/i.test(toastText), toastText);
  await shot(page, '5-credential-refused');
  check('the refused credential never reaches the table',
    sql(`select count(*) from public.onboarding_responses where engagement_section_id = '${brand.id}' and field_id = '${secretField.id}'`) === '0',
    brandRow(secretField.id));

  // ---- Isolation, through the interface ----------------------------------
  // Dana is Harbor Lane. Handing her the URL of Cedar & Pine's section is the
  // realistic attack: a forwarded link. She must land on her own list instead.
  const dana = sessionFor('dana@harborlane.test');
  const page2 = await ctx.newPage();
  await page2.addInitScript((s) => { window.__PORTAL_TEST__ = { session: s }; }, dana);
  await page2.goto(origin + '/index.html#/s/' + sectionRow.id, { waitUntil: 'load' });
  await page2.waitForSelector('.card, .empty', { timeout: 15000 });

  check("another client's section URL does not open",
    (await page2.evaluate(() => location.hash)) === '#/',
    await page2.evaluate(() => location.hash));
  check('the forwarded link lands on the visitor\'s own engagement',
    (await page2.textContent('.top-name')) === 'Harbor Lane Roofing',
    await page2.textContent('.top-name'));

  const leaked = await shown(page2);
  check("nothing of the other client's is anywhere on the page, markup or form values",
    !leaked.includes('Cedar & Pine') && !leaked.includes('425000') && !leaked.includes('Ruth Calder'));

  // Dana's own Financial Baseline is a different row of the same section, and
  // she must see hers — proving the block above is scoping, not a blanket deny.
  const danaSection = sql(`
    select es.id from public.onboarding_engagement_sections es
      join public.onboarding_engagements e on e.id = es.engagement_id
      join public.clients c on c.id = e.client_id
     where c.business_name = 'Harbor Lane Roofing' and es.section_key = 'financial_baseline'`);
  await page2.goto(origin + '/index.html#/s/' + danaSection, { waitUntil: 'load' });
  await page2.waitForSelector('.q', { timeout: 15000 });
  check('she can open her own copy of the same section',
    (await page2.$$eval('.q', (n) => n.length)) > 0);
  check("and it carries none of the other client's answers",
    !(await shown(page2)).includes('425000'));

  // ---- Negative control ---------------------------------------------------
  // The isolation checks above are only worth having if they would notice a
  // policy going missing. So: widen the one policy that scopes a contact to
  // their own engagements, and require the forwarded link to start working.
  // A control that stays green means the assertion is testing nothing.
  const WIDEN = `
    alter policy onboarding_engagement_sections_contact_read on public.onboarding_engagement_sections using (true);
    alter policy onboarding_responses_contact_all on public.onboarding_responses
      using (true) with check (engagement_id in (select public.onboarding_engagement_ids()));`;
  const RESTORE = `
    alter policy onboarding_engagement_sections_contact_read on public.onboarding_engagement_sections
      using (engagement_id in (select public.onboarding_engagement_ids()));
    alter policy onboarding_responses_contact_all on public.onboarding_responses
      using (engagement_id in (select public.onboarding_engagement_ids()))
      with check (engagement_id in (select public.onboarding_engagement_ids()));`;

  psql(['-c', WIDEN]);
  await page2.goto(origin + '/index.html', { waitUntil: 'load' });
  await page2.evaluate((h) => { location.hash = h; }, '/s/' + sectionRow.id);
  await page2.waitForSelector('.q, .empty', { timeout: 15000 }).catch(() => {});
  const breached = (await page2.evaluate(() => location.hash)) === '#/s/' + sectionRow.id
    && (await shown(page2)).includes('425000');
  check('negative control: with the scope removed, the forwarded link does open the other client\'s answers',
    breached, `hash ${await page2.evaluate(() => location.hash)} — the isolation assertions above would not have caught a missing policy`);

  psql(['-c', RESTORE]);
  await page2.goto(origin + '/index.html', { waitUntil: 'load' });
  await page2.evaluate((h) => { location.hash = h; }, '/s/' + sectionRow.id);
  await page2.waitForSelector('.card, .empty', { timeout: 15000 });
  check('and restoring the policy shuts it again',
    (await page2.evaluate(() => location.hash)) === '#/' && !(await shown(page2)).includes('425000'));

  check('no uncaught errors in the page', consoleErrors.length === 0, consoleErrors.join('\n      '));

  // ---- Report ------------------------------------------------------------
  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? `  — ${f.detail}` : ''}`);
    process.exitCode = 1;
  }
}

async function shot(pg, name) {
  if (SHOTS) await pg.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** Poll a predicate for up to ~5s. Autosave is debounced; the database is the judge. */
async function waitFor(fn, ms = 6000) {
  const stop = Date.now() + ms;
  for (;;) {
    try { if (fn()) return true; } catch { /* keep waiting */ }
    if (Date.now() > stop) return false;
    await new Promise((r) => setTimeout(r, 150));
  }
}

try {
  await main();
} catch (err) {
  console.error('\nharness error:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  http?.close();
  if (pg) { pg.kill('SIGQUIT'); }
  try { rmSync(base, { recursive: true, force: true }); } catch {}
}
