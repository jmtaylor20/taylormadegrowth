# Kemp & Sons Printing website

Custom marketing site for **kempandsons.com**: a scroll-driven 3D landing page,
the custom job work-order form, and the front door to the Shopify store.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| This site (Astro, static) | kempandsons.com on Netlify | Story, product lines, custom job leads, visit info |
| Shopify store | shop.kempandsons.com | PitchPrint template editor, proofs, cart, checkout, customer accounts and reorders, reviews, discounts, shipping |
| Netlify Forms | built into this site | Stores custom job requests (with file upload) and emails the shop |

Personalization apps like PitchPrint only run inside a Shopify theme, so the
ordering experience lives on the Shopify store (themed to match). This site
reads the product lines from Shopify's Storefront API at build time and links
into the store.

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

- [ ] Fill in `TODO(kemp)` items in `src/config/site.ts`
- [ ] Shopify env vars set, collections created and published to the Headless channel
- [ ] Form notification email set in Netlify
- [ ] Remove the `X-Robots-Tag: noindex` header from `netlify.toml`
- [ ] Point kempandsons.com DNS to Netlify, shop.kempandsons.com to Shopify
- [ ] Submit the sitemap and verify the domain in Google Search Console
