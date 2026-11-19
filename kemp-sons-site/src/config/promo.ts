/**
 * Seasonal banner across the top of the site (Header.astro). It switches
 * itself off at endsAt in the visitor's browser, so no redeploy is needed;
 * after that, delete it here or set new lines and a new date.
 * Never shown on funeral pages (they pass promo={false} to the Header).
 */
export const christmasPromo = {
  // Midnight Central at the start of December 16, 2026: the last day shown is December 15.
  endsAt: '2026-12-16T06:00:00Z',
  href: '/shop/christmas-cards/',
  lines: [
    'Christmas cards: design yours online in minutes',
    'Use your family photo in one of our designs, or upload your own',
    'We can address your envelopes too',
    'Order by December 15',
    'Shop Christmas cards',
  ],
}
