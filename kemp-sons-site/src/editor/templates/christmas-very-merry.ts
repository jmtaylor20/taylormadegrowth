import type { Template } from '../types'

const RED = '#b3232d'
const INK = '#4a3f38'
const WOOD = '/templates/very-merry/wood.jpg'

// Three photos across the top of a 7 x 5 in landscape card.
const M = 0.3 // outer margin
const GAP = 0.1
const PHOTO_W = (7 - 2 * M - 2 * GAP) / 3
const PHOTO_H = 2.72

/** 7 x 5 landscape photo card: three photos over whitewashed wood and a hand-brushed "Merry Christmas". */
export const christmasVeryMerry: Template = {
  id: 'very-merry-three-photo',
  category: 'christmas-cards',
  shopifyHandle: 'christmas-card-very-merry',
  name: 'Very Merry',
  description: 'Three favorite photos over whitewashed wood planks, with a hand-brushed "Merry Christmas" in holiday red.',
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
      background: '#eeebe6',
      elements: [
        { type: 'image', src: WOOD, x: -0.125, y: -0.125, w: 7.25, h: 5.25 },
        ...[1, 2, 3].map((n, i) => ({
          type: 'photo' as const,
          field: `photo_${n}`,
          x: M + i * (PHOTO_W + GAP),
          y: M,
          w: PHOTO_W,
          h: PHOTO_H,
          placeholder: '#d6d1c8',
        })),
        { type: 'text', text: '{{lead}}', x: 0.3, y: 3.22, w: 4.75, h: 0.3, font: 'Playfair Display', weight: 700, size: 12.5, minSize: 7, uppercase: true, letterSpacing: 0.16, color: RED },
        // Christmas Math: tall brush script, so one line only. Letters and punctuation only (no numbers).
        { type: 'text', text: '{{greeting}}', x: 0.3, y: 3.62, w: 4.75, h: 0.95, font: 'Christmas Math', size: 34, minSize: 14, maxLines: 1, color: RED },
        { type: 'line', x: 5.45, y: 3.62, points: [0, 0, 0, 0.9], stroke: RED, strokeWidth: 0.6, opacity: 0.6 },
        { type: 'text', text: '{{signoff}}', x: 5.6, y: 3.62, w: 1.15, h: 0.28, font: 'Montserrat', weight: 700, size: 8.5, minSize: 6, uppercase: true, letterSpacing: 0.18, color: RED, align: 'left' },
        { type: 'text', text: '{{family}}', x: 5.6, y: 3.9, w: 1.15, h: 0.62, font: 'Montserrat', weight: 700, size: 8.5, minSize: 5.5, uppercase: true, letterSpacing: 0.18, lineHeight: 1.3, color: RED, align: 'left', valign: 'top' },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: '#eeebe6',
      elements: [
        { type: 'image', src: WOOD, x: -0.125, y: -0.125, w: 7.25, h: 5.25 },
        // A soft paper panel keeps the message readable over the plank seams.
        { type: 'rect', x: 0.75, y: 0.45, w: 5.5, h: 4.1, fill: '#fbfaf6', opacity: 0.92 },
        { type: 'rect', x: 0.87, y: 0.57, w: 5.26, h: 3.86, stroke: RED, strokeWidth: 0.8, opacity: 0.6 },
        { type: 'text', text: '{{year}}', x: 1, y: 0.62, w: 5, h: 0.75, font: 'Playfair Display', weight: 700, size: 36, minSize: 18, letterSpacing: 0.12, color: RED },
        { type: 'text', text: '{{message}}', showIf: 'message', x: 1.1, y: 1.55, w: 4.8, h: 1.8, font: 'Playfair Display', italic: true, size: 14, minSize: 8, lineHeight: 1.4, color: INK },
        { type: 'text', text: '{{names}}', x: 1, y: 3.4, w: 5, h: 0.5, font: 'Great Vibes', size: 28, minSize: 14, color: RED },
        { type: 'text', text: 'Printed by Kemp & Sons  |  Opelika, Alabama', x: 1.5, y: 4.15, w: 4, h: 0.18, font: 'Montserrat', weight: 500, size: 5.5, letterSpacing: 0.2, uppercase: true, color: '#8a8177' },
      ],
    },
  ],
}
