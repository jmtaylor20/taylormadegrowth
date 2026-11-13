# Kemp & Sons Printing website

Custom site for **kempandsons.com**: a scroll-driven 3D landing page, the
online design editor, and the custom job work-order form. Shopify handles
checkout.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| This site (Astro, static) | kempandsons.com on Netlify | Story, product galleries (`/shop/:line/`), the design editor (`/design/:template/`), reorders (`/reorder/`), custom job leads |
| Design editor (React island) | `src/editor/` | Fill-in-the-blanks templates, live preview, proofs, print PDFs with bleed and crop marks, addressed envelopes |
| Netlify Functions + Blobs | `netlify/functions/` | Stores each approved design (print file, proof, envelopes, editable design and photos) for 13 months |
| Shopify store | shop.kempandsons.com | Prices and options (product variants), cart, checkout, payments, customer accounts, orders |
| Netlify Forms | built into this site | Stores custom job requests (with file upload) and emails the shop |

Customers design and approve on this site. On approval the editor uploads the
print file and adds the item to a Shopify cart through the Storefront API; the
order line carries the print file, proof, envelope and reorder links. The
Shopify theme redirects its storefront pages back to this site
(`snippets/kemp-site-redirect.liquid` in the theme).

### Adding a template

1. Create `src/editor/templates/<name>.ts` (see `christmas-very-merry.ts` and the
   documented format in `src/editor/types.ts`). Positions are in inches from the
   trim, font sizes in points. Background art goes in `public/templates/<name>/`
   at 300 ppi including the 0.125 in bleed.
2. Register it in `src/editor/templates/index.ts`.
3. In Shopify, create the product with handle = the template's `shopifyHandle`,
   options such as Quantity and Paper, publish it to Online Store and Headless,
   add it to its collection, and set the metafield `custom.editor_path` to
   `/design/<template id>/`.

See `docs/LAUNCH.md` for the Shopify admin steps and launch checklist.

## Run

```bash
npm install
cp .env.example .env    # optional until Shopify exists
npm run dev             # http://localhost:4321
npm run build           # type-checks, then builds to dist/
```

## Environment variables

Set these in Netlify (Site configuration > Environment variables), then redeploy.

| Variable | Example | Notes |
| --- | --- | --- |
| `PUBLIC_SHOP_URL` | `https://shop.kempandsons.com` | Where "Start an order" and product links go |
| `SHOPIFY_STORE_DOMAIN` | `kemp-sons.myshopify.com` | The store's myshopify domain |
| `SHOPIFY_STOREFRONT_TOKEN` | | Public Storefront API token from Shopify's Headless channel |

Without them, the site uses the built-in product line copy in `src/config/site.ts`.

## Content

All business details live in `src/config/site.ts`. Items marked `TODO(kemp)`
are waiting on the Getting Started Checklist (hours, social links, founding
year, confirmed equipment). Product line `collection` values must match the
Shopify collection handles:

`funeral-programs`, `christmas-cards`, `business-cards`, `thank-you-cards`, `stickers`

## The 3D story

`src/scripts/scene.ts` builds five stages that advance as each `[data-stage]`
section scrolls in: open sheet, folded funeral program, product lineup, press
stack, and Kemp & Sons business cards. Artwork is drawn on canvases in
`src/scripts/textures.ts` (no stock images). `src/scripts/experience.ts` wires
Lenis smooth scrolling, GSAP ScrollTrigger and the scene together. Three.js
loads after the page text, motion is reduced for visitors who ask for it, and
the site works without WebGL.

## Custom job form

`src/components/QuoteForm.astro` posts to Netlify Forms as `custom-job`, with a
file upload up to 8 MB. After the first deploy, set the email recipient in
Netlify: Forms > custom-job > Form notifications > Email notification to
printing@kempandsons.com.

## Launch checklist

See [`docs/LAUNCH.md`](docs/LAUNCH.md).
