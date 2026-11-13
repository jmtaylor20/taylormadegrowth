import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Template } from './types'
import { templateById } from './templates'
import { fieldsOf } from './textFit'
import { clearDraft, defaultDraft, useDraft, type Draft, type PhotoState } from './draft'
import { FieldForm } from './FieldForm'
import { PreviewPane } from './PreviewPane'
import { preflight } from './preflight'
import { proofPpi, renderSide } from './render'
import { loadFonts } from './fonts'
import { buildPrintPdf } from './pdf'
import { addToCart, createDesign, designFileUrl, getProduct, money, putDesignFile, type CartLine, type ShopConfig, type ShopProduct, type Variant } from './shop'
import { EnvelopePanel } from './EnvelopePanel'
import { buildEnvelopePdf, emptyEnvelopes, type EnvelopeState } from './envelopes'
import { dataUrlToBlob, draftJson, loadDesign, photoKind, rememberDesign, reorderUrl } from './saved'
import './editor.css'

interface Props {
  templateId: string
  shop: ShopConfig | null
  /** Where the "back" link goes. */
  backHref: string
  phone: string
  phoneHref: string
}

function useMedia(q: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [q])
  return on
}

/** Which side each field appears on, so focusing a field flips the preview to it. */
function sideOfField(t: Template, fieldId: string): string | undefined {
  for (const s of t.sides) for (const el of s.elements) if (fieldsOf(el).includes(fieldId)) return s.id
}

export default function EditorApp(props: Props) {
  const t = templateById(props.templateId)
  if (!t) return <p className="ed-missing">That design could not be found.</p>
  return <Editor t={t} {...props} />
}

/** Product options and the variant they pick, loaded from Shopify. */
function useProduct(t: Template, shop: ShopConfig | null) {
  const [product, setProduct] = useState<ShopProduct | null | 'loading' | 'error'>('loading')
  const [choice, setChoice] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!shop) return setProduct(null)
    let alive = true
    getProduct(shop, t.shopifyHandle)
      .then((p) => {
        if (!alive) return
        setProduct(p)
        // Default to the second quantity (a common order size) when there is one.
        const first = p?.variants.find((v) => v.available) ?? p?.variants[0]
        if (p && first) {
          const qty = p.options.find((o) => /quantity/i.test(o.name))
          const pick = { ...first.options }
          if (qty && qty.values[1]) pick[qty.name] = qty.values[1]
          setChoice(p.variants.some((v) => p.options.every((o) => v.options[o.name] === pick[o.name])) ? pick : first.options)
        }
      })
      .catch(() => alive && setProduct('error'))
    return () => {
      alive = false
    }
  }, [t, shop])
  const variant: Variant | undefined =
    product && typeof product === 'object' ? product.variants.find((v) => product.options.every((o) => v.options[o.name] === choice[o.name])) ?? (product.options.length === 0 ? product.variants[0] : undefined) : undefined
  return { product, choice, setChoice, variant }
}

function Editor({ t, shop, backHref, phone, phoneHref }: { t: Template } & Props) {
  const [draft, setDraft, loaded] = useDraft(t)
  const [sideId, setSideId] = useState(t.sides[0].id)
  const [showGuides, setShowGuides] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const photoPickers = useRef<Record<string, (() => void) | null>>({})
  const desktop = useMedia('(min-width: 1024px)')
  const { product, choice, setChoice, variant } = useProduct(t, shop)
  const [fontsReady, setFontsReady] = useState(false)
  const [envVariant, setEnvVariant] = useState<Variant | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!shop || !t.envelope) return
    getProduct(shop, t.envelope.shopifyHandle)
      .then((p) => setEnvVariant(p?.variants.find((v) => v.available) ?? null))
      .catch(() => setEnvVariant(null))
  }, [t, shop])

  // Reorder: /design/<template>/?from=<design id> opens a stored design.
  useEffect(() => {
    if (!loaded) return
    const from = new URLSearchParams(window.location.search).get('from')
    if (!from) return
    setNotice('Opening your saved design...')
    loadDesign(from)
      .then(({ templateId, draft }) => {
        if (templateId !== t.id) throw new Error('wrong template')
        setDraft(draft)
        setNotice('Your saved design is loaded. Update anything you like (the year, a new photo), then review your proof.')
      })
      .catch(() => setNotice(`We couldn't open that saved design. It may have expired. Call us at ${phone} and we'll help.`))
      .finally(() => history.replaceState(null, '', window.location.pathname))
  }, [loaded])

  const env: EnvelopeState = draft.envelopes ?? emptyEnvelopes
  const envCount = t.envelope && env.on ? env.recipients.length : 0
  const envTotal = envCount && envVariant ? envVariant.price * envCount : 0
  const cardQty = Number((Object.entries(choice).find(([k]) => /quantity/i.test(k))?.[1] ?? '').match(/\d+/)?.[0] ?? NaN)

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true))
  }, [])

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
  const onPhotoTap = useCallback((id: string) => photoPickers.current[id]?.(), [])

  // Release the highlight shortly after a field loses focus (lets taps on the canvas land first).
  useEffect(() => {
    if (focused != null) return
    const h = setTimeout(() => setTyping(false), 150)
    return () => clearTimeout(h)
  }, [focused])

  const price = variant ? money(variant.price + envTotal) : null
  const canOrder = !!variant && variant.available
  const status =
    product === 'loading' ? 'Loading prices...' : product === 'error' || product === null ? 'Online ordering opens soon' : !variant ? 'Choose your options' : !variant.available ? 'Sold out' : null

  return (
    <div className="ed">
      <header className="ed-top">
        <a className="ed-back" href={backHref}>
          <span aria-hidden="true">&larr;</span> Back
        </a>
        <div className="ed-title">
          <p className="mono">Work order / {t.sizeLabel}</p>
          <h1>{t.name}</h1>
        </div>
        <ol className="ed-steps mono" aria-label="Steps">
          <li className={proofOpen ? '' : 'is-on'}>1 Design</li>
          <li className={proofOpen ? 'is-on' : ''}>2 Proof</li>
          <li>3 Checkout</li>
        </ol>
      </header>

      <div className="ed-body">
        <div className="ed-stage">
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
            height={desktop ? 'min(calc(100svh - 300px), 640px)' : t.trim.w > t.trim.h ? '30svh' : '38svh'}
          />
          {!fontsReady && <p className="ed-hint">Loading fonts...</p>}
        </div>

        <div className="ed-side">
          {notice && <p className="ed-notice" role="status">{notice}</p>}
          {!loaded ? (
            <p className="ed-hint">Loading your design...</p>
          ) : (
            <FieldForm template={t} draft={draft} onValue={onValue} onPhoto={onPhoto} onFocusField={focusField} registerPhotoPicker={(id, open) => (photoPickers.current[id] = open)} />
          )}

          <fieldset className="ed-section">
            <legend className="ed-section-title">
              <span className="ed-section-no">{String.fromCharCode(65 + new Set(t.fields.map((f) => f.section ?? 'Details')).size)}</span>
              Print options
            </legend>
            {product && typeof product === 'object' ? (
              product.options.map((o) => (
                <div key={o.name} className="ed-field">
                  <span className="ed-label">{o.name}</span>
                  <div className="ed-choices">
                    {o.values.map((v) => {
                      const match = product.variants.find((x) => product.options.every((oo) => (oo.name === o.name ? x.options[oo.name] === v : x.options[oo.name] === choice[oo.name])))
                      return (
                        <button key={v} type="button" className={`ed-choice ${choice[o.name] === v ? 'is-on' : ''}`} onClick={() => setChoice((c) => ({ ...c, [o.name]: v }))} disabled={match ? !match.available : false}>
                          <span>{v}</span>
                          {match && /quantity/i.test(o.name) && <span className="mono">{money(match.price)}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            ) : (
              <p className="ed-hint">
                {product === 'loading' ? 'Loading options...' : `Online ordering for this design opens soon. To order now, call us at `}
                {product !== 'loading' && <a href={phoneHref}>{phone}</a>}
              </p>
            )}
          </fieldset>

          {t.envelope && (
            <EnvelopePanel
              spec={t.envelope}
              value={draft.envelopes}
              onChange={(next) => setDraft((d) => ({ ...d, envelopes: next }))}
              each={envVariant?.price ?? null}
              cardQty={Number.isFinite(cardQty) ? cardQty : null}
              sectionNo={String.fromCharCode(66 + new Set(t.fields.map((f) => f.section ?? 'Details')).size)}
            />
          )}

          <button
            type="button"
            className="ed-btn ed-btn-ghost ed-reset"
            onClick={() => {
              if (confirm('Start over? This clears your photos and text.')) {
                clearDraft(t)
                setDraft(defaultDraft(t))
              }
            }}
          >
            Start over with sample text
          </button>
        </div>
      </div>

      <div className={`ed-bar ${!desktop && typing ? 'is-hidden' : ''}`}>
        <div className="ed-bar-in">
          <div className="ed-total">
            <span className="mono">{status ?? [...Object.values(choice), envCount ? `${envCount} envelopes` : ''].filter(Boolean).join(' / ')}</span>
            <strong>{price ?? ' '}</strong>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setProofOpen(true)}>
            Review proof <span className="arrow" aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>

      {proofOpen && (
        <Proof
          t={t}
          draft={draft}
          shop={shop}
          variant={canOrder ? variant! : null}
          envVariant={envCount && envVariant ? envVariant : null}
          summary={Object.values(choice).join(', ')}
          orderStatus={status}
          phone={phone}
          phoneHref={phoneHref}
          onClose={() => setProofOpen(false)}
        />
      )}
    </div>
  )
}

const CHECKS = ['Names and spelling are correct', 'Photos look the way I want', 'I approve this proof for printing'] as const

function Proof({
  t,
  draft,
  shop,
  variant,
  envVariant,
  summary,
  orderStatus,
  phone,
  phoneHref,
  onClose,
}: {
  t: Template
  draft: Draft
  shop: ShopConfig | null
  variant: Variant | null
  envVariant: Variant | null
  summary: string
  orderStatus: string | null
  phone: string
  phoneHref: string
  onClose: () => void
}) {
  const [images, setImages] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false))
  const [work, setWork] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const issues = useMemo(() => preflight(t, draft), [t, draft])
  const allChecked = checked.every(Boolean)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !work && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, work])

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

  const env = t.envelope && draft.envelopes?.on && draft.envelopes.recipients.length ? draft.envelopes : null
  const total = variant ? variant.price + (env && envVariant ? envVariant.price * env.recipients.length : 0) : 0

  const approve = async () => {
    if (!allChecked || !variant || !shop) return
    setError(null)
    try {
      const ref = `KS-${Date.now().toString(36).toUpperCase()}`
      let pdf = await buildPrintPdf(t, draft, { ref, summary }, setWork)
      // Keep under the 6 MB upload limit; very detailed photos can push past it.
      if (pdf.size > 5.6 * 1024 * 1024) pdf = await buildPrintPdf(t, draft, { ref, summary }, setWork, 0.82)
      setWork('Sending your design to the shop')
      const id = await createDesign()
      const proofUrl = await renderSide(t, t.sides[0], draft.values, draft.photos, { mode: 'trim', ppi: 600 / Math.max(t.trim.w, t.trim.h), quality: 0.85 })
      const thumb = await renderSide(t, t.sides[0], draft.values, draft.photos, { mode: 'trim', ppi: 220 / Math.max(t.trim.w, t.trim.h), quality: 0.7 })
      await putDesignFile(id, 'pdf', pdf)
      await putDesignFile(id, 'proof', await dataUrlToBlob(proofUrl))
      // Saved for reorders: the editable design and its photos.
      await putDesignFile(id, 'draft', draftJson(t.id, draft))
      for (const [slot, p] of Object.entries(draft.photos)) await putDesignFile(id, photoKind(slot), await dataUrlToBlob(p.src))
      if (env && t.envelope) {
        setWork('Preparing your envelopes')
        await putDesignFile(id, 'envelopes', buildEnvelopePdf(t.envelope, env, ref))
      }
      setWork('Adding to your cart')
      const reorder = reorderUrl(t.id, id)
      const items: CartLine[] = [
        {
          variantId: variant.id,
          quantity: 1,
          attributes: {
            Design: t.name,
            Proof: 'Approved',
            _Reference: ref,
            '_Print file': designFileUrl(id, 'pdf'),
            _Proof: designFileUrl(id, 'proof'),
            _Reorder: reorder,
            '_Design ID': id,
            _Template: t.id,
          },
        },
      ]
      if (env && envVariant)
        items.push({
          variantId: envVariant.id,
          quantity: env.recipients.length,
          attributes: { For: `${t.name} cards`, _Reference: ref, '_Envelopes file': designFileUrl(id, 'envelopes') },
        })
      const checkoutUrl = await addToCart(shop, items)
      rememberDesign({ id, templateId: t.id, name: t.name, ref, summary, savedAt: new Date().toISOString(), thumb })
      setWork('Opening checkout')
      window.location.href = checkoutUrl
    } catch (e) {
      console.error(e)
      setWork(null)
      setError(`Something went wrong sending your design. Please try again, or call us at ${phone}.`)
    }
  }

  return (
    <div className="ed-proof" role="dialog" aria-modal="true" aria-label="Review your proof">
      <div className="ed-proof-top">
        <div>
          <p className="mono">Proof / {t.sizeLabel}</p>
          <p className="ed-proof-name">{t.name}</p>
        </div>
        <button type="button" className="ed-btn ed-btn-dark" onClick={onClose} disabled={!!work}>
          &larr; Make changes
        </button>
      </div>

      <div className="ed-proof-scroll">
        <div className="ed-proof-in">
          <p className="ed-proof-note">Check every detail. We print exactly what you approve.</p>
          {t.sides.map((side) => (
            <section key={side.id} className="ed-proof-side">
              <p className="mono">{side.label}</p>
              <div className="ed-proof-img" style={{ aspectRatio: `${t.trim.w} / ${t.trim.h}` }}>
                {images[side.id] ? <img src={images[side.id]} alt={`${side.label} proof`} /> : <span className="mono">Preparing proof...</span>}
              </div>
            </section>
          ))}

          {issues.length > 0 && (
            <section className="ed-issues">
              <p className="ed-issues-h">Our automatic check found {issues.length === 1 ? 'something' : 'a few things'} to look at</p>
              <ul>
                {issues.map((i) => (
                  <li key={i.message}>{i.message}</li>
                ))}
              </ul>
              <p className="ed-hint">You can still approve, or go back and fix them.</p>
            </section>
          )}

          <section className="ed-checks">
            <p className="ed-checks-h">Before we print</p>
            {CHECKS.map((c, i) => (
              <label key={c} className={`ed-check ${checked[i] ? 'is-on' : ''}`}>
                <input type="checkbox" checked={checked[i]} onChange={(e) => setChecked((arr) => arr.map((v, j) => (j === i ? e.target.checked : v)))} />
                <span>{c}</span>
              </label>
            ))}
          </section>

          {env && (
            <section className="ed-proof-side">
              <p className="mono">Envelopes</p>
              <p className="ed-proof-note" style={{ textAlign: 'left' }}>
                {env.recipients.length} addressed {t.envelope!.label}s{envVariant ? `, ${money(envVariant.price * env.recipients.length)}` : ''}. First one: {env.recipients[0].join(', ')}
              </p>
            </section>
          )}

          {!variant && (
            <p className="ed-proof-note">
              {orderStatus ?? 'Online ordering opens soon.'} To order this design now, call us at <a href={phoneHref}>{phone}</a>.
            </p>
          )}
          {error && <p className="ed-error" role="alert">{error}</p>}
        </div>
      </div>

      <div className="ed-proof-bar">
        <p className="mono" aria-live="polite">
          {work ?? (allChecked ? `Ready / ${summary}` : `${checked.filter(Boolean).length} of ${CHECKS.length} checked`)}
        </p>
        <button type="button" className="btn btn-primary" disabled={!allChecked || !variant || !!work} onClick={approve}>
          {work ? 'Working...' : variant ? `Approve & checkout ${money(total)}` : 'Approve proof'}
        </button>
      </div>
    </div>
  )
}
