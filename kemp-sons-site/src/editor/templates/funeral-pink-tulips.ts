import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, FUNERAL_FIELDS } from './funeral-shared'

/**
 * Pink Tulips: folded program, printed on an 11 x 8.5 in sheet.
 * Outside spread: back cover (left), front cover (right), on a soft tulip field
 * that fades to white at the top. Inside spread: obituary (left) and order of
 * service (right) on white with the tulips showing through very faintly.
 */

const ART = '/templates/pink-tulips/tulips.jpg'
const PINK = '#c8346f' // script name and accents
const ROSE = '#b0496f' // section headings
const INK = '#2a2226' // body copy
const SOFT = '#5d4a52'
const R = 5.5 // x of the right-hand panel
const SERIF = 'Cormorant Garamond' as const
const SCRIPT = 'Great Vibes' as const

const field: Element = { type: 'image', src: ART, x: -0.125, y: -0.125, w: 11.25, h: 8.75 }

/** A small centered ornament: two hairlines with a tiny diamond between. */
const ornament = (cx: number, y: number, half = 0.7): Element[] => [
  { type: 'line', x: cx - half, y, points: [0, 0, half - 0.12, 0], stroke: PINK, strokeWidth: 0.7, opacity: 0.75 },
  { type: 'line', x: cx + 0.12, y, points: [0, 0, half - 0.12, 0], stroke: PINK, strokeWidth: 0.7, opacity: 0.75 },
  { type: 'star', x: cx, y, points: 4, innerRadius: 0.025, outerRadius: 0.065, fill: PINK },
]

const scriptHeading = (text: string, x: number, y: number): Element => ({
  type: 'text', text, x, y, w: 4.5, h: 0.75, font: SCRIPT, size: 40, minSize: 24, color: INK, maxLines: 1,
})

export const funeralPinkTulips: Template = {
  id: 'funeral-pink-tulips',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-pink-tulips',
  name: 'Pink Tulips',
  description: 'A soft field of pink tulips fading to white, with a script name and a portrait on the cover.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '11 x 8.5 in sheet, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  fields: FUNERAL_FIELDS.map((f): Field =>
    f.type === 'photo'
      ? { ...f, removeBackground: true, hint: 'Drag the photo to reposition it. Turn on Remove background to set them right on the tulips.' }
      : f,
  ),
  thumbnailSide: 'outside',
  thumbnailCrop: { x: 5.5, y: 0, w: 5.5, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#ffffff',
      folds: [5.5],
      panels: ['Back cover', 'Front cover'],
      elements: [
        field,

        // Front cover
        { type: 'text', text: 'In Loving Memory', x: R + 0.5, y: 0.4, w: 4.5, h: 0.7, font: SCRIPT, size: 34, minSize: 20, color: INK, maxLines: 1 },
        ...ornament(R + 2.75, 1.2, 0.55),
        { type: 'text', text: '{{name}}', x: R + 0.4, y: 1.3, w: 4.7, h: 1.0, font: SCRIPT, size: 38, minSize: 18, color: PINK, maxLines: 2, lineHeight: 1.0 },
        { type: 'text', text: '{{birthDate}}  to  {{deathDate}}', x: R + 0.5, y: 2.3, w: 4.5, h: 0.32, font: SERIF, weight: 700, size: 13, minSize: 8, color: SOFT, letterSpacing: 0.02 },
        // Soft white border, dropped when the background is removed so the portrait blends into the tulips.
        { type: 'rect', x: R + 1.0, y: 2.76, w: 3.5, h: 3.54, fill: '#ffffff', opacity: 0.92, radius: 0.04, hideWhenCutout: 'photo' },
        { type: 'rect', x: R + 1.08, y: 2.84, w: 3.34, h: 3.38, stroke: PINK, strokeWidth: 0.5, opacity: 0.5, hideWhenCutout: 'photo' },
        { type: 'photo', field: 'photo', x: R + 1.12, y: 2.88, w: 3.26, h: 3.3 },
        { type: 'rect', x: R + 0.6, y: 6.5, w: 4.3, h: 1.55, fill: '#ffffff', opacity: 0.78, radius: 0.08 },
        { type: 'text', text: '{{serviceDate}}\n{{serviceTime}}', x: R + 0.7, y: 6.6, w: 4.1, h: 0.6, font: SERIF, weight: 700, size: 14.5, minSize: 9, color: INK, lineHeight: 1.15 },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: R + 0.7, y: 7.2, w: 4.1, h: 0.78, font: SERIF, weight: 600, size: 12.5, minSize: 8, color: INK, lineHeight: 1.15 },

        // Back cover: sections stack and close up when one is left blank
        {
          type: 'stack', x: 0.75, y: 0.45, w: 4.0, h: 5.85, gap: 0.22, headingGap: 0.02, valign: 'middle',
          heading: { font: SCRIPT, size: 24, color: ROSE, lineHeight: 1.05 },
          body: { font: SERIF, weight: 600, size: 13, color: INK, lineHeight: 1.2 },
          items: BACK_SECTIONS,
        },
        { type: 'rect', x: 0.6, y: 6.5, w: 4.3, h: 1.55, fill: '#ffffff', opacity: 0.78, radius: 0.08 },
        ...ornament(2.75, 6.68, 0.5),
        { type: 'text', text: 'Services entrusted to', x: 0.7, y: 6.78, w: 4.1, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: 0.7, y: 7.05, w: 4.1, h: 0.36, font: SERIF, weight: 700, size: 15, minSize: 9, color: INK },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.7, y: 7.41, w: 4.1, h: 0.56, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#ffffff',
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        // The tulip field, barely there, so the inside stays clean white.
        { ...field, opacity: 0.12 },

        // Inside left: obituary
        scriptHeading('Obituary', 0.5, 0.35),
        ...ornament(2.75, 1.17, 0.6),
        { type: 'text', text: '{{obituary}}', x: 0.6, y: 1.35, w: 4.3, h: 6.05, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.6, y: 7.5, w: 4.3, h: 0.45, font: SERIF, weight: 600, italic: true, size: 13.5, minSize: 9, color: ROSE, showIf: 'closingQuote' },

        // Inside right: order of service with dotted leaders
        scriptHeading('Order of Service', R + 0.5, 0.35),
        ...ornament(R + 2.75, 1.17, 0.6),
        { type: 'text', text: '{{orderOfService}}', x: R + 0.6, y: 1.4, w: 4.3, h: 4.75, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.5, leaders: true, valign: 'top' },
        ...ornament(R + 2.75, 6.35, 0.5),
        { type: 'text', text: 'Officiating', x: R + 0.6, y: 6.48, w: 4.3, h: 0.3, font: SERIF, weight: 600, italic: true, size: 12.5, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: R + 0.6, y: 6.76, w: 4.3, h: 0.36, font: SERIF, weight: 700, size: 15, minSize: 9, color: PINK, showIf: 'officiant' },
        { type: 'text', text: '{{location}}\n{{serviceDate}}, {{serviceTime}}', x: R + 0.6, y: 7.2, w: 4.3, h: 0.6, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.2 },
      ],
    },
  ],
}
