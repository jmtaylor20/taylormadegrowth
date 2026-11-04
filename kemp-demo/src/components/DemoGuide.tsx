import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { clearAll, readKey } from '../lib/store'
import { resetDemoData } from '../lib/orders'
import { useToast } from './Toast'

const STEPS = [
  { title: 'Pick a template', body: 'Start in Funeral Programs and choose a design.', to: '/category/funeral', match: ['/', '/category'] },
  { title: 'Edit it live', body: 'Type a name and watch the program update. Add a photo and drag it into place.', to: '/editor/funeral-rose-garden', match: ['/editor'] },
  { title: 'Approve the proof', body: 'Tap Review Proof, tick the three checks, approve, and check out (no charge).', to: '/proof/funeral-rose-garden', match: ['/proof', '/checkout', '/order'] },
  { title: 'See the shop side', body: 'Open the order email, download the print file, and move orders on the board.', to: '/admin', match: ['/shop', '/admin', '/partners'] },
]

/** Resets everything the demo stored and re-seeds the sample orders. */
export function useResetDemo() {
  const navigate = useNavigate()
  const toast = useToast()
  return () => {
    if (!window.confirm('Reset the demo? This clears designs and orders and restores the sample orders.')) return
    clearAll()
    resetDemoData()
    navigate('/')
    window.scrollTo(0, 0)
    toast('Demo reset', 'Sample orders restored. Ready for a fresh walkthrough.')
  }
}

export function DemoGuide() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const reset = useResetDemo()
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // The proof is a full-screen step of its own.
  if (pathname.startsWith('/proof')) return null
  const current = STEPS.findIndex((s) => s.match.some((m) => (m === '/' ? pathname === '/' : pathname.startsWith(m))))
  const onEditor = pathname.startsWith('/editor')
  const lastOrder = readKey<string | null>('lastOrder', null)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-ink text-sm font-semibold text-white shadow-xl ring-1 ring-white/10 transition hover:bg-black lg:bottom-6 lg:px-4 ${
          onEditor ? 'bottom-[calc(88px+env(safe-area-inset-bottom))] min-w-12 justify-center px-0' : 'bottom-[max(16px,env(safe-area-inset-bottom))] px-4'
        }`}
        aria-haspopup="dialog"
        aria-label="Demo Guide"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-xs">{current >= 0 ? current + 1 : '?'}</span>
        <span className={onEditor ? 'hidden lg:inline' : ''}>Demo Guide</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Demo guide"
            onClick={(e) => e.stopPropagation()}
            className="toast-in w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-ink">Demo Guide</h2>
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost -mr-2">Close</button>
            </div>
            <ol className="mt-3 space-y-2">
              {STEPS.map((s, i) => {
                const to = i === 3 && lastOrder ? `/shop/email/${lastOrder}` : s.to
                return (
                  <li key={s.title}>
                    <Link
                      to={to}
                      className={`flex gap-3 rounded-2xl border p-3 transition hover:border-muted ${i === current ? 'border-accent bg-accent-soft' : 'border-line'}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === current ? 'bg-accent text-white' : 'bg-soft text-ink'}`}>{i + 1}</span>
                      <span>
                        <span className="block font-semibold text-ink">{s.title}</span>
                        <span className="block text-sm text-muted">{s.body}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ol>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
              <Link to="/partners" className="text-sm font-semibold text-accent">Partner Accounts</Link>
              <button type="button" onClick={reset} className="btn-secondary">Reset Demo</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
