import { jsPDF } from 'jspdf'
import { BLEED, type Template } from './types'
import type { Draft } from './draft'
import { renderSide } from './render'

/**
 * Print-ready PDF: one page per side at the trim size plus 0.125 in bleed,
 * with crop marks (and fold marks on folded pieces) in the slug around it,
 * laid out like an InDesign export with marks: trim + 0.29 in on every side.
 */

const PT = 72
const SLUG = 0.2917
const MARK_GAP = 0.03 // keep marks just clear of the bleed

/** Resolution that keeps the canvas within what phones can allocate (~16 MP). */
export function printPpi(w: number, h: number) {
  return Math.floor(Math.min(300, Math.sqrt(16_000_000 / ((w + 2 * BLEED) * (h + 2 * BLEED)))))
}

export interface PrintJob {
  /** Short reference printed in the slug, e.g. the design id. */
  ref: string
  /** What was ordered, e.g. "100 cards, 14 pt Matte". */
  summary: string
}

export async function buildPrintPdf(t: Template, d: Draft, job: PrintJob, onProgress?: (msg: string) => void, quality = 0.93): Promise<Blob> {
  const W = t.trim.w + 2 * SLUG
  const H = t.trim.h + 2 * SLUG
  const orientation = W > H ? 'landscape' : 'portrait'
  const ppi = printPpi(t.trim.w, t.trim.h)
  const doc = new jsPDF({ unit: 'pt', format: [W * PT, H * PT], orientation, compress: true })
  doc.setProperties({ title: `${job.ref} ${t.name}`, creator: 'Kemp & Sons Printing', subject: `${t.sizeLabel}, ${ppi} ppi, 0.125 in bleed` })

  for (let i = 0; i < t.sides.length; i++) {
    const side = t.sides[i]
    onProgress?.(`Preparing the ${side.label.toLowerCase()} for print`)
    if (i > 0) doc.addPage([W * PT, H * PT], orientation)
    const img = await renderSide(t, side, d.values, d.photos, { mode: 'print', ppi, mimeType: 'image/jpeg', quality })
    const x0 = (SLUG - BLEED) * PT
    doc.addImage(img, 'JPEG', x0, x0, (t.trim.w + 2 * BLEED) * PT, (t.trim.h + 2 * BLEED) * PT, undefined, 'FAST')

    // Crop marks at the trim corners, kept outside the bleed.
    const L = SLUG * PT
    const R = (SLUG + t.trim.w) * PT
    const T = SLUG * PT
    const B = (SLUG + t.trim.h) * PT
    const inner = (BLEED + MARK_GAP) * PT
    doc.setDrawColor(0)
    doc.setLineWidth(0.25)
    for (const x of [L, R]) {
      doc.line(x, 0, x, T - inner)
      doc.line(x, B + inner, x, H * PT)
    }
    for (const y of [T, B]) {
      doc.line(0, y, L - inner, y)
      doc.line(R + inner, y, W * PT, y)
    }
    doc.setLineDashPattern([2, 2], 0)
    for (const f of side.folds ?? []) {
      const fx = L + f * PT
      doc.line(fx, 0, fx, T - inner)
      doc.line(fx, B + inner, fx, H * PT)
    }
    doc.setLineDashPattern([], 0)

    // Slug line so the press operator knows what this sheet is.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5)
    doc.setTextColor(60)
    doc.text(
      `${job.ref}  |  ${t.name}  |  ${side.label} (page ${i + 1} of ${t.sides.length})  |  Trim ${t.trim.w} x ${t.trim.h} in  |  ${job.summary}`,
      L + 0.3 * PT,
      H * PT - 0.07 * PT,
    )
  }

  onProgress?.('Saving your print file')
  return doc.output('blob')
}
