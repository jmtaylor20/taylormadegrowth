import { useCallback, useEffect, useState } from 'react'
import { SignIn } from './StaffBoard'
import './staff.css'

/**
 * Funeral home partners. Each home gets a private link to the portal
 * (/portal/), where its staff start programs with the home's details already
 * filled in. The link is shown once, right after it's made; a new link can be
 * made any time, which ends the old one.
 */

interface Home {
  slug: string
  name: string
  address: string
  city: string
  phone: string
  contact: string
  email: string
  notes: string
  active: boolean
  createdAt: string
}

const EMPTY = { name: '', address: '', city: '', phone: '', contact: '', email: '', notes: '' }

export default function HomesManager() {
  const [state, setState] = useState<'loading' | 'signin' | 'ready' | 'error'>('loading')
  const [homes, setHomes] = useState<Home[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<typeof EMPTY & { slug?: string }>(EMPTY)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  /** A freshly made sign-in link, shown once. */
  const [link, setLink] = useState<{ name: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/staff/homes', { credentials: 'same-origin' })
    if (res.status === 401) return setState('signin')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error ?? `Error ${res.status}`)
      return setState('error')
    }
    setHomes(body.homes)
    setState('ready')
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const portalUrl = (slug: string, key: string) => `${window.location.origin}/portal/?h=${encodeURIComponent(slug)}&k=${encodeURIComponent(key)}`

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/staff/homes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      if (body.key) setLink({ name: body.home.name, url: portalUrl(body.home.slug, body.key) })
      setForm(EMPTY)
      setEditing(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const newLink = async (h: Home) => {
    if (!confirm(`Make a new link for ${h.name}? The old link stops working, and anyone signed in with it is signed out.`)) return
    const res = await fetch(`/api/staff/homes/${h.slug}/key`, { method: 'POST', credentials: 'same-origin' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return setError(body.error ?? `Error ${res.status}`)
    setLink({ name: h.name, url: portalUrl(h.slug, body.key) })
  }

  const setActive = async (h: Home, active: boolean) => {
    await fetch('/api/staff/homes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...h, active }) })
    load()
  }

  if (state === 'loading') return <p className="sb-center mono">Loading...</p>
  if (state === 'signin') return <SignIn onDone={load} />
  if (state === 'error')
    return (
      <div className="sb-center">
        <p className="sub">Funeral homes can't load right now.</p>
        <p>{error}</p>
      </div>
    )

  const field = (k: keyof typeof EMPTY, label: string, wide = false, type = 'text') => (
    <label className={`pm-field ${wide ? 'pm-wide' : ''}`}>
      <span>{label}</span>
      {k === 'notes' ? (
        <textarea className="sb-input" rows={2} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      ) : (
        <input className="sb-input" type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      )}
    </label>
  )

  return (
    <div className="sb pm">
      <header className="sb-top">
        <div className="sb-brand">
          <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons" width="72" height="48" />
          <div>
            <p className="mono">Staff / Funeral homes</p>
            <h1>Funeral home partners</h1>
          </div>
        </div>
        <div className="sb-meta">
          <a className="sb-btn sb-navlink" href="/staff/">
            Job board
          </a>
        </div>
      </header>

      <main className="pm-main">
        <p className="pm-intro">
          Each partner home gets a private link to its own ordering page. Their staff open it once on each computer or phone and stay signed in. Programs start with the home's name, address and phone already filled in, and their orders show on the job board marked with the home.
        </p>

        {link && (
          <section className="pm-card hm-link" role="status">
            <h2>Link for {link.name}</h2>
            <p>Send this to the funeral home (text or email). It's shown only now. If it's lost, make a new one.</p>
            <div className="hm-link-row">
              <input className="sb-input" readOnly value={link.url} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="sb-btn sb-btn-go"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link.url).catch(() => {})
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" className="sb-btn sb-btn-ghost" onClick={() => setLink(null)}>
                Done
              </button>
            </div>
          </section>
        )}

        <section className="pm-card">
          <h2>{editing ? `Edit ${form.name || 'funeral home'}` : 'Add a funeral home'}</h2>
          <div className="pm-ship">
            {field('name', 'Funeral home name', true)}
            {field('address', 'Street address')}
            {field('city', 'City, state ZIP')}
            {field('phone', 'Phone', false, 'tel')}
            {field('contact', 'Main contact')}
            {field('email', 'Contact email', false, 'email')}
            {field('notes', 'Notes (staff only: pricing, preferences)', true)}
          </div>
          {error && <p className="sb-error">{error}</p>}
          <div className="hm-actions">
            <button type="button" className="sb-btn sb-btn-go" disabled={busy || !form.name.trim()} onClick={save}>
              {busy ? 'Saving...' : editing ? 'Save changes' : 'Add home and make its link'}
            </button>
            {editing && (
              <button
                type="button"
                className="sb-btn sb-btn-ghost"
                onClick={() => {
                  setForm(EMPTY)
                  setEditing(false)
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </section>

        <section className="pm-group">
          <h2 className="pm-group-h">Partners ({homes.length})</h2>
          {homes.length === 0 && <p className="sb-hint">No funeral homes yet. Add the first one above.</p>}
          {homes.map((h) => (
            <article key={h.slug} className={`pm-card hm-home ${h.active ? '' : 'is-off'}`}>
              <div>
                <h3>
                  {h.name} {!h.active && <span className="pm-dot pm-dot-warn">Paused</span>}
                </h3>
                <p>{[h.address, h.city].filter(Boolean).join(', ')}</p>
                <p>{[h.phone, h.contact, h.email].filter(Boolean).join(' / ')}</p>
                {h.notes && <p className="sb-hint">{h.notes}</p>}
              </div>
              <div className="hm-actions">
                <button type="button" className="sb-btn sb-btn-ghost" onClick={() => newLink(h)}>
                  New link
                </button>
                <button
                  type="button"
                  className="sb-btn sb-btn-ghost"
                  onClick={() => {
                    setForm({ slug: h.slug, name: h.name, address: h.address, city: h.city, phone: h.phone, contact: h.contact, email: h.email, notes: h.notes })
                    setEditing(true)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Edit
                </button>
                <button type="button" className="sb-btn sb-btn-ghost" onClick={() => setActive(h, !h.active)}>
                  {h.active ? 'Pause' : 'Turn back on'}
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
