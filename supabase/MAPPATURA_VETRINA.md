# Mappatura · tool vetrina v6 → schema Supabase

**4 ottobre 2026.** Sostituisce la mappatura del form `Vetrina TD (2).html` (6
agosto 2026, ora in `archivio/MAPPATURA_VETRINA_form_vecchio.md`): dal 3
ottobre i profili dei Travel Designer arrivano dal **tool vetrina v6** di
Andrea e Alessandro, che esporta un pacchetto `vetrina.json` (formato
`vetrina-xpetis-v6`) più la cartella `images/`.

Fonti: `xpetis-vetrine-tool/src/components/vetrine/tipi.ts`, `normalizza.ts`,
`vista.ts`; il pacchetto `vetrina-luca-ferraina/`, compilato in ogni campo. Le
decisioni e le differenze fra tool e Flusso sono in `VETRINE_V6_FASE0.md`.
Chi lo applica: `scripts/importa_vetrina.mjs` (lettura e validazione) e
`td_import_showcase()` nella migration `0055` (scrittura).

## Le quattro categorie

| Cat. | Significa | Dove |
|---|---|---|
| **P** pubblico | Il viaggiatore lo vede | colonne lette dalle viste `public_*` |
| **M** match | Serve al match, il viaggiatore non lo vede mai | tabelle chiuse, solo `match_designers()` |
| **T** solo team | Lo legge il team da Studio | colonne che nessuna vista nomina |
| **A** archivio | Nessuna casa nello schema | `td_import_runs.raw`, il JSON grezzo intero di ogni import |

Il JSON intero va **sempre** in archivio: «A» vuol dire solo che quella chiave
non ha altra casa. Una chiave che lo script non conosce finisce lì e nel report.

## Primo livello

| Chiave | Destinazione | Cat. | Regola dell'import |
|---|---|---|---|
| `formato` | `td_import_runs.format` | A | Solo `vetrina-xpetis-v6`; senza (form vecchio) → rifiutato, «riesportalo dal tool v6» |
| `brand` | — | A | Costante |
| `nome` | `travel_designers.legal_name` | T | Sempre. Va anche in `display_name` se `nomeProfessionale` è vuoto |
| `nomeProfessionale` | `travel_designers.display_name` | P | Vince su `nome` quando c'è (D8) |
| `fotoProfilo` | `travel_designers.photo_url` | P | URL completo (convenzione del seed 0004); file in `td-media/<td>/profilo/` |
| `competenze` | `travel_designers.expertise_areas` | P | Testo libero |
| `esperienza` | `travel_designers.years_experience` | P | Intero 0-70, altrimenti report e vuoto |
| `lingue` | `travel_designers.languages` | P | Spezzata sulle virgole |
| `instagram` | `travel_designers.instagram_handle` | P | Senza `@`; da un URL instagram.com si estrae l'handle |
| `storia` | `travel_designers.bio` | P | Paragrafi a riga vuota |
| `viaggiarePerMe` | `travel_designers.travel_philosophy` | P | «Cosa vuol dire viaggiare per me» |
| `heroBio` | `travel_designers.hero_bio` | P | Il tool non la mostra; la pagina la usa solo se manca `viaggiarePerMe` |
| `manifesto` | `travel_designers.manifesto` | P | Idem |
| `callDescrizione` | `td_services[consultation].text_during_call` | P | Vuota resta vuota (il tool ci metterebbe un testo d'esempio) |
| `callPunti[]` | `td_service_bullets` della breve | P | |
| `callPrezzo` | `td_services[consultation].price_cents` | P | `"30"`, `"30€"`, `"30,50"`; il resto report. **Scritto solo se vuoto**, poi solo report |
| `callPrezzoLibero` | `td_services[consultation].price_is_custom` | P | |
| `suMisuraPrezzo` | `td_services[custom_itinerary].price_from_cents` | P | Il «da» di vetrina (D5), non un importo incassato. Solo se il su misura è fra i `servizi` |
| `sessioneOfferta` | `td_services[consultation_deep].is_active` | P | `false` spegne la Sessione esistente |
| `sessionePrezzo` | `td_services[consultation_deep].price_cents` | P | Come `callPrezzo` |
| `sessioneDurata` | `…duration_minutes` + `cal_event_type_slug` | P | Deve essere fra `app_config.calcom_minutes_consultation_deep` (60, 90) → `consulenza-xpetis-60`/`-90`; un'altra durata ferma quel servizio, con un avviso |
| `sessioneDescrizione` | `td_services[consultation_deep].text_during_call` | P | |
| `sessionePunti[]` | `td_service_bullets` dell'approfondita | P | |
| `servizi[]` | `td_services.is_active` di `custom_itinerary`, `all_inclusive`, `group_trip`, `private_guiding` | P | Le quattro stringhe di `SERVIZI_DOPO`; una sconosciuta → report |
| `viaggi[]` | `td_signature_trips` + `td_signature_trip_images` | P | § Viaggi firma |
| `itinerari[]` | `td_ready_itineraries` + figlie | P | § Itinerari e gruppi |
| `gruppo[]` | `td_group_trips` + figlie | P | § Itinerari e gruppi |
| `recensioni[]` | `td_showcase_reviews` | P | § Recensioni |
| `paesi[]` | `td_countries` + `td_destination_tags` | M | § Paesi |
| `topDestinazioni` | — | A | I nomi; c'è l'id |
| `topDestinazioniId` | `td_countries.highlight_position` (1-3) e livello | M | § Paesi |
| `assi.*` | `td_axis_values` | M | § Assi |
| `assiLato.*` | `travel_designers.axis_sides` | T | La controprova degli assi |
| `frasiCard` | `travel_designers.card_phrases` | T | Non usate dal sito (D7) |
| `frasiCardStato` | `travel_designers.card_phrases_status` | T | |
| `cardSfondo` | `travel_designers.background_photo_url` | P | Già nella vista, oggi nessuna pagina la mostra (❓ a cosa serva) |
| `coperturaLegale` | `travel_designers.legal_coverage` | T | Tre valori chiusi; parole diverse dal form → import rifiutato |
| `gruppoHaGia` | `travel_designers.group_trips_readiness` | T | Idem |
| `gruppoTempi` | `travel_designers.group_trips_timing` | T | Idem |
| `membro`, `rating` | — | A | Voto e anzianità vengono da dati veri (D2) |

Mai toccati dall'import, perché non sono del pacchetto: `id`, `slug`, `status`,
`email` (serve `--email` solo per un designer nuovo), `phone`, `cal_username`,
`cal_webhook_ok_at`, `agency_id`, `joined_at`. Un designer nuovo nasce `draft`.

## Paesi

| Chiave | Destinazione | Cat. | Regola |
|---|---|---|---|
| `id` | `td_countries.country_code` | M | Deve esistere in `geo_countries` (139 stati dal 3 ottobre); uno sconosciuto **ferma il designer** con l'elenco completo |
| `paese` | — | A | Solo controllo: un nome diverso da quello della tassonomia va nel report |
| `livello` | `td_countries.level` | M | **1 se il paese è fra le destinazioni in evidenza oppure è «Esperto», altrimenti 2** (decisione del 3 ottobre). Nel match 1 è il paese forte, quello del badge |
| `aree` | `areas_note` | M | |
| `temi[]` | `td_destination_tags` (tema) | M | Combacia carattere per carattere con `tags.label_it`, altrimenti report |
| `temiCustom[]` | `custom_themes` | M | |
| `contesti[]` | `td_destination_tags` (contesto) | M | Come i temi |
| `durata` | `typical_duration` | M | Cinque valori chiusi |
| `budget` | `typical_budget` | M | Cinque valori chiusi |

Il tool, come il form, **non fa scegliere il livello**: anche chi compila tutto
ha i paesi tutti «Base». Per questo il segnale di rilievo sono le tre
destinazioni in evidenza (`topDestinazioniId`), che diventano livello 1 e
conservano la loro posizione. Tutti «Base» e nessuna in evidenza → il report
avvisa che il designer non prenderà mai il badge e non si potrà pubblicare.

## Assi

La corrispondenza è letta dalle etichette (`quiz_axes.label_min` /
`label_max`), **mai dal nome del codice**:

| Chiave | Asse | 1 = `label_min` | 4 = `label_max` |
|---|---|---|---|
| `controllo` | `planning_involvement` | Poco controllo | Molto controllo |
| `ritmo` | `pace` | Slow | Dynamic |
| `scomodita` | `comfort_wild` | Comfort | Wild |
| `luogo` | `curated_vs_real` | Estetica curata | Vita reale |
| `sociale` | `social_orientation` | Intimità | Socialità |
| `conChi[]` | `companions` | una riga per etichetta di `quiz_axis_options` | |

`assiLato` dice a parole da che parte sta ogni valore: 1-2 deve stare dal lato
di `label_min`, 3-4 da quello di `label_max`. Se non torna, **l'import si ferma**
con l'asse e i due valori.

## Servizi

| Del tool | `service_type` | Durata e slug |
|---|---|---|
| L'Incontro | `consultation` | `app_config.calcom_minutes_consultation` (30) e il primo di `calcom_slugs_consultation` |
| La Sessione approfondita | `consultation_deep` | Dal pacchetto, se fra le durate ammesse; lo slug ammesso che finisce con quel numero |
| Itinerario su misura | `custom_itinerary` | — (`price_from_cents` dal `suMisuraPrezzo`) |
| Itinerario su misura ALL INCLUSIVE | `all_inclusive` | — |
| Viaggio di gruppo a tua firma | `group_trip` | — |
| Accompagnamento privato / presenza sul posto | `private_guiding` | — |

Una breve senza prezzo leggibile nasce **spenta** (il vincolo
`td_services_bookable_complete` non ammette il contrario) e blocca la
pubblicazione con «consulenza breve senza prezzo». Una breve già spenta dal
team l'import non la riaccende.

## Viaggi firma

| Chiave | Destinazione | Regola |
|---|---|---|
| `titolo` | `td_signature_trips.title` | Riconciliazione per titolo. Senza titolo né foto: scartato in silenzio; foto senza titolo: report |
| `descrizione` | `description` | |
| `paesi[0]` | `country_code` | Uno solo, come nel tool |
| `imgs[]` | `td_signature_trip_images` | In `td-media/<td>/firma/` |

Massimo tre, come nel tool.

## Itinerari e gruppi

Nel tool hanno la stessa forma (`Voce` + `Dettaglio`), e qui le stesse colonne
sulle due tabelle più le figlie condivise.

| Chiave | Destinazione | Cat. | Regola |
|---|---|---|---|
| `titolo` | `title` | P | **Chiave della riconciliazione**: stesso titolo, stessa riga, stesso slug, stesso indirizzo. Senza titolo: scartata, report |
| `giorni` | `duration_label` | P | Testo («10», «13 giorni») |
| `prezzo` | `price_label` | P | Testo: è vetrina, non una cassa |
| `img` | — | A | Duplica `foto[0]` |
| `foto[]` | `td_trip_images` | P | In ordine, la prima è la copertina |
| `paesi[]` | `td_trip_countries` | P | Ognuno deve esistere in `geo_countries` |
| `dettaglio.intro` | `intro` | P | |
| `dettaglio.notti` | `nights` | P | Intero, altrimenti report |
| `dettaglio.prezzoNote` | `price_note` | P | |
| `dettaglio.tappePrincipali[]` | `main_stops` | P | |
| `dettaglio.tappe[]` | `td_trip_stops` (`days_label`, `title`, `description`) | P | |
| `dettaglio.quotaComprende[]` | `price_includes` | P | |
| `dettaglio.quotaNonComprende[]` | `price_excludes` | P | |
| `dettaglio.cosaPortare[]` | `packing_list` | P | |
| `dettaglio.infoSanitarieVisti` | `health_visa_info` | P | |
| `dettaglio.puntiFaPerMe.*` | `fit_nature`, `fit_trekking`, `fit_on_the_road`, `fit_city`, `fit_culture`, `fit_chill` | P | Interi 0-5 |
| `dettaglio.notaXpetis` | `xpetis_note` | T | Mai in pagina |
| `dettaglio.accontoSaldoCancellazione` | `td_terms_text` | T | Mai in pagina: sui gruppi esce solo `app_config.group_trip_terms_text`, se non è vuota |
| `dettaglio.date[]` (gruppi) | `td_group_trip_departures` (`starts_on`, `ends_on`, `status`) | P | Date ISO; stato `''`/`confermato`/`ultimiPosti`/`soldOut` → `open`/`confirmed`/`last_seats`/`sold_out` |
| `dettaglio.partecipantiMin` / `Max` (gruppi) | `participants_min` / `participants_max` | P | Interi; min > max → report |
| `dettaglio.fasciaEta` (gruppi) | `age_range` | P | |
| `dettaglio.accompagnatore` (gruppi) | `guide_name` | P | |
| `date`, `partecipanti*`, `fasciaEta`, `accompagnatore` sugli itinerari | — | A | Il tool li ignora sugli itinerari: report se valorizzati |

Una voce sparita dal pacchetto sparisce dal sito, e il suo indirizzo dà 404.

## Recensioni

| Chiave | Destinazione | Cat. | Regola |
|---|---|---|---|
| `titolo` | `td_showcase_reviews.title` | P | |
| `nome` | `author_name` | P | Obbligatorio, altrimenti scartata |
| `stelle` | `stars` | P | 1-5; si vedono sulla singola, non fanno media |
| `data` | `date_label` | P | Testo |
| `testo` | `body` | P | Obbligatorio |
| `anni` | `author_years` | T | «Viaggiatore XPETIS da N anni» su una recensione raccolta fuori da XPETIS non è vero (D3) |

All'import nascono pubblicate (D3); escono da `public_td_reviews` con
`source = 'td_declared'` e una dicitura sopra.

## Le foto

`td-media/<td>/<profilo|firma|itinerario|gruppo>/<impronta>.<ext>`, dove
l'impronta è lo SHA-256 del contenuto (16 cifre). Niente del percorso
originale; lo stesso file ha sempre lo stesso indirizzo, una foto cambiata ne
prende uno nuovo. Solo percorsi relativi `images/…`: un URL assoluto (il bucket
del tool ha nel percorso il codice segreto del designer) non si scarica e non
si linka. jpg, png, webp fino a 15 MB. Al reimport si tolgono dal bucket le
foto che nessuna riga cita più, solo in quelle quattro cartelle.

## Le liste chiuse

Invariate rispetto al form, e da tenere carattere per carattere: temi (9),
contesti (8, «Aree estreme/polari»), con chi viaggi (5), durata tipica (5),
budget tipico (5), copertura legale (3), prontezza ai gruppi (3), tempi dei
gruppi (2). I valori sono nel seed `0001_config.sql` e nei vincoli della
`0022`-`0023`.
