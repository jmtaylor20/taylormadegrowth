import type { Element, FontFamily, Template, TextStyle } from '../types'

/**
 * Kemp & Sons' own fonts for each funeral program, matched to the InDesign
 * package of the original program each template was rebuilt from (fonts
 * licensed by Kemp; files in /public/fonts/kemp and /public/fonts/pdf).
 *
 * The templates are written with web fonts; this table swaps each role (the
 * name, the headings, the body) to the face Kemp's original used, so all the
 * font decisions live in one place.
 *
 * Some script faces have no numbers or accents (Kurnia, Aston Script,
 * Dayland), so they are only used for names and headings, never dates. If a
 * name ever needs a character a face lacks, the browser fills it in and the
 * print file keeps that line as part of the image.
 */

type Style = Pick<TextStyle, 'font' | 'weight' | 'italic' | 'size' | 'uppercase' | 'letterSpacing' | 'lineHeight'>

interface Rule {
  /** Font the template was written with. */
  from: FontFamily
  /** Which text (the template's {{token}} text, or 'stack:heading' / 'stack:body'). Omit for every use. */
  match?: RegExp
  to: FontFamily
  weight?: number
  italic?: boolean
  /** Size multiplier, since faces differ a lot in apparent size. */
  scale?: number
  uppercase?: boolean
  letterSpacing?: number
  /** Line spacing, for faces with tall loops. */
  lineHeight?: number
  /** Pull a text box in at the top and bottom (inches), so tall swashes stay clear of the lines around it. */
  inset?: number
}

const GARAMOND: FontFamily = 'Adobe Garamond Pro'

/** Cormorant is light, so templates ask for 500/600; Adobe Garamond Regular is the same color. */
function bodyFace(st: Style): Style {
  const w = st.weight ?? 400
  return { ...st, font: GARAMOND, weight: st.italic ? (w >= 700 ? 700 : 400) : w >= 700 ? 600 : 400 }
}

const RULES: Record<string, Rule[]> = {
  // Torbert: adelia name, Ogirema headings
  'funeral-clouds-doves': [{ from: 'Great Vibes', to: 'adelia', scale: 0.8, lineHeight: 1.3, inset: 0.14 }],

  // Banks: Andalusia for the name and headings
  'funeral-pink-floral': [
    { from: 'Great Vibes', to: 'Andalusia', scale: 0.82 },
    { from: 'Playfair Display', match: /lastName/, to: GARAMOND, weight: 600 },
    { from: 'Playfair Display', to: 'Andalusia', weight: 400, italic: false, scale: 1.15, uppercase: false, letterSpacing: 0 },
    { from: 'Montserrat', to: GARAMOND, weight: 600, scale: 1.1 },
  ],

  // Payne: Dayland script, Garamond capitals for the surname, Corsiva for the quote
  'funeral-red-roses': [
    { from: 'Great Vibes', match: /closingQuote/, to: 'Monotype Corsiva', scale: 0.9 },
    { from: 'Great Vibes', match: /givenNames/, to: 'Dayland', scale: 0.92 },
    { from: 'Great Vibes', to: 'Dayland', scale: 0.88 },
    { from: 'Playfair Display', to: GARAMOND, weight: 400 },
  ],

  // White: Kurnia name, Adage Script lead, Mission Script headings
  'funeral-pink-tulips': [
    { from: 'Great Vibes', match: /\{\{name\}\}/, to: 'Kurnia', scale: 1.05 },
    { from: 'Great Vibes', match: /In Loving Memory/, to: 'Adage Script', scale: 0.82 },
    { from: 'Great Vibes', to: 'Mission Script', scale: 0.85 },
  ],

  // Dowdell: the original's script wasn't packaged (only Garamond and Minion), so it stays
  'funeral-purple-lilacs': [],

  // Fuller: Blacksword name and script titles, akaDora lead, Garamond capitals
  'funeral-gold-booklet': [
    { from: 'Great Vibes', match: /coverLead/, to: 'akaDora', scale: 0.8 },
    { from: 'Great Vibes', match: /officiant/, to: 'Monotype Corsiva', scale: 0.85 },
    { from: 'Great Vibes', to: 'Blacksword', scale: 0.85 },
    { from: 'Playfair Display', to: GARAMOND, weight: 600 },
  ],

  // Griffin: Aston Script name and headings
  'funeral-pink-stagger': [
    { from: 'Great Vibes', match: /\{\{name\}\}/, to: 'Aston Script', scale: 0.66, lineHeight: 1.3 },
    { from: 'Great Vibes', match: /stack:heading/, to: 'Aston Script', scale: 0.66, lineHeight: 1.45 },
    { from: 'Great Vibes', to: 'Aston Script', scale: 0.8 },
    { from: 'Montserrat', to: GARAMOND, weight: 600, scale: 1.1 },
  ],

  // Dunn: Blacksword name, Ogirema Bold headings
  'funeral-flag-trifold': [
    { from: 'Great Vibes', to: 'Blacksword', scale: 0.85 },
    { from: 'Playfair Display', match: /coverLead|birthDate/, to: GARAMOND, weight: 400, scale: 1.08 },
    { from: 'Playfair Display', to: 'Ogirema', weight: 700 },
  ],

  // Pitts: Blacksword name, Mission Script titles, Ogirema headings
  'funeral-gone-fishing': [
    { from: 'Great Vibes', match: /\{\{name\}\}/, to: 'Blacksword', scale: 0.85 },
    { from: 'Great Vibes', to: 'Mission Script', scale: 0.9 },
  ],

  // Myhand: Vivace script throughout
  'funeral-flag-tabloid': [{ from: 'Great Vibes', to: 'Vivace', scale: 0.95 }],
}

function restyle<S extends Style>(st: S, text: string, rules: Rule[]): S {
  let out: S = st.font === 'Cormorant Garamond' ? { ...st, ...bodyFace(st) } : st
  const rule = rules.find((r) => r.from === st.font && (!r.match || r.match.test(text)))
  if (rule) {
    out = {
      ...out,
      font: rule.to,
      weight: rule.weight ?? 400,
      italic: rule.italic ?? false,
      ...(rule.scale && out.size ? { size: Math.round(out.size * rule.scale * 2) / 2 } : {}),
      ...(rule.uppercase != null ? { uppercase: rule.uppercase } : {}),
      ...(rule.letterSpacing != null ? { letterSpacing: rule.letterSpacing } : {}),
      ...(rule.lineHeight != null ? { lineHeight: rule.lineHeight } : {}),
    }
  }
  return out
}

function restyleElement(el: Element, rules: Rule[]): Element {
  if (el.type === 'text') {
    const rule = rules.find((r) => r.from === el.font && (!r.match || r.match.test(el.text)))
    let next = restyle(el, el.text, rules)
    if (rule?.inset) next = { ...next, y: next.y + rule.inset, h: Math.max(0.2, next.h - 2 * rule.inset) }
    // Keep the shrink-to-fit floor in proportion when the size changed.
    if (next.size !== el.size && el.minSize) return { ...next, minSize: Math.round(el.minSize * (next.size / el.size) * 2) / 2 }
    return next
  }
  if (el.type === 'stack') return { ...el, heading: restyle(el.heading, 'stack:heading', rules), body: restyle(el.body, 'stack:body', rules) }
  return el
}

/** The template with Kemp's original fonts in place of the web fonts. */
export function withKempFonts(t: Template): Template {
  const rules = RULES[t.id]
  if (!rules) return t
  return { ...t, sides: t.sides.map((s) => ({ ...s, elements: s.elements.map((el) => restyleElement(el, rules)) })) }
}
