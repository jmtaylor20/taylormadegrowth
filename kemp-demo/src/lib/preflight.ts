import type { Template } from '../templates/types'
import type { Draft } from './draft'
import { fieldsOf, fillTokens, fitStack, fitText } from './textFit'

export interface PreflightIssue {
  kind: 'overflow' | 'photo'
  message: string
}

/** Automatic checks shown on the proof, before the customer approves. */
export function preflight(t: Template, d: Draft): PreflightIssue[] {
  const label = (id: string) => t.fields.find((f) => f.id === id)?.label ?? id
  const overflow = new Set<string>()
  let emptyPhotos = 0
  for (const side of t.sides)
    for (const el of side.elements) {
      if (el.showIf && !(d.values[el.showIf] ?? '').trim()) continue
      if (el.type === 'text' && fitText(fillTokens(el.text, d.values), el).overflow) fieldsOf(el).forEach((f) => overflow.add(f))
      if (el.type === 'stack' && fitStack(el, d.values).overflow) fieldsOf(el).forEach((f) => overflow.add(f))
      if (el.type === 'photo' && !el.optional && !d.photos[el.field]) emptyPhotos++
    }
  const issues: PreflightIssue[] = [...overflow].map((f) => ({
    kind: 'overflow',
    message: `${label(f)} is too long and some of it will be cut off.`,
  }))
  if (emptyPhotos) issues.push({ kind: 'photo', message: `${emptyPhotos} photo ${emptyPhotos === 1 ? 'spot is' : 'spots are'} still empty and will print as a gray placeholder.` })
  return issues
}
