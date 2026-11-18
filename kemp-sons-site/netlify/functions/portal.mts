import type { Config, Context } from '@netlify/functions'
import { admin, adminConfigured } from '../lib/shopify-admin'
import { checkKey, clearHomeCookie, getHome, homeCookie, homeFromRequest, portalConfigured, publicHome } from '../lib/portal'
import { addPhoto, caseFromLink, createCase, familyView, getCase, homeView, listCases, photoData, removePhoto, saveFamilyValues, type CasePhoto } from '../lib/cases'

/**
 * Funeral home portal API (used by /portal/ and the designer).
 *
 *   POST /api/portal/login   { slug, key }   sign in with the home's private link
 *   POST /api/portal/logout                  sign out this device
 *   GET  /api/portal/me                      the signed-in home (401 when not signed in)
 *   GET  /api/portal/orders                  the home's recent orders
 *   GET  /api/portal/cases                   the home's family links
 *   POST /api/portal/cases   { name, serviceDate }   new family link
 *   GET  /api/portal/cases/:id/photos/:pid   a photo the family sent
 *
 * Family link (no sign-in; the link's home, case id and token are the key):
 *   GET    /api/family/:home/:id?t=          the case as the family sees it
 *   POST   /api/family/:home/:id?t=  {...}   save the program wording
 *   POST   /api/family/:home/:id/photos?t=&kind=portrait|other   add a photo (image body)
 *   GET    /api/family/:home/:id/photos/:pid?t=   view a photo they added
 *   DELETE /api/family/:home/:id/photos/:pid?t=   remove one
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

const image = (p: { data: ArrayBuffer; type: string }) =>
  new Response(p.data, { headers: { 'Content-Type': p.type, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } })

/** The family's side: everything is checked against the link itself. */
async function family(req: Request, url: URL, path: string) {
  const m = path.match(/^\/api\/family\/([a-z0-9-]{1,64})\/([0-9a-f-]{36})(\/photos(?:\/([a-z0-9-]{1,12}))?)?$/)
  if (!m) return json({ error: 'Not found' }, 404)
  const [, homeSlug, id, photos, photoId] = m
  const c = await caseFromLink(homeSlug, id, url.searchParams.get('t') ?? '')
  const home = c ? await getHome(homeSlug) : null
  if (!c || !home?.active) return json({ error: 'This link has expired or is not valid. Please ask the funeral home for a new one.' }, 404)
  if (req.method !== 'GET' && !sameOrigin(req)) return json({ error: 'Bad origin' }, 403)

  if (!photos && req.method === 'GET') return json(familyView(c, home.name))
  if (!photos && req.method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return json(familyView(await saveFamilyValues(c, body), home.name))
  }
  if (photos && !photoId && req.method === 'POST') {
    const kind: CasePhoto['kind'] = url.searchParams.get('kind') === 'portrait' ? 'portrait' : 'other'
    try {
      await addPhoto(c, kind, (req.headers.get('content-type') ?? '').split(';')[0], await req.arrayBuffer())
      return json(familyView(c, home.name))
    } catch (e) {
      return json({ error: (e as Error).message }, 400)
    }
  }
  if (photoId && req.method === 'GET') {
    const p = await photoData(c, photoId)
    return p ? image(p) : json({ error: 'Not found' }, 404)
  }
  if (photoId && req.method === 'DELETE') {
    await removePhoto(c, photoId)
    return json(familyView(c, home.name))
  }
  return json({ error: 'Not found' }, 404)
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const path = url.pathname.replace(/\/+$/, '')
  if (!portalConfigured()) return json({ error: 'The funeral home portal is not set up yet.' }, 503)
  if (path.startsWith('/api/family/')) return family(req, url, path)

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
  if (path === '/api/portal/cases' && req.method === 'GET') return json({ cases: (await listCases(home.slug)).map((c) => homeView(c, url.origin)) })
  if (path === '/api/portal/cases' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403)
    try {
      const c = await createCase(home.slug, (await req.json().catch(() => ({}))) as { name?: string; serviceDate?: string })
      return json({ case: homeView(c, url.origin) })
    } catch (e) {
      return json({ error: (e as Error).message }, 400)
    }
  }
  const cm = path.match(/^\/api\/portal\/cases\/([0-9a-f-]{36})(?:\/photos\/([a-z0-9-]{1,12}))?$/)
  if (cm && req.method === 'GET') {
    const c = await getCase(home.slug, cm[1])
    if (!c) return json({ error: 'Not found' }, 404)
    if (!cm[2]) return json({ case: homeView(c, url.origin) })
    const p = await photoData(c, cm[2])
    return p ? image(p) : json({ error: 'Not found' }, 404)
  }
  return json({ error: 'Not found' }, 404)
}

export const config: Config = { path: ['/api/portal/*', '/api/family/*'] }
