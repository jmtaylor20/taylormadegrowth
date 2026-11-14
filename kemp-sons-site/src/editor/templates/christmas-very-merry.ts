import type { Template } from '../types'

// Colors are matched to the washed wood: warm off-white boards (hue ~20) and warm gray grain (hue ~40).
const RED = '#a8302e' // holiday red, warmed and softened to sit on the wood
const INK = '#5a544c' // warm gray from the grain
const PAPER = '#f6f4f2' // the board faces
const FINE = '#8f8a83'
const WOOD = '/templates/very-merry/wood.jpg'

// Three photos across the top of a 7 x 5 in landscape card.
const M = 0.3 // outer margin
const GAP = 0.1
const PHOTO_W = (7 - 2 * M - 2 * GAP) / 3
const PHOTO_H = 2.72

/** 7 x 5 landscape photo card: three photos over whitewashed wood and a big vintage "Merry Christmas". */
export const christmasVeryMerry: Template = {
  id: 'very-merry-three-photo',
  category: 'christmas-cards',
  shopifyHandle: 'christmas-card-very-merry',
  envelope: { w: 7.25, h: 5.25, label: 'A7 envelope', shopifyHandle: 'addressed-envelopes' },
  name: 'Very Merry',
  description: 'Three favorite photos over whitewashed wood planks, with a big vintage "Merry Christmas" in holiday red.',
  trim: { w: 7, h: 5 },
  sizeLabel: '7 x 5 in flat card, printed both sides',
  safeMargin: 0.2,
  fields: [
    { id: 'photo', type: 'photo', label: 'Photos', count: 3, hint: 'Drag a photo on the preview to reposition it.', section: 'Front' },
    { id: 'lead', type: 'text', label: 'Small line above', default: 'Wishing you a very', section: 'Front' },
    { id: 'greeting', type: 'text', label: 'Greeting', default: 'Merry Christmas', section: 'Front' },
    { id: 'signoff', type: 'text', label: 'Sign-off', default: 'Love,', section: 'Front' },
    { id: 'family', type: 'text', label: 'Family name', default: 'The Hayes Family', section: 'Front' },
    {
      id: 'message',
      type: 'textarea',
      label: 'Message',
      rows: 4,
      section: 'Back',
      hint: 'Leave blank for a simple back with just the year.',
      default: 'This year was full of muddy boots, late nights and more laughter than we could hold. Thank you for being part of it. We hope your home is warm and your table is full.',
    },
    { id: 'names', type: 'text', label: 'Signed', default: 'Mike, Sarah, Ellie & Ben', section: 'Back' },
    { id: 'year', type: 'text', label: 'Year', default: '2026', section: 'Back' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Front',
      background: PAPER,
      elements: [
        { type: 'image', src: WOOD, x: -0.125, y: -0.125, w: 7.25, h: 5.25 },
        ...[1, 2, 3].map((n, i) => ({
          type: 'photo' as const,
          field: `photo_${n}`,
          x: M + i * (PHOTO_W + GAP),
          y: M,
          w: PHOTO_W,
          h: PHOTO_H,
        })),
        { type: 'text', text: '{{lead}}', x: 0.45, y: 3.2, w: 4.6, h: 0.3, font: 'Playfair Display', weight: 700, size: 12.5, minSize: 7, uppercase: true, letterSpacing: 0.16, color: RED },
        { type: 'text', text: '{{greeting}}', x: 0.3, y: 3.48, w: 4.95, h: 1.22, font: 'Rye', size: 46, minSize: 18, uppercase: true, lineHeight: 1.0, color: RED },
        { type: 'line', x: 5.45, y: 3.62, points: [0, 0, 0, 0.9], stroke: RED, strokeWidth: 0.6, opacity: 0.6 },
        { type: 'text', text: '{{signoff}}', x: 5.6, y: 3.62, w: 1.15, h: 0.28, font: 'Montserrat', weight: 700, size: 8.5, minSize: 6, uppercase: true, letterSpacing: 0.18, color: RED, align: 'left' },
        { type: 'text', text: '{{family}}', x: 5.6, y: 3.9, w: 1.15, h: 0.62, font: 'Montserrat', weight: 700, size: 8.5, minSize: 5.5, uppercase: true, letterSpacing: 0.18, lineHeight: 1.3, color: RED, align: 'left', valign: 'top' },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: PAPER,
      elements: [
        { type: 'image', src: WOOD, x: -0.125, y: -0.125, w: 7.25, h: 5.25 },
        // A soft paper panel keeps the message readable over the plank seams.
        { type: 'rect', x: 0.75, y: 0.45, w: 5.5, h: 4.1, fill: PAPER, opacity: 0.9 },
        { type: 'rect', x: 0.87, y: 0.57, w: 5.26, h: 3.86, stroke: RED, strokeWidth: 0.8, opacity: 0.6 },
        { type: 'text', text: '{{year}}', x: 1, y: 0.7, w: 5, h: 0.75, font: 'Rye', size: 38, minSize: 18, color: RED },
        { type: 'text', text: '{{message}}', showIf: 'message', x: 1.1, y: 1.55, w: 4.8, h: 1.8, font: 'Playfair Display', italic: true, size: 14, minSize: 8, lineHeight: 1.4, color: INK },
        { type: 'text', text: '{{names}}', x: 1, y: 3.4, w: 5, h: 0.5, font: 'Great Vibes', size: 28, minSize: 14, color: RED },
        { type: 'text', text: 'Printed by Kemp & Sons  |  Opelika, Alabama', x: 1.5, y: 4.15, w: 4, h: 0.18, font: 'Montserrat', weight: 500, size: 5.5, letterSpacing: 0.2, uppercase: true, color: FINE },
      ],
    },
  ],
}
