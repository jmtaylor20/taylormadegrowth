/**
 * Price groups: products that are the same printed piece (same size, fold and
 * page count) share one price table, whatever the design on them. Saving a
 * group's prices writes them to every design in it.
 *
 * When a new template is added, put its Shopify handle in the matching group
 * (or start a new group). Products not listed here are priced on their own.
 */
export interface PriceGroup {
  id: string
  label: string
  handles: string[]
  /** The Format value on the Rush turnaround product, when rush is offered. */
  rush?: string
}

/** Shopify handle of the rush fee product (one variant per format). */
export const RUSH_HANDLE = 'rush-turnaround'

/** Rush format for a product, or null when rush isn't offered for it. */
export const rushFormatFor = (handle: string) => PRICE_GROUPS.find((g) => g.handles.includes(handle))?.rush ?? null

export const PRICE_GROUPS: PriceGroup[] = [
  {
    id: 'program-11x8.5-fold', rush: '11 x 8.5 folded',
    label: 'Funeral program, 11 x 8.5 folded (4 pages)',
    handles: ['funeral-program-clouds-doves', 'funeral-program-red-roses', 'funeral-program-pink-floral', 'funeral-program-pink-tulips'],
  },
  { id: 'program-11x8.5-stagger', rush: '11 x 8.5 stagger fold', label: 'Funeral program, 11 x 8.5 stagger fold (4 pages)', handles: ['funeral-program-pink-stagger'] },
  { id: 'program-17x11-fold', rush: '17 x 11 folded', label: 'Funeral program, 17 x 11 folded (4 pages)', handles: ['funeral-program-purple-lilacs'] },
  { id: 'program-14x8.5-trifold', rush: '14 x 8.5 trifold', label: 'Funeral program, 14 x 8.5 trifold (6 panels)', handles: ['funeral-program-gone-fishing'] },
  { id: 'program-16.5x8.5-trifold', rush: '16.5 x 8.5 trifold', label: 'Funeral program, 16.5 x 8.5 trifold (6 panels)', handles: ['funeral-program-flag-trifold'] },
  { id: 'program-17x11-trifold', rush: '17 x 11 trifold', label: 'Funeral program, 17 x 11 trifold (6 panels)', handles: ['funeral-program-flag-tabloid'] },
  { id: 'program-booklet-8', rush: '8-page booklet', label: 'Funeral program, 8.5 x 11 booklet (8 pages)', handles: ['funeral-program-gold-booklet'] },
]
