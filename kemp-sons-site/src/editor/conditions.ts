import type { FieldCondition } from './types'

/** Whether a field/element condition holds for these form values. */
export function conditionMet(c: FieldCondition | undefined, values: Record<string, string>): boolean {
  if (!c) return true
  const v = values[c.field] ?? ''
  if (c.is !== undefined && v !== c.is) return false
  if (c.not !== undefined && v === c.not) return false
  return true
}
