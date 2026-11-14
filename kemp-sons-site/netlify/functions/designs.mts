import { getStore } from '@netlify/blobs'
import type { Config, Context } from '@netlify/functions'

/**
 * Stores each customer's approved design so the shop can download it from
 * the Shopify order:
 *
 *   POST /api/designs              -> { id }   start a design
 *   PUT  /api/designs/:id/:kind    upload one file (once each)
 *   GET  /api/designs/:id/:kind    download it
 *
 * Kinds: pdf (print file), proof (preview image), envelopes (addressed
 * envelopes PDF), draft (the editable design as JSON, for reorders) and
 * photo-<slot> (the customer's photos, for reorders) and cut-<slot> (a
 * photo with its background removed).
 *
 * Ids are random UUIDs, so links can't be guessed. Uploads are only accepted
 * for an hour after the id is created, and never overwrite.
 */

interface Spec { type: string; max: number; magic: number[]; file: string; inline: boolean }
const MB = 1024 * 1024
const PDF = [0x25, 0x50, 0x44, 0x46] // %PDF
const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47]
function specFor(kind: string): Spec | null {
  if (kind === 'pdf') return { type: 'application/pdf', max: 6 * MB, magic: PDF, file: 'print.pdf', inline: false }
  if (kind === 'envelopes') return { type: 'application/pdf', max: 6 * MB, magic: PDF, file: 'envelopes.pdf', inline: false }
  if (kind === 'proof') return { type: 'image/jpeg', max: 2 * MB, magic: JPEG, file: 'proof.jpg', inline: true }
  if (kind === 'draft') return { type: 'application/json', max: 256 * 1024, magic: [0x7b], file: 'design.json', inline: true } // {
  if (/^photo-[a-z0-9_]{1,40}$/.test(kind)) return { type: 'image/jpeg', max: 6 * MB, magic: JPEG, file: `${kind}.jpg`, inline: true }
  // A photo with its background removed (transparent PNG)
  if (/^cut-[a-z0-9_]{1,40}$/.test(kind)) return { type: 'image/png', max: 6 * MB, magic: PNG, file: `${kind}.png`, inline: true }
  return null
}

const UPLOAD_WINDOW_MS = 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export default async (req: Request, context: Context) => {
  const store = getStore({ name: 'designs', consistency: 'strong' })
  const { id, kind } = context.params as { id?: string; kind?: string }

  if (!id) {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const newId = crypto.randomUUID()
    await store.setJSON(`${newId}/meta`, { createdAt: Date.now() })
    return json({ id: newId }, 201)
  }

  const spec = kind ? specFor(kind) : null
  if (!UUID.test(id) || !spec) return json({ error: 'Not found' }, 404)
  const key = `${id}/${kind}`

  if (req.method === 'GET') {
    const blob = await store.get(key, { type: 'arrayBuffer' })
    if (!blob) return json({ error: 'Not found' }, 404)
    return new Response(blob, {
      headers: {
        'Content-Type': spec.type,
        'Content-Disposition': `${spec.inline ? 'inline' : 'attachment'}; filename="kemp-${id.slice(0, 8)}-${spec.file}"`,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Robots-Tag': 'noindex',
      },
    })
  }

  if (req.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)
  const meta = (await store.get(`${id}/meta`, { type: 'json' })) as { createdAt: number } | null
  if (!meta || Date.now() - meta.createdAt > UPLOAD_WINDOW_MS) return json({ error: 'Upload window closed' }, 403)
  if (await store.getMetadata(key)) return json({ error: 'Already uploaded' }, 409)

  const body = new Uint8Array(await req.arrayBuffer())
  if (body.byteLength === 0 || body.byteLength > spec.max) return json({ error: 'Bad size' }, 413)
  if (!spec.magic.every((b, i) => body[i] === b)) return json({ error: 'Bad file type' }, 415)

  await store.set(key, body.buffer as ArrayBuffer)
  return json({ ok: true })
}

export const config: Config = {
  path: ['/api/designs', '/api/designs/:id/:kind'],
}
