import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, FUNERAL_FIELDS } from './funeral-shared'

/**
 * Pink Floral Stagger Fold: an 11 x 8.5 in sheet folded once, off-center, so a
 * 1 in pink tab of the inside peeks out past the front cover when closed.
 *
 * Geometry (all x measured from the left trim of each side as printed):
 *
 *   OUTSIDE  | back cover 0 to 6.0 (6.0 wide) | front cover 6.0 to 11 (5.0 wide) |   fold at 6.0
 *   INSIDE   | inside left 0 to 5.0 (5.0)    | inside right 5.0 to 11 (6.0)      |   fold at 5.0
 *
 * The inside is the mirror of the outside, so the inside left panel is the back
 * of the front cover and the inside right panel is the back of the back cover.
 * Closed, the 5.0 in front cover lies on the 6.0 in back panel and stops 1.0 in
 * short of its far edge. That uncovered strip is the inside right panel's last
 * inch, x = 10.0 to 11.0 on the inside, so the pink tab with the name and dates
 * (set sideways) sits there and shows to the right of the front cover.
 *
 * Layout follows a pink floral program: a white rounded panel on the back cover,
 * a script name and a large (cut-out) portrait on the front, a lilac border and
 * a short tribute down the inside left, and the obituary inside right.
 */

const ART = '/templates/pink-stagger'
const PINK = '#d6338a'
const DEEP = '#a8236a' // smaller pink type, a touch darker for contrast
const INK = '#3b2a35'
const SOFT = '#6e4a63'
const SERIF = 'Cormorant Garamond' as const
const SCRIPT = 'Great Vibes' as const
const SANS = 'Montserrat' as const

const OUT_FOLD = 6.0 // outside: back cover | front cover
const IN_FOLD = 5.0 // inside: inside left | inside right
const TAB = 10.0 // inside x where the visible tab begins

// The floral art has a plain white band down its left 22%. Draw it a little
// larger and slid left so that band falls outside the bleed (about 233 ppi).
const FLORAL_W = 14.5
const FLORAL_H = FLORAL_W / (3375 / 2625)
const floral: Element = {
  type: 'image',
  src: `${ART}/floral.jpg`,
  x: 11.125 - FLORAL_W,
  y: 4.25 - FLORAL_H / 2,
  w: FLORAL_W,
  h: FLORAL_H,
}

const scriptHeading = (text: string, x: number, y: number, w: number, size = 34): Element => ({
  type: 'text', text, x, y, w, h: 0.62, font: SCRIPT, size, minSize: 18, color: PINK, maxLines: 1, align: 'left', lineHeight: 1.0,
})

const fields: Field[] = FUNERAL_FIELDS.flatMap((f): Field[] => {
  if (f.id === 'name') {
    return [f, { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' }]
  }
  if (f.type === 'photo') {
    return [{ ...f, removeBackground: true, hint: 'Drag the photo to reposition it. Turn on Remove background to place them right on the flowers.' }]
  }
  if (f.id === 'obituary') {
    return [
      {
        id: 'poem',
        type: 'textarea',
        label: 'Tribute or poem',
        rows: 6,
        section: 'Inside',
        hint: 'A short poem or tribute beside the lilacs. Leave blank to hide it.',
        default:
          'I am the morning light\nthat finds your window,\nthe quiet in the garden\nafter rain.\n\nI am the hymn you hum\nwithout remembering,\nthe warmth of every kitchen\nthat you know.\n\nSo do not stand\nand count the days I am gone.\nLook up, and smile,\nand carry me along.',
      },
      f,
    ]
  }
  if (f.id === 'pallbearers') {
    return [
      { id: 'comfort', type: 'textarea', label: 'Words of comfort', rows: 2, section: 'Back cover', hint: 'A scripture or saying. Leave blank to hide this section.', default: '"Blessed are they that mourn,\nfor they shall be comforted."' },
      f,
    ]
  }
  return [f]
})

export const funeralPinkStagger: Template = {
  id: 'funeral-pink-stagger',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-pink-stagger',
  name: 'Pink Floral Stagger Fold',
  description: 'Soft pink florals, a script name and a large portrait, folded off-center so a pink name tab shows past the cover.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '11 x 8.5 in sheet, stagger folds to 6 x 8.5 in',
  safeMargin: 0.25,
  fields,
  thumbnailSide: 'outside',
  thumbnailCrop: { x: OUT_FOLD, y: 0, w: 11 - OUT_FOLD, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#f6dceb',
      folds: [OUT_FOLD],
      panels: ['Back cover', 'Front cover'],
      elements: [
        floral,

        // Back cover: white rounded panel with pink script headings
        { type: 'rect', x: 0.35, y: 0.35, w: 5.3, h: 7.8, radius: 0.3, fill: '#ffffff', opacity: 0.94, stroke: PINK, strokeWidth: 1.5 },
        {
          type: 'stack', x: 0.75, y: 0.6, w: 4.5, h: 5.85, gap: 0.2, headingGap: 0.02, valign: 'middle',
          heading: { font: SCRIPT, size: 25, color: PINK, lineHeight: 1.05 },
          body: { font: SERIF, weight: 600, size: 13.5, color: INK, lineHeight: 1.2 },
          items: [
            { heading: 'Words of Comfort', body: '{{comfort}}' },
            ...BACK_SECTIONS.map((s) => (s.heading === 'Words of Thanks' ? { ...s, heading: 'Acknowledgement' } : s)),
          ],
        },
        { type: 'line', x: 2.5, y: 6.68, points: [0, 0, 1, 0], stroke: PINK, strokeWidth: 0.75, opacity: 0.7 },
        { type: 'text', text: 'Services entrusted to', x: 0.75, y: 6.78, w: 4.5, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: 0.75, y: 7.04, w: 4.5, h: 0.36, font: SERIF, weight: 700, size: 15, minSize: 9, color: DEEP, maxLines: 1 },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.75, y: 7.4, w: 4.5, h: 0.55, font: SERIF, weight: 600, size: 12, minSize: 7, color: INK, lineHeight: 1.15 },

        // Front cover (6.0 to 11)
        { type: 'text', text: '{{coverLead}}', x: OUT_FOLD + 0.35, y: 0.5, w: 4.4, h: 0.3, font: SANS, weight: 500, size: 10.5, minSize: 7, uppercase: true, letterSpacing: 0.16, color: SOFT, maxLines: 1 },
        { type: 'text', text: '{{name}}', x: OUT_FOLD + 0.3, y: 0.8, w: 4.45, h: 1.05, font: SCRIPT, size: 40, minSize: 18, color: PINK, maxLines: 2, lineHeight: 1.0 },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: OUT_FOLD + 0.35, y: 1.88, w: 4.4, h: 0.32, font: SERIF, weight: 700, size: 14, minSize: 8, color: INK, maxLines: 1 },
        { type: 'line', x: OUT_FOLD + 2.1, y: 2.3, points: [0, 0, 0.9, 0], stroke: PINK, strokeWidth: 0.75, opacity: 0.8 },
        { type: 'text', text: '{{serviceDate}}, {{serviceTime}}\n{{location}}\n{{locationAddress}}', x: OUT_FOLD + 0.35, y: 2.38, w: 4.4, h: 0.88, font: SERIF, weight: 600, size: 12.5, minSize: 8, color: INK, lineHeight: 1.15 },
        // White border, dropped when the background is removed so the portrait stands on the flowers.
        { type: 'rect', x: OUT_FOLD + 0.53, y: 3.36, w: 4.04, h: 4.89, fill: '#ffffff', stroke: PINK, strokeWidth: 1, hideWhenCutout: 'photo' },
        { type: 'photo', field: 'photo', x: OUT_FOLD + 0.6, y: 3.43, w: 3.9, h: 4.75 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#ffffff',
      folds: [IN_FOLD],
      panels: ['Inside left', 'Inside right (pink tab shows when closed)'],
      elements: [
        // Inside left: lilac border fading to white, and the tribute column
        { type: 'image', src: `${ART}/lilac-panel.jpg`, x: -0.125, y: -0.125, w: 3.6, h: 8.75 },
        { type: 'text', text: '{{poem}}', x: 2.3, y: 0.6, w: 2.4, h: 5.9, font: SERIF, weight: 600, italic: true, size: 13.5, minSize: 8, color: INK, lineHeight: 1.3, align: 'right', valign: 'middle', showIf: 'poem' },
        { type: 'image', src: `${ART}/roses.png`, x: 3.05, y: 6.6, w: 1.6, h: 1.61 },

        // Inside right: obituary (5.0 to 10.0)
        scriptHeading('Obituary', IN_FOLD + 0.35, 0.42, 4.3),
        { type: 'line', x: IN_FOLD + 0.38, y: 1.08, points: [0, 0, 4.2, 0], stroke: PINK, strokeWidth: 0.75, opacity: 0.6 },
        { type: 'text', text: '{{obituary}}', x: IN_FOLD + 0.35, y: 1.22, w: 4.3, h: 6.3, font: SERIF, weight: 600, size: 14.5, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: IN_FOLD + 0.35, y: 7.6, w: 4.3, h: 0.45, font: SERIF, weight: 600, italic: true, size: 13.5, minSize: 9, color: DEEP, maxLines: 2, showIf: 'closingQuote' },

        // The tab: last inch of the inside right panel, visible past the front cover when closed.
        // Starts a hair before 10.0 so no white shows if the fold drifts.
        { type: 'rect', x: TAB - 0.05, y: -0.125, w: 11.125 - (TAB - 0.05), h: 8.75, fill: PINK },
        { type: 'line', x: TAB + 0.12, y: -0.125, points: [0, 0, 0, 8.75], stroke: '#ffffff', strokeWidth: 0.6, opacity: 0.6 },
        {
          type: 'text', text: '{{name}}   |   {{birthDate}} to {{deathDate}}', rotation: 90,
          x: 10.75, y: 0.45, w: 7.6, h: 0.5,
          font: SANS, weight: 600, size: 12, minSize: 7, uppercase: true, letterSpacing: 0.12, color: '#ffffff', maxLines: 1,
        },
      ],
    },
  ],
}
