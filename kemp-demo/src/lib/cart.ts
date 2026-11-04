import type { Draft } from './draft'
import { useStored } from './store'

/** The approved design waiting for checkout. */
export interface CartItem {
  templateId: string
  draft: Draft
  total: number
  approvedAt: string
}

export const useCart = () => useStored<CartItem | null>('cart', null)
