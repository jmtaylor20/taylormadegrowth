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
| **Debt** | Allocate money you have on hand, record a payment against any account, and read the five-year path: which debt the money points at, for how long, and what falls when. |
| **Goals** | Trips, the monthly rate you set toward them, and which dates that rate will not reach. A goal can be open-ended instead of dated. |
| **What if** | The business draw as the one variable: split it between everyday spending and debt and watch the payoff date move, with or without the mortgage. |

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

## The five-year path

"Put it on the Chase card" is obvious and not worth a screen. What changes a
plan is what happens *after* that card dies, so the Debt tab walks the
simulation and cuts it into phases: contiguous stretches where the money is
pointed at one account. Each phase names the debt, the rate, the balance when
you arrive at it, what goes in each month, and the month it clears.

Everything below the extra-payment dial redraws as the dial moves, so "what if I
found another two hundred a month" is answered without leaving the page.

The curve underneath is the total balance across the whole window, with a marker
on every month an account dies. The steepening is the point: each cleared debt
frees its minimum into the next target, which is why the last debts fall so much
faster than the first.

## Recording a payment

Every debt row carries a **Pay** button. One number typed there drops that
balance, and because every projection, ordering and total in the app is derived
from the balances, a $2,000 payment reshapes the whole plan the moment it is
saved. Payments are kept, and stamp the date the balance was last known — which
is also what stops a published update from quietly reinstating a staler figure.

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
| Screens | `assets/js/pages/{home,account,paydays,debt,goals,scenarios}.js` |
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
  high-rate revolving debt first — but can be switched on in Scenarios.
- A mortgage payment carries escrow for taxes and insurance, which never
  amortizes and does not stop when the loan clears. Only the rest of the payment
  pays the house down, so "paid off" is not the same as "no housing payment".
- Irregular income (business draws, reimbursements) is deliberately left out of
  the baseline so the plan holds on payroll alone.
- Everyday spending and trip funding are both rates you set, not figures derived
  from slack left after bills. Money left over does not reach a trip fund on its
  own, and a plan that assumes it does describes a life nobody is living.
- A goal can be open-ended. Money owed to a family member at no interest and no
  deadline is real, but it sets no monthly pace, so it is not counted toward the
  rate the dated trips need and it queues behind them — and behind every card.
- Pay periods run payday-to-payday and wrap the month end, because a month-end
  paycheck is what funds the following 1st. The cushion figure walks a full
  cycle from the last payday, not from the 1st — starting at the calendar
  boundary would count the front-of-month bills with no paycheck behind them.

## Publishing an updated analysis

Re-seal with a bumped `seedVersion` and the app offers the update on next
unlock instead of overwriting anything. Taking it refreshes accounts, income,
recurring and debts while keeping allocations, payments, spend log, settings,
any question you already answered — including a bill you renamed while answering
it — and every goal you have opened and saved.

Two rules decide the rest. A balance is kept from whichever side looked at it
most recently, so a payment you recorded is never undone by an update carrying
an older figure. And a goal you have never edited can still be reshaped by an
update, which is the only way a change you asked for reaches a phone that
already holds its own copy; the amount you have put in is preserved either
way.
