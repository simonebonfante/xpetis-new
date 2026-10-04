-- XPETIS · 0053 · Itinerari pronti e viaggi di gruppo nel dettaglio
--
-- Nel tool vetrina v6 un itinerario pronto e un viaggio di gruppo hanno **la
-- stessa forma** (`Voce` + `Dettaglio` in `tipi.ts` del tool): titolo, giorni,
-- prezzo, foto, paesi, e un dettaglio con racconto, tappe, cosa comprende la
-- quota, cosa portare, informazioni sanitarie, i sei punteggi di «Questo viaggio
-- fa per me?». Il gruppo ha in più partenze, partecipanti, fascia d'età e
-- accompagnatore.
--
-- Da noi le due tabelle avevano titolo, durata, prezzo e una foto (0026, 0048):
-- le pagine di dettaglio dicevano, nei commenti in testa, tutto quello che il
-- disegno chiedeva e che non aveva sorgente. Adesso la sorgente c'è.
--
-- ## Le scelte
--
-- **Colonne sulla voce** per ciò che è uno a uno. Le liste di sole stringhe —
-- tappe principali, la quota comprende / non comprende, cosa portare — sono
-- `text[]`: elenchi ordinati senza altri attributi, e una tabella ciascuna non
-- comprerebbe niente. I sei punteggi sono sei colonne con il loro `check`, non
-- un `jsonb`, perché così il vincolo 0-5 esiste davvero.
--
-- **Tabelle figlie condivise** per ciò che si ripete con più attributi o con una
-- chiave esterna: foto, paesi, tappe. Ognuna ha due chiavi esterne annullabili,
-- verso l'itinerario e verso il viaggio di gruppo, e un vincolo che ne vuole
-- esattamente una (`num_nonnulls(...) = 1`), come già fa `reviews`. Perché
-- condivise e non sei tabelle: le due voci hanno la stessa forma per scelta del
-- tool, quindi un concetto è una tabella, e l'importatore e le viste hanno un
-- percorso solo. Quello che costa: le unicità diventano due indici parziali,
-- uno per ramo, invece di uno.
--
-- **Le partenze** restano una tabella dei soli gruppi: solo i gruppi le hanno.
-- Sono **date vere**, non più testo come `dates_label` (0048): è la differenza
-- che la 0048 lasciava aperta — un viaggio di gruppo scade, e con la data come
-- testo niente poteva nasconderlo. Adesso la vista della 0054 mostra solo le
-- partenze future.
--
-- **Due campi chiusi su ogni voce**: `xpetis_note` (nota del team, nel tool
-- `notaXpetis`) e `td_terms_text` (le condizioni di acconto, saldo e
-- cancellazione scritte dal designer). In pagina non esce mai il testo del
-- designer: se e quale testo di condizioni mostrare lo decide XPETIS, con una
-- riga di `app_config`.
--
-- **Le colonne superate non si tolgono ancora**: `image_path` su entrambe le
-- tabelle, `dates_label` e `group_size_label` sui gruppi. Le scrive il seed demo
-- 0003, che l'harness rigira da capo, e sul database vero ci sono righe. Restano
-- marcate qui sotto e si tolgono con una migration di pulizia dopo il primo
-- import vero.

-- ---------------------------------------------------------------------------
-- 1. Le colonne del dettaglio, uguali sulle due tabelle
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['td_ready_itineraries', 'td_group_trips'] loop
    execute format($f$
      alter table %1$I
        add column intro            text,
        add column nights           smallint check (nights is null or nights between 0 and 365),
        add column price_note       text,
        add column main_stops       text[] not null default '{}',
        add column price_includes   text[] not null default '{}',
        add column price_excludes   text[] not null default '{}',
        add column packing_list     text[] not null default '{}',
        add column health_visa_info text,
        add column fit_nature       smallint not null default 0 check (fit_nature      between 0 and 5),
        add column fit_trekking     smallint not null default 0 check (fit_trekking    between 0 and 5),
        add column fit_on_the_road  smallint not null default 0 check (fit_on_the_road between 0 and 5),
        add column fit_city         smallint not null default 0 check (fit_city        between 0 and 5),
        add column fit_culture      smallint not null default 0 check (fit_culture     between 0 and 5),
        add column fit_chill        smallint not null default 0 check (fit_chill       between 0 and 5),
        add column xpetis_note      text,
        add column td_terms_text    text
    $f$, t);

    execute format($f$
      comment on column %1$I.intro is
        'Il racconto del viaggio, firmato dal designer (dettaglio.intro del tool v6). Pubblico.';
      comment on column %1$I.nights is
        'Numero di notti (dettaglio.notti). Pubblico.';
      comment on column %1$I.price_note is
        'Nota accanto al prezzo scritta dal designer («voli esclusi · cassa comune 150€ in loco»): dettaglio.prezzoNote. Pubblica.';
      comment on column %1$I.main_stops is
        'Tappe principali, in ordine (dettaglio.tappePrincipali). Pubbliche.';
      comment on column %1$I.price_includes is
        'La quota comprende (dettaglio.quotaComprende). Pubblico.';
      comment on column %1$I.price_excludes is
        'La quota non comprende (dettaglio.quotaNonComprende). Pubblico.';
      comment on column %1$I.packing_list is
        'Cosa portare in valigia (dettaglio.cosaPortare). Pubblico.';
      comment on column %1$I.health_visa_info is
        'Info sanitarie e visti (dettaglio.infoSanitarieVisti). Pubblico.';
      comment on column %1$I.fit_nature is
        '«Questo viaggio fa per me?», Natura, 0-5 (dettaglio.puntiFaPerMe.natura). Tutti e sei a zero = il blocco non esce.';
      comment on column %1$I.xpetis_note is
        'Nota interna di XPETIS sulla voce (dettaglio.notaXpetis del tool v6). CHIUSA: mai in una vista.';
      comment on column %1$I.td_terms_text is
        'Acconto, saldo e cancellazione come li scrive il designer (dettaglio.accontoSaldoCancellazione). '
        'CHIUSO: in pagina esce solo il testo XPETIS di app_config.group_trip_terms_text, se c''è.';
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Le colonne dei soli gruppi
-- ---------------------------------------------------------------------------

alter table td_group_trips
  add column participants_min smallint check (participants_min is null or participants_min > 0),
  add column participants_max smallint check (participants_max is null or participants_max > 0),
  add column age_range        text,
  add column guide_name       text;

alter table td_group_trips
  add constraint td_group_trips_participants_order
    check (participants_min is null or participants_max is null or participants_min <= participants_max);

comment on column td_group_trips.participants_min is
  'Partecipanti minimi (dettaglio.partecipantiMin). Pubblico.';
comment on column td_group_trips.participants_max is
  'Partecipanti massimi (dettaglio.partecipantiMax). Pubblico.';
comment on column td_group_trips.age_range is
  'Fascia d''età come la scrive il designer («18-50 anni»): dettaglio.fasciaEta. Pubblica.';
comment on column td_group_trips.guide_name is
  'Chi accompagna il gruppo (dettaglio.accompagnatore). Pubblico. Vuoto = la '
  'riga «Accompagnato da» non esce: il tool ci metterebbe il nome del designer, '
  'ma un dato che il designer non ha scritto non si inventa.';

-- Le colonne superate.
comment on column td_ready_itineraries.image_path is
  'SUPERATA dalla 0053: le foto stanno in td_trip_images, la prima è la copertina. '
  'Resta per il seed demo e per le righe esistenti; si toglie dopo il primo import vero.';
comment on column td_group_trips.image_path is
  'SUPERATA dalla 0053: le foto stanno in td_trip_images. Si toglie dopo il primo import vero.';
comment on column td_group_trips.dates_label is
  'SUPERATA dalla 0053: le partenze sono date vere in td_group_trip_departures. '
  'Si toglie dopo il primo import vero.';
comment on column td_group_trips.group_size_label is
  'SUPERATA dalla 0053: participants_min e participants_max. Si toglie dopo il primo import vero.';

-- ---------------------------------------------------------------------------
-- 3. Le tabelle figlie condivise
-- ---------------------------------------------------------------------------

-- Le foto di una voce, in ordine. La prima è la copertina.
create table td_trip_images (
  id                 uuid primary key default gen_random_uuid(),
  ready_itinerary_id uuid references td_ready_itineraries(id) on delete cascade,
  group_trip_id      uuid references td_group_trips(id) on delete cascade,
  position           smallint not null check (position > 0),
  storage_path       text not null check (length(btrim(storage_path)) > 0),
  constraint td_trip_images_one_parent
    check (num_nonnulls(ready_itinerary_id, group_trip_id) = 1)
);
create unique index td_trip_images_itinerary_position
  on td_trip_images (ready_itinerary_id, position) where ready_itinerary_id is not null;
create unique index td_trip_images_group_position
  on td_trip_images (group_trip_id, position) where group_trip_id is not null;

comment on table td_trip_images is
  'Foto di un itinerario pronto o di un viaggio di gruppo (campo foto[] del tool '
  'v6), in ordine: la prima è la copertina. Una sola delle due chiavi esterne è '
  'valorizzata.';
comment on column td_trip_images.storage_path is
  'Percorso nel bucket, bucket compreso (td-media/<designer>/…), come le altre '
  'foto di vetrina: lo risolve urlMedia() in lib/vetrina.ts.';

-- I paesi di una voce, in ordine. Un itinerario può attraversarne più d'uno.
create table td_trip_countries (
  id                 uuid primary key default gen_random_uuid(),
  ready_itinerary_id uuid references td_ready_itineraries(id) on delete cascade,
  group_trip_id      uuid references td_group_trips(id) on delete cascade,
  position           smallint not null check (position > 0),
  country_code       text not null references geo_countries(code) on update cascade,
  constraint td_trip_countries_one_parent
    check (num_nonnulls(ready_itinerary_id, group_trip_id) = 1)
);
create unique index td_trip_countries_itinerary_country
  on td_trip_countries (ready_itinerary_id, country_code) where ready_itinerary_id is not null;
create unique index td_trip_countries_group_country
  on td_trip_countries (group_trip_id, country_code) where group_trip_id is not null;
create unique index td_trip_countries_itinerary_position
  on td_trip_countries (ready_itinerary_id, position) where ready_itinerary_id is not null;
create unique index td_trip_countries_group_position
  on td_trip_countries (group_trip_id, position) where group_trip_id is not null;
create index td_trip_countries_country_idx on td_trip_countries (country_code);

comment on table td_trip_countries is
  'Paesi di un itinerario pronto o di un viaggio di gruppo (campo paesi[] del '
  'tool v6). Sono i paesi del VIAGGIO, non quelli coperti dal designer: '
  '«Giappone in Primavera» di chi copre Giappone e Vietnam resta in Giappone.';

-- Le tappe, giorno per giorno.
create table td_trip_stops (
  id                 uuid primary key default gen_random_uuid(),
  ready_itinerary_id uuid references td_ready_itineraries(id) on delete cascade,
  group_trip_id      uuid references td_group_trips(id) on delete cascade,
  position           smallint not null check (position > 0),
  days_label         text,
  title              text,
  description        text,
  constraint td_trip_stops_one_parent
    check (num_nonnulls(ready_itinerary_id, group_trip_id) = 1),
  -- Una tappa senza titolo e senza descrizione è una riga vuota del modulo.
  constraint td_trip_stops_not_empty
    check (length(btrim(coalesce(title, ''))) > 0 or length(btrim(coalesce(description, ''))) > 0)
);
create unique index td_trip_stops_itinerary_position
  on td_trip_stops (ready_itinerary_id, position) where ready_itinerary_id is not null;
create unique index td_trip_stops_group_position
  on td_trip_stops (group_trip_id, position) where group_trip_id is not null;

comment on table td_trip_stops is
  'Le tappe di un itinerario pronto o di un viaggio di gruppo (dettaglio.tappe[] '
  'del tool v6), in ordine.';
comment on column td_trip_stops.days_label is
  'I giorni della tappa come li scrive il designer («1-3», «4»). Testo: in '
  'pagina diventa «Giorno 1-3».';

-- ---------------------------------------------------------------------------
-- 4. Le partenze dei viaggi di gruppo
-- ---------------------------------------------------------------------------
-- Lo stato è quello del tool (`''`, `confermato`, `ultimiPosti`, `soldOut`),
-- tradotto in parole inglesi come il resto dei valori dello schema.

create table td_group_trip_departures (
  id            uuid primary key default gen_random_uuid(),
  group_trip_id uuid not null references td_group_trips(id) on delete cascade,
  starts_on     date not null,
  ends_on       date,
  status        text not null default 'open'
                check (status in ('open', 'confirmed', 'last_seats', 'sold_out')),
  constraint td_group_trip_departures_order
    check (ends_on is null or ends_on >= starts_on),
  unique (group_trip_id, starts_on)
);
create index td_group_trip_departures_trip_idx on td_group_trip_departures (group_trip_id, starts_on);

comment on table td_group_trip_departures is
  'Partenze di un viaggio di gruppo (dettaglio.date[] del tool v6). Date vere: '
  'la vista pubblica mostra solo quelle con starts_on da oggi in poi (ora di Roma).';
comment on column td_group_trip_departures.status is
  'open (nessuna etichetta), confirmed, last_seats, sold_out. Nel tool: '''', '
  'confermato, ultimiPosti, soldOut.';

-- ---------------------------------------------------------------------------
-- 5. Chiuse, come ogni tabella nuova
-- ---------------------------------------------------------------------------
-- Su Supabase i privilegi di default concedono le tabelle create dopo: la
-- revoca è esplicita. Il browser le legge solo attraverso le viste della 0054.

alter table td_trip_images           enable row level security;
alter table td_trip_countries        enable row level security;
alter table td_trip_stops            enable row level security;
alter table td_group_trip_departures enable row level security;
revoke all on td_trip_images, td_trip_countries, td_trip_stops, td_group_trip_departures
  from anon, authenticated;
