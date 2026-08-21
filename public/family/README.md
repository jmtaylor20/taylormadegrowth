# Taylor Family Money

A private household finance app — personal accounts only, separate from
anything TaylorMade Brands. Plain HTML/CSS/JS, no build step, served by the main
site at **taylormadegrowth.com/family**.

It is a quick-glance-and-update tool, not a study. Four tabs, and every screen
answers one question.

## Open it

- URL: `https://taylormadegrowth.com/family`
- Unlock with the passphrase (shared separately — it is not in this repo).
- On your phone: open the URL → Share → **Add to Home Screen**. It installs like
  a native app and works offline.

## Why it's encrypted

This repository is **public**. So the app ships no readable financial data:
`vault.json` is AES-256-GCM ciphertext under a PBKDF2-SHA256 key (600,000
iterations) derived from the passphrase. Anyone who clones the repo or fetches
the file sees random bytes.

The plaintext seed lives in `private/family-seed.json`, which is gitignored and
never leaves the machine that built it.

```
private/family-seed.json   →  npm run family:seal  →  public/family/vault.json
        (gitignored)                                       (committed, encrypted)
```

On first unlock the app fetches `vault.json`, decrypts it in the browser, and
writes its own encrypted copy to `localStorage`. From then on that local copy is
the source of truth — **edits you make in the app stay on your device and are
never pushed back to the repo.** Nothing is sent to a server; there is no
backend.

## Tabs

| Tab | What it answers |
| --- | --- |
| **Josh** | Regions: what comes in, what goes out, what's left. Balance, and the two buttons that move it. |
| **Laci** | Same for Wells Fargo. |
| **Debt** | What you owe, the order to pay it in, and a Pay button on every one. |
| **Trips** | What you've put aside for each trip. Tap one to add to it. |

### The account pages

Three numbers at the top — in, out, left — and underneath them the lists those
numbers are made of. Every row is tappable.

- **Money in** is take-home per payday. Tap a row to change it, which is where
  a withholdings change goes. The monthly figure is the amount times the number
  of paydays.
- **Bills out** is the recurring list. Tap to fix an amount or a date, stop one,
  or delete it.
- **Expense** and **Deposit** both move the balance and land in *Recent*. The
  only difference is the direction.
- **Update** sets the balance to whatever the banking app says, when it has
  drifted for reasons not worth logging.

### Debt

The order is the durable part: highest rate first, work down. There is no
extra-payment dial and no payoff projection — what can go toward this varies
month to month, and a trajectory built on a number nobody has committed to is a
guess dressed as a plan.

Tap **Pay** on any debt to record a payment. The balance drops, and every total
and the ordering follow from the balances, so the page reshapes itself.

### Trips

A list and a running total. Tap a trip, type what you are putting toward it, and
it adds to the total and keeps the date. No monthly rate, no pace, no ranking —
money goes toward these when it goes toward them.

## Keeping it current

There is no bank connection, and there does not need to be one. Two habits keep
it true:

- Log an expense or deposit when it is worth remembering, or hit **Update** with
  the real balance when it is not.
- Hit **Pay** when you pay a debt.

Nothing nags you and nothing breaks if you skip a week.

## Files

| Area | File |
| --- | --- |
| Unlock, tab bar, router, settings | `assets/js/app.js` |
| Encrypt / decrypt | `assets/js/vault.js` |
| State, persistence, export | `assets/js/store.js` |
| The money math | `assets/js/calc.js` |
| DOM helpers, formatters, sheets | `assets/js/ui.js` |
| Screens | `assets/js/pages/{account,debt,goals}.js` |
| Seal script | `../../scripts/seal-vault.mjs` |
| App icon | `../../scripts/family-icon.mjs` |

`calc.js` still carries more than these three screens use — pay-period timing,
payoff simulation, reconciliation, windfall allocation. It is left in place
because it is tested and costs nothing dormant, and because the screens that
used it may come back.

## Publishing an updated analysis

Re-seal with a bumped `seedVersion` and the app offers the update on next unlock
instead of overwriting anything. Taking it refreshes accounts, income, recurring
and debts while keeping payments, trip contributions, the log, settings, and any
question you already answered — including a bill you renamed while answering it.

Two rules decide the rest. A balance is kept from whichever side looked at it
most recently, so a payment you recorded is never undone by an update carrying
an older figure. And a trip you have opened and saved is yours from then on;
until then an update can still reshape it, which is the only way a change you
asked for reaches a phone that already holds its own copy.

## Backups

`⋯` → **Sealed backup** produces a file that is safe to email or drop in Drive —
unreadable without the passphrase. **Plain JSON** is not: that one is for your
eyes only. A new phone can be set up from a sealed backup using **Set up from a
backup file** on the unlock screen, which is what makes a self-chosen passphrase
portable.
