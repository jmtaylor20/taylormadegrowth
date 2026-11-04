import type { Element, Template } from './types'
import { BACK_SECTIONS, FUNERAL_FIELDS, FUNERAL_OPTIONS } from './shared'

/**
 * Folded 8.5 x 11 program, printed on an 11 x 8.5 sheet.
 * Outside spread: back cover (left), front cover (right).
 * Inside spread: obituary (left), order of service (right).
 */

const IVORY = '#f6f1e7'
const GOLD = '#ae9265'
const BROWN = '#6f5733'
const INK = '#26221d'
const SOFT = '#4a433a'
const R = 5.5 // x of the right-hand panel

const panelBorder = (x0: number): Element[] => [
  { type: 'rect', x: x0 + 0.3, y: 0.3, w: 4.9, h: 7.9, stroke: GOLD, strokeWidth: 0.9 },
  { type: 'rect', x: x0 + 0.38, y: 0.38, w: 4.74, h: 7.74, stroke: GOLD, strokeWidth: 0.35 },
]

const label = (text: string, x: number, y: number): Element => ({
  type: 'text', text, x, y, w: 3.9, h: 0.3, font: 'Cormorant Garamond', weight: 600, italic: true, size: 14, color: BROWN,
})

export const funeralClassic: Template = {
  id: 'funeral-classic-ivory',
  category: 'funeral',
  name: 'Classic Ivory',
  description: 'A timeless ivory program with a fine double border and an oval portrait.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '8.5 x 11 in, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  ...FUNERAL_OPTIONS,
  fields: FUNERAL_FIELDS,
  thumbnailSide: 'outside',
  thumbnailCrop: { x: 5.5, y: 0, w: 5.5, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: IVORY,
      folds: [5.5],
      panels: ['Back cover', 'Front cover'],
      elements: [
        ...panelBorder(0),
        ...panelBorder(R),

        // Front cover
        { type: 'text', text: 'In Loving Memory', x: R + 0.6, y: 0.6, w: 4.3, h: 0.7, font: 'Great Vibes', size: 34, color: BROWN },
        { type: 'photo', field: 'photo', x: R + 1.35, y: 1.38, w: 2.8, h: 3.45, shape: 'ellipse', stroke: GOLD, strokeWidth: 1.6 },
        { type: 'ellipse', x: R + 2.75, y: 3.105, rx: 1.51, ry: 1.835, stroke: GOLD, strokeWidth: 0.4 },
        { type: 'text', text: '{{name}}', x: R + 0.6, y: 5.05, w: 4.3, h: 0.95, font: 'Cormorant Garamond', weight: 700, size: 27, minSize: 14, uppercase: true, letterSpacing: 0.04, lineHeight: 1.02, color: INK },
        { type: 'text', text: 'Sunrise {{birthDate}}\nSunset {{deathDate}}', x: R + 0.7, y: 6.0, w: 4.1, h: 0.62, font: 'Cormorant Garamond', weight: 600, italic: true, size: 15, minSize: 9, color: SOFT, lineHeight: 1.12 },
        { type: 'line', x: R + 2.25, y: 6.74, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        { type: 'text', text: '{{serviceDate}}\n{{serviceTime}}  ·  {{location}}', x: R + 0.6, y: 6.86, w: 4.3, h: 0.62, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK, lineHeight: 1.18 },
        { type: 'text', text: '{{officiant}}, Officiating', x: R + 0.6, y: 7.5, w: 4.3, h: 0.32, font: 'Cormorant Garamond', weight: 600, italic: true, size: 13, minSize: 8, color: SOFT, showIf: 'officiant' },

        // Back cover: sections stack and close up when one is left blank
        {
          type: 'stack', x: 0.75, y: 0.65, w: 4.0, h: 5.75, gap: 0.24, headingGap: 0.04, valign: 'middle',
          heading: { font: 'Great Vibes', size: 24, color: BROWN, lineHeight: 1.1 },
          body: { font: 'Cormorant Garamond', weight: 700, size: 14, color: INK, lineHeight: 1.2 },
          items: BACK_SECTIONS,
        },
        { type: 'line', x: 2.25, y: 6.6, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        { type: 'text', text: 'Services entrusted to', x: 0.8, y: 6.72, w: 3.9, h: 0.28, font: 'Cormorant Garamond', weight: 600, italic: true, size: 12, color: BROWN },
        { type: 'text', text: '{{funeralHome}}', x: 0.8, y: 6.98, w: 3.9, h: 0.32, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.8, y: 7.3, w: 3.9, h: 0.5, font: 'Cormorant Garamond', weight: 600, size: 11.5, minSize: 7, color: SOFT, lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: IVORY,
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        ...panelBorder(0),
        ...panelBorder(R),

        // Inside left: obituary
        { type: 'text', text: 'Remembering {{firstName}}', x: 0.7, y: 0.6, w: 4.1, h: 0.62, font: 'Great Vibes', size: 30, minSize: 18, color: BROWN },
        { type: 'text', text: '{{obituary}}', x: 0.72, y: 1.32, w: 4.06, h: 5.95, font: 'Cormorant Garamond', weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.7, y: 7.35, w: 4.1, h: 0.45, font: 'Cormorant Garamond', weight: 700, italic: true, size: 14, minSize: 9, color: BROWN, showIf: 'closingQuote' },

        // Inside right: order of service with dotted leaders
        { type: 'text', text: 'Order of Service', x: R + 0.6, y: 0.6, w: 4.3, h: 0.62, font: 'Great Vibes', size: 30, color: BROWN },
        { type: 'text', text: '{{orderOfService}}', x: R + 0.7, y: 1.4, w: 4.1, h: 4.35, font: 'Cormorant Garamond', weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.45, leaders: true, valign: 'top' },
        { type: 'line', x: R + 2.25, y: 6.0, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        label('Service Location', R + 0.8, 6.15),
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: R + 0.7, y: 6.45, w: 4.1, h: 0.72, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK, lineHeight: 1.15 },
        { type: 'text', text: '{{serviceDate}} at {{serviceTime}}', x: R + 0.7, y: 7.25, w: 4.1, h: 0.4, font: 'Cormorant Garamond', weight: 600, italic: true, size: 13, minSize: 8, color: SOFT },
      ],
    },
  ],
}
