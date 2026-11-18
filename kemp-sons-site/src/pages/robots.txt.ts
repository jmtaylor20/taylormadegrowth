import type { APIRoute } from 'astro'

/** Search engines may crawl the store; staff, partner and family pages stay private. */
export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *
Allow: /
Disallow: /staff/
Disallow: /portal/
Disallow: /family/
Disallow: /api/
Disallow: /in-store/

Sitemap: ${new URL('/sitemap.xml', site).href}
`,
    { headers: { 'Content-Type': 'text/plain' } },
  )
