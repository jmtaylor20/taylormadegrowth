import type { Config, Context } from '@netlify/functions'
import { admin, adminConfigured } from '../lib/shopify-admin'
import { checkKey, clearHomeCookie, homeCookie, homeFromRequest, portalConfigured, publicHome } from '../lib/portal'

/**
 * Funeral home portal API (used by /portal/ and the designer).
 *
 *   POST /api/portal/login   { slug, key }   sign in with the home's private link
 *   POST /api/portal/logout                  sign out this device
 *   GET  /api/portal/me                      the signed-in home (401 when not signed in)
 *   GET  /api/portal/orders                  the home's recent orders
 *
 * Orders are tied to a home by the "_Home ID" attribute the designer adds to
 * the cart, so they show here and on the staff job board.
 */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers } })

const sameOrigin = (req: Request) => {
  const origin = req.headers.get('origin')
  return !origin || origin === new URL(req.url).origin
}

interface OrderNode {
  name: string
  createdAt: string
  displayFulfillmentStatus: string
  displayFinancialStatus: string | null
  totalPriceSet: { shopMoney: { amount: string } }
  customAttributes: { key: string; value: string | null }[]
  lineItems: { nodes: { title: string; variantTitle: string | null; quantity: number; customAttributes: { key: string; value: string | null }[] }[] }
}

async function homeOrders(slug: string) {
  const since = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10)
  const d = await admin<{ orders: { nodes: OrderNode[] } }>(
    `query O($q: String!) { orders(first: 100, sortKey: CREATED_AT, reverse: true, query: $q) { nodes {
      name createdAt displayFulfillmentStatus displayFinancialStatus totalPriceSet { shopMoney { amount } }
      customAttributes { key value }
      lineItems(first: 20) { nodes { title variantTitle quantity customAttributes { key value } } }
    } } }`,
    { q: `created_at:>=${since}` },
  )
  return d.orders.nodes
    .filter((o) => o.customAttributes.some((a) => a.key === '_Home ID' && a.value === slug))
    .map((o) => {
      const main = o.lineItems.nodes[0]
      const attr = (k: string) => main?.customAttributes.find((a) => a.key === k)?.value ?? null
      return {
        name: o.name,
        createdAt: o.createdAt,
        status: o.displayFulfillmentStatus,
        paid: o.displayFinancialStatus,
        total: Number(o.totalPriceSet.shopMoney.amount),
        design: attr('Design') ?? main?.title ?? '',
        options: main?.variantTitle ?? '',
        // Reopen the same design to make a change or order more.
        reorder: attr('_Reorder'),
        proof: attr('_Proof'),
      }
    })
}

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, '')
  if (!portalConfigured()) return json({ error: 'The funeral home portal is not set up yet.' }, 503)

  if (path === '/api/portal/login' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403)
    const { slug = '', key = '' } = ((await req.json().catch(() => ({}))) as { slug?: string; key?: string }) ?? {}
    const r = await checkKey(String(slug).slice(0, 64), String(key).slice(0, 64), context.ip ?? 'unknown')
    if (r === 'locked') return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429)
    if (r === 'wrong') return json({ error: 'That link is not valid anymore. Ask Kemp & Sons for a new one.' }, 401)
    return json({ ok: true, home: publicHome(r) }, 200, { 'Set-Cookie': homeCookie(r) })
  }
  if (path === '/api/portal/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearHomeCookie() })

  const home = await homeFromRequest(req)
  if (!home) return json({ error: 'Sign in required' }, 401)

  if (path === '/api/portal/me' && req.method === 'GET') return json({ home: publicHome(home) })
  if (path === '/api/portal/orders' && req.method === 'GET') {
    if (!adminConfigured()) return json({ orders: [] })
    try {
      return json({ orders: await homeOrders(home.slug) })
    } catch (e) {
      console.error(e)
      return json({ error: 'Orders could not load right now.' }, 502)
    }
  }
  return json({ error: 'Not found' }, 404)
}

export const config: Config = { path: ['/api/portal/*'] }
