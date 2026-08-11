/**
 * Analytics + Google Ads configuration.
 *
 * Everything here is OFF until you fill in IDs — the site ships with these
 * blank and renders no tracking, no cookies, and no consent banner.
 *
 * WHEN YOU'RE READY (or just send Josh these and I'll paste them in):
 *
 * 1. ga4Id      — Google Analytics 4 "Measurement ID". Looks like "G-XXXXXXXXXX".
 *                 Find it in Google Analytics → Admin → Data Streams → your web stream.
 *
 * 2. adsId      — Google Ads "Conversion ID" (the account tag). Looks like "AW-XXXXXXXXXX".
 *                 Find it in Google Ads → Tools → Conversions → your tag / "Google tag".
 *
 * 3. conversions — Each is the "send_to" value for one Google Ads conversion action,
 *                  formatted "AW-XXXXXXXXXX/xxxxxxxxxxxxxxxxx" (ID + a slash + label).
 *                  Create these in Google Ads → Tools → Conversions:
 *                    • contactForm    → a "Submit lead form" conversion (fires on the contact thank-you page)
 *                    • assessmentForm → a "Submit lead form" conversion (fires on the assessment thank-you page)
 *                    • phoneCall      → a "Contact / Phone call clicks" conversion (fires when someone taps the phone number)
 */
export const analytics = {
  ga4Id: 'G-TEST00000',
  adsId: '',
  conversions: {
    contactForm: '',
    assessmentForm: '',
    phoneCall: '',
  },
};

export const analyticsEnabled = Boolean(analytics.ga4Id || analytics.adsId);
