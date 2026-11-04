import type { Template } from '../templates/types'
import { money, priceFor, type Draft } from '../lib/draft'

interface Props {
  template: Template
  draft: Draft
  onChange: (patch: Partial<Pick<Draft, 'qty' | 'paper' | 'rush'>>) => void
}

export function OptionsPanel({ template: t, draft, onChange }: Props) {
  const price = priceFor(t, draft)
  return (
    <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">Options</h3>

      <p className="mb-2 text-sm font-medium text-ink">Quantity</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {t.quantities.map((q) => {
          const active = q.qty === draft.qty
          return (
            <button
              key={q.qty}
              type="button"
              onClick={() => onChange({ qty: q.qty })}
              className={`min-h-14 rounded-xl border px-2 py-2 text-center transition ${
                active ? 'border-accent bg-accent-soft text-ink ring-1 ring-accent' : 'border-line bg-white text-ink hover:border-muted'
              }`}
              aria-pressed={active}
            >
              <span className="block text-base font-semibold">{q.qty}</span>
              <span className="block text-xs text-muted">{money(q.price)}</span>
            </button>
          )
        })}
      </div>

      <p className="mb-2 mt-5 text-sm font-medium text-ink">{t.paperLabel ?? 'Paper'}</p>
      <div className="space-y-2">
        {t.papers.map((p) => {
          const active = p.id === draft.paper
          const up = p.multiplier > 1 ? `+${Math.round((p.multiplier - 1) * 100)}%` : 'Included'
          return (
            <label
              key={p.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${
                active ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:border-muted'
              }`}
            >
              <input type="radio" name="paper" className="radio" checked={active} onChange={() => onChange({ paper: p.id })} />
              <span className="flex-1">
                <span className="block text-sm font-medium text-ink">{p.label}</span>
                {p.detail && <span className="block text-xs text-muted">{p.detail}</span>}
              </span>
              <span className="text-xs font-medium text-muted">{up}</span>
            </label>
          )
        })}
      </div>

      {t.rush && (
        <label
          className={`mt-5 flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition ${
            draft.rush ? 'border-rush bg-rush-soft ring-1 ring-rush' : 'border-line hover:border-muted'
          }`}
        >
          <input type="checkbox" className="check" checked={draft.rush} onChange={(e) => onChange({ rush: e.target.checked })} />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-ink">{t.rush.label}</span>
            <span className="block text-xs text-muted">{t.rush.detail}</span>
          </span>
          <span className="text-sm font-semibold text-ink">+{money(t.rush.price)}</span>
        </label>
      )}

      <dl className="mt-5 space-y-1 border-t border-line pt-4 text-sm">
        <Row label={`${draft.qty} printed`} value={money(price.base)} />
        {price.paperUpcharge > 0 && <Row label="Paper upgrade" value={money(price.paperUpcharge)} />}
        {price.rush > 0 && <Row label="Rush" value={money(price.rush)} />}
        <div className="flex items-baseline justify-between pt-2">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="text-xl font-semibold tabular-nums text-ink">{money(price.total)}</dd>
        </div>
        <p className="text-right text-xs text-muted tabular-nums">{money(price.each)} each</p>
      </dl>
    </section>
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
