import type { Element, Field, Template } from '../types'
import { BACK_SECTIONS, FUNERAL_FIELDS } from './funeral-shared'

/**
 * Gold Parchment Booklet: 8-page saddle-stitched program, 8.5 x 11 in pages,
 * printed on two 17 x 11 in sheets that are folded and stapled.
 *
 * Sides are listed as printer's spreads so the print file imposes correctly:
 *   Sheet 1 outside: page 8 (back cover) | page 1 (front cover)
 *   Sheet 1 inside:  page 2 | page 7
 *   Sheet 2 outside: page 6 | page 3
 *   Sheet 2 inside:  page 4 | page 5 (center spread)
 *
 * Aged parchment throughout, lighter rounded parchment panels on each page,
 * a portrait in a gilded oval frame and a script name on the cover.
 */

const ART = '/templates/gold-parchment'
const BROWN = '#3b2a1a' // body copy
const NAME = '#5b2f14' // script names and headings (warm reddish brown)
const GOLD = '#a8843f'
const SOFT = '#6b5136'
const SERIF = 'Cormorant Garamond' as const
const SCRIPT = 'Great Vibes' as const
const CAPS = 'Playfair Display' as const

const P = 8.5 // x of the right-hand page on every sheet

/** Opening of oval-frame.png (1042 x 1245 px), as fractions of the frame size. */
const OPEN = { cx: 521 / 1042, cy: 623.5 / 1245, rx: 341 / 1042, ry: 439.5 / 1245 }

const parchment: Element = { type: 'image', src: `${ART}/parchment.jpg`, x: -0.125, y: -0.125, w: 17.25, h: 11.25 }

/** Lighter rounded parchment panel inset on a page, with a gold rule. */
const panel = (x0: number, opacity = 0.82): Element[] => [
  { type: 'rect', x: x0 + 0.4, y: 0.4, w: 7.7, h: 10.2, radius: 0.35, fill: '#f8f1e2', opacity, stroke: GOLD, strokeWidth: 1.6 },
  { type: 'rect', x: x0 + 0.53, y: 0.53, w: 7.44, h: 9.94, radius: 0.27, stroke: GOLD, strokeWidth: 0.5, opacity: 0.7 },
]

/** Thin gold rule with a small diamond in the middle. */
const divider = (cx: number, y: number, half = 1.1): Element[] => [
  { type: 'line', x: cx - half, y, points: [0, 0, half - 0.14, 0], stroke: GOLD, strokeWidth: 0.8 },
  { type: 'line', x: cx + 0.14, y, points: [0, 0, half - 0.14, 0], stroke: GOLD, strokeWidth: 0.8 },
  { type: 'star', x: cx, y, points: 4, innerRadius: 0.025, outerRadius: 0.07, fill: GOLD },
]

/** A photo in the gilded oval frame. The frame's center is transparent, so the photo sits behind it. */
const ovalPortrait = (field: string, cx: number, y: number, w: number): Element[] => {
  const h = (w * 1245) / 1042
  const pw = 2 * (OPEN.rx * w + 0.04)
  const ph = 2 * (OPEN.ry * h + 0.04)
  return [
    { type: 'photo', field, shape: 'ellipse', x: cx - pw / 2, y: y + OPEN.cy * h - ph / 2, w: pw, h: ph },
    { type: 'image', src: `${ART}/oval-frame.png`, x: cx - w / 2, y, w, h },
  ]
}

/** A snapshot with a white border and a soft shadow, slightly tilted. */
const snapshot = (field: string, x: number, y: number, w: number, h: number, rotation: number): Element[] => [
  { type: 'rect', x: x + 0.05, y: y + 0.07, w: w + 0.02, h: h + 0.02, fill: '#2a1a0c', opacity: 0.28, rotation },
  { type: 'photo', field, x, y, w, h, rotation, stroke: '#fffdf8', strokeWidth: 7 },
]

const pageHeading = (text: string, x0: number, y = 0.85): Element[] => [
  { type: 'text', text, x: x0 + 0.9, y, w: 6.7, h: 0.5, font: CAPS, weight: 400, size: 20, minSize: 12, uppercase: true, letterSpacing: 0.16, color: NAME, maxLines: 1 },
  ...divider(x0 + 4.25, y + 0.62),
]

const backSection = (...ids: string[]) => BACK_SECTIONS.filter((s) => ids.some((id) => s.body === `{{${id}}}`))

const HIDE = 'Leave blank to hide this section.'

const EXTRA: Record<string, Field[]> = {
  name: [{ id: 'coverLead', type: 'text', label: 'Line above the portrait', default: 'Celebrating the Life of', section: 'Front cover' }],
  photo: [
    { id: 'obitPhoto', type: 'photo', label: 'Photo beside the obituary (page 2)', hint: 'A second portrait works well here.', section: 'Inside' },
  ],
  obituary: [
    { id: 'tributeTitle', type: 'text', label: 'Tribute title (page 6)', default: 'Forever Loved', section: 'Inside' },
    {
      id: 'tribute',
      type: 'textarea',
      label: 'Tribute or poem (page 6)',
      rows: 6,
      section: 'Inside',
      hint: 'A poem, scripture or a few words from the family. Long text shrinks to fit.',
      default:
        'Do not stand in sorrow long,\nfor I have only gone ahead\nto walk the gardens of the Lord,\nwhere every tear is comforted.\n\nRemember me in morning light,\nin Sunday hymns and garden rows,\nin every kindness that you share,\nin every loving word that grows.\n\nAnd when the evening shadows fall\nand you are missing me the most,\nlook up and know that I am home,\nand love is never truly lost.',
    },
    { id: 'tributePhotos', type: 'photo', label: 'Photos under the tribute (page 6)', count: 3, section: 'Inside' },
    { id: 'memories', type: 'photo', label: 'Cherished Memories collage (pages 4 and 5)', count: 11, hint: 'Mix of family photos. Drag each photo to reposition it.', section: 'Inside' },
  ],
  orderOfService: [
    { id: 'familyPhoto', type: 'photo', label: 'Framed photo (page 7)', hint: 'Shown in a gold oval frame under the acknowledgments.', section: 'Inside' },
  ],
  repast: [
    {
      id: 'backMessage',
      type: 'textarea',
      label: 'Closing message (back cover)',
      rows: 3,
      section: 'Back cover',
      hint: HIDE,
      default: 'We thank God for the gift of her life and for every memory she leaves behind. Though our hearts are heavy, we rejoice that she is at peace.',
    },
    {
      id: 'militaryService',
      type: 'text',
      label: 'Military service',
      default: '',
      placeholder: 'United States Army Veteran',
      section: 'Back cover',
      hint: 'For a veteran, type a line such as "United States Army Veteran" to show the American flag on the back cover. Leave blank for no flag.',
    },
  ],
}

const fields: Field[] = FUNERAL_FIELDS.flatMap((f) => [f, ...(EXTRA[f.id] ?? [])])

export const funeralGoldBooklet: Template = {
  id: 'funeral-gold-booklet',
  category: 'funeral-programs',
  shopifyHandle: 'funeral-program-gold-booklet',
  name: 'Gold Parchment Booklet',
  description:
    'An 8-page booklet on aged gold parchment, with a portrait in a gilded oval frame, a script name, the full obituary, a two-page photo collage and an optional flag for veterans.',
  trim: { w: 17, h: 11 },
  sizeLabel: '8-page booklet, 8.5 x 11 in pages',
  safeMargin: 0.25,
  fields,
  thumbnailSide: 'sheet1-outside',
  thumbnailCrop: { x: P, y: 0, w: 8.5, h: 11 },
  sides: [
    {
      id: 'sheet1-outside',
      label: 'Covers (pages 8 and 1)',
      background: '#d8c6a2',
      folds: [P],
      panels: ['Page 8 (back cover)', 'Page 1 (front cover)'],
      elements: [
        parchment,
        ...panel(0),
        ...panel(P),

        // Page 1: front cover
        { type: 'text', text: '{{coverLead}}', x: P + 0.85, y: 0.75, w: 6.8, h: 0.8, font: SCRIPT, size: 38, minSize: 20, color: NAME, maxLines: 1 },
        ...ovalPortrait('photo', P + 4.25, 1.6, 3.85),
        { type: 'text', text: '{{name}}', x: P + 0.75, y: 6.32, w: 7.0, h: 1.3, font: SCRIPT, size: 48, minSize: 22, color: NAME, maxLines: 2, lineHeight: 1.0 },
        { type: 'text', text: '{{birthDate}}  to  {{deathDate}}', x: P + 0.9, y: 7.68, w: 6.7, h: 0.4, font: SERIF, weight: 700, size: 17, minSize: 10, color: BROWN, maxLines: 1 },
        ...divider(P + 4.25, 8.28),
        { type: 'text', text: '{{serviceDate}}\n{{serviceTime}}', x: P + 0.9, y: 8.45, w: 6.7, h: 0.66, font: SERIF, weight: 700, size: 15, minSize: 9, color: BROWN, lineHeight: 1.15 },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: P + 0.9, y: 9.14, w: 6.7, h: 1.08, font: SERIF, weight: 600, size: 14, minSize: 8, color: BROWN, lineHeight: 1.15 },

        // Page 8: back cover
        { type: 'text', text: 'Forever in Our Hearts', x: 0.9, y: 0.8, w: 6.7, h: 0.75, font: SCRIPT, size: 34, minSize: 20, color: NAME, maxLines: 1 },
        { type: 'text', text: '{{backMessage}}', x: 1.0, y: 1.65, w: 6.5, h: 1.75, font: SERIF, weight: 600, italic: true, size: 15, minSize: 9, color: BROWN, lineHeight: 1.3, showIf: 'backMessage' },
        // Ornament shown when there is no flag. The flag and its border cover it for a veteran.
        ...divider(4.25, 4.35, 1.3),
        { type: 'text', text: 'Rest in Peace', x: 2.8, y: 4.5, w: 2.9, h: 0.85, font: SCRIPT, size: 32, minSize: 18, color: GOLD, maxLines: 1 },
        ...divider(4.25, 5.55, 1.3),
        { type: 'rect', x: 2.7, y: 3.65, w: 3.1, h: 2.03, fill: '#fffdf8', stroke: GOLD, strokeWidth: 1.2, showIf: 'militaryService' },
        { type: 'image', src: `${ART}/flag.jpg`, x: 2.75, y: 3.7, w: 3.0, h: 1.95, showIf: 'militaryService' },
        { type: 'text', text: '{{militaryService}}', x: 0.9, y: 5.78, w: 6.7, h: 0.4, font: CAPS, weight: 400, italic: true, size: 14, minSize: 9, color: NAME, maxLines: 1, showIf: 'militaryService' },
        {
          type: 'stack', x: 0.9, y: 6.35, w: 6.7, h: 2.6, gap: 0.22, headingGap: 0.05, valign: 'middle',
          heading: { font: CAPS, weight: 400, size: 13, color: NAME, uppercase: true, letterSpacing: 0.14, lineHeight: 1.1 },
          body: { font: SERIF, weight: 600, size: 14, color: BROWN, lineHeight: 1.2 },
          items: backSection('interment', 'repast'),
        },
        ...divider(4.25, 9.12, 0.8),
        { type: 'text', text: 'Services entrusted to', x: 0.9, y: 9.2, w: 6.7, h: 0.28, font: SERIF, weight: 600, italic: true, size: 12, color: SOFT },
        { type: 'text', text: '{{funeralHome}}', x: 0.9, y: 9.46, w: 6.7, h: 0.34, font: SERIF, weight: 700, size: 15, minSize: 9, color: NAME, maxLines: 1 },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.9, y: 9.8, w: 6.7, h: 0.5, font: SERIF, weight: 600, size: 12, minSize: 7, color: BROWN, lineHeight: 1.15 },
      ],
    },
    {
      id: 'sheet1-inside',
      label: 'Pages 2 and 7',
      background: '#d8c6a2',
      folds: [P],
      panels: ['Page 2', 'Page 7'],
      elements: [
        parchment,
        ...panel(0, 0.9),
        ...panel(P, 0.9),

        // Page 2: obituary with a framed portrait
        ...pageHeading('Obituary', 0),
        { type: 'rect', x: 0.98, y: 1.83, w: 2.6, h: 3.3, fill: '#2a1a0c', opacity: 0.25 },
        { type: 'photo', field: 'obitPhoto', x: 0.9, y: 1.75, w: 2.6, h: 3.3, stroke: GOLD, strokeWidth: 3 },
        { type: 'text', text: '{{name}}', x: 3.8, y: 2.05, w: 3.8, h: 1.55, font: SCRIPT, size: 34, minSize: 18, color: NAME, maxLines: 3, lineHeight: 1.05 },
        ...divider(5.7, 3.8, 1.0),
        { type: 'text', text: 'Sunrise  {{birthDate}}\nSunset  {{deathDate}}', x: 3.8, y: 3.95, w: 3.8, h: 0.75, font: SERIF, weight: 700, size: 14, minSize: 9, color: BROWN, lineHeight: 1.25 },
        { type: 'text', text: '{{obituary}}', x: 0.9, y: 5.35, w: 6.7, h: 4.35, font: SERIF, weight: 600, size: 13.5, minSize: 8, color: BROWN, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.9, y: 9.78, w: 6.7, h: 0.45, font: SERIF, weight: 600, italic: true, size: 14, minSize: 9, color: NAME, maxLines: 2, showIf: 'closingQuote' },

        // Page 7: acknowledgments
        ...pageHeading('Acknowledgments', P),
        {
          type: 'stack', x: P + 0.9, y: 1.75, w: 6.7, h: 5.45, gap: 0.32, headingGap: 0.07, valign: 'middle',
          heading: { font: CAPS, weight: 400, size: 14, color: NAME, uppercase: true, letterSpacing: 0.14, lineHeight: 1.1 },
          body: { font: SERIF, weight: 600, size: 15, color: BROWN, lineHeight: 1.25 },
          items: backSection('pallbearers', 'flowerBearers', 'familyMessage'),
        },
        ...ovalPortrait('familyPhoto', P + 4.25, 7.4, 2.45),
      ],
    },
    {
      id: 'sheet2-outside',
      label: 'Pages 6 and 3',
      background: '#d8c6a2',
      folds: [P],
      panels: ['Page 6', 'Page 3'],
      elements: [
        parchment,
        ...panel(0, 0.9),
        ...panel(P, 0.9),

        // Page 6: tribute or poem with three snapshots
        { type: 'text', text: '{{tributeTitle}}', x: 0.9, y: 0.75, w: 6.7, h: 0.8, font: SCRIPT, size: 38, minSize: 20, color: NAME, maxLines: 1 },
        ...divider(4.25, 1.68),
        { type: 'text', text: '{{tribute}}', x: 0.9, y: 1.9, w: 6.7, h: 4.6, font: SERIF, weight: 600, italic: true, size: 15, minSize: 8, color: BROWN, lineHeight: 1.3 },
        ...snapshot('tributePhotos_1', 0.95, 6.95, 2.05, 2.65, -3),
        ...snapshot('tributePhotos_2', 3.22, 6.8, 2.05, 2.65, 1.5),
        ...snapshot('tributePhotos_3', 5.5, 6.85, 2.05, 2.65, 3),

        // Page 3: order of service
        ...pageHeading('Order of Service', P),
        { type: 'text', text: '{{serviceDate}}  at  {{serviceTime}}\n{{location}}', x: P + 0.9, y: 1.68, w: 6.7, h: 0.62, font: SERIF, weight: 600, italic: true, size: 14, minSize: 9, color: SOFT, lineHeight: 1.2 },
        { type: 'text', text: '{{orderOfService}}', x: P + 0.9, y: 2.55, w: 6.7, h: 6.0, font: SERIF, weight: 600, size: 15, minSize: 8, color: BROWN, lineHeight: 1.6, leaders: true, valign: 'top' },
        ...divider(P + 4.25, 8.85, 0.8),
        { type: 'text', text: 'Officiating', x: P + 0.9, y: 9.0, w: 6.7, h: 0.3, font: SERIF, weight: 600, italic: true, size: 13, color: SOFT, showIf: 'officiant' },
        { type: 'text', text: '{{officiant}}', x: P + 0.9, y: 9.3, w: 6.7, h: 0.6, font: SCRIPT, size: 28, minSize: 14, color: NAME, maxLines: 1, showIf: 'officiant' },
      ],
    },
    {
      id: 'sheet2-inside',
      label: 'Pages 4 and 5',
      background: '#d8c6a2',
      folds: [P],
      panels: ['Page 4 (center spread)', 'Page 5 (center spread)'],
      elements: [
        parchment,
        { type: 'rect', x: -0.125, y: -0.125, w: 17.25, h: 11.25, fill: '#fbf6ea', opacity: 0.25 },

        // Page 4
        { type: 'text', text: 'Cherished Memories', x: 0.6, y: 0.5, w: 7.3, h: 0.95, font: SCRIPT, size: 46, minSize: 24, color: NAME, maxLines: 1 },
        ...divider(4.25, 1.55, 1.4),
        ...snapshot('memories_1', 0.75, 2.05, 3.5, 2.6, -3),
        ...snapshot('memories_2', 4.5, 1.95, 3.3, 2.55, 2.5),
        ...snapshot('memories_3', 0.8, 5.05, 3.1, 4.3, 2),
        ...snapshot('memories_4', 4.3, 4.95, 3.5, 2.55, -2),
        ...snapshot('memories_5', 4.55, 7.7, 3.25, 2.45, 2.5),

        // Page 5
        ...snapshot('memories_6', 9.05, 0.75, 3.5, 2.6, -2),
        ...snapshot('memories_7', 12.95, 0.6, 3.25, 2.95, 3),
        ...snapshot('memories_8', 9.15, 3.75, 3.0, 3.6, 2),
        ...snapshot('memories_9', 12.55, 4.0, 3.6, 2.65, -3),
        ...snapshot('memories_10', 9.05, 7.75, 3.5, 2.55, -2.5),
        ...snapshot('memories_11', 12.85, 7.15, 3.3, 2.95, 2),
      ],
    },
  ],
}
