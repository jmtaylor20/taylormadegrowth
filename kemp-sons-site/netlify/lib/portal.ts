import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'

/**
 * Funeral home portal: partner homes and their sign-in.
 *
 * Staff add a home on /staff/homes/ and send it a private link
 * (/portal/?h=<slug>&k=<key>). Opening the link signs that device in for 90
 * days with a signed, HttpOnly cookie. Only a hash of the key is stored, so a
 * lost link can't be recovered, only replaced (which also ends the old link).
 */

export interface Home {
  slug: string
  name: string
  /** Street address, one line. */
  address: string
  /** City, state ZIP. */
  city: string
  phone: string
  contact: string
  email: string
  notes: string
  active: boolean
  createdAt: string
  keyHash: string
  /** Bumped when the link is replaced, which signs out devices using the old one. */
  keyVersion: number
}

export type PublicHome = Omit<Home, 'keyHash' | 'keyVersion' | 'notes'>

const COOKIE = 'kemp_home'
const SESSION_DAYS = 90
const MAX_FAILS = 10
const LOCK_MS = 15 * 60 * 1000

const store = () => getStore({ name: 'portal', consistency: 'strong' })
const secret = () => process.env.STAFF_SESSION_SECRET ?? ''
const hash = (key: string) => createHash('sha256').update(key).digest('hex')
const sign = (v: string) => createHmac('sha256', `home|${secret()}`).update(v).digest('base64url')
const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const portalConfigured = () => secret().length >= 32

export async function listHomes(): Promise<Home[]> {
  return ((await store().get('homes', { type: 'json' })) as Home[] | null) ?? []
}

async function saveAll(homes: Home[]) {
  await store().setJSON('homes', homes)
}

export async function getHome(slug: string) {
  return (await listHomes()).find((h) => h.slug === slug) ?? null
}

export const publicHome = ({ keyHash: _k, keyVersion: _v, notes: _n, ...rest }: Home): PublicHome => rest

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'home'

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

export interface HomeInput {
  slug?: string
  name: string
  address?: string
  city?: string
  phone?: string
  contact?: string
  email?: string
  notes?: string
  active?: boolean
}

/** Adds a home (returns its sign-in key, shown once) or updates one (no key). */
export async function saveHome(input: HomeInput): Promise<{ home: Home; key: string | null }> {
  const name = clip(input.name, 100)
  if (!name) throw new Error('The funeral home needs a name')
  const homes = await listHomes()
  const fields = {
    name,
    address: clip(input.address, 120),
    city: clip(input.city, 80),
    phone: clip(input.phone, 40),
    contact: clip(input.contact, 80),
    email: clip(input.email, 120),
    notes: clip(input.notes, 1000),
  }
  if (input.slug) {
    const i = homes.findIndex((h) => h.slug === input.slug)
    if (i < 0) throw new Error('That funeral home was not found')
    // Only the fields that were sent change (pausing a home doesn't wipe its address).
    const sent = Object.fromEntries(Object.entries(fields).filter(([k]) => k in input)) as Partial<typeof fields>
    homes[i] = { ...homes[i], ...sent, active: input.active ?? homes[i].active }
    await saveAll(homes)
    return { home: homes[i], key: null }
  }
  let slug = slugify(name)
  for (let n = 2; homes.some((h) => h.slug === slug); n++) slug = `${slugify(name)}-${n}`
  const key = randomBytes(18).toString('base64url')
  const home: Home = { slug, ...fields, active: true, createdAt: new Date().toISOString(), keyHash: hash(key), keyVersion: 1 }
  homes.push(home)
  await saveAll(homes)
  return { home, key }
}

/** New sign-in link for a home; the old link and every device signed in with it stop working. */
export async function resetKey(slug: string): Promise<string> {
  const homes = await listHomes()
  const h = homes.find((x) => x.slug === slug)
  if (!h) throw new Error('That funeral home was not found')
  const key = randomBytes(18).toString('base64url')
  h.keyHash = hash(key)
  h.keyVersion = (h.keyVersion ?? 1) + 1
  await saveAll(homes)
  return key
}

/** Checks a sign-in link, with a lockout after repeated misses from the same address. */
export async function checkKey(slug: string, key: string, ip: string): Promise<Home | 'wrong' | 'locked'> {
  const s = store()
  const failKey = `fails/${ip.replace(/[^a-zA-Z0-9.:]/g, '_')}`
  const rec = ((await s.get(failKey, { type: 'json' })) as { n: number; at: number } | null) ?? { n: 0, at: 0 }
  if (rec.n >= MAX_FAILS && Date.now() - rec.at < LOCK_MS) return 'locked'
  const home = await getHome(slug)
  if (home?.active && safeEqual(home.keyHash, hash(key))) {
    await s.delete(failKey)
    return home
  }
  await s.setJSON(failKey, { n: Date.now() - rec.at > LOCK_MS ? 1 : rec.n + 1, at: Date.now() })
  return 'wrong'
}

export function homeCookie(home: Home) {
  const exp = String(Date.now() + SESSION_DAYS * 86400_000)
  const v = `${home.slug}.${home.keyVersion}.${exp}`
  return `${COOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`
}

export const clearHomeCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

/** The signed-in home for a request, or null. */
export async function homeFromRequest(req: Request): Promise<Home | null> {
  if (!portalConfigured()) return null
  const raw = (req.headers.get('cookie') ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))
  if (!raw) return null
  const parts = raw.slice(COOKIE.length + 1).split('.')
  if (parts.length !== 4) return null
  const [slug, version, exp, mac] = parts
  if (Number(exp) < Date.now() || !safeEqual(mac, sign(`${slug}.${version}.${exp}`))) return null
  const home = await getHome(slug)
  return home?.active && String(home.keyVersion) === version ? home : null
}
