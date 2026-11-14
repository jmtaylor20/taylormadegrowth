/**
 * In-store kiosk mode. The kiosk page (/in-store/) turns it on for the
 * browser tab, and the designer then returns there instead of the main site
 * and wipes the customer's work when they walk away or check out.
 */
export const KIOSK_HOME = '/in-store/'
const FLAG = 'kemp-kiosk'

export function enterKiosk() {
  try {
    sessionStorage.setItem(FLAG, '1')
  } catch {
    /* private mode: kiosk extras just stay off */
  }
}

export function isKiosk() {
  try {
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false
  }
}

/** Seconds of no touches before asking "Still working?", then before resetting. */
export const IDLE_SECONDS = 150
export const WARN_SECONDS = 30
