/**
 * TaylorMade Brands — Google Ads → app metrics sync.
 * -------------------------------------------------------------------------
 * Runs INSIDE your Google Ads MANAGER account (550-756-8191) as a Google Ads
 * Script. On each run it walks every linked client account, pulls the last few
 * complete months of headline stats (clicks, impressions, cost, conversions),
 * and upserts them into the app's `ad_metrics` table in Supabase. The Reports
 * tab then auto-fills those numbers when you build a client's monthly report —
 * matched by the Google Ads ID saved on each client.
 *
 * No developer token, no OAuth, no Google Cloud project. Ads Scripts run with
 * your account's own access. The only credential below is the Supabase
 * publishable (anon) key — the same one already shipped in the web app, and
 * safe to expose (the database is guarded by row-level security).
 *
 * ── ONE-TIME SETUP ───────────────────────────────────────────────────────
 *  1. Sign in to your MANAGER account at ads.google.com (550-756-8191).
 *  2. Left nav → Tools → (under "Bulk actions") → Scripts.
 *  3. Click the blue + to create a new script. Name it "App metrics sync".
 *  4. Delete the sample code, paste THIS ENTIRE FILE in, and click Save.
 *  5. Click Authorize / Run and approve the permissions prompt (needed so the
 *     script can read stats and call out to Supabase). The first run backfills
 *     the last 3 months.
 *  6. Click Schedule → set it to run MONTHLY, on the 1st, early morning
 *     (e.g. 3–4 AM). That's it — reports fill themselves from then on.
 *
 * To pull fresh numbers on demand, just open the script and hit Run.
 * ------------------------------------------------------------------------- */

// ── Config ────────────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://buubrapkkqyalecwbhkh.supabase.co';

// ── Supabase credential ───────────────────────────────────────────────────
// This is a GOOGLE ADS SCRIPT, not an Apps Script project. The Ads Scripts
// runtime has no PropertiesService, so there is nowhere outside the script body
// to keep a credential — the key has to live in this constant.
//
// Which means: fill it in inside the Google Ads UI, and NEVER commit the real
// value to this file. The repo copy stays a placeholder forever.
//
// Use a SECOND secret key named "ads-sync", not the "default" one the document
// pipeline uses. Both bypass row-level security completely, but a separate key
// can be rotated on its own — and unlike Script Properties, anyone with access
// to the Google Ads manager account can read this one.
//
//   Supabase → Project Settings → API Keys → Create new secret key → "ads-sync"
//
// The publishable key this used to carry stops working once the anon policies
// are dropped, which is why it changed.
var SUPABASE_SECRET_KEY = 'PASTE_ADS_SYNC_SECRET_KEY_HERE';

function supabaseKey_() {
  if (!SUPABASE_SECRET_KEY || SUPABASE_SECRET_KEY.indexOf('PASTE_') === 0) {
    throw new Error(
      'SUPABASE_SECRET_KEY is still the placeholder. Edit this script in Google Ads and paste ' +
      'the secret key named "ads-sync" from Supabase - Project Settings - API Keys.'
    );
  }
  return SUPABASE_SECRET_KEY;
}
var MONTHS_BACK  = 3; // how many complete prior months to (re)sync each run

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function main() {
  var now = new Date();

  // Collect the linked accounts once.
  var accounts = [];
  var it = AdsManagerApp.accounts().get();
  while (it.hasNext()) accounts.push(it.next());
  Logger.log('Found ' + accounts.length + ' linked account(s).');

  var rows = [];
  for (var m = 1; m <= MONTHS_BACK; m++) {
    var first = new Date(now.getFullYear(), now.getMonth() - m, 1);
    var last  = new Date(now.getFullYear(), now.getMonth() - m + 1, 0);
    var periodMonth = first.getFullYear() + '-' + pad2_(first.getMonth() + 1) + '-01';
    var periodLabel = MONTH_NAMES[first.getMonth()] + ' ' + first.getFullYear();
    var from = { year: first.getFullYear(), month: first.getMonth() + 1, day: 1 };
    var to   = { year: last.getFullYear(),  month: last.getMonth() + 1,  day: last.getDate() };

    for (var i = 0; i < accounts.length; i++) {
      var acct = accounts[i];
      var stats;
      try {
        stats = acct.getStatsFor(from, to);
      } catch (e) {
        Logger.log('Skip ' + acct.getCustomerId() + ' (' + periodLabel + '): ' + e);
        continue;
      }
      var clicks = stats.getClicks();
      var impressions = stats.getImpressions();
      var cost = stats.getCost();
      var conversions = stats.getConversions();
      var ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      var avgCpc = clicks > 0 ? cost / clicks : 0;

      rows.push({
        customer_id: acct.getCustomerId(),      // "728-072-1650" — matches app
        account_name: acct.getName(),
        period_month: periodMonth,
        period: periodLabel,
        clicks: clicks,
        impressions: impressions,
        cost: round2_(cost),
        conversions: round2_(conversions),
        ctr: Math.round(ctr * 100) / 100,
        avg_cpc: round2_(avgCpc),
        source: 'google_ads',
        updated_at: new Date().toISOString()
      });
    }
  }

  if (!rows.length) { Logger.log('Nothing to sync.'); return; }
  upsert_(rows);
  Logger.log('Synced ' + rows.length + ' account-months.');
}

// Upsert into Supabase, resolving on the (customer_id, period_month) unique key.
function upsert_(rows) {
  var url = SUPABASE_URL + '/rest/v1/ad_metrics?on_conflict=customer_id,period_month';
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      // Secret keys are not JWTs, so Supabase rejects them in an
      // `Authorization: Bearer` header — they go on `apikey` alone. The old
      // publishable key tolerated both, which is why this used to send two.
      'apikey': supabaseKey_(),
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  Logger.log('Supabase response: ' + code + (code >= 300 ? ' ' + resp.getContentText() : ' OK'));
  if (code >= 300) throw new Error('Supabase upsert failed: ' + code + ' ' + resp.getContentText());
}

function round2_(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
