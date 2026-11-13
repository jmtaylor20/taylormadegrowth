import { useLayoutEffect, useRef, useState } from 'react'
import { BLEED, type Template } from './types'
import type { PhotoState } from './draft'
import { SideCanvas } from './SideCanvas'

interface Props {
  template: Template
  sideId: string
  onSide: (id: string) => void
  values: Record<string, string>
  photos: Record<string, PhotoState>
  showGuides: boolean
  onGuides: (v: boolean) => void
  highlightField: string | null
  onPhotoChange: (id: string, next: PhotoState) => void
  onPhotoTap: (id: string) => void
  /** CSS height for the canvas area, e.g. "40svh". */
  height: string
  /** Hide the toolbar and legend (phone keyboard is up). */
  compact?: boolean
}

/** Fits the canvas into its box without ever changing the box size while typing. */
function useBox(dep: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [dep])
  return [ref, box] as const
}

export function PreviewPane(p: Props) {
  const t = p.template
  const side = t.sides.find((s) => s.id === p.sideId) ?? t.sides[0]
  const fullW = t.trim.w + 2 * BLEED
  const fullH = t.trim.h + 2 * BLEED
  const [ref, box] = useBox(p.height)
  const ppi = box.w > 0 ? Math.min(box.w / fullW, box.h / fullH) : 0

  return (
    <div className="ed-preview">
      <div className={`ed-preview-bar ${p.compact ? 'is-hidden' : ''}`}>
        {t.sides.length > 1 ? (
          <div role="tablist" className="ed-tabs">
            {t.sides.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === side.id} onClick={() => p.onSide(s.id)} className={s.id === side.id ? 'is-on' : ''}>
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="mono">{side.label}</span>
        )}
        <label className="ed-toggle">
          <input type="checkbox" checked={p.showGuides} onChange={(e) => p.onGuides(e.target.checked)} />
          <span aria-hidden="true" />
          Print guides
        </label>
      </div>

      <div ref={ref} className="ed-canvas" style={{ height: p.height }}>
        {ppi > 0 && (
          <div className="ed-sheet">
            <SideCanvas
              template={t}
              side={side}
              values={p.values}
              photos={p.photos}
              ppi={ppi}
              mode="editor"
              showGuides={p.showGuides}
              maskColor="#e4e3dd"
              highlightField={p.highlightField}
              onPhotoChange={p.onPhotoChange}
              onPhotoTap={p.onPhotoTap}
            />
          </div>
        )}
      </div>

      <div className={`ed-legend mono ${p.compact ? 'is-hidden' : ''}`}>
        {p.showGuides ? (
          <>
            <span><i className="k-bleed" />Bleed</span>
            <span><i className="k-trim" />Trim</span>
            <span><i className="k-safe" />Safe area</span>
            {side.folds && <span><i className="k-fold" />Fold</span>}
          </>
        ) : (
          <span>{t.sizeLabel}</span>
        )}
      </div>
    </div>
  )
}
