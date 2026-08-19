// Client onboarding portal — shell and router.
//
// Separate from the ops app on purpose. Same database, same brand, entirely
// different door: nothing under /app is reachable from here, and a client
// contact's session grants them nothing there either — that is enforced by
// is_staff() in the policies, not by which page they loaded.

import { BUILD, BRAND } from './config.js';
import { el, clear, toast } from './ui.js';
import { resolveAccess, renderSignIn, signOut, onSessionLost } from './auth.js';
import { myClient, myEngagements, meAsContact, sectionById } from './db.js';
import { renderSections } from './sections.js';
import { renderSection } from './section.js';

const root = document.getElementById('root');
const state = { client: null, contact: null, engagement: null, engagements: [] };

boot();

async function boot() {
  const access = await resolveAccess();
  if (access.state === 'contact') return start(access);

  document.body.classList.add('signed-out');
  clear(root);
  renderSignIn(root, (a) => start(a));

  if (access.state === 'unknown') {
    toast("That address isn't on a client's contact list.", 'err');
  }
}

async function start(access) {
  document.body.classList.remove('signed-out');
  clear(root);
  root.append(el('div.boot', {}, [el('div.spinner')]));

  try {
    const [client, engagements, contact] = await Promise.all([
      myClient(), myEngagements(), meAsContact(access.email),
    ]);
    state.client = client;
    state.contact = contact;
    state.engagements = engagements;
    // One live engagement is the normal case. If a client somehow has two, the
    // most recent non-archived one is the one they were just invited to.
    state.engagement = engagements.find((e) => e.status !== 'archived') || engagements[0] || null;
  } catch (err) {
    clear(root);
    root.append(chrome(el('div.empty', {}, [
      el('h2', { text: 'We could not load your onboarding' }),
      el('p', { text: err.message || 'Please try again in a moment.' }),
    ])));
    return;
  }

  onSessionLost(() => { location.reload(); });
  window.addEventListener('hashchange', route);
  route();
}

function chrome(content) {
  const name = state.client?.business_name || BRAND.name;
  return el('div.shell', {}, [
    el('header.top', {}, [
      state.client?.logo_url
        ? el('img.top-logo', { src: state.client.logo_url, alt: name })
        : el('img.top-logo', { src: './assets/img/logo-mark.png', alt: BRAND.name }),
      el('div.top-who', {}, [
        el('div.top-name', { text: name }),
        el('div.top-sub', { text: state.contact?.name ? `Signed in as ${state.contact.name}` : 'Client onboarding' }),
      ]),
      el('button.top-out', { type: 'button', text: 'Sign out', onclick: async () => { await signOut(); location.reload(); } }),
    ]),
    el('main.main', {}, [content]),
    el('footer.foot', {}, [
      el('span', { text: `Questions? Reply to your invitation email or write to ${BRAND.replyTo}.` }),
      el('span.build', { text: BUILD }),
    ]),
  ]);
}

function mountPage(builder) {
  clear(root);
  const page = el('div.page');
  root.append(chrome(page));
  document.querySelector('.main')?.scrollTo(0, 0);
  return builder(page);
}

async function route() {
  if (!state.engagement) {
    return mountPage((page) => {
      page.append(el('div.empty', {}, [
        el('h2', { text: "You're all set for now" }),
        el('p', { text: "There's no onboarding waiting on you. We'll email you the moment there is." }),
      ]));
    });
  }

  const hash = location.hash.replace(/^#/, '');
  const match = /^\/s\/([0-9a-f-]{36})$/.exec(hash);

  if (match) {
    // Fetched by id, with no engagement filter of our own: whether this row is
    // reachable is the database's decision, not this router's. A link forwarded
    // to someone at another client comes back empty and lands them on their own
    // list. scripts/test-portal-flow.mjs proves that by widening the policy and
    // requiring the link to start working.
    const row = await sectionById(match[1]).catch(() => null);
    if (!row) { location.hash = '/'; return; }
    return mountPage((page) => renderSection(page, {
      row,
      contactId: state.contact?.id || null,
      onBack: () => { location.hash = '/'; },
      onChanged: () => {},
    }));
  }

  return mountPage((page) => renderSections(page, {
    engagement: state.engagement,
    onOpen: (row) => { location.hash = '/s/' + row.id; },
  }));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
