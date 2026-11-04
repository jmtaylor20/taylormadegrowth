import { useLayoutEffect, useRef, useState } from 'react'
import type { Template } from '../templates/types'
import { BLEED } from '../templates/types'
import type { PhotoState } from '../lib/draft'
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
  /** CSS max height for the canvas area, e.g. "40svh". */
  maxHeight: string
  /** Hide the toolbar and legend (phone keyboard is up). */
  compact?: boolean
}

/** Fits the canvas into its box without ever changing the box size while typing. */
function useBox(maxHeight: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [maxHeight])
  return [ref, box] as const
}

export function PreviewPane(p: Props) {
  const t = p.template
  const side = t.sides.find((s) => s.id === p.sideId) ?? t.sides[0]
  const fullW = t.trim.w + 2 * BLEED
  const fullH = t.trim.h + 2 * BLEED
  const [ref, box] = useBox(p.maxHeight)
  const ppi = box.w > 0 ? Math.min(box.w / fullW, box.h / fullH) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className={`items-center justify-between gap-2 ${p.compact ? 'hidden' : 'flex'}`}>
        {t.sides.length > 1 ? (
          <div role="tablist" className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-line">
            {t.sides.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === side.id}
                onClick={() => p.onSide(s.id)}
                className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                  s.id === side.id ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm font-semibold text-ink">{side.label}</span>
        )}
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-white px-3 text-sm font-medium text-ink shadow-sm ring-1 ring-line">
          <span className="relative inline-flex h-5 w-9 items-center">
            <input type="checkbox" className="peer sr-only" checked={p.showGuides} onChange={(e) => p.onGuides(e.target.checked)} />
            <span className="absolute inset-0 rounded-full bg-line transition peer-checked:bg-accent" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </span>
          Print guides
        </label>
      </div>

      <div ref={ref} className="flex w-full items-center justify-center" style={{ height: p.maxHeight }}>
        {ppi > 0 && (
          <div className="rounded-[3px] shadow-[0_10px_30px_-12px_rgba(40,35,25,0.45)]" style={{ touchAction: 'pan-y' }}>
            <SideCanvas
              template={t}
              side={side}
              values={p.values}
              photos={p.photos}
              ppi={ppi}
              mode="editor"
              showGuides={p.showGuides}
              maskColor="#efece6"
              highlightField={p.highlightField}
              onPhotoChange={p.onPhotoChange}
              onPhotoTap={p.onPhotoTap}
            />
          </div>
        )}
      </div>

      {/* Legend row: fixed height so toggling guides never moves the layout. */}
      <div className={`h-6 items-center justify-center gap-4 text-[11px] font-medium text-muted ${p.compact ? 'hidden' : 'flex'}`}>
        {p.showGuides ? (
          <>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="inline-block h-3 w-3 rounded-sm bg-[rgba(214,69,69,0.25)]" />
              Bleed
            </span>
            <Key color="#d64545" label="Trim" />
            <Key color="#2f8f5b" label="Safe area" />
            {side.folds && <Key color="#3d6fb5" label="Fold" />}
          </>
        ) : side.panels ? (
          <span className="flex w-full justify-around">
            {side.panels.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        ) : (
          <span>{t.sizeLabel}</span>
        )}
      </div>
    </div>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
      {label}
    </span>
  )
}
