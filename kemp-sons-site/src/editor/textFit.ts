import type { StackEl, TextEl, TextStyle } from './types'

/**
 * Text layout. Shrinks copy until it fits its box. All math is in points so
 * the result is independent of screen scale: the canvas, proof and print
 * file all draw from the same numbers.
 */

export interface LeaderRow {
  left: string
  right: string
  dots: string
  /** x where the dots start, in points. */
  dotsX: number
}

export interface FitResult {
  lines: string[]
  /** Present for leader text: one row per line. */
  rows?: LeaderRow[]
  size: number // points
  /** True when the text was made smaller than its preferred size. */
  shrunk: boolean
  /** True when even the minimum size could not hold the copy. */
  overflow: boolean
}

let ctx: CanvasRenderingContext2D | null = null
function measureCtx() {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')!
  return ctx
}

export function fontString(el: Pick<TextEl, 'font' | 'weight' | 'italic'>, sizePt: number) {
  return `${el.italic ? 'italic ' : ''}${el.weight ?? 400} ${sizePt}px "${el.font}"`
}

/** Konva's fontStyle value for the same font. */
export function konvaFontStyle(el: Pick<TextEl, 'weight' | 'italic'>) {
  return `${el.italic ? 'italic ' : ''}${el.weight ?? 400}`
}

const cache = new Map<string, unknown>()
let fontEpoch = 0
/** Call after web fonts finish loading so cached measurements are redone. */
export function invalidateTextCache() {
  cache.clear()
  fontEpoch++
}
function cached<T>(key: string, make: () => T): T {
  const k = `${fontEpoch}|${key}`
  if (cache.has(k)) return cache.get(k) as T
  const v = make()
  if (cache.size > 3000) cache.clear()
  cache.set(k, v)
  return v
}

function measurer(style: TextStyle, size: number) {
  const c = measureCtx()
  c.font = fontString(style, size)
  const spacing = (style.letterSpacing ?? 0) * size
  return (s: string) => c.measureText(s).width + spacing * s.length
}

export function wrapLines(text: string, maxW: number, size: number, style: TextStyle): { lines: string[]; widest: number } {
  const width = measurer(style, size)
  const lines: string[] = []
  let widest = 0
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let line = words[0]
    for (let i = 1; i < words.length; i++) {
      const next = `${line} ${words[i]}`
      if (width(next) <= maxW) line = next
      else {
        lines.push(line)
        widest = Math.max(widest, width(line))
        line = words[i]
      }
    }
    lines.push(line)
    widest = Math.max(widest, width(line))
  }
  return { lines, widest }
}

function leaderLayout(text: string, maxW: number, size: number, el: TextEl): { rows: LeaderRow[]; ok: boolean } {
  const width = measurer(el, size)
  // Measure a run of dots: fonts kern repeated periods, so one dot times N is wrong.
  const dotW = width('.'.repeat(20)) / 20 || 1
  const space = width(' ')
  let ok = true
  const rows: LeaderRow[] = text.split('\n').map((line) => {
    const bar = line.indexOf('|')
    if (bar < 0) {
      const left = line.trim()
      if (width(left) > maxW) ok = false
      return { left, right: '', dots: '', dotsX: 0 }
    }
    const left = line.slice(0, bar).trim()
    const right = line.slice(bar + 1).trim()
    const wl = left ? width(left) : 0
    const wr = width(right)
    if (!left) {
      if (wr > maxW) ok = false
      return { left: '', right, dots: '', dotsX: 0 }
    }
    const room = maxW - wl - wr - 2 * space
    if (room < dotW * 3) ok = false
    let n = Math.max(0, Math.floor(room / dotW))
    while (n > 0 && width('.'.repeat(n)) > room) n--
    return { left, right, dots: '.'.repeat(n), dotsX: wl + space }
  })
  return { rows, ok }
}

export function fitText(rawText: string, el: TextEl): FitResult {
  const text = el.uppercase ? rawText.toUpperCase() : rawText
  const key = `${text}|${el.font}|${el.weight}|${el.italic}|${el.size}|${el.minSize}|${el.w}|${el.h}|${el.lineHeight}|${el.letterSpacing}|${el.leaders}|${el.maxLines}`
  return cached(key, () => {
    const maxW = el.w * 72
    const maxH = el.h * 72
    const lh = el.lineHeight ?? 1.2
    const minSize = el.minSize ?? el.size * 0.45

    const attempt = (size: number) => {
      if (el.leaders) {
        const r = leaderLayout(text, maxW, size, el)
        return { lines: r.rows.map((x) => x.left), rows: r.rows, ok: r.ok && r.rows.length * size * lh <= maxH + 0.01 }
      }
      const r = wrapLines(text, maxW, size, el)
      return { lines: r.lines, rows: undefined, ok: r.widest <= maxW + 0.01 && r.lines.length * size * lh <= maxH + 0.01 && r.lines.length <= (el.maxLines ?? Infinity) }
    }

    const first = attempt(el.size)
    if (first.ok) return { lines: first.lines, rows: first.rows, size: el.size, shrunk: false, overflow: false }

    let lo = minSize
    let hi = el.size
    const atMin = attempt(lo)
    if (!atMin.ok) {
      const maxLines = Math.max(1, Math.floor(maxH / (lo * lh)))
      return { lines: atMin.lines.slice(0, maxLines), rows: atMin.rows?.slice(0, maxLines), size: lo, shrunk: true, overflow: true }
    }
    // Binary search the largest size that fits, to a quarter point.
    let best = atMin
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2
      const r = attempt(mid)
      if (r.ok) {
        lo = mid
        best = r
      } else hi = mid
    }
    return { lines: best.lines, rows: best.rows, size: lo, shrunk: true, overflow: false }
  })
}

export interface StackBlock {
  y: number
  heading: { lines: string[]; size: number }
  bodyY: number
  body: { lines: string[]; size: number }
}

export interface StackFit {
  blocks: StackBlock[]
  /** Total height used, in points. */
  height: number
  scale: number
  shrunk: boolean
  overflow: boolean
}

/** Lays out a stack of titled sections, skipping blank ones and shrinking all of them together if needed. */
export function fitStack(el: StackEl, values: Record<string, string>): StackFit {
  const items = el.items
    .map((it) => ({ heading: fillTokens(it.heading, values), body: fillTokens(it.body, values) }))
    .filter((it) => it.body.trim() !== '')
  const key = `stack|${JSON.stringify(items)}|${JSON.stringify(el)}`
  return cached(key, () => {
    const maxW = el.w * 72
    const maxH = el.h * 72
    const hLh = el.heading.lineHeight ?? 1.15
    const bLh = el.body.lineHeight ?? 1.25
    const up = (s: string, st: TextStyle) => (st.uppercase ? s.toUpperCase() : s)

    const layout = (scale: number) => {
      const hs = el.heading.size * scale
      const bs = el.body.size * scale
      let y = 0
      let fits = true
      const blocks: StackBlock[] = items.map((it, i) => {
        if (i > 0) y += el.gap * 72 * scale
        const h = wrapLines(up(it.heading, el.heading), maxW, hs, el.heading)
        const b = wrapLines(up(it.body, el.body), maxW, bs, el.body)
        if (h.widest > maxW + 0.01 || b.widest > maxW + 0.01) fits = false
        const top = y
        y += h.lines.length * hs * hLh + el.headingGap * 72 * scale
        const bodyY = y
        y += b.lines.length * bs * bLh
        return { y: top, heading: { lines: h.lines, size: hs }, bodyY, body: { lines: b.lines, size: bs } }
      })
      return { blocks, height: y, ok: fits && y <= maxH + 0.01 }
    }

    const full = layout(1)
    if (full.ok) return { blocks: full.blocks, height: full.height, scale: 1, shrunk: false, overflow: false }
    let lo = el.minScale ?? 0.55
    let hi = 1
    const atMin = layout(lo)
    if (!atMin.ok) return { blocks: atMin.blocks, height: atMin.height, scale: lo, shrunk: true, overflow: true }
    let best = atMin
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2
      const r = layout(mid)
      if (r.ok) {
        lo = mid
        best = r
      } else hi = mid
    }
    return { blocks: best.blocks, height: best.height, scale: lo, shrunk: true, overflow: false }
  })
}

/** Replace {{tokens}} with field values. */
export function fillTokens(text: string, values: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, id: string) => values[id] ?? '')
}

export function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
}

/** Field ids an element reads, for focus highlighting and fit badges. */
export function fieldsOf(el: { type: string; text?: string; items?: { heading: string; body: string }[]; field?: string }): string[] {
  if (el.type === 'text' && el.text) return tokensIn(el.text)
  if (el.type === 'stack' && el.items) return el.items.flatMap((i) => [...tokensIn(i.heading), ...tokensIn(i.body)])
  if (el.type === 'photo' && el.field) return [el.field.replace(/_\d+$/, ''), el.field]
  return []
}
