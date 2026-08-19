// Staff authentication — Supabase Auth, email one-time code.
//
// Stage 2 of closing anon access. This is ADDITIVE: the PIN still works, so
// there is a way in while this is being verified. Stage 3 deletes the PIN and
// makes `requireSession()` the only door.
//
// Why a 6-digit code rather than a magic link, given both are signInWithOtp:
// this app is installed to the home screen as a PWA. A link tapped in Mail
// opens in Safari, so the session Supabase creates lands in Safari's storage —
// not the PWA's. The user would sign in successfully and still be locked out
// of the app they were trying to reach. Typing a code keeps the whole exchange
// inside whichever context the person is actually using. It also sidesteps the
// redirect-URL allowlist entirely.
//
// A link arriving anyway is still handled: supabase-js parses a session out of
// the URL on load, so signing in from a desktop browser works either way.

import { sb } from './db.js';
import { el, clear } from './ui.js';

// Length of the emailed code. This is a per-project Supabase setting
// (Authentication → Providers → Email → Email OTP Length), NOT a fixed 6 — this
// project issues 8. Verified against a real sign-in email rather than assumed;
// a field capped at the wrong length silently makes sign-in impossible.
//
// Only the autosubmit convenience depends on the exact value. Manual submit
// accepts anything from MIN_CODE_LENGTH up, so if the project setting changes
// the worst case is having to press the button, not being locked out.
const CODE_LENGTH = 8;
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 10;

// ---- Session ---------------------------------------------------------------

export async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) return null;
  return data.session || null;
}

export async function currentUser() {
  const session = await getSession();
  return session?.user || null;
}

// Is the signed-in user on the staff allowlist? Asked of the database, not
// inferred in the browser — `is_staff()` is the same function every RLS policy
// calls, so the app and the database can never disagree about who is staff.
export async function isStaff() {
  const { data, error } = await sb.rpc('is_staff');
  if (error) return false;
  return data === true;
}

// Attach this auth user to its staff row (and any client contact row carrying
// the same confirmed email). Idempotent; safe on every sign-in.
async function bindIdentity() {
  const { error } = await sb.rpc('bind_auth_identity');
  if (error) console.warn('bind_auth_identity failed:', error.message);
}

export async function signOut() {
  await sb.auth.signOut();
}

// ---- Sign-in ---------------------------------------------------------------

export async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({
    email: String(email).trim().toLowerCase(),
    options: {
      // Staff have a row in `staff_users` but no auth.users row until the
      // first sign-in, so the user has to be creatable here. That is not a
      // hole: an auth session with no matching staff or contact row matches no
      // policy and reads nothing. Membership is the allowlist, not signup.
      shouldCreateUser: true,
      emailRedirectTo: location.origin + '/app/',
    },
  });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const { error } = await sb.auth.verifyOtp({
    email: String(email).trim().toLowerCase(),
    token: String(token).trim(),
    type: 'email',
  });
  if (error) throw error;
  await bindIdentity();
}

// ---- Guard -----------------------------------------------------------------

/**
 * Resolve the caller's staff status once, at boot.
 *
 * Returns 'staff' when there is a session belonging to an active staff member,
 * 'unauthorized' when there is a session that is not staff (a client contact,
 * or somebody who signed themselves up), and 'anonymous' when there is no
 * session at all.
 *
 * A non-staff session is signed out rather than left sitting there: it grants
 * nothing, and leaving it in place makes the lock screen behave confusingly on
 * the next launch.
 */
export async function resolveAccess() {
  const session = await getSession();
  if (!session) return { state: 'anonymous' };

  await bindIdentity();
  if (await isStaff()) {
    return { state: 'staff', email: session.user?.email || null };
  }

  await signOut();
  return { state: 'unauthorized', email: session.user?.email || null };
}

// ---- Sign-in screen --------------------------------------------------------

/**
 * Render the email sign-in panel into `mount`, calling `onSuccess` once a
 * staff session exists. Two steps: request a code, then enter it.
 */
export function renderSignIn(mount, onSuccess, onCancel) {
  let email = '';

  const title = el('h1.lock-title', { text: 'Sign in' });
  const note = el('p.auth-note', { text: 'We’ll email you a 6-digit code.' });
  const field = el('input.auth-input', {
    type: 'email', inputmode: 'email', autocomplete: 'email',
    placeholder: 'you@taylormadegrowth.com', autocapitalize: 'off',
  });
  const action = el('button.auth-btn', { type: 'button', text: 'Email me a code' });
  const back = el('button.auth-link', { type: 'button', text: 'Use PIN instead', onclick: onCancel });
  const form = el('form.auth-form', {}, [field, action]);

  const fail = (msg) => { note.textContent = msg; note.classList.add('is-error'); };
  const busy = (on, label) => { action.disabled = on; action.textContent = label; };

  async function requestCode(ev) {
    ev?.preventDefault();
    email = field.value.trim();
    if (!email) return fail('Enter your email address.');
    note.classList.remove('is-error');
    busy(true, 'Sending…');
    try {
      await sendCode(email);
      showCodeStep();
    } catch (err) {
      busy(false, 'Email me a code');
      fail(err.message || 'Could not send the code.');
    }
  }

  function showCodeStep() {
    title.textContent = 'Check your email';
    note.textContent = `We sent a code to ${email}.`;
    note.classList.remove('is-error');

    const code = el('input.auth-input.auth-code', {
      type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
      placeholder: '0'.repeat(CODE_LENGTH), maxlength: String(MAX_CODE_LENGTH),
      autocapitalize: 'off',
    });
    const go = el('button.auth-btn', { type: 'button', text: 'Sign in' });

    clear(form);
    form.append(code, go);
    code.focus();

    const submit = async (ev) => {
      ev?.preventDefault();
      const token = code.value.trim();
      if (token.length < MIN_CODE_LENGTH) return;
      go.disabled = true; go.textContent = 'Checking…';
      try {
        await verifyCode(email, token);
        const access = await resolveAccess();
        if (access.state === 'staff') return onSuccess();
        fail('That account is not on the staff list.');
        go.disabled = false; go.textContent = 'Sign in';
      } catch (err) {
        fail(err.message || 'That code did not work.');
        go.disabled = false; go.textContent = 'Sign in';
      }
    };

    go.onclick = submit;
    form.onsubmit = submit;
    code.oninput = () => {
      // Digits only: pasting from a mail client drags in stray whitespace, and
      // on iOS the one-time-code autofill can bring a trailing space.
      const digits = code.value.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
      if (digits !== code.value) code.value = digits;
      // Autosubmit at the expected length — matches the PIN pad's feel, and
      // fires on iOS autofill.
      if (digits.length === CODE_LENGTH) submit();
    };
  }

  action.onclick = requestCode;
  form.onsubmit = requestCode;

  const wrap = el('div.lock-wrap', {}, [
    el('img.lock-logo', { src: './assets/img/logo-mark.png', alt: 'TaylorMade Brands' }),
    el('div.lock-tag', { text: 'TaylorMade Brands — Operating System' }),
    title, note, form, back,
  ]);
  mount.append(wrap);
  field.focus();
}
