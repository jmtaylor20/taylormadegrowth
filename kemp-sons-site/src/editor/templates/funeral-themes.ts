import type { Element, Field, FontFamily, PhotoEl, Side, Template } from '../types'
import { BACK_SECTIONS, FUNERAL_FIELDS } from './funeral-shared'
import { kempCollage } from './collage'

/**
 * The theme collection: 20 painted backgrounds (from the shop's Google Drive,
 * "Funeral Programs / funeral-artwork-*"), each laid out in four sizes:
 *
 *   fold           11 x 8.5 in, folds to 5.5 x 8.5 in      back / front
 *   trifold        14 x 8.5 in roll fold                    flap / back / front
 *   large-fold     17 x 11 in, folds to 8.5 x 11 in         back / front
 *   large-trifold  17 x 11 in roll fold                     flap / back / front
 *
 * Backgrounds are pre-composed per size and side (public/templates/themes/
 * <theme>/<size>-<side>.jpg): the front cover carries the full painting, the
 * other panels a soft wash of it, so text reads anywhere. One layout per size
 * is shared by every theme; a theme only sets its colors, script face and
 * portrait shape.
 */

type Shape = 'arch' | 'ellipse' | 'rect'

export interface Theme {
  slug: string
  name: string
  blurb: string
  /** Text on the front cover (sits on the full painting). */
  cover: string
  coverSoft: string
  /** Accent for headings and rules (cover and inside). */
  accent: string
  /** Accent used on the cover, when it differs (dark covers). */
  coverAccent?: string
  script: FontFamily
  /** Script size multiplier: faces differ a lot in apparent size. */
  scriptScale?: number
  shape: Shape
  frame: string
  /** Soft panel behind the cover's service details, over busy art. */
  veil?: { fill: string; opacity: number }
  /** Cover text below the portrait instead of above (art sits at the top). */
  textBelow?: boolean
  /** Soft panel behind the name too, where the art runs under it. */
  topVeil?: boolean
}

const CREAM = { fill: '#FAF9F5', opacity: 0.72 }
const NIGHT = { fill: '#0b1426', opacity: 0.35 }

export const THEMES: Theme[] = [
  { slug: 'white-lily', name: 'White Lily', blurb: 'White lilies and eucalyptus on warm cream', cover: '#2d3328', coverSoft: '#56604f', accent: '#5f7a5a', script: 'Adage Script', scriptScale: 0.9, shape: 'ellipse', frame: '#8a9a7f', veil: CREAM, topVeil: true },
  { slug: 'garden-rose', name: 'Garden Rose', blurb: 'Blush roses and peonies on soft parchment', cover: '#3a2a2c', coverSoft: '#6a5456', accent: '#a3505a', script: 'adelia', scriptScale: 0.85, shape: 'ellipse', frame: '#c9a2a0', veil: CREAM, topVeil: true },
  { slug: 'lavender-grace', name: 'Lavender Grace', blurb: 'Wisteria and lavender on pale stone', cover: '#33284a', coverSoft: '#5d5270', accent: '#6b4f8f', script: 'Great Vibes', shape: 'ellipse', frame: '#a493c4', veil: CREAM, textBelow: true, topVeil: true },
  { slug: 'blue-hydrangea', name: 'Blue Hydrangea', blurb: 'Blue hydrangeas and baby\'s breath', cover: '#1f2f48', coverSoft: '#4c5a70', accent: '#3d5f8f', script: 'adelia', scriptScale: 0.85, shape: 'ellipse', frame: '#8ea6c8', veil: CREAM },
  { slug: 'sunflower-light', name: 'Sunflower Light', blurb: 'Sunflowers and wild grasses in golden light', cover: '#3b2a10', coverSoft: '#64502c', accent: '#8a5a10', script: 'adelia', scriptScale: 0.85, shape: 'arch', frame: '#c99a3a', veil: CREAM },
  { slug: 'evergreen-peace', name: 'Evergreen Peace', blurb: 'Cedar and olive branches on parchment', cover: '#22301f', coverSoft: '#4c5a46', accent: '#3c5a3a', script: 'Andalusia', scriptScale: 0.85, shape: 'arch', frame: '#8a9a6a', veil: CREAM, topVeil: true },
  { slug: 'autumn-leaves', name: 'Autumn Leaves', blurb: 'Maple leaves in rust and gold', cover: '#3a2414', coverSoft: '#664a36', accent: '#9a4a1c', script: 'Great Vibes', shape: 'arch', frame: '#c98a4a', veil: CREAM },
  { slug: 'ocean-serenity', name: 'Ocean Serenity', blurb: 'A calm shoreline at sunrise', cover: '#14283a', coverSoft: '#2f4658', accent: '#2f5a7a', script: 'Great Vibes', shape: 'rect', frame: '#ffffff', veil: CREAM },
  { slug: 'sunrise-horizon', name: 'Sunrise Horizon', blurb: 'Rolling hills under a golden sunrise', cover: '#3a2414', coverSoft: '#5e4532', accent: '#a0552a', script: 'Great Vibes', shape: 'arch', frame: '#ffffff', veil: CREAM },
  { slug: 'starry-night', name: 'Starry Night', blurb: 'Deep navy sky with a glow on the horizon', cover: '#f6edd6', coverSoft: '#d9cfb8', accent: '#2c3e6b', coverAccent: '#e9cf8a', script: 'adelia', scriptScale: 0.85, shape: 'ellipse', frame: '#e9cf8a', veil: NIGHT },
  { slug: 'golden-filigree', name: 'Golden Filigree', blurb: 'Gold filigree frame on ivory', cover: '#3a2c14', coverSoft: '#66563a', accent: '#9a7a3a', script: 'Vivace', shape: 'ellipse', frame: '#c2a25a' },
  { slug: 'faithful-cross', name: 'Faithful Cross', blurb: 'A cross on a hilltop at dawn', cover: '#20283a', coverSoft: '#465066', accent: '#7a5a2a', script: 'Monotype Corsiva', scriptScale: 0.95, shape: 'arch', frame: '#ffffff', veil: CREAM },
  { slug: 'dove-of-peace', name: 'Dove of Peace', blurb: 'A white dove in a soft blue sky', cover: '#1c2c44', coverSoft: '#3f5068', accent: '#3f6a9a', script: 'Great Vibes', shape: 'arch', frame: '#ffffff', veil: CREAM, textBelow: true },
  { slug: 'butterfly-garden', name: 'Butterfly Garden', blurb: 'A monarch among wildflowers', cover: '#2e2a14', coverSoft: '#5a5436', accent: '#9a5a14', script: 'Great Vibes', shape: 'arch', frame: '#ffffff', veil: CREAM },
  { slug: 'patriotic-honor', name: 'Patriotic Honor', blurb: 'The American flag on deep navy', cover: '#ffffff', coverSoft: '#d6dbe6', accent: '#8a1f2b', coverAccent: '#e8c9a0', script: 'Blacksword', scriptScale: 0.85, shape: 'rect', frame: '#ffffff', veil: NIGHT },
  { slug: 'music-and-memory', name: 'Music and Memory', blurb: 'A violin and lilies on sheet music', cover: '#3a2414', coverSoft: '#5e4532', accent: '#7a4a22', script: 'Vivace', shape: 'arch', frame: '#c99a5a', veil: CREAM },
  { slug: 'rustic-woodland', name: 'Rustic Woodland', blurb: 'A sunlit path through the woods', cover: '#22261a', coverSoft: '#4a503c', accent: '#4f5a2a', script: 'Andalusia', scriptScale: 0.85, shape: 'rect', frame: '#ffffff', veil: CREAM, topVeil: true },
  { slug: 'celestial-light', name: 'Celestial Light', blurb: 'A crescent moon over violet clouds', cover: '#ffffff', coverSoft: '#efe8f8', accent: '#5b4a9c', coverAccent: '#fbe3c4', script: 'adelia', scriptScale: 0.85, shape: 'ellipse', frame: '#ffffff', veil: { fill: '#3a2c6a', opacity: 0.3 } },
  { slug: 'black-and-gold', name: 'Black and Gold', blurb: 'Gold lilies on black, framed in gold', cover: '#ead9a6', coverSoft: '#cbb98a', accent: '#8a6d2b', coverAccent: '#d9bc72', script: 'Vivace', shape: 'ellipse', frame: '#d9bc72' },
  { slug: 'modern-minimal', name: 'Modern Minimal', blurb: 'Quiet arches in warm stone', cover: '#2e2a26', coverSoft: '#615a52', accent: '#7a6f63', script: 'Playfair Display', scriptScale: 0.7, shape: 'arch', frame: '#ffffff' },
]

interface Format {
  id: 'fold' | 'trifold' | 'large-fold' | 'large-trifold'
  suffix: string
  handle: string
  w: number
  h: number
  folds: number[]
  sizeLabel: string
}

export const THEME_FORMATS: Format[] = [
  { id: 'fold', suffix: '', handle: 'funeral-program-theme-fold', w: 11, h: 8.5, folds: [5.5], sizeLabel: '11 x 8.5 in sheet, folds to 5.5 x 8.5 in' },
  { id: 'trifold', suffix: ' Trifold', handle: 'funeral-program-theme-trifold', w: 14, h: 8.5, folds: [4.625, 9.3125], sizeLabel: '14 x 8.5 in trifold, folds to 4.69 x 8.5 in' },
  { id: 'large-fold', suffix: ' Large', handle: 'funeral-program-theme-large-fold', w: 17, h: 11, folds: [8.5], sizeLabel: '17 x 11 in sheet, folds to 8.5 x 11 in' },
  { id: 'large-trifold', suffix: ' Large Trifold', handle: 'funeral-program-theme-large-trifold', w: 17, h: 11, folds: [5.625, 11.3125], sizeLabel: '17 x 11 in trifold, folds to 5.69 x 11 in' },
]

const SERIF: FontFamily = 'Adobe Garamond Pro'
const INK = '#2b2622'
const BODY = '#332d28'
const SOFT = '#5d544c'

const PSALM =
  'The Lord is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures:\nhe leadeth me beside the still waters.\nHe restoreth my soul.\nYea, though I walk through the valley of the shadow of death,\nI will fear no evil: for thou art with me;\nthy rod and thy staff they comfort me.\nSurely goodness and mercy shall follow me\nall the days of my life:\nand I will dwell in the house of the Lord for ever.'

function fieldsFor(f: Format): Field[] {
  const lead: Field = { id: 'coverLead', type: 'text', label: 'Line above the name', default: 'Celebrating the Life of', section: 'Front cover' }
  const out: Field[] = []
  for (const x of FUNERAL_FIELDS) {
    if (x.id === 'name') out.push(lead)
    out.push(x)
    if (x.id === 'closingQuote' && f.id !== 'fold') {
      out.push(
        { id: 'memoryTitle', type: 'text', label: 'Photo collage heading', default: 'Cherished Memories', hint: 'Leave blank to hide it.', section: 'Photos' },
        { id: 'memoryPhotos', type: 'photo', label: 'Memory photos', count: 4 },
      )
    }
  }
  if (f.id === 'trifold' || f.id === 'large-trifold')
    out.push(
      { id: 'poemTitle', type: 'text', label: 'Poem or scripture title', default: 'The Twenty-Third Psalm', section: 'Outside flap' },
      { id: 'poem', type: 'textarea', rows: 8, label: 'Poem or scripture', default: PSALM, hint: 'Shown on the outside flap. Leave blank to hide it.', section: 'Outside flap' },
    )
  return out
}

function build(t: Theme, f: Format): Template {
  const { w: W, h: H, folds } = f
  const S = H / 8.5 // type scale: the 17 x 11 sizes run larger
  const edges = [0, ...folds, W]
  const n = folds.length + 1
  const IN = 0.42 * Math.min(S, 1.15)
  const box = (i: number) => ({ x: edges[i] + IN, w: edges[i + 1] - edges[i] - 2 * IN, cx: (edges[i] + edges[i + 1]) / 2 })
  const sz = (pt: number) => Math.round(pt * S * 2) / 2
  const scriptSize = (pt: number) => Math.round(pt * S * (t.scriptScale ?? 1) * 2) / 2
  const art = (side: string) => `/templates/themes/${t.slug}/${f.id}-${side}.jpg`
  const bg = (side: string): Element => ({ type: 'image', src: art(side), x: -0.125, y: -0.125, w: W + 0.25, h: H + 0.25 })
  const coverAccent = t.coverAccent ?? t.accent

  const script = (text: string, x: number, y: number, w: number, pt: number, color: string, extra: Partial<Element> = {}): Element =>
    ({ type: 'text', text, x, y, w, h: 0.72 * S, font: t.script, size: scriptSize(pt), minSize: scriptSize(pt) * 0.5, maxLines: 1, color, align: 'center', valign: 'middle', ...extra }) as Element

  const rule = (cx: number, y: number, color: string, len = 1.1): Element[] => [
    { type: 'line', x: cx - len / 2, y, points: [0, 0, len * 0.42, 0], stroke: color, strokeWidth: 0.7 },
    { type: 'line', x: cx + len * 0.08, y, points: [0, 0, len * 0.42, 0], stroke: color, strokeWidth: 0.7 },
    { type: 'line', x: cx, y, points: [-0.06, 0, 0, -0.05, 0.06, 0, 0, 0.05], closed: true, stroke: color, strokeWidth: 0.7, fill: color },
  ]

  // ---------- Front cover ----------
  const front = (): Element[] => {
    const b = box(n - 1)
    const pw = Math.min(b.w * 0.74, 3.5 * S)
    const ph = pw * (t.shape === 'rect' ? 1.25 : 1.3)
    const photo = (y: number): Element[] => {
      const x = b.cx - pw / 2
      const el: PhotoEl = { type: 'photo', field: 'photo', x, y, w: pw, h: ph, shape: t.shape === 'rect' ? 'rect' : t.shape, stroke: t.frame, strokeWidth: 2.5 }
      if (t.shape === 'rect') return [{ ...el, mat: 0.08, shadow: true, stroke: undefined, strokeWidth: undefined }]
      return [el]
    }
    const textBlock = (y: number): Element[] => [
      ...(t.topVeil && t.veil ? [{ type: 'rect', x: b.x - 0.05, y: y - 0.08 * S, w: b.w + 0.1, h: 1.48 * S, fill: t.veil.fill, opacity: 0.55, radius: 0.1 } as Element] : []),
      { type: 'text', text: '{{coverLead}}', x: b.x, y, w: b.w, h: 0.3 * S, font: SERIF, weight: 600, size: sz(10.5), minSize: 7, uppercase: true, letterSpacing: 0.18, color: t.coverSoft, align: 'center', valign: 'middle' },
      script('{{name}}', b.x - 0.1, y + 0.3 * S, b.w + 0.2, 34, t.cover),
      { type: 'text', text: '{{birthDate}}  ~  {{deathDate}}', x: b.x, y: y + 1.04 * S, w: b.w, h: 0.3 * S, font: SERIF, weight: 600, size: sz(12.5), minSize: 8, color: coverAccent, align: 'center', valign: 'middle', letterSpacing: 0.03 },
    ]
    const service = (y: number, h: number): Element[] => [
      ...(t.veil ? [{ type: 'rect', x: b.x + 0.15, y: y - 0.06, w: b.w - 0.3, h: h + 0.12, fill: t.veil.fill, opacity: t.veil.opacity, radius: 0.08 } as Element] : []),
      { type: 'text', text: '{{serviceDate}}  |  {{serviceTime}}\n{{location}}\n{{locationAddress}}', x: b.x + 0.25, y, w: b.w - 0.5, h, font: SERIF, weight: 600, size: sz(10.5), minSize: 7, color: t.cover, lineHeight: 1.18, align: 'center', valign: 'middle' },
    ]
    const top = 0.42 * S
    const serviceH = 0.78 * S
    if (t.textBelow) {
      const py = top + 0.05 * S
      const ty = py + ph + 0.18 * S
      return [...photo(py), ...textBlock(ty), ...service(H - IN - serviceH, serviceH)]
    }
    const py = top + 1.5 * S
    return [...textBlock(top), ...photo(py), ...service(H - IN - serviceH, serviceH)]
  }

  // ---------- Back cover: sections and the funeral home ----------
  const back = (i: number, withThanks: boolean): Element[] => {
    const b = box(i)
    return [
      {
        type: 'stack', x: b.x, y: IN + 0.2 * S, w: b.w, h: H - 2 * IN - 1.35 * S, gap: 0.26 * S, headingGap: 0.05, valign: 'middle',
        heading: { font: SERIF, weight: 700, size: sz(12.5), color: t.accent, uppercase: true, letterSpacing: 0.14, lineHeight: 1.1, align: 'center' },
        body: { font: SERIF, weight: 400, size: sz(12), color: BODY, lineHeight: 1.22, align: 'center' },
        items: BACK_SECTIONS.filter((s) => withThanks || s.body !== '{{familyMessage}}'),
        minScale: 0.6,
      },
      ...rule(b.cx, H - IN - 1.0 * S, t.accent),
      { type: 'text', text: '{{funeralHome}}', x: b.x, y: H - IN - 0.85 * S, w: b.w, h: 0.32 * S, font: SERIF, weight: 700, size: sz(12), minSize: 8, color: INK, align: 'center', valign: 'middle' },
      { type: 'text', text: '{{funeralHomeDetails}}', x: b.x, y: H - IN - 0.52 * S, w: b.w, h: 0.5 * S, font: SERIF, weight: 400, size: sz(10.5), minSize: 7, color: SOFT, lineHeight: 1.15, align: 'center', valign: 'top' },
    ]
  }

  // ---------- Inside pieces ----------
  const obituary = (i: number, y1 = H - IN): Element[] => {
    const b = box(i)
    return [
      script('Remembering {{firstName}}', b.x - 0.1, IN, b.w + 0.2, 30, INK),
      ...rule(b.cx, IN + 0.86 * S, t.accent),
      { type: 'text', text: '{{obituary}}', x: b.x, y: IN + 1.05 * S, w: b.w, h: y1 - IN - 1.05 * S - 0.75 * S, font: SERIF, weight: 400, size: sz(12), minSize: 7.5, color: BODY, lineHeight: 1.3, align: 'left', valign: 'top' },
      { type: 'text', text: '{{closingQuote}}', x: b.x, y: y1 - 0.6 * S, w: b.w, h: 0.6 * S, font: SERIF, weight: 400, italic: true, size: sz(12.5), minSize: 8, maxLines: 2, color: t.accent, lineHeight: 1.15, align: 'center', valign: 'middle', showIf: 'closingQuote' },
    ]
  }
  const service = (i: number, y0: number, y1: number, thanks: boolean): Element[] => {
    const b = box(i)
    const thanksH = thanks ? 1.45 * S : 0
    const listY = y0 + 0.9 * S
    const listH = y1 - listY - thanksH - 0.42 * S
    return [
      script('Order of Service', b.x - 0.1, y0, b.w + 0.2, 30, INK),
      ...rule(b.cx, y0 + 0.86 * S, t.accent),
      { type: 'text', text: '{{orderOfService}}', x: b.x, y: listY + 0.1 * S, w: b.w, h: listH, font: SERIF, weight: 400, size: sz(12), minSize: 7.5, color: BODY, lineHeight: 1.45, leaders: true, valign: 'top' },
      { type: 'text', text: 'Officiating: {{officiant}}', x: b.x, y: listY + listH + 0.12 * S, w: b.w, h: 0.3 * S, font: SERIF, weight: 400, italic: true, size: sz(11.5), minSize: 8, color: SOFT, align: 'center', showIf: 'officiant' },
      ...(thanks
        ? [
            ...rule(b.cx, y1 - thanksH + 0.12 * S, t.accent).map((e) => ({ ...e, showIf: 'familyMessage' })),
            { type: 'text', text: 'Words of Thanks', x: b.x, y: y1 - thanksH + 0.25 * S, w: b.w, h: 0.3 * S, font: SERIF, weight: 700, size: sz(12), uppercase: true, letterSpacing: 0.14, color: t.accent, align: 'center', showIf: 'familyMessage' } as Element,
            { type: 'text', text: '{{familyMessage}}', x: b.x, y: y1 - thanksH + 0.58 * S, w: b.w, h: thanksH - 0.6 * S, font: SERIF, weight: 400, size: sz(11.5), minSize: 7.5, color: BODY, lineHeight: 1.22, align: 'center', valign: 'top', showIf: 'familyMessage' } as Element,
          ]
        : []),
    ]
  }
  const memories = (i: number, y0: number, y1: number, rows = [2, 2]): Element[] => {
    const b = box(i)
    return [
      script('{{memoryTitle}}', b.x - 0.1, y0, b.w + 0.2, 28, INK, { showIf: 'memoryTitle' }),
      ...kempCollage('memoryPhotos', 4, { x: b.x, y: y0 + 0.85 * S, w: b.w, h: y1 - y0 - 0.85 * S }, { rows, seed: 3 }),
    ]
  }
  const poem = (i: number): Element[] => {
    const b = box(i)
    return [
      script('{{poemTitle}}', b.x - 0.1, IN + 0.5 * S, b.w + 0.2, 26, INK, { showIf: 'poem' }),
      ...rule(b.cx, IN + 1.35 * S, t.accent).map((e) => ({ ...e, showIf: 'poem' })),
      { type: 'text', text: '{{poem}}', x: b.x, y: IN + 1.55 * S, w: b.w, h: H - 2 * IN - 2.1 * S, font: SERIF, weight: 400, italic: true, size: sz(12.5), minSize: 8, color: BODY, lineHeight: 1.35, align: 'center', valign: 'middle', showIf: 'poem' },
    ]
  }

  let outside: Element[]
  let inside: Element[]
  let outPanels: string[]
  let inPanels: string[]
  if (f.id === 'fold') {
    outside = [bg('outside'), ...back(0, false), ...front()]
    inside = [bg('inside'), ...obituary(0), ...service(1, IN, H - IN, true)]
    outPanels = ['Back cover', 'Front cover']
    inPanels = ['Inside left', 'Inside right']
  } else if (f.id === 'large-fold') {
    outside = [bg('outside'), ...back(0, false), ...front()]
    const split = H - IN - 3.0
    inside = [bg('inside'), ...obituary(0, split - 0.1), ...memories(0, split, H - IN, [4]), ...service(1, IN, H - IN, true)]
    outPanels = ['Back cover', 'Front cover']
    inPanels = ['Inside left', 'Inside right']
  } else {
    outside = [bg('outside'), ...poem(0), ...back(1, false), ...front()]
    inside = [bg('inside'), ...obituary(0), ...service(1, IN, H - IN, true), ...memories(2, IN, H - IN - 0.75 * S), closing(2)]
    outPanels = ['Inside flap', 'Back cover', 'Front cover']
    inPanels = ['Inside left', 'Inside middle', 'Inside right']
  }

  function closing(i: number): Element {
    const b = box(i)
    return { type: 'text', text: '{{funeralHome}}', x: b.x, y: H - IN - 0.5 * S, w: b.w, h: 0.4 * S, font: SERIF, weight: 600, italic: true, size: sz(11), minSize: 7, color: SOFT, align: 'center', valign: 'middle' }
  }

  const sides: Side[] = [
    { id: 'outside', label: 'Outside', background: '#FAF9F5', folds, panels: outPanels, elements: outside },
    { id: 'inside', label: 'Inside', background: '#FAF9F5', folds, panels: inPanels, elements: inside },
  ]
  const cover = edges[n - 1]
  return {
    id: `funeral-${t.slug}${f.id === 'fold' ? '' : `-${f.id}`}`,
    category: 'funeral-programs',
    shopifyHandle: f.handle,
    name: `${t.name}${f.suffix}`,
    description: `${t.blurb}, with a portrait on the cover${f.id === 'fold' ? '' : ' and a photo collage inside'}.`,
    trim: { w: W, h: H },
    sizeLabel: f.sizeLabel,
    safeMargin: 0.25,
    fields: fieldsFor(f),
    thumbnailSide: 'outside',
    thumbnailCrop: { x: cover, y: 0, w: W - cover, h: H },
    sides,
  }
}

/** Every theme in every size, grouped by size (all the single folds, then the trifolds...). */
export const funeralThemes: Template[] = THEME_FORMATS.flatMap((f) => THEMES.map((t) => build(t, f)))
