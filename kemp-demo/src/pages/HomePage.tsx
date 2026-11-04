import { Link } from 'react-router-dom'
import { CATEGORIES, startingPrice, templatesIn } from '../templates'
import type { Template } from '../templates/types'
import { Thumbnail } from '../components/Thumbnail'
import { money } from '../lib/draft'

/** A printed piece sitting on a soft backdrop, used by category and template cards. */
export function ProductShot({ t, tall = false }: { t: Template; tall?: boolean }) {
  const crop = t.thumbnailCrop ?? { w: t.trim.w, h: t.trim.h }
  const portrait = crop.h >= crop.w
  return (
    <div className={`flex items-center justify-center bg-canvas ${tall ? 'aspect-[4/5]' : 'aspect-[4/3]'} p-5`}>
      <div className={`${portrait ? 'h-full' : 'w-full'} shadow-[0_14px_30px_-14px_rgba(40,35,25,0.55)]`} style={{ aspectRatio: `${crop.w} / ${crop.h}` }}>
        <Thumbnail t={t} className="h-full w-full" />
      </div>
    </div>
  )
}

export function HomePage() {
  return (
    <div>
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:pb-12 sm:pt-14 lg:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Printing for life's important moments</p>
          <h1 className="mt-3 max-w-2xl font-display text-[40px] font-semibold leading-[1.05] text-ink sm:text-6xl">
            Design it on your phone. We'll print it with care.
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
            Pick a template, type your details, and approve your proof. Funeral programs can be ready as soon as tomorrow morning.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/category/funeral" className="btn-primary">Start a funeral program</Link>
            <a href="#categories" className="btn-secondary min-h-12 text-base">Browse all products</a>
          </div>
          <ul className="mt-8 grid gap-3 text-sm text-ink sm:grid-cols-3">
            {[
              ['Rush funeral orders', 'Printed same day or by 9 AM'],
              ['Free proof', 'Nothing prints until you approve'],
              ['Local pickup', 'Or we ship to your door'],
            ].map(([a, b]) => (
              <li key={a} className="flex items-start gap-3 rounded-xl bg-soft px-4 py-3">
                <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 13l4 4L19 7" /></svg>
                <span><span className="block font-semibold">{a}</span><span className="text-muted">{b}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="categories" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-10 lg:px-6">
        <h2 className="font-display text-3xl font-semibold text-ink">What are you printing?</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const ts = templatesIn(c.id)
            const from = Math.min(...ts.map(startingPrice))
            return (
              <Link key={c.id} to={`/category/${c.id}`} className="group overflow-hidden rounded-2xl border border-line bg-white transition hover:border-muted hover:shadow-lg">
                <ProductShot t={ts[0]} />
                <div className="flex items-end justify-between gap-3 p-4">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">{c.name}</h3>
                    <p className="text-sm text-muted">{c.blurb}</p>
                  </div>
                  <span className="shrink-0 text-right text-xs text-muted">
                    from<span className="block text-base font-semibold text-ink">{money(from)}</span>
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
