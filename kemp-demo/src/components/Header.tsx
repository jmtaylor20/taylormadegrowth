import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useResetDemo } from './DemoGuide'

const LINKS = [
  { to: '/', label: 'Shop', end: true },
  { to: '/partners', label: 'Partners' },
  { to: '/admin', label: 'Order Board' },
]

export function Header() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const reset = useResetDemo()
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'text-ink' : 'text-muted hover:text-ink'}`
  return (
    <header className="relative z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 lg:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-[26px] font-bold leading-none tracking-tight text-ink">Kemp &amp; Sons</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">Demo</span>
        </Link>
        <nav className="hidden items-center sm:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={link}>{l.label}</NavLink>
          ))}
          <button type="button" onClick={reset} className="ml-2 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink">Reset Demo</button>
        </nav>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink sm:hidden"
          aria-expanded={open}
          aria-label="Menu"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <nav className="border-t border-line bg-white px-2 pb-3 pt-1 sm:hidden">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `flex min-h-12 items-center rounded-xl px-3 text-base font-medium ${isActive ? 'bg-soft text-ink' : 'text-ink'}`}>
              {l.label}
            </NavLink>
          ))}
          <button type="button" onClick={reset} className="flex min-h-12 w-full items-center rounded-xl px-3 text-base font-medium text-muted">
            Reset Demo
          </button>
        </nav>
      )}
    </header>
  )
}
