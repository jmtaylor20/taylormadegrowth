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

const STATUS: Record<string, string> = { FULFILLED: 'Done', UNFULFILLED: 'In the shop', PARTIALLY_FULFILLED: 'Partly done', ON_HOLD: 'On hold', SCHEDULED: 'Scheduled' }
const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
/** Opens the designer in home mode (details filled in, order marked with the home). */
const homeUrl = (url: string) => url + (url.includes('?') ? '&' : '?') + 'home=1'

export default function PortalApp({ phone, phoneHref }: { phone: string; phoneHref: string }) {
  const [home, setHome] = useState<Home | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'out' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)

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

        <section>
          <h2 className="po-h">Start a program</h2>
          <div className="po-designs">
            {templates.map((t) => {
              const crop = t.thumbnailCrop ?? t.trim
              return (
                <a key={t.id} className="po-design" href={homeUrl(`/design/${t.id}/`)}>
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
