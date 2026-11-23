// Kemp & Sons: Google Ads purchase conversion (and GA4 purchase) from Shopify checkout.
// Paste into Shopify admin > Settings > Customer events > Add custom pixel.
// Name: "Google Ads purchase". Do not also turn on purchase conversions in the
// Google & YouTube app, or each sale would be counted twice.

const ADS_ID = 'AW-18580854111'
const PURCHASE = 'AW-18580854111/_mt6CJyLpLwdEN-qhZxF'
const GA4_ID = 'G-CRKJS4F8XB'

const s = document.createElement('script')
s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ADS_ID
s.async = true
document.head.appendChild(s)

window.dataLayer = window.dataLayer || []
function gtag() { window.dataLayer.push(arguments) }
gtag('js', new Date())
// The checkout page's address carries the ad click and visit IDs passed from kempandsons.com.
const page = init.context.document.location.href
gtag('config', ADS_ID, { page_location: page, allow_enhanced_conversions: true })
gtag('config', GA4_ID, { page_location: page, send_page_view: false })

analytics.subscribe('checkout_completed', (event) => {
  const c = event.data.checkout
  const value = Number(c.totalPrice?.amount ?? 0)
  const currency = c.currencyCode || 'USD'
  const orderId = c.order?.id || c.token
  // Enhanced conversions: Google matches the sale to the ad click with the hashed email and phone.
  gtag('set', 'user_data', {
    email: c.email || undefined,
    phone_number: c.phone || c.billingAddress?.phone || undefined,
  })
  gtag('event', 'conversion', { send_to: PURCHASE, value, currency, transaction_id: orderId })
  gtag('event', 'purchase', {
    send_to: GA4_ID,
    transaction_id: orderId,
    value,
    currency,
    items: (c.lineItems || []).map((li) => ({
      item_id: li.variant?.id,
      item_name: li.title,
      item_variant: li.variant?.title,
      price: Number(li.variant?.price?.amount ?? 0),
      quantity: li.quantity,
    })),
  })
})
