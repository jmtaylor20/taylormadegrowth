import { useEffect, useState } from 'react'
import { templateById } from './templates'
import { renderThumbnail } from './render'

/** Gallery preview of a template, drawn in the browser from the template itself. */
/** fit: 'cover' fills the box (shop gallery); 'contain' shows the whole cover inside a fixed frame (kiosk). */
export default function TemplateThumb({ id, fit = 'cover' }: { id: string; fit?: 'cover' | 'contain' }) {
  const t = templateById(id)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!t) return
    let alive = true
    renderThumbnail(t).then((s) => alive && setSrc(s))
    return () => {
      alive = false
    }
  }, [t])
  if (!t) return null
  return src ? <img src={src} alt={`${t.name} design preview`} style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', ...(fit === 'contain' ? { filter: 'drop-shadow(0 10px 14px rgba(17, 17, 17, 0.28))' } : {}) }} /> : null
}
