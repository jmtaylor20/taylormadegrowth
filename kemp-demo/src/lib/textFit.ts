import type { TextEl } from '../templates/types'

/**
 * Lays out a text box and shrinks the font until the copy fits.
 * All math is in points so the result is independent of screen scale:
 * the canvas and the PDF both draw from the same numbers.
 */

export interface FitResult {
  lines: string[]
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

const cache = new Map<string, FitResult>()
let fontEpoch = 0
/** Call after web fonts finish loading so cached measurements are redone. */
export function invalidateTextCache() {
  cache.clear()
  fontEpoch++
}

function wrap(text: string, maxW: number, size: number, el: TextEl): { lines: string[]; widest: number } {
  const c = measureCtx()
  c.font = fontString(el, size)
  const spacing = (el.letterSpacing ?? 0) * size
  const width = (s: string) => c.measureText(s).width + spacing * s.length
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

export function fitText(rawText: string, el: TextEl): FitResult {
  const text = el.uppercase ? rawText.toUpperCase() : rawText
  const key = `${fontEpoch}|${text}|${el.font}|${el.weight}|${el.italic}|${el.size}|${el.w}|${el.h}|${el.lineHeight}|${el.letterSpacing}`
  const hit = cache.get(key)
  if (hit) return hit

  const maxW = el.w * 72
  const maxH = el.h * 72
  const lh = el.lineHeight ?? 1.2
  const minSize = el.minSize ?? el.size * 0.45

  const fits = (size: number) => {
    const r = wrap(text, maxW, size, el)
    return { ...r, ok: r.widest <= maxW + 0.01 && r.lines.length * size * lh <= maxH + 0.01 }
  }

  let result: FitResult
  const first = fits(el.size)
  if (first.ok) {
    result = { lines: first.lines, size: el.size, shrunk: false, overflow: false }
  } else {
    // Binary search the largest size that fits, to a quarter point.
    let lo = minSize
    let hi = el.size
    const atMin = fits(lo)
    if (!atMin.ok) {
      const maxLines = Math.max(1, Math.floor(maxH / (lo * lh)))
      result = { lines: atMin.lines.slice(0, maxLines), size: lo, shrunk: true, overflow: true }
    } else {
      let best = atMin
      while (hi - lo > 0.25) {
        const mid = (lo + hi) / 2
        const r = fits(mid)
        if (r.ok) {
          lo = mid
          best = r
        } else hi = mid
      }
      result = { lines: best.lines, size: lo, shrunk: true, overflow: false }
    }
  }
  if (cache.size > 2000) cache.clear()
  cache.set(key, result)
  return result
}

/** Replace {{tokens}} with field values. */
export function fillTokens(text: string, values: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, id: string) => values[id] ?? '')
}

export function tokensIn(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
}
