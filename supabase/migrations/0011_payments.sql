-- XPETIS · 0011 · Pagamenti Stripe
-- Consulenze: Payment Link fissi, creati a mano dal pannello, conto XPETIS.
-- Su misura: Payment Link generato via API al volo (il prezzo non esiste prima
-- che il TD lo scriva), conto XPETIS.
-- All Inclusive: acconto e saldo generati via API sul conto dell'agenzia.

create table payments (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) on delete cascade,
  order_id   uuid references orders(id) on delete cascade,
  kind       payment_kind not null,
  status     payment_status not null default 'pending',

  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'EUR',

  stripe_account stripe_account_kind not null default 'xpetis',
  agency_id      uuid references agencies(id) on delete restrict,

  stripe_payment_link_id     text,
  stripe_payment_link_url    text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text,
  -- Il filo che permette a n8n di riconciliare pagamento e prenotazione:
  -- l'UID Cal.com per le consulenze, l'id ordine per i servizi post-call.
  client_reference_id        text,

  expires_at          timestamptz,
  paid_at             timestamptz,
  refunded_at         timestamptz,
  refund_amount_cents integer check (refund_amount_cents is null or refund_amount_cents >= 0),
  refund_note         text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_one_target
    check (num_nonnulls(booking_id, order_id) = 1),
  constraint payments_agency_required
    check (stripe_account <> 'agency' or agency_id is not null),
  constraint payments_kind_matches_target
    check ((kind = 'consultation') = (booking_id is not null))
);

create index payments_booking_idx on payments (booking_id);
create index payments_order_idx on payments (order_id);
create index payments_client_ref_idx on payments (client_reference_id);

-- Doppio incasso della stessa cosa: impossibile.
create unique index payments_one_paid_per_kind
  on payments (coalesce(booking_id, order_id), kind)
  where status in ('paid', 'refunded', 'partially_refunded');

create trigger payments_touch before update on payments
  for each row execute function set_updated_at();
