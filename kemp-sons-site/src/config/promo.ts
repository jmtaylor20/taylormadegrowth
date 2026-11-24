/**
 * Site-wide notice bar under the header (Header.astro). Shows until endsAt
 * (checked in the visitor's browser), then removes itself with no redeploy.
 * Set `text` to '' to turn it off.
 */
export const notice = {
  text: 'Holiday hours: we close Wednesday, November 25 at 12 PM and reopen Monday, November 30 at 8 AM. Online orders stay open and will be printed when we are back. Happy Thanksgiving!',
  short: 'Closed Wed 11/25 at 12 PM. Back Monday 11/30 at 8 AM.',
  // 8 AM Central on Monday, November 30, 2026.
  endsAt: '2026-11-30T14:00:00Z',
}
