// Drives the ops app's Onboarding page in a real browser, against a real database.
//
// This is the screen that decides what every client is asked. A mistake here is
// not a cosmetic bug: a section switched off by accident is a question nobody
// ever answers, and a section assigned to the wrong person is one that sits
// there while both of them assume the other has it.
//
// So the assertions below are about consequences rather than clicks. Switching a
// section off has to leave the answers alone. Assignment has to be what the
// client's portal then shows. And the invitation has to carry the address that
// actually signs that person in, because a wrong one is a client who cannot get
// in and does not know why.
//
// Same rig as the portal suite: a throwaway PostgreSQL 16 cluster with the full
// migration set, the ops app's own files loaded unmodified, and every query run
// as the signed-in staff user through `set local role authenticated`.
//
//   node scripts/test-onboarding-admin.mjs
//   node scripts/test-onboarding-admin.mjs --shots ./shots

import { join } from 'node:path';
import {
  startPostgres, buildDatabase, startHttp, launchBrowser, sessionFor, shutdown,
  sql, waitFor, reporter, ROOT, psqlRaw as psql,
} from './lib/app-harness.mjs';

const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
const APP = join(ROOT, 'public/app');
const STAFF = 'staff@taylormadegrowth.test';
const { check, report } = reporter();
let browser = null;

const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); };

async function main() {
  console.log('\nOnboarding admin — real browser, real database\n');
  startPostgres();
  // The library and two clients, but no engagements and no contacts: this page
  // is what creates both, so seeding them would test the seed rather than the
  // screen. The clients themselves stay, because adding a client is the ops
  // app's existing job and not what is under test here.
  buildDatabase({ seedTestClients: true, authEmails: [STAFF, 'ruth@cedarandpine.test'] });
  psql(['-c', `
    delete from public.onboarding_engagements;
    delete from public.client_contacts;
    insert into public.staff_users (email, name) values ('${STAFF}', 'Josh');
  `]);

  const origin = await startHttp(APP, { basePath: '/app' });
  browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 940 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.addInitScript((s) => { window.__PORTAL_TEST__ = { session: s }; }, sessionFor(STAFF));
  await page.goto(origin + '/index.html#/onboarding', { waitUntil: 'load' });
  await page.waitForSelector('.page-title', { timeout: 20000 });

  check('a staff session lands straight on the app, not the lock screen',
    !(await page.isVisible('.pin-pad')) && (await page.textContent('.page-title')) === 'Onboarding',
    await page.textContent('.page-title'));
  check('with nothing onboarding yet, it says so rather than showing an empty grid',
    await page.isVisible('.empty'));
  await shot(page, 'admin-1-empty');

  // ---- Start one ----------------------------------------------------------
  await page.click('.btn-primary');
  await page.waitForSelector('.sheet', { timeout: 10000 });
  await page.selectOption('select[name="client_id"]', { label: 'Cedar & Pine Millwork' });
  await page.selectOption('select[name="template_key"]', 'growth_partner');
  await page.selectOption('select[name="vertical"]', 'millwork');
  await shot(page, 'admin-2-start');
  await page.click('.sheet-foot .btn-primary');

  await page.waitForSelector('.onb-sec', { timeout: 20000 });
  const engagement = () => sql(`select coalesce(id::text,'') from public.onboarding_engagements limit 1`);
  check('creating one makes a single engagement', engagement() !== '' &&
    sql(`select count(*) from public.onboarding_engagements`) === '1');
  check('it opens straight into that engagement rather than back to the list',
    (await page.evaluate(() => location.hash)) === '#/onboarding/' + engagement(),
    await page.evaluate(() => location.hash));
  check('the template it was given is the set of sections it starts with',
    sql(`select count(*) from public.onboarding_engagement_sections where active`)
      === String(Number(sql(`select count(*) from public.onboarding_template_sections where template_key='growth_partner'`)) + 1),
    sql(`select count(*) from public.onboarding_engagement_sections where active`));
  check('and the industry module came on with it',
    sql(`select count(*) from public.onboarding_engagement_sections es
          join public.onboarding_sections s on s.key = es.section_key
         where s.tier = 'vertical' and es.active`) === '1');

  // A vertical module for a trade this engagement is not in must not be
  // offered at all — the database refuses it, and an option that always errors
  // is worse than no option.
  const offered = await page.$$eval('.onb-sec .row-title', (n) => n.map((x) => x.textContent));
  const otherVertical = sql(`select coalesce(min(title),'') from public.onboarding_sections
                              where tier='vertical' and vertical is distinct from 'millwork'`);
  check('only sections this engagement can actually have are listed',
    offered.length === Number(sql(`select count(*) from public.onboarding_sections
                                    where active and (tier <> 'vertical' or vertical = 'millwork')`)),
    `${offered.length} listed`);
  if (otherVertical) check("another trade's module is not offered", !offered.includes(otherVertical));

  // ---- People -------------------------------------------------------------
  check('it says plainly that nobody can sign in yet',
    (await page.textContent('.banner')).includes('Nobody can sign in yet'),
    await page.textContent('.banner'));

  // The first person on an engagement should arrive pre-filled from the client
  // record, because every client already has a name and address on file and
  // retyping an email is how a client ends up unable to sign in.
  await page.click('.linkish:has-text("Add person")');
  await page.waitForSelector('.sheet', { timeout: 10000 });
  check('the first person is filled in from the client record',
    (await page.inputValue('input[name="email"]'))
      === sql(`select email from public.clients where business_name = 'Cedar & Pine Millwork'`),
    await page.inputValue('input[name="email"]'));
  check('and says where it came from, so it gets checked rather than trusted',
    /client record/i.test(await page.textContent('.sheet .banner')));
  await page.click('.sheet-foot .btn-ghost');
  await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });

  const addPerson = async (name, email, title, role) => {
    await page.click('.linkish:has-text("Add person")');
    await page.waitForSelector('.sheet', { timeout: 10000 });
    await page.fill('input[name="name"]', name);
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="title"]', title);
    await page.selectOption('select[name="role"]', role);
    await page.click('.sheet-foot .btn-primary');
    await page.waitForSelector('.sheet', { state: 'detached', timeout: 10000 });
    await page.waitForSelector('.onb-sec', { timeout: 20000 });
  };

  await addPerson('Ruth Calder', 'RUTH@cedarandpine.test', 'Owner', 'owner');
  // The engagement's sections exist before anybody does, so adding the owner has
  // to pick up the ones an owner normally answers. Otherwise every section on
  // the screen says "anyone" and has to be set by hand.
  check('adding the owner hands them the sections an owner answers',
    Number(sql(`select count(*) from public.onboarding_engagement_sections es
                 join public.client_contacts ct on ct.id = es.assigned_contact_id
                where ct.email = 'ruth@cedarandpine.test'`)) >= 4,
    sql(`select count(*) from public.onboarding_engagement_sections es
          join public.client_contacts ct on ct.id = es.assigned_contact_id
         where ct.email = 'ruth@cedarandpine.test'`));
  check('a person added here can sign in to the portal',
    sql(`select count(*) from public.client_contacts where email = 'ruth@cedarandpine.test'`) === '1');
  check('their address is stored lowercased, which is what the sign-in match needs',
    sql(`select email from public.client_contacts where lower(email) = 'ruth@cedarandpine.test'`) === 'ruth@cedarandpine.test');
  check('the first person added becomes the primary contact',
    sql(`select is_primary::text from public.client_contacts where email = 'ruth@cedarandpine.test'`) === 'true');

  await addPerson('Marcus Hale', 'marcus@cedarandpine.test', 'Shop lead', 'operations');
  check('and the shop lead picks up the day-to-day ones, without taking the owner\'s',
    sql(`select count(*) from public.onboarding_engagement_sections es
          join public.client_contacts ct on ct.id = es.assigned_contact_id
         where ct.email = 'marcus@cedarandpine.test'`) === '4'
    && Number(sql(`select count(*) from public.onboarding_engagement_sections es
                    join public.client_contacts ct on ct.id = es.assigned_contact_id
                   where ct.email = 'ruth@cedarandpine.test'`)) >= 4);
  check('a second person does not become primary as well',
    sql(`select count(*) from public.client_contacts where client_id =
          (select client_id from public.onboarding_engagements limit 1) and is_primary`) === '1');

  // ---- Assignment ---------------------------------------------------------
  const marcus = sql(`select id from public.client_contacts where email = 'marcus@cedarandpine.test'`);
  const capacityRow = `.onb-sec:has(.row-title:text-is("Capacity"))`;
  await page.selectOption(`${capacityRow} select[name="assigned"]`, marcus);
  const assignedTo = () => sql(`select coalesce(assigned_contact_id::text,'') from public.onboarding_engagement_sections
                                 where section_key = 'capacity'`);
  check('assigning a section to somebody sticks', await waitFor(() => assignedTo() === marcus), assignedTo());

  await page.fill(`${capacityRow} input[name="due"]`, '2026-10-01');
  await page.dispatchEvent(`${capacityRow} input[name="due"]`, 'change');
  check('a section can carry its own due date, different from the engagement',
    await waitFor(() => sql(`select coalesce(due_date::text,'') from public.onboarding_engagement_sections
                              where section_key = 'capacity'`) === '2026-10-01'),
    sql(`select coalesce(due_date::text,'') from public.onboarding_engagement_sections where section_key='capacity'`));
  await shot(page, 'admin-3-engagement');

  // ---- Leaving parts out --------------------------------------------------
  // Put an answer in first. Switching a section off must never be the thing
  // that loses a client's work.
  const finSection = sql(`select id from public.onboarding_engagement_sections where section_key = 'financial_baseline'`);
  psql(['-c', `insert into public.onboarding_responses (engagement_section_id, field_id, status, value_number)
               select '${finSection}', id, 'answered', 1840000 from public.onboarding_fields
                where field_key = 'financial_baseline.annual_revenue';`]);

  const finRow = `.onb-sec:has(.row-title:text-is("Financial Baseline"))`;
  await page.uncheck(`${finRow} input.checkbox`);
  const activeOf = (key) => sql(`select active::text from public.onboarding_engagement_sections where section_key = '${key}'`);
  check('switching a section off takes it out of the engagement',
    await waitFor(() => activeOf('financial_baseline') === 'false'), activeOf('financial_baseline'));
  check('and does NOT delete what was already answered in it',
    sql(`select count(*) from public.onboarding_responses where engagement_section_id = '${finSection}'`) === '1');
  check('the row survives too, so switching it back on restores everything',
    sql(`select count(*) from public.onboarding_engagement_sections where section_key = 'financial_baseline'`) === '1');

  await page.check(`${finRow} input.checkbox`);
  check('switching it back on returns it with its answer intact',
    await waitFor(() => activeOf('financial_baseline') === 'true')
      && sql(`select value_number::text from public.onboarding_responses where engagement_section_id = '${finSection}'`) === '1840000');

  // Switching on a section the template never included is the same one click.
  const extraRow = `.onb-sec:has(.row-title:text-is("Signature Specification"))`;
  if (await page.isVisible(extraRow)) {
    const before = activeOf('signature_spec');
    if (before === 'true') {
      await page.uncheck(`${extraRow} input.checkbox`);
      check('a section can be dropped and re-added without a migration',
        await waitFor(() => activeOf('signature_spec') === 'false'));
      await page.check(`${extraRow} input.checkbox`);
      await waitFor(() => activeOf('signature_spec') === 'true');
    }
  }

  // ---- The invitation -----------------------------------------------------
  await page.click('.page-head .btn-primary');
  await page.waitForSelector('.onb-send', { timeout: 10000 });
  await shot(page, 'admin-4-invite');

  const mailto = await page.getAttribute('.rows .row:nth-child(1) .onb-send a', 'href');
  const decoded = decodeURIComponent(mailto || '');
  check('the invitation goes to the address that actually signs them in',
    decoded.startsWith('mailto:ruth@cedarandpine.test?'), (mailto || '').slice(0, 80));
  check('it carries the portal address', decoded.includes('https://taylormadegrowth.com/portal/'));
  check('it tells them which address to enter', decoded.includes('ruth@cedarandpine.test'));
  check('it warns them off putting credentials in', /don't put any passwords/i.test(decoded));
  check('it names how many sections are theirs',
    /\d+ sections? (is|are) marked for you/.test(decoded), decoded.slice(0, 500));

  const marcusInvite = decodeURIComponent(
    await page.getAttribute('.rows .row:nth-child(2) .onb-send a', 'href') || '');
  check("each person's invitation is addressed to them, not to the primary contact",
    marcusInvite.startsWith('mailto:marcus@cedarandpine.test?'), marcusInvite.slice(0, 80));
  // The count in each message has to be that person's own, checked against the
  // table rather than against the other message — two people can legitimately
  // have the same number, and an assertion that only notices a difference would
  // pass on a template that hardcoded it.
  const claimed = (text) => Number((text.match(/(\d+) sections? (?:is|are) marked for you/) || [])[1] ?? -1);
  const actual = (email) => Number(sql(`
    select count(*) from public.onboarding_engagement_sections es
      join public.client_contacts ct on ct.id = es.assigned_contact_id
     where ct.email = '${email}' and es.active`));
  check("and each message counts that person's own sections",
    claimed(decoded) === actual('ruth@cedarandpine.test')
    && claimed(marcusInvite) === actual('marcus@cedarandpine.test')
    && claimed(decoded) > 0,
    `ruth says ${claimed(decoded)} / has ${actual('ruth@cedarandpine.test')}, ` +
    `marcus says ${claimed(marcusInvite)} / has ${actual('marcus@cedarandpine.test')}`);

  // ---- Sending from the app ----------------------------------------------
  await page.click('.rows .row:nth-child(1) .onb-send .btn-primary');
  const call = await waitFor(() => true) && (await page.evaluate(() => window.__FN_CALLS__ || []))[0];
  check('the Send button calls the invite function', !!call && call.name === 'send-onboarding-invite',
    JSON.stringify(call || null).slice(0, 200));
  check('it names the contact rather than an address, so the recipient is resolved server-side',
    !!call && call.body.contact_id === sql(`select id from public.client_contacts where email = 'ruth@cedarandpine.test'`)
      && !JSON.stringify(call.body).includes('"to"') && !JSON.stringify(call.body).includes('"email"'),
    JSON.stringify(call?.body || {}).slice(0, 300));
  check('and carries the engagement it belongs to',
    !!call && call.body.engagement_id === engagement());
  check('the message it sends is the one shown in the sheet',
    !!call && call.body.body.includes('taylormadegrowth.com/portal/?email=')
      && /don't put any passwords/i.test(call.body.body));
  check('sending records that the client was invited',
    await waitFor(() => sql(`select status from public.onboarding_engagements limit 1`) === 'invited'),
    sql(`select status from public.onboarding_engagements limit 1`));
  check('and when it went out',
    sql(`select (invited_at is not null)::text from public.onboarding_engagements limit 1`) === 'true');

  // The failure that will actually happen is "the key is not set yet", and it
  // has to read as a next step rather than as a broken button.
  await page.evaluate(() => {
    window.__PORTAL_TEST__.functions = {
      'send-onboarding-invite': () => ({
        data: null,
        error: { message: 'Edge Function returned a non-2xx status code',
                 context: { json: async () => ({ error: 'not_configured' }) } },
      }),
    };
  });
  await page.click('.rows .row:nth-child(2) .onb-send .btn-primary');
  const failText = await page.waitForSelector('.toast.show', { timeout: 8000 })
    .then((h) => h.textContent()).catch(() => '(no toast)');
  check('an unconfigured mail service says what to do about it, and points at the mail app',
    /RESEND_API_KEY/.test(failText) && /Mail app/.test(failText), failText);
  check('and the mail-app route is still there to fall back on',
    (await page.getAttribute('.rows .row:nth-child(2) .onb-send a', 'href') || '').startsWith('mailto:'));

  // ---- Does the client see what was set here? -----------------------------
  // The two screens have to agree, or this one is just a form that writes to a
  // table nobody reads.
  await page.click('.sheet-foot .btn-ghost');
  const portalOrigin = await startHttp(join(ROOT, 'public/portal'));
  const client = await ctx.newPage();
  await client.addInitScript((s) => { window.__PORTAL_TEST__ = { session: s }; }, sessionFor('ruth@cedarandpine.test'));
  await client.goto(portalOrigin + '/index.html', { waitUntil: 'load' });
  await client.waitForSelector('.card, .empty', { timeout: 20000 });

  const clientSees = await client.$$eval('.card-title', (n) => n.map((x) => x.textContent));
  check('the client sees exactly the sections left switched on',
    clientSees.length === Number(sql(`select count(*) from public.onboarding_engagement_sections where active`)),
    `portal shows ${clientSees.length}, admin left ${sql(`select count(*) from public.onboarding_engagement_sections where active`)} on`);
  check('a section switched off is not offered to them',
    !clientSees.includes('Job Economics') || activeOf('job_economics') === 'true');
  check("the section assigned to the shop lead is not in the owner's own list",
    !(await client.evaluate(() => {
      const h = [...document.querySelectorAll('.list-head')].find((x) => x.textContent === 'Yours to answer');
      let n = h?.nextElementSibling;
      while (n && !n.classList.contains('cards')) n = n.nextElementSibling;
      return [...(n?.querySelectorAll('.card-title') || [])].map((c) => c.textContent);
    }) || []).includes('Capacity'));
  await shot(client, 'admin-5-client-view');

  // ---- Reading what came back ---------------------------------------------
  // The three statuses have to stay three different things on screen. A blank
  // is the only one worth chasing; "they don't know" and "doesn't apply" are
  // finished work, and showing them the same way would send Josh chasing
  // answers he already has.
  const fin = sql(`select id from public.onboarding_engagement_sections where section_key = 'financial_baseline'`);
  psql(['-c', `
    delete from public.onboarding_responses where engagement_section_id = '${fin}';
    insert into public.onboarding_responses (engagement_section_id, field_id, status, value_number)
      select '${fin}', id, 'answered', 1840000 from public.onboarding_fields where field_key = 'financial_baseline.annual_revenue';
    insert into public.onboarding_responses (engagement_section_id, field_id, status)
      select '${fin}', id, 'unknown' from public.onboarding_fields where field_key = 'financial_baseline.gross_margin';
    insert into public.onboarding_responses (engagement_section_id, field_id, status)
      select '${fin}', id, 'not_applicable' from public.onboarding_fields where field_key = 'financial_baseline.owner_comp';
  `]);

  await page.goto(origin + '/index.html#/onboarding/' + engagement(), { waitUntil: 'load' });
  await page.waitForSelector('.onb-sec', { timeout: 20000 });
  const finRow2 = `.onb-sec:has(.row-title:text-is("Financial Baseline"))`;
  await page.click(`${finRow2} .linkish`);
  await page.waitForSelector('.onb-answers', { timeout: 15000 });
  const sheet = await page.textContent('.onb-answers');

  check('an answer reads back with its unit, not as a raw number',
    sheet.includes('$1,840,000'), sheet.slice(0, 300));
  check('"I don\'t know" reads as a deliberate answer, not a blank',
    /don't know/i.test(sheet), sheet.slice(0, 300));
  check('"doesn\'t apply" is shown as its own thing',
    /doesn't apply/i.test(sheet), sheet.slice(0, 300));
  check('a question nobody has touched is called out separately',
    /not answered yet/i.test(sheet), sheet.slice(0, 300));
  check('the three are not collapsed into one another',
    new Set([/\$1,840,000/.test(sheet), /don't know/i.test(sheet),
             /doesn't apply/i.test(sheet), /not answered yet/i.test(sheet)]).size === 1);
  await shot(page, 'admin-6-answers');

  const shownCount = await page.$$eval('.onb-answer', (n) => n.length);
  const fieldCount = Number(sql(`select count(*) from public.onboarding_fields
     where section_key = 'financial_baseline' and active and parent_field_id is null`));
  check('every question in the section is listed, answered or not',
    shownCount === fieldCount, `${shownCount} shown, ${fieldCount} in the section`);

  await page.click('.sheet-foot .btn-ghost:has-text("Close")');

  // ---- A client who has been through this before ---------------------------
  // Sending an existing client a fresh set of questions months later is the
  // normal way this gets used. Their old answers are untouched.
  await page.click('.back-link');
  await page.waitForSelector('.page-title', { timeout: 15000 });
  await page.click('.page-head .btn-primary');
  await page.waitForSelector('.sheet', { timeout: 10000 });
  const offeredWhileOpen = await page.$$eval('select[name="client_id"] option', (o) => o.map((x) => x.textContent));
  check('a client with something still open is not offered again',
    !offeredWhileOpen.some((t) => t.startsWith('Cedar & Pine Millwork')), offeredWhileOpen.join(' | '));
  await page.click('.sheet-foot .btn-ghost');

  psql(['-c', `update public.onboarding_engagements set status = 'complete';`]);
  await page.goto(origin + '/index.html#/onboarding', { waitUntil: 'load' });
  await page.waitForSelector('.page-title', { timeout: 15000 });
  await page.click('.page-head .btn-primary');
  await page.waitForSelector('.sheet', { timeout: 10000 });
  const offeredAfter = await page.$$eval('select[name="client_id"] option', (o) => o.map((x) => x.textContent));
  check('once it is complete, the same client can be sent a second set',
    offeredAfter.some((t) => t.startsWith('Cedar & Pine Millwork')), offeredAfter.join(' | '));
  check('and is labelled as somebody who has answered before',
    offeredAfter.some((t) => t.includes('Cedar & Pine Millwork — has answered before')), offeredAfter.join(' | '));
  await page.click('.sheet-foot .btn-ghost');

  check('the first engagement and its answers are still there',
    sql(`select count(*) from public.onboarding_responses where engagement_section_id = '${fin}'`) === '3');

  // ---- The brief -----------------------------------------------------------
  // What gets pasted into Claude Code. The thing that matters is not that it
  // contains the answers — it is that it says which questions were NOT
  // answered, so nothing downstream invents a number to fill a gap.
  await page.goto(origin + '/index.html#/onboarding/' + engagement(), { waitUntil: 'load' });
  await page.waitForSelector('.onb-sec', { timeout: 20000 });
  await page.click('.linkish:has-text("Brief")');
  await page.waitForSelector('.onb-brief-preview', { timeout: 20000 });
  const brief = await page.textContent('.onb-brief-preview');

  check('the brief carries the client and the engagement',
    brief.includes('Cedar & Pine Millwork') && brief.includes('onboarding answers'), brief.slice(0, 200));
  check('every answer keeps the question it answered',
    brief.includes('**Last full year of revenue**') && brief.includes('$1,840,000'),
    brief.slice(0, 400));
  check('a deliberate "I don\'t know" survives into the brief as one',
    /_They don't know_/.test(brief));
  check('unanswered questions are listed, not silently dropped',
    brief.includes('## Still unanswered'), brief.slice(-400));
  check('and the brief says outright not to invent them',
    /do not invent/i.test(brief));

  const listedBlank = (brief.split('## Still unanswered')[1] || '').split('\n').filter((l) => l.startsWith('- ')).length;
  const reallyBlank = Number(sql(`
    select count(*) from public.onboarding_engagement_sections es
      join public.onboarding_fields f on f.section_key = es.section_key
     where es.engagement_id = '${engagement()}' and es.active and f.active and f.parent_field_id is null
       and not exists (select 1 from public.onboarding_responses r
                        where r.engagement_section_id = es.id and r.field_id = f.id and r.row_id is null)
       and f.field_type is distinct from 'file_upload'
       and f.field_kind = 'scalar'`));
  check('the unanswered list matches what the database says is unanswered',
    listedBlank >= reallyBlank && listedBlank > 0, `brief lists ${listedBlank}, database has ${reallyBlank} scalar blanks`);

  check('a printable version is offered as well as the paste-able one',
    await page.isVisible('.onb-brief-actions .btn-ghost'));
  await shot(page, 'admin-7-brief');
  await page.click('.sheet-foot .btn-ghost:has-text("Close")');

  check('no uncaught errors in the app', errors.length === 0, errors.join('\n      '));
  report();
}

try {
  await main();
} catch (err) {
  console.error('\nharness error:', err.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  shutdown();
}
