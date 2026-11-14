import { getStore } from '@netlify/blobs'
import { admin, check } from './shopify-admin'
import { PRICE_GROUPS } from './price-groups'

/**
 * Prices, weights, shipping and pickup for the staff Prices page. Prices and
 * weights are written to Shopify, which the website, the designer and
 * checkout all read live, so one save updates the whole site.
 *
 * Prices are set per price group (one printed format), not per design: see
 * price-groups.ts. Shipping is charged by order weight. Staff enter the
 * weight of one finished piece per paper, and each variant's weight is
 * worked out from its quantity plus the packing weight.
 *
 * Scopes: read_products, write_products, read_shipping, write_shipping, and
 * read_locations for the pickup settings (optional).
 */

interface RawVariant {
  id: string
  price: string
  selectedOptions: { name: string; value: string }[]
}
interface RawProduct {
  id: string
  title: string
  handle: string
  productType: string
  options: { name: string }[]
  variants: { nodes: RawVariant[] }
}

export interface GroupVariant {
  /** `<groupId>::<option combination>` */
  id: string
  price: number
  options: Record<string, string>
}

export interface Group {
  id: string
  label: string
  type: string
  /** Designs sharing this price table (empty for products priced on their own). */
  designs: string[]
  options: string[]
  variants: GroupVariant[]
  /** False when the designs in the group have different prices today. */
  inSync: boolean
  /** Paper names to weigh (or ['Each'] when the product has no paper option). */
  weightKeys: string[]
  /** Weight of one finished piece, in ounces, by weight key. */
  weights: Record<string, number>
  /** Units per variant come from the Quantity option (false for things sold one at a time). */
  hasQuantity: boolean
}

export interface ShippingRate {
  /** Upper end of this weight band in pounds. Null = and up (the last band). */
  upToLb: number | null
  standard: number
  /** Null = no express option for this band. */
  express: number | null
}
export interface ShippingSettings {
  rates: ShippingRate[]
}

export interface WeightSettings {
  /** Box, padding and invoice per order, in ounces. Added to every variant that has a quantity. */
  packagingOz: number
  /** groupId -> weight key -> ounces per piece. */
  groups: Record<string, Record<string, number>>
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
              methodDefinitions(first: 50) {
                nodes {
                  id name active
                  rateProvider { ... on DeliveryRateDefinition { price { amount } } }
                  methodConditions { field operator conditionCriteria { ... on MoneyV2 { amount } ... on Weight { value unit } } }
                }
              }
            }
          }
        }
      }
    }
  }
`

// Separate query: locations need the read_locations scope. Without it the page
// still loads prices and shipping and just hides the pickup settings.
const LOCATIONS = /* GraphQL */ `{ locations(first: 5) { nodes { id name isActive localPickupSettingsV2 { pickupTime instructions } } } }`
type LocationNode = { id: string; name: string; isActive: boolean; localPickupSettingsV2: { pickupTime: string; instructions: string } | null }

interface MethodNode {
  id: string
  name: string
  active: boolean
  rateProvider: { price?: { amount: string } } | null
  methodConditions: { field: string; operator: string; conditionCriteria: { amount?: string; value?: number; unit?: string } }[]
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
}

const store = () => getStore({ name: 'staff', consistency: 'strong' })

async function readWeights(): Promise<WeightSettings> {
  const w = (await store().get('weights', { type: 'json' }).catch(() => null)) as WeightSettings | null
  return { packagingOz: w?.packagingOz ?? 0, groups: w?.groups ?? {} }
}

/** The general delivery profile's first zone (the US). */
async function shippingTarget() {
  const data = await admin<ShippingResponse>(SHIPPING)
  const profile = data.deliveryProfiles.nodes.find((p) => p.default) ?? data.deliveryProfiles.nodes[0]
  const group = profile?.profileLocationGroups[0]
  const zone = group?.locationGroupZones.nodes[0]
  if (!profile || !group || !zone) throw new Error('No shipping zone is set up in Shopify yet')
  return { profile, group, zone }
}

async function shopLocation(): Promise<LocationNode | null> {
  try {
    const d = await admin<{ locations: { nodes: LocationNode[] } }>(LOCATIONS)
    return d.locations.nodes.find((l) => l.isActive) ?? d.locations.nodes[0] ?? null
  } catch (e) {
    console.error('locations (pickup settings hidden)', e)
    return null
  }
}

async function rawProducts() {
  const p = await admin<{ products: { nodes: RawProduct[] } }>(PRODUCTS, { q: 'status:active' })
  return p.products.nodes
}

const optionNames = (p: RawProduct) => p.options.map((o) => o.name).filter((o) => o !== 'Title')
const optionsOf = (v: RawVariant) => Object.fromEntries(v.selectedOptions.filter((o) => o.name !== 'Title').map((o) => [o.name, o.value])) as Record<string, string>
const comboKey = (names: string[], opts: Record<string, string>) => names.map((n) => `${n}=${opts[n] ?? ''}`).join('|')
const paperOption = (names: string[]) => names.find((n) => /paper|stock/i.test(n))
const quantityOption = (names: string[]) => names.find((n) => /quantity|qty/i.test(n))

/** Products sorted into price groups. Ungrouped products get a group of their own. */
function groupProducts(products: RawProduct[]) {
  const byHandle = new Map(products.map((p) => [p.handle, p]))
  const used = new Set<string>()
  const groups: { id: string; label: string; listed: boolean; members: RawProduct[] }[] = []
  for (const g of PRICE_GROUPS) {
    const members = g.handles.map((h) => byHandle.get(h)).filter((p): p is RawProduct => !!p)
    if (!members.length) continue
    members.forEach((m) => used.add(m.handle))
    groups.push({ id: g.id, label: g.label, listed: true, members })
  }
  for (const p of products) if (!used.has(p.handle)) groups.push({ id: p.handle, label: p.title, listed: false, members: [p] })
  return groups
}

const shortTitle = (t: string) => t.replace(/^[^:]+:\s*/, '')

function toLb(value: number, unit: string) {
  if (unit === 'OUNCES') return value / 16
  if (unit === 'GRAMS') return value / 453.592
  if (unit === 'KILOGRAMS') return value * 2.20462
  return value
}

export async function readPrices() {
  const [products, t, location, weights] = await Promise.all([rawProducts(), shippingTarget(), shopLocation(), readWeights()])

  const groups: Group[] = groupProducts(products).map(({ id, label, listed, members }) => {
    const lead = members[0]
    const names = optionNames(lead)
    const variants = lead.variants.nodes.map((v) => {
      const options = optionsOf(v)
      return { id: `${id}::${comboKey(names, options)}`, price: Number(v.price), options }
    })
    const inSync = members.every((m) =>
      variants.every((gv) => Number(m.variants.nodes.find((v) => `${id}::${comboKey(names, optionsOf(v))}` === gv.id)?.price ?? NaN) === gv.price),
    )
    const paper = paperOption(names)
    return {
      id,
      label,
      type: lead.productType || 'Other',
      designs: listed ? members.map((m) => shortTitle(m.title)) : [],
      options: names,
      variants,
      inSync,
      // Fees (rush) don't ship, so they have nothing to weigh.
      weightKeys: /fee/i.test(lead.productType) ? [] : paper ? [...new Set(variants.map((v) => v.options[paper]))] : ['Each'],
      weights: weights.groups[id] ?? {},
      hasQuantity: !!quantityOption(names),
    }
  })

  // Shipping bands from the zone's rates. Standard rates are everything not named Express.
  const methods = t.zone.methodDefinitions.nodes.filter((m) => m.active && !m.methodConditions.some((x) => x.field === 'TOTAL_PRICE'))
  const amount = (m: MethodNode) => Number(m.rateProvider?.price?.amount ?? 0)
  const maxLb = (m: MethodNode) => {
    const c = m.methodConditions.find((x) => x.field === 'TOTAL_WEIGHT' && x.operator === 'LESS_THAN_OR_EQUAL_TO')
    return c?.conditionCriteria.value != null ? Math.round(toLb(c.conditionCriteria.value, c.conditionCriteria.unit ?? 'POUNDS') * 100) / 100 : null
  }
  const rates: ShippingRate[] = methods
    .filter((m) => !/express/i.test(m.name))
    .map((m) => ({ upToLb: maxLb(m), standard: amount(m), express: null as number | null }))
    .sort((a, b) => (a.upToLb ?? Infinity) - (b.upToLb ?? Infinity))
  if (!rates.length) rates.push({ upToLb: null, standard: 0, express: null })
  for (const e of methods.filter((m) => /express/i.test(m.name))) {
    const hasWeight = e.methodConditions.some((x) => x.field === 'TOTAL_WEIGHT')
    // A flat express rate (no weight band) applies to every band.
    for (const r of rates) if (!hasWeight || r.upToLb === maxLb(e)) r.express = amount(e)
  }

  const pickup: PickupSettings | null = location?.localPickupSettingsV2
    ? { pickupTime: location.localPickupSettingsV2.pickupTime as PickupSettings['pickupTime'], instructions: location.localPickupSettingsV2.instructions }
    : null
  const shipping: ShippingSettings = { rates }
  return { groups, shipping, packagingOz: weights.packagingOz, pickup }
}

const MIN_PRICE = 0.5
const MAX_PRICE = 20000

async function bulkUpdate(productId: string, variants: Record<string, unknown>[], label: string) {
  const r = await admin<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
    `mutation U($p: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { message } } }`,
    { p: productId, v: variants },
  )
  check(r.productVariantsBulkUpdate, label)
}

/**
 * Price changes by group. Every design in a touched group gets the group's
 * full price table (edited cells plus the current ones), so the designs in a
 * group always end up matching.
 */
export async function savePrices(changes: { variantId: string; price: number }[]) {
  const edits = new Map<string, number>()
  for (const c of changes) {
    const price = Math.round(Number(c.price) * 100) / 100
    if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) throw new Error(`Prices must be between $${MIN_PRICE} and $${MAX_PRICE}`)
    edits.set(String(c.variantId), price)
  }
  const touched = new Set([...edits.keys()].map((k) => k.split('::')[0]))
  const groups = groupProducts(await rawProducts()).filter((g) => touched.has(g.id))
  let count = 0
  for (const g of groups) {
    const names = optionNames(g.members[0])
    const table = new Map(g.members[0].variants.nodes.map((v) => [comboKey(names, optionsOf(v)), Number(v.price)]))
    for (const [k, price] of edits) if (k.startsWith(`${g.id}::`)) table.set(k.slice(g.id.length + 2), price)
    for (const m of g.members) {
      const variants = m.variants.nodes.flatMap((v) => {
        const price = table.get(comboKey(names, optionsOf(v)))
        return price == null ? [] : [{ id: v.id, price: price.toFixed(2) }]
      })
      if (!variants.length) continue
      await bulkUpdate(m.id, variants, 'Save prices')
      count++
    }
  }
  return count
}

/**
 * Saves piece weights and packing weight, then writes each variant's
 * shipping weight to Shopify: pieces x weight per piece + packing.
 */
export async function saveWeights(w: WeightSettings) {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000
  if (!ok(w.packagingOz)) throw new Error('Packing weight looks wrong')
  const clean: WeightSettings = { packagingOz: Math.round(w.packagingOz * 100) / 100, groups: {} }
  for (const [g, keys] of Object.entries(w.groups ?? {})) {
    clean.groups[g] = {}
    for (const [k, oz] of Object.entries(keys ?? {})) {
      if (!ok(oz)) throw new Error('Piece weights must be between 0 and 1000 oz')
      if (oz > 0) clean.groups[g][k] = Math.round(oz * 1000) / 1000
    }
  }
  await store().setJSON('weights', clean)

  let count = 0
  for (const g of groupProducts(await rawProducts())) {
    const per = clean.groups[g.id]
    if (!per || !Object.keys(per).length) continue
    for (const m of g.members) {
      const names = optionNames(m)
      const paper = paperOption(names)
      const qty = quantityOption(names)
      const variants = m.variants.nodes.flatMap((v) => {
        const o = optionsOf(v)
        const piece = per[paper ? o[paper] : 'Each']
        if (!piece) return []
        const pieces = qty ? parseInt((o[qty] ?? '').replace(/,/g, ''), 10) || 1 : 1
        const oz = piece * pieces + (qty ? clean.packagingOz : 0)
        return [{ id: v.id, inventoryItem: { measurement: { weight: { value: Math.round(oz * 100) / 100, unit: 'OUNCES' } } } }]
      })
      if (!variants.length) continue
      await bulkUpdate(m.id, variants, 'Save weights')
      count++
    }
  }
  return count
}

/**
 * Rewrites the US zone's rates as weight bands: one Standard rate per band
 * and, where set, one Express rate. The first band starts at 0 (so anything
 * without a weight still gets a rate) and the last has no upper limit, so
 * every order can check out. Other zones and profiles are left alone.
 */
export async function saveShipping(s: ShippingSettings) {
  const rates = s.rates ?? []
  if (!rates.length || rates.length > 12) throw new Error('Add between 1 and 12 shipping bands')
  const price = (n: number | null, allowNull: boolean) => (n == null ? allowNull : Number.isFinite(n) && n >= 0 && n <= 1000)
  for (const [i, r] of rates.entries()) {
    const last = i === rates.length - 1
    if (!price(r.standard, false) || !price(r.express, true)) throw new Error('Shipping amounts look wrong')
    if (last ? r.upToLb != null : !(r.upToLb != null && r.upToLb > 0 && r.upToLb <= 1000)) throw new Error('Each band needs an upper weight, except the last')
    if (i > 0 && !last && r.upToLb! <= rates[i - 1].upToLb!) throw new Error('Weight bands must go from lightest to heaviest')
  }
  const t = await shippingTarget()
  const money = (n: number) => ({ amount: n.toFixed(2), currencyCode: 'USD' })
  const lb = (n: number) => ({ value: n, unit: 'POUNDS' })
  const create: Record<string, unknown>[] = []
  rates.forEach((r, i) => {
    const from = i > 0 ? rates[i - 1].upToLb! : null
    const weightConditionsToCreate = [
      ...(from != null ? [{ criteria: lb(from), operator: 'GREATER_THAN_OR_EQUAL_TO' }] : []),
      ...(r.upToLb != null ? [{ criteria: lb(r.upToLb), operator: 'LESS_THAN_OR_EQUAL_TO' }] : []),
    ]
    const cond = weightConditionsToCreate.length ? { weightConditionsToCreate } : {}
    create.push({ name: 'Standard', active: true, rateDefinition: { price: money(r.standard) }, ...cond })
    if (r.express != null) create.push({ name: 'Express', active: true, rateDefinition: { price: money(r.express) }, ...cond })
  })

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
  const location = await shopLocation()
  if (!location) throw new Error('Pickup settings need the read_locations permission on the Kemp Job Board app')
  const r = await admin<{ locationLocalPickupEnable: { userErrors: { message: string }[] } }>(
    `mutation L($s: DeliveryLocationLocalPickupEnableInput!) { locationLocalPickupEnable(localPickupSettings: $s) { localPickupSettings { pickupTime } userErrors { message } } }`,
    { s: { locationId: location.id, pickupTime: p.pickupTime, instructions: p.instructions.slice(0, 500) } },
  )
  check(r.locationLocalPickupEnable, 'Save pickup')
}
