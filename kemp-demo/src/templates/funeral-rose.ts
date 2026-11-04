import type { Element, PhotoEl, Template } from './types'
import { BACK_SECTIONS, FUNERAL_OPTIONS, withFields } from './shared'

/**
 * Rose Garden: soft blush program with illustrated roses drifting across the
 * sheet, script headings, and a six photo "Love is..." collage inside.
 * The roses are drawn from simple ellipses, so there is no stock artwork.
 */

const BLUSH = '#fcf6f6'
const ROSE = '#8c2d4e'
const INK = '#2a2125'
const R = 5.5

/** An illustrated rose built from rotated ellipses. */
function rose(cx: number, cy: number, r: number, tone = 0, opacity = 0.5): Element[] {
  const pinks = [
    ['#f4c9d4', '#eaa6b9', '#d98199', '#c4607d'],
    ['#f6d3dc', '#efb4c4', '#e292a8', '#cf7190'],
  ][tone]
  const out: Element[] = []
  const ring = (n: number, dist: number, rx: number, ry: number, color: string, turn: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + turn
      out.push({
        type: 'ellipse', x: cx + Math.cos(a) * dist * r, y: cy + Math.sin(a) * dist * r,
        rx: rx * r, ry: ry * r, rotation: (a * 180) / Math.PI + 90, fill: color, opacity,
      })
    }
  }
  ring(7, 0.55, 0.42, 0.5, pinks[0], 0.2)
  ring(6, 0.36, 0.34, 0.42, pinks[1], 0.7)
  ring(5, 0.2, 0.26, 0.32, pinks[2], 1.3)
  ring(3, 0.08, 0.17, 0.2, pinks[3], 0.4)
  out.push({ type: 'ellipse', x: cx, y: cy, rx: 0.09 * r, ry: 0.11 * r, fill: pinks[3], opacity })
  return out
}

function leaf(x: number, y: number, len: number, angle: number, opacity = 0.42): Element {
  return { type: 'ellipse', x, y, rx: len * 0.22, ry: len * 0.5, rotation: angle, fill: '#9bb59a', opacity }
}

/** A loose cluster of roses and leaves. */
function cluster(x: number, y: number, s: number, opacity = 0.5): Element[] {
  return [
    leaf(x - 0.9 * s, y + 0.2 * s, 0.9 * s, -60, opacity * 0.8),
    leaf(x + 0.95 * s, y - 0.35 * s, 0.8 * s, 50, opacity * 0.8),
    leaf(x + 0.2 * s, y + 0.85 * s, 0.85 * s, 15, opacity * 0.8),
    ...rose(x - 0.45 * s, y - 0.1 * s, 0.85 * s, 0, opacity),
    ...rose(x + 0.55 * s, y + 0.3 * s, 0.7 * s, 1, opacity),
    ...rose(x + 0.05 * s, y - 0.85 * s, 0.55 * s, 1, opacity),
  ]
}

const background: PhotoEl = { type: 'photo', field: 'backgroundPhoto', x: -0.125, y: -0.125, w: 11.25, h: 8.75, optional: true, opacity: 0.22 }

const script = (text: string, x: number, y: number, w: number, size = 30): Element => ({
  type: 'text', text, x, y, w, h: size / 48, font: 'Great Vibes', size, minSize: size * 0.6, color: ROSE,
})

const collage: Element[] = []
{
  const x0 = R + 0.45
  const gap = 0.1
  const w = (4.6 - 2 * gap) / 3
  const h = 1.5
  for (let i = 0; i < 6; i++) {
    const col = i % 3
    const row = Math.floor(i / 3)
    collage.push({
      type: 'photo', field: `collage_${i + 1}`, x: x0 + col * (w + gap), y: 0.95 + row * (h + gap), w, h,
      stroke: ROSE, strokeWidth: 0.8, placeholder: '#ecdfe2',
    })
  }
}

export const funeralRose: Template = {
  id: 'funeral-rose-garden',
  category: 'funeral',
  name: 'Rose Garden',
  description: 'Soft blush roses, flowing script, and a six photo collage of favorite memories.',
  trim: { w: 11, h: 8.5 },
  sizeLabel: '8.5 x 11 in, folds to 5.5 x 8.5 in',
  safeMargin: 0.25,
  ...FUNERAL_OPTIONS,
  fields: withFields('orderOfService', [
    { id: 'collageTitle', type: 'text', label: 'Collage heading', default: 'Love is...', section: 'Inside' },
    { id: 'collage', type: 'photo', count: 6, label: 'Collage photos', hint: 'Tap a square to add a photo. Drag photos on the preview to reposition.', section: 'Inside' },
    { id: 'backgroundPhoto', type: 'photo', label: 'Background photo (optional)', hint: 'Shows faintly behind the whole outside, such as flowers or a favorite place.', section: 'Inside' },
  ]),
  thumbnailSide: 'outside',
  thumbnailCrop: { x: 5.5, y: 0, w: 5.5, h: 8.5 },
  sides: [
    {
      id: 'outside',
      label: 'Outside',
      background: BLUSH,
      folds: [5.5],
      panels: ['Back cover', 'Front cover'],
      elements: [
        background,
        ...cluster(10.35, 7.75, 1.05, 0.45),
        ...cluster(1.0, 7.7, 1.0, 0.4),
        ...cluster(5.6, 8.3, 0.9, 0.38),
        ...cluster(10.6, 0.5, 0.75, 0.35),

        // Front cover
        { type: 'text', text: 'Celebrating the Life of', x: R + 0.5, y: 0.5, w: 4.5, h: 0.45, font: 'Cormorant Garamond', weight: 700, italic: true, size: 21, color: INK },
        { type: 'photo', field: 'photo', x: R + 1.4, y: 1.05, w: 2.7, h: 3.3, shape: 'ellipse', stroke: ROSE, strokeWidth: 2 },
        { type: 'text', text: '{{name}}', x: R + 0.3, y: 4.45, w: 4.9, h: 0.85, font: 'Great Vibes', size: 40, minSize: 20, color: INK },
        { type: 'text', text: 'Sunrise: {{birthDate}}  ·  Sunset: {{deathDate}}', x: R + 0.35, y: 5.35, w: 4.8, h: 0.32, font: 'Cormorant Garamond', weight: 700, size: 13, minSize: 8, color: INK },
        { type: 'text', text: '{{serviceTime}}\n{{serviceDate}}', x: R + 0.5, y: 5.75, w: 4.5, h: 0.6, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK, lineHeight: 1.15 },
        { type: 'text', text: '{{location}}\n{{locationAddress}}', x: R + 0.5, y: 6.45, w: 4.5, h: 0.8, font: 'Cormorant Garamond', weight: 700, size: 14, minSize: 8, color: INK, lineHeight: 1.15 },
        { type: 'text', text: '{{officiant}}, Officiating', x: R + 0.5, y: 7.38, w: 4.5, h: 0.34, font: 'Cormorant Garamond', weight: 700, italic: true, size: 13.5, minSize: 8, color: INK, showIf: 'officiant' },

        // Back cover
        {
          type: 'stack', x: 0.6, y: 0.45, w: 4.3, h: 5.85, gap: 0.2, headingGap: 0.02, valign: 'top',
          heading: { font: 'Great Vibes', size: 26, color: ROSE, lineHeight: 1.1 },
          body: { font: 'Cormorant Garamond', weight: 700, size: 13.5, color: INK, lineHeight: 1.18 },
          items: BACK_SECTIONS,
        },
        script('Services Entrusted To', 0.6, 6.45, 4.3, 17),
        { type: 'text', text: '{{funeralHome}}', x: 0.6, y: 6.85, w: 4.3, h: 0.3, font: 'Cormorant Garamond', weight: 700, size: 13, minSize: 8, color: INK },
        { type: 'text', text: '{{funeralHomeDetails}}', x: 0.6, y: 7.15, w: 4.3, h: 0.45, font: 'Cormorant Garamond', weight: 700, size: 11, minSize: 7, color: INK, lineHeight: 1.15 },
      ],
    },
    {
      id: 'inside',
      label: 'Inside',
      background: BLUSH,
      folds: [5.5],
      panels: ['Inside left', 'Inside right'],
      elements: [
        ...cluster(0.9, 7.4, 1.15, 0.4),
        ...cluster(10.3, 7.6, 1.0, 0.4),

        // Inside left: obituary
        script('Obituary', 0.5, 0.35, 4.5, 34),
        { type: 'text', text: '{{obituary}}', x: 0.5, y: 1.15, w: 4.5, h: 6.15, font: 'Cormorant Garamond', weight: 600, size: 13.5, minSize: 8, color: INK, lineHeight: 1.3, align: 'left', valign: 'top' },
        { type: 'text', text: '{{closingQuote}}', x: 0.5, y: 7.4, w: 4.5, h: 0.42, font: 'Cormorant Garamond', weight: 700, italic: true, size: 15, minSize: 9, color: INK, showIf: 'closingQuote' },

        // Inside right: collage and order of service
        script('{{collageTitle}}', R + 0.45, 0.25, 4.6, 32),
        ...collage,
        script('Order of Service', R + 0.45, 4.2, 4.6, 32),
        { type: 'text', text: '{{orderOfService}}', x: R + 0.5, y: 4.95, w: 4.5, h: 3.05, font: 'Cormorant Garamond', weight: 700, size: 13, minSize: 7.5, color: INK, lineHeight: 1.32, leaders: true, valign: 'top' },
      ],
    },
  ],
}
