-- XPETIS · 0008 · Prenotazioni consulenza
-- La riga nasce dal webhook BOOKING_CREATED di Cal.com in stato
-- pending_payment e vive 30 minuti; il webhook Stripe la conferma.

create table bookings (
  id           uuid primary key default gen_random_uuid(),
  traveler_id  uuid not null references travelers(id) on delete restrict,
  td_id        uuid not null references travel_designers(id) on delete restrict,
  service_type service_type not null
    check (service_type in ('consultation', 'consultation_deep')),
  status       booking_status not null default 'pending_payment',

  -- Il filo con Cal.com. L'UID è la chiave di riconciliazione dei webhook.
  cal_booking_uid     text not null unique,
  cal_event_type_slug text,
  video_url           text,

  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- La data della prima prenotazione: è da qui che si contano i 20 giorni
  -- massimi entro cui una riprogrammazione può spostare la call.
  original_starts_at timestamptz not null,
  constraint bookings_time_order check (ends_at > starts_at),

  price_cents        integer not null check (price_cents >= 0),
  payment_deadline_at timestamptz,   -- creazione + 30 minuti

  -- Dati raccolti nel form XPETIS dopo la scelta dello slot.
  traveler_phone      text,
  context_note        text,
  interested_services service_type[] not null default '{}',
  quiz_snapshot       jsonb,          -- il profilo che il TD riceve via mail
  destination_hint    text,

  -- Contatori dei limiti. Cal.com non li impone: è n8n a fare il controllore.
  reschedule_count_traveler smallint not null default 0,
  reschedule_count_td       smallint not null default 0,

  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        actor_kind,
  cancel_reason       text,
  autoclose_at        timestamptz,   -- fine call + 48h (silenzio-conferma)
  completed_at        timestamptz,
  refunded_at         timestamptz,
  refund_amount_cents integer check (refund_amount_cents is null or refund_amount_cents >= 0),
  dispute_note        text,

  last_actor actor_kind not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indice del workflow insoluti (gira ogni 5 minuti).
create index bookings_pending_payment_idx on bookings (payment_deadline_at)
  where status = 'pending_payment';
-- Indice del timer reminder e della chiusura a 48 ore.
create index bookings_autoclose_idx on bookings (autoclose_at) where status = 'confirmed';
create index bookings_td_starts_idx on bookings (td_id, starts_at);
create index bookings_traveler_idx on bookings (traveler_id);
create index bookings_starts_idx on bookings (starts_at);

create trigger bookings_touch before update on bookings
  for each row execute function set_updated_at();

create table booking_status_history (
  id          bigint generated always as identity primary key,
  booking_id  uuid not null references bookings(id) on delete cascade,
  from_status booking_status,
  to_status   booking_status not null,
  actor       actor_kind not null default 'system',
  note        text,
  created_at  timestamptz not null default now()
);
create index booking_status_history_booking_idx on booking_status_history (booking_id, created_at);

create or replace function log_booking_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into booking_status_history (booking_id, from_status, to_status, actor)
    values (new.id, null, new.status, new.last_actor);
  elsif new.status is distinct from old.status then
    insert into booking_status_history (booking_id, from_status, to_status, actor)
    values (new.id, old.status, new.status, new.last_actor);
  end if;
  return null;
end $$;

create trigger bookings_log_status after insert or update on bookings
  for each row execute function log_booking_status();
