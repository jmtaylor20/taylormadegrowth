import { createRoot } from 'react-dom/client'
import type Konva from 'konva'
import type { Side, Template } from './types'
import { SideCanvas } from './SideCanvas'
import type { PhotoState } from './draft'
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
  const srcs = [...side.elements.flatMap((el) => (el.type === 'image' ? [el.src] : [])), ...Object.values(photos).map((p) => p.src)]
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
 * Gallery thumbnail drawn from the template's sample text, with soft
 * illustrated scenes in the photo frames. Renders one at a time so a page of
 * designs never stalls a phone.
 */
export function renderThumbnail(t: Template, width = 640): Promise<string> {
  const hit = thumbCache.get(t.id)
  if (hit) return hit
  const job = (queue = queue.then(async () => {
    const { defaultDraft } = await import('./draft')
    const { SCENES, sampleScene } = await import('./samples')
    const side = t.sides.find((s) => s.id === t.thumbnailSide) ?? t.sides[0]
    const ppi = width / t.trim.w
    const photos: Record<string, PhotoState> = {}
    let i = t.category === 'christmas-cards' ? 1 : 0
    for (const el of side.elements)
      if (el.type === 'photo' && !el.optional) photos[el.field] = { src: sampleScene(SCENES[i++ % SCENES.length]), w: 800, h: 800, ox: 0, oy: 0, zoom: 1 }
    return renderSide(t, side, defaultDraft(t).values, photos, { mode: 'trim', ppi, quality: 0.86 })
  })) as Promise<string>
  thumbCache.set(t.id, job)
  return job
}
