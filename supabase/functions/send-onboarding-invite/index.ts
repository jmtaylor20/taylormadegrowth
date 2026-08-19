// Sends one client's onboarding invitation, from the ops app.
//
// Why this exists as a function rather than a fetch from the browser: sending
// mail needs a Resend API key, and a key in a page's source is a key anybody can
// use. It lives in this function's environment and never leaves the server.
//
// The shape of the request is the security design, so it is worth stating:
//
//   * The CALLER must be staff. The function re-checks that with the caller's
//     own JWT against is_staff() — the same function every RLS policy calls —
//     rather than trusting the app that called it.
//
//   * The RECIPIENT is never supplied. The caller names a contact id; this
//     function looks up that contact's address itself and refuses if the
//     contact does not belong to the named engagement. So the worst a stolen
//     staff session could do with this is email a real client of ours, which it
//     could already do from any mail client. It cannot be pointed at a stranger,
//     which is what would make it a spam relay.
//
//   * The BODY is supplied, because the message is authored in the ops app where
//     it can be read and edited before sending. It is length-capped and sent as
//     plain text, so there is nothing to inject into.
//
// Secrets it needs (Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY   required. Without it the function returns not_configured
//                    and the app falls back to opening the user's mail client.
//   INVITE_FROM      optional. Defaults to onboarding@taylormadegrowth.com, which
//                    must be a domain verified in Resend.
//   INVITE_REPLY_TO  optional. Where a client's reply goes.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FROM = Deno.env.get('INVITE_FROM') ?? 'TaylorMade Brands <onboarding@taylormadegrowth.com>';
const REPLY_TO = Deno.env.get('INVITE_REPLY_TO') ?? 'josh@taylormadegrowth.com';
const RESEND_KEY = Deno.env.get('RESEND_API_KEY');

const MAX_SUBJECT = 300;
const MAX_BODY = 20000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  // The caller's own token, not a service key: every query below is still
  // subject to RLS, so a session that should not see a contact cannot mail one.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );

  const { data: staff, error: staffErr } = await supabase.rpc('is_staff');
  if (staffErr) return json({ error: 'unauthorized' }, 401);
  if (staff !== true) return json({ error: 'not_staff' }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const engagementId = String(payload.engagement_id ?? '');
  const contactId = String(payload.contact_id ?? '');
  const subject = String(payload.subject ?? '').slice(0, MAX_SUBJECT);
  const body = String(payload.body ?? '').slice(0, MAX_BODY);
  if (!engagementId || !contactId || !subject || !body) return json({ error: 'bad_request' }, 400);

  // Resolve the address here. Nothing the caller sent decides who gets mail.
  const { data: engagement, error: engErr } = await supabase
    .from('onboarding_engagements').select('id,client_id').eq('id', engagementId).maybeSingle();
  if (engErr || !engagement) return json({ error: 'engagement_not_found' }, 404);

  const { data: contact, error: contactErr } = await supabase
    .from('client_contacts').select('id,name,email,client_id,portal_access')
    .eq('id', contactId).maybeSingle();
  if (contactErr || !contact) return json({ error: 'contact_not_found' }, 404);
  if (contact.client_id !== engagement.client_id) return json({ error: 'contact_not_on_engagement' }, 400);
  if (contact.portal_access === false) return json({ error: 'contact_has_no_portal_access' }, 400);

  if (!RESEND_KEY) return json({ error: 'not_configured' }, 503);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [contact.email],
      reply_to: REPLY_TO,
      subject,
      text: body,
    }),
  });

  if (!res.ok) {
    // Hand back what the mail service said. "Domain not verified" is the one
    // that will actually happen, and it is fixable in two minutes by somebody
    // who is told which domain — and unfixable by somebody told "failed".
    const detail = await res.text().catch(() => '');
    return json({ error: 'send_failed', status: res.status, detail: detail.slice(0, 500) }, 502);
  }

  const sent = await res.json().catch(() => ({}));

  // Deliberately does NOT mark the engagement invited. The ops app handles both
  // routes out — this one and the user's own mail client — so it is the only
  // place that can record "it went out" consistently. Two writers for one fact
  // is how the two disagree.
  return json({ sent: true, to: contact.email, id: sent?.id ?? null });
});
