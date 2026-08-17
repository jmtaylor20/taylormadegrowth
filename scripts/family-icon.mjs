#!/usr/bin/env node
// Generate the Family Money app icons.
//
// Cartoon sticker style: heavy dark outline, flat fills with a single darker
// shade for depth. Two money bags on a warm cream ground, so the gold reads on
// both light and dark home screens.
//
//   node scripts/family-icon.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'public/family/assets/img/';

const INK = '#2e2419';       // outline
const GOLD = '#f2b93c';      // front bag
const GOLD_DARK = '#d99a22'; // bag behind, and shading
const COIN = '#f7d268';
const CREAM = '#fdf1e3';

// `pad` shrinks the drawing for the maskable variant, whose outer ~20% can be
// cropped to any shape by the launcher.
const svg = (size, pad = 1) => Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${CREAM}"/>
  <g transform="translate(50 54) scale(${pad}) translate(-50 -54)"
     stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">

    <!-- Loose coins. Flat discs with a thin darker ring: a filled dark centre
         turns them into black rings once scaled to a home screen. -->
    <circle cx="17" cy="30" r="7" fill="${COIN}" stroke-width="2.6"/>
    <circle cx="17" cy="30" r="3.2" fill="none" stroke="${GOLD_DARK}" stroke-width="1.7"/>

    <!-- Bag behind, to the right. Drawn first so the front bag overlaps it. -->
    <path d="M70 44c-3.4-2-5-4.9-3.4-6.7 5 1.2 11.6 1.2 16.6 0 1.6 1.8 0 4.7-3.4 6.7
             7.6 3.6 12.4 10.2 12.4 17.3 0 8.6-6.6 13.4-17.3 13.4S57.6 69.9 57.6 61.3
             C57.6 54.2 62.4 47.6 70 44Z" fill="${GOLD_DARK}"/>

    <!-- Front bag: ruffled tie at the neck, flaring to a heavy rounded base. -->
    <path d="M33 42c-6-3.4-8.4-8.6-5.2-11.4 8.4 2.4 20.6 2.4 29 0 3.2 2.8.8 8-5.2 11.4
             13 6 21.4 17.2 21.4 29.4 0 13-11 20.2-30.7 20.2S11.6 84.4 11.6 71.4
             C11.6 59.2 20 48 33 42Z" fill="${GOLD}"/>

    <!-- The tie itself, as a band across the neck. It has to stop where the
         neck stops (x=51.6): overshooting leaves a stub hanging in mid-air
         that reads as a horn once the icon is scaled down. -->
    <path d="M33 42c6 1.7 12.6 1.7 18.6 0" fill="none" stroke-width="2.8"/>

    <!-- Dollar sign, drawn rather than typeset so no font is needed. -->
    <g fill="none" stroke="${INK}" stroke-width="3.4">
      <path d="M52.6 60.5c-2.6-2.4-13.6-3-13.6 3.4 0 6 13.6 4.4 13.6 11 0 6.6-11.4 5.8-14.2 3.2"/>
      <path d="M45.8 54.6v31"/>
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
