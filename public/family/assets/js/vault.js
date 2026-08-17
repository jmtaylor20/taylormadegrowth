// Vault: decrypt the sealed seed shipped with the app, and re-seal edits.
//
// This repo is public, so nothing about the family's money is committed in the
// clear. `vault.json` is AES-256-GCM ciphertext under a PBKDF2-SHA256 key
// (600k iterations). Same primitives as scripts/seal-vault.mjs, in reverse.

const ITERATIONS = 600_000;

const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesToB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));

async function deriveKey(passphrase, salt, iterations, usages) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

// Wrong passphrase surfaces as a GCM auth-tag failure, which is exactly the
// signal we want — there is no way to "half decrypt" into plausible garbage.
export async function open(envelope, passphrase) {
  const salt = b64ToBytes(envelope.kdf.salt);
  const iv = b64ToBytes(envelope.iv);
  const key = await deriveKey(passphrase, salt, envelope.kdf.iterations ?? ITERATIONS, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, b64ToBytes(envelope.ct),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function seal(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS, ['encrypt']);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data, null, 2)),
  );
  return {
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: bytesToB64(salt) },
    cipher: 'AES-GCM',
    iv: bytesToB64(iv),
    ct: bytesToB64(ct),
  };
}
