import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { templateById } from '../templates'
import { money } from '../lib/draft'
import { orderTitle, useOrders, type Order } from '../lib/orders'
import { renderSide } from '../lib/render'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Exactly what lands in the Kemp & Sons inbox when an order is placed. */
export function OrderEmailPage() {
  const { orderId } = useParams()
  const [orders] = useOrders()
  const o = orders.find((x) => x.id === orderId)
  if (!o) return <p className="p-6">That order could not be found.</p>
  return <Email o={o} />
}

function Email({ o }: { o: Order }) {
  const t = templateById(o.templateId)!
  const paper = t.papers.find((p) => p.id === o.draft.paper) ?? t.papers[0]
  const [previews, setPreviews] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const subject = `${o.draft.rush ? '[RUSH] ' : ''}New order ${o.id}: ${t.name}, ${o.draft.qty} printed`

  useEffect(() => {
    let alive = true
    Promise.all(t.sides.map((s) => renderSide(t, s, o.draft.values, o.draft.photos, { mode: 'trim', ppi: 560 / t.trim.w, quality: 0.85 }))).then(
      (p) => alive && setPreviews(p),
    )
    return () => {
      alive = false
    }
  }, [o, t])

  const download = async () => {
    setDone(null)
    try {
      setStatus('Preparing')
      // jsPDF is loaded only when a print file is actually requested.
      const { downloadPrintPdf } = await import('../lib/pdf')
      const r = await downloadPrintPdf(o, setStatus)
      setDone(`${r.fileName} (${(r.bytes / 1_000_000).toFixed(1)} MB, ${r.ppi} ppi)`)
    } catch {
      setDone('Could not build the print file on this device.')
    } finally {
      setStatus(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-5 sm:px-6">
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted">Demo: the email Kemp &amp; Sons receives</p>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        {/* Inbox chrome */}
        <div className="border-b border-line bg-soft px-4 py-3 text-sm">
          <p className="font-semibold text-ink">{subject}</p>
          <div className="mt-1 flex flex-wrap justify-between gap-x-4 text-xs text-muted">
            <span>From: Kemp &amp; Sons Online Store</span>
            <span>{when(o.createdAt)}</span>
          </div>
          <p className="text-xs text-muted">To: Kemp &amp; Sons Orders</p>
        </div>

        {/* Email body (table-like, as a real order notification would be) */}
        <div className="px-4 py-5 sm:px-8">
          {o.draft.rush && (
            <div className="mb-4 rounded-lg bg-rush px-4 py-3 text-white">
              <p className="text-sm font-bold uppercase tracking-wider">Rush order</p>
              <p className="text-sm">Customer was promised same day or by 9 AM tomorrow.</p>
            </div>
          )}
          <p className="text-base text-ink">
            You have a new order, <span className="font-semibold">{o.id}</span>. The customer approved the proof below.
          </p>

          <a
            href="#download"
            onClick={(e) => {
              e.preventDefault()
              if (!status) download()
            }}
            id="download"
            className={`mt-4 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-base font-semibold text-white transition hover:bg-black ${status ? 'opacity-80' : ''}`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" /></svg>
            {status ? `${status}...` : 'Download print file'}
          </a>
          <p className="mt-1.5 min-h-5 text-center text-xs text-muted" aria-live="polite">
            {done ?? `PDF, trim ${t.trim.w} x ${t.trim.h} in with 0.125 in bleed and crop marks, ${t.sides.length} ${t.sides.length === 1 ? 'page' : 'pages'}`}
          </p>

          <Section title="Customer">
            <Row k="Name" v={o.customer.name} />
            <Row k="Phone" v={o.customer.phone} />
            <Row k="Email" v={o.customer.email} />
            {o.partner && <Row k="Partner account" v={o.partner} />}
          </Section>

          <Section title="Product">
            <Row k="Item" v={`${t.name} (${t.category === 'funeral' ? 'Funeral program' : t.sizeLabel})`} />
            <Row k="For" v={orderTitle(o)} />
            <Row k="Size" v={t.sizeLabel} />
            <Row k="Quantity" v={String(o.draft.qty)} />
            <Row k={t.paperLabel ?? 'Paper'} v={paper.label} />
            <Row k="Rush" v={o.draft.rush ? 'YES' : 'No'} strong={o.draft.rush} />
            <Row k="Fulfillment" v={o.fulfillment.method === 'ship' ? `Ship to ${o.fulfillment.address}` : 'Customer pickup'} />
          </Section>

          <Section title="Totals">
            <Row k={`${o.draft.qty} printed`} v={money(o.price.base)} />
            {o.price.paperUpcharge > 0 && <Row k="Paper upgrade" v={money(o.price.paperUpcharge)} />}
            {o.price.rush > 0 && <Row k="Rush" v={money(o.price.rush)} />}
            {o.shippingFee > 0 && <Row k="Shipping" v={money(o.shippingFee)} />}
            <Row k="Total" v={money(o.total)} strong />
          </Section>

          <Section title="Approved proof">
            <div className="space-y-3">
              {t.sides.map((s, i) => (
                <figure key={s.id}>
                  {previews[i] ? <img src={previews[i]} alt={`${s.label} proof`} className="w-full border border-line" /> : <div className="w-full animate-pulse bg-soft" style={{ aspectRatio: `${t.trim.w} / ${t.trim.h}` }} />}
                  <figcaption className="mt-1 text-xs text-muted">{s.label}</figcaption>
                </figure>
              ))}
            </div>
          </Section>

          <p className="mt-6 border-t border-line pt-4 text-xs text-muted">
            Sent automatically by your online store. Manage this order on the{' '}
            <Link to="/admin" className="font-semibold text-accent underline">Order Board</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 border-b border-line pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <dl className="space-y-1 text-sm">{children}</dl>
    </section>
  )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={strong ? 'font-semibold text-ink' : 'text-ink'}>{v}</dd>
    </div>
  )
}
