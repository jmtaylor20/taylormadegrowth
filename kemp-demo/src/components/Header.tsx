import { Link, NavLink } from 'react-router-dom'

export function Header() {
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
          <NavLink to="/" end className={link}>Shop</NavLink>
          <NavLink to="/partners" className={link}>Partners</NavLink>
          <NavLink to="/admin" className={link}>Order Board</NavLink>
        </nav>
      </div>
    </header>
  )
}
