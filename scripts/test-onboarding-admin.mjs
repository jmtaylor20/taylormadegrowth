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

  const mailto = await page.getAttribute('.onb-send a.btn-primary', 'href');
  const decoded = decodeURIComponent(mailto || '');
  check('the invitation goes to the address that actually signs them in',
    decoded.startsWith('mailto:ruth@cedarandpine.test?'), (mailto || '').slice(0, 80));
  check('it carries the portal address', decoded.includes('https://taylormadegrowth.com/portal/'));
  check('it tells them which address to enter', decoded.includes('ruth@cedarandpine.test'));
  check('it warns them off putting credentials in', /don't put any passwords/i.test(decoded));
  check('it names how many sections are theirs',
    /\d+ sections? (is|are) marked for you/.test(decoded), decoded.slice(0, 500));

  const marcusInvite = decodeURIComponent(
    await page.getAttribute('.rows .row:nth-child(2) a.btn-primary', 'href') || '');
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

  await page.click('.onb-send a.btn-primary');
  check('sending records that the client was invited',
    await waitFor(() => sql(`select status from public.onboarding_engagements limit 1`) === 'invited'),
    sql(`select status from public.onboarding_engagements limit 1`));
  check('and when it went out',
    sql(`select (invited_at is not null)::text from public.onboarding_engagements limit 1`) === 'true');

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
