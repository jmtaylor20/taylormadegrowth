// Client Margin — the calculation service. All the margin math lives here, not
// in the UI, so it can be reused and reasoned about on its own. The page module
// (margin.js) only renders what these functions return.
//
// Cost model: the allocation pool is the app's recurring monthly costs (the
// "Recurring expenses" subscriptions, stored in the `recurring_expenses`
// setting). Each cost item carries:
//   amount           the price for one billing period
//   billing_period   'monthly' | 'annual'   (annual is divided to a monthly figure)
//   allocation_type  'shared'  | 'client'    (shared funds overhead; client hits one client)
//   client_id        the client a 'client' item belongs to
import { Clients, getSetting } from './db.js';
import { MIN_MARGIN_DEFAULT } from './config.js';

const n = (x) => Number(x || 0);

// An annual cost is divided to a monthly figure so every cost compares per month.
export function normalizeMonthly(amount, billingPeriod) {
  return billingPeriod === 'annual' ? n(amount) / 12 : n(amount);
}

// Normalize a stored cost item into the shape the math expects, defaulting the
// legacy {name, amount} items (no allocation data) to shared / monthly.
export function normalizeCostItem(it) {
  return {
    name: it.name || '',
    amount: n(it.amount),
    billing_period: it.billing_period === 'annual' ? 'annual' : 'monthly',
    allocation_type: it.allocation_type === 'client' ? 'client' : 'shared',
    client_id: it.client_id || null,
  };
}

// The core calculation. Pure: give it clients, cost items, and the minimum
// acceptable margin, and it returns per-client rows plus overall totals.
//
//   Shared monthly cost      = sum of shared cost items, normalized to monthly
//   Allocated shared / client = shared monthly cost / count of active|dormant clients
//   Client total cost        = allocated shared + that client's direct (client) costs
//   Client margin            = monthly_rate - client total cost
//   Break-even rate          = client total cost (the rate needed to break even)
export function computeMargins({ clients = [], costItems = [], minMargin = MIN_MARGIN_DEFAULT } = {}) {
  const items = costItems.map(normalizeCostItem);
  const monthly = (it) => normalizeMonthly(it.amount, it.billing_period);

  // Only active and dormant clients share the overhead pool; inactive are out.
  const billable = clients.filter((c) => c.status === 'active' || c.status === 'dormant');

  const sharedItems = items.filter((it) => it.allocation_type !== 'client');
  const sharedMonthly = sharedItems.reduce((s, it) => s + monthly(it), 0);
  const activeCount = billable.length;
  const allocatedShared = activeCount ? sharedMonthly / activeCount : 0;

  // Direct (client-specific) costs, summed per client.
  const directItems = items.filter((it) => it.allocation_type === 'client' && it.client_id);
  const directByClient = {};
  directItems.forEach((it) => { directByClient[it.client_id] = (directByClient[it.client_id] || 0) + monthly(it); });

  const rows = billable.map((c) => {
    const rate = n(c.mrr);
    const direct = directByClient[c.id] || 0;
    const totalCost = allocatedShared + direct;
    const marginDollars = rate - totalCost;
    const marginPct = rate > 0 ? (marginDollars / rate) * 100 : null;
    return {
      client: c, rate, allocatedShared, direct, totalCost, marginDollars, marginPct,
      breakEven: totalCost,                         // rate this client must charge to break even
      directItems: directItems.filter((it) => it.client_id === c.id),
      negative: marginDollars < 0,                  // losing money
      below: marginDollars < minMargin,             // under the minimum acceptable margin
    };
  }).sort((a, b) => a.marginDollars - b.marginDollars); // worst margins first

  const revenue = rows.reduce((s, r) => s + r.rate, 0);
  const cost = rows.reduce((s, r) => s + r.totalCost, 0);
  const margin = revenue - cost;

  return {
    rows, sharedItems, sharedMonthly, allocatedShared, activeCount, minMargin,
    // breakEvenRate: the minimum a client with no direct costs must pay just to
    // cover their share of overhead.
    totals: { revenue, cost, margin, breakEvenRate: allocatedShared },
  };
}

// Gather the page's inputs from the data layer: real clients (stage = client),
// the recurring cost items, and the configurable minimum margin.
export async function loadMarginInputs() {
  const [clients, recur, cfg] = await Promise.all([
    Clients.list({ order: { col: 'business_name', asc: true } }),
    getSetting('recurring_expenses', { items: [] }),
    getSetting('client_margin', { min_margin: MIN_MARGIN_DEFAULT }),
  ]);
  return {
    clients: clients.filter((c) => c.stage === 'client'),
    costItems: Array.isArray(recur.items) ? recur.items : [],
    minMargin: n(cfg.min_margin) || MIN_MARGIN_DEFAULT,
  };
}
