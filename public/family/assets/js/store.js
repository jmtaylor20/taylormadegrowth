// App state.
//
// Reads: shipped vault.json (sealed) on first unlock, then the browser's own
// encrypted copy in localStorage on every launch after that. Every edit you
// make lands in localStorage immediately; the shipped vault is only the
// starting point, so nothing you type here is ever pushed to the repo unless
// you deliberately export and re-seal it.

import { open, seal } from './vault.js';

const LS_KEY = 'tfm.vault.v1';
const LS_META = 'tfm.meta.v1';

let state = null;
let passphrase = null;
const subs = new Set();

export const get = () => state;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => fn(state));

async function persist() {
  if (!state || !passphrase) return;
  state.updated = new Date().toISOString().slice(0, 10);
  const envelope = await seal(state, passphrase);
  localStorage.setItem(LS_KEY, JSON.stringify(envelope));
  localStorage.setItem(LS_META, JSON.stringify({ savedAt: Date.now() }));
}

// Mutate through here so persistence and re-render can never be forgotten.
export async function commit(fn) {
  fn(state);
  await persist();
  emit();
}

export async function unlock(pass) {
  const local = localStorage.getItem(LS_KEY);
  const envelope = local
    ? JSON.parse(local)
    : await fetch('./vault.json', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`vault.json ${r.status}`);
        return r.json();
      });

  state = await open(envelope, pass);
  passphrase = pass;

  // First unlock on this device: take a local copy so later launches never
  // depend on the shipped file, and edits have somewhere to live.
  if (!local) await persist();

  migrate();
  emit();
  return state;
}

export function lock() {
  state = null;
  passphrase = null;
  emit();
}

export const isLocalCopy = () => !!localStorage.getItem(LS_KEY);

export function savedAt() {
  try { return JSON.parse(localStorage.getItem(LS_META) || '{}').savedAt || null; }
  catch { return null; }
}

// Fill in anything a hand-edited or older seed might be missing, so page code
// can assume the shape it needs.
function migrate() {
  state.log ??= [];
  state.goals ??= [];
  state.pipeline ??= [];
  state.debts ??= [];
  state.settings ??= {};
  state.settings.extraToDebt ??= 0;
  state.settings.strategy ??= 'avalanche';
  state.settings.emergencyFundTarget ??= 2000;
  state.settings.emergencyFundSaved ??= 0;
  for (const g of state.goals) g.saved ??= 0;
  for (const d of state.debts) { d.balance ??= 0; d.apr ??= 0; d.minimum ??= 0; }
}

// ---- Export / import -------------------------------------------------------

export async function exportSealed() {
  const envelope = await seal(state, passphrase);
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
}

export function exportPlain() {
  return new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
}

export async function changePassphrase(next) {
  if (!next || next.length < 12) throw new Error('Use at least 12 characters.');
  passphrase = next;
  await persist();
}

export function resetToShipped() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(LS_META);
}

export const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
