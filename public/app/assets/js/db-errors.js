// Turns Postgres's account of what went wrong into something a person can act
// on.
//
// Kept separate from db.js so it can be reasoned about — and tested — without a
// Supabase client in the room. db.js runs every error through it, so every
// existing `catch (e) { toast(e.message, 'err') }` gets the better wording with
// no change at the call site.

// `<table>_<column>_secret_check` — recover the column so the message can point
// at the field the person was actually typing into.
function columnFromConstraint(message) {
  const relation = (message.match(/relation "([a-z_0-9]+)"/) || [])[1];
  const constraint = (message.match(/constraint "([a-z_0-9]+)"/) || [])[1];
  if (!constraint) return null;
  let name = constraint.replace(/_secret_check$/, '');
  if (relation && name.startsWith(relation + '_')) name = name.slice(relation.length + 1);
  return name ? name.replace(/_/g, ' ') : null;
}

/**
 * Map a Supabase/Postgres error to something worth showing.
 * Returns the original error untouched when there is nothing better to say —
 * inventing friendly text for errors we do not understand only hides them.
 */
export function humanizeDbError(error) {
  if (!error || typeof error !== 'object') return error;
  const code = error.code;
  const message = String(error.message || '');

  // The credential tripwire. Deliberately explains WHY rather than just
  // refusing: someone typing a password into a notes field is being helpful,
  // and needs to know we neither want it nor keep it.
  if (code === '23514' && /_secret_check/.test(message)) {
    const field = columnFromConstraint(message);
    const where = field ? ` in ${field}` : '';
    const friendly = new Error(
      `That looks like a password or API key${where}. Don't put credentials here — ` +
      `we record whether we have access to a platform, never the credential itself. ` +
      `Describe the access instead, or leave it blank and we'll sort it out together.`
    );
    friendly.code = code;
    friendly.kind = 'credential_rejected';
    friendly.cause = error;
    return friendly;
  }

  // A row-level security refusal reads like a database internal. It means one
  // of two things, and neither is worth spelling out to whoever hit it.
  if (code === '42501' || /row-level security/i.test(message)) {
    const friendly = new Error("You don't have access to change that.");
    friendly.code = code || '42501';
    friendly.kind = 'not_permitted';
    friendly.cause = error;
    return friendly;
  }

  return error;
}
