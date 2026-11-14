import { getStore } from '@netlify/blobs'

/**
 * Shopify Admin API for the staff board. Uses a Dev Dashboard app installed on
 * Kemp's store: SHOPIFY_ADMIN_CLIENT_ID and SHOPIFY_ADMIN_CLIENT_SECRET are
 * exchanged for a 24-hour access token (client credentials grant), cached in
 * Netlify Blobs and renewed automatically.
 */

const API_VERSION = '2026-10'

export const adminConfigured = () =>
  Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_CLIENT_ID && process.env.SHOPIFY_ADMIN_CLIENT_SECRET)

async function accessToken(force = false): Promise<string> {
  const store = getStore({ name: 'staff', consistency: 'strong' })
  if (!force) {
    const cached = (await store.get('admin-token', { type: 'json' })) as { token: string; exp: number } | null
    if (cached && cached.exp > Date.now() + 5 * 60_000) return cached.token
  }
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_ADMIN_CLIENT_ID,
      client_secret: process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !body.access_token) throw new Error(`Shopify token: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim())
  await store.setJSON('admin-token', { token: body.access_token, exp: Date.now() + (body.expires_in ?? 86399) * 1000 })
  return body.access_token
}

export async function admin<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  for (const force of [false, true]) {
    const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await accessToken(force) },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 401 && !force) continue // token revoked or rotated: get a fresh one
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
    const message = json.errors?.map((e) => e.message).join('; ') ?? ''
    // Tokens are cached for 24 hours. After new scopes are approved the cached token still
    // carries the old ones, so an access-denied error gets one retry with a fresh token.
    if (!force && /access denied/i.test(message)) continue
    if (!res.ok || json.errors?.length) throw new Error(message || `Shopify ${res.status}`)
    return json.data as T
  }
  throw new Error('Shopify rejected the access token')
}

/** Throws with the userErrors message, if any. */
export function check(payload: { userErrors?: { message: string }[] } | null | undefined, what: string) {
  if (!payload) throw new Error(`${what}: no response`)
  if (payload.userErrors?.length) throw new Error(`${what}: ${payload.userErrors.map((e) => e.message).join('; ')}`)
}
