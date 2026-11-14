import type { PhotoEl } from '../types'

/**
 * Kemp-style photo collage: snapshots with white borders and soft shadows,
 * each slightly tilted and overlapping its neighbors, like prints laid on a
 * table. Positions are fixed (seeded), so every program in a design looks
 * the same and the layout never shifts between the proof and the print.
 */

export interface CollageBox {
  x: number
  y: number
  w: number
  h: number
}

export interface CollageOptions {
  /** First slot number (photos are `<field>_<start>` onward). */
  start?: number
  /** Photos per row, top to bottom. Defaults to an even spread. */
  rows?: number[]
  /** How far photos spill past their cell into neighbors (0.12 = 12% of the cell). */
  overlap?: number
  /** Largest tilt in degrees. */
  tilt?: number
  /** White border in inches. */
  mat?: number
  /** Changes the tilts and nudges while keeping the same layout. */
  seed?: number
}

function rand(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Rows that fill the box evenly for this many photos. */
function defaultRows(count: number, box: CollageBox): number[] {
  const rows = Math.max(1, Math.round(Math.sqrt((count * box.h) / box.w)))
  const out: number[] = []
  let left = count
  for (let r = 0; r < rows; r++) {
    const n = Math.round(left / (rows - r))
    out.push(n)
    left -= n
  }
  return out
}

export function kempCollage(field: string, count: number, box: CollageBox, opts: CollageOptions = {}): PhotoEl[] {
  const { start = 1, overlap = 0.12, tilt = 4, mat = 0.06, seed = 1 } = opts
  const rows = opts.rows ?? defaultRows(count, box)
  const rh = box.h / rows.length
  const out: PhotoEl[] = []
  let n = start
  rows.forEach((perRow, r) => {
    const cw = box.w / perRow
    for (let c = 0; c < perRow; c++) {
      const k = n * 7 + seed * 131
      // Photo size: the cell plus some spill, minus the border.
      const w = cw * (1 + overlap) - 2 * mat
      const h = rh * (1 + overlap) - 2 * mat
      // Alternate the lean so neighbors don't tilt the same way.
      const sign = (r + c) % 2 === 0 ? -1 : 1
      const angle = sign * (0.35 + 0.65 * rand(k)) * tilt
      // Nudge the center a little, then keep the whole snapshot inside the box.
      let cx = box.x + (c + 0.5) * cw + (rand(k + 1) - 0.5) * cw * 0.1
      let cy = box.y + (r + 0.5) * rh + (rand(k + 2) - 0.5) * rh * 0.1
      const a = (angle * Math.PI) / 180
      const bw = (w + 2 * mat) * Math.abs(Math.cos(a)) + (h + 2 * mat) * Math.abs(Math.sin(a))
      const bh = (w + 2 * mat) * Math.abs(Math.sin(a)) + (h + 2 * mat) * Math.abs(Math.cos(a))
      cx = Math.min(Math.max(cx, box.x + bw / 2), box.x + box.w - bw / 2)
      cy = Math.min(Math.max(cy, box.y + bh / 2), box.y + box.h - bh / 2)
      // Konva rotates about the top-left corner, so place that corner to keep the center where we want it.
      const x = cx - ((w / 2) * Math.cos(a) - (h / 2) * Math.sin(a))
      const y = cy - ((w / 2) * Math.sin(a) + (h / 2) * Math.cos(a))
      out.push({ type: 'photo', field: `${field}_${n}`, x, y, w, h, rotation: angle, mat, shadow: true })
      n++
    }
  })
  // Draw in a mixed order so overlaps don't all stack the same direction.
  return out.map((el, i) => ({ el, key: rand(i * 3 + seed) })).sort((p, q) => p.key - q.key).map((p) => p.el)
}
