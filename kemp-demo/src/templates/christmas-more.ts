import type { Element, Template } from './types'
import { CARD_OPTIONS } from './shared'

/* ---------- Starlit Pines: 7 x 5 landscape, geometric pines under a starry sky ---------- */

const NAVY = '#1c2740'
const CREAM = '#f4ecdd'
const PINE = ['#2f5a4a', '#3f7360', '#24473b', '#4d8670']

function pine(x: number, base: number, w: number, h: number, color: string): Element[] {
  return [
    { type: 'rect', x: x - w * 0.06, y: base - h * 0.08, w: w * 0.12, h: h * 0.1, fill: '#5a4334' },
    { type: 'line', x, y: base - h, points: [0, 0, w / 2, h * 0.95, -w / 2, h * 0.95], closed: true, fill: color, stroke: color, strokeWidth: 0.5 },
  ]
}

const stars: Element[] = [
  [0.6, 0.5, 0.07], [1.5, 1.1, 0.05], [2.4, 0.35, 0.06], [4.7, 0.45, 0.05], [5.6, 1.0, 0.08], [6.4, 0.4, 0.05],
  [3.9, 1.35, 0.04], [0.9, 1.75, 0.04], [6.2, 1.8, 0.04], [3.1, 0.15, 0.04],
].map(([x, y, r]) => ({ type: 'star', x, y, points: 5, innerRadius: r * 0.45, outerRadius: r, fill: '#f3e3b5' }) as Element)

export const christmasStarlit: Template = {
  id: 'christmas-starlit-pines',
  category: 'christmas',
  name: 'Starlit Pines',
  description: 'Geometric evergreens under a starry navy sky, with a photo and note on the back.',
  trim: { w: 7, h: 5 },
  sizeLabel: '7 x 5 in flat card',
  safeMargin: 0.2,
  ...CARD_OPTIONS,
  fields: [
    { id: 'greeting', type: 'text', label: 'Greeting', default: 'Peace on Earth', section: 'Front' },
    { id: 'familyName', type: 'text', label: 'Family name', default: 'The Hayes Family', section: 'Front' },
    { id: 'photo', type: 'photo', label: 'Photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Back' },
    { id: 'message', type: 'textarea', label: 'Message', rows: 4, section: 'Back', default: 'May your home be filled with quiet nights, bright mornings, and good company all season long.' },
    { id: 'signature', type: 'text', label: 'Signed', default: 'Mike, Sarah, Ellie & Ben', section: 'Back' },
    { id: 'year', type: 'text', label: 'Year', default: '2026', section: 'Back' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Front',
      background: NAVY,
      elements: [
        ...stars,
        { type: 'text', text: '{{greeting}}', x: 0.5, y: 0.6, w: 6, h: 0.95, font: 'Playfair Display', italic: true, size: 40, minSize: 20, color: CREAM },
        { type: 'text', text: '{{familyName}}', x: 1, y: 1.6, w: 5, h: 0.3, font: 'Montserrat', weight: 600, size: 9, minSize: 6, uppercase: true, letterSpacing: 0.32, color: '#cbb98f' },
        { type: 'ellipse', x: 3.5, y: 5.35, rx: 4.6, ry: 1.0, fill: '#e9eef2' },
        ...pine(0.9, 4.55, 1.3, 2.1, PINE[0]),
        ...pine(1.9, 4.6, 1.0, 1.55, PINE[1]),
        ...pine(2.9, 4.5, 1.6, 2.6, PINE[2]),
        ...pine(4.1, 4.6, 1.1, 1.8, PINE[3]),
        ...pine(5.1, 4.5, 1.5, 2.4, PINE[0]),
        ...pine(6.2, 4.6, 1.1, 1.7, PINE[1]),
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: CREAM,
      elements: [
        { type: 'photo', field: 'photo', x: 0.45, y: 0.45, w: 3.0, h: 4.1, radius: 0.12, placeholder: '#d8d2c5' },
        { type: 'text', text: '{{message}}', x: 3.85, y: 0.7, w: 2.7, h: 2.3, font: 'Cormorant Garamond', italic: true, size: 15, minSize: 9, color: '#33352f', lineHeight: 1.3 },
        { type: 'text', text: '{{signature}}', x: 3.75, y: 3.15, w: 2.9, h: 0.7, font: 'Great Vibes', size: 24, minSize: 13, color: NAVY },
        { type: 'star', x: 5.2, y: 4.15, points: 5, innerRadius: 0.035, outerRadius: 0.08, fill: '#b99a5b' },
        { type: 'text', text: '{{year}}', x: 4.2, y: 4.3, w: 2, h: 0.25, font: 'Montserrat', weight: 600, size: 8, letterSpacing: 0.3, color: '#8a8577' },
      ],
    },
  ],
}

/* ---------- Joy: 5 x 7 portrait, bold type and a round photo ---------- */

const BERRY = '#a33b3b'

export const christmasJoy: Template = {
  id: 'christmas-joy',
  category: 'christmas',
  name: 'Simply Joy',
  description: 'Clean and modern. A big, bold "Joy", a round family photo, and a berry red back.',
  trim: { w: 5, h: 7 },
  sizeLabel: '5 x 7 in flat card',
  safeMargin: 0.2,
  ...CARD_OPTIONS,
  fields: [
    { id: 'greeting', type: 'text', label: 'Big word', default: 'Joy', section: 'Front' },
    { id: 'photo', type: 'photo', label: 'Family photo', hint: 'Drag the photo on the preview to reposition it.', section: 'Front' },
    { id: 'familyName', type: 'text', label: 'Family name', default: 'The Hayes Family', section: 'Front' },
    { id: 'year', type: 'text', label: 'Year', default: 'Christmas 2026', section: 'Front' },
    { id: 'message', type: 'textarea', label: 'Message', rows: 4, section: 'Back', default: 'Wishing you a season of warm hearts, full tables, and little moments of joy.' },
    { id: 'signature', type: 'text', label: 'Signed', default: 'Love, the Hayes Family', section: 'Back' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Front',
      background: '#fbfaf7',
      elements: [
        { type: 'text', text: '{{greeting}}', x: 0.3, y: 0.35, w: 4.4, h: 1.75, font: 'Playfair Display', weight: 700, size: 112, minSize: 40, color: BERRY, lineHeight: 1 },
        { type: 'photo', field: 'photo', x: 0.95, y: 2.3, w: 3.1, h: 3.1, shape: 'ellipse', placeholder: '#e3ddd3' },
        { type: 'ellipse', x: 2.5, y: 3.85, rx: 1.65, ry: 1.65, stroke: BERRY, strokeWidth: 0.6 },
        { type: 'text', text: '{{familyName}}', x: 0.5, y: 5.75, w: 4, h: 0.32, font: 'Montserrat', weight: 600, size: 10, minSize: 6, uppercase: true, letterSpacing: 0.3, color: '#2b2a28' },
        { type: 'text', text: '{{year}}', x: 0.5, y: 6.1, w: 4, h: 0.3, font: 'Cormorant Garamond', italic: true, weight: 600, size: 13, color: BERRY },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: BERRY,
      elements: [
        { type: 'star', x: 2.5, y: 1.2, points: 5, innerRadius: 0.07, outerRadius: 0.16, fill: '#f4e3c3' },
        { type: 'text', text: '{{message}}', x: 0.6, y: 1.8, w: 3.8, h: 2.4, font: 'Cormorant Garamond', italic: true, size: 17, minSize: 10, color: '#ffffff', lineHeight: 1.35 },
        { type: 'text', text: '{{signature}}', x: 0.4, y: 4.5, w: 4.2, h: 0.75, font: 'Great Vibes', size: 28, minSize: 14, color: '#f4e3c3' },
        { type: 'text', text: 'Printed by Kemp & Sons', x: 1, y: 6.55, w: 3, h: 0.2, font: 'Montserrat', weight: 500, size: 5.5, letterSpacing: 0.2, uppercase: true, color: '#e8c7c7' },
      ],
    },
  ],
}
