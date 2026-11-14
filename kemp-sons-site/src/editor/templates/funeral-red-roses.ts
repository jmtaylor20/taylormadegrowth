import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, FUNERAL_FIELDS } from './funeral-shared'

/**
 * Red Roses: folded program, printed on an 11 x 8.5 in sheet.
 * Outside spread: back cover (left), front cover (right), white with a band
 * of red roses along the bottom and an outlined oval portrait over the roses.
 * Inside spread: obituary (left), order of service (right) on clean white.
 */

const ROSES = '/templates/red-roses/roses.jpg'
const INK = '#1c1a1a' // names and headings
const BODY = '#2a2626' // body copy
const RED = '#8e1b22' // accents drawn from the roses
const SOFT = '#5a4f4f'
const R = 5.5 // x of the right-hand panel
const SERIF = 'Cormorant Garamond' as const
const SCRIPT = 'Great Vibes' as const

/** A short rule with a diamond in the middle, as a small divider ornament. */
const ornament = (cx: number, y: number): Element[] => [
  { type: 'line', x: cx - 0.75, y, points: [0, 0, 0.6, 0], stroke: RED, strokeWidth: 0.75 },
  { type: 'line', x: cx + 0.15, y, points: [0, 0, 0.6, 0], stroke: RED, strokeWidth: 0.75 },
  { type: 'line', x: cx, y, points: [-0.09, 0, 0, -0.07, 0.09, 0, 0, 0.07], closed: true, stroke: RED, strokeWidth: 0.75, fill: RED },
]

const scriptHeading = (text: string, x: number, y: number, w: number, align: 'left' | 'center'): Element => ({
  type: 'text', text, x, y, w, h: 0.62, font: SCRIPT, size: 30, minSize: 18, maxLines: 1, color: INK, align, valign: 'middle',
})

// The cover splits the name into a script line and a large serif last name,
// so the shared "name" field is replaced by these two.
const nameFields: Field[] = [
  { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' },
  { id: 'givenNames', type: 'text', label: 'Title, first and middle name', default: 'Mrs. Margaret Ellen', hint: 'Shown in script on the cover.', section: 'Front cover' },
  { id: 'lastName', type: 'text', label: 'Last name', default: 'Hayes', hint: 'Shown in large capitals under the script name.', section: 'Front cover' },
]

export const funeralRedRoses: Template = {
  id: 'funeral-red-roses',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-red-roses',
  name: 'Red Roses',
  description: 'Clean white pages with a band of red roses, a script name over bold capitals and an oval portrait on the cover.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '11 x 8.5 in sheet, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  fields: FUNERAL_FIELDS.flatMap((f): Field[] => {
    if (f.id === 'name') return nameFields
    if (f.id === 'firstName') return [{ ...f, hint: 'Used in the obituary heading, as in "Margaret\'s Journey".' }]
    if (f.id === 'familyMessage') return [{ ...f, hint: 'Shown on the inside right, under the order of service. Leave blank to hide this section.' }]
    return [f]
  }),
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
        { type: 'image', src: ROSES, x: -0.125, y: -0.125, w: 11.25, h: 8.75 },

        // Front cover
        { type: 'text', text: '{{coverLead}}', x: R + 0.5, y: 0.42, w: 4.5, h: 0.32, font: SERIF, weight: 600, size: 12.5, minSize: 8, uppercase: true, letterSpacing: 0.16, color: SOFT },
        { type: 'text', text: '{{givenNames}}', x: R + 0.4, y: 0.74, w: 4.7, h: 0.7, font: SCRIPT, size: 38, minSize: 18, maxLines: 1, color: INK, valign: 'bottom' },
        { type: 'text', text: '{{lastName}}', x: R + 0.4, y: 1.38, w: 4.7, h: 0.82, font: 'Playfair Display', weight: 400, size: 54, minSize: 24, maxLines: 1, uppercase: true, letterSpacing: 0.02, color: INK, valign: 'top', lineHeight: 1.0 },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: R + 0.5, y: 2.24, w: 4.5, h: 0.3, font: SERIF, weight: 700, size: 13, minSize: 8, color: RED, letterSpacing: 0.03 },
        { type: 'text', text: '{{serviceDate}}, {{serviceTime}}\n{{location}}\n{{locationAddress}}', x: R + 0.5, y: 2.6, w: 4.5, h: 0.88, font: SERIF, weight: 600, size: 11.5, minSize: 7, color: BODY, lineHeight: 1.15, valign: 'top' },
        // Oval portrait with a thin dark outline, sitting over the roses
        { type: 'ellipse', x: R + 2.75, y: 5.78, rx: 1.56, ry: 2.11, fill: '#ffffff' },
        { type: 'photo', field: 'photo', x: R + 1.25, y: 3.73, w: 3.0, h: 4.1, shape: 'ellipse', stroke: '#1a1414', strokeWidth: 1.5 },

        // Back cover: sections sit on the white above the roses and close up when blank
        {
          type: 'stack', x: 0.6, y: 0.45, w: 4.3, h: 4.25, gap: 0.24, headingGap: 0.04, valign: 'middle',
          heading: { font: SERIF, weight: 700, size: 15, color: RED, uppercase: true, letterSpacing: 0.12, lineHeight: 1.1 },
          body: { font: SERIF, weight: 600, size: 13, color: BODY, lineHeight: 1.2 },
          items: BACK_SECTIONS.filter((s) => s.body !== '{{familyMessage}}'),
          minScale: 0.6,
        },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#ffffff',
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        // Inside left: obituary
        scriptHeading("{{firstName}}'s Journey . . .", 0.55, 0.38, 4.4, 'left'),
        { type: 'line', x: 0.6, y: 1.06, points: [0, 0, 1.2, 0], stroke: RED, strokeWidth: 0.75 },
        { type: 'text', text: '{{obituary}}', x: 0.6, y: 1.25, w: 4.3, h: 5.95, font: SERIF, weight: 600, size: 13, minSize: 8, color: BODY, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.6, y: 7.35, w: 4.3, h: 0.65, font: SCRIPT, size: 24, minSize: 13, maxLines: 2, color: INK, lineHeight: 1.05, valign: 'middle', showIf: 'closingQuote' },

        // Inside right: order of service with dotted leaders
        scriptHeading('Order of Service', R + 0.6, 0.38, 4.3, 'center'),
        { type: 'text', text: '{{orderOfService}}', x: R + 0.6, y: 1.2, w: 4.3, h: 3.75, font: SERIF, weight: 600, size: 13, minSize: 8, color: BODY, lineHeight: 1.45, leaders: true, valign: 'top' },
        { type: 'text', text: 'Officiating: {{officiant}}', x: R + 0.6, y: 5.0, w: 4.3, h: 0.3, font: SERIF, weight: 600, italic: true, size: 12, minSize: 8, color: SOFT, showIf: 'officiant' },
        ...ornament(R + 2.75, 5.5).map((e) => ({ ...e, showIf: 'familyMessage' })),
        { type: 'text', text: 'Words of Thanks', x: R + 0.6, y: 5.7, w: 4.3, h: 0.32, font: SERIF, weight: 700, size: 14, uppercase: true, letterSpacing: 0.12, color: RED, showIf: 'familyMessage' },
        { type: 'text', text: '{{familyMessage}}', x: R + 0.6, y: 6.04, w: 4.3, h: 0.9, font: SERIF, weight: 600, size: 12.5, minSize: 8, color: BODY, lineHeight: 1.22, valign: 'top', showIf: 'familyMessage' },
        { type: 'text', text: '{{funeralHome}}', x: R + 0.6, y: 7.18, w: 4.3, h: 0.32, font: SERIF, weight: 700, size: 14, minSize: 9, color: INK },
        { type: 'text', text: '{{funeralHomeDetails}}', x: R + 0.6, y: 7.5, w: 4.3, h: 0.5, font: SERIF, weight: 600, size: 11.5, minSize: 7, color: SOFT, lineHeight: 1.15 },
      ],
    },
  ],
}
