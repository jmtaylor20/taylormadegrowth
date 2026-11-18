import type { Draft, PhotoState } from '../draft'
import type { Element, Template } from '../types'

/**
 * Memorial add-ons that match a funeral program: prayer cards, bookmarks, an
 * easel portrait and thank-you cards. Each program's artwork family has a
 * style here, so the add-ons use the same art and colors as the program the
 * family chose. They're laid out automatically from what was entered for the
 * program (photo, name, dates, verse, family message): no second design step.
 *
 * Kept out of TEMPLATES (no gallery, kiosk or prototype listing); templateById
 * still finds them so staff can adjust one before printing.
 */

const BLEED = 0.125

interface Style {
  id: string
  art: string
  /** Art size in pixels (for cover cropping). */
  aw: number
  ah: number
  /** Where to keep the art when cropping, 0..1 (0 = left/top). */
  ax: number
  ay: number
  ink: string
  accent: string
}

const STYLES: Style[] = [
  { id: 'sky', art: '/templates/clouds-doves/sky.jpg', aw: 3375, ah: 2625, ax: 0.5, ay: 0.3, ink: '#23395b', accent: '#5f7896' },
  { id: 'roses', art: '/templates/red-roses/roses.jpg', aw: 3375, ah: 2625, ax: 0.5, ay: 1, ink: '#3a1a1a', accent: '#a8302e' },
  { id: 'floral', art: '/templates/pink-floral/floral.jpg', aw: 3375, ah: 2625, ax: 0.35, ay: 0.5, ink: '#5a2440', accent: '#b8507a' },
  { id: 'tulips', art: '/templates/pink-tulips/tulips.jpg', aw: 3375, ah: 2625, ax: 0.5, ay: 0.6, ink: '#5a2440', accent: '#c0587a' },
  { id: 'stagger', art: '/templates/pink-stagger/floral.jpg', aw: 3375, ah: 2625, ax: 0.6, ay: 0.8, ink: '#4a2350', accent: '#9a3fa0' },
  { id: 'lilacs', art: '/templates/purple-lilacs/lilacs.jpg', aw: 5175, ah: 3375, ax: 0.78, ay: 0.4, ink: '#3e2a55', accent: '#7a5a9a' },
  { id: 'parchment', art: '/templates/gold-parchment/parchment.jpg', aw: 5175, ah: 3375, ax: 0.5, ay: 0.5, ink: '#4a3518', accent: '#8f6c2c' },
  { id: 'flag', art: '/templates/flag-clouds-trifold/flag-clouds.jpg', aw: 5025, ah: 2625, ax: 0.92, ay: 0.5, ink: '#1f2f4f', accent: '#a8302e' },
  { id: 'fishing', art: '/templates/gone-fishing/fishing-panel.jpg', aw: 1470, ah: 2625, ax: 0.5, ay: 0.85, ink: '#1f3340', accent: '#2f5d74' },
]

/** Which add-on style goes with each program. */
const PROGRAM_STYLE: Record<string, string> = {
  'funeral-clouds-doves': 'sky',
  'funeral-red-roses': 'roses',
  'funeral-pink-floral': 'floral',
  'funeral-pink-tulips': 'tulips',
  'funeral-pink-stagger': 'stagger',
  'funeral-purple-lilacs': 'lilacs',
  'funeral-gold-booklet': 'parchment',
  'funeral-flag-trifold': 'flag',
  'funeral-flag-tabloid': 'flag',
  'funeral-gone-fishing': 'fishing',
}

export type AddonKind = 'prayer' | 'bookmark' | 'portrait' | 'thankyou'

export const ADDON_KINDS: { kind: AddonKind; name: string; handle: string; blurb: string }[] = [
  { kind: 'prayer', name: 'Prayer cards', handle: 'memorial-prayer-cards', blurb: '2.75 x 4.25 in, photo on the front, verse on the back' },
  { kind: 'bookmark', name: 'Memorial bookmarks', handle: 'memorial-bookmarks', blurb: '2.5 x 8.5 in, printed both sides' },
  { kind: 'portrait', name: 'Easel portrait', handle: 'memorial-easel-portrait', blurb: '16 x 20 in portrait for the service' },
  { kind: 'thankyou', name: 'Thank-you cards', handle: 'memorial-thank-you-cards', blurb: 'Folded 4.25 x 5.5 in, for after the service' },
]

const SCRIPT = 'Great Vibes' as const
const SERIF = 'Cormorant Garamond' as const

/** The art placed to cover a box (inches), cropped around the style's focus point. */
function cover(s: Style, x: number, y: number, w: number, h: number): Element {
  const a = s.aw / s.ah
  let iw = w, ih = h
  if (a > w / h) iw = h * a
  else ih = w / a
  return { type: 'image', src: s.art, x: x + (w - iw) * s.ax, y: y + (h - ih) * s.ay, w: iw, h: ih }
}
const fullArt = (s: Style, w: number, h: number) => cover(s, -BLEED, -BLEED, w + 2 * BLEED, h + 2 * BLEED)
const panel = (x: number, y: number, w: number, h: number, opacity = 0.9): Element => ({ type: 'rect', x, y, w, h, fill: '#ffffff', opacity })

const FIELDS: Template['fields'] = [
  { id: 'photo', type: 'photo', label: 'Photo', section: 'Details' },
  { id: 'name', type: 'text', label: 'Full name', default: 'Mrs. Margaret Ellen Hayes', section: 'Details' },
  { id: 'firstName', type: 'text', label: 'First name or nickname', default: 'Margaret', section: 'Details' },
  { id: 'birthDate', type: 'text', label: 'Date of birth', default: 'March 3, 1942', section: 'Details' },
  { id: 'deathDate', type: 'text', label: 'Date of passing', default: 'October 28, 2026', section: 'Details' },
  {
    id: 'verse',
    type: 'textarea',
    rows: 5,
    label: 'Verse or poem',
    section: 'Details',
    default:
      'The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters. He restoreth my soul.\nPsalm 23',
  },
  {
    id: 'familyMessage',
    type: 'textarea',
    rows: 3,
    label: 'Thank-you message',
    section: 'Details',
    default: 'The family thanks you for every prayer, every meal, and every kind word during this time. Your love has carried us.',
  },
]

function prayer(s: Style): Template['sides'] {
  const W = 2.75, H = 4.25
  return [
    {
      id: 'front',
      label: 'Front',
      background: '#ffffff',
      elements: [
        fullArt(s, W, H),
        { type: 'photo', field: 'photo', shape: 'ellipse', x: 0.5, y: 0.32, w: 1.75, h: 2.2, stroke: '#ffffff', strokeWidth: 2 },
        panel(0.2, 2.68, 2.35, 1.37),
        { type: 'text', text: '{{name}}', x: 0.25, y: 2.74, w: 2.25, h: 0.78, font: SCRIPT, size: 20, minSize: 10, lineHeight: 0.95, color: s.ink },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: 0.25, y: 3.56, w: 2.25, h: 0.36, font: SERIF, weight: 700, size: 8, minSize: 5.5, color: s.accent },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: '#ffffff',
      elements: [
        fullArt(s, W, H),
        panel(0.18, 0.18, 2.39, 3.89, 0.92),
        { type: 'text', text: '{{verse}}', x: 0.33, y: 0.38, w: 2.09, h: 2.9, font: SERIF, weight: 600, italic: true, size: 9.5, minSize: 6, lineHeight: 1.3, color: s.ink },
        { type: 'line', x: 1.075, y: 3.38, points: [0, 0, 0.6, 0], stroke: s.accent, strokeWidth: 0.6 },
        { type: 'text', text: '{{name}}', x: 0.3, y: 3.46, w: 2.15, h: 0.28, font: SERIF, weight: 700, size: 7.5, minSize: 5, uppercase: true, letterSpacing: 0.08, color: s.ink },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: 0.3, y: 3.72, w: 2.15, h: 0.24, font: SERIF, weight: 600, size: 6.5, minSize: 4.5, color: s.accent },
      ],
    },
  ]
}

function bookmark(s: Style): Template['sides'] {
  const W = 2.5, H = 8.5
  return [
    {
      id: 'front',
      label: 'Front',
      background: '#ffffff',
      elements: [
        fullArt(s, W, H),
        { type: 'photo', field: 'photo', shape: 'ellipse', x: 0.38, y: 0.45, w: 1.74, h: 2.2, stroke: '#ffffff', strokeWidth: 2 },
        panel(0.2, 2.95, 2.1, 2.05),
        { type: 'text', text: '{{name}}', x: 0.25, y: 3.05, w: 2.0, h: 1.05, font: SCRIPT, size: 22, minSize: 11, lineHeight: 0.95, color: s.ink },
        { type: 'text', text: '{{birthDate}}\n{{deathDate}}', x: 0.25, y: 4.15, w: 2.0, h: 0.7, font: SERIF, weight: 700, size: 9, minSize: 6, lineHeight: 1.25, color: s.accent },
      ],
    },
    {
      id: 'back',
      label: 'Back',
      background: '#ffffff',
      elements: [
        fullArt(s, W, H),
        panel(0.18, 0.25, 2.14, 8.0, 0.92),
        { type: 'text', text: '{{verse}}', x: 0.32, y: 0.6, w: 1.86, h: 6.3, font: SERIF, weight: 600, italic: true, size: 11, minSize: 7, lineHeight: 1.35, color: s.ink },
        { type: 'line', x: 0.95, y: 7.1, points: [0, 0, 0.6, 0], stroke: s.accent, strokeWidth: 0.6 },
        { type: 'text', text: '{{name}}', x: 0.28, y: 7.2, w: 1.94, h: 0.42, font: SERIF, weight: 700, size: 8, minSize: 5, uppercase: true, letterSpacing: 0.08, color: s.ink },
        { type: 'text', text: '{{birthDate}}\n{{deathDate}}', x: 0.28, y: 7.6, w: 1.94, h: 0.5, font: SERIF, weight: 600, size: 7, minSize: 5, lineHeight: 1.2, color: s.accent },
      ],
    },
  ]
}

function portrait(s: Style): Template['sides'] {
  const W = 16, H = 20
  return [
    {
      id: 'front',
      label: 'Portrait',
      background: '#ffffff',
      elements: [
        fullArt(s, W, H),
        { type: 'rect', x: 1.9, y: 1.3, w: 12.2, h: 13.9, fill: '#ffffff' },
        { type: 'photo', field: 'photo', x: 2.25, y: 1.65, w: 11.5, h: 13.2 },
        panel(1.4, 15.6, 13.2, 3.5, 0.92),
        { type: 'text', text: '{{name}}', x: 1.7, y: 15.75, w: 12.6, h: 2.1, font: SCRIPT, size: 64, minSize: 30, lineHeight: 0.95, color: s.ink },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: 1.7, y: 17.95, w: 12.6, h: 0.9, font: SERIF, weight: 700, size: 26, minSize: 14, color: s.accent },
      ],
    },
  ]
}

function thankyou(s: Style): Template['sides'] {
  const F = 4.25, W = 8.5, H = 5.5
  return [
    {
      id: 'outside',
      label: 'Outside',
      background: '#ffffff',
      folds: [F],
      panels: ['Back', 'Front'],
      elements: [
        cover(s, F, -BLEED, W - F + BLEED, H + 2 * BLEED),
        { type: 'text', text: 'Printed by Kemp & Sons  |  Opelika, Alabama', x: 0.5, y: 4.95, w: 3.25, h: 0.2, font: SERIF, weight: 600, size: 6, uppercase: true, letterSpacing: 0.12, color: '#8f8a83' },
        panel(F + 0.4, 3.35, F - 0.8, 1.55),
        { type: 'text', text: 'Thank You', x: F + 0.45, y: 3.38, w: F - 0.9, h: 0.95, font: SCRIPT, size: 36, minSize: 18, color: s.ink },
        { type: 'text', text: '{{name}}', x: F + 0.45, y: 4.33, w: F - 0.9, h: 0.45, font: SERIF, weight: 700, size: 9, minSize: 6, uppercase: true, letterSpacing: 0.08, color: s.accent },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: '#ffffff',
      folds: [F],
      panels: ['Inside left', 'Inside right'],
      elements: [
        { type: 'photo', field: 'photo', shape: 'ellipse', x: 0.75, y: 0.5, w: 2.75, h: 3.35, stroke: s.accent, strokeWidth: 1 },
        { type: 'text', text: '{{name}}', x: 0.4, y: 4.0, w: 3.45, h: 0.75, font: SCRIPT, size: 20, minSize: 10, lineHeight: 0.95, color: s.ink },
        { type: 'text', text: '{{birthDate}}  |  {{deathDate}}', x: 0.4, y: 4.78, w: 3.45, h: 0.3, font: SERIF, weight: 700, size: 8, minSize: 5.5, color: s.accent },
        { type: 'text', text: '{{familyMessage}}', x: F + 0.5, y: 1.0, w: F - 1.0, h: 3.0, font: SERIF, weight: 600, italic: true, size: 13, minSize: 8, lineHeight: 1.35, color: s.ink },
        { type: 'text', text: 'With love,\nThe family of {{firstName}}', x: F + 0.5, y: 4.1, w: F - 1.0, h: 0.75, font: SERIF, weight: 700, size: 10, minSize: 6, lineHeight: 1.3, color: s.accent },
      ],
    },
  ]
}

const BUILD: Record<AddonKind, { trim: { w: number; h: number }; size: string; sides: (s: Style) => Template['sides']; fields: string[] }> = {
  prayer: { trim: { w: 2.75, h: 4.25 }, size: '2.75 x 4.25 in prayer card, printed both sides', sides: prayer, fields: ['photo', 'name', 'birthDate', 'deathDate', 'verse'] },
  bookmark: { trim: { w: 2.5, h: 8.5 }, size: '2.5 x 8.5 in bookmark, printed both sides', sides: bookmark, fields: ['photo', 'name', 'birthDate', 'deathDate', 'verse'] },
  portrait: { trim: { w: 16, h: 20 }, size: '16 x 20 in easel portrait', sides: portrait, fields: ['photo', 'name', 'birthDate', 'deathDate'] },
  thankyou: { trim: { w: 8.5, h: 5.5 }, size: '8.5 x 5.5 in sheet, folds to 4.25 x 5.5 in', sides: thankyou, fields: ['photo', 'name', 'firstName', 'birthDate', 'deathDate', 'familyMessage'] },
}

export const ADDON_TEMPLATES: Template[] = STYLES.flatMap((s) =>
  ADDON_KINDS.map(({ kind, name, handle }) => {
    const b = BUILD[kind]
    return {
      id: `memorial-${kind}-${s.id}`,
      category: 'funeral-programs',
      name,
      description: `Matching ${name.toLowerCase()} for the program.`,
      trim: b.trim,
      sizeLabel: b.size,
      safeMargin: 0.15,
      fields: FIELDS.filter((f) => b.fields.includes(f.id)),
      sides: b.sides(s),
      shopifyHandle: handle,
      ...(kind === 'thankyou' ? { thumbnailSide: 'outside', thumbnailCrop: { x: 4.25, y: 0, w: 4.25, h: 5.5 } } : {}),
    } satisfies Template
  }),
)

/** The matching add-ons for a program (empty when the program has no style yet). */
export function addonsFor(programId: string): { kind: AddonKind; name: string; handle: string; blurb: string; template: Template }[] {
  const style = PROGRAM_STYLE[programId]
  if (!style) return []
  return ADDON_KINDS.map((k) => ({ ...k, template: ADDON_TEMPLATES.find((t) => t.id === `memorial-${k.kind}-${style}`)! }))
}

/** The add-on's design, filled in from the program's: same photo, name, dates, verse and message. */
export function addonDraft(program: Draft, addon: Template): Draft {
  const v = program.values
  // The program's poem or verse when there is one; otherwise the add-on's default (Psalm 23).
  const verse = (v.tribute ?? '').trim()
  const values: Record<string, string> = {}
  for (const f of addon.fields) {
    if (f.type === 'photo') continue
    const from = f.id === 'verse' ? verse : (v[f.id] ?? '').trim()
    values[f.id] = from || f.default
  }
  const photos: Record<string, PhotoState> = {}
  const main = program.photos.photo
  // The original photo (not a cut-out) suits the oval and matted frames; keep any black & white or sepia.
  // A toned copy made from a cut-out doesn't apply to the original, so it's dropped (and remade for printing).
  if (main) photos.photo = { ...main, useCutout: false, ox: 0, oy: 0, zoom: 1, ...(main.useCutout ? { toned: undefined, tonedKey: undefined } : {}) }
  return { values, photos }
}
