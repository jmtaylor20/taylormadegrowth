import type { Draft, PhotoState } from './draft'

/**
 * Approved designs, for reorders. Each design is stored on the server (see
 * netlify/functions/designs.mts) and listed on this device so the customer can
 * find it again from the Reorder page. The reorder link also lives on the
 * Shopify order, so the shop can send it to a customer on another device.
 */

export interface SavedDesign {
  id: string
  templateId: string
  name: string
  ref: string
  summary: string
  savedAt: string
  /** Small preview image (data URL). */
  thumb: string
}

interface StoredDraft {
  v: 1
  templateId: string
  values: Record<string, string>
  photos: Record<string, Omit<PhotoState, 'src'>>
  envelopes?: Draft['envelopes']
}

const LIST_KEY = 'kemp-saved-designs'

export function listSaved(): SavedDesign[] {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as SavedDesign[]
  } catch {
    return []
  }
}

export function rememberDesign(d: SavedDesign) {
  try {
    const list = [d, ...listSaved().filter((x) => x.id !== d.id)].slice(0, 30)
    localStorage.setItem(LIST_KEY, JSON.stringify(list))
  } catch {
    /* storage full or blocked: the reorder link on the order still works */
  }
}

export function forgetDesign(id: string) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(listSaved().filter((x) => x.id !== id)))
  } catch {
    /* ignore */
  }
}

export const reorderUrl = (templateId: string, id: string) => `${window.location.origin}/design/${templateId}/?from=${id}`

/** The design as JSON (photos travel as separate files). */
export function draftJson(templateId: string, d: Draft): Blob {
  const photos: StoredDraft['photos'] = {}
  for (const [slot, p] of Object.entries(d.photos)) photos[slot] = { w: p.w, h: p.h, ox: p.ox, oy: p.oy, zoom: p.zoom }
  const body: StoredDraft = { v: 1, templateId, values: d.values, photos, envelopes: d.envelopes }
  return new Blob([JSON.stringify(body)], { type: 'application/json' })
}

export const photoKind = (slot: string) => `photo-${slot.toLowerCase()}`

async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(b)
  })
}

/** Loads a stored design (text and photos) so it can be edited and ordered again. */
export async function loadDesign(id: string): Promise<{ templateId: string; draft: Draft }> {
  const res = await fetch(`/api/designs/${encodeURIComponent(id)}/draft`)
  if (!res.ok) throw new Error('Design not found')
  const stored = (await res.json()) as StoredDraft
  const photos: Record<string, PhotoState> = {}
  await Promise.all(
    Object.entries(stored.photos).map(async ([slot, p]) => {
      const r = await fetch(`/api/designs/${encodeURIComponent(id)}/${photoKind(slot)}`)
      if (r.ok) photos[slot] = { ...p, src: await blobToDataUrl(await r.blob()) }
    }),
  )
  return { templateId: stored.templateId, draft: { values: stored.values, photos, envelopes: stored.envelopes } }
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}
