# XPETIS · Schema Supabase

Traduzione in database di *"XPETIS — Il flusso completo"* (16 luglio 2026).
Supabase è l'unica fonte di verità: ogni stato di ogni ordine vive qui, e i
workflow n8n reagiscono alle righe, non a chi le ha create.

## Come applicarlo

Le migration sono numerate e vanno eseguite in ordine. Con la CLI Supabase:

```bash
supabase db reset            # applica migrations/ e poi seed/
```

Oppure a mano, dal SQL Editor, incollando i file in ordine numerico.

## Come verificarlo

C'è un harness che applica tutto su un Postgres 17 in-process (PGlite) e fa
girare una sessantina di asserzioni sui vincoli, le macchine a stati, i token e
la superficie pubblica. Non serve un database vero, non serve Docker:

```bash
cd supabase
npm install
npm run test:schema
```

Va lanciato a ogni modifica delle migration: è il modo più rapido per scoprire
di aver rotto una transizione o aperto per sbaglio una tabella ad `anon`.

> Nota: nella cartella c'è un symlink `node_modules` avanzato dalla sessione di
> sviluppo. Cancellalo prima del primo `npm install`.

## I file

| File | Contenuto |
|---|---|
| `0001_extensions_and_enums.sql` | Estensioni e tutti gli enum (servizi, stati, token, attori) |
| `0002_geo.sql` | Tassonomia geografica + vista `geo_search` per il suggeritore |
| `0003_taxonomy_and_config.sql` | Tag dei filtri, assi del quiz con i pesi, `app_config` |
| `0004_utility.sql` | `set_updated_at()`, `new_access_token()` |
| `0005_travelers.sql` | Viaggiatori (creati dal trigger sul primo login Google), risposte al quiz |
| `0006_agencies.sql` | Anagrafica agenzie All Inclusive |
| `0007_travel_designers.sql` | Profilo TD: paesi con livelli, assi, tag per destinazione, servizi |
| `0008_bookings.sql` | Prenotazioni consulenza + storia degli stati |
| `0009_orders.sql` | Ordini post-call, file, storia, trigger della macchina a stati |
| `0010_order_transitions_seed.sql` | Le transizioni ammesse, una per riga |
| `0011_payments.sql` | Pagamenti Stripe (conto XPETIS e conto agenzia) |
| `0012_access_tokens.sql` | Token e `resolve_access_token()` |
| `0013_reviews.sql` | Recensioni consulenza e viaggio |
| `0014_ops.sql` | Idempotenza webhook, messaggi inviati, alert al team, log |
| `0015_views.sql` | Viste `public_*`, statistiche recensioni, checklist di pubblicazione |
| `0016_rls.sql` | RLS e privilegi |
| `0017_storage.sql` | Bucket di Supabase Storage |
| `0018_match_designers.sql` | `match_designers()` in `SECURITY DEFINER`, e chiusura della superficie pubblica |
| `0019_traveler_views.sql` | `my_bookings` e `my_orders`, senza `cal_booking_uid` |
| `0020_publish_plausibility.sql` | Blocchi e segnalazioni alla pubblicazione di un profilo |
| `0021_axes_aligned_to_form.sql` | Gli assi allineati al verso dichiarato nel form |
| `0022_td_showcase_fields.sql` | Campi di profilo raccolti dal form |
| `0023_td_countries_fields.sql` | Campi che il designer dichiara per ogni paese |
| `0024_services_from_form.sql` | I cinque servizi del form, e i punti dei box |
| `0025_signature_trips.sql` | Viaggi firma e le loro foto |
| `0026_ready_itineraries.sql` | Itinerari pronti da vivere |
| `0027_showcase_reviews.sql` | Recensioni portate dal designer da fuori |
| `0028_public_showcase.sql` | La vetrina completa sulla superficie pubblica |
| `0029_geo_taxonomy.sql` | Le tabelle geografiche allineate alla tassonomia vera |

## La geografia

Il seed `0002_geo.sql` **non si scrive a mano**: lo genera
`scripts/genera_geo.mjs` da `xpetis_destinazioni.json`, che resta la fonte. Se la
tassonomia cambia, si rilancia lo script. L'harness confronta i conteggi nel
database contro le statistiche dichiarate dal file stesso, non contro numeri
copiati: 6 continenti, 14 macro-aree, 129 stati, 244 regioni, 1.220 città.

Tre cose della tassonomia che lo schema provvisorio non prevedeva.

**Non esistono codici ISO.** Ogni voce ha un identificatore testuale
(`corea_del_sud`), e quello è la chiave. `geo_countries.iso3` resta vuoto: va
riempito da una fonte esterna quando servirà, non dedotto dal nome.

**Non tutto è selezionabile.** La tassonomia dichiara che si scelgono come
destinazione le **macro-aree**, gli **stati** e le **regioni italiane**;
continenti, città e regioni estere vivono solo nel suggeritore. È
un'informazione di prodotto e sta nel database (`is_selectable` su ogni
livello), non nel codice del sito. La vista `geo_search` la espone insieme allo
stato a cui ogni voce porta.

**Una città può stare in due regioni.** Jaipur è dentro "India del Nord" e dentro
"Rajasthan", ed è corretto. L'unicità delle città è quindi per regione, non per
stato.

## Il verso degli assi

`quiz_axes.label_min` e `quiz_axes.label_max` contengono gli estremi dichiarati
nel form Vetrina TD. **Il verso di un asse si legge da lì, mai dal nome del
codice.**

La regola nasce da un errore vero. Il mio quinto asse si chiamava `aesthetics`, e
su una scala crescente si legge "più estetica": nel form invece crescere
significa *meno* estetica curata e più vita reale. Chi avesse scritto le
etichette guardando il nome della colonna le avrebbe messe al contrario, un
designer *wild* sarebbe risultato amante del comfort, e nessuna prova tecnica se
ne sarebbe accorta — nel lavoro parallelo di Alessandro due assi su sei erano
invertiti proprio così. Il codice ora è `curated_vs_real` e il verso è un dato.

| Asse | `label_min` (valore 1) | `label_max` (valore 4) |
|---|---|---|
| `planning_involvement` | Poco controllo | Molto controllo |
| `pace` | Slow | Dynamic |
| `comfort_wild` | Comfort | Wild |
| `curated_vs_real` | Estetica curata | Vita reale |
| `social_orientation` | Intimità | Socialità |

`companions` è categoriale a scelta multipla con **cinque** opzioni, non quattro,
e le etichette sono le parole esatte del form: sono quelle stringhe che
arriveranno nei JSON delle vetrine. Vale anche per i tag: "Aree estreme/polari"
con la barra, perché un'etichetta che non combacia carattere per carattere fa
perdere quel tag in silenzio.

## I servizi

Il form ne offre cinque. `group_trip` e `private_guiding` esistono nell'enum
perché il designer li attiva e la vetrina li mostra, ma il vincolo su
`orders.service_type` ammette solo `custom_itinerary` e `all_inclusive`: **nessun
ordine può nascere su di loro.** Il database registra così una decisione di
prodotto ancora aperta — attivabili in vetrina, non ancora acquistabili — invece
di lasciarla a un commento.

Attenzione all'import: nel form il prezzo della consulenza è testo libero (un
designer scrive `"20"`, l'esempio del form `"30€"`). Chi importa parsa e segnala
ciò che non capisce, mai indovina.

## Il contenuto di vetrina

`td_signature_trips` con `td_signature_trip_images`, `td_ready_itineraries` e
`td_showcase_reviews`: una tabella per sezione, righe ordinate da `position` e
uniche per designer. Il vincolo sul titolo non vuoto non è pedanteria: il form
nasce con tre righe di viaggio precompilate e vuote, e senza quel vincolo
finirebbero in vetrina.

Su `td_ready_itineraries.price_label` c'è una deroga consapevole alla convenzione
degli importi in centesimi. Nel form durata e prezzo sono testo libero
(`"5-7 giorni"`, `"850€"`) e sono indicazioni di vetrina: nessun pagamento nasce
da quella riga. La convenzione `*_cents` vale dove passa denaro vero —
consulenze, proposte, acconti, saldi.

`td_showcase_reviews` è **separata da `reviews` e non esposta da nessuna vista**,
con `is_published` che nasce a falso. Il form le chiede come recensioni esterne
("se hai già qualche recensione sul tuo sito"), e tenerle qui lascia intatto il
vincolo che rende impossibili le recensioni finte: su `reviews` ogni riga ha un
ordine vero dietro. Se e come mostrarle si decide alla milestone 8.

`public_td_showcase` serve tutto il resto in un colpo solo: campi di profilo,
paesi coperti per nome, servizi attivi con i punti dei box, viaggi firma con le
foto in ordine, itinerari pronti.

## La ricerca

Regola decisa l'8 agosto 2026, che il database impone:

| Livello | Filtra? | Cosa fa nel suggeritore |
|---|---|---|
| Città | **no** | porta al suo paese |
| Paese | **sì** | — |
| Macro-area | **sì** | suggerisce anche la lista dei suoi paesi |
| Continente | **no** | porta alle sue macro-aree, e da lì ai paesi |
| Regione italiana | **no** | rimandata: come trattarla si deciderà |

`geo_search` è la sorgente unica del suggeritore: per ogni voce dice se filtra
(`is_filterable`), a quale paese porta (`country_code`) e da chi discende
(`parent_ref`, che permette di scendere continente → macro-aree → paesi).

Due flag e non uno, di proposito. `is_selectable` è **cosa dichiara la
tassonomia**; `is_filterable` è **cosa filtra oggi in XPETIS**, ed è quello che
il sito obbedisce. Differiscono su venti righe soltanto — le regioni italiane,
che la tassonomia dichiara selezionabili e che noi per ora non filtriamo — e
l'harness verifica che la differenza sia esattamente quella. Riscrivere il dato
della tassonomia avrebbe cancellato la sua intenzione; così resta leggibile
quando si tornerà a decidere.

## Il match

`match_designers(livello_destinazione, identificatore, quiz, temi, contesti,
limite, offset)` è **l'unica porta verso i dati chiusi dei profili**. Implementa i
sei passi della sezione 2 del Flusso e restituisce: posizione, banda, sezione,
badge, paesi coperti per nome, i due assi più salienti e i temi agganciati. Mai
un punteggio, mai un livello, mai un valore di asse.

La destinazione può essere solo `country` o `macro_area`: passare `city` o
`continent` **solleva un errore**, non viene ignorato in silenzio. La regola di
prodotto vive nella funzione, non nella buona volontà di chi la chiama.

Con una macro-area la banda 2 non esiste: "un altro paese della stessa
macro-area" è già dentro la banda 3, perché è esattamente ciò che l'utente ha
chiesto. Restano tre bande — la macro-area cercata, il resto del continente, il
nulla — e la sezione si chiama `esperti_macro_area`. Il livello che entra
nell'ordinamento è il migliore fra i paesi coperti là dentro, e il badge chiede
almeno un livello 1 dentro quella macro-area.

Sulla frase: per scegliere il frammento di un asse non serve la posizione del
designer. La salienza è `peso × affinità × estremità`, quindi un asse saliente è
per costruzione un asse dove viaggiatore e designer stanno dalla stessa parte: il
frammento si scrive dalla risposta del viaggiatore, che lui già conosce. La
funzione restituisce solo i codici degli assi, e la composizione (concordanze,
articoli, tre varianti scelte con un hash stabile dell'id del TD) avviene nella
route server Next.js.

Avendo spostato il match lato server, dalla superficie pubblica sono caduti anche
i pesi degli assi e i parametri di matching: il browser non ne ha più bisogno.
`public_config` espone solo il gruppo `booking_rules`.

Una interpretazione da confermare con Chiara e Gaia: senza destinazione il Flusso
prevede match forti, resto e un fallback in coda, ma non dice cosa definisce il
fallback. Oggi è chi non aggancia niente, cioè affinità zero.

## La pubblicazione di un profilo

`td_publish_blockers(td_id)` restituisce i motivi che impediscono di pubblicare:
foto o bio mancanti, nessun paese, **nessun paese di livello 1**, assi
incompleti, nessuna consulenza attiva, account Cal.com non collegato. Un trigger
di vincolo li impone: un profilo con tutti i paesi allo stesso livello non si
pubblica, perché sarebbe completo e inutile — non prenderebbe mai il badge e
finirebbe sotto a chiunque.

`td_publish_warnings(td_id)` segnala ciò che non blocca ma fa perdere punteggio:
paesi senza tema o senza contesto (che perdono la rispettiva metà del punteggio
filtri), più di tre paesi di livello 1, assi continui tutti sullo stesso valore,
nessun servizio oltre la consulenza. `td_publish_readiness` mette insieme le due
cose ed è la coda di lavoro del team.

Il trigger è **differito al commit**, perché paesi, assi e servizi arrivano con
INSERT successivi a quello del profilo. In pratica: un profilo nuovo si crea in
`draft` e si porta a `published` quando il resto è dentro.

## Le tre decisioni di fondo

**1. Il client non parla mai con le tabelle.** RLS accesa su tutte le tabelle,
zero policy per `anon`, e nessun privilegio diretto. Il browser legge soltanto
da sei viste `public_*` — vetrina dei TD pubblicati, recensioni pubblicate,
tassonomie, regole di prenotazione, suggeritore geografico — e chiama
`match_designers()` per i risultati di ricerca. Tutto il resto, pagine token
comprese, passa da route server-side con service key. Se domani serve una lettura
nuova dal client, si aggiunge una vista, non si apre una tabella.

L'harness verifica questa proprietà a ogni run, e su tre livelli: che `anon` non
legga nessuna tabella, che le viste esposte siano esattamente quelle previste, e
che **nessuna definizione di vista nomini i valori degli assi, i livelli di
copertura o i parametri di matching.** L'ultima asserzione esiste perché il
principio è già stato violato una volta: la prima versione di
`public_td_profiles` esponeva livelli e assi in JSON.

L'utente loggato legge la propria riga `travelers` (e ne aggiorna nome e
telefono) e, dalle viste `my_bookings` e `my_orders`, le proprie prenotazioni e
ordini. Due policy in tutto, entrambe su `auth.uid()`; le viste filtrano da sé.
`my_bookings` non contiene `cal_booking_uid`: su Cal.com per cancellare una
prenotazione basta quel codice, senza nessuna chiave, quindi è una credenziale e
non esce mai verso il browser.

**2. La macchina a stati vive nel database.** Le transizioni ammesse degli
ordini stanno in `order_status_transitions`, una riga per transizione, e un
trigger le impone. Un workflow n8n scritto male viene fermato qui invece di
produrre un ordine incoerente. Nello stesso trigger vivono i vincoli che il
flusso chiede a parole:

- nessuna proposta All Inclusive verso l'agenzia senza documento, prezzo e agenzia assegnata;
- nessuna proposta su misura senza prezzo e giorni di consegna;
- nessun ordine marcato consegnato senza almeno un file caricato.

Ogni cambio di stato finisce in `order_status_history` (e
`booking_status_history`) con l'attore che l'ha causato: dato che il TD non ha
login, quella riga è l'unica prova di chi ha agito.

**3. Il doppio scatto è impossibile per costruzione.** Cal.com e Stripe
ritentano i webhook, e un workflow n8n rilanciato a mano non deve mandare due
mail né incassare due volte. Tre difese:

- `webhook_events (provider, external_id)` unico: il secondo arrivo dello stesso evento fallisce;
- `payments`: un solo pagamento riuscito per coppia (entità, tipo);
- `outbound_messages (message_kind, entity_type, entity_id, recipient)` unico: il timer che rigira non rimanda la stessa mail.

## Dove stanno i parametri

Niente numeri nel codice. I pesi dei sei assi sono la colonna `weight` di
`quiz_axes`; tutto il resto è in `app_config`, un parametro per riga, tipo
numerico, modificabile a vista da Supabase Studio senza deploy:

- `matching` — 50/50 quiz/filtri, 60/40 tema/contesto, soglia del badge (0.80)
- `booking_rules` — preavviso 12h, orizzonte 30gg, finestra di pagamento 30min, rimborso 24h, limiti di riprogrammazione (5 / 2 / 20 giorni), 15 minuti di attesa in call
- `orders` — silenzio-conferma 48h, revisione 5 giorni, acconto 30%
- `reviews` — buon viaggio 3 giorni prima, recensione viaggio 3 giorni dopo, alert sotto le 3 stelle

Il sito legge i gruppi `matching` e `booking_rules` dalla vista
`public_config`; i parametri operativi restano interni.

## Note sul modello dati

**`public_td_profiles`** è il payload che l'algoritmo di matching carica in una
sola query: un oggetto per TD con paesi e livelli, assi, tag per destinazione e
servizi attivi già aggregati in JSON.

**I tag sono per coppia TD-destinazione**, non sul TD in generale: la chiave
esterna composta verso `td_countries` rende impossibile dichiarare un tag su un
paese che il TD non copre.

**Il credito consulenza** si applica una volta sola per call: un indice unico
parziale su `orders (source_booking_id) where consultation_credit_cents > 0` lo
garantisce. Il valore lo scrive chi crea l'ordine — resta lo spot-check del
team sul prezzo della proposta, come previsto dal flusso.

**Le credenziali Stripe delle agenzie non stanno in `agencies`.** La tabella ha
solo `stripe_account_id` e `stripe_credential_ref`, un puntatore alla
credenziale custodita in Supabase Vault o in n8n. Vedi la decisione aperta più
sotto.

**`td_publish_readiness`** è una vista che dice, per ogni TD, cosa manca prima
di pubblicarlo: foto, bio, account Cal.com, webhook configurato, paesi, assi,
tag, consulenza attiva. Serve al team in onboarding.

## Cosa manca ancora

**La tassonomia geografica.** Le tabelle `geo_*` hanno una struttura
provvisoria e il seed contiene sei paesi finti solo per far girare i test.
Quando arriva il file ufficiale (6 continenti, 14 macro-aree, 129 stati, 244
regioni, 1.220 città) si riallineano le colonne e si scrive lo script di
import.

**Le decisioni ancora aperte, riportate nei commenti del codice:**

| Punto | Dove |
|---|---|
| Le credenziali Stripe per agenzia: Vault, n8n o Stripe Connect | `0006_agencies.sql` |
| L'asse "con chi viaggi" ammette più valori per TD? (oggi sì) | `0007_travel_designers.sql` |
| Le quattro categorie di "con chi viaggi" non sono nel flusso: quelle nel seed sono un'ipotesi | `seed/0001_config.sql` |
| Le etichette delle scale 1-4 degli altri cinque assi (le scrive Gaia) | `seed/0001_config.sql` |
| Cosa fa il sito se nel suggeritore l'utente seleziona un continente o una macro-area | `0002_geo.sql` |
| Foto di sfondo della card: la colonna c'è, la decisione UX no | `0007_travel_designers.sql` |

## Ordine di lavoro suggerito

1. Import della tassonomia geografica (appena arriva il file).
2. Algoritmo di matching sopra `public_td_profiles` e `public_config`.
3. Route server-side delle pagine token (`resolve_access_token` è già pronta).
4. Workflow n8n: Cal.com → `bookings`, Stripe → `payments`, insoluti, timer.
