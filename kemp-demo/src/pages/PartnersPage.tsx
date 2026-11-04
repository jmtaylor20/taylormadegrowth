import { useToast } from '../components/Toast'
import { money } from '../lib/draft'

const RECENT = [
  { id: 'KS-1041', name: 'Mr. Harold James Whitaker', item: 'Rose Garden program, 150', date: 'Nov 4', total: 183.35 },
  { id: 'KS-1034', name: 'Mr. Earl Thomas Patterson', item: 'Evening Slate program, 200', date: 'Oct 31', total: 201.5 },
  { id: 'KS-1027', name: 'Mrs. Bernice Lee Carter', item: 'Classic Ivory program, 100', date: 'Oct 22', total: 133.0 },
  { id: 'KS-1019', name: 'Mr. Walter Ray Simmons', item: 'Classic Ivory program, 150', date: 'Oct 14', total: 164.0 },
]

/** Static mockup of the partner portal for funeral homes and churches. */
export function PartnersPage() {
  const toast = useToast()
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-6 lg:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">For funeral homes and churches</p>
      <h1 className="mt-1 font-display text-4xl font-semibold text-ink sm:text-5xl">Partner Accounts</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Your branding saved once, programs reordered in one tap, and one simple invoice at the end of the month.
      </p>

      <div className="mt-6 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/50 px-4 py-2.5 text-sm text-ink">
        Demo preview of what <span className="font-semibold">Whitfield Family Funeral Home</span> sees when they sign in.
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Saved branding */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Saved branding</h2>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#2e3a46] font-display text-2xl font-semibold text-[#c9a96a]">WF</div>
            <div>
              <p className="font-semibold text-ink">Whitfield Family Funeral Home</p>
              <p className="text-sm text-muted">220 Main Street, Springfield</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {['#2e3a46', '#c9a96a', '#f3f1ec'].map((c) => (
              <span key={c} className="h-8 w-8 rounded-full ring-1 ring-line" style={{ background: c }} title={c} />
            ))}
          </div>
          <ul className="mt-4 space-y-1.5 text-sm text-ink">
            {['Logo and colors on every program', '"Services entrusted to" filled in automatically', 'Preferred paper: 100 lb Matte', 'Rush on by default'].map((x) => (
              <li key={x} className="flex gap-2"><Check />{x}</li>
            ))}
          </ul>
        </section>

        {/* One-click reorder */}
        <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Recent programs</h2>
          <ul className="mt-3 divide-y divide-line">
            {RECENT.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{r.name}</p>
                  <p className="text-sm text-muted">{r.item}  ·  {r.date}</p>
                </div>
                <span className="hidden text-sm font-semibold tabular-nums sm:block">{money(r.total)}</span>
                <button
                  type="button"
                  onClick={() => toast('Reorder placed', `${r.item} for the family of ${r.name}. Added to this month's invoice.`)}
                  className="btn-secondary shrink-0"
                >
                  Reorder
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Need extra copies after a service? One tap reprints the approved program, no new proof needed.</p>
        </section>

        {/* Monthly invoicing */}
        <section className="rounded-2xl border border-line bg-white p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Monthly invoice</h2>
            <span className="rounded-full bg-soft px-2.5 py-1 text-xs font-semibold text-muted">Net 30</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="November so far" value={money(384.85)} />
            <Stat label="Orders" value="2" />
            <Stat label="Invoice date" value="Dec 1" />
          </div>
          <div className="mt-4 rounded-xl bg-soft px-4 py-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">October statement</span><span className="font-semibold tabular-nums">{money(1124.5)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Status</span><span className="font-semibold text-accent">Paid Nov 2</span></div>
          </div>
          <p className="mt-2 text-xs text-muted">No card at checkout for partners. Families never see a bill unless you want them to.</p>
        </section>

        <section className="flex flex-col justify-between rounded-2xl bg-ink p-5 text-white">
          <div>
            <h2 className="font-display text-2xl font-semibold">Become a partner</h2>
            <p className="mt-2 text-sm text-white/75">Built for funeral homes and churches that order often. Priority rush printing included.</p>
          </div>
          <button type="button" onClick={() => toast('Thanks for your interest', 'Demo: in the live store this opens a short application.')} className="btn-primary mt-5 w-full">
            Apply for an account
          </button>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-ink">{value}</p>
    </div>
  )
}

function Check() {
  return <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M5 13l4 4L19 7" /></svg>
}
