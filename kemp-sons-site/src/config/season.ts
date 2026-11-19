/**
 * Seasonal homepage theme. Until endsAt the homepage hero is Christmas (a
 * Christmas card in the 3D scene, Christmas headline and buttons, light
 * snowfall); after that it goes back to the regular page in the visitor's
 * browser, with no redeploy needed. Base.astro adds `season-xmas` to <html>
 * before the page paints; the homepage and the 3D scene read that class.
 */
export const christmasSeason = {
  // The homepage stays Christmas through December 22 (switches back at midnight Central going into the 23rd).
  endsAt: '2026-12-23T06:00:00Z',
  // "Order by December 15" shows until the end of the 15th.
  orderBy: '2026-12-16T06:00:00Z',
}
