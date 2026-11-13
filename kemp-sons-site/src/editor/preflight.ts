import type { Template } from './types'
import type { Draft } from './draft'
import { fieldsOf, fillTokens, fitStack, fitText } from './textFit'

export interface PreflightIssue {
  kind: 'overflow' | 'photo' | 'lowres'
  message: string
}

/** Below this, photos start to look soft when printed. */
const MIN_PPI = 150

/** Automatic checks shown on the proof, before the customer approves. */
export function preflight(t: Template, d: Draft): PreflightIssue[] {
  const label = (id: string) => t.fields.find((f) => f.id === id || id.startsWith(`${f.id}_`))?.label ?? id
  const slotName = (id: string) => {
    const m = id.match(/_(\d+)$/)
    return m ? `Photo ${m[1]}` : label(id)
  }
  const overflow = new Set<string>()
  const lowres: string[] = []
  let emptyPhotos = 0
  for (const side of t.sides)
    for (const el of side.elements) {
      if (el.showIf && !(d.values[el.showIf] ?? '').trim()) continue
      if (el.type === 'text' && fitText(fillTokens(el.text, d.values), el).overflow) fieldsOf(el).forEach((f) => overflow.add(f))
      if (el.type === 'stack' && fitStack(el, d.values).overflow) fieldsOf(el).forEach((f) => overflow.add(f))
      if (el.type === 'photo' && !el.optional) {
        const ph = d.photos[el.field]
        if (!ph) {
          emptyPhotos++
          continue
        }
        // Printed width of the photo in inches, after it's scaled to cover the frame and zoomed.
        const cover = Math.max(el.w / ph.w, el.h / ph.h)
        const ppi = 1 / (cover * Math.max(1, ph.zoom))
        if (ppi < MIN_PPI) lowres.push(slotName(el.field))
      }
    }
  const issues: PreflightIssue[] = [...overflow].map((f) => ({
    kind: 'overflow',
    message: `${label(f)} is too long and some of it will be cut off.`,
  }))
  if (emptyPhotos)
    issues.push({ kind: 'photo', message: `${emptyPhotos} photo ${emptyPhotos === 1 ? 'spot is' : 'spots are'} still empty and will print as a gray placeholder.` })
  for (const name of lowres)
    issues.push({ kind: 'lowres', message: `${name} is low resolution and may print blurry. Try the original photo, or zoom out.` })
  return issues
}
