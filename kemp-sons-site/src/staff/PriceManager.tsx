import { useCallback, useEffect, useMemo, useState } from 'react'
import { SignIn } from './StaffBoard'
import './staff.css'

/**
 * Prices & shipping. Every product price, the shipping rates and the pickup
 * settings in one place. Saving writes straight to Shopify, which the
 * website, the designer and checkout read live.
 */

interface Variant {
  id: string
  price: number
  options: Record<string, string>
}
interface Product {
  id: string
  title: string
  handle: string
  type: string
  options: string[]
  variants: Variant[]
}
interface Shipping {
  standard: number
  freeOver: number | null
  express: number | null
}
interface Pickup {
  pickupTime: string
  instructions: string
}
interface Data {
  products: Product[]
  shipping: Shipping
  pickup: Pickup | null
}

const PICKUP_LABELS: Record<string, string> = {
  ONE_HOUR: 'Usually ready in 1 hour',
  TWO_HOURS: 'Usually ready in 2 hours',
  FOUR_HOURS: 'Usually ready in 4 hours',
  TWENTY_FOUR_HOURS: 'Usually ready in 24 hours',
  TWO_TO_FOUR_DAYS: 'Usually ready in 2 to 4 days',
  FIVE_OR_MORE_DAYS: 'Usually ready in 5 or more days',
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/[$,\s]/g, '')))
/** Same option names and values, so prices can be copied cell for cell. */
const shapeOf = (p: Product) => p.options.join('|') + '::' + p.variants.map((v) => p.options.map((o) => v.options[o]).join('/')).sort().join(',')

export default function PriceManager() {
  const [state, setState] = useState<'loading' | 'signin' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Data | null>(null)
  /** Edited prices by variant id, as typed. */
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [ship, setShip] = useState<Shipping | null>(null)
  const [pickup, setPickup] = useState<Pickup | null>(null)
  const [filter, setFilter] = useState('')
  const [review, setReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const apply = (d: Data) => {
    setData(d)
    setShip(d.shipping)
    setPickup(d.pickup)
    setEdits({})
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/staff/prices', { credentials: 'same-origin' })
      if (res.status === 401) return setState('signin')
      const body = await res.json().catch(() => ({ error: 'The prices service is not reachable right now.' }))
      if (!res.ok || body.error) throw new Error(body.error ?? `Error ${res.status}`)
      apply(body)
      setState('ready')
    } catch (e) {
      setError((e as Error).message)
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 7000)
    return () => clearTimeout(t)
  }, [toast])

  // Warn before leaving with unsaved changes.
  const dirty = useMemo(() => {
    if (!data || !ship) return false
    return (
      Object.keys(edits).length > 0 ||
      JSON.stringify(ship) !== JSON.stringify(data.shipping) ||
      JSON.stringify(pickup) !== JSON.stringify(data.pickup)
    )
  }, [edits, ship, pickup, data])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  if (state === 'loading') return <p className="sb-center mono">Loading prices...</p>
  if (state === 'signin') return <SignIn onDone={load} />
  if (state === 'error' || !data || !ship)
    return (
      <div className="sb-center">
        <p className="sub">Prices can't load right now.</p>
        <p>{error}</p>
        <button className="sb-btn" onClick={load}>Try again</button>
      </div>
    )

  const priceChanges = Object.entries(edits)
    .map(([variantId, raw]) => {
      const product = data.products.find((p) => p.variants.some((v) => v.id === variantId))!
      const v = product.variants.find((x) => x.id === variantId)!
      return { product, v, next: num(raw) }
    })
    .filter((c) => Number.isFinite(c.next) && Math.round(c.next * 100) !== Math.round(c.v.price * 100))
  const invalid = Object.entries(edits).filter(([, raw]) => !Number.isFinite(num(raw)) || num(raw) < 0.5)
  const shipChanged = JSON.stringify(ship) !== JSON.stringify(data.shipping)
  const pickupChanged = JSON.stringify(pickup) !== JSON.stringify(data.pickup)
  const changeCount = priceChanges.length + (shipChanged ? 1 : 0) + (pickupChanged ? 1 : 0)
  const unusual = priceChanges.filter((c) => c.next < 5 || Math.abs(c.next - c.v.price) / c.v.price > 0.5)

  const groups = new Map<string, Product[]>()
  for (const p of data.products) {
    if (filter && !p.title.toLowerCase().includes(filter.toLowerCase())) continue
    const g = p.type || 'Other'
    groups.set(g, [...(groups.get(g) ?? []), p])
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/staff/prices', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variants: priceChanges.map((c) => ({ productId: c.product.id, variantId: c.v.id, price: c.next })),
          shipping: shipChanged ? ship : undefined,
          pickup: pickupChanged ? pickup : undefined,
        }),
      })
      if (res.status === 401) return setState('signin')
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      apply(body)
      setReview(false)
      setToast(`${body.message} The website and checkout show the new prices now.`)
    } catch (e) {
      setToast(`Not saved: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const copyTo = (from: Product, toId: string) => {
    const to = data.products.find((p) => p.id === toId)
    if (!to) return
    const key = (v: Variant, p: Product) => p.options.map((o) => v.options[o]).join('/')
    setEdits((prev) => {
      const next = { ...prev }
      for (const tv of to.variants) {
        const fv = from.variants.find((v) => key(v, from) === key(tv, to))
        if (!fv) continue
        const val = prev[fv.id] ?? fv.price.toFixed(2)
        if (num(val) === tv.price) delete next[tv.id]
        else next[tv.id] = val
      }
      return next
    })
    setToast(`Copied ${from.title} prices. Review and save to keep them.`)
  }

  return (
    <div className="sb pm">
      <header className="sb-top">
        <div className="sb-brand">
          <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons" width="72" height="48" />
          <div>
            <p className="mono">Staff / Prices</p>
            <h1>Prices &amp; shipping</h1>
          </div>
        </div>
        <input className="sb-search" type="search" placeholder="Find a product" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a product" />
        <div className="sb-meta">
          <a className="sb-btn sb-navlink" href="/staff/">Job board</a>
        </div>
      </header>

      <main className="pm-main">
        <p className="pm-intro">
          Change any price and press <strong>Review &amp; save</strong>. Saved prices show on the website, in the designer and at checkout right away.
        </p>

        <section className="pm-card">
          <h2>Shipping &amp; pickup</h2>
          <div className="pm-ship">
            <label className="pm-field">
              <span>Standard shipping</span>
              <Money value={ship.standard} onChange={(n) => setShip({ ...ship, standard: n })} />
            </label>
            <div className="pm-field">
              <label className="pm-check">
                <input type="checkbox" checked={ship.freeOver != null} onChange={(e) => setShip({ ...ship, freeOver: e.target.checked ? 70 : null })} />
                <span>Free shipping on orders of</span>
              </label>
              {ship.freeOver != null && <Money value={ship.freeOver} onChange={(n) => setShip({ ...ship, freeOver: n })} suffix="or more" />}
            </div>
            <div className="pm-field">
              <label className="pm-check">
                <input type="checkbox" checked={ship.express != null} onChange={(e) => setShip({ ...ship, express: e.target.checked ? 15 : null })} />
                <span>Offer express shipping</span>
              </label>
              {ship.express != null && <Money value={ship.express} onChange={(n) => setShip({ ...ship, express: n })} />}
            </div>
            {pickup && (
              <>
                <label className="pm-field">
                  <span>Local pickup ready time</span>
                  <select className="sb-input" value={pickup.pickupTime} onChange={(e) => setPickup({ ...pickup, pickupTime: e.target.value })}>
                    {Object.entries(PICKUP_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="pm-field pm-wide">
                  <span>Pickup instructions (shown at checkout and in the pickup email)</span>
                  <textarea className="sb-input" rows={2} value={pickup.instructions} onChange={(e) => setPickup({ ...pickup, instructions: e.target.value })} />
                </label>
              </>
            )}
          </div>
        </section>

        {[...groups.entries()].map(([group, products]) => (
          <section key={group} className="pm-group">
            <h2 className="pm-group-h">{group}</h2>
            {products.map((p) => (
              <ProductPrices
                key={p.id}
                p={p}
                edits={edits}
                setEdit={(id, raw) =>
                  setEdits((e) => {
                    const v = p.variants.find((x) => x.id === id)!
                    const n = { ...e }
                    if (num(raw) === v.price) delete n[id]
                    else n[id] = raw
                    return n
                  })
                }
                siblings={data.products.filter((o) => o.id !== p.id && shapeOf(o) === shapeOf(p))}
                onCopy={(toId) => copyTo(p, toId)}
              />
            ))}
          </section>
        ))}
      </main>

      <div className={`pm-bar ${changeCount || invalid.length ? 'is-on' : ''}`}>
        <span className="mono">
          {invalid.length ? `${invalid.length} price${invalid.length === 1 ? ' needs' : 's need'} fixing (minimum $0.50)` : `${changeCount} unsaved change${changeCount === 1 ? '' : 's'}`}
        </span>
        <button type="button" className="sb-btn sb-btn-ghost" onClick={() => apply(data)}>
          Undo all
        </button>
        <button type="button" className="sb-btn sb-btn-go" disabled={!changeCount || invalid.length > 0} onClick={() => setReview(true)}>
          Review &amp; save
        </button>
      </div>

      {review && (
        <div className="sb-overlay" onClick={() => !saving && setReview(false)}>
          <aside className="sb-detail" role="dialog" aria-modal="true" aria-label="Review changes" onClick={(e) => e.stopPropagation()}>
            <header className="sb-detail-h">
              <h2>Review changes</h2>
              <button type="button" className="sb-btn sb-btn-ghost" onClick={() => setReview(false)} disabled={saving}>
                Close
              </button>
            </header>
            {unusual.length > 0 && (
              <p className="sb-error" style={{ margin: 0 }}>
                {unusual.length} change{unusual.length === 1 ? ' looks' : 's look'} unusual (under $5, or more than 50% different). Double-check {unusual.length === 1 ? 'it' : 'them'} below.
              </p>
            )}
            {shipChanged && (
              <section className="sb-block">
                <h3>Shipping</h3>
                <p>Standard: {money(data.shipping.standard)} to <strong>{money(ship.standard)}</strong></p>
                <p>Free shipping: {data.shipping.freeOver != null ? `over ${money(data.shipping.freeOver)}` : 'off'} to <strong>{ship.freeOver != null ? `over ${money(ship.freeOver)}` : 'off'}</strong></p>
                <p>Express: {data.shipping.express != null ? money(data.shipping.express) : 'off'} to <strong>{ship.express != null ? money(ship.express) : 'off'}</strong></p>
              </section>
            )}
            {pickupChanged && pickup && (
              <section className="sb-block">
                <h3>Pickup</h3>
                <p>{PICKUP_LABELS[pickup.pickupTime]}</p>
                <p>{pickup.instructions}</p>
              </section>
            )}
            {priceChanges.length > 0 && (
              <section className="sb-block">
                <h3>Prices ({priceChanges.length})</h3>
                <ul className="pm-changes">
                  {priceChanges.map((c) => (
                    <li key={c.v.id} className={unusual.includes(c) ? 'is-warn' : ''}>
                      <span>
                        {c.product.title}
                        <span className="mono"> {Object.values(c.v.options).join(' / ')}</span>
                      </span>
                      <span>
                        {money(c.v.price)} to <strong>{money(c.next)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button type="button" className="sb-btn sb-btn-go" disabled={saving} onClick={save}>
              {saving ? 'Saving...' : `Save ${changeCount} change${changeCount === 1 ? '' : 's'}`}
            </button>
          </aside>
        </div>
      )}
      {toast && <div className="sb-toast" role="status">{toast}</div>}
    </div>
  )
}

function Money({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [raw, setRaw] = useState(value.toFixed(2))
  useEffect(() => setRaw(value.toFixed(2)), [value])
  return (
    <span className="pm-money">
      <span>$</span>
      <input
        className="sb-input"
        inputMode="decimal"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          const n = num(e.target.value)
          if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100)
        }}
      />
      {suffix && <span className="mono">{suffix}</span>}
    </span>
  )
}

function ProductPrices({
  p,
  edits,
  setEdit,
  siblings,
  onCopy,
}: {
  p: Product
  edits: Record<string, string>
  setEdit: (id: string, raw: string) => void
  siblings: Product[]
  onCopy: (toId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const changed = p.variants.filter((v) => v.id in edits).length
  const [rowOpt, ...colOpts] = p.options
  const rows = rowOpt ? [...new Set(p.variants.map((v) => v.options[rowOpt]))] : ['']
  const cols = [...new Set(p.variants.map((v) => colOpts.map((o) => v.options[o]).join(' / ')))]
  const cell = (r: string, c: string) => p.variants.find((v) => (rowOpt ? v.options[rowOpt] === r : true) && colOpts.map((o) => v.options[o]).join(' / ') === c)
  const min = Math.min(...p.variants.map((v) => v.price))
  return (
    <article className={`pm-product ${open ? 'is-open' : ''}`}>
      <button type="button" className="pm-product-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pm-title">{p.title}</span>
        <span className="mono">
          {changed ? <span className="pm-dot">{changed} changed</span> : `From ${money(min)}`} / {p.variants.length} price{p.variants.length === 1 ? '' : 's'}
        </span>
        <span aria-hidden="true">{open ? 'Close' : 'Edit'}</span>
      </button>
      {open && (
        <div className="pm-body">
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>{rowOpt ?? ''}</th>
                  {cols.map((c) => (
                    <th key={c}>{c || 'Price'}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r}>
                    <th>{r}</th>
                    {cols.map((c) => {
                      const v = cell(r, c)
                      if (!v) return <td key={c} />
                      const raw = edits[v.id] ?? v.price.toFixed(2)
                      const bad = v.id in edits && (!Number.isFinite(num(raw)) || num(raw) < 0.5)
                      return (
                        <td key={c}>
                          <span className={`pm-money ${v.id in edits ? 'is-changed' : ''} ${bad ? 'is-bad' : ''}`}>
                            <span>$</span>
                            <input className="sb-input" inputMode="decimal" aria-label={`${p.title} ${r} ${c}`} value={raw} onChange={(e) => setEdit(v.id, e.target.value)} />
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {siblings.length > 0 && (
            <label className="pm-copy">
              <span className="mono">Use these prices for</span>
              <select
                className="sb-input"
                value=""
                onChange={(e) => {
                  if (e.target.value === '*') siblings.forEach((s) => onCopy(s.id))
                  else if (e.target.value) onCopy(e.target.value)
                }}
              >
                <option value="">Choose a product...</option>
                <option value="*">All {siblings.length} products with the same options</option>
                {siblings.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </article>
  )
}
