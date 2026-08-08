-- XPETIS · 0007 · Travel Designer
-- Il TD non ha login: il suo profilo lo carica il team in onboarding e lo
-- modifica su richiesta WhatsApp. Le sue azioni di flusso passano dai token.

create table travel_designers (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  status               td_status not null default 'draft',
  display_name         text not null,
  headline             text,
  bio                  text,                       -- bio narrativa della vetrina
  photo_url            text,
  background_photo_url text,                       -- DECISIONE APERTA con Chiara
  email                text not null,              -- dove arrivano i link token
  phone                text,
  languages            text[] not null default '{}',

  cal_username         text unique,                -- cal.com/<username>
  cal_webhook_ok_at    timestamptz,                -- checklist di onboarding

  agency_id            uuid references agencies(id) on delete set null,

  joined_at            date not null default current_date,  -- spareggio di oggi
  tiebreak_score       numeric,                              -- spareggio di domani

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index travel_designers_status_idx on travel_designers (status);

create trigger travel_designers_touch before update on travel_designers
  for each row execute function set_updated_at();

-- I paesi coperti, con il livello. Il livello vive solo qui come chiave di
-- ordinamento: il viaggiatore non lo vede mai.
create table td_countries (
  td_id        uuid not null references travel_designers(id) on delete cascade,
  country_code text not null references geo_countries(code) on update cascade,
  level        smallint not null check (level in (1, 2)),
  primary key (td_id, country_code)
);
create index td_countries_country_idx on td_countries (country_code);

-- La posizione del TD sui 6 assi. Gli assi continui ammettono un solo valore;
-- l'asse categoriale "con chi viaggi" ne ammette più di uno (un TD può essere
-- forte su coppie E famiglie). DA CONFERMARE con Alessandro.
create table td_axis_values (
  td_id     uuid not null references travel_designers(id) on delete cascade,
  axis_code text not null references quiz_axes(code) on delete cascade,
  value     smallint not null,
  primary key (td_id, axis_code, value)
);

create or replace function check_td_axis_value()
returns trigger language plpgsql as $$
declare
  v_kind axis_kind;
  v_min  smallint;
  v_max  smallint;
begin
  select kind, scale_min, scale_max into v_kind, v_min, v_max
    from quiz_axes where code = new.axis_code;

  if new.value < v_min or new.value > v_max then
    raise exception 'Asse %: valore % fuori scala (%-%)', new.axis_code, new.value, v_min, v_max;
  end if;

  if v_kind = 'continuous' and exists (
    select 1 from td_axis_values
     where td_id = new.td_id and axis_code = new.axis_code and value <> new.value
  ) then
    raise exception 'Asse % è continuo: ammesso un solo valore per TD', new.axis_code;
  end if;

  return new;
end $$;

create trigger td_axis_values_check before insert or update on td_axis_values
  for each row execute function check_td_axis_value();

-- I tag sono dichiarati per coppia TD-destinazione, non sul TD in generale:
-- la FK composta lo rende impossibile da sbagliare.
create table td_destination_tags (
  td_id        uuid not null,
  country_code text not null,
  tag_code     text not null references tags(code) on delete cascade,
  primary key (td_id, country_code, tag_code),
  foreign key (td_id, country_code)
    references td_countries (td_id, country_code) on delete cascade
);
create index td_destination_tags_tag_idx on td_destination_tags (tag_code);

-- I servizi attivi del TD. Sono questi flag a comandare quali bottoni
-- compariranno nella mail post-call. Il testo lo scrive il TD, il team lo
-- traduce in flag in onboarding.
create table td_services (
  id                      uuid primary key default gen_random_uuid(),
  td_id                   uuid not null references travel_designers(id) on delete cascade,
  service_type            service_type not null,
  is_active               boolean not null default true,
  price_cents             integer check (price_cents is null or price_cents >= 0),
  duration_minutes        smallint check (duration_minutes is null or duration_minutes > 0),
  cal_event_type_slug     text,
  stripe_payment_link_url text,
  text_during_call        text,   -- "cosa si farà durante la call"
  text_after_call         text,   -- "cosa si potrà fare dopo"
  sort_order              int not null default 0,
  unique (td_id, service_type),

  -- Un servizio prenotabile e attivo senza prezzo, durata, event type e
  -- Payment Link è la classica riga rotta che manda in errore il flusso di
  -- pagamento: qui non può esistere.
  constraint td_services_bookable_complete check (
    service_type not in ('consultation', 'consultation_deep')
    or is_active = false
    or (price_cents is not null
        and duration_minutes is not null
        and cal_event_type_slug is not null
        and stripe_payment_link_url is not null)
  )
);
create index td_services_td_idx on td_services (td_id);
