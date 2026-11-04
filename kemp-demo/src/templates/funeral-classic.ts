import type { Template } from './types'
import { FUNERAL_FIELDS, FUNERAL_OPTIONS } from './shared'

/**
 * Folded 8.5 x 11 program, printed on an 11 x 8.5 sheet.
 * Outside spread: back cover (left), front cover (right).
 * Inside spread: obituary (left), order of service (right).
 */

const IVORY = '#f6f1e7'
const GOLD = '#ae9265'
const INK = '#2e2a24'
const SOFT = '#5d554a'
const R = 5.5 // x of the right-hand panel

const panelBorder = (x0: number) =>
  [
    { type: 'rect', x: x0 + 0.32, y: 0.32, w: 4.86, h: 7.86, stroke: GOLD, strokeWidth: 0.9 },
    { type: 'rect', x: x0 + 0.4, y: 0.4, w: 4.7, h: 7.7, stroke: GOLD, strokeWidth: 0.35 },
  ] as const

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
        { type: 'text', text: 'In Loving Memory', x: R + 0.6, y: 0.66, w: 4.3, h: 0.62, font: 'Great Vibes', size: 30, color: '#7a6440' },
        { type: 'photo', field: 'photo', x: R + 1.3, y: 1.42, w: 2.9, h: 3.6, shape: 'ellipse', stroke: GOLD, strokeWidth: 1.6 },
        { type: 'ellipse', x: R + 2.75, y: 3.22, rx: 1.56, ry: 1.91, stroke: GOLD, strokeWidth: 0.4 },
        { type: 'text', text: '{{name}}', x: R + 0.65, y: 5.3, w: 4.2, h: 0.9, font: 'Cormorant Garamond', weight: 600, size: 25, minSize: 13, uppercase: true, letterSpacing: 0.06, lineHeight: 1.05, color: INK },
        { type: 'text', text: '{{birthDate}}\n{{deathDate}}', x: R + 0.8, y: 6.2, w: 3.9, h: 0.55, font: 'Cormorant Garamond', italic: true, size: 13, color: SOFT, lineHeight: 1.15 },
        { type: 'line', x: R + 2.25, y: 6.92, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        { type: 'text', text: 'A Celebration of Life', x: R + 0.8, y: 7.02, w: 3.9, h: 0.22, font: 'Montserrat', weight: 500, size: 7, uppercase: true, letterSpacing: 0.24, color: '#7a6440' },
        { type: 'text', text: '{{serviceDate}} at {{serviceTime}}\n{{location}}', x: R + 0.7, y: 7.26, w: 4.1, h: 0.56, font: 'Cormorant Garamond', weight: 500, size: 12, color: INK, lineHeight: 1.18 },

        // Back cover
        { type: 'text', text: 'With Gratitude', x: 0.8, y: 0.85, w: 3.9, h: 0.6, font: 'Great Vibes', size: 26, color: '#7a6440' },
        { type: 'text', text: '{{familyMessage}}', x: 0.85, y: 1.6, w: 3.8, h: 2.25, font: 'Cormorant Garamond', italic: true, size: 13, minSize: 8, color: SOFT, lineHeight: 1.35 },
        { type: 'line', x: 2.25, y: 4.15, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        { type: 'text', text: 'Pallbearers', x: 0.8, y: 4.4, w: 3.9, h: 0.24, font: 'Montserrat', weight: 500, size: 7, uppercase: true, letterSpacing: 0.24, color: '#7a6440' },
        { type: 'text', text: '{{pallbearers}}', x: 0.85, y: 4.7, w: 3.8, h: 1.2, font: 'Cormorant Garamond', weight: 500, size: 12, minSize: 8, color: INK, lineHeight: 1.25 },
        { type: 'text', text: 'Interment', x: 0.8, y: 6.15, w: 3.9, h: 0.24, font: 'Montserrat', weight: 500, size: 7, uppercase: true, letterSpacing: 0.24, color: '#7a6440' },
        { type: 'text', text: '{{interment}}', x: 0.85, y: 6.42, w: 3.8, h: 0.5, font: 'Cormorant Garamond', weight: 500, size: 12, minSize: 8, color: INK, lineHeight: 1.2 },
        { type: 'text', text: 'Arrangements entrusted to {{funeralHome}}', x: 0.8, y: 7.55, w: 3.9, h: 0.3, font: 'Montserrat', weight: 500, size: 6.5, minSize: 5, letterSpacing: 0.08, color: SOFT },
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
        { type: 'text', text: 'Remembering {{firstName}}', x: 0.8, y: 0.72, w: 3.9, h: 0.42, font: 'Cormorant Garamond', weight: 600, size: 16, minSize: 10, uppercase: true, letterSpacing: 0.14, color: INK },
        { type: 'line', x: 2.25, y: 1.24, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        { type: 'text', text: '{{obituary}}', x: 0.78, y: 1.42, w: 3.94, h: 6.3, font: 'Cormorant Garamond', size: 12, minSize: 7.5, color: INK, lineHeight: 1.36, align: 'left', valign: 'top' },

        // Inside right: order of service
        { type: 'text', text: 'Order of Service', x: R + 0.8, y: 0.72, w: 3.9, h: 0.42, font: 'Cormorant Garamond', weight: 600, size: 16, uppercase: true, letterSpacing: 0.14, color: INK },
        { type: 'line', x: R + 2.25, y: 1.24, points: [0, 0, 1, 0], stroke: GOLD, strokeWidth: 0.75 },
        { type: 'text', text: '{{orderOfService}}', x: R + 0.8, y: 1.45, w: 3.9, h: 3.95, font: 'Cormorant Garamond', weight: 500, size: 13, minSize: 8, color: INK, lineHeight: 1.5 },
        { type: 'text', text: 'Officiating', x: R + 0.8, y: 5.6, w: 3.9, h: 0.24, font: 'Montserrat', weight: 500, size: 7, uppercase: true, letterSpacing: 0.24, color: '#7a6440' },
        { type: 'text', text: '{{officiant}}', x: R + 0.8, y: 5.86, w: 3.9, h: 0.32, font: 'Cormorant Garamond', weight: 500, size: 13, minSize: 8, color: INK },
        { type: 'text', text: 'Service Location', x: R + 0.8, y: 6.4, w: 3.9, h: 0.24, font: 'Montserrat', weight: 500, size: 7, uppercase: true, letterSpacing: 0.24, color: '#7a6440' },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: R + 0.8, y: 6.66, w: 3.9, h: 0.6, font: 'Cormorant Garamond', weight: 500, size: 13, minSize: 8, color: INK, lineHeight: 1.2 },
        { type: 'text', text: '{{serviceDate}} at {{serviceTime}}', x: R + 0.8, y: 7.3, w: 3.9, h: 0.3, font: 'Cormorant Garamond', italic: true, size: 12, minSize: 8, color: SOFT },
      ],
    },
  ],
}
