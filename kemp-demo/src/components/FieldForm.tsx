import { useEffect, useRef, useState } from 'react'
import type { Field, PhotoField, Template } from '../templates/types'
import type { Draft, PhotoState } from '../lib/draft'
import { fileToDataUrl } from '../lib/images'
import { fieldsOf, fillTokens, fitStack, fitText } from '../lib/textFit'

interface Props {
  template: Template
  draft: Draft
  onValue: (id: string, value: string) => void
  onPhoto: (id: string, next: PhotoState | null) => void
  /** typing=false for photo controls, which never raise the keyboard. */
  onFocusField: (id: string | null, typing?: boolean) => void
  /** Lets a tap on an empty photo frame in the preview open the picker for that slot. */
  registerPhotoPicker: (slotId: string, open: (() => void) | null) => void
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

export function FieldForm({ template, draft, onValue, onPhoto, onFocusField, registerPhotoPicker }: Props) {
  const sections: { name: string; fields: Field[] }[] = []
  for (const f of template.fields) {
    const name = f.section ?? 'Details'
    let s = sections.find((x) => x.name === name)
    if (!s) sections.push((s = { name, fields: [] }))
    s.fields.push(f)
  }

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <fieldset key={s.name} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
          <legend className="sr-only">{s.name}</legend>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{s.name}</h3>
          <div className="space-y-4">
            {s.fields.map((f) =>
              f.type === 'photo' ? (
                <PhotoInput
                  key={f.id}
                  field={f}
                  photos={draft.photos}
                  onChange={onPhoto}
                  onFocus={(slot) => onFocusField(slot, false)}
                  register={registerPhotoPicker}
                />
              ) : (
                <label key={f.id} className="block">
                  <span className="mb-1.5 flex items-center justify-between gap-2 text-sm font-medium text-ink">
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
                      className="input resize-none leading-snug"
                    />
                  ) : (
                    <input
                      type="text"
                      value={draft.values[f.id] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => onValue(f.id, e.target.value)}
                      onFocus={() => onFocusField(f.id)}
                      onBlur={() => onFocusField(null)}
                      className="input"
                      autoComplete="off"
                    />
                  )}
                  {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
                </label>
              ),
            )}
          </div>
        </fieldset>
      ))}
    </div>
  )
}

function FitBadge({ status }: { status: 'ok' | 'shrunk' | 'overflow' }) {
  // Always rendered at a fixed height so the form never shifts while typing.
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold transition-opacity ${
        status === 'overflow' ? 'bg-amber-100 text-amber-800 opacity-100' : status === 'shrunk' ? 'bg-accent-soft text-accent opacity-100' : 'opacity-0'
      }`}
      aria-live="polite"
    >
      {status === 'overflow' ? 'Too long to fit' : status === 'shrunk' ? 'Auto-sized to fit' : ''}
    </span>
  )
}

const PhotoIcon = () => (
  <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M21 16l-5-5-8 8" />
  </svg>
)

/** One photo, or a collage of several slots ("<id>_1" ... "<id>_N"). */
function PhotoInput({
  field,
  photos,
  onChange,
  onFocus,
  register,
}: {
  field: PhotoField
  photos: Record<string, PhotoState>
  onChange: (slotId: string, v: PhotoState | null) => void
  onFocus: (slotId: string) => void
  register: (slotId: string, open: (() => void) | null) => void
}) {
  const slots = field.count ? Array.from({ length: field.count }, (_, i) => `${field.id}_${i + 1}`) : [field.id]
  const [active, setActive] = useState(slots[0])
  const input = useRef<HTMLInputElement | null>(null)
  const target = useRef(slots[0])
  const value = photos[active]

  const pick = (slot: string) => {
    target.current = slot
    setActive(slot)
    onFocus(slot)
    input.current?.click()
  }

  const key = slots.join(',')
  useEffect(() => {
    slots.forEach((s) => register(s, () => pick(s)))
    return () => slots.forEach((s) => register(s, null))
  }, [key])

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{field.label}</span>
      {field.count ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s, i) => {
              const ph = photos[s]
              const on = s === active
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => (ph ? (setActive(s), onFocus(s)) : pick(s))}
                  className={`relative aspect-square overflow-hidden rounded-xl border bg-soft transition ${on ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
                  aria-label={ph ? `Photo ${i + 1}, selected for zoom` : `Add photo ${i + 1}`}
                >
                  {ph ? <img src={ph.src} alt="" className="h-full w-full object-cover" /> : <PhotoIcon />}
                  <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] font-bold text-ink">{i + 1}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => pick(active)} className="btn-secondary">
              {value ? `Replace photo ${slots.indexOf(active) + 1}` : `Add photo ${slots.indexOf(active) + 1}`}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(active, null)} className="btn-ghost">
                Remove
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => pick(field.id)}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-soft"
            aria-label={value ? 'Replace photo' : 'Upload photo'}
          >
            {value ? <img src={value.src} alt="" className="h-full w-full object-cover" /> : <PhotoIcon />}
          </button>
          <div className="flex flex-1 flex-wrap gap-2">
            <button type="button" onClick={() => pick(field.id)} className="btn-secondary">
              {value ? 'Replace photo' : 'Upload photo'}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(field.id, null)} className="btn-ghost">
                Remove
              </button>
            )}
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const src = await fileToDataUrl(file)
          onChange(target.current, { src, ox: 0, oy: 0, zoom: 1 })
        }}
      />
      {/* Zoom row keeps its height whether or not a photo is loaded. */}
      <div className={`mt-3 flex h-9 items-center gap-3 ${value ? '' : 'pointer-events-none opacity-40'}`}>
        <span className="w-10 text-xs font-medium text-muted">Zoom</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={value?.zoom ?? 1}
          onChange={(e) => value && onChange(active, { ...value, zoom: Number(e.target.value) })}
          onFocus={() => onFocus(active)}
          className="range flex-1"
          aria-label="Photo zoom"
        />
      </div>
      <span className="mt-1 block text-xs text-muted">{field.hint}</span>
    </div>
  )
}
