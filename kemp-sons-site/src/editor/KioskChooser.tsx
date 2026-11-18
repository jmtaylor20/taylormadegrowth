import { useCallback, useEffect, useState } from 'react'
import { templateById } from './templates'
import { renderThumbnail } from './render'

/**
 * Kiosk start screen: pick a product line first, on the same navy "press
 * room" as the screensaver. Choosing one runs a print-shop transition (cyan,
 * magenta, yellow and black ink passes sweep across, a registration mark
 * snaps into register, then the paper rolls out) and reveals just that
 * line's designs on the page underneath.
 *
 * Talks to the page with two events:
 *   kiosk:choose  (from the page's "Choose a different product" button, or
 *                  the screensaver waking up) opens this screen again.
 * The chosen line (and size, as #line/size) is kept in the URL hash, so Back
 * from the designer returns to the same designs. Fires kiosk:line when the
 * page underneath switches, so the size buttons can follow.
 */

export interface ChooserLine {
  id: string
  name: string
  count: number
  /** A few template ids to fan out on the card. */
  sample: string[]
}

const PASS_MS = 1650
/** When the paper fully covers the screen, so the page underneath can switch unseen. */
const SWAP_MS = 1120

export default function KioskChooser({ lines }: { lines: ChooserLine[] }) {
  const fromHash = () => {
    const h = window.location.hash.slice(1).split('/')[0]
    return lines.some((l) => l.id === h) ? h : null
  }
  const [open, setOpen] = useState(() => !fromHash())
  const [running, setRunning] = useState<string | null>(null)

  /** Show only the chosen line's designs on the page underneath. */
  const showLine = useCallback((id: string) => {
    document.querySelectorAll<HTMLElement>('.k-line').forEach((s) => (s.hidden = s.id !== id))
    const name = lines.find((l) => l.id === id)?.name ?? ''
    const label = document.getElementById('k-current')
    if (label) label.textContent = name
    // Keep a size already in the hash (coming Back from the designer); a new product starts on all sizes.
    const [hl, size] = window.location.hash.slice(1).split('/')
    history.replaceState(null, '', `${window.location.pathname}#${id}${hl === id && size ? `/${size}` : ''}`)
    window.dispatchEvent(new Event('kiosk:line'))
    window.scrollTo({ top: 0 })
  }, [lines])

  useEffect(() => {
    const h = fromHash()
    if (h) showLine(h)
    const reopen = () => {
      setRunning(null)
      setOpen(true)
      history.replaceState(null, '', window.location.pathname)
    }
    window.addEventListener('kiosk:choose', reopen)
    return () => window.removeEventListener('kiosk:choose', reopen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = (id: string) => {
    if (running) return
    setRunning(id)
    // Swap the page underneath while the paper covers the screen.
    setTimeout(() => showLine(id), SWAP_MS)
    setTimeout(() => {
      setOpen(false)
      setRunning(null)
    }, PASS_MS)
  }

  if (!open) return null
  return (
    <div className={`kc ${running ? 'is-running' : ''}`} role="dialog" aria-modal="true" aria-label="Choose what to print">
      <div className="kc-dots" aria-hidden="true" />
      <span className="ka-reg ka-reg-tl" aria-hidden="true" />
      <span className="ka-reg ka-reg-tr" aria-hidden="true" />
      <span className="ka-reg ka-reg-bl" aria-hidden="true" />
      <span className="ka-reg ka-reg-br" aria-hidden="true" />

      <header className="kc-head">
        <img src="/brand/kemp-sons-white.svg" alt="Kemp & Sons Printing" width="300" height="200" />
        <p className="kc-kicker">Design it here. We print it here.</p>
        <h1 className="kc-title">What are we printing today?</h1>
      </header>

      <div className={`kc-cards ${lines.length === 1 ? 'is-one' : ''}`}>
        {lines.map((l, i) => (
          <button
            key={l.id}
            type="button"
            className={`kc-card ${running === l.id ? 'is-chosen' : ''}`}
            style={{ animationDelay: `${0.12 + i * 0.1}s` }}
            onClick={() => choose(l.id)}
          >
            <span className="kc-crop kc-crop-tl" aria-hidden="true" />
            <span className="kc-crop kc-crop-tr" aria-hidden="true" />
            <span className="kc-crop kc-crop-bl" aria-hidden="true" />
            <span className="kc-crop kc-crop-br" aria-hidden="true" />
            <Fan ids={l.sample} />
            <span className="kc-name">{l.name}</span>
            <span className="kc-count">
              {l.count} design{l.count === 1 ? '' : 's'} to choose from
            </span>
            <span className="kc-go">
              Tap to start <span aria-hidden="true">&rarr;</span>
            </span>
          </button>
        ))}
      </div>

      <div className="kc-cmyk" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      {running && <PressPass />}
    </div>
  )
}

/** Three real designs fanned out like proofs on a table. */
function Fan({ ids }: { ids: string[] }) {
  const [srcs, setSrcs] = useState<(string | null)[]>(ids.map(() => null))
  useEffect(() => {
    let alive = true
    ids.forEach((id, i) => {
      const t = templateById(id)
      if (!t) return
      renderThumbnail(t, 520, { samples: true }).then((s) => alive && setSrcs((cur) => cur.map((v, j) => (j === i ? s : v))))
    })
    return () => {
      alive = false
    }
  }, [ids])
  const angles = ids.length === 1 ? [0] : ids.length === 2 ? [-6, 6] : [-9, 0, 9]
  const mid = (ids.length - 1) / 2
  return (
    <span className="kc-fan" aria-hidden="true">
      {ids.map((id, i) => {
        const t = templateById(id)
        const c = t ? (t.thumbnailCrop ?? t.trim) : { w: 3, h: 4 }
        const wide = c.w > c.h
        // Each design is placed from the card's center line, so the fan is always centered.
        const shift = (i - mid) * 24
        const lift = i === Math.round(mid) && ids.length > 1 ? -5 : 0
        return (
          <span
            key={id}
            className="kc-fan-item"
            style={{
              aspectRatio: `${c.w} / ${c.h}`,
              ...(wide ? { width: '86%' } : { height: '84%' }),
              left: `calc(50% + ${shift}%)`,
              transform: `translateX(-50%) translateY(${lift}%) rotate(${angles[i]}deg)`,
              zIndex: i === Math.round(mid) ? 3 : 1,
            }}
          >
            {srcs[i] && <img src={srcs[i]!} alt="" />}
          </span>
        )
      })}
    </span>
  )
}

/** The transition: four ink passes, a registration mark snapping into register, then paper. */
function PressPass() {
  return (
    <div className="kc-press" aria-hidden="true">
      <span className="kc-ink kc-ink-c" />
      <span className="kc-ink kc-ink-m" />
      <span className="kc-ink kc-ink-y" />
      <span className="kc-ink kc-ink-k" />
      <span className="kc-paper" />
      <span className="kc-target">
        <span className="kc-ring kc-ring-c" />
        <span className="kc-ring kc-ring-m" />
        <span className="kc-ring kc-ring-y" />
        <span className="kc-ring kc-ring-k" />
      </span>
    </div>
  )
}
