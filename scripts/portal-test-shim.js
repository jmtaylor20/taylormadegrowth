// A stand-in for the Supabase browser client, for scripts/test-portal-flow.mjs.
//
// The portal's own code is loaded unmodified; only the vendored Supabase bundle
// is swapped for this. Every query it builds is sent to the harness and run
// against a throwaway Postgres AS THE SIGNED-IN CONTACT — `set local role
// authenticated` with that contact's jwt claims — so the rows the page renders
// are the rows RLS actually allows, not a fixture list. If a policy were
// removed, this test would start seeing another client's data, which is the
// whole point of running the UI against a real database rather than a mock.
//
// Auth is the one piece that is faked, because GoTrue is not running: the
// harness injects which contact is signed in. Everything below that line is real.
(function () {
  const ENDPOINT = '/__pg';

  async function post(body) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, session: window.__PORTAL_TEST__.session }),
    });
    return res.json();
  }

  class Query {
    constructor(table) {
      this.q = { table, action: 'select', columns: '*', filters: [], order: [], limit: null, single: false, payload: null };
    }
    select(cols) { this.q.columns = cols || '*'; if (this.q.action !== 'select') this.q.returning = true; return this; }
    insert(payload) { this.q.action = 'insert'; this.q.payload = payload; return this; }
    update(payload) { this.q.action = 'update'; this.q.payload = payload; return this; }
    delete() { this.q.action = 'delete'; return this; }
    eq(col, val) { this.q.filters.push(['eq', col, val]); return this; }
    is(col, val) { this.q.filters.push(['is', col, val]); return this; }
    ilike(col, val) { this.q.filters.push(['ilike', col, val]); return this; }
    order(col, opts) { this.q.order.push([col, opts?.ascending === false ? 'desc' : 'asc']); return this; }
    limit(n) { this.q.limit = n; return this; }
    single() { this.q.single = true; return this; }
    then(resolve, reject) { return post({ op: 'query', q: this.q }).then(resolve, reject); }
  }

  // Storage, as far as the portal can tell.
  //
  // The bytes are not kept: what is under test here is the tenant boundary,
  // which lives in the object's PATH, and that is a row in storage.objects
  // governed by the same policies the real bucket uses. So an upload becomes an
  // insert of that row as the signed-in contact, and a path under somebody
  // else's engagement is refused by Postgres exactly as it would be by Storage.
  const storage = (bucket) => ({
    upload: (path, file, opts) => post({
      op: 'storage', fn: 'upload', bucket, path,
      meta: { size: file?.size ?? 0, mimetype: opts?.contentType || file?.type || null },
    }),
    remove: (paths) => post({ op: 'storage', fn: 'remove', bucket, paths }),
    createSignedUrl: async (path) => ({ data: { signedUrl: '/__signed/' + path }, error: null }),
  });

  // Edge Functions are not run locally. The call is recorded so a test can
  // assert what would have been sent — the address it resolves to, and the body
  // it carries — and answered with whatever window.__PORTAL_TEST__.functions
  // says. That covers both halves of what matters: the happy path, and how the
  // app behaves when sending is not configured yet.
  window.__FN_CALLS__ = [];
  const functions = {
    invoke: async (name, opts) => {
      window.__FN_CALLS__.push({ name, body: opts?.body });
      const canned = (window.__PORTAL_TEST__.functions || {})[name];
      if (typeof canned === 'function') return canned(opts?.body);
      return canned || { data: { sent: true }, error: null };
    },
  };

  window.supabase = {
    createClient() {
      return {
        from: (table) => new Query(table),
        storage: { from: storage },
        functions,
        rpc: (fn, args) => post({ op: 'rpc', fn, args: args || {} }),
        auth: {
          getSession: async () => ({ data: { session: window.__PORTAL_TEST__.session }, error: null }),
          signOut: async () => { window.__PORTAL_TEST__.session = null; return { error: null }; },
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithOtp: async () => ({ error: null }),
          verifyOtp: async () => ({ error: null }),
        },
      };
    },
  };
})();
