# Taylor Family Money

A private household finance app — personal accounts only, separate from
anything TaylorMade Brands. Plain HTML/CSS/JS, no build step, served by the
main site at **taylormadegrowth.com/family**.

## Open it

- URL: `https://taylormadegrowth.com/family`
- Unlock with the passphrase (shared separately — it is not in this repo).
- On your phone: open the URL → Share → **Add to Home Screen**. It installs
  like a native app and works offline.

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
writes its own encrypted copy to `localStorage`. From then on that local copy
is the source of truth — **edits you make in the app stay on your device and
are never pushed back to the repo.** Nothing is sent to a server; there is no
backend.

### Re-sealing after edits

If you want the shipped vault to match what's in the app (for a new phone, say):

1. App → `⋯` → **Plain JSON** to download the current data.
2. Save it over `private/family-seed.json`.
3. `FAMILY_PASSPHRASE='…' npm run family:seal`
4. Commit `public/family/vault.json`.

Or skip all that and use `⋯` → **Sealed backup**, which produces a file that is
safe to email or drop in Drive.

### Changing the passphrase

`⋯` → **Passphrase** re-encrypts the local copy immediately. That only affects
this device — to change the shipped vault too, re-seal it with the new
passphrase using the steps above.

## Tabs

| Tab | What it answers |
| --- | --- |
| **Home** | Are we okay this month? Household totals, what is committed before the next paycheck, and idle cash that could be swept. |
| **Josh** | Regions account: dashboard, recurring bills by date or category, bill calendar, and what is due before the next paycheck. |
| **Laci** | Same for the Wells Fargo account. |
| **Paydays** | The timing problem. Splits the month into pay periods, shows which stretch is carrying more than its paycheck, and names the specific due dates to move. |
| **Debt** | Allocate money you have on hand, then attack order, avalanche vs. snowball, and a payoff projection. |
| **Goals** | Trips, funding pace, and what they cost in months if taken one at a time. |

## Keeping it current

There is no bank connection, and there does not need to be one. Balances drift;
the recurring list barely moves. So the app stays true on about seven numbers
typed **once a month** — two checking balances and the debt balances — through
the **Monthly check-in** on the Home tab.

The card tracks how long it has been and starts nagging at 28 days, which is
roughly when statements land. Each check-in is saved, and once there are two of
them the Debt tab grows a **measured** progress line: not a projection, but what
the balances actually did. That line is the only one that settles whether the
plan is working.

## Allocating money

Everyday spending runs off the business, not the bank accounts, against a flat
monthly budget. When money is available, type the amount on the Debt tab: the
month's spending budget tops up first, then everything left goes at the highest
rate. Filling spending first is deliberate — the alternative is covering
groceries later in the month on a card at 25%.

Allocations are recorded, so a second payment the same month only tops up the
remainder rather than starting the budget over.

## Reading the flags

| Flag | Meaning |
| --- | --- |
| `ASK` | I couldn't tell what this is or whether it recurs. There's a question attached — tap the row to answer it, and the flag clears. |
| `GUESS` | Inferred from one or two sightings rather than a clear pattern. |
| `VARIES` | Genuinely recurring, but the amount moves. The figure shown is an average of what was observed. |
| `BIZ` | Business spend running through a personal account. Counted separately so household totals stay honest. |

## Files

| Area | File |
| --- | --- |
| Unlock, tab bar, router, settings | `assets/js/app.js` |
| Encrypt / decrypt | `assets/js/vault.js` |
| State, persistence, export | `assets/js/store.js` |
| All the money math | `assets/js/calc.js` |
| DOM helpers, formatters, sheets | `assets/js/ui.js` |
| Screens | `assets/js/pages/{home,account,paydays,debt,goals}.js` |
| Check-in flow, spending budget, trend chart | `assets/js/pages/checkin.js` |
| Seal script | `../../scripts/seal-vault.mjs` |

The math lives in one file on purpose: change how something is counted in
`calc.js` and every screen follows.

## Notes on the numbers

- Recurring amounts came from bank statements, but nothing else does. Spending
  habits changed after those statements, so no behaviour is inferred from them —
  the recurring list is the only thing they were used for.
- Debt payoff is simulated month by month: interest accrues on the running
  balance, everyone gets their minimum, the target gets the rest, and a cleared
  debt's payment rolls forward into the next one.
- Mortgages are excluded from the attack plan — extra dollars belong on
  high-rate revolving debt first.
- Irregular income (business draws, reimbursements) is deliberately left out of
  the baseline so the plan holds on payroll alone.
- Pay periods run payday-to-payday and wrap the month end, because a month-end
  paycheck is what funds the following 1st. The cushion figure walks a full
  cycle from the last payday, not from the 1st — starting at the calendar
  boundary would count the front-of-month bills with no paycheck behind them.

## Publishing an updated analysis

Re-seal with a bumped `seedVersion` and the app offers the update on next
unlock instead of overwriting anything. Taking it refreshes accounts, income,
recurring and debts while keeping goals, allocations, spend log, settings, any
balance you filled in, and any question you already answered — including a
bill you renamed while answering it.
