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
  await loadFonts()
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
export function renderThumbnail(t: Template, width = 640): Promise<string> {
  const hit = thumbCache.get(t.id)
  if (hit) return hit
  const job = (queue = queue.then(async () => {
    const { defaultDraft } = await import('./draft')
    const side = t.sides.find((s) => s.id === t.thumbnailSide) ?? t.sides[0]
    // Folded pieces show just the cover panel.
    const crop = t.thumbnailCrop ?? { x: 0, y: 0, w: t.trim.w, h: t.trim.h }
    const ppi = width / crop.w
    // Photo spots show the plain gray placeholder.
    const photos: Record<string, PhotoState> = {}
    const full = await renderSide(t, side, defaultDraft(t).values, photos, { mode: 'trim', ppi, quality: 0.86 })
    if (!t.thumbnailCrop) return full
    const img = await loadImage(full)
    const c = document.createElement('canvas')
    c.width = Math.round(crop.w * ppi)
    c.height = Math.round(crop.h * ppi)
    c.getContext('2d')!.drawImage(img, crop.x * ppi, crop.y * ppi, c.width, c.height, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.86)
  })) as Promise<string>
  thumbCache.set(t.id, job)
  return job
}
