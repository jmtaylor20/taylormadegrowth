/**
 * All business content for the site lives here so it can be updated in one
 * place. Anything marked TODO is waiting on Kemp & Sons (see the Getting
 * Started Checklist) and renders as a neutral fallback until it's filled in.
 */

export const business = {
  name: 'Kemp & Sons Printing',
  shortName: 'Kemp & Sons',
  owners: 'Brian and Susan Bass',
  // TODO(kemp): confirm founding year before using it anywhere.
  founded: null as number | null,
  address: {
    street: '2301 Enterprise Drive',
    city: 'Opelika',
    state: 'AL',
    zip: '36801',
  },
  // From the current site ("705-5888"); area code assumed 334. TODO(kemp): confirm.
  phone: '(334) 705-5888',
  phoneHref: 'tel:+13347055888',
  fax: '(334) 741-0754',
  email: 'printing@kempandsons.com',
  // TODO(kemp): confirm hours. Shown only when filled in.
  hours: [] as { days: string; time: string }[],
  mapUrl: 'https://maps.google.com/?q=2301+Enterprise+Drive+Opelika+AL+36801',
  social: {
    // TODO(kemp): add real profile URLs.
    facebook: '',
    instagram: '',
    googleBusiness: '',
  },
}

/**
 * Shopify. The storefront (product design, PitchPrint, cart, checkout,
 * customer accounts and reorders) runs on the Shopify store at shopUrl.
 * This site links into it and reads product lines through the Storefront API.
 */
export const shop = {
  // TODO(shopify): set once the store and subdomain exist.
  shopUrl: import.meta.env.PUBLIC_SHOP_URL || 'https://shop.kempandsons.com',
  accountUrl: (import.meta.env.PUBLIC_SHOP_URL || 'https://shop.kempandsons.com') + '/account',
}

/** The five online product lines. `collection` must match the Shopify collection handle. */
export const productLines = [
  {
    collection: 'funeral-programs',
    name: 'Funeral Programs',
    blurb: 'Folded programs and 8-page booklets, built from our own layouts. Rush available.',
    tone: 'navy',
  },
  {
    collection: 'christmas-cards',
    name: 'Christmas & Seasonal Cards',
    blurb: '5x7 photo cards and greetings, with names and addresses merged from a spreadsheet.',
    tone: 'burgundy',
  },
  {
    collection: 'yard-signs',
    name: 'Yard Signs',
    blurb: 'Weatherproof signs for grads, events, real estate and "for sale, call this number."',
    tone: 'navy',
  },
  {
    collection: 'school-sports-programs',
    name: 'School & Sports Programs',
    blurb: 'Football programs, banquet programs and school events, ready for the season.',
    tone: 'gray',
  },
  {
    collection: 'stickers',
    name: 'Stickers',
    blurb: 'Sheets of six 3-inch circles, sized for party cups, favors and packaging.',
    tone: 'burgundy',
  },
] as const

/** Everything else Kemp & Sons prints (from the current site), for the custom-quote section. */
export const services = [
  'Announcements', 'Annual Reports', 'Brochures', 'Bumper Stickers', 'Calendars', 'Carbonless Forms',
  'Certificates', 'Coil Binding', 'Copying', 'Counter Cards', 'Coupons', 'Door Hangers', 'Envelopes',
  'Flyers', 'Folders', 'Forms', 'Gift Certificates', 'Graphic Design', 'Hard Bound Books', 'Invitations',
  'Labels', 'Lamination', 'Letterhead', 'Magnets', 'Mailers', 'Manuals', 'Memo Pads', 'Menus',
  'Newsletters', 'Numbering', 'Pamphlets', 'Postcards', 'Posters', 'Programs', 'Promotional Materials',
  'Raffle Tickets', 'Stationery', 'Thermography', 'Typesetting',
]

/** Shop capabilities. TODO(kemp): confirm current equipment; the old site may be out of date. */
export const capabilities = [
  { title: 'Offset printing', body: 'Two- and one-color offset presses for long runs, letterhead, envelopes and forms.' },
  { title: 'Digital printing', body: 'Fast short runs in full color, with a wide range of paper kept in stock.' },
  { title: 'Bindery and finishing', body: 'Cutting, folding, numbering, coil binding and hard bound books, done in house.' },
  { title: 'Design help', body: 'Bring a sketch, a Canva file or nothing at all. Our team can set it up for you.' },
]

/** Options for the custom job form. */
export const quoteJobTypes = [
  'Business cards or stationery', 'Brochures or flyers', 'Forms or carbonless', 'Booklets or programs',
  'Signs or banners', 'Labels or stickers', 'Invitations or announcements', 'Mailers or postcards',
  'Something else',
]
