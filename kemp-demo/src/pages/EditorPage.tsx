import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { templateById, CATEGORIES } from '../templates'
import type { Template } from '../templates/types'
import { tokensIn } from '../lib/textFit'
import { defaultDraft, money, priceFor, useDraft, type PhotoState } from '../lib/draft'
import { FieldForm } from '../components/FieldForm'
import { OptionsPanel } from '../components/OptionsPanel'
import { PreviewPane } from '../components/PreviewPane'
import { useMediaQuery } from '../lib/useMediaQuery'

export function EditorPage() {
  const { templateId = '' } = useParams()
  const t = templateById(templateId)
  if (!t) return <p className="p-6">That template could not be found.</p>
  return <Editor key={t.id} t={t} />
}

/** Which side each field appears on, so focusing a field flips the preview to it. */
function sideOfField(t: Template, fieldId: string): string | undefined {
  for (const s of t.sides)
    for (const el of s.elements) {
      if (el.type === 'text' && tokensIn(el.text).includes(fieldId)) return s.id
      if (el.type === 'photo' && el.field === fieldId) return s.id
    }
}

function Editor({ t }: { t: Template }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useDraft(t)
  const [sideId, setSideId] = useState(t.sides[0].id)
  const [showGuides, setShowGuides] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const photoInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const stickyRef = useRef<HTMLDivElement>(null)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const category = CATEGORIES.find((c) => c.id === t.category)!
  const price = priceFor(t, draft)

  const focusField = useCallback(
    (id: string | null, isTyping = true) => {
      setFocused(id)
      if (id && isTyping) setTyping(true)
      if (id) {
        const s = sideOfField(t, id)
        if (s) setSideId(s)
      }
    },
    [t],
  )

  const onValue = useCallback((id: string, value: string) => setDraft((d) => ({ ...d, values: { ...d.values, [id]: value } })), [setDraft])
  const onPhoto = useCallback(
    (id: string, next: PhotoState | null) =>
      setDraft((d) => {
        const photos = { ...d.photos }
        if (next) photos[id] = next
        else delete photos[id]
        return { ...d, photos }
      }),
    [setDraft],
  )
  const onPhotoTap = useCallback((id: string) => photoInputs.current[id]?.click(), [])

  // On phones the preview is sticky. Tell the browser how tall it is so a
  // focused field is always scrolled into view below it, never underneath.
  useEffect(() => {
    const el = stickyRef.current
    const root = document.documentElement
    if (!el || desktop) return
    const ro = new ResizeObserver(() => root.style.setProperty('--sticky-h', `${el.offsetHeight + 12}px`))
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--sticky-h')
    }
  }, [desktop])

  // Release the highlight shortly after a field loses focus (lets taps on the
  // canvas land before the outline disappears).
  useEffect(() => {
    if (focused != null) return
    const h = setTimeout(() => setTyping(false), 150)
    return () => clearTimeout(h)
  }, [focused])

  const preview = (
    <PreviewPane
      template={t}
      sideId={sideId}
      onSide={setSideId}
      values={draft.values}
      photos={draft.photos}
      showGuides={showGuides}
      onGuides={setShowGuides}
      highlightField={focused}
      onPhotoChange={onPhoto}
      onPhotoTap={onPhotoTap}
      compact={!desktop && typing}
      maxHeight={desktop ? 'calc(100svh - 360px)' : t.trim.w > t.trim.h ? '34svh' : '38svh'}
    />
  )

  const proofButton = (
    <button type="button" onClick={() => navigate(`/proof/${t.id}`)} className="btn-primary w-full">
      Review Proof
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl lg:px-6">
      <div className="px-4 pt-4 lg:px-0">
        <nav className="text-sm text-muted">
          <Link to="/" className="hover:text-ink">Home</Link>
          <span className="mx-1.5">/</span>
          <Link to={`/category/${t.category}`} className="hover:text-ink">{category.name}</Link>
        </nav>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{t.name}</h1>
          <p className="text-sm text-muted">{t.sizeLabel}</p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(360px,440px)_1fr] lg:gap-8 lg:pt-4">
        {/* Preview: sticky at the top on phones so it stays in view while typing. */}
        <div ref={stickyRef} className="sticky top-0 z-20 border-b border-line bg-canvas px-4 pb-2 pt-3 lg:order-2 lg:top-20 lg:self-start lg:rounded-2xl lg:border lg:p-5">
          {preview}
          <div className="mt-3 hidden items-center gap-4 lg:flex">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{draft.qty} printed{draft.rush ? ', rush' : ''}</p>
              <p className="text-2xl font-semibold tabular-nums text-ink">{money(price.total)}</p>
            </div>
            <div className="w-56">{proofButton}</div>
          </div>
        </div>

        <div className="space-y-6 px-4 pb-36 pt-5 lg:order-1 lg:px-0 lg:pb-16 lg:pt-0">
          <FieldForm
            template={t}
            draft={draft}
            onValue={onValue}
            onPhoto={onPhoto}
            onFocusField={focusField}
            registerPhotoInput={(id, el) => (photoInputs.current[id] = el)}
          />
          <OptionsPanel template={t} draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          <button type="button" onClick={() => setDraft(defaultDraft(t))} className="btn-ghost w-full">
            Start over with sample text
          </button>
        </div>
      </div>

      {/* Phone checkout bar. Hidden while the keyboard is up so it never covers the field. */}
      {!desktop && (
        <div
          className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-200 ${
            typing ? 'translate-y-full' : ''
          }`}
        >
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted">{draft.qty} printed{draft.rush ? ', rush' : ''}</p>
              <p className="text-xl font-semibold tabular-nums text-ink">{money(price.total)}</p>
            </div>
            <div className="w-44">{proofButton}</div>
          </div>
        </div>
      )}
    </div>
  )
}
