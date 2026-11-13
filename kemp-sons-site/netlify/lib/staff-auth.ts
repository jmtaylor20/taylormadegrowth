import { createHmac, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'

/**
 * Shared staff password, kept in Netlify env as STAFF_PASSWORD. A successful
 * login sets a signed, HttpOnly cookie (signed with STAFF_SESSION_SECRET) that
 * lasts 30 days, so the shop computer stays signed in. Changing either env
 * value and redeploying signs everyone out.
 */

const COOKIE = 'kemp_staff'
const SESSION_DAYS = 30
const MAX_FAILS = 8
const LOCK_MS = 15 * 60 * 1000

const secret = () => process.env.STAFF_SESSION_SECRET ?? ''

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function staffConfigured() {
  return Boolean(process.env.STAFF_PASSWORD && secret().length >= 32)
}

export function isStaff(req: Request): boolean {
  if (!staffConfigured()) return false
  const raw = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))
  if (!raw) return false
  const [exp, mac] = raw.slice(COOKIE.length + 1).split('.')
  if (!exp || !mac || Number(exp) < Date.now()) return false
  return safeEqual(mac, sign(exp))
}

export function sessionCookie() {
  const exp = String(Date.now() + SESSION_DAYS * 86400_000)
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/api/staff; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`
}

export const clearCookie = () => `${COOKIE}=; Path=/api/staff; HttpOnly; Secure; SameSite=Strict; Max-Age=0`

/** Checks the password, with a lockout after repeated misses from the same address. */
export async function checkPassword(password: string, ip: string): Promise<'ok' | 'wrong' | 'locked'> {
  const store = getStore({ name: 'staff', consistency: 'strong' })
  const key = `fails/${ip.replace(/[^a-zA-Z0-9.:]/g, '_')}`
  const rec = ((await store.get(key, { type: 'json' })) as { n: number; at: number } | null) ?? { n: 0, at: 0 }
  if (rec.n >= MAX_FAILS && Date.now() - rec.at < LOCK_MS) return 'locked'
  const ok = safeEqual(sign(password), sign(process.env.STAFF_PASSWORD ?? ''))
  if (ok) {
    await store.delete(key)
    return 'ok'
  }
  await store.setJSON(key, { n: Date.now() - rec.at > LOCK_MS ? 1 : rec.n + 1, at: Date.now() })
  return 'wrong'
}
