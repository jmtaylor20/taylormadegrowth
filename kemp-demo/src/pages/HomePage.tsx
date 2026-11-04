import { Link } from 'react-router-dom'
import { TEMPLATES } from '../templates'

/** Temporary index for step one. Replaced by the storefront in step three. */
export function HomePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="font-display text-3xl font-semibold">Templates</h1>
      {TEMPLATES.map((t) => (
        <Link key={t.id} to={`/editor/${t.id}`} className="block rounded-2xl border border-line bg-white p-4 hover:border-muted">
          <p className="font-semibold">{t.name}</p>
          <p className="text-sm text-muted">{t.sizeLabel}</p>
        </Link>
      ))}
    </div>
  )
}
