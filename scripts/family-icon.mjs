#!/usr/bin/env node
// Generate the Family Money app icons from the supplied artwork.
//
// The source PNG is the artwork itself and is committed alongside the output.
// Nothing here redraws or recolours it — the only operations are a crop of a
// stray edge and a resize, so what lands on the home screen is the picture that
// was handed over.
//
//   node scripts/family-icon.mjs

import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'public/family/assets/img/';
const SRC = `${OUT}icon-source.png`;

// The source carries a two-pixel white strip down its right edge. Left in, it
// survives every resize as a bright line against the cyan, and the maskable
// variant replicates it outward into a white band.
const TRIM = 2;

async function square() {
  const { width, height } = await sharp(SRC).metadata();
  const side = Math.min(width, height) - TRIM;
  return sharp(SRC).extract({ left: 0, top: 0, width: side, height: side }).png().toBuffer();
}

const art = await square();

const resize = (size) =>
  sharp(art).resize(size, size, { fit: 'cover', kernel: 'lanczos3' }).png();

// Android crops the outer ~20% of a maskable icon to whatever shape the
// launcher uses, so the art is inset to survive it. The padding replicates the
// artwork's own edge pixels, which beats filling with a sampled colour — the
// background is not perfectly flat, and a solid fill leaves a visible seam.
//
// The extend runs in its own pipeline on purpose: sharp applies extend *after*
// resize whatever order you call them in, so chaining the two would pad the
// finished icon and hand back an oversized image instead of an inset one.
async function maskable(size, scale = 0.74) {
  const { width } = await sharp(art).metadata();
  const grow = Math.round((width / scale - width) / 2);
  const padded = await sharp(art)
    .extend({ top: grow, bottom: grow, left: grow, right: grow, extendWith: 'copy' })
    .png()
    .toBuffer();
  return sharp(padded).resize(size, size, { fit: 'cover', kernel: 'lanczos3' }).png();
}

await mkdir(OUT, { recursive: true });
await Promise.all([
  resize(192).toFile(`${OUT}icon-192.png`),
  resize(512).toFile(`${OUT}icon-512.png`),
  resize(180).toFile(`${OUT}icon-180.png`),
  maskable(512).then((img) => img.toFile(`${OUT}icon-maskable-512.png`)),
]);

console.log('icons written to', OUT);
