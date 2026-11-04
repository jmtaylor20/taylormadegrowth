import { Link, useParams } from 'react-router-dom'
import { CATEGORIES, startingPrice, templatesIn } from '../templates'
import { money } from '../lib/draft'
import { ProductShot } from './HomePage'

export function CategoryPage() {
  const { categoryId } = useParams()
  const c = CATEGORIES.find((x) => x.id === categoryId)
  if (!c) return <p className="p-6">That category could not be found.</p>
  const ts = templatesIn(c.id)
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <nav className="text-sm text-muted">
        <Link to="/" className="hover:text-ink">Home</Link>
      </nav>
      <h1 className="mt-1 font-display text-4xl font-semibold text-ink">{c.name}</h1>
      <p className="mt-1 text-muted">{c.blurb}</p>
      {c.id === 'funeral' && (
        <p className="mt-4 rounded-xl bg-rush-soft px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Need it fast?</span> Choose Rush at checkout and we'll have your programs printed the same day or by 9 AM the next morning.
        </p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ts.map((t) => (
          <Link key={t.id} to={`/editor/${t.id}`} className="group overflow-hidden rounded-2xl border border-line bg-white transition hover:border-muted hover:shadow-lg">
            <ProductShot t={t} tall={t.category === 'funeral' || t.trim.h > t.trim.w} />
            <div className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold text-ink">{t.name}</h2>
                <span className="shrink-0 text-sm text-muted">
                  from <span className="font-semibold text-ink">{money(startingPrice(t))}</span>
                </span>
              </div>
              <p className="text-sm text-muted">{t.sizeLabel}</p>
              <p className="mt-2 text-sm text-ink/80">{t.description}</p>
              <span className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent group-hover:underline">Personalize this design</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
