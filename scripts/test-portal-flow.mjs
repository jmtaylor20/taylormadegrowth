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

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  startPostgres, buildDatabase, startHttp, launchBrowser, sessionFor, shutdown,
  sql, shown, waitFor, reporter, SCRATCH_DIR, ROOT, psqlRaw as psql,
} from './lib/app-harness.mjs';

// --shots <dir> saves what each stage actually looks like. Useful for eyeballing
// copy and spacing without standing the whole thing up by hand.
const SHOTS = (() => { const i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();
const PORTAL = join(ROOT, 'public/portal');
const { check, report } = reporter();
let browser = null;

// ---- Assertions -------------------------------------------------------------



async function main() {
  console.log('\nPortal flow — real browser, real database\n');
  startPostgres();
  buildDatabase({ authEmails: ['ruth@cedarandpine.test', 'marcus@cedarandpine.test', 'dana@harborlane.test'] });
  const origin = await startHttp(PORTAL);
  browser = await launchBrowser();

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

  // The invitation links here with the address already in it, so somebody on a
  // phone taps a link and then a button rather than typing an address into a
  // page they have never seen.
  await page.goto(origin + '/index.html?email=ruth%40cedarandpine.test', { waitUntil: 'load' });
  await page.waitForSelector('.gate-input', { timeout: 10000 });
  check('an invitation link arrives with the address filled in',
    (await page.inputValue('.gate-input')) === 'ruth@cedarandpine.test',
    await page.inputValue('.gate-input'));
  check('and it is still only a prefill — nothing is signed in by the link alone',
    await page.isVisible('.gate-btn') && !(await page.isVisible('.card')));

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

  // ---- Files --------------------------------------------------------------
  const logoField = JSON.parse(sql(`
    select json_build_object('id', id, 'key', field_key)
      from public.onboarding_fields
     where section_key = 'business_brand' and field_type = 'file_upload' and active
       and parent_field_id is null
     order by position limit 1`));
  const engagementId = sql(`select engagement_id from public.onboarding_engagement_sections where id = '${brand.id}'`);

  // A name nothing else uses. The seed already puts assets on this very field,
  // and matching on the field alone would let a seeded row stand in for the
  // upload — which is a pass that proves nothing.
  const UPLOAD_NAME = 'portal-flow-upload.svg';
  const upload = join(SCRATCH_DIR(), UPLOAD_NAME);
  writeFileSync(upload, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>');

  const uploaded = (col = 'storage_path') => sql(`
    select coalesce(${col}::text, '') from public.onboarding_assets
     where engagement_section_id = '${brand.id}' and field_id = '${logoField.id}'
       and file_name = '${UPLOAD_NAME}'`);

  await page.setInputFiles(`.q[data-field="${logoField.key}"] .files-input`, upload);
  check('a logo file uploads and is recorded against the question',
    await waitFor(() => uploaded() !== ''), uploaded() || '(no asset row)');
  check('the file is stored under the engagement, which is the tenant boundary in the bucket',
    uploaded().startsWith(engagementId + '/business_brand/'), uploaded());
  check('the object itself exists in the bucket, not just the row describing it',
    sql(`select count(*) from storage.objects where bucket_id = 'onboarding' and name = '${uploaded()}'`) === '1');
  check('the upload is attributed to the contact who made it',
    sql(`select ct.name from public.onboarding_assets a join public.client_contacts ct on ct.id = a.uploaded_by_contact_id
          where a.engagement_section_id = '${brand.id}' and a.file_name = '${UPLOAD_NAME}'`) === 'Ruth Calder',
    sql(`select coalesce(uploaded_by_contact_id::text,'null') from public.onboarding_assets where file_name = '${UPLOAD_NAME}'`));
  check('the file appears in the question it was uploaded to',
    (await page.textContent(`.q[data-field="${logoField.key}"] .files`)).includes(UPLOAD_NAME));

  // The path prefix is the only thing standing between two clients' files. Try
  // to write outside it — the way a doctored request would — and require Postgres
  // to refuse, not the page.
  const danaEngagement = sql(`
    select e.id from public.onboarding_engagements e join public.clients c on c.id = e.client_id
     where c.business_name = 'Harbor Lane Roofing'`);
  const smuggled = await page.evaluate(async (path) => {
    const r = await window.supabase.createClient().storage.from('onboarding')
      .upload(path, { size: 4, type: 'image/png', name: 'x.png' }, {});
    return { ok: !r.error, message: r.error?.message || '' };
  }, `${danaEngagement}/business_brand/smuggled.png`);
  check("a file aimed at another client's prefix is refused by the database",
    !smuggled.ok, smuggled.message || 'the upload succeeded');
  check('and nothing of it is left in the bucket',
    sql(`select count(*) from storage.objects where name like '${danaEngagement}/%smuggled%'`) === '0');

  const storedPath = uploaded();
  await page.click(`.q[data-field="${logoField.key}"] .file:has-text("${UPLOAD_NAME}") .file-remove`);
  check('removing a file takes away the row describing it',
    await waitFor(() => uploaded() === ''), uploaded());
  check('and the object itself, not just the row',
    sql(`select count(*) from storage.objects where bucket_id = 'onboarding' and name = '${storedPath}'`) === '0');

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

  // ---- "Which of these are mine?" -----------------------------------------
  // Marcus is the shop lead on the same engagement Ruth owns. On a fourteen
  // section list, the first thing he needs is his four — so the overview groups
  // by owner, and his own sections have to be findable without reading a word.
  const marcus = sessionFor('marcus@cedarandpine.test');
  const page3 = await ctx.newPage();
  await page3.addInitScript((s) => { window.__PORTAL_TEST__ = { session: s }; }, marcus);
  await page3.goto(origin + '/index.html', { waitUntil: 'load' });
  await page3.waitForSelector('.card', { timeout: 15000 });

  const heads = await page3.$$eval('.list-head', (n) => n.map((x) => x.textContent));
  check('the overview groups sections by who owns them', heads.includes('Yours to answer'), heads.join(' | '));

  const wantMine = Number(sql(`
    select count(*) from public.onboarding_engagement_sections es
      join public.client_contacts ct on ct.id = es.assigned_contact_id
      join public.onboarding_engagements e on e.id = es.engagement_id
      join public.clients c on c.id = e.client_id
     where ct.email = 'marcus@cedarandpine.test' and es.active
       and es.status not in ('submitted','accepted','waived')
       and c.business_name = 'Cedar & Pine Millwork'`));
  const gotMine = await page3.evaluate(() => {
    const heads = [...document.querySelectorAll('.list-head')];
    const h = heads.find((x) => x.textContent === 'Yours to answer');
    let n = h?.nextElementSibling;
    while (n && !n.classList.contains('cards')) n = n.nextElementSibling;
    return n ? n.querySelectorAll('.card').length : 0;
  });
  check('his group holds exactly the sections assigned to him', gotMine === wantMine,
    `grouped ${gotMine}, assigned ${wantMine}`);

  const mineMarked = await page3.evaluate(() => {
    const heads = [...document.querySelectorAll('.list-head')];
    const h = heads.find((x) => x.textContent === 'Yours to answer');
    let n = h?.nextElementSibling;
    while (n && !n.classList.contains('cards')) n = n.nextElementSibling;
    return [...(n?.querySelectorAll('.card') || [])].every((c) => c.classList.contains('is-mine'));
  });
  check('and every card in it is marked as his', mineMarked);

  check("a colleague's section still says whose it is, rather than nothing",
    (await page3.content()).includes('For Ruth Calder'));

  check('the summary leads with his own count, not the engagement total',
    /assigned to you/.test(await page3.textContent('.page-sub')),
    await page3.textContent('.page-sub'));

  await shot(page3, '6-shop-lead');

  // Opening one of his own says so too, so the two screens cannot disagree.
  await page3.click('.card.is-mine');
  await page3.waitForSelector('.q, .empty', { timeout: 15000 });
  check('the section page agrees about who owns it',
    (await page3.textContent('.page-head')).includes('Yours to answer'),
    await page3.textContent('.page-head'));

  check('no uncaught errors in the page', consoleErrors.length === 0, consoleErrors.join('\n      '));

  report();
}

async function shot(pg, name) {
  if (SHOTS) await pg.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
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
