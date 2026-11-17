import type { Element, Template } from '../types'

/**
 * Nine 5 x 7 portrait photo cards from Kemp's Christmas card artwork (Drive:
 * Christmas Cards, 1.jpg to 9.jpg). Each card is the purchased artwork with
 * "Merry Christmas" built in and one photo window. The artwork files in
 * /public/templates/xmas are 300 ppi with a mirrored 0.127 in bleed.
 *
 * The photo sits on top of the artwork, exactly over the window. Where the
 * artwork overlaps the window (the script on Pine Garland), a cut-out of that
 * part is drawn over the photo again so the lettering stays in front.
 *
 * Front only (one-sided pricing). Cards with room under the photo get a
 * family name line.
 */

const DIR = '/templates/xmas'
const PAD = 38 / 300 // bleed added to each side of the artwork

interface Card {
  n: number
  id: string
  name: string
  description: string
  /** Photo window: x, y, w, h in inches from the trim's top left. */
  win: [number, number, number, number]
  /** Cut-out drawn over the photo where the art overlaps the window. */
  over?: [number, number, number, number]
  /** Family name line under the photo, when there's room. */
  name_line?: { y: number; h: number; x: number; w: number; color: string; font: 'Great Vibes' | 'Montserrat'; size: number }
}

const CARDS: Card[] = [
  {
    n: 1,
    id: 'green-stripe',
    name: 'Green Stripe',
    description: 'Watercolor sage stripes, a red frame for your photo and gold script "Merry Christmas".',
    win: [0.61, 1.51, 3.78, 4.9467],
  },
  {
    n: 2,
    id: 'candy-dash',
    name: 'Candy Dash',
    description: 'A scalloped green border with red watercolor dashes, "Merry Christmas" in brush lettering and your family name.',
    win: [0.9467, 1.6, 3.1067, 3.5833],
    name_line: { x: 0.95, y: 5.27, w: 3.1, h: 0.55, color: '#427256', font: 'Great Vibes', size: 30 },
  },
  {
    n: 3,
    id: 'ribbon-wave',
    name: 'Ribbon Wave',
    description: 'Wavy red and green ribbon borders, an elegant script "Merry Christmas" and your family name.',
    win: [1.0333, 2.1233, 2.9333, 3.59],
    name_line: { x: 1.0, y: 5.77, w: 3.0, h: 0.42, color: '#407456', font: 'Great Vibes', size: 24 },
  },
  {
    n: 4,
    id: 'pine-garland',
    name: 'Pine Garland',
    description: 'A hand-painted pine garland tied with a red bow, red script "Merry Christmas" and your family name.',
    // The window's top runs behind the script, so it starts above the lettering.
    win: [0.91, 1.385, 3.18, 4.215],
    over: [0.91, 1.385, 3.1767, 0.34],
    name_line: { x: 0.95, y: 5.64, w: 3.1, h: 0.4, color: '#bf2735', font: 'Great Vibes', size: 22 },
  },
  {
    n: 5,
    id: 'holly-berry',
    name: 'Holly Berry',
    description: 'Watercolor holly and red berries framing your photo, "Merry Christmas" in hand-lettered capitals and your family name.',
    win: [0.9333, 1.3, 3.1333, 4.3367],
    name_line: { x: 1.0, y: 5.69, w: 3.0, h: 0.38, color: '#174630', font: 'Montserrat', size: 10 },
  },
  {
    n: 6,
    id: 'nutcracker',
    name: 'Nutcracker',
    description: 'Pink bows, nutcrackers and little trees around a big photo, with bold "Merry Christmas" lettering.',
    win: [0.5667, 1.4667, 3.8667, 5.03],
  },
  {
    n: 7,
    id: 'navy-ornaments',
    name: 'Navy Ornaments',
    description: 'Painted ornaments, ribbons and holly on deep navy, with a white script "Merry Christmas".',
    win: [0.5667, 1.47, 3.8633, 5.0267],
  },
  {
    n: 8,
    id: 'ivory-ornaments',
    name: 'Ivory Ornaments',
    description: 'Painted ornaments, ribbons and holly on ivory, with a pink script "Merry Christmas".',
    win: [0.5667, 1.47, 3.8667, 5.0267],
  },
  {
    n: 9,
    id: 'pink-christmas',
    name: 'Pink Christmas',
    description: 'A playful pink holiday print with Santa, gifts and trees, and bold "Merry Christmas" lettering.',
    win: [0.5667, 1.47, 3.8667, 5.0267],
  },
]

function build(c: Card): Template {
  const [x, y, w, h] = c.win
  const elements: Element[] = [
    { type: 'image', src: `${DIR}/card-${c.n}.jpg`, x: -PAD, y: -PAD, w: 5 + 2 * PAD, h: 7 + 2 * PAD },
    // A hair larger than the window so no edge of it shows around the photo.
    { type: 'photo', field: 'photo', x: x - 0.01, y: y - 0.01, w: w + 0.02, h: h + 0.02 },
  ]
  if (c.over) elements.push({ type: 'image', src: `${DIR}/card-${c.n}-over.png`, x: c.over[0], y: c.over[1], w: c.over[2], h: c.over[3] })
  const L = c.name_line
  if (L)
    elements.push(
      L.font === 'Great Vibes'
        ? { type: 'text', text: '{{family}}', showIf: 'family', x: L.x, y: L.y, w: L.w, h: L.h, font: 'Great Vibes', size: L.size, minSize: 12, color: L.color }
        : { type: 'text', text: '{{family}}', showIf: 'family', x: L.x, y: L.y, w: L.w, h: L.h, font: 'Montserrat', weight: 600, size: L.size, minSize: 6, uppercase: true, letterSpacing: 0.2, color: L.color },
    )
  return {
    id: `christmas-${c.id}`,
    category: 'christmas-cards',
    shopifyHandle: `christmas-card-${c.id}`,
    envelope: { w: 7.25, h: 5.25, label: 'A7 envelope', shopifyHandle: 'addressed-envelopes' },
    name: c.name,
    description: c.description,
    trim: { w: 5, h: 7 },
    sizeLabel: '5 x 7 in flat card, printed one side',
    safeMargin: 0.15,
    fields: [
      { id: 'photo', type: 'photo', label: 'Photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Front' },
      ...(L ? [{ id: 'family', type: 'text' as const, label: 'Family name', default: 'The Hayes Family', hint: 'Leave blank for photo only.', section: 'Front' }] : []),
    ],
    sides: [{ id: 'front', label: 'Front', background: '#ffffff', elements }],
  }
}

export const christmasPhotoFrames: Template[] = CARDS.map(build)
