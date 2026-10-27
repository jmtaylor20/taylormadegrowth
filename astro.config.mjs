// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://taylormadegrowth.com',
  // Emit /services.html (not /services/index.html) so existing URLs and
  // internal ".html" links keep working exactly as before.
  build: {
    format: 'file',
  },
  integrations: [
    sitemap({
      // /golf is a scan-only landing page for the printed scorecard QR code,
      // and the thank-you pages only make sense after a form is sent. Keep
      // them out of the sitemap so they are never submitted for indexing.
      filter: (page) => !page.includes('/golf') && !page.includes('thank-you'),
    }),
  ],
  // Astro's default image service (Sharp) optimizes every <Image>/getImage()
  // asset at build time — no extra config needed.
});
