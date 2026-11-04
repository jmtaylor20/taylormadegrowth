import { useState } from 'react'
import { Link } from 'react-router-dom'
import { templateById } from '../templates'
import { money } from '../lib/draft'
import { orderTitle, STATUSES, useOrders, type Order, type Status } from '../lib/orders'
import { useToast } from '../components/Toast'
import { useMediaQuery } from '../lib/useMediaQuery'

/** The text a customer gets when their order moves into each status. */
function textFor(o: Order, next: Status): string {
  switch (next) {
    case 'Proofing':
      return 'We received your order and are checking your files now.'
    case 'Printing':
      return 'Your order is on the press.'
    case 'Ready':
      return o.fulfillment.method === 'ship' ? 'Your order has shipped.' : 'Your order is ready for pickup'
    case 'Completed':
      return 'Thank you for choosing Kemp & Sons.'
    default:
      return ''
  }
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** Rush first, then oldest first (newest first once completed). */
function sortOrders(list: Order[], status: Status) {
  return [...list].sort((a, b) => {
    if (a.draft.rush !== b.draft.rush) return a.draft.rush ? -1 : 1
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return status === 'Completed' ? -d : d
  })
}

const COLUMN_TINT: Record<Status, string> = {
  New: 'bg-sky-500',
  Proofing: 'bg-violet-500',
  Printing: 'bg-amber-500',
  Ready: 'bg-emerald-500',
  Completed: 'bg-stone-400',
}

export function AdminPage() {
  const [orders, setOrders] = useOrders()
  const toast = useToast()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [tab, setTab] = useState<Status>('New')
  const [moved, setMoved] = useState<string | null>(null)

  const advance = (o: Order) => {
    const i = STATUSES.indexOf(o.status)
    if (i === STATUSES.length - 1) {
      toast('Order complete', `${o.id} is already finished.`)
      return
    }
    const next = STATUSES[i + 1]
    const text = textFor(o, next)
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, status: next, texts: [...(x.texts ?? []), text] } : x)))
    setMoved(o.id)
    setTimeout(() => setMoved((m) => (m === o.id ? null : m)), 1200)
    toast('Customer notified by text:', text)
  }

  const by = (s: Status) => sortOrders(orders.filter((o) => o.status === s), s)
  const rushOpen = orders.filter((o) => o.draft.rush && o.status !== 'Completed').length
  const open = orders.filter((o) => o.status !== 'Completed').length

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-24 pt-5 lg:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Shop side</p>
          <h1 className="font-display text-4xl font-semibold text-ink">Order Board</h1>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-line"><span className="font-semibold">{open}</span> open</span>
          <span className="rounded-full bg-rush-soft px-3 py-1.5 text-rush ring-1 ring-rush/30"><span className="font-semibold">{rushOpen}</span> rush</span>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">Tap an order to move it to the next step. The customer gets a text automatically.</p>

      {desktop ? (
        <div className="mt-5 grid grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <Column key={s} status={s} orders={by(s)} onAdvance={advance} moved={moved} />
          ))}
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-20 -mx-4 mt-4 overflow-x-auto bg-soft px-4 py-2">
            <div role="tablist" className="flex gap-2">
              {STATUSES.map((s) => {
                const count = orders.filter((o) => o.status === s).length
                const rush = orders.some((o) => o.status === s && o.draft.rush)
                return (
                  <button
                    key={s}
                    role="tab"
                    aria-selected={tab === s}
                    onClick={() => setTab(s)}
                    className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${tab === s ? 'bg-ink text-white' : 'bg-white text-ink ring-1 ring-line'}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${COLUMN_TINT[s]}`} />
                    {s}
                    <span className={`tabular-nums ${tab === s ? 'text-white/70' : 'text-muted'}`}>{count}</span>
                    {rush && <span className="h-2 w-2 rounded-full bg-rush" aria-label="has rush orders" />}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-3">
            <Column status={tab} orders={by(tab)} onAdvance={advance} moved={moved} bare />
          </div>
        </>
      )}
    </div>
  )
}

function Column({ status, orders, onAdvance, moved, bare }: { status: Status; orders: Order[]; onAdvance: (o: Order) => void; moved: string | null; bare?: boolean }) {
  return (
    <section className={bare ? '' : 'flex min-h-[60vh] flex-col rounded-2xl bg-canvas p-2.5'}>
      {!bare && (
        <h2 className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-sm font-semibold text-ink">
          <span className={`h-2 w-2 rounded-full ${COLUMN_TINT[status]}`} />
          {status}
          <span className="ml-auto text-muted tabular-nums">{orders.length}</span>
        </h2>
      )}
      <div className="space-y-2.5">
        {orders.map((o) => (
          <Card key={o.id} o={o} onAdvance={onAdvance} highlight={moved === o.id} />
        ))}
        {orders.length === 0 && <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">No orders here</p>}
      </div>
    </section>
  )
}

function Card({ o, onAdvance, highlight }: { o: Order; onAdvance: (o: Order) => void; highlight: boolean }) {
  const t = templateById(o.templateId)
  const i = STATUSES.indexOf(o.status)
  const next = STATUSES[i + 1]
  return (
    <article
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${o.draft.rush ? 'border-rush/50' : 'border-line'} ${highlight ? 'ring-2 ring-accent' : ''}`}
    >
      <button type="button" onClick={() => onAdvance(o)} className="block w-full p-3 text-left hover:bg-soft/60 active:bg-soft">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted">{o.id}</span>
          {o.draft.rush && <span className="rounded bg-rush px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Rush</span>}
          <span className="ml-auto text-xs text-muted">{ago(o.createdAt)}</span>
        </div>
        <p className="mt-1.5 font-semibold leading-snug text-ink">{orderTitle(o)}</p>
        <p className="text-sm text-muted">
          {t?.name}, {o.draft.qty} printed
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-ink">{o.customer.name}</span>
          <span className="font-semibold tabular-nums">{money(o.total)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
          <span className="rounded-full bg-soft px-2 py-0.5 text-muted">{o.fulfillment.method === 'ship' ? 'Ship' : 'Pickup'}</span>
          {o.partner && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{o.partner}</span>}
        </div>
        {next && (
          <p className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-accent">
            Tap to move to {next}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
          </p>
        )}
      </button>
      <div className="flex border-t border-line text-xs font-semibold">
        <Link to={`/shop/email/${o.id}`} className="flex min-h-10 flex-1 items-center justify-center text-muted hover:bg-soft hover:text-ink">
          Order email and print file
        </Link>
      </div>
    </article>
  )
}
