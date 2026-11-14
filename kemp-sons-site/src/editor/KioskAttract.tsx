import { useEffect, useRef, useState } from 'react'
import { TEMPLATES } from './templates'
import { renderThumbnail } from './render'

/**
 * Kiosk screensaver: when nobody has touched the screen for a while, every
 * design scrolls across in two rows. Any tap wakes it to the product grid.
 * Also shown straight away when the designer resets after a customer leaves
 * (/in-store/?attract).
 */
const IDLE_SECONDS = 60

interface Thumb {
  id: string
  name: string
  src: string
  ratio: number
}

export default function KioskAttract() {
  const [on, setOn] = useState(() => new URLSearchParams(window.location.search).has('attract'))
  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const last = useRef(Date.now())

  // Draw every design's cover once (the grid's thumbnails share this cache).
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const t of TEMPLATES) {
        const src = await renderThumbnail(t).catch(() => null)
        const crop = t.thumbnailCrop ?? t.trim
        if (alive && src) setThumbs((list) => [...list, { id: t.id, name: t.name, src, ratio: crop.w / crop.h }])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('attract')) history.replaceState(null, '', window.location.pathname)
    const touch = () => {
      last.current = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }))
    const tick = setInterval(() => {
      if ((Date.now() - last.current) / 1000 >= IDLE_SECONDS) setOn(true)
    }, 2000)
    return () => {
      clearInterval(tick)
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }))
    }
  }, [])

  if (!on) return null
  const wake = () => {
    last.current = Date.now()
    setOn(false)
    window.scrollTo({ top: 0 })
  }
  const rowA = thumbs
  const rowB = [...thumbs].reverse()
  return (
    <div className="ka" role="button" tabIndex={0} aria-label="Tap anywhere to start" onClick={wake} onKeyDown={wake}>
      <div className="ka-head">
        <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons Printing" width="150" height="100" />
        <p className="ka-title">Design it here. We print it here.</p>
      </div>
      {thumbs.length > 0 && (
        <div className="ka-rows" aria-hidden="true">
          <Row items={rowA} seconds={Math.max(40, thumbs.length * 7)} />
          <Row items={rowB} seconds={Math.max(46, thumbs.length * 8)} reverse />
        </div>
      )}
      <p className="ka-cta">
        <span>Tap anywhere to start</span>
      </p>
    </div>
  )
}

function Row({ items, seconds, reverse }: { items: Thumb[]; seconds: number; reverse?: boolean }) {
  // Two copies side by side so the loop is seamless.
  const loop = [...items, ...items]
  return (
    <div className="ka-row">
      <div className={`ka-track ${reverse ? 'is-rev' : ''}`} style={{ animationDuration: `${seconds}s` }}>
        {loop.map((t, i) => (
          <figure key={`${t.id}-${i}`} className="ka-item">
            <img src={t.src} alt="" style={{ width: `calc(var(--ka-h) * ${t.ratio})` }} />
            <figcaption>{t.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
