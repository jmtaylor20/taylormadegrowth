// Proves db/onboard_client.sql before it is ever run against the live database.
//
// That file is the one piece of go-live machinery a person edits by hand and
// then runs against production, so its guardrails matter more than its happy
// path: a typo in a client name has to come back as a sentence, not a foreign
// key error, and a half-created engagement is worse than no engagement.
//
// Spins up a throwaway PostgreSQL 16 cluster, applies the schema, migrations and
// the section library, then runs the file in nine variants: every refusal it
// claims to make, the happy path, a re-run, and the vertical module.
//
//   node scripts/test-onboard-client.mjs
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PGBIN = '/usr/lib/postgresql/16/bin';
const base=mkdtempSync(join(tmpdir(),'onb-')), PGDATA=join(base,'data'), SOCKET=join(base,'sock');
const run=(c,a,o={})=>execFileSync(c,a,{encoding:'utf8',stdio:'pipe',...o});
const asPg=(c,a,o={})=>run('setpriv',['--reuid','1000','--regid','1000','--clear-groups',c,...a],o);
run('mkdir',['-p',PGDATA,SOCKET]); run('chown',['-R','1000:1000',base]); run('chmod',['700',PGDATA]);
asPg(join(PGBIN,'initdb'),['-D',PGDATA,'-U','pgtest','--auth=trust','--encoding=UTF8','--no-sync']);
const pg=spawn('setpriv',['--reuid','1000','--regid','1000','--clear-groups',join(PGBIN,'postgres'),'-D',PGDATA,'-k',SOCKET,'-c','listen_addresses=','-c','fsync=off'],{stdio:'ignore'});
for(let i=0;i<100;i++){try{asPg(join(PGBIN,'pg_isready'),['-h',SOCKET,'-U','pgtest','-q']);break;}catch{execFileSync('sh',['-c','sleep 0.2']);}}
const psql=(a,o={})=>asPg(join(PGBIN,'psql'),['-h',SOCKET,'-U','pgtest','-d','d','-v','ON_ERROR_STOP=1','-X','-q',...a],o);
asPg(join(PGBIN,'createdb'),['-h',SOCKET,'-U','pgtest','d']);
for (const f of ['db/tests/supabase_shim.sql','supabase/schema.sql']) psql(['-f',join(ROOT,f)]);
psql(['-c','grant all on all tables in schema public to anon, authenticated, service_role;']);
for (const m of ['20260818140000_client_contacts_and_staff','20260818140100_onboarding_section_library','20260818140200_onboarding_engagements','20260818140300_onboarding_rls','20260818140400_onboarding_storage','20260818140500_lock_down_legacy_authenticated_policies','20260819130000_automation_accounts','20260819140000_automation_scope_policies','20260819150000_stage3_close_anon']) psql(['-f',join(ROOT,'supabase/migrations',m+'.sql')]);
psql(['-f',join(ROOT,'db/seed_onboarding_library.sql')]);
psql(['-c',`insert into public.clients (business_name, contact_name, email, stage, services) values ('Real Client LLC','Pat Doe','pat@real.example','client', array['website','management'])`]);

const SQL = readFileSync(join(ROOT,'db/onboard_client.sql'),'utf8');
const variant = (edits) => { let s = SQL; for (const [a,b] of edits) { if (!s.includes(a)) throw new Error('no match: '+a); s = s.replace(a,b); } return s; };
const runSql = (text) => { const f = join(base,'t.sql'); writeFileSync(f,text); try { return {ok:true, out: psql(['-f',f])}; } catch(e){ return {ok:false, out:(e.stdout||'')+(e.stderr||'')}; } };
const q=(s)=>psql(['-t','-A','-c',s]).trim();
const results=[];
const check=(name,pass,detail='')=>{results.push({name,pass,detail});console.log(`  ${pass?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${name}${pass||!detail?'':'\n      '+detail.slice(0,300)}`);};

// 1. untouched file must refuse
let r = runSql(SQL);
check('an unedited file refuses instead of creating anything', !r.ok && /still the placeholder/.test(r.out), r.out);
check('and leaves no engagement behind', q('select count(*) from onboarding_engagements')==='0');

const GOOD = [
  ["'CHANGE ME — exact business_name from public.clients'::text as client_name", "'Real Client LLC'::text as client_name"],
  ["('Full Name',        'them@theirbusiness.com', '(334) 555-0000', 'Owner',      'owner',      true),\n  ('Second Person',    'other@theirbusiness.com', null,            'Shop lead',  'operations', false)",
   "('Pat Doe','pat@real.example','(334) 555-0000','Owner','owner',true),\n  ('Sam Roe','sam@real.example',null,'Shop lead','operations',false)"],
];

// 2. wrong client name
r = runSql(variant([[GOOD[0][0], "'Nonexistent Co'::text as client_name"], GOOD[1]]));
check('a misspelled client name is named back, not a foreign key error', !r.ok && /no client named Nonexistent Co/.test(r.out), r.out);

// 3. bad template
r = runSql(variant([...GOOD, ["'growth_partner'::text                                      as template_key", "'gold_package'::text as template_key"]]));
check('an unknown template lists the real ones', !r.ok && /website_build, website_ads or growth_partner/.test(r.out), r.out);

// 4. bad vertical
r = runSql(variant([...GOOD, ["null::text                                                  as vertical", "'roofing'::text as vertical"]]));
check('an unknown vertical is refused', !r.ok && /no module for vertical roofing/.test(r.out), r.out);

// 5. two primaries
r = runSql(variant([GOOD[0], [GOOD[1][0], "('Pat Doe','pat@real.example',null,'Owner','owner',true),\n  ('Sam Roe','sam@real.example',null,'Shop lead','operations',true)"]]));
check('two primary contacts is refused', !r.ok && /exactly one contact must be is_primary/.test(r.out), r.out);
check('none of the refusals left anything behind',
  q('select count(*) from onboarding_engagements')==='0' && q('select count(*) from client_contacts')==='0');

// 6. the happy path
r = runSql(variant(GOOD));
check('a filled-in file creates the engagement', r.ok, r.out);
check('sections come from the template plus nothing else',
  q(`select count(*) from onboarding_engagement_sections`) === q(`select count(*) from onboarding_template_sections where template_key='growth_partner'`),
  q(`select count(*) from onboarding_engagement_sections`) + ' vs template ' + q(`select count(*) from onboarding_template_sections where template_key='growth_partner'`));
check('both contacts exist, lowercased', q(`select string_agg(email,',' order by email) from client_contacts`)==='pat@real.example,sam@real.example',
  q(`select string_agg(email,',' order by email) from client_contacts`));
check('the owner got the money sections',
  q(`select string_agg(es.section_key,',' order by es.section_key) from onboarding_engagement_sections es join client_contacts ct on ct.id=es.assigned_contact_id where ct.role='owner'`)
  === 'engagement_details,financial_baseline,job_economics,marketing_boundaries',
  q(`select string_agg(es.section_key,',' order by es.section_key) from onboarding_engagement_sections es join client_contacts ct on ct.id=es.assigned_contact_id where ct.role='owner'`));
check('operations got the day-to-day ones',
  q(`select string_agg(es.section_key,',' order by es.section_key) from onboarding_engagement_sections es join client_contacts ct on ct.id=es.assigned_contact_id where ct.role='operations'`)
  === 'capacity,digital_access,portfolio,sales_process');
check('the rest are left for anyone', Number(q(`select count(*) from onboarding_engagement_sections where assigned_contact_id is null`)) > 0);
check('the engagement is marked invited with a due date',
  q(`select status || '|' || (due_date is not null)::text || '|' || (invited_at is not null)::text from onboarding_engagements`)==='invited|true|true');
check('it printed the sign-in addresses for the invitation email',
  /pat@real.example/.test(r.out) && /sam@real.example/.test(r.out) && /portal/.test(r.out), r.out.slice(-400));

// 7. re-run guard
r = runSql(variant(GOOD));
check('running it twice refuses rather than making a second engagement',
  !r.ok && /already has a live engagement/.test(r.out), r.out);
check('and there is still exactly one', q('select count(*) from onboarding_engagements')==='1');

// 8. vertical path, on a second client
psql(['-c',`insert into public.clients (business_name, contact_name, email, stage, services) values ('Millwork Client LLC','Lee Poe','lee@mill.example','client', array['website'])`]);
r = runSql(variant([
  [GOOD[0][0], "'Millwork Client LLC'::text as client_name"],
  [GOOD[1][0], "('Lee Poe','lee@mill.example',null,'Owner','owner',true)"],
  ["'growth_partner'::text                                      as template_key", "'website_build'::text as template_key"],
  ["null::text                                                  as vertical", "'millwork'::text as vertical"],
]));
check('a millwork engagement switches the vertical module on', r.ok &&
  q(`select count(*) from onboarding_engagement_sections es join onboarding_engagements e on e.id=es.engagement_id join clients c on c.id=e.client_id where c.business_name='Millwork Client LLC' and es.section_key='signature_spec'`)==='1', r.out);
check('and the smaller template really is smaller',
  q(`select count(*) from onboarding_engagement_sections es join onboarding_engagements e on e.id=es.engagement_id join clients c on c.id=e.client_id where c.business_name='Millwork Client LLC'`)==='5');

const failed = results.filter(r=>!r.pass);
console.log(`\n${results.length-failed.length}/${results.length} passed\n`);
if (failed.length) process.exitCode = 1;
pg.kill('SIGQUIT'); rmSync(base,{recursive:true,force:true});
