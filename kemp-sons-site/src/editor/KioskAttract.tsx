import { useEffect, useMemo, useRef, useState } from 'react'
import { TEMPLATES } from './templates'
import { renderThumbnail } from './render'

/**
 * Kiosk screensaver, "fresh off the press": printed pieces drift through 3D
 * space while one design at a time swoops forward onto a press stack, lands
 * inside crop marks that trim away, and gets a job-ticket label. Designs show
 * public-domain sample photos instead of gray placeholders. Any tap wakes the
 * kiosk to the product grid. Also shown right away when the designer resets
 * after a customer leaves (/in-store/?attract).
 */
const IDLE_SECONDS = 60
const HERO_SECONDS = 7

interface Thumb {
  id: string
  name: string
  size: string
  kind: string
  src: string
  ratio: number
}

const KIND: Record<string, string> = { 'funeral-programs': 'Funeral program', 'christmas-cards': 'Christmas card' }

/** Small deterministic random so the floating sheets keep their places between renders. */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

export default function KioskAttract() {
  const [on, setOn] = useState(() => new URLSearchParams(window.location.search).has('attract'))
  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const [hero, setHero] = useState(0)
  const last = useRef(Date.now())

  // Draw every design's cover once, with sample photos in the photo spots.
  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const t of TEMPLATES) {
        const src = await renderThumbnail(t, 720, { samples: true }).catch(() => null)
        const crop = t.thumbnailCrop ?? t.trim
        if (alive && src)
          setThumbs((list) => [...list, { id: t.id, name: t.name, size: t.sizeLabel, kind: KIND[t.category] ?? 'Printed piece', src, ratio: crop.w / crop.h }])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Idle watch.
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

  // Next design on the press every few seconds.
  useEffect(() => {
    if (!on || thumbs.length === 0) return
    const id = setInterval(() => setHero((h) => h + 1), HERO_SECONDS * 1000)
    return () => clearInterval(id)
  }, [on, thumbs.length])

  // Background sheets: positions and timings fixed per slot.
  const sheets = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        // Behind the stage side only, so the headline stays easy to read.
        left: 42 + rand(i + 1) * 54,
        depth: -250 - rand(i + 21) * 900,
        width: 9 + rand(i + 41) * 7,
        duration: 26 + rand(i + 61) * 22,
        delay: -rand(i + 81) * 48,
        spin: (rand(i + 101) - 0.5) * 70,
        tilt: (rand(i + 121) - 0.5) * 50,
      })),
    [],
  )

  if (!on) return null
  const wake = () => {
    last.current = Date.now()
    setOn(false)
    window.scrollTo({ top: 0 })
    // A new customer starts at the choose-a-product screen.
    window.dispatchEvent(new Event('kiosk:choose'))
  }
  const current = thumbs.length ? thumbs[hero % thumbs.length] : null
  const no = thumbs.length ? (hero % thumbs.length) + 1 : 0
  const dur = { animationDuration: `${HERO_SECONDS}s` }

  return (
    <div className="ka" role="button" tabIndex={0} aria-label="Tap anywhere to start" onClick={wake} onKeyDown={wake}>
      <div className="ka-dots" aria-hidden="true" />
      <span className="ka-reg ka-reg-tl" aria-hidden="true" />
      <span className="ka-reg ka-reg-tr" aria-hidden="true" />
      <span className="ka-reg ka-reg-bl" aria-hidden="true" />
      <span className="ka-reg ka-reg-br" aria-hidden="true" />

      {/* Sheets drifting up through the room */}
      <div className="ka-space" aria-hidden="true">
        {thumbs.length > 0 &&
          sheets.map((s, i) => {
            const t = thumbs[(i * 5) % thumbs.length]
            return (
              <div
                key={i}
                className="ka-sheet"
                style={
                  {
                    left: `${s.left}%`,
                    width: `${s.width}vw`,
                    aspectRatio: String(t.ratio),
                    '--z': `${s.depth}px`,
                    '--spin': `${s.spin}deg`,
                    '--tilt': `${s.tilt}deg`,
                    animationDuration: `${s.duration}s`,
                    animationDelay: `${s.delay}s`,
                    opacity: 0.18 + (1 + s.depth / 1150) * 0.32,
                  } as React.CSSProperties
                }
              >
                <img src={t.src} alt="" />
              </div>
            )
          })}
      </div>

      <div className="ka-layout">
        <div className="ka-copy">
          <img className="ka-logo" src="/brand/kemp-sons-white.svg" alt="Kemp & Sons Printing" width="300" height="200" />
          <p className="ka-kicker">Fresh off the press</p>
          <p className="ka-title">
            Design it
            <br />
            here.
            <br />
            We print it
            <br />
            here.
          </p>
          <p className="ka-sub">Funeral programs, Christmas cards and more. Add your photos and words on this screen, approve your proof, and we print it right here in Opelika.</p>
        </div>

        <div className="ka-stage" aria-hidden="true">
          {current && (
            <div key={hero} className="ka-hero" style={dur}>
              <div className="ka-stack" style={{ aspectRatio: String(current.ratio) }}>
                <span className="ka-under ka-under-2" />
                <span className="ka-under ka-under-1" />
                <div className="ka-card">
                  <img src={current.src} alt="" />
                  <span className="ka-shine" style={dur} />
                </div>
                <span className="ka-crop ka-crop-tl" style={dur} />
                <span className="ka-crop ka-crop-tr" style={dur} />
                <span className="ka-crop ka-crop-bl" style={dur} />
                <span className="ka-crop ka-crop-br" style={dur} />
              </div>
              <div className="ka-ticket" style={dur}>
                <span className="ka-ticket-no">Job No. {String(no).padStart(2, '0')}</span>
                <span className="ka-ticket-name">{current.name}</span>
                <span className="ka-ticket-meta">
                  {current.kind}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="ka-foot">
        <div className="ka-cmyk" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="ka-cta">
          <span>Tap anywhere to start</span>
        </p>
      </div>
    </div>
  )
}
