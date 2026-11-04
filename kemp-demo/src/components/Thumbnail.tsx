import { useEffect, useState } from 'react'
import type { Template } from '../templates/types'
import { renderThumbnail } from '../lib/render'

/** Template preview image with a fixed aspect box so cards never jump while loading. */
export function Thumbnail({ t, className = '' }: { t: Template; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    renderThumbnail(t).then((s) => alive && setSrc(s))
    return () => {
      alive = false
    }
  }, [t])
  const crop = t.thumbnailCrop ?? { w: t.trim.w, h: t.trim.h }
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
      {src ? (
        <img src={src} alt={`${t.name} preview`} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full animate-pulse bg-line/60" />
      )}
    </div>
  )
}
