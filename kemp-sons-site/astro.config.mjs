// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://kempandsons.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  // React powers the design editor only (/design/*). The rest of the site ships no framework JS.
  integrations: [react()],
})
