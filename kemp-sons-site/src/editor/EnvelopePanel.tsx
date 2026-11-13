import { useRef, useState } from 'react'
import { emptyEnvelopes, incomplete, parseFile, parsePasted, type EnvelopeSpec, type EnvelopeState } from './envelopes'
import { money } from './shop'

interface Props {
  spec: EnvelopeSpec
  value: EnvelopeState | undefined
  onChange: (next: EnvelopeState) => void
  /** Price per addressed envelope from Shopify, if loaded. */
  each: number | null
  /** Cards in the selected quantity, to warn when there are more addresses than cards. */
  cardQty: number | null
  sectionNo: string
}

export function EnvelopePanel({ spec, value, onChange, each, cardQty, sectionNo }: Props) {
  const env = value ?? emptyEnvelopes
  const [mode, setMode] = useState<'upload' | 'paste'>('upload')
  const [paste, setPaste] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<EnvelopeState>) => onChange({ ...env, ...patch })
  const bad = incomplete(env.recipients)
  const n = env.recipients.length
  const sample = env.recipients[0]

  const load = (recipients: string[][], source: string) => {
    if (!recipients.length) {
      setMsg("We couldn't find any addresses there. Each address needs at least a name and a street line.")
      return
    }
    setMsg(null)
    set({ recipients, source })
  }

  return (
    <fieldset className="ed-section">
      <legend className="ed-section-title">
        <span className="ed-section-no">{sectionNo}</span>
        Envelopes
      </legend>
      <label className={`ed-check ed-check-light ${env.on ? 'is-on' : ''}`}>
        <input type="checkbox" checked={env.on} onChange={(e) => set({ on: e.target.checked })} />
        <span>
          Print the addresses on my envelopes
          <span className="ed-hint">
            {' '}
            {each != null ? `${money(each)} per envelope. ` : ''}Blank {spec.label}s are included with your cards either way.
          </span>
        </span>
      </label>

      {env.on && (
        <>
          <label className="ed-field">
            <span className="ed-label">Return address (optional)</span>
            <textarea className="ed-input" rows={3} value={env.returnAddress} placeholder={'The Hayes Family\n412 Maple Street\nOpelika, AL 36801'} onChange={(e) => set({ returnAddress: e.target.value })} />
          </label>

          <div className="ed-field">
            <span className="ed-label">Recipients</span>
            <div role="tablist" className="ed-tabs ed-tabs-sm">
              <button type="button" role="tab" aria-selected={mode === 'upload'} className={mode === 'upload' ? 'is-on' : ''} onClick={() => setMode('upload')}>
                Upload a list
              </button>
              <button type="button" role="tab" aria-selected={mode === 'paste'} className={mode === 'paste' ? 'is-on' : ''} onClick={() => setMode('paste')}>
                Paste addresses
              </button>
            </div>
            {mode === 'upload' ? (
              <>
                <div className="ed-row">
                  <button type="button" className="ed-btn" onClick={() => fileRef.current?.click()}>
                    {n ? 'Replace list' : 'Choose a CSV file'}
                  </button>
                </div>
                <span className="ed-hint">
                  Save your spreadsheet as CSV (in Excel or Google Sheets: File, Download or Save As, CSV). Columns like Name, Address, City, State and ZIP are picked up automatically.
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    try {
                      load(await parseFile(f), f.name)
                    } catch (err) {
                      setMsg(
                        (err as Error).message === 'spreadsheet'
                          ? 'That looks like an Excel or Numbers file. Save it as CSV first, or copy the rows and use Paste addresses.'
                          : "That file couldn't be read. Try saving it as CSV.",
                      )
                    }
                  }}
                />
              </>
            ) : (
              <>
                <textarea
                  className="ed-input"
                  rows={7}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={'Copy rows from a spreadsheet, or type addresses with a blank line between each:\n\nMike & Sarah Jones\n101 Oak Lane\nAuburn, AL 36830\n\nThe Carter Family\n...'}
                />
                <div className="ed-row">
                  <button type="button" className="ed-btn" onClick={() => load(parsePasted(paste), 'pasted list')} disabled={!paste.trim()}>
                    Use these addresses
                  </button>
                </div>
              </>
            )}
            {msg && <p className="ed-warn">{msg}</p>}
          </div>

          {n > 0 && (
            <div className="ed-env">
              <p className="ed-env-count">
                <strong>{n}</strong> {n === 1 ? 'address' : 'addresses'} from {env.source}
                {each != null && <span className="mono"> / {money(each * n)}</span>}
              </p>
              {sample && (
                <div className="ed-env-mock" style={{ aspectRatio: `${spec.w} / ${spec.h}` }} aria-label="Envelope preview">
                  <div className="ed-env-ret">{env.returnAddress.split('\n').filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}</div>
                  <div className="ed-env-to">{sample.map((l, i) => <span key={i}>{l}</span>)}</div>
                  <span className="ed-env-stamp" aria-hidden="true" />
                </div>
              )}
              {bad.length > 0 && (
                <p className="ed-warn">
                  {bad.length} {bad.length === 1 ? 'address is' : 'addresses are'} missing a ZIP code: {bad.slice(0, 3).map((i) => env.recipients[i][0]).join(', ')}
                  {bad.length > 3 ? ` and ${bad.length - 3} more` : ''}.
                </p>
              )}
              {cardQty != null && n > cardQty && (
                <p className="ed-warn">
                  You have {n} addresses but {cardQty} cards selected. Choose a larger quantity so everyone gets one.
                </p>
              )}
              <details className="ed-env-list">
                <summary>See all addresses</summary>
                <ol>
                  {env.recipients.map((r, i) => (
                    <li key={i} className={bad.includes(i) ? 'is-bad' : ''}>
                      {r.join(', ')}
                      <button type="button" className="ed-btn-link" onClick={() => set({ recipients: env.recipients.filter((_, j) => j !== i) })} aria-label={`Remove ${r[0]}`}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}
        </>
      )}
    </fieldset>
  )
}
