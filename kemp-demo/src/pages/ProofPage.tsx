import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { templateById } from '../templates'
import type { Template } from '../templates/types'
import { money, priceFor, useDraft } from '../lib/draft'
import { renderSide, proofPpi } from '../lib/render'
import { preflight } from '../lib/preflight'
import { useCart } from '../lib/cart'

export function ProofPage() {
  const { templateId = '' } = useParams()
  const t = templateById(templateId)
  if (!t) return <p className="p-6">That template could not be found.</p>
  return <Proof t={t} />
}

const CHECKS = ['Names are spelled correctly', 'Dates and times are correct', 'I approve this proof for printing'] as const

function Proof({ t }: { t: Template }) {
  const navigate = useNavigate()
  const [draft] = useDraft(t)
  const [, setCart] = useCart()
  const [images, setImages] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false))
  const [zoom, setZoom] = useState<string | null>(null)
  const checklistRef = useRef<HTMLDivElement>(null)
  const price = priceFor(t, draft)
  const paper = t.papers.find((p) => p.id === draft.paper) ?? t.papers[0]
  const issues = useMemo(() => preflight(t, draft), [t, draft])
  const allChecked = checked.every(Boolean)

  // Lock the page behind the full-screen proof.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const side of t.sides) {
        const url = await renderSide(t, side, draft.values, draft.photos, { mode: 'trim', ppi: proofPpi(t) })
        if (alive) setImages((m) => ({ ...m, [side.id]: url }))
      }
    })()
    return () => {
      alive = false
    }
  }, [t, draft])

  const approve = () => {
    if (!allChecked) {
      checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setCart({ templateId: t.id, draft, total: price.total, approvedAt: new Date().toISOString() })
    navigate('/checkout')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#24231f] text-white" role="dialog" aria-modal="true" aria-label="Review your proof">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Proof</p>
          <p className="truncate text-sm font-semibold">{t.name}</p>
        </div>
        <button type="button" onClick={() => navigate(`/editor/${t.id}`)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
          Back to editor
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-4xl space-y-8 px-4 pb-40 pt-6">
          <p className="text-center text-sm text-white/70">
            Please check every detail. We print exactly what you approve.
          </p>

          {t.sides.map((side) => (
            <section key={side.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-base font-semibold">{side.label}</h2>
                <span className="text-xs text-white/50">Tap to zoom</span>
              </div>
              <button
                type="button"
                onClick={() => images[side.id] && setZoom(side.id)}
                className="block w-full"
                aria-label={`Zoom in on ${side.label}`}
              >
                <div className="relative w-full" style={{ aspectRatio: `${t.trim.w} / ${t.trim.h}` }}>
                  {images[side.id] ? (
                    <img src={images[side.id]} alt={`${side.label} proof`} className="h-full w-full rounded-[2px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-[2px] bg-white/5 text-sm text-white/50">Preparing proof...</div>
                  )}
                  {side.folds?.map((f) => (
                    <span key={f} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-black/10" style={{ left: `${(f / t.trim.w) * 100}%` }} />
                  ))}
                </div>
              </button>
              {side.panels && (
                <div className="mt-1.5 flex justify-around text-xs text-white/50">
                  {side.panels.map((n) => <span key={n}>{n}</span>)}
                </div>
              )}
            </section>
          ))}

          <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Order details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-white/60">Size</dt><dd>{t.sizeLabel}</dd>
              <dt className="text-white/60">Quantity</dt><dd>{draft.qty}</dd>
              <dt className="text-white/60">{t.paperLabel ?? 'Paper'}</dt><dd>{paper.label}</dd>
              {t.rush && (<><dt className="text-white/60">Rush</dt><dd>{draft.rush ? 'Yes, printed same day or by 9 AM' : 'No'}</dd></>)}
              <dt className="text-white/60">Total</dt><dd className="font-semibold">{money(price.total)}</dd>
            </dl>
          </section>

          {issues.length > 0 && (
            <section className="rounded-2xl bg-amber-400/10 p-4 ring-1 ring-amber-300/30">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
                Our automatic check found {issues.length === 1 ? 'something' : 'a few things'} to look at
              </h2>
              <ul className="space-y-1 text-sm text-amber-50/90">
                {issues.map((i) => <li key={i.message}>{i.message}</li>)}
              </ul>
              <p className="mt-2 text-xs text-amber-50/60">You can still approve, or go back to the editor to fix them.</p>
            </section>
          )}

          <section ref={checklistRef} className="rounded-2xl bg-white p-4 text-ink">
            <h2 className="mb-1 text-base font-semibold">Before we print</h2>
            <p className="mb-3 text-sm text-muted">Check each box to approve your proof.</p>
            <div className="space-y-2">
              {CHECKS.map((c, i) => (
                <label key={c} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${checked[i] ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <input
                    type="checkbox"
                    className="h-6 w-6 shrink-0 accent-[var(--color-accent)]"
                    checked={checked[i]}
                    onChange={(e) => setChecked((arr) => arr.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <span className="text-base font-medium">{c}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#24231f] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-white/70" aria-live="polite">
            {allChecked ? 'Ready to approve' : `${checked.filter(Boolean).length} of ${CHECKS.length} checked`}
          </p>
          <button
            type="button"
            onClick={() => navigate(`/editor/${t.id}`)}
            className="hidden min-h-12 items-center rounded-xl px-4 text-sm font-semibold text-white/80 ring-1 ring-white/20 hover:bg-white/10 sm:inline-flex"
          >
            Make changes
          </button>
          <button type="button" disabled={!allChecked} onClick={approve} className="btn-primary w-48">
            Approve proof
          </button>
        </div>
      </div>

      {zoom && images[zoom] && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black">
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <p className="text-sm font-semibold">{t.sides.find((s) => s.id === zoom)?.label}</p>
            <button type="button" onClick={() => setZoom(null)} className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold hover:bg-white/10">
              Close
            </button>
          </div>
          {/* Wide and scrollable, so the customer can pan across the panels and read the fine print. */}
          <div className="flex-1 overflow-auto overscroll-contain">
            <img src={images[zoom]} alt="" className="max-w-none" style={{ width: `${Math.max(1, t.trim.w / 5.5) * 100}vw`, maxWidth: `${t.trim.w * 160}px` }} />
          </div>
        </div>
      )}
    </div>
  )
}
