import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { getStore } from '@netlify/blobs'

/**
 * Family photo links for the funeral home portal.
 *
 * A partner home opens a case (who it's for) and gets a private link to send
 * the family. The family adds photos and the program wording on their phone,
 * no sign-in. The home then starts a program with all of it filled in.
 *
 * Each case lives under cases/<home>/<id>; its photos under photos/<id>/<n>.
 * Links stop working after LINK_DAYS, and the whole case (photos included) is
 * deleted after KEEP_DAYS by the daily cleanup.
 */

export const LINK_DAYS = 60
export const KEEP_DAYS = 60
export const MAX_PHOTOS = 30
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/** Wording the family can send, mapped to the funeral templates' field ids. */
export const FAMILY_FIELDS = ['name', 'firstName', 'birthDate', 'deathDate', 'obituary', 'tribute', 'familyMessage', 'note'] as const
export type FamilyField = (typeof FAMILY_FIELDS)[number]

export interface CasePhoto {
  id: string
  /** The main portrait, or one of the other photos. */
  kind: 'portrait' | 'other'
  type: string
  bytes: number
  addedAt: string
}

export interface Case {
  id: string
  home: string
  /** Who the program is for, as the home typed it. */
  name: string
  serviceDate: string
  createdAt: string
  tokenHash: string
  /** Kept so the home can resend the same link. */
  token: string
  values: Partial<Record<FamilyField, string>>
  photos: CasePhoto[]
  familyUpdatedAt: string | null
}

const store = () => getStore({ name: 'portal', consistency: 'strong' })
const hash = (t: string) => createHash('sha256').update(t).digest('hex')
const caseKey = (home: string, id: string) => `cases/${home}/${id}`
const clip = (v: unknown, n: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n)
const LIMITS: Record<FamilyField, number> = { name: 120, firstName: 60, birthDate: 60, deathDate: 60, obituary: 6000, tribute: 2000, familyMessage: 1500, note: 2000 }

export async function createCase(home: string, input: { name?: string; serviceDate?: string }): Promise<Case> {
  const name = clip(input.name, 120)
  if (!name) throw new Error('Add the name of the person the program is for')
  const token = randomBytes(18).toString('base64url')
  const c: Case = {
    id: randomUUID(),
    home,
    name,
    serviceDate: clip(input.serviceDate, 60),
    createdAt: new Date().toISOString(),
    tokenHash: hash(token),
    token,
    values: { name },
    photos: [],
    familyUpdatedAt: null,
  }
  await store().setJSON(caseKey(home, c.id), c)
  return c
}

export async function listCases(home: string): Promise<Case[]> {
  const s = store()
  const { blobs } = await s.list({ prefix: `cases/${home}/` })
  const all = await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }) as Promise<Case | null>))
  return all.filter((c): c is Case => !!c).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getCase(home: string, id: string) {
  return (await store().get(caseKey(home, id), { type: 'json' })) as Case | null
}

async function saveCase(c: Case) {
  await store().setJSON(caseKey(c.home, c.id), c)
}

/** Finds a case from a family link (home + id + token), or null when the link is wrong or too old. */
export async function caseFromLink(home: string, id: string, token: string): Promise<Case | null> {
  if (!/^[a-z0-9-]{1,64}$/.test(home) || !/^[0-9a-f-]{36}$/.test(id) || !token) return null
  const c = await getCase(home, id)
  if (!c) return null
  const a = Buffer.from(c.tokenHash), b = Buffer.from(hash(token))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Date.now() - Date.parse(c.createdAt) > LINK_DAYS * 86400_000) return null
  return c
}

/** Saves the family's wording. Empty fields are kept empty (they may be filled later). */
export async function saveFamilyValues(c: Case, values: Record<string, unknown>) {
  for (const f of FAMILY_FIELDS) if (f in values) c.values[f] = clip(values[f], LIMITS[f])
  c.familyUpdatedAt = new Date().toISOString()
  await saveCase(c)
  return c
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function addPhoto(c: Case, kind: CasePhoto['kind'], type: string, data: ArrayBuffer) {
  if (!IMAGE_TYPES.includes(type)) throw new Error('Photos must be JPG, PNG or WebP')
  if (!data.byteLength || data.byteLength > MAX_PHOTO_BYTES) throw new Error('That photo is too large')
  if (c.photos.length >= MAX_PHOTOS) throw new Error(`Up to ${MAX_PHOTOS} photos can be added`)
  // One main portrait: a new one replaces the old.
  if (kind === 'portrait') for (const old of c.photos.filter((p) => p.kind === 'portrait')) await removePhoto(c, old.id, false)
  const photo: CasePhoto = { id: randomUUID().slice(0, 8), kind, type, bytes: data.byteLength, addedAt: new Date().toISOString() }
  await store().set(`photos/${c.id}/${photo.id}`, data)
  c.photos.push(photo)
  c.familyUpdatedAt = photo.addedAt
  await saveCase(c)
  return photo
}

export async function removePhoto(c: Case, photoId: string, save = true) {
  await store().delete(`photos/${c.id}/${photoId}`)
  c.photos = c.photos.filter((p) => p.id !== photoId)
  if (save) await saveCase(c)
}

export async function photoData(c: Case, photoId: string) {
  const p = c.photos.find((x) => x.id === photoId)
  if (!p) return null
  const data = await store().get(`photos/${c.id}/${photoId}`, { type: 'arrayBuffer' })
  return data ? { data, type: p.type } : null
}

/** What the home sees (no link secrets beyond its own link). */
export const homeView = (c: Case, origin: string) => ({
  id: c.id,
  name: c.name,
  serviceDate: c.serviceDate,
  createdAt: c.createdAt,
  familyUrl: `${origin}/family/?h=${encodeURIComponent(c.home)}&c=${c.id}&t=${encodeURIComponent(c.token)}`,
  linkExpires: new Date(Date.parse(c.createdAt) + LINK_DAYS * 86400_000).toISOString(),
  values: c.values,
  photos: c.photos.map((p) => ({ id: p.id, kind: p.kind })),
  familyUpdatedAt: c.familyUpdatedAt,
})

/** What the family sees. */
export const familyView = (c: Case, homeName: string) => ({
  name: c.name,
  homeName,
  values: c.values,
  photos: c.photos.map((p) => ({ id: p.id, kind: p.kind })),
  maxPhotos: MAX_PHOTOS,
})

/** Daily cleanup: removes cases (and their photos) older than KEEP_DAYS. */
export async function cleanupCases() {
  const s = store()
  const { blobs } = await s.list({ prefix: 'cases/' })
  let removed = 0
  for (const b of blobs) {
    const c = (await s.get(b.key, { type: 'json' })) as Case | null
    if (c && Date.now() - Date.parse(c.createdAt) < KEEP_DAYS * 86400_000) continue
    if (c) for (const p of c.photos) await s.delete(`photos/${c.id}/${p.id}`)
    await s.delete(b.key)
    removed++
  }
  return removed
}
