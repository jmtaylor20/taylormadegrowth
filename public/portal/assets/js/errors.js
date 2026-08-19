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
  // Supabase's built-in mailer is rate limited per hour, so a run of sign-ins
  // hits a wall that has nothing to do with the person's address being wrong.
  // Say which it is, or they will retype a correct email until they give up.
  if (error.status === 429 || /rate limit|too many requests|over_email_send_rate/i.test(message)) {
    return decorate(error, code || '429', 'rate_limited',
      "We've sent as many codes as we're allowed to for the moment. Wait about an hour and try again — " +
      'nothing is wrong with your address. If you already have a code from earlier, it still works.');
  }
  if (code === 'PGRST301' || /jwt|token/i.test(message)) {
    return decorate(error, code, 'session_expired',
      'Your sign-in link has expired. Enter your email again and we\'ll send a fresh code.');
  }
  return error;
}

// Storage speaks its own dialect: an RLS refusal on an object comes back as an
// HTTP status and a terse body rather than a Postgres SQLSTATE.
export function humanizeStorage(error) {
  if (!error || typeof error !== 'object') return error;
  const message = String(error.message || '');
  const status = Number(error.statusCode || error.status || 0);
  if (status === 403 || /unauthorized|violates row-level security|not authorized/i.test(message)) {
    return decorate(error, String(status || 403), 'not_permitted',
      "You don't have access to upload there. If you think that's wrong, reply to the email that brought you here.");
  }
  if (status === 413 || /payload too large|exceeded the maximum/i.test(message)) {
    return decorate(error, String(status || 413), 'too_large',
      'That file is too big to upload here. If you can, send a smaller version — ' +
      "or reply to your invitation email and we'll take it another way.");
  }
  if (/duplicate|already exists/i.test(message)) {
    return decorate(error, '409', 'duplicate',
      'A file with that name is already here. Rename it and try again.');
  }
  return error;
}

function decorate(cause, code, kind, text) {
  const e = new Error(text);
  e.code = code; e.kind = kind; e.cause = cause;
  return e;
}
