import type { Template, TextField } from '../templates/types'
import { useStored } from './store'

export interface PhotoState {
  src: string
  /** Image center offset from the frame center, in points. */
  ox: number
  oy: number
  /** 1 = the smallest size that fully covers the frame. */
  zoom: number
}

export interface Draft {
  values: Record<string, string>
  photos: Record<string, PhotoState>
  qty: number
  paper: string
  rush: boolean
}

export function defaultDraft(t: Template): Draft {
  const values: Record<string, string> = {}
  for (const f of t.fields) if (f.type !== 'photo') values[f.id] = (f as TextField).default
  return {
    values,
    photos: {},
    qty: t.quantities[Math.min(1, t.quantities.length - 1)].qty,
    paper: t.papers[0].id,
    rush: false,
  }
}

export function useDraft(t: Template) {
  return useStored<Draft>(`draft:v2:${t.id}`, defaultDraft(t))
}

export interface PriceBreakdown {
  base: number
  paperUpcharge: number
  rush: number
  total: number
  each: number
}

export function priceFor(t: Template, d: Pick<Draft, 'qty' | 'paper' | 'rush'>): PriceBreakdown {
  const tier = t.quantities.find((q) => q.qty === d.qty) ?? t.quantities[0]
  const paper = t.papers.find((p) => p.id === d.paper) ?? t.papers[0]
  const base = tier.price
  const paperUpcharge = Math.round(base * (paper.multiplier - 1) * 100) / 100
  const rush = d.rush && t.rush ? t.rush.price : 0
  const total = base + paperUpcharge + rush
  return { base, paperUpcharge, rush, total, each: total / tier.qty }
}

export const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
