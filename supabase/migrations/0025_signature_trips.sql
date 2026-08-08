-- XPETIS · 0025 · I viaggi firma
--
-- Sezione della vetrina: i viaggi che il designer racconta come suoi, con foto.
-- Nel form sono tre righe più eventuali aggiunte; qui non mettiamo un tetto,
-- perché è una decisione di design e non di database.

create table td_signature_trips (
  id          uuid primary key default gen_random_uuid(),
  td_id       uuid not null references travel_designers(id) on delete cascade,
  position    smallint not null check (position > 0),
  title       text not null check (length(btrim(title)) > 0),
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (td_id, position)
);
create index td_signature_trips_td_idx on td_signature_trips (td_id, position);

create trigger td_signature_trips_touch before update on td_signature_trips
  for each row execute function set_updated_at();

comment on table td_signature_trips is
  'Campo viaggi[] del form. Il vincolo sul titolo non vuoto serve all''import: '
  'il form nasce con tre righe vuote precompilate, che non vanno caricate.';

create table td_signature_trip_images (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references td_signature_trips(id) on delete cascade,
  position     smallint not null check (position > 0),
  storage_path text not null,
  unique (trip_id, position)
);
create index td_signature_trip_images_trip_idx on td_signature_trip_images (trip_id, position);

comment on column td_signature_trip_images.storage_path is
  'Percorso nel bucket td-media. Nel JSON arriva come percorso relativo alla '
  'cartella del pacchetto (images/viaggio-1-foto-1.jpg): l''import carica il '
  'file e scrive qui il percorso vero.';

alter table td_signature_trips       enable row level security;
alter table td_signature_trip_images enable row level security;
revoke all on td_signature_trips, td_signature_trip_images from anon, authenticated;
