import '@fontsource/rye/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/600-italic.css'
import '@fontsource/cormorant-garamond/700.css'
import '@fontsource/cormorant-garamond/700-italic.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/400-italic.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import './kemp-fonts.css'
import { fontString, invalidateTextCache } from './textFit'
import type { Template, TextStyle } from './types'

/** Every face the templates use. Add new faces here and in FontFamily (types.ts). */
const FACES = [
  '400 16px "Rye"',
  '400 16px "Ogirema"', '700 16px "Ogirema"', 'italic 400 16px "Ogirema"',
  '500 16px "Cormorant Garamond"', '600 16px "Cormorant Garamond"', 'italic 600 16px "Cormorant Garamond"', '700 16px "Cormorant Garamond"', 'italic 700 16px "Cormorant Garamond"',
  '400 16px "Playfair Display"', 'italic 400 16px "Playfair Display"', '700 16px "Playfair Display"',
  '400 16px "Great Vibes"',
  '400 16px "Montserrat"', '500 16px "Montserrat"', '600 16px "Montserrat"', '700 16px "Montserrat"',
  // Kemp's own fonts (see kemp-fonts.css)
  '400 16px "Adobe Garamond Pro"',
  'italic 400 16px "Adobe Garamond Pro"',
  '600 16px "Adobe Garamond Pro"',
  '700 16px "Adobe Garamond Pro"',
  'italic 700 16px "Adobe Garamond Pro"',
  '400 16px "Minion Pro"',
  '400 16px "adelia"',
  '400 16px "Andalusia"',
  '400 16px "Mission Script"',
  '400 16px "Dayland"',
  '400 16px "Kurnia"',
  '400 16px "Aston Script"',
  '400 16px "Blacksword"',
  '400 16px "akaDora"',
  '400 16px "Vivace"',
  '400 16px "Monotype Corsiva"',
  '400 16px "Adage Script"',
  '400 16px "Birmingham Script"',
]

const loaded = new Map<string, Promise<void>>()

/** The faces a template's text uses (font strings for document.fonts.load). */
export function facesOf(t: Template): string[] {
  const out = new Set<string>()
  const add = (st: Pick<TextStyle, 'font' | 'weight' | 'italic'>) => out.add(fontString(st, 16))
  for (const side of t.sides)
    for (const el of side.elements) {
      if (el.type === 'text') add(el)
      if (el.type === 'stack') {
        add(el.heading)
        add(el.body)
      }
    }
  return [...out]
}

/**
 * Loads fonts so canvas measurement is accurate before the first draw. With a
 * template, only the faces it uses are fetched (Kemp's script fonts are big).
 */
export function loadFonts(t?: Template): Promise<void> {
  const faces = t ? facesOf(t) : FACES
  const key = t ? t.id : '*'
  let p = loaded.get(key)
  if (!p) {
    p = Promise.all(faces.map((f) => document.fonts.load(f).catch(() => [])))
      .then(() => document.fonts.ready)
      .then(() => invalidateTextCache())
    loaded.set(key, p)
  }
  return p
}
