import { getStore } from '@netlify/blobs'
import type { Config } from '@netlify/functions'

/**
 * Daily cleanup of stored designs. Files are kept for 13 months, long enough
 * to reprint an order or reorder next year's Christmas cards, then deleted.
 */
const KEEP_MS = 400 * 24 * 60 * 60 * 1000

export default async () => {
  const store = getStore({ name: 'designs', consistency: 'strong' })
  const { blobs } = await store.list()
  const metas = blobs.filter((b) => b.key.endsWith('/meta'))
  let removed = 0
  for (const m of metas) {
    const meta = (await store.get(m.key, { type: 'json' })) as { createdAt?: number } | null
    if (meta?.createdAt && Date.now() - meta.createdAt < KEEP_MS) continue
    const id = m.key.slice(0, -'/meta'.length)
    for (const b of blobs.filter((x) => x.key.startsWith(`${id}/`))) await store.delete(b.key)
    removed++
  }
  console.log(`designs-cleanup: checked ${metas.length}, removed ${removed}`)
}

export const config: Config = { schedule: '@daily' }
