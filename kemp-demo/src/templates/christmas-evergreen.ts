import type { Template } from './types'
import { CARD_OPTIONS } from './shared'

const PINE = '#22382e'
const CREAM = '#f4ecdd'
const GOLD = '#c2a36b'

/** 5 x 7 flat photo card. Full-bleed photo with an evergreen band. */
export const christmasEvergreen: Template = {
  id: 'christmas-evergreen-photo',
  category: 'christmas',
  name: 'Evergreen Photo',
  description: 'Your favorite family photo above a deep evergreen band with hand-lettered script.',
  trim: { w: 5, h: 7 },
  sizeLabel: '5 x 7 in flat card',
  safeMargin: 0.2,
  ...CARD_OPTIONS,
  fields: [
    { id: 'photo', type: 'photo', label: 'Family photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Front' },
    { id: 'greeting', type: 'text', label: 'Greeting', default: 'Merry Christmas', section: 'Front' },
    { id: 'familyName', type: 'text', label: 'Family name', default: 'The Hayes Family', section: 'Front' },
    { id: 'year', type: 'text', label: 'Year', default: '2026', section: 'Front' },
    {
      id: 'message',
      type: 'textarea',
      label: 'Message',
      rows: 4,
      section: 'Back',
      default:
        'Wishing you a season full of warm kitchens, full tables, and the people you love most. Thank you for being part of our year.',
    },
    { id: 'signature', type: 'text', label: 'Signed', default: 'Mike, Sarah, Ellie & Ben', section: 'Back' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Front',
      background: PINE,
      elements: [
        { type: 'photo', field: 'photo', x: -0.125, y: -0.125, w: 5.25, h: 5.0, placeholder: '#cfd6cf' },
        { type: 'rect', x: -0.125, y: 4.875, w: 5.25, h: 0.04, fill: GOLD },
        { type: 'text', text: '{{greeting}}', x: 0.35, y: 5.02, w: 4.3, h: 0.95, font: 'Great Vibes', size: 44, minSize: 20, color: CREAM },
        { type: 'text', text: '{{familyName}}', x: 0.4, y: 6.04, w: 4.2, h: 0.3, font: 'Montserrat', weight: 600, size: 9.5, minSize: 6, uppercase: true, letterSpacing: 0.3, color: CREAM },
        { type: 'line', x: 2.25, y: 6.45, points: [0, 0, 0.5, 0], stroke: GOLD, strokeWidth: 0.6 },
        { type: 'text', text: '{{year}}', x: 1.5, y: 6.52, w: 2, h: 0.24, font: 'Cormorant Garamond', italic: true, weight: 600, size: 11, color: GOLD },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: CREAM,
      elements: [
        // A small pine sprig made from simple strokes.
        { type: 'line', x: 2.5, y: 0.95, points: [0, 0, 0, 0.75], stroke: PINE, strokeWidth: 1 },
        ...[0.12, 0.3, 0.48].flatMap((dy, i) => [
          { type: 'line' as const, x: 2.5, y: 0.95 + dy, points: [0, 0, -0.32 + i * 0.07, 0.2], stroke: PINE, strokeWidth: 1 },
          { type: 'line' as const, x: 2.5, y: 0.95 + dy, points: [0, 0, 0.32 - i * 0.07, 0.2], stroke: PINE, strokeWidth: 1 },
        ]),
        { type: 'star', x: 2.5, y: 0.86, points: 5, innerRadius: 0.035, outerRadius: 0.085, fill: GOLD },
        { type: 'text', text: '{{message}}', x: 0.6, y: 2.0, w: 3.8, h: 2.3, font: 'Cormorant Garamond', italic: true, size: 16, minSize: 9, color: '#3a3a34', lineHeight: 1.35 },
        { type: 'text', text: 'With love,', x: 0.6, y: 4.5, w: 3.8, h: 0.3, font: 'Cormorant Garamond', size: 13, color: '#3a3a34' },
        { type: 'text', text: '{{signature}}', x: 0.4, y: 4.8, w: 4.2, h: 0.7, font: 'Great Vibes', size: 28, minSize: 14, color: PINE },
        { type: 'text', text: 'Printed by Kemp & Sons', x: 1, y: 6.55, w: 3, h: 0.2, font: 'Montserrat', weight: 500, size: 5.5, letterSpacing: 0.2, uppercase: true, color: '#8a8577' },
      ],
    },
  ],
}
