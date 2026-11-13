/**
 * Minimal Shopify Storefront API client, used at build time.
 *
 * Needs two environment variables (set in Netlify once the store exists):
 *   SHOPIFY_STORE_DOMAIN        e.g. kemp-sons.myshopify.com
 *   SHOPIFY_STOREFRONT_TOKEN    public Storefront API access token (Headless channel)
 *
 * When they're missing, every helper returns null and the site renders its
 * built-in content, so the site works before Shopify is set up.
 */

const API_VERSION = '2026-10'

const domain = import.meta.env.SHOPIFY_STORE_DOMAIN as string | undefined
const token = import.meta.env.SHOPIFY_STOREFRONT_TOKEN as string | undefined

export const shopifyConfigured = Boolean(domain && token)

async function storefront<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  if (!shopifyConfigured) return null
  try {
    const res = await fetch(`https://${domain}/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token!,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) {
      console.warn(`[shopify] ${res.status} ${res.statusText}`)
      return null
    }
    const json = (await res.json()) as { data?: T; errors?: unknown }
    if (json.errors) console.warn('[shopify] GraphQL errors', JSON.stringify(json.errors))
    return json.data ?? null
  } catch (err) {
    console.warn('[shopify] request failed', err)
    return null
  }
}

export interface CollectionSummary {
  handle: string
  title: string
  description: string
  onlineStoreUrl: string | null
  image: { url: string; altText: string | null } | null
  startingPrice: { amount: string; currencyCode: string } | null
  productCount: number
}

const COLLECTION_QUERY = /* GraphQL */ `
  query Collection($handle: String!) {
    collection(handle: $handle) {
      handle
      title
      description
      onlineStoreUrl
      image { url(transform: { maxWidth: 900 }) altText }
      products(first: 50) {
        nodes {
          priceRange { minVariantPrice { amount currencyCode } }
          featuredImage { url(transform: { maxWidth: 900 }) altText }
        }
      }
    }
  }
`

interface CollectionResponse {
  collection: null | {
    handle: string
    title: string
    description: string
    onlineStoreUrl: string | null
    image: { url: string; altText: string | null } | null
    products: {
      nodes: {
        priceRange: { minVariantPrice: { amount: string; currencyCode: string } }
        featuredImage: { url: string; altText: string | null } | null
      }[]
    }
  }
}

/** Collection summary for one product line, or null if Shopify isn't set up or the collection doesn't exist yet. */
export async function getCollection(handle: string): Promise<CollectionSummary | null> {
  const data = await storefront<CollectionResponse>(COLLECTION_QUERY, { handle })
  const c = data?.collection
  if (!c) return null
  const prices = c.products.nodes.map((p) => p.priceRange.minVariantPrice)
  const cheapest = prices.sort((a, b) => Number(a.amount) - Number(b.amount))[0] ?? null
  return {
    handle: c.handle,
    title: c.title,
    description: c.description,
    onlineStoreUrl: c.onlineStoreUrl,
    image: c.image ?? c.products.nodes.find((p) => p.featuredImage)?.featuredImage ?? null,
    startingPrice: cheapest,
    productCount: c.products.nodes.length,
  }
}

export function formatPrice(p: { amount: string; currencyCode: string } | null): string | null {
  if (!p) return null
  return Number(p.amount).toLocaleString('en-US', { style: 'currency', currency: p.currencyCode })
}
