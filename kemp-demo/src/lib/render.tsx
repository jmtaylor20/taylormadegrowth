import { createRoot } from 'react-dom/client'
import type Konva from 'konva'
import type { Side, Template } from '../templates/types'
import { SideCanvas } from '../components/SideCanvas'
import { defaultDraft, type PhotoState } from './draft'
import { loadImage } from './images'
import { SCENES, sampleScene } from './samples'
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
 * returns an image data URL. Used by the proof, thumbnails and print file.
 */
export async function renderSide(
  t: Template,
  side: Side,
  values: Record<string, string>,
  photos: Record<string, PhotoState>,
  opts: RenderOptions,
): Promise<string> {
  await loadFonts()
  await Promise.all(Object.values(photos).map((p) => loadImage(p.src).catch(() => null)))

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
 * Gallery thumbnail rendered from the template's sample content. Renders one
 * at a time so a page full of cards never stalls the phone.
 */
export function renderThumbnail(t: Template, width = 520): Promise<string> {
  const hit = thumbCache.get(t.id)
  if (hit) return hit
  const job = (queue = queue.then(async () => {
    const side = t.sides.find((s) => s.id === t.thumbnailSide) ?? t.sides[0]
    const crop = t.thumbnailCrop ?? { x: 0, y: 0, w: t.trim.w, h: t.trim.h }
    const ppi = width / crop.w
    const draft = defaultDraft(t)
    // Fill photo frames with illustrated sample scenes so the gallery looks finished.
    const photos: Record<string, PhotoState> = {}
    let i = t.category === 'christmas' ? 5 : 0
    for (const el of side.elements)
      if (el.type === 'photo' && !el.optional) photos[el.field] = { src: sampleScene(SCENES[i++ % SCENES.length]), ox: 0, oy: 0, zoom: 1 }
    const full = await renderSide(t, side, draft.values, photos, { mode: 'trim', ppi, quality: 0.86 })
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
