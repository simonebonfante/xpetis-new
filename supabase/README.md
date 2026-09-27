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
| `0040_showcase_cal_link.sql` | `cal_username` e lo slug dell'event type sulla vetrina, per l'embed |
| `0041_orologio.sql` | L'orologio unico delle scadenze: `clock_tick()`, `clock_task_done()`, e l'attribuzione al sistema della cancellazione che chiediamo noi |
| `0042_firme_rifiutate.sql` | Il contatore delle firme Cal.com rifiutate, e il ramo 2 dell'orologio che ci alza un alert sopra |
| `0043_posta.sql` | La cerniera del dopo-call: `message_templates`, `outbound_messages` che diventa una coda, la composizione in Postgres, i rami post-call e consegna dell'orologio, il resolver dei token a cinque risposte e `create_order_from_token()` |
| `0044_proposta_su_misura.sql` | L'ordine su misura fino al pagamento: `payment_account(kind)`, la proposta congelata dopo l'invio, `order_proposals`, le due mail (link al designer, proposta al viaggiatore), le funzioni delle pagine `/ordine` e `/proposta`, il ponte Stripe che riconosce un ordine, `my_orders` che non mostra le bozze |
| `0045_correzioni_prove.sql` | Le correzioni delle prove del 23 settembre: gli importi di tutti gli alert passano da `euro_it()` (riemesse `calcom_webhook`, `clock_task_done`, `stripe_checkout_ordine`, `stripe_webhook`); la mail al designer quando il viaggiatore paga (`order_paid_td`); le notifiche interne come meccanismo — `notifica_team()`, destinatari ed eventi in `app_config`, ogni `kind` di `team_alerts` è già un evento |
| `0046_silenzio_conferma.sql` | Il silenzio-conferma e i due modi di romperlo: la mail al designer con i tasti no-show e «altro problema» (`clock_ramo_postcall_td`), `booking_exceptions`, la chiusura a 48 ore (`clock_ramo_chiusura_call`); la consegna (`td_delivery_ticket`, `td_deliver`, `order_file_for_token`) con le mail; la revisione (`request_revision`) e la chiusura a 5 giorni (`clock_ramo_chiusura_ordini`); `td_order_page` e `proposal_public_page` riemesse con la consegna; `clock_tick` con tre rami in più |

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
(dalla 0044 un involucro di `payment_account('consultation')`, vedi sotto) legge
`app_config.consultation_stripe_account` (oggi `xpetis`, in produzione
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

## L'orologio

`clock_tick(p_limit)` e `clock_task_done(p_task, p_entity_id, p_status, p_detail)`
sono l'orologio unico delle scadenze (migration 0041). Il workflow che le chiama
ogni cinque minuti sta in `n8n/orologio.json`.

**La forma è diversa dai due ponti, e il motivo è uno solo.** I ponti
*ricevono*: n8n consegna byte e tutta la decisione vive in Postgres. Questo
*agisce verso l'esterno* — per liberare uno slot bisogna chiamare Cal.com, e
Postgres non fa chiamate HTTP. Quindi n8n qui fa qualcosa davvero, ma solo il
gesto: `clock_tick()` decide **chi** è scaduto, n8n esegue, `clock_task_done()`
decide **cosa significa** l'esito. Il braccio passa il codice HTTP che Cal.com ha
risposto, non un giudizio.

**Si marca `cancelled_unpaid` dopo, mai prima.** Se il database chiudesse la riga
prima della chiamata e la chiamata fallisse, resterebbero una riga chiusa e uno
slot occupato che nessuno guarderà mai più, perché l'orologio non ripassa sulle
righe chiuse. Marcando dopo, una riga scaduta resta `pending_payment` finché la
cancellazione non riesce, e il giro successivo la ritrova. È la stessa regola di
`webhook_events.processed_at`, che sugli errori resta nullo perché il ritentativo
riprovi: **un lavoro non riuscito non deve somigliare a un lavoro fatto.** Il
ciclo non gira all'infinito — `cancel_attempts` conta, e oltre
`unpaid_cancel_max_attempts` l'orologio smette e scrive un alert critico.

**Un solo workflow per tutte le scadenze**, non un cron per scadenza. I lavori
che il database sa fare da solo restano dentro, quelli che hanno bisogno del
mondo di fuori escono come compiti nella forma
`(task, entity_type, entity_id, payload)`.

**Dalla 0043 ogni ramo è una funzione a sé**, e `clock_tick()` è un
orchestratore di dodici righe. La 0041 dichiarava la struttura a rami; la 0042 la
mise alla prova e funzionò, ma al prezzo di **riemettere trecento righe per
aggiungerne trenta** — con il risultato che i due file contenevano due copie
parola per parola del ramo degli insoluti, che è il modo in cui due copie
divergono. Al terzo giro la struttura è diventata vera:

| Funzione | Cosa fa | Esce? |
|---|---|---|
| `clock_ramo_insoluti(limite)` | Slot non pagati da liberare su Cal.com | compiti `calcom_cancel_unpaid` |
| `clock_ramo_firme_calcom()` | Conta le firme rifiutate e alza l'alert | no |
| `clock_ramo_token_inventati()` | Conta i token inesistenti e alza l'alert | no |
| `clock_ramo_postcall()` | Compone e accoda la mail post-call | no |
| `clock_ramo_email(limite)` | Consegna quello che è in coda | compiti `email_send` |

Aggiungere una scadenza — il silenzio-conferma a 48 ore, il promemoria del
giorno prima, la chiusura a 5 giorni — è adesso **scrivere una funzione e
aggiungere una riga**. E se è una mail, non richiede nemmeno di toccare n8n: il
ramo della consegna esiste già e non sa cosa consegna.

**La cancellazione che chiediamo noi torna indietro come webhook.** Appena il
braccio cancella, Cal.com manda un `BOOKING_CANCELLED` al nostro stesso ponte, e
il ponte attribuisce la cancellazione confrontando `cancelledBy` con
`organizer.email`. Su una cancellazione fatta via API non sappiamo cosa Cal.com
scriva in quel campo: se ci mettesse la mail del viaggiatore,
`booking_status_history` direbbe che ha cancellato lui — e quella riga è l'unica
prova di chi ha agito. La regola non sta nel ponte ma nel database: il trigger
`bookings_force_system_cancel_actor` attribuisce al sistema ogni cancellazione su
una riga che porta `cancel_requested_at`, **da qualunque porta entri**.

**Il conto dei 35 minuti.** La regola del Flusso è che uno slot non pagato resta
occupato al massimo 35 minuti, e il conto vero è `finestra + grazia + cadenza`:
la cadenza entra perché una riga che scade subito dopo un giro aspetta un giro
intero. Con i valori di oggi — 30 + 0 + 5 — fa **esattamente 35**, quindi non c'è
spazio per nessuna grazia senza accorciare la finestra o la cadenza, e
`booking_cancel_grace_min` nasce a zero. `clock_tick()` ricontrolla il conto a
ogni giro e scrive un alert se qualcuno lo sfonda da Studio, perché i parametri
si cambiano lì, dove nessun test passa.

**Due righe che l'orologio non tocca mai**: quelle con un `payments` già `paid`
(prendere i soldi e dare via lo slot è il danno peggiore che possa fare) e quelle
con `payment_deadline_at` nullo, che la route della cassa tratta come pagabili
senza limite.

**L'indirizzo di cancellazione**, verificato il 20 settembre 2026: l'API v2
pubblica di Cal.com, che risponde 200 **senza nessuna chiave** — come diceva
S-05, che però il fatto l'aveva stabilito senza registrare l'endpoint. Sta in
`app_config.calcom_cancel_url` e non nel workflow, e il codice della prenotazione
viaggia nel **percorso** (`{uid}`): il corpo della richiesta porta solo il motivo,
perché la v2 rifiuta con 400 i campi che non conosce. Conseguenza da sapere:
`payload.cal_booking_uid`, che `clock_tick()` continua a restituire, **non lo
legge più nessuno** — il codice è già dentro `cancel_url`. Resta nella 0041, che
è applicata, e toglierlo non ridurrebbe di niente l'esposizione della
credenziale.

⚠️ **Il collaudo ha trovato due difetti, entrambi fra Postgres e n8n**: il
payload non appiattito e due campi di troppo nel corpo. Nessuno dei due era
visibile da qui — l'harness prova Postgres, non la forma del compito una volta
uscito. Il racconto sta in `n8n/LEGGIMI.md` e in `REGISTRO.md`.

## I due silenzi di Cal.com

Un designer può smettere di arrivarci in due modi, **entrambi senza nessun
segnale**: la parola segreta del webhook è sbagliata (`calcom_webhook()` risponde
`firma_non_valida`, non scrive niente, n8n risponde 200 e Cal.com è contento), o
il webhook non c'è / punta all'indirizzo vecchio (non arriva proprio niente). Con
25 account configurati a mano, che almeno uno dei due capiti non è un rischio: è
una previsione.

**Il primo silenzio si conta** (migration 0042). `calcom_signature_ok()` tiene un
contatore in `calcom_signature_rejections` — **una riga per ora, non una per
messaggio**, perché il principio della 0037 non si annulla: l'indirizzo del
webhook è pubblico, e un diario di tutti i corpi non autenticati sarebbe una
discarica scrivibile da chiunque. Il ramo 2 dell'orologio somma la finestra e
alza `calcom_firme_rifiutate` sopra `calcom_signature_alert_threshold`.

L'alert **dice anche di chi**, e la decisione va capita: su una firma non valida
il corpo non è autenticato, quindi `organizer.username` è un dato che chiunque
può scrivere. Senza però l'alert direbbe "qualcuno manda firme sbagliate" e con
25 account il team non saprebbe da dove cominciare. Il rischio si riduce **alla
fonte**: si salva soltanto un username che è già uno dei nostri, tutto il resto
diventa `null`. Quindi chi scrive corpi finti può al massimo indicare uno dei 25
designer veri — non inserire testo arbitrario, non far comparire nomi inventati,
non far crescere la tabella. Resta un indizio: l'alert lo dichiara non
verificato, nessun automatismo ci agisce sopra, e il controllo che il team fa
dopo è innocuo anche se il nome era sbagliato. Nel caso più probabile — la
parola segreta sbagliata in onboarding — il nome è comunque **vero**, perché a
mandare è davvero Cal.com.

**Il secondo silenzio non si controlla a orologeria**, ed è la parte in cui la
soluzione che sembra più completa è quella sbagliata. Un ramo che avvisa se un
designer non manda niente da N giorni ha un difetto strutturale: **in Beta un
designer senza prenotazioni è indistinguibile da uno col webhook rotto**, perché
il segnale manca per la stessa ragione per cui manca il traffico. Produrrebbe 25
alert il primo giorno, il team imparerebbe a ignorarli, e il giorno che uno è
vero nessuno guarderebbe.

Al suo posto due cose che sono **evidenza invece che inferenza**:

- `calcom_webhook_non_arrivato` (`app/attesa/cerca/route.ts`), che dal 20
  settembre **dice quale designer**: è la prova diretta che qualcuno ha
  prenotato e a noi non è arrivato niente. Lo slug della vetrina viaggia fino
  alla route e serve solo a cercare la riga di `travel_designers`: nell'alert
  finisce il nome che risponde il database, mai la stringa arrivata da fuori.
- **La prenotazione di prova per designer in onboarding**, verificata con una
  query su `bookings` e non guardando le esecuzioni di n8n — che con la parola
  segreta sbagliata sono verdi lo stesso. È il passo che prende il caso più
  probabile nel momento in cui costa trenta secondi correggerlo, e
  `cal_webhook_ok_at` si scrive solo dopo. Sta in `ONBOARDING_CALCOM_TD.md`.

## La posta

Dalla 0043 il database compone le mail e l'orologio le consegna. Tre pezzi, e
conviene tenerli distinti perché si rompono in modi diversi.

**I testi sono dati.** `message_templates`, una riga per mail o per blocco,
modificabile da Studio senza deploy. Non stanno in `app_config` perché una mail
ha oggetto, corpo lungo, etichetta del bottone e segnaposto ammessi — quattro
campi correlati, cioè una tabella, non un parametro scalare. Non stanno nel
codice perché li riscrive Gaia, che non apre un editor: un testo dentro un
`.tsx` è una promessa commerciale che per cambiare richiede un deploy.

Il corpo è **prosa**: righe vuote separano i paragrafi, un indirizzo in chiaro
diventa un link, e basta. L'impaginazione la mette `testo_in_html()`. È voluto —
un tag aperto e mai chiuso, scritto per sbaglio da Studio, arriverebbe a un
cliente vero e nessuno se ne accorgerebbe prima di lui.

**Un segnaposto non fornito fa fallire la composizione**, invece di finire in
pagina o di sostituirsi col vuoto. «Ciao ,» e «{{designer}}» sono due modi di
rompersi che vede solo il destinatario: fallire scrive un alert
`email_composizione_fallita` e non accoda niente.

**`outbound_messages` da registro a coda.** Nasceva (0014) come diario di cosa
era partito: `sent_at` con default `now()`, nessun corpo. Adesso porta il corpo
composto, uno stato (`queued` / `sent` / `failed`), i tentativi, l'errore, e
`sent_at` **senza default**, che si valorizza solo alla consegna riuscita
insieme all'identificativo che restituisce Resend. Una riga che dichiara di
essere partita senza esserlo è peggio di una riga assente: è una bugia che
nessuno va a controllare.

Il corpo si conserva per una ragione operativa precisa: **è l'unico modo perché
Gaia corregga le mail leggendole come le leggerà un cliente**, su Studio, sul
vero invece che su un documento.

**Il vincolo di unicità fa due lavori.**
`(message_kind, entity_type, entity_id, recipient)` c'era già e impediva a un
timer che rigira di mandare due volte la stessa mail. Da oggi è anche il **tetto
di spesa**: Resend free dà 100 mail al giorno *condivise con la landing page*, e
si bruciano in minuti se qualcosa entra in ciclo. Per questo ogni accodamento
passa da `accoda_messaggio()`, che fa `on conflict do nothing`: il `not exists`
che si legge nei rami serve solo a non fare lavoro inutile, la difesa è il
vincolo.

**L'interruttore nasce spento.** `app_config.email_enabled = 0` **non spegne la
composizione**: le mail si compongono e si accodano lo stesso e si leggono su
Studio. Ferma la consegna. Nasce a zero perché il primo giro dopo la 0043
incontra tutte le consulenze già finite, e accenderlo dev'essere un gesto fatto
guardando la coda. `email_redirect_to` è il gradino intermedio: la posta parte
davvero ma va tutta a una casella di prova, con l'oggetto che dichiara a chi
sarebbe andata — e `recipient` resta la persona vera, così il vincolo continua a
significare quello che significa, mentre `delivered_to` dice dove è finita.

**Le mail vecchie non si mandano, e non si tacciono.**
`postcall_email_max_age_hours` è la finestra oltre la quale la mail post-call
non parte più: senza, il primo giro la manderebbe a tutto lo storico, e a regime
manderebbe «com'è andata la call?» tre giorni dopo perché n8n era fermo. Quello
che cade fuori produce un alert `postcall_mail_non_partita` — saltare in
silenzio è il guasto che la 0042 esiste per chiudere.

**Cosa significa la risposta di Resend** lo decide `clock_task_done()`, e la
distinzione che conta è fra riprovabile (`429` sul limite di dieci richieste al
secondo, `5xx`, nessuna risposta) e **definitivo** (qualunque altro `4xx`). Un
corpo malformato o un mittente non verificato non guariscono riprovando:
ritentarli ogni cinque minuti trasformerebbe un difetto in rumore di fondo.

**Il doppione che l'idempotenza chiude.** Se Resend accetta la mail ma l'ack non
torna a Postgres — n8n che si ferma in mezzo — la riga resta in coda e al giro
dopo si riprova. La `Idempotency-Key` che n8n manda è l'id della riga, quindi
Resend riconosce la richiesta e non manda una seconda mail. Vale 24 ore, e i
nostri tentativi stanno dentro un quarto d'ora.

## Le pagine a token

`resolve_access_token_detail(token)` è il resolver delle pagine token, e dice
anche **perché** un token non va bene: `inesistente`, `scaduto`, `revocato`,
`gia_usato`, `valido`. `resolve_access_token()` della 0012 resta, ma dalla 0043 è
un involucro sottile sopra di lui: due copie della stessa regola sono il modo in
cui due copie divergono.

**Dove passa la linea fra onestà e oracolo.** Un token che **non esiste** riceve
una risposta generica; un token che **esiste** riceve la risposta onesta. Per
leggere una risposta onesta bisogna già possedere un token vero, cioè aver avuto
il link: a chi prova stringhe a caso la pagina dice sempre la stessa cosa, non
distingue «quasi giusto» da «sbagliatissimo» e non conferma mai l'esistenza di
niente. In cambio, chi ha davvero in mano un link vecchio sa cosa è successo.

I tentativi a vuoto **si contano** in `access_token_misses` — stessa forma di
`calcom_signature_rejections`, una riga per ora e nessun diario, perché
l'indirizzo è pubblico e conservare i token presentati significherebbe
conservare tentativi di indovinare una credenziale. Il ramo
`clock_ramo_token_inventati()` alza un alert sopra soglia. La soglia è alta di
proposito: un link spezzato da un client di posta produce rumore normale, e un
alert che scatta sul rumore è un alert che si impara a ignorare.

⚠️ **Risolvere un token scrive** (`use_count`, `last_seen_at`): era già così
nella 0012. Quindi si chiama **una volta per richiesta** — `lib/token.ts` fa
esattamente una chiamata per funzione — e il conteggio è telemetria, non un
limite: nessun automatismo decide niente su quel numero.

**I token post-call non scadono mai**, e va guardato in faccia. È una decisione
di prodotto del Flusso: il viaggiatore deve poter cliccare a mesi di distanza.
Quel link vive per sempre in una casella inoltrabile, sincronizzata su tre
dispositivi.

*Cosa può fare chi se lo trova:* creare un ordine `requested` a nome di quel
viaggiatore. Non impegna un euro — nessun pagamento parte, nessun prezzo esiste
ancora — e dall'altra parte c'è una persona del team che apre un gruppo
WhatsApp. Il danno massimo è far lavorare a vuoto il team una volta, e l'ordine
porta `traveler` come attore con il token annotato in `event_log`, quindi si
riconosce e si cancella.

*Quello che vale di più non è l'ordine: è quello che la pagina racconta.* Chi ha
il link sa che quella persona ha fatto una consulenza con quel designer. Per
questo `service_request_page()` restituisce il minimo che serve a decidere — il
designer, il servizio — e la pagina non stampa il nome del viaggiatore, il suo
telefono, la domanda di contesto né il profilo quiz.

**La regola che ne discende, e che vale per le milestone 6 e 7:** un bottone che
crea una richiesta da lavorare e uno che impegna dei soldi non meritano la
stessa fiducia. Dietro un token permanente non va **mai** un'azione che muove
denaro o consegna un file. Il pagamento di una proposta passa da una cassa che
ridichiara l'importo; la conferma dell'agenzia, che sblocca una cascata,
nascerà `single_use` e con una scadenza.

**Il clic è un POST, non un GET.** I link delle mail vengono aperti da macchine:
antivirus aziendali che li visitano per controllarli, Outlook che li riscrive
con SafeLinks, client che precaricano. Un indirizzo che crea un ordine appena lo
si apre produrrebbe richieste che nessuno ha mai chiesto. Quindi il link
**mostra** (`/servizio/<token>`) e un bottone **fa**
(`POST /servizio/<token>/richiedi`), con un form HTML che funziona senza una riga
di JavaScript — chi arriva qui a volte arriva dal browser dentro un'app di posta.

**Un token, un servizio.** La 0012 ammetteva un token attivo per scopo su ogni
entità; la mail post-call porta un bottone per ogni servizio attivo di quel
designer, e il servizio sta nel **payload del token** e non in un parametro
della richiesta — altrimenti chi ha il link del servizio da 200 € potrebbe
chiederne uno da 2.000. L'indice è stato rifatto su
`(purpose, entità, payload->>'service_type')`; sui token che non portano un
servizio il comportamento non cambia.

**Cliccare due volte è innocuo.** `orders_one_per_booking_service` (unico su
`(source_booking_id, service_type)` fra gli ordini non cancellati) ferma il
secondo inserimento, e `create_order_from_token()` lo racconta con
`gia_richiesto` invece che con un errore. Gli annullati restano fuori
dall'indice, così un bottone torna a funzionare dopo una cancellazione.

**La pagina non decide.** Se la call è in uno stato che non ammette l'azione, se
il designer ha spento il servizio, se il bottone era già stato cliccato — lo
dice `create_order_from_token()`, che è la stessa funzione che ha risposto alla
pagina un attimo prima. Due giudici diversi sarebbero due giudici che prima o
poi dicono cose diverse.

## L'ordine su misura, fino al pagamento

La 0044 porta l'ordine su misura da `requested` a `in_progress`: proposta scritta
dal designer, pagata dal viaggiatore. Consegna, revisione e chiusura a silenzio
sono la seconda metà della milestone 6; l'All Inclusive è la milestone 7.

```
requested ─(bozza)─▶ in_definition ─(Invia)─▶ proposal_sent ─(webhook Stripe)─▶ in_progress
                          ▲                         │
                          └─── il team la riapre ───┘
```

**Il primo token che tocca i soldi.** La pagina del designer (`/ordine/<token>`,
scopo `td_order_page`) fissa un prezzo che un cliente pagherà. Il token è
permanente — serve per tutta la vita dell'ordine — quindi il ragionamento è su
*cosa può fare chi se lo trova*, ed è scritto in testa alla migration. In breve:

| Chi ha il link del designer può… | |
|---|---|
| scrivere e correggere la bozza, e inviarla | sì, ed è il danno massimo: la proposta arriva nel gruppo WhatsApp dove si vede, finisce nello spot-check del team, e il denaro lo muove comunque il viaggiatore su una cassa che ridichiara l'importo |
| cambiare una proposta già partita | **no, e non per la pagina**: `freeze_sent_proposal()` rifiuta la modifica di prezzo, descrizione, giorni e credito fuori da `requested`/`in_definition` **a chiunque**, chiave secret e Studio compresi |
| usare il token dopo che il team ha riassegnato l'ordine | no: ogni funzione controlla che il designer del token sia quello dell'ordine |
| toccare pagamenti, rimborsi, altri ordini | no |

**Salvare e inviare sono due gesti.** `save_proposal_draft()` scrive la bozza
(e al primo salvataggio porta l'ordine in `in_definition`); `send_proposal()`
la manda e **ridichiara il prezzo** del riepilogo che il designer ha riletto —
se la bozza è cambiata nel frattempo, rifiuta con `prezzo_cambiato`. Il doppio
clic risponde `gia_inviata` e non produce una seconda proposta. Una proposta già
partita si rifà solo passando dal team: stato riportato a `in_definition` da
Studio (in un `update` a sé: correggere nello stesso colpo non passa), poi il
designer riscrive e reinvia.

**Il credito consulenza non si calcola.** `proposal_price_cents` è il prezzo
**finale**; `consultation_credit_cents` è la dichiarazione del designer di
quanto ha scalato, per il controllo a campione del team. Nessuna funzione fa
`prezzo - credito`, e i commenti lo dicono nel punto esatto in cui qualcuno
sarebbe tentato di "correggerlo". I due controlli che ci sono non sono calcoli:
il credito dichiarato non supera il prezzo della call (è il refuso sui
centesimi), e si dichiara una volta sola per call (`orders_one_credit_per_booking`,
0009, che qui diventa la risposta `credito_gia_usato` con il riferimento
dell'altro ordine). Lo spot-check è la vista **`team_spot_check_proposte`**:
prezzo della call, credito dichiarato e prezzo proposto affiancati, per ogni
proposta partita.

**`order_proposals`: una riga per invio, immutabile.** Serve a due cose. È la
prova di cosa è stato chiesto al viaggiatore, anche dopo che una proposta è
stata rifatta. Ed è l'**entità della mail**: il vincolo di unicità di
`outbound_messages` è per (tipo, entità, destinatario), e con l'ordine come
entità una seconda proposta non potrebbe mai partire.

**Le due mail partono da trigger, non dall'orologio.** La post-call sta
nell'orologio perché il suo grilletto è il tempo; queste hanno per grilletto un
evento, e il database lo vede quando accade.

| Evento | Mail | Entità |
|---|---|---|
| nasce un ordine su misura | `order_new_td` al designer, col link della sua pagina (il token nasce qui) | `order` |
| l'ordine passa a `proposal_sent` | `proposal_traveler` al viaggiatore, con il link della pagina gemella (il token nasce qui) | `order_proposal` |

Una mail che non si compone **non ferma niente** — né il clic del viaggiatore
che crea l'ordine, né l'invio del designer — e scrive un alert critico con la
funzione da rilanciare (`accoda_mail_ordine_td(id)`, `accoda_mail_proposta(id)`).
Consegna come tutte le altre: il ramo `clock_ramo_email`, con interruttore e
dirottamento.

**La pagina gemella** (`/proposta/<token>`, scopo `traveler_public_proposal`) è
fatta per essere girata nel gruppo: mostra la proposta e niente del viaggiatore.
`proposal_public_page()` la riduce a cinque facce (`da_pagare`, `pagata`,
`in_aggiornamento`, `annullata`, `in_verifica`) e in `in_aggiornamento` **non**
restituisce la bozza nuova. Il pagamento dietro un token permanente non viola la
regola della 0043: il bottone apre una cassa, e il denaro lo muove chi mette la
carta.

**La cassa** è una sorella di quella della consulenza: le difese (riga prima
della sessione, clamp su `expires_at`, adaptive pricing spento) stanno in
`lib/cassa.ts` e `lib/stripe.ts`, **una volta per tutte e due**. Una in più: una
cassa aperta si riusa solo se il suo importo è quello di adesso, perché il
prezzo di una proposta — a differenza di quello di una consulenza — può
cambiare con una riapertura. Senza una scadenza nostra la cassa dura il minimo
che Stripe ammette, circa mezz'ora.

**Il conto.** `payment_account(kind)` è la regola, una: `consultation` legge
`app_config.consultation_stripe_account`, `full` legge
`custom_itinerary_stripe_account`. `consultation_payment_account()` resta come
involucro di una riga. `deposit` e `balance` sollevano: l'All Inclusive incassa
sull'agenzia assegnata all'ordine, non su un parametro globale.

**Il ponte Stripe** smista prima di tutto il resto: se la riga di `payments`
trovata per sessione punta a un ordine, o se `metadata.order_id` è valorizzato,
il messaggio va a `stripe_checkout_ordine()`; altrimenti al ramo prenotazioni
della 0039, che non è stato toccato.

| Cosa arriva, per un ordine | Cosa facciamo |
|---|---|
| importo diverso da `orders.proposal_price_cents`, o non EUR | alert critico, ordine fermo, riga `pending` |
| importo giusto, ordine in `proposal_sent` | riga `paid`, ordine `in_progress`, attore `traveler` |
| lo stesso incasso raccontato due volte | `gia_pagato`, innocuo |
| ordine **annullato** | soldi registrati, ordine fermo, alert «va rimborsato» |
| ordine **riaperto** mentre una cassa vecchia era aperta | soldi registrati, ordine fermo, alert che lo dice |
| **secondo incasso** su un ordine già pagato | alert «doppio incasso»; la riga resta com'è, perché `payments_one_paid_per_kind` vieta una seconda riga pagata — e segnarla solleverebbe, facendo ritentare Stripe per sempre |
| ordine sconosciuto | alert critico, come la prenotazione sconosciuta |
| ordine All Inclusive | alert critico: il ramo non lo tratta (milestone 7) |
| cassa scaduta | solo la riga di pagamento; la proposta resta pagabile |

**`my_orders` non mostra le bozze.** La vista della 0019 portava le colonne
della proposta in ogni stato; dalla 0044 ci vive la bozza del designer, e il
viaggiatore l'avrebbe letta con gli strumenti di sviluppo aperti. Adesso sono
nulle in `requested`, `in_definition` e `proposal_pending_agency` — quest'ultimo
perché il Flusso vuole che una proposta All Inclusive non raggiunga il
viaggiatore prima della conferma dell'agenzia.

## Il silenzio-conferma (0046)

Il terzo principio — se nessuno segnala un problema, le cose si chiudono da
sole — ha due orologi e due modi di essere rotto.

### Dopo la call

- **La mail al designer** parte a fine call, dallo stesso grilletto della mail
  post-call al viaggiatore: un ramo dell'orologio, `clock_ramo_postcall_td`.
  Porta due bottoni, due token (`td_exception_no_show`, `td_exception_problem`)
  che **non scadono**: la finestra la fa valere la funzione del clic, così una
  call chiusa dice «si è chiusa il…» invece di «link scaduto».
- **La chiusura a 48 ore** è un `update` (`clock_ramo_chiusura_call`) su
  `confirmed` → `completed`, contando da `ends_at` più
  `postcall_autoclose_hours`. La colonna `bookings.autoclose_at` della 0008
  non la scrive nessuno e non la legge nessuno: cambiare il parametro da Studio
  vale anche per le call già finite.
- **I due tasti** (`td_report_exception`) portano la call a `disputed` — tutti e
  due, **anche il no-show**. Il no-show si dichiara, non si chiude: lo chiude il
  team dopo aver verificato, come dice il Flusso. Il silenzio si ferma da solo,
  perché tocca solo `confirmed`.
- **`booking_exceptions`**: una segnalazione per call (indice unico), con la
  dichiarazione del designer (minuti di attesa, nota) e l'ora del clic misurata
  dal server (`minutes_after_start`), che in un arbitrato vale più della
  dichiarazione. Si chiude da sola quando il team porta la call fuori da
  `disputed` (`resolution` = lo stato scelto).
- Il no-show si rifiuta prima di `td_wait_minutes_in_call` dall'inizio. Dopo la
  finestra delle 48 ore si rifiuta tutto, anche se l'orologio non è ancora
  passato.

⚠️ Il viaggiatore dichiarato assente **non riceve niente**: punto aperto in
`PIANO.md`. L'alert lo scrive, così chi arbitra lo sa.

### La consegna, e perché i byte non passano da noi

Una funzione Vercel accetta 4,5 MB di corpo, il bucket `order-documents` 50.
Quindi tre passi, e il database decide in due:

1. `td_delivery_ticket(token, nome, byte, tipo)` controlla token, stato
   (`in_progress` o `revision_requested`), tipo e dimensione **dichiarati**, e
   **sceglie il percorso**: `ordini/<order_id>/<uuid>.<estensione>`. La route
   apre un caricamento firmato su quel percorso (due ore, un file, senza
   sovrascrittura);
2. il browser carica direttamente su Storage;
3. la route legge da Storage dimensione e tipo **veri** e chiama
   `td_deliver(token, percorso, nome, byte, tipo)`, che controlla che il
   percorso sia di quell'ordine, registra `order_files` e porta l'ordine a
   `delivered` con `last_actor = 'td'`. Se rifiuta, la route cancella l'oggetto.

`documento_ammesso()` ripete i limiti del bucket (0017): il bucket li impone
comunque, la funzione risponde prima. Se si cambiano lì, si cambiano qui.

### Il link firmato non esce mai

`order_file_for_token(token, file)` restituisce un **percorso**, mai un URL. La
route `/…/file/[id]` firma un link di **un minuto** e ci rimanda il browser con
un 303. Nessuna mail, pagina o colonna contiene un link di Storage (l'harness lo
controlla sulla coda e sulle colonne): le mail portano alla pagina a token, che
non scade. Il designer scarica i file del suo ordine sempre; la pagina del
viaggiatore solo da `delivered` in poi, **anche dopo la chiusura**.

### La revisione, e i due orologi su `delivered`

- **La finestra della revisione** (`revision_deadline_at`) si scrive alla
  prima consegna, più `revision_window_days`, e **non riparte mai**: la
  revisione inclusa è una.
- **La chiusura** si calcola: `coalesce(revision_delivered_at, delivered_at) +
  revision_window_days`. Riparte dopo la riconsegna, perché chi riceve la
  versione rivista deve avere il tempo di leggerla. Il ramo è
  `clock_ramo_chiusura_ordini`, solo su misura, solo `delivered`: un ordine in
  `revision_requested` aspetta il designer, e lì il silenzio non chiude.
- `request_revision(token, nota)` risponde con parole diverse per casi diversi:
  `revisione_in_corso` (doppio clic), `revisione_gia_chiesta` (con le date),
  `finestra_chiusa` (con la data), `ordine_chiuso`. La pagina legge
  `puo_chiedere_revisione` da `proposal_public_page`, calcolato con le stesse
  regole: non decide se mostrare il tasto.

### Le mail e gli eventi

Tutte composte e accodate, dal trigger dello stato: `delivery_traveler` e
`revision_delivered_traveler` (entità: il file, così ogni consegna ha la sua),
`revision_requested_td`. Il messaggio da girare nel gruppo dopo la consegna è
`blocco_whatsapp_consegna`, in pagina. Per il meccanismo della 0045 nascono
gli eventi `ordine_consegnato` e `revisione_richiesta`, più gli alert
`td_segnala_no_show` e `td_segnala_problema`, che sono eventi anche loro: per
avvisare il team basta una parola in `team_notify_events`.

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
- `payments` — su quale conto Stripe incassano una consulenza e un itinerario su misura (`consultation_stripe_account`, `custom_itinerary_stripe_account`: `xpetis` oggi, `agency` in produzione)
- `showcase` — le stringhe che il sito stampa in pagina: la nota sotto il prezzo degli itinerari
- `contacts` — i recapiti del team (numero WhatsApp), **fuori** dalla superficie pubblica
- `integrations` — quello che serve a parlare col mondo: l'indirizzo di cancellazione Cal.com, le soglie dei due contatori (firme rifiutate, token inventati) e tutta la posta (`email_enabled`, `email_from`, `email_redirect_to`, `email_max_per_tick`, `email_max_attempts`, `site_base_url`). **Fuori** dalla superficie pubblica, e a maggior ragione

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
inseriscono le righe a mano. Senza `consultation_stripe_account` la cassa non
si apre e lo dice con una frase leggibile, invece di indovinare un conto.

Dalla 0043 la stessa mancanza, sui rami dell'orologio, **si dichiara da sola**:
`clock_tick()` scrive un alert `orologio_ramo_non_configurato` che elenca le
righe mancanti una per una, lo **aggiorna** man mano che ne sistemi qualcuna e
lo **chiude da solo** quando non ne manca più nessuna. Non fa invece sollevare
la funzione, perché fermare tutto l'orologio per la configurazione di una
scadenza spegnerebbe anche quella che sta già funzionando da giorni.

## Note sul modello dati

**`public_td_profiles`** è il payload che l'algoritmo di matching carica in una
sola query: un oggetto per TD con paesi e livelli, assi, tag per destinazione e
servizi attivi già aggregati in JSON.

**I tag sono per coppia TD-destinazione**, non sul TD in generale: la chiave
esterna composta verso `td_countries` rende impossibile dichiarare un tag su un
paese che il TD non copre.

**Il credito consulenza** si applica una volta sola per call: un indice unico
parziale su `orders (source_booking_id) where consultation_credit_cents > 0` lo
garantisce. Dalla 0044 il valore lo dichiara il designer nella proposta, e
**non si sottrae da nessuna parte**: il prezzo della proposta è già al netto.
Resta lo spot-check del team, sulla vista `team_spot_check_proposte`.

⚠️ **Domanda aperta: l'indice conta anche gli ordini annullati.** Se l'ordine
su cui il credito era stato dichiarato viene annullato, il credito resta
"occupato" e il designer di un secondo ordine della stessa call riceve
`credito_gia_usato`. E dalla 0044 il team non può nemmeno azzerarlo a mano: un
ordine `cancelled` ha la proposta congelata. Se la risposta di prodotto è «un
ordine annullato libera il credito», la correzione è una riga — l'indice con
`and status <> 'cancelled'`, come già fa `orders_one_per_booking_service` — ma
è una decisione, non un difetto, e sta in `PIANO.md`.

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

1. ~~Import della tassonomia geografica~~ → fatto.
2. ~~Algoritmo di matching sopra `public_td_profiles` e `public_config`~~ → fatto.
3. ~~Route server-side delle pagine token~~ → **fatta la prima** (i bottoni
   post-call, 0043). Restano la pagina ordine del TD, i tasti eccezione, la
   pagina di conferma dell'agenzia e la pagina recensione: tutte poggiano su
   `resolve_access_token_detail()` e su `lib/token.ts`.
4. ~~Workflow n8n: Cal.com → `bookings`, Stripe → `payments`, insoluti, timer~~
   → fatti, più la posta.
5. La vita dell'ordine su misura: ~~proposta, pagamento~~ → **fatti** (0044);
   ~~consegna, revisione e chiusura a silenzio~~ → **fatti** (0046).
