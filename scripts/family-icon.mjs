#!/usr/bin/env node
// Generate the Family Money app icons.
//
// Cartoon sticker style: heavy dark outline, flat fills with a single darker
// shade for depth, gold coins. Drawn on a warm cream ground so the pink reads
// on both light and dark home screens.
//
//   node scripts/family-icon.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'public/family/assets/img/';

const INK = '#2e2419';      // outline
const PINK = '#f3a6b6';
const PINK_DARK = '#e5879c'; // belly / ear shading
const GOLD = '#f6c445';
const GOLD_DARK = '#e0a72c';
const CREAM = '#fdf1e3';

// `pad` shrinks the drawing for the maskable variant, whose outer ~20% can be
// cropped to any shape by the launcher.
const svg = (size, pad = 1) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${CREAM}"/>
  <g transform="translate(50 54) scale(${pad}) translate(-50 -54)"
     stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">

    <!-- coins dropping in. Mostly gold: a filled dark centre turns them into
         black rings once the icon is scaled down to a home screen. -->
    <g fill="${GOLD}" stroke-width="2.6">
      <circle cx="60" cy="16" r="8.4"/>
      <circle cx="60" cy="16" r="4" fill="none" stroke="${GOLD_DARK}" stroke-width="1.8"/>
      <circle cx="30" cy="12" r="6.2"/>
      <circle cx="30" cy="12" r="2.8" fill="none" stroke="${GOLD_DARK}" stroke-width="1.6"/>
    </g>

    <!-- behind the body: tail and legs -->
    <path d="M78 58c6.5 0 8-6.5 3.6-8.2-3.4-1.3-5.2 2.6-2.4 4.2" fill="none"/>
    <path d="M32 72h9v11h-9z" fill="${PINK_DARK}"/>
    <path d="M58 72h9v11h-9z" fill="${PINK_DARK}"/>

    <!-- Ear. It has to clear the body silhouette by a good margin: poking out
         by only a few units leaves nothing but two stroke widths, which reads as
         a black blob once scaled down. -->
    <path d="M31 46C29 32 32 25 38 26c5.5 1 8.5 8 9 17z" fill="${PINK_DARK}"/>

    <!-- body -->
    <ellipse cx="50" cy="57" rx="29" ry="20" fill="${PINK}"/>
    <path d="M21 62a29 20 0 0 0 58 0z" fill="${PINK_DARK}" stroke="none"/>
    <ellipse cx="50" cy="57" rx="29" ry="20" fill="none"/>

    <!-- Coin slot: fill only. Stroking it as well doubles its apparent height
         and it stops reading as a cut in the back. -->
    <rect x="53" y="42" width="15" height="4.4" rx="2.2" fill="${INK}" stroke="none"
          transform="rotate(-8 60.5 44.2)"/>

    <!-- snout -->
    <ellipse cx="19" cy="59" rx="9.5" ry="8" fill="${PINK_DARK}"/>
    <ellipse cx="16.5" cy="58" rx="1.5" ry="2" fill="${INK}" stroke="none"/>
    <ellipse cx="22" cy="58" rx="1.5" ry="2" fill="${INK}" stroke="none"/>

    <!-- eye -->
    <circle cx="33" cy="52" r="3.1" fill="${INK}" stroke="none"/>
    <circle cx="34.1" cy="50.9" r="1.05" fill="${CREAM}" stroke="none"/>
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
