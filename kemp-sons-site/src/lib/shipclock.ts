/**
 * Shipping promise. Standard orders ship the next shipping day. Rush orders
 * placed by the cutoff below (Central time, on shipping days) ship the same
 * day: Kemp & Sons gets packages to the UPS Store by 5 PM. Everything about
 * the promise is set here.
 */
export const SHIPPING = {
  /** Rush orders by this hour (24h, Central) ship today. The drop-off is 5 PM, so this leaves time to print and pack. */
  cutoffHour: 14,
  timeZone: 'America/Chicago',
  /** 0 = Sunday ... 6 = Saturday. */
  days: [1, 2, 3, 4, 5],
  /** Dates nothing ships (YYYY-MM-DD): UPS Store holidays and days Kemp & Sons is closed (Thanksgiving week 2026: closed Wed noon through Fri). */
  closed: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-12-25', '2027-01-01', '2027-05-31', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function local(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: SHIPPING.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  return { key: `${p.year}-${p.month}-${p.day}`, weekday, hour: Number(p.hour), minute: Number(p.minute) }
}

const isShipDay = (l: ReturnType<typeof local>) => SHIPPING.days.includes(l.weekday) && !SHIPPING.closed.includes(l.key)
const cutoffLabel = () => (SHIPPING.cutoffHour === 12 ? 'noon' : `${SHIPPING.cutoffHour % 12 || 12} ${SHIPPING.cutoffHour < 12 ? 'AM' : 'PM'}`)

export interface ShipStatus {
  /** True while a rush order placed now still ships today. */
  today: boolean
  /** One sentence for customers. */
  text: string
}

/** The next shipping day after today, as "tomorrow" or a weekday name. */
function nextShipDay(now: Date) {
  for (let i = 1; i <= 10; i++) {
    const next = local(new Date(now.getTime() + i * 86400_000))
    if (isShipDay(next)) return i === 1 ? 'tomorrow' : WEEKDAYS[next.weekday]
  }
  return 'soon'
}

/**
 * What to tell a customer ordering right now. Standard orders ship the next
 * shipping day; rush orders placed by the cutoff on a shipping day ship today.
 * rush = whether this product offers rush.
 */
export function shipStatus(opts: { rush?: boolean } = {}, now = new Date()): ShipStatus {
  const l = local(now)
  const next = nextShipDay(now)
  if (!opts.rush) return { today: false, text: `Order today and it ships ${next}.` }
  const minsLeft = SHIPPING.cutoffHour * 60 - (l.hour * 60 + l.minute)
  if (isShipDay(l) && minsLeft > 0) {
    const h = Math.floor(minsLeft / 60), m = minsLeft % 60
    const left = h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`
    return { today: true, text: `Need it today? Add rush in the next ${left} (by ${cutoffLabel()} Central) and it ships today. Standard orders ship ${next}.` }
  }
  return { today: false, text: `Order now and it ships ${next}. Rush orders placed by ${cutoffLabel()} Central on weekdays ship the same day.` }
}

/** Short version for small spaces. */
export const shipPromise = () => `Rush ships same day when you order by ${cutoffLabel()} Central`
