import { useEffect, useRef, useState } from 'react'
import type { Template, TextField } from './types'

export interface PhotoState {
  src: string
  /** Pixel size of src, used to warn about blurry prints. */
  w: number
  h: number
  /** Image center offset from the frame center, in points. */
  ox: number
  oy: number
  /** 1 = the smallest size that fully covers the frame. */
  zoom: number
}

export interface Draft {
  values: Record<string, string>
  photos: Record<string, PhotoState>
}

export function defaultDraft(t: Template): Draft {
  const values: Record<string, string> = {}
  for (const f of t.fields) if (f.type !== 'photo') values[f.id] = (f as TextField).default
  return { values, photos: {} }
}

/*
 * Drafts are saved in IndexedDB, not localStorage: three full-resolution
 * photos are several megabytes, more than localStorage allows.
 */
const DB = 'kemp-editor'
const STORE = 'drafts'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const key = (t: Template) => `draft:v1:${t.id}`

export function clearDraft(t: Template) {
  return idb('readwrite', (s) => s.delete(key(t))).catch(() => undefined)
}

/** Draft state that survives a reload. Saves shortly after each change. */
export function useDraft(t: Template) {
  const [draft, setDraft] = useState<Draft>(() => defaultDraft(t))
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    let alive = true
    idb<Draft | undefined>('readonly', (s) => s.get(key(t)))
      .then((saved) => {
        if (!alive || !saved) return
        // Keep sample text for any field added to the template since the draft was saved.
        setDraft({ values: { ...defaultDraft(t).values, ...saved.values }, photos: saved.photos ?? {} })
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [t])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => idb('readwrite', (s) => s.put(draft, key(t))).catch(() => undefined), 400)
    return () => clearTimeout(timer.current)
  }, [draft, loaded, t])

  return [draft, setDraft, loaded] as const
}
