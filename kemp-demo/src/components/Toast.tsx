import { createContext, useCallback, useContext, useRef, useState } from 'react'

interface ToastMsg {
  id: number
  title: string
  body?: string
}

const Ctx = createContext<(title: string, body?: string) => void>(() => {})

export const useToast = () => useContext(Ctx)

/** Bottom toasts that look like a sent text message notification. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([])
  const n = useRef(0)
  const show = useCallback((title: string, body?: string) => {
    const id = ++n.current
    setItems((xs) => [...xs.slice(-2), { id, title, body }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4200)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pb-[max(16px,env(safe-area-inset-bottom))]" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-2xl">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t.title}</span>
              {t.body && <span className="block text-sm text-white/75">{t.body}</span>}
            </span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
