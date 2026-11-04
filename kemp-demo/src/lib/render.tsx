import { createRoot } from 'react-dom/client'
import type Konva from 'konva'
import type { Side, Template } from '../templates/types'
import { SideCanvas } from '../components/SideCanvas'
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
