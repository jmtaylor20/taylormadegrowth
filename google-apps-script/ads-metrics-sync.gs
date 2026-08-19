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
 * your account's own access.
 *
 * For Supabase it signs in as its own user and uses the resulting JWT. It holds
 * no key with authority: the publishable key below is only the project
 * identifier and is meant to be public. See the credential note further down
 * for why a secret key cannot be used here, and what bounds this identity.
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
 *  7. Fill in AUTOMATION_PASSWORD below, in the Google Ads UI. Never commit it:
 *     the repo copy of this file stays a placeholder.
 *
 * To pull fresh numbers on demand, just open the script and hit Run.
 * ------------------------------------------------------------------------- */

// ── Config ────────────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://buubrapkkqyalecwbhkh.supabase.co';
var SUPABASE_KEY = 'sb_publishable_h-KXdNNW7Tc_BFut25s_sQ_ypIidBJB';
var MONTHS_BACK  = 3; // how many complete prior months to (re)sync each run

// ── Automation sign-in ────────────────────────────────────────────────────
// This script has its own Supabase Auth user and exchanges a password for a
// normal user JWT on each run. It does NOT carry a secret key, and cannot:
// Supabase rejects those with 401 matched on the User-Agent header, and this
// runtime sends a Mozilla/5.0 agent it will not let you override.
//
// The publishable key above still travels on `apikey` — that is the project
// identifier and is meant to be public. Authority comes from the JWT.
//
// The password sits in this file because Google Ads Scripts have no
// PropertiesService: there is nowhere else to put it, and anyone with access to
// the Ads manager account can read it. That is precisely why this identity is
// scoped in public.automation_accounts to `ad_metrics` and nothing else — the
// worst a leak buys is the ability to write ad statistics. It cannot read a
// client, an invoice, or a payment.
//
// Fill the password in inside the Google Ads UI. Leave the repo copy as the
// placeholder — this file is in a public repository.
var AUTOMATION_EMAIL = 'josh+ads-automation@taylormadegrowth.com';
var AUTOMATION_PASSWORD = 'PASTE_ADS_AUTOMATION_PASSWORD_HERE';

var TOKEN_CACHE_ = null;   // one sign-in per execution

function accessToken_() {
  if (TOKEN_CACHE_) return TOKEN_CACHE_;
  if (!AUTOMATION_PASSWORD || AUTOMATION_PASSWORD.indexOf('PASTE_') === 0) {
    throw new Error(
      'AUTOMATION_PASSWORD is still the placeholder. Edit this script in Google Ads and paste the ' +
      'password set on the ' + AUTOMATION_EMAIL + ' user in Supabase - Authentication - Users.'
    );
  }
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'apikey': SUPABASE_KEY },
    payload: JSON.stringify({ email: AUTOMATION_EMAIL, password: AUTOMATION_PASSWORD }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Automation sign-in failed: ' + res.getResponseCode() + ' ' + res.getContentText());
  }
  var tok = JSON.parse(res.getContentText()).access_token;
  if (!tok) throw new Error('Automation sign-in returned no access token.');
  TOKEN_CACHE_ = tok;
  return tok;
}

// ── Reporting window ──────────────────────────────────────────────────────
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
      // Publishable key identifies the project; the bearer token carries the
      // authority — here, the ad_metrics-scoped automation user's JWT.
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + accessToken_(),
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
