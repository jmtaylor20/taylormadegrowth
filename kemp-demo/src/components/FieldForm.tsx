import { useRef } from 'react'
import type { Field, PhotoField, Template, TextEl } from '../templates/types'
import type { Draft, PhotoState } from '../lib/draft'
import { fileToDataUrl } from '../lib/images'
import { fillTokens, fitText, tokensIn } from '../lib/textFit'

interface Props {
  template: Template
  draft: Draft
  onValue: (id: string, value: string) => void
  onPhoto: (id: string, next: PhotoState | null) => void
  /** typing=false for photo controls, which never raise the keyboard. */
  onFocusField: (id: string | null, typing?: boolean) => void
  registerPhotoInput: (id: string, el: HTMLInputElement | null) => void
}

/** How the text for a field is fitting, for the small badge next to its label. */
function fitStatus(t: Template, values: Record<string, string>, fieldId: string): 'ok' | 'shrunk' | 'overflow' {
  let status: 'ok' | 'shrunk' | 'overflow' = 'ok'
  for (const side of t.sides)
    for (const el of side.elements) {
      if (el.type !== 'text' || !tokensIn(el.text).includes(fieldId)) continue
      const r = fitText(fillTokens(el.text, values), el as TextEl)
      if (r.overflow) return 'overflow'
      if (r.shrunk) status = 'shrunk'
    }
  return status
}

export function FieldForm({ template, draft, onValue, onPhoto, onFocusField, registerPhotoInput }: Props) {
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
                  value={draft.photos[f.id]}
                  onChange={(v) => onPhoto(f.id, v)}
                  onFocus={() => onFocusField(f.id, false)}
                  register={(el) => registerPhotoInput(f.id, el)}
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

function PhotoInput({
  field,
  value,
  onChange,
  onFocus,
  register,
}: {
  field: PhotoField
  value?: PhotoState
  onChange: (v: PhotoState | null) => void
  onFocus: () => void
  register: (el: HTMLInputElement | null) => void
}) {
  const input = useRef<HTMLInputElement | null>(null)
  const pick = () => {
    onFocus()
    input.current?.click()
  }
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{field.label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={pick}
          className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-soft"
          aria-label={value ? 'Replace photo' : 'Upload photo'}
        >
          {value ? (
            <img src={value.src} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg viewBox="0 0 24 24" className="mx-auto h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="M21 16l-5-5-8 8" />
            </svg>
          )}
        </button>
        <div className="flex flex-1 flex-wrap gap-2">
          <button type="button" onClick={pick} className="btn-secondary">
            {value ? 'Replace photo' : 'Upload photo'}
          </button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="btn-ghost">
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={(el) => {
          input.current = el
          register(el)
        }}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const src = await fileToDataUrl(file)
          onChange({ src, ox: 0, oy: 0, zoom: 1 })
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
          onChange={(e) => value && onChange({ ...value, zoom: Number(e.target.value) })}
          onFocus={onFocus}
          className="range flex-1"
          aria-label="Photo zoom"
        />
      </div>
      <span className="mt-1 block text-xs text-muted">{field.hint}</span>
    </div>
  )
}
