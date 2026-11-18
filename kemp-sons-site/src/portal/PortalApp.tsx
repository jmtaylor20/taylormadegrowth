import { useEffect, useState } from 'react'
import { templatesIn } from '../editor/templates'
import TemplateThumb from '../editor/TemplateThumb'
import { money } from '../editor/shop'
import './portal.css'

/**
 * Funeral home portal: the partner home's own ordering page. Opened from the
 * private link Kemp & Sons sends (/portal/?h=<home>&k=<key>), which signs the
 * device in. Programs started here open the designer in "home mode", with the
 * home's details filled in and the order marked with the home.
 */

interface Home {
  slug: string
  name: string
  address: string
  city: string
  phone: string
  contact: string
  email: string
}
interface Case {
  id: string
  name: string
  serviceDate: string
  createdAt: string
  familyUrl: string
  linkExpires: string
  values: Record<string, string>
  photos: { id: string; kind: 'portrait' | 'other' }[]
  familyUpdatedAt: string | null
}
interface Order {
  name: string
  createdAt: string
  status: string
  paid: string | null
  total: number
  design: string
  options: string
  reorder: string | null
  proof: string | null
}

const LABELS: Record<string, string> = {
  name: 'Name as printed',
  firstName: 'First name or nickname',
  birthDate: 'Born',
  deathDate: 'Passed',
  obituary: 'Obituary',
  tribute: 'Poem or verse',
  familyMessage: 'Thank-you message',
  note: 'Notes from the family',
}

const STATUS: Record<string, string> = { FULFILLED: 'Done', UNFULFILLED: 'In the shop', PARTIALLY_FULFILLED: 'Partly done', ON_HOLD: 'On hold', SCHEDULED: 'Scheduled' }
const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
/** Opens the designer in home mode (details filled in, order marked with the home). */
const homeUrl = (url: string) => url + (url.includes('?') ? '&' : '?') + 'home=1'

export default function PortalApp({ phone, phoneHref }: { phone: string; phoneHref: string }) {
  const [home, setHome] = useState<Home | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'out' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [cases, setCases] = useState<Case[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [draftCase, setDraftCase] = useState({ name: '', serviceDate: '' })
  const [caseErr, setCaseErr] = useState<string | null>(null)
  const [openCase, setOpenCase] = useState<string | null>(null)
  /** The family a program is being started for (design links carry its id). */
  const [forCase, setForCase] = useState<Case | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const loadCases = () =>
    fetch('/api/portal/cases', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { cases: [] }))
      .then((b) => setCases(b.cases))
      .catch(() => setCases([]))

  useEffect(() => {
    ;(async () => {
      const q = new URLSearchParams(window.location.search)
      const h = q.get('h'), k = q.get('k')
      if (h && k) {
        // Sign in with the link, then take the key out of the address bar.
        const res = await fetch('/api/portal/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: h, key: k }) })
        history.replaceState(null, '', window.location.pathname)
        if (!res.ok) setMessage((await res.json().catch(() => ({}))).error ?? 'That link did not work.')
      }
      const me = await fetch('/api/portal/me', { credentials: 'same-origin' })
      if (me.status === 401) return setState('out')
      if (!me.ok) return setState('error')
      setHome((await me.json()).home)
      setState('ready')
      loadCases()
      const o = await fetch('/api/portal/orders', { credentials: 'same-origin' })
      setOrders(o.ok ? (await o.json()).orders : [])
    })().catch(() => setState('error'))
  }, [])

  if (state === 'loading') return <p className="po-center mono">Opening your ordering page...</p>
  if (state === 'out' || state === 'error')
    return (
      <div className="po-center">
        <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons Printing" width="160" height="107" />
        <h1>Funeral home ordering</h1>
        <p>{message ?? (state === 'error' ? "Your page couldn't open right now. Please try again in a minute." : 'Open the private link Kemp & Sons sent you to sign in on this device.')}</p>
        <p>
          Need a link, or want to become a partner? Call us at <a href={phoneHref}>{phone}</a>.
        </p>
      </div>
    )

  const templates = templatesIn('funeral-programs')
  return (
    <div className="po">
      <header className="po-top">
        <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons Printing" width="84" height="56" />
        <div>
          <p className="mono">Partner ordering</p>
          <h1>{home!.name}</h1>
        </div>
        <button
          type="button"
          className="po-out"
          onClick={async () => {
            if (!confirm('Sign out on this device? You will need your link to sign back in.')) return
            await fetch('/api/portal/logout', { method: 'POST', credentials: 'same-origin' })
            window.location.reload()
          }}
        >
          Sign out
        </button>
      </header>

      <main className="po-main">
        <section className="po-intro">
          <p>
            Start a program below. Your funeral home's name, address and phone are filled in for you. Approve the proof and we'll print it. Need it today? Call us at <a href={phoneHref}>{phone}</a>.
          </p>
        </section>

        <section className="po-families">
          <div className="po-h-row">
            <h2 className="po-h">Family photo links</h2>
            {!adding && (
              <button type="button" className="po-btn" onClick={() => setAdding(true)}>
                + New family link
              </button>
            )}
          </div>
          <p className="po-sub">Send the family a link. They add photos, the obituary and the wording on their phone, no sign-in. Then start the program here and it's all filled in.</p>
          {adding && (
            <form
              className="po-new"
              onSubmit={async (e) => {
                e.preventDefault()
                setCaseErr(null)
                const r = await fetch('/api/portal/cases', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draftCase) })
                const b = await r.json().catch(() => ({}))
                if (!r.ok) return setCaseErr(b.error ?? 'Could not make the link.')
                setAdding(false)
                setDraftCase({ name: '', serviceDate: '' })
                setOpenCase(b.case.id)
                loadCases()
              }}
            >
              <label>
                <span>Who is the program for?</span>
                <input required value={draftCase.name} placeholder="Mr. Robert James Hayes" onChange={(e) => setDraftCase({ ...draftCase, name: e.target.value })} />
              </label>
              <label>
                <span>Service date (optional)</span>
                <input value={draftCase.serviceDate} placeholder="Saturday, November 21" onChange={(e) => setDraftCase({ ...draftCase, serviceDate: e.target.value })} />
              </label>
              {caseErr && <p className="po-err">{caseErr}</p>}
              <div className="po-row">
                <button className="po-btn">Make the link</button>
                <button type="button" className="po-link" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {cases === null ? (
            <p className="mono">Loading...</p>
          ) : cases.length === 0 ? (
            !adding && <p className="po-sub">No family links yet.</p>
          ) : (
            <ul className="po-cases">
              {cases.map((c) => {
                const sent = c.photos.length > 0 || Object.entries(c.values).some(([k, v]) => k !== 'name' && v)
                const words = ['obituary', 'tribute', 'familyMessage'].filter((k) => c.values[k]).length
                const open = openCase === c.id
                return (
                  <li key={c.id} className={open ? 'is-open' : ''}>
                    <div className="po-case-head">
                      <div>
                        <strong>{c.name}</strong>
                        <span className="mono">
                          {c.serviceDate ? `${c.serviceDate} / ` : ''}link made {when(c.createdAt)}
                        </span>
                      </div>
                      <span className={`po-status ${sent ? 'is-fulfilled' : ''}`}>
                        {sent ? `${c.photos.length} photo${c.photos.length === 1 ? '' : 's'}${words ? `, ${c.values.obituary ? 'obituary' : 'wording'}` : ''}` : 'Waiting on family'}
                      </span>
                    </div>
                    <div className="po-row">
                      <a className="po-btn is-light" href={`sms:?&body=${encodeURIComponent(`Here is the link to add photos and the obituary for ${c.name}'s program: ${c.familyUrl}`)}`}>
                        Text link
                      </a>
                      <button
                        type="button"
                        className="po-btn is-light"
                        onClick={async () => {
                          await navigator.clipboard?.writeText(c.familyUrl).catch(() => {})
                          setCopied(c.id)
                          setTimeout(() => setCopied(null), 2000)
                        }}
                      >
                        {copied === c.id ? 'Copied' : 'Copy link'}
                      </button>
                      <button type="button" className="po-link" onClick={() => setOpenCase(open ? null : c.id)} aria-expanded={open}>
                        {open ? 'Hide' : 'See what they sent'}
                      </button>
                      <button
                        type="button"
                        className="po-btn"
                        onClick={() => {
                          setForCase(c)
                          document.getElementById('po-designs')?.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        Start program &rarr;
                      </button>
                    </div>
                    {open && (
                      <div className="po-case-body">
                        <p className="po-sub">
                          Family link: <input readOnly value={c.familyUrl} onFocus={(e) => e.target.select()} /> Works until {when(c.linkExpires)}.
                        </p>
                        {c.photos.length > 0 && (
                          <div className="po-thumbs">
                            {c.photos.map((p) => (
                              <img key={p.id} src={`/api/portal/cases/${c.id}/photos/${p.id}`} alt={p.kind === 'portrait' ? 'Main photo' : ''} className={p.kind === 'portrait' ? 'is-main' : ''} loading="lazy" />
                            ))}
                          </div>
                        )}
                        <dl className="po-vals">
                          {Object.entries(c.values)
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{LABELS[k] ?? k}</dt>
                                <dd>{v}</dd>
                              </div>
                            ))}
                        </dl>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section id="po-designs">
          <h2 className="po-h">Start a program</h2>
          {forCase && (
            <p className="po-for" role="status">
              Pick a design for <strong>{forCase.name}</strong>. The family's photos and words will be filled in.{' '}
              <button type="button" className="po-link" onClick={() => setForCase(null)}>
                Start without them
              </button>
            </p>
          )}
          <div className="po-designs">
            {templates.map((t) => {
              const crop = t.thumbnailCrop ?? t.trim
              return (
                <a key={t.id} className="po-design" href={homeUrl(`/design/${t.id}/`) + (forCase ? `&case=${forCase.id}` : '')}>
                  <span className="po-design-art">
                    <span className="po-design-frame" style={{ aspectRatio: `${crop.w} / ${crop.h}`, ...(crop.w / crop.h > 0.8 ? { width: '86%' } : { height: '90%' }) }}>
                      <TemplateThumb id={t.id} samples />
                    </span>
                  </span>
                  <span className="po-design-name">{t.name}</span>
                  <span className="po-design-meta mono">{t.sizeLabel}</span>
                </a>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="po-h">Your recent orders</h2>
          {orders === null ? (
            <p className="mono">Loading orders...</p>
          ) : orders.length === 0 ? (
            <p>No orders yet. Programs you order here will show up with their status, so you can check on them or order more.</p>
          ) : (
            <ul className="po-orders">
              {orders.map((o) => (
                <li key={o.name}>
                  <div>
                    <strong>{o.design}</strong>
                    <span className="mono">
                      {o.name} / {when(o.createdAt)} / {o.options}
                    </span>
                  </div>
                  <span className={`po-status is-${o.status.toLowerCase()}`}>{STATUS[o.status] ?? o.status.toLowerCase().replace(/_/g, ' ')}</span>
                  <span className="mono">{money(o.total)}</span>
                  <span className="po-order-links">
                    {o.proof && (
                      <a href={o.proof} target="_blank" rel="noopener">
                        Proof
                      </a>
                    )}
                    {o.reorder && <a href={homeUrl(o.reorder)}>Order more or change</a>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
