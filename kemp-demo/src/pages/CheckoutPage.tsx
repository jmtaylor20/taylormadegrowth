import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { templateById } from '../templates'
import { useCart } from '../lib/cart'
import { money, priceFor } from '../lib/draft'
import { getOrders, nextOrderId, SHIPPING_FEE, type Order } from '../lib/orders'
import { readKey, writeKey } from '../lib/store'
import { renderSide } from '../lib/render'

export function CheckoutPage() {
  const navigate = useNavigate()
  const [cart, setCart] = useCart()
  const t = cart ? templateById(cart.templateId) : undefined
  const saved = readKey('customer', { name: '', phone: '', email: '' })
  const [name, setName] = useState(saved.name)
  const [phone, setPhone] = useState(saved.phone)
  const [email, setEmail] = useState(saved.email)
  const [method, setMethod] = useState<'pickup' | 'ship'>('pickup')
  const [address, setAddress] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [placing, setPlacing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!cart || !t) return
    const side = t.sides.find((s) => s.id === t.thumbnailSide) ?? t.sides[0]
    renderSide(t, side, cart.draft.values, cart.draft.photos, { mode: 'trim', ppi: 300 / Math.max(t.trim.w, t.trim.h) * 1.5 }).then(setPreview)
  }, [cart, t])

  if (!cart || !t) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold">Nothing to check out yet</h1>
        <p className="mt-2 text-muted">Pick a design, personalize it and approve your proof first.</p>
        <Link to="/" className="btn-primary mt-6">Browse designs</Link>
      </div>
    )
  }

  const price = priceFor(t, cart.draft)
  const paper = t.papers.find((p) => p.id === cart.draft.paper) ?? t.papers[0]
  const shipping = method === 'ship' ? SHIPPING_FEE : 0
  const total = price.total + shipping
  const contactOk = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 10 && /\S+@\S+\.\S+/.test(email) && (method === 'pickup' || address.trim().length > 5)

  const place = async () => {
    setPlacing(true)
    await new Promise((r) => setTimeout(r, 900)) // feels like a real payment
    const orders = getOrders()
    const order: Order = {
      id: nextOrderId(orders),
      createdAt: new Date().toISOString(),
      status: 'New',
      templateId: t.id,
      draft: cart.draft,
      price,
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
      fulfillment: method === 'ship' ? { method, address: address.trim() } : { method },
      shippingFee: shipping,
      total,
    }
    writeKey('orders', [order, ...orders])
    writeKey('customer', order.customer)
    writeKey('lastOrder', order.id)
    setCart(null)
    navigate(`/order/${order.id}`)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 lg:px-6">
      <h1 className="font-display text-4xl font-semibold text-ink">Checkout</h1>
      <ol className="mt-3 flex gap-2 text-sm font-medium">
        {['Contact and delivery', 'Payment'].map((s, i) => (
          <li key={s} className={`flex items-center gap-2 rounded-full px-3 py-1 ${step === i + 1 ? 'bg-ink text-white' : 'bg-white text-muted ring-1 ring-line'}`}>
            <span className="tabular-nums">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {step === 1 ? (
            <>
              <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your details</h2>
                <div className="space-y-4">
                  <Field label="Full name"><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Field label="Mobile phone" hint="We text you when your order is ready.">
                    <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-0123" />
                  </Field>
                  <Field label="Email"><input className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Pickup or shipping</h2>
                <div className="space-y-2">
                  {([
                    ['pickup', 'Pick up at Kemp & Sons', cart.draft.rush ? 'Rush order: ready same day or by 9 AM' : 'Usually ready in 1 to 2 business days', 'Free'],
                    ['ship', 'Ship to me', 'Arrives in 3 to 5 business days', money(SHIPPING_FEE)],
                  ] as const).map(([id, label, detail, cost]) => (
                    <label key={id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${method === id ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line'}`}>
                      <input type="radio" name="method" className="radio" checked={method === id} onChange={() => setMethod(id)} />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-ink">{label}</span>
                        <span className="block text-xs text-muted">{detail}</span>
                      </span>
                      <span className="text-sm font-medium">{cost}</span>
                    </label>
                  ))}
                </div>
                {method === 'ship' && (
                  <div className="mt-4">
                    <Field label="Shipping address">
                      <textarea className="input resize-none" rows={2} autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} />
                    </Field>
                  </div>
                )}
              </section>

              <button type="button" className="btn-primary w-full" disabled={!contactOk} onClick={() => setStep(2)}>
                Continue to payment
              </button>
            </>
          ) : (
            <>
              <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></svg>
                  Demo: no charge. No card is needed and nothing is billed.
                </div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Payment</h2>
                <div className="space-y-3 opacity-70" aria-hidden="true">
                  <div className="input text-muted">4242 4242 4242 4242</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="input text-muted">12 / 29</div>
                    <div className="input text-muted">123</div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted">On the live Shopify store this is Shopify's secure checkout.</p>
              </section>
              <div className="flex gap-3">
                <button type="button" className="btn-secondary min-h-12" onClick={() => setStep(1)}>Back</button>
                <button type="button" className="btn-primary flex-1" disabled={placing} onClick={place}>
                  {placing ? 'Placing order...' : `Place order (Demo: no charge)`}
                </button>
              </div>
            </>
          )}
        </div>

        <aside className="order-first h-fit rounded-2xl lg:order-none border border-line bg-white p-4 sm:p-5 lg:sticky lg:top-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Your order</h2>
          <div className="flex gap-3">
            <div className="w-20 shrink-0 bg-canvas p-1.5">
              {preview ? <img src={preview} alt="" className="w-full shadow" /> : <div className="aspect-[3/4] w-full animate-pulse bg-line" />}
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink">{t.name}</p>
              <p className="text-muted">{t.sizeLabel}</p>
              <p className="text-muted">{cart.draft.qty} on {paper.label}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 13l4 4L19 7" /></svg>
                Proof approved
              </p>
            </div>
          </div>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            <Row label={`${cart.draft.qty} printed`} value={money(price.base)} />
            {price.paperUpcharge > 0 && <Row label="Paper upgrade" value={money(price.paperUpcharge)} />}
            {price.rush > 0 && <Row label="Rush" value={money(price.rush)} />}
            <Row label={method === 'ship' ? 'Shipping' : 'Pickup'} value={shipping ? money(shipping) : 'Free'} />
            <div className="flex items-baseline justify-between pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-semibold tabular-nums">{money(total)}</dd>
            </div>
          </dl>
          {cart.draft.rush && (
            <p className="mt-3 rounded-lg bg-rush-soft px-3 py-2 text-xs font-semibold text-rush">Rush order: printed same day or by 9 AM</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
