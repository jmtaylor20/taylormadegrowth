// Client contact sign-in.
//
// Same primitive as the staff app — Supabase Auth, emailed one-time code — but
// it resolves a different identity. Staff are matched by `is_staff()`; a client
// contact is matched by `onboarding_client_ids()`, which returns the clients
// whose contact list carries their confirmed email.
//
// A code rather than a magic link, for the same reason as the ops app: this is
// installable to a phone's home screen, and a link tapped in Mail opens in the
// browser instead, leaving the session in the wrong place. A code goes wherever
// the person is already standing.

import { sb } from './db.js';
import { CODE_LENGTH, MIN_CODE_LENGTH, MAX_CODE_LENGTH } from './config.js';
import { el, clear } from './ui.js';
import { humanize } from './errors.js';

export async function getSession() {
  const { data, error } = await sb.auth.getSession();
  return error ? null : (data.session || null);
}

export async function signOut() { await sb.auth.signOut(); }

async function bindIdentity() {
  const { error } = await sb.rpc('bind_auth_identity');
  if (error) console.warn('bind_auth_identity:', error.message);
}

export function onSessionLost(cb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) cb(event);
  });
}

export async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({
    email: String(email).trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo: location.origin + '/portal/' },
  });
  // A rate-limit refusal here is the common one, and it reads as "your email is
  // wrong" unless we say otherwise.
  if (error) throw humanize(error);
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

/**
 * Resolve who is here.
 *
 * 'contact'      a session whose email is on a client's contact list
 * 'unknown'      a valid session that matches no contact — signed out again,
 *                because leaving it in place makes the next launch confusing
 *                and it grants nothing anyway
 * 'anonymous'    no session
 *
 * Membership is asked of the database, via the same function every policy calls,
 * so the page and the database cannot disagree about who someone is.
 */
export async function resolveAccess() {
  const session = await getSession();
  if (!session) return { state: 'anonymous' };

  await bindIdentity();
  const { data, error } = await sb.rpc('onboarding_client_ids');
  if (error) return { state: 'unknown', email: session.user?.email || null };

  const ids = Array.isArray(data) ? data : (data ? [data] : []);
  if (!ids.length) {
    await signOut();
    return { state: 'unknown', email: session.user?.email || null };
  }
  return { state: 'contact', email: session.user?.email || null, clientIds: ids };
}

// ---- Sign-in screen --------------------------------------------------------

export function renderSignIn(mount, onSuccess) {
  // The invitation links here with ?email=theirs, so somebody on a phone taps a
  // link and taps a button rather than typing an address into a strange page.
  // It is their own address and it grants nothing: the code still has to arrive
  // in their inbox before anything happens.
  let email = new URLSearchParams(location.search).get('email') || '';

  const title = el('h1.gate-title', { text: 'Welcome' });
  const note = el('p.gate-note', {
    text: `Enter the email address we sent your invitation to. We'll email you a sign-in code — ${CODE_LENGTH} digits.`,
  });
  const field = el('input.gate-input', {
    type: 'email', inputmode: 'email', autocomplete: 'email',
    placeholder: 'you@yourbusiness.com', autocapitalize: 'off',
    value: email,
  });
  const action = el('button.gate-btn', { type: 'button', text: 'Email me a code' });
  const form = el('form.gate-form', {}, [field, action]);
  const help = el('p.gate-help', {
    text: 'No password to remember. The code expires in an hour.',
  });

  const fail = (msg) => { note.textContent = msg; note.classList.add('is-error'); };
  const ok = (msg) => { note.textContent = msg; note.classList.remove('is-error'); };

  async function requestCode(ev) {
    ev?.preventDefault();
    email = field.value.trim();
    if (!email) return fail('Please enter your email address.');
    action.disabled = true; action.textContent = 'Sending…';
    try {
      await sendCode(email);
      showCodeStep();
    } catch (err) {
      action.disabled = false; action.textContent = 'Email me a code';
      fail(err.message || 'We could not send that. Check the address and try again.');
    }
  }

  function showCodeStep() {
    title.textContent = 'Check your email';
    ok(`We sent a ${CODE_LENGTH}-digit code to ${email}. It can take a minute to arrive.`);

    const code = el('input.gate-input.gate-code', {
      type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
      placeholder: '0'.repeat(CODE_LENGTH), maxlength: String(MAX_CODE_LENGTH), autocapitalize: 'off',
    });
    const go = el('button.gate-btn', { type: 'button', text: 'Sign in' });
    const again = el('button.gate-link', {
      type: 'button', text: 'Use a different email',
      onclick: () => { clear(form); form.append(field, action); title.textContent = 'Welcome';
                       action.disabled = false; action.textContent = 'Email me a code';
                       ok(`Enter the email address we sent your invitation to.`); field.focus(); },
    });

    clear(form);
    form.append(code, go, again);
    code.focus();

    const submit = async (ev) => {
      ev?.preventDefault();
      const token = code.value.trim();
      if (token.length < MIN_CODE_LENGTH) return;
      go.disabled = true; go.textContent = 'Checking…';
      try {
        await verifyCode(email, token);
        const access = await resolveAccess();
        if (access.state === 'contact') return onSuccess(access);
        fail("We don't recognise that address. Please use the one your invitation was sent to.");
        go.disabled = false; go.textContent = 'Sign in';
      } catch (err) {
        fail(err.message || 'That code did not work. Codes expire after an hour.');
        go.disabled = false; go.textContent = 'Sign in';
      }
    };

    go.onclick = submit;
    form.onsubmit = submit;
    code.oninput = () => {
      const digits = code.value.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
      if (digits !== code.value) code.value = digits;
      if (digits.length === CODE_LENGTH) submit();
    };
  }

  action.onclick = requestCode;
  form.onsubmit = requestCode;

  mount.append(el('div.gate-wrap', {}, [
    el('img.gate-logo', { src: './assets/img/logo-mark.png', alt: 'TaylorMade Brands' }),
    el('div.gate-tag', { text: 'Client Onboarding' }),
    title, note, form, help,
  ]));
  // A prefilled address means the button is the next thing to press, not the
  // field. Focusing the field there would pop a keyboard over the button.
  if (email) action.focus(); else field.focus();
}
