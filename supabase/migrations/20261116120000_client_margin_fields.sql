-- Client Margin: per-client profitability after a share of overhead.
--
-- Adds the columns the Client Margin page (assets/js/margin.js) and its
-- calculation service (assets/js/margin-calc.js) need. Idempotent and additive;
-- safe to re-run. Existing rows take the column defaults.
--
--   clients.status      billing status: active | dormant | inactive. Active and
--                       dormant clients share the overhead pool; inactive are
--                       excluded from the split.
--   clients.end_date    when an engagement ended (optional).
--   expenses.allocation_type   shared | client. Shared costs fund overhead;
--                       client costs are billed to the expense's client_id.
--   expenses.billing_period    monthly | annual. Annual amounts are normalized
--                       to a monthly figure in the margin math.

alter table public.clients  add column if not exists status text not null default 'active';
alter table public.clients  add column if not exists end_date date;
alter table public.expenses add column if not exists allocation_type text not null default 'shared';
alter table public.expenses add column if not exists billing_period text not null default 'monthly';

-- Former clients should not dilute the shared-overhead split. Current clients
-- stay active. Only touch rows still at the default so this stays idempotent.
update public.clients set status = 'inactive'
where stage in ('past_client', 'lost') and status = 'active';
