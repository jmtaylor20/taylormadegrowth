import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tiny localStorage-backed store. Every key is namespaced under "kemp:" so
 * Reset Demo can clear exactly what the demo wrote.
 */

const PREFIX = 'kemp:'
const listeners = new Map<string, Set<() => void>>()
const memory = new Map<string, unknown>()

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn())
}

export function readKey<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T
  let value = fallback
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw != null) value = JSON.parse(raw) as T
  } catch {
    /* private mode or corrupt value: use fallback */
  }
  memory.set(key, value)
  return value
}

export function writeKey<T>(key: string, value: T) {
  memory.set(key, value)
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Quota exceeded (usually large photos). Keep it in memory for this
    // session so the demo still works; it just will not survive a reload.
  }
  emit(key)
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
  const keys = [...memory.keys()]
  memory.clear()
  keys.forEach(emit)
}

export function useStored<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (fn: () => void) => {
      if (!listeners.has(key)) listeners.set(key, new Set())
      listeners.get(key)!.add(fn)
      return () => listeners.get(key)!.delete(fn)
    },
    [key],
  )
  const value = useSyncExternalStore(subscribe, () => readKey(key, fallback))
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = readKey(key, fallback)
      writeKey(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
    },
    // fallback is intentionally excluded: callers pass fresh literals.
    [key],
  )
  return [value, set]
}
