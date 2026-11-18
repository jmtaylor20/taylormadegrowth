/**
 * Same-day shipping promise. Kemp & Sons gets packages to the UPS Store by
 * 5 PM; orders placed by the cutoff below (Central time, on shipping days)
 * leave the same day. Everything about the promise is set here.
 */
export const SHIPPING = {
  /** Order by this hour (24h, Central) to ship today. The drop-off is 5 PM, so this leaves time to print and pack. */
  cutoffHour: 12,
  timeZone: 'America/Chicago',
  /** 0 = Sunday ... 6 = Saturday. */
  days: [1, 2, 3, 4, 5],
  /** Dates the UPS Store is closed (YYYY-MM-DD). */
  closed: ['2026-11-26', '2026-12-25', '2027-01-01', '2027-05-31', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
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
  /** True while an order placed now still ships today. */
  today: boolean
  /** One sentence for customers. */
  text: string
}

/** What to tell a customer ordering right now. */
export function shipStatus(now = new Date()): ShipStatus {
  const l = local(now)
  const minsLeft = SHIPPING.cutoffHour * 60 - (l.hour * 60 + l.minute)
  if (isShipDay(l) && minsLeft > 0) {
    const h = Math.floor(minsLeft / 60), m = minsLeft % 60
    const left = h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`
    return { today: true, text: `Order in the next ${left} (by ${cutoffLabel()} Central) and it ships today.` }
  }
  // Next shipping day.
  for (let i = 1; i <= 10; i++) {
    const next = local(new Date(now.getTime() + i * 86400_000))
    if (!isShipDay(next)) continue
    const day = i === 1 ? 'tomorrow' : WEEKDAYS[next.weekday]
    return { today: false, text: `Order now and it ships ${day}. Orders by ${cutoffLabel()} Central on weekdays ship the same day.` }
  }
  return { today: false, text: `Orders by ${cutoffLabel()} Central on weekdays ship the same day.` }
}

/** Short version for small spaces. */
export const shipPromise = () => `Ships same day when you order by ${cutoffLabel()} Central on weekdays`
