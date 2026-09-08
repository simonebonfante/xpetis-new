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
girare oltre duecento asserzioni sui vincoli, le macchine a stati, i token e
la superficie pubblica. Non serve un database vero, non serve Docker:

```bash
cd supabase
npm install
npm run test:schema
```

Va lanciato a ogni modifica delle migration: è il modo più rapido per scoprire
di aver rotto una transizione o aperto per sbaglio una tabella ad `anon`.

> Il symlink `node_modules` verso `/tmp` che era finito nel repo per sbaglio è
> stato cancellato l'11 agosto 2026, insieme a questa nota che diceva di
> cancellarlo. `npm install` ora funziona senza preamboli.

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
| `0030_match_by_destination.sql` | Il match accetta anche una macro-area come destinazione |
| `0031_filterable_levels.sql` | `is_filterable`: cosa filtra oggi, accanto a cosa la tassonomia dichiara |
| `0032_orders_ref_seq_owned.sql` | `orders_ref_seq` legata alla sua colonna |
| `0033_ready_itinerary_slug.sql` | Lo slug stabile degli itinerari pronti, e `unaccent_immutable`/`slugify` |
| `0034_app_config_text.sql` | `app_config` accetta anche valori di testo |
| `0035_geo_accent_insensitive.sql` | `name_norm` sulle tabelle geo: "peru" trova "Perù" |
| `0036_tags_for_destination.sql` | La maschera contestuale dei filtri |
| `0037_calcom_webhook.sql` | Il ponte Cal.com → `bookings`: firma, diario, creazione, riprogrammazione, cancellazione |
| `0038_checkout_consulenza.sql` | Una sola cassa aperta per prenotazione, la scadenza in `my_bookings`, il Payment Link non più richiesto |
| `0039_stripe_webhook.sql` | Il ponte Stripe → `payments`/`bookings`: firma con tolleranza, diario, conferma con verifica dell'importo |

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

`td_ready_itineraries.slug` (migration 0033) è l'identificatore stabile di un
itinerario dentro il suo designer, ed è il pezzo di indirizzo che il sito usa.
Nasce dal titolo al primo inserimento e **non si muove più**: il trigger è
`before insert` e non tocca gli UPDATE, quindi correggere un titolo o riordinare
la lista non cambia un link già dato. Prima c'era l'ordinale, e un riordino
faceva rispondere 200 all'itinerario sbagliato. Slug e non uuid perché questi
indirizzi finiscono nei messaggi WhatsApp del post-call, dove un identificatore
si legge o non si clicca.

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

**Quello che la vista non dice, il sito non lo mostra.** Due esempi veri, dalla
vetrina: la riga "Membro XPETIS" del Figma vorrebbe `joined_at`, che qui non c'è,
e la scheda hero elenca le macro-aree mentre la vista dà i paesi. In entrambi i
casi la pagina mostra meno invece di procurarsi il dato altrove — leggere una
tabella con la chiave secret sarebbe lecito ma scavalcherebbe la regola. Se un
campo serve davvero si aggiunge alla vista, con una migration.

Il seed `0003_demo.sql` popola queste tabelle per i due designer finti: senza
contenuto la vetrina renderizza vuota e non si vede se funziona. **Le prove
dell'harness sulle stesse tabelle usano posizioni alte (91, 92) e cercano per
titolo, non per conteggio:** un test che conta le righe si romperebbe ogni volta
che qualcuno aggiunge contenuto al seed.

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

**La ricerca non guarda il nome, guarda `name_norm`** (migration 0035): il nome
senza accenti e in minuscolo, in una colonna *generata* — quindi impossibile da
far divergere. Nessuno scrive "Perù" con l'accento in un campo di ricerca, e
prima di quella colonna "peru" non trovava niente. Due trappole, entrambe
documentate nel file: `unaccent()` è STABLE e va avvolta in
`unaccent_immutable()` prima di poterla usare in una colonna generata, e
`gin_trgm_ops` si risolve alla creazione dell'indice, quindi serve il
`search_path` in testa alla migration.

Il testo digitato lo normalizza il browser (`lib/geo.ts`), la colonna la
normalizza Postgres: sono **due implementazioni**, e l'harness verifica che siano
d'accordo su tutti i 1.613 nomi della tassonomia. Non è teoria — il primo giro ha
trovato nove nomi su cui divergevano (Tromsø, Køge, Helsingør, Hveragerði,
Ísafjörður, Płock, Ostrołęka, Kuşadası): `unaccent` traduce anche le lettere che
non sono "base + segno", e `normalize('NFD')` no.

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

`tags_for_destination(livello, identificatore)` è la seconda porta sui dati chiusi
dei profili, e serve la **maschera contestuale** dei filtri: sulla Bolivia non si
mostra "mare". Restituisce l'unione dei tag dichiarati dai designer **pubblicati**
su quella destinazione — mai chi li ha dichiarati, quindi nessun profilo si
ricostruisce da lì. Come `match_designers()` accetta solo `country` e
`macro_area`, e su una città o un continente solleva. Senza destinazione
restituisce tutti i tag: la regola "senza meta non si maschera" vive nella
funzione, non in un `if` del sito.

## Il ponte Cal.com

`calcom_webhook(p_corpo text, p_firma text)` è tutto il ponte. n8n riceve il
messaggio, gli passa il **corpo grezzo** e la firma, e non guarda dentro:
quattro nodi, nessuna decisione. Il workflow e le istruzioni per reimportarlo
stanno in `n8n/`.

**Perché nel database.** La macchina a stati delle prenotazioni vive già qui,
con i suoi trigger e la sua storia. Un ponte scritto in un grafo di nodi avrebbe
dovuto reimplementarla fuori, senza vincoli e senza prove; qui è versionata come
migration e **rigiocabile sui sette messaggi veri** dall'harness. n8n resta su
questo percorso per le due cose che il database non ha: il log visuale di ogni
messaggio e il retry quando Supabase non risponde.

**La firma si calcola sui byte esatti.** HMAC-SHA256 del corpo grezzo, parola
segreta in Supabase Vault sotto `calcom_webhook_secret` — non in un file
versionato. Un JSON riserializzato dà una firma diversa a contenuto identico, ed
è il punto in cui questi ponti falliscono: il nodo Webhook di n8n ha *Raw Body*
acceso e un nodo Code decodifica i byte, perché nessuna espressione di n8n sa
toccare un buffer. Firma non valida: il messaggio **non entra nemmeno nel
diario**, perché l'indirizzo del webhook è pubblico e una riga per ogni corpo
arbitrario farebbe di `webhook_events` una discarica scrivibile da chiunque.
Il fatto resta comunque leggibile: n8n conserva l'esecuzione.

Scoperta utile e non ovvia: **Cal.com firma il JSON compatto**, e
`JSON.stringify` di un oggetto appena parsato riproduce quei byte. È per questo
che le firme vere registrate nelle fixture sono *verificabili* e non solo
ricalcolabili — sei su sette lo sono davvero nell'harness; la settima ha il JWT
della password video sostituito prima del salvataggio, quindi quel corpo non è
più quello che era stato firmato.

**Il diario prima del lavoro.** Ogni messaggio finisce in `webhook_events` prima
di essere lavorato, e la chiave di unicità è
`triggerEvent : uid : createdAt` — composta e non un hash del corpo, perché su
Studio si legge. `uid` da solo non basterebbe: nella catena vera la seconda
riprogrammazione e la cancellazione portano lo stesso `uid`. Se il lavoro
fallisce, la riga di diario **sopravvive** (l'inserimento sta fuori dal blocco
con gestore) e `processed_at` resta nullo di proposito: il ritentativo di Cal.com
riprova invece di scartare il messaggio come duplicato.

**Riprogrammare crea una prenotazione NUOVA.** È la cosa che nessuna
documentazione dice e che rende sbagliato il disegno ovvio. Cal.com non aggiorna
niente: fabbrica un `uid` nuovo e mette il vecchio in `rescheduleUid`. Quindi la
riga **non si trova con `uid`**, che per noi è sconosciuto: si trova con
`rescheduleUid`, e poi `cal_booking_uid` va **sostituito** con quello nuovo —
altrimenti la cancellazione successiva, che arriva col codice nuovo, non trova
più niente. `original_starts_at` invece non si tocca mai: è l'ancora da cui si
contano i 20 giorni. L'harness rigioca la catena intera (creazione, due
riprogrammazioni, cancellazione) e verifica che l'ancora non si sia mossa.

**Chi ha agito lo dice Cal.com**, e i campi seguono chi agisce: `rescheduledBy`
e `cancelledBy` confrontati con `organizer.email`. Uguale = il designer,
diverso = il viaggiatore. Se il campo manca, l'attore è `system` e **nessun
contatore si muove**: incrementare quello sbagliato farebbe scattare uno dei due
limiti del Flusso su una colpa non sua. Il team riceve un alert e attribuisce a
mano.

**Il tasto *Request reschedule* servono due segni per riconoscerlo:** il motivo
che inizia per `Please reschedule.` **e** `cancelledBy` uguale a
`organizer.email`. Il prefisso da solo non basta perché un viaggiatore potrebbe
scriverlo a mano, e la conseguenza sarebbe un rimborso non dovuto — l'harness lo
verifica con la coppia esatta e col caso finto. Riconosciuto: stato `disputed`,
alert critico che dice se c'erano soldi dentro, rimborso a mano (decisione dell'8
agosto 2026).

**Non solleva mai.** Ogni caso torna un esito in JSON — `creata`,
`riprogrammata`, `cancellata`, `duplicato`, `firma_non_valida`,
`event_type_non_nostro`, `designer_sconosciuto`, `servizio_senza_prezzo`,
`viaggiatore_non_identificato`, `prenotazione_sconosciuta`,
`request_reschedule_bloccata`, `errore` — così n8n risponde sempre 2xx: un 500
ripetuto porta un provider a spegnere l'endpoint, e la difesa dal doppio scatto
sta già nel database.

Gli scarti non sono tutti uguali, e la differenza è di prodotto. Un **event type
non nostro** è routine — il webhook è per account, non per event type, quindi un
designer che tiene appuntamenti propri sul suo Cal.com ce li manda tutti: si
annota nel diario e basta. Un **designer sconosciuto su un nostro slug** invece
è un alert: o il team non ha ancora scritto `cal_username`, o qualcuno l'ha
cambiato e le sue prenotazioni stanno smettendo di arrivarci in silenzio.

Sull'harness lo schema `vault` non esiste: il test lo simula come già fa con
`auth.users`, e la parola segreta la legge da `CALCOM_WEBHOOK_SECRET`
nell'ambiente (o da `.env.local`, che non è versionato). Se non la trova, il
ponte si prova comunque con una parola inventata e il test **dice** che le firme
vere non sono state verificate, invece di tacerlo.

## Il ponte Stripe

`stripe_webhook(p_corpo text, p_firma text)`, e la forma è **la stessa** della
0037: n8n passa il corpo grezzo e la firma, non guarda dentro, e risponde sempre
2xx. Due ponti identici nella forma sono due ponti che una persona sola può
tenere in testa. Quello che cambia sono tre dettagli di protocollo, e sono
esattamente i punti in cui copiare l'altro ponte sarebbe stato un errore.

**La firma non è quella di Cal.com.** Header `Stripe-Signature`, formato
`t=<timestamp>,v1=<hex>`, e l'HMAC-SHA256 si calcola su **`"<t>.<corpo grezzo>"`**
— non sul solo corpo. Due conseguenze che l'harness verifica una per una: firmare
"alla Cal.com" non passa, e le coppie `v1` possono essere **più di una** (durante
una rotazione del segreto Stripe ne manda due, e ne basta una che combaci —
accettarne una sola farebbe cadere il ponte proprio mentre si cambia parola
segreta). C'è poi una **finestra di tolleranza di 5 minuti**: senza, una firma
valida intercettata resta valida per sempre. La parola segreta sta in Supabase
Vault sotto `stripe_webhook_secret`, accanto a quella di Cal.com.

I 5 minuti sono l'eccezione consapevole alla regola "nessun numero nel codice":
sono un argomento con default della funzione e non una riga di `app_config`,
perché quella regola esiste per i parametri di prodotto che il team cambia da
Studio — e una riga mancante o messa a zero disattiverebbe in silenzio la
protezione. Un parametro di sicurezza che si guasta *aprendo* è peggio del numero
scritto.

**Il diario è più semplice.** Stripe manda un `id` di evento (`evt_…`), quindi
`webhook_events.external_id` è quello e basta. La chiave composta della 0037
esisteva solo perché Cal.com un id non lo dà.

**L'importo si ricontrolla, sempre.** Una consulenza si conferma solo se
`amount_total` combacia con `bookings.price_cents` **e** la valuta è EUR.
Altrimenti: alert critico, prenotazione non confermata, riga di pagamento lasciata
`pending` — marcarla `paid` con un importo sbagliato renderebbe il registro
sbagliato quanto il silenzio. Il controllo sulla valuta ha già trovato una cosa
vera: Stripe accende l'**adaptive pricing** di default, e con quello acceso una
sessione può incassare nella valuta del visitatore. La route lo spegne
esplicitamente; se un giorno riaccendesse da sé, ce ne accorgeremmo da un alert
invece che da un bilancio storto.

**Gli altri casi, che sono quelli che succedono davvero:**

| Cosa arriva | Cosa facciamo |
|---|---|
| `completed` con `payment_status` diverso da `paid` (metodi a notifica differita) | Si aspetta. Confermare qui vorrebbe dire regalare una consulenza |
| `completed` su una prenotazione già `confirmed` | `gia_confermata`, e non è un guasto |
| `completed` su una prenotazione già chiusa dall'orologio | **Alert critico.** L'incasso si registra (i soldi sono veri), la prenotazione no: lo slot è già stato dato via. È il caso del pagamento al minuto 30 e qualcosa |
| `completed` su una sessione senza riga in `payments` | La riga si ricostruisce, leggendo il conto dalla stessa funzione che usa la route, più un alert. Il registro non resta monco |
| `expired` | **Solo** la riga di pagamento va a `expired`. La prenotazione non si tocca e lo slot non si libera: cancellare su Cal.com è compito dell'orologio, e il liberamento deve avvenire in un posto solo |
| Rimborsi | Si annotano in `event_log` e basta. Le regole sono milestone 5, e dopo la deviazione 9 il tasto "rimborsa" è in mano all'agenzia |

Il ripiego "cerca la riga per prenotazione quando non conosco la sessione" vale
**solo sul `completed`**, ed è una distinzione che il test ha trovato prima di
noi: su un `expired` lo stesso ripiego chiuderebbe la cassa *nuova* di quella
prenotazione mentre il viaggiatore ci sta pagando dentro.

**Su quale conto si incassa non sta nel codice.** `consultation_payment_account()`
legge `app_config.consultation_stripe_account` (oggi `xpetis`, in produzione
`agency` — deviazione 9 del `PIANO.md`) e, quando dice `agency`, restituisce
l'agenzia partner di default che `payments_agency_required` pretende. Il
**default della colonna `payments.stripe_account` non si tocca**: il passaggio è
una riga da Studio. La stessa funzione la usano la route che apre la cassa e il
ponte che ricostruisce una riga mancante — due letture dello stesso parametro
sono due occasioni di divergere.

**Una sola cassa aperta per prenotazione**, e per costruzione:
`payments_one_pending_per_kind` (0038) è il gemello di
`payments_one_paid_per_kind` sul lato "in attesa". Serve perché fra il `select`
che non trova una cassa e l'`insert` che la crea c'è una finestra, e un doppio
clic ci passa dentro due volte. Per lo stesso motivo la route inserisce la riga
**prima** di chiamare Stripe: così la seconda richiesta si ferma sull'indice
senza aver creato nessuna sessione da ripulire.

Sulle **fixture**, una differenza onesta rispetto a Cal.com. Il
`checkout.session.expired` in `tests/fixtures/stripe/` è vero: la sessione è
stata creata sulla sandbox con l'API e chiusa con
`POST /v1/checkout/sessions/:id/expire`. Il `checkout.session.completed` invece è
**ricostruito** — involucro e oggetto sono quelli veri, cambiano solo i campi che
Stripe cambia quando una sessione si chiude pagata — perché completare una
Checkout Session richiede di pagare a mano sulla pagina ospitata: il suo
PaymentIntent non si può confermare via API, e nella versione `2026-07-29.dahlia`
nasce addirittura nullo. E **nessuna delle due porta una firma vera**: non sono
passate da un endpoint webhook. Quello che l'harness verifica è l'algoritmo, e lo
verifica su tutti i modi in cui può sbagliare.

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
- `payments` — su quale conto Stripe incassa una consulenza (`xpetis` oggi, `agency` in produzione)
- `showcase` — le stringhe che il sito stampa in pagina: la nota sotto il prezzo degli itinerari
- `contacts` — i recapiti del team (numero WhatsApp), **fuori** dalla superficie pubblica

Il sito legge dalla vista `public_config` i gruppi `booking_rules` e `showcase`;
`matching` è chiuso dalla 0018 (il match è lato server) e i parametri operativi
restano interni.

**Dalla 0034 una riga può portare un numero o un testo**, in due colonne distinte
con un vincolo XOR: `value` per ciò su cui SQL fa aritmetica, `value_text` per le
stringhe che il sito stampa. Il tipo numerico non è diventato testo per tutti di
proposito — una riga sbagliata deve fallire all'inserimento, non dentro un cast
in un workflow. Il primo parametro di testo è `ready_itinerary_price_note`
("volo non incluso • IVA inclusa"), gruppo `showcase`: dice cosa comprende un
prezzo, quindi si cambia da Studio e non con un deploy. Svuotarlo lo fa sparire
dalla pagina.

Le altre due righe di testo sono arrivate con la cassa, ed entrambe stanno in
gruppi che `public_config` **non** espone. `consultation_stripe_account` (gruppo
`payments`) dice chi incassa, e al browser non serve saperlo.
`whatsapp_number` (gruppo `contacts`) è il numero del team, **provvisorio**:
oggi è un cellulare personale, e `public_config` è leggibile da chiunque senza
nemmeno una sessione — i raccoglitori di contatti lo indicizzerebbero, e da lì
non si torna indietro cambiando una riga. Un dato che il nostro server scrive in
pagina dove serve non è la stessa cosa di un dato che l'API serve in blocco: le
pagine lo leggono con `leggiContatto()` in `lib/config.ts`, che passa dalla
chiave secret. Il giorno del numero aziendale dedicato può tornare in `showcase`.

⚠️ **Un database già seminato non le ha.** Il seed si applica a `db reset`, e i
parametri nuovi arrivano da lì: su un progetto vivo si rigira
`seed/0001_config.sql`, che è idempotente (`on conflict (key) do nothing`), o si
inseriscono le due righe a mano. Senza `consultation_stripe_account` la cassa non
si apre e lo dice con una frase leggibile, invece di indovinare un conto.

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
