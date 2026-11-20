import type { Element, Field, Template } from '../types'
import { FUNERAL_HOMES, OTHER_HOME } from '../../config/funeral-homes'
import { fieldsOf } from '../textFit'

/**
 * Adds a "Funeral home" picker to every program with a funeral home block on
 * the back. Picking a listed home prints that home's own panel (logo,
 * address, phone, website) in the block's place; "Other" keeps the typed
 * name and address.
 */
export const HOME_FIELD = 'homePanel'

const usesHome = (el: Element) => fieldsOf(el as never).some((f) => f === 'funeralHome' || f === 'funeralHomeDetails')

export function withFuneralHomes(t: Template): Template {
  if (t.category !== 'funeral-programs' || !t.fields.some((f) => f.id === 'funeralHomeDetails')) return t
  const other = { field: HOME_FIELD, is: OTHER_HOME }
  const sides = t.sides.map((side) => {
    // The block: elements that print the address, plus the name line next to them.
    const details = side.elements.filter((el) => fieldsOf(el as never).includes('funeralHomeDetails'))
    if (!details.length) return side
    const box = (el: Element) => ({ x0: el.x, y0: el.y, x1: el.x + ('w' in el ? el.w : 0), y1: el.y + ('h' in el ? el.h : 0) })
    const near = (el: Element) => {
      const a = box(el)
      return details.some((d) => { const b = box(d); return a.x0 < b.x1 && b.x0 < a.x1 && Math.abs(a.y1 - b.y0) < 0.6 })
    }
    const block = side.elements.filter((el) => usesHome(el) && (details.includes(el) || near(el)))
    const bs = block.map(box)
    const x0 = Math.min(...bs.map((b) => b.x0)), x1 = Math.max(...bs.map((b) => b.x1))
    const y0 = Math.min(...bs.map((b) => b.y0)), y1 = Math.max(...bs.map((b) => b.y1))
    const area = t.trim.w * t.trim.h
    const overlapsX = (b: { x0: number; x1: number }) => b.x0 < x1 - 0.05 && x0 + 0.05 < b.x1
    // Small rules and ornaments just above the block go with it (the panel replaces them).
    const decor = side.elements.filter((el) => {
      if (block.includes(el)) return false
      // Lines and ornaments, or a fixed label like "Services entrusted to".
      const label = el.type === 'text' && !fieldsOf(el as never).length && el.h < 0.45
      if (!['line', 'star', 'ellipse'].includes(el.type) && !label) return false
      const b = box(el)
      return overlapsX({ x0: b.x0 - 0.3, x1: b.x1 + 0.3 }) && b.y0 >= y0 - 0.45 && b.y0 <= y1 && (label || (b.x1 - b.x0) < 3)
    })
    // Grow upward into free space (up to 0.9 in) so the panel prints at a readable size.
    const WANT = 0.9
    let top = y0 - WANT
    const shrink = new Map<Element, number>() // stacks above give up room (their text re-centers)
    for (const el of side.elements) {
      if (block.includes(el) || decor.includes(el)) continue
      const b = box(el)
      if ((b.x1 - b.x0) * (b.y1 - b.y0) > 0.3 * area || !overlapsX(b) || b.y1 > y0 + 0.01 || b.y1 <= top - 0.1) continue
      if (el.type === 'stack') {
        const minBottom = b.y0 + (b.y1 - b.y0) * 0.75
        const bottom = Math.max(minBottom, top - 0.1)
        shrink.set(el, bottom - b.y0)
        top = Math.max(top, bottom + 0.1)
      } else top = Math.max(top, b.y1 + 0.1)
    }
    top = Math.min(top, y0)
    const bw = x1 - x0, bh = y1 - top
    const listed = { field: HOME_FIELD, not: OTHER_HOME }
    const panels: Element[] = FUNERAL_HOMES.map((h) => {
      // Fit the panel inside the space, centered, at its own proportions.
      const w = Math.min(bw, bh * h.aspect), hh = w / h.aspect
      return { type: 'image', src: `/funeral-homes/${h.slug}.png`, x: x0 + (bw - w) / 2, y: top + (bh - hh) / 2, w, h: hh, onlyIf: { field: HOME_FIELD, is: h.slug } }
    })
    const elements = side.elements.flatMap((el): Element[] => {
      if (block.includes(el) || decor.includes(el)) return [{ ...el, onlyIf: other }]
      const h = shrink.get(el)
      if (h !== undefined && 'h' in el && h < el.h - 0.01) return [{ ...el, onlyIf: other }, { ...el, h, onlyIf: listed } as Element]
      return [el]
    })
    return { ...side, elements: [...elements, ...panels] }
  })
  const picker: Field = {
    id: HOME_FIELD,
    type: 'select',
    label: 'Funeral home',
    default: OTHER_HOME,
    options: [...FUNERAL_HOMES.map((h) => ({ value: h.slug, label: h.name })), { value: OTHER_HOME, label: 'Another funeral home (type it in)' }],
    hint: 'Listed homes print their own logo and contact details on the back.',
    section: t.fields.find((f) => f.id === 'funeralHome')?.section,
  }
  const fields = t.fields.flatMap((f) =>
    f.id === 'funeralHome' ? [picker, { ...f, onlyIf: other } as Field] : f.id === 'funeralHomeDetails' ? [{ ...f, onlyIf: other } as Field] : [f],
  )
  return { ...t, fields, sides }
}
