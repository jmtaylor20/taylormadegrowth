import { useEffect, useRef, useState } from 'react'
import type { Field, PhotoField, Template } from './types'
import type { Draft, PhotoState, PhotoTone } from './draft'
import { readPhoto } from './images'
import { fieldsOf, fillTokens, fitStack, fitText } from './textFit'

interface Props {
  template: Template
  draft: Draft
  onValue: (id: string, value: string) => void
  onPhoto: (id: string, next: PhotoState | null) => void
  /** typing=false for photo controls, which never raise the keyboard. */
  onFocusField: (id: string | null, typing?: boolean) => void
  /** Lets a tap on an empty photo frame in the preview open the picker for that slot. */
  registerPhotoPicker: (slotId: string, open: (() => void) | null) => void
  /** Simple mode (prototype): photo adjustments tucked behind one button, black and white only. */
  simple?: boolean
  /** Show only the words or only the photos (one step at a time in simple mode). */
  only?: 'text' | 'photo'
}

/** How the text for a field is fitting, for the small badge next to its label. */
function fitStatus(t: Template, values: Record<string, string>, fieldId: string): 'ok' | 'shrunk' | 'overflow' {
  let status: 'ok' | 'shrunk' | 'overflow' = 'ok'
  for (const side of t.sides)
    for (const el of side.elements) {
      if ((el.type !== 'text' && el.type !== 'stack') || !fieldsOf(el).includes(fieldId)) continue
      const r = el.type === 'text' ? fitText(fillTokens(el.text, values), el) : fitStack(el, values)
      if (r.overflow) return 'overflow'
      if (r.shrunk) status = 'shrunk'
    }
  return status
}

export function FieldForm({ template, draft, onValue, onPhoto, onFocusField, registerPhotoPicker, simple = false, only }: Props) {
  const sections: { name: string; fields: Field[] }[] = []
  for (const f of template.fields) {
    if (only && (only === 'photo') !== (f.type === 'photo')) continue
    const name = f.section ?? 'Details'
    let s = sections.find((x) => x.name === name)
    if (!s) sections.push((s = { name, fields: [] }))
    s.fields.push(f)
  }

  return (
    <div className="ed-form">
      {sections.map((s, si) => (
        <fieldset key={s.name} className="ed-section">
          <legend className="ed-section-title">
            <span className="ed-section-no">{String.fromCharCode(65 + si)}</span>
            {s.name}
          </legend>
          {s.fields.map((f) =>
            f.type === 'photo' ? (
              <PhotoInput key={f.id} field={f} photos={draft.photos} onChange={onPhoto} onFocus={(slot) => onFocusField(slot, false)} register={registerPhotoPicker} simple={simple} />
            ) : (
              <label key={f.id} className="ed-field">
                <span className="ed-label">
                  {f.label}
                  <FitBadge status={fitStatus(template, draft.values, f.id)} />
                </span>
                {f.type === 'textarea' ? (
                  <textarea
                    rows={f.rows ?? 3}
                    value={draft.values[f.id] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => onValue(f.id, e.target.value)}
                    onFocus={() => onFocusField(f.id)}
                    onBlur={() => onFocusField(null)}
                    className="ed-input"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft.values[f.id] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => onValue(f.id, e.target.value)}
                    onFocus={() => onFocusField(f.id)}
                    onBlur={() => onFocusField(null)}
                    className="ed-input"
                    autoComplete="off"
                  />
                )}
                {f.hint && <span className="ed-hint">{f.hint}</span>}
              </label>
            ),
          )}
        </fieldset>
      ))}
    </div>
  )
}

function FitBadge({ status }: { status: 'ok' | 'shrunk' | 'overflow' }) {
  // Always rendered so the form never shifts while typing.
  return (
    <span className={`ed-badge is-${status}`} aria-live="polite">
      {status === 'overflow' ? 'Too long to fit' : status === 'shrunk' ? 'Sized to fit' : ''}
    </span>
  )
}

const PhotoIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </svg>
)

/** One photo, or several slots ("<id>_1" ... "<id>_N"). */
function PhotoInput({
  field,
  photos,
  onChange,
  onFocus,
  register,
  simple = false,
}: {
  field: PhotoField
  photos: Record<string, PhotoState>
  onChange: (slotId: string, v: PhotoState | null) => void
  onFocus: (slotId: string) => void
  register: (slotId: string, open: (() => void) | null) => void
  simple?: boolean
}) {
  const [adjust, setAdjust] = useState(false)
  const slots = field.count ? Array.from({ length: field.count }, (_, i) => `${field.id}_${i + 1}`) : [field.id]
  const [active, setActive] = useState(slots[0])
  const [busy, setBusy] = useState(false)
  const [cutMsg, setCutMsg] = useState<string | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const target = useRef(slots[0])
  const value = photos[active]
  const n = slots.indexOf(active) + 1
  const multi = slots.length > 1

  const pick = (slot: string) => {
    target.current = slot
    setActive(slot)
    onFocus(slot)
    input.current?.click()
  }

  // Latest photos, so a cut-out that finishes later merges with any moves made meanwhile.
  const latest = useRef(photos)
  latest.current = photos

  const cutOut = async (slot: string, photo: PhotoState) => {
    onFocus(slot)
    try {
      const { removeBackground } = await import('./bgremove')
      const cut = await removeBackground(photo.src, setCutMsg)
      const now = latest.current[slot]
      // Skip if the photo was replaced or removed while this ran.
      if (!now || now.src !== photo.src) return
      onChange(slot, { ...now, cutout: cut.src, useCutout: true })
    } catch (err) {
      console.error(err)
      alert("Sorry, the background couldn't be removed from that photo. It will print as is with its frame.")
    } finally {
      setCutMsg(null)
    }
  }

  const key = slots.join(',')
  useEffect(() => {
    slots.forEach((s) => register(s, () => pick(s)))
    return () => slots.forEach((s) => register(s, null))
  }, [key])

  return (
    <div className="ed-field">
      <span className="ed-label">{field.label}</span>
      <div className={`ed-slots ${multi ? 'is-multi' : ''}`}>
        {slots.map((s, i) => {
          const ph = photos[s]
          return (
            <button
              key={s}
              type="button"
              onClick={() => (ph ? (setActive(s), onFocus(s)) : pick(s))}
              className={`ed-slot ${s === active ? 'is-active' : ''}`}
              aria-label={ph ? `Photo ${i + 1}, selected` : `Add photo ${i + 1}`}
            >
              {ph ? <img src={ph.src} alt="" /> : <PhotoIcon />}
              {multi && <span className="ed-slot-no">{i + 1}</span>}
            </button>
          )
        })}
      </div>
      <div className="ed-row">
        <button type="button" onClick={() => pick(active)} className="ed-btn" disabled={busy}>
          {busy ? 'Loading photo...' : `${value ? 'Replace' : 'Add'} photo${multi ? ` ${n}` : ''}`}
        </button>
        {value && simple && (
          <button type="button" onClick={() => setAdjust(!adjust)} className={`ed-btn ed-btn-ghost ${adjust ? 'is-on' : ''}`} aria-expanded={adjust}>
            {adjust ? 'Done adjusting' : 'Adjust photo'}
          </button>
        )}
        {value && (
          <button type="button" onClick={() => onChange(active, null)} className="ed-btn ed-btn-ghost">
            Remove
          </button>
        )}
      </div>
      {simple && value && !adjust && <span className="ed-hint">Your photo fills its spot automatically. Drag it on the preview to move it.</span>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            const p = await readPhoto(file)
            const slot = target.current
            const next = { ...p, ox: 0, oy: 0, zoom: 1 }
            onChange(slot, next)
            // Cut-out designs set the portrait right on the artwork, so remove the background by default.
            if (field.removeBackground) void cutOut(slot, next)
          } catch {
            alert('That photo could not be opened. Try a JPG or PNG.')
          } finally {
            setBusy(false)
          }
        }}
      />
      {(!simple || adjust) && (
        <>
      <div className={`ed-zoom ${value ? '' : 'is-off'}`}>
        <span className="mono">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={value?.zoom ?? 1}
          onChange={(e) => value && onChange(active, { ...value, zoom: Number(e.target.value) })}
          onFocus={() => onFocus(active)}
          aria-label="Photo zoom"
        />
      </div>
      {field.removeBackground && value && (
        <label className={`ed-check ed-check-light ${value.useCutout ? 'is-on' : ''}`}>
          <input
            type="checkbox"
            checked={!!value.useCutout}
            disabled={!!cutMsg}
            onChange={async (e) => {
              const slot = active
              const photo = value
              if (!e.target.checked) return onChange(slot, { ...photo, useCutout: false })
              if (photo.cutout) return onChange(slot, { ...photo, useCutout: true })
              await cutOut(slot, photo)
            }}
          />
          <span>
            Remove background
            <span className="ed-hint" aria-live="polite">
              {cutMsg ? `${cutMsg}...` : 'On by default for this design. Untick it to show your photo in a frame instead. Your photo stays on your device.'}
            </span>
          </span>
        </label>
      )}
      {value && (
        <div className="ed-tones" role="group" aria-label="Photo look">
          {!simple && <label className={`ed-check ed-check-light ed-tones-wide ${value.enhance ? 'is-on' : ''}`}>
            <input type="checkbox" checked={!!value.enhance} onChange={(e) => onChange(active, { ...value, enhance: e.target.checked || undefined })} />
            <span>
              Brighten / auto-fix
              <span className="ed-hint"> For dark, faded or yellowed photos.</span>
            </span>
          </label>}
          {(
            [
              ['bw', 'Black & white'],
              ['sepia', 'Sepia'],
              ['vintage', 'Soft vintage'],
            ] as [PhotoTone, string][]
          ).filter(([tone]) => !simple || tone === 'bw').map(([tone, label]) => (
            <label key={tone} className={`ed-check ed-check-light ${value.tone === tone ? 'is-on' : ''}`}>
              <input
                type="checkbox"
                checked={value.tone === tone}
                onChange={(e) => onChange(active, { ...value, tone: e.target.checked ? tone : undefined })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
          {simple && value && (
            <button type="button" className="ed-btn ed-btn-ghost" onClick={() => onChange(active, { ...value, ox: 0, oy: 0, zoom: 1, tone: undefined })}>
              Reset photo
            </button>
          )}
        </>
      )}
      {field.hint && !simple && <span className="ed-hint">{field.hint}</span>}
    </div>
  )
}
