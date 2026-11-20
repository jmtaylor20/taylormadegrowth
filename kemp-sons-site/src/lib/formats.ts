import { PRICE_GROUPS } from '../../netlify/lib/price-groups'
import type { Template } from '../editor/types'

/**
 * Printed formats ("sizes" to a customer): templates grouped by the price
 * group they're sold under. Used by "Start an order" and the in-store kiosk.
 */

/** Plain-words names for each format, in the order customers think of them. */
export const FORMAT_INFO: Record<string, { name: string; finished: string }> = {
  'program-11x8.5-fold': { name: 'Single fold', finished: 'Folds to 5.5 x 8.5 in' },
  'program-11x8.5-stagger': { name: 'Stagger fold', finished: 'Folds to 6 x 8.5 in' },
  'program-16.5x8.5-trifold': { name: 'Trifold', finished: 'Folds to 5.5 x 8.5 in' },
  'program-14x8.5-trifold': { name: 'Narrow trifold', finished: 'Folds to 4.67 x 8.5 in' },
  'program-17x11-fold': { name: 'Large fold', finished: 'Folds to 8.5 x 11 in' },
  'program-17x11-trifold': { name: 'Large trifold', finished: 'Folds to 5.67 x 11 in' },
  'program-booklet-8': { name: '8-page booklet', finished: '8.5 x 11 in pages' },
  'card-5x7-1side': { name: 'Photo card, one side', finished: '5 x 7 in flat' },
  'card-5x7-2side': { name: 'Photo card, two sides', finished: '5 x 7 in flat' },
}
const FORMAT_ORDER = Object.keys(FORMAT_INFO)

export const formatOf = (t: Template) => PRICE_GROUPS.find((g) => g.handles.includes(t.shopifyHandle))?.id ?? t.id

export interface Format {
  id: string
  name: string
  finished: string
  product: Template['category']
  templates: Template[]
}

/** The formats these templates come in, in customer order. */
export function formatsFor(templates: Template[]): Format[] {
  const map = new Map<string, Format>()
  for (const t of templates) {
    const id = formatOf(t)
    const info = FORMAT_INFO[id] ?? { name: t.sizeLabel, finished: '' }
    if (!map.has(id)) map.set(id, { id, ...info, product: t.category, templates: [] })
    map.get(id)!.templates.push(t)
  }
  return [...map.values()].sort((a, b) => (FORMAT_ORDER.indexOf(a.id) + 1 || 99) - (FORMAT_ORDER.indexOf(b.id) + 1 || 99))
}
