import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, withFields } from './funeral-shared'

/**
 * Gone Fishing: legal trifold, printed on a 14 x 8.5 in sheet.
 * Outside (left to right): inside flap with a photo collage, back cover, front cover.
 * Inside (left to right): order of service, obituary, photo collage.
 * The front cover carries the lake and tackle art; everything else is white.
 */

const ART = '/templates/gone-fishing/fishing-panel.jpg'
const NAVY = '#1d3557' // headings, names, frames
const INK = '#1f2733' // body copy
const SOFT = '#3f5370'
const SERIF = 'Cormorant Garamond' as const
const HEAD = 'Ogirema' as const
const PW = 14 / 3 // panel width
const P1 = PW // x of the middle panel
const P2 = (2 * 14) / 3 // x of the right panel
const M = 0.4 // text inset from a fold or the trim

const heading = (text: string, x: number, y: number, w = PW - 2 * M): Element => ({
  type: 'text', text, x, y, w, h: 0.45, font: HEAD, weight: 700, size: 17, minSize: 11, uppercase: true, letterSpacing: 0.1, color: NAVY,
})

const rule = (cx: number, y: number): Element => ({
  type: 'line', x: cx - 0.5, y, points: [0, 0, 1, 0], stroke: NAVY, strokeWidth: 0.6, opacity: 0.6,
})

export const funeralGoneFishing: Template = {
  id: 'funeral-gone-fishing',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-gone-fishing',
  name: 'Gone Fishing Trifold',
  description: 'A legal trifold for the angler: a lake and tackle box scene on the cover, an oval portrait, and two photo collages.',
  trim: { w: 14, h: 8.5 },
  sizeLabel: '14 x 8.5 in trifold, folds to 4.67 x 8.5 in',
  safeMargin: 0.25,
  fields: withFields('name', [
    { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' },
  ]).flatMap((f): Field[] =>
    f.id === 'photo'
      ? [
          f,
          { id: 'flapPhotos', type: 'photo', label: 'Outside flap photos', count: 4, hint: 'Photo 2 shows as an oval. Drag a photo on the preview to reposition it.', section: 'Photo collages' },
          { id: 'flapTitle', type: 'text', label: 'Outside flap heading', default: 'Cherished Memories', hint: 'Shown beside the oval photo. Leave blank to hide it.', section: 'Photo collages' },
          { id: 'memoryPhotos', type: 'photo', label: 'Inside photos', count: 5, hint: 'A column of photos on the inside right panel.', section: 'Photo collages' },
        ]
      : [f],
  ),
  thumbnailSide: 'outside',
  thumbnailCrop: { x: P2, y: 0, w: PW, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#ffffff',
      folds: [P1, P2],
      panels: ['Inside flap', 'Back cover', 'Front cover'],
      elements: [
        // Front cover art: sky on top, lake and tackle scene below
        { type: 'image', src: ART, x: P2, y: -0.125, w: 4.9, h: 8.75 },

        // Outside flap: photo collage
        { type: 'photo', field: 'flapPhotos_1', x: -0.125, y: -0.125, w: PW - 0.1 + 0.125, h: 2.9 },
        { type: 'photo', field: 'flapPhotos_2', x: 0.2, y: 2.98, w: 2.05, h: 2.72, shape: 'ellipse', stroke: NAVY, strokeWidth: 2 },
        { type: 'text', text: '{{flapTitle}}', x: 2.4, y: 2.98, w: PW - 2.4 - 0.35, h: 0.5, font: 'Great Vibes', size: 22, minSize: 12, color: NAVY, maxLines: 1, showIf: 'flapTitle' },
        { type: 'photo', field: 'flapPhotos_3', x: 2.45, y: 3.55, w: PW - 2.45 - 0.35, h: 2.15, stroke: NAVY, strokeWidth: 1 },
        { type: 'photo', field: 'flapPhotos_4', x: -0.125, y: 5.88, w: PW - 0.1 + 0.125, h: 2.745 },

        // Back cover: sections close up when one is left blank
        {
          type: 'stack', x: P1 + M, y: 0.45, w: PW - 2 * M, h: 5.95, gap: 0.24, headingGap: 0.05, valign: 'middle',
          heading: { font: HEAD, weight: 700, size: 14, color: NAVY, uppercase: true, letterSpacing: 0.1, lineHeight: 1.1 },
          body: { font: SERIF, weight: 600, size: 14, color: INK, lineHeight: 1.22 },
          items: BACK_SECTIONS,
        },
        rule(P1 + PW / 2, 6.65),
        { type: 'text', text: 'Services entrusted to', x: P1 + M, y: 6.75, w: PW - 2 * M, h: 0.28, font: SERIF, weight: 600, italic: true, size: 11.5, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: P1 + M, y: 7.02, w: PW - 2 * M, h: 0.36, font: SERIF, weight: 700, size: 14, minSize: 9, color: NAVY, maxLines: 1 },
        { type: 'text', text: '{{funeralHomeDetails}}', x: P1 + M, y: 7.38, w: PW - 2 * M, h: 0.55, font: SERIF, weight: 600, size: 11.5, minSize: 7, color: INK, lineHeight: 1.15 },

        // Front cover: name and portrait in the sky
        { type: 'text', text: '{{coverLead}}', x: P2 + M, y: 0.35, w: PW - 2 * M, h: 0.34, font: HEAD, weight: 400, size: 12, minSize: 8, uppercase: true, letterSpacing: 0.14, color: NAVY },
        { type: 'text', text: '{{name}}', x: P2 + 0.3, y: 0.68, w: PW - 0.6, h: 0.95, font: 'Great Vibes', size: 34, minSize: 16, color: NAVY, maxLines: 2, lineHeight: 1.0 },
        { type: 'text', text: '{{birthDate}}  to  {{deathDate}}', x: P2 + M, y: 1.65, w: PW - 2 * M, h: 0.32, font: SERIF, weight: 700, size: 12.5, minSize: 8, color: NAVY, maxLines: 1 },
        { type: 'photo', field: 'photo', x: P2 + PW / 2 - 1.25, y: 2.05, w: 2.5, h: 2.95, shape: 'ellipse', stroke: NAVY, strokeWidth: 3 },
        // Service details over the lake
        { type: 'rect', x: P2 + 0.45, y: 5.18, w: PW - 0.9, h: 1.12, fill: '#ffffff', opacity: 0.84, radius: 0.06 },
        { type: 'text', text: '{{serviceDate}}  |  {{serviceTime}}', x: P2 + 0.55, y: 5.25, w: PW - 1.1, h: 0.34, font: SERIF, weight: 700, size: 13, minSize: 8, color: NAVY, maxLines: 1 },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: P2 + 0.55, y: 5.57, w: PW - 1.1, h: 0.68, font: SERIF, weight: 600, size: 11.5, minSize: 7, color: INK, lineHeight: 1.1 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#ffffff',
      folds: [P1, P2],
      panels: ['Inside left', 'Inside middle', 'Inside right'],
      elements: [
        // Inside left: order of service
        heading('Order of Service', M, 0.45),
        { type: 'text', text: '{{orderOfService}}', x: M, y: 1.05, w: PW - 2 * M, h: 4.95, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.5, leaders: true, valign: 'top' },
        rule(PW / 2, 6.2),
        { type: 'text', text: 'Officiating', x: M, y: 6.3, w: PW - 2 * M, h: 0.28, font: SERIF, weight: 600, italic: true, size: 11.5, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: M, y: 6.56, w: PW - 2 * M, h: 0.34, font: SERIF, weight: 700, size: 14, minSize: 9, color: NAVY, maxLines: 1, showIf: 'officiant' },
        { type: 'text', text: '{{closingQuote}}', x: M, y: 7.15, w: PW - 2 * M, h: 0.8, font: SERIF, weight: 600, italic: true, size: 13, minSize: 9, color: NAVY, lineHeight: 1.2, showIf: 'closingQuote' },

        // Inside middle: obituary
        heading('Obituary', P1 + M, 0.45),
        { type: 'text', text: '{{obituary}}', x: P1 + M, y: 1.05, w: PW - 2 * M, h: 7.0, font: SERIF, weight: 600, size: 14, minSize: 7.5, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },

        // Inside right: column of photos bleeding off the edge
        { type: 'photo', field: 'memoryPhotos_1', x: P2 + 0.1, y: -0.125, w: 2.55, h: 2.725 },
        { type: 'photo', field: 'memoryPhotos_2', x: P2 + 2.73, y: -0.125, w: 14.125 - (P2 + 2.73), h: 2.725 },
        { type: 'photo', field: 'memoryPhotos_3', x: P2 + 0.1, y: 2.68, w: 14.125 - (P2 + 0.1), h: 2.94 },
        { type: 'photo', field: 'memoryPhotos_4', x: P2 + 0.1, y: 5.7, w: 1.99, h: 2.925 },
        { type: 'photo', field: 'memoryPhotos_5', x: P2 + 2.17, y: 5.7, w: 14.125 - (P2 + 2.17), h: 2.925 },
      ],
    },
  ],
}
