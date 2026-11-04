import { Link, useParams } from 'react-router-dom'
import { templateById } from '../templates'
import { money } from '../lib/draft'
import { orderTitle, useOrders } from '../lib/orders'

export function ConfirmationPage() {
  const { orderId } = useParams()
  const [orders] = useOrders()
  const o = orders.find((x) => x.id === orderId)
  if (!o) return <p className="p-6">That order could not be found.</p>
  const t = templateById(o.templateId)!
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="rounded-2xl border border-line bg-white p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="mt-4 font-display text-3xl font-semibold">Thank you, {o.customer.name.split(' ')[0]}</h1>
        <p className="mt-1 text-muted">Your order is in. We're on it.</p>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Order number</p>
        <p className="font-mono text-3xl font-semibold tracking-wide text-ink">{o.id}</p>
        <dl className="mt-6 space-y-1.5 border-t border-line pt-4 text-left text-sm">
          <Row label="Item" value={`${t.name}, ${o.draft.qty} printed`} />
          <Row label="For" value={orderTitle(o)} />
          <Row label={o.fulfillment.method === 'ship' ? 'Shipping to' : 'Pickup'} value={o.fulfillment.method === 'ship' ? o.fulfillment.address! : 'Kemp & Sons'} />
          {o.draft.rush && <Row label="Rush" value="Same day or by 9 AM" />}
          <Row label="Total" value={`${money(o.total)} (Demo: no charge)`} />
        </dl>
        <p className="mt-5 rounded-xl bg-soft px-4 py-3 text-sm text-ink">
          We'll text <span className="font-semibold">{o.customer.phone}</span> as soon as your order is ready.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/60 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Demo: the shop side</p>
        <p className="mt-1 text-sm text-ink">See what Kemp &amp; Sons receives for this order and where it lands on the board.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link to={`/shop/email/${o.id}`} className="btn-primary">See the order email</Link>
          <Link to="/admin" className="btn-secondary min-h-12 text-base">Open the Order Board</Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  )
}
