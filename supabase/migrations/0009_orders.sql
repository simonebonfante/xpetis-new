-- XPETIS · 0009 · Ordini post-call (su misura e All Inclusive)

create sequence orders_ref_seq;

create table orders (
  id           uuid primary key default gen_random_uuid(),
  -- Riferimento leggibile, per parlarne su WhatsApp senza leggere un UUID.
  human_ref    text not null unique
                 default 'XP-' || lpad(nextval('orders_ref_seq')::text, 5, '0'),
  traveler_id  uuid not null references travelers(id) on delete restrict,
  td_id        uuid not null references travel_designers(id) on delete restrict,
  service_type service_type not null
    check (service_type in ('custom_itinerary', 'all_inclusive')),
  status       order_status not null default 'requested',

  -- La call da cui nasce l'ordine: è lei che porta il credito consulenza.
  source_booking_id uuid references bookings(id) on delete set null,
  agency_id         uuid references agencies(id) on delete restrict,

  -- Il credito non scade mai e si applica una volta sola: se dalla stessa call
  -- nascono due ordini, va sul primo (vincolo più sotto).
  consultation_credit_cents integer not null default 0
    check (consultation_credit_cents >= 0),

  proposal_description  text,
  proposal_price_cents  integer check (proposal_price_cents is null or proposal_price_cents >= 0),
  delivery_days         smallint check (delivery_days is null or delivery_days > 0),
  proposal_sent_at      timestamptz,
  agency_confirmed_at   timestamptz,
  agency_rejection_note text,

  -- All Inclusive: acconto 30% calcolato dal sistema, saldo = residuo.
  total_price_cents integer check (total_price_cents is null or total_price_cents >= 0),
  deposit_cents     integer check (deposit_cents is null or deposit_cents >= 0),
  balance_cents     integer check (balance_cents is null or balance_cents >= 0),
  balance_due_at    timestamptz,   -- tempi dettati dall'agenzia, inseriti dal team

  departure_date date,   -- obbligatoria per l'All Inclusive, facoltativa su misura
  return_date    date,
  constraint orders_trip_dates check (return_date is null or departure_date is null
                                      or return_date >= departure_date),

  delivered_at         timestamptz,
  revision_requested_at timestamptz,
  revision_note        text,
  revision_deadline_at timestamptz,   -- consegna + 5 giorni
  revision_delivered_at timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  dispute_note         text,

  -- Tracce dei passaggi manuali del team, per sapere cosa manca a colpo d'occhio.
  whatsapp_group_commercial_at timestamptz,
  whatsapp_group_technical_at  timestamptz,

  last_actor actor_kind not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_status_idx on orders (status);
create index orders_td_idx on orders (td_id);
create index orders_traveler_idx on orders (traveler_id);
create index orders_agency_idx on orders (agency_id);
create index orders_revision_deadline_idx on orders (revision_deadline_at)
  where status = 'delivered';
create index orders_departure_idx on orders (departure_date)
  where departure_date is not null;

-- Il credito consulenza va su un solo ordine per call.
create unique index orders_one_credit_per_booking
  on orders (source_booking_id)
  where consultation_credit_cents > 0 and source_booking_id is not null;

create trigger orders_touch before update on orders
  for each row execute function set_updated_at();

-- I file dell'ordine: proposta All Inclusive, itinerario, revisione, documento
-- finale. Su Supabase Storage, bucket privato.
create table order_files (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  kind         order_file_kind not null,
  storage_path text not null,
  filename     text not null,
  size_bytes   bigint,
  mime_type    text,
  uploaded_by  actor_kind not null default 'td',
  created_at   timestamptz not null default now()
);
create index order_files_order_idx on order_files (order_id, kind);

create table order_status_history (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  actor       actor_kind not null default 'system',
  note        text,
  created_at  timestamptz not null default now()
);
create index order_status_history_order_idx on order_status_history (order_id, created_at);

-- La macchina a stati vive nel database, non nei workflow n8n: un workflow
-- sbagliato viene fermato qui invece di produrre un ordine incoerente.
create table order_status_transitions (
  service_type service_type not null,
  from_status  order_status not null,
  to_status    order_status not null,
  primary key (service_type, from_status, to_status)
);

create or replace function enforce_order_transition()
returns trigger language plpgsql as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not exists (
    select 1 from order_status_transitions t
     where t.service_type = new.service_type
       and t.from_status = old.status
       and t.to_status = new.status
  ) then
    raise exception 'Transizione non ammessa per %: % -> %',
      new.service_type, old.status, new.status;
  end if;

  -- Nessuna proposta All Inclusive può partire verso l'agenzia senza documento,
  -- prezzo e agenzia assegnata (vincolo richiesto dalla sez. 8).
  if new.service_type = 'all_inclusive' and new.status = 'proposal_pending_agency' then
    if new.agency_id is null then
      raise exception 'Ordine % senza agenzia assegnata', new.human_ref;
    end if;
    if new.proposal_price_cents is null then
      raise exception 'Proposta All Inclusive % senza prezzo', new.human_ref;
    end if;
    if not exists (
      select 1 from order_files f
       where f.order_id = new.id and f.kind = 'proposal_document'
    ) then
      raise exception 'Proposta All Inclusive % senza documento allegato', new.human_ref;
    end if;
  end if;

  if new.service_type = 'custom_itinerary' and new.status = 'proposal_sent'
     and (new.proposal_price_cents is null or new.delivery_days is null) then
    raise exception 'Proposta su misura % senza prezzo o giorni di consegna', new.human_ref;
  end if;

  if new.status = 'delivered' and not exists (
    select 1 from order_files f
     where f.order_id = new.id
       and f.kind in ('itinerary', 'revision', 'final_document')
  ) then
    raise exception 'Ordine % marcato consegnato senza nessun file', new.human_ref;
  end if;

  return new;
end $$;

create trigger orders_enforce_transition before update of status on orders
  for each row execute function enforce_order_transition();

create or replace function log_order_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into order_status_history (order_id, from_status, to_status, actor)
    values (new.id, null, new.status, new.last_actor);
  elsif new.status is distinct from old.status then
    insert into order_status_history (order_id, from_status, to_status, actor)
    values (new.id, old.status, new.status, new.last_actor);
  end if;
  return null;
end $$;

create trigger orders_log_status after insert or update on orders
  for each row execute function log_order_status();
