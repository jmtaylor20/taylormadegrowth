// Database errors, said in a way a client can act on.
//
// The portal's audience is not technical and did not choose to be here. A raw
// Postgres constraint name is worse than useless to them — it reads as "the
// thing broke", which makes them stop rather than fix the input.

export function humanize(error) {
  if (!error || typeof error !== 'object') return error;
  const code = error.code;
  const message = String(error.message || '');

  // The credential tripwire. Explain WHY: someone typing a password into a
  // notes box is trying to be helpful and needs to know we don't want it.
  if (code === '23514' && /_secret_check/.test(message)) {
    return decorate(error, code, 'credential_rejected',
      "That looks like a password or an access key. Please don't put credentials in here — " +
      'we only ever record whether we have access to a platform, never the credential itself. ' +
      "If you're stuck, leave it blank and we'll sort it out together.");
  }
  if (code === '42501' || /row-level security/i.test(message)) {
    return decorate(error, code || '42501', 'not_permitted',
      "You don't have access to change that. If you think that's wrong, reply to the email that brought you here.");
  }
  if (code === 'PGRST301' || /jwt|token/i.test(message)) {
    return decorate(error, code, 'session_expired',
      'Your sign-in link has expired. Enter your email again and we\'ll send a fresh code.');
  }
  return error;
}

function decorate(cause, code, kind, text) {
  const e = new Error(text);
  e.code = code; e.kind = kind; e.cause = cause;
  return e;
}
