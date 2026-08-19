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

  window.supabase = {
    createClient() {
      return {
        from: (table) => new Query(table),
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
