import { useEffect, useState } from 'react'
import { forgetDesign, listSaved, type SavedDesign } from './saved'

/** Designs this customer approved on this device, newest first. */
export default function ReorderList({ phone, phoneHref }: { phone: string; phoneHref: string }) {
  const [items, setItems] = useState<SavedDesign[] | null>(null)
  useEffect(() => setItems(listSaved()), [])
  if (items === null) return null
  if (!items.length)
    return (
      <div className="ro-empty">
        <p className="sub">No saved designs on this device yet.</p>
        <p>
          Designs you approve here are saved for reorders. If you ordered on another phone or computer, use the reorder link in your order confirmation email, or call us at <a href={phoneHref}>{phone}</a> and we'll send it to you.
        </p>
      </div>
    )
  return (
    <ol className="ro-list">
      {items.map((d) => (
        <li key={d.id} className="ro-item">
          <a className="ro-thumb crop" href={`/design/${d.templateId}/?from=${d.id}`}>
            <img src={d.thumb} alt={`${d.name} design`} />
          </a>
          <div className="ro-meta">
            <p className="mono">
              {d.ref} / {new Date(d.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="sub">{d.name}</p>
            <p className="ro-sum">{d.summary}</p>
            <div className="ro-actions">
              <a className="btn btn-primary" href={`/design/${d.templateId}/?from=${d.id}`}>
                Open &amp; reorder <span className="arrow" aria-hidden="true">&rarr;</span>
              </a>
              <button
                type="button"
                className="ro-remove"
                onClick={() => {
                  forgetDesign(d.id)
                  setItems(listSaved())
                }}
              >
                Remove from this list
              </button>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
