import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/600-italic.css'
import '@fontsource/cormorant-garamond/700.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/400-italic.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/800.css'
import { invalidateTextCache } from './textFit'

const FACES = [
  '400 16px "Cormorant Garamond"', 'italic 400 16px "Cormorant Garamond"', '500 16px "Cormorant Garamond"',
  '600 16px "Cormorant Garamond"', 'italic 600 16px "Cormorant Garamond"', '700 16px "Cormorant Garamond"',
  '400 16px "Playfair Display"', 'italic 400 16px "Playfair Display"', '600 16px "Playfair Display"', '700 16px "Playfair Display"',
  '400 16px "Great Vibes"',
  '400 16px "Montserrat"', '500 16px "Montserrat"', '600 16px "Montserrat"', '700 16px "Montserrat"', '800 16px "Montserrat"',
  '400 16px "Inter"', '500 16px "Inter"', '600 16px "Inter"', '700 16px "Inter"',
]

let ready: Promise<void> | null = null

/** Loads every face the templates use so canvas measurement is accurate. */
export function loadFonts(): Promise<void> {
  if (!ready) {
    ready = Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => invalidateTextCache())
  }
  return ready
}
