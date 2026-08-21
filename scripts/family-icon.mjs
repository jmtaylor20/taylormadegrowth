#!/usr/bin/env node
// Generate the Family Money app icons.
//
// A cash-stack character in flat vector: navy outline, green bill, red shades.
// Drawn from a full-body reference, but an app icon is read at about 60px, and
// legs, shoes and a held money bag are illegible at that size while shrinking
// the face to nothing. So this is cropped to the head and shoulders — the
// shades are the part that identifies it — with the stack edge kept behind so
// it still reads as money rather than a green blob.
//
//   node scripts/family-icon.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'public/family/assets/img/';

const INK = '#22265e';        // navy outline, not black
const CYAN = '#5fdcf2';       // background
const GREEN = '#8cc96b';      // the bill
const GREEN_HI = '#9ed57c';   // top highlight
const GREEN_DK = '#6aad4d';   // stack behind, and shading
const RED = '#f0481f';        // sunglasses frame
const LENS = '#3a3e7a';
const LENS_HI = '#7378ad';
const BAND = '#f2f4f8';       // the white band across the note

// `pad` shrinks the drawing for the maskable variant, whose outer ~20% can be
// cropped to any shape by the launcher.
const svg = (size, pad = 1) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${CYAN}"/>
  <g transform="translate(50 54) scale(${pad}) translate(-50 -54)"
     stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">

    <!-- The rest of the stack, peeking out behind on the left. -->
    <!-- Its bottom corner has to match the note's, or the sliver reads as a
         foot sticking out from under the character. -->
    <path d="M21 41c5-5 11-7 17-6v53.6H29c-5 0-8-2.2-8-6.6Z" fill="${GREEN_DK}"/>

    <!-- The front note. Wavy top edge so it reads as a bill rather than a card.
         Filled first; the outline is stroked again at the end so the band and
         the highlight cannot bleed over the silhouette. -->
    <path id="note" d="M27 37c9-8 21-10 30-6.4 7 2.8 14 1.6 20-2.6V82c0 4.4-3 6.6-8 6.6H35
             c-5 0-8-2.2-8-6.6Z" fill="${GREEN}"/>
    <path d="M27 37c9-8 21-10 30-6.4 7 2.8 14 1.6 20-2.6v10.5c-6 4.2-13 5.4-20 2.6
             -9-3.6-21-1.6-30 6.4Z" fill="${GREEN_HI}" stroke="none"/>

    <!-- The white band across the note, kept strictly inside the silhouette. -->
    <g stroke="none">
      <rect x="27" y="71" width="50" height="9" fill="${BAND}"/>
    </g>
    <path d="M27 71h50M27 80h50" fill="none" stroke="${INK}" stroke-width="2.4"/>

    <!-- Silhouette back on top, so every edge stays clean. -->
    <path d="M27 37c9-8 21-10 30-6.4 7 2.8 14 1.6 20-2.6V82c0 4.4-3 6.6-8 6.6H35
             c-5 0-8-2.2-8-6.6Z" fill="none"/>

    <!-- Grin. Wide and white, or at icon size it reads as a hole in the face. -->
    <path d="M43 62c4.6 3.4 9.4 3.4 14 0-.8 5-4 7.6-7 7.6s-6.2-2.6-7-7.6Z"
          fill="${BAND}" stroke-width="2.6"/>

    <!-- Sunglasses. The one feature that survives being 60px wide, so it gets
         the most room. -->
    <g fill="${LENS}" stroke="${RED}" stroke-width="4">
      <path d="M28 45h22l-2.6 12.4c-.5 2.4-2.2 3.6-4.8 3.6h-7.4c-2.6 0-4.3-1.2-4.8-3.6Z"/>
      <path d="M54 45h22l-2.4 12.4c-.5 2.4-2.2 3.6-4.8 3.6h-7.4c-2.6 0-4.3-1.2-4.8-3.6Z"/>
    </g>
    <path d="M50 47h4" fill="none" stroke="${RED}" stroke-width="3.6"/>
    <path d="M28 46.5c-2.6-1-4.6-2.2-6.2-3.6" fill="none" stroke="${RED}" stroke-width="3.6"/>

    <!-- Light catching each lens. -->
    <g fill="${LENS_HI}" stroke="none">
      <path d="M34 47.5h3.6l-2.2 10h-3.6Z"/>
      <path d="M40 47.5h2.3l-2.2 10h-2.3Z"/>
      <path d="M60 47.5h3.6l-2 10h-3.6Z"/>
      <path d="M66 47.5h2.3l-2 10h-2.3Z"/>
    </g>
  </g>
</svg>`);

await mkdir(OUT, { recursive: true });
await Promise.all([
  sharp(svg(192)).png().toFile(`${OUT}icon-192.png`),
  sharp(svg(512)).png().toFile(`${OUT}icon-512.png`),
  sharp(svg(180)).png().toFile(`${OUT}icon-180.png`),
  sharp(svg(512, 0.74)).png().toFile(`${OUT}icon-maskable-512.png`),
]);
await writeFile(`${OUT}icon.svg`, svg(512));

console.log('icons written to', OUT);
