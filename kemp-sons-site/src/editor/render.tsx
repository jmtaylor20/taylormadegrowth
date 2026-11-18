import { createRoot } from 'react-dom/client'
import type Konva from 'konva'
import type { Side, Template } from './types'
import { SideCanvas } from './SideCanvas'
import { activeSrc, type PhotoState } from './draft'
import { loadImage } from './images'
import { loadFonts } from './fonts'

export interface RenderOptions {
  /** 'trim' = finished piece, 'print' = includes 0.125 in bleed. */
  mode: 'trim' | 'print'
  /** Output resolution in pixels per inch. */
  ppi: number
  mimeType?: 'image/jpeg' | 'image/png'
  quality?: number
  /** Element indexes to leave out of the image (drawn as vector text in the print file). */
  skip?: Set<number>
}

/**
 * Renders one side off screen with the same component the editor uses and
 * returns an image data URL. Used by the proof and the print file.
 */
export async function renderSide(
  t: Template,
  side: Side,
  values: Record<string, string>,
  photos: Record<string, PhotoState>,
  opts: RenderOptions,
): Promise<string> {
  await loadFonts(t)
  const srcs = [...side.elements.flatMap((el) => (el.type === 'image' ? [el.src] : [])), ...Object.values(photos).map(activeSrc)]
  await Promise.all(srcs.map((s) => loadImage(s).catch(() => null)))

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;'
  document.body.appendChild(host)
  const root = createRoot(host)
  // Lay out at 72 ppi, then let Konva redraw at the target resolution.
  const basePpi = 72
  try {
    const stage = await new Promise<Konva.Stage>((resolve) => {
      root.render(
        <SideCanvas
          template={t}
          side={side}
          values={values}
          photos={photos}
          ppi={basePpi}
          mode={opts.mode}
          skip={opts.skip}
          stageRef={(s: Konva.Stage | null) => {
            if (s) resolve(s)
          }}
        />,
      )
    })
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    return stage.toDataURL({
      mimeType: opts.mimeType ?? 'image/jpeg',
      quality: opts.quality ?? 0.92,
      pixelRatio: opts.ppi / basePpi,
    })
  } finally {
    root.unmount()
    host.remove()
  }
}

/** A sensible on-screen proof resolution that stays light on phones. */
export function proofPpi(t: Template) {
  return Math.min(160, 2200 / Math.max(t.trim.w, t.trim.h))
}

const thumbCache = new Map<string, Promise<string>>()
let queue: Promise<unknown> = Promise.resolve()

/**
 * Gallery thumbnail drawn from the template's sample text, with gray
 * placeholders in the photo spots. Renders one at a time so a page of
 * designs never stalls a phone.
 */
/**
 * AI-generated sample photos of fictional people (see
 * public/kiosk/samples/CREDITS.txt). Used only by the kiosk screensaver so
 * designs show real-looking photos instead of gray placeholders. Every
 * funeral program uses the same portrait so it matches the sample name.
 */
const SAMPLE_PORTRAIT = '/kiosk/samples/portrait.jpg'
const SAMPLE_MEMORIES = [1, 2, 3, 4].map((n) => `/kiosk/samples/memory-${n}.jpg`)
const SAMPLE_HOLIDAY = [4, 1, 5, 2, 6, 3].map((n) => `/kiosk/samples/holiday-${n}.jpg`)

/** A steady number from a design's id, so each design gets its own lead photo. */
const idSeed = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const SAMPLE_CUTOUT = '/kiosk/samples/portrait-cutout.png'

async function samplePhotos(t: Template, seed: number): Promise<Record<string, PhotoState>> {
  const funeral = t.category === 'funeral-programs'
  const portrait = t.samplePortrait ?? SAMPLE_PORTRAIT
  const slots: { slot: string; cutout: boolean; src: string }[] = []
  const lead = idSeed(t.id) + seed
  let m = 0
  for (const f of t.fields) {
    if (f.type !== 'photo') continue
    if (f.count)
      for (let i = 1; i <= f.count; i++) {
        // Collages: the person's portrait now and then among family snapshots.
        const src = funeral ? (m % 5 === 2 ? portrait : SAMPLE_MEMORIES[(lead + m) % SAMPLE_MEMORIES.length]) : SAMPLE_HOLIDAY[(lead + m) % SAMPLE_HOLIDAY.length]
        slots.push({ slot: `${f.id}_${i}`, cutout: false, src })
        m++
      }
    else slots.push({ slot: f.id, cutout: !!f.removeBackground && funeral, src: funeral ? portrait : SAMPLE_HOLIDAY[(lead + m++) % SAMPLE_HOLIDAY.length] })
  }
  const photos: Record<string, PhotoState> = {}
  await Promise.all(
    slots.map(async ({ slot, cutout, src }) => {
      const img = await loadImage(src).catch(() => null)
      if (!img) return
      // Cut-out designs show the portrait cut out, as customers now get by default.
      if (cutout) await loadImage(SAMPLE_CUTOUT).catch(() => null)
      photos[slot] = { src, w: img.naturalWidth, h: img.naturalHeight, ox: 0, oy: 0, zoom: 1, ...(cutout ? { cutout: SAMPLE_CUTOUT, useCutout: true } : {}) }
    }),
  )
  return photos
}

export function renderThumbnail(t: Template, width = 640, opts: { samples?: boolean } = {}): Promise<string> {
  const cacheKey = opts.samples ? `${t.id}:samples` : t.id
  const hit = thumbCache.get(cacheKey)
  if (hit) return hit
  const job = (queue = queue.then(async () => {
    const { defaultDraft } = await import('./draft')
    const side = t.sides.find((s) => s.id === t.thumbnailSide) ?? t.sides[0]
    // Folded pieces show just the cover panel.
    const crop = t.thumbnailCrop ?? { x: 0, y: 0, w: t.trim.w, h: t.trim.h }
    const ppi = width / crop.w
    // Photo spots show the plain gray placeholder, or sample photos for the kiosk.
    const photos: Record<string, PhotoState> = opts.samples ? await samplePhotos(t, 0) : {}
    const full = await renderSide(t, side, defaultDraft(t).values, photos, { mode: 'trim', ppi, quality: 0.86 })
    if (!t.thumbnailCrop) return full
    const img = await loadImage(full)
    const c = document.createElement('canvas')
    c.width = Math.round(crop.w * ppi)
    c.height = Math.round(crop.h * ppi)
    c.getContext('2d')!.drawImage(img, crop.x * ppi, crop.y * ppi, c.width, c.height, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.86)
  })) as Promise<string>
  thumbCache.set(cacheKey, job)
  return job
}

/** Every side of a design drawn with the sample photos, for a larger preview (front and inside). */
export async function renderPreviewSides(t: Template, width = 900): Promise<{ id: string; label: string; src: string }[]> {
  const { defaultDraft } = await import('./draft')
  const photos = await samplePhotos(t, 0)
  const ppi = width / t.trim.w
  const out: { id: string; label: string; src: string }[] = []
  for (const side of t.sides) out.push({ id: side.id, label: side.label, src: await renderSide(t, side, defaultDraft(t).values, photos, { mode: 'trim', ppi, quality: 0.85 }) })
  return out
}
