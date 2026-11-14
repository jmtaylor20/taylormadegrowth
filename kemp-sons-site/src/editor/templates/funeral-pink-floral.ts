import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, withFields } from './funeral-shared'

/**
 * Pink Floral: folded program, printed on an 11 x 8.5 in sheet.
 * Outside spread: back cover (left), front cover (right).
 * Inside spread: obituary (left), photo collage (right).
 * Soft pink roses run full bleed on both sides; the busy left half carries
 * translucent white panels so the text stays readable.
 */

const ART = '/templates/pink-floral/floral.jpg'
const PINK = '#c4567f' // script name, nickname, headings
const DEEP = '#a63a63' // last name in capitals
const INK = '#4a2a37' // body copy
const SOFT = '#7a4a5d'
const R = 5.5 // x of the right-hand panel
const SERIF = 'Cormorant Garamond' as const
const HEAD = 'Playfair Display' as const
const SANS = 'Montserrat' as const

const art: Element = { type: 'image', src: ART, x: -0.125, y: -0.125, w: 11.25, h: 8.75 }

/** Translucent white panel that keeps text readable over the flowers. */
const veil = (x: number, y: number, w: number, h: number, opacity = 0.74): Element => ({
  type: 'rect', x, y, w, h, fill: '#ffffff', opacity, radius: 0.06,
})

const heading = (text: string, x: number, y: number, w = 4.3): Element => ({
  type: 'text', text, x, y, w, h: 0.5, font: HEAD, weight: 400, italic: true, size: 24, minSize: 14, color: PINK,
})

const flourish = (cx: number, y: number): Element => ({
  type: 'line', x: cx - 0.55, y, points: [0, 0, 1.1, 0], stroke: PINK, strokeWidth: 0.75, opacity: 0.7,
})

const SNAP = { stroke: '#ffffff', strokeWidth: 3 }

export const funeralPinkFloral: Template = {
  id: 'funeral-pink-floral',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-pink-floral',
  name: 'Pink Floral',
  description: 'Soft pink roses with a script name, a large cut-out portrait on the cover and a photo collage inside.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '11 x 8.5 in sheet, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  fields: withFields('name', [
    { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' },
    { id: 'givenNames', type: 'text', label: 'First and middle names (script)', default: 'Margaret Ellen', hint: 'Shown in script on the front cover.', section: 'Front cover' },
    { id: 'lastName', type: 'text', label: 'Last name (capitals)', default: 'Hayes', hint: 'Shown in large capitals under the script name.', section: 'Front cover' },
    { id: 'nickname', type: 'text', label: 'Nickname', default: 'Peggy', hint: 'Shown in script beside the portrait. Leave blank to hide it.', section: 'Front cover' },
  ])
    .map((f): Field =>
      f.type === 'photo'
        ? { ...f, removeBackground: true, hint: 'Drag the photo to reposition it. Turn on Remove background to stand them right on the flowers.' }
        : f,
    )
    .concat([
      {
        id: 'collage', type: 'photo', label: 'Memory photos', count: 6, section: 'Inside',
        hint: 'Six snapshots for the inside right panel. Photo 6 is the large one along the bottom, ideal for a group photo.',
      },
    ]),
  thumbnailSide: 'outside',
  thumbnailCrop: { x: 5.5, y: 0, w: 5.5, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#f6dbe6',
      folds: [5.5],
      panels: ['Back cover', 'Front cover'],
      elements: [
        art,

        // Front cover
        { type: 'text', text: '{{coverLead}}', x: R + 0.45, y: 0.42, w: 4.6, h: 0.32, font: SANS, weight: 500, size: 10.5, minSize: 7, uppercase: true, letterSpacing: 0.22, color: SOFT },
        { type: 'text', text: '{{givenNames}}', x: R + 0.35, y: 0.72, w: 4.8, h: 0.85, font: 'Great Vibes', size: 46, minSize: 22, color: PINK, maxLines: 1 },
        { type: 'text', text: '{{lastName}}', x: R + 0.35, y: 1.5, w: 4.8, h: 0.68, font: HEAD, weight: 700, size: 42, minSize: 20, uppercase: true, letterSpacing: 0.06, color: DEEP, maxLines: 1, showIf: 'lastName' },
        { type: 'text', text: '{{birthDate}}   |   {{deathDate}}', x: R + 0.45, y: 2.2, w: 4.6, h: 0.3, font: SERIF, weight: 700, size: 13, minSize: 8, color: SOFT },
        // White border, dropped when the background is removed so the portrait stands on the flowers.
        { type: 'rect', x: R + 0.27, y: 2.57, w: 3.41, h: 4.08, fill: '#ffffff', hideWhenCutout: 'photo' },
        { type: 'photo', field: 'photo', x: R + 0.35, y: 2.65, w: 3.25, h: 3.92 },
        { type: 'text', text: '"{{nickname}}"', x: R + 3.68, y: 3.5, w: 1.57, h: 0.75, font: 'Great Vibes', size: 32, minSize: 16, color: PINK, maxLines: 1, showIf: 'nickname' },
        veil(R + 0.35, 6.78, 4.8, 1.4, 0.8),
        { type: 'text', text: '{{serviceDate}}  |  {{serviceTime}}', x: R + 0.5, y: 6.9, w: 4.5, h: 0.4, font: SERIF, weight: 700, size: 15, minSize: 9, color: INK, maxLines: 1 },
        { type: 'text', text: '{{location}}', x: R + 0.5, y: 7.3, w: 4.5, h: 0.34, font: SERIF, weight: 700, size: 13.5, minSize: 8, color: DEEP, maxLines: 1 },
        { type: 'text', text: '{{locationAddress}}', x: R + 0.5, y: 7.62, w: 4.5, h: 0.48, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.12 },

        // Back cover: washed out with a white veil, sections close up when blank
        veil(0.3, 0.3, 4.9, 7.9, 0.72),
        { type: 'text', text: 'In Loving Memory', x: 0.6, y: 0.48, w: 4.3, h: 0.32, font: SANS, weight: 500, size: 10, minSize: 7, uppercase: true, letterSpacing: 0.22, color: SOFT },
        { type: 'text', text: '{{name}}', x: 0.6, y: 0.78, w: 4.3, h: 0.45, font: HEAD, weight: 400, italic: true, size: 19, minSize: 11, color: PINK, maxLines: 1 },
        flourish(2.75, 1.36),
        {
          type: 'stack', x: 0.65, y: 1.55, w: 4.2, h: 4.95, gap: 0.24, headingGap: 0.05, valign: 'middle',
          heading: { font: HEAD, weight: 700, size: 13, color: DEEP, uppercase: true, letterSpacing: 0.1, lineHeight: 1.1 },
          body: { font: SERIF, weight: 600, size: 13.5, color: INK, lineHeight: 1.22 },
          items: BACK_SECTIONS,
        },
        flourish(2.75, 6.72),
        { type: 'text', text: 'Services entrusted to', x: 0.6, y: 6.84, w: 4.3, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: 0.6, y: 7.1, w: 4.3, h: 0.36, font: SERIF, weight: 700, size: 15, minSize: 9, color: DEEP, maxLines: 1 },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.6, y: 7.46, w: 4.3, h: 0.58, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#f6dbe6',
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        art,

        // Inside left: obituary on a white veil
        veil(0.3, 0.3, 4.9, 7.9, 0.76),
        heading('Obituary', 0.6, 0.45),
        flourish(2.75, 1.02),
        { type: 'text', text: '{{obituary}}', x: 0.6, y: 1.2, w: 4.3, h: 6.2, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.6, y: 7.5, w: 4.3, h: 0.5, font: SERIF, weight: 600, italic: true, size: 13.5, minSize: 9, color: DEEP, showIf: 'closingQuote' },

        // Inside right: photo collage, large group photo along the bottom
        veil(R + 0.35, 0.3, 4.8, 0.6, 0.72),
        { type: 'text', text: 'Treasured Memories', x: R + 0.35, y: 0.35, w: 4.8, h: 0.5, font: HEAD, weight: 400, italic: true, size: 22, minSize: 14, color: PINK, valign: 'middle' },
        { type: 'photo', field: 'collage_1', x: R + 0.35, y: 1.05, w: 1.52, h: 2.05, ...SNAP },
        { type: 'photo', field: 'collage_2', x: R + 1.99, y: 1.05, w: 1.52, h: 2.05, ...SNAP },
        { type: 'photo', field: 'collage_3', x: R + 3.63, y: 1.05, w: 1.52, h: 2.05, ...SNAP },
        { type: 'photo', field: 'collage_4', x: R + 0.35, y: 3.22, w: 2.34, h: 1.8, ...SNAP },
        { type: 'photo', field: 'collage_5', x: R + 2.81, y: 3.22, w: 2.34, h: 1.8, ...SNAP },
        { type: 'photo', field: 'collage_6', x: R + 0.35, y: 5.14, w: 4.8, h: 3.06, ...SNAP },
      ],
    },
  ],
}
