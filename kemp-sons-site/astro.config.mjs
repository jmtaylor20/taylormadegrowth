// @ts-check
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://kempandsons.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
})
