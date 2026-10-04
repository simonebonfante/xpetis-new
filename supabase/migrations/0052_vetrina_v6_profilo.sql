-- XPETIS · 0052 · Il profilo del designer secondo il tool vetrina v6
--
-- Dal 3 ottobre 2026 i profili non arrivano più dal form `Vetrina TD (2).html`
-- ma dal tool vetrina v6 di Andrea e Alessandro, che esporta un pacchetto
-- `vetrina.json` (formato `vetrina-xpetis-v6`) più la cartella `images/`. La
-- mappatura campo per campo è in `supabase/MAPPATURA_VETRINA.md`; la fase 0 del
-- lavoro, con le decisioni di Simone, in `VETRINE_V6_FASE0.md`.
--
-- Molto aveva già una casa (0022-0028, 0048): qui entra solo quello che non ce
-- l'aveva. Le colonne nuove sono di due tipi, e la differenza è tutta in chi le
-- può leggere:
--
--   · **pubbliche** — `expertise_areas`, `travel_philosophy`, il paese del
--     viaggio firma, il prezzo «da» dei servizi dopo la call. Le serve la vista
--     della 0054;
--   · **chiuse** — il nome anagrafico, la controprova degli assi, i mattoncini
--     delle frasi, la posizione delle destinazioni in evidenza, gli anni della
--     recensione. Nessuna vista le nomina, e l'harness lo verifica.

-- ---------------------------------------------------------------------------
-- 1. travel_designers
-- ---------------------------------------------------------------------------

alter table travel_designers
  add column legal_name          text,
  add column expertise_areas     text,
  add column travel_philosophy   text,
  add column axis_sides          jsonb,
  add column card_phrases        jsonb,
  add column card_phrases_status jsonb;

-- Il nome. Il tool ha due campi, `nome` e `nomeProfessionale` («Pianeta
-- Ferra»): in pagina vince il secondo quando c'è (decisione D8 del 3 ottobre),
-- e quello resta `display_name`. Il nome anagrafico si conserva qui, per il
-- team: è a chi si scrive, e chi firma un'agenzia.
comment on column travel_designers.legal_name is
  'Nome anagrafico del designer (campo `nome` del tool v6). CHIUSO: in pagina '
  'va display_name, che è nomeProfessionale se valorizzato, altrimenti questo '
  'stesso nome. Nessuna vista pubblica lo espone.';

comment on column travel_designers.expertise_areas is
  'Aree di competenza come le scrive il designer (campo `competenze` del tool '
  'v6): «Sud-Est Asiatico (Vietnam, Thailandia…), Maldive, Sri Lanka». Testo '
  'libero e pubblico. Non è headline, che è la riga sotto il nome nella card '
  'dei risultati.';

comment on column travel_designers.travel_philosophy is
  'Il testo di «Cosa vuol dire viaggiare per me» (campo `viaggiarePerMe` del '
  'tool v6). Pubblico. Diverso da hero_bio e manifesto, che il tool raccoglie '
  'ma non mostra.';

-- La controprova degli assi. Il tool salva accanto al numero (1-4) anche il
-- polo scelto in parole: «poco controllo», «dynamic», «wild». Un valore 1-2
-- deve stare dal lato di `quiz_axes.label_min`, 3-4 da quello di `label_max`.
-- L'importatore lo confronta e si ferma se non torna: è l'unico controllo che
-- intercetta un asse girato, e nessuna prova tecnica lo farebbe. Si conserva per
-- chi un giorno vorrà rifare la verifica a mano.
comment on column travel_designers.axis_sides is
  'Polo scelto per ogni asse, in parole (campo `assiLato` del tool v6). CHIUSO: '
  'serve solo alla controprova del verso degli assi, mai in una vista.';

-- I mattoncini personali della frase della card. Nel sito nessun posto li usa:
-- le frasi di `lib/frase.ts` sono generiche e le scrive Gaia. Si conservano
-- perché hanno la forma giusta (`asse_*`, `geo_*`, `punta_<paese>`,
-- `chiusura`) se un giorno si vorranno frasi personali (decisione D7).
comment on column travel_designers.card_phrases is
  'Mattoncini personali della frase della card (campo `frasiCard` del tool v6). '
  'CHIUSO, non usato dal sito (D7, 3 ottobre 2026).';
comment on column travel_designers.card_phrases_status is
  'Stato di ogni mattoncino di card_phrases («bozza XPETIS da riscrivere»…). '
  'CHIUSO (campo `frasiCardStato` del tool v6).';

alter table travel_designers
  add constraint travel_designers_axis_sides_object
    check (axis_sides is null or jsonb_typeof(axis_sides) = 'object'),
  add constraint travel_designers_card_phrases_object
    check (card_phrases is null or jsonb_typeof(card_phrases) = 'object'),
  add constraint travel_designers_card_phrases_status_object
    check (card_phrases_status is null or jsonb_typeof(card_phrases_status) = 'object');

-- ---------------------------------------------------------------------------
-- 2. td_countries: le destinazioni in evidenza
-- ---------------------------------------------------------------------------
-- Il tool, come il form vecchio, **non fa scegliere il livello**: Luca, che ha
-- compilato ogni campo, ha sette paesi tutti «Base». Il segnale di rilievo è la
-- scelta delle tre destinazioni in evidenza (`topDestinazioniId`).
--
-- Regola decisa da Simone il 3 ottobre 2026 (conferma della mappatura del 6
-- agosto e della sua nota in PUNTI_APERTI.md): **livello 1 se il paese è fra le
-- tre in evidenza oppure è dichiarato «Esperto», altrimenti 2.** La regola la
-- applica l'importatore; qui si conserva l'ordine delle tre, che il livello da
-- solo perderebbe.
--
-- Il vincolo dice la metà della regola che il database sa verificare: una
-- destinazione in evidenza è di livello 1. Chi da Studio abbassa il livello di
-- una di loro deve anche toglierle la posizione — ed è giusto che se ne accorga.

alter table td_countries
  add column highlight_position smallint
    check (highlight_position is null or highlight_position between 1 and 3);

alter table td_countries
  add constraint td_countries_highlight_is_level_1
    check (highlight_position is null or level = 1);

create unique index td_countries_highlight_position
  on td_countries (td_id, highlight_position)
  where highlight_position is not null;

comment on column td_countries.highlight_position is
  'Posizione (1-3) fra le destinazioni in evidenza scelte dal designer (campo '
  '`topDestinazioniId` del tool v6). CHIUSA come il livello: serve al match, il '
  'viaggiatore non la vede. Una destinazione in evidenza è sempre di livello 1.';

-- ---------------------------------------------------------------------------
-- 3. td_signature_trips: il paese del viaggio firma
-- ---------------------------------------------------------------------------
-- Fino a oggi la card mostrava i primi tre paesi coperti dal designer, perché
-- il form non dava un paese per viaggio. Il tool lo dà: uno solo (`paesi[0]`).

alter table td_signature_trips
  add column country_code text references geo_countries(code) on update cascade;

comment on column td_signature_trips.country_code is
  'Il paese del viaggio firma (campo `viaggi[].paesi`, uno solo, del tool v6). '
  'Pubblico: è l''etichetta sulla card.';

-- ---------------------------------------------------------------------------
-- 4. td_services: il prezzo «da» dei servizi dopo la call
-- ---------------------------------------------------------------------------
-- Il tool raccoglie `suMisuraPrezzo`, e la vetrina lo mostra come «da 70€» sul
-- riquadro «Itinerario su misura» (decisione D5).
--
-- **Una colonna a sé, non `price_cents`.** Su una consulenza `price_cents` è
-- l'importo che la cassa incassa (deviazione 1): il server apre la Checkout
-- Session leggendolo da lì. Lo stesso nome con il significato «a partire da»
-- su un altro servizio è l'errore che qualcuno farà fra sei mesi, scrivendo una
-- cassa che legge la colonna sbagliata. Qui il nome dice cosa è.
--
-- Non è il prezzo che si incassa: quello di un su misura lo scrive il designer
-- nella proposta (`orders.proposal_price_cents`, 0044). **Nessun vincolo** lega
-- i due numeri: se la proposta possa stare sotto il «da» non è deciso
-- (domanda aperta in PIANO.md).

alter table td_services
  add column price_from_cents integer
    check (price_from_cents is null or price_from_cents >= 0);

alter table td_services
  add constraint td_services_price_from_after_call
    check (price_from_cents is null
           or service_type in ('custom_itinerary', 'all_inclusive', 'group_trip', 'private_guiding'));

comment on column td_services.price_from_cents is
  'Prezzo di partenza mostrato in vetrina («da 70€»), in centesimi. Solo sui '
  'servizi dopo la call; oggi lo raccoglie il tool per l''Itinerario su misura '
  '(`suMisuraPrezzo`). NON è un importo che si incassa: quello è '
  'orders.proposal_price_cents, scritto dal designer nella proposta. Per le '
  'consulenze l''importo vero è price_cents.';

-- ---------------------------------------------------------------------------
-- 5. td_showcase_reviews: gli anni del recensore
-- ---------------------------------------------------------------------------
-- Il tool scrive sotto ogni recensione «Viaggiatore XPETIS da N anni». Su una
-- recensione raccolta dal designer fuori da XPETIS è falso per costruzione
-- (decisione D3): il dato si conserva, ma nessuna vista lo espone.

alter table td_showcase_reviews
  add column author_years smallint
    check (author_years is null or author_years between 0 and 100);

comment on column td_showcase_reviews.author_years is
  'Campo `recensioni[].anni` del tool v6. CHIUSO: sulle recensioni dichiarate '
  '«Viaggiatore XPETIS da N anni» non è vero, quindi non si mostra (D3).';
