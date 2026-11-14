import { useCallback, useEffect, useMemo, useState } from 'react'
import { SignIn } from './StaffBoard'
import './staff.css'

/**
 * Prices & shipping. Prices are set per printed format (every design in the
 * format shares one table), each format has a weight per piece, and shipping
 * is charged by order weight. Saving writes straight to Shopify, which the
 * website, the designer and checkout read live.
 */

interface Variant {
  id: string
  price: number
  options: Record<string, string>
}
interface Group {
  id: string
  label: string
  type: string
  designs: string[]
  options: string[]
  variants: Variant[]
  inSync: boolean
  weightKeys: string[]
  weights: Record<string, number>
  hasQuantity: boolean
}
interface Rate {
  upToLb: number | null
  standard: number
  express: number | null
}
interface Pickup {
  pickupTime: string
  instructions: string
}
interface Data {
  groups: Group[]
  shipping: { rates: Rate[] }
  packagingOz: number
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
const lbText = (n: number) => `${Math.round(n * 10) / 10} lb`
const quantityOf = (g: Group, v: Variant) => {
  const q = g.options.find((o) => /quantity|qty/i.test(o))
  return q ? parseInt((v.options[q] ?? '').replace(/,/g, ''), 10) || 1 : 1
}
const paperOf = (g: Group, v: Variant) => {
  const p = g.options.find((o) => /paper|stock/i.test(o))
  return p ? v.options[p] : 'Each'
}
const bandName = (rates: Rate[], i: number) =>
  rates.length === 1
    ? 'Any weight'
    : i === rates.length - 1
      ? `Over ${rates[i - 1].upToLb ?? 0} lb`
      : `${i === 0 ? 0 : rates[i - 1].upToLb} to ${rates[i].upToLb} lb`

export default function PriceManager() {
  const [state, setState] = useState<'loading' | 'signin' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Data | null>(null)
  /** Edited prices by group variant id, as typed. */
  const [edits, setEdits] = useState<Record<string, string>>({})
  /** Edited piece weights by `groupId|weightKey`, in ounces, as typed. */
  const [wEdits, setWEdits] = useState<Record<string, string>>({})
  const [packOz, setPackOz] = useState(0)
  const [rates, setRates] = useState<Rate[]>([])
  const [pickup, setPickup] = useState<Pickup | null>(null)
  const [filter, setFilter] = useState('')
  const [review, setReview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const apply = (d: Data) => {
    setData(d)
    setRates(d.shipping.rates)
    setPackOz(d.packagingOz)
    setPickup(d.pickup)
    setEdits({})
    setWEdits({})
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

  const shipChanged = !!data && JSON.stringify(rates) !== JSON.stringify(data.shipping.rates)
  const pickupChanged = !!data && JSON.stringify(pickup) !== JSON.stringify(data.pickup)
  const weightsChanged = !!data && (Object.keys(wEdits).length > 0 || packOz !== data.packagingOz)

  const dirty = Object.keys(edits).length > 0 || shipChanged || pickupChanged || weightsChanged
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  /** Piece weight in effect for a group and paper (edited or saved), or null. */
  const pieceOz = useCallback(
    (g: Group, key: string) => {
      const raw = wEdits[`${g.id}|${key}`]
      const n = raw != null ? num(raw) : (g.weights[key] ?? NaN)
      return Number.isFinite(n) && n > 0 ? n : null
    },
    [wEdits],
  )

  const bandErrors = useMemo(() => {
    const errs: string[] = []
    rates.forEach((r, i) => {
      if (i < rates.length - 1 && !(r.upToLb != null && r.upToLb > 0)) errs.push(`Band ${i + 1} needs an upper weight`)
      else if (i > 0 && i < rates.length - 1 && rates[i - 1].upToLb != null && r.upToLb! <= rates[i - 1].upToLb!) errs.push(`Band ${i + 1} must be heavier than band ${i}`)
    })
    return errs
  }, [rates])

  if (state === 'loading') return <p className="sb-center mono">Loading prices...</p>
  if (state === 'signin') return <SignIn onDone={load} />
  if (state === 'error' || !data)
    return (
      <div className="sb-center">
        <p className="sub">Prices can't load right now.</p>
        <p>{error}</p>
        <button className="sb-btn" onClick={load}>Try again</button>
      </div>
    )

  const priceChanges = Object.entries(edits)
    .map(([variantId, raw]) => {
      const group = data.groups.find((g) => g.variants.some((v) => v.id === variantId))!
      const v = group.variants.find((x) => x.id === variantId)!
      return { group, v, next: num(raw) }
    })
    .filter((c) => Number.isFinite(c.next) && Math.round(c.next * 100) !== Math.round(c.v.price * 100))
  const badPrices = Object.values(edits).filter((raw) => !Number.isFinite(num(raw)) || num(raw) < 0.5)
  const badWeights = Object.values(wEdits).filter((raw) => raw.trim() !== '' && !(num(raw) >= 0))
  const problems = [
    ...(badPrices.length ? [`${badPrices.length} price${badPrices.length === 1 ? ' needs' : 's need'} fixing (minimum $0.50)`] : []),
    ...(badWeights.length ? ['A weight needs fixing'] : []),
    ...bandErrors,
  ]
  const weightChanges = Object.entries(wEdits)
    .map(([k, raw]) => {
      const [gid, key] = k.split('|')
      const g = data.groups.find((x) => x.id === gid)!
      return { g, key, before: g.weights[key] ?? null, after: raw.trim() === '' ? null : num(raw) }
    })
    .filter((c) => c.after !== c.before)
  const packChanged = packOz !== data.packagingOz
  const changeCount = priceChanges.length + weightChanges.length + (packChanged ? 1 : 0) + (shipChanged ? 1 : 0) + (pickupChanged ? 1 : 0)
  const unusual = priceChanges.filter((c) => c.next < 5 || Math.abs(c.next - c.v.price) / c.v.price > 0.5)
  const missingWeights = data.groups.filter((g) => g.weightKeys.some((k) => pieceOz(g, k) == null))

  const sections = new Map<string, Group[]>()
  for (const g of data.groups) {
    const q = filter.toLowerCase()
    if (q && !g.label.toLowerCase().includes(q) && !g.designs.some((d) => d.toLowerCase().includes(q))) continue
    sections.set(g.type, [...(sections.get(g.type) ?? []), g])
  }

  const save = async () => {
    setSaving(true)
    try {
      const weights = weightsChanged
        ? {
            packagingOz: packOz,
            groups: Object.fromEntries(data.groups.map((g) => [g.id, Object.fromEntries(g.weightKeys.map((k) => [k, pieceOz(g, k) ?? 0]))])),
          }
        : undefined
      const res = await fetch('/api/staff/prices', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variants: priceChanges.map((c) => ({ variantId: c.v.id, price: c.next })),
          weights,
          shipping: shipChanged ? { rates } : undefined,
          pickup: pickupChanged ? pickup : undefined,
        }),
      })
      if (res.status === 401) return setState('signin')
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      apply(body)
      setReview(false)
      setToast(`${body.message} The website and checkout use the new settings now.`)
    } catch (e) {
      setToast(`Not saved: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const setRate = (i: number, patch: Partial<Rate>) => setRates(rates.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addBand = () => {
    const prev = rates.length > 1 ? (rates[rates.length - 2].upToLb ?? 0) : 0
    const last = rates[rates.length - 1]
    setRates([...rates.slice(0, -1), { ...last, upToLb: prev + 2 }, { ...last, upToLb: null }])
  }
  const removeBand = (i: number) => {
    const next = rates.filter((_, j) => j !== i)
    next[next.length - 1] = { ...next[next.length - 1], upToLb: null }
    setRates(next)
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
        <input className="sb-search" type="search" placeholder="Find a product or design" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a product or design" />
        <div className="sb-meta">
          <a className="sb-btn sb-navlink" href="/staff/">Job board</a>
        </div>
      </header>

      <main className="pm-main">
        <p className="pm-intro">
          Prices are set by format: every design in a format shares one price table. Change anything and press <strong>Review &amp; save</strong>. Saved changes show on the website, in the designer and at checkout right away.
        </p>

        <section className="pm-card">
          <h2>Shipping by weight</h2>
          <p className="sb-hint">
            Checkout adds up the weight of everything in the order and charges the rate for that band. Weights come from the weight per piece you enter on each format below.
          </p>
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Order weight</th>
                  <th>Standard</th>
                  <th>Express (blank for none)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr key={i}>
                    <th>
                      {i < rates.length - 1 ? (
                        <span className="pm-band">
                          <span>{i === 0 ? 0 : (rates[i - 1].upToLb ?? '?')} to</span>
                          <Num value={r.upToLb} onChange={(n) => setRate(i, { upToLb: n })} suffix="lb" label={`Band ${i + 1} upper weight`} />
                        </span>
                      ) : (
                        bandName(rates, i)
                      )}
                    </th>
                    <td>
                      <Num value={r.standard} onChange={(n) => setRate(i, { standard: n ?? 0 })} prefix="$" label={`Band ${i + 1} standard rate`} />
                    </td>
                    <td>
                      <Num value={r.express} onChange={(n) => setRate(i, { express: n })} prefix="$" allowBlank label={`Band ${i + 1} express rate`} />
                    </td>
                    <td>
                      {rates.length > 1 && (
                        <button type="button" className="sb-btn sb-btn-ghost pm-small" onClick={() => removeBand(i)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pm-ship">
            <div className="pm-field">
              <span>&nbsp;</span>
              <button type="button" className="sb-btn sb-btn-ghost" onClick={addBand}>
                Add a weight band
              </button>
            </div>
            <label className="pm-field">
              <span>Packing weight per order (box, padding)</span>
              <Num value={packOz} onChange={(n) => setPackOz(n ?? 0)} suffix="oz" label="Packing weight" />
            </label>
          </div>
          {pickup && (
            <div className="pm-ship">
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
            </div>
          )}
          {missingWeights.length > 0 && (
            <p className="pm-note">
              {missingWeights.length} format{missingWeights.length === 1 ? ' has' : 's have'} no weight yet, so {missingWeights.length === 1 ? 'it ships' : 'they ship'} at the lightest band. Weigh one finished piece and enter it in the format below.
            </p>
          )}
        </section>

        {[...sections.entries()].map(([type, groups]) => (
          <section key={type} className="pm-group">
            <h2 className="pm-group-h">{type}</h2>
            {groups.map((g) => (
              <GroupPrices
                key={g.id}
                g={g}
                edits={edits}
                setEdit={(id, raw) =>
                  setEdits((e) => {
                    const v = g.variants.find((x) => x.id === id)!
                    const n = { ...e }
                    if (num(raw) === v.price) delete n[id]
                    else n[id] = raw
                    return n
                  })
                }
                wEdits={wEdits}
                setWeight={(key, raw) =>
                  setWEdits((e) => {
                    const k = `${g.id}|${key}`
                    const n = { ...e }
                    const saved = g.weights[key]
                    if ((raw.trim() === '' && saved == null) || num(raw) === saved) delete n[k]
                    else n[k] = raw
                    return n
                  })
                }
                pieceOz={(key) => pieceOz(g, key)}
                packOz={packOz}
                rates={rates}
              />
            ))}
          </section>
        ))}
      </main>

      <div className={`pm-bar ${changeCount || problems.length ? 'is-on' : ''}`}>
        <span className="mono">{problems.length ? problems.join('. ') : `${changeCount} unsaved change${changeCount === 1 ? '' : 's'}`}</span>
        <button type="button" className="sb-btn sb-btn-ghost" onClick={() => apply(data)}>
          Undo all
        </button>
        <button type="button" className="sb-btn sb-btn-go" disabled={!changeCount || problems.length > 0} onClick={() => setReview(true)}>
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
                {unusual.length} price{unusual.length === 1 ? ' looks' : 's look'} unusual (under $5, or more than 50% different). Double-check {unusual.length === 1 ? 'it' : 'them'} below.
              </p>
            )}
            {shipChanged && (
              <section className="sb-block">
                <h3>Shipping rates</h3>
                <ul className="pm-changes">
                  {rates.map((r, i) => (
                    <li key={i}>
                      <span>{bandName(rates, i)}</span>
                      <span>
                        Standard <strong>{money(r.standard)}</strong>, Express <strong>{r.express != null ? money(r.express) : 'none'}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(weightChanges.length > 0 || packChanged) && (
              <section className="sb-block">
                <h3>Weights</h3>
                <ul className="pm-changes">
                  {packChanged && (
                    <li>
                      <span>Packing weight per order</span>
                      <span>
                        {data.packagingOz} oz to <strong>{packOz} oz</strong>
                      </span>
                    </li>
                  )}
                  {weightChanges.map((c) => (
                    <li key={`${c.g.id}|${c.key}`}>
                      <span>
                        {c.g.label}
                        {c.key !== 'Each' && <span className="mono"> {c.key}</span>}
                      </span>
                      <span>
                        {c.before != null ? `${c.before} oz` : 'none'} to <strong>{c.after != null ? `${c.after} oz` : 'none'}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
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
                        {c.group.label}
                        <span className="mono"> {Object.values(c.v.options).join(' / ')}</span>
                      </span>
                      <span>
                        {money(c.v.price)} to <strong>{money(c.next)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
                {priceChanges.some((c) => c.group.designs.length > 1) && <p className="sb-hint">Formats with several designs get the same prices on every design.</p>}
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

/** Number box that keeps what's typed. Blank gives null when allowBlank. */
function Num({
  value,
  onChange,
  prefix,
  suffix,
  allowBlank,
  label,
}: {
  value: number | null
  onChange: (n: number | null) => void
  prefix?: string
  suffix?: string
  allowBlank?: boolean
  label: string
}) {
  const fmt = (v: number | null) => (v == null ? '' : prefix === '$' ? v.toFixed(2) : String(v))
  const [raw, setRaw] = useState(fmt(value))
  useEffect(() => {
    // Only reformat when the value changed from outside (undo, save), not while typing.
    if (num(raw) !== value && !(raw.trim() === '' && value == null)) setRaw(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const bad = raw.trim() === '' ? !allowBlank : !(num(raw) >= 0)
  return (
    <span className={`pm-money ${bad ? 'is-bad' : ''}`}>
      {prefix && <span>{prefix}</span>}
      <input
        className="sb-input"
        inputMode="decimal"
        aria-label={label}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          if (e.target.value.trim() === '') return allowBlank ? onChange(null) : undefined
          const n = num(e.target.value)
          if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100)
        }}
      />
      {suffix && <span className="mono">{suffix}</span>}
    </span>
  )
}

function GroupPrices({
  g,
  edits,
  setEdit,
  wEdits,
  setWeight,
  pieceOz,
  packOz,
  rates,
}: {
  g: Group
  edits: Record<string, string>
  setEdit: (id: string, raw: string) => void
  wEdits: Record<string, string>
  setWeight: (key: string, raw: string) => void
  pieceOz: (key: string) => number | null
  packOz: number
  rates: Rate[]
}) {
  const [open, setOpen] = useState(false)
  const changed = g.variants.filter((v) => v.id in edits).length + g.weightKeys.filter((k) => `${g.id}|${k}` in wEdits).length
  const [rowOpt, ...colOpts] = g.options
  const rows = rowOpt ? [...new Set(g.variants.map((v) => v.options[rowOpt]))] : ['']
  const cols = [...new Set(g.variants.map((v) => colOpts.map((o) => v.options[o]).join(' / ')))]
  const cell = (r: string, c: string) => g.variants.find((v) => (rowOpt ? v.options[rowOpt] === r : true) && colOpts.map((o) => v.options[o]).join(' / ') === c)
  const min = Math.min(...g.variants.map((v) => v.price))
  const noWeight = g.weightKeys.some((k) => pieceOz(k) == null)

  // Example: the biggest order in this format, and which shipping band it lands in.
  const biggest = [...g.variants].sort((a, b) => quantityOf(g, b) - quantityOf(g, a))[0]
  const bigPiece = biggest ? pieceOz(paperOf(g, biggest)) : null
  const bigOz = biggest && bigPiece != null ? bigPiece * quantityOf(g, biggest) + (g.hasQuantity ? packOz : 0) : null
  const band = bigOz != null ? rates.find((r) => r.upToLb == null || bigOz / 16 <= r.upToLb) : null

  return (
    <article className={`pm-product ${open ? 'is-open' : ''}`}>
      <button type="button" className="pm-product-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pm-head">
          <span className="pm-title">{g.label}</span>
          {g.designs.length > 0 && (
            <span className="pm-designs">
              {g.designs.length} design{g.designs.length === 1 ? '' : 's'}: {g.designs.join(', ')}
            </span>
          )}
        </span>
        <span className="mono">
          {changed ? <span className="pm-dot">{changed} changed</span> : `From ${money(min)}`}
          {noWeight && <span className="pm-dot pm-dot-warn">No weight</span>}
        </span>
        <span aria-hidden="true">{open ? 'Close' : 'Edit'}</span>
      </button>
      {open && (
        <div className="pm-body">
          {!g.inSync && <p className="pm-note">The designs in this format have different prices right now. Saving any change here gives every design the prices shown below.</p>}
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
                            <input className="sb-input" inputMode="decimal" aria-label={`${g.label} ${r} ${c}`} value={raw} onChange={(e) => setEdit(v.id, e.target.value)} />
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pm-weights">
            <h3>Weight of one finished {g.hasQuantity ? 'piece' : 'item'}</h3>
            <div className="pm-ship">
              {g.weightKeys.map((k) => {
                const key = `${g.id}|${k}`
                const raw = wEdits[key] ?? (g.weights[k] != null ? String(g.weights[k]) : '')
                return (
                  <label key={k} className="pm-field">
                    <span>{k === 'Each' ? 'Weight' : k}</span>
                    <span className={`pm-money ${key in wEdits ? 'is-changed' : ''} ${raw.trim() !== '' && !(num(raw) >= 0) ? 'is-bad' : ''}`}>
                      <input className="sb-input" inputMode="decimal" aria-label={`${g.label} ${k} weight`} placeholder="0.0" value={raw} onChange={(e) => setWeight(k, e.target.value)} />
                      <span className="mono">oz</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {bigOz != null && band && biggest && (
              <p className="sb-hint">
                Example: {Object.values(biggest.options).filter((x) => !/^(rush|standard)$/i.test(x)).join(', ')} weighs about {lbText(bigOz / 16)}
                {g.hasQuantity && packOz > 0 ? ' packed' : ''} and ships for {money(band.standard)} standard.
              </p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
