import { useCallback, useEffect, useMemo, useState } from 'react'
import './staff.css'

/**
 * Kemp & Sons job board. Jobs are Shopify orders, read and updated through
 * /api/staff (netlify/functions/staff.mts). Add ?demo=1 to see it with sample
 * jobs and no sign-in (nothing is saved).
 */

type Stage = 'new' | 'printing' | 'ready' | 'done'
interface Item {
  title: string
  variant: string | null
  qty: number
  design: string | null
  ref: string | null
  printUrl: string | null
  proofUrl: string | null
  envelopesUrl: string | null
}
interface Job {
  id: string
  legacyId: string
  adminUrl: string
  name: string
  createdAt: string
  stage: Stage
  method: 'pickup' | 'ship' | 'local' | 'none'
  customer: string
  email: string | null
  phone: string | null
  address: string | null
  paid: string | null
  total: number
  note: string
  doneAt: string | null
  tracking: { number: string | null; url: string | null; company: string | null } | null
  items: Item[]
  rush?: boolean
}

const COLUMNS: { stage: Stage; label: string; hint: string }[] = [
  { stage: 'new', label: 'New', hint: 'Paid and waiting' },
  { stage: 'printing', label: 'Printing', hint: 'On press or in bindery' },
  { stage: 'ready', label: 'Ready', hint: 'Waiting for pickup or shipping' },
  { stage: 'done', label: 'Done', hint: 'Last 7 days' },
]

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 60) return `${Math.max(1, m)} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const AGE_WARN_H = 24

export default function StaffBoard() {
  const demo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')
  const [state, setState] = useState<'loading' | 'signin' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [texting, setTexting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Stage>('new')
  const [open, setOpen] = useState<Job | null>(null)
  const [updated, setUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    if (demo) {
      setJobs(DEMO_JOBS())
      setState('ready')
      setUpdated(new Date())
      return
    }
    try {
      const res = await fetch('/api/staff/jobs', { credentials: 'same-origin' })
      if (res.status === 401) return setState('signin')
      const body = await res.json().catch(() => ({ error: 'The job board service is not reachable right now.' }))
      if (!res.ok || body.error) throw new Error(body.error ?? `Error ${res.status}`)
      setJobs(body.jobs)
      setTexting(body.texting)
      setState('ready')
      setError(null)
      setUpdated(new Date())
    } catch (e) {
      setError((e as Error).message)
      setState((s) => (s === 'ready' ? 'ready' : 'error'))
    }
  }, [demo])

  useEffect(() => {
    load()
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const act = async (job: Job, action: string, extra: Record<string, string> = {}) => {
    if (demo) {
      const stage: Stage = action === 'picked-up' || action === 'ship' ? 'done' : action === 'note' ? job.stage : (action as Stage)
      const next = { ...job, stage, note: action === 'note' ? extra.note : job.note, doneAt: stage === 'done' ? new Date().toISOString() : null }
      setJobs((js) => js.map((j) => (j.id === job.id ? next : j)))
      setOpen((o) => (o?.id === job.id ? next : o))
      setToast(action === 'ready' && job.method === 'pickup' ? `Demo: pickup email would go to ${job.email}.` : 'Demo: saved (nothing really changed).')
      return
    }
    const res = await fetch(`/api/staff/jobs/${job.legacyId}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) return setState('signin')
    if (!res.ok) {
      setToast(`Couldn't update ${job.name}: ${body.error ?? res.status}`)
      return
    }
    setJobs((js) => js.map((j) => (j.id === job.id ? body.job : j)))
    setOpen((o) => (o?.id === job.id ? body.job : o))
    setToast(body.message || `${job.name} updated.`)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((j) => [j.name, j.customer, j.email, j.phone, ...j.items.flatMap((i) => [i.title, i.ref, i.design])].some((v) => v?.toLowerCase().includes(q)))
  }, [jobs, query])

  if (state === 'loading') return <p className="sb-center mono">Loading jobs...</p>
  if (state === 'signin') return <SignIn onDone={load} />

  return (
    <div className="sb">
      <header className="sb-top">
        <div className="sb-brand">
          <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons" width="72" height="48" />
          <div>
            <p className="mono">Job board{demo ? ' / demo' : ''}</p>
            <h1>Online orders</h1>
          </div>
        </div>
        <input className="sb-search" type="search" placeholder="Search name, order #, phone, design" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search jobs" />
        <div className="sb-meta">
          <a className="sb-btn sb-navlink" href="/staff/prices/">Prices</a>
          <button type="button" className="sb-btn" onClick={load}>Refresh</button>
          {!demo && (
            <button
              type="button"
              className="sb-btn sb-btn-ghost"
              onClick={async () => {
                await fetch('/api/staff/logout', { method: 'POST' })
                setState('signin')
              }}
            >
              Sign out
            </button>
          )}
          <span className="mono">{updated ? `Updated ${updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
        </div>
      </header>

      {state === 'error' && !jobs.length ? (
        <div className="sb-center">
          <p className="sub">The board can't load jobs right now.</p>
          <p>{error}</p>
          <button className="sb-btn" onClick={load}>Try again</button>
        </div>
      ) : (
        <>
      {error && <p className="sb-error">Couldn't refresh: {error}</p>}

      <nav className="sb-tabs" aria-label="Stages">
        {COLUMNS.map((c) => (
          <button key={c.stage} className={tab === c.stage ? 'is-on' : ''} onClick={() => setTab(c.stage)}>
            {c.label} <span>{filtered.filter((j) => j.stage === c.stage).length}</span>
          </button>
        ))}
      </nav>

      <main className="sb-board">
        {COLUMNS.map((c) => {
          const list = filtered.filter((j) => j.stage === c.stage).sort((a, b) => (c.stage === 'done' ? Date.parse(b.doneAt ?? b.createdAt) - Date.parse(a.doneAt ?? a.createdAt) : Date.parse(a.createdAt) - Date.parse(b.createdAt)))
          return (
            <section key={c.stage} className={`sb-col ${tab === c.stage ? 'is-tab' : ''}`} aria-label={c.label}>
              <header className="sb-col-h">
                <h2>{c.label}</h2>
                <span className="sb-count">{list.length}</span>
                <p className="mono">{c.hint}</p>
              </header>
              {list.length === 0 && <p className="sb-empty">Nothing here.</p>}
              {list.map((j) => (
                <Card key={j.id} job={j} onOpen={() => setOpen(j)} onAct={act} />
              ))}
            </section>
          )
        })}
      </main>
        </>
      )}

      {open && <Detail job={open} texting={texting} onClose={() => setOpen(null)} onAct={act} />}
      {toast && (
        <div className="sb-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function MethodBadge({ m }: { m: Job['method'] }) {
  return <span className={`sb-badge m-${m}`}>{m === 'pickup' ? 'Pickup' : m === 'ship' ? 'Ship' : m === 'local' ? 'Local delivery' : 'No delivery'}</span>
}

function Card({ job: j, onOpen, onAct }: { job: Job; onOpen: () => void; onAct: (j: Job, a: string, x?: Record<string, string>) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const old = (j.stage === 'new' || j.stage === 'printing') && (Date.now() - Date.parse(j.createdAt)) / 3600000 > AGE_WARN_H
  const run = async (action: string) => {
    setBusy(true)
    await onAct(j, action)
    setBusy(false)
  }
  const next =
    j.stage === 'new'
      ? { label: 'Start printing', action: 'printing' }
      : j.stage === 'printing'
        ? { label: j.method === 'pickup' ? 'Ready for pickup' : 'Ready to ship', action: 'ready', confirm: j.method === 'pickup' ? `Mark ${j.name} ready? ${j.customer} gets the pickup email now.` : undefined }
        : j.stage === 'ready' && j.method === 'pickup'
          ? { label: 'Picked up', action: 'picked-up' }
          : null
  return (
    <article className={`sb-card ${old ? 'is-old' : ''}`}>
      <button type="button" className="sb-card-main" onClick={onOpen}>
        <span className="sb-card-row">
          <strong>{j.name}</strong>
          {j.rush && <span className="sb-badge m-rush">Rush</span>}
          <MethodBadge m={j.method} />
        </span>
        <span className="sb-cust">{j.customer}</span>
        <span className="sb-items">
          {j.items.map((i, k) => (
            <span key={k}>
              {i.qty > 1 ? `${i.qty} x ` : ''}
              {i.title}
              {i.variant ? ` / ${i.variant}` : ''}
            </span>
          ))}
        </span>
        <span className="mono sb-age">
          {j.stage === 'done' && j.doneAt ? `Done ${ago(j.doneAt)}` : `Ordered ${ago(j.createdAt)}`}
          {j.note ? ' / Note' : ''}
        </span>
      </button>
      <div className="sb-card-actions">
        {j.items.some((i) => i.printUrl) && (
          <a className="sb-link" href={j.items.find((i) => i.printUrl)!.printUrl!} target="_blank" rel="noopener">
            Print file
          </a>
        )}
        {next && (
          <button
            type="button"
            className="sb-btn sb-btn-go"
            disabled={busy}
            onClick={() => {
              if (next.confirm && !confirm(next.confirm)) return
              run(next.action)
            }}
          >
            {busy ? 'Saving...' : next.label}
          </button>
        )}
        {j.stage === 'ready' && j.method === 'ship' && (
          <button type="button" className="sb-btn sb-btn-go" onClick={onOpen}>
            Add tracking
          </button>
        )}
      </div>
    </article>
  )
}

function Detail({ job: j, texting, onClose, onAct }: { job: Job; texting: boolean; onClose: () => void; onAct: (j: Job, a: string, x?: Record<string, string>) => Promise<void> }) {
  const [note, setNote] = useState(j.note)
  const [tracking, setTracking] = useState('')
  const [carrier, setCarrier] = useState('USPS')
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => setNote(j.note), [j.note])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const run = async (action: string, extra: Record<string, string> = {}) => {
    setBusy(action)
    await onAct(j, action, extra)
    setBusy(null)
  }
  return (
    <div className="sb-overlay" onClick={onClose}>
      <aside className="sb-detail" role="dialog" aria-modal="true" aria-label={`Order ${j.name}`} onClick={(e) => e.stopPropagation()}>
        <header className="sb-detail-h">
          <div>
            <p className="mono">
              {COLUMNS.find((c) => c.stage === j.stage)!.label} / ordered {new Date(j.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
            <h2>
              {j.name} <MethodBadge m={j.method} />
            </h2>
          </div>
          <button type="button" className="sb-btn sb-btn-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="sb-block">
          <h3>Customer</h3>
          <p>
            <strong>{j.customer}</strong>
          </p>
          {j.email && <p><a href={`mailto:${j.email}`}>{j.email}</a></p>}
          {j.phone && <p><a href={`tel:${j.phone}`}>{j.phone}</a></p>}
          {j.address && <p>Ship to: {j.address}</p>}
          <p className="mono">
            {money(j.total)} / {(j.paid ?? '').toLowerCase().replace(/_/g, ' ')}
          </p>
        </section>

        <section className="sb-block">
          <h3>Items</h3>
          {j.items.map((i, k) => (
            <div key={k} className="sb-item">
              <p>
                <strong>
                  {i.qty > 1 ? `${i.qty} x ` : ''}
                  {i.title}
                </strong>
                {i.variant && <span> / {i.variant}</span>}
              </p>
              {i.ref && <p className="mono">Ref {i.ref}</p>}
              <p className="sb-files">
                {i.printUrl && <a href={i.printUrl} target="_blank" rel="noopener">Print file (PDF)</a>}
                {i.proofUrl && <a href={i.proofUrl} target="_blank" rel="noopener">Approved proof</a>}
                {i.envelopesUrl && <a href={i.envelopesUrl} target="_blank" rel="noopener">Envelopes (PDF)</a>}
              </p>
            </div>
          ))}
        </section>

        <section className="sb-block">
          <h3>Shop note</h3>
          <textarea className="sb-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paper pulled, rush, called customer..." />
          <button type="button" className="sb-btn" disabled={busy === 'note' || note === j.note} onClick={() => run('note', { note })}>
            {busy === 'note' ? 'Saving...' : 'Save note'}
          </button>
        </section>

        <section className="sb-block">
          <h3>Move this job</h3>
          <div className="sb-moves">
            {j.stage !== 'new' && j.stage !== 'done' && (
              <button className="sb-btn" disabled={!!busy} onClick={() => run('new')}>Back to New</button>
            )}
            {j.stage !== 'printing' && j.stage !== 'done' && (
              <button className="sb-btn" disabled={!!busy} onClick={() => run('printing')}>Printing</button>
            )}
            {j.stage !== 'ready' && j.stage !== 'done' && (
              <button
                className="sb-btn sb-btn-go"
                disabled={!!busy}
                onClick={() => {
                  if (j.method === 'pickup' && !confirm(`Mark ${j.name} ready? ${j.customer} gets the pickup email now.`)) return
                  run('ready')
                }}
              >
                {j.method === 'pickup' ? 'Ready for pickup (sends email)' : 'Ready to ship'}
              </button>
            )}
            {j.stage === 'ready' && j.method === 'pickup' && (
              <button className="sb-btn sb-btn-go" disabled={!!busy} onClick={() => run('picked-up')}>Picked up</button>
            )}
          </div>
          {j.method === 'pickup' && j.stage !== 'done' && (
            <p className="sb-hint">
              Ready for pickup emails the customer{texting && j.phone ? ' and texts them' : ''}.{!texting ? ' Texts turn on once Twilio is set up.' : ''}
            </p>
          )}
          {j.method === 'ship' && j.stage !== 'done' && (
            <div className="sb-ship">
              <label>
                Tracking number
                <input className="sb-input" value={tracking} onChange={(e) => setTracking(e.target.value)} />
              </label>
              <label>
                Carrier
                <select className="sb-input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  {['USPS', 'UPS', 'FedEx', 'Other'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <button
                className="sb-btn sb-btn-go"
                disabled={!!busy || !tracking.trim()}
                onClick={() => run('ship', { tracking, carrier: carrier === 'Other' ? '' : carrier })}
              >
                {busy === 'ship' ? 'Saving...' : 'Mark shipped (emails tracking)'}
              </button>
            </div>
          )}
          {j.stage === 'done' && j.tracking?.number && (
            <p>
              Shipped: {j.tracking.company} {j.tracking.url ? <a href={j.tracking.url} target="_blank" rel="noopener">{j.tracking.number}</a> : j.tracking.number}
            </p>
          )}
        </section>

        <p>
          <a className="sb-link" href={j.adminUrl} target="_blank" rel="noopener">Open in Shopify</a>
        </p>
      </aside>
    </div>
  )
}

export function SignIn({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="sb-signin"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setErr(null)
        const res = await fetch('/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) })
        const body = await res.json().catch(() => ({}))
        setBusy(false)
        if (!res.ok) return setErr(body.error ?? 'Could not sign in.')
        onDone()
      }}
    >
      <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons" width="150" height="100" />
      <p className="mono">Staff only</p>
      <h1>Job board</h1>
      <label>
        Staff password
        <input className="sb-input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </label>
      {err && <p className="sb-error">{err}</p>}
      <button className="sb-btn sb-btn-go" disabled={busy || !pw}>
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}

/* ---------- Demo data (?demo=1) ---------- */

function DEMO_JOBS(): Job[] {
  const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString()
  const base = { adminUrl: '#', paid: 'PAID', tracking: null, address: null, doneAt: null, note: '' }
  const card = (variant: string, ref: string, env = false): Item[] => [
    { title: 'Christmas Card: Very Merry (3 photos)', variant, qty: 1, design: 'Very Merry', ref, printUrl: '#', proofUrl: '#', envelopesUrl: null },
    ...(env ? [{ title: 'Addressed envelopes', variant: null, qty: 48, design: null, ref, printUrl: null, proofUrl: null, envelopesUrl: '#' }] : []),
  ]
  return [
    { ...base, id: '1', legacyId: '1', name: '#1012', createdAt: h(0.6), stage: 'new', method: 'pickup', customer: 'Sarah Whitfield', email: 'sarah@example.com', phone: '(334) 555-0142', total: 87.8, items: card('50 cards / 14 pt Gloss', 'KS-DEMO12', true) },
    { ...base, id: '2', legacyId: '2', name: '#1011', createdAt: h(3), stage: 'new', method: 'ship', customer: 'The Carter Family', email: 'carter@example.com', phone: null, address: '22 Pine St, Auburn AL 36830', total: 89, items: card('100 cards / 14 pt Matte', 'KS-DEMO11') },
    { ...base, id: '3', legacyId: '3', name: '#1009', createdAt: h(27), stage: 'printing', method: 'pickup', customer: 'Mike Jones', email: 'mike@example.com', phone: '(334) 555-0199', total: 149, note: 'Customer asked for extra envelopes', items: card('200 cards / 14 pt Matte', 'KS-DEMO09') },
    { ...base, id: '4', legacyId: '4', name: '#1008', createdAt: h(30), stage: 'ready', method: 'pickup', customer: 'Ann Lee', email: 'ann@example.com', phone: '(334) 555-0110', total: 59, items: card('50 cards / 14 pt Matte', 'KS-DEMO08') },
    { ...base, id: '5', legacyId: '5', name: '#1006', createdAt: h(52), stage: 'done', method: 'pickup', customer: 'Robert Hayes', email: 'rob@example.com', phone: null, total: 39, doneAt: h(20), items: card('25 cards / 14 pt Gloss', 'KS-DEMO06') },
  ]
}
