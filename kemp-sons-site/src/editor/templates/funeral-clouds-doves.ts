import type { Element, Template } from '../types'
import { BACK_SECTIONS, withFields } from './funeral-shared'

/**
 * Clouds & Doves: folded program, printed on an 11 x 8.5 in sheet.
 * Outside spread: back cover (left), front cover (right).
 * Inside spread: obituary (left), order of service (right).
 * Layout follows Kemp & Sons' own InDesign program; the sky is original art.
 */

const SKY = '/templates/clouds-doves/sky.jpg'
const NAVY = '#1d3557' // headings and names
const INK = '#1f2733' // body copy
const SOFT = '#3f5370'
const R = 5.5 // x of the right-hand panel
const SERIF = 'Cormorant Garamond' as const

const sky: Element = { type: 'image', src: SKY, x: -0.125, y: -0.125, w: 11.25, h: 8.75 }

const heading = (text: string, x: number, y: number, w = 4.1): Element => ({
  type: 'text', text, x, y, w, h: 0.5, font: SERIF, weight: 700, size: 19, minSize: 12, uppercase: true, letterSpacing: 0.12, color: NAVY,
})

export const funeralCloudsDoves: Template = {
  id: 'funeral-clouds-doves',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-clouds-doves',
  name: 'Clouds & Doves',
  description: 'A soft blue sky with drifting clouds, a script name and a large portrait on the cover.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '11 x 8.5 in sheet, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  fields: withFields('name', [
    { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' },
  ]),
  thumbnailSide: 'outside',
  thumbnailCrop: { x: 5.5, y: 0, w: 5.5, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#cfe0f1',
      folds: [5.5],
      panels: ['Back cover', 'Front cover'],
      elements: [
        sky,

        // Front cover
        { type: 'text', text: '{{coverLead}}', x: R + 0.5, y: 0.5, w: 4.5, h: 0.4, font: SERIF, weight: 700, size: 15, minSize: 9, uppercase: true, letterSpacing: 0.16, color: NAVY },
        { type: 'text', text: '{{name}}', x: R + 0.35, y: 0.9, w: 4.8, h: 1.05, font: 'Great Vibes', size: 40, minSize: 18, color: NAVY, maxLines: 2, lineHeight: 1.0 },
        { type: 'text', text: 'Sunrise {{birthDate}}  |  Sunset {{deathDate}}', x: R + 0.4, y: 1.98, w: 4.7, h: 0.34, font: SERIF, weight: 700, size: 13, minSize: 8, color: SOFT },
        { type: 'rect', x: R + 0.83, y: 2.43, w: 3.84, h: 3.94, fill: '#ffffff' },
        { type: 'photo', field: 'photo', x: R + 0.9, y: 2.5, w: 3.7, h: 3.8, placeholder: '#b9cde2' },
        { type: 'rect', x: R + 0.35, y: 6.55, w: 4.8, h: 1.6, fill: '#ffffff', opacity: 0.86 },
        { type: 'text', text: '{{serviceDate}}\n{{serviceTime}}', x: R + 0.5, y: 6.68, w: 4.5, h: 0.62, font: SERIF, weight: 700, size: 15, minSize: 9, color: INK, lineHeight: 1.15 },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: R + 0.5, y: 7.3, w: 4.5, h: 0.78, font: SERIF, weight: 600, size: 12.5, minSize: 8, color: INK, lineHeight: 1.15 },

        // Back cover: sections stack and close up when one is left blank
        {
          type: 'stack', x: 0.6, y: 0.5, w: 4.3, h: 5.9, gap: 0.26, headingGap: 0.05, valign: 'middle',
          heading: { font: SERIF, weight: 700, size: 15, color: NAVY, uppercase: true, letterSpacing: 0.12, lineHeight: 1.1 },
          body: { font: SERIF, weight: 600, size: 13.5, color: INK, lineHeight: 1.22 },
          items: BACK_SECTIONS,
        },
        { type: 'line', x: 2.25, y: 6.62, points: [0, 0, 1, 0], stroke: NAVY, strokeWidth: 0.6, opacity: 0.6 },
        { type: 'text', text: 'Services entrusted to', x: 0.7, y: 6.72, w: 4.1, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: 0.7, y: 6.98, w: 4.1, h: 0.36, font: SERIF, weight: 700, size: 15, minSize: 9, color: NAVY },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.7, y: 7.34, w: 4.1, h: 0.55, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#cfe0f1',
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        sky,

        // Inside left: obituary
        heading('Obituary', 0.7, 0.5),
        { type: 'text', text: '{{obituary}}', x: 0.6, y: 1.05, w: 4.3, h: 6.35, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.6, y: 7.5, w: 4.3, h: 0.45, font: SERIF, weight: 600, italic: true, size: 13.5, minSize: 9, color: NAVY, showIf: 'closingQuote' },

        // Inside right: order of service with dotted leaders
        heading('Order of Service', R + 0.6, 0.5),
        { type: 'text', text: '{{orderOfService}}', x: R + 0.6, y: 1.15, w: 4.3, h: 4.8, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.5, leaders: true, valign: 'top' },
        { type: 'line', x: R + 2.25, y: 6.15, points: [0, 0, 1, 0], stroke: NAVY, strokeWidth: 0.6, opacity: 0.6 },
        { type: 'text', text: 'Officiating', x: R + 0.6, y: 6.28, w: 4.3, h: 0.3, font: SERIF, weight: 600, italic: true, size: 12.5, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: R + 0.6, y: 6.56, w: 4.3, h: 0.36, font: SERIF, weight: 700, size: 15, minSize: 9, color: NAVY, showIf: 'officiant' },
        { type: 'text', text: '{{location}}\n{{serviceDate}}, {{serviceTime}}', x: R + 0.6, y: 7.05, w: 4.3, h: 0.6, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.2 },
      ],
    },
  ],
}
