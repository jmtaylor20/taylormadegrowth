import { tracking } from '../config/tracking'

/**
 * Site tracking on top of the Google tag (set up in Base.astro):
 * - remembers the ad click or campaign a visitor came from, for 90 days, so
 *   quote requests and online orders can be traced back to it;
 * - sends events for calls, emails, directions, designs started and reorders;
 * - counts a quote request (generate_lead) once, on the thank-you page, after
 *   the form really sent.
 * Staff pages load none of this.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

const CLICK_KEY = 'kemp-ad-click'
const LEAD_KEY = 'kemp-pending-lead'
const DAYS = 90
const FIELDS = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign'] as const

export type AdClick = Partial<Record<(typeof FIELDS)[number] | 'landing_page', string>>

export function track(name: string, params: Record<string, unknown> = {}) {
  window.gtag?.('event', name, params)
}

function read<T>(store: Storage | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function write(store: Storage | undefined, key: string, value: unknown) {
  try {
    if (value == null) store?.removeItem(key)
    else store?.setItem(key, JSON.stringify(value))
  } catch {
    /* private window: tracking extras just stay off */
  }
}
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage)
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)

/** Saves the click or campaign on this landing, if any. The newest ad click wins. */
function captureClick() {
  const q = new URLSearchParams(location.search)
  const found = Object.fromEntries(FIELDS.flatMap((f) => (q.get(f) ? [[f, q.get(f)!.slice(0, 200)]] : []))) as AdClick
  if (!Object.keys(found).length) return
  write(local(), CLICK_KEY, { ...found, landing_page: location.pathname, at: Date.now() })
}

/** The remembered ad click or campaign, if it's under 90 days old. */
export function adClick(): AdClick | null {
  const c = read<AdClick & { at: number }>(local(), CLICK_KEY)
  if (!c) return null
  if (Date.now() - c.at > DAYS * 86400_000) {
    write(local(), CLICK_KEY, null)
    return null
  }
  const { at: _at, ...rest } = c
  return rest
}

export function isKioskVisit() {
  try {
    return sessionStorage.getItem('kemp-kiosk') === '1'
  } catch {
    return false
  }
}

/** E.164 for enhanced conversions (US numbers). */
function e164(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return ''
}

/**
 * GA4 batches events and sends them a few seconds later, or when the page is
 * hidden. Leaving for checkout doesn't always count as hidden, so this
 * signals it, which makes the tag send what it's holding right away.
 */
export async function flushAnalytics() {
  if (!window.gtag) return
  try {
    window.dispatchEvent(new Event('pagehide'))
  } catch {
    /* nothing to flush */
  }
  await new Promise((r) => setTimeout(r, 250))
}

/**
 * The checkout link with Google's _gl parameter, so the visit continues as
 * one session on the Shopify checkout domain. The tag adds _gl to links when
 * they're clicked, so this clicks a hidden link to the checkout and reads it.
 */
export function withLinker(url: string): string {
  if (!window.gtag) return url
  try {
    const a = document.createElement('a')
    a.href = url
    a.style.display = 'none'
    document.body.appendChild(a)
    a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const out = a.href
    a.remove()
    return out
  } catch {
    return url
  }
}

function quoteForm() {
  const form = document.querySelector<HTMLFormElement>('[data-quote-form]')
  if (!form) return
  const click = adClick()
  for (const [k, v] of Object.entries({ ...click, landing_page: click?.landing_page ?? location.pathname }))
    if (v) {
      const input = form.querySelector<HTMLInputElement>(`input[type="hidden"][name="${k}"]`)
      if (input) input.value = v
    }
  form.addEventListener('submit', () => {
    // Only a valid form leaves the page (the form's own check stops invalid ones first).
    if (!form.checkValidity()) return
    const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null)?.value?.trim() ?? ''
    const file = form.querySelector<HTMLInputElement>('input[type="file"]')
    write(session(), LEAD_KEY, {
      job_type: val('job_type'),
      artwork_attached: !!file?.files?.length,
      email: val('email').toLowerCase(),
      phone: e164(val('phone')),
    })
  })
}

/** On /thank-you/: counts the quote request once, with the details saved when it was sent. */
function thankYou() {
  if (!location.pathname.startsWith('/thank-you')) return
  const lead = read<{ job_type: string; artwork_attached: boolean; email: string; phone: string }>(session(), LEAD_KEY)
  if (!lead) return
  write(session(), LEAD_KEY, null)
  const userData: Record<string, string> = {}
  if (lead.email) userData.email = lead.email
  if (lead.phone) userData.phone_number = lead.phone
  if (Object.keys(userData).length) window.gtag?.('set', 'user_data', userData)
  track('generate_lead', { job_type: lead.job_type, artwork_attached: lead.artwork_attached })
  if (tracking.adsId && tracking.quoteLabel) track('conversion', { send_to: `${tracking.adsId}/${tracking.quoteLabel}` })
  if (lead.artwork_attached) track('artwork_attached', { job_type: lead.job_type })
}

export function initTracking() {
  captureClick()
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('tel:')) track('click_phone', { link_location: location.pathname })
      else if (href.startsWith('mailto:')) track('click_email', { link_location: location.pathname })
      else if (/maps\.google\.|google\.com\/maps|maps\.apple\./.test(href)) track('click_directions', { link_location: location.pathname })
    },
    { capture: true },
  )
  if (location.pathname.startsWith('/reorder')) track('view_reorder')
  quoteForm()
  thankYou()
}
