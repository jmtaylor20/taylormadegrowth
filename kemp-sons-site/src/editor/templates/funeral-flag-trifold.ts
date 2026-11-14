import type { Element, Field, PhotoEl, Template } from '../types'
import { BACK_SECTIONS, FUNERAL_FIELDS } from './funeral-shared'

/**
 * Flag & Clouds Trifold: 16.5 x 8.5 in sheet, three 5.5 x 8.5 in panels.
 * Outside: inside flap (photo collage), back cover (sections and funeral home),
 * front cover (script name, cut-out portrait over a waving flag, service box).
 * Inside: obituary, a faded service photo with a tribute, order of service with
 * a small collage.
 */

const ART = '/templates/flag-clouds-trifold/flag-clouds.jpg'
const NAVY = '#1b2f52' // headings
const INK = '#1f2733' // body copy
const SOFT = '#3f5370'
const RED = '#9b1c26' // small accents taken from the flag
const P2 = 5.5 // x of the middle panel
const P3 = 11 // x of the right panel
const SERIF = 'Cormorant Garamond' as const
const HEAD = 'Playfair Display' as const

const heading = (text: string, x: number, y: number, w: number): Element => ({
  type: 'text', text, x, y, w, h: 0.5, font: HEAD, weight: 700, size: 19, minSize: 12, uppercase: true, letterSpacing: 0.08, color: NAVY,
})

const rule = (cx: number, y: number, w = 1): Element => ({
  type: 'line', x: cx - w / 2, y, points: [0, 0, w, 0], stroke: RED, strokeWidth: 0.8, opacity: 0.75,
})

/** Photo grid: rows of [width weights], filling the box with white gaps between photos. */
function grid(field: string, x: number, y: number, w: number, h: number, rows: number[][], gap: number, start = 1): Element[] {
  const out: Element[] = [{ type: 'rect', x: x - gap, y: y - gap, w: w + 2 * gap, h: h + 2 * gap, fill: '#ffffff' }]
  const rh = (h - gap * (rows.length - 1)) / rows.length
  let n = start
  rows.forEach((row, r) => {
    const total = row.reduce((a, b) => a + b, 0)
    const free = w - gap * (row.length - 1)
    let cx = x
    row.forEach((weight) => {
      const cw = (free * weight) / total
      const el: PhotoEl = { type: 'photo', field: `${field}_${n++}`, x: cx, y: y + r * (rh + gap), w: cw, h: rh }
      out.push(el)
      cx += cw + gap
    })
  })
  return out
}

const fields: Field[] = [
  ...FUNERAL_FIELDS.slice(0, 1),
  { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' },
  ...FUNERAL_FIELDS.slice(1).map((f): Field =>
    f.type === 'photo' && f.id === 'photo'
      ? { ...f, removeBackground: true, hint: 'Drag the photo to reposition it. Turn on Remove background to place them right on the flag.' }
      : f,
  ),
]

// Inside middle panel and the two collages go after the obituary fields.
const insideExtra: Field[] = [
  {
    id: 'servicePhoto', type: 'photo', label: 'Service or feature photo', section: 'Inside', removeBackground: true,
    hint: 'Optional. A large faded photo behind the tribute, such as a military portrait. Remove background works best.',
  },
  { id: 'tributeTitle', type: 'text', label: 'Tribute heading', default: 'In Loving Memory', section: 'Inside', hint: 'Leave blank to hide the heading.' },
  {
    id: 'tribute', type: 'textarea', rows: 5, label: 'Tribute or poem', section: 'Inside', hint: 'Shown over the feature photo. Leave blank to hide it.',
    default:
      'Do not stand at my grave and weep,\nI am not there, I do not sleep.\nI am a thousand winds that blow,\nI am the diamond glints on snow.\nI am the sunlight on ripened grain,\nI am the gentle autumn rain.\nDo not stand at my grave and cry,\nI am not there, I did not die.',
  },
  { id: 'collage', type: 'photo', label: 'Photo collage (inside flap)', count: 9, section: 'Photos', hint: 'Nine photos on the panel that folds in. Drag a photo on the preview to reposition it.' },
  { id: 'moments', type: 'photo', label: 'Photo collage (order of service)', count: 4, section: 'Photos', hint: 'Four photos under the order of service.' },
]
const at = fields.findIndex((f) => f.id === 'closingQuote')
fields.splice(at + 1, 0, ...insideExtra)

// Background art: clouds with the flag on the right third.
const outsideArt: Element = { type: 'image', src: ART, x: -0.125, y: -0.125, w: 16.75, h: 8.75 }
// Inside: the same art enlarged so only the clouds show and the flag falls off the sheet.
const insideArt: Element = { type: 'image', src: ART, x: -0.6, y: -2.3, w: 25.2, h: 13.16 }

export const funeralFlagTrifold: Template = {
  id: 'funeral-flag-trifold',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-flag-trifold',
  name: 'Flag & Clouds Trifold',
  description: 'A bright sky with an American flag behind the portrait, a photo collage panel and room for a service photo inside.',
  trim: { w: 16.5, h: 8.5 },
  sizeLabel: '16.5 x 8.5 in trifold, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  fields,
  thumbnailSide: 'outside',
  thumbnailCrop: { x: P3, y: 0, w: 5.5, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#d6e6f4',
      folds: [P2, P3],
      panels: ['Inside flap', 'Back cover', 'Front cover'],
      elements: [
        outsideArt,

        // Inside flap: photo collage
        ...grid('collage', 0.3, 0.3, 4.9, 7.9, [[1.2, 1], [1, 1, 1], [1, 1.25], [1, 1, 1]], 0.07),

        // Back cover: sections close up when blank
        {
          type: 'stack', x: P2 + 0.45, y: 0.45, w: 4.6, h: 5.85, gap: 0.24, headingGap: 0.05, valign: 'middle',
          heading: { font: HEAD, weight: 700, size: 14, color: NAVY, uppercase: true, letterSpacing: 0.08, lineHeight: 1.1 },
          body: { font: SERIF, weight: 700, size: 13.5, color: INK, lineHeight: 1.22 },
          items: BACK_SECTIONS,
        },
        rule(P2 + 2.75, 6.55),
        { type: 'text', text: 'Services entrusted to', x: P2 + 0.5, y: 6.66, w: 4.5, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: P2 + 0.5, y: 6.93, w: 4.5, h: 0.38, font: HEAD, weight: 700, size: 14, minSize: 9, color: NAVY },
        { type: 'text', text: '{{funeralHomeDetails}}', x: P2 + 0.5, y: 7.33, w: 4.5, h: 0.6, font: SERIF, weight: 700, size: 12, minSize: 7, color: INK, lineHeight: 1.15 },

        // Front cover
        { type: 'text', text: '{{coverLead}}', x: P3 + 0.4, y: 0.38, w: 4.7, h: 0.34, font: HEAD, weight: 400, size: 13, minSize: 8, uppercase: true, letterSpacing: 0.14, color: NAVY },
        { type: 'text', text: '{{name}}', x: P3 + 0.3, y: 0.72, w: 4.9, h: 1.0, font: 'Great Vibes', size: 40, minSize: 18, color: '#111111', maxLines: 2, lineHeight: 0.95 },
        // White border, dropped when the background is removed so the portrait sits on the flag.
        { type: 'rect', x: P3 + 0.83, y: 1.88, w: 3.84, h: 4.34, fill: '#ffffff', hideWhenCutout: 'photo' },
        { type: 'photo', field: 'photo', x: P3 + 0.9, y: 1.95, w: 3.7, h: 4.2 },
        { type: 'rect', x: P3 + 0.3, y: 6.38, w: 4.9, h: 1.82, fill: '#ffffff', opacity: 0.92 },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: P3 + 0.45, y: 6.48, w: 4.6, h: 0.34, font: HEAD, weight: 400, size: 12.5, minSize: 8, color: RED },
        { type: 'text', text: '{{serviceDate}}  |  {{serviceTime}}', x: P3 + 0.45, y: 6.84, w: 4.6, h: 0.36, font: SERIF, weight: 700, size: 14, minSize: 8, color: INK },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: P3 + 0.45, y: 7.2, w: 4.6, h: 0.9, font: SERIF, weight: 700, size: 13, minSize: 7, color: INK, lineHeight: 1.12 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#d6e6f4',
      folds: [P2, P3],
      panels: ['Inside left', 'Inside middle', 'Inside right'],
      elements: [
        insideArt,

        // Inside left: obituary
        heading('Obituary', 0.45, 0.4, 4.6),
        rule(2.75, 0.95),
        { type: 'text', text: '{{obituary}}', x: 0.4, y: 1.12, w: 4.7, h: 6.4, font: SERIF, weight: 700, size: 13.5, minSize: 8, color: INK, lineHeight: 1.28, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.4, y: 7.6, w: 4.7, h: 0.55, font: SERIF, weight: 700, italic: true, size: 13.5, minSize: 9, color: NAVY, showIf: 'closingQuote' },

        // Inside middle: faded feature photo with a tribute over it
        { type: 'photo', field: 'servicePhoto', x: P2 + 0.3, y: 0.3, w: 4.9, h: 7.9, opacity: 0.55, optional: true },
        // Soft white panel keeps the tribute readable over the photo.
        { type: 'rect', x: P2 + 0.55, y: 3.95, w: 4.4, h: 4.0, fill: '#ffffff', opacity: 0.62, radius: 0.08, showIf: 'tribute' },
        { type: 'text', text: '{{tributeTitle}}', x: P2 + 0.65, y: 4.05, w: 4.2, h: 0.75, font: 'Great Vibes', size: 34, minSize: 18, color: NAVY, maxLines: 1, showIf: 'tributeTitle' },
        { type: 'text', text: '{{tribute}}', x: P2 + 0.7, y: 4.85, w: 4.1, h: 2.95, font: SERIF, weight: 700, italic: true, size: 14, minSize: 8, color: INK, lineHeight: 1.3, valign: 'top', showIf: 'tribute' },

        // Inside right: order of service and a small collage
        heading('Order of Service', P3 + 0.45, 0.4, 4.6),
        rule(P3 + 2.75, 0.95),
        { type: 'text', text: '{{orderOfService}}', x: P3 + 0.4, y: 1.12, w: 4.7, h: 3.35, font: SERIF, weight: 700, size: 13.5, minSize: 8, color: INK, lineHeight: 1.42, leaders: true, valign: 'top' },
        { type: 'text', text: 'Officiating', x: P3 + 0.4, y: 4.55, w: 4.7, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: P3 + 0.4, y: 4.82, w: 4.7, h: 0.36, font: HEAD, weight: 700, size: 14, minSize: 9, color: NAVY, showIf: 'officiant' },
        ...grid('moments', P3 + 0.33, 5.42, 4.84, 2.78, [[1, 1.3], [1.3, 1]], 0.07),
      ],
    },
  ],
}
