// Checks the database-error wording the app shows people.
//
// The credential tripwire is a CHECK constraint, so without this a client who
// types a password into a notes field gets
// `new row for relation "..." violates check constraint "..._secret_check"`,
// which tells them nothing and looks like the app broke. It is a tripwire, not
// a guarantee — it will miss plenty — so the message has to do the real work of
// explaining why we don't want the thing they just typed.
//
//   npm run test:db-errors

import { humanizeDbError } from '../public/app/assets/js/db-errors.js';
const cases = [
  ['credential in a notes field',
   { code: '23514', message: 'new row for relation "onboarding_access_grants" violates check constraint "onboarding_access_grants_notes_secret_check"' },
   (e) => /looks like a password or API key in notes/.test(e.message) && e.kind === 'credential_rejected'],
  ['credential in holder_note keeps the field name readable',
   { code: '23514', message: 'new row for relation "onboarding_access_grants" violates check constraint "onboarding_access_grants_holder_note_secret_check"' },
   (e) => /in holder note/.test(e.message)],
  ['credential in a response value',
   { code: '23514', message: 'new row for relation "onboarding_responses" violates check constraint "onboarding_responses_value_text_secret_check"' },
   (e) => /in value text/.test(e.message)],
  ['RLS refusal reads as a permission problem',
   { code: '42501', message: 'new row violates row-level security policy for table "onboarding_responses"' },
   (e) => e.message === "You don't have access to change that." && e.kind === 'not_permitted'],
  ['an unrelated check constraint is left alone',
   { code: '23514', message: 'new row for relation "clients" violates check constraint "clients_stage_check"' },
   (e) => e.message.includes('clients_stage_check')],
  ['an error we do not understand is passed through untouched',
   { code: '23505', message: 'duplicate key value violates unique constraint "x"' },
   (e) => e.message.includes('duplicate key')],
  ['null is survivable', null, (e) => e === null],
];
let bad = 0;
for (const [name, input, ok] of cases) {
  const out = humanizeDbError(input);
  const pass = ok(out);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
  if (!pass) { bad++; console.log(`        got: ${out && out.message}`); }
}
console.log(bad ? `\n${bad} failed.` : '\nError messages are sound.');
process.exit(bad ? 1 : 0);
