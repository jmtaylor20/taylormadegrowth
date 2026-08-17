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

const fetchShipped = () => fetch('./vault.json', { cache: 'no-store' }).then((r) => {
  if (!r.ok) throw new Error(`vault.json ${r.status}`);
  return r.json();
});

export async function unlock(pass) {
  const local = localStorage.getItem(LS_KEY);
  const envelope = local ? JSON.parse(local) : await fetchShipped();

  state = await open(envelope, pass);
  passphrase = pass;

  // First unlock on this device: take a local copy so later launches never
  // depend on the shipped file, and edits have somewhere to live.
  if (!local) await persist();

  migrate();
  emit();
  return state;
}

// A newer analysis has been pushed. Offer it rather than silently overwriting —
// and when taken, keep everything the user owns (goals, pipeline, log, settings,
// and any question they have already answered).
export async function checkForUpdate() {
  if (!state || !passphrase) return null;
  let shipped;
  try { shipped = await open(await fetchShipped(), passphrase); }
  catch { return null; }
  if ((shipped.seedVersion ?? 1) <= (state.seedVersion ?? 1)) return null;
  return { version: shipped.seedVersion, apply: () => applyUpdate(shipped) };
}

async function applyUpdate(shipped) {
  const answered = new Set(state.recurring.filter((r) => r.answered).map((r) => r.id));
  const edited = new Map(state.recurring.map((r) => [r.id, r]));

  const merged = {
    ...shipped,
    // Statement-derived facts come from the update; anything the user owns stays.
    goals: shipped.goals.map((g) => {
      const mine = state.goals.find((x) => x.id === g.id);
      if (!mine) return g;
      // A goal you have opened and saved is yours from then on. Until you do,
      // the update can still reshape it — which is the only way a change you
      // asked for reaches a phone that already holds its own copy. Either way
      // the money you have put in is never touched by an update.
      return mine.edited ? mine : { ...g, saved: mine.saved };
    }),
    log: state.log,
    checkIns: state.checkIns,
    allocations: state.allocations,
    payments: state.payments,
    windfalls: state.windfalls,
    settings: { ...shipped.settings, ...state.settings },
    recurring: shipped.recurring.map((r) => {
      const mine = edited.get(r.id);
      if (!mine) return r;
      // A question you already answered stays answered, with your numbers —
      // including a rename, which is usually the whole point of answering
      // "what even is this charge?".
      if (answered.has(r.id)) {
        return {
          ...r,
          name: mine.name, amount: mine.amount, day: mine.day,
          category: mine.category, note: mine.note,
          answered: true, confidence: 'confirmed', question: undefined,
        };
      }
      return { ...r, paused: mine.paused };
    }),
    debts: shipped.debts.map((d) => {
      const mine = state.debts.find((x) => x.id === d.id);
      if (!mine || !(mine.balance > 0)) return d;
      // Keep whichever figure was looked at most recently. Recording a payment
      // stamps asOf, so an update carrying a staler balance can't quietly undo
      // one — and a placeholder shipped with no balance always loses to a real
      // number. Only the figures cross over: spreading the whole stale record
      // would drag back an old name, type or answered question with them.
      const minesNewer = !(d.balance > 0) || (mine.asOf && (!d.asOf || mine.asOf > d.asOf));
      if (!minesNewer) return d;
      return {
        ...d,
        balance: mine.balance,
        apr: mine.apr || d.apr,
        limit: mine.limit || d.limit,
        asOf: mine.asOf || d.asOf,
        confidence: 'confirmed',
        question: undefined,
      };
    }),
  };

  // Anything the user added themselves has no counterpart in the update.
  for (const key of ['recurring', 'debts', 'goals']) {
    const ids = new Set(shipped[key].map((x) => x.id));
    merged[key].push(...state[key].filter((x) => !ids.has(x.id)));
  }

  state = merged;
  migrate();
  await persist();
  emit();
}

// Restore from a sealed backup file. This is what makes a self-chosen
// passphrase actually portable: the vault shipped with the app is still sealed
// with whatever passphrase built it, so without this route a fresh device would
// always need the original one.
export async function unlockFromFile(file, pass) {
  let envelope;
  try { envelope = JSON.parse(await file.text()); }
  catch { throw new Error('That file is not a vault backup.'); }
  if (!envelope?.ct || !envelope?.kdf) throw new Error('That file is not a vault backup.');

  state = await open(envelope, pass);
  passphrase = pass;
  migrate();
  await persist();
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
  state.seedVersion ??= 1;
  state.log ??= [];
  state.goals ??= [];
  state.debts ??= [];
  state.checkIns ??= [];
  state.windfalls ??= [];
  state.allocations ??= [];
  state.payments ??= [];
  state.settings ??= {};
  state.settings.monthlySpending ??= 0;
  state.settings.monthlyToGoals ??= 0;
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
