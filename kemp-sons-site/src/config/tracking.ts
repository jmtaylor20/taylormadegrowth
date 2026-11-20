/**
 * Analytics and ad tracking IDs, all in one place.
 *
 * The Google Ads ID and conversion labels stay blank until the conversion
 * actions exist in Google Ads (account 109-777-3307). Blank means that part
 * is simply off: GA4 still runs, and the website call-number swap stays off.
 */
export const tracking = {
  /** Master switch. On for launch: GA4 runs now; the Google Ads parts turn on once adsId and the labels are filled in. */
  enabled: true,
  /** GA4 measurement ID. */
  ga4: 'G-CRKJS4F8XB',
  /** Google Ads tag ID, like AW-123456789. */
  adsId: '',
  /** Conversion label for a sent quote request (work order form). */
  quoteLabel: '',
  /** Conversion label for calls from the website (turns on the call-number swap). */
  callLabel: '',
  /** Shopify checkout, so a visit keeps one session from the site through checkout. */
  checkoutDomain: 'ynnu29-88.myshopify.com',
  linkerDomains: ['kempandsons.com', 'kemp-sons-site.netlify.app', 'ynnu29-88.myshopify.com'],
}
