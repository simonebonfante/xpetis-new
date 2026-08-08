-- XPETIS · 0014 · Operatività: idempotenza, alert, log

-- Ogni webhook ricevuto, salvato prima di essere lavorato. Il vincolo di
-- unicità è la difesa contro il doppio scatto: Cal.com e Stripe ritentano, e
-- un workflow n8n rilanciato a mano non deve mandare due mail o creare due
-- ordini.
create table webhook_events (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null check (provider in ('cal', 'stripe')),
  external_id text not null,
  event_type  text,
  payload     jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error       text,
  unique (provider, external_id)
);
create index webhook_events_unprocessed_idx on webhook_events (received_at)
  where processed_at is null;

-- Ogni messaggio in uscita, registrato una volta sola per coppia
-- (tipo, entità, destinatario): è così che un timer che rigira non manda due
-- volte il "buon viaggio".
create table outbound_messages (
  id           uuid primary key default gen_random_uuid(),
  message_kind text not null,
  channel      text not null default 'email',
  entity_type  text not null,
  entity_id    uuid not null,
  recipient    text not null,
  subject      text,
  sent_at      timestamptz not null default now(),
  unique (message_kind, entity_type, entity_id, recipient)
);
create index outbound_messages_entity_idx on outbound_messages (entity_type, entity_id);

-- La coda delle eccezioni per il team: limiti superati, dispute, no-show da
-- verificare, recensioni sotto le 3 stelle, richieste nuove.
create table team_alerts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  severity    alert_severity not null default 'warning',
  entity_type text,
  entity_id   uuid,
  message     text not null,
  resolved_at timestamptz,
  resolved_by text,
  created_at  timestamptz not null default now()
);
create index team_alerts_open_idx on team_alerts (created_at desc) where resolved_at is null;

-- Diario generico. Serve quando bisogna ricostruire cosa è successo su un
-- ordine e la storia degli stati non basta.
create table event_log (
  id          bigint generated always as identity primary key,
  entity_type text not null,
  entity_id   uuid,
  event       text not null,
  actor       actor_kind not null default 'system',
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index event_log_entity_idx on event_log (entity_type, entity_id, created_at desc);
