import { jsPDF } from 'jspdf'
import { templateById } from '../templates'
import { BLEED } from '../templates/types'
import type { Order } from './orders'
import { renderSide } from './render'

/**
 * Print-ready PDF: one page per side at the trim size plus 0.125 in bleed,
 * with crop marks (and fold marks on folded pieces) in the slug around it.
 * The page matches the layout of a typical InDesign export with marks:
 * trim + 0.29 in on every side.
 */

const PT = 72
const SLUG = 0.2917 // inches from trim to page edge, as in the shop's existing print files
const MARK_GAP = 0.03 // keep marks just clear of the bleed

/** Resolution that keeps the canvas within what phones can allocate (~16 MP). */
export function printPpi(w: number, h: number) {
  return Math.floor(Math.min(300, Math.sqrt(16_000_000 / ((w + 2 * BLEED) * (h + 2 * BLEED)))))
}

export async function buildPrintPdf(o: Order, onProgress?: (msg: string) => void): Promise<{ blob: Blob; fileName: string; ppi: number }> {
  const t = templateById(o.templateId)
  if (!t) throw new Error('Unknown template')
  const W = t.trim.w + 2 * SLUG
  const H = t.trim.h + 2 * SLUG
  const ppi = printPpi(t.trim.w, t.trim.h)
  const doc = new jsPDF({ unit: 'pt', format: [W * PT, H * PT], orientation: W > H ? 'landscape' : 'portrait', compress: true })
  doc.setProperties({ title: `${o.id} ${t.name} print file`, creator: 'Kemp & Sons demo', subject: `${t.sizeLabel}, ${ppi} ppi, 0.125 in bleed` })

  for (let i = 0; i < t.sides.length; i++) {
    const side = t.sides[i]
    onProgress?.(`Rendering ${side.label.toLowerCase()} at ${ppi} ppi`)
    if (i > 0) doc.addPage([W * PT, H * PT], W > H ? 'landscape' : 'portrait')
    const img = await renderSide(t, side, o.draft.values, o.draft.photos, { mode: 'print', ppi, mimeType: 'image/jpeg', quality: 0.93 })
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
    // Fold marks: dashed, top and bottom only.
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
    const rush = o.draft.rush ? 'RUSH  |  ' : ''
    doc.text(`${rush}${o.id}  |  ${t.name}  |  ${side.label} (page ${i + 1} of ${t.sides.length})  |  Trim ${t.trim.w} x ${t.trim.h} in  |  Qty ${o.draft.qty}`, L + 0.3 * PT, H * PT - 0.07 * PT)
  }

  onProgress?.('Saving PDF')
  const fileName = `${o.id}_${t.name.replace(/\s+/g, '-')}_print.pdf`
  return { blob: doc.output('blob'), fileName, ppi }
}

/** Builds the PDF and hands it to the browser as a download. */
export async function downloadPrintPdf(o: Order, onProgress?: (msg: string) => void) {
  const { blob, fileName, ppi } = await buildPrintPdf(o, onProgress)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return { fileName, ppi, bytes: blob.size }
}
