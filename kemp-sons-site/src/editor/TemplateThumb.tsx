import { useEffect, useState } from 'react'
import { templateById } from './templates'
import { renderThumbnail } from './render'

/** Gallery preview of a template, drawn in the browser from the template itself. */
export default function TemplateThumb({ id }: { id: string }) {
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
  return src ? <img src={src} alt={`${t.name} design preview`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null
}
