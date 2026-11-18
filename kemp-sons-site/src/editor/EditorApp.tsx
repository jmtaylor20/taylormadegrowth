import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Template } from './types'
import { templateById } from './templates'
import { fieldsOf } from './textFit'
import { baseSrc, clearAllDrafts, clearDraft, defaultDraft, toneImage, toneKey, useDraft, type Draft, type PhotoState } from './draft'
import { FieldForm } from './FieldForm'
import { PreviewPane } from './PreviewPane'
import { photoLayout } from './SideCanvas'
import { preflight } from './preflight'
import { proofPpi, renderSide } from './render'
import { loadFonts } from './fonts'
import { buildPrintPdf, isOneColor } from './pdf'
import { RUSH_HANDLE, rushFormatFor } from '../../netlify/lib/price-groups'
import { IDLE_SECONDS, KIOSK_HOME, WARN_SECONDS, isKiosk } from './kiosk'
import { addToCart, createDesign, designFileUrl, getProduct, money, putDesignFile, putStaffFile, type CartLine, type ShopConfig, type ShopProduct, type Variant } from './shop'
import { EnvelopePanel } from './EnvelopePanel'
import { buildEnvelopePdf, emptyEnvelopes, envelopeCount, envelopeKind, envelopePrinting, type EnvelopeKind, type EnvelopeState } from './envelopes'
import { cutoutKind, dataUrlToBlob, draftJson, loadDesign, photoKind, rememberDesign, reorderUrl } from './saved'
import { adClick, flushAnalytics, isKioskVisit, track, withLinker } from '../scripts/tracking'
import { tracking } from '../config/tracking'
import { shipStatus } from '../lib/shipclock'
import './editor.css'

interface Props {
  templateId: string
  shop: ShopConfig | null
  /** Where the "back" link goes. */
  backHref: string
  phone: string
  phoneHref: string
  /**
   * Prototype (/prototype/): opens in simple mode with a "More options" switch
   * back to the full designer, and the last step shows what would be sent
   * instead of going to checkout. Nothing is uploaded or ordered.
   */
  prototype?: boolean
}

const ADVANCED_KEY = 'kemp-proto-advanced'
const HOME_KEY = 'kemp-home'

/** A partner funeral home signed in to the portal. */
interface PortalHome {
  slug: string
  name: string
  address: string
  city: string
  phone: string
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

function Editor({ t, shop, backHref: siteBack, phone, phoneHref, prototype = false }: { t: Template } & Props) {
  // Prototype: simple mode unless "More options" is on (remembered for the visit).
  const [simple, setSimple] = useState(() => {
    if (!prototype) return false
    try {
      return sessionStorage.getItem(ADVANCED_KEY) !== '1'
    } catch {
      return true
    }
  })
  const setAdvanced = (on: boolean) => {
    setSimple(!on)
    try {
      sessionStorage.setItem(ADVANCED_KEY, on ? '1' : '0')
    } catch {
      /* private window */
    }
  }
  const STEPS = ['Words', 'Photos', 'Print & review'] as const
  const [step, setStep] = useState(0)
  const [kiosk] = useState(isKiosk)
  // Staff final tweaks: /design/<t>/?from=<design id>&staff=<order name>&opts=<print options>
  const [staff] = useState<StaffEdit | null>(() => {
    const q = new URLSearchParams(window.location.search)
    const order = q.get('staff')
    const from = q.get('from')
    return order && from ? { order, designId: from, summary: q.get('opts') ?? '' } : null
  })
  // Funeral home portal: ?home=1 (remembered for the visit) opens the designer for a signed-in partner home.
  const [home, setHome] = useState<PortalHome | null>(null)
  useEffect(() => {
    let on = false
    try {
      on = new URLSearchParams(window.location.search).has('home') || sessionStorage.getItem(HOME_KEY) === '1'
      if (on) sessionStorage.setItem(HOME_KEY, '1')
    } catch {
      /* private window */
    }
    if (!on) return
    fetch('/api/portal/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b?.home) return setHome(b.home)
        try {
          sessionStorage.removeItem(HOME_KEY)
        } catch {
          /* ignore */
        }
      })
      .catch(() => {})
  }, [])

  // Prototype: back returns to wherever in the picker the design was chosen.
  const [protoBack] = useState(() => (prototype && document.referrer.includes('/prototype/') && !document.referrer.includes('/prototype/design/') ? document.referrer : null))
  const backHref = home ? '/portal/' : kiosk ? `${KIOSK_HOME}#${t.category}` : (protoBack ?? siteBack)
  const [draft, setDraft, loaded] = useDraft(t)

  // Partner home: fill in its details wherever the template's sample text is still there.
  useEffect(() => {
    if (!home || !loaded) return
    const defs = defaultDraft(t).values
    const want: Record<string, string> = {
      funeralHome: home.name,
      funeralHomeDetails: [[home.address, home.city].filter(Boolean).join(', '), home.phone].filter(Boolean).join('\n'),
    }
    setDraft((d) => {
      const values = { ...d.values }
      let changed = false
      for (const [k, v] of Object.entries(want))
        if (v && k in defs && (values[k] ?? defs[k]) === defs[k]) {
          values[k] = v
          changed = true
        }
      return changed ? { ...d, values } : d
    })
  }, [home, loaded])

  // Family photo link: /design/<t>/?home=1&case=<id> starts this program fresh from what the family sent.
  const [caseId] = useState(() => new URLSearchParams(window.location.search).get('case'))
  const caseDone = useRef(false)
  useEffect(() => {
    if (!home || !loaded || !caseId || caseDone.current) return
    caseDone.current = true
    // Same family already open in this draft (a reload): keep their edits.
    if (draft.values.__case === caseId) return
    ;(async () => {
      setNotice("Bringing in the family's photos and words...")
      try {
        const r = await fetch(`/api/portal/cases/${encodeURIComponent(caseId)}`, { credentials: 'same-origin' })
        if (!r.ok) throw new Error()
        const c = (await r.json()).case as { name: string; values: Record<string, string>; photos: { id: string; kind: string }[] }
        const fresh = defaultDraft(t)
        const values: Record<string, string> = { ...fresh.values, __case: caseId }
        const has = new Set(t.fields.map((f) => f.id))
        if (has.has('funeralHome')) values.funeralHome = home.name
        if (has.has('funeralHomeDetails')) values.funeralHomeDetails = [[home.address, home.city].filter(Boolean).join(', '), home.phone].filter(Boolean).join('\n')
        for (const [k, v] of Object.entries(c.values)) if (v && has.has(k) && k !== 'note') values[k] = v
        // Photos: the main one on the portrait spot, the rest in order on the other spots.
        const slots: string[] = []
        for (const f of t.fields) if (f.type === 'photo' && f.id !== 'photo') for (let i = 1; i <= (f.count ?? 1); i++) slots.push(f.count ? `${f.id}_${i}` : f.id)
        const load = async (pid: string): Promise<PhotoState | null> => {
          const res = await fetch(`/api/portal/cases/${encodeURIComponent(caseId)}/photos/${pid}`, { credentials: 'same-origin' })
          if (!res.ok) return null
          const blob = await res.blob()
          const src = await new Promise<string>((ok, bad) => {
            const fr = new FileReader()
            fr.onload = () => ok(fr.result as string)
            fr.onerror = bad
            fr.readAsDataURL(blob)
          })
          const img = await new Promise<HTMLImageElement>((ok, bad) => {
            const i = new Image()
            i.onload = () => ok(i)
            i.onerror = bad
            i.src = src
          })
          return { src, w: img.naturalWidth, h: img.naturalHeight, ox: 0, oy: 0, zoom: 1 }
        }
        const photos: Record<string, PhotoState> = {}
        const main = c.photos.find((p) => p.kind === 'portrait')
        if (main && has.has('photo')) {
          const ph = await load(main.id)
          if (ph) photos.photo = ph
        }
        const rest = c.photos.filter((p) => p !== main)
        for (const [i, p] of rest.slice(0, slots.length).entries()) {
          const ph = await load(p.id)
          if (ph) photos[slots[i]] = ph
        }
        setDraft({ ...fresh, values, photos })
        const n = Object.keys(photos).length
        setNotice(`Filled in from ${c.name}'s family link: ${n} photo${n === 1 ? '' : 's'} and their words. Check everything, then review the proof.${rest.length > slots.length ? ` This design has room for ${slots.length + (has.has('photo') ? 1 : 0)} photos; the family sent ${c.photos.length}.` : ''}`)
      } catch {
        setNotice("The family's photos and words couldn't be loaded. You can still fill in the program here.")
      }
    })()
  }, [home, loaded])

  // Photo fixes (brighten, black & white, sepia, vintage): make the fixed copy whenever a photo, its cut-out or a fix changes.
  const toning = useRef(new Set<string>())
  useEffect(() => {
    for (const [slot, p] of Object.entries(draft.photos)) {
      const key = toneKey(p)
      if (!key || p.tonedKey === key || toning.current.has(slot + key)) continue
      toning.current.add(slot + key)
      toneImage(baseSrc(p), p.tone, !!p.enhance)
        .then((url) =>
          setDraft((d) => {
            const cur = d.photos[slot]
            if (!cur || toneKey(cur) !== key) return d
            return { ...d, photos: { ...d.photos, [slot]: { ...cur, toned: url, tonedKey: key } } }
          }),
        )
        .catch(() => {})
        .finally(() => toning.current.delete(slot + key))
    }
  }, [draft.photos])
  const [sideId, setSideId] = useState(t.sides[0].id)
  const [showGuides, setShowGuides] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const photoPickers = useRef<Record<string, (() => void) | null>>({})
  const desktop = useMedia('(min-width: 1024px)')
  const { product, choice, setChoice, variant } = useProduct(t, shop)
  const [fontsReady, setFontsReady] = useState(false)
  const [envVariants, setEnvVariants] = useState<Variant[]>([])
  // Rush is a separate fee product with one price per format.
  const rushFormat = rushFormatFor(t.shopifyHandle)
  const [rushVariant, setRushVariant] = useState<Variant | null>(null)
  const [rush, setRush] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!shop || !t.envelope) return
    getProduct(shop, t.envelope.shopifyHandle)
      .then((p) => setEnvVariants(p?.variants.filter((v) => v.available) ?? []))
      .catch(() => setEnvVariants([]))
  }, [t, shop])

  useEffect(() => {
    if (!shop || !rushFormat) return
    getProduct(shop, RUSH_HANDLE)
      .then((p) => setRushVariant(p?.variants.find((v) => v.options.Format === rushFormat && v.available) ?? null))
      .catch(() => setRushVariant(null))
  }, [shop, rushFormat])

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
        setNotice(
          staff
            ? `Staff edit for order ${staff.order}. This is the customer's approved design. Make your changes, then open the proof and save the print file.`
            : 'Your saved design is loaded. Update anything you like (the year, a new photo), then review your proof.',
        )
      })
      .catch(() => setNotice(`We couldn't open that saved design. It may have expired. Call us at ${phone} and we'll help.`))
      .finally(() => history.replaceState(null, '', window.location.pathname))
  }, [loaded])

  const env: EnvelopeState = draft.envelopes ?? emptyEnvelopes
  const cardQty = Number((Object.entries(choice).find(([k]) => /quantity/i.test(k))?.[1] ?? '').match(/\d+/)?.[0] ?? NaN)
  // Envelopes are priced per envelope by how they're printed (Kemp's list: blank, one side, both sides).
  const envPrinting = t.envelope ? envelopePrinting(env) : null
  const envVariant = envPrinting ? (envVariants.find((v) => v.options.Printing === envPrinting) ?? null) : null
  const envCount = envVariant ? envelopeCount(env, Number.isFinite(cardQty) ? cardQty : null) : 0
  const envTotal = envCount && envVariant ? envVariant.price * envCount : 0
  const envPrices = Object.fromEntries(envVariants.map((v) => [v.options.Printing, v.price]))

  useEffect(() => {
    loadFonts(t).then(() => setFontsReady(true))
    // Staff adjusting an order isn't a customer starting a design.
    if (!staff) track('design_start', { template: t.id, design_name: t.name, category: t.category })
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
        if (next) {
          // Simple mode: a newly added photo sits a little toward its top third, so faces aren't cut off.
          const fresh = !d.photos[id] || d.photos[id].src !== next.src
          if (simple && fresh && next.ox === 0 && next.oy === 0) {
            const el = t.sides.flatMap((sd) => sd.elements).find((e) => e.type === 'photo' && e.field === id)
            if (el && el.type === 'photo') {
              const lay = photoLayout({ width: next.w, height: next.h }, el.w * 72, el.h * 72, next)
              next = { ...next, oy: lay.maxY * 0.6 }
            }
          }
          photos[id] = next
        } else delete photos[id]
        return { ...d, photos }
      }),
    [setDraft, simple, t],
  )
  const onPhotoTap = useCallback((id: string) => photoPickers.current[id]?.(), [])

  // Release the highlight shortly after a field loses focus (lets taps on the canvas land first).
  useEffect(() => {
    if (focused != null) return
    const h = setTimeout(() => setTyping(false), 150)
    return () => clearTimeout(h)
  }, [focused])

  const rushOn = rush && !!rushVariant
  const price = variant ? money(variant.price + envTotal + (rushOn ? rushVariant!.price : 0)) : null
  const summary = staff ? staff.summary : [...Object.values(choice), rushOn ? 'Rush' : ''].filter(Boolean).join(', ')
  const canOrder = !!variant && variant.available
  const status =
    product === 'loading' ? 'Loading prices...' : product === 'error' || product === null ? 'Online ordering opens soon' : !variant ? 'Choose your options' : !variant.available ? 'Sold out' : null

  return (
    <div className={`ed ${isOneColor(staff ? staff.summary : Object.values(choice).join(', ')) ? 'is-onecolor' : ''}`}>
      <header className="ed-top">
        <a className="ed-back" href={backHref}>
          <span aria-hidden="true">&larr;</span> Back
        </a>
        <div className="ed-title">
          <p className="mono">Work order / {t.sizeLabel}</p>
          <h1>{t.name}</h1>
        </div>
        {prototype ? (
          <label className="ed-advanced">
            <input type="checkbox" checked={!simple} onChange={(e) => setAdvanced(e.target.checked)} />
            <span>More options</span>
          </label>
        ) : (
          <ol className="ed-steps mono" aria-label="Steps">
            <li className={proofOpen ? '' : 'is-on'}>1 Design</li>
            <li className={proofOpen ? 'is-on' : ''}>2 Proof</li>
            <li>3 Checkout</li>
          </ol>
        )}
      </header>

      <div className="ed-body">
        <div className="ed-stage">
          <PreviewPane
            // Redraw once web fonts load: text is measured with the real fonts, not the fallback.
            key={fontsReady ? 'fonts' : 'fallback'}
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
          {home && <p className="ed-notice">Ordering for {home.name}. Your funeral home's details are filled in.</p>}
          {notice && <p className="ed-notice" role="status">{notice}</p>}
          {!loaded ? (
            <p className="ed-hint">Loading your design...</p>
          ) : (
            <>
              {simple && (
                <ol className="ed-simple-steps" aria-label="Steps">
                  {STEPS.map((name, i) => (
                    <li key={name}>
                      <button type="button" className={i === step ? 'is-on' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
                        <span className="mono">{i + 1}</span> {name}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {(!simple || step < 2) && (
                <FieldForm
                  template={t}
                  draft={draft}
                  onValue={onValue}
                  onPhoto={onPhoto}
                  onFocusField={focusField}
                  registerPhotoPicker={(id, open) => (photoPickers.current[id] = open)}
                  simple={simple}
                  only={simple ? (step === 0 ? 'text' : 'photo') : undefined}
                />
              )}
            </>
          )}

          {(!simple || step === 2) && (<>
          <fieldset className="ed-section">
            <legend className="ed-section-title">
              <span className="ed-section-no">{String.fromCharCode(65 + new Set(t.fields.map((f) => f.section ?? 'Details')).size)}</span>
              Print options
            </legend>
            <ShipLine rush={!!rushVariant} />
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
            {rushVariant && product && typeof product === 'object' && (
              <label className="ed-rush">
                <input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} />
                <span>
                  <strong>Rush printing</strong> (+{money(rushVariant.price)}). Order by noon Central on a weekday and it ships the same day. Need it by a certain time? Call us at <a href={phoneHref}>{phone}</a>.
                </span>
              </label>
            )}
            {isOneColor(Object.values(choice).join(', ')) && <p className="ed-hint">One color prints in a single ink, so your preview and proof show it in black and white.</p>}
          </fieldset>

          {t.envelope && (
            <EnvelopePanel
              spec={t.envelope}
              value={draft.envelopes}
              onChange={(next) => setDraft((d) => ({ ...d, envelopes: next }))}
              prices={envPrices}
              cardQty={Number.isFinite(cardQty) ? cardQty : null}
              sectionNo={String.fromCharCode(66 + new Set(t.fields.map((f) => f.section ?? 'Details')).size)}
            />
          )}

          </>)}

          {simple && (
            <div className="ed-step-nav">
              {step > 0 && (
                <button type="button" className="ed-btn ed-btn-ghost" onClick={() => setStep(step - 1)}>
                  &larr; {STEPS[step - 1]}
                </button>
              )}
              {step < 2 && (
                <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
                  Next: {STEPS[step + 1]} <span className="arrow" aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>
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
            <span className="mono">{staff ? `Staff edit / order ${staff.order} / ${staff.summary}` : status ?? [...Object.values(choice), rushOn ? 'Rush' : '', envCount ? `${envCount} envelopes` : ''].filter(Boolean).join(' / ')}</span>
            <strong>{price ?? ' '}</strong>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setProofOpen(true)}>
            Review proof <span className="arrow" aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>

      {kiosk && <KioskIdle />}
      {proofOpen && (
        <Proof
          t={t}
          draft={draft}
          shop={shop}
          variant={canOrder ? variant! : null}
          envOrder={envCount && envVariant ? { variant: envVariant, count: envCount, kind: envelopeKind(env)! } : null}
          rushVariant={rushOn ? rushVariant : null}
          summary={summary}
          staff={staff}
          orderStatus={status}
          phone={phone}
          phoneHref={phoneHref}
          onClose={() => setProofOpen(false)}
          prototype={prototype}
          home={home}
        />
      )}
    </div>
  )
}

interface StaffEdit {
  /** Shopify order name, e.g. #1003. */
  order: string
  designId: string
  /** Print options from the order, used for the slug label and one-color grayscale. */
  summary: string
}

const CHECKS = ['Names and spelling are correct', 'Photos look the way I want', 'I approve this proof for printing'] as const

function Proof({
  t,
  draft,
  shop,
  variant,
  envOrder,
  rushVariant,
  summary,
  staff,
  orderStatus,
  phone,
  phoneHref,
  onClose,
  prototype = false,
  home = null,
}: {
  t: Template
  draft: Draft
  shop: ShopConfig | null
  variant: Variant | null
  envOrder: { variant: Variant; count: number; kind: EnvelopeKind } | null
  rushVariant: Variant | null
  summary: string
  staff: StaffEdit | null
  orderStatus: string | null
  phone: string
  phoneHref: string
  onClose: () => void
  prototype?: boolean
  home?: PortalHome | null
}) {
  // Prototype: what would be sent, shown instead of going to checkout.
  const [sent, setSent] = useState(false)
  const [images, setImages] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false))
  const [work, setWork] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const issues = useMemo(() => preflight(t, draft), [t, draft])
  const allChecked = checked.every(Boolean)
  // Every photo spot must be filled: an empty one would print as a gray placeholder.
  const missingPhotos = issues.some((i) => i.kind === 'photo')

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

  const env = t.envelope && envOrder && draft.envelopes ? draft.envelopes : null
  const envVariant = envOrder?.variant ?? null
  const total = variant ? variant.price + (envOrder ? envOrder.variant.price * envOrder.count : 0) + (rushVariant?.price ?? 0) : 0

  const [savedForStaff, setSavedForStaff] = useState(false)

  /** Staff: rebuild the print file from the adjusted design and replace it on the order. */
  const saveForStaff = async () => {
    if (!staff) return
    setError(null)
    try {
      const job = { ref: `Order ${staff.order} (adjusted)`, summary: staff.summary }
      let pdf = await buildPrintPdf(t, draft, job, setWork)
      if (pdf.size > 5.6 * 1024 * 1024) pdf = await buildPrintPdf(t, draft, job, setWork, 0.82)
      setWork('Saving to the order')
      const id = staff.designId
      const proofUrl = await renderSide(t, t.sides[0], draft.values, draft.photos, { mode: 'trim', ppi: 600 / Math.max(t.trim.w, t.trim.h), quality: 0.85 })
      await putStaffFile(id, 'pdf', pdf)
      await putStaffFile(id, 'proof', await dataUrlToBlob(proofUrl))
      await putStaffFile(id, 'draft', draftJson(t.id, draft))
      for (const [slot, p] of Object.entries(draft.photos)) {
        await putStaffFile(id, photoKind(slot), await dataUrlToBlob(p.src))
        if (p.useCutout && p.cutout) await putStaffFile(id, cutoutKind(slot), await dataUrlToBlob(p.cutout))
      }
      setSavedForStaff(true)
    } catch (e) {
      console.error(e)
      setError(`Not saved: ${(e as Error).message}`)
    } finally {
      setWork(null)
    }
  }

  const approve = async () => {
    if (prototype) return setSent(true)
    if (!allChecked || missingPhotos || !variant || !shop) return
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
      for (const [slot, p] of Object.entries(draft.photos)) {
        await putDesignFile(id, photoKind(slot), await dataUrlToBlob(p.src))
        if (p.useCutout && p.cutout) await putDesignFile(id, cutoutKind(slot), await dataUrlToBlob(p.cutout))
      }
      if (env && t.envelope && envOrder && envOrder.kind !== 'blank') {
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
      if (env && envOrder)
        items.push({
          variantId: envOrder.variant.id,
          quantity: envOrder.count,
          attributes: {
            For: `${t.name} cards`,
            _Reference: ref,
            ...(envOrder.kind !== 'blank' ? { '_Envelopes file': designFileUrl(id, 'envelopes') } : {}),
          },
        })
      if (rushVariant) items.push({ variantId: rushVariant.id, quantity: 1, attributes: { For: t.name, _Reference: ref } })
      // Where the order came from, shown on the Shopify order under Additional details.
      const click = adClick()
      const orderAttrs: Record<string, string> = {
        ...(!tracking.enabled ? {} : isKioskVisit() ? { source: 'kiosk' } : { ...(click ?? {}) }),
        // Funeral home portal: shows on the order, the job board and the home's order list.
        ...(home ? { 'Funeral home': home.name, '_Home ID': home.slug, ...(draft.values.__case ? { '_Case ID': draft.values.__case } : {}) } : {}),
      }
      const checkoutUrl = await addToCart(shop, items, orderAttrs)
      const gaItems = [
        { item_id: variant.id, item_name: t.name, item_variant: summary, price: variant.price, quantity: 1 },
        ...(env && envOrder ? [{ item_id: envOrder.variant.id, item_name: `${t.envelope?.label ?? 'Envelope'}s`, price: envOrder.variant.price, quantity: envOrder.count }] : []),
        ...(rushVariant ? [{ item_id: rushVariant.id, item_name: 'Rush turnaround', price: rushVariant.price, quantity: 1 }] : []),
      ]
      const value = Math.round(total * 100) / 100
      track('proof_approved', { template: t.id, value, currency: 'USD' })
      track('add_to_cart', { currency: 'USD', value, items: gaItems })
      track('begin_checkout', { currency: 'USD', value, items: gaItems })
      // GA4 holds events for a few seconds; send them now, before leaving for checkout.
      await flushAnalytics()
      rememberDesign({ id, templateId: t.id, name: t.name, ref, summary, savedAt: new Date().toISOString(), thumb })
      setWork('Opening checkout')
      // On the shop kiosk, nothing of this customer's stays behind for the next one.
      if (isKiosk()) await clearAllDrafts()
      window.location.href = withLinker(checkoutUrl)
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
              <p className="ed-hint">{missingPhotos ? 'Go back and add a photo to every spot before approving.' : 'You can still approve, or go back and fix them.'}</p>
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
                {envOrder!.count} {envOrder!.kind === 'blank' ? 'blank' : envOrder!.kind === 'return' ? 'return address' : 'addressed'} {t.envelope!.label}s
                {envVariant ? `, ${money(envVariant.price * envOrder!.count)}` : ''}.
                {envOrder!.kind === 'addressed' && env.recipients[0] ? ` First one: ${env.recipients[0].join(', ')}` : ''}
                {envOrder!.kind === 'return' ? ` Return address: ${env.returnAddress.split('\n').filter(Boolean).join(', ')}` : ''}
              </p>
            </section>
          )}

          {!variant && (
            <p className="ed-proof-note">
              {orderStatus ?? 'Online ordering opens soon.'} To order this design now, call us at <a href={phoneHref}>{phone}</a>.
            </p>
          )}
          {staff && savedForStaff && (
            <p className="ed-proof-note" role="status">
              Saved. The print file, proof and saved design on order {staff.order} now include your changes. The customer's approved original is kept as a backup.
            </p>
          )}
          {error && <p className="ed-error" role="alert">{error}</p>}
        </div>
      </div>

      <div className="ed-proof-bar">
        <p className="mono" aria-live="polite">
          {work ?? (missingPhotos ? 'Add your photos to continue' : allChecked ? `Ready / ${summary}` : `${checked.filter(Boolean).length} of ${CHECKS.length} checked`)}
        </p>
        {staff ? (
          savedForStaff ? (
            <a className="btn btn-primary" href="/staff/">
              Saved. Back to the job board
            </a>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!!work} onClick={saveForStaff}>
              {work ? 'Working...' : `Save print file for order ${staff.order}`}
            </button>
          )
        ) : (
          <button type="button" className="btn btn-primary" disabled={!allChecked || missingPhotos || (!variant && !prototype) || !!work} onClick={approve}>
            {prototype ? `Send for proof${variant ? ` ${money(total)}` : ''}` : work ? 'Working...' : variant ? `Approve & checkout ${money(total)}` : 'Approve proof'}
          </button>
        )}
      </div>
      {sent && (
        <div className="ed-sent" role="dialog" aria-modal="true" aria-label="What would be sent">
          <div className="ed-sent-in">
            <p className="mono">Prototype / nothing was sent</p>
            <h2>This is what would go to the shop</h2>
            <dl>
              <dt>Product</dt>
              <dd>{t.category === 'funeral-programs' ? 'Funeral program' : t.category === 'christmas-cards' ? 'Christmas card' : t.category}</dd>
              <dt>Size</dt>
              <dd>{t.sizeLabel}</dd>
              <dt>Design</dt>
              <dd>{t.name}</dd>
              <dt>Options</dt>
              <dd>{summary || 'Not chosen'}</dd>
              <dt>Total</dt>
              <dd>{variant ? money(total) : 'Price not loaded'}</dd>
              <dt>Photos</dt>
              <dd>
                {Object.keys(draft.photos).length} added
                {Object.values(draft.photos).some((p) => p.tone === 'bw') ? ', some in black and white' : ''}
              </dd>
              {t.fields
                .filter((f) => f.type !== 'photo' && (draft.values[f.id] ?? '').trim())
                .map((f) => (
                  <Fragment key={f.id}>
                    <dt>{f.label}</dt>
                    <dd>{draft.values[f.id]}</dd>
                  </Fragment>
                ))}
            </dl>
            <div className="ed-sent-actions">
              <button type="button" className="ed-btn ed-btn-ghost" onClick={() => setSent(false)}>
                Back to the proof
              </button>
              <a className="btn btn-primary" href="/prototype/">
                Start another order
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Kiosk only: after a few idle minutes, ask whether the customer is still
 * there, then clear their work and go back to the kiosk start screen.
 */
function KioskIdle() {
  const [left, setLeft] = useState<number | null>(null)
  const last = useRef(Date.now())
  useEffect(() => {
    const touch = () => {
      last.current = Date.now()
      setLeft(null)
    }
    const events = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }))
    const tick = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000
      if (idle < IDLE_SECONDS) return
      const remaining = Math.ceil(IDLE_SECONDS + WARN_SECONDS - idle)
      if (remaining > 0) return setLeft(remaining)
      clearInterval(tick)
      clearAllDrafts().finally(() => window.location.replace(`${KIOSK_HOME}?attract`))
    }, 1000)
    return () => {
      clearInterval(tick)
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }))
    }
  }, [])
  if (left == null) return null
  return (
    <div className="ed-idle" role="alertdialog" aria-modal="true" aria-label="Are you still there?">
      <div className="ed-idle-box">
        <p className="ed-idle-h">Still working on this?</p>
        <p>To keep things private, this design clears in {left} second{left === 1 ? '' : 's'}.</p>
        <button type="button" className="btn btn-primary">Keep going</button>
      </div>
    </div>
  )
}

/** Same-day shipping countdown, refreshed every 30 seconds. */
function ShipLine({ rush }: { rush: boolean }) {
  const [s, setS] = useState(() => shipStatus({ rush }))
  useEffect(() => {
    setS(shipStatus({ rush }))
    const id = setInterval(() => setS(shipStatus({ rush })), 30_000)
    return () => clearInterval(id)
  }, [rush])
  return <p className={`ed-ship ${s.today ? 'is-today' : ''}`}>{s.text}</p>
}
