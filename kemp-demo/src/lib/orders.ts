import { templateById } from '../templates'
import { defaultDraft, priceFor, type Draft, type PriceBreakdown } from './draft'
import { readKey, useStored, writeKey } from './store'

export const STATUSES = ['New', 'Proofing', 'Printing', 'Ready', 'Completed'] as const
export type Status = (typeof STATUSES)[number]

export interface Order {
  id: string
  createdAt: string
  status: Status
  templateId: string
  draft: Draft
  price: PriceBreakdown
  customer: { name: string; phone: string; email: string }
  fulfillment: { method: 'pickup' | 'ship'; address?: string }
  shippingFee: number
  total: number
  /** Placed through a partner account (funeral home or church). */
  partner?: string
  /** Texts the customer has been sent, newest last. */
  texts?: string[]
}

export const SHIPPING_FEE = 9.95

/** Short description of what is printed, e.g. "Funeral program for Mr. Harold Whitaker". */
export function orderTitle(o: Order) {
  const t = templateById(o.templateId)
  const v = o.draft.values
  switch (t?.category) {
    case 'funeral':
      return `Program for ${v.name}`
    case 'christmas':
      return `Christmas cards, ${v.familyName}`
    case 'wedding':
      return `Invitations, ${v.partner1} and ${v.partner2}`
    case 'yard-signs':
      return `Yard sign for ${v.name}`
    case 'banners':
      return `Banner, ${v.business}`
    default:
      return t?.name ?? 'Order'
  }
}

/* ---------- Sample orders for the board ---------- */

interface Seed {
  id: string
  minutesAgo: number
  status: Status
  templateId: string
  values: Record<string, string>
  qty: number
  paper: string
  rush?: boolean
  customer: Order['customer']
  ship?: string
  partner?: string
}

const SEEDS: Seed[] = [
  {
    id: 'KS-1041', minutesAgo: 38, status: 'New', templateId: 'funeral-rose-garden', qty: 150, paper: 'matte', rush: true,
    values: { name: 'Mr. Harold James Whitaker', firstName: 'Harold', birthDate: 'June 14, 1939', deathDate: 'October 30, 2026', serviceDate: 'Thursday, November 5, 2026', serviceTime: '1:00 PM', location: 'New Hope Baptist Church', officiant: 'Pastor Calvin Ross' },
    customer: { name: 'Denise Whitaker', phone: '(555) 014-7781', email: 'denise.whitaker@example.com' },
    partner: 'Whitfield Family Funeral Home',
  },
  {
    id: 'KS-1040', minutesAgo: 190, status: 'Printing', templateId: 'funeral-classic-ivory', qty: 100, paper: 'gloss', rush: true,
    values: { name: 'Mrs. Rosa Elena Morales', firstName: 'Rosa', birthDate: 'February 2, 1948', deathDate: 'October 29, 2026', serviceDate: 'Friday, November 6, 2026', serviceTime: '10:00 AM', location: 'St. Anne Catholic Church' },
    customer: { name: 'Linda Morales', phone: '(555) 014-3302', email: 'linda.m@example.com' },
  },
  {
    id: 'KS-1039', minutesAgo: 260, status: 'New', templateId: 'christmas-evergreen-photo', qty: 100, paper: 'gloss',
    values: { familyName: 'The Tran Family', signature: 'Kevin, Amy, Lily & Max' },
    customer: { name: 'Amy Tran', phone: '(555) 014-9120', email: 'amy.tran@example.com' },
    ship: '88 Willow Court, Springfield',
  },
  {
    id: 'KS-1038', minutesAgo: 60 * 26, status: 'Proofing', templateId: 'wedding-botanical', qty: 150, paper: 'felt',
    values: { partner1: 'Rachel Kim', partner2: 'David Ortiz', initials: 'R & D', date: 'Saturday, April 17, 2027', venue: 'Cedar Ridge Barn' },
    customer: { name: 'Rachel Kim', phone: '(555) 014-5567', email: 'rachel.kim@example.com' },
  },
  {
    id: 'KS-1037', minutesAgo: 60 * 30, status: 'Ready', templateId: 'yard-sign-graduate', qty: 5, paper: 'double',
    values: { name: 'Jalen Johnson', classOf: 'Class of 2027', school: 'Lincoln High School', tagline: 'Proud of you, Jalen!' },
    customer: { name: 'Tamika Johnson', phone: '(555) 014-2048', email: 'tamika.j@example.com' },
  },
  {
    id: 'KS-1036', minutesAgo: 60 * 50, status: 'Printing', templateId: 'banner-grand-opening', qty: 1, paper: 'vinyl13',
    values: { business: "Bell's Hardware", headline: 'Now Open', date: 'Saturday, November 14', details: 'Ribbon cutting at 9 AM  ·  Hot dogs and door prizes', address: '77 Main Street  ·  (555) 014-6610' },
    customer: { name: 'Marcus Bell', phone: '(555) 014-6610', email: 'marcus@bellshardware.example' },
  },
  {
    id: 'KS-1035', minutesAgo: 60 * 75, status: 'Completed', templateId: 'christmas-joy', qty: 50, paper: 'matte',
    values: { familyName: 'The Pruitt Family', signature: 'Love, the Pruitts' },
    customer: { name: 'Heather Pruitt', phone: '(555) 014-3391', email: 'heather.pruitt@example.com' },
  },
  {
    id: 'KS-1034', minutesAgo: 60 * 98, status: 'Completed', templateId: 'funeral-evening-slate', qty: 200, paper: 'linen',
    values: { name: 'Mr. Earl Thomas Patterson', firstName: 'Earl', birthDate: 'August 9, 1944', deathDate: 'October 24, 2026', serviceDate: 'Saturday, October 31, 2026', serviceTime: '11:00 AM', location: 'Greater Mount Zion Church' },
    customer: { name: 'Gloria Patterson', phone: '(555) 014-8823', email: 'gloria.p@example.com' },
    partner: 'Whitfield Family Funeral Home',
  },
]

function buildSeedOrders(): Order[] {
  const now = Date.now()
  return SEEDS.map((s) => {
    const t = templateById(s.templateId)!
    const base = defaultDraft(t)
    const draft: Draft = { ...base, values: { ...base.values, ...s.values }, qty: s.qty, paper: s.paper, rush: !!s.rush }
    const price = priceFor(t, draft)
    const shippingFee = s.ship ? SHIPPING_FEE : 0
    return {
      id: s.id,
      createdAt: new Date(now - s.minutesAgo * 60_000).toISOString(),
      status: s.status,
      templateId: s.templateId,
      draft,
      price,
      customer: s.customer,
      fulfillment: s.ship ? { method: 'ship', address: s.ship } : { method: 'pickup' },
      shippingFee,
      total: price.total + shippingFee,
      partner: s.partner,
    }
  })
}

/** Orders, seeded with samples the first time the demo runs (or after Reset Demo). */
export function getOrders(): Order[] {
  const existing = readKey<Order[] | null>('orders', null)
  if (existing) return existing
  const seeded = buildSeedOrders()
  writeKey('orders', seeded)
  return seeded
}

export function useOrders() {
  getOrders()
  return useStored<Order[]>('orders', [])
}

export function nextOrderId(orders: Order[]) {
  const max = orders.reduce((m, o) => Math.max(m, Number(o.id.replace(/\D/g, '')) || 0), 1041)
  return `KS-${max + 1}`
}

export function resetDemoData() {
  writeKey('orders', buildSeedOrders())
}
