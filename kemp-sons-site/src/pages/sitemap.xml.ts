import type { APIRoute } from 'astro'
import { productLines } from '../config/site'
import { TEMPLATES, templatesIn } from '../editor/templates'

/**
 * Public pages for search engines: home, each product line with online
 * designs, and every design. Staff, partner and family pages are
 * left out (and blocked in robots.txt).
 */
export const GET: APIRoute = ({ site }) => {
  const url = (p: string) => new URL(p, site).href
  const pages = [
    { loc: url('/'), priority: '1.0' },
    { loc: url('/start/'), priority: '0.9' },
    ...productLines.filter((l) => templatesIn(l.collection).length).map((l) => ({ loc: url(`/shop/${l.collection}/`), priority: '0.9' })),
    ...TEMPLATES.map((t) => ({ loc: url(`/design/${t.id}/`), priority: '0.8' })),
    { loc: url('/reorder/'), priority: '0.4' },
    ...['refunds', 'shipping', 'privacy', 'terms'].map((p) => ({ loc: url(`/${p}/`), priority: '0.2' })),
  ]
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${p.loc}</loc><priority>${p.priority}</priority></url>`).join('\n')}
</urlset>
`
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } })
}
