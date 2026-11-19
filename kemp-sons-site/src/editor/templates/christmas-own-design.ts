import type { Element, Field, Template } from '../types'

/**
 * "Have your own design?" Christmas cards: the customer uploads a finished
 * card (made in an AI tool, Canva, or bought elsewhere) and we print it.
 * One full-bleed image per printed side, in every Christmas card size, with
 * the same envelope options as the designed cards.
 *
 * Kept out of the regular galleries (they'd show as empty gray cards); the
 * "Start an order" page links to them through its own-design path.
 */

const BLEED = 0.125
const ENVELOPE = { w: 7.25, h: 5.25, label: 'A7 envelope', shopifyHandle: 'addressed-envelopes' }

/** Pixels needed for a sharp print at 300 ppi, including the bleed that's trimmed off. */
export const pixelsFor = (w: number, h: number) => ({ w: Math.round((w + 2 * BLEED) * 300), h: Math.round((h + 2 * BLEED) * 300) })

const art = (field: string, w: number, h: number): Element => ({ type: 'photo', field, x: -BLEED, y: -BLEED, w: w + 2 * BLEED, h: h + 2 * BLEED })

function build(sides: 1 | 2, orient: 'portrait' | 'landscape'): Template {
  const [w, h] = orient === 'portrait' ? [5, 7] : [7, 5]
  const px = pixelsFor(w, h)
  const hint = `A finished ${w} x ${h} in ${orient} design. Best at ${px.w} x ${px.h} pixels (JPG or PNG). Drag or zoom it on the preview to line it up.`
  const fields: Field[] = [
    { id: 'design', type: 'photo', label: sides === 2 ? 'Front of the card' : 'Your card design', hint, section: 'Your design' },
    ...(sides === 2 ? [{ id: 'designBack', type: 'photo', label: 'Back of the card', hint, section: 'Your design' } as Field] : []),
  ]
  return {
    id: `christmas-own-design-${sides === 2 ? '2side' : '1side'}-${orient}`,
    category: 'christmas-cards',
    shopifyHandle: sides === 2 ? 'christmas-card-own-design-2side' : 'christmas-card-own-design-1side',
    name: `Your Own Design, ${sides === 2 ? 'two sides' : 'one side'}`,
    description: `Upload a finished Christmas card and we print it, ${orient}, ${sides === 2 ? 'printed on both sides' : 'printed on one side'}.`,
    trim: { w, h },
    sizeLabel: `${w} x ${h} in ${orient} card, ${sides === 2 ? 'printed both sides' : 'printed one side'}`,
    safeMargin: 0.25,
    fields,
    ownDesign: true,
    envelope: ENVELOPE,
    sides: [
      { id: 'front', label: 'Front', background: '#ffffff', elements: [art('design', w, h)] },
      ...(sides === 2 ? [{ id: 'back', label: 'Back', background: '#ffffff', elements: [art('designBack', w, h)] }] : []),
    ],
  }
}

export const christmasOwnDesigns: Template[] = [build(1, 'portrait'), build(1, 'landscape'), build(2, 'portrait'), build(2, 'landscape')]
