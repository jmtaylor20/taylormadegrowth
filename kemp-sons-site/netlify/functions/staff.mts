import type { Config, Context } from '@netlify/functions'
import { checkPassword, clearCookie, isStaff, sessionCookie, staffConfigured } from '../lib/staff-auth'
import { admin, adminConfigured, check } from '../lib/shopify-admin'
import { sendText, textingEnabled, toE164 } from '../lib/notify'
import { readPrices, savePickup, savePrices, saveShipping, type PickupSettings, type ShippingSettings } from '../lib/prices'

/**
 * Staff job board API (used by /staff/).
 *
 *   POST /api/staff/login       { password }         sign in
 *   POST /api/staff/logout                           sign out
 *   GET  /api/staff/jobs                             open and recent jobs
 *   POST /api/staff/jobs/:id    { action, ... }      move a job
 *
 * Jobs are Shopify orders. The shop's own production stage lives on the order
 * as a tag (stage-printing, stage-ready), so it also shows in Shopify admin.
 * Actions:
 *   new | printing        set the stage
 *   ready                 pickup: Shopify marks it ready and emails the customer
 *                         (plus a text when Twilio is set up). Shipping: just the stage.
 *   picked-up             pickup: mark fulfilled (no email)
 *   ship  { tracking, carrier }   fulfill with tracking; Shopify emails the customer
 *   note  { note }        save the order note
 */

const STAGE_TAGS = ['stage-printing', 'stage-ready']
const DONE_DAYS = 7
const LOOKBACK_DAYS = 90

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers } })

const SHOP = {
  name: 'Kemp & Sons',
  address: '2301 Enterprise Drive, Opelika',
  phone: '(334) 705-5888',
}

/* ---------- Reading orders ---------- */

const ORDERS = /* GraphQL */ `
  query Jobs($q: String!) {
    orders(first: 100, sortKey: CREATED_AT, reverse: true, query: $q) {
      nodes {
        id legacyResourceId name createdAt note tags closed
        displayFulfillmentStatus displayFinancialStatus
        email phone
        totalPriceSet { shopMoney { amount } }
        customer { displayName defaultPhoneNumber { phoneNumber } }
        shippingAddress { name address1 address2 city provinceCode zip phone }
        fulfillmentOrders(first: 10) { nodes { id status deliveryMethod { methodType } } }
        fulfillments(first: 5) { createdAt trackingInfo { number url company } }
        lineItems(first: 30) { nodes { title variantTitle quantity customAttributes { key value } } }
      }
    }
  }
`

interface OrderNode {
  id: string
  legacyResourceId: string
  name: string
  createdAt: string
  note: string | null
  tags: string[]
  closed: boolean
  displayFulfillmentStatus: string
  displayFinancialStatus: string | null
  email: string | null
  phone: string | null
  totalPriceSet: { shopMoney: { amount: string } }
  customer: { displayName: string; defaultPhoneNumber: { phoneNumber: string } | null } | null
  shippingAddress: { name: string | null; address1: string | null; address2: string | null; city: string | null; provinceCode: string | null; zip: string | null; phone: string | null } | null
  fulfillmentOrders: { nodes: { id: string; status: string; deliveryMethod: { methodType: string } | null }[] }
  fulfillments: { createdAt: string; trackingInfo: { number: string | null; url: string | null; company: string | null }[] }[]
  lineItems: { nodes: { title: string; variantTitle: string | null; quantity: number; customAttributes: { key: string; value: string | null }[] }[] }
}

export type Stage = 'new' | 'printing' | 'ready' | 'done'

function toJob(o: OrderNode) {
  const fos = o.fulfillmentOrders.nodes
  const methods = new Set(fos.map((f) => f.deliveryMethod?.methodType))
  const method = methods.has('PICK_UP') ? 'pickup' : methods.has('SHIPPING') ? 'ship' : methods.has('LOCAL') ? 'local' : 'none'
  const fulfilled = o.displayFulfillmentStatus === 'FULFILLED'
  const stage: Stage = fulfilled ? 'done' : o.tags.includes('stage-ready') ? 'ready' : o.tags.includes('stage-printing') ? 'printing' : 'new'
  const attr = (li: OrderNode['lineItems']['nodes'][number], k: string) => li.customAttributes.find((a) => a.key === k)?.value ?? null
  const lastFulfillment = o.fulfillments.at(-1)
  return {
    id: o.id,
    legacyId: o.legacyResourceId,
    adminUrl: `https://admin.shopify.com/store/${(process.env.SHOPIFY_STORE_DOMAIN ?? '').replace('.myshopify.com', '')}/orders/${o.legacyResourceId}`,
    name: o.name,
    createdAt: o.createdAt,
    stage,
    method,
    customer: o.customer?.displayName ?? o.shippingAddress?.name ?? o.email ?? 'Customer',
    email: o.email,
    phone: o.phone ?? o.customer?.defaultPhoneNumber?.phoneNumber ?? o.shippingAddress?.phone ?? null,
    address: method === 'ship' && o.shippingAddress
      ? [o.shippingAddress.address1, o.shippingAddress.address2, [o.shippingAddress.city, o.shippingAddress.provinceCode, o.shippingAddress.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      : null,
    paid: o.displayFinancialStatus,
    total: Number(o.totalPriceSet.shopMoney.amount),
    note: o.note ?? '',
    doneAt: fulfilled ? lastFulfillment?.createdAt ?? null : null,
    tracking: lastFulfillment?.trackingInfo[0] ?? null,
    items: o.lineItems.nodes.map((li) => ({
      title: li.title,
      variant: li.variantTitle,
      qty: li.quantity,
      design: attr(li, 'Design'),
      ref: attr(li, '_Reference'),
      printUrl: attr(li, '_Print file'),
      proofUrl: attr(li, '_Proof'),
      envelopesUrl: attr(li, '_Envelopes file'),
    })),
  }
}

async function listJobs() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10)
  const data = await admin<{ orders: { nodes: OrderNode[] } }>(ORDERS, { q: `created_at:>=${since} -status:cancelled` })
  const cutoff = Date.now() - DONE_DAYS * 86400_000
  return data.orders.nodes
    .map(toJob)
    .filter((j, i) => {
      const o = data.orders.nodes[i]
      if (j.stage === 'done') return !j.doneAt || Date.parse(j.doneAt) > cutoff
      return !o.closed // archived without being fulfilled: hidden
    })
}

/* ---------- Actions ---------- */

async function getOrder(id: string) {
  const data = await admin<{ order: OrderNode | null }>(
    `query One($id: ID!) { order(id: $id) { id legacyResourceId name createdAt note tags closed displayFulfillmentStatus displayFinancialStatus email phone
      totalPriceSet { shopMoney { amount } } customer { displayName defaultPhoneNumber { phoneNumber } }
      shippingAddress { name address1 address2 city provinceCode zip phone }
      fulfillmentOrders(first: 10) { nodes { id status deliveryMethod { methodType } } }
      fulfillments(first: 5) { createdAt trackingInfo { number url company } }
      lineItems(first: 30) { nodes { title variantTitle quantity customAttributes { key value } } } } }`,
    { id },
  )
  if (!data.order) throw new Error('Order not found')
  return data.order
}

async function setStageTag(id: string, tag: string | null) {
  const remove = STAGE_TAGS.filter((t) => t !== tag)
  const r = await admin<{ tagsRemove: { userErrors: { message: string }[] } }>(
    `mutation R($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`,
    { id, tags: remove },
  )
  check(r.tagsRemove, 'Remove stage')
  if (tag) {
    const a = await admin<{ tagsAdd: { userErrors: { message: string }[] } }>(
      `mutation A($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
      { id, tags: [tag] },
    )
    check(a.tagsAdd, 'Set stage')
  }
}

const openFOs = (o: OrderNode) => o.fulfillmentOrders.nodes.filter((f) => f.status === 'OPEN' || f.status === 'IN_PROGRESS')

async function fulfill(o: OrderNode, notifyCustomer: boolean, tracking?: { number?: string; company?: string; url?: string }) {
  const fos = openFOs(o)
  if (!fos.length) throw new Error('Nothing left to fulfill on this order')
  const r = await admin<{ fulfillmentCreate: { userErrors: { message: string }[] } }>(
    `mutation F($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { message } } }`,
    {
      f: {
        lineItemsByFulfillmentOrder: fos.map((f) => ({ fulfillmentOrderId: f.id })),
        notifyCustomer,
        ...(tracking?.number ? { trackingInfo: { number: tracking.number, company: tracking.company || undefined, url: tracking.url || undefined } } : {}),
      },
    },
  )
  check(r.fulfillmentCreate, 'Fulfill')
}

async function act(id: string, body: Record<string, string | undefined>) {
  const o = await getOrder(id)
  const job = toJob(o)
  const notes: string[] = []
  switch (body.action) {
    case 'new':
      await setStageTag(id, null)
      break
    case 'printing':
      await setStageTag(id, 'stage-printing')
      break
    case 'ready': {
      if (job.method === 'pickup') {
        const fos = openFOs(o).filter((f) => f.deliveryMethod?.methodType === 'PICK_UP')
        const r = await admin<{ fulfillmentOrderLineItemsPreparedForPickup: { userErrors: { message: string }[] } }>(
          `mutation P($input: FulfillmentOrderLineItemsPreparedForPickupInput!) { fulfillmentOrderLineItemsPreparedForPickup(input: $input) { userErrors { message } } }`,
          { input: { lineItemsByFulfillmentOrder: fos.map((f) => ({ fulfillmentOrderId: f.id })) } },
        )
        check(r.fulfillmentOrderLineItemsPreparedForPickup, 'Ready for pickup')
        notes.push(`Pickup email sent to ${job.email ?? 'the customer'}.`)
        const to = toE164(job.phone)
        if (textingEnabled() && to && body.text !== 'no') {
          try {
            await sendText(to, `${SHOP.name}: your order ${job.name} is ready for pickup at ${SHOP.address}. Questions? ${SHOP.phone}`)
            notes.push(`Text sent to ${job.phone}.`)
          } catch {
            notes.push('The text could not be sent; the email went out.')
          }
        }
      }
      await setStageTag(id, 'stage-ready')
      break
    }
    case 'picked-up':
      await fulfill(o, false)
      await setStageTag(id, null)
      notes.push('Marked picked up.')
      break
    case 'ship':
      await fulfill(o, true, { number: body.tracking?.trim(), company: body.carrier?.trim() })
      await setStageTag(id, null)
      notes.push(`Shipping email sent to ${job.email ?? 'the customer'}.`)
      break
    case 'note': {
      const r = await admin<{ orderUpdate: { userErrors: { message: string }[] } }>(
        `mutation N($input: OrderInput!) { orderUpdate(input: $input) { order { id } userErrors { message } } }`,
        { input: { id, note: (body.note ?? '').slice(0, 5000) } },
      )
      check(r.orderUpdate, 'Save note')
      break
    }
    default:
      throw new Error('Unknown action')
  }
  return { job: toJob(await getOrder(id)), message: notes.join(' ') }
}

/* ---------- Router ---------- */

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, '')

  if (path === '/api/staff/login' && req.method === 'POST') {
    if (!staffConfigured()) return json({ error: 'The staff board is not set up yet (STAFF_PASSWORD and STAFF_SESSION_SECRET).' }, 503)
    const { password = '' } = ((await req.json().catch(() => ({}))) as { password?: string }) ?? {}
    const result = await checkPassword(String(password), context.ip ?? 'unknown')
    if (result === 'locked') return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429)
    if (result === 'wrong') return json({ error: 'That password is not right.' }, 401)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie() })
  }
  if (path === '/api/staff/logout' && req.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() })

  // Setup check, safe without signing in: reports only whether things are connected, never data.
  if (path === '/api/staff/status' && req.method === 'GET') {
    let shopify: 'not configured' | 'connected' | 'error' = adminConfigured() ? 'error' : 'not configured'
    let scopes: string[] = []
    if (adminConfigured()) {
      try {
        const d = await admin<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(`{ currentAppInstallation { accessScopes { handle } } }`)
        scopes = d.currentAppInstallation.accessScopes.map((s) => s.handle).sort()
        shopify = 'connected'
      } catch (e) {
        console.error('status check', e)
      }
    }
    const needed = ['read_orders', 'write_orders', 'read_merchant_managed_fulfillment_orders', 'write_merchant_managed_fulfillment_orders', 'read_products', 'write_products', 'read_shipping', 'write_shipping']
    return json({
      login: staffConfigured() ? 'configured' : 'not configured',
      shopify,
      scopes,
      missingScopes: shopify === 'connected' ? needed.filter((n) => !scopes.includes(n)) : needed,
      // Optional: lets the Prices page edit local pickup settings.
      pickupSettings: scopes.includes('read_locations') ? 'available' : 'needs read_locations',
      texting: textingEnabled() ? 'on' : 'off',
    })
  }

  if (!isStaff(req)) return json({ error: 'Sign in required' }, 401)
  if (!adminConfigured()) return json({ error: 'Shopify is not connected to the staff board yet (SHOPIFY_ADMIN_CLIENT_ID and SHOPIFY_ADMIN_CLIENT_SECRET).' }, 503)

  try {
    if (path === '/api/staff/jobs' && req.method === 'GET') return json({ jobs: await listJobs(), texting: textingEnabled() })

    // Prices page: every product price, shipping rates and pickup settings, saved straight to Shopify.
    if (path === '/api/staff/prices' && req.method === 'GET') return json(await readPrices())
    if (path === '/api/staff/prices' && req.method === 'POST') {
      const origin = req.headers.get('origin')
      if (origin && origin !== new URL(req.url).origin) return json({ error: 'Bad origin' }, 403)
      const body = (await req.json().catch(() => ({}))) as {
        variants?: { productId: string; variantId: string; price: number }[]
        shipping?: ShippingSettings
        pickup?: PickupSettings
      }
      const done: string[] = []
      if (body.variants?.length) done.push(`${await savePrices(body.variants)} product(s) updated`)
      if (body.shipping) {
        await saveShipping(body.shipping)
        done.push('shipping updated')
      }
      if (body.pickup) {
        await savePickup(body.pickup)
        done.push('pickup updated')
      }
      return json({ ok: true, message: done.length ? `Saved: ${done.join(', ')}.` : 'Nothing to save.', ...(await readPrices()) })
    }
    const m = path.match(/^\/api\/staff\/jobs\/(\d+)$/)
    if (m && req.method === 'POST') {
      // Same-origin requests only (the cookie is SameSite=Strict too).
      const origin = req.headers.get('origin')
      if (origin && origin !== new URL(req.url).origin) return json({ error: 'Bad origin' }, 403)
      const body = (await req.json().catch(() => ({}))) as Record<string, string>
      return json(await act(`gid://shopify/Order/${m[1]}`, body))
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    console.error(e)
    const msg = (e as Error).message
    if (/access denied/i.test(msg))
      return json(
        {
          error:
            "Shopify hasn't given this page permission yet. In the Dev Dashboard, the Kemp Job Board app needs read_products, write_products, read_shipping and write_shipping, released and approved on the store.",
        },
        403,
      )
    return json({ error: msg }, 502)
  }
}

export const config: Config = { path: ['/api/staff/*'] }
