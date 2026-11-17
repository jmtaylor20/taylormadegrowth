import { GState, type jsPDF } from 'jspdf'
import type { Element, Side, StackEl, TextEl, TextStyle } from './types'
import { fillTokens, fitStack, fitText, fontString } from './textFit'
import type { PhotoState } from './draft'

/**
 * Real (vector) text for the print file. The artwork and photos are still a
 * high-resolution image, but text is drawn on top as PDF text with the
 * fonts embedded, so it prints as crisp as InDesign type at any size.
 *
 * Layout comes from the same fitText/fitStack math the editor and proof use,
 * and line positions follow Konva's own rules, so the print matches the
 * proof. Text that anything is drawn on top of, or that is rotated, stays in
 * the image instead, so stacking order is always exactly what was approved.
 */

const PT = 72

/** TrueType files for each face (converted from the web fonts, in /public/fonts/pdf). */
function fontFile(style: Pick<TextStyle, 'font' | 'weight' | 'italic'>) {
  const slug = style.font.toLowerCase().replace(/\s+/g, '-')
  return `${slug}-${style.weight ?? 400}-${style.italic ? 'italic' : 'normal'}.ttf`
}

const fontData = new Map<string, Promise<string>>()
function loadFont(file: string) {
  let p = fontData.get(file)
  if (!p) {
    p = fetch(`/fonts/pdf/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Font ${file} missing`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        // jsPDF wants the font as a binary string (base64 below).
        const bytes = new Uint8Array(buf)
        let s = ''
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        return btoa(s)
      })
    p.catch(() => fontData.delete(file))
    fontData.set(file, p)
  }
  return p
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Rough page box of an element in inches (generous, so overlap checks err toward the image). */
function boxOf(el: Element): Box | null {
  switch (el.type) {
    case 'rect':
    case 'photo':
    case 'image':
    case 'text':
    case 'stack': {
      // Photo borders and shadows reach a little past the frame.
      const pad = el.type === 'photo' ? (el.mat ?? 0) + (el.shadow ? 0.08 : 0) : 0
      const corners = [
        [-pad, -pad],
        [el.w + pad, -pad],
        [-pad, el.h + pad],
        [el.w + pad, el.h + pad],
      ]
      // Rotation is about the element's top-left corner (Konva's rule).
      const a = ((el.rotation ?? 0) * Math.PI) / 180
      const pts = corners.map(([cx, cy]) => [el.x + cx * Math.cos(a) - cy * Math.sin(a), el.y + cx * Math.sin(a) + cy * Math.cos(a)])
      return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) }
    }
    case 'ellipse':
      return { x0: el.x - el.rx, y0: el.y - el.ry, x1: el.x + el.rx, y1: el.y + el.ry }
    case 'star':
      return { x0: el.x - el.outerRadius, y0: el.y - el.outerRadius, x1: el.x + el.outerRadius, y1: el.y + el.outerRadius }
    case 'line': {
      const xs = el.points.filter((_, i) => i % 2 === 0).map((v) => el.x + v)
      const ys = el.points.filter((_, i) => i % 2 === 1).map((v) => el.y + v)
      const pad = (el.strokeWidth ?? 1) / PT
      return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad }
    }
  }
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** Whether an element is drawn at all with these values and photos (mirrors SideCanvas). */
function isShown(el: Element, values: Record<string, string>, photos: Record<string, PhotoState>) {
  if (el.showIf && !(values[el.showIf] ?? '').trim()) return false
  if (el.hideWhenCutout) {
    const ph = photos[el.hideWhenCutout]
    if (ph?.useCutout && ph.cutout) return false
  }
  if (el.showWhenCutout) {
    const ph = photos[el.showWhenCutout]
    if (!(ph?.useCutout && ph.cutout)) return false
  }
  if (el.type === 'photo' && el.optional && !photos[el.field]) return false
  return true
}

/**
 * Indexes of the text elements on this side that can be drawn as vector
 * text: not rotated, not faded, and with nothing drawn over them.
 */
export function vectorTextIndexes(side: Side, values: Record<string, string>, photos: Record<string, PhotoState>): Set<number> {
  const out = new Set<number>()
  side.elements.forEach((el, i) => {
    if (el.type !== 'text' && el.type !== 'stack') return
    if (!isShown(el, values, photos) || el.rotation || (el.opacity != null && el.opacity < 1)) return
    const box = boxOf(el)!
    const covered = side.elements.slice(i + 1).some((later) => {
      if (later.type === 'text' || later.type === 'stack') return false // text on text is drawn in order below
      if (!isShown(later, values, photos)) return false
      const b = boxOf(later)
      return !!b && overlaps(box, b)
    })
    if (!covered) out.add(i)
  })
  // Text drawn over raster-kept text would lose its place in the order; keep it in the image too.
  side.elements.forEach((el, i) => {
    if (!out.has(i)) return
    const box = boxOf(el)!
    const underRaster = side.elements.slice(0, i).some((earlier, j) => (earlier.type === 'text' || earlier.type === 'stack') && !out.has(j) && isShown(earlier, values, photos) && overlaps(box, boxOf(earlier)!))
    if (underRaster) out.delete(i)
  })
  return out
}

/** Every face the given text elements need, as jsPDF font names. */
function facesFor(els: (TextEl | StackEl)[]) {
  const styles: Pick<TextStyle, 'font' | 'weight' | 'italic'>[] = els.flatMap((el) => (el.type === 'stack' ? [el.heading, el.body] : [el]))
  return [...new Set(styles.map(fontFile))]
}

/** Registers the fonts with the document. Returns false if any could not be loaded. */
export async function prepareFonts(doc: jsPDF, els: (TextEl | StackEl)[]): Promise<boolean> {
  try {
    const files = facesFor(els)
    const data = await Promise.all(files.map(loadFont))
    files.forEach((file, i) => {
      const list = doc.getFontList()
      if (list[file]) return
      doc.addFileToVFS(file, data[i])
      doc.addFont(file, file, 'normal', 'Identity-H')
    })
    return true
  } catch (e) {
    console.error('PDF fonts', e)
    return false
  }
}

/** Embeds one face and returns its jsPDF name, or null if it could not be loaded. */
export async function embedFace(doc: jsPDF, style: Pick<TextStyle, 'font' | 'weight' | 'italic'>): Promise<string | null> {
  const file = fontFile(style)
  try {
    const data = await loadFont(file)
    if (!doc.getFontList()[file]) {
      doc.addFileToVFS(file, data)
      doc.addFont(file, file, 'normal', 'Identity-H')
    }
    return file
  } catch {
    return null
  }
}

function rgb(color: string): [number, number, number] {
  const c = color.trim()
  let m = c.match(/^#([0-9a-f]{6})$/i)
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)]
  m = c.match(/^#([0-9a-f]{3})$/i)
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number]
  m = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  if (/^white$/i.test(c)) return [255, 255, 255]
  return [0, 0, 0]
}

let measure: CanvasRenderingContext2D | null = null
/** Distance from the top of a Konva text line box to its baseline (Konva's own rule). */
function baselineOffset(style: Pick<TextStyle, 'font' | 'weight' | 'italic'>, size: number, lineHeight: number) {
  if (!measure) measure = document.createElement('canvas').getContext('2d')!
  measure.font = fontString(style, size)
  const m = measure.measureText('M')
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent
  return (ascent - descent) / 2 + (lineHeight * size) / 2
}

interface Ctx {
  doc: jsPDF
  /** Trim corner on the PDF page, in points. */
  ox: number
  oy: number
  /** One-color job: convert text colors to gray like the image. */
  gray: boolean
}

/** One line of text at a box-relative position, aligned like Konva. */
function line(c: Ctx, text: string, style: Pick<TextStyle, 'font' | 'weight' | 'italic' | 'color' | 'letterSpacing'>, size: number, x: number, top: number, boxW: number, align: 'left' | 'center' | 'right', lh: number, alpha = 1) {
  if (!text) return
  const { doc } = c
  const spacing = (style.letterSpacing ?? 0) * size
  doc.setFont(fontFile(style), 'normal')
  doc.setFontSize(size)
  // Width by the PDF font itself, so centering is exact in the file.
  const w = doc.getTextWidth(text) + spacing * [...text].length
  const dx = align === 'right' ? boxW - w : align === 'center' ? (boxW - w) / 2 : 0
  const [r, g, b] = rgb(style.color)
  if (c.gray) {
    const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    doc.setTextColor(y, y, y)
  } else doc.setTextColor(r, g, b)
  const opts: Parameters<jsPDF['text']>[3] = { baseline: 'alphabetic', charSpace: spacing || undefined }
  const draw = () => doc.text(text, c.ox + x + dx, c.oy + top + baselineOffset(style, size, lh), opts)
  if (alpha < 1) {
    doc.saveGraphicsState()
    doc.setGState(new GState({ opacity: alpha }))
    draw()
    doc.restoreGraphicsState()
  } else draw()
}

function drawText(c: Ctx, el: TextEl, values: Record<string, string>) {
  const fit = fitText(fillTokens(el.text, values), el)
  const lh = el.lineHeight ?? 1.2
  const boxW = el.w * PT
  const boxH = el.h * PT
  const textH = fit.lines.length * fit.size * lh
  const dy = el.valign === 'top' ? 0 : el.valign === 'bottom' ? boxH - textH : (boxH - textH) / 2
  const x = el.x * PT
  const y = el.y * PT + dy
  if (fit.rows) {
    fit.rows.forEach((r, i) => {
      const top = y + i * fit.size * lh
      line(c, r.left, el, fit.size, x, top, boxW, 'left', lh)
      if (r.dots) line(c, r.dots, el, fit.size, x + r.dotsX, top, boxW, 'left', lh, 0.7)
      line(c, r.right, el, fit.size, x, top, boxW, 'right', lh)
    })
    return
  }
  fit.lines.forEach((l, i) => line(c, l, el, fit.size, x, y + i * fit.size * lh, boxW, el.align ?? 'center', lh))
}

function drawStack(c: Ctx, el: StackEl, values: Record<string, string>) {
  const fit = fitStack(el, values)
  const boxW = el.w * PT
  const boxH = el.h * PT
  const dy = el.valign === 'top' ? 0 : el.valign === 'bottom' ? boxH - fit.height : (boxH - fit.height) / 2
  const x = el.x * PT
  const y = el.y * PT + dy
  const hLh = el.heading.lineHeight ?? 1.15
  const bLh = el.body.lineHeight ?? 1.25
  for (const b of fit.blocks) {
    b.heading.lines.forEach((l, i) => line(c, l, el.heading, b.heading.size, x, y + b.y + i * b.heading.size * hLh, boxW, el.heading.align ?? 'center', hLh))
    b.body.lines.forEach((l, i) => line(c, l, el.body, b.body.size, x, y + b.bodyY + i * b.body.size * bLh, boxW, el.body.align ?? 'center', bLh))
  }
}

/** Draws the chosen text elements as vector text. (ox, oy) is the trim corner on the page in points. */
export function drawVectorText(doc: jsPDF, side: Side, indexes: Set<number>, values: Record<string, string>, ox: number, oy: number, gray = false) {
  const c: Ctx = { doc, ox, oy, gray }
  side.elements.forEach((el, i) => {
    if (!indexes.has(i)) return
    if (el.type === 'text') drawText(c, el, values)
    else if (el.type === 'stack') drawStack(c, el, values)
  })
}

/** Characters in the text that the embedded font has no glyph for. */
function missingChars(doc: jsPDF, style: Pick<TextStyle, 'font' | 'weight' | 'italic'>, text: string): boolean {
  doc.setFont(fontFile(style), 'normal')
  const font = doc.getFont() as unknown as { metadata?: { cmap?: { unicode?: { codeMap?: Record<number, number> } } } }
  const map = font.metadata?.cmap?.unicode?.codeMap
  if (!map) return false
  return [...text].some((ch) => /\S/.test(ch) && !map[ch.codePointAt(0)!])
}

/**
 * Drops text the embedded fonts can't fully draw (some of Kemp's script
 * fonts have no numbers or accents). That text stays in the image, where the
 * browser fills the gap, so nothing prints as an empty box.
 */
export function coveredIndexes(doc: jsPDF, side: Side, indexes: Set<number>, values: Record<string, string>): Set<number> {
  const out = new Set<number>()
  indexes.forEach((i) => {
    const el = side.elements[i]
    if (el.type === 'text') {
      const fit = fitText(fillTokens(el.text, values), el)
      const strings = fit.rows ? fit.rows.flatMap((r) => [r.left, r.dots, r.right]) : fit.lines
      if (!strings.some((s) => missingChars(doc, el, s))) out.add(i)
    } else if (el.type === 'stack') {
      const fit = fitStack(el, values)
      const bad = fit.blocks.some((b) => b.heading.lines.some((s) => missingChars(doc, el.heading, s)) || b.body.lines.some((s) => missingChars(doc, el.body, s)))
      if (!bad) out.add(i)
    }
  })
  return out
}

export function textElements(side: Side, indexes: Set<number>) {
  return side.elements.filter((el, i): el is TextEl | StackEl => indexes.has(i) && (el.type === 'text' || el.type === 'stack'))
}
