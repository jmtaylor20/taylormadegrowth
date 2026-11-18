import { useEffect, useRef, useState } from 'react'
import './portal.css'

/**
 * Family photo link: /family/?h=<home>&c=<case>&t=<token>, sent by the funeral
 * home. The family adds photos and the wording for the program on their
 * phone. No sign-in; everything saves as they go and they can come back.
 */

interface View {
  name: string
  homeName: string
  values: Record<string, string>
  photos: { id: string; kind: 'portrait' | 'other' }[]
  maxPhotos: number
}

const FIELDS: { id: string; label: string; hint?: string; rows?: number; placeholder?: string }[] = [
  { id: 'name', label: 'Full name, as it should be printed', placeholder: 'For example: Mr. John Allen Smith' },
  { id: 'firstName', label: 'First name or nickname', hint: 'What family and friends called them. Used in headings inside the program.', placeholder: 'For example: Johnny' },
  { id: 'birthDate', label: 'Date of birth', placeholder: 'For example: March 3, 1942' },
  { id: 'deathDate', label: 'Date of passing', placeholder: 'For example: October 28, 2026' },
  { id: 'obituary', label: 'Obituary or life story', rows: 8, hint: 'Paste it here if it is already written. A few paragraphs is plenty.' },
  { id: 'tribute', label: 'Favorite poem, verse or scripture (optional)', rows: 4 },
  { id: 'familyMessage', label: 'Thank-you message from the family (optional)', rows: 3, placeholder: 'For example: The family thanks you for every prayer, every meal, and every kind word.' },
  { id: 'note', label: 'Anything else we should know? (optional)', rows: 3, hint: 'Pallbearers, special requests, or which photo you would like on the cover.' },
]

/** Phone photos can be huge; scale to at most 2400 px as a JPEG before sending. */
async function prepare(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * s)
    c.height = Math.round(img.naturalHeight * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read photo'))), 'image/jpeg', 0.9))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function FamilyApp({ phone, phoneHref }: { phone: string; phoneHref: string }) {
  const q = new URLSearchParams(window.location.search)
  const h = q.get('h') ?? '', c = q.get('c') ?? '', t = q.get('t') ?? ''
  const base = `/api/family/${encodeURIComponent(h)}/${encodeURIComponent(c)}`
  const tok = `t=${encodeURIComponent(t)}`

  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<'saved' | 'saving' | 'unsaved' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const portraitInput = useRef<HTMLInputElement>(null)
  const otherInput = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    fetch(`${base}?${tok}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error ?? 'This link could not be opened.')
        setView(body)
        setValues(body.values ?? {})
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const save = async (next: Record<string, string>) => {
    setSaved('saving')
    try {
      const r = await fetch(`${base}?${tok}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      if (!r.ok) throw new Error()
      setSaved('saved')
    } catch {
      setSaved('unsaved')
    }
  }
  const change = (id: string, v: string) => {
    const next = { ...values, [id]: v }
    setValues(next)
    setSaved('unsaved')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => save(next), 1200)
  }

  const upload = async (files: FileList | null, kind: 'portrait' | 'other') => {
    if (!files?.length) return
    setProblem(null)
    const list = kind === 'portrait' ? [files[0]] : Array.from(files)
    for (const [i, f] of list.entries()) {
      setBusy(list.length > 1 ? `Adding photo ${i + 1} of ${list.length}...` : 'Adding your photo...')
      try {
        const blob = await prepare(f)
        const r = await fetch(`${base}/photos?${tok}&kind=${kind}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob })
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.error ?? 'That photo could not be added.')
        setView(body)
      } catch (e) {
        setProblem(`${f.name}: ${(e as Error).message}`)
      }
    }
    setBusy(null)
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this photo?')) return
    const r = await fetch(`${base}/photos/${id}?${tok}`, { method: 'DELETE' })
    if (r.ok) setView(await r.json())
  }

  if (error)
    return (
      <div className="po-center">
        <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons Printing" width="160" height="107" />
        <h1>We couldn't open this link</h1>
        <p>{error}</p>
        <p>
          You can also call Kemp & Sons Printing at <a href={phoneHref}>{phone}</a>.
        </p>
      </div>
    )
  if (!view) return <p className="po-center mono">Opening...</p>

  const portrait = view.photos.find((p) => p.kind === 'portrait')
  const others = view.photos.filter((p) => p.kind === 'other')
  const src = (id: string) => `${base}/photos/${id}?${tok}`
  const full = view.photos.length >= view.maxPhotos

  return (
    <div className="fa">
      <header className="fa-top">
        <img src="/brand/kemp-sons-full-color.svg" alt="Kemp & Sons Printing" width="70" height="47" />
        <p className="mono">For {view.homeName}</p>
      </header>

      <main className="fa-main">
        <section className="fa-intro">
          <h1>Help us prepare {view.name}'s program</h1>
          <p>Add the photos and words you'd like in the program. Everything saves as you go, and you can come back to this link to add more. {view.homeName} will go over it with you before anything is printed.</p>
        </section>

        <section className="fa-card">
          <h2>
            <span className="fa-n">1</span> Main photo
          </h2>
          <p className="fa-hint">The photo for the cover. A clear photo of their face works best.</p>
          {portrait ? (
            <div className="fa-portrait">
              <img src={src(portrait.id)} alt="Main photo" />
              <div className="fa-row">
                <button type="button" className="fa-btn" onClick={() => portraitInput.current?.click()} disabled={!!busy}>
                  Choose a different photo
                </button>
                <button type="button" className="fa-link" onClick={() => remove(portrait.id)}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="fa-add is-big" onClick={() => portraitInput.current?.click()} disabled={!!busy}>
              <span aria-hidden="true">+</span> Add the main photo
            </button>
          )}
          <input ref={portraitInput} type="file" accept="image/*" hidden onChange={(e) => (upload(e.target.files, 'portrait'), (e.target.value = ''))} />
        </section>

        <section className="fa-card">
          <h2>
            <span className="fa-n">2</span> More photos
          </h2>
          <p className="fa-hint">Family, friends, favorite moments. Choose several at once if you like.</p>
          <div className="fa-grid">
            {others.map((p) => (
              <figure key={p.id}>
                <img src={src(p.id)} alt="" loading="lazy" />
                <button type="button" className="fa-x" onClick={() => remove(p.id)} aria-label="Remove this photo">
                  &times;
                </button>
              </figure>
            ))}
            {!full && (
              <button type="button" className="fa-add" onClick={() => otherInput.current?.click()} disabled={!!busy}>
                <span aria-hidden="true">+</span> Add photos
              </button>
            )}
          </div>
          {full && <p className="fa-hint">That's the most photos this link can take. Call us if you have more.</p>}
          <input ref={otherInput} type="file" accept="image/*" multiple hidden onChange={(e) => (upload(e.target.files, 'other'), (e.target.value = ''))} />
          {busy && (
            <p className="fa-status" role="status">
              {busy}
            </p>
          )}
          {problem && <p className="fa-problem">{problem}</p>}
        </section>

        <section className="fa-card">
          <h2>
            <span className="fa-n">3</span> Words for the program
          </h2>
          {FIELDS.map((f) => (
            <label key={f.id} className="fa-field">
              <span className="fa-label">{f.label}</span>
              {f.rows ? (
                <textarea rows={f.rows} value={values[f.id] ?? ''} placeholder={f.placeholder} onChange={(e) => change(f.id, e.target.value)} />
              ) : (
                <input type="text" value={values[f.id] ?? ''} placeholder={f.placeholder} onChange={(e) => change(f.id, e.target.value)} />
              )}
              {f.hint && <span className="fa-hint">{f.hint}</span>}
            </label>
          ))}
        </section>

        <p className="fa-saved" aria-live="polite">
          {saved === 'saving' ? 'Saving...' : saved === 'saved' ? 'Saved. You can close this page any time.' : saved === 'unsaved' ? 'Saving shortly...' : ' '}
        </p>
        <p className="fa-help">
          Questions? Call {view.homeName}, or Kemp & Sons Printing at <a href={phoneHref}>{phone}</a>.
        </p>
      </main>
    </div>
  )
}
