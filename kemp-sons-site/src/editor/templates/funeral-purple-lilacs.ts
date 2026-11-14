import type { Element, Template } from '../types'
import { BACK_SECTIONS, withFields } from './funeral-shared'

/**
 * Purple Lilacs: single-fold program, printed on a 17 x 11 in sheet that
 * folds to 8.5 x 11 in.
 * Outside spread: lilac photograph across both covers, each cover holding a
 * translucent white rounded panel with a thin purple border.
 * Inside spread (white): obituary with a 2 x 4 photo grid (left), order of
 * service with dotted leaders (right).
 */

const LILACS = '/templates/purple-lilacs/lilacs.jpg'
const PURPLE = '#6b4c9a' // script, headings and outlines, drawn from the lilacs
const DEEP = '#4a3270'
const INK = '#2b2533' // body copy
const SOFT = '#5d5368'
const R = 8.5 // x of the right-hand panel
const SERIF = 'Cormorant Garamond' as const
const SCRIPT = 'Great Vibes' as const

const lilacs: Element = { type: 'image', src: LILACS, x: -0.125, y: -0.125, w: 17.25, h: 11.25 }

/** Translucent rounded panel with a thin purple border, inset from the cover edges. */
const coverPanel = (x: number, opacity: number): Element[] => [
  { type: 'rect', x, y: 0.55, w: 7.4, h: 9.9, radius: 0.32, fill: '#ffffff', opacity },
  { type: 'rect', x, y: 0.55, w: 7.4, h: 9.9, radius: 0.32, stroke: PURPLE, strokeWidth: 1.5 },
]

/** Short purple rule used between blocks. */
const rule = (cx: number, y: number, w = 1.6): Element => ({
  type: 'line', x: cx - w / 2, y, points: [0, 0, w, 0], stroke: PURPLE, strokeWidth: 0.9, opacity: 0.75,
})

/** Small diamond ornament with lines either side. */
const ornament = (cx: number, y: number): Element[] => [
  { type: 'line', x: cx - 1.15, y, points: [0, 0, 0.95, 0], stroke: PURPLE, strokeWidth: 0.8, opacity: 0.8 },
  { type: 'line', x: cx + 0.2, y, points: [0, 0, 0.95, 0], stroke: PURPLE, strokeWidth: 0.8, opacity: 0.8 },
  { type: 'line', x: cx, y, points: [-0.08, 0, 0, -0.08, 0.08, 0, 0, 0.08], closed: true, fill: PURPLE, stroke: PURPLE, strokeWidth: 0.5 },
]

// Inside photo grid: 2 columns x 4 rows beside the obituary.
const GRID_X = 4.85
const GRID_Y = 0.6
const CELL_W = 1.6
const CELL_H = 2.36
const GAP = 0.1
const grid: Element[] = Array.from({ length: 8 }, (_, i) => ({
  type: 'photo' as const,
  field: `collage_${i + 1}`,
  x: GRID_X + (i % 2) * (CELL_W + GAP),
  y: GRID_Y + Math.floor(i / 2) * (CELL_H + GAP),
  w: CELL_W,
  h: CELL_H,
}))

export const funeralPurpleLilacs: Template = {
  id: 'funeral-purple-lilacs',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-purple-lilacs',
  name: 'Purple Lilacs',
  description: 'Lilac blossoms behind soft white panels, an oval portrait, a script name and an eight photo collage inside.',
  trim: { w: 17, h: 11 },
  sizeLabel: '17 x 11 in sheet, folds to 8.5 x 11 in',
  safeMargin: 0.25,
  fields: withFields('name', [
    { id: 'coverLead', type: 'text', label: 'Heading above the portrait', default: 'A Service of Love', section: 'Front cover' },
  ]).flatMap((f) =>
    f.id === 'closingQuote'
      ? [
          f,
          {
            id: 'collage',
            type: 'photo' as const,
            label: 'Photo collage',
            count: 8,
            hint: 'Eight photos in a grid beside the obituary. Empty spots show as gray.',
            section: 'Inside',
          },
        ]
      : [f],
  ),
  thumbnailSide: 'outside',
  thumbnailCrop: { x: 8.5, y: 0, w: 8.5, h: 11 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#e9e4ef',
      folds: [R],
      panels: ['Back cover', 'Front cover'],
      elements: [
        lilacs,
        ...coverPanel(0.55, 0.74),
        ...coverPanel(R + 0.55, 0.8),

        // Front cover
        { type: 'text', text: '{{coverLead}}', x: R + 0.9, y: 0.85, w: 6.7, h: 0.85, font: SCRIPT, size: 44, minSize: 22, color: PURPLE, maxLines: 1 },
        rule(R + 4.25, 1.78, 2.2),
        { type: 'ellipse', x: R + 4.25, y: 4.32, rx: 2.17, ry: 2.42, stroke: PURPLE, strokeWidth: 0.8, opacity: 0.7 },
        { type: 'photo', field: 'photo', shape: 'ellipse', x: R + 2.15, y: 1.97, w: 4.2, h: 4.7, stroke: PURPLE, strokeWidth: 2.5 },
        { type: 'text', text: '{{name}}', x: R + 0.85, y: 6.92, w: 6.8, h: 1.25, font: SCRIPT, size: 48, minSize: 22, color: PURPLE, maxLines: 2, lineHeight: 1.0 },
        { type: 'text', text: '{{birthDate}}  to  {{deathDate}}', x: R + 0.9, y: 8.2, w: 6.7, h: 0.4, font: SERIF, weight: 700, size: 17, minSize: 10, color: DEEP, letterSpacing: 0.02 },
        ...ornament(R + 4.25, 8.78),
        { type: 'text', text: '{{serviceDate}}  |  {{serviceTime}}', x: R + 0.9, y: 8.95, w: 6.7, h: 0.38, font: SERIF, weight: 700, size: 16, minSize: 9, color: INK },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: R + 0.9, y: 9.33, w: 6.7, h: 0.95, font: SERIF, weight: 600, size: 15, minSize: 8, color: INK, lineHeight: 1.15 },

        // Back cover: sections stack and close up when one is left blank
        {
          type: 'stack', x: 1.05, y: 0.95, w: 6.4, h: 7.45, gap: 0.3, headingGap: 0.04, valign: 'middle',
          heading: { font: SCRIPT, size: 30, color: PURPLE, lineHeight: 1.05 },
          body: { font: SERIF, weight: 600, size: 16, color: INK, lineHeight: 1.22 },
          items: BACK_SECTIONS,
        },
        rule(4.25, 8.68, 1.6),
        { type: 'text', text: 'Services entrusted to', x: 1.05, y: 8.8, w: 6.4, h: 0.32, font: SERIF, weight: 600, italic: true, size: 14, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: 1.05, y: 9.1, w: 6.4, h: 0.42, font: SERIF, weight: 700, size: 18, minSize: 10, color: DEEP },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 1.05, y: 9.52, w: 6.4, h: 0.65, font: SERIF, weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#ffffff',
      folds: [R],
      panels: ['Inside left', 'Inside right'],
      elements: [
        // Inside left: obituary with the photo grid along its right side
        { type: 'text', text: 'Obituary', x: 0.6, y: 0.55, w: 4.0, h: 0.85, font: SCRIPT, size: 46, minSize: 26, color: PURPLE, align: 'left', maxLines: 1 },
        { type: 'text', text: '{{name}}', x: 0.62, y: 1.4, w: 4.0, h: 0.36, font: SERIF, weight: 700, size: 14, minSize: 8, color: DEEP, align: 'left', uppercase: true, letterSpacing: 0.06, maxLines: 1 },
        { type: 'line', x: 0.62, y: 1.86, points: [0, 0, 1.4, 0], stroke: PURPLE, strokeWidth: 0.9, opacity: 0.75 },
        { type: 'text', text: '{{obituary}}', x: 0.6, y: 2.05, w: 4.0, h: 7.45, font: SERIF, weight: 600, size: 16, minSize: 8, color: INK, lineHeight: 1.32, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.6, y: 9.6, w: 4.0, h: 0.75, font: SERIF, weight: 600, italic: true, size: 15, minSize: 9, color: PURPLE, align: 'left', valign: 'bottom', showIf: 'closingQuote' },
        ...grid,

        // Inside right: order of service with dotted leaders
        { type: 'text', text: 'Order of Service', x: R + 0.8, y: 0.7, w: 6.9, h: 1.0, font: SCRIPT, size: 52, minSize: 28, color: PURPLE, maxLines: 1 },
        ...ornament(R + 4.25, 1.9),
        { type: 'text', text: '{{orderOfService}}', x: R + 0.85, y: 2.3, w: 6.8, h: 5.9, font: SERIF, weight: 600, size: 19, minSize: 9, color: INK, lineHeight: 1.7, leaders: true, valign: 'top' },
        rule(R + 4.25, 8.5, 1.6),
        { type: 'text', text: 'Officiating', x: R + 0.85, y: 8.65, w: 6.8, h: 0.34, font: SERIF, weight: 600, italic: true, size: 15, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: R + 0.85, y: 8.98, w: 6.8, h: 0.42, font: SERIF, weight: 700, size: 18, minSize: 10, color: DEEP, showIf: 'officiant' },
        { type: 'text', text: '{{location}}\n{{serviceDate}}, {{serviceTime}}', x: R + 0.85, y: 9.5, w: 6.8, h: 0.72, font: SERIF, weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.2 },
      ],
    },
  ],
}
