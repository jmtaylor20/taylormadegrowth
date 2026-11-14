import { admin, check } from './shopify-admin'

/**
 * Prices, shipping and pickup for the staff Prices page. Everything is read
 * from and written to Shopify, which the website, the designer and checkout
 * all read live, so one save updates the whole site.
 *
 * Needs these scopes on the Kemp Job Board app: read_products, write_products,
 * read_shipping, write_shipping (plus read/write locations for pickup, covered
 * by write_shipping).
 */

export interface PriceVariant {
  id: string
  price: number
  options: Record<string, string>
}

export interface PriceProduct {
  id: string
  title: string
  handle: string
  type: string
  options: string[]
  variants: PriceVariant[]
}

export interface ShippingSettings {
  /** Flat standard shipping price. */
  standard: number
  /** Free standard shipping at or above this order total. Null = never free. */
  freeOver: number | null
  /** Express price. Null = no express option. */
  express: number | null
}

export const PICKUP_TIMES = ['ONE_HOUR', 'TWO_HOURS', 'FOUR_HOURS', 'TWENTY_FOUR_HOURS', 'TWO_TO_FOUR_DAYS', 'FIVE_OR_MORE_DAYS'] as const
export interface PickupSettings {
  pickupTime: (typeof PICKUP_TIMES)[number]
  instructions: string
}

const PRODUCTS = /* GraphQL */ `
  query P($q: String!) {
    products(first: 100, query: $q, sortKey: TITLE) {
      nodes {
        id title handle productType
        options { name }
        variants(first: 100) { nodes { id price selectedOptions { name value } } }
      }
    }
  }
`

const SHIPPING = /* GraphQL */ `
  {
    deliveryProfiles(first: 5) {
      nodes {
        id default
        profileLocationGroups {
          locationGroup { id }
          locationGroupZones(first: 10) {
            nodes {
              zone { id name }
              methodDefinitions(first: 20) {
                nodes {
                  id name active
                  rateProvider { ... on DeliveryRateDefinition { price { amount } } }
                  methodConditions { field operator conditionCriteria { ... on MoneyV2 { amount } } }
                }
              }
            }
          }
        }
      }
    }
    locations(first: 5) { nodes { id name isActive localPickupSettingsV2 { pickupTime instructions } } }
  }
`

interface MethodNode {
  id: string
  name: string
  active: boolean
  rateProvider: { price?: { amount: string } } | null
  methodConditions: { field: string; operator: string; conditionCriteria: { amount?: string } }[]
}
interface ShippingResponse {
  deliveryProfiles: {
    nodes: {
      id: string
      default: boolean
      profileLocationGroups: {
        locationGroup: { id: string }
        locationGroupZones: { nodes: { zone: { id: string; name: string }; methodDefinitions: { nodes: MethodNode[] } }[] }
      }[]
    }[]
  }
  locations: { nodes: { id: string; name: string; isActive: boolean; localPickupSettingsV2: { pickupTime: string; instructions: string } | null }[] }
}

/** The general delivery profile's first zone (the US). */
async function shippingTarget() {
  const data = await admin<ShippingResponse>(SHIPPING)
  const profile = data.deliveryProfiles.nodes.find((p) => p.default) ?? data.deliveryProfiles.nodes[0]
  const group = profile?.profileLocationGroups[0]
  const zone = group?.locationGroupZones.nodes[0]
  if (!profile || !group || !zone) throw new Error('No shipping zone is set up in Shopify yet')
  const location = data.locations.nodes.find((l) => l.isActive) ?? data.locations.nodes[0]
  return { profile, group, zone, location }
}

const amount = (m: MethodNode) => Number(m.rateProvider?.price?.amount ?? 0)
const minTotal = (m: MethodNode) => {
  const c = m.methodConditions.find((x) => x.field === 'TOTAL_PRICE' && x.operator === 'GREATER_THAN_OR_EQUAL_TO')
  return c?.conditionCriteria.amount != null ? Number(c.conditionCriteria.amount) : null
}

export async function readPrices() {
  const [p, t] = await Promise.all([
    admin<{ products: { nodes: { id: string; title: string; handle: string; productType: string; options: { name: string }[]; variants: { nodes: { id: string; price: string; selectedOptions: { name: string; value: string }[] }[] } }[] } }>(
      PRODUCTS,
      { q: 'status:active' },
    ),
    shippingTarget(),
  ])
  const products: PriceProduct[] = p.products.nodes.map((n) => ({
    id: n.id,
    title: n.title,
    handle: n.handle,
    type: n.productType,
    options: n.options.map((o) => o.name).filter((o) => o !== 'Title'),
    variants: n.variants.nodes.map((v) => ({
      id: v.id,
      price: Number(v.price),
      options: Object.fromEntries(v.selectedOptions.filter((o) => o.name !== 'Title').map((o) => [o.name, o.value])),
    })),
  }))

  const methods = t.zone.methodDefinitions.nodes.filter((m) => m.active)
  const free = methods.find((m) => amount(m) === 0 && minTotal(m) != null)
  const standard = methods.find((m) => /standard/i.test(m.name) && amount(m) > 0) ?? methods.find((m) => amount(m) > 0 && !/express/i.test(m.name))
  const express = methods.find((m) => /express/i.test(m.name))
  const shipping: ShippingSettings = {
    standard: standard ? amount(standard) : 0,
    freeOver: free ? minTotal(free) : null,
    express: express ? amount(express) : null,
  }
  const pickup: PickupSettings | null = t.location?.localPickupSettingsV2
    ? { pickupTime: t.location.localPickupSettingsV2.pickupTime as PickupSettings['pickupTime'], instructions: t.location.localPickupSettingsV2.instructions }
    : null
  return { products, shipping, pickup }
}

const MIN_PRICE = 0.5
const MAX_PRICE = 20000

/** Product price changes, grouped by product. */
export async function savePrices(changes: { productId: string; variantId: string; price: number }[]) {
  const byProduct = new Map<string, { id: string; price: string }[]>()
  for (const c of changes) {
    if (!/^gid:\/\/shopify\/Product\/\d+$/.test(c.productId) || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(c.variantId)) throw new Error('Bad product id')
    const price = Math.round(Number(c.price) * 100) / 100
    if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) throw new Error(`Prices must be between $${MIN_PRICE} and $${MAX_PRICE}`)
    const list = byProduct.get(c.productId) ?? []
    list.push({ id: c.variantId, price: price.toFixed(2) })
    byProduct.set(c.productId, list)
  }
  for (const [productId, variants] of byProduct) {
    const r = await admin<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
      `mutation U($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { message } } }`,
      { p: productId, v: variants },
    )
    check(r.productVariantsBulkUpdate, 'Save prices')
  }
  return byProduct.size
}

/**
 * Rewrites the US zone's rates to match: Standard (paid, below the free
 * threshold when there is one), Free shipping (at or above the threshold),
 * and Express (when set). Other zones and profiles are left alone.
 */
export async function saveShipping(s: ShippingSettings) {
  const ok = (n: number | null, allowZero = false) => n == null || (Number.isFinite(n) && n >= (allowZero ? 0 : MIN_PRICE) && n <= 1000)
  if (!ok(s.standard, true) || !ok(s.express) || !ok(s.freeOver)) throw new Error('Shipping amounts look wrong')
  const t = await shippingTarget()
  const money = (n: number) => ({ amount: n.toFixed(2), currencyCode: 'USD' })
  const create: Record<string, unknown>[] = []
  if (s.freeOver != null) {
    create.push({ name: 'Standard', active: true, rateDefinition: { price: money(s.standard) }, priceConditionsToCreate: [{ criteria: money(Math.max(0, s.freeOver - 0.01)), operator: 'LESS_THAN_OR_EQUAL_TO' }] })
    create.push({ name: 'Free shipping', active: true, rateDefinition: { price: money(0) }, priceConditionsToCreate: [{ criteria: money(s.freeOver), operator: 'GREATER_THAN_OR_EQUAL_TO' }] })
  } else {
    create.push({ name: 'Standard', active: true, rateDefinition: { price: money(s.standard) } })
  }
  if (s.express != null) create.push({ name: 'Express', active: true, rateDefinition: { price: money(s.express) } })

  // Real method ids only (rate-range rows share their parent's id with a ?source suffix).
  const toDelete = [...new Set(t.zone.methodDefinitions.nodes.map((m) => m.id.split('?')[0]))]
  const r = await admin<{ deliveryProfileUpdate: { userErrors: { message: string }[] } }>(
    `mutation S($id: ID!, $profile: DeliveryProfileInput!) { deliveryProfileUpdate(id: $id, profile: $profile) { profile { id } userErrors { message } } }`,
    {
      id: t.profile.id,
      profile: {
        methodDefinitionsToDelete: toDelete,
        locationGroupsToUpdate: [{ id: t.group.locationGroup.id, zonesToUpdate: [{ id: t.zone.zone.id, methodDefinitionsToCreate: create }] }],
      },
    },
  )
  check(r.deliveryProfileUpdate, 'Save shipping')
}

export async function savePickup(p: PickupSettings) {
  if (!PICKUP_TIMES.includes(p.pickupTime)) throw new Error('Pick a pickup time from the list')
  const t = await shippingTarget()
  if (!t.location) throw new Error('No shop location in Shopify')
  const r = await admin<{ locationLocalPickupEnable: { userErrors: { message: string }[] } }>(
    `mutation L($s: DeliveryLocationLocalPickupEnableInput!) { locationLocalPickupEnable(localPickupSettings: $s) { localPickupSettings { pickupTime } userErrors { message } } }`,
    { s: { locationId: t.location.id, pickupTime: p.pickupTime, instructions: p.instructions.slice(0, 500) } },
  )
  check(r.locationLocalPickupEnable, 'Save pickup')
}
