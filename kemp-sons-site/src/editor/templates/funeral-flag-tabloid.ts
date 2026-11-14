import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, withFields } from './funeral-shared'

/**
 * Flag & Clouds Large Trifold: printed on a 17 x 11 in sheet, folding to about 5.67 x 11 in.
 * Outside (left to right): inside flap, back cover, front cover.
 * Inside (left to right): obituary, photo collage, order of service.
 * A soft sky runs across both sides; the front cover carries an American flag
 * behind a large cut-out portrait.
 */

const ART = '/templates/flag-clouds-legal'
const NAVY = '#1b2f55' // headings and names
const INK = '#1c2430' // body copy
const SOFT = '#34496b'
const SERIF = 'Cormorant Garamond' as const
const SCRIPT = 'Great Vibes' as const

const W = 17
const H = 11
const P1 = W / 3 // first fold
const P2 = (2 * W) / 3 // second fold
const PW = W / 3 // panel width

// Content box inside each panel: 0.4 in from the trim, 0.4 in from a fold.
const IN = 0.4
const left = (p: number) => p * PW + IN
const CW = PW - 2 * IN // content width, about 4.87 in

const sky: Element = { type: 'image', src: `${ART}/clouds.jpg`, x: -0.125, y: -0.125, w: W + 0.25, h: H + 0.25 }
// Light wash so the deep blue of the sky reads as the soft, pale sky of the original.
const wash: Element = { type: 'rect', x: -0.125, y: -0.125, w: W + 0.25, h: H + 0.25, fill: '#ffffff', opacity: 0.4 }

/** Soft white panel behind a block of text so it stays readable over the clouds. */
const veil = (x: number, y: number, w: number, h: number, opacity = 0.62): Element => ({
  type: 'rect', x, y, w, h, fill: '#ffffff', opacity, radius: 0.08,
})

const scriptHeading = (text: string, x: number, y: number, w = CW, size = 40): Element => ({
  type: 'text', text, x, y, w, h: 0.8, font: SCRIPT, size, minSize: 20, color: NAVY, maxLines: 1, valign: 'middle',
})

/** Six-photo row helper for the outside flap: three photos across, with a white border. */
const photoRow = (y: number, first: number, h: number): Element[] => {
  const gap = 0.12
  const w = (CW - 2 * gap) / 3
  const out: Element[] = []
  for (let i = 0; i < 3; i++) {
    const x = left(0) + i * (w + gap)
    out.push({ type: 'rect', x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: '#ffffff' })
    out.push({ type: 'photo', field: `outsidePhotos_${first + i}`, x, y, w, h })
  }
  return out
}

/**
 * Inside collage: two photos per row, alternating wide and narrow so it reads
 * as a collage rather than a grid. A script caption band sits in the middle.
 */
const collage = (): Element[] => {
  const x0 = P1 + 0.32
  const cw = PW - 0.64
  const gap = 0.09
  const top = 0.32
  const bottom = H - 0.32
  const band = 0.95
  const rows = 6
  const rh = (bottom - top - band - gap * (rows - 2)) / rows
  const out: Element[] = []
  let y = top
  let n = 1
  for (let r = 0; r < rows; r++) {
    if (r === 3) {
      out.push(veil(x0, y, cw, band - gap, 0.7))
      out.push({ type: 'text', text: '{{collageCaption}}', x: x0 + 0.15, y: y + 0.02, w: cw - 0.3, h: band - gap - 0.04, font: SCRIPT, size: 34, minSize: 16, color: NAVY, maxLines: 1, valign: 'middle', showIf: 'collageCaption' })
      y += band
    }
    const wide = (cw - gap) * 0.6
    const narrow = cw - gap - wide
    const [w1, w2] = r % 2 === 0 ? [wide, narrow] : [narrow, wide]
    out.push({ type: 'photo', field: `collagePhotos_${n++}`, x: x0, y, w: w1, h: rh })
    out.push({ type: 'photo', field: `collagePhotos_${n++}`, x: x0 + w1 + gap, y, w: w2, h: rh })
    y += rh + gap
  }
  return out
}

const fields: Field[] = withFields('photo', [
  { id: 'coverLead', type: 'textarea', rows: 2, label: 'Lines above the name', default: 'A Celebration of Life\nIn Memory of', section: 'Front cover' },
  {
    id: 'photo2',
    type: 'photo',
    label: 'Back cover photo (optional)',
    removeBackground: true,
    hint: 'A second photo of your loved one for the back cover. Remove background places them right on the clouds. Leave empty to show only sky.',
    section: 'Back cover',
  },
  {
    id: 'outsidePhotos',
    type: 'photo',
    count: 6,
    label: 'Flap photos',
    hint: 'Three across the top and three across the bottom of the inside flap.',
    section: 'Inside flap',
  },
  { id: 'poemTitle', type: 'text', label: 'Poem title', default: 'Remember Me', section: 'Inside flap' },
  {
    id: 'poem',
    type: 'textarea',
    rows: 6,
    label: 'Poem (optional)',
    hint: 'Shown between the photos on the inside flap. Leave blank to hide it.',
    section: 'Inside flap',
    default:
      'When I am gone, remember me\nIn the quiet morning light,\nIn laughter shared around the table\nAnd the stars that fill the night.\n\nDo not grieve too long for me,\nFor I have only gone ahead.\nHold close the love we built together\nAnd the gentle words we said.\n\nAnd when the wind moves through the trees\nOr sunlight warms the land,\nKnow I am near you, always,\nAnd still holding your hand.',
  },
  { id: 'obituaryPhoto', type: 'photo', label: 'Obituary photo', hint: 'A smaller photo beside the obituary.', section: 'Inside' },
  { id: 'collageCaption', type: 'text', label: 'Collage caption', default: 'Memories of Family and Friends...', hint: 'Leave blank to hide it.', section: 'Inside' },
  { id: 'collagePhotos', type: 'photo', count: 12, label: 'Memory collage', hint: 'Twelve photos down the middle of the inside.', section: 'Inside' },
]).map((f): Field =>
  f.id === 'photo' && f.type === 'photo'
    ? { ...f, removeBackground: true, hint: 'Drag the photo to reposition it. Turn on Remove background to place them right over the flag.' }
    : f,
)

// Back cover: the words of thanks sit up top under a script heading, so the stack holds the rest.
const BACK_STACK = BACK_SECTIONS.filter((s) => s.body !== '{{familyMessage}}')

// Front cover geometry
const FX = left(2)
const FLAG_W = 7.6 // runs from the fold past the right bleed (the overhang is trimmed off)
const FLAG_H = (FLAG_W * 1855) / 2400

export const funeralFlagTabloid: Template = {
  id: 'funeral-flag-tabloid',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-flag-tabloid',
  name: 'Flag & Clouds Large Trifold',
  description: 'A large trifold with a soft sky, a waving American flag behind a cut-out portrait, and a twelve-photo memory collage inside.',
  trim: { w: W, h: H },
  sizeLabel: '17 x 11 in trifold, folds to 5.67 x 11 in',
  safeMargin: 0.25,
  fields,
  thumbnailSide: 'outside',
  thumbnailCrop: { x: P2, y: 0, w: PW, h: H },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: '#cfe0f1',
      folds: [P1, P2],
      panels: ['Inside flap', 'Back cover', 'Front cover'],
      elements: [
        sky,
        wash,

        // Inside flap: three photos, a poem, three photos
        ...photoRow(0.45, 1, 2.0),
        veil(left(0), 2.75, CW, 5.5, 0.55),
        { ...scriptHeading('{{poemTitle}}', left(0) + 0.2, 2.9, CW - 0.4, 36), showIf: 'poem' },
        { type: 'text', text: '{{poem}}', x: left(0) + 0.25, y: 3.75, w: CW - 0.5, h: 4.35, font: SERIF, weight: 600, italic: true, size: 15, minSize: 9, color: INK, lineHeight: 1.3, valign: 'middle', showIf: 'poem' },
        ...photoRow(H - 0.45 - 2.0, 4, 2.0),

        // Back cover
        { ...scriptHeading('With Gratitude', left(1), 0.45), showIf: 'familyMessage' },
        { type: 'text', text: '{{familyMessage}}', x: left(1) + 0.15, y: 1.3, w: CW - 0.3, h: 1.15, font: SERIF, weight: 600, italic: true, size: 15, minSize: 9, color: INK, lineHeight: 1.25, valign: 'top', showIf: 'familyMessage' },
        { type: 'photo', field: 'photo2', x: left(1) + 0.6, y: 2.5, w: CW - 1.2, h: 3.0, optional: true },
        veil(left(1), 5.6, CW, 5.0, 0.6),
        {
          type: 'stack', x: left(1) + 0.2, y: 5.72, w: CW - 0.4, h: 3.45, gap: 0.16, headingGap: 0.03, valign: 'middle',
          heading: { font: SCRIPT, size: 22, color: NAVY, lineHeight: 1.0 },
          body: { font: SERIF, weight: 600, size: 13.5, color: INK, lineHeight: 1.2 },
          items: BACK_STACK,
        },
        { type: 'line', x: left(1) + CW / 2 - 0.6, y: 9.3, points: [0, 0, 1.2, 0], stroke: NAVY, strokeWidth: 0.7, opacity: 0.6 },
        { type: 'text', text: 'Services entrusted to', x: left(1) + 0.2, y: 9.4, w: CW - 0.4, h: 0.3, font: SERIF, weight: 600, italic: true, size: 13, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: left(1) + 0.2, y: 9.68, w: CW - 0.4, h: 0.38, font: SERIF, weight: 700, size: 16, minSize: 9, color: NAVY, maxLines: 1 },
        { type: 'text', text: '{{funeralHomeDetails}}', x: left(1) + 0.2, y: 10.05, w: CW - 0.4, h: 0.5, font: SERIF, weight: 600, size: 12.5, minSize: 7, color: INK, lineHeight: 1.15 },

        // Front cover: script lead lines and name, then the flag behind the portrait
        veil(FX - 0.15, 0.35, CW + 0.3, 3.25, 0.45),
        { type: 'text', text: '{{coverLead}}', x: FX, y: 0.45, w: CW, h: 1.25, font: SCRIPT, size: 34, minSize: 16, color: '#111111', lineHeight: 1.05, valign: 'middle' },
        { type: 'text', text: '{{name}}', x: FX - 0.1, y: 1.72, w: CW + 0.2, h: 1.35, font: SCRIPT, size: 54, minSize: 22, color: NAVY, maxLines: 2, lineHeight: 0.98, valign: 'middle' },
        { type: 'text', text: '{{birthDate}}  to  {{deathDate}}', x: FX, y: 3.08, w: CW, h: 0.36, font: SERIF, weight: 700, size: 16, minSize: 9, color: SOFT, maxLines: 1 },
        { type: 'image', src: `${ART}/flag.png`, x: P2, y: H + 0.125 - FLAG_H, w: FLAG_W, h: FLAG_H },
        { type: 'rect', x: FX + 0.32, y: 3.75, w: CW - 0.64, h: 4.92, fill: '#ffffff', hideWhenCutout: 'photo' },
        { type: 'photo', field: 'photo', x: FX + 0.4, y: 3.83, w: CW - 0.8, h: 4.76 },
        veil(FX, 8.85, CW, 1.75, 0.9),
        { type: 'text', text: '{{serviceDate}}\n{{serviceTime}}', x: FX + 0.15, y: 8.97, w: CW - 0.3, h: 0.72, font: SERIF, weight: 700, size: 17, minSize: 10, color: INK, lineHeight: 1.12 },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: FX + 0.15, y: 9.7, w: CW - 0.3, h: 0.8, font: SERIF, weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.12 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#cfe0f1',
      folds: [P1, P2],
      panels: ['Inside left', 'Inside middle', 'Inside right'],
      elements: [
        sky,
        wash,

        // Inside left: Life's Reflections with a small framed photo
        veil(left(0), 0.4, CW, H - 0.8, 0.6),
        scriptHeading("Life's Reflections", left(0) + 0.15, 0.5, CW - 0.3, 40),
        { type: 'rect', x: left(0) + CW / 2 - 1.04, y: 1.36, w: 2.08, h: 2.48, fill: '#ffffff', stroke: '#c9d3e2', strokeWidth: 0.75 },
        { type: 'photo', field: 'obituaryPhoto', x: left(0) + CW / 2 - 0.96, y: 1.44, w: 1.92, h: 2.32 },
        { type: 'text', text: '{{obituary}}', x: left(0) + 0.25, y: 4.05, w: CW - 0.5, h: 5.85, font: SERIF, weight: 600, size: 15, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: left(0) + 0.25, y: 9.95, w: CW - 0.5, h: 0.5, font: SERIF, weight: 600, italic: true, size: 15, minSize: 9, color: NAVY, showIf: 'closingQuote' },

        // Inside middle: memory collage
        ...collage(),

        // Inside right: order of service
        veil(left(2), 0.4, CW, H - 0.8, 0.6),
        scriptHeading('Order of Service', left(2) + 0.15, 0.5, CW - 0.3, 40),
        { type: 'text', text: '{{orderOfService}}', x: left(2) + 0.25, y: 1.5, w: CW - 0.5, h: 6.6, font: SERIF, weight: 600, size: 17, minSize: 8, color: INK, lineHeight: 1.75, leaders: true, valign: 'top' },
        { type: 'line', x: left(2) + CW / 2 - 0.6, y: 8.35, points: [0, 0, 1.2, 0], stroke: NAVY, strokeWidth: 0.7, opacity: 0.6 },
        { type: 'text', text: 'Officiating', x: left(2) + 0.25, y: 8.5, w: CW - 0.5, h: 0.32, font: SERIF, weight: 600, italic: true, size: 14, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: left(2) + 0.25, y: 8.82, w: CW - 0.5, h: 0.4, font: SERIF, weight: 700, size: 17, minSize: 9, color: NAVY, maxLines: 1, showIf: 'officiant' },
        { type: 'text', text: '{{location}}\n{{serviceDate}}, {{serviceTime}}', x: left(2) + 0.25, y: 9.4, w: CW - 0.5, h: 0.75, font: SERIF, weight: 600, size: 14, minSize: 8, color: INK, lineHeight: 1.2 },
      ],
    },
  ],
}
