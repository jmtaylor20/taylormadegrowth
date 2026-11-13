/**
 * Pickup text messages (optional). Shopify's own "Ready for pickup" email is
 * always sent; a text is added when Twilio is set up:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (e.g. +13345550100)
 * US carriers require the sending number to be registered (A2P 10DLC) first.
 */

export const textingEnabled = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)

/** US numbers to E.164 (+1XXXXXXXXXX). Returns null if it doesn't look like a phone number. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('+') && digits.length >= 10) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

export async function sendText(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
  })
  if (!res.ok) throw new Error(`Text failed (${res.status})`)
}
