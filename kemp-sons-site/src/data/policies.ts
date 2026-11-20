/**
 * Store policies. One source for the site's policy pages (/refunds/, /privacy/,
 * /terms/, /shipping/) and Shopify's checkout policies (pushed with
 * shopPolicyUpdate, same HTML). Update both together.
 *
 * Written to cover order-update texts (Twilio, A2P 10DLC): the opt-in on the
 * proof page links to the privacy policy and terms, which carry the
 * carrier-required SMS language.
 */

export const POLICY_UPDATED = 'November 20, 2026'

const BIZ = 'Kemp &amp; Sons Printing'
const CONTACT = `<p><strong>${BIZ}</strong><br>2301 Enterprise Drive, Suite A<br>Opelika, AL 36801<br>Phone: <a href="tel:+13347055888">(334) 705-5888</a><br>Email: <a href="mailto:printing@kempandsons.com">printing@kempandsons.com</a></p>`

export interface Policy {
  slug: 'refunds' | 'privacy' | 'terms' | 'shipping'
  /** Shopify ShopPolicyType */
  shopifyType: 'REFUND_POLICY' | 'PRIVACY_POLICY' | 'TERMS_OF_SERVICE' | 'SHIPPING_POLICY'
  title: string
  summary: string
  html: string
}

const refunds: Policy = {
  slug: 'refunds',
  shopifyType: 'REFUND_POLICY',
  title: 'Refund Policy',
  summary: 'Every order is custom printed from the proof you approve, so sales are final. If something is wrong with the print quality, contact us and we will make it right.',
  html: `
<p>Last updated: ${POLICY_UPDATED}</p>

<h2>All sales are final</h2>
<p>Everything we print is made to order with your words, photos and choices, and printed exactly as shown on the proof you approve. Because custom printed items cannot be resold, all sales are final. We do not offer refunds, returns or exchanges, including for:</p>
<ul>
<li>Spelling, dates, times, names, photos, layout or other content that appeared on the proof you approved.</li>
<li>Choosing the wrong product, size, paper, finish or quantity.</li>
<li>Changing your mind after the order is placed.</li>
<li>Rush fees, once production has started.</li>
</ul>
<p>Please check your proof carefully before you approve it. You are responsible for the content you approve.</p>

<h2>Changes before printing</h2>
<p>If you need to change or cancel an order, call us at (334) 705-5888 as soon as possible. If your order has not gone to print, we will do our best to help, but we cannot promise a change or cancellation once production has started.</p>

<h2>If there is a problem with print quality</h2>
<p>We stand behind our work. If your order has a printing or material defect, such as a misprint, smearing, a trimming or folding error, a result that does not match your approved proof, or damage during shipping, contact us within 24 to 48 hours of pickup or delivery. Please include your order number and clear photos of the problem, and keep the printed items and any shipping packaging.</p>
<p>We will review it with you. If the problem is our error, we will reprint the affected items or offer another remedy that we agree on with you. We may ask you to return or show us the items.</p>

<h2>What is not a defect</h2>
<ul>
<li>Small color differences between your screen and the printed piece. Screens and printers show color differently, and photos from phones and social media vary in quality.</li>
<li>Soft or pixelated photos when the image you supplied was low resolution. Our editor warns you when a photo may print blurry.</li>
<li>Very small variations in trimming, folding and paper that are normal in commercial printing.</li>
</ul>

<h2>Contact us</h2>
${CONTACT}
`,
}

const shipping: Policy = {
  slug: 'shipping',
  shopifyType: 'SHIPPING_POLICY',
  title: 'Shipping Policy',
  summary: 'Free pickup at our Opelika shop, or free shipping within the United States.',
  html: `
<p>Last updated: ${POLICY_UPDATED}</p>

<h2>Pickup in Opelika</h2>
<p>Pickup at our shop, 2301 Enterprise Drive, Suite A, Opelika, Alabama, is free. We will email you when your order is ready, and text you if you signed up for order update texts. Please bring your order number.</p>

<h2>Shipping</h2>
<p>We ship within the United States only. Shipping is free on online orders. We choose the carrier and service (such as USPS or UPS) that best fits your order.</p>

<h2>When orders ship</h2>
<ul>
<li>Standard orders ship the next business day after you approve your proof and pay, unless a different date is shown when you order.</li>
<li>Rush orders, where offered, ship the same business day when placed and approved by the cutoff shown on the site (2 PM Central, Monday through Friday).</li>
<li>Large, complex or custom quoted jobs ship on the date we give you with your quote.</li>
</ul>
<p>Ship dates are not delivery dates. Once your order ships, delivery time depends on the carrier. We are not responsible for carrier delays, weather or holiday slowdowns, but we will help you track a package.</p>

<h2>Address and delivery problems</h2>
<p>Please make sure your shipping address is complete and correct. If a package is returned because of an incorrect address, reshipping may cost extra. If your order arrives damaged, contact us within 24 to 48 hours of delivery with photos of the items and the packaging so we can help. See our <a href="/refunds/">Refund Policy</a>.</p>

<h2>Contact us</h2>
${CONTACT}
`,
}

const privacy: Policy = {
  slug: 'privacy',
  shopifyType: 'PRIVACY_POLICY',
  title: 'Privacy Policy',
  summary: 'What we collect to print and deliver your order, how we use it, and your choices, including order update texts.',
  html: `
<p>Last updated: ${POLICY_UPDATED}</p>
<p>This Privacy Policy explains how ${BIZ} ("we," "us" or "our") collects, uses and shares information when you visit kempandsons.com, design or order from us online, at our shop or kiosk, request a quote, or sign up for text messages. By using our website or services, you agree to this policy.</p>

<h2>Information we collect</h2>
<p><strong>Information you give us.</strong></p>
<ul>
<li>Contact details such as your name, email address, phone number, and billing and shipping addresses.</li>
<li>Order details, such as the products, options and quantities you choose.</li>
<li>Design content you add, such as photos, artwork, names, dates, verses, obituaries and messages. For funeral programs this may include information about the person who has passed and their family.</li>
<li>Mailing lists you upload so we can address envelopes.</li>
<li>Quote requests, including any files you attach.</li>
<li>Your mobile number and consent, if you sign up for order update texts.</li>
<li>Anything else you send us by phone, email or text.</li>
</ul>
<p><strong>Payment information.</strong> Payments are processed by Shopify and its payment partners. We do not receive or store your full card number.</p>
<p><strong>Information collected automatically.</strong> When you use our website, we and our service providers collect information such as your IP address, browser and device type, pages viewed, how you arrived at our site (for example, from a Google ad), and actions such as starting a design or checking out. We use cookies and similar technologies for this. See "Cookies and analytics" below.</p>

<h2>How we use your information</h2>
<ul>
<li>To design, proof, print, pick up, ship and deliver your order.</li>
<li>To communicate with you about your order by email, phone and, if you opt in, text message.</li>
<li>To save your designs so you or our staff can reprint or reorder them.</li>
<li>To respond to quote requests and customer service questions.</li>
<li>To process payments, prevent fraud and keep our website secure.</li>
<li>To understand how our website is used, measure our advertising and improve our services.</li>
<li>To meet our legal, tax and accounting obligations.</li>
</ul>
<p>We use the photos, artwork and text you upload only to produce, proof and support your order and reorders. We do not use them in our own advertising or show them publicly without your permission.</p>

<h2>Text messages (SMS)</h2>
<p>If you check the box to receive order update texts, we use your mobile number to send messages about your order, such as when it is ready for pickup or has shipped. Message frequency varies, usually 1 to 3 messages per order. Message and data rates may apply. Consent to receive texts is not a condition of purchase.</p>
<p>You can opt out at any time by replying <strong>STOP</strong>. Reply <strong>HELP</strong> for help, or call us at (334) 705-5888.</p>
<p><strong>We do not sell, rent or share your mobile number, or your text messaging opt-in data and consent, with any third parties or affiliates for their marketing or promotional purposes.</strong> We share mobile numbers only with the service providers that send the messages for us, such as our text messaging provider (Twilio) and wireless carriers, and only so they can deliver our messages. Text messaging originator opt-in data and consent will not be shared with any third parties.</p>

<h2>How we share information</h2>
<p>We do not sell your personal information. We share it only as described here:</p>
<ul>
<li><strong>Service providers</strong> who help us run our business, including Shopify (online store, checkout and order management), payment processors, Netlify (website hosting and storage of design files), Google (analytics and advertising measurement), Twilio (text messages), and shipping carriers such as USPS and UPS (to deliver your order). They may use your information only to provide services to us.</li>
<li><strong>Funeral homes.</strong> If you order through a funeral home, or a funeral home orders for your family through our partner portal, that funeral home can see the order and its design.</li>
<li><strong>Legal reasons</strong>, when required by law or to protect our rights, our customers or others.</li>
<li><strong>Business transfers</strong>, if our business is sold or reorganized, as part of that transaction.</li>
</ul>

<h2>Cookies and analytics</h2>
<p>We use Google Analytics to understand how visitors use our site, and Google Ads to measure whether our ads lead to orders, quote requests and calls. These services use cookies and similar technologies and may collect information about your visits over time. You can block or delete cookies in your browser settings, opt out of Google Analytics with the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">Google Analytics opt-out add-on</a>, and manage ad personalization at <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google Ad Settings</a>. Our site does not currently respond to Do Not Track signals.</p>

<h2>How long we keep information</h2>
<p>We keep saved designs and their photos for about 13 months so orders can be reprinted or reordered, then delete them automatically. We keep order and payment records as long as needed for accounting, tax and legal purposes. You can ask us to delete your saved designs sooner.</p>

<h2>Security</h2>
<p>We use reasonable safeguards to protect your information, including secure (HTTPS) connections and access controls on our staff tools. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.</p>

<h2>Your choices</h2>
<ul>
<li>You can ask to see, correct or delete the personal information we hold about you by contacting us.</li>
<li>You can stop order update texts at any time by replying STOP.</li>
<li>You can unsubscribe from any marketing email using the link in the email.</li>
</ul>
<p>We will respond to requests within a reasonable time and may need to verify your identity. Some information may be kept where the law requires it.</p>

<h2>Children</h2>
<p>Our website and services are not directed to children under 13, and we do not knowingly collect personal information from children under 13.</p>

<h2>Changes to this policy</h2>
<p>We may update this policy from time to time. The "Last updated" date shows when it last changed. Changes apply from the date they are posted.</p>

<h2>Contact us</h2>
${CONTACT}
`,
}

const terms: Policy = {
  slug: 'terms',
  shopifyType: 'TERMS_OF_SERVICE',
  title: 'Terms of Service',
  summary: 'The terms for ordering from us online, at our shop or kiosk, and for order update texts.',
  html: `
<p>Last updated: ${POLICY_UPDATED}</p>
<p>These Terms of Service ("Terms") apply when you use kempandsons.com, design or order from ${BIZ} ("we," "us" or "our") online, at our shop or kiosk, request a quote, or receive text messages from us. By using our website or placing an order, you agree to these Terms, our <a href="/privacy/">Privacy Policy</a>, <a href="/refunds/">Refund Policy</a> and <a href="/shipping/">Shipping Policy</a>.</p>

<h2>1. Orders and proofs</h2>
<p>When you design an order, you will see a proof before you pay. Approving the proof means you have checked everything on it, including spelling, names, dates, times, photos, layout, quantity and options, and that you want it printed exactly as shown. We print what you approve. We are not responsible for errors that appear on an approved proof.</p>
<p>We may contact you about an order, and may hold or decline an order that we cannot print well or that breaks these Terms, with a full refund of anything paid for that order.</p>

<h2>2. Your content</h2>
<p>You are responsible for the photos, artwork, text, mailing lists and other content you upload or send us ("Your Content"). By submitting Your Content, you confirm that:</p>
<ul>
<li>You own it, or have permission from the owner (including any photographer and any person shown), to have it printed.</li>
<li>It does not infringe anyone's copyright, trademark, privacy or other rights, and it is not unlawful, defamatory, obscene or hateful.</li>
</ul>
<p>This applies in particular to finished designs you upload, such as cards made in another app or with an AI tool, or designs bought elsewhere. You give us permission to use, copy, edit, resize and print Your Content only as needed to produce, proof, ship and support your order and reorders. We may refuse to print content we believe breaks these Terms. You agree to cover any claims, costs or losses that result from Your Content.</p>
<p>Print quality depends on the quality of what you supply. Our editor warns you about photos that may print soft or blurry. We are not responsible for the quality of images you supply.</p>

<h2>3. Our designs and templates</h2>
<p>The templates, artwork, layouts and other content on our website belong to us or our licensors. You may personalize and order them from us for your own use. You may not copy, resell or reproduce our templates or artwork elsewhere.</p>

<h2>4. Prices and payment</h2>
<p>Prices are in U.S. dollars and may change at any time, but changes do not affect orders you have already placed. Applicable sales tax is added at checkout. Payment is due when you order. Quotes for custom jobs are valid for 30 days unless the quote says otherwise. If a price is shown in error, we may contact you before printing to correct it or cancel the order.</p>

<h2>5. Production, pickup and shipping</h2>
<p>Production times and ship dates shown on our site are estimates that start once your proof is approved and payment is received. See our <a href="/shipping/">Shipping Policy</a> for details. We are not responsible for delays caused by carriers, weather, supply shortages or other events outside our control.</p>

<h2>6. Color and materials</h2>
<p>Colors on screen may differ from the printed piece. Minor variations in color, trimming, folding and paper are normal in commercial printing and are not defects.</p>

<h2>7. Cancellations and refunds</h2>
<p>Because every order is custom printed from your approved proof, sales are final. See our <a href="/refunds/">Refund Policy</a> for what to do if there is a problem with print quality.</p>

<h2>8. Text message terms</h2>
<p><strong>Program.</strong> Kemp &amp; Sons Printing order updates. When you check the box to receive order update texts and give your mobile number, you agree to receive text messages from ${BIZ} about your order, such as when it is ready for pickup or has shipped.</p>
<ul>
<li><strong>Frequency:</strong> message frequency varies, usually 1 to 3 messages per order.</li>
<li><strong>Cost:</strong> message and data rates may apply, depending on your mobile plan.</li>
<li><strong>Opt out:</strong> reply <strong>STOP</strong> at any time to stop receiving messages. You will receive one final message confirming that you have opted out. To start again, sign up on a future order or reply START.</li>
<li><strong>Help:</strong> reply <strong>HELP</strong> for help, or call (334) 705-5888 or email printing@kempandsons.com.</li>
<li><strong>Not required:</strong> consent to receive texts is not a condition of purchase.</li>
<li><strong>Carriers:</strong> wireless carriers are not liable for delayed or undelivered messages.</li>
<li><strong>Privacy:</strong> we do not sell or share your mobile number or opt-in information for marketing. See our <a href="/privacy/">Privacy Policy</a>.</li>
</ul>

<h2>9. Funeral home partners</h2>
<p>Funeral homes that order through our partner portal agree to keep their login private, to have permission from the family for the content they submit, and to review proofs with the family when needed.</p>

<h2>10. Website use</h2>
<p>Please do not misuse our website, including trying to access staff areas without permission, interfering with how the site works, or using it for anything unlawful.</p>

<h2>11. Disclaimer and limit of liability</h2>
<p>Our website and services are provided "as is." To the fullest extent the law allows, we are not liable for any indirect, incidental or consequential damages, including missed events or deadlines, and our total liability for any claim about an order is limited to the amount you paid for that order.</p>

<h2>12. Governing law</h2>
<p>These Terms are governed by the laws of the State of Alabama. Any dispute will be handled in the state or federal courts serving Lee County, Alabama.</p>

<h2>13. Changes</h2>
<p>We may update these Terms from time to time. The "Last updated" date shows when they last changed. Changes apply to orders placed after they are posted.</p>

<h2>14. Contact us</h2>
${CONTACT}
`,
}

export const POLICIES: Policy[] = [refunds, shipping, privacy, terms]
