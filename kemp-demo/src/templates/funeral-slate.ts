import type { Element, Template } from './types'
import { BACK_SECTIONS, FUNERAL_FIELDS, FUNERAL_OPTIONS } from './shared'

/** Evening Slate: a deep slate cover with an arched portrait and quiet gold accents. */

const SLATE = '#2e3a46'
const STONE = '#f3f1ec'
const GOLD = '#c9a96a'
const INK = '#24282d'
const R = 5.5

const band = (x: number, title: string): Element[] => [
  { type: 'rect', x: x === 0 ? -0.125 : R, y: -0.125, w: 5.625, h: 1.5, fill: SLATE },
  { type: 'rect', x: x === 0 ? -0.125 : R, y: 1.375, w: 5.625, h: 0.04, fill: GOLD },
  { type: 'text', text: title, x: x + 0.5, y: 0.42, w: 4.5, h: 0.6, font: 'Cormorant Garamond', weight: 600, size: 22, minSize: 12, uppercase: true, letterSpacing: 0.16, color: '#ffffff' },
]

const small = (text: string, x: number, y: number, color = SLATE): Element => ({
  type: 'text', text, x, y, w: 4.5, h: 0.26, font: 'Montserrat', weight: 600, size: 8, uppercase: true, letterSpacing: 0.25, color,
})

export const funeralSlate: Template = {
  id: 'funeral-evening-slate',
  category: 'funeral',
  name: 'Evening Slate',
  description: 'A deep slate cover, arched portrait and quiet gold details. Modern and dignified.',
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
      background: STONE,
      folds: [5.5],
      panels: ['Back cover', 'Front cover'],
      elements: [
        // Front cover
        { type: 'rect', x: R, y: -0.125, w: 5.625, h: 8.75, fill: SLATE },
        small('In Loving Memory', R + 0.5, 0.62, GOLD),
        { type: 'photo', field: 'photo', x: R + 1.2, y: 1.05, w: 3.1, h: 3.85, shape: 'arch', stroke: GOLD, strokeWidth: 1.6, placeholder: '#56636f' },
        { type: 'text', text: '{{name}}', x: R + 0.45, y: 5.12, w: 4.6, h: 1.0, font: 'Cormorant Garamond', weight: 600, size: 30, minSize: 15, uppercase: true, letterSpacing: 0.05, lineHeight: 1.02, color: '#ffffff' },
        { type: 'text', text: '{{birthDate}}  ·  {{deathDate}}', x: R + 0.45, y: 6.18, w: 4.6, h: 0.38, font: 'Cormorant Garamond', weight: 500, italic: true, size: 15, minSize: 9, color: '#dcd6c8' },
        { type: 'line', x: R + 2.35, y: 6.7, points: [0, 0, 0.8, 0], stroke: GOLD, strokeWidth: 0.8 },
        { type: 'text', text: '{{serviceDate}}\n{{serviceTime}}\n{{location}}', x: R + 0.45, y: 6.85, w: 4.6, h: 1.0, font: 'Montserrat', weight: 500, size: 10, minSize: 6.5, color: '#ffffff', lineHeight: 1.5 },

        // Back cover
        {
          type: 'stack', x: 0.75, y: 0.7, w: 4.0, h: 5.6, gap: 0.3, headingGap: 0.06, valign: 'middle',
          heading: { font: 'Montserrat', weight: 600, size: 8.5, uppercase: true, letterSpacing: 0.25, color: SLATE },
          body: { font: 'Cormorant Garamond', weight: 600, size: 14.5, color: INK, lineHeight: 1.2 },
          items: BACK_SECTIONS,
        },
        { type: 'line', x: 2.35, y: 6.55, points: [0, 0, 0.8, 0], stroke: GOLD, strokeWidth: 0.8 },
        small('Services entrusted to', 0.5, 6.7),
        { type: 'text', text: '{{funeralHome}}', x: 0.5, y: 6.98, w: 4.5, h: 0.32, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.5, y: 7.3, w: 4.5, h: 0.5, font: 'Cormorant Garamond', weight: 600, size: 12, minSize: 7, color: '#4e545a', lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: STONE,
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        ...band(0, 'Life Story'),
        { type: 'text', text: '{{obituary}}', x: 0.6, y: 1.7, w: 4.3, h: 5.6, font: 'Cormorant Garamond', weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.6, y: 7.4, w: 4.3, h: 0.42, font: 'Cormorant Garamond', weight: 600, italic: true, size: 14, minSize: 9, color: SLATE, showIf: 'closingQuote' },

        ...band(R, 'Order of Service'),
        { type: 'text', text: '{{orderOfService}}', x: R + 0.6, y: 1.75, w: 4.3, h: 4.0, font: 'Cormorant Garamond', weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.45, leaders: true, valign: 'top' },
        { type: 'line', x: R + 2.35, y: 6.0, points: [0, 0, 0.8, 0], stroke: GOLD, strokeWidth: 0.8 },
        small('Officiating', R + 0.5, 6.15),
        { type: 'text', text: '{{officiant}}', x: R + 0.5, y: 6.4, w: 4.5, h: 0.34, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK },
        small('Service Location', R + 0.5, 6.85),
        { type: 'text', text: '{{location}}, {{locationAddress}}', x: R + 0.5, y: 7.1, w: 4.5, h: 0.65, font: 'Cormorant Garamond', weight: 700, size: 13.5, minSize: 8, color: INK, lineHeight: 1.15 },
      ],
    },
  ],
}
