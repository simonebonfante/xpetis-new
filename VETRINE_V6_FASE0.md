# Vetrine v6 — Fase 0: lettura e piano

*3 ottobre 2026. Risposta alla fase 0 di `PROMPT_VETRINE_V6.md` (versione 2).
Nessun file di codice o di schema è stato toccato: solo letture.*

> **Stato al 4 ottobre 2026: le sei fasi sono fatte.** Decise da Simone il 3
> ottobre: il livello dei paesi (§ 0.1: in evidenza **o** «Esperto» = 1), la
> pillola «Personalizzabile» **sì** (D-4), la riga del credito della scheda
> **senza cifra** (D-13), le icone dal tool (§ 0.3), i dieci paesi nuovi. Le
> migration vere sono `0052`-`0056` (la tabella del § 2 è di prima: le viste
> sono finite nella `0054`, l'importatore nella `0055`, e la `0056` aggiunge il
> nome corto). Le altre differenze del § 5 sono in pagina col loro default e
> restano domande aperte in `PIANO.md`, milestone 1. La mappatura definitiva è
> `supabase/MAPPATURA_VETRINA.md`.

Letti: `CLAUDE.md`, `PIANO.md` (milestone 1, deviazioni 9 e 10), le migration
0007, 0021-0028, 0033, 0038, 0040, 0048, 0051, `MAPPATURA_VETRINA.md`,
`PUNTI_APERTI.md` (§ correzione profili), il seed 0001, `genera_geo.mjs`,
`xpetis_destinazioni_v2.json`; del tool `tipi.ts`, `normalizza.ts`, `vista.ts`,
`costanti.ts`, `stati.ts`, `index.ts`, i tre `markup/*.tsx` (solo per i testi
fissi), i due LEGGIMI, le tre schermate; il pacchetto di Luca intero; le tre
route di oggi, `lib/vetrina.ts`, `lib/config.ts`, `box-servizio.tsx`,
`dopo-la-call.tsx`, `recensioni-vetrina.tsx`, `prenota-consulenza.tsx`.

---

## 0. Le cose che contano prima di tutto

1. **❓ Il livello dei paesi: tre fonti, tre risposte.** Va deciso prima della
   fase 1, perché senza un livello 1 nessun TD si pubblica
   (`td_publish_blockers`: «nessun paese di livello 1»).
   - `MAPPATURA_VETRINA.md` (6 agosto): «`livello` è un campo morto;
     **`topDestinazioni` → livello 1**, gli altri → 2».
   - **La tua nota in `PUNTI_APERTI.md`**: «i livelli non ci sono ma ogni td
     setta le sue 3 top destinazioni. Prima di paesi nel json guarda l'array
     topDestinazioni». Conferma la regola della mappatura.
   - Il prompt v6: `livello` `"Base"`/`"Esperto"` → `level`, e
     `topDestinazioniId` in una colonna a sé; report «tutti i paesi Base → non
     prenderà mai il badge».
   Luca, che ha compilato **tutto**, ha sette paesi tutti `"Base"`: è la
   conferma che il tool non fa scegliere il livello (come il form vecchio).
   Con la regola del prompt **nessuno dei 25 si pubblicherebbe** senza
   correzione a mano; con la tua, ognuno ha fino a tre livelli 1.
   **Default che propongo:** `level = 1` se il paese è in `topDestinazioniId`
   **oppure** `livello = "Esperto"`, altrimenti 2; in più
   `highlight_position` (1-3) per non perdere l'ordine delle tre. Il report
   segnala «tutti Base **e** nessuna top destinazione». Dimmi se va bene.

2. **Il ♥ non è un comando.** Nel tool è l'icona dentro la pillola
   «Personalizzabile» sulle card degli itinerari (`VetrinaMarkup.tsx:335`,
   `ItinerarioMarkup.tsx:353`). Non c'è nessun «preferiti» disegnato. Quindi
   la regola «non si disegna un comando che non fa niente» non si applica. La
   domanda è un'altra: la pillola «Personalizzabile» la vogliamo? (Punto D-4.)

3. **Le quattro icone di «E dopo l'incontro?» ci sono nel tool**, come SVG
   dentro `VetrinaMarkup.tsx:85-110` (`icSM`, `icAI`, `icGR`, `icPR`). Sono
   le quattro che mancano da noi dal 29 settembre (connettore Figma esaurito).
   Si copiano in `public/img/` come file nostri: chiude un buco aperto.

4. **I 129 paesi comuni coincidono in tutto** con `stati.ts`: id, nome e
   macro-area, zero differenze. Mancano esattamente i dieci della tabella del
   prompt. Il resto della tassonomia non va toccato.

5. **Il verso degli assi di Luca torna su tutti e cinque** (§ 6).

6. **Tutte le etichette di Luca combaciano** con le liste chiuse: temi,
   contesti, durata, budget, copertura legale, prontezza e tempi dei gruppi,
   le due voci di «con chi viaggi». L'importatore farà comunque il controllo.

---

## 1. Tabella di mappatura completa

Legenda della categoria: **P** pubblico (in una vista `public_*`), **M**
chiuso per il match, **T** chiuso solo team, **A** solo archivio
(`td_import_runs.raw`). *Nuova* = colonna o tabella da creare.

Il JSON grezzo intero va **sempre** nell'archivio: la colonna «A» dice solo
che quella chiave non ha altra casa.

### 1.1 Primo livello

| Chiave v6 | Destinazione | Cat. | Note |
|---|---|---|---|
| `formato` | `td_import_runs.format` | A | Cancello: solo `vetrina-xpetis-v6`, altrimenti rifiuto |
| `brand` | — | A | Costante «XPETIS» |
| `nome` | `travel_designers.legal_name` *nuova* | T | Sempre. Va **anche** in `display_name` se `nomeProfessionale` è vuoto (D8) |
| `nomeProfessionale` | `travel_designers.display_name` | P | Se valorizzato vince su `nome` (D8) |
| `fotoProfilo` | `travel_designers.photo_url` | P | Upload in `td-media`. Oggi `photo_url` è un **URL completo** (seed 0004), le altre foto sono percorsi `td-media/…` letti da `urlMedia()`: tengo la convenzione di oggi per non toccare la ricerca |
| `competenze` | `travel_designers.expertise_areas` *nuova* | P | `headline` ha un altro senso: è la riga sotto il nome nella card dei risultati (`scheda-designer.tsx`) e la descrizione dei metadati. Vedi ❓ D-14 |
| `esperienza` | `travel_designers.years_experience` | P | Intero 0-70; altrimenti report e `null` |
| `lingue` | `travel_designers.languages text[]` | P | Split sulle virgole, `trim`, vuoti tolti |
| `instagram` | `travel_designers.instagram_handle` | P | Salvo **senza** `@` (la pagina di oggi lo toglie comunque). Il tool accetta anche un URL intero: se arriva un URL instagram.com ne estraggo l'handle, altrimenti report |
| `storia` | `travel_designers.bio` | P | Paragrafi a riga vuota, come oggi |
| `viaggiarePerMe` | `travel_designers.travel_philosophy` *nuova* | P | |
| `heroBio` | `travel_designers.hero_bio` | P | Già esposta. **Il tool non la mostra** (`vista.ts` non la legge mai) |
| `manifesto` | `travel_designers.manifesto` | P | Già esposta. **Il tool non la mostra** |
| `callDescrizione` | `td_services[consultation].text_during_call` | P | |
| `callPunti[]` | `td_service_bullets` del `consultation` | P | Vuoti tolti, posizione 1… |
| `callPrezzo` | `td_services[consultation].price_cents` | P | Solo al primo import (§ 3). `"30"`, `"30€"`, `"30,50"` sì; il resto report |
| `callPrezzoLibero` | `td_services[consultation].price_is_custom` | P | Già esposta |
| `suMisuraPrezzo` | `td_services[custom_itinerary].price_from_cents` *nuova* | P | D5, colonna a sé (§ 2.1). Se il su misura non è fra i `servizi`: report, non si scrive |
| `sessioneOfferta` | esiste/attivo `td_services[consultation_deep]` | P | `false` → riga assente o `is_active = false` |
| `sessionePrezzo` | `td_services[consultation_deep].price_cents` | P | Primo import soltanto |
| `sessioneDurata` | `…duration_minutes` + `cal_event_type_slug` | P | `"60 minuti"`/`"90 minuti"` → 60/90 e `consulenza-xpetis-60`/`-90`; altro → servizio fermo, report |
| `sessioneDescrizione` | `td_services[consultation_deep].text_during_call` | P | |
| `sessionePunti[]` | `td_service_bullets` del `consultation_deep` | P | |
| `servizi[]` | `td_services.is_active` dei quattro tipi dopo la call | P | Le quattro stringhe di `SERVIZI_DOPO`; sconosciuta → report |
| `viaggi[]` | `td_signature_trips` | P | Max 3. Senza titolo né foto: scartato in silenzio; senza titolo con foto: report |
| `itinerari[]` | `td_ready_itineraries` + figlie | P | § 1.2 |
| `gruppo[]` | `td_group_trips` + figlie | P | § 1.2 |
| `recensioni[]` | `td_showcase_reviews` | P | § 1.3 |
| `paesi[]` | `td_countries` + `td_destination_tags` | M | § 1.4 |
| `topDestinazioni` | — | A | I nomi: c'è l'id. Solo controllo di coerenza nel report |
| `topDestinazioniId` | `td_countries.highlight_position` *nuova* (1-3) | M | E livello, vedi § 0.1 ❓ |
| `assi.*` | `td_axis_values` | M | § 1.5 |
| `assiLato.*` | `travel_designers.axis_sides jsonb` *nuova* | T | Controprova; un'incoerenza ferma l'import |
| `frasiCard` | `travel_designers.card_phrases jsonb` *nuova* | T | D7 |
| `frasiCardStato` | `travel_designers.card_phrases_status jsonb` *nuova* | T | D7 |
| `cardSfondo` | `travel_designers.background_photo_url` | P | Già nella vista, nessuna pagina la mostra. ❓ § 7.2 |
| `coperturaLegale` | `travel_designers.legal_coverage` | T | Vincolo esistente sui tre valori |
| `gruppoHaGia` | `travel_designers.group_trips_readiness` | T | Esistente |
| `gruppoTempi` | `travel_designers.group_trips_timing` | T | **Esiste già** (0022), con vincolo sui due valori |
| `membro` | — | A | D2 |
| `rating` | — | A | D2 |
| *chiave sconosciuta* | — | A | Report |

### 1.2 Itinerari e viaggi di gruppo (`Voce` + `Dettaglio`, stessa forma)

Colonne aggiunte **a entrambe** le tabelle, salvo dove indicato.

| Chiave v6 | Destinazione | Cat. | Note |
|---|---|---|---|
| `titolo` | `title` | P | Chiave di riconciliazione al reimport (0051): stesso titolo → stessa riga → stesso slug |
| `giorni` | `duration_label` (esistente) | P | Resta testo (`"10"`, `"13 giorni"`); in pagina la regola `giorniLabel` del tool |
| `prezzo` | `price_label` (esistente) | P | Testo; in pagina la regola `euro()` del tool |
| `img` | — | A | Duplica `foto[0]` |
| `foto[]` | `td_trip_images` *nuova* | P | La prima è la copertina |
| `paesi[]` | `td_trip_countries` *nuova*, FK `geo_countries` | P | |
| `dettaglio.intro` | `intro` *nuova* | P | |
| `dettaglio.notti` | `nights smallint` *nuova* | P | Non intero → report, `null` |
| `dettaglio.prezzoNote` | `price_note` *nuova* | P | |
| `dettaglio.tappePrincipali[]` | `main_stops text[]` *nuova* | P | |
| `dettaglio.tappe[]` | `td_trip_stops` *nuova* | P | |
| `…tappe[].giorni` | `td_trip_stops.days_label` | P | Testo («1-3») |
| `…tappe[].titolo` | `td_trip_stops.title` | P | |
| `…tappe[].descrizione` | `td_trip_stops.description` | P | |
| `dettaglio.quotaComprende[]` | `price_includes text[]` *nuova* | P | |
| `dettaglio.quotaNonComprende[]` | `price_excludes text[]` *nuova* | P | |
| `dettaglio.cosaPortare[]` | `packing_list text[]` *nuova* | P | |
| `dettaglio.infoSanitarieVisti` | `health_visa_info` *nuova* | P | |
| `dettaglio.puntiFaPerMe.natura` | `fit_nature smallint` *nuova* | P | Sei colonne, `check between 0 and 5` |
| `…puntiFaPerMe.trekking` | `fit_trekking` | P | |
| `…puntiFaPerMe.onTheRoad` | `fit_on_the_road` | P | |
| `…puntiFaPerMe.city` | `fit_city` | P | |
| `…puntiFaPerMe.cultura` | `fit_culture` | P | |
| `…puntiFaPerMe.chill` | `fit_chill` | P | |
| `dettaglio.notaXpetis` | `xpetis_note` *nuova* | T | C'è solo sui gruppi di Luca e **non è in `tipi.ts`**: la tratto come chiave legittima su entrambi |
| `dettaglio.accontoSaldoCancellazione` | `td_terms_text` *nuova* | T | Mai in pagina: in pagina esce solo il testo XPETIS da `app_config` |
| `dettaglio.date[]` (gruppi) | `td_group_trip_departures` *nuova* | P | |
| `…date[].dal` / `.al` | `starts_on` / `ends_on date` | P | Non ISO → report, partenza scartata |
| `…date[].stato` | `status` (`open`, `confirmed`, `last_seats`, `sold_out`) | P | `''` → `open`. Normalizzazione come `STATO_NORM` del tool |
| `dettaglio.partecipantiMin` (gruppi) | `participants_min smallint` *nuova* | P | Non intero → report |
| `dettaglio.partecipantiMax` (gruppi) | `participants_max smallint` *nuova* | P | `check (min <= max)` |
| `dettaglio.fasciaEta` (gruppi) | `age_range` *nuova* | P | Testo libero |
| `dettaglio.accompagnatore` (gruppi) | `guide_name` *nuova* | P | |
| `date`, `partecipanti*`, `fasciaEta`, `accompagnatore` **sugli itinerari** | — | A | Il tool li ignora sugli itinerari. Se non vuoti: report |

### 1.3 Recensioni dichiarate

| Chiave | Destinazione | Cat. | Note |
|---|---|---|---|
| `titolo` | `td_showcase_reviews.title` | P | |
| `nome` | `author_name` (not null) | P | Vuoto → recensione scartata, report |
| `stelle` | `stars` (1-5, not null) | P | Si vede sulla singola, non fa media (D3). Fuori scala → report |
| `data` | `date_label` | P | Testo |
| `testo` | `body` (not null) | P | Vuoto → scartata, report |
| `anni` | `author_years smallint` *nuova* | T | Conservato, mai mostrato (D3). Luca non ce l'ha |
| — | `is_published = true` all'import | | |

### 1.4 Paesi (`paesi[]`)

| Chiave | Destinazione | Cat. | Note |
|---|---|---|---|
| `id` | `td_countries.country_code` | M | Deve esistere in `geo_countries`; uno sconosciuto ferma il TD |
| `paese` | — | A | Solo controllo: se il nome non è quello dell'id, report |
| `livello` | `td_countries.level` | M | ❓ § 0.1. Nel match `1` = forte (badge), `2` = base (0018, 0030) |
| `aree` | `areas_note` | M | |
| `temi[]` | `td_destination_tags` (kind `theme`) | M | Match carattere per carattere su `tags.label_it`; il resto report |
| `temiCustom[]` | `custom_themes` | M | |
| `contesti[]` | `td_destination_tags` (kind `context`) | M | Idem |
| `durata` | `typical_duration` | M | Vincolo esistente |
| `budget` | `typical_budget` | M | Vincolo esistente. Vuoto (Indonesia di Luca) → `null` |

### 1.5 Assi

Corrispondenza verificata sulle etichette (0021, `ASSI_DEF` del form,
`quiz_axes.label_min/label_max` del seed), non sul nome:

| Chiave v6 | Asse | `label_min` (1) | `label_max` (4) |
|---|---|---|---|
| `controllo` | `planning_involvement` | Poco controllo | Molto controllo |
| `ritmo` | `pace` | Slow | Dynamic |
| `scomodita` | `comfort_wild` | Comfort | Wild |
| `luogo` | `curated_vs_real` | Estetica curata | Vita reale |
| `sociale` | `social_orientation` | Intimità | Socialità |
| `conChi[]` | `companions` | una riga per etichetta, match su `quiz_axis_options.label_it` | |

---

## 2. Le migration

Nessuna migration per i dieci paesi: è **dato**, passa dal JSON e dal seed
0002 rigenerato.

| # | Nome | Cosa fa |
|---|---|---|
| 0052 | `0052_vetrina_v6_profilo.sql` | `travel_designers`: `legal_name`, `expertise_areas`, `travel_philosophy`, `axis_sides`, `card_phrases`, `card_phrases_status`. `td_countries.highlight_position` (1-3, unica per TD). `td_signature_trips.country_code` (FK). `td_services.price_from_cents` con vincolo. `td_showcase_reviews.author_years` |
| 0053 | `0053_vetrina_v6_viaggi.sql` | Colonne nuove su `td_ready_itineraries` e `td_group_trips` (§ 1.2); tabelle figlie condivise `td_trip_images`, `td_trip_countries`, `td_trip_stops`; `td_group_trip_departures`. Commenti di deprecazione su `image_path`, `dates_label`, `group_size_label` |
| 0054 | `0054_vetrina_v6_viste.sql` | `public_td_showcase` estesa (in coda, `create or replace`); viste nuove `public_td_ready_itinerary`, `public_td_group_trip`, `public_td_reviews`; `td_publish_blockers()` con i due rami nuovi |
| 0055 | `0055_import_vetrine.sql` *(fase 2)* | `td_import_runs`; la funzione `td_import_showcase(p_payload jsonb, p_scrivi boolean)` (§ 3) |

*Aggiornato dopo la fase 1:* viste e importatore si sono scambiati di numero,
perché le viste sono schema (fase 1) e l'importatore no (fase 2).

Ogni tabella nuova: RLS accesa e `revoke all … from anon, authenticated`.
Funzioni con `search_path = public, extensions`.

### 2.1 Le scelte, e il perché

- **`price_from_cents` a sé, non `price_cents`.** Su `consultation`
  `price_cents` è l'importo che la cassa incassa (deviazione 1). Usare la
  stessa colonna sul su misura con il senso «da» è l'errore che qualcuno farà
  fra sei mesi. Vincolo: ammessa solo su `custom_itinerary`, `all_inclusive`,
  `group_trip`, `private_guiding`; nessun vincolo verso
  `orders.proposal_price_cents` (non è deciso, § 11.1 del prompt).
- **Tabelle figlie condivise con due FK annullabili** e
  `check (num_nonnulls(ready_itinerary_id, group_trip_id) = 1)`, come
  `reviews`. Le due voci hanno la stessa forma nel v6: una tabella per
  concetto (foto, paesi, tappe) invece di sei, un solo percorso
  nell'importatore e nelle viste. Le partenze restano una tabella dei soli
  gruppi, perché solo i gruppi le hanno. Le unicità diventano due indici
  parziali per tabella.
- **Le liste di stringhe** (tappe principali, comprende, non comprende,
  valigia) come `text[]` sulla voce: sono elenchi ordinati senza altri
  attributi, e una tabella in più per ciascuna non compra niente.
- **`puntiFaPerMe` in sei colonne** con `check 0-5`, non un `jsonb`: così il
  vincolo esiste davvero.
- **Le colonne superate non le tolgo adesso** (`image_path` su entrambe,
  `dates_label`, `group_size_label`): le scrive il seed demo 0003, che
  l'harness rigira da capo, e il database vero ha già righe. Escono dalla vista,
  la 0053 le marca come superate, e si tolgono con una migration di pulizia
  dopo il primo import vero. Se preferisci toglierle subito, riscrivo anche lo
  0003.
- **Le righe nuove di `app_config`** nel seed `0001_config.sql` con
  `on conflict (key) do nothing`, come tutte le altre (nessuna migration finora
  ne inserisce). Ti darò il comando per applicarlo.

### 2.2 Le viste: cosa diventa leggibile

| Vista | Colonne nuove leggibili con gli strumenti di sviluppo aperti |
|---|---|
| `public_td_showcase` (estesa) | `expertise_areas`, `travel_philosophy`, `member_years` (anni compiuti da `joined_at`, **mai la data**), `rating_avg` (solo con recensioni verificate ≥ `showcase_rating_min_reviews`, altrimenti `null`; nessun conteggio); nei servizi `price_from_cents`; nei viaggi firma il nome del paese; nelle card di itinerari e gruppi paesi, copertura, giorni, prezzo e per i gruppi prossima partenza futura con stato e min/max persone |
| `public_td_ready_itinerary` (nuova) | Una riga per itinerario di un TD pubblicato: tutto § 1.2 tranne `xpetis_note` e `td_terms_text`; tappe, foto, paesi in `jsonb` |
| `public_td_group_trip` (nuova) | Idem per i gruppi, più **solo le partenze future** (a `Europe/Rome`, calcolate nella vista), persone, fascia d'età, accompagnatore |
| `public_td_reviews` (nuova) | `td_slug`, `source` (`td_declared` oggi; `xpetis_verified` dalla milestone 8), titolo, nome, stelle, data, testo, posizione. Mai `author_years` |

In nessuna vista: livelli, `highlight_position`, assi, `axis_sides`,
`legal_coverage`, `group_trips_*`, `xpetis_note`, `td_terms_text`,
`card_phrases*`, `legal_name`, `td_import_runs`. L'harness lo verifica colonna
per colonna con il ruolo `anon`.

### 2.3 `td_publish_blockers()`

Due rami nuovi, nient'altro:
- «Sessione approfondita attiva con durata non ammessa» (diversa da 60 e 90);
- «prezzo della consulenza breve mancante» (riga `consultation` senza prezzo:
  oggi il vincolo la tiene spenta e il messaggio generico «nessuna consulenza
  attiva» non dice perché).

Itinerari, gruppi, recensioni, Sessione, viaggi firma: facoltativi come nel
tool, non bloccano.

### 2.4 `app_config`, gruppo `showcase`

| Chiave | Valore iniziale | Chi |
|---|---|---|
| `showcase_rating_min_reviews` | `1` | Simone, 3 ottobre |
| `showcase_declared_reviews_note` | «Recensioni raccolte dal Travel Designer fuori da XPETIS.» (mia prima stesura, senza genere) | da riscrivere a Gaia |
| `ready_itinerary_price_prefix` | `a persona, calcolato su 2 persone` | dal tool, da confermare |
| `group_trip_price_prefix` | `a persona` | dal tool, da confermare (R8: anche questa è una nota di prezzo) |
| `group_trip_terms_text` | *vuota* | finché non confermi |
| `showcase_price_on_request` | `Prezzo su richiesta` | dal tool (`TESTI_SITO`), da confermare |

`ready_itinerary_price_note` resta il ripiego dei soli itinerari.

---

## 3. L'importatore (anticipo, per farti vedere che regge)

`supabase/scripts/importa_vetrina.mjs <cartella> --slug <td> [--email …] [--scrivi]`.
Usa `@supabase/supabase-js` già nelle dipendenze; chiavi da `SUPABASE_URL` e
`SUPABASE_SECRET_KEY`, mai stampate.

1. **Lettura e validazione in JS puro** (modulo esportato, testabile): formato,
   prezzi, durate, foto (`images/…` sì, URL assoluti no), voci senza titolo,
   chiavi sconosciute, controprova degli assi. Produce un payload già pulito.
2. **Tutto il TD o niente:** una funzione Postgres
   `td_import_showcase(payload, p_scrivi)` fa ogni scrittura in una
   transazione. **La prova a secco è lo stesso codice**: con
   `p_scrivi = false` scrive dentro un blocco `begin … exception` e poi solleva
   un'eccezione propria che la funzione cattura, così le scritture tornano
   indietro e resta il report — compresi paesi e tag che non agganciano,
   prezzi che non sovrascriverebbe e **gli slug che ogni voce prenderebbe**.
   Un solo percorso, quindi la prova a secco non può mentire sulla scrittura.
3. **Foto** (solo con `--scrivi`, dopo la prova): percorsi
   `td-media/<td>/<profilo|firma|itinerario|gruppo>/<slug-voce>-<n>-<hash8>.<ext>`.
   L'hash del contenuto rende il caricamento idempotente (stesso file, stesso
   percorso, niente da caricare) e cambia indirizzo quando la foto cambia
   (niente cache vecchie). Poi la funzione; poi si tolgono dal bucket le foto
   che nessuna riga cita più. Se la funzione fallisce, si tolgono quelle appena
   caricate.
4. **Riconciliazione:** le voci si aggiornano **per titolo** (0051), con
   `is distinct from` così una riga uguale non tocca nemmeno `updated_at`: è
   questo a rendere vero «il secondo lancio non cambia niente». Una voce
   sparita si cancella e il suo indirizzo dà 404.
5. **Mai toccati:** `id`, `slug`, `status`, `email`, `phone`, `cal_username`,
   `cal_webhook_ok_at`, `agency_id`, `joined_at`. Un TD nuovo nasce `draft`.
   Prezzi, durate e slug Cal.com dei servizi: scritti alla creazione della
   riga, poi solo report.
6. **Prova su PGlite:** l'harness importa il modulo di lettura, costruisce il
   payload di Luca e chiama la funzione due volte; la seconda deve lasciare
   identiche tutte le righe e tutti gli `updated_at`.

Dimensioni: le foto di Luca sono 4 MB in tutto. Non aggiungo un
ridimensionamento (servirebbe `sharp`, che non abbiamo): oltre il limite del
bucket (15 MB) il file va nel report.

---

## 4. Le tre pagine: blocchi e sorgenti

Architettura come da § 6.1 del prompt: server component che leggono solo le
viste e costruiscono un oggetto «vista» tipizzato in un modulo nostro
(`lib/vetrina-vista.ts`, regole riscritte da `vista.ts`/`normalizza.ts`);
componenti client solo per linguette, «Carica altre recensioni»,
fisarmonica, galleria, frecce. Da `lg` il disegno del tool, sotto una colonna
nello stesso ordine.

### 4.1 Vetrina — `/designer/[slug]`

| Blocco | Sorgente |
|---|---|
| Foto + Instagram | `photo_url`, `instagram_handle` (icona solo se c'è) |
| Voto | `rating_avg` della vista: oggi `null` per tutti, non esce |
| Nome | `display_name` (D8) |
| Aree di competenza | default di oggi: paesi; oppure `expertise_areas` (D-6) |
| Anni di esperienza | `years_experience` (numero o fascia, D-5) |
| Membro XPETIS | `member_years` > 0 |
| Lingue parlate | `languages` |
| La storia | `bio` |
| E dopo l'incontro? | servizi dopo la call attivi; «da X€» da `price_from_cents` solo sul su misura; icone dal tool |
| Scheda Incontro / Sessione | `services` (`consultation`, `consultation_deep`): durata, «Videocall», `price_cents`, testo, bullet, `PrenotaConsulenza` invariato, `?servizio=` invariato. Niente D4; credito secondo R2 (D-13) |
| Cosa vuol dire viaggiare per me | `travel_philosophy` |
| Viaggi firma | `signature_trips`: paese del viaggio, titolo, descrizione, foto; frecce solo con più foto |
| Come funziona | quello di oggi (`public_config`) |
| Itinerari pronti da vivere | card: pillola «Personalizzabile» (D-4), paese, titolo, giorni, «A partire da» o «Prezzo su richiesta», link per slug |
| Viaggi di gruppo | card: paese, titolo, prossima partenza futura con stato, giorni, persone, prezzo, link per slug |
| Cosa dice chi ha viaggiato con me | `public_td_reviews`: dicitura sopra, tre alla volta |
| Scheda finale | «Prenota l'Incontro con…» → `#servizi`, `TornaAiRisultati`, credito R2 |

### 4.2 Itinerario — `/designer/[slug]/itinerario/[itinerario]`

| Blocco | Sorgente |
|---|---|
| Briciole, titolo, «<TD> · <giorni> · <paesi>» | `public_td_ready_itinerary` |
| Copertina + due foto + «Mostra tutte le foto (N)» | `images` |
| Racconto con firma | `intro`, foto e nome del TD |
| Le tappe del viaggio | `stops` |
| Questo viaggio fa per me? | `fit_*` (tutti zero: non esce) |
| Vuoi cambiare qualcosa? + «Personalizzalo con…» | testo con la durata della breve dal database; credito R2 |
| Riquadro prezzo | «A partire da» `price_label`; riga = `ready_itinerary_price_prefix` · (`price_note` o `ready_itinerary_price_note`); Durata «10 gg» (+ notti); Tappe principali |
| Informazioni utili | valigia, comprende / non comprende, sanitarie e visti; voci vuote non escono |
| Fascia finale scura (prezzo + tasto) | c'è nel tool; oggi l'abbiamo tolta come doppione. D-23 |
| Altri itinerari di <TD> | fino a tre, esclusa questa |

### 4.3 Viaggio di gruppo — `/designer/[slug]/viaggio-di-gruppo/[viaggio]`

| Blocco | Sorgente |
|---|---|
| Briciole, titolo, «Progettato da <TD> · <giorni> · <paesi>», «Accompagnato da» | `public_td_group_trip`; accompagnatore solo se c'è (D-17) |
| Foto, racconto, tappe, fa per me | come l'itinerario |
| Riquadro prezzo | «A partire da»; riga = `group_trip_price_prefix` · `price_note` (**nessun ripiego**); Partenze future con stato; Durata «<giorni> · <notti> notti»; Persone previste; Fascia d'età |
| Parlane con… | prenotazione dell'Incontro (`/designer/<slug>#servizi`), credito R2 |
| Informazioni utili | come l'itinerario + «Acconto, saldo e cancellazione» solo se `group_trip_terms_text` non è vuota |
| Fascia finale: prezzo, prossima partenza, tasto | prima partenza futura |
| Altri viaggi di gruppo di <TD> | fino a tre |

**Nessuna partenza futura:** la pagina resta, Partenze e «Prossima partenza»
non escono. **`vista.ts` diverge**: mostra tutte le partenze, passate comprese
(sold out barrate), e come «prossima» ripiega sull'**ultima passata** (D-15,
D-16).

`generateMetadata`: titolo «<nome> · Travel Designer XPETIS», descrizione
dalla storia (160 caratteri), foto profilo; per le pagine voce titolo, intro e
copertina. Oggi usiamo `hero_bio`, che nel v6 è vuota per tutti.

---

## 5. Differenze fra il tool e il Flusso (o il codice di oggi)

Il default è sempre **il Flusso, o quello che c'è oggi**. Niente di questa
lista si costruisce prima della tua risposta.

| # | Il tool | Flusso / oggi | Default |
|---|---|---|---|
| D-1 | Linguetta Sessione: pannello «Dopo la sessione, hai già un itinerario completo!» con solo All Inclusive e Viaggio privato, e una riga All Inclusive che promette «scaleremo dal preventivo quanto già pagato» | Riquadro unico «E dopo l'incontro?» fuori dalla scheda, uguale per le due consulenze | Come oggi. Non la costruisco |
| D-2 | «Acconto, saldo e cancellazione» con testo XPETIS fisso su tutti i gruppi (acconto 30%, penali, rimborso sotto il minimo), aperto di default | Il Flusso non lo prevede | Costruito, testo in `app_config` **vuoto** = blocco assente |
| D-3 | «a persona, calcolato su 2 persone» fisso sugli itinerari, «a persona» sui gruppi | Nota unica `ready_itinerary_price_note` | Due righe in `app_config` (§ 2.4) |
| D-4 | Pillola «♥ Personalizzabile» su ogni card itinerario; pillola «Viaggio di gruppo» sulle card di «Altri viaggi di gruppo». Il ♥ è decorativo, **non un comando** | Le nostre card oggi non hanno pillole | ❓ La costruisco col ♥? È forma (dal tool) e il contenuto è vero: gli itinerari si personalizzano |
| D-5 | Esperienza in fasce: «0-2», «2-5», «5-10», «10+ anni» (fasce fisse nel codice, e 2 e 5 stanno in due fasce) | Il numero: «6 anni» | Il numero |
| D-6 | «Aree di competenza» = testo libero `competenze` | L'elenco dei paesi coperti | Come oggi. **Io suggerirei `competenze`**: il TD lo scrive proprio per quella riga |
| D-7 | «Come funziona»: testi del tool, tabella § 5.1 | I nostri, corretti sul Flusso | I nostri |
| D-8 | «E dopo l'incontro?»: titoli, righe e introduzione **identici ai nostri**; in più icone e «da X€» | Senza icone, senza prezzo | Icone dal tool (§ 0.3) e «da X€» (D5): ora hanno una sorgente |
| D-9 | Nomi: «L'Incontro» / «Sessione approfondita» (o «L'Incontro con Luca» se non c'è Sessione), tasti «Prenota l'Incontro» / «Prenota la Sessione» | «Consulenza breve» / «Consulenza approfondita», titolo «Call», tasto «Prenota la call» | ❓ Testo, quindi Flusso: i nostri, finché non decidi. Il prompt usa le parole del tool nelle tabelle |
| D-10 | Sessione sempre «90 minuti» (`normalizza` sovrascrive `sessioneDurata` con una costante) | Deviazione 10: 60 o 90 | Dal JSON, 60 o 90. ❓ Il tool offre il 60? Se no, nessuno avrà la Sessione da 60 |
| D-11 | Incontro sempre «30€» | `price_cents` per designer (R1) | Database |
| D-12 | Descrizione e punti dell'Incontro/Sessione vuoti → testi d'esempio di Francesca «che escono anche sul sito» | Un blocco senza dati non esce | Non li inietto. ❓ Se il TD li ha lasciati vuoti nel tool, nel tool vedeva quelli: vuoi che l'importatore li scriva? |
| D-13 | Credito quantificato: «I 30€ dell'Incontro verranno scalati…», «i 30€ si scalano dal viaggio», «I 90€ della Sessione verranno scalati dall'All Inclusive» | R2 | Righe non quantificate. ⚠️ **Anche la nostra `box-servizio.tsx` quantifica oggi**: «I {prezzo} dell'incontro verranno scalati dal costo del servizio…». La metto come le altre («Quello che paghi per l'Incontro…» senza cifra)? |
| D-14 | Nessun campo `headline` | `headline` è la riga della card dei risultati e la descrizione dei metadati | Resta `null` per i TD importati: la card dei risultati perde quella riga. ❓ |
| D-15 | Partenze: tutte, passate comprese, sold out barrate | Prompt: solo future | Solo future |
| D-16 | «Prossima partenza»: senza future, l'**ultima passata** | Prompt: prima futura | Nessuna |
| D-17 | «Accompagnato da»: senza accompagnatore, **il nome del TD** | Prompt: solo se c'è | Solo se c'è. ❓ Forse nel tool vuoto vuol dire «lo accompagno io» |
| D-18 | Solo `partecipantiMax` → «15 persone» (come se fossero esattamente 15); card «persone», pagina «partecipanti» | — | ❓ Propongo «fino a 15 persone»; testo da Gaia |
| D-19 | Nota di prezzo vuota → «volo non incluso · IVA inclusa» anche sui gruppi | Prompt: nessun ripiego sui gruppi | Nessun ripiego |
| D-20 | «Viaggiatore XPETIS da N anni» sotto ogni recensione, 1 se manca | D3 | Non esce sulle dichiarate |
| D-21 | «4.6» e «Membro XPETIS: 1 anno» fissi | D2 | Dati veri |
| D-22 | «Tappe principali» raccolte sui gruppi ma **mai mostrate** sulla pagina del gruppo (solo sull'itinerario) | — | Come il tool: non escono. ❓ |
| D-23 | Fascia finale scura con prezzo e tasto anche sull'itinerario | Tolta oggi come doppione della scheda in alto | Forma dal tool: la rimetto, senza «Acquista» |
| D-24 | Frecce dei viaggi firma solo disegnate | — | Funzionano con più foto, altrimenti assenti |
| D-25 | Galleria «Mostra tutte le foto» semplice (non è nel Figma) | Oggi una foto sola | La costruisco |
| D-26 | Il paese sulla card del viaggio firma è del viaggio | Oggi i primi tre paesi del TD | Del viaggio: ora il dato c'è |
| D-27 | `heroBio` e `manifesto` mai mostrati | Oggi formano «Cosa vuol dire viaggiare per me» | `travel_philosophy` al loro posto. ❓ Se un TD ha `heroBio` e non `viaggiarePerMe`, non esce niente |
| D-28 | «Come funziona» chiude con «Quello che paghi per l'Incontro non lo perdi: si scala dal servizio che scegli con X.» | Da noi non c'è | Non lo aggiungo (testo: vincono i nostri) |
| D-29 | Recensione valida anche con il solo titolo | `author_name` e `body` obbligatori | Report, scartata |
| D-30 | «Prezzo su richiesta» quando il prezzo manca | Oggi la riga non esce | Testo in `app_config` (§ 2.4) |
| D-31 | Colori senza token nostro: `#54544F` (testo secondario), `#E7E4D6` (filetti), `#F7DDBE`/`#8A3D06` (ultimi posti), `#E4E1D4`/`#57564F`/`#6B6A63` (sold out), `#1B5E3F`/`#134430` (confermato), `#9E6F54` (fascia marrone, già scritto a mano nella vetrina di oggi) | R6 | Li segnalo e non li aggiungo. ❓ Senza token, i tre stati delle partenze non si distinguono: vuoi aggiungerli? |
| D-32 | `joined_at` | Nasce `current_date` all'import | «Membro XPETIS» non uscirà per nessuno per un anno. ❓ Il team scrive la data vera da Studio? |
| D-33 | — | Nel form vecchio All Inclusive era «sempre attivo per tutti» | Segue il JSON. ❓ Nel v6 si può togliere? |

### 5.1 «Come funziona», affiancati

| Passo | Tool | Noi oggi |
|---|---|---|
| 1 | **Prenota il tuo Incontro** — «… Puoi modificare o cancellare l'appuntamento fino a 24 ore prima.» | **Prenota il tuo incontro** — «… Puoi cancellarlo con rimborso pieno fino a {N} ore prima e spostarlo fino a {M} ore prima.» (`app_config`) |
| 2 | «Un Incontro di **30 minuti** con {primo nome}… Raccontagli cosa cerchi…» | «Un incontro di **{minuti della breve}** minuti con {nome}… Racconta cosa cerchi…» |
| 3 | «… potrai scegliere il servizio più adatto a te, dall'Itinerario su misura all'All Inclusive.» (sempre) | Nomina solo i servizi che il TD ha attivi |
| 4 | «… un preventivo completo, **a costi chiari e senza commissioni nascoste**… **inclusi i voli se lo desideri**.» (sempre) | Senza le due promesse; il passo c'è solo con l'All Inclusive attivo |
| Chiusura | «Quello che paghi per l'Incontro non lo perdi…» | — |

---

## 6. Verso degli assi di Luca

| Chiave | Valore | `assiLato` | Asse | Lato atteso | Esito |
|---|---|---|---|---|---|
| `controllo` | 2 | poco controllo | `planning_involvement` | 1-2 = `label_min` «Poco controllo» | ✅ |
| `ritmo` | 3 | dynamic | `pace` | 3-4 = `label_max` «Dynamic» | ✅ |
| `scomodita` | 4 | wild | `comfort_wild` | 3-4 = `label_max` «Wild» | ✅ |
| `luogo` | 1 | estetica curata | `curated_vs_real` | 1-2 = `label_min` «Estetica curata» | ✅ |
| `sociale` | 3 | socialità | `social_orientation` | 3-4 = `label_max` «Socialità» | ✅ |
| `conChi` | Viaggiatore solo, Coppia | — | `companions` | valori 1 e 2 | ✅ |

Il confronto con `assiLato` è senza maiuscole («poco controllo» contro «Poco
controllo»).

---

## 7. Campi ❓ (non li indovino)

1. `livello` / `topDestinazioniId` → `level` (§ 0.1). **Blocca la fase 1.**
2. `cardSfondo`: a cosa serve? Nel tool non lo usa nessuna delle tre pagine;
   l'ho messo in `background_photo_url`, che è pubblica ma non usata.
3. `accompagnatore` vuoto: «nessuno» o «il TD stesso»? (D-17)
4. `accontoSaldoCancellazione` per voce: sono le condizioni vere del TD (Luca
   scrive rate e prezzi per partenza). Le conservo chiuse; il team le deve
   leggere? Sono in contrasto col testo XPETIS del tool.
5. `notaXpetis`: da Luca sembra una nota di ricerca sul prezzo, scritta da
   XPETIS e non dal TD. La tengo chiusa: confermi?
6. `sessioneDurata`: il tool permette solo 90? (D-10)
7. `membro`: `"1"` per Luca e Dennis. Lo ignoro (D2), ma non so se sia un
   anno o un indicatore di stato.
8. `dettaglio.date[].stato = ""`: lo leggo come «aperta, nessuna etichetta».
9. Prova a secco e archivio: il prompt dice «senza `--scrivi` non scrive
   niente» e insieme prevede l'esito «prova» nell'archivio. Default: la prova
   a secco **non scrive nemmeno l'archivio** e stampa soltanto. Va bene?

---

## 8. Cosa propongo di fare dopo il tuo via (fase 1)

1. Tassonomia: dieci paesi nel JSON, `statistics` contate (139 · 254 · 188),
   seed rigenerato, `LOCATIVO_IRREGOLARE` per le cinque isole, prova nuova in
   `PIANO.md` (numerazione dalla 147).
2. Migration 0052-0055, righe di `app_config`, harness con le asserzioni.

Le domande che restano aperte (§ 11 del prompt) le scrivo in `PIANO.md` in
fase 6, con le risposte che arriveranno da qui.
