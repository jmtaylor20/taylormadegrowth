import { useEffect, useState } from 'react'

const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  const done = cache.get(src)
  if (done) return Promise.resolve(done)
  let p = pending.get(src)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        cache.set(src, img)
        pending.delete(src)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
    pending.set(src, p)
  }
  return p
}

/** Returns loaded images for the given sources, re-rendering as they arrive. */
export function useImages(srcs: string[]): Record<string, HTMLImageElement> {
  const [, bump] = useState(0)
  const key = srcs.join('|')
  useEffect(() => {
    let alive = true
    srcs.filter((s) => !cache.has(s)).forEach((s) => loadImage(s).then(() => alive && bump((n) => n + 1)).catch(() => {}))
    return () => {
      alive = false
    }
  }, [key])
  const out: Record<string, HTMLImageElement> = {}
  for (const s of srcs) {
    const img = cache.get(s)
    if (img) out[s] = img
  }
  return out
}

/**
 * Reads an uploaded photo and scales it to at most maxEdge pixels on its long
 * side: enough for a full-bleed 7 x 5 in card at 300 ppi, small enough for
 * phones to handle. Returns a JPEG data URL and its pixel size.
 */
export async function readPhoto(file: File, maxEdge = 2400): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * s)
    c.height = Math.round(img.naturalHeight * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return { src: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}
