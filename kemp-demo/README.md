# Kemp & Sons sales demo

A clickable demo of an online print shop for Kemp & Sons: pick a template,
personalize it live on a phone, approve a proof, check out (no charge), and see
what the shop receives, including a print-ready PDF and an order board.

This is a sales demo, not production. There is no backend: everything is stored
in the browser's localStorage, and payments and texts are simulated. The real
store is planned for Shopify with a product personalization app.

Live demo: https://kemp-sons-demo.netlify.app

## Run

```bash
cd kemp-demo
npm install
npm run dev        # http://localhost:5173
```

## Build

```bash
npm run build      # type-checks, then builds to dist/
npm run preview    # serves dist/ locally
```

## Deploy (Netlify)

`netlify.toml` builds with `npm run build`, publishes `dist`, and redirects
every path to `index.html` so deep links like `/admin` work.

- Netlify UI: new site from this repo, set **Base directory** to `kemp-demo`.
- Or from this folder: `npx netlify deploy --prod --dir dist` after a build.

The site sends `X-Robots-Tag: noindex` so it stays out of search results.

## Demo walkthrough

The **Demo Guide** button (bottom right) walks through four steps:

1. **Pick a template**: Funeral Programs, Christmas Cards, Wedding Invitations, Yard Signs, Banners.
2. **Edit it live**: the preview redraws on every keystroke. Long text shrinks to fit, photos drag and zoom inside their frames, and **Print guides** shows bleed, trim, safe area and folds.
3. **Approve the proof**: a full-screen proof of every side, automatic checks (text too long, empty photo spots), and three boxes to tick before **Approve** turns on. Then a simulated checkout.
4. **See the shop side**: the order email with **Download print file**, the **Order Board** at `/admin`, and **Partner Accounts** at `/partners`.

**Reset Demo** (in the guide and the header menu) clears everything the demo
stored and restores the 8 sample orders.

## How it is built

- Vite, React, TypeScript, Tailwind CSS 4
- Konva via react-konva for the template canvas
- jsPDF for the print file (loaded only when a print file is requested)
- Fonts are bundled with Fontsource, so the canvas never waits on a font CDN

| Path | What it is |
| --- | --- |
| `src/templates/` | Template configs, one file per design or family |
| `src/templates/types.ts` | The config format (documented inline) |
| `src/components/SideCanvas.tsx` | Draws one side. Used by the editor, proof, thumbnails and PDF |
| `src/lib/textFit.ts` | Word wrap, shrink to fit, dotted leaders, section stacks |
| `src/lib/render.tsx` | Renders a side to an image off screen |
| `src/lib/pdf.ts` | Print-ready PDF with bleed, crop marks and fold marks |
| `src/lib/orders.ts` | Orders in localStorage and the seeded sample orders |

### The print file

One page per side. The artwork includes 0.125 in bleed past the trim, crop
marks sit just outside the bleed, folded pieces get dashed fold marks, and a
slug line names the order. The page is trim plus 0.29 in on each side, the same
layout as the shop's InDesign exports (an 8.5 x 11 program is 834 x 654 pt).

Artwork is rasterized at 300 ppi for small pieces. Large formats are capped at
about 16 megapixels so phones can build them (yard signs about 190 ppi, the
6 x 3 ft banner about 78 ppi, which is normal for banners viewed from a
distance). The production Shopify personalization app should output vector PDFs.

## Add a new template

1. Create a file in `src/templates/`, for example `src/templates/graduation-card.ts`:

```ts
import type { Template } from './types'
import { CARD_OPTIONS } from './shared'

export const gradCard: Template = {
  id: 'grad-card-classic',          // used in the URL: /editor/grad-card-classic
  category: 'christmas',            // one of the five categories
  name: 'Classic Grad Card',
  description: 'Shown on the template card in the gallery.',
  trim: { w: 5, h: 7 },             // finished size in inches (flat, unfolded)
  sizeLabel: '5 x 7 in flat card',
  safeMargin: 0.2,                  // inches inside the trim for the green guide
  ...CARD_OPTIONS,                  // quantities, papers and prices (or write your own)
  fields: [
    { id: 'name', type: 'text', label: 'Graduate name', default: 'Jordan Hayes' },
    { id: 'note', type: 'textarea', label: 'Note', rows: 3, default: 'We are so proud of you.' },
    { id: 'photo', type: 'photo', label: 'Photo' },
  ],
  sides: [
    {
      id: 'front',
      label: 'Front',
      background: '#faf7f0',
      elements: [
        // Positions and sizes are in inches from the top-left of the trim.
        // Negative values or values past the trim run into the bleed.
        { type: 'photo', field: 'photo', x: -0.125, y: -0.125, w: 5.25, h: 4.5 },
        // Font sizes are in points. Text shrinks from `size` down to `minSize` to fit its box.
        { type: 'text', text: '{{name}}', x: 0.4, y: 4.7, w: 4.2, h: 0.8,
          font: 'Great Vibes', size: 40, minSize: 20, color: '#2b2a28' },
        { type: 'text', text: '{{note}}', x: 0.5, y: 5.6, w: 4, h: 0.9,
          font: 'Cormorant Garamond', italic: true, size: 14, color: '#4a4a44' },
      ],
    },
  ],
}
```

2. Add it to the `TEMPLATES` list in `src/templates/index.ts`.

That's it: it appears in its category with a generated thumbnail, and the
editor, proof, checkout, order email and print file all work automatically.

### Config reference

**Fields** (`fields`): `text`, `textarea` (multi-line) and `photo`. A photo
field with `count: 6` becomes a collage picker whose slots are referenced as
`collage_1` ... `collage_6`. `section` groups fields under a heading in the
form; `hint` adds help text.

**Elements** (`sides[].elements`), drawn in order (later ones on top):

| Type | Key properties |
| --- | --- |
| `text` | `text` with `{{fieldId}}` tokens, `x y w h`, `font`, `size`, `minSize`, `weight`, `italic`, `color`, `align`, `valign`, `lineHeight`, `letterSpacing` (em), `uppercase` |
| `text` with `leaders: true` | Each line typed as `Item \| Person` gets a dotted leader; a line starting with `\|` is right-aligned |
| `stack` | Titled sections (`items: [{ heading, body }]`) that stack top to bottom; blank sections drop out and the rest close up |
| `photo` | `field`, `x y w h`, `shape` (`rect`, `ellipse`, `arch`), `stroke`, `optional` (no placeholder) |
| `rect`, `ellipse`, `line`, `star` | Simple shapes for borders, bands and ornaments |

Any element can take `showIf: 'fieldId'` to hide it when that field is blank,
plus `rotation` and `opacity`.

**Sides**: `folds: [5.5]` draws fold guides and adds fold marks to the PDF;
`panels` labels the panels under the preview.

**Fonts** available: Cormorant Garamond, Playfair Display, Great Vibes,
Montserrat, Inter. To add one, install it from Fontsource, import the weights in
`src/lib/fonts.ts`, and add it to `FontFamily` in `types.ts`.
