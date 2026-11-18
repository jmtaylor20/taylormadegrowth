import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { TEMPLATES } from '../editor/templates'
import TemplateThumb from '../editor/TemplateThumb'
import { renderPreviewSides } from '../editor/render'
import { getProduct, money, type ShopConfig } from '../editor/shop'
import { PRICE_GROUPS } from '../../netlify/lib/price-groups'
import type { Template } from '../editor/types'
import './start.css'

/**
 * "Start an order" (/start/): two ways in.
 *   I know what I need  -> product -> size -> only the designs for that size
 *   Show me designs     -> one visual gallery with product and size filters
 * Both open the designer (/design/<id>/), which starts in simple mode.
 *
 * Reads the same templates and live store prices as the rest of the site.
 * Where you are is kept in the URL hash, so Back works and links can be shared.
 */

interface Product {
  id: Template['category']
  name: string
  blurb: string
}

const PRODUCTS: Product[] = [
  { id: 'funeral-programs', name: 'Funeral programs', blurb: 'Folded programs, trifolds and booklets' },
  { id: 'christmas-cards', name: 'Christmas cards', blurb: 'Photo cards, one or two sides' },
  { id: 'thank-you-cards', name: 'Thank you cards', blurb: 'Sympathy, weddings and showers' },
  { id: 'business-cards', name: 'Business cards', blurb: 'Standard 3.5 x 2 cards' },
  { id: 'stickers', name: 'Stickers', blurb: 'Sheets of 3-inch circles' },
]

/** Plain-words names for each printed format (price group), in the order customers think of them. */
const FORMAT_INFO: Record<string, { name: string; finished: string }> = {
  'program-11x8.5-fold': { name: 'Single fold', finished: 'Folds to 5.5 x 8.5 in' },
  'program-11x8.5-stagger': { name: 'Stagger fold', finished: 'Folds to 6 x 8.5 in' },
  'program-16.5x8.5-trifold': { name: 'Trifold', finished: 'Folds to 5.5 x 8.5 in' },
  'program-14x8.5-trifold': { name: 'Narrow trifold', finished: 'Folds to 4.67 x 8.5 in' },
  'program-17x11-fold': { name: 'Large fold', finished: 'Folds to 8.5 x 11 in' },
  'program-17x11-trifold': { name: 'Large trifold', finished: 'Folds to 5.67 x 11 in' },
  'program-booklet-8': { name: '8-page booklet', finished: '8.5 x 11 in pages' },
  'card-5x7-1side': { name: 'Photo card, one side', finished: '5 x 7 in flat' },
  'card-5x7-2side': { name: 'Photo card, two sides', finished: '7 x 5 in flat' },
}
const FORMAT_ORDER = Object.keys(FORMAT_INFO)

const formatOf = (t: Template) => PRICE_GROUPS.find((g) => g.handles.includes(t.shopifyHandle))?.id ?? t.id

interface Format {
  id: string
  name: string
  finished: string
  product: Template['category']
  templates: Template[]
}

function buildFormats(): Format[] {
  const map = new Map<string, Format>()
  for (const t of TEMPLATES) {
    const id = formatOf(t)
    const info = FORMAT_INFO[id] ?? { name: t.sizeLabel, finished: '' }
    if (!map.has(id)) map.set(id, { id, ...info, product: t.category, templates: [] })
    map.get(id)!.templates.push(t)
  }
  return [...map.values()].sort((a, b) => (FORMAT_ORDER.indexOf(a.id) + 1 || 99) - (FORMAT_ORDER.indexOf(b.id) + 1 || 99))
}

/** Starting price per format, from the live store (one lookup per format). */
function usePrices(shop: ShopConfig | null, formats: Format[]) {
  const [prices, setPrices] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!shop) return
    let alive = true
    for (const f of formats)
      getProduct(shop, f.templates[0].shopifyHandle)
        .then((p) => {
          const min = p ? Math.min(...p.variants.filter((v) => v.available).map((v) => v.price)) : NaN
          if (alive && Number.isFinite(min)) setPrices((m) => ({ ...m, [f.id]: min }))
        })
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [shop, formats])
  return prices
}

/** Route kept in the hash: "", "size/<product>", "designs/<product>/<format>", "browse[/<product>[/<format>]]". */
function useRoute(): [string[], (path: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [route, setRoute] = useState(read)
  // Remembered so Back in the designer returns to this exact step.
  useEffect(() => {
    try {
      sessionStorage.setItem('kemp-start', window.location.href)
    } catch {
      /* private window */
    }
  }, [route])
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return [route, (path: string) => (window.location.hash = path ? `#${path}` : '')]
}

export default function StartApp({ shop, phone, phoneHref }: { shop: ShopConfig | null; phone: string; phoneHref: string }) {
  const formats = useMemo(buildFormats, [])
  const prices = usePrices(shop, formats)
  const [route, go] = useRoute()
  const [preview, setPreview] = useState<Template | null>(null)
  const [mode, product, format] = route

  const from = (f: Format) => (prices[f.id] != null ? `From ${money(prices[f.id])}` : '')
  const productName = (id?: string) => PRODUCTS.find((p) => p.id === id)?.name ?? ''
  const fmt = formats.find((f) => f.id === format)

  return (
    <div className="pt">
      {/* ---------- Doors ---------- */}
      {!mode && (
        <section className="pt-doors">
          <p className="pt-kicker mono">Start an order</p>
          <h1>How would you like to start?</h1>
          <div className="pt-door-row">
            <button type="button" className="pt-door" onClick={() => go('size')}>
              <span className="pt-door-art" aria-hidden="true">
                <SizesArt />
              </span>
              <span className="pt-door-title">I know what I need</span>
              <span className="pt-door-line">Pick your product and size first.</span>
            </button>
            <button type="button" className="pt-door" onClick={() => go('browse')}>
              <span className="pt-door-art is-designs" aria-hidden="true">
                {['very-merry-three-photo', 'funeral-flag-trifold', 'christmas-pine-garland'].map((id) => (
                  <span key={id} className="pt-door-thumb">
                    <TemplateThumb id={id} fit="contain" samples />
                  </span>
                ))}
              </span>
              <span className="pt-door-title">Show me designs</span>
              <span className="pt-door-line">Browse and pick a look you like.</span>
            </button>
          </div>
          <p className="pt-help">
            Not sure? Call us at <a href={phoneHref}>{phone}</a> and we'll help you choose.
          </p>
        </section>
      )}

      {/* ---------- Path A ---------- */}
      {mode === 'size' && !product && (
        <Step crumbs={[['Start', '']]} title="What are you printing?" go={go}>
          <div className="pt-products">
            {PRODUCTS.map((p) => {
              const n = TEMPLATES.filter((t) => t.category === p.id).length
              return n ? (
                <button key={p.id} type="button" className="pt-product" onClick={() => go(`size/${p.id}`)}>
                  <span className="pt-product-name">{p.name}</span>
                  <span className="pt-product-line">{p.blurb}</span>
                  <span className="pt-product-count mono">
                    {n} design{n === 1 ? '' : 's'} &rarr;
                  </span>
                </button>
              ) : (
                <div key={p.id} className="pt-product is-soon">
                  <span className="pt-product-name">{p.name}</span>
                  <span className="pt-product-line">Online designs are on the way.</span>
                  <a className="pt-product-count mono" href={phoneHref}>
                    Call to order
                  </a>
                </div>
              )
            })}
          </div>
        </Step>
      )}

      {mode === 'size' && product && (
        <Step crumbs={[['Start', ''], ['Product', 'size'], [productName(product), `size/${product}`]]} title="Pick a size" go={go}>
          <div className="pt-sizes">
            {formats
              .filter((f) => f.product === product)
              .map((f) => (
                <button key={f.id} type="button" className="pt-size" onClick={() => go(`designs/${product}/${f.id}`)}>
                  <Outline t={f.templates[0]} />
                  <span className="pt-size-name">{f.name}</span>
                  <span className="pt-size-line">{f.finished}</span>
                  <span className="pt-size-meta mono">
                    {f.templates.length} design{f.templates.length === 1 ? '' : 's'}
                    {from(f) && ` / ${from(f)}`}
                  </span>
                </button>
              ))}
          </div>
        </Step>
      )}

      {mode === 'designs' && fmt && (
        <Step
          crumbs={[['Start', ''], ['Product', 'size'], [productName(product), `size/${product}`], [fmt.name, `designs/${product}/${fmt.id}`]]}
          title={`${fmt.name} designs`}
          sub={`${fmt.finished}${from(fmt) ? `. ${from(fmt)}.` : '.'}`}
          go={go}
        >
          <Designs templates={fmt.templates} formatName={() => fmt.name} price={() => from(fmt)} onPick={setPreview} />
        </Step>
      )}

      {/* ---------- Path B ---------- */}
      {mode === 'browse' && (
        <Step crumbs={[['Start', '']]} title="All designs" sub="Tap a design to see it up close." go={go}>
          <div className="pt-chips" role="group" aria-label="Product">
            <Chip on={!product} onClick={() => go('browse')}>
              All
            </Chip>
            {PRODUCTS.filter((p) => TEMPLATES.some((t) => t.category === p.id)).map((p) => (
              <Chip key={p.id} on={product === p.id} onClick={() => go(`browse/${p.id}`)}>
                {p.name}
              </Chip>
            ))}
          </div>
          {product && (
            <div className="pt-chips is-sizes" role="group" aria-label="Size">
              <Chip on={!format} onClick={() => go(`browse/${product}`)}>
                Any size
              </Chip>
              {formats
                .filter((f) => f.product === product)
                .map((f) => (
                  <Chip key={f.id} on={format === f.id} onClick={() => go(`browse/${product}/${f.id}`)}>
                    {f.name}
                  </Chip>
                ))}
            </div>
          )}
          <Designs
            templates={TEMPLATES.filter((t) => (!product || t.category === product) && (!format || formatOf(t) === format))}
            formatName={(t) => formats.find((f) => f.id === formatOf(t))?.name ?? t.sizeLabel}
            price={(t) => {
              const f = formats.find((x) => x.id === formatOf(t))
              return f ? from(f) : ''
            }}
            onPick={setPreview}
          />
        </Step>
      )}

      {preview && <Preview t={preview} formatName={formats.find((f) => f.id === formatOf(preview))?.name ?? ''} onClose={() => setPreview(null)} />}
    </div>
  )
}

function Step({ crumbs, title, sub, go, children }: { crumbs: [string, string][]; title: string; sub?: string; go: (p: string) => void; children: React.ReactNode }) {
  const back = crumbs[crumbs.length - 2] ?? crumbs[0]
  return (
    <section className="pt-step">
      <nav className="pt-crumbs" aria-label="Where you are">
        <button type="button" className="pt-back" onClick={() => go(back[1])}>
          &larr; Back
        </button>
        <ol>
          {crumbs.map(([label, path], i) => (
            <li key={path + i}>
              {i < crumbs.length - 1 ? (
                <button type="button" onClick={() => go(path)}>
                  {label}
                </button>
              ) : (
                <span aria-current="page">{label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <h1>{title}</h1>
      {sub && <p className="pt-sub">{sub}</p>}
      {children}
    </section>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`pt-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

function Designs({ templates, formatName, price, onPick }: { templates: Template[]; formatName: (t: Template) => string; price: (t: Template) => string; onPick: (t: Template) => void }) {
  if (!templates.length) return <p className="pt-sub">No designs in this size yet.</p>
  return (
    <div className="pt-designs">
      {templates.map((t) => {
        const crop = t.thumbnailCrop ?? t.trim
        return (
          <button key={t.id} type="button" className="pt-design" onClick={() => onPick(t)}>
            <span className="pt-design-art">
              <span className="pt-design-frame" style={{ aspectRatio: `${crop.w} / ${crop.h}`, ...(crop.w > crop.h ? { width: '92%' } : { height: '92%' }) }}>
                <TemplateThumb id={t.id} fit="cover" samples />
              </span>
            </span>
            <span className="pt-design-name">{t.name}</span>
            <span className="pt-design-meta mono">
              {formatName(t)}
              {price(t) && ` / ${price(t)}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Bigger look at every side, then "Use this design". */
function Preview({ t, formatName, onClose }: { t: Template; formatName: string; onClose: () => void }) {
  const [sides, setSides] = useState<{ id: string; label: string; src: string }[] | null>(null)
  useEffect(() => {
    let alive = true
    renderPreviewSides(t, 1000).then((s) => alive && setSides(s))
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => {
      alive = false
      document.body.style.overflow = prev
      window.removeEventListener('keydown', esc)
    }
  }, [t])
  // Attached to <body> so it sits above the site header.
  return createPortal(
    <div className="pt-preview" role="dialog" aria-modal="true" aria-label={`${t.name} preview`} onClick={onClose}>
      <div className="pt-preview-in" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p className="mono">{formatName}</p>
            <h2>{t.name}</h2>
          </div>
          <button type="button" className="pt-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>
        <p className="pt-sub">{t.description}</p>
        <div className="pt-preview-sides">
          {sides
            ? sides.map((s) => (
                <figure key={s.id}>
                  <img src={s.src} alt={`${t.name}, ${s.label}`} />
                  <figcaption className="mono">{s.label}</figcaption>
                </figure>
              ))
            : <p className="pt-sub">Drawing the preview...</p>}
        </div>
        <div className="pt-preview-bar">
          <span className="mono">{t.sizeLabel}</span>
          <a className="btn btn-primary" href={`/design/${t.id}/`}>
            Use this design <span className="arrow" aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** The flat sheet at true proportion, with its folds dashed. */
function Outline({ t }: { t: Template }) {
  const side = t.sides[0]
  const W = 120, H = 90
  const k = Math.min(W / t.trim.w, H / t.trim.h)
  const w = t.trim.w * k, h = t.trim.h * k
  const x = (W - w) / 2, y = (H - h) / 2
  return (
    <svg className="pt-outline" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} />
      {(side.folds ?? []).map((f) => (
        <line key={f} x1={x + f * k} x2={x + f * k} y1={y} y2={y + h} />
      ))}
    </svg>
  )
}

function SizesArt() {
  return (
    <svg viewBox="0 0 160 100" className="pt-sizes-art">
      <rect x="8" y="22" width="56" height="70" />
      <line x1="36" x2="36" y1="22" y2="92" />
      <rect x="74" y="8" width="44" height="62" />
      <rect x="126" y="40" width="28" height="18" />
    </svg>
  )
}
