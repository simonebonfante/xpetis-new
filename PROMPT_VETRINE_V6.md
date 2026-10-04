# Prompt per Claude Code — Vetrine v6: struttura dati dei TD, import e tre pagine

*Versione 2, 3 ottobre 2026. Sostituisce la versione 1 dello stesso giorno.
Da incollare in Claude Code così com'è.*

---

## 1. Il compito

Il tool vetrina v6 di Andrea e Alessandro (`xpetis-vetrine-tool/`) è il modo in
cui i Travel Designer compilano la vetrina. Esporta un pacchetto: `vetrina.json`
(formato `vetrina-xpetis-v6`) più la cartella `images/`.

Tre lavori, in quest'ordine:

1. **Schema**: i dati dei TD devono contenere tutto quello che il v6 raccoglie,
   ognuno nel posto giusto e con la visibilità giusta. Più **dieci paesi nuovi**
   nella tassonomia.
2. **Importatore**: dal pacchetto del tool al nostro database, rilanciabile.
3. **Tre pagine** — vetrina, dettaglio itinerario pronto, dettaglio viaggio di
   gruppo — **ricostruite nel nostro codice con l'aspetto delle pagine del
   tool**.

Dal tool si prende **solo l'aspetto grafico**. Il codice è nostro: niente copia
di `src/components/vetrine/`, niente `markup/*.tsx`, niente componenti che
ricevono il JSON intero. Prenotazione, Cal.com, cassa e login restano quelli
che abbiamo.

**Non partire a scrivere.** Prima la fase 0 (lettura e piano), poi fermati e
mostrami il piano. Ogni fase successiva parte solo al mio via.

---

## 2. Le decisioni già prese (non riaprirle)

### Prese da Simone il 3 ottobre 2026

| # | Decisione | Cosa vuol dire nel codice |
|---|---|---|
| D1 | **Ricostruiamo noi**, dal tool solo l'aspetto | Per queste tre pagine il riferimento visivo è `xpetis-vetrine-tool/riferimento/pagine_tool/`, non più i nodi Figma `72-48`, `3-1386`, `3-1121`. Forma dal tool, comportamento e contenuto dal Flusso, come sempre |
| D2 | **Stelline e «Membro XPETIS»: solo dati veri** | Voto **solo dalle recensioni verificate** (`reviews`, milestone 8), mai da quelle dichiarate dal TD. Soglia in `app_config`: `showcase_rating_min_reviews = 1` (**confermata**). Oggi nessuno ha recensioni verificate, quindi il voto oggi non esce. Anzianità dagli anni compiuti da `joined_at`; se sono zero il blocco non esce. I campi `membro` e `rating` del JSON si ignorano |
| D3 | **Le recensioni scritte dal TD si mostrano, con una dicitura** | Una riga sopra le recensioni dice che le ha raccolte il designer (testo in `app_config`, prima stesura tua, da riscrivere a Gaia). La vista le espone con `source = 'td_declared'`; con la milestone 8 arriveranno le `xpetis_verified` senza cambiare la pagina. Le stelle della singola recensione si vedono, **non fanno media**. ⚠️ Il tool scrive sotto ogni recensione «Viaggiatore XPETIS da N anni» (e se `anni` manca mette 1): **su quelle dichiarate non esce**, non sono viaggiatori XPETIS |
| D4 | **«Il secondo Incontro, con un altro Travel Designer, è gratis» si toglie** | Non è una promessa decisa. Non si costruisce, nemmeno spenta |
| D5 | **`suMisuraPrezzo` è il prezzo di partenza dell'Itinerario su misura** | Va sul servizio `custom_itinerary` del TD e in pagina esce come «da 70€» sul riquadro «Itinerario su misura» di «E dopo l'incontro?» (come nel tool). **Non è il prezzo che si incassa**: quello resta `orders.proposal_price_cents`, scritto dal TD nella proposta. Vedi fase 1 per dove metterlo |
| D6 | **I 10 paesi del tool che noi non abbiamo si aggiungono** | Fase 1, prima dell'importatore |
| D7 | **`frasiCard` restano solo per noi** | Nel nostro sito non c'è nessun posto che le usi (verificato: zero riferimenti in `app/`, `components/`, `lib/`). Si conservano chiuse, mai in una vista. Nota per il futuro: hanno la forma di **mattoncini personali della frase della card** (`asse_*`, `geo_*`, `punta_<paese>`, `chiusura`), mentre quelli di `lib/frase.ts` sono generici e li scrive Gaia. Se un giorno si vorranno frasi personali, i dati ci sono |
| D8 | **`nomeProfessionale`, quando c'è, sostituisce `nome` in pagina** | `display_name` = `nomeProfessionale` se valorizzato, altrimenti `nome`. Il `nome` anagrafico si conserva in una colonna chiusa per il team. Nelle frasi «Personalizzalo con…», «Parlane con…», «Prenota l'Incontro con…» il tool usa il primo nome: con un nome professionale (es. «Pianeta Ferra») si usa **intero**, non la prima parola |

### Già nel progetto, e valgono qui

| # | Regola | Cosa vuol dire qui |
|---|---|---|
| R1 | **Il prezzo esiste in un posto solo** | In pagina ogni prezzo di consulenza viene da `td_services.price_cents`, mai da testo fisso (il tool scrive `30€` per tutti) |
| R2 | **Il credito consulenza si promette e non si quantifica** | Le frasi del tool «I 30€ dell'Incontro verranno scalati dal costo del servizio…», «i 30€ si scalano dal viaggio», «I 90€ della Sessione verranno scalati dall'All Inclusive» sono tutte fuori regola. Si usa la riga del credito che le nostre pagine hanno già (`app/designer/[slug]/page.tsx`, `components/dopo-la-call.tsx`). Prezzo e durata dell'Incontro si possono mostrare, il credito no |
| R3 | **Slug stabili, mai indici** | Il tool linka `/itinerari/1`, `/gruppi/3`. Restano gli indirizzi di oggi: `/designer/<td>/itinerario/<slug>` (0033) e `/designer/<td>/viaggio-di-gruppo/<slug>` (0051). Un link vecchio dà 404, mai un altro viaggio |
| R4 | **Niente «Iscriviti», niente «Acquista il posto»** | Header e footer sono i nostri; quelli del tool non si usano |
| R5 | **Mobile first** | Il tool ha solo il desktop a 1512 px e sotto rimpicciolisce tutto (`Scala.tsx`). Da noi niente zoom: il disegno del tool vale da `lg` in su; sotto, una colonna con lo stesso ordine dei blocchi. Il design mobile vero arriverà: tieni i blocchi componibili |
| R6 | **I nostri token di colore** | `primario`, `scuro`, `crema`, `neutro` in `app/globals.css`, non i colori inline del tool. Un colore del tool senza corrispondente si **segnala**, non si aggiunge. `scripts/controlla-classi-morte.mjs` resta verde |
| R7 | **Il client non parla con le tabelle** | Il browser legge solo viste `public_*`. Prima di ogni vista o grant: cosa diventa leggibile con gli strumenti di sviluppo aperti? |
| R8 | **Nessun numero né testo di prodotto nel codice** | Soglie, note di prezzo e testi XPETIS fissi vanno in `app_config` |

### ⚠️ Correzione rispetto alla versione 1 di questo prompt

La versione 1 diceva che `callPrezzo` non imposta il prezzo della breve.
**Era sbagliato.** La deviazione 10 fissa la *durata* della breve a 30 minuti,
non il prezzo: il prezzo è per designer, e il form lo raccoglieva già
(`MAPPATURA_VETRINA.md`, 0024). Quindi `callPrezzo` → `price_cents` della
`consultation`, `callPrezzoLibero` → `price_is_custom`.

---

## 3. Fase 0 — Lettura e piano (poi ti fermi)

### Da leggere

1. `CLAUDE.md`, `PIANO.md` (milestone 1 «Import dei dati reali» e il blocco
   «Vetrine v6» appena sopra l'importatore; la tabella delle deviazioni, in
   particolare 9 e 10).
2. **Lo schema com'è oggi.** Molto esiste già: la regola è *estendere*, non
   ricreare.
   - `travel_designers` (0007 + `hero_bio`, `manifesto`, `instagram_handle`,
     `years_experience`, `legal_coverage`, `group_trips_readiness`);
   - `td_countries` (+ `areas_note`, `custom_themes`, `typical_budget`,
     `typical_duration`), `td_destination_tags`, `tags`;
   - `td_axis_values`, `quiz_axes` (`label_min`/`label_max`), e come sta oggi
     `companions` (0021);
   - `td_services` (0007, 0024, 0037-0038, 0045, 0048: vincolo
     `td_services_bookable_complete`, unicità `(td_id, cal_event_type_slug)`,
     blocco di pubblicazione su slug fuori elenco) e `td_service_bullets`;
   - `td_signature_trips` + `td_signature_trip_images` (0025);
   - `td_ready_itineraries` (0026, slug 0033), `td_group_trips` (0048, slug
     0051);
   - `td_showcase_reviews` (le dichiarate: c'è già), `reviews` e
     `td_review_stats` (verificate, milestone 8);
   - `public_td_showcase`, `td_publish_blockers()`, `match_designers()`,
     `public_config`;
   - `xpetis_destinazioni_v2.json`, `supabase/scripts/genera_geo.mjs`,
     `supabase/seed/0002_geo.sql`.
3. `supabase/MAPPATURA_VETRINA.md` (scritta sul form vecchio: da riscrivere in
   fase 6).
4. **Il formato v6**: `xpetis-vetrine-tool/src/components/vetrine/tipi.ts`,
   `normalizza.ts`, `vista.ts`, `costanti.ts`, `stati.ts`; `LEGGIMI.md` e
   `LEGGIMI_SIMONE.md`; il pacchetto **`vetrina-luca-ferraina/`**, dove Simone
   ha compilato **tutti** i campi. I TD veri ne avranno meno: zero itinerari,
   zero gruppi, zero recensioni, niente Sessione sono casi normali.
   `vetrina-dennis-milello/` e `vetrina_nuova.json` sono nel **formato
   vecchio**: servono solo a provare il rifiuto.
5. **Il riferimento visivo**: `xpetis-vetrine-tool/riferimento/pagine_tool/`
   (`vetrina.html`, `itinerario.html`, `gruppo.html`, `css/xpetis-pagine.css`)
   e `riferimento/schermate/`. Attenzione: quelle pagine sono in **modalità
   anteprima**, con testi d'esempio (Francesca, Chiara, Marco…) e pillole
   «Esempio · informazione mancante»: non sono contenuto.
6. Il codice di oggi: le tre route in `app/designer/[slug]/…`,
   `lib/vetrina.ts`, `components/box-servizio.tsx`,
   `components/prenota-consulenza.tsx`, `components/dopo-la-call.tsx`,
   `components/recensioni-vetrina.tsx`, `lib/cal-embed.ts`, `lib/frase.ts`. La
   vetrina di oggi viene dallo stesso Figma del tool: molto è già al suo posto,
   e i commenti in testa a `page.tsx` dicono cosa manca e perché.
7. `node_modules/next/dist/docs/` per le API di Next 16 che usi;
   `.agents/skills/supabase-server/` prima di creare client Supabase.

### Cosa mi consegni, e poi ti fermi

1. **La tabella di mappatura completa**: ogni chiave del `vetrina.json` di Luca
   (anche quelle dentro `paesi[]`, `itinerari[].dettaglio`, `gruppo[]`,
   `recensioni[]`) → destinazione (colonna esistente / colonna nuova / tabella
   nuova / solo archivio) e **categoria** (pubblico / match / solo team /
   archivio). Nessuna chiave senza riga.
2. Le migration che intendi scrivere, con i nomi.
3. Per ciascuna delle tre pagine: i blocchi (sezione 7 qui sotto) con la
   sorgente di ogni dato.
4. **L'elenco delle differenze fra il tool e il Flusso**: ogni comportamento o
   contenuto che il tool ha e il Flusso (o il codice di oggi) no, o viceversa.
   Per ciascuno, cosa faresti di default — e il default è **il Flusso, o
   quello che c'è oggi**. Ne ho già visti sette, verifica e aggiungi:
   - **pannello «Dopo la sessione, hai già un itinerario completo!»**: nella
     linguetta Sessione il tool mostra solo All Inclusive e Viaggio privato
     (`SERVIZI_DOPO` in `costanti.ts`, modifica del tool del 29 settembre);
   - **«Acconto, saldo e cancellazione»** su tutti i viaggi di gruppo: un
     testo XPETIS fisso con acconto 30%, penali e rimborso sotto il minimo
     (`ACCONTO_SALDO_CANCELLAZIONE` in `costanti.ts`, «decisione del 17 set»
     del tool). È una promessa commerciale. Default: **costruito, testo in
     `app_config`, riga vuota = blocco che non esce**, finché Simone non
     conferma;
   - **«a persona, calcolato su 2 persone»** davanti al prezzo degli itinerari
     (fisso nel tool): default in `app_config`, accanto alla nota esistente
     `ready_itinerary_price_note`;
   - **il cuore ♥** sulle card degli itinerari: non esiste una funzione
     «preferiti». Default: non si disegna un comando che non fa niente;
   - **«Anni di esperienza»**: il tool mostra una fascia («5-10 anni»), oggi
     noi il numero;
   - **«Aree di competenza»**: il tool mostra il testo libero `competenze`,
     oggi noi l'elenco dei paesi;
   - **i testi** di «Come funziona» e dei riquadri «E dopo l'incontro?»
     diversi dai nostri: elencali affiancati.
5. Ogni campo di cui non sei sicuro del significato, segnato ❓. **Non
   indovinare.**

---

## 4. Fase 1 — Schema e tassonomia (migration 0052 e seguenti)

### 4.1 Le tre categorie

Ogni campo del v6 ha una casa, e la casa dice chi lo può leggere.

| Categoria | Campi | Dove |
|---|---|---|
| **Pubblico** | `nomeProfessionale`/`nome` (D8), `competenze`, `esperienza`, `lingue`, `instagram`, `fotoProfilo`, `storia`, `viaggiarePerMe`, `callDescrizione`, `callPunti`, `sessione*`, `suMisuraPrezzo` (D5), `servizi`, `viaggi[]`, `itinerari[]`, `gruppo[]` (con il `dettaglio` tranne le eccezioni sotto), `recensioni[]` | colonne e tabelle esposte da viste `public_*` |
| **Chiuso, serve al match** | `paesi[]` (livello, aree, temi, temiCustom, contesti, durata, budget), `topDestinazioniId`, `assi` | tabelle esistenti, **mai in una vista pubblica** |
| **Chiuso, solo team** | `nome` quando c'è `nomeProfessionale`, `coperturaLegale`, `gruppoHaGia`, `gruppoTempi`, `notaXpetis` (in ogni `dettaglio`), `accontoSaldoCancellazione` (in ogni `dettaglio`), `frasiCard` + `frasiCardStato` (D7), `assiLato` (serve solo alla controprova) | colonne che nessuna vista espone, leggibili da Studio |
| **Solo archivio** | `formato`, `brand`, `membro`, `rating`, `callPrezzoLibero` se già mappato altrove, `topDestinazioni` (nomi, c'è l'id), `cardSfondo` se non trova posto, qualunque chiave futura che non conosci | il JSON grezzo nell'archivio dell'import |

`heroBio` e `manifesto` (vuoti per Luca) hanno già una colonna: mappali lì, e
dimmi in fase 0 se il tool li mostra (secondo `vista.ts` no).

### 4.2 Cosa serve, campo per campo

I nomi esatti li proponi tu in fase 0.

**Profilo** (`travel_designers`)
- `display_name` secondo D8; colonna chiusa per il nome anagrafico.
- `competenze` → testo pubblico (nuova colonna se `headline` ha un altro
  senso: guarda come è usata oggi).
- `viaggiarePerMe` → nuova colonna pubblica.
- `esperienza` (numero scritto dal TD) → `years_experience`; non parsabile →
  report.
- `lingue` (stringa con virgole) → `languages text[]`, una per elemento,
  spazi tolti.
- `instagram` → `instagram_handle` (senza `@` iniziale, o con: guarda la
  convenzione di oggi).
- `fotoProfilo` → `photo_url`; `cardSfondo` → `background_photo_url`.
- `coperturaLegale` → `legal_coverage`; `gruppoHaGia`, `gruppoTempi` →
  `group_trips_readiness` o colonne chiuse a fianco (chiusi comunque).
- `frasiCard`, `frasiCardStato` → colonne `jsonb` chiuse (D7).

**Paesi** (`td_countries` e figli)
- `id` → `country_code`, deve esistere in `geo_countries` (dopo il 4.3).
- `livello` `"Base"`/`"Esperto"` → `level`: **verifica in
  `MAPPATURA_VETRINA.md` e nel match quale numero è quale**, non dedurlo.
- `aree` → `areas_note`; `temiCustom` → `custom_themes`; `durata`, `budget` →
  `typical_duration`, `typical_budget`.
- `temi`, `contesti` → `td_destination_tags`. Le etichette devono combaciare
  **carattere per carattere** con `tags` (es. `Aree estreme/polari`,
  `Cultura, arte e storia`): una che non combacia va nel report, non si
  scarta.
- `topDestinazioniId` (tre id) → se oggi non c'è un posto per «le destinazioni
  in evidenza», proponilo (es. `td_countries.highlight_position`).

**Assi** (`td_axis_values`)
- Chiavi del tool → nostre: `controllo` → `planning_involvement`, `ritmo` →
  `pace`, `scomodita` → `comfort_wild`, `luogo` → `curated_vs_real`,
  `sociale` → `social_orientation`, `conChi` → `companions`. **Verifica tu la
  corrispondenza leggendo le etichette**, non fidarti di questa riga.
- **Il verso si legge da `quiz_axes.label_min` / `label_max`, mai dal nome.**
- `assiLato` (il polo scelto, in parole: `"poco controllo"`, `"dynamic"`,
  `"wild"`, `"estetica curata"`, `"socialità"`) è la **controprova**: un valore
  1-2 deve stare dal lato `label_min`, 3-4 dal lato `label_max`. Se non torna,
  l'import di quel TD si ferma con l'asse e i due valori.
- `conChi` (elenco di etichette) → come oggi `companions`.

**Servizi** (`td_services` + `td_service_bullets`)
- **Incontro** → `consultation`, slug `consulenza-xpetis-30`, durata 30.
  `callPrezzo` → `price_cents` (testo libero: `"30"`, `"30€"`, `"20"`; quello
  che non sai parsare va nel report, non si indovina). `callPrezzoLibero` →
  `price_is_custom`. `callDescrizione` → `text_during_call`, `callPunti` →
  bullet.
- **Sessione approfondita** (`sessioneOfferta = true`) → `consultation_deep`.
  `sessioneDurata` (`"90 minuti"`) deve dare **60 o 90** → slug
  `consulenza-xpetis-60` / `-90` (deviazione 10); un'altra durata ferma quel
  servizio con un messaggio. `sessionePrezzo` → `price_cents`.
  `sessioneDescrizione`, `sessionePunti` → testo e bullet.
- **Servizi dopo la call** (`servizi[]`), le quattro stringhe di
  `SERVIZI_DOPO` in `costanti.ts`: `Itinerario su misura` →
  `custom_itinerary`, `Itinerario su misura ALL INCLUSIVE` → `all_inclusive`,
  `Viaggio di gruppo a tua firma` → `group_trip`, `Accompagnamento privato /
  presenza sul posto` → `private_guiding`. Una stringa sconosciuta → report.
- **`suMisuraPrezzo`** (D5) → prezzo di partenza del `custom_itinerary`.
  **Ti consiglio una colonna a sé** (es. `price_from_cents`, ammessa solo sui
  servizi dopo la call) invece di `price_cents`: su `consultation`
  `price_cents` è l'importo che la cassa incassa, e la stessa colonna con un
  significato diverso è l'errore che qualcuno farà fra sei mesi. Decidi tu e
  scrivi il perché nel commento della colonna. Nessun vincolo fra questo prezzo
  e quello della proposta (non è deciso).
- Rispetta `td_services_bookable_complete` nella forma attuale (leggi
  l'ultima migration che lo tocca).

**Viaggi firma** (`viaggi[]`, massimo 3) → tabelle 0025. `titolo`,
`descrizione`, `paesi` (uno solo: aggiungi la colonna se manca), `imgs[]`
ordinate.

**Itinerari pronti e viaggi di gruppo** — nel v6 hanno **la stessa forma**
(`Voce` + `Dettaglio` in `tipi.ts`). Oggi da noi hanno titolo, durata, prezzo e
una foto. Servono:
- sulla voce: `prezzo` (testo libero, resta testo), `giorni`, `intro`,
  `notti`, `prezzoNote`, `tappePrincipali[]`, `quotaComprende[]`,
  `quotaNonComprende[]`, `cosaPortare[]`, `infoSanitarieVisti`,
  `puntiFaPerMe` (sei chiavi `natura, trekking, onTheRoad, city, cultura,
  chill`, interi 0-5, con vincolo), `notaXpetis` (chiusa),
  `accontoSaldoCancellazione` (chiusa: in pagina non esce mai il testo del TD,
  vedi fase 0 punto 4);
- **più foto** per voce (`foto[]`; la prima è la copertina, `img` la duplica);
- **più paesi** per voce (`paesi[]`, FK su `geo_countries`);
- le **tappe** (`tappe[]`: `giorni`, `titolo`, `descrizione`, in ordine);
- solo gruppi: le **partenze** (`date[]`: `dal`, `al` come `date`, `stato` fra
  `''`, `confermato`, `ultimiPosti`, `soldOut`), `partecipantiMin`,
  `partecipantiMax` (interi se parsabili, altrimenti report), `fasciaEta`,
  `accompagnatore`.

Tabelle figlie separate per itinerari e gruppi, oppure condivise con due FK
annullabili e `check (num_nonnulls(...) = 1)` (lo schema lo fa già in
`reviews`): scegli e scrivi il perché nel README. Le colonne testuali vecchie
di `td_group_trips` (`dates_label`, `group_size_label`) sono superate: dimmi in
fase 0 se le togli o le lasci deprecate.

**Recensioni dichiarate** (`td_showcase_reviews`) ← `recensioni[]`: `titolo`,
`nome`, `stelle`, `data` (testo, resta testo), `testo`, `anni` se presente
(conservato, non mostrato: D3). `is_published` nasce `false`: all'import
diventano `true`, sono parte della vetrina che il TD ha consegnato.

**Archivio dell'import** (es. `td_import_runs`): TD, origine (cartella),
`formato`, **il JSON grezzo intero** (`jsonb`), il report, esito (prova /
scritto / rifiutato), data. Chiuso: RLS, `revoke all … from anon,
authenticated`, in nessuna vista.

**`app_config`**, righe nuove (categoria `showcase`), ciascuna con la nota su
chi l'ha decisa:
- `showcase_rating_min_reviews` = `1` (Simone, 3 ottobre);
- `showcase_declared_reviews_note`: la dicitura delle dichiarate (prima stesura
  tua, «da riscrivere a Gaia»);
- `ready_itinerary_price_prefix` = `a persona, calcolato su 2 persone` (dal
  tool, da confermare);
- `group_trip_terms_text`: il testo acconto/saldo/cancellazione del tool,
  **vuoto** finché Simone non conferma.
La nota esistente `ready_itinerary_price_note` resta il ripiego **solo per gli
itinerari**: sui gruppi niente ripiego (un gruppo coi voli inclusi, come
l'Islanda di Luca, si troverebbe scritto «volo non incluso»).

### 4.3 I dieci paesi nuovi (D6)

La lista del tool (`stati.ts`, 139 paesi, di Alessandro) contiene la nostra
(129) più dieci. Si aggiungono a `xpetis_destinazioni_v2.json`, sotto la
macro-area che `stati.ts` indica:

| id | Nome | Macro-area |
|---|---|---|
| `andorra` | Andorra | Europa Sud |
| `angola` | Angola | Africa Sub-Sahariana |
| `eritrea` | Eritrea | Africa Sub-Sahariana |
| `gambia` | Gambia | Africa Sub-Sahariana |
| `bangladesh` | Bangladesh | Asia Centrale e Subcontinente Indiano |
| `antigua_e_barbuda` | Antigua e Barbuda | Centro America e Caraibi |
| `barbados` | Barbados | Centro America e Caraibi |
| `saint_lucia` | Saint Lucia | Centro America e Caraibi |
| `saint_vincent_e_grenadine` | Saint Vincent e Grenadine | Centro America e Caraibi |
| `sint_maarten` | Sint Maarten | Centro America e Caraibi |

- Stessa forma dei paesi piccoli che ci sono già (vedi `senegal`, `nepal`):
  `type: "state"`, `selectable: true`, **una** regione `foreign_region` con lo
  stesso id e nome, **nessuna città** (le 188 le ha scelte Alessandro: non se
  ne aggiungono).
- Aggiorna `statistics`: **139 stati, 254 regioni**, città invariate (188).
  Ricontrolla i numeri contando, non a mano.
- Rigenera `0002_geo.sql` con `genera_geo.mjs`. L'harness prende i numeri
  attesi dal file: verifica che resti verde per la ragione giusta.
- **Confronta anche gli altri 129**: id, nome e macro-area di `stati.ts`
  contro il nostro JSON. Una differenza va nel report di fase, non si corregge
  di iniziativa.
- `lib/frase.ts`, `LOCATIVO_IRREGOLARE`: il default «in» va bene per Andorra,
  Angola, Eritrea, Gambia, Bangladesh; per le isole proponi «ad Antigua e
  Barbuda», «alle Barbados», «a Saint Lucia», «a Saint Vincent e Grenadine»,
  «a Sint Maarten», segnate da rivedere a Gaia.
- In `PIANO.md` scrivi una prova nuova per il seed con i dieci paesi (atteso
  dopo il seed: **6 · 14 · 139 · 254 · 188**) e il comando con cui Simone lo
  applica al database vero. Non toccare le prove 109-114 già fatte: sono la
  storia della v2. **Il seed non lo esegui tu.**

### 4.4 Regole su ogni migration

- Tabella nuova: RLS accesa **e** `revoke all on <tabella> from anon,
  authenticated` esplicito.
- Migration nuove, mai modificare quelle applicate.
- Funzioni con estensioni: `search_path = public, extensions`.
- **Viste**: estendi `public_td_showcase` o aggiungi viste `public_*` per i
  dettagli. Sopra ogni vista, un commento che elenca **colonna per colonna
  cosa diventa leggibile** con gli strumenti di sviluppo aperti. In nessuna
  vista: livelli, assi, `assiLato`, copertura legale, prontezza ai gruppi,
  note XPETIS, acconto/saldo del TD, `frasiCard`, nome anagrafico, archivio.
  Il voto esce già calcolato e solo sopra soglia; mai i conteggi grezzi se
  non servono.
- Esponi `joined_at` solo come anni compiuti, non la data.
- `td_publish_blockers()`: aggiungi i buchi veri (Sessione offerta con durata
  non ammessa, prezzo della breve mancante). **Non** rendere bloccante ciò che
  il tool tratta come facoltativo.
- **Harness**: un'asserzione per ogni vincolo e per ogni vista, in
  particolare che `anon` non legge nessuna colonna chiusa.
  `cd supabase && npm run test:schema` resta verde.

---

## 5. Fase 2 — L'importatore

Uno script Node in `supabase/scripts/` (es. `importa_vetrina.mjs`) che Simone
lancia a mano in locale. **Non** una route del sito.

**Ingresso**
- La cartella di un pacchetto (`vetrina.json` + `images/`) e `--slug
  <slug-del-td>`, **obbligatorio**: non lo ricavi dal nome della cartella né
  dal nome del TD.
- Per un TD che non esiste ancora serve `--email` (colonna `not null`, il JSON
  non la contiene).
- **Solo `formato = "vetrina-xpetis-v6"`.** Senza `formato` (Dennis, Stella):
  «formato vecchio: riesportalo dal tool v6». Niente secondo parser.
- Chiavi da variabili d'ambiente (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`), mai
  da file versionati, mai stampate. **Non** costruire la lettura dal Supabase
  del tool (`xpetis-vetrine-td`): per ora solo pacchetti.

**Comportamento**
- **Prova a secco di default.** Senza `--scrivi` non scrive niente e stampa il
  report. Con `--scrivi`, tutto il TD o niente: dimmi come lo garantisci (una
  funzione Postgres che riceve il JSON già validato è la via più pulita).
- **Idempotente.** Rilanciato sullo stesso pacchetto non cambia niente.
- **Su un pacchetto aggiornato** sostituisce il contenuto di vetrina, ma **non
  tocca mai**: `id`, `slug`, `status`, `email`, `phone`, `cal_username`,
  `cal_webhook_ok_at`, `agency_id`, `joined_at` (è lo spareggio del match).
- **Prezzi, durate e slug Cal.com dei servizi**: li scrive al primo import;
  dopo, se il JSON li contraddice, **report e non sovrascrive**. Un prezzo che
  cambia tocca prenotazioni vere: lo applica il team a mano.
- **Non pubblica mai.** Un TD nuovo nasce `draft`.
- **Slug delle voci** secondo 0033 e 0051 (leggile): titolo invariato, slug
  invariato. Una voce sparita dal pacchetto sparisce dal sito, e il suo
  indirizzo dà 404.
- **Voci vuote**: senza titolo si scartano (nel tool non hanno pagina) e vanno
  nel report; un viaggio firma senza titolo e senza foto si scarta in silenzio
  (il tool fa così).

**Foto**
- Nel bucket pubblico `td-media` su percorsi nostri, es.
  `<td-slug>/<profilo|firma|itinerario|gruppo>/<slug-voce>-<n>.<ext>`. Nessun
  pezzo del percorso originale.
- Accetta solo percorsi relativi `images/…`. Un URL assoluto (tipicamente del
  bucket del tool, che ha nel percorso **il codice segreto del TD**) non si
  scarica e non si linka: report.
- File citato e assente: report. Al reimport, le foto che nessuna riga cita più
  si tolgono dal bucket.

**Paesi**
- Ogni `id` (paesi dichiarati, itinerari, gruppi, viaggi firma) deve esistere
  in `geo_countries`. Uno sconosciuto **ferma l'import di quel TD** con
  l'elenco completo.

**Il report** è la «coda di correzione» di milestone 1. Stdout e archivio.
Almeno:
- paesi sconosciuti;
- **tutti i paesi «Base»** (avviso: quel TD non prenderà mai il badge);
- assi in contraddizione con `assiLato`;
- durata della Sessione non ammessa; prezzi non parsabili;
- prezzi o durate che il reimport non ha sovrascritto;
- stringhe di `servizi` sconosciute; etichette di temi o contesti che non
  combaciano con `tags`;
- foto con URL assoluto o mancanti;
- voci scartate perché senza titolo;
- chiavi del JSON che lo script non conosce (finiscono solo nell'archivio).

**Prove obbligatorie da mostrarmi**: `vetrina-luca-ferraina/` a secco (il
report intero); lo stesso con `--scrivi` sul database locale dell'harness o su
PGlite, poi un secondo lancio che non cambia niente; `vetrina-dennis-milello/`
rifiutato.

---

## 6. Fase 3 — Le tre pagine

### 6.1 Architettura

- **Server component** che leggono dalle viste pubbliche e costruiscono un
  oggetto «vista» con solo i campi da disegnare. Ai componenti client
  (linguette Incontro/Sessione, «Carica altre recensioni», fisarmonica di
  «Informazioni utili», galleria «Mostra tutte le foto», frecce dei viaggi
  firma) arrivano solo le props che usano.
- Le **regole di visualizzazione** si ricavano da `vista.ts` e
  `normalizza.ts` (cosa esce quando un dato manca, «Prezzo su richiesta» al
  posto di «A partire da…», formato di date e giorni, «prossima partenza»,
  etichette degli stati): riscrivile in un modulo nostro, tipizzato. Non
  importare file dal tool.
- **Un blocco senza dati non esce**, titolo compreso. Niente segnaposti,
  niente «[da completare]», niente pillole «Esempio».
- La data di oggi per le partenze si calcola **sul server**, a
  `Europe/Rome`.
- Header di sicurezza e caching delle pagine pubbliche: quelli di oggi. Un TD
  non pubblicato dà 404, come oggi.
- `generateMetadata`: titolo, descrizione, immagine per l'anteprima di
  WhatsApp (il tool lo fa con `metadatiVetrina` / `metadatiPagina`).
- Immagini con `alt` sensato (il titolo della voce, il nome del TD).

### 6.2 Vetrina — `/designer/[slug]`

Blocchi nell'ordine del tool, con la sorgente:

| Blocco | Sorgente | Note |
|---|---|---|
| Foto del TD, voto | `photo_url`; voto da D2 | Il voto oggi non esce per nessuno. Icona Instagram sulla foto solo se c'è l'handle |
| Nome | D8 | |
| Aree di competenza, Anni di esperienza, Membro XPETIS, Lingue parlate | `competenze` o paesi (fase 0, punto 4); fascia o numero (idem); anni da `joined_at` (D2); `languages` | Riga senza dato: non esce |
| La storia | `storia` | Paragrafi |
| E dopo l'incontro? | servizi dopo la call attivi | «da X€» solo sul su misura, da D5. Variante «Dopo la sessione»: fase 0 |
| Scheda Incontro / Sessione | `td_services` | Linguetta Sessione solo se c'è un `consultation_deep` pubblicato. Durata, «Videocall», prezzo, descrizione, bullet, «Prenota l'Incontro» / «Prenota la Sessione». **Niente** «secondo Incontro gratis» (D4); credito secondo R2 |
| Cosa vuol dire viaggiare per me + viaggi firma | `viaggiarePerMe`, viaggi firma | Card: paese, titolo, descrizione, foto. Le frecce del tool sono solo disegnate: o funzionano (foto > 1) o non ci sono |
| Come funziona | quello che c'è oggi (`public_config`) | Testi: fase 0 |
| Itinerari pronti da vivere | itinerari | Card: «Personalizzabile», paese, titolo, giorni, «A partire da» prezzo o «Prezzo su richiesta», «Ottieni maggiori informazioni» → slug |
| Viaggi di gruppo | gruppi | Card: paese, titolo, prossima partenza con lo stato, giorni, persone, prezzo → slug |
| Cosa dice chi ha viaggiato con me | dichiarate (D3) + in futuro verificate | Dicitura sopra; tre alla volta, «Carica altre recensioni» |
| Scheda finale «Ti sembra il Travel Designer giusto per te?» | | «Prenota l'Incontro con…», «Torna ai risultati», credito secondo R2 |

**Prenotazione**: i tasti usano **`PrenotaConsulenza`** e `lib/cal-embed.ts`
così come sono (login, guardia su `cal_username` nullo, embed con
`xpetis_user_id`, paracadute «Vai al pagamento»). Il parametro `?servizio=`
continua a funzionare come oggi.

### 6.3 Itinerario — `/designer/[slug]/itinerario/[itinerario]`

| Blocco | Sorgente |
|---|---|
| Briciole «<TD> › Itinerari pronti da vivere › <titolo>» | |
| Titolo, «<TD> · <giorni> · <paesi>» | voce |
| Copertina + «Mostra tutte le foto (N)» | `foto[]` |
| Racconto con la firma «<TD> · Travel Designer XPETIS» | `intro` |
| Le tappe del viaggio | `tappe[]` («Giorno 1», «Giorno 1-3») |
| Questo viaggio fa per me? | `puntiFaPerMe` (tutte a zero: non esce) |
| Vuoi cambiare qualcosa? + «Personalizzalo con…» | testo fisso del tool, credito secondo R2 |
| Riquadro prezzo | «A partire da» `prezzo`; riga = `ready_itinerary_price_prefix` + `prezzoNote` (o, se vuoto, `ready_itinerary_price_note`); Durata da `giorni`; Tappe principali |
| Informazioni utili (fisarmonica) | Cosa portare in valigia, La quota comprende, La quota non comprende, Info sanitarie e visti |
| Altri itinerari di <TD> | fino a tre, esclusa questa |

### 6.4 Viaggio di gruppo — `/designer/[slug]/viaggio-di-gruppo/[viaggio]`

| Blocco | Sorgente |
|---|---|
| Briciole, titolo, «Progettato da <TD> · <giorni> · <paesi>», «Accompagnato da <accompagnatore>» | voce (riga accompagnatore solo se c'è) |
| Foto, racconto, tappe, «Questo viaggio fa per me?» | come l'itinerario |
| Riquadro prezzo | «A partire da» `prezzo`; riga = «a persona» + `prezzoNote` (**nessun ripiego**: 4.2); Partenze (**solo future**, con lo stato); Durata «<giorni> · <notti> notti»; Persone previste da min/max; Fascia d'età |
| «Parlane con…» | prenotazione dell'Incontro, credito secondo R2 |
| Informazioni utili | come l'itinerario, più «Acconto, saldo e cancellazione» **solo se** `group_trip_terms_text` non è vuoto |
| «Prossima partenza» nel riquadro finale | prima partenza futura |
| Altri viaggi di gruppo di <TD> | fino a tre, esclusa questa |

Nessuna partenza futura: la pagina resta, il blocco Partenze non esce (verifica
cosa fa `vista.ts` e dimmi se diverge). Niente «Acquista il posto».

«Personalizzalo con…» e «Parlane con…» portano alla prenotazione
dell'Incontro con lo stesso meccanismo di oggi (oggi
`/designer/<slug>#servizi`). Niente link diretti a Cal.com.

### 6.5 Asset

Font Ronzino e Merriweather li abbiamo. Icone o loghi del tool solo se mancano
da noi, copiati in `public/` (mai linkati al tool) e aggiunti a
`scripts/scarica-asset-figma.sh` se servono anche da lì.

---

## 7. Fase 4 — Dati demo

- Aggiorna i dati demo (Marco Rossi, Giulia Neri) perché popolino la struttura
  nuova: almeno un itinerario completo, un viaggio di gruppo con una partenza
  passata, una futura `ultimiPosti` e una `soldOut`, due recensioni
  dichiarate, un prezzo «da» sul su misura. Uno dei due resta **minimo**:
  senza Sessione, itinerari, gruppi e recensioni.
- **Non rieseguire `0003_demo.sql`** su un database che ha già dati (azzera le
  foto): scrivi un seed nuovo, convergente, e dimmi esattamente cosa devo
  lanciare. Dopo, le foto finte si ricaricano con `0004_foto_finte.sql`?
  Dimmelo tu.

---

## 8. Fase 5 — Verifica (prima di dirmi «fatto»)

- `npm run test:schema` verde, `npm run build` verde, guardia delle classi
  verde.
- **Cosa è leggibile**: con la chiave publishable interroga ogni vista nuova o
  cambiata e mostrami le colonne che restituisce. Nessuna colonna chiusa.
- **Verso degli assi** (milestone 1): per Luca, affiancati `assi`,
  `assiLato` e cosa scriverebbe nel database con `label_min`/`label_max`.
- **Le tre pagine con Luca importato**, a 375 px e a 1512 px: screenshot o
  descrizione blocco per blocco. Con il demo minimo: la vetrina non mostra
  sezioni vuote.
- Un vecchio indirizzo a uno slug sparito dà 404.

---

## 9. Fase 6 — Documenti

- `supabase/MAPPATURA_VETRINA.md` **riscritta per il v6**: campo per campo,
  categoria, destinazione.
- `supabase/README.md`: tabelle nuove e scelte (tabelle figlie, colonna del
  prezzo «da», perché).
- `PIANO.md`, milestone 1: spunta quello che hai fatto e aggiungi **le prove
  numerate per Simone**, proseguendo dall'ultimo numero, nel formato delle
  altre tabelle (cosa fai, cosa deve succedere, note). Devono coprire: seed
  della tassonomia sul database vero; import a secco di Luca; import vero;
  reimport senza cambiamenti; reimport con un prezzo cambiato (report, niente
  sovrascrittura); formato vecchio rifiutato; paese sconosciuto; le tre pagine
  su telefono e desktop con Luca e col demo minimo; slug sparito → 404;
  colonne chiuse invisibili con la chiave publishable. Ogni query scritta per
  intero e **provata** prima (`td_publish_blockers` è una funzione:
  `select slug, status, td_publish_blockers(id) from travel_designers`).
- `CLAUDE.md`: tabella delle pagine (vetrina, itinerario, gruppo →
  «riferimento: tool v6») e struttura del repo (lo script d'import).
- `REGISTRO.md`: la voce della sessione, in cima.

---

## 10. Cosa NON fare

- Copiare codice del tool (componenti, `markup/`, `vista.ts`, `Scala.tsx`,
  stili inline al pixel).
- Passare il JSON del TD, intero o quasi, a un componente client.
- Mettere in una vista le colonne chiuse (4.1).
- Scrivere prezzi, durate, soglie o testi XPETIS nel codice delle pagine.
- Aggiungere città alla tassonomia, correggere differenze fra `stati.ts` e il
  nostro JSON senza dirmelo, decidere i campi ❓, pubblicare TD.
- Leggere dal Supabase del tool o scaricare foto dal suo bucket.
- Costruire la variante «Dopo la sessione», il testo acconto/saldo acceso, il
  cuore ♥ o i testi del tool al posto dei nostri prima che io abbia risposto
  alla fase 0.
- Segreti in un file versionato o in un messaggio.

## 11. Domande che restano aperte (scrivile in `PIANO.md`, non deciderle)

1. Il prezzo della proposta di un su misura può stare sotto il «da» della
   vetrina? Oggi nessun vincolo.
2. Le differenze tool/Flusso elencate in fase 0, punto 4.
3. I testi da riscrivere a Gaia: dicitura delle recensioni dichiarate,
   locativi dei paesi nuovi.
