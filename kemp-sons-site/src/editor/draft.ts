import { useEffect, useRef, useState } from 'react'
import type { Template, TextField } from './types'
import type { EnvelopeState } from './envelopes'

export interface PhotoState {
  src: string
  /** Pixel size of src, used to warn about blurry prints. */
  w: number
  h: number
  /** Image center offset from the frame center, in points. */
  ox: number
  oy: number
  /** 1 = the smallest size that fully covers the frame. */
  zoom: number
  /** Same photo with the background removed (PNG data URL), once made. */
  cutout?: string
  /** Print the cut-out instead of the original. */
  useCutout?: boolean
  /** Black & white, sepia or soft vintage. The original stays in src (and cutout), so it can be switched back. */
  tone?: PhotoTone
  /** Brighten / auto-fix: evens out dark, flat or yellowed photos. Works with or without a tone. */
  enhance?: boolean
  /** The photo with the fixes applied, and what it was made from (see toneKey). */
  toned?: string
  tonedKey?: string
}

export type PhotoTone = 'bw' | 'sepia' | 'vintage'

/** The photo before any fixes: the cut-out when it's switched on. */
export const baseSrc = (p: PhotoState) => (p.useCutout && p.cutout ? p.cutout : p.src)

/** Identifies the processed image a photo needs right now ('' when none). */
export const toneKey = (p: PhotoState) => {
  if (!p.tone && !p.enhance) return ''
  const b = baseSrc(p)
  return `${p.tone ?? ''}|${p.enhance ? 'fix' : ''}|${b.length}|${b.slice(-48)}`
}

/** The image a photo slot actually prints: processed when a fix is on (and ready), else the cut-out or original. */
export const activeSrc = (p: PhotoState) => (toneKey(p) && p.toned && p.tonedKey === toneKey(p) ? p.toned : baseSrc(p))

/**
 * Applies the photo fixes (keeps transparency for cut-outs):
 * - enhance: per-channel levels (also removes a yellow or blue cast), then
 *   brightens the midtones if the photo is dark overall;
 * - tone: black & white, sepia, or soft vintage (faded, warm, lifted blacks).
 */
export async function toneImage(src: string, tone: PhotoTone | undefined, enhance = false): Promise<string> {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, c.width, c.height)
  const px = data.data

  if (enhance) {
    // Histogram per channel, ignoring transparent pixels (cut-outs).
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
    let n = 0
    let lumSum = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      hist[0][px[i]]++
      hist[1][px[i + 1]]++
      hist[2][px[i + 2]]++
      lumSum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      n++
    }
    if (n > 0) {
      const level = (h: Uint32Array, frac: number) => {
        let acc = 0
        for (let v = 0; v < 256; v++) if ((acc += h[v]) >= n * frac) return v
        return 255
      }
      // Stretch each channel from its 0.5% to 99.5% point, but never more than 2.2x.
      const luts = hist.map((h) => {
        let lo = level(h, 0.005)
        let hi = level(h, 0.995)
        if (hi - lo < 116) {
          const mid = (hi + lo) / 2
          lo = Math.max(0, mid - 58)
          hi = Math.min(255, mid + 58)
        }
        return { lo, k: 255 / Math.max(1, hi - lo) }
      })
      // Brighten midtones when the photo is dark overall (mean luminance under ~45%).
      const mean = lumSum / n / 255
      const gamma = mean < 0.45 ? Math.max(0.7, Math.log(0.5) / Math.log(Math.max(0.05, mean))) : 1
      const lut = luts.map(({ lo, k }) => {
        const t = new Uint8ClampedArray(256)
        for (let v = 0; v < 256; v++) t[v] = 255 * Math.pow(Math.min(1, Math.max(0, ((v - lo) * k) / 255)), gamma)
        return t
      })
      for (let i = 0; i < px.length; i += 4) {
        px[i] = lut[0][px[i]]
        px[i + 1] = lut[1][px[i + 1]]
        px[i + 2] = lut[2][px[i + 2]]
      }
    }
  }

  if (tone)
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2]
      const y = 0.299 * r + 0.587 * g + 0.114 * b
      if (tone === 'bw') {
        px[i] = px[i + 1] = px[i + 2] = y
      } else if (tone === 'sepia') {
        px[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b)
        px[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b)
        px[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b)
      } else {
        // Soft vintage: 35% less color, softer contrast with lifted blacks, a warm cast.
        const de = (v: number) => y + (v - y) * 0.65
        const fade = (v: number) => 22 + v * 0.84
        px[i] = Math.min(255, fade(de(r)) * 1.04 + 6)
        px[i + 1] = Math.min(255, fade(de(g)) * 1.0 + 2)
        px[i + 2] = Math.min(255, fade(de(b)) * 0.88)
      }
    }
  ctx.putImageData(data, 0, 0)
  return src.startsWith('data:image/png') ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.93)
}

export interface Draft {
  values: Record<string, string>
  photos: Record<string, PhotoState>
  /** Addressed envelopes add-on, for templates that offer it. */
  envelopes?: EnvelopeState
}

export function defaultDraft(t: Template): Draft {
  const values: Record<string, string> = {}
  for (const f of t.fields) if (f.type !== 'photo') values[f.id] = (f as TextField).default
  return { values, photos: {} }
}

/*
 * Drafts are saved in IndexedDB, not localStorage: three full-resolution
 * photos are several megabytes, more than localStorage allows.
 */
const DB = 'kemp-editor'
const STORE = 'drafts'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const key = (t: Template) => `draft:v1:${t.id}`

export function clearDraft(t: Template) {
  return idb('readwrite', (s) => s.delete(key(t))).catch(() => undefined)
}

/** Draft state that survives a reload. Saves shortly after each change. */
export function useDraft(t: Template) {
  const [draft, setDraft] = useState<Draft>(() => defaultDraft(t))
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let alive = true
    idb<Draft | undefined>('readonly', (s) => s.get(key(t)))
      .then((saved) => {
        if (!alive || !saved) return
        // Keep sample text for any field added to the template since the draft was saved.
        setDraft({ values: { ...defaultDraft(t).values, ...saved.values }, photos: saved.photos ?? {}, envelopes: saved.envelopes })
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [t])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => idb('readwrite', (s) => s.put(draft, key(t))).catch(() => undefined), 400)
    return () => clearTimeout(timer.current)
  }, [draft, loaded, t])

  return [draft, setDraft, loaded] as const
}

/** Removes every saved draft (the in-store kiosk does this between customers). */
export function clearAllDrafts() {
  return idb('readwrite', (s) => s.clear()).catch(() => undefined)
}
