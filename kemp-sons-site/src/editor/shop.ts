/**
 * Browser-side Shopify Storefront API: product options and prices, and the
 * cart that hands the customer to Shopify checkout. The domain and public
 * token come from the page (read from Netlify env at build time).
 */

const API_VERSION = '2026-10'

export interface ShopConfig {
  domain: string
  token: string
}

async function storefront<T>(cfg: ShopConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${cfg.domain}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': cfg.token },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Shopify ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  return json.data as T
}

export interface Variant {
  id: string
  title: string
  available: boolean
  price: number
  options: Record<string, string>
}

export interface ShopProduct {
  title: string
  options: { name: string; values: string[] }[]
  variants: Variant[]
}

const PRODUCT_QUERY = /* GraphQL */ `
  query Product($handle: String!) {
    product(handle: $handle) {
      title
      options { name optionValues { name } }
      variants(first: 100) {
        nodes { id title availableForSale price { amount } selectedOptions { name value } }
      }
    }
  }
`

interface ProductResponse {
  product: null | {
    title: string
    options: { name: string; optionValues: { name: string }[] }[]
    variants: {
      nodes: { id: string; title: string; availableForSale: boolean; price: { amount: string }; selectedOptions: { name: string; value: string }[] }[]
    }
  }
}

export async function getProduct(cfg: ShopConfig, handle: string): Promise<ShopProduct | null> {
  const data = await storefront<ProductResponse>(cfg, PRODUCT_QUERY, { handle })
  const p = data.product
  if (!p) return null
  return {
    title: p.title,
    // Shopify gives single-variant products a "Title" option; there's nothing to choose.
    options: p.options.filter((o) => o.name !== 'Title').map((o) => ({ name: o.name, values: o.optionValues.map((v) => v.name) })),
    variants: p.variants.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      available: v.availableForSale,
      price: Number(v.price.amount),
      options: Object.fromEntries(v.selectedOptions.map((o) => [o.name, o.value])),
    })),
  }
}

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Starts a stored design and returns its id. Files are then added with putDesignFile. */
export async function createDesign(): Promise<string> {
  const res = await fetch('/api/designs', { method: 'POST' })
  if (!res.ok) throw new Error('Could not start the upload')
  return ((await res.json()) as { id: string }).id
}

export async function putDesignFile(id: string, kind: string, blob: Blob) {
  const res = await fetch(`/api/designs/${id}/${kind}`, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } })
  if (!res.ok) throw new Error(`Upload failed (${kind}, ${res.status})`)
}

export const designFileUrl = (id: string, kind: string) => `${window.location.origin}/api/designs/${id}/${kind}`

const CART_FIELDS = /* GraphQL */ `
  fragment CartBits on Cart { id checkoutUrl totalQuantity }
`

interface CartResult {
  cart: { id: string; checkoutUrl: string; totalQuantity: number } | null
  userErrors: { message: string }[]
}

/**
 * Adds one designed item to the customer's cart (creating the cart if needed)
 * and returns the Shopify checkout URL. Attributes starting with "_" are
 * hidden from the customer at checkout but shown to the shop on the order.
 */
export interface CartLine {
  variantId: string
  quantity: number
  attributes: Record<string, string>
}

export async function addToCart(cfg: ShopConfig, items: CartLine[]): Promise<string> {
  const lines = items.map((it) => ({ merchandiseId: it.variantId, quantity: it.quantity, attributes: Object.entries(it.attributes).map(([key, value]) => ({ key, value })) }))
  // A fresh cart for every approved design. The site has no cart page, so an
  // older unpaid design left in a reused cart would ride along unnoticed.
  const data = await storefront<{ cartCreate: CartResult }>(
    cfg,
    `${CART_FIELDS} mutation Create($input: CartInput!) { cartCreate(input: $input) { cart { ...CartBits } userErrors { message } } }`,
    { input: { lines } },
  )
  const r = data.cartCreate
  if (!r.cart || r.userErrors.length) throw new Error(r.userErrors.map((e) => e.message).join('; ') || 'Could not create cart')
  return r.cart.checkoutUrl
}
