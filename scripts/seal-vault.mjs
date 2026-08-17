#!/usr/bin/env node
// Seal the family finance seed into an encrypted vault the public repo can carry.
//
//   node scripts/seal-vault.mjs [--in private/family-seed.json] [--out public/family/vault.json]
//
// The passphrase is read from FAMILY_PASSPHRASE, or prompted for on a TTY.
// Plaintext lives in private/ (gitignored); only the ciphertext is committed.
//
// Crypto: PBKDF2-SHA256 (600k iterations) → AES-256-GCM. The browser side
// (public/family/assets/js/vault.js) reverses exactly these steps with the
// same WebCrypto primitives, so there is one algorithm to reason about.

import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const ITERATIONS = 600_000;

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const b64 = (buf) => Buffer.from(buf).toString('base64');

async function deriveKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
}

async function readPassphrase() {
  if (process.env.FAMILY_PASSPHRASE) return process.env.FAMILY_PASSPHRASE;
  if (!process.stdin.isTTY) {
    console.error('No passphrase: set FAMILY_PASSPHRASE or run from a terminal.');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pass = await rl.question('Vault passphrase: ');
  rl.close();
  return pass;
}

const inPath = arg('--in', 'private/family-seed.json');
const outPath = arg('--out', 'public/family/vault.json');

const plaintext = await readFile(inPath, 'utf8');
JSON.parse(plaintext); // fail loudly on malformed seed before we encrypt it

const passphrase = await readPassphrase();
if (passphrase.length < 12) {
  console.error('Passphrase must be at least 12 characters — this file goes in a public repo.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const key = await deriveKey(passphrase, salt);
const ct = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext),
);

await writeFile(outPath, JSON.stringify({
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
  cipher: 'AES-GCM',
  iv: b64(iv),
  ct: b64(ct),
}, null, 2) + '\n');

console.log(`Sealed ${plaintext.length} bytes → ${outPath}`);
