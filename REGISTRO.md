# XPETIS · registro dei lavori

Una voce per sessione, **dalla più recente alla più vecchia**. Dentro lo stesso
giorno le voci restano nell'ordine in cui sono state scritte.

Qui si racconta *cosa è stato fatto e perché*, comprese le scelte scartate e gli
errori: è la memoria del progetto, e serve a non ridiscutere due volte le stesse
cose. Lo stato corrente, le decisioni aperte e i task stanno in `PIANO.md`.

---

**27 settembre 2026 — la milestone 7: l'All Inclusive, con l'agenzia in mezzo**

Il prompt: l'agenzia in `agencies`, la verifica con la sua pagina a token,
acconto e saldo, il ponte Stripe che distingue le due rate, il file finale, le
mail. È `0047_all_inclusive.sql`, la pagina `/agenzia/[token]`, la faccia All
Inclusive di `/ordine/[token]` e `/proposta/[token]`, e `/documento/[id]`.
Harness da 695 a **832 asserzioni**, build verde. Due rami dell'orologio in
più, nessun workflow: il ponte Stripe è lo stesso endpoint, e n8n non si tocca.

**La decisione su Stripe l'ha presa Simone, e semplifica.** Un conto solo,
dell'agenzia, dedicato a XPETIS; niente Connect. Nel codice vuol dire che
`payment_account()` guadagna una riga (`all_inclusive_stripe_account`) invece
di sollevare su acconto e saldo, e che la chiave dipende dal conto: `sk_` della
sandbox dall'ambiente per `xpetis`, chiave ristretta da Vault per `agency`
(`agency_stripe_key()`, che rifiuta tutto ciò che non comincia per `rk_` — una
`sk_` incollata per sbaglio avrebbe in mano i rimborsi). Una sessione già
aperta si rilegge e si chiude **sul conto della sua riga**, non su quello che
dice `app_config` adesso. Non avevo previsto due endpoint, quindi non c'era
niente da far collassare.

**Una domanda sola a Simone, e l'ha decisa lui: il documento finale si scarica
col login.** La 0046 l'aveva lasciato scritto — per biglietti e voucher il link
girato nel gruppo non basta. La prima idea era un parametro in più su
`order_file_for_token` e un rinvio a `/accedi?next=` con la pagina a token: l'ho
scartata perché il token avrebbe viaggiato dentro il giro del login (il
`redirectTo` che Supabase conserva). Quindi un indirizzo **senza token**,
`/documento/<id>`: l'id del file non è una credenziale, e senza la sessione
giusta risponde come a un file che non esiste.

**Il link dell'agenzia è monouso e scade, e l'ho deciso io.** Il prompt diceva
«valgono le stesse regole» delle altre pagine a token, che non scadono. Ma la
0043 aveva già scritto che la conferma dell'agenzia «nascerà `single_use` e con
una scadenza», e la ragione regge: è l'unico controllo sui prezzi del Flusso, e
chi trova il link conferma al posto dell'agenzia. Un token per invio (quello
vecchio si revoca), consumato alla prima risposta, scadenza in
`agency_confirm_valid_days` (7, una stima). Perché la scadenza non lasci una
proposta ferma per sempre, l'orologio avvisa il team e c'è
`rinnova_verifica_agenzia()`. «Il primo che clicca decide» non è un controllo
in una funzione: è la chiave primaria di `agency_decisions`, una riga per
proposta. Il link consumato mostra com'è andata invece di dire «già usato».

**Riusare senza riscrivere, dove il codice lo permetteva.** Il caricamento del
documento di proposta e del documento finale passa dalle stesse route e dallo
stesso componente della consegna: `td_delivery_ticket` e `td_deliver` sono
riemesse con uno smistamento in testa, e il ramo su misura è il loro corpo di
prima. Per non risolvere il token due volte (risolvere scrive `use_count`) il
controllo del token è uscito in `td_order_token()`, e `td_order_from_token()`
della 0044 è diventato un involucro. `stripe_checkout_ordine` è riemessa con
una sola differenza (l'All Inclusive va a `stripe_checkout_ai`); per non
riemettere anche `stripe_webhook`, il ramo nuovo riusa gli esiti che il ponte
già scrive nel diario, e scrive da sé i due che sono nuovi.

**Cinque cose trovate strada facendo, nessuna dall'harness al primo colpo.**
Un alias `dec` nelle query (è una parola chiave: rinominato). La percentuale
nelle mail formattata con `trim(trailing '0')`, che su «30» dava «3%». Il
trigger che porta da `deposit_paid` a `awaiting_balance` faceva un `update`
annidato **prima** che `orders_log_status` scrivesse la riga dell'acconto, e la
storia usciva in ordine sbagliato: rinominato perché giri dopo
(`orders_soldi_all_inclusive`), e ora un'asserzione lo controlla. La regola
dell'harness sugli importi (`/ 100.0` vietato in ogni funzione) ha preso anche
il calcolo dell'acconto, dove non era un importo in un messaggio: riscritto
`/ 100`. E una trappola vera, trovata scrivendo il caso «saldo prima
dell'acconto»: `payments_one_paid_per_kind` conta anche i rimborsati, quindi il
saldo giusto arrivato dopo uno anticipato e rimborsato avrebbe fatto sollevare
il ponte, e Stripe avrebbe ritentato per sempre. Ora è un alert
(`stripe_rata_gia_registrata`) con l'ordine fermo. Il su misura ha la stessa
trappola in una forma più rara (proposta riaperta e ripagata): **non l'ho
toccata**, perché non era nel prompt; lo dico qui.

**`payments_one_pending_per_kind` regge, verificato e non dato per buono**: una
cassa acconto e una saldo aperte insieme passano, due acconto no.

**I sabotaggi.** Tolti uno per volta il controllo della decisione già presa, lo
stato atteso della rata, l'obbligo dei tempi del saldo, il divieto del
documento finale dal token e il consumo del token: tutti e cinque fanno
diventare rosso il giro. Il secondo ha mostrato anche la difesa di fondo — la
tabella delle transizioni della 0010 ferma lo stesso l'ordine — ma con un
`errore` che Stripe ritenterebbe: è la ragione per cui il controllo nel ponte
serve.

**Quattro punti dell'harness vecchio aggiornati**, perché dicevano il mondo di
prima: l'All Inclusive che «non riceve né token né mail» (ora li riceve, col suo
testo); `payment_account('deposit')` che solleva (ora risponde); il pagamento
su un All Inclusive «che il ramo non tratta» (ora non indovina la rata); e il
test della 0009 che scriveva a mano acconto e saldo (ora li calcola il
database, e il test lo verifica).

**L'agenzia finta per lo staging c'era già**: `seed/0003_demo.sql` semina
«Agenzia Partner XPETIS» come partner di default, e il seed demo è quello che
in produzione si toglie. Non ne ho aggiunta un'altra.

**Cosa non ho fatto, di proposito**: i rimborsi via API, la riconciliazione
(punto aperto rosso, con Andrea), una seconda agenzia, e la chiusura di un All
Inclusive consegnato — la transizione c'è dalla 0010, ma quando chiudere non lo
dice nessuno. Fra i punti aperti anche la mail all'agenzia quando l'acconto è
pagato, che il prompt non elencava. E niente è stato visto in un browser né
contro Stripe e Storage veri: sono le prove 79-101 in `PIANO.md`, con la nota su
come fabbricare a mano il token dell'agenzia.

**Documenti**: `ACCESSI.md` (il conto dell'agenzia, la chiave ristretta, cosa si
accetta), la deviazione 9 e S-11/S-12 in `PIANO.md`, `supabase/README.md`, due
righe di `CLAUDE.md` che dicevano ancora «su misura sul conto XPETIS» e
«Vault, n8n o Connect».

---

**27 settembre 2026, sera — il Figma nuovo, i tre event type, le tre reti, i viaggi di gruppo**

Il prompt «A», base per i tre che seguono (destinazioni v2, quiz, pagine
ridisegnate). Cinque cose: il file Figma nuovo, i servizi per la terza volta, le
tre reti mai costruite, la deviazione 7 contro il file nuovo della tassonomia, e
i viaggi di gruppo. `0048_tre_event_type_e_gruppi.sql`, harness da 832 a **860
asserzioni**, tutte verdi. Nessuna riga di TypeScript: la vetrina non mostra
ancora i viaggi di gruppo, e non era chiesto.

**Il Figma.** File nuovo `Q9Krydv6xD8mFJCtU9NHzr`, non una revisione. In
`CLAUDE.md` i tre nodi verificati (vetrina `2-743`, viaggi di gruppo `3-1121`,
itinerario pronto `3-1386`), e per home, ricerca e quiz «da chiedere» con la
spiegazione del perché i nodi vecchi non si riusano: puntano a un altro file.
`ACCESSI.md` e l'intestazione di `scarica-asset-figma.sh`, che scarica ancora
dal file vecchio e lo dice.

**I servizi, e la deviazione 10 riscritta invece di una 11.** La vecchia riga
resta barrata dentro la nuova, perché l'onboarding è partito con quella. In
`ONBOARDING_CALCOM_TD.md` la tabella ha tre righe e la breve non è più
condizionale; la sezione 8 nuova dice cosa ricontrollare sui tre designer già
fatti. Il caso che conta è il designer che ha creato **solo** un
`consulenza-xpetis-60` come base: con la regola nuova non è una breve, e il
prezzo che ha scritto nel form era per quella. Ho scritto anche il vecchio URL
dell'approfondita (`consulenza-xpetis-approfondita-60-min`), che la guida
suggeriva e che ora è fuori elenco.

**Le tre reti.** Verificato prima sul database di sviluppo, in sola lettura con
la chiave secret: tre servizi con slug, nessuna coppia doppia. Ma
l'approfondita di Giulia aveva `consulenza-xpetis-approfondita`, inventato
nel seed quando gli event type erano due: con la rete nuova sarebbe stato un
blocco, quindi il seed ora la porta a `consulenza-xpetis-60`, con un `update`
esplicito perché l'insert ha `on conflict do nothing`.

- *a.* `unique (td_id, cal_event_type_slug)`, preceduto da un blocco che, se
  trova doppioni, **li nomina** invece di lasciare a Postgres «could not create
  unique index». L'harness rigioca quel blocco su un doppione vero, col vincolo
  tolto dentro una transazione che poi torna indietro.
- *b.* Due righe di `app_config`, una per tipo e non un elenco unico: con un
  elenco solo la breve sul `-60` passerebbe, ed è proprio l'errore che la
  regola vecchia lascia in eredità. Il blocco sta in `td_publish_blockers`.
  **Ho aggiunto una cosa che il prompt non chiedeva**, e la dico: il blocco
  della 0020 scatta solo quando un profilo *diventa* pubblicato, quindi uno slug
  cambiato dopo su un designer già in vetrina sarebbe passato. Un trigger su
  `td_services` guarda la riga scritta e la rifiuta. Senza configurazione il
  servizio è bloccato, non libero: un controllo che si spegne da solo quando
  manca il suo parametro non è un controllo. I servizi spenti non si guardano,
  per le prenotazioni in volo.
- *c.* `calcom_webhook` riemessa dalla 0045, parola per parola salvo tre punti
  marcati. Confronta `endTime - startTime` con `duration_minutes` solo al
  `BOOKING_CREATED`: la riprogrammazione resta nello stesso event type. La
  prenotazione si crea comunque; l'alert è critico, sulla prenotazione, col
  prezzo pagato dentro.

Tre prove vecchie usavano slug inventati (`'x'` due volte,
`consulenza-xpetis-approfondita` una) e la rete nuova le ha giustamente
fermate: riscritte con gli slug ammessi, stesso senso. La prova «servizio non
del designer» ora usa il `-60` di Giulia contro Marco, che ha il `-90`.

**La deviazione 7.** Il file v2 dice `italian_region` fra i selezionabili, come
diceva il primo. Aggiornata la deviazione, e soprattutto l'avviso in
`genera_geo.mjs`, dove l'import legge `selection_rules`, con una riga che
finisce nell'intestazione del seed generato. Rigenerato il seed `0002`: cambia
solo quel commento. Lo script legge ancora `xpetis_destinazioni.json`: il
passaggio al v2 è il prompt successivo.

**I viaggi di gruppo.** `td_group_trips`, gemella della 0026 con
`dates_label` e `group_size_label`, tutto testo. Niente `slug` perché non c'è
ancora una pagina per viaggio; se il nodo `3-1121` lo è, si aggiunge. Colonna
`group_trips` in coda a `public_td_showcase`, `create or replace` come nella
0040 per non perdere il `grant`. Sei viaggi finti, tre per Marco (Vietnam,
Thailandia, Giappone) e tre per Giulia (Perù, Bolivia, Perù), **con date
future di proposito**: una demo piena di partenze passate nasconderebbe la
domanda che deve far vedere. Quattro immagini finte; il generatore ha
riscritto anche le 23 esistenti (Pillow diverso, stessi disegni), e le ho
riportate com'erano per non sporcare il diff.

**Cosa non ho fatto, di proposito**: nessun campo per la scadenza dei viaggi di
gruppo (domanda aperta), nessuna mappatura di `gruppoHaGia` e `gruppoTempi`
(chiavi nuove del form che non so leggere), nessun controllo fra il numero
nello slug e `duration_minutes` (è una convenzione di nomi: lo copre la rete
*c*, sul fatto). E niente è stato applicato al progetto Supabase vero: sono le
prove 102-108, con le due righe di `app_config` da inserire a mano.

**Trovato strada facendo**: `scripts/carica-immagini-finte.sh` carica
`.env.local` con `.`, e oggi fallisce sulla riga `RESEND_FROM`, che ha le
parentesi angolate e non è fra virgolette. Non ho toccato il file: è tuo e
contiene i segreti.

---

**26 settembre 2026 — la milestone 6 si chiude: il silenzio-conferma, e i due modi di romperlo**

Il prompt: chiusura a 48 ore con i due tasti del designer, consegna con i file,
revisione e chiusura a 5 giorni. È `0046_silenzio_conferma.sql`, la pagina
`/eccezione/[token]`, la consegna dalla pagina ordine, lo scaricamento e la
revisione dalla pagina del viaggiatore. Harness da 614 a **693 asserzioni**,
build verde. Tre rami dell'orologio in più, nessun workflow: n8n non si tocca.

**Il tasto no-show non chiude come no-show, e la ragione l'ha data il Flusso.**
Il prompt avvertiva che quel tasto decide chi tiene i soldi sulla sola parola
del designer. Rileggendo §6 c'era già la risposta: «verifica rapida del team,
chiusura come no-show». Quindi il tasto **dichiara**: la call va a `disputed`
come per «altro problema», il silenzio si ferma, e `no_show` lo scrive il team.
Ho scartato uno stato nuovo nell'enum (`alter type ... add value` dentro una
migration è fragile, e `disputed` è già definito come «in arbitrato del team»)
e le colonne su `bookings` (sono i dati di un arbitrato, e `bookings` ha già
abbastanza porte verso il browser): è una tabella, `booking_exceptions`, una
riga per call. Dentro c'è la cosa che in un arbitrato vale di più, e che il
designer non può scrivere: **l'ora del clic, misurata dal server**. Ho aggiunto
anche il rifiuto del no-show prima dei 15 minuti dall'inizio: la regola resta
d'onore sull'attesa, ma non si può dichiarare prima che la regola sia scaduta.

**Il viaggiatore dichiarato assente non lo sa, e non l'ho deciso io.** Il
prompt chiedeva di dirlo invece di decidere che il silenzio vada bene: il mio
parere è che vada avvisato prima che il team decida, ed è in `PIANO.md` come
punto aperto rosso. Nel frattempo l'alert scrive in chiaro che il viaggiatore
non è stato sentito, con mail e telefono per farlo.

**La scelta più grossa riguarda i byte, e contraddice una riga di `CLAUDE.md`.**
«Il caricamento passa dal nostro server» si scontra con il limite di 4,5 MB del
corpo di una funzione Vercel: un itinerario col template XPETIS lo supera, e il
bucket ne ammette 50. Costruito come chiedeva il prompt, avrebbe funzionato in
sviluppo e si sarebbe rotto col primo PDF vero in produzione. Quindi il server
decide tutto e non porta niente: il database sceglie il percorso, la route apre
un caricamento firmato su quel percorso soltanto, il browser carica, e poi la
route guarda cosa è arrivato davvero prima di registrare. L'altra metà della
convenzione — n8n non vede mai un file — resta intera. Ho aggiornato
`CLAUDE.md` e lo dico qui perché è una modifica a una regola, non un dettaglio.
Il prezzo: la consegna è l'unico pezzo delle pagine a token che vuole
JavaScript.

**Il link firmato non esce mai, e non ce ne sono due modi.** Le mail portano
alla pagina a token; la pagina porta a un indirizzo nostro; solo al clic la
route chiede al database un **percorso** (mai un URL: il database non ha la
chiave di Storage, ed è giusto) e firma un link di un minuto. Il difetto che il
prompt temeva — la mail che funziona oggi e non fra tre settimane — non si può
provare su PGlite, che non ha Storage: l'harness prova la cosa che lo rende
impossibile, cioè che nessuna mail in coda e nessuna colonna contenga un link
di Storage. La scadenza vera è la prova 75, a mano.

**La regola della 0043 che si piega.** «Dietro un token permanente non va mai
un'azione che consegna un file»: la consegna è esattamente quello, per
costruzione del Flusso. In testa alla 0046 c'è cosa può fare chi trova i due
link — consegnare un file sbagliato, scaricare un itinerario — e perché per un
itinerario va bene e per i biglietti dell'All Inclusive no.

**Due orologi sullo stesso stato.** Come proponeva il prompt: la finestra della
revisione dalla prima consegna, scritta una volta; la chiusura dall'ultima,
calcolata. Un test che li confrontava come stringhe passava anche col difetto
(prima consegna e riconsegna cadono nello stesso secondo): l'ho trovato
sabotando la funzione apposta, e l'ho riscritto con una scadenza riconoscibile.
Gli altri sabotaggi provati — il silenzio che chiude anche le `disputed`, la
revisione senza controllo della finestra, la consegna senza controllo dello
stato — fanno diventare rosso il giro; l'ultimo lo ferma il trigger della
macchina a stati, che è la difesa di fondo.

**Tre punti dell'harness della 0043 aggiornati** (facevano fallire nove
asserzioni), perché davano per scontato che dopo una call partisse una sola
mail e nascessero solo i token dei servizi. Ognuno è stato ristretto a quello
che prova — la mail al viaggiatore, i token dei servizi — non allentato.

**Cosa NON è stato fatto, di proposito:** il tasto «C'è un problema» in fondo
alla pagina ordine (Flusso §7; riga a sé in `PIANO.md`), la mail al viaggiatore
assente (punto aperto), un tempo massimo per consegnare una revisione (punto
aperto), qualunque mail a `completed` (milestone 8). Niente è stato visto in un
browser né provato contro Storage vero: sono le prove 64-78, e la 72 — un PDF
sopra i 5 MB dal telefono — è quella che dice se la scelta sui byte regge.

---

**26 settembre 2026 — le correzioni uscite dalle prove del 23 settembre**

Il prompt: spuntare le prove 41-56 (passate tutte) e fare le cinque correzioni
che ne sono uscite. È `0045_correzioni_prove.sql`, più il form della proposta,
la route della bozza, `lib/ordine.ts` e `CopiaTesto`. Harness da 599 a **614
asserzioni**, build verde. Il prompt diceva «41-57»: la tabella finisce alla
56, le nuove partono dalla 57.

**La cosa da ricordare di questa sessione: quattro difetti su cinque non
erano nel codice della logica.** Erano in un campo (gli importi), in un
ripiego mancante (il form che si ripopolava dalla riga sbagliata), in una
formattazione (i sedici decimali) e in una notifica che non esisteva. Le
funzioni che decidono — la macchina a stati, il congelamento, il confronto
dell'incasso col listino — hanno retto tutte. L'harness era a 599 asserzioni e
**non poteva vederne nessuno**: prova Postgres, e questi difetti stanno dove
Postgres finisce, cioè nel browser, nel testo che legge una persona e nel
silenzio. Si trovano solo guardando, ed è la ragione per cui le prove di
Simone restano un passaggio e non una formalità.

**1 · Il form.** La tentazione era la correzione lato server: tenere i valori
inviati e rimetterli nel form. Non ci stanno: la descrizione arriva a
ventimila caratteri, che non entrano in un indirizzo e nemmeno in un cookie, e
passare alle Server Action avrebbe rifatto la route per un campo. Quindi
`RicordaModulo`: all'invio mette i campi in `sessionStorage` (senza il token),
al ritorno con un errore li rimette, e una pagina aperta senza errore li butta.
La riga resta il ripiego che disegna il server, e senza JavaScript si torna a
com'era prima. Il commento del componente dice perché ripopolare dal database
**sembra** giusto e non lo è — la riga è l'ultima bozza salvata, non l'ultima
inviata — e la prova 59 è scritta per intercettare chi lo rimettesse così.

**2 · Il campo degli importi.** `FORMA_IMPORTO`, una regex sola usata in due
posti: il `pattern` del campo (il browser ferma l'invio e non si perde niente)
e la route (che riceve comunque quello che le si manda). Verificata con i casi
del prompt sia come `RegExp` sia col flag `v` che usa il browser per
`pattern`. `euroInCentesimi` **non è stata toccata**: ha adesso sopra il
commento che spiega cosa succede a chi la «semplifica» con `parseFloat` —
`19.99 * 100` fa 1998,999…, il ponte Stripe rifiuta l'incasso, alert critico.

**3 · Il tasto *Copia*.** Una scoperta da dire: **il campo selezionabile c'era
già** nel codice provato il 23, e il ripiego al clic pure. Quello che mancava
era dichiararlo come la cosa principale: adesso ha un'etichetta e l'istruzione
«tieni il dito sul testo» sempre visibili, la selezione funziona anche su iOS
(dove `select()` da solo non basta su un campo in sola lettura), e se il
bottone fallisce lo dice in grassetto. Niente `execCommand`, come chiesto.

**4 · I sedici decimali.** `euro_it()` **esisteva già** dalla 0044, usata per le
mail e non per gli alert. Delle quindici occorrenze in cinque migration, le
funzioni vive erano quattro: `calcom_webhook` (0037), `clock_task_done`
(0043), `stripe_checkout_ordine` e `stripe_webhook` (0044). Riemesse parola per
parola salvo le righe degli importi, estratte con uno script e confrontate con
`diff`. Un dettaglio: nel confronto dell'incasso la valuta sbagliata adesso è
detta a parole («MA IN VALUTA USD»), perché `euro_it` mette sempre il simbolo
dell'euro e «700,00 € USD» si sarebbe contraddetto. E perché il prossimo alert
erediti la regola invece di ripetere il difetto, l'harness **legge il sorgente
di tutte le funzioni in `pg_proc`** e diventa rosso su ogni `/ 100.0`.

**5 · Chi viene avvisato.** Costruito come meccanismo: due righe di
`app_config`, `team_notify_recipients` e `team_notify_events`, e
`notifica_team()` che accoda una mail per destinatario. La scelta che fa il
lavoro è **dove nascono gli eventi**: un trigger su `team_alerts` rende ogni
`kind` di alert un evento, quindi `ordine_richiesto` — e domani disputa e
no-show — si cablano con una parola in una riga, da Studio. `ordine_pagato`
invece non è un alert, e non l'ho fatto diventare tale: una buona notizia in
`team_alerts` sporcherebbe la tabella che il team deve svuotare, e il digest
che verrà. Lo chiama il trigger del passaggio `proposal_sent → in_progress`,
che accoda anche la mail al designer (`order_paid_td`, un testo per Gaia, senza
aggettivi col genere). Due difese: il `message_kind` è `team_<evento>`, perché
con un tipo unico due eventi sullo stesso ordine si ruberebbero la riga di coda;
e gli alert del meccanismo stesso (`notifica_team_*`) non si notificano,
altrimenti un testo rotto farebbe un ciclo — l'harness lo prova rompendo il
testo apposta. `team_notify_recipients` nasce **vuota**: gli indirizzi degli
amministratori non vanno in un file versionato, e finché è vuota il primo
pagamento scrive un alert invece di perdersi.

**Cosa NON è stato fatto, di proposito:** `ordine_richiesto` non è stato
scritto nell'elenco degli eventi (resta parcheggiato con il digest, per scelta
di Simone: la prova 63 lo accende e lo rispegne), il digest, la vista
operativa minima. Niente è stato visto in un browser né applicato al database
vero: sono le prove 57-63.

---

**23 settembre 2026 — la proposta su misura, dalla richiesta al pagamento**

Il prompt: portare l'ordine su misura da `requested` a `in_progress`, cioè
proposta scritta dal designer e pagata dal viaggiatore. Fuori perimetro
consegna, revisione, chiusura a silenzio e All Inclusive. È
`0044_proposta_su_misura.sql`, più le pagine `/ordine/[token]` e
`/proposta/[token]`, la cassa della proposta e `lib/cassa.ts`. Harness da 459 a
548 asserzioni, build verde. **Niente è stato visto in un browser né applicato
al database vero**: le prove 41-56 in `PIANO.md` sono la parte che manca.

**La domanda da cui è partito tutto: cosa può fare chi trova il link del
designer.** È il primo token che fissa un prezzo, ed è permanente — deve
esserlo, serve per tutta la vita dell'ordine. La risposta costruita: prima
dell'invio può scrivere e mandare una proposta (il danno massimo, che passa
comunque dal gruppo WhatsApp, dallo spot-check e da una cassa che ridichiara
l'importo); dopo, **niente sulla proposta**. L'irreversibilità l'ho messa in un
trigger (`freeze_sent_proposal`) e non nelle funzioni del token, perché deve
valere per chiunque: il caso che conta di più è il team che su Studio «sistema
un refuso» mentre una cassa Stripe è aperta, e il viaggiatore paga un importo
che la pagina non mostra più. La regola è sullo **stato di partenza**, così un
`update` che scrive e manda nello stesso colpo passa (lo fa un test vecchio
dell'harness), mentre riaprire e correggere sono due gesti.

**Salvare e inviare separati, e l'invio ridichiara il prezzo.** La prima idea
era un form solo con «Invia». Scartata: un refuso da 4.500 € invece di 450 è
proprio la cosa che un riepilogo fa vedere. Il riepilogo però apriva un buco
suo — due schede, una ferma sul riepilogo vecchio, l'altra che corregge — e da
lì il prezzo confermato che la pagina rimanda con l'invio.

**`order_proposals` non era nel piano**, e l'ho aggiunta per una ragione
tecnica prima che per l'audit: il vincolo di unicità di `outbound_messages` è
per (tipo, entità, destinatario), e con l'ordine come entità una proposta
rifatta dal team non avrebbe mai potuto mandare la sua mail. Con la proposta
come entità, il vincolo continua a dire la verità. Il fatto che resti la prova
di cosa è stato chiesto al viaggiatore è il guadagno in più.

**Le due mail partono da trigger, non dall'orologio.** Ci ho pensato perché
contraddice in apparenza la 0043, che mette la post-call in un ramo. Non la
contraddice: la post-call ha per grilletto il tempo, queste un evento. E un
trigger ha un vantaggio che il ramo non avrebbe: la mail parte **chiunque**
faccia il passaggio di stato, anche il team da Studio. E di conseguenza non
ho dovuto riemettere `clock_tick()`. La mail al designer esiste perché il Flusso
dice che il link lo riceve «a ogni nuovo ordine»; senza, la pagina non ha
porta d'ingresso.

**La cassa: estratta, non copiata.** Le tre difese della consulenza (riga
prima della sessione, clamp, adaptive pricing spento) adesso stanno in
`lib/cassa.ts` e `lib/stripe.ts`, e la route della consulenza è stata
riscritta sopra — stesse risposte HTTP di prima. Scrivendola è venuta fuori una
difesa che la consulenza non aveva bisogno di avere: **una cassa aperta si
riusa solo se il suo importo è quello di adesso.** Il prezzo di una consulenza
non cambia mai; quello di una proposta sì, con una riapertura. Senza il
controllo, il viaggiatore sarebbe finito su una cassa viva col prezzo vecchio.

**Il ponte Stripe: il ramo prenotazioni non è stato toccato.** Il ramo ordini è
una funzione a sé (`stripe_checkout_ordine`) e `stripe_webhook` guadagna uno
smistamento prima del codice della 0039. Un caso che il ramo prenotazioni non
aveva: il **secondo incasso** sullo stesso ordine. `payments_one_paid_per_kind`
vieta una seconda riga pagata, e segnarla `paid` avrebbe sollevato, riportato
indietro il blocco del ponte e fatto ritentare Stripe per sempre. Il tentativo
è protetto, e l'alert dice che l'incasso non è in `payments`.

**Una cosa trovata per strada, fuori dal prompt e corretta lo stesso.**
`my_orders` (0019) portava le colonne della proposta in ogni stato. Finché
nessuno le scriveva prima dell'invio era innocuo; dalla 0044 ci vive la bozza,
e il viaggiatore l'avrebbe letta con gli strumenti di sviluppo aperti — che è
esattamente la domanda che `CLAUDE.md` chiede di farsi a ogni vista. Ho
mascherato anche `proposal_pending_agency`, che è All Inclusive: non è
anticipare la milestone 7, è lo stesso difetto (il Flusso vuole che una
proposta non verificata dall'agenzia non raggiunga il viaggiatore). Scritto in
milestone 7 insieme alle altre tre cose che la 0044 lascia a quella milestone.

**Tre cose dette invece che risolte**, tutte in `PIANO.md`: la mail al
designer quando il viaggiatore paga (il Flusso vuole il messaggio pronto anche
per mail, il prompt chiedeva due mail e sono due); l'indice del credito che
conta anche gli ordini annullati — e che adesso, col congelamento, il team non
può nemmeno aggirare a mano; la proposta a zero euro, che Stripe non sa
incassare. E le due pagine non hanno un disegno nel Figma.

**Errori miei, trovati dall'harness.** Il primo giro è caduto su due test
vecchi che creavano a mano il token `td_order_page`: adesso nasce con l'ordine,
e i test sono stati adattati a leggerlo invece di crearlo (non indeboliti: il
primo verifica anche che sia legato a ordine e designer giusti). Poi un test
mio che creava un ordine dentro lo stesso `exec` di un'asserzione che doveva
fallire — e il fallimento si portava via anche l'ordine.

---

**23 settembre 2026 — due protezioni giuste che si annullavano a vicenda**

Il bottone della pagina del servizio prendeva 403: `POST
/servizio/<token>/richiedi` rispondeva *origine non riconosciuta*, e il valore
arrivato era la **stringa `"null"`**.

Le due misure in gioco erano entrambe corrette, prese una alla volta.
`next.config.ts` metteva `Referrer-Policy: no-referrer` sulle pagine a token,
perché il link WhatsApp in fondo non regalasse il token al sito di destinazione
(voce del 20 settembre). La route controllava l'`Origin` contro CSRF. Ma per la
specifica Fetch, su una richiesta **non-GET fuori dalla modalità CORS** — cioè
l'invio di un `<form>` HTML — `no-referrer` fa serializzare l'origine come
`null`. Con `fetch()` non succede, perché `fetch()` lavora in modalità CORS di
default. Il bottone però è un form senza JavaScript, e lo è di proposito: i link
delle mail si aprono in ogni sorta di browser. Quella scelta resta com'è.

**Nessuno dei due test automatici poteva vederlo.** L'harness prova Postgres, e
questo comportamento vive nella specifica del browser. È la stessa famiglia di
`bookingSuccessfulV2` e del corpo rifiutato da Cal.com: il difetto non sta mai
dentro un pezzo, sta nella giuntura fra due pezzi.

Due correzioni, perché i difetti erano due.

1. **`strict-origin` al posto di `no-referrer`.** Manda solo schema e host,
   **mai il percorso**, quindi il token non esce comunque. Nel commento di
   `next.config.ts` c'è scritto perché non è `no-referrer`: senza quel commento,
   fra sei mesi qualcuno lo "rafforzerebbe" e rimetterebbe il difetto.
2. **Il confronto non passa più da `origineDi()`.** Quella funzione nasce per
   costruire gli URL assoluti da dare a Stripe, e per farlo si fida di
   `x-forwarded-host`. Usata come valore *atteso* di un controllo anti-CSRF, il
   valore di confronto veniva da un header che il proxy può riscrivere: chi
   potesse toccarlo decideva **entrambi i lati del confronto**. Adesso c'è
   `origineAmmessa()` in `lib/origine.ts`, che risponde a una domanda più
   piccola: *l'`Origin` combacia con l'`Host` di questa stessa richiesta?* Se
   l'header manca si passa ancora, come prima, perché non tutti i client lo
   mandano. **`"null"` invece si rifiuta**: non è un'origine, è il segno di un
   contesto opaco (iframe sandbox, `file://`, redirect fra origini).
   `origineDi()` resta dov'era: serve al redirect 303 della stessa route e alla
   cassa Stripe, cioè a costruire indirizzi, che è il suo mestiere. Nessun altro
   punto la usa per verificare.

Prove. Con curl sul server locale: senza `Origin` → 303; `null` → 403;
`http://localhost:3000` → 303; host estraneo o porta diversa → 403; un
`X-Forwarded-Host` falso **non** fa più passare un'origine estranea. In Chromium
headless, con una pagina che imita la nostra (form + link esterno) e un token
finto, le due policy una accanto all'altra:

| Policy | `Origin` del form | POST | `Referer` verso l'esterno |
|---|---|---|---|
| `no-referrer` | `null` | 403 | nessuno |
| `strict-origin` | `http://localhost:3000` | 303 | `http://localhost:3000/`, senza il percorso |

Manca ancora la prova con un token vero, cioè il bottone che fa nascere
l'ordine: la deve fare Simone a mano.

---

**20 settembre 2026 — la cerniera del dopo-call, e la posta che parte davvero**

La call finisce, la mail si compone, il viaggiatore clicca, nasce l'ordine. È il
primo pezzo che attraversa tutte e quattro le parti del sistema nello stesso
giro — orologio, Postgres, n8n, una pagina a token — e apre la milestone 6.
Harness a **458 asserzioni** (erano 387), verdi.

Il permesso di costruirlo è arrivato oggi da una cosa successa altrove:
**S-04 è chiuso**. Il provider di invio non è stato creato, è stato *trovato* —
l'account Resend della landing page, con `xpetis.it` già verificato da mesi. Con
lui cade la riga che la 0041 aveva scritto in fondo a `clock_tick()`: *«i rami
usciranno come compiti `email_*` il giorno che esiste un provider di invio»*.

**I testi delle mail sono diventati dati, e non in `app_config`.** La regola del
progetto — niente numeri di prodotto nel codice — vale identica per il
contenuto: un testo dentro un `.tsx` è una promessa commerciale che per cambiare
richiede un deploy, e chi la riscrive è Gaia, che non apre un editor. Ma
`app_config` è «una riga, un valore scalare», e il suo vincolo XOR fra `value` e
`value_text` esiste proprio per tenerla tale: una mail ha oggetto, corpo lungo,
etichetta del bottone e segnaposto ammessi, cioè quattro campi correlati. Quindi
una tabella sua, `message_templates`.

La decisione dentro la decisione è **che cosa si lascia scrivere**. Il corpo è
prosa: righe vuote fra i paragrafi, un indirizzo in chiaro che diventa link, e
nient'altro. Niente HTML. L'impaginazione la mette `testo_in_html()`, e la
ragione è che un tag aperto e mai chiuso, scritto per sbaglio da Studio,
**arriverebbe a un cliente vero e nessuno se ne accorgerebbe prima di lui**.
Con un corollario che mi piace: un paragrafo fatto solo da un segnaposto di
blocco esce senza involucro, ed è la regola che impedisce a un bottone di finire
dentro un `<p>` — dove metà dei client di posta lo stampa storto. Chi scrive non
deve saperlo, gli viene naturale lasciare il segnaposto da solo sulla sua riga.

E **un segnaposto non fornito fa fallire la composizione** invece di finire in
pagina o sostituirsi col vuoto. «Ciao ,» e «{{designer}}» sono due modi di
rompersi che vede solo il destinatario: fallire scrive un alert e non accoda
niente.

**`outbound_messages` da registro a coda.** Nasceva (0014) come diario di cosa
era partito: `sent_at` con default `now()`, nessun corpo. Il default se n'è
andato, ed è il cambio che conta — una riga che dichiara di essere partita senza
esserlo è peggio di una riga assente, perché è una bugia che nessuno va a
controllare. Il corpo invece si conserva per una ragione operativa e non di
archivio: **è così che Gaia corregge le mail sul vero e non su un documento.**
Si leggono su Studio come le leggerà un cliente.

⚠️ E c'è una riga in quella migration che vale più di tutte le altre:
`update outbound_messages set status = 'sent' where sent_at is not null;`.
Senza, `status` con default `queued` avrebbe trasformato tutto lo storico del
registro in posta da spedire. Oggi sono poche righe di prova; il giorno che non
lo fossero, quella migration avrebbe mandato mail vecchie di mesi a gente vera.

**Comporre sta in Postgres, e questo è il punto su cui ho deviato da un
precedente del progetto.** `CLAUDE.md` dice: i numeri del match in Postgres, la
composizione delle frasi nella route server. Ma quella regola nasce da un fatto
che qui non c'è — le frasi del match si compongono *per una pagina che qualcuno
sta guardando*, dentro una richiesta HTTP che esiste comunque. Una mail no: la
compone l'orologio, alle tre di notte, senza nessun browser nel giro. Metterla
in una route vorrebbe dire far chiamare al database un endpoint del nostro sito
per ottenere una stringa, e un deploy in corso diventerebbe una mail non
composta. Il secondo motivo vale di più: **l'harness prova Postgres.** Composta
lì, la mail si verifica; composta in TypeScript, la si guarda.

**L'orologio è diventato davvero a rami, e l'ho fatto perché si stava rompendo
in silenzio.** La 0041 dichiarava la struttura; la 0042 la mise alla prova e
funzionò, ma riemettendo trecento righe per aggiungerne trenta — col risultato
che i due file contenevano due copie parola per parola del ramo degli insoluti.
È esattamente la cosa contro cui entrambe quelle migration mettono in guardia
altrove («due copie sono il modo in cui due copie divergono») e che si erano
fatte lo stesso, perché riemettere sembrava il prezzo inevitabile. Non lo era:
adesso ogni ramo è una funzione, `clock_tick()` è un orchestratore di dodici
righe, e aggiungere una scadenza è scrivere una funzione e aggiungere una riga.
Il ramo 1 è stato **spostato**, non riscritto — e le cinquanta asserzioni
dell'orologio, scritte tre giorni fa, sono passate al primo colpo, che è
esattamente il lavoro per cui esistevano.

**Il grilletto è una prenotazione `confirmed` con `ends_at` passato**, e la prima
cosa che ho dovuto decidere è cosa succede al primo giro dopo l'applicazione:
incontrerebbe *tutte* le consulenze già finite, comprese quelle fabbricate nei
collaudi, e i loro viaggiatori sono indirizzi veri. Da lì due difese, e sono
diverse fra loro. Una **finestra di età** (`postcall_email_max_age_hours`),
perché una mail che chiede «com'è andata la call?» tre giorni dopo fa più danno
che bene — e quello che cade fuori **si dichiara** con un alert, invece di
sparire in silenzio. E un **interruttore che nasce spento**, che però non spegne
la composizione: le mail si compongono e si accodano lo stesso. È la condizione
perché Gaia legga la coda su Studio prima che parta una sola mail, ed è anche il
primo dei tre gradini delle prove (spenta → dirottata su una casella di prova →
viva).

**Le pagine a token, ferme dalla 0012.** `resolve_access_token()` diceva sì o no,
e per una funzione che deve solo decidere se procedere va benissimo. Per una
pagina no: chi ha un token scaduto è una persona legittima con un link vecchio e
merita di sapere cosa fare, mentre chi ne ha uno inventato no. Ho scritto dove
passa la linea invece di lasciarla implicita: **un token che non esiste riceve
una risposta generica, un token che esiste riceve la risposta onesta.** Per
leggere una risposta onesta bisogna già possedere un token vero, cioè aver avuto
il link; a chi prova stringhe a caso la funzione dice sempre la stessa cosa e
non distingue «quasi giusto» da «sbagliatissimo». E i tentativi a vuoto **si
contano**, con la stessa forma del contatore delle firme rifiutate: una difesa
senza un testimone non si sa se ha mai lavorato. La vecchia
`resolve_access_token()` non è stata lasciata a sé: è diventata un involucro
sottile sopra quella nuova, perché due copie eccetera.

**Il clic è un POST, e questa è la cosa che rifarei anche se costasse di più.**
La strada breve era far creare l'ordine al link della mail. I link delle mail
però **vengono aperti da macchine**: gli antivirus aziendali li visitano per
controllarli, Outlook li riscrive e li apre con SafeLinks, Gmail precarica. Un
indirizzo che crea un ordine appena viene aperto produrrebbe richieste che
nessuna persona ha mai chiesto, e il team aprirebbe gruppi WhatsApp per nessuno.
Quindi il link **mostra** e un bottone **fa**, con un form HTML che funziona
senza una riga di JavaScript — chi arriva qui a volte arriva dal browser dentro
un'app di posta.

**Poi ho guardato in faccia la cosa che il perimetro mi chiedeva di guardare:
questi token non scadono mai.** È una decisione di prodotto del Flusso, e ha
ragione — il viaggiatore deve poter cliccare a mesi. Ma quel link vive per
sempre in una casella inoltrabile, sincronizzata su tre dispositivi. Chi se lo
trova **non può impegnare un euro**: crea una richiesta in `requested`, senza
prezzo, che una persona del team lavora, e l'ordine porta `traveler` come attore
con il token annotato nel diario, quindi si riconosce e si cancella. Il danno
massimo è far lavorare a vuoto il team una volta.

Quello che vale di più però non è l'ordine: **è quello che la pagina racconta.**
Chi ha il link sa che quella persona ha fatto una consulenza con quel designer.
Per questo la pagina mostra il designer e il servizio, e **non** il nome del
viaggiatore, il telefono, la domanda di contesto o il profilo quiz — e le pagine
token hanno `noindex` e `Referrer-Policy: no-referrer`, che è quello che conta
davvero: senza, il link WhatsApp in fondo regalerebbe il token al sito di
destinazione nel `Referer`.

E da lì la regola che lascio scritta per le milestone 6 e 7, perché è una
decisione presa oggi che vincola domani: **dietro un token permanente non va mai
un'azione che muove denaro o consegna un file.** Il pagamento di una proposta
passa da una cassa che ridichiara l'importo; la conferma dell'agenzia, che
sblocca una cascata, nascerà `single_use` e con una scadenza.

**Tre cose piccole che mi hanno costretto a cambiare qualcosa di esistente.**

1. L'indice della 0012 ammetteva **un token attivo per scopo su ogni entità**, e
   la mail post-call porta un bottone per servizio. Il servizio sta nel
   `payload` del token e non in un parametro della richiesta — altrimenti chi ha
   il link del servizio da 200 € potrebbe chiederne uno da 2.000 — quindi
   l'indice è stato rifatto includendo `payload->>'service_type'`. Sui token che
   non portano un servizio non cambia niente.
2. Cliccare due volte doveva essere innocuo, e non lo era: un indice unico
   parziale su `(source_booking_id, service_type)` fra gli ordini non cancellati
   ferma il secondo inserimento, e la funzione lo racconta con `gia_richiesto`
   invece che con un errore. Gli annullati restano fuori dall'indice, così un
   bottone torna a funzionare dopo una cancellazione.
3. L'alert «manca una riga di configurazione» della 0042 ne controllava due e
   diceva solo quelle. Adesso ne controlla undici, le **elenca**, aggiorna il
   proprio messaggio quando ne sistemi una e **si chiude da solo** quando non ne
   manca più nessuna. E controlla la colonna giusta — una riga numerica a cui
   qualcuno ha messo un testo è rotta, e chiedere «c'è almeno uno dei due
   valori?» direbbe che va tutto bene proprio nel caso peggiore. Questo l'ha
   trovato l'harness, non io: avevo scritto il controllo sbagliato e una
   asserzione della 0042 è diventata rossa.

**Su n8n ho fatto una scelta conservativa, e vale la pena dire perché.** Servivano
due rami, e la cosa idiomatica è uno **Switch**. Ho messo due nodi Code di tre
righe. Lo Switch ha uno schema di parametri che cambia fra le versioni del nodo,
e un workflow reimportato su un'istanza aggiornata può arrivare con le condizioni
vuote: un ramo con le condizioni vuote **lascia passare tutto**, cioè manderebbe
le mail a Cal.com. Dopo il 20 settembre — due difetti, entrambi nella giuntura
fra Postgres e n8n, entrambi invisibili perché l'esecuzione era verde — un
guasto silenzioso in più non lo volevo. Gli ack sono due nodi uguali invece di
uno per la stessa ragione: leggono `$('Un compito per riga').item` per sapere
quale compito stanno riferendo, e con due rami che confluiscono quel filo
dipenderebbe da come n8n appaia gli item di percorsi diversi.

**Resend l'ho letto invece di dedurlo**, che era la raccomandazione esplicita.
Tre cose ne sono uscite: il limite è **10 richieste al secondo** per team (da cui
il batching a un item ogni 250 ms sul nodo, e `email_max_per_tick`); il corpo
accetta `from`, `to`, `subject`, `html`, `text` e **nient'altro** va mandato,
perché è la lezione del *«uid property should not exist»* applicata prima di
prenderla di nuovo; e c'è una **`Idempotency-Key`** che vale 24 ore, che è
esattamente la difesa per il caso brutto — la mail parte, Resend risponde 200, e
l'ack non arriva perché n8n si è fermato in mezzo. Al giro dopo si riprova con la
stessa chiave, e Resend non manda il doppione.

Sul significato dei codici, la distinzione che ho messo in `clock_task_done()` è
fra **riprovabile** (`429`, `5xx`, nessuna risposta) e **definitivo** (qualunque
altro `4xx`). Un corpo malformato o un mittente non verificato non guariscono
riprovando: ritentarli ogni cinque minuti trasformerebbe un difetto in rumore di
fondo, che è il modo in cui non se ne accorge nessuno.

**Una cosa che era fuori perimetro e ho fatto lo stesso**, dicendolo: la **mail
cortese di chi perde lo slot**. Era l'unico pezzo mancante della riga
dell'orologio in milestone 4, esplicitamente parcheggiato su S-04 — che si è
chiuso stamattina. È una riga di seed e quindici righe dentro
`clock_task_done()`, si accoda nel momento in cui sappiamo che lo slot è stato
liberato *davvero*, e prova la coda su un secondo tipo di mail. Se Simone
preferisce tenerla fuori si toglie in due minuti.

**Cosa non è stato fatto, di proposito**: la vita dell'ordine su misura
(proposta, revisione, consegna), l'All Inclusive, le recensioni, e la **mail al
TD coi tasti eccezione** — che il Flusso fa partire allo stesso momento, ma che è
una riga a sé di milestone 6. Niente di quello che è entrato oggi li pregiudica:
la coda, i testi e l'impalcatura dei token sono gli stessi per tutte e tre.

⚠️ **E quello che non ho potuto provare resta quello di sempre:** l'harness prova
Postgres, e la giuntura fra Postgres e n8n è il punto che ci ha ingannato due
volte tre giorni fa. La forma della richiesta a Resend è verificata sulla
documentazione, non per analogia — ma verificare non è vedere. Le prove 27-40 in
`PIANO.md` sono scritte in quest'ordine apposta: le prime tre si fanno a
interruttore spento, e nessuna mail esce finché non lo decide una persona.

---

**20 settembre 2026 — i due silenzi di Cal.com, e quello che ho scartato**

Prima dell'onboarding dei 25, perché è il momento in cui il problema si
manifesta. Un designer può smettere di arrivarci in due modi, **entrambi senza
nessun segnale**: la parola segreta del webhook è sbagliata — `firma_non_valida`,
niente scritto da nessuna parte, n8n risponde 200 e Cal.com è contento — oppure
il webhook non c'è e non arriva proprio niente. Con 25 account configurati a
mano, che almeno uno dei due capiti non è un rischio: è una previsione.

**Il primo silenzio si conta.** `calcom_signature_ok()` tiene un contatore
(`0042_firme_rifiutate.sql`), e il ramo 2 dell'orologio alza l'allarme sopra
soglia. Due vincoli hanno deciso la forma: **una riga per ora, non una per
messaggio**, perché il "non si scrive" della 0037 non è un difetto da correggere
— l'indirizzo del webhook è pubblico, e un diario di tutti i corpi non
autenticati sarebbe una discarica scrivibile da chiunque; e il conteggio vive
dentro la funzione che già sa che una firma è stata rifiutata, invece di
riemettere le cinquecento righe della 0037 per aggiungerne tre. Il prezzo è che
una funzione che si chiama `..._ok` adesso scrive, e da `stable` diventa
`volatile`: va detto invece che nascosto, ed è scritto nella migration.

**La decisione difficile era se dire anche *di chi*.** Su una firma non valida il
corpo non è autenticato: leggerne `organizer.username` significa fidarsi di un
dato che chiunque può scrivere. Ma senza, l'alert dice "qualcuno manda firme
sbagliate" e con 25 account il team non sa dove guardare — decorativo. L'ho
incluso, e il rischio l'ho ridotto **alla fonte invece che nel testo**: si salva
soltanto un username che è **già uno dei nostri**, tutto il resto diventa
`null`. Così il peggio che può fare chi scrive corpi finti all'indirizzo pubblico
è indicare al team uno dei 25 designer veri — non inserire testo arbitrario in un
alert, non far comparire nomi inventati, e non far crescere la tabella oltre 26
righe l'ora. Resta un indizio: l'alert lo dichiara non verificato, nessun
automatismo ci agisce sopra, e il controllo che il team fa dopo (rigenerare la
parola segreta di quell'account) è innocuo anche se il nome era sbagliato. E nel
caso più probabile — la parola segreta sbagliata in onboarding — il nome è
**vero**, perché a mandare è davvero Cal.com.

**Il secondo silenzio l'ho affrontato scartando la soluzione che sembrava più
completa**, ed è la parte che vale la pena ricordare. La tentazione era un ramo
dell'orologio che avvisa se un designer non manda niente da N giorni. Il difetto
è strutturale: **in Beta un designer senza prenotazioni è indistinguibile da uno
col webhook rotto**, perché il segnale manca per la stessa ragione per cui manca
il traffico. Avrebbe prodotto 25 alert il primo giorno, il team avrebbe imparato
a ignorarli, e il giorno che uno è vero nessuno guarda. Un alert che grida al
lupo è peggio di nessun alert.

Al suo posto due cose che sono **evidenza invece che inferenza**, e nessuna delle
due è un workflow nuovo:

1. `calcom_webhook_non_arrivato` sa dire **quale designer**. Esisteva già ed era
   la prova diretta — qualcuno ha prenotato e a noi non è arrivato niente — ma
   non sapeva su quale account far guardare. Adesso lo slug della vetrina viaggia
   fino a `/attesa/cerca`, e il trattamento è quello di un dato che viene da
   fuori: serve **solo a cercare** una riga di `travel_designers`, e nell'alert
   finisce il nome che risponde il database, mai la stringa arrivata.
2. **La prenotazione di prova per designer, in onboarding.** È la parte che
   probabilmente conta più del codice, e non è codice: prende il caso più
   probabile — la parola segreta sbagliata dieci minuti prima — nel momento in
   cui costa trenta secondi correggerlo.

Scartato anche il **ping sintetico** (interrogare Cal.com per verificare che il
webhook sia configurato): sarebbe evidenza vera, ma leggere la configurazione di
un account richiede una chiave API **per account**, cioè le 25 chiavi che S-05 ci
ha appena risparmiato.

**E l'onboarding aveva un passo che induceva in errore.** Il vecchio punto 5
diceva di verificare su n8n → Executions. Ma con la parola segreta sbagliata
l'esecuzione è **verde**, 200, e il ponte ha risposto `firma_non_valida` senza
scrivere niente: a colpo d'occhio sembra che funzioni. Adesso il punto 5 è una
query su `bookings`, e `cal_webhook_ok_at` si scrive **solo dopo** — quella
colonna deve voler dire "provato", non "configurato". È la stessa forma
dell'errore di due giorni fa sul `curl`: **avevo verificato un pezzo e me l'ero
preso per la verifica del giro.**

*Due note che mentivano su Studio.* La correzione sul ripiego v1 era finita nel
commento di `seed/0001_config.sql`, ma **su Studio il commento del file non
esiste**: si vede solo la colonna `notes`, che diceva ancora che basta cambiare
l'indirizzo. E il seed ha `on conflict do nothing`, quindi modificare il file non
cambia una virgola di quello che una persona legge — le due `update` sono in
`PIANO.md`. Rileggendo le altre ne è saltata fuori una seconda, peggiore:
`reschedule_max_traveler` diceva "limite osservato da n8n", e **non lo osserva
nessuno** — il controllo è milestone 5. Un numero su Studio che sembra un limite
attivo e non lo è.

Harness a **405 asserzioni** (erano 387). Le nuove provano il conteggio, che non
si scriva in `webhook_events`, che un username inventato non entri, la soglia,
l'unicità dell'alert, la pulizia delle finestre vecchie, e il ramo spento che
dice di essere spento.

---

**20 settembre 2026 — l'orologio gira davvero, e i due bug erano nella giuntura**

Uno slot non pagato si libera da solo su Cal.com. Il giro del pagamento è chiuso
da bordo a bordo: si prenota, si paga, e se non si paga lo slot torna al
designer senza che nessuno guardi.

**La domanda che S-05 aveva lasciato aperta è chiusa.** L'API v2 pubblica di
Cal.com cancella una prenotazione **senza nessuna chiave**, conoscendo solo il
codice: 200, slot libero sul calendario, mail native di annullamento partite.
Quindi l'onboarding dei 25 designer resta senza la voce "raccogliere 25 chiavi
API", che era il rischio appeso a questo pezzo da luglio.

Ma l'orologio ha funzionato solo dopo **due correzioni fatte a mano sul
workflow**, e sono la parte che vale la pena ricordare.

*Il payload non era appiattito.* `clock_tick()` restituisce righe
`(task, entity_type, entity_id, payload)`, e `cancel_url`, `api_version` e
`reason` stanno dentro `payload`: il nodo `Cancella su Cal.com` li leggeva dal
livello alto e trovava `undefined`. L'appiattimento è finito nel nodo `Un compito
per riga` e non nei quattro riferimenti del nodo HTTP, così `task` ed `entity_id`
restano dove li legge l'ack e la forma del compito si accorda in un posto solo.

*Il corpo aveva due campi di troppo.* `uid` e `allRemainingBookings` sono campi
della v1; la v2 risponde **400 — "uid property should not exist,
allRemainingBookings property should not exist"**. Il codice sta già nel
percorso, e il corpo adesso porta solo il motivo.

**La lezione, che vale più dei due bug.** Stavano tutti e due nella **giuntura
fra Postgres e n8n**, e lì non arriva nessuno dei nostri strumenti: l'harness
prova Postgres — 387 asserzioni, tutte verdi anche mentre il giro non cancellava
niente — e TypeScript non vede dentro un workflow.

E vale la pena scrivere **perché i due ponti questo problema non potevano
averlo**: loro *ricevono*, e passano un corpo grezzo intero a una funzione che se
lo guarda da sola. Non c'è nessuna forma su cui accordarsi, quindi non c'è niente
che possa non combaciare. L'orologio *agisce verso l'esterno*, e il compito che
consegna è una struttura con dei nomi di campo: cioè **un contratto, e non lo
verifica niente**. I rami 2, 3 e 4 — silenzio-conferma a 48 ore, promemoria del
giorno prima, chiusura a 5 giorni dalla consegna — passeranno tutti di lì, e ogni
campo nuovo sarà un'altra riga di quel contratto. Per questo l'appiattimento sta
in un punto solo e ha un commento sopra: è il posto in cui si guarda quando un
campo non arriva.

**La seconda lezione è più sottile, ed è un errore di ragionamento mio.** La
prova 17 aveva verificato che Cal.com cancella senza chiave, e da quel "funziona"
avevo dedotto che funzionasse anche la richiesta del workflow. Ma era **una
richiesta diversa**: stesso endpoint, corpo diverso — il `curl` della verifica
mandava solo `cancellationReason`, il workflow mandava anche `uid` e
`allRemainingBookings`. **Avevo verificato l'endpoint, non il corpo**, e la
verifica di un pezzo si era travestita da verifica del giro. È la stessa forma
dell'errore su `rescheduleUid`: fra "il contratto dice che c'è" e "funziona sul
nostro" c'è sempre una distanza, e quella distanza si paga una volta.

**Una cosa che il collaudo ha reso visibile e che resta vera.** Il nodo di
cancellazione ha `onError: continueRegularOutput` e *Never Error* acceso — giusto,
perché un braccio rotto non deve fermare l'orologio — con la conseguenza che
**un'esecuzione tutta verde può non aver fatto niente**. È così che il primo
difetto è passato liscio al primo giro. Dove si guarda davvero è finito in
`n8n/LEGGIMI.md`, con le query: `bookings.cancel_attempts` che cresce con lo
stato ancora `pending_payment` è la firma esatta di un braccio che non riesce, e
`event_log` porta il codice HTTP e la risposta.

*Riallineamento del repo, lo stesso giorno.* `n8n/orologio.json` contiene le due
correzioni, quindi una reimportazione non rimette i difetti. Corretta anche una
nota che dal 18 settembre **mentiva**: diceva che le due forme dell'endpoint
erano entrambe supportate — «se `{uid}` non compare nel modello, il codice
viaggia nel corpo» — e non è più vero, perché il corpo porta solo il motivo.
Tornare al ripiego v1 oggi costa una riga su Studio **e** una modifica al
workflow, e adesso il file lo dice. Una riga che mente in un file ce l'ha già
costata una volta, col `client_secret*/` nel `.gitignore`.

*Cosa NON è chiuso.* Il giro del pagamento sì, **la milestone 4 no**: mancano i
testi che convivono con le mail native, il calendario admin, il percorso "slot
introvabile", il controllo di vitalità dei 25 webhook e i tre campi del form
sulla pagina della prenotazione. E la mail a chi perde lo slot resta appesa a
S-04: oggi quel viaggiatore riceve **solo** l'annullamento nativo di Cal.com.

---

**18 settembre 2026 — l'orologio, e la domanda di chi scrive per primo**

L'ultimo bordo della milestone 4. Da oggi una prenotazione non pagata scade da
sola e lo slot torna libero sul calendario del designer: `0041_orologio.sql` per
la parte che decide, `n8n/orologio.json` per il braccio.

**La forma è diversa dai due ponti, e la differenza non è stilistica.** Cal.com e
Stripe *ricevono*: n8n consegna byte a una funzione Postgres e non guarda dentro,
quindi tutta la decisione sta nel database. Questo *agisce verso l'esterno* — per
liberare uno slot bisogna chiamare Cal.com, e Postgres non fa chiamate HTTP.
Quindi qui n8n fa qualcosa davvero. La domanda era *cosa*, e la risposta è: solo
il gesto. `clock_tick()` decide chi è scaduto, n8n esegue, `clock_task_done()`
decide cosa significa l'esito — e il braccio gli passa il **codice HTTP** che
Cal.com ha risposto, non un giudizio. Anche "questa cancellazione è andata bene"
è una decisione, e le decisioni stanno tutte da una parte sola.

**La scelta vera era chi scrive lo stato per primo**, e le due strade hanno
conseguenze opposte. Marcare `cancelled_unpaid` *prima* della chiamata: se
Cal.com fallisce restano una riga chiusa e uno slot occupato, e **nessuno se ne
accorgerà mai più**, perché l'orologio non ripassa sulle righe chiuse — un danno
silenzioso e permanente. Marcare *dopo*: se la chiamata fallisce la riga resta
`pending_payment`, cioè scaduta e ancora da liberare, e il giro successivo la
ritrova. Si marca dopo. È la stessa regola che il ponte Cal.com applica da
settembre a `webhook_events.processed_at`, che sugli errori resta nullo perché il
ritentativo riprovi: **in questo database un lavoro non riuscito non deve
somigliare a un lavoro fatto.** Il prezzo è una finestra di qualche secondo in
cui lo slot è già libero e la riga dice ancora "da pagare"; il prezzo dell'altra
strada è uno slot perso per sempre. E il ciclo non gira all'infinito:
`cancel_attempts` conta, e dopo tre tentativi l'orologio smette e chiama una
persona — un braccio rotto deve diventare un allarme, non un rumore di fondo.

**La trappola che mi ha fatto scrivere un trigger.** Appena il braccio cancella,
Cal.com manda un `BOOKING_CANCELLED` **al nostro stesso ponte**, che attribuisce
la cancellazione confrontando `cancelledBy` con `organizer.email`: uguale il
designer, diverso il viaggiatore. Su una cancellazione fatta via API non sappiamo
cosa Cal.com metta lì — e se ci mettesse la mail del viaggiatore,
`booking_status_history` direbbe che ha cancellato lui. Quella riga è **l'unica
prova di chi ha agito**, perché il designer non ha login: da una riga sbagliata
discenderebbero un contatore mosso sulla persona sbagliata e un arbitrato deciso
su un fatto falso. La regola quindi non sta nel ponte, dove varrebbe per una
porta sola: sta nel database. `bookings_force_system_cancel_actor` attribuisce al
sistema ogni cancellazione su una riga che porta `cancel_requested_at`, da
qualunque porta entri — webhook, ack del braccio, o una mano su Studio. Non ho
riemesso `calcom_webhook()` per cambiarne cinque righe su cinquecento: due copie
della stessa funzione nel repo sono due copie che divergono. Il limite è scritto
nella migration — `event_log` conserva l'attore calcolato dal ponte, che in quel
caso può essere sbagliato; la prova che conta no.

**Una cosa che non torna, e non l'ho aggiustata di nascosto.** La regola del
Flusso dice che uno slot non pagato resta occupato al massimo 35 minuti, e il
conto vero è `finestra + grazia + cadenza`: la cadenza entra perché una riga che
scade subito dopo un giro aspetta un giro intero. Con i valori di oggi fa
**30 + 0 + 5 = 35 esatti**, cioè siamo *sul* limite e non c'è spazio per la
grazia — che invece servirebbe, perché la cassa Stripe può restare aperta circa
un minuto oltre la nostra scadenza (`expires_at` accetta minimo 30 minuti e la
route taglia al minimo invece di esplodere). Comprarsela vuol dire accorciare la
finestra a 28 o la cadenza a 2, e sono decisioni di prodotto, non mie:
`booking_cancel_grace_min` nasce a **zero** ed è in `PIANO.md` come scelta di
Simone. Nel frattempo `clock_tick()` ricontrolla il conto **a ogni giro** e alza
un alert se qualcuno lo sfonda — perché quei parametri si cambiano da Studio,
dove nessun test passa.

**Costruito come un orologio, non come un timer.** Un solo workflow per tutte le
scadenze, a rami: i lavori che il database sa fare da solo restano dentro la
funzione, quelli che hanno bisogno del mondo di fuori escono come compiti nella
forma `(task, entity_type, entity_id, payload)`. Milestone 5 e 6 ne portano altri
tre — silenzio-conferma a 48 ore, promemoria del giorno prima, chiusura a 5
giorni dalla consegna — e aggiungerli è aggiungere un ramo, non un secondo
workflow.

**Quello che l'harness prova e quello che non prova.** Prova la parte che decide,
che è tutto il punto: 387 asserzioni (erano 349) sui casi storti — scaduta ma
pagata, scaduta da un secondo, già liberata, tentativi esauriti, e la riga con
`payment_deadline_at` nullo, che la route della cassa tratta come pagabile senza
limite e che quindi l'orologio **non deve toccare**. Prova anche il ritorno del
webhook con `cancelledBy` che dice "viaggiatore", e verifica che la storia dica
`system`. Non prova il braccio: quella è una chiamata HTTP a un servizio di terzi,
e le prove sono in `PIANO.md`, dalla 17 alla 22.

⚠️ **E c'è una cosa che non ho potuto verificare, ed è la prima da fare.** Quale
indirizzo di Cal.com cancella una prenotazione senza chiave. S-05 ha stabilito il
fatto che conta — *non serve nessuna chiave, basta il codice della prenotazione*
— ma non ha registrato **quale endpoint**, e `GUIDA_PONTE_CALCOM.md` §9.4 dava la
domanda per aperta: i due documenti non dicevano la stessa cosa, e il più recente
vince solo sul fatto, non sul dettaglio che non contiene. Per questo l'indirizzo
non è nel workflow ma in `app_config.calcom_cancel_url`: se il candidato è
sbagliato si cambia una riga da Studio, e in `n8n/LEGGIMI.md` c'è il `curl` che
lo verifica in un minuto, col ripiego da provare per secondo. Se **nessuno** dei
due funziona senza chiave, S-05 va riaperto e significa 25 chiavi API da
raccogliere in onboarding: è una decisione di prodotto, non un dettaglio, e va
fermata lì.

**La mail cortese a chi ha perso lo slot non c'è**, ed è l'unico pezzo di questa
riga del piano che manca. Il provider di invio non esiste (S-04) e inventarne uno
qui vorrebbe dire mandare le mail di XPETIS da un dominio non autenticato, cioè
bruciare la reputazione di invio prima di cominciare. Il posto dove andrà è
dichiarato nel codice. Intanto una mail il viaggiatore la riceve lo stesso —
quella nativa di Cal.com, che resta accesa per la deviazione 5, e che porta il
motivo scritto in `app_config.unpaid_cancel_reason`.

---

**18 settembre 2026 — "Le mie prenotazioni": non una comodità, un'uscita**

La cosa non ovvia di questa pagina è che **non è un'area personale, è la toppa a
un percorso che non aveva uscita**. Fino a oggi chi chiudeva la scheda fra la
prenotazione e il pagamento non aveva nessun modo di tornare indietro: nessuna
lista, e la mail che gli darebbe il link non esiste perché il provider di invio è
ancora un punto aperto (S-04). Quella prenotazione diventava irraggiungibile e
scadeva da sola, lasciando occupato uno slot sul calendario di un designer. In un
disegno guidato dalle mail una lista personale sarebbe stata comodità; senza le
mail è l'unica porta.

**E la mail serve lo stesso**, non è stata sostituita: questa pagina copre chi
torna sul sito da sé, che sono pochi. Gli altri li raggiunge solo chi li va a
cercare nella loro casella.

Costruita senza toccare il database: `my_bookings` esiste dal 4 agosto
(migration `0019`) ed era già stata scritta per questo, `payment_deadline_at`
compreso dalla `0038`. Quattro scelte, in ordine di quanto costavano se
sbagliate.

*Si legge con il client della sessione.* `my_bookings` filtra su `auth.uid()`, e
con la chiave secret `auth.uid()` è **nullo**: la vista tornerebbe zero righe e
la pagina direbbe "non hai prenotazioni" a chi ne ha tre, **senza nessun errore e
senza nessun segno**. È il guasto peggiore di questa pagina proprio perché
somiglia a un dato mancante invece che a un difetto.

*Lo stato mostrato non è `status`.* `pending_payment` non vuol dire "pagabile":
l'orologio dei 5 minuti non esiste ancora, quindi ci sono — e continueranno a
esserci — righe scadute che nessuno ha portato a `cancelled_unpaid`. L'autorità è
`payment_deadline_at`, la stessa che applica la route della cassa, **compreso il
caso della scadenza assente**, che là vale pagabile e qui deve valere uguale. I
sette stati diventano nove situazioni (`lib/prenotazioni.ts`), e nessuna resta
muta: `completed`, `no_show` e `disputed` hanno la loro frase, perché una riga
che non dice niente diventa un messaggio al team.

*Il percorso è scelto, non ereditato.* `/le-mie-prenotazioni` e non
`/prenotazioni`, che sarebbe più corto e disterebbe **una lettera** da
`/prenotazione/[id]`. Una "i" persa o aggiunta in un `href`, in un redirect o in
un `?next=` non rompe niente di visibile e nessun controllo di tipo la
intercetta.

*Estratto invece che ricopiato.* `Conto` e il tasto *Paga* vivevano dentro
`stato-prenotazione.tsx`, e in quel tasto stanno tre comportamenti che si
scoprono solo sbagliandoli: il bottone che si spegne mentre parla con Stripe (la
prova 10), la risposta `in_conferma` che vuole attesa e non un secondo tentativo,
il `router.refresh()` su ogni fallimento. Una seconda copia sarebbe partita
completa e sarebbe rimasta indietro alla prima correzione.

Nel farlo è saltato fuori un difetto vecchio: **la pagina della prenotazione era
muta su `completed` e `no_show`** — testata con data e prezzo, e sotto il vuoto.
Non si vedeva perché senza una lista nessuno ci arrivava; con la lista ogni riga
ci manda. Corretto lì.

Una cosa che non si è costruita: **gli ordini**. Nascono nelle milestone 6 e 7,
`my_orders` esiste dalla `0019`, e in fondo alla pagina c'è il commento che dice
dove vanno e cosa non rifare. Una sezione vuota per mesi sarebbe stata una
promessa che il sito non mantiene.

Harness verde (nessuna modifica allo schema), build e lint puliti. Il linter ha
fermato una cosa giusta: `Date.now()` dentro la resa di un componente viola la
regola di purezza di React, e l'orologio si legge una volta sola dentro
`ordinaPrenotazioni`.

---

**18 settembre 2026 — le sedici prove, e l'evento visto scattare**

Simone ha eseguito tutte e sedici le prove nel browser: **passate.**

*Cosa chiude davvero.* Era la parte che nessuno dei due poteva verificare:
l'harness gira su PGlite, io non ho un browser, e il pezzo centrale è un **iframe
di terze parti**. Del contratto degli eventi Cal.com avevamo soltanto i tipi
pubblicati di `@calcom/embed-core@1.5.3` — la pagina di documentazione non nomina
`bookingSuccessfulV2`, elenca gli eventi interni e dice di non fidarsene — e la
strada alternativa, il *Redirect on booking* sull'event type, era stata scartata
su prova documentale (issue `#18144`) senza essere provata. **Ora l'evento è
stato visto scattare su un embed vero.** Fra "il contratto dice che c'è" e
"scatta da noi" c'era la distanza che con Cal.com avevamo già pagato una volta,
su `rescheduleUid`. Questa volta non l'abbiamo pagata.

*I quattro che contano più degli altri* sono quelli che nessun test automatico
può coprire, perché vivono in un browser e in una sessione: l'open redirect su
`?next=` non porta fuori dal sito; il doppio clic su *Paga* produce **una sola**
riga in `payments`, che è la ragione per cui esistono
`payments_one_pending_per_kind` e l'ordine invertito nella route — riga prima,
Stripe dopo; la prenotazione di un altro account dà **404** e non un errore di
permessi, perché "non esiste" e "non è tua" devono dare la stessa risposta; e una
scadenza già passata fa **rifiutare** la cassa, che è la regola "l'autorità è
`payment_deadline_at`" applicata dal lato del browser.

*Cosa resta scoperto, per onestà.* Le prove sono state fatte **in sviluppo, su un
solo designer** — Marco Rossi, l'unico con un account Cal.com vero — e con un
solo account Google per il grosso. Restano fuori: la vetrina di un designer con
`cal_username` sbagliato (Giulia Neri nel seed ne ha uno che su Cal.com non
esiste: il controllo in `box-servizio.tsx` scatta su `cal_username` **nullo**,
non su "l'account esiste", quindi lì il viaggiatore vedrebbe l'errore di Cal.com
dentro l'iframe), e il comportamento in produzione, dove StrictMode non raddoppia
i montaggi e la resa è quella di `next build`.

Con questo la milestone 4 è completa **da bordo a bordo tranne l'orologio dei
5 minuti**, che resta l'unico pezzo mancante: senza, nessuna prenotazione non
pagata scade e nessuno slot si libera.

---

**18 settembre 2026 — "Le mie prenotazioni", e un percorso che non aveva uscita**

Vedi la voce scritta da Claude Code più sotto per il dettaglio del lavoro. Qui la
cosa da ricordare: questa pagina **non è una comodità**. Chiudeva un buco creato
dalla milestone 4 stessa — chi chiudeva la scheda fra la prenotazione e il
pagamento non aveva **nessun modo** di tornare indietro, perché la mail che gli
avrebbe dato il link non esiste (provider email = S-04, non fatto) e una lista
non c'era. Quella prenotazione diventava irraggiungibile e scadeva da sola,
lasciando occupato uno slot sul calendario di un designer.

⚠️ **La pagina copre solo chi torna sul sito da sé.** Chi non torna resta perso
comunque: per lui serve la mail, che è bloccata su cose non nostre — provider,
testi di Gaia, e una settimana di dominio da scaldare prima del primo viaggiatore
vero. Quella settimana va prenotata **all'indietro dalla data di lancio**, non in
avanti da oggi.

---

**8 settembre 2026 — il primo euro. Il giro del pagamento è vivo in sandbox**

Collaudo del ponte Stripe sull'infrastruttura vera, in tre gradini. Passati tutti
e tre.

*L'ambiente.* Endpoint creato nella sandbox da **Workbench** — che ha sostituito
la dashboard *Developers*, e si apre dal pulsante *Sviluppatori* in basso a
sinistra, non dal menu laterale: mezz'ora persa a cercarlo dove non c'è.
API version fissata a **`2026-07-29.dahlia`**, la stessa del codice e delle
fixture: la versione decide la forma dell'evento, e prendere "latest" avrebbe
consegnato al ponte un oggetto diverso da quello su cui è stato provato. Tre
eventi iscritti. Lo `whsec_` in Vault, e **una correzione a quanto credevamo**:
il signing secret di un endpoint **si può rivelare di nuovo** dalla dashboard
quando si vuole — non è una chiave API, non si vede una volta sola. Perderlo non
costa rifare l'endpoint.

*Gradino 2, l'evento sintetico di Stripe.* Esito `prenotazione_sconosciuta` con
alert critico, `riferimento: assente`. **Ed è la risposta giusta**: l'evento di
prova di Stripe porta una sessione finta senza `metadata.booking_id`. Il valore
del gradino sta in cosa dimostra il fatto che quella riga *esista*: se la firma
non fosse stata verificata il ponte si sarebbe fermato al primo controllo, senza
guardare la sessione e senza scrivere niente. Quindi in un colpo — URL giusto,
workflow attivo, corpo grezzo sopravvissuto a n8n, **segreto in Vault identico a
quello dell'endpoint**, e permessi di scrittura. L'alert è stato poi cancellato:
un falso allarme di collaudo che resta in `team_alerts` è peggio di nessun
allarme.

*Gradino 3, un pagamento vero.* Saltando l'unico pezzo non ancora costruito —
l'embed Cal.com sulla vetrina — con il codice XPETIS incollato a mano nella
prenotazione, come nelle prove di agosto. Risultato: prenotazione **`confirmed`**,
pagamento **`paid`**, 6.000 centesimi, `paid_at` e `stripe_checkout_session_id`
pieni, `processed_at` pieno, **e `team_alerts` vuoto**.

Quel silenzio è la parte informativa. Nessun `stripe_importo_non_combacia`
significa che il controllo contro `bookings.price_cents` ha trovato l'importo
giusto — e che l'adaptive pricing spento nella route sta facendo il suo lavoro.
Nessun `stripe_riga_pagamento_ricostruita` significa che la route ha registrato
la sessione **prima** che il webhook arrivasse: è passato il percorso normale,
non quello di recupero.

*Cosa chiude, precisamente.* Il limite dichiarato il 7 settembre era che la
fixture del `completed` è **ricostruita**, perché il PaymentIntent di una
Checkout Session non si può confermare via API: l'unico percorso su cui passano i
soldi non era mai stato attraversato da un payload Stripe autentico e firmato.
Adesso lo è. **La verifica della firma, il controllo dell'importo e la conferma
della prenotazione sono stati esercitati su un evento vero**, non su una nostra
ricostruzione.

*Cosa il collaudo non ha toccato, e va detto.* L'imbocco del funnel non esiste:
il tasto *Prenota la call* sulla vetrina è `disabled` per scelta, l'iframe Cal.com
non è incorporato, e nel sito non c'è nessun bottone per entrare — il login
funziona ma si raggiunge solo da `/prova`. Il giro del pagamento è stato
costruito **dal centro verso i bordi**: manca l'orologio da un lato e
l'imbocco dall'altro. Oggi funziona e non si vede.

---

**8 settembre 2026 — l'imbocco del funnel, e un segreto in git**

La milestone 4 funzionava e non si vedeva: costruita dal centro, senza l'orologio
da un lato e senza l'imbocco dall'altro. Oggi entra l'imbocco. `/accedi`,
l'embed Cal.com sulla vetrina, il passaggio automatico a `/attesa`, migration
`0040`. Harness a **349 asserzioni**, verdi.

*Prima di tutto: il client secret di Google era in git.* La riga di `.gitignore`
che doveva coprirlo era `client_secret*/.next/` — due righe finite in una — e
`client_secret*/` con la barra finale è un pattern di **cartella**: non ha mai
intercettato un file. Il segreto è tracciato dal commit `ce5aafa`, cioè dal
primo. Tolto dall'indice, cancellato dal disco, riga corretta; ma togliere un
file dall'indice **non lo toglie dalla storia**, e riscrivere la storia di un
repo condiviso è peggio del problema. Quindi va ruotato, la procedura in quattro
passi è in `ACCESSI.md`, e la fa Simone. Vale la pena essere precisi su cosa
poteva farci chi l'aveva: da solo un client secret non apre l'account Google di
nessuno, serve a farsi passare per la nostra applicazione nello scambio del
codice OAuth. Abbastanza per montare un login che sembra XPETIS, non per entrare
in un account. Va ruotato comunque, e prima del lancio: dopo, quel client ID
sarà su una pagina pubblica.

> **Chiuso lo stesso giorno.** Simone ha generato il secret nuovo su Google Auth
> Platform, l'ha incollato in Supabase, riprovato il login e **cancellato il
> vecchio**: quello che sta in `ce5aafa` non funziona più. La rotazione non ha
> avuto finestre di disservizio — *Add Secret* lascia vivo il precedente, e il
> secret serve solo nello scambio del codice, quindi le sessioni aperte non si
> rompono. Il `client_id` non cambia, quindi niente da aggiornare altrove.
>
> Una nota di metodo che vale la prossima volta: **provare il login con
> entrambi i secret attivi non dimostra nulla** — funzionerebbe anche col
> vecchio, quindi un incolla sbagliato darebbe verde comunque. Il segnale vero
> arriva disabilitando il precedente (reversibile) e riprovando. E la prova
> oggettiva non è la pagina che si ricarica, è `auth.users.last_sign_in_at`: quel
> timestamp si muove solo se lo scambio con Google è riuscito.
>
> Resta 🔴 **la password del database**, che è ancora quella dei primi otto
> commit. Stesso ragionamento, stessa cura richiesta.

*Tre link nell'header, tre risposte diverse — ed è il punto.* Tutti e tre
puntavano a un 404, ma non erano lo stesso problema. **`/accedi`** era una pagina
mancante e basta: il componente esisteva, la catena OAuth funzionava, ho scritto
il contenitore. **`/designer`** non era niente da inventare: la pagina che scopre
i Travel Designer esiste, si chiama `/ricerca` e sta nel Figma — l'header ora ci
punta diretto e `/designer` reindirizza, perché quell'indirizzo è già pubblicato
su Vercel e un indirizzo dato una volta deve continuare a portare da qualche
parte. **`/travel-designer`** invece è una **domanda**, non un buco: il Flusso non
descrive nessuna pagina di reclutamento, il Figma non la mostra, i 25 designer
arrivano da un form esterno gestito a mano, e costruirla vorrebbe dire decidere
per il business chi può candidarsi. Voce spenta con la spiegazione al passaggio
del mouse, e riga in `PIANO.md`. È il corollario di `CLAUDE.md` applicato tre
volte con tre esiti: l'assenza di una cosa nel Figma non è una decisione, ma non
è nemmeno sempre lo stesso tipo di assenza.

Il footer aveva lo stesso `/travel-designer` più altri quattro 404. Ho spento
solo quello, e ho **lasciato link** `/viaggi-di-gruppo`, `/about`, `/privacy`,
`/contatti`: quelle pagine *devono* esistere — la privacy per obbligo di legge —
e spegnerle direbbe "non ci saranno", che è falso. Sono due categorie diverse e
meritano due trattamenti diversi.

*Il login sulla prenotazione è un cancello, e per un motivo tecnico.* L'header
dice giustamente che *Accedi* non è un cancello: la navigazione è anonima, lo
vuole il Flusso. Prenotare no, e la ragione non è di prodotto: senza utente
collegato non c'è UUID da mettere in `xpetis_user_id`, e una prenotazione senza
quel codice produce uno slot occupato sul calendario del designer e **nessuna
riga da noi** — il ponte risponde `viaggiatore_non_identificato`, alza un alert
critico, e qualcuno deve rincorrere a mano una call che il viaggiatore crede
prenotata. Il tasto quindi non deve *poter* aprire un embed senza UUID, e la
garanzia è strutturale invece che un `if`: senza utente il componente non rende
un bottone ma un link a `/accedi?next=<vetrina col servizio scelto>`, e il codice
che monta l'iframe non è raggiungibile.

Il `?next=` è validato: accetta **solo percorsi interni**. `next` arriva dalla
query e finisce in un `redirect`, quindi senza controllo `/accedi?next=https://…`
farebbe di quella pagina un trampolino verso l'esterno per chi si fida del nostro
dominio.

*La 0040, e la domanda che `CLAUDE.md` impone.* L'embed ha bisogno di
`cal_username` e `cal_event_type_slug` nel browser, e nessuna vista li esponeva.
Aggiunti a `public_td_showcase`, con la risposta scritta e non sottintesa: diventa
leggibile la **corrispondenza designer → account Cal.com**, quindi si può
prenotare dalla pagina Cal.com nuda saltando il nostro flusso. Non è un buco che
apriamo noi — quella pagina è pubblica per costruzione, è raggiungibile cercando
il nome del designer o leggendo il link in una delle mail native che teniamo
accese (deviazione 5), e il ponte gestisce già quel caso con
`viaggiatore_non_identificato`. Quello che **non** diventa leggibile è
`cal_booking_uid`, e c'è un'asserzione che verifica che la vista non lo nomini
nemmeno dentro il jsonb. Sapere *dove* prenotare è diverso dal poter cancellare
la call di qualcun altro.

`create or replace view` invece di `drop` + `create` come fa la 0028: aggiungere
una colonna in coda è consentito, e così il `grant` non si perde. C'è
un'asserzione anche su questo, perché un `drop view` avrebbe spento la vetrina
per `anon` senza che niente fallisse in migration.

*Come si sa che la prenotazione è finita: verificato, non dedotto.* Due strade
possibili, e la differenza fra loro è grossa.

La **prima** è il *Redirect on booking* sull'event type. **Scartata su prova
documentale**: dentro un embed inline il redirect naviga *l'iframe*, non la
pagina, quindi la nostra pagina di pagamento comparirebbe disegnata dentro il
calendario, incorniciata. È un difetto noto e aperto di Cal.com (issue `#18144`).
E anche se funzionasse sarebbero state **25 impostazioni da cambiare a mano**,
con la conseguenza già registrata sul dominio e sull'URL n8n da decidere prima
dell'onboarding.

La **seconda** è l'evento che l'embed emette. Qui la verifica è la parte che
conta, perché la pagina di documentazione degli eventi di Cal.com **non lo
nomina**: elenca solo gli eventi interni (`__iframeReady`, `__dimensionChanged`)
e dice espressamente di non fidarsene. Il contratto vero sta nei **tipi
pubblicati** del pacchetto: `@calcom/embed-core@1.5.3`,
`dist/src/sdk-action-manager.d.ts`, dove `EventDataMap` elenca
`bookingSuccessfulV2` con il suo payload campo per campo e marca il vecchio
`bookingSuccessful` come `@deprecated` con la nota — testuale — che V2 è quello
che potranno "documentare bene". Stessa fonte per un'altra assunzione che
altrimenti avrei dato per buona: `PrefillAndIframeAttrsConfig` è un
`Record<string, string | …>`, quindi passare `xpetis_user_id` nel `config`
dell'embed è supportato e non un trucco.

Quindi: ci si iscrive a **entrambi** gli eventi, e la scelta **non richiede di
toccare nessuno dei 25 account**. In `ONBOARDING_CALCOM_TD.md` è entrata una nota
che è un passo *da non fare* — lasciare *Redirect on booking* vuoto — più una
riga di checklist: se qualcuno lo compila per buone intenzioni, spegne il
pagamento di quel designer solo, e sarebbe difficilissimo da diagnosticare.

*Del payload dell'evento non si usa niente, e non è una dimenticanza.*
`bookingSuccessfulV2` porta anche `uid`, cioè il codice della prenotazione. Serve
solo il *fatto* che l'evento sia scattato: chi è il viaggiatore lo sa già il
server dalla sessione, e la prenotazione la ritrova da sé. Vale la pena essere
onesti su una cosa: quel codice **è comunque nel browser** appena l'embed mostra
la conferma, e non possiamo impedirlo — è Cal.com che lo mette lì. Quello che
dipende da noi è non accettarlo mai *dal* browser come se fosse una prova, e
questo resta vero.

*La via manuale, che deve esistere.* Sotto il calendario c'è sempre la riga «Hai
finito di prenotare e la pagina non è cambiata? → Vai al pagamento», che porta
esattamente dove porta l'evento. Se un giorno l'evento cambia nome, il
viaggiatore non resta chiuso davanti a una conferma Cal.com senza via avanti,
cioè con uno slot che il nostro orologio libererà fra mezz'ora mentre lui crede
di avere un appuntamento. E `/attesa` era già scritta per fallire bene: cerca
lato server, e se non trova avvisa il team. Cliccarla senza aver prenotato non fa
danni.

*Cosa ho verificato e cosa no, detto chiaro.* Ho verificato il contratto degli
eventi sui tipi pubblicati, ho scartato il redirect su prova documentale, e
l'harness copre la 0040. **Non ho visto l'evento scattare**, perché è un iframe
di terze parti in un browser e io non ne ho uno: fra "il contratto dice che c'è"
e "scatta sul nostro embed" c'è esattamente la distanza che con Cal.com abbiamo
già pagato una volta, su `rescheduleUid`. L'elenco preciso di cosa provare e in
che ordine — non collegato, collegato, prenotazione completata, webhook spento —
è in `PIANO.md`, milestone 4, con dentro anche lo snippet da incollare in console
per leggere quale evento arriva davvero se non si muove niente.

---

**8 settembre 2026 (terzo giro) — `bookingSuccessfulV2` è scattato, e il ref che bloccava `/attesa`**

Due cose, e la prima è la notizia buona: **l'assunzione più fragile del pezzo di
oggi ha tenuto.** `bookingSuccessfulV2` è scattato su un embed vero e la
navigazione verso `/attesa` è avvenuta, quindi il contratto letto nei tipi
pubblicati di `@calcom/embed-core` — quello che la pagina di documentazione degli
eventi **non** elenca — descrive il comportamento reale. Era il punto su cui
avevo scritto che fra "il contratto dice che c'è" e "scatta sul nostro embed" c'era
la distanza già pagata una volta su `rescheduleUid`. Questa volta non c'era.

*Il bug: due difese che si annullavano.* In `attesa-prenotazione.tsx` l'effetto
era protetto da un `useRef` (`avviato`) messo lì contro il doppio montaggio di
StrictMode, e aveva anche un cleanup che spegneva un flag di closure (`vivo`).
Insieme non facevano girare **nessuno** dei due cicli: la pagina restava su
"Stiamo registrando la tua prenotazione" per sempre, senza arrivare né alla cassa
né al messaggio di fallimento dei 33 secondi.

Il meccanismo, che vale la pena saper riconoscere: **un ref sopravvive al
rimontaggio, una variabile della closure no.** Primo montaggio,
`avviato.current = true`, il ciclo parte; smontaggio, il cleanup spegne il `vivo`
di *quella* esecuzione e il ciclo muore; rimontaggio, la seconda esecuzione trova
`avviato.current` ancora `true` — è lo stesso oggetto — ed esce prima di
cominciare. Il primo ciclo morto, il secondo mai nato.

`vivo` da solo era già la difesa completa: ogni esecuzione ha la propria
variabile, ogni cleanup spegne soltanto la propria, e resta in vita esattamente
un ciclo. Il ref non aggiungeva niente e toglieva l'unica esecuzione buona. La
regola generale è scritta nel file: **un `useRef` che fa da guardia a un effetto
che ha anche un cleanup è quasi sempre un errore** — il cleanup dice già "questa
esecuzione non conta più", il ref dice "nessuna esecuzione conta più", e sono due
cose diverse.

*Perché conta più della prima nota:* **il difetto si vedeva solo in sviluppo.**
In produzione StrictMode non raddoppia i montaggi, quindi l'unica esecuzione
girava e la pagina funzionava. Un bug che esiste solo dove si prova è comunque un
bug — è dove si prova che si decide se una cosa è pronta — e questo aveva la
proprietà peggiore possibile: **si presentava come "il webhook Cal.com non
arriva"**, mentre il webhook era arrivato benissimo e la riga era in tabella. Il
sintomo puntava sul pezzo sbagliato, e su un pezzo che ha una sua storia di
sorprese. Senza guardare il codice si sarebbe cercato in n8n.

*La passata sul resto del codice.* Cercato lo stesso schema — un `useRef` che fa
da guardia a un effetto con cleanup — e **non ce n'erano altri**: gli altri ref
sono nodi del DOM (`contenitore`, `campo`), e `inViaggio` in
`prenota-consulenza.tsx` non è quel caso, si alza soltanto quando l'evento scatta
ed esiste perché siamo iscritti a due eventi.

Ne è uscito un difetto **diverso** nello stesso posto concettuale: in
`stato-prenotazione.tsx`, `fine` era un ref inizializzato da una prop. Non ha mai
bloccato niente, ma un ref inizializzato da una prop rivaluta l'espressione a
ogni resa e conserva soltanto la prima: se `scadenza` cambiasse, il conto alla
rovescia continuerebbe a puntare alla scadenza vecchia, in silenzio. Diventato un
valore derivato, che sta nelle dipendenze dell'effetto. Un ref serve a ricordare
qualcosa *fra* le rese; là non c'era niente da ricordare.

*L'header adesso dice chi sei, e il costo è stato misurato invece che stimato.*
Leggere la sessione vuol dire leggere i cookie, e una pagina che legge i cookie
non si prerenderizza. Prima della modifica le sole pagine statiche erano `/` e
`/designer` — e `/designer` è un reindirizzamento che non rende l'header —
quindi **la modifica rende dinamica una pagina sola: la home.** Verificato
sull'uscita di `next build`, dove `/` è passata da `○` a `ƒ` e nient'altro si è
mosso.

E anche su quella il costo è più piccolo di come suona: `proxy.ts` intercetta già
`/` e chiama `getUser()` a ogni richiesta per rinfrescare il token, quindi la home
pagava già un giro verso Supabase e non è mai stata servita da una cache pura.
Quello che si aggiunge è la resa React, non l'autenticazione. **La strada
scartata** — header statico e stato del login risolto da un pezzo client — costa
meno in resa e molto di più in sostanza: mostrerebbe *Accedi* a chi è collegato
per qualche centinaio di millisecondi su ogni pagina, cioè il difetto che stiamo
correggendo, solo più breve.

Nel farlo è nato `lib/supabase/utente.ts`: `leggiUtente` avvolto in `cache()` di
React, perché da quando l'header legge la sessione una pagina come la vetrina o
`/accedi` la chiedeva **due volte** — una per sé e una per l'header — e ogni
`getUser()` è un giro di rete verso il server di autenticazione, non una lettura
locale del cookie. La memoria dura quanto la richiesta: non è una cache fra
utenti diversi, che su un dato di sessione sarebbe un difetto grave.

*Cosa NON ho messo nell'header.* Nessun menu a tendina, e *"Le mie
prenotazioni"* non c'è: è una decisione di prodotto aperta, non un pezzo
mancante, e una tendina con voci verso pagine inesistenti è il 404 travestito da
funzionalità. Il Figma non mostra l'header da collegato, quindi la versione
costruita è la minima onesta — chi sei e la via d'uscita — e le tre domande per
Chiara (nome o avatar, testo o tendina, dove sta l'uscita) sono in `PIANO.md`.
Il ripiego sul nome, quando Google non manda `full_name`, è **la parte della mail
prima della chiocciola**: c'è sempre, è quasi sempre riconoscibile, e non stampa
il dominio — una mail intera in cima alla pagina è un dato in più su uno schermo
che qualcuno può guardare da sopra la spalla.

---

**7 settembre 2026 (secondo giro) — tre correzioni, e una che era un bug vero**

Revisione del giro del pagamento prima di passare all'orologio. Harness a **344
asserzioni**, verdi.

*La correzione che contava: non sapere non è sapere che no.* `riusaSeAperta`
trattava allo stesso modo «Stripe dice che quella sessione non esiste» e «Stripe
non ha risposto» — un `catch` solo, e in entrambi i casi "niente da riusare".
Ma un errore di rete non dice niente sulla sessione: quella cassa può essere viva
e il viaggiatore starci pagando dentro in quel momento. La riga `pending` veniva
marcata `expired`, si liberava l'unico posto che `payments_one_pending_per_kind`
teneva occupato, e nascevano **due indirizzi di pagamento vivi per la stessa
consulenza** — cioè esattamente ciò che la 0038 esiste per impedire. Il difetto
si sarebbe visto solo con Stripe lento, cioè con più traffico: il modo peggiore
di rompersi. Ora gli esiti sono quattro (`aperta`, `pagata`, `morta`, `ignoto`) e
solo `morta` — Stripe che dichiara la sessione scaduta o inesistente, 404
compreso — autorizza a buttare la riga; `ignoto` diventa un 503 "riprova" che non
tocca niente. Il commento diceva il contrario ed è stato riscritto: argomentava
verso la conclusione sbagliata, che è il tipo di commento che fa più danno di
nessun commento.

Ne è uscito un quinto esito che non era nella correzione ma è lo stesso difetto
dall'altro lato: una riga **senza sessione registrata** può essere una richiesta
interrotta a metà (da buttare) o una richiesta parallela che in quell'istante sta
parlando con Stripe (da lasciare stare). Si distinguono solo dall'età della riga,
quindi `in_apertura` sotto i 30 secondi, e anche lì 503.

*Il numero WhatsApp era pubblicato, e non doveva.* L'avevo messo in
`config_group = 'showcase'`, cioè fra i parametri che `public_config` serve ad
`anon`. Ragionamento sbagliato: «tanto il visitatore lo legge in pagina». Un dato
che il nostro server scrive in pagina dove serve non è la stessa cosa di un dato
che l'API serve in blocco a chiunque lo chieda — e quel numero oggi è il
**cellulare personale di Simone**, prestato in attesa di un numero dedicato. I
raccoglitori di contatti indicizzano, e da lì non si torna indietro cambiando una
riga. Spostato nel gruppo `contacts`, che `public_config` non espone, e servito
lato server da `leggiContatto()` con la chiave secret. C'è un'asserzione che lo
tiene fermo, e dice nel suo nome perché esiste: il giorno del numero aziendale si
toglie apposta.

*`.env.example` era ignorato da git.* `.gitignore` ha `.env*` con sopra scritto
"can opt-in for committing if needed", e l'opt-in non era mai stato fatto: la
lista delle variabili che devono esistere viveva solo sul computer di chi
l'aveva scritta. Verificato riga per riga che non contenga valori — l'unico non
segnaposto è `NEXT_PUBLIC_SUPABASE_URL`, che è pubblico per definizione e sta
già in `CLAUDE.md` e nel workflow Cal.com versionato — e aggiunto `!.env.example`.
Nell'occasione ci sono finite anche `N8N_PUBLIC_URL` e `N8N_API_KEY`, che i
comandi scritti in `n8n/LEGGIMI.md` danno per esistenti; la password e la chiave
di cifratura di n8n no, perché nessuno script del repo le usa e il loro posto è
`ACCESSI.md`.

---

**7 settembre 2026 — il giro del pagamento, e il secondo ponte fatto uguale al primo**

Il ponte Cal.com creava prenotazioni in `pending_payment` che nessuno poteva
pagare e che niente faceva scadere. Il giro adesso si chiude: prenotazione →
cassa → conferma. Migration `0038` e `0039`, route
`app/prenotazione/[id]/cassa/route.ts`, pagina d'attesa `app/attesa/`, workflow
`n8n/stripe-pagamenti.json`. Harness a **343 asserzioni** (erano 284), verdi.

*Il secondo ponte ha la forma del primo, e non per pigrizia.* `stripe_webhook()`
è la fotocopia strutturale di `calcom_webhook()`: firma, diario, blocco di lavoro
con gestore, esito in JSON, mai un'eccezione, `grant execute` al solo
`service_role`. Chi ha capito uno ha capito l'altro, e la sola cosa che deve
tenere in testa sono le tre differenze — che sono tutte di protocollo, non di
disegno.

*Le tre differenze, che sono i punti in cui copiare sarebbe stato un errore.*
La prima è **la firma**: Stripe manda `t=<timestamp>,v1=<hex>` e l'HMAC si
calcola su `"<t>.<corpo>"`, non sul corpo. C'è un'asserzione dedicata che verifica
che firmare *alla Cal.com* non passi: senza, un ponte copiato sembrerebbe
funzionare finché non arriva Stripe davvero. Poi la **finestra di tolleranza**:
cinque minuti, oltre i quali il messaggio si rifiuta — senza, una firma valida
intercettata resta valida per sempre, e il diario da solo non basta come difesa.
E i `v1` possono essere **più di uno**: durante una rotazione del segreto Stripe
ne manda due, e accettarne uno solo farebbe cadere il ponte esattamente nel
momento in cui si cambia la parola segreta. La terza differenza è banale e va
detta lo stesso: Stripe **manda un id di evento**, quindi il diario usa quello e
la chiave composta della 0037 qui non serve. Quella esisteva per un difetto di
Cal.com, non per una scelta nostra.

*I cinque minuti sono un numero nel codice, e l'ho lasciato lì apposta.*
`CLAUDE.md` dice di non mettere finestre temporali nel codice. Quella regola
esiste per i parametri di prodotto, che il team cambia da Studio senza deploy —
e nessuno in XPETIS regolerà mai la finestra di replay di un webhook. Metterla in
`app_config` avrebbe creato un modo di disattivare la protezione in silenzio
svuotando o azzerando una riga: un parametro di sicurezza che si guasta *aprendo*
è peggio del numero scritto. È un argomento con default, così un test può
spostarlo.

*L'ordine delle operazioni nella cassa non è quello ovvio.* Prima la riga in
`payments`, poi la sessione su Stripe. L'ordine naturale — crei la cassa, la
registri — ha una finestra fra il `select` che non trova niente e l'`insert`, e
un doppio clic ci passa dentro due volte: due indirizzi di pagamento vivi per la
stessa consulenza. Con la riga prima, è l'indice `payments_one_pending_per_kind`
(0038, gemello di `payments_one_paid_per_kind` sul lato "in attesa") a fermare la
seconda richiesta **prima** che tocchi Stripe, e non resta nessuna sessione
orfana da ripulire. Se poi Stripe fallisce, la riga si cancella e il viaggiatore
può riprovare subito.

*Tre cose imparate parlando con Stripe davvero, e non dalla documentazione.*
L'**adaptive pricing è acceso di default**, e con quello acceso una sessione può
incassare nella valuta del visitatore: il controllo "valuta = EUR" del ponte
avrebbe alzato un alert critico su un pagamento perfettamente buono fatto da
qualcuno fuori area euro. Si spegne esplicitamente. Il **PaymentIntent di una
Checkout Session non si può confermare via API** — nella versione
`2026-07-29.dahlia` nasce addirittura nullo — quindi un `checkout.session.completed`
autentico si ottiene solo pagando a mano sulla pagina ospitata. E `expires_at`
accetta solo **fra 30 minuti e 24 ore**, mentre `booking_payment_window_min` vale
esattamente 30: qualunque ritardo porta la nostra scadenza sotto il minimo e fa
fallire la chiamata. Si taglia invece di esplodere, con un minuto di margine sul
tempo di volo, e **l'autorità resta la nostra scadenza**: quella di Stripe è una
cortesia verso chi ha la pagina aperta.

*Le fixture, e cosa sono davvero.* Il `checkout.session.expired` è **vero**:
sessione creata sulla sandbox con l'API e chiusa con
`POST /v1/checkout/sessions/:id/expire`, che è l'unico modo di ottenere
quell'evento senza aspettare un giorno. Il `completed` è **ricostruito** —
involucro e oggetto sono quelli veri, cambiano solo i campi che Stripe cambia
quando una sessione si chiude pagata — per la ragione appena scritta. E nessuna
delle due porta una **firma vera**, perché non sono passate da un endpoint
webhook: con Cal.com le firme vere sono state la differenza fra un ponte che
sembrava giusto e uno che lo era, qui non ce l'ho, e il modo onesto di dirlo è
scriverlo nel `_nota` della fixture e nel README invece di lasciarlo intendere.
Quello che l'harness verifica è l'algoritmo, su tutti i modi in cui può
sbagliare.

*Il passaggio dall'embed alla cassa era una corsa da progettare, non da
scoprire.* Il viaggiatore finisce di prenotare nell'embed **prima** che il
webhook sia arrivato: in quel momento la prenotazione esiste su Cal.com e da noi
no, e la pagina non ha niente su cui aprire una cassa. La strada corta — leggere
l'uid dall'evento dell'embed — è sbagliata due volte: il campo non è documentato,
e soprattutto quel codice non deve stare nel browser, perché dopo S-05 basta lui
per cancellare la call. La strada giusta parte da ciò che già sappiamo: il
viaggiatore è **loggato**, quindi il server può cercare *la sua* prenotazione in
attesa di pagamento senza che il browser sappia niente di Cal.com. Pagina
d'attesa con pause crescenti per ~33 secondi, poi la cassa. E se non compare
niente non si lascia il viaggiatore a mani vuote: messaggio onesto (lo slot è
suo, la conferma no, non è stato addebitato nulla), link WhatsApp, e alert
`calcom_webhook_non_arrivato` — perché in quel caso **esiste uno slot occupato
sul calendario di un designer senza nessuna riga dalla nostra parte, e nessun
orologio lo libererà**: gli orologi guardano le righe che abbiamo.

*Il caso che succederà davvero, e che il codice tratta a parte.* L'orologio
libera lo slot al minuto 30, il pagamento arriva al minuto 30 e qualcosa. I soldi
sono veri e si registrano; la prenotazione no, perché lo slot è già stato dato
via. Alert critico e una persona che decide se rimborsare o rimettere in piedi la
call. È l'unico modo onesto: confermare sarebbe una bugia, ignorare l'incasso
peggio.

*Un test ha trovato un bug prima di me.* Il ponte, quando non riconosce la
sessione, ripiega a cercare la riga di pagamento per prenotazione — serve sul
`completed`, quando la route ha aperto la cassa e non è riuscita a registrarla.
Su un `expired` lo stesso ripiego avrebbe chiuso la cassa **nuova** di quella
prenotazione mentre il viaggiatore ci stava pagando dentro. Il ripiego ora vale
solo sul pagamento riuscito, e c'è un'asserzione che lo tiene fermo.

*La pagina di ritorno da Stripe non decide niente.* Dice "stiamo confermando" e
interroga il database. Il `?ritorno=1` è un'informazione del browser, non una
prova di pagamento: chiunque può scriverlo nella barra degli indirizzi, e
trattarlo come prova costa una consulenza regalata. La prova è la riga che arriva
dal webhook firmato.

*Due cose sistemate di passaggio.* `td_services_bookable_complete` pretendeva uno
`stripe_payment_link_url` su ogni consulenza attiva: era più vecchio della
deviazione 1, e tenerlo avrebbe voluto dire far inventare 25 URL finte per
pubblicare 25 profili — cioè il task S-10 che il piano dà per sparito. La
condizione è caduta, le altre tre (prezzo, durata, event type) restano. E
`my_bookings` ora dà `payment_deadline_at`, che è un dato del viaggiatore: senza,
la pagina non sa dire quanto tempo resta. `cal_booking_uid` continua a non
uscire, e c'è un'asserzione che lo verifica.

*Cosa NON ho fatto, di proposito.* Non ho caricato il workflow su n8n e non ho
creato l'endpoint su Stripe: sono azioni verso l'esterno, e la procedura è
scritta in `n8n/LEGGIMI.md` perché la faccia Simone. Finché non è fatta, nessun
pagamento si conferma — e finché non ci sono le due righe nuove di `app_config`
su Studio, la cassa non si apre e lo dice con una frase leggibile invece di
indovinare un conto.

---

**6 settembre 2026 — il ponte Cal.com, e la scelta di non metterlo in n8n**

Si apre la milestone 4. Il ponte Cal.com → `bookings` è dentro, provato e attivo:
migration `0037_calcom_webhook.sql`, workflow `n8n/calcom-consulenze.json`.
Harness a **284 asserzioni** (erano 222), tutte verdi.

*Dove sta la logica.* Nel database, in una funzione
`calcom_webhook(p_corpo text, p_firma text)`, con n8n ridotto a quattro nodi che
non decidono niente. La ragione non è estetica: la macchina a stati delle
prenotazioni vive già nel database, coi suoi trigger e la sua storia, e un ponte
scritto in un grafo di nodi l'avrebbe reimplementata fuori — senza vincoli, senza
prove, e senza modo di rigiocare un messaggio vero. Così invece è versionata come
migration e le sette fixture si rigiocano in sequenza a ogni `npm run
test:schema`. n8n resta su questo percorso per le due cose che il database non
ha: **il log visuale** di ogni messaggio ricevuto e **il retry** quando Supabase
non risponde. È una scelta reversibile a basso costo: la superficie da rifare è
una funzione con due argomenti di testo, e n8n non sa nulla del contenuto.

*Il nodo di troppo, e perché ce n'è uno.* Il piano diceva tre nodi; sono
quattro. Il quarto è un nodo Code che decodifica il corpo grezzo, ed esiste per
la ragione più importante di tutto il ponte: **la firma si calcola sui byte
esatti**. Un JSON parsato e riserializzato da n8n dà una firma diversa a
contenuto identico — l'ordine delle chiavi, gli spazi e il formato dei numeri non
sopravvivono al giro. Il nodo Webhook ha *Raw Body* acceso e consegna i byte come
dato binario; nessuna espressione di n8n sa toccare un buffer, quindi serve un
nodo Code. Quel nodo non decide niente: è idraulica, e se i byte grezzi non
arrivano **fallisce di proposito** invece di ripiegare su una riserializzazione.
Il ripiego silenzioso avrebbe prodotto `firma_non_valida` su ogni messaggio, che
è il modo peggiore di rompersi: sembra un problema di segreti e non lo è.

*Una scoperta che ha migliorato le prove.* Cal.com **firma il JSON compatto**, e
`JSON.stringify` di un oggetto appena parsato riproduce quei byte. Verificato
ricalcolando l'HMAC delle fixture con la parola segreta vera: **sei firme su
sette combaciano**. Non è una curiosità — significa che le firme registrate nelle
fixture sono *verificabili* e non solo ricalcolabili, e l'harness le passa alla
funzione di verifica vera. Una prova costruita su una firma che ci siamo
calcolati da soli verifica il codice contro se stesso e non prova niente. La
settima è `booking_created.json`, e si sa perché: il JWT della password video era
stato sostituito prima del salvataggio, quindi quel corpo non è più quello
firmato. L'harness lo dichiara invece di nasconderlo dentro un conteggio.

*Il punto in cui il disegno ovvio è sbagliato.* Su `BOOKING_RESCHEDULED` la riga
non si trova con `uid`. Cal.com non aggiorna la prenotazione: ne fabbrica una
nuova con un `uid` nuovo e mette il vecchio in `rescheduleUid`. Quindi si cerca
con `rescheduleUid` e poi si **sostituisce** `cal_booking_uid` con quello nuovo —
altrimenti la cancellazione successiva, che arriva col codice nuovo, non trova
più niente. `original_starts_at` non si tocca mai: è l'ancora dei 20 giorni.
L'harness rigioca la catena intera e verifica che l'ancora non si sia mossa dopo
due riprogrammazioni, che è la cosa che un test per singolo messaggio non
saprebbe dire.

*Tre decisioni piccole con la ragione scritta nel codice.*

La **finestra di pagamento parte da adesso**, non da `payload.createdAt`. Con
`createdAt`, un messaggio in ritardo (n8n giù, un ritentativo) farebbe nascere la
riga già scaduta e l'orologio dei 5 minuti libererebbe lo slot mentre il
viaggiatore sta pagando. Il difetto opposto — qualche minuto in più per pagare —
non fa male a nessuno. Si scelgono i modi di rompersi, non se rompersi.

La **chiave di diario è `triggerEvent : uid : createdAt`**, composta e non un
hash del corpo, perché su Studio si legge. `uid` da solo non basterebbe: nella
catena vera la seconda riprogrammazione e la cancellazione portano lo stesso
`uid`. E su errore `processed_at` resta **nullo di proposito**, così il
ritentativo di Cal.com riprova invece di scartare il messaggio come duplicato —
la riga di diario sopravvive comunque, perché il suo inserimento sta fuori dal
blocco con gestore.

Se **`rescheduledBy` manca, nessun contatore si muove.** Incrementare quello
sbagliato farebbe scattare uno dei due limiti del Flusso su una colpa non sua: il
team riceve un alert e attribuisce a mano. Non indovinare è una risposta.

*Gli scarti non sono tutti uguali,* e la differenza è di prodotto. Un **event
type non nostro** è routine: il webhook di Cal.com è per account, non per event
type, quindi un designer che tiene appuntamenti propri sul suo calendario ce li
manda tutti. Si annota nel diario e basta. Un **designer sconosciuto su un nostro
slug** invece è un alert, perché vuol dire una cosa sola di due: o il team non ha
ancora scritto `cal_username`, o qualcuno l'ha cambiato e le sue prenotazioni
stanno smettendo di arrivarci in silenzio — che è il rischio già scritto in
`PIANO.md`.

*Il tasto Request reschedule vuole entrambi i segni.* Prefisso `Please
reschedule.` **e** `cancelledBy` uguale a `organizer.email`. L'harness prova
anche il caso finto: lo stesso motivo scritto a mano da un viaggiatore deve
restare una cancellazione normale, perché trattarlo come il tasto del designer
significherebbe un rimborso non dovuto. Riconosciuto: stato `disputed`, alert
critico che dice **se c'erano soldi dentro** — è l'informazione che serve al team,
non il fatto in sé.

*Una cosa fatta in anticipo, e la dico.* Quando il designer cancella una call già
pagata, la funzione alza un alert critico. È materia della milestone 5, ma il
dato era già tutto lì e perderlo sarebbe stato un buco sull'eccezione più
conseguente del Flusso. Le regole di rimborso vere restano alla 5: qui si
lascia in tabella tutto ciò che servirà — chi ha cancellato, quando, e quanto
mancava alla call.

*La prova vera.* Payload firmati mandati all'indirizzo di produzione del webhook:
firma sbagliata → `firma_non_valida` e nessuna riga nel diario; creazione →
`creata` con la riga in `bookings`, prezzo 6000 dal listino e non lo 0 del
messaggio; stessi byte di nuovo → `duplicato`; riprogrammazione → trovata con
`rescheduleUid`, ancora ferma al 20/10 e inizio spostato al 24/10;
cancellazione col codice nuovo → `cancellata`, per mano del viaggiatore, stato
`cancelled_unpaid`. Tutte le esecuzioni 200. Le righe di prova sono state
cancellate dal database di sviluppo, gli alert compresi: non vanno lasciati nella
coda del team.

*Due cose trovate strada facendo.* Le migration `0033`-`0036` erano state
applicate a mano dal SQL Editor **senza essere registrate** nella storia delle
migration: `db push` provava a riapplicarle e si fermava su "column already
exists". Riparata la storia con `migration repair` dopo aver verificato dalla
superficie pubblica che gli oggetti c'erano davvero. E il secret
`calcom_webhook_secret` era già dentro Supabase Vault: verificato che sia quello
giusto **senza tirarlo fuori**, facendo verificare al database una firma vera di
fixture. È il modo di controllare un segreto senza guardarlo.

La chiave secret di Supabase non è finita nel workflow esportato: sta in una
credenziale n8n di tipo *Header Auth*, e nel JSON resta solo un `id` e un nome.
Lo script di export controlla di non aver scritto nessuno dei valori di
`.env.local` nel file.

---

**24 agosto 2026 — quattro migration che chiudono la milestone 3 dal lato codice**

Harness a **222 asserzioni**, tutte verdi. `0033`-`0036`, ognuna con le sue prove.

*`0033` · lo slug degli itinerari.* L'URL non porta più l'ordinale ma uno slug
(`/itinerario/giappone-in-primavera`). La scelta era fra l'uuid e lo slug, e ha
deciso **dove finiscono questi indirizzi**: nei messaggi WhatsApp che il designer
incolla dopo la call. Là un link è testo che qualcuno legge prima di toccarlo, e
`…/9f8c1e2a-4b17-4c90` non permette a nessuno di verificare di aver incollato il
Giappone e non il Vietnam. Lo slug si legge, si riconosce e si corregge a occhio.

La stabilità non viene dal titolo ma dal fatto che lo slug è **un dato**: il
trigger è `before insert` e non tocca gli UPDATE, quindi correggere un refuso nel
titolo non muove l'indirizzo. L'harness verifica le due proprietà separatamente —
titolo cambiato, slug fermo; posizione cambiata, slug fermo — perché sono le due
cose che l'ordinale non sapeva fare. Unicità per designer, collisioni con
suffisso, e uno slug scritto a mano da Studio vince sul trigger: è la via per
correggerne uno brutto.

Con la migration sono nate due utilità che appartengono a `0004_utility.sql` e
stanno nella 0033 perché quel file è applicato: `unaccent_immutable()` e
`slugify()`. La prima esiste perché **`unaccent()` è STABLE, non IMMUTABLE**, e
Postgres la rifiuta in una colonna generata o in un indice: la forma a due
argomenti col dizionario nominato è deterministica. Serve alla 0035, e senza di
lei quella migration non sarebbe potuta esistere così.

*`0034` · i testi in `app_config`.* Una riga porta un numero **o** un testo, in due
colonne con un vincolo XOR. La strada breve era `value text` per tutti, ed è
scartata: i parametri numerici li legge SQL che fa aritmetica, e un `numeric` che
diventa `text` sposta il controllo dal database a chi scrive la query — una riga
sbagliata smetterebbe di fallire all'inserimento per fallire in un cast, dentro un
workflow, di notte. `public_config` serve anche il gruppo `showcase`, e `matching`
resta chiuso dalla 0018: l'harness ora lo verifica come asserzione a sé, così se
qualcuno riallarga il filtro se ne accorge.

C'era una regressione da escludere e ha una sua asserzione: `match_designers`
legge `app_config` con `max(value)`, e in quella tabella ora ci sono righe con
`value` nullo. Se le aggregazioni si fossero rotte, il match avrebbe smesso di
pesare senza che nessuno lo vedesse leggendo il codice.

*`0035` · la ricerca senza accenti, e la cosa che non avevo previsto.* `name_norm`
è una colonna **generata** su tutte e cinque le tabelle geo: correggere un nome
aggiorna il normalizzato nello stesso statement, senza trigger da ricordarsi. Tre
indici trigramma dove le righe sono tante.

Poi il punto vero. Il pattern lo normalizza il browser, la colonna la normalizza
Postgres: **sono due implementazioni della stessa regola**, e non possono essere
lo stesso codice. Invece di scriverlo nei commenti e sperare, ho messo
un'asserzione che confronta le due su **tutti i 1.613 nomi della tassonomia
vera** — e ha trovato nove nomi su cui divergevano: Tromsø, Køge, Helsingør,
Hveragerði, Ísafjörður, Płock, Ostrołęka, Kuşadası. `unaccent` traduce anche le
lettere che non sono "base + segno" (ø→o, ð→d, ł→l, ı→i), mentre
`normalize('NFD')` quelle le lascia intatte. Avevo scritto nel commento che nella
tassonomia italiana non ce n'erano: era falso, e il test lo ha detto lo stesso
giorno.

La tabella di traduzione in `lib/geo.ts` è quindi **ricavata interrogando
`unaccent`**, riga per riga, non scritta a memoria — e nel commento c'è
l'avvertimento di non allungarla a intuito, perché `ə` e `ǝ` per esempio
`unaccent` le lascia stare e tradurle *creerebbe* la divergenza che la tabella
serve a togliere.

*`0036` · la maschera contestuale.* `tags_for_destination()` in `SECURITY
DEFINER`: sulla Bolivia i chip non offrono più "mare", che era uno scatto
garantito a zero risultati. È una funzione e non una vista perché
`td_destination_tags` dice su cosa un designer è forte paese per paese, cioè un
ingrediente del punteggio: la funzione restituisce l'**unione** dei tag dei
pubblicati, che non permette di ricostruire nessun profilo. Stessa disciplina di
`match_designers()` sulla destinazione — paese o macro-area, e su una città
solleva invece di ignorare.

Due dettagli di interfaccia che valgono più di quanto sembri. **Un filtro acceso
resta visibile anche quando esce dalla maschera:** capita cambiando meta con i
filtri già scelti, e nascondere il chip lascerebbe l'elenco filtrato da qualcosa
di invisibile — lo stesso genere di errore silenzioso che l'ordinale della 0033
produceva sugli indirizzi. E un gruppo che resta senza chip **lo dice** invece di
scomparire: un titolo senza niente sotto è una domanda, una riga di testo è una
risposta.

*Cosa resta a te, e non è rimandabile.* **Le quattro migration vanno applicate al
progetto di sviluppo, e `seed/0001_config.sql` ri-applicato.** Finché la `0033` non
è là, `public_td_showcase` non serve lo slug che l'URL nomina e la pagina
dell'itinerario risponde **404** per tutti gli itinerari: la verifica su PGlite non
sostituisce quel passaggio. Il seed è idempotente, quindi si ri-applica senza
pensarci.

**23 agosto 2026 — quattro decisioni di Simone**

**Il form Vetrina TD non si tocca.** `td_ready_itineraries` resta a quattro
campi, e tutte le sezioni che il Figma disegna senza una sorgente restano non
costruite: tappe del viaggio, informazioni utili, galleria, paese, descrizione
lunga, viaggi di gruppo. Il motivo pesa più della tecnica — il form l'hanno già
compilato in venticinque, e allargarlo vuol dire richiamarli tutti. Si riapre
solo su richiesta.

**Si espone un identificatore stabile degli itinerari**, con la migration che
serve: l'URL a ordinale è un errore che risponde 200 invece di 404, e quelli
sono i peggiori. Nota per chi la scrive: `position` **non** risolve, perché è
esattamente il campo che il riordino riscrive.

**"volo non incluso • IVA inclusa" va in `app_config`**, valido per tutti. Porta
con sé un lavoro non previsto: `app_config` tiene solo numeri
(`value numeric not null`), quindi una riga di testo richiede una colonna nuova,
un vincolo, e un allargamento di `public_config`, che oggi filtra su
`booking_rules`.

**I punti per Chiara e Gaia restano aperti** e si riprendono più avanti: badge
match forte, foto di sfondo della card, le tre pillole sotto "Esperti di…", i
divisori di sezione, l'ordine delle risposte della prima domanda del quiz, le
sei domande e le otto etichette intermedie, e le due frasi di fallback.

**23 agosto 2026 — la riga di tag della card, e l'itinerario pronto da vivere**

*La riga di tag.* Era l'ultima divergenza riaperta dalla regola del 14 agosto, e
si chiude come il Flusso la descrive: in quella riga ci vanno **i paesi**, e solo
dove la copertura non è implicita nella sezione. Sotto "Esperti di Vietnam" la
card non porta pillole; nel fallback, nelle bande allargate e in ogni ricerca
senza destinazione porta i paesi coperti. I temi, che stavano lì per il disegno,
sono usciti — e non si perde niente, perché il tema agganciato **il Flusso lo
mette nella frase** e la frase lo dice davvero: verificato sul database vero,
`/ricerca?livello=country&ref=vietnam&temi=food` scrive *"Ha costruito la sua
esperienza in Vietnam e sul tema food ha molto da dire"*. L'informazione ha
cambiato posto, non è sparita.

Lo spazio della riga resta riservato anche quando è vuota, così l'avatar e la CTA
stanno alla stessa altezza in tutte le sezioni. Il `Record` delle etichette dei
temi è uscito dai props della card: la usa solo la frase.

Due cose da chiudere con Chiara, entrambe piccole e scritte in milestone 3: le
tre pillole che il Figma disegna in **ogni** card, che sotto "Esperti di…" ora non
ci sono; e quanto larga sia "sezione di fallback" — ho scelto la lettura larga
(tutte le bande tranne la 3) perché la parentesi del Flusso dice *"dove serve
capire cosa copre il TD"*, e sotto "Allarghiamo alla regione" serve.

*L'itinerario pronto da vivere.* Quarta e ultima pagina disegnata, Figma 261:1068
→ `/designer/[slug]/itinerario/[numero]`. Il tasto "Ottieni maggiori
informazioni" delle card di vetrina era spento per mancanza di destinazione: ora
naviga, e con lui non resta più un solo tasto morto nel sito pubblico eccetto
quelli che aspettano la milestone 4. Nessuna vista nuova, nessuna migration:
tutto da `public_td_showcase`.

**Il tasto "Acquista l'itinerario" del disegno non l'ho costruito.** La fascia
scura in fondo al Figma lo mette accanto a "Personalizza con una call", ma il
Flusso è netto — l'itinerario pronto è vetrina, non catalogo, e l'unica porta
d'acquisto è la consulenza. Non è un'omissione prudente: non esiste il prodotto
che quel tasto venderebbe, `orders.service_type` non lo ammette e il prezzo è una
stringa scritta a mano, non un importo in centesimi. Caduta con lui l'intera
fascia, perché la sua altra metà (prezzo più call) è identica alla scheda in alto
e nel disegno le separavano tre sezioni che qui non ci sono.

*Quello che il disegno chiede e il database non ha.* `td_ready_itineraries` ha
**quattro campi**: titolo, durata, prezzo e una foto, tutti testo libero. Il
Figma chiede cinque tappe di viaggio con giorni e descrizioni, tre pannelli di
"Informazioni utili", le tappe principali, una descrizione lunga, una galleria a
tre foto con "Mostra tutte le foto", il paese dell'itinerario e la riga "volo non
incluso • IVA inclusa". **Sono tutti contenuti che il Flusso non prevede**, e per
la regola del 14 agosto un contenuto che il disegno aggiunge si segnala e non si
costruisce: sono in milestone 3, uno per uno, con la strada per dargli una
sorgente. La pagina mostra quello che il database sa davvero, e in testa al file
c'è scritto per ognuno perché non c'è.

Due note su cui vale la pena tornare. La prima: **"volo non incluso • IVA
inclusa" non lo scrive il sito.** È un'affermazione su cosa comprende un importo
che il designer digita come testo, e vale o per tutti (allora è `app_config`) o
per nessuno. La seconda: **il paese non è deducibile.** I paesi che la vista
espone sono quelli del designer, e "Giappone in Primavera" di chi copre Giappone
e Vietnam non diventa un itinerario in Vietnam.

*L'URL è un ordinale, e lo dico invece di nasconderlo.* `public_td_showcase` non
espone né `id` né `position` degli itinerari: dà un array ordinato, quindi
`/itinerario/2` significa "il secondo della lista". Ho fermato la mano prima di
aggiungere una riga alla vista — è una migration e un pezzo in più di superficie
pubblica, cioè una decisione di Simone — e ho messo il contratto dell'URL in un
posto solo (`percorsoItinerario` e `indiceItinerario` in `lib/vetrina.ts`). Il
prezzo di questa scelta è preciso: se un designer riordina i suoi itinerari, i
link vecchi puntano a quello sbagliato invece di dare un 404. Quando la vista
espone un identificatore, si cambiano quelle due funzioni e nient'altro.

*Un asset in meno.* Le due frecce tonde del nodo (Group 74 e Group 33) sono lo
stesso path di `public/img/freccia-diagonale.svg` a meno di un sotto-pixel di
traslazione: verificato scaricandole e confrontandole, non a occhio. Non entrano
nello script degli asset.

*Verificato, e cosa no.* Build verde, `tsc` pulito, eslint pulito sui file
toccati (i due errori che restano sono in `quiz-domande.tsx` e
`ricerca-destinazione.tsx`, preesistenti e fuori da questo giro). La pagina è
stata resa contro il progetto Supabase vero: dato giusto, i tre 404 giusti
(ordinale non numerico, fuori lista, `0`), i link delle card corretti. **In un
browser non l'ho vista**: quello resta a te, come per le altre tre.

*Una spunta ritrovata.* `seed/0003_demo.sql` **è** applicato al database di
sviluppo: `/designer/marco-rossi` serve "Alcuni dei miei viaggi" e i tre
itinerari pronti col contenuto vero. In PIANO era ancora aperta.

**23 agosto 2026 — la riga spezzata di `/ricerca` senza destinazione**

Segnalato da Simone: con `?temi=food` le due card non stavano più affiancate.
Marco su una riga, una frase in mezzo, Giulia su un'altra.

*La divisione era vera, ma invisibile.* Senza destinazione le sezioni esistono
comunque — `match_forte`, `altri` e `fallback` nascono dalla soglia del badge,
non dalle bande geografiche — e Marco agganciava il tema mentre Giulia no, quindi
finivano in due sezioni diverse. Ognuna aveva il suo `<div>` griglia ma **nessun
titolo**, perché i divisori li mostriamo solo con una destinazione: il risultato
era una griglia spezzata senza niente che dicesse perché. Il peggio dei due
mondi. Ora senza destinazione c'è **una griglia sola**, come nel Figma 177:262,
che è l'arrivo dal quiz. L'ordine non cambia di una virgola: il fallback resta in
coda perché ce lo mette `match_designers()`, non l'impaginazione.

*E in mezzo c'era una frase falsa.* La frase del fallback dice "Nessuno di questi
lavora sulla meta che hai scelto" — ma senza destinazione nessuna meta è stata
scelta, e su `/ricerca` liscia quella frase compariva davanti a **tutti** i
risultati, perché senza filtri l'affinità è zero per chiunque e il fallback si
mangia l'intera lista. Era un mio errore, non un testo da riscrivere: la frase è
giusta dov'era pensata, cioè dietro il "Mostra di più" con una destinazione, ed è
là che è rimasta. Senza destinazione oggi non c'è nessuna frase, ed è il vincolo
in più per Gaia — le frasi del fallback sono due.

**23 agosto 2026 — perché le immagini non si vedevano**

Tre cause diverse sovrapposte, e una era un bug.

*Il bucket era vuoto.* `td-media` esiste ed è pubblico (0017 applicata), ma non
conteneva **nessun oggetto**: tutti i percorsi del seed rispondevano 400. Le 23
immagini finte ora sono dentro, e le URL pubbliche rispondono 200 — verificato
anche attraverso `next/image`, che è il pezzo che fallisce per primo quando un
file manca.

*Lo script di caricamento non poteva funzionare.* `scripts/carica-immagini-finte.sh`
mandava solo `Authorization: Bearer`. Con le chiavi nuove `sb_secret_…` non basta:
l'API Storage prova a leggere il valore come JWT, non ci riesce e risponde 403
`Invalid Compact JWS`. Serve anche l'header **`apikey`**. Con le vecchie
`service_role`, che erano JWT davvero, il Bearer da solo bastava: è una trappola
che si vede solo provando, e vale per ogni script futuro che parli con Storage o
con PostgREST a mano. Corretto, e provato: 23 caricate, 0 fallite.

*Le foto profilo sono ancora rotte, e questa resta a te.* `travel_designers.photo_url`
sul database di sviluppo vale ancora `https://example.com/<slug>.jpg`, che è un
host vivo che risponde 404: `seed/0004_foto_finte.sql` sistema il puntatore ma
**non è ancora applicato**. Riguarda tre posti — l'avatar delle card in
`/ricerca`, la foto grande della vetrina, la scheda del designer nella pagina
dell'itinerario.

Da notare, perché è una scelta di codice e non un caso: un URL su un host che non
è Supabase Storage non diventa un riquadro neutro, si mostra comunque come `<img>`
grezzo. Il ragionamento è in `components/foto-vetrina.tsx` — una riga sbagliata
nel database si deve **vedere**, e `next/image` su un host non dichiarato in
`next.config.ts` non degrada: porta giù la pagina. Ecco perché example.com appare
come immagine rotta invece che come vuoto elegante.

**14 agosto 2026 — chi vince fra Figma e Flusso**

Regola fissata da Simone e scritta in `CLAUDE.md`: **il Figma è autorevole sulla
forma, il Flusso sul comportamento e sui contenuti.** Il disegno non è aggiornato
al pari del documento, e resta indietro. Nel dubbio si chiede; finché non arriva
risposta vince il Flusso.

Con questo metro ho ricontrollato tutte le divergenze registrate finora. Sette
reggono senza modifiche — palette e tipografia sono forma, e il Flusso aveva già
vinto su "Cerca" che compare alla selezione, sul solo "Accedi", sui due box
acquistabili, sul terzo gruppo di filtri non costruito, sull'ordine delle
risposte del quiz e sui due bolli che non scrivono numeri falsi.

**Una va riaperta.** La riga di tag della card in `/ricerca` mostra i temi
agganciati quando ci sono e i paesi coperti quando non ce ne sono. Ma il Flusso
è preciso su quella riga, e parla solo di paesi: *"Il tag paesi compare nella
ricerca senza destinazione e nelle sezioni di fallback (dove serve capire cosa
copre il TD), mai quando la copertura è implicita nella sezione."* I temi in
quella riga vengono dal disegno, non dal documento.

**Due erano etichettate come decisioni e sono invece domande aperte**, perché
chiuse dall'assenza nel Figma — che sotto la regola nuova non chiude niente:

- il **badge "match forte"**, che il Flusso dichiara esplicitamente "decisione UX
  da chiudere con Chiara: l'algoritmo lo produce comunque";
- la **foto di sfondo della card**, che il Flusso dà come "da definire con
  Chiara".

Restano spente entrambe come default reversibile, ma sono domande, non risposte.

**14 agosto 2026 — il quiz**

`/quiz` esiste: era il 404 in fondo al "Lasciati ispirare" della home, al "Non hai
ancora le idee chiare?" e al tasto quiz della colonna filtri. Sei schermate, una
domanda per volta, tutte obbligatorie. Tre file nuovi in `lib` e `components` più
la pagina e una route: `lib/quiz.ts` (l'unica porta verso `public_quiz_axes`, solo
lato server), `lib/quiz-risposte.ts` (il contratto delle risposte: query,
`sessionStorage`, tipi), `components/quiz-domande.tsx`, `app/quiz/page.tsx`,
`app/quiz/salva/route.ts`, `components/salva-quiz.tsx`. Nessuna vista nuova,
nessuna migration.

*Le sei domande non sono nel codice.* Codice, tipo, etichetta, domanda, scala e
opzioni vengono da `public_quiz_axes`, quindi il numero delle schermate e il passo
della barra si contano dagli assi: aggiungere un asse o correggere un'etichetta è
un UPDATE da Studio, non un deploy. Le opzioni si costruiscono percorrendo la
scala dichiarata (`scale_min`..`scale_max`) e non le chiavi del JSON: se un giorno
mancasse la riga di un valore, quella risposta appare senza etichetta invece di
sparire. Un buco si vede, una scelta che manca no.

*Il quiz è incompleto e si vede, come deve.* Gli otto "DA SCRIVERE" dei valori 2 e
3 sono in pagina così come sono. E ne è emerso un nono: **`question_it` è nullo su
tutti e sei gli assi** — non è mai stato seminato — quindi l'intestazione ricade
sull'etichetta dell'asse ("Coinvolgimento nella pianificazione"), che è una
targhetta e non una domanda, con sotto un `domanda da scrivere` in rosso. Il Figma
invece ha i testi buoni per le prime due domande, e anche le risposte del ritmo
scritte meglio del seed ("Lento: poche cose, vissute a fondo" contro "Lento"). Non
li ho copiati nel seed: sono contenuti, e vanno scritti tutti e sei insieme,
altrimenti restano due domande buone e quattro targhette.

*La trappola che stava in agguato.* Nel Figma la prima domanda elenca le risposte
**dal massimo controllo al minimo**, mentre nel database `planning_involvement`
cresce al contrario. Copiare l'ordine del disegno appiccicando i valori 1-4 alle
righe avrebbe girato l'asse: è il rischio numero uno del piano, quello che nessuna
prova tecnica intercetta, e si presenta esattamente così — come una questione di
impaginazione. Le risposte si mostrano in ordine di valore. Da chiudere con
Chiara, riordinando il disegno o girando il verso nel database: mai solo la vista.

*Il travaso al login (deviazione 3).* Le risposte dell'anonimo vivono in
`sessionStorage`; `components/salva-quiz.tsx` sta nel **layout radice**, non nella
pagina del quiz, perché il momento da intercettare è il login e dopo Google si
atterra su una pagina qualunque. Costa una lettura di `sessionStorage` quando non
c'è niente da fare, che è quasi sempre. Scrive la route `/quiz/salva` con la
chiave secret, dopo aver verificato la sessione dai cookie: `quiz_responses` ha la
RLS accesa e nessuna policy, il client non parla mai con le tabelle. Tre cose che
la route fa e vale la pena ricordare: **valida i codici degli assi e le scale
leggendoli dal database**, quindi non si salva un `{pippo: 3}` arrivato da fuori;
**rifiuta un quiz incompleto**, perché un profilo parziale nel briefing sembra una
risposta e non lo è; e **confronta con l'ultima riga del viaggiatore** invece di
inserire sempre, perché `quiz_responses` è un registro senza indice unico e il
componente rimonta a ogni pagina — l'indice sarebbe stata una migration non
richiesta. Non salva niente per gli anonimi: la tabella lo permetterebbe con
`session_id`, ma sarebbe un endpoint di scrittura aperto a chiunque.

*Il contratto verso i risultati era già scritto e non l'ho toccato.* `quiz=`,
`livello`, `ref`, `temi`, `contesti` entrano ed escono identici, così chi arriva
dal Vietnam torna al Vietnam. La lettura di quella stringa era duplicata nella
pagina risultati: ora sta in `lib/quiz-risposte.ts` e la usano entrambe, insieme
al tipo `Quiz` che `lib/match.ts` si limita a riesportare. Il passo del quiz
invece **non** sta nell'URL, a differenza di tutto il resto del sito: le risposte
vivono in `sessionStorage`, quindi un `/quiz?passo=4` condiviso mostrerebbe una
domanda in mezzo al nulla. È l'unico pezzo di stato del sito che non è
indirizzabile, e per questa ragione.

*Sugli asset:* due frecce tonde nuove (`freccia-avanti`, `freccia-indietro`) e la
foto, che è il **rendering del nodo** 346:946 a scala 1 — 568×709 e 592 KB, contro
i 9 MB e 2731×4096 della sorgente Unsplash. Tre cose non si scaricano: la stella
della barra, che è `img/stella.svg` (nel Figma è 34,238×36, cioè lo stesso path
"Star 3" dei bolli scalato 5,0833 — misurata su entrambi i lati, che è la lezione
dell'11 agosto sugli SVG con `preserveAspectRatio="none"`); la cucitura
tratteggiata fra card e foto, che è una riga bianca da 3px con 10 pieni e 10 vuoti
e sta in un gradiente ripetuto; e le stesse due frecce, che `galleria-prec.svg` e
`galleria-succ.svg` già portavano come ritaglio del gruppo della galleria — qui
sono l'esportazione pulita, con un nome che non parla di gallerie.

*Rimasto fuori, detto:* il quiz su cellulare **non è disegnato**. Sotto `lg` la
pagina impila la card e la foto sparisce: una foto alta 709 fra la domanda e le
risposte allontanerebbe le due cose che devono stare insieme. E l'ultima schermata
non è disegnata: il tasto resta "Continua" fino in fondo invece di inventarsi un
"Vedi i risultati".

**11 agosto 2026 — la vetrina del designer**

`/designer/[slug]` esiste: era il 404 in fondo a ogni card di `/ricerca`. Cinque
componenti nuovi più `lib/vetrina.ts`, che è l'unica porta verso
`public_td_showcase` e sta solo lato server, esattamente come `lib/match.ts` lo è
verso `match_designers`. Nessuna vista nuova.

*Prima la pagina, il seed.* Le cinque tabelle del contenuto di vetrina —
`td_signature_trips`, `td_signature_trip_images`, `td_ready_itineraries`,
`td_service_bullets`, `td_showcase_reviews` — esistevano dalla migration 0024 e
**nessuna riga le aveva mai popolate**: la pagina sarebbe stata verde e vuota
insieme, e non si sarebbe visto niente. Ora Marco e Giulia hanno tre viaggi
firma a testa con le foto, tre itinerari pronti, i punti dentro ogni box e le
recensioni portate da fuori. Harness a 178 asserzioni, verde.

Una cosa imparata sull'harness: **le sue asserzioni contavano le righe** del
contenuto di vetrina (`signature_trips.length === 1`), quindi qualunque
arricchimento del seed le avrebbe rotte. Ora cercano per titolo, e le prove che
scrivono usano posizioni alte (91, 92) per non collidere col seed. Il test è
diventato più difficile da rompere per il motivo sbagliato.

*Quattro cose del Figma che questa pagina non mostra*, tutte con la ragione
scritta nel codice e tutte reversibili:

1. **Il voto "4.6" sulla foto e la sezione "Cosa dice chi ha viaggiato con me".**
   Non esistono recensioni: `public_reviews` è vuota perché non ci sono ordini, e
   `td_showcase_reviews` non è esposta da nessuna vista per la decisione del 6
   agosto rimandata alla milestone 8. Le ho seminate lo stesso — quella decisione
   si prende meglio guardando dei dati veri che una tabella vuota — ma la vetrina
   non le mostra. Esporle da qui avrebbe voluto dire prendere quella decisione di
   nascosto, aggiungendo una vista pubblica di mia iniziativa.
2. **La riga "Membro XPETIS".** Vuole `joined_at`, che la vista non espone.
   Leggerlo con la chiave secret sarebbe stato lecito ma avrebbe scavalcato la
   regola "la superficie pubblica è la vista".
3. **La sezione "Viaggi di gruppo".** Non ha una sorgente, e non è un buco
   nostro: il form non raccoglie quei viaggi. Il servizio `group_trip` invece
   esiste, quindi il selettore dei box lo mostra a chi lo attiva.
4. **"Prenota la call" e "Ottieni maggiori informazioni" non navigano.** Il primo
   aspetta l'iframe Cal.com (milestone 4), il secondo la pagina "Itinerario
   pronto da vivere" (nodo 261:1068, non costruita). Inerti e detto, invece di un
   link verso un 404.

*E una dove il Figma e il Flusso non dicono la stessa cosa.* Il Figma disegna in
cima al box bianco due pillole — "Consulenza" rossa e attiva, "Itinerario su
misura" marrone e spenta — cioè un selettore fra i servizi, e sotto un solo tasto
"Prenota la call". Il Flusso dice che **i box acquistabili sono due soltanto**.
Le due cose si tengono insieme così: il selettore resta e mostra tutti i servizi
attivi come nel disegno, ma **il tasto d'acquisto compare solo su consulenza e
consulenza approfondita**; sugli altri, al suo posto, c'è la frase che dice
quando si comprano. Il selettore passa dalla query (`?servizio=`) e non da uno
stato nel browser, quindi la pagina resta interamente server-side e una scheda è
condivisibile per link.

*Un errore che ho fatto e che vale la pena ricordare*, perché il codice della
sessione precedente già lo preveniva e io l'avevo perso per strada: `next/image`
su un host non dichiarato in `next.config.ts` **non degrada, solleva e porta giù
tutta la pagina**. Il `photo_url` del seed punta a `example.com` e la vetrina
rispondeva 500. La difesa è la stessa dell'avatar di `card-designer.tsx`: fuori
da Supabase Storage si mostra un `<img>` normale.

*Sugli asset:* i due tondi con le frecce della galleria sono un ritaglio, non un
download. Nel Figma sono un gruppo unico largo 396 con i tondi agli estremi, e
lo script lo spiega. Gli SVG esportati hanno `preserveAspectRatio="none"`: le
icone non quadrate vanno misurate su entrambi i lati, altrimenti si stirano senza
che nessuno se ne accorga leggendo il codice.

*Fuori dal repo:* `supabase/node_modules` era un symlink verso `/tmp/node_modules`
committato per sbaglio nella 084c939, ed era rotto. Cancellato — il `.gitignore`
lo copre già — e rifatto `npm install`, che ora produce un `package-lock.json` da
committare.

**10 agosto 2026 — la pagina risultati chiama il match**

`/ricerca` esiste e gira sul database vero: bande, sezioni, badge, filtri e frase
composta. Tre file nuovi — `lib/match.ts` (l'unica porta verso
`match_designers`, e sta solo lato server), `lib/frase.ts` (i mattoncini),
`app/ricerca/page.tsx` — più la card, i chip dei filtri e due proprietà nuove sul
suggeritore, che ora conserva i filtri quando si cambia meta.

*Il ricalcolo live passa dall'URL.* I filtri riscrivono la query e il Server
Component richiama la funzione: è "una chiamata indicizzata al server" e non un
ricalcolo nel browser. Stessa scelta per le risposte del quiz
(`quiz=pace:1,comfort_wild:4`): la pagina resta interamente server-side e un
risultato è condivisibile per link. Il travaso da `sessionStorage` lo farà la
pagina del quiz.

*Tre cose imparate scrivendo le frasi*, tutte di lingua e nessuna prevista dal
Flusso, che le chiama "concordanze e articoli" in mezza riga:

1. **`travel_designers` non ha il genere**, quindi nessun frammento può contenere
   un participio ("è appassionato"). Si scrive tutto con verbi alla terza
   persona. Aggiungere la colonna non basterebbe: andrebbe raccolta per 25
   persone e mantenuta.
2. **La tassonomia non porta l'articolo.** "Conosce il Vietnam" non si può
   comporre: il default è il locativo "in {nome}", con una ventina di eccezioni
   per identificatore in `lib/frase.ts` (isole e città-stato vogliono "a", i nomi
   plurali "negli/nelle/nei"). Lo stesso problema colpisce il titolo di sezione
   del Flusso, "Esperti di [paese]", che su alcuni paesi zoppica.
3. **Un frammento non può contenere virgole**, perché i pezzi si uniscono con la
   virgola. Il primo giro produceva "sta dalla parte del tempo lungo, come te,
   conosce il ritmo dei viaggi in coppia".

*Rimasto fuori.* La **maschera contestuale** dei filtri: `td_destination_tags` è
dato chiuso e nessuna vista dice quali tag esistono su una destinazione, quindi
serve una funzione server nuova — non l'ho scritta perché è una migration non
richiesta.

**10 agosto 2026 — la pagina ricerca vestita sul Figma**

Arrivati i link: file `x1DYYagZ2moagmpEHZHYYE`, un nodo per pagina, ora scritti
in `CLAUDE.md` perché non si perdano più (l'assenza di quella riga è costata
mezza sessione). Deciso anche: pagamento col **plugin Stripe**, prenotazione con
l'**iframe Cal.com** del designer.

Rifatte card, filtri e impaginazione sul nodo 177:262: colonna bianca dei filtri
a sinistra, griglia a due colonne di card alte 520 con il velo che scurisce verso
il basso, avatar 130, "Vai alla vetrina", "Carica ancora" col tondo della freccia
— che è byte per byte lo stesso asset della home. Aggiunti cinque asset allo
script; `icona-quiz` e `icona-chevron` restano scaricati ma non usati.

*Quattro punti dove il Figma e il Flusso non dicono la stessa cosa*, tutti
risolti in modo reversibile e tutti da chiudere con Chiara e Gaia:

1. **Il badge "match forte" non è disegnato.** Era la domanda aperta del Flusso
   ("decisione UX da chiudere con Chiara"): oggi è spento da una costante sola.
2. **Nessun divisore di sezione.** Ma quel nodo è l'arrivo dal quiz, cioè il caso
   senza destinazione, dove il Flusso stesso vuole una fascia unica. I divisori
   compaiono solo con una destinazione, dove dicono qualcosa che il viaggiatore
   non può dedurre.
3. **La riga di tag sulla card porta i temi**, il Flusso i paesi coperti. Si
   mostrano i temi agganciati quando ci sono, i paesi quando non ce ne sono.
4. **Il terzo gruppo di filtri e "Filtri avanzati" non esistono nel Flusso** e
   `match_designers()` non li sa filtrare: lasciati fuori, con la ragione scritta
   nel componente. Un gruppo di caselle che non filtrano sarebbe peggio del
   vuoto.

*Una cosa che il Figma decide e il database aspettava:* la **foto di sfondo della
card** (`travel_designers.background_photo_url`, decisione aperta dal 1 agosto)
**non c'è**. La card non ha immagine di sfondo: solo l'avatar sopra un velo che
scurisce verso il basso, e sotto il velo si vede il crema della pagina.

*E una che ho tolto di mia iniziativa:* i due bolli dicono "+100 Designer" e "4.9
valutazione media". Il conteggio ora è quello vero (oggi 2); il bollo della
valutazione è fuori, perché non ci sono recensioni e `td_review_stats` non è
esposta al browser. Scriverli fissi sarebbe pubblicare due numeri falsi su un
sito che incassa.

**8 agosto 2026 — primo `db push` su Supabase vero**
Fallito alla migration 0004: `gen_random_bytes does not exist`. Causa: **su
Supabase le estensioni stanno nello schema `extensions`, non in `public`**,
quindi `create extension if not exists pgcrypto` non fa niente (esiste già
altrove) e le sue funzioni non sono sul search_path. Su PGlite finiscono in
`public` e tutto passa: **l'harness non poteva accorgersene**, ed è il primo
errore che il Postgres vero ha trovato e il nostro no.

Corretto in 0001 (commento), 0002 (`set search_path` per `gin_trgm_ops`) e 0004
(`search_path = public, extensions` sulla funzione). Uno schema inesistente nel
search_path viene ignorato, quindi la stessa riga funziona in entrambi gli
ambienti.

*Deroga consapevole alla convenzione "mai modificare una migration applicata":*
la catena non era mai arrivata in fondo da nessuna parte, quindi non c'era storia
da proteggere. Su un database già popolato si sarebbe aggiunta una migration
nuova. Regola aggiunta a `CLAUDE.md`.

**S-01 chiuso.** Progetto `rsgyxbqzsxahsbdfgtbm`, 31 migration e i tre seed
applicati, le query di verifica rispondono.

**S-02 e S-07 chiusi, e il giro Google-Supabase-Vercel è provato.** Repo su
GitHub, deploy su `xpetis-new.vercel.app`, login Google funzionante. Costruita
l'app Next.js 16 con i tre client Supabase e una pagina di verifica
dell'impianto che prova tre cose insieme: la lettura pubblica con la sola chiave
publishable (129 paesi e i due designer di prova rispondono), il login, e la
riga in `travelers` creata dal trigger su `auth.users`. **Tutte e tre verdi al
primo tentativo.**

*Punto aperto chiuso:* Google consegna davvero il nome in
`raw_user_meta_data->>'full_name'`, quindi il trigger popola `full_name` da
solo. Non serve raccoglierlo altrove.

*Un intoppo che vale la pena ricordare:* il primo deploy rispondeva 404. Il
progetto Vercel era stato creato **prima** che l'app Next.js esistesse, e il
preset del framework si decide una volta sola all'import: da allora serviva file
statici che non c'erano. Cambiato il preset a Next.js e ridistribuito senza
cache. Login provato anche in produzione, dove il redirect passa dal proxy ed è
un percorso di codice diverso da localhost.

*Decisione che cambia una convenzione: le chiavi Supabase.* Installata nel repo
la skill `supabase/server`, che documenta il passaggio alle nuove chiavi API:
`anon` e `service_role` sono **legacy e verranno rimosse**, si usano
`sb_publishable_…` (browser) e `sb_secret_…` (solo server). Aggiornati
`CLAUDE.md` e i task che le nominavano. La chiave secret non passa mai da una
conversazione né da un file versionato.

**8 agosto 2026 — import della tassonomia geografica**
Caricato `xpetis_destinazioni.json`: 6 continenti, 14 macro-aree, 129 stati, 244
regioni, 1.220 città. Harness a 166 asserzioni, tutte verdi. Il seed geografico
non si scrive a mano: lo genera `scripts/genera_geo.mjs` dal file, e l'harness
confronta i conteggi contro le statistiche dichiarate dal file stesso.

Tre cose che il mio schema provvisorio non prevedeva. **Non esistono codici
ISO:** ogni voce ha un identificatore testuale (`corea_del_sud`) e quello diventa
la chiave; inventare una corrispondenza ISO per 129 stati sarebbe stato
indovinare. **Una città può stare in due regioni** — Jaipur è in India del Nord e
in Rajasthan, ed è corretto — quindi l'unicità è per regione, non per stato.

E la terza, che è una decisione aperta e non un dettaglio: **la destinazione non
è sempre uno stato.** La tassonomia dichiara selezionabili le 14 macro-aree, i
129 stati e le 20 regioni italiane; continenti, città e regioni estere vivono
solo nel suggeritore. Ma il Flusso dice "la barra di ricerca normalizza qualunque
input a un paese", e `match_designers()` accetta un solo stato. I due documenti
non dicono la stessa cosa, e il codice oggi segue il Flusso.

*Verifica sulle voci paese di un designer reale:* 22 su 30 agganciano per nome
esatto ai 129 stati. Le altre otto sono i casi noti (cinque stati USA, la Scozia
che nella tassonomia è una regione estera del Regno Unito, Balcani e Caraibi da
scorporare), ora documentate in `MAPPATURA_VETRINA.md` con l'identificatore di
destinazione di ciascuna.

**8 agosto 2026 — la regola di ricerca (migration 0030)**
Decisa da Simone e implementata: città e continenti **non filtrano** (la città
porta al suo paese, il continente alle sue macro-aree), paesi e macro-aree sì.
Harness a 174 asserzioni, tutte verdi.

`match_designers` accetta ora la destinazione come livello + identificatore, e
**rifiuta i livelli che non filtrano sollevando un errore** invece di ignorarli.
La regola di prodotto vive nella funzione, non nella buona volontà di chi la
chiama: chi passa una città se ne accorge subito.

Una conseguenza logica da segnalare: **con una macro-area la banda 2 sparisce.**
"Un altro paese della stessa macro-area" è già dentro la banda 3, perché è
esattamente ciò che l'utente ha chiesto. Restano tre bande e serve una etichetta
nuova per la sezione (`esperti_macro_area`), che Gaia dovrà scrivere. Il livello
che entra nell'ordinamento è il migliore fra i paesi coperti là dentro, e il
badge chiede almeno un paese di livello 1 dentro quella macro-area.

Aggiunto `parent_ref` a `geo_search`, che è il filo per la navigazione del
suggeritore: continente → macro-aree → paesi.

*Regioni italiane: rimandate (migration 0031).* La tassonomia le dichiara
selezionabili, la regola dei quattro livelli non le nomina, e non si vuole un
quinto filtro. Invece di riscrivere il dato della tassonomia — che ne
perderebbe l'intenzione — il database tiene due fatti distinti: `is_selectable`
è cosa dichiara la tassonomia, `is_filterable` è cosa filtra oggi in XPETIS, e
il sito obbedisce al secondo. I due valori differiscono su venti righe soltanto,
e c'è un'asserzione che lo verifica: se un giorno quella differenza cambia, se
ne accorge qualcuno. Harness a 177 asserzioni.

**6 agosto 2026 — mappatura del form vetrina**
Arrivati `vetrina-dennis-milello/` e `GUIDA_PONTE_CALCOM.md`. Letto il form e
scritto `supabase/MAPPATURA_VETRINA.md`: 30 campi mappati, 11 migration
individuate. Deciso di **non importare ora i dati di Dennis**: serve come
struttura, non come carico dati.

Tre scoperte. **Il livello dei paesi non è un campo del form:** non esiste come
campo modificabile, ogni riga nasce "Base" e nessuna interfaccia la cambia.
Quindi i designer non sono disattenti, il form non glielo chiede. L'unico segnale
di rilievo è `topDestinazioni` ("fino a 3, saranno messe in evidenza"), da cui la
regola: top destinazioni → livello 1, gli altri → livello 2, campo `livello`
ignorato. **I viaggi di gruppo nel JSON non sono del designer:** `gruppo[]` non ha
campi modificabili e resta il contenuto d'esempio (il "Argentina: Trekking in
Patagonia" di Dennis è l'esempio dentro il form). Non si importa mai, e la sezione
prevista dal Flusso resta senza sorgente. **Un'etichetta non aggancia:** il mio
seed dice "Aree estreme e polari", il form "Aree estreme/polari".

*Deciso.* Assi allineati al verso dichiarato nel form, con `aesthetics`
rinominato `curated_vs_real` perché il nome suggeriva il verso opposto a quello
vero, e `companions` portato a cinque opzioni. Recensioni di vetrina in una
tabella separata `td_showcase_reviews`, non esposta finché non si affrontano le
recensioni (milestone 8).

*Ancora aperti, non bloccanti:* se `group_trip` e `private_guiding` entrano
nell'enum dei servizi acquistabili; se la sezione viaggi di gruppo va aggiunta al
form o caricata dal team; se `giorni` e `prezzo` degli itinerari sono solo
etichette di vetrina; conferma della regola `topDestinazioni` → livello 1.

**6 agosto 2026 — migration 0018-0020, le correzioni**
Scritte e verificate le tre migration che chiudono i difetti aperti. Harness a 90
asserzioni, tutte verdi.

`0018` sostituisce `public_td_profiles` con `match_designers()` in
`SECURITY DEFINER`: l'algoritmo completo del Flusso in SQL — bande geografiche,
punteggio quiz sui sei assi, punteggio filtri in frazione, affinità pesata,
chiave di ordinamento a quattro livelli, badge, sezioni. Restituisce posizione,
banda, sezione, badge, paesi coperti per nome, i due assi più salienti e i temi
agganciati: nessun punteggio, nessun livello, nessun valore di asse. Una scelta
che vale la pena ricordare: **per comporre la frase non serve il valore dell'asse
del designer.** La salienza pesa l'affinità, quindi un asse saliente è per
costruzione un asse dove i due stanno dalla stessa parte, e il frammento si
scrive dalla risposta del viaggiatore, che lui già conosce. Avendo spostato il
match lato server sono caduti anche i pesi degli assi e i parametri di matching
dalla superficie pubblica: il browser non ne ha più bisogno.

`0019` sostituisce il grant su `bookings` e `orders` con `my_bookings` e
`my_orders`, filtrate su `auth.uid()` e prive di `cal_booking_uid`.

`0020` aggiunge `td_publish_blockers()` — foto, bio, paesi, **almeno un paese di
livello 1**, sei assi, consulenza attiva, account Cal.com — e un trigger di
vincolo differito che rifiuta la pubblicazione elencando i motivi. Più
`td_publish_warnings()` per ciò che non blocca ma fa perdere punteggio: paesi
senza tema, paesi senza contesto, più di tre livelli 1, assi tutti sullo stesso
valore, nessun servizio oltre la consulenza. Il caso del designer con 32 paesi
tutti "Base" ora non si pubblica, e il messaggio dice perché.

Aggiunti al seed tre paesi non coperti da nessuno (Cambogia, Corea del Sud,
India) per poter provare le bande 2 e 1, che senza di loro non erano
verificabili.

**6 agosto 2026 — migration 0021-0024, allineamento al form**
Harness a 133 asserzioni, tutte verdi.

`0021` chiude il rischio numero uno del piano. Il verso degli assi non è più
un'interpretazione: `quiz_axes.label_min` e `label_max` contengono gli estremi
dichiarati nel form, e si legge il verso da lì. L'asse `aesthetics` è diventato
`curated_vs_real`, perché il vecchio nome su scala crescente si leggeva "più
estetica" mentre nel form crescere significa *meno* estetica curata. `companions`
è passato a cinque opzioni con le parole esatte del form. Corretta l'etichetta
"Aree estreme/polari", che con la nostra "Aree estreme e polari" avrebbe fatto
perdere quel tag in silenzio a ogni import.

`0022` e `0023` danno casa ai campi di profilo e ai campi per paese, con vincoli
sulle liste chiuse: se il form cambia le parole, l'import fallisce in modo
visibile invece di scrivere una stringa che nessuno leggerà mai bene. La
copertura legale non è un campo decorativo: "ho già un'agenzia" è l'informazione
che popola `agency_id` per gli ordini All Inclusive.

`0024` porta i servizi da quattro a cinque. `group_trip` e `private_guiding`
entrano nell'enum perché il designer li attiva e la vetrina li mostra, ma il
vincolo su `orders.service_type` impedisce che nasca un ordine: **il database
registra la decisione ancora aperta invece di lasciarla a un commento.**

Da qui in avanti ogni tabella nuova nasce con RLS accesa e privilegi revocati in
modo esplicito: su Supabase i privilegi di default concedono `anon` e
`authenticated` sulle tabelle create dopo, quindi la revoca della 0016 non si
eredita. L'harness lo verifica a ogni run e ha già trovato la prima dimenticanza.

**6 agosto 2026 — migration 0025-0028, il contenuto di vetrina**
Harness a 150 asserzioni, tutte verdi. Con questo blocco **lo schema ha una casa
per ogni campo del form**: era il buco più grosso trovato leggendo il JSON, dove
circa quattro quinti del form non aveva dove atterrare.

Una tabella per sezione — viaggi firma con le foto, itinerari pronti, recensioni
esterne — con righe ordinate e uniche per designer. Il vincolo sul titolo non
vuoto serve all'import: il form nasce con tre righe di viaggio precompilate e
vuote, e senza quel vincolo finirebbero in vetrina.

Deroga consapevole alla convenzione degli importi in centesimi su
`td_ready_itineraries`: durata e prezzo arrivano dal form come testo
("5-7 giorni", "850€") e sono indicazioni di vetrina, non casse. La convenzione
`*_cents` vale dove passa denaro vero.

`public_td_showcase` serve ora tutta la vetrina in una query. Alzato a 15 MB il
limite del bucket immagini: le foto di un pacchetto reale arrivano a 6 MB l'una,
33 MB per 25 file. L'import dovrà comunque ridimensionarle — 1 GB di Storage sul
piano gratuito basta per una trentina di designer e noi ne abbiamo 25.

*Verifica strutturale sul JSON reale, senza importarlo.* Tutti i valori di lista
chiusa del pacchetto di Dennis — temi, contesti, durate, budget, "con chi
viaggi", copertura legale — sono riconosciuti dallo schema: **zero valori
inattesi**. Restano confermati i tre problemi già noti, che sono di dato e non di
struttura: due righe paese vuote, due nomi con spazio in coda ("Perù ",
"Vietnam "), e le voci che non sono stati.

**4 agosto 2026 — merge col piano di Alessandro**
Lavorato punto per punto `XPETIS_CONFRONTO_PIANI.md`. Undici decisioni.

*Base.* Resta il mio schema, da correggere strada facendo. Conseguenza: il
risparmio di 16-18 sessioni calcolato nel confronto non si applica, perché
valeva solo adottando il suo codice. Il merge riduce la varianza, non il
calendario.

*Accolte perché aveva ragione lui.* Il match va in una funzione Postgres: la mia
`public_td_profiles` esponeva ad `anon` livelli dei paesi e valori degli assi,
cioè esattamente ciò che il Flusso dice invisibile — era un difetto, non una
scelta. Il designer si identifica con `cal_username` + slug, perché i 25 copiano
lo stesso event type modello e lo slug da solo non identifica nessuno. La cassa
la apre il server: un Payment Link è pubblico e riusabile e niente lo lega al
prezzo di quella prenotazione. Lo slug sta in `payload.type`. Il workflow Stripe
risponde sempre 2xx. Il quiz si salva al primo login, altrimenti il briefing del
designer arriva vuoto. `td_publish_readiness` controlla la plausibilità e non
solo la completezza: un profilo tutto "Base" era completo e non funzionava.

*Corretto un conto del confronto.* Le 60.000 esecuzioni n8n al mese
presuppongono sette cron separati a 5 minuti. Un orologio unico che verifica
tutte le scadenze dovute costa 8.640 esecuzioni in totale, e su Railway sono
illimitate: la "strada C" con `pg_cron` costerebbe più e dividerebbe le
automazioni fra due sistemi. Resta un orologio unico su n8n self-hosted.

*Trovato incrociando i due documenti.* Se cancellare su Cal.com richiede solo il
codice della prenotazione, `cal_booking_uid` è una credenziale, e il mio
`grant select on bookings to authenticated` la consegnava al viaggiatore.
Da chiudere con una vista senza quel campo. E poiché le mail native di Cal.com
contengono i link di cancellazione, le regole di rimborso vanno applicate sul
webhook `BOOKING_CANCELLED`: non c'è modo di chiudere quella porta.

*Rischi accettati.* Token in chiaro nel database. Verso degli assi non ancora
fissato (nel nostro seed solo `pace` ha etichette vere) con controllo a vista
all'import. Mail native di Cal.com lasciate accese, con i nostri testi scritti
per convivere. Import fedele e correzione a mano dei 25 profili, 8-12 ore del
team. Il `.docx` del Flusso resta superato su cinque punti, tracciati qui.

*Chiuso.* S-05, con prove sul campo: webhook sì, prefill sì, e per cancellare
non serve nessuna chiave. Annullato S-10.

In attesa di: `GUIDA_PONTE_CALCOM.md` con le fixture, dataset geografico, link
Figma, JSON delle 25 vetrine, e via a procedere.

**2 agosto 2026**
Piano rivisto: design, flusso, tassonomia e i 25 profili TD esistono già, quindi
il perimetro è solo tecnico e il percorso critico non è più il design ma la
disponibilità di Simone. Aggiunta la milestone sull'import dei dati reali.
Chiuse le decisioni sull'infrastruttura: Supabase cloud free in sviluppo e Pro
al go-live, n8n self-hosted su Railway, Cal.com free con un account per TD,
Vercel Pro. Emersi due punti non previsti dal Flusso: il piano Hobby di Vercel
non copre l'uso commerciale, e la quota esecuzioni di n8n Cloud è incompatibile
con il workflow insoluti ogni 5 minuti.

**1 agosto 2026**
Lettura del flusso completo. Scelte due decisioni architetturali di fondo:
pagine token servite da route server-side con service key, e nessuna lettura
diretta delle tabelle dal browser. Costruito lo schema Supabase completo: 17
migration, 2 file di seed, 30 tabelle, la macchina a stati degli ordini imposta
da trigger, sette viste pubbliche, RLS chiusa. Scritto l'harness di verifica su
PGlite: 60 asserzioni, tutte verdi.
