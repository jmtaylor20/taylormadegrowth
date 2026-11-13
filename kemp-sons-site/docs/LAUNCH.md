# Kemp & Sons: Shopify setup and launch checklist

How the pieces fit:

- **kempandsons.com** (this repo, on Netlify): the website, product galleries, the design editor, proofs, saved designs and reorders.
- **Shopify** (ynnu29-88.myshopify.com, later shop.kempandsons.com): cart, checkout, payments, customer accounts and orders.
- When a customer approves a proof, the site saves the print file and adds the item to a Shopify cart. The order line carries links to the print file, proof, envelopes file and reorder link.

---

## 1. Shopify admin steps (by hand)

### 1a. Preview and publish the matching theme

Done: the theme **"Kemp & Sons (matches site)"** is published. It has:

- **Look:** Kemp's logo, the site's colors and type (Archivo), square corners, red buttons, and an announcement bar.
- **Redirects:** storefront pages send shoppers to the matching page on the website. For example, the Christmas card product page opens the designer, and the Christmas Cards collection opens /shop/christmas-cards/. Cart, checkout and account pages stay on Shopify.

To preview and publish:

1. Go to **Online Store → Themes**, find the draft, and choose **Preview**. Redirects are off inside the theme editor, so use Preview.
2. Check the cart drawer and account pages look right.
3. Choose **Publish**.

### 1b. Brand the checkout (done)

The API doesn't allow checkout branding, so set it by hand:

1. Go to **Settings → Checkout → Customize**.
2. Set the **logo** to the "kemp-sons-logo.png" file that's already in Files, at a width of about 160 px.
3. Set **colors**:
   - Background: #F5F5F2
   - Text: #111111
   - Buttons: #ED1C24, with white text
4. Set **corner radius** to None (square) and **font** to Archivo, if offered.
5. Save, then check a test checkout on your phone.

### 1c. Add print files to the staff order email (done)

1. Go to **Settings → Notifications → Staff notifications → New order → Edit code**.
2. Paste this near the top of the email body, just after the opening greeting:

```liquid
{% comment %} Kemp & Sons: files from the online designer {% endcomment %}
{% for line in line_items %}
  {% if line.properties['_Print file'] %}
    <p style="margin:12px 0;padding:12px;border:2px solid #111">
      <strong>{{ line.title }}</strong> ({{ line.variant.title }})<br>
      Ref {{ line.properties['_Reference'] }}<br>
      <a href="{{ line.properties['_Print file'] }}">Download print file (PDF)</a>
      &nbsp;|&nbsp; <a href="{{ line.properties['_Proof'] }}">Approved proof</a>
    </p>
  {% endif %}
  {% if line.properties['_Envelopes file'] %}
    <p style="margin:12px 0;padding:12px;border:2px solid #111">
      <strong>Addressed envelopes</strong> x {{ line.quantity }} (Ref {{ line.properties['_Reference'] }})<br>
      <a href="{{ line.properties['_Envelopes file'] }}">Download envelope file (PDF)</a>
    </p>
  {% endif %}
{% endfor %}
```

The same links also appear on every order in the Shopify admin, under each line item.

### 1d. Add the reorder link to the customer confirmation email (done)

1. Go to **Settings → Notifications → Customer notifications → Order confirmation → Edit code**.
2. Paste this just before the order summary:

```liquid
{% for line in line_items %}
  {% if line.properties['_Reorder'] %}
    <p>Want to print <strong>{{ line.properties['Design'] }}</strong> again next year?
      <a href="{{ line.properties['_Reorder'] }}">Open your saved design</a> to change the year or a photo and reorder.</p>
    {% break %}
  {% endif %}
{% endfor %}
```

### 1e. Clean up the PitchPrint test

1. Done: PitchPrint is uninstalled.
2. Optional: cancel and then delete test orders #1001, #1002 and #1003.

---

## 2. Waiting on Kemp

- **Prices:**
  - Real prices and quantities for each product. Edit the product variants in Shopify.
  - The price per addressed envelope. "Addressed envelopes" is currently a $0.60 placeholder.
- **Shipping rates:** Shopify's defaults are live right now, including free shipping over $70.
- **Pickup ready time:** currently "2 to 4 days".
- **Business details:**
  - Hours, social links, founding year and equipment list. These live in `src/config/site.ts`.
  - Confirm the 334 area code.
  - How the "Bass Printing Inc" legal name should be handled.
- **Photos:** the shop, the presses and the team.
- **Templates:** more designs for each product line. The template format is in `src/editor/types.ts`, and the first template is `src/editor/templates/christmas-very-merry.ts`.

---

## 3. Launch day

1. **Shopify domain:**
   - Add `shop.kempandsons.com` under Settings → Domains, plus the DNS record Shopify gives you.
   - Then set Netlify's `PUBLIC_SHOP_URL` to `https://shop.kempandsons.com`.
2. **Point the website at its real domain:** connect kempandsons.com to the Netlify site.
3. **Update the theme redirect:** in the published theme, edit `snippets/kemp-site-redirect.liquid` and change `site_url` to `https://kempandsons.com`.
4. **Let Google in:** remove the `X-Robots-Tag: noindex, nofollow` line from `netlify.toml`.
5. **Form emails:** in Netlify, go to Forms → custom-job → Form notifications and email printing@kempandsons.com.
6. **Open the store:** in Shopify, go to Online Store → Preferences and turn off the store password.
7. **Delete test leftovers:**
   - The `KEMPTEST-PP100` discount code.
   - Any `[Placeholder]` draft products.
8. **Place one real order end to end,** then refund it.

---

## 4. Real-phone test (before launch)

Test on an older iPhone and an Android phone, on mobile data:

- [ ] Homepage 3D story scrolls smoothly, and the text never sits under the graphics.
- [ ] Christmas Cards gallery shows the card preview.
- [ ] Designer: add 3 photos from the camera roll, drag and zoom them, edit every text field. The keyboard never covers the field you're typing in.
- [ ] Envelopes: paste addresses, and upload a CSV exported from Google Sheets.
- [ ] Proof shows both sides, the checkboxes work, and approve leads to Shopify checkout.
- [ ] Checkout with local pickup and with shipping.
- [ ] The order in Shopify has working print file, proof and envelope links.
- [ ] The reorder link from the confirmation email opens the design on a different device.

---

## 5. Staff job board (`/staff/`)

The job board shows every online order in four columns: New, Printing, Ready and Done.

- **Ready for pickup** sends Shopify's "Ready for pickup" email.
- **Mark shipped** sends Shopify's shipping email with the tracking number.
- **Notes and stages** are saved on the Shopify order (stages are tags such as `stage-printing`), so they also show in the Shopify admin.
- **Demo:** add `?demo=1` to the address to see the board with sample jobs, without signing in.

### Setup (one time)

**A. Create the Shopify app that lets the board read and update orders**

1. Open **dev.shopify.com** and sign in with the account that **owns Kemp's store**, or a staff account allowed to develop apps. The app has to belong to the same organization as the store, or Shopify refuses the connection.
2. Go to **Apps → Create app**, name it `Kemp Job Board`, and start it in the Dev Dashboard.
3. Create a **version** with these access scopes, then release it:
   - `read_orders`
   - `write_orders`
   - `read_merchant_managed_fulfillment_orders`
   - `write_merchant_managed_fulfillment_orders`
   - `read_customers`
4. **Install** the app on the Kemp & Sons store and approve the scopes.
5. Open the app's **Settings** and copy the **Client ID** and **Client secret**.

**B. Add the settings in Netlify**

Go to **Site configuration → Environment variables**. Mark each one as a secret where Netlify offers it, with **Functions** scope:

| Key | Value |
| --- | --- |
| `SHOPIFY_ADMIN_CLIENT_ID` | Client ID from step A5 |
| `SHOPIFY_ADMIN_CLIENT_SECRET` | Client secret from step A5 |
| `STAFF_PASSWORD` | The shared staff password. Use a long one, and share it with staff in person, not by email. |

`STAFF_SESSION_SECRET` is already set. Then go to **Deploys → Trigger deploy**.

**C. Use it**

1. Open `https://<site>/staff/` on the shop computer and sign in. The sign-in lasts 30 days.
2. To sign everyone out, change `STAFF_PASSWORD` and redeploy.
3. After 8 wrong passwords in a row, that address is locked out for 15 minutes.

### Turning on pickup texts later

1. Create a Twilio account and buy a local number.
2. Complete the **A2P 10DLC** registration (Twilio walks you through it). Carrier approval can take 1 to 3 weeks.
3. Add these in Netlify, then redeploy:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM` (the number, for example `+13345550100`)

The board then texts the customer's phone number along with the email when a pickup order is marked ready.
