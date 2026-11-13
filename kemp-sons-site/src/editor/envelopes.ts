import { jsPDF } from 'jspdf'

/**
 * Addressed envelopes: turns a spreadsheet or a pasted list into address
 * blocks, and builds a print-ready PDF with one envelope per page.
 */

export interface EnvelopeSpec {
  /** Envelope size in inches, e.g. A7 = 7.25 x 5.25. */
  w: number
  h: number
  label: string
  /** Shopify product for the addressing add-on, priced per envelope. */
  shopifyHandle: string
}

export interface EnvelopeState {
  on: boolean
  returnAddress: string
  /** Each recipient is a list of lines: name, street, city/state/zip. */
  recipients: string[][]
  source: string
}

export const emptyEnvelopes: EnvelopeState = { on: false, returnAddress: '', recipients: [], source: '' }

/* ---------- Parsing ---------- */

/** Minimal CSV/TSV parser that handles quoted fields, commas and newlines inside quotes. */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean))
}

const COLS: Record<string, RegExp> = {
  name: /^(full ?name|name|names|recipient|addressee|family|household|mailing name|to)$/i,
  first: /^(first|first ?name|given ?name)$/i,
  last: /^(last|last ?name|surname|family ?name)$/i,
  street: /^(address|address ?1|address line ?1|street|street ?address|mailing address|addr)$/i,
  street2: /^(address ?2|address line ?2|apt|apartment|suite|unit|street ?2)$/i,
  city: /^(city|town)$/i,
  state: /^(state|st|province|region)$/i,
  zip: /^(zip|zip ?code|postal|postal ?code|postcode)$/i,
}

/** Turns spreadsheet rows into address blocks, using the header row when it has recognizable names. */
export function rowsToRecipients(rows: string[][]): string[][] {
  if (!rows.length) return []
  const header = rows[0]
  const idx: Partial<Record<keyof typeof COLS, number>> = {}
  header.forEach((h, i) => {
    for (const [k, re] of Object.entries(COLS)) if (idx[k as keyof typeof COLS] === undefined && re.test(h.trim())) idx[k as keyof typeof COLS] = i
  })
  const hasHeader = idx.street !== undefined || ((idx.name !== undefined || idx.first !== undefined) && idx.city !== undefined)
  if (!hasHeader) return rows.map((r) => r.filter(Boolean)).filter((r) => r.length >= 2)
  const get = (r: string[], k: keyof typeof COLS) => (idx[k] !== undefined ? (r[idx[k]!] ?? '').trim() : '')
  return rows
    .slice(1)
    .map((r) => {
      const name = get(r, 'name') || [get(r, 'first'), get(r, 'last')].filter(Boolean).join(' ')
      const cityLine = [get(r, 'city'), [get(r, 'state'), get(r, 'zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ')
      return [name, get(r, 'street'), get(r, 'street2'), cityLine].filter(Boolean)
    })
    .filter((lines) => lines.length >= 2)
}

/** Pasted text: tab-separated (copied from Excel or Google Sheets) or blocks separated by a blank line. */
export function parsePasted(text: string): string[][] {
  const t = text.replace(/\r\n?/g, '\n').trim()
  if (!t) return []
  if (t.includes('\t')) return rowsToRecipients(parseDelimited(t, '\t'))
  return t
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length >= 2)
}

export async function parseFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (/\.(xlsx|xls|numbers)$/.test(name)) throw new Error('spreadsheet')
  const text = await file.text()
  const delim = name.endsWith('.tsv') || (!text.includes(',') && text.includes('\t')) ? '\t' : ','
  return rowsToRecipients(parseDelimited(text, delim))
}

/** Addresses that look incomplete (no ZIP code on the last line). */
export function incomplete(recipients: string[][]): number[] {
  return recipients.flatMap((r, i) => (/\d{5}(-\d{4})?\s*$/.test(r[r.length - 1] ?? '') ? [] : [i]))
}

/* ---------- Print file ---------- */

const PT = 72

/**
 * One envelope per page at the envelope size. Text stays vector (sharp at
 * any size): return address top left, recipient block centered a little
 * right of and below center, as the USPS prefers.
 */
export function buildEnvelopePdf(spec: EnvelopeSpec, env: EnvelopeState, ref: string): Blob {
  const W = spec.w * PT
  const H = spec.h * PT
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true })
  doc.setProperties({ title: `${ref} envelopes`, creator: 'Kemp & Sons Printing', subject: `${env.recipients.length} addressed ${spec.label}s` })
  const ret = env.returnAddress.split('\n').map((l) => l.trim()).filter(Boolean)
  env.recipients.forEach((lines, i) => {
    if (i > 0) doc.addPage([W, H], W > H ? 'landscape' : 'portrait')
    doc.setTextColor(30)
    if (ret.length) {
      doc.setFont('times', 'normal')
      doc.setFontSize(9)
      ret.forEach((l, j) => doc.text(l, 0.35 * PT, 0.5 * PT + j * 11))
    }
    doc.setFont('times', 'normal')
    doc.setFontSize(13)
    const lh = 17
    const blockH = lines.length * lh
    const widest = Math.max(...lines.map((l) => doc.getTextWidth(l)))
    const x = Math.max(W * 0.42, W / 2 - widest / 2 + 0.4 * PT)
    const y = H * 0.56 - blockH / 2 + lh
    lines.forEach((l, j) => doc.text(l, Math.min(x, W - widest - 0.4 * PT), y + j * lh))
    // No slug line: anything printed here shows on the mailed envelope.
  })
  return doc.output('blob')
}
