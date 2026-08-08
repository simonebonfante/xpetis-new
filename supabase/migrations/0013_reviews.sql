-- XPETIS · 0013 · Recensioni
-- Due momenti perché misurano cose diverse: la call (dopo la chiusura a 48h) e
-- il viaggio (dopo il rientro). Solo chi ha comprato può recensire: il
-- problema delle recensioni finte non esiste per costruzione.

create table reviews (
  id         uuid primary key default gen_random_uuid(),
  kind       review_kind not null,
  traveler_id uuid not null references travelers(id) on delete restrict,
  td_id      uuid not null references travel_designers(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  order_id   uuid references orders(id) on delete set null,

  rating_overall smallint not null check (rating_overall between 1 and 5),
  -- Consulenza: "quanto ti sei sentito capito?" / "quanto sono stati utili i consigli?"
  -- Viaggio:    "quanto rispecchiava quello che avevi chiesto?" / "organizzazione pratica?"
  rating_a smallint check (rating_a between 1 and 5),
  rating_b smallint check (rating_b between 1 and 5),

  body            text,
  would_recommend boolean,
  display_name    text,   -- nome puntato, calcolato all'inserimento

  is_published    boolean not null default true,
  moderation_note text,
  created_at      timestamptz not null default now(),

  constraint reviews_one_source check (num_nonnulls(booking_id, order_id) = 1),
  constraint reviews_kind_matches_source
    check ((kind = 'consultation') = (booking_id is not null))
);

create unique index reviews_one_per_booking on reviews (booking_id) where booking_id is not null;
create unique index reviews_one_per_order   on reviews (order_id)   where order_id   is not null;
create index reviews_td_idx on reviews (td_id, created_at desc) where is_published;
