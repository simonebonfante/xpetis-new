# XPETIS — piano di sviluppo

File di lavoro: stato, decisioni e task. Si aggiorna qui spuntando le caselle;
il racconto di ogni sessione va in `REGISTRO.md`.

> **Qui non si scrivono segreti.** Password, chiavi e token vivono nel password
> manager: l'inventario di cosa esiste e dove sta è in `ACCESSI.md`. Questo file
> è versionato, quindi finisce su GitHub e in ogni copia della cartella.

- Contesto tecnico: `CLAUDE.md`
- Fonte di verità sul prodotto: `XPETIS Flusso Completo.docx` — **attenzione:
  superato su cinque punti, vedi "Deviazioni dal Flusso"**
- Documentazione dello schema: `supabase/README.md`
- Mappatura form vetrina → schema, con le 11 migration da scrivere:
  `supabase/MAPPATURA_VETRINA.md`
- Mappatura messaggi Cal.com → schema, ricavata da un messaggio vero:
  `supabase/MAPPATURA_CALCOM.md`
- Confronto con il piano di Alessandro: `XPETIS_CONFRONTO_PIANI.md`

**Regola di ingaggio:** si lavora solo su via esplicito di Simone. Gli
avanzamenti li detta lui.

**Perimetro:** solo la parte tecnica. Design, flusso, tassonomia e contenuti dei
25 Travel Designer esistono già e arrivano come input. Non sono task nostri e
non li stimiamo.

Legenda: **[C]** lo faccio io (Claude) · **[S]** lo fai tu (Simone) · **[B]**
business (Alessandro e Andrea)

---

## Da dove ripartire

**Stato a fine 23 agosto 2026.**

Milestone 0 **chiusa**: 31 migration, 177 asserzioni verdi, schema applicato al
progetto Supabase vero. Milestone 1 **a metà**: geografia importata, import delle
25 vetrine rimandato alla fine per scelta. Milestone 2 **quasi chiusa**:
Supabase, Vercel, login Google, n8n e Cal.com sono in piedi e provati.

Milestone 3: **le quattro pagine del Figma sono costruite**, più il quiz. Home,
ricerca, vetrina e itinerario pronto girano sul database di sviluppo vero, e da
oggi nessun tasto del sito pubblico porta a un 404. Restano tre task miei e una
fila di domande per te e per Chiara — sono elencate là, ognuna col motivo.

**Aggiornamento del 6 settembre 2026.** Si è aperta la milestone 4 col primo
pezzo: **il ponte Cal.com → `bookings` è costruito, provato e attivo**. Sta nel
database (`0037_calcom_webhook.sql`) con n8n ridotto a quattro nodi che non
decidono niente; le sette fixture vere si rigiocano in sequenza nell'harness, che
è passato da 222 a **284 asserzioni**, tutte verdi. Nello stesso giro sono
entrate nel progetto Supabase vero anche le migration `0033`-`0036`, che erano
state applicate a mano dal SQL Editor senza essere registrate nella storia delle
migration: ora la storia e il database dicono la stessa cosa.

**Aggiornamento del 7 settembre 2026.** Il giro del pagamento della consulenza è
chiuso: dalla prenotazione alla cassa alla conferma. Il ponte Stripe
(`0039_stripe_webhook.sql`) ha **la stessa forma** di quello Cal.com — n8n
fattorino, tutta la decisione in una funzione Postgres — e la route
`app/prenotazione/[id]/cassa/route.ts` apre la Checkout Session leggendo
l'importo da `bookings.price_cents`. Harness a **343 asserzioni** (erano 284),
tutte verdi.

**Aggiornamento dell'8 settembre 2026 — collaudato in sandbox, e passato.**
Migration applicate, workflow Stripe attivo su n8n, endpoint creato nella sandbox
con API version `2026-07-29.dahlia`, `whsec_` in Vault. Un pagamento vero da
60 € ha attraversato tutta la catena: prenotazione **`confirmed`**, pagamento
**`paid`**, `processed_at` pieno e **`team_alerts` vuoto** — quindi importo
combaciante, adaptive pricing neutralizzato, e percorso normale invece di quello
di recupero.

Con questo **cade il limite dichiarato il 7 settembre**: la fixture del
`completed` era ricostruita, e l'unico percorso su cui passano i soldi non era
mai stato attraversato da un payload Stripe autentico. Ora firma, controllo
dell'importo e conferma sono stati esercitati su un evento vero.

~~⚠️ **Il giro è stato costruito dal centro verso i bordi, e i bordi mancano
entrambi.**~~ → **entrambi i bordi ci sono, e dal 20 settembre 2026 girano in
sandbox.** L'imbocco è entrato l'8 settembre (`/accedi`, l'embed Cal.com nella
vetrina, l'header che riconosce chi è collegato) e l'orologio il 18, collaudato
il 20: una prenotazione non pagata scade da sola e **lo slot torna libero sul
calendario del designer**, senza che nessuno guardi.

**Il giro del pagamento è chiuso da bordo a bordo. La milestone 4 no**, ed è una
distinzione da non perdere: restano le **due mail di conferma** (al viaggiatore e
al designer — l'impalcatura c'è dal 20 settembre, mancano i testi e il ramo), il
calendario admin degli appuntamenti, il percorso "slot introvabile", e i tre
campi del form sulla pagina della prenotazione (cellulare, domanda di contesto,
flag servizi). Sono nella lista di milestone 4, non spuntati. Il controllo di
vitalità dei webhook è invece **chiuso**, e non con un controllo periodico:
vedi là.

**Aggiornamento dell'8 settembre 2026 — l'imbocco, subito dopo il collaudo.**
Il bordo che mancava da questo lato è entrato: **`/accedi` esiste**, il tasto
*Prenota la call* **apre l'embed Cal.com** nella vetrina, e la corsa fra l'embed
che finisce nel browser e il webhook che arriva dal server si chiude da sé.
Migration `0040` (l'embed ha bisogno di `cal_username` e `cal_event_type_slug` nel
browser), harness a **349 asserzioni**, verdi. Resta l'altro bordo: l'orologio.

Tre cose da sapere.

1. 🔴 **Il client secret di Google era in git** dal primo commit, e va ruotato:
   è la prima voce di "cosa resta a te".
2. La strada scelta per sapere che la prenotazione è finita — l'evento
   `bookingSuccessfulV2` dell'embed, verificato sui tipi pubblicati del
   pacchetto — **non richiede di toccare i 25 account Cal.com**. L'alternativa,
   il *Redirect on booking* sull'event type, li avrebbe richiesti tutti e
   venticinque e dentro un embed inline **non funziona comunque**: naviga
   l'iframe invece della pagina (issue Cal.com `#18144`).
3. ⚠️ **Il pezzo di oggi non è verificabile né dall'harness né da me**: è un
   iframe di terze parti in un browser. Ho verificato il contratto degli eventi e
   scartato il redirect su prova documentale; **non ho visto l'evento scattare.**
   L'elenco preciso di cosa provare e in che ordine è in milestone 4, sotto
   **"Le prove che devi fare tu"**.

**Aggiornamento del 20 settembre 2026 — la cerniera del dopo-call.** La call
finisce, la mail si compone, il viaggiatore clicca, nasce l'ordine. È il primo
pezzo che attraversa tutte e quattro le parti del sistema nello stesso giro —
orologio, Postgres, n8n, una pagina a token — e apre la milestone 6.

Quattro cose sono entrate, e una quinta è uscita di scena.

1. **I testi delle mail sono diventati dati.** `message_templates`, una riga per
   mail, modificabile da Studio senza deploy: li riscrive Gaia, che non apre un
   editor di codice. Il corpo è **prosa** — righe vuote fra i paragrafi, un
   indirizzo in chiaro diventa link — perché un tag aperto e mai chiuso, scritto
   per sbaglio, arriverebbe a un cliente vero.
2. **`outbound_messages` è diventata una coda**: porta il corpo composto, e
   `sent_at` si valorizza solo alla consegna riuscita, insieme
   all'identificativo di Resend. Il corpo si conserva per una ragione
   operativa: **è così che Gaia corregge le mail sul vero e non su un
   documento.** Si leggono su Studio come le leggerà un cliente.
3. **L'orologio è diventato davvero a rami.** La 0041 lo dichiarava, la 0042 lo
   provò riemettendo trecento righe per aggiungerne trenta — e il risultato era
   che i due file contenevano due copie parola per parola dello stesso ramo.
   Adesso ogni ramo è una funzione e `clock_tick()` è un orchestratore di dodici
   righe: aggiungere una scadenza è scrivere una funzione e aggiungere una riga.
   Se è una mail, non richiede nemmeno di toccare n8n.
4. **Le pagine a token, ferme dalla 0012, sono in strada.** Un resolver che dice
   *perché* un token non va bene, il contatore dei token inventati, e la prima
   pagina vera: i bottoni della mail post-call, che creano l'ordine in
   `requested` e avvisano il team.

E **S-04 esce di scena**: il provider di invio esiste (Resend, account della
landing page, `xpetis.it` già verificato). Con lui cade la riga della 0041 che
diceva «i rami usciranno come compiti `email_*` il giorno che esiste un
provider», e cade anche l'ultimo pezzo mancante dell'orologio — **la mail
cortese di chi perde lo slot**, che dal 18 settembre era l'unica cosa non fatta
di quella riga di milestone 4.

Harness a **458 asserzioni** (erano 387), tutte verdi.

Quattro cose da sapere, e la prima è quella che conta.

1. 🔴 **La posta nasce spenta, ed è voluto.** `app_config.email_enabled = 0`
   **non spegne la composizione**: le mail si compongono e si accodano lo
   stesso. Ferma la consegna. Nasce a zero perché il primo giro dopo la 0043
   incontra tutte le consulenze già finite — le prove di collaudo comprese, a
   gente vera — e accenderlo dev'essere un gesto fatto guardando la coda. Come
   si prova senza scrivere a nessuno è nella tabella delle prove, punti 27-30.
2. ⚠️ **Queste mail contengono token permanenti**, e non è una svista: il Flusso
   vuole che i bottoni post-call funzionino a mesi. Quel link vive per sempre in
   una casella inoltrabile. Chi se lo trova **non può impegnare un euro** — crea
   una richiesta che una persona del team lavora — ma **può leggere**: sa che
   quella persona ha fatto una consulenza con quel designer. Per questo la
   pagina mostra il designer e il servizio, e **non** il nome del viaggiatore,
   il telefono, la domanda di contesto o il profilo quiz. Da qui discende una
   regola per le milestone 6 e 7: *dietro un token permanente non va mai
   un'azione che muove denaro o consegna un file.*
3. ⚠️ **Il clic è un POST, non un GET**, e non è pedanteria: i link delle mail
   vengono aperti da macchine — antivirus aziendali, SafeLinks di Outlook,
   client che precaricano. Un indirizzo che crea un ordine appena lo si apre
   produrrebbe richieste che nessuno ha mai chiesto, e il team aprirebbe gruppi
   WhatsApp per nessuno.
4. ⚠️ **Il ramo della posta non è mai stato provato in produzione.** L'harness
   prova Postgres; la giuntura fra Postgres e n8n è esattamente il punto che ci
   ha ingannato tre giorni fa, due volte. La forma della richiesta a Resend è
   stata verificata **sulla loro documentazione** (cinque campi e non uno di
   più, `Idempotency-Key`, 10 richieste al secondo), non per analogia col nodo
   accanto — ma verificare non è vedere. Le prove 27-34 sono la cosa da fare.

**Cosa NON è stato fatto, di proposito**: la vita dell'ordine su misura
(proposta, revisione, consegna), l'All Inclusive, le recensioni, e **la mail al
TD con i tasti eccezione** (no-show, «altro problema»), che il Flusso fa partire
allo stesso momento ma che è una riga a sé di milestone 6. Niente di quello che
è entrato oggi li pregiudica: la coda, i testi e l'impalcatura dei token sono
gli stessi per tutte e tre.

**Aggiornamento del 23 settembre 2026 — la proposta su misura, fino al
pagamento.** Dopo `requested` il sistema adesso sa cosa succede: il designer
riceve per mail il link della sua pagina ordine, scrive la proposta, la rilegge,
la invia; il viaggiatore riceve la mail con il link alla pagina gemella, paga, e
il webhook Stripe porta l'ordine a `in_progress`. È `0044_proposta_su_misura.sql`
più tre pagine/route (`/ordine/[token]`, `/proposta/[token]`, la loro cassa) e
`lib/cassa.ts`, dove la cassa della consulenza e quella della proposta
condividono le stesse tre difese invece di copiarsele.

Harness a **548 asserzioni** (erano 459), tutte verdi. `npm run build` verde.

Quattro cose da sapere, e la prima è quella che conta.

1. 🔴 **È il primo token che fissa un prezzo, e l'irreversibilità sta nel
   database.** Il link del designer è permanente e vive in una casella
   inoltrabile. Chi lo trova può scrivere e mandare una proposta — è il danno
   massimo, e passa comunque dal gruppo WhatsApp e dallo spot-check — ma **non
   può cambiare una proposta già partita**: un trigger lo rifiuta a chiunque,
   Studio compreso. Salvare e inviare sono due gesti, e l'invio ridichiara il
   prezzo che il designer ha riletto. Una proposta partita si rifà **solo
   passando dal team**: `update orders set status='in_definition'` da Studio,
   poi il designer riscrive. Il ragionamento intero è in testa alla migration.
2. ⚠️ **Il credito consulenza non si calcola, e il codice lo dice dove serve.**
   Il prezzo che il designer scrive è quello finale; il campo credito è la sua
   dichiarazione per lo spot-check, che adesso ha una vista:
   `select * from team_spot_check_proposte;`. Nessuna riga fa `prezzo - credito`.
3. ⚠️ **Ho corretto una cosa della 0019 che la 0044 rendeva vera.** `my_orders`
   mostrava al viaggiatore loggato le colonne della proposta in ogni stato: da
   oggi ci vive la bozza del designer, che si sarebbe letta con gli strumenti di
   sviluppo aperti. Adesso sono nulle finché la proposta non parte (e anche in
   `proposal_pending_agency`, per l'All Inclusive: vedi la nota in milestone 7).
4. ⚠️ **Niente di questo è stato visto in un browser, né contro il database
   vero.** L'harness prova Postgres; le pagine sono verificate dalla build, non
   dall'occhio. E non c'è un disegno: il Figma non ha né la pagina del designer
   né la pagina gemella — domanda aperta più sotto. Le prove 41-56 sono la cosa
   da fare.

**Cosa NON è stato fatto, di proposito**: consegna, revisione, chiusura a 5
giorni, i tasti eccezione e tutto l'All Inclusive. Tre scelte di oggi li
toccano, e sono dette invece che risolte in avanti: il congelamento della
proposta vale solo per il su misura (l'All Inclusive avrà il suo giro con
l'agenzia); il ponte Stripe risponde con un alert a un pagamento su un ordine
All Inclusive invece di indovinare; `my_orders` maschera già
`proposal_pending_agency`.

**Aggiornamento del 26 settembre 2026 — le correzioni delle prove del 23.** Le
prove 41-56 sono passate tutte, e ne sono uscite cinque correzioni, fatte:
`0045_correzioni_prove.sql`, il form della proposta, il campo degli importi e
`CopiaTesto`. Harness a **614 asserzioni** (erano 599), `npm run build` verde.

1. **Il form della proposta non perde più la descrizione al primo errore**: si
   ripopola da quello che è stato inviato, con la riga di `orders` come ripiego
   (`components/ricorda-modulo.tsx`). ⚠️ È il difetto più facile da far
   tornare, perché «ripopolare dal database» sembra la cosa giusta: la prova
   58 è scritta apposta.
2. **Il campo degli importi**: al massimo due decimali, nessuno zero iniziale.
   È `FORMA_IMPORTO` in `lib/ordine.ts`, usata dal `pattern` del campo **e**
   dalla route. `euroInCentesimi` non è stata toccata, e adesso ha scritto
   sopra perché non va «semplificata».
3. **Il tasto *Copia***: il campo selezionabile c'era già nel codice provato;
   adesso è dichiarato come la cosa principale (etichetta e istruzione sempre
   visibili), su iOS si seleziona davvero, e se il bottone fallisce lo dice
   in chiaro. Niente `execCommand`.
4. **Gli importi negli alert** passano tutti da `euro_it()` (che c'era già
   dalla 0044, per le mail): le quindici occorrenze stavano in quattro funzioni
   vive, riemesse dalla 0045. L'harness adesso **legge il sorgente di tutte le
   funzioni** e diventa rosso se una divide ancora per `100.0`.
5. **Quando un viaggiatore paga lo sanno il designer e gli amministratori**, e
   gli amministratori tramite un **meccanismo**: `team_notify_recipients` e
   `team_notify_events` in `app_config`. Ogni `kind` di `team_alerts` è già un
   evento, quindi **avvisare il team di `ordine_richiesto` è una parola in più
   in una riga di Studio** — vedi il punto aperto, aggiornato.

**Aggiornamento del 26 settembre 2026, seconda sessione — la milestone 6 è
chiusa lato codice.** Il silenzio-conferma e i due modi di romperlo:
`0046_silenzio_conferma.sql`, la pagina dei due tasti (`/eccezione/[token]`),
la consegna dalla pagina ordine, lo scaricamento e la revisione dalla pagina
del viaggiatore. Harness a **693 asserzioni** (erano 614), `npm run build`
verde. Tre rami dell'orologio in più e **nessun workflow nuovo: n8n non si
tocca**.

Quattro cose da sapere, in ordine di peso.

1. 🔴 **Il tasto no-show non chiude come no-show.** Porta la call a `disputed`
   (lo stato «in arbitrato del team») come «altro problema», e ferma il
   silenzio. Chiudere come `no_show` resta un gesto del team, da Studio, dopo
   aver guardato: è il Flusso stesso a dire «verifica rapida del team». L'alert
   porta quello che serve per arbitrare — attesa dichiarata, regola, **l'ora del
   clic misurata dal server**, cosa ha scritto il designer, contatti del
   viaggiatore. ⚠️ **Il viaggiatore non viene avvisato**: è un punto aperto qui
   sotto, e non l'ho deciso io.
2. 🔴 **I byte della consegna non passano dal nostro server, e `CLAUDE.md` è
   stato aggiornato.** Una funzione Vercel accetta al massimo 4,5 MB di corpo;
   un itinerario col template XPETIS li supera, il bucket ne ammette 50. Il
   server decide tutto — controlla token e stato, **sceglie il percorso**, apre
   un caricamento firmato su quel percorso soltanto, poi legge da Storage cosa
   è arrivato davvero e registra — ma i byte vanno dal browser a Storage. n8n
   non vede mai un file, come prima. È anche l'unico pezzo delle pagine a token
   che vuole JavaScript.
3. ⚠️ **Il link firmato non esce mai.** Le mail portano alla pagina a token (che
   non scade); i file si scaricano da un indirizzo nostro che, al clic, firma un
   link di **un minuto** e ci rimanda il browser. Nessuna mail, pagina o colonna
   contiene un link di Storage, e l'harness lo controlla.
4. ⚠️ **Due orologi sullo stesso stato `delivered`.** La finestra della revisione
   parte dalla prima consegna e non riparte mai (`revision_deadline_at`); la
   chiusura parte dall'ultima consegna e riparte dopo la riconsegna. Stessi
   cinque giorni (`revision_window_days`), due significati.

**Cosa NON è stato fatto, di proposito**: il tasto «C'è un problema» in fondo
alla pagina ordine (il Flusso §7 lo chiede, il prompt di oggi parlava dei tasti
del dopo-call: è una riga a sé); la mail al viaggiatore dichiarato assente
(punto aperto); qualunque mail a `completed` (le recensioni sono milestone 8).
E, come sempre, **niente è stato visto in un browser né contro Storage vero**:
sono le prove 64-78.


### Cosa resta a te

- ~~🔴 **COMMITTARE**~~ → **fatto il 18 settembre 2026**, commit `be2e668`
  *"giro di prenotazione testato"*. L'imbocco del funnel — `/accedi`, l'embed,
  l'header che riconosce chi è collegato, la migration `0040`,
  `lib/supabase/utente.ts` — non è più in un albero di lavoro non committato.
- ~~**Le prove nel browser**~~ → **tutte e sedici passate il 18 settembre 2026**,
  confermate da Simone. La tabella in milestone 4 resta come **prova di
  regressione** da rigiocare quando si tocca il giro della prenotazione, non come
  lista di cose da fare.
- ~~**Ruotare il client secret di Google**~~ → **fatto l'8 settembre 2026.**
  Secret nuovo generato, incollato in Supabase, login riprovato, **vecchio
  cancellato**: quello che sta in git dal commit `ce5aafa` non funziona più.
  Cronaca e procedura in `ACCESSI.md`.
- ~~🔴 **Mettere in strada l'orologio**~~ → **fatto il 20 settembre 2026**, e
  **funziona**: uno slot non pagato si libera davvero su Cal.com. Migration
  `0041` applicata, righe di `app_config` inserite, workflow importato e attivo,
  prove 17-22 passate. La **17 ha chiuso la domanda che S-05 aveva lasciato
  aperta**: l'API v2 pubblica cancella una prenotazione **senza nessuna chiave**,
  quindi l'onboarding resta senza le 25 chiavi Cal.com e `GUIDA_PONTE_CALCOM.md`
  §9.4 si può considerare chiusa.
  ⚠️ **È stato fatto funzionare correggendo il workflow a mano su n8n**, e i due
  difetti stavano entrambi nella giuntura fra Postgres e n8n — payload non
  appiattito, e due campi di troppo nel corpo che la v2 rifiuta con 400. Il repo
  è stato riallineato lo stesso giorno: `n8n/orologio.json` contiene le due
  correzioni, quindi una reimportazione non rimette i difetti.
- 🟡 **Una decisione tua: il conto dei 35 minuti non torna già adesso.** La
  regola del Flusso dice che uno slot non pagato resta occupato al massimo 35
  minuti, e il conto vero è `finestra + grazia + cadenza` — la cadenza entra
  perché una riga che scade subito dopo un giro aspetta un giro intero. Con i
  valori di oggi fa **30 + 0 + 5 = 35 esatti**: siamo *sul* limite, non sotto, e
  **non c'è spazio per nessun margine di grazia**.
  Il margine servirebbe: la cassa Stripe può restare aperta circa un minuto oltre
  la nostra scadenza (`expires_at` di Stripe accetta minimo 30 minuti e la route
  taglia al minimo invece di esplodere), e un pagamento che atterra lì trova lo
  slot appena liberato. Oggi quel caso non è ignorato — c'è un alert critico e
  una persona che rifissa o rimborsa — ma è un caso da **evitare**, non da
  gestire.
  Le due strade sono entrambe tue, perché toccano il prodotto e non il codice:
  **portare la finestra di pagamento a 28 minuti** (il viaggiatore ne ha due in
  meno) oppure **la cadenza a 2 minuti** (più giri a vuoto su n8n, che è
  self-hosted e li fa gratis). Poi
  `update app_config set value = 2 where key = 'booking_cancel_grace_min';`
  Se non decidi niente resta com'è, e va bene: 35 esatti rispetta la regola.
- 🔴 **Mettere in strada la 0042** (20 settembre 2026), prima dell'onboarding
  dei 25, perché è il momento in cui il problema si manifesta:
  1. `supabase db push` — la `0042_firme_rifiutate.sql`.
  2. **Inserire su Studio le tre righe nuove di `app_config`** (in coda a
     `supabase/seed/0001_config.sql`). Senza, il ramo resta spento — ma lo dice:
     scrive un alert `orologio_ramo_non_configurato`, perché un ramo spento in
     silenzio è esattamente il guasto che la 0042 esiste per chiudere.
  3. **Correggere due `notes` che mentono su Studio.** Il commento nel file non
     lo legge nessuno da lì: `notes` è l'unica cosa che una persona vede, e il
     seed ha `on conflict do nothing`, quindi modificare il file **non cambia
     niente nel database**. Vanno eseguiti a mano:

     ```sql
     -- il ripiego v1 non è più a una riga di distanza: vuole anche il workflow
     update app_config set value_text = value_text, notes =
       'VERIFICATO il 20 settembre 2026 con un curl su una prenotazione vera: 200, slot tornato libero, mail native di annullamento partite, nessuna chiave necessaria (come diceva S-05). {uid} viene sostituito col codice della prenotazione: la v2 lo vuole nel PERCORSO, e il corpo porta solo cancellationReason. ATTENZIONE: passare al ripiego v1 (https://api.cal.com/api/cancel) NON basta cambiare questa riga — la v1 vuole uid e allRemainingBookings nel corpo, che la v2 rifiuta con 400, quindi va anche modificato il jsonBody del nodo Cancella su Cal.com in n8n/orologio.json.'
      where key = 'calcom_cancel_url';

     -- questo numero non lo fa rispettare nessuno, e la nota diceva di sì
     update app_config set notes =
       'ATTENZIONE: oggi non lo controlla NESSUNO. Cal.com non lo impone e il controllo di n8n è milestone 5: questo numero è una regola scritta, non un limite attivo.'
      where key = 'reschedule_max_traveler';
     ```
  4. Le prove 23-26.
- 🔴 **Mettere in strada la 0043** (20 settembre 2026). Va **dopo** la 0042, ed
  è il primo pezzo che manda posta vera: si fa in quest'ordine e non in un
  altro.
  1. `supabase db push` — la `0043_posta.sql`.
  2. **Inserire su Studio le dieci righe nuove di `app_config`** (in coda a
     `supabase/seed/0001_config.sql`). Il seed ha `on conflict do nothing` e
     gira solo su `db reset`: sul progetto vero vanno eseguite a mano. Se ne
     manca una, l'orologio scrive un alert `orologio_ramo_non_configurato` che
     **le elenca una per una**, lo aggiorna man mano che ne sistemi qualcuna e
     lo chiude da solo quando non ne manca più nessuna.
     ⚠️ **`site_base_url` va messa giusta**: la compongono le mail, e Postgres
     non ha modo di sapere a che indirizzo risponde il sito. Su un database di
     sviluppo `http://localhost:3000`; su quello vero l'indirizzo vero. Un link
     a localhost dentro una mail vera è un vicolo cieco.
     ⚠️ **`email_enabled` si lascia a 0** finché non hai letto la coda.
  3. **Eseguire `supabase/seed/0005_testi_mail.sql`** sul progetto vero: sono le
     sei righe di `message_templates`. Senza, la composizione fallisce e scrive
     un alert invece di mandare una mail vuota.
  4. **Creare la credenziale Resend dentro n8n**: Header Auth,
     `Name: Authorization`, `Value: Bearer re_…`, nome *Resend · invio
     transazionale*. ⚠️ **Non è la stessa Header Auth di Supabase**, che manda
     `apikey`: sceglierla sbagliata dà un 401 che sembra una chiave revocata.
  5. **Reimportare `n8n/orologio.json`** — ha due nodi nuovi e due rami — e
     riassegnare le credenziali ai quattro nodi HTTP che le vogliono.
  6. Le prove 27-34.
- ~~🔴 **Mettere in strada la 0044**~~ (23 settembre 2026) → **fatta, prove
  41-56 passate lo stesso giorno.** I passi restano come memoria. Va **dopo**
  la 0043.
  n8n non si tocca: il ponte Stripe ha la stessa firma e lo stesso endpoint.
  1. `supabase db push` — la `0044_proposta_su_misura.sql`.
  2. **Una riga nuova di `app_config`**, a mano dal SQL Editor (il seed gira
     solo su `db reset`):

     ```sql
     insert into app_config (key, value, value_text, config_group, label_it, notes) values
       ('custom_itinerary_stripe_account', null, 'xpetis', 'payments',
        'Conto Stripe che incassa gli itinerari su misura',
        'xpetis oppure agency, come consultation_stripe_account. Con agency serve un''agenzia partner attiva.')
     on conflict (key) do nothing;
     ```

     Senza, la cassa della proposta non si apre e lo dice («non è configurato
     su quale conto incassare»).
  3. **Rieseguire `supabase/seed/0005_testi_mail.sql`** sul progetto vero. È
     idempotente: aggiunge solo le tre righe nuove (`order_new_td`,
     `proposal_traveler`, `blocco_whatsapp_proposta`) e non tocca quelle che
     Gaia ha già corretto. Senza, le mail non si compongono e scrivono un alert.
  4. Deploy del sito (le route nuove).
  5. ⚠️ **Da questo momento ogni ordine su misura nuovo manda una mail al
     designer.** Con `email_enabled = 0` resta in coda; ma prima del gradino 3
     guarda la coda e cancella le `order_new_td` degli ordini di collaudo: i
     designer sono persone vere.
  6. Le prove 41-56.
- 🔴 **Mettere in strada la 0045** (26 settembre 2026). Va **dopo** la 0044.
  n8n non si tocca: le mail nuove passano dalla stessa coda e dallo stesso
  ramo di consegna.
  1. `supabase db push` — la `0045_correzioni_prove.sql`.
  2. **Due righe nuove di `app_config`**, a mano dal SQL Editor (il seed gira
     solo su `db reset`):

     ```sql
     insert into app_config (key, value, value_text, config_group, label_it, notes) values
       ('team_notify_recipients', null, '', 'integrations',
        'Chi riceve le notifiche interne del team (indirizzi separati da virgola)',
        'Deciso il 23 settembre 2026: gli amministratori, cioè Simone, Alessandro e Andrea. Una mail per indirizzo, accodata come tutte le altre: valgono email_enabled e email_redirect_to. Vuota = nessuna notifica, e al primo evento in elenco un alert lo dice.'),
       ('team_notify_events', null, 'ordine_pagato', 'integrations',
        'Di quali eventi si avvisa il team per mail (nomi separati da virgola)',
        'Un nome è il kind di un alert di team_alerts (es. ordine_richiesto) oppure ordine_pagato. Aggiungerne uno è tutto quello che serve: nessun deploy. NON metterci gli alert di igiene operativa: una mail per ogni anomalia insegna al team a ignorarle. Vuota = nessun evento.')
     on conflict (key) do nothing;
     ```

  3. **Scrivere gli indirizzi degli amministratori**, da Studio e non in un
     file versionato:
     `update app_config set value_text = '<simone>, <alessandro>, <andrea>' where key = 'team_notify_recipients';`
     Finché è vuota, il primo pagamento scrive un alert
     `notifica_team_non_configurata` invece di perdersi.
  4. **Rieseguire `supabase/seed/0005_testi_mail.sql`**: aggiunge solo
     `order_paid_td` e `team_notifica`, e non tocca i testi già corretti.
  5. Deploy del sito (il form e `CopiaTesto`).
  6. Le prove 57-63.
- 🔴 **Mettere in strada la 0046** (26 settembre 2026). Va **dopo** la 0045.
  n8n non si tocca.
  1. `supabase db push` — la `0046_silenzio_conferma.sql`.
  2. **Controllare tre righe di `app_config`** che esistono dal seed della
     milestone 0 ma che nessuno aveva mai letto:
     `select key, value from app_config where key in ('postcall_autoclose_hours', 'revision_window_days', 'td_wait_minutes_in_call');`
     Devono dire 48, 5, 15. Se ne manca una, l'orologio lo dice con
     `orologio_ramo_non_configurato`.
  3. **Controllare il bucket**: `select id, public, file_size_limit from storage.buckets where id = 'order-documents';`
     — privato, 52428800. È della 0017; se non c'è, la consegna si ferma al
     primo passo.
  4. **Rieseguire `supabase/seed/0005_testi_mail.sql`**: aggiunge le sette righe
     nuove e non tocca quelle già corrette.
  5. Deploy del sito.
  6. ⚠️ **Al primo giro dell'orologio si chiudono tutte le call confermate finite
     da più di 48 ore**, collaudi compresi. È giusto — lo sarebbero state da
     sole — e a `completed` oggi non segue nessuna mail.
  7. ⚠️ **Da questo momento ogni call che finisce manda una mail al designer**
     (`postcall_td`). Con `email_enabled = 0` resta in coda; prima del gradino 3
     cancella quelle delle call di collaudo: i designer sono persone vere.
  8. 🟡 **Una decisione tua, da una riga**: i due tasti producono gli alert
     `td_segnala_no_show` e `td_segnala_problema`, e sono esattamente il caso
     «c'è una persona che aspetta» del punto aperto sulle notifiche. Senza,
     nessuno li vede finché non apre Studio — e una call segnalata resta ferma.
     Io li metterei:
     `update app_config set value_text = 'ordine_pagato, td_segnala_no_show, td_segnala_problema' where key = 'team_notify_events';`
     Ci sono anche `ordine_consegnato` e `revisione_richiesta`, che sono buone
     notizie e secondo me possono restare fuori.
  9. Le prove 64-78.
- 🟡 **Una chiave Resend separata per XPETIS.** Oggi ce n'è **una sola, condivisa
  con la landing page**: ruotarla per un progetto rompe l'altro, e una fuga da
  uno espone entrambi. Resend permette più chiavi, anche di solo invio. Da fare
  prima che il secondo progetto vada in produzione — e prima della Beta, perché
  da quel momento quella chiave manda posta a clienti.
- 🟡 **Il tetto giornaliero è condiviso: 100 mail al giorno, con la landing
  page.** Non è un problema in Beta (una consulenza produce una mail), ma è la
  ragione per cui `email_max_per_tick` esiste e per cui il vincolo di unicità di
  `outbound_messages` non si tocca: sono le due cose che impediscono a un giro
  storto di bruciare la giornata di entrambi i progetti.
- 🟡 **Una domanda che non è tecnica: chi legge `info@xpetis.it`?** È il mittente
  di tutte le mail, ed è **una casella vera**: i testi sono scritti sapendolo e
  nessuno dice «non rispondere a questo indirizzo», perché non sarebbe vero. Il
  Flusso manda il canale umano su WhatsApp e di quella casella non dice niente.
  Serve sapere chi la presidia e con che tempi, altrimenti le risposte dei
  viaggiatori cadono in un posto che nessuno apre.
- 🟡 **I testi li riscrive Gaia, e adesso ha dove.** Le sei righe del seed sono
  una prima stesura che dice le cose giuste nel posto giusto, non il testo
  definitivo. Si correggono con un `update` su `message_templates` da Studio —
  nessun deploy — e le tre regole da non rompere sono scritte in testa a
  `supabase/seed/0005_testi_mail.sql`: niente aggettivi con il genere riferiti
  al designer, il credito si promette e non si quantifica, e i nostri testi
  convivono con le mail native di Cal.com invece di ripeterle.
- 🔴 **Resta da ruotare la password del database**, che è ancora quella dei primi
  otto commit. Stesso ragionamento: toglierla dal file non l'ha tolta dalla
  storia.
- ~~**S-08**, numero WhatsApp~~ → **chiuso in via provvisoria il 6 settembre**:
  +39 347 891 1018, numero personale prestato. Da sostituire prima del pubblico.
- ~~**"Chi è il venditore"**~~ → **deciso il 6 settembre: l'agenzia affiliata**,
  su tutto, non solo sull'All Inclusive. Deviazione 9. Da qui discendono due
  cose che restano tue: **chi preme il tasto "rimborsa"** in agenzia e con quali
  tempi, e **come si tocca il loro Stripe** — le loro chiavi in mano nostra sono
  una responsabilità che non vogliamo, Stripe Connect è la strada pulita.
- ~~**Stripe**: non è più fermo~~ → **costruito il 7 settembre e collaudato
  l'8** con un pagamento vero in sandbox. Endpoint, `whsec_` in Vault e workflow
  n8n sono a posto. Il passaggio al conto dell'agenzia resta la riga
  `app_config.consultation_stripe_account`, come previsto.
- **Guardare le quattro pagine accanto al Figma** e dirmi cosa non torna: è la
  cosa che vale più di tutte adesso, perché io non ho un browser e le pagine sono
  verificate sul dato, non sull'occhio.
- **Le domande per Chiara**, che si sono accumulate e sono tutte piccole: badge
  match forte, foto di sfondo della card, riga di tag vuota sotto "Esperti di…",
  ordine delle risposte della prima domanda del quiz, e le sezioni
  dell'itinerario pronto che nessun dato può riempire.
- **Portare ad Alessandro e Andrea la domanda "chi è il venditore"** — è
  diventata il percorso critico del progetto.

### Cosa posso fare io, in ordine di utilità

1. ~~**Le route server per le pagine token**~~ → **la prima è fatta il 20
   settembre 2026**: i bottoni della mail post-call (`app/servizio/[token]/`),
   con il resolver a cinque risposte e `lib/token.ts`. **Il 23 settembre
   2026 la seconda e la terza**: la pagina ordine del designer (parte proposta)
   e la pagina gemella con la sua cassa. Restano i tasti eccezione, la conferma
   dell'agenzia e la pagina recensione.
2. ~~**Il ponte Cal.com → `bookings`**~~ → **fatto il 6 settembre**, e non in
   n8n ma nel database: `0037_calcom_webhook.sql`, con n8n ridotto a quattro
   nodi che non decidono niente. Provato sull'indirizzo di produzione.
3. ~~**L'orologio unico dei 5 minuti**~~ → **costruito il 18 settembre 2026 e
   collaudato il 20**: `0041_orologio.sql` + `n8n/orologio.json`. Uno slot non
   pagato si libera davvero, e l'endpoint di cancellazione non è più una domanda
   aperta.
4. **Il suggeritore destinazioni** sulla tassonomia: è logica, non grafica, e
   funziona indipendentemente da come sarà disegnata la barra di ricerca.
5. Chiudere la milestone 3 dalla mia parte: ricerca accento-insensibile
   ("peru" non trova "Perù"), maschera contestuale dei filtri, test del match sui
   25 profili.

---

## Materiali in arrivo

| Materiale | Serve per | Stato |
|---|---|---|
| Link Figma delle pagine | Milestone 3, 4, 6, 7, 8 | ✅ arrivati il 10 agosto — file `x1DYYagZ2moagmpEHZHYYE`, nodi in `CLAUDE.md` |
| Dataset geografico (129 stati, 244 regioni, 1.220 città) | Import geo, suggeritore, bande del match | ⏳ me lo incolli — versione normalizzata da Alessandro |
| `GUIDA_PONTE_CALCOM.md` + fixture dei 7 messaggi veri | Nomi veri dei campi Cal.com e prove del ponte | ✅ arrivate — 7 fixture in `supabase/tests/fixtures/calcom/`, mappatura riscritta, ponte costruito |
| JSON delle 25 vetrine compilate | Import profili TD | ⏳ da produrre dal form HTML |
| `Vetrina TD (2).html` | È il form che produce quel JSON | ✅ in cartella |
| `XPETIS_CONFRONTO_PIANI.md` | Merge dei due piani | ✅ in cartella, lavorato |
| Testi delle mail transazionali | Milestone 4 in poi | ✅ **hanno una casa dal 20 settembre 2026**: `message_templates`, una riga per mail, modificabile da Studio senza deploy. Sei righe seminate come prima stesura, le riscrive Gaia |

---

## Deviazioni dai documenti di riferimento

Il Flusso dice di sé che va aggiornato quando una decisione cambia. **Non lo
aggiorniamo ora per scelta:** le deviazioni vivono qui. Chi legge il `.docx` su
questi punti sta leggendo regole superate. L'ultima riga devia invece dalla
tassonomia geografica.

| # | Il Flusso dice | Facciamo | Perché | Data |
|---|---|---|---|---|
| 1 | Payment Link fissi creati a mano dal pannello Stripe (§4) | La cassa la apre il nostro server, con l'importo letto dal database | Un Payment Link è un indirizzo pubblico e riusabile: niente lo lega al prezzo di *quella* prenotazione. Chi ha il link da 89€ può pagarci una consulenza da 149€. E il prezzo esiste in un posto solo invece di due | 4 ago |
| 2 | L'algoritmo di match gira nel sito (§2) | Funzione Postgres per i numeri, route server Next.js per le frasi. Mai nel browser | Calcolarlo nel browser richiede di esporre livelli dei paesi e valori degli assi, che il Flusso stesso dice invisibili. La mia vista `public_td_profiles` li esponeva davvero: era un difetto, non una scelta | 4 ago |
| 3 | Quiz e filtri anonimi vivono in `sessionStorage` e si perdono chiudendo la scheda (§1) | Al primo login il quiz si salva sul profilo | Il briefing che il designer riceve prima della call contiene il profilo quiz. Senza salvataggio arriva vuoto proprio nel pezzo che il designer legge | 4 ago |
| 4 | Il TD non può cancellare una consulenza pagata, può solo riprogrammare (§5) | Il tasto *Request reschedule* di Cal.com **è** una cancellazione secca. Lo riconosciamo dai due segni (motivo che inizia per `Please reschedule.`, `cancelledBy` uguale alla mail del designer), blocchiamo l'ordine, alert critico al team, rimborso eseguito a mano | Cal.com non manda nessuna prenotazione nuova e non lega la vecchia alla nuova: su una call già pagata il viaggiatore resterebbe senza call e senza soldi | 4 ago |
| 5 | Non ne parla | Le mail native di Cal.com restano accese e i testi XPETIS sono scritti per convivere con loro | Spegnerle potrebbe richiedere un piano a pagamento su 25 account. Costo zero e nessuna dipendenza dal piano | 4 ago |
| 6 | "La barra di ricerca normalizza qualunque input a un paese" (§1) | Filtrano **paesi e macro-aree**. Città e continenti sono solo navigazione: la città porta al suo paese, il continente alle sue macro-aree | La tassonomia dichiara selezionabili anche le macro-aree, e cercare "Sud America" è una richiesta legittima | 8 ago |
| 7 | *(deviazione dalla tassonomia)* Le 20 regioni italiane sono dichiarate selezionabili | **Non filtrano.** Nessun quinto livello di filtro: come trattarle si deciderà | Il dato della tassonomia non si perde: `is_selectable` conserva la sua intenzione, `is_filterable` dice cosa filtra oggi. Sono le uniche 20 righe su cui i due valori differiscono, e l'harness lo verifica | 8 ago |
| 8 | "Colore brand: verde `#1b5e24`" (§0) | La palette è **crema `#F0EEDF`, nero `#1C1C1A`, primario `#E53619`**, con Merriweather Bold sui titoli e Ronzino Regular sul testo | Sono i token del Figma, e concordano con il form Vetrina TD, che usa le stesse due tinte. Il verde non compare in nessuno dei due: è un dato più vecchio del design | 9 ago |
| 9 | Consulenze e itinerario su misura incassano sul conto XPETIS; solo l'All Inclusive sul conto dell'agenzia (§4) | **Incassa l'agenzia affiliata su tutto.** È lei ad avere ragione sociale e partita IVA; XPETIS come entità legale non esiste e non esisterà nel primo periodo | Senza partita IVA Stripe non attiva i pagamenti veri, e costituire una società non è nei tempi. Conseguenza operativa: **il tasto "rimborsa" è in mano all'agenzia**, quindi rimborsi, no-show e arbitrati diventano richieste a qualcun altro, con i suoi tempi | 6 set |
| 10 | La consulenza dura **30 minuti** (§3) | **30 oppure 60, a scelta del designer.** `consultation` è la consulenza base *qualunque sia la sua durata*; `consultation_deep` resta la *seconda* consulenza offerta in aggiunta, e nemmeno lei ha una durata fissa | Richiesta arrivata dai designer in fase di onboarding, 21 settembre 2026. Lo schema lo reggeva già (`td_services.duration_minutes` è per designer e per servizio) e la vetrina legge quel numero. ⚠️ Ma **il form della vetrina dice «Consulenza singola (30 min)» ed è bloccato**: i 25 hanno scritto il loro prezzo pensando a mezz'ora. Chi passa a 60 va **richiamato sul prezzo**, non solo sulla durata. Durata e prezzo rivisto vivono nella lista condivisa, non nel JSON | 21 set |

**Conseguenza della 5, da non perdere di vista.** Le mail native di Cal.com
contengono i link *cancella* e *riprogramma*, e cancellare su Cal.com richiede
solo il codice della prenotazione, senza credenziali. Il viaggiatore ha quindi
**sempre** una via per cancellare fuori dal nostro flusso, e non possiamo
impedirlo. Le regole di rimborso non si difendono controllando l'accesso al
link: **si applicano alla ricezione di `BOOKING_CANCELLED`**, guardando quanto
manca alla call. Vale anche per il caso 4.

*Aggiornamento del 6 settembre:* quella ricezione non è più "in n8n". Dal ponte
`0037_calcom_webhook.sql` **n8n non decide niente**: registra chi ha cancellato,
quando e quante ore mancavano alla call, e le regole di rimborso si applicheranno
sopra quei dati, nel database. n8n resta il fattorino.

**Conseguenza della 9, da decidere prima della produzione.** Lo schema è già
pronto — `payments.stripe_account` è un enum `xpetis | agency` e
`payments_agency_required` obbliga l'`agency_id` quando incassa l'agenzia — ma il
**valore di default oggi è `xpetis`**, che con questa decisione diventa falso in
produzione. Non si cambia il default: **quale conto incassa una consulenza va in
`app_config`**, così passare all'agenzia è una riga da Studio e non un deploy.
Fino a lì i test girano sul nostro Stripe sandbox, cioè `xpetis`.

Resta aperta la domanda che questa decisione rende urgente e che prima era
rimandata: **come si tocca il conto Stripe dell'agenzia.** Le loro chiavi in
mano nostra sono una responsabilità che non vogliamo (e `CLAUDE.md` vieta di
metterle in colonna); **Stripe Connect** è la strada che non ce le fa mai
vedere. Da chiarire con l'agenzia, non con il codice.

---

## Quadro d'insieme

| # | Milestone | Stato | Lavoro con me | Lavoro tuo |
|---|---|---|---|---|
| 0 | Fondazioni database e correzioni | ✅ **chiusa** | — | — |
| 1 | Import dei dati reali | 🟡 **a metà** — geografia dentro; le 25 vetrine per ultime, per scelta | 2-3 sessioni | 8-12 h |
| 2 | Infrastruttura e accessi | 🟡 **in corso** | 2 sessioni | 7-9 h |
| 3 | Sito pubblico: ricerca, quiz, match, vetrina | 🟡 **le quattro pagine disegnate ci sono**; restano tre task miei e le domande per Chiara | 1-2 sessioni | — |
| 4 | Prenotazione e pagamento consulenza | 🟡 **quasi chiusa** — i due ponti, il giro del pagamento e l'orologio sono dentro e provati. Restano le due mail di conferma (impalcatura pronta), il form della prenotazione, il calendario admin e il percorso "slot introvabile" | 2-3 sessioni | 3-4 h |
| 5 | Prima della call: riprogrammazioni e reminder | ⚪ — ma le due mail che le servono adesso sono un ramo e una riga di seed | 2-3 sessioni | — |
| 6 | Post-call e Itinerario su misura | 🟢 **chiusa lato codice il 26 settembre 2026** — dal dopo-call alla chiusura a 5 giorni. Restano le prove 64-78, il tasto «C'è un problema» della pagina ordine e i punti aperti del silenzio-conferma | — | 2-3 h di prove |
| 7 | All Inclusive | ⚪ | 4-5 sessioni | 4-6 h |
| 8 | Recensioni e chiusura del ciclo | ⚪ | 2-3 sessioni | — |
| 9 | Operatività e validazione Beta | ⚪ | 3-4 sessioni | 12-18 h |
|   | **Totale** | | **29-35 sessioni** | **34-49 h** |

Una "sessione" è circa due ore in cui costruisco e tu rivedi.

---

## Stima tempi

| Sessioni a settimana | Ore tue a settimana | Alla Beta privata |
|---|---|---|
| 2 | ~4 h | 17-21 settimane (dicembre 2026) |
| 3 | ~6 h | **12-14 settimane (inizio novembre 2026)** |
| 5 | ~10 h | 7-9 settimane (inizio ottobre 2026) |
| 8 | ~16 h | 5-6 settimane (metà settembre 2026) |

**Il merge col lavoro di Alessandro non accorcia il calendario: riduce la
varianza.** Le 16-18 sessioni di risparmio calcolate nel suo confronto valevano
solo adottando il suo codice come base; avendo scelto il mio schema, quel
risparmio non si applica. Quello che il merge porta davvero è:

- **S-05 è chiuso con prove sul campo**, e con lui sparisce una coda di rischio
  che il piano stimava fino a 2-3 settimane;
- l'onboarding non deve più raccogliere 25 chiavi API di Cal.com: per cancellare
  basta il codice della prenotazione;
- i nomi veri dei campi del payload sono noti (`payload.type`, non
  `eventType.slug`), quindi il ponte non si scrive due volte;
- la forma dell'output del modulo vetrina è nota, e con lei i due problemi che ci
  aspettano sull'import;
- sparisce il task S-10 (30 Payment Link a mano, più mezza giornata a ogni nuovo
  designer);
- in cambio si aggiunge una sessione di correzioni allo schema.

Cosa può ancora far slittare, in ordine di probabilità:

1. **Le correzioni a mano dei 25 profili.** Import fedele più correzione su
   Studio: 8-12 ore del team, e nessuno le può fare al posto suo.
2. **Il verso dei sei assi.** Nel nostro seed solo `pace` ha etichette vere; le
   altre cinque sono segnaposto. Il verso si fissa nel momento in cui si
   scrivono le etichette, ed è l'errore che nessuna prova tecnica intercetta.
3. **L'attivazione Stripe dell'agenzia** e la verifica fiscale del 74-ter.
4. **Le condizioni generali**, che richiedono un legale.

---

## Milestone 0 — Fondazioni database e correzioni ✅

**Chiusa il 6 agosto 2026.** 31 migration, 177 asserzioni verdi.

- [x] **[C]** Enum, tabelle di base, profili TD, geografia, parametri
- [x] **[C]** Prenotazioni e ordini con macchine a stati imposte dal database
- [x] **[C]** RLS chiusa, viste pubbliche, bucket di storage
- [x] **[C]** Seed dei parametri e dati finti
- [x] **[C]** Harness di verifica (~60 asserzioni, `npm run test:schema`)

### Correzioni

Si applicano come migration nuove, mai modificando quelle esistenti.

- [x] **[C]** `0018` — `match_designers()` in `SECURITY DEFINER` al posto di
      `public_td_profiles`, che consegnava ad `anon` livelli dei paesi e valori
      degli assi. Tolti anche i pesi da `public_quiz_axes` e i parametri di
      matching da `public_config`: spostato il calcolo lato server, il browser
      non ne ha più bisogno
- [x] **[C]** `0019` — viste `my_bookings` e `my_orders` filtrate su
      `auth.uid()` al posto del `grant select on bookings`. Senza
      `cal_booking_uid`, che dopo S-05 è di fatto una credenziale
- [x] **[C]** `0020` — `td_publish_blockers()` e `td_publish_warnings()`, vista
      di readiness estesa, e trigger che **impedisce davvero** di pubblicare un
      profilo senza paesi di livello 1
- [x] **[C]** `0021` — assi allineati al form: `aesthetics` → `curated_vs_real`,
      cinque opzioni per `companions`, il verso di ogni asse salvato come dato in
      `label_min`/`label_max`, tag "Aree estreme/polari"
- [x] **[C]** `0022` — campi di profilo del form: hero bio, manifesto, Instagram,
      anni di esperienza, copertura legale, disponibilità sui viaggi di gruppo
- [x] **[C]** `0023` — campi per paese: note sulle aree, temi fuori tassonomia,
      durata e budget tipici
- [x] **[C]** `0024` — i cinque servizi del form, prezzo deciso dal designer,
      punti dei box
- [x] **[C]** `0025-0027` — viaggi firma con foto, itinerari pronti, recensioni
      portate da fuori (tabella separata, non esposta)
- [x] **[C]** `0028` — la vetrina completa su `public_td_showcase`, e limite del
      bucket immagini alzato
- [ ] **[B]** Scrivere le due etichette intermedie di ogni asse continuo. Gli
      estremi ora vengono dal form: restano da scrivere i valori 2 e 3. **Con il
      quiz in piedi (14 agosto) quegli otto "DA SCRIVERE" si vedono in pagina**,
      e con loro un nono buco: `quiz_axes.question_it` è vuoto su tutti e sei gli
      assi, quindi ogni schermata mostra l'etichetta dell'asse invece della
      domanda. Il Figma 346:932 e 346:896 porta già domanda e risposte scritte
      per le prime due — sono testi da mettere nel seed, non nel codice

---

## Decisioni sull'infrastruttura e costi

Chiuse il 2 agosto 2026, dopo verifica dei prezzi correnti.

| Servizio | Scelta | Costo | Perché |
|---|---|---|---|
| **Supabase** | Cloud, free in sviluppo → **Pro al go-live** | €0 → $25/mese | Il free non fa backup, e l'architettura poggia su "Supabase è l'unica fonte di verità". Anche 1 GB di storage sono 200-400 documenti di viaggio |
| **n8n** | **Self-hosted su Railway** | ~$5-14/mese | Il Cloud Starter (€24/mese) dà 2.500 esecuzioni: il solo workflow insoluti ogni 5 minuti ne fa ~8.640. Self-hosted sono illimitate. Railway anziché VPS perché il vincolo del progetto è il tempo di Simone, non €5 |
| **Cal.com** | Free, un account per TD | €0 | Si paga solo per gestire più profili da un account: guidiamo i TD a crearsi il proprio |
| **Vercel** | **Pro, obbligatorio** | $20/mese | Il piano Hobby è solo per uso non commerciale: qualunque deployment che incassa pagamenti richiede Pro |
| **Provider email** | **Resend**, free | €0 → $20/mese | ✅ S-04 chiuso il 20 settembre 2026: account della landing page, `xpetis.it` già verificato. 3.000 mail/mese, 100 al giorno e 10 richieste al secondo — le 100 sono **condivise con la landing page** |

### Recap dei costi

**Fisso mensile**

| Voce | Sviluppo | Produzione Beta | A regime (~500 consulenze/mese) |
|---|---|---|---|
| Supabase | €0 free | $25 Pro | $25 |
| Vercel | $20 Pro | $20 | $20 **per postazione** |
| n8n su Railway | ~$5 | ~$5-14 | ~$15-25 |
| Cal.com | €0 | €0 | €0 |
| Provider email | €0 (Resend free, 3.000 mail/mese) | €0 | $20 (Resend Pro, 50.000) |
| **Totale** | **~$25** | **~$50-60** | **~$80-90** |

**Variabile: commissioni Stripe.** 1,5% + €0,25 su carta europea, 3,25% + €0,25
su carta extra-UE. L'All Inclusive incassa sul conto dell'agenzia, merchant of
record: quelle commissioni **non sono un costo XPETIS**. A volume Beta (50
consulenze da €65 e 7 itinerari da €1.200 al mese) sono circa €190 su €11.650
incassati, l'1,6%.

**Una volta o fuori dal cloud**

| Voce | Nota |
|---|---|
| Dominio `xpetis.it` | ~€15/anno |
| Condizioni generali, privacy, cookie policy | Da preventivare con un legale: la voce meno prevedibile e la sola fuori dal nostro controllo |
| Onboarding Cal.com dei 25 TD | 12-15 ore del team |
| Correzione a mano dei 25 profili importati | 8-12 ore del team |
| Google Workspace | Se serve, ~$7 per persona/mese |

**Due soglie da tenere d'occhio**

- **Vercel Pro è per postazione.** Oggi $20 perché lavora solo Simone. Con
  quattro persone Vercel costa più di tutto il resto dello stack messo insieme.
- **Cal.com resta gratis finché ogni TD ha il suo account.** Il giorno in cui
  servisse gestire i 25 profili da un account unico, il prezzo diventa per
  utente al mese: con 25 designer supera il costo di scrivere il motore di
  prenotazione proprietario. È l'argomento economico che deciderà quella
  migrazione, prima di quello tecnico.

**Scartate e perché**

- **n8n Cloud**: quota esecuzioni incompatibile con i timer del flusso.
- **Piani gratuiti con sleep** (Render, Fly free): un'istanza dormiente non fa
  girare il workflow insoluti e perde i webhook di pagamento Stripe.
- **Hetzner o VPS**: quattro volte le risorse a parità di prezzo, ma la
  manutenzione è tempo di Simone. Da riconsiderare dopo la Beta.
- **Timer in `pg_cron` con n8n Cloud** (la "strada C" del confronto): sensata se
  si restasse su n8n Cloud, ma con Railway costerebbe **più** ($24 di Starter
  contro $5-14) e dividerebbe le automazioni fra due sistemi, uno dei quali
  Alessandro non può leggere. Le 60.000 esecuzioni/mese citate nel confronto
  presuppongono sette cron separati a 5 minuti: **un orologio unico che verifica
  tutte le scadenze dovute costa 8.640 esecuzioni al mese in totale.**

**Note operative per n8n**

- Postgres di n8n **separato** da Supabase.
- Pruning dello storico esecuzioni a 7-14 giorni.
- Licenza: la Sustainable Use License copre il self-hosting per uso interno
  d'impresa. Da rinegoziare solo se esponessimo la costruzione di workflow ai TD
  o alle agenzie come funzione di prodotto.

---

## Milestone 1 — Import dei dati reali 🟡

**La geografia è dentro. L'import delle 25 vetrine si fa per ultimo, per
scelta:** serve prima che il sito esista, altrimenti si caricano dati che nessuno
guarda. Il lavoro qui sotto resta in coda fino ad allora.

Deciso: **import fedele, correzioni a mano su Studio.** Si carica quello che il
modulo dice, senza logica di normalizzazione da fidarsi; il team corregge dopo,
guidato da una coda di lavoro.

- [x] **[C]** Leggere il form `Vetrina TD (2).html` e fissare la forma esatta del
      JSON che produce → `supabase/MAPPATURA_VETRINA.md`
- [x] **[C]** Import del dataset geografico e riallineamento delle tabelle
      `geo_*` → migration `0029`, generatore `scripts/genera_geo.mjs`, seed
      `0002_geo.sql`
- [x] **[C]** `0030` — la destinazione può essere un paese o una macro-area;
      città e continenti sollevano errore. Regola di ricerca decisa l'8 agosto
- [x] **[C]** `0031` — le regioni italiane non filtrano (decisione dell'8
      agosto). `is_filterable` dice cosa filtra oggi, `is_selectable` conserva
      cosa dichiara la tassonomia
- [ ] **[S]** *Rimandato:* come trattare le regioni italiane nella ricerca
- [ ] **[C]** Importatore fedele dei profili TD, idempotente e rilanciabile: non
      normalizza, ma **segnala** ogni voce che non ha saputo agganciare
- [ ] **[C]** Coda di correzione per il team: per ogni TD, cosa non è entrato e
      perché. I due casi che ci aspettano, già visti sui dati veri di un designer
      reale: **tutti i paesi dichiarati "Base"** (senza correzione quel TD non
      prende mai il badge e finisce sotto a chiunque) e **circa un terzo delle
      voci che non sono stati** (California, Florida, Texas, New York, Hawaii →
      US; Scozia → GB; "Balcani" e "Caraibi" da scorporare)
- [ ] **[C]** Controllo del verso degli assi: per tre o quattro designer, stampare
      cosa hanno dichiarato nel foglio accanto a cosa dice il database. Un asse
      girato si vede a occhio in trenta secondi, e nessun'altra prova lo trova
- [ ] **[S]** Correggere i 25 profili su Studio seguendo la coda (8-12 h) →
      **S-16**

---

## Milestone 2 — Infrastruttura e accessi 🟡

**L'ordine non è quello d'uso, è quello dei tempi di attesa.** Verifica Stripe e
propagazione DNS non dipendono da noi e possono costare giorni: si avviano
subito, anche se serviranno dopo.

*Blocco A — si avviano oggi, perché fanno partire attese lunghe*

- [x] **[S]** Progetto Supabase → **S-01 fatto l'8 agosto.** Ref
      `rsgyxbqzsxahsbdfgtbm`, 31 migration e i tre seed applicati, le query di
      verifica rispondono
- [x] **[S]** Dominio, provider email, record DNS → **S-04 chiuso il 20
      settembre 2026, e meglio di come era stato stimato.** Non è stato creato
      niente: l'account Resend è **quello della landing page**, e su `xpetis.it`
      SPF, DKIM e Return-Path erano **già verificati** perché quel dominio
      spedisce da mesi. Cade con questo l'attesa della settimana di
      riscaldamento, che era la coda più lunga del piano.
      ⚠️ Restano tre conseguenze del riuso, tutte in `ACCESSI.md`: il **tetto di
      100 mail al giorno è condiviso** con la landing page, la **chiave API è
      una sola** per due progetti (ruotarla per uno rompe l'altro), e la
      **reputazione è condivisa** — il giorno che da `xpetis.it` parte una
      newsletter, le transazionali vanno spostate su un sottodominio
- [~] **[S]** Account Stripe → **S-06 parziale l'8 agosto.** Sandbox creata, si
      sviluppa in test mode. **L'attivazione è bloccata: non esiste un'entità
      legale** e non esisterà nel primo periodo. Vedi i rischi
- [ ] **[B]** Decidere **chi è il venditore** su consulenze e itinerari su
      misura: entità XPETIS, agenzia partner, o i designer con Stripe Connect

*Blocco B — quando il blocco A è avviato*

- [x] **[S]** Repo Git e progetto Vercel → **S-02 fatto l'8 agosto.** Repo
      collegato, deploy su `https://xpetis-new.vercel.app`. Resta su **Hobby**
      finché il sito è un'anteprima privata: **il passaggio a Pro va fatto prima
      di mostrarlo fuori dal team o di incassare**
- [x] **[S]** Login Google → **S-07 fatto l'8 agosto** e verificato end-to-end:
      sessione attiva, riga in `travelers` creata dal trigger, nome preso da
      Google. Progetto Google Cloud `xpetis-504916`

*Blocco C — chiude la milestone*

- [x] **[S]** Istanza n8n self-hosted su Railway → **S-03 fatto l'8 agosto.**
      `https://n8n-production-d576.up.railway.app`, Postgres dedicato,
      **nessun volume**: tutto lo stato vive nel Postgres, la chiave di
      cifratura è una variabile e i dati binari sono in memoria, quindi il disco
      non serve. Potatura dello storico a 14 giorni, fuso Europe/Rome
- [x] **[S]** Account Cal.com ed event type modello → **S-09 fatto l'8 agosto**
      su un account di prova con username `marco-rossi-xpetis`, così le
      prenotazioni atterrano su un designer che esiste già nel seed. Webhook
      verso n8n attivo, primo messaggio vero raccolto e mappato
- [x] **[C]** Verificati `disableCancelling` e `disableRescheduling`. Non esiste
      lo scope "solo host", quindi il divieto di cancellare al solo designer
      resta a n8n. Ma **la riprogrammazione si può bloccare sotto una soglia di
      tempo: impostata a 720 minuti, cioè la regola delle 12 ore del Flusso, che
      da osservata diventa imposta.** Attivato anche *Require cancellation
      reason → solo host*
- [ ] **[S]** Numero WhatsApp XPETIS → **S-08**
- [x] **[S]** ~~Le tre verifiche su Cal.com~~ → **S-05 chiuso**, vedi sotto
- [x] **[C]** Bootstrap Next.js 16: TypeScript, Tailwind 4 con il verde brand,
      i tre client Supabase (publishable nel browser, publishable+cookie lato
      server, secret per le scritture), `proxy.ts` che rinfresca la sessione,
      route di callback OAuth e pagina di prova dell'impianto
- [x] **[C]** Applicare le migration al progetto Supabase e verificare le viste
      — 31 migration e 3 seed applicati, 129 paesi e 1.220 città in risposta,
      `match_designers('country','vietnam')` funzionante sul database vero
- [ ] **[C]** Struttura delle route server-side per le pagine token, con la
      validazione già agganciata a `resolve_access_token`

---

## Milestone 3 — Sito pubblico: ricerca, quiz, match, vetrina 🟡

**Le quattro pagine del Figma sono costruite** — home, ricerca, vetrina,
itinerario pronto — più il quiz. Non basta a chiudere la milestone: restano tre
cose mie (ricerca accento-insensibile, maschera contestuale dei filtri, test del
match sui 25 profili) e una fila di domande che aspettano te o Chiara.

- [x] **[C]** Fondamenta: token del Figma in Tailwind, Merriweather e Ronzino,
      componenti condivisi (header, footer, bottone, badge a stella)
- [x] **[C]** Home dal Figma, con il Cerca che compare alla selezione
- [x] **[C]** Suggeritore destinazioni sulla tassonomia: cerca, distingue i
      livelli, porta una città al suo paese e scende dai continenti alle
      macro-aree ai paesi
- [ ] **[S]** Scaricare gli asset del Figma con
      `bash scripts/scarica-asset-figma.sh` — **le URL scadono in 7 giorni**
- [x] **[S]** Ronzino in `public/fonts/` — fatto il 9 agosto
- [x] **[C]** **Ricerca accento-insensibile** — migration `0035`, 24 agosto.
      `name_norm` è una colonna **generata** su tutte e cinque le tabelle geo,
      quindi non può divergere dal nome, con tre indici trigramma sulle tabelle
      grosse. Due trappole scritte nel file: `unaccent()` è STABLE e in una
      colonna generata non si può usare (serve l'involucro `unaccent_immutable`
      della 0033), e `gin_trgm_ops` si risolve alla creazione dell'indice, quindi
      il `search_path` va in testa alla migration — è il tipo di errore che
      l'harness su PGlite non intercetta.
      **E il test ha trovato subito una cosa che non avevo previsto:** il testo
      digitato lo normalizza il browser e la colonna la normalizza Postgres, cioè
      due implementazioni, e su **nove nomi della tassonomia** divergevano
      (Tromsø, Køge, Helsingør, Hveragerði, Ísafjörður, Płock, Ostrołęka,
      Kuşadası). `unaccent` traduce anche le lettere che non sono "base + segno",
      `normalize('NFD')` no. Ora `lib/geo.ts` porta la tabella di quelle lettere,
      ricavata interrogando `unaccent` e non a memoria, e l'harness verifica
      l'accordo su tutti i 1.613 nomi veri
- [x] **[C]** Le 6 schermate del quiz (tutte obbligatorie, nessun quiz a metà),
      in `sessionStorage` da anonimo e **salvato sul profilo al primo login** →
      `/quiz` vestita sui Figma 346:932 e 346:896. Le domande arrivano da
      `public_quiz_axes` (`lib/quiz.ts`), il contratto `quiz=codice:valore` sta in
      un posto solo (`lib/quiz-risposte.ts`), il travaso al login è la route
      `/quiz/salva`. Nessuna vista e nessuna migration nuova
- [x] **[S]** Guardare `/quiz` accanto al Figma e dirmi cosa non torna, come per
      `/ricerca` e `/designer`. **Il giro col mouse non l'ho potuto provare io**:
      in questa sessione non avevo un browser, quindi sono verificati il render
      col dato vero, l'URL d'uscita e le due query della route, non i sei clic
- [x] **[S]** **L'ordine delle risposte della prima domanda.** Il Figma le elenca
      dal massimo controllo al minimo; nel database `planning_involvement` cresce
      al contrario (`label_min` = "Poco controllo"). Il quiz mostra le risposte in
      ordine di valore, cioè come le dichiara il database: copiare l'ordine del
      disegno significherebbe girare l'asse. Da chiudere con Chiara — o si
      riordina il disegno, o si gira il verso nel database, mai solo la vista
- [x] **[C]** `match_designers()`: bande geografiche, punteggio quiz, punteggio
      filtri, affinità, chiave di ordinamento, badge e salienza dei due assi più
      forti. Restituisce posizione, banda, sezione e badge; **mai punteggi,
      livelli o valori degli assi** — migration `0018` e `0030`, ora chiamata
      davvero da `lib/match.ts` e provata sul database vero
- [x] **[C]** Composizione della frase dai mattoncini nella route server, con
      hash stabile sull'id del TD. In SQL i numeri, in TypeScript le concordanze
      → `lib/frase.ts`. **I testi sono segnaposto: li scrive Gaia**
- [x] **[C]** Pagina risultati con ricalcolo a ogni cambio di filtro (una
      chiamata indicizzata al server, non un ricalcolo nel browser) →
      `app/ricerca/page.tsx`, vestita sul Figma 177:262
- [x] **[S]** Guardare `/ricerca` accanto al Figma e dirmi cosa non torna
- [ ] **[S]** Il terzo gruppo di filtri del Figma, "QUALE TIPO DI SUPPORTO
      CERCHI?" (consulenza, all inclusive, itinerario pronto, viaggio di
      gruppo), e con lui "Filtri avanzati": **non sono implementati.**
      `match_designers()` accetta solo tema e contesto, e i servizi attivi non
      possono filtrare dal browser. Serve un parametro nuovo sulla funzione, cioè
      una migration: è una decisione tua, non una dimenticanza
- [ ] **[S]** I due bolli a stella del Figma dicono "+100 Designer" e "4.9
      valutazione media". Il primo ora mostra il conteggio vero; il secondo non
      c'è, perché non esistono recensioni e `td_review_stats` non è esposta al
      browser. Decidere se sono promesse di marketing o dati
- [x] **[C]** **Maschera contestuale dei filtri** — migration `0036`, 24 agosto.
      `tags_for_destination(livello, ref)` in `SECURITY DEFINER`: restituisce
      l'**unione** dei tag dichiarati dai designer **pubblicati** su quella
      destinazione, mai chi li ha dichiarati, quindi nessun profilo si ricostruisce
      da lì. Funziona con un paese e con una macro-area (che unisce i suoi paesi);
      su una città o un continente solleva, come `match_designers()`. Senza
      destinazione torna tutti i tag: "senza meta non si maschera" è una regola
      della funzione, non un `if` del sito.
      Due scelte di interfaccia da guardare: **un filtro acceso resta visibile
      anche fuori maschera** (cambiando meta con i filtri già scelti, nasconderlo
      lascerebbe la query filtrata da qualcosa di invisibile), e un gruppo che
      resta senza chip **dice** "Nessuno su questa destinazione, per ora" invece
      di scomparire
- [ ] **[B]** I mattoncini della frase, i divisori di sezione e la frase
      introduttiva onesta del fallback (Gaia). I vincoli che i testi devono
      rispettare sono in testa a `lib/frase.ts`. **Un vincolo in più, trovato il
      23 agosto: le frasi del fallback sono due, non una.** Quella che c'è
      ("Nessuno di questi lavora sulla meta che hai scelto…") presuppone una
      destinazione, e senza destinazione era falsa — ora là non compare nessuna
      frase, e resta un buco da riempire se e quando il fallback senza
      destinazione diventa una sezione visibile
- [x] **[C]** Vetrina del TD, con i due box acquistabili e la presentazione non
      acquistabile di su misura e All Inclusive → `/designer/[slug]`, vestita sul
      Figma 171:17. Tutto da `public_td_showcase`, nessuna vista nuova
- [x] **[C]** Contenuto di vetrina nel seed: viaggi firma con foto, itinerari
      pronti, punti dei box, recensioni esterne per Marco e Giulia. Le cinque
      tabelle della vetrina esistevano da migration e nessuna riga le aveva mai
      popolate → `seed/0003_demo.sql`
- [x] **[S]** ~~Riapplicare `seed/0003_demo.sql` al progetto Supabase~~ —
      **fatto**, verificato il 23 agosto contro `rsgyxbqzsxahsbdfgtbm`:
      `/designer/marco-rossi` serve "Alcuni dei miei viaggi" e i tre itinerari
      pronti col loro contenuto vero
- [ ] **[S]** **Come si mostrano i viaggi di gruppo.** La sezione del Figma non
      è costruita perché **non ha una sorgente**: nel form `gruppo[]` non ha
      campi modificabili e resta il contenuto d'esempio, quindi non si importa
      mai (deciso il 6 agosto). Le due strade sono aggiungerla al form o farli
      caricare al team. Finché non si decide, niente sezione e niente tasto
      "Vai ai viaggi di gruppo"
- [x] **[S]** **"Membro XPETIS" nella scheda hero.** La quarta riga del Figma
      vuole `travel_designers.joined_at`, che `public_td_showcase` non espone.
      Non l'ho aggiunta di mia iniziativa: è una riga in più sulla superficie
      pubblica, e la decisione è tua. Oggi le righe sono tre
- [x] **[S]** Guardare `/designer/marco-rossi` accanto al Figma e dirmi cosa non
      torna, come per `/ricerca`
- [x] **[C]** **Pagina "Itinerario pronto da vivere"** → `/designer/[slug]/itinerario/[numero]`,
      vestita sul Figma 261:1068. Chiude le quattro pagine disegnate e accende il
      tasto "Ottieni maggiori informazioni" delle card di vetrina, che era
      inerte. Nessuna vista nuova, nessuna migration: tutto da
      `public_td_showcase`. `lib/vetrina.ts` tiene il contratto dell'URL
      (`percorsoItinerario` / `indiceItinerario`) in un posto solo
- [x] **[S]** **Deciso il 23 agosto: si espone un identificatore stabile** degli
      itinerari, con la migration che serve. Diventa un task mio, qui sotto
- [x] **[C]** **Identificatore stabile degli itinerari** — migration `0033`, 24
      agosto. L'URL porta uno **slug** (`/itinerario/giappone-in-primavera`), non
      più l'ordinale. Scelto contro l'uuid perché questi link finiscono nei
      messaggi WhatsApp del post-call, e là un identificatore si legge o non si
      clicca. Nasce dal titolo al primo inserimento e **non si muove più**: né una
      correzione del titolo né un riordino lo cambiano, e l'harness verifica
      entrambe le cose. Unico per designer, collisioni con suffisso numerico,
      scrivibile a mano da Studio per correggerne uno brutto. `lib/vetrina.ts` ora
      espone `percorsoItinerario` e `trovaItinerario`
- [x] **[S]** ~~**L'URL dell'itinerario è un ordinale**~~ — la domanda più
      pratica che la pagina lascia aperta.** `public_td_showcase` non espone né
      `id` né `position` degli itinerari: dà un array ordinato, quindi
      `/itinerario/2` vuol dire "il secondo della lista". Funziona e non ho
      aggiunto niente alla vista di mia iniziativa, ma **se un designer riordina
      i suoi itinerari i link vecchi portano a quello sbagliato** invece che in
      un 404 — e l'indirizzo non dice niente a chi lo legge. Esporre `id` (o
      `position`, o uno slug dal titolo) è una migration e una riga in più sulla
      superficie pubblica: decisione tua. Quando c'è, si cambiano due funzioni in
      `lib/vetrina.ts` e nient'altro
- [ ] **[S]** **"Acquista l'itinerario" del Figma non esiste nella pagina.** La
      fascia scura in fondo al disegno mette quel tasto accanto a "Personalizza
      con una call". Il Flusso dice che l'itinerario pronto **non si compra**:
      l'unica porta d'acquisto è la consulenza, e nessun `orders.service_type` lo
      ammette. Vince il Flusso, e con quel tasto è caduta la fascia intera,
      perché la sua altra metà (prezzo + call) è già nella scheda in alto
- [x] **[S]** **Deciso il 23 agosto: il form Vetrina TD non si tocca.**
      `td_ready_itineraries` resta a quattro campi. Le sezioni del Figma senza
      sorgente — tappe del viaggio, informazioni utili, galleria, paese
      dell'itinerario, descrizione lunga, e i viaggi di gruppo in vetrina —
      **non si costruiscono**. Il form l'hanno già compilato in venticinque:
      allargarlo vorrebbe dire richiamarli tutti. Si riapre solo se Simone lo
      chiede
- [ ] ~~**[S]** **Le sezioni del Figma senza sorgente**~~, tutte per la stessa
      ragione: `td_ready_itineraries` ha **quattro campi** (titolo, durata,
      prezzo, una foto) e il resto è contenuto che il Flusso non prevede — quindi
      si segnala, non si costruisce. In ordine di peso: *"Le tappe del viaggio"*
      (cinque tappe con giorni, titolo e testo), *"Informazioni utili"* (valigia,
      quota, sanitarie e visti), *"Tappe principali"* nella scheda del prezzo, la
      descrizione lunga dell'itinerario, la galleria a tre foto con "Mostra tutte
      le foto" (di foto ce n'è **una**), e il paese dell'itinerario, che compare
      nel filo di briciole e nella riga sotto il titolo. Le strade sono le stesse
      dei viaggi di gruppo: allargare il form Vetrina TD o farli caricare al team
- [x] **[S]** **Deciso il 23 agosto: "volo non incluso • IVA inclusa" va in
      `app_config`**, valido per tutti gli itinerari, perché il form non si
      tocca. Diventa un task mio, qui sotto
- [x] **[C]** **"volo non incluso • IVA inclusa" in `app_config`** — migration
      `0034`, 24 agosto. Una riga di `app_config` porta un numero **o** un testo,
      con un vincolo XOR che rende impossibili le righe a metà: il tipo numerico
      resta sui parametri su cui SQL fa aritmetica, invece di diventare testo per
      tutti. `public_config` serve anche il gruppo `showcase`, e `matching` resta
      chiuso. Il testo sta in `seed/0001_config.sql` come dato, con l'etichetta
      che dice a cosa serve; svuotare la riga da Studio fa sparire la nota dalla
      pagina. Il sito la legge da `lib/config.ts`
- [ ] ~~**[S]** **"volo non incluso • IVA inclusa"**~~, sotto il prezzo, resta fuori:
      è un'affermazione su cosa comprende un importo che il designer scrive come
      testo libero ("850€"). Se vale per tutti gli itinerari di tutti i designer
      è una riga di `app_config`; se no, un campo del form. Non la scrive il sito
      al posto suo
- [x] **[S]** **Applicare le migration nuove e ri-applicare `seed/0001_config.sql`.**
      **Finché la `0033` non è sul database di sviluppo la pagina dell'itinerario
      risponde 404**, perché la vista non serve ancora lo slug che l'URL nomina.
      Il seed di configurazione porta la nota del prezzo ed è idempotente
      (`on conflict do nothing`), quindi si ri-applica senza pensarci
- [x] **[S]** **Applicare `seed/0004_foto_finte.sql`** al progetto Supabase: è la
      riga che porta `photo_url` da `https://example.com/<slug>.jpg` (host vivo
      che risponde 404, quindi immagine rotta) al bucket `td-media`. Le 23
      immagini finte sono già caricate, i puntatori delle altre sezioni sono già
      giusti: manca solo questa, e sistema le foto profilo in tre posti
- [x] **[S]** Guardare `/designer/marco-rossi/itinerario/vietnam-del-nord-hanoi-ninh-binh-ha-giang`
      accanto al Figma e dirmi cosa non torna. Verificati il render col dato vero
      (prima della `0033`), i 404, i link e il build; **non l'ho vista in un
      browser**
- [ ] **[C]** Test del match sui 25 profili veri: ordinamenti attesi, casi limite
      (nessun quiz, nessuna destinazione, sezioni vuote)
- [ ] **[S]** **Badge "match forte": domanda aperta, non decisione.** Oggi è
      spento (`MOSTRA_BADGE_MATCH_FORTE` in `components/card-designer.tsx`)
      perché il Figma 177:262 non lo disegna — ma dal 14 agosto l'assenza nel
      Figma non chiude niente, e il Flusso lo dichiara "decisione UX da chiudere
      con Chiara: l'algoritmo lo produce comunque"
- [ ] **[S]** **Foto di sfondo della card: domanda aperta, non decisione.** Il
      Flusso la dà come "da definire con Chiara"; il Figma non la disegna e
      `background_photo_url` resta inutilizzata
- [x] **[C]** **La riga di tag della card riportata al Flusso** — 23 agosto. In
      quella riga ci vanno i paesi e soltanto loro, e solo dove la copertura non
      è implicita nella sezione: senza destinazione, e in tutte le sezioni che
      non sono "esperti della meta cercata". I temi sono usciti dalla riga e
      restano dove il Flusso li mette, cioè **dentro la frase** ("e sul tema food
      ha molto da dire"): l'informazione non si perde, cambia posto
- [ ] **[S]** **La riga di tag vuota dove la copertura è implicita.** Conseguenza
      della modifica qui sopra: sotto "Esperti di Vietnam" le card non hanno
      pillole, mentre il Figma 177:262 ne disegna tre in ogni card. Il Flusso è
      esplicito (*"mai quando la copertura è implicita nella sezione"*) e vince,
      ma se Chiara vuole tre pillole anche là serve un contenuto che oggi non
      esiste per quella riga. Lo spazio resta riservato, così l'avatar non balla
- [ ] **[S]** **I divisori di sezione senza destinazione: si mostrano o no.**
      Oggi no, e le card scorrono in una griglia unica — è il Figma 177:262, che
      è l'arrivo dal quiz. Le sezioni però **esistono** anche là (`match_forte`,
      `altri`, `fallback` nascono dalla soglia del badge) e il Flusso vuole "match
      forti, resto e un fallback in coda": se Chiara li vuole visibili servono i
      tre titoli (Gaia) e una risposta su cosa definisca il fallback senza
      destinazione, che il Flusso non dice. L'ordine intanto è già quello giusto,
      perché lo decide `match_designers()` e non l'impaginazione
- [ ] **[S]** **Quanto larga è "sezione di fallback".** Il Flusso dice "nella
      ricerca senza destinazione e nelle sezioni di fallback", e la parentesi
      *"dove serve capire cosa copre il TD"* mi ha fatto scegliere la lettura
      larga: il tag c'è in tutte le bande tranne la 3, perché sotto "Allarghiamo
      alla regione" il viaggiatore non sa quale paese di quell'area il designer
      copra. Se la lettura giusta è la stretta — solo la sezione `fallback` — è
      una riga in `app/ricerca/page.tsx`

---

## Milestone 4 — Prenotazione e pagamento della consulenza

- [x] **[S]** ~~Account Cal.com di regia con l'event type modello~~ → **S-09
      chiuso nella milestone 2.** L'event type modello, con tutte le
      impostazioni verificate, è in `ONBOARDING_CALCOM_TD.md`
- [x] **[C]** Login Google al momento del Prenota, con registrazione automatica.
      **Chiuso l'8 settembre 2026** → `app/accedi/page.tsx`. Il tasto *Prenota*
      di un anonimo porta a `/accedi?next=<vetrina col servizio scelto>`, e al
      ritorno l'embed si apre. Il login **non è un cancello** sul resto del
      sito: sulla prenotazione sì, e per un motivo tecnico non di prodotto —
      senza UUID il ponte risponde `viaggiatore_non_identificato` e resta uno
      slot occupato senza riga
- [x] **[C]** Embed Cal.com con nome, email e ID utente XPETIS precompilati.
      Torna in `payload.responses.xpetis_user_id.value`. **Chiuso l'8 settembre
      2026** → `components/prenota-consulenza.tsx`, `lib/cal-embed.ts`,
      migration `0040`. Il tasto *Prenota la call* non è più `disabled`: apre
      l'iframe inline nella vetrina. Serviva esporre `cal_username` e
      `cal_event_type_slug` su `public_td_showcase`, e nel commento della 0040
      c'è scritto cosa diventa leggibile con gli strumenti di sviluppo aperti
- [~] **[C]** Pagina form + pagamento nei tre stati (in attesa, confermata,
      scaduta): cellulare, domanda di contesto, flag servizi. **Gli stati ci
      sono** (`app/prenotazione/[id]/page.tsx`), il form no: cellulare, domanda
      di contesto e flag servizi restano da fare
- [x] **[C]** **Il passaggio dall'embed alla cassa**, che non era in questo
      elenco e andava progettato: il viaggiatore finisce di prenotare **prima**
      che il webhook Cal.com sia arrivato, quindi la pagina non ha niente su cui
      aprire una cassa. Pagina d'attesa che interroga il server con pause
      crescenti per ~33 secondi (`app/attesa/`). Non si legge l'uid dall'evento
      dell'embed: è un campo non documentato e soprattutto quel codice non deve
      stare nel browser (S-05). Il viaggiatore è loggato, e tanto basta al server
      per ritrovare la *sua* prenotazione. Se non compare, alert
      `calcom_webhook_non_arrivato` in `team_alerts`: **esiste uno slot occupato
      senza riga, e nessun orologio lo libererà**.
      *Completato l'8 settembre col segnale che innesca l'attesa*, che l'8
      settembre non c'era: l'evento `bookingSuccessfulV2` dell'embed. Verificato
      sui **tipi pubblicati** di `@calcom/embed-core@1.5.3`, non dedotto —
      `EventDataMap` li elenca, e marca `bookingSuccessful` come deprecato in
      favore di V2. La **strada scartata** è il *Redirect on booking*
      sull'event type: dentro un embed inline naviga l'iframe e non la pagina
      (issue Cal.com `#18144`), quindi la pagina di pagamento comparirebbe
      incorniciata nel calendario — **e sarebbero state 25 impostazioni da
      cambiare**. Con l'evento non si tocca nessun account: l'unica nota in
      `ONBOARDING_CALCOM_TD.md` è di lasciare quel campo **vuoto**
- [x] **[C]** **Cassa aperta dal server**: Checkout Session creata da una route
      con l'importo letto dal database, più verifica dell'importo prima di
      portare la riga a "pagata". **Chiuso il 7 settembre 2026** →
      `app/prenotazione/[id]/cassa/route.ts`, `lib/stripe.ts`, migration `0038`.
      La verifica dell'importo **non** è finita in n8n come diceva questa riga:
      sta nel ponte Postgres insieme a tutto il resto, perché n8n non decide
      niente. Tre cose imparate costruendola: `payments_one_pending_per_kind` è
      l'unico modo di rendere impossibile la doppia cassa (fra il `select` e
      l'`insert` un doppio clic passa), quindi la riga si scrive **prima** di
      chiamare Stripe; `expires_at` di Stripe accetta solo 30 minuti-24 ore e la
      nostra finestra vale esattamente 30, quindi si taglia invece di esplodere,
      e l'autorità resta `payment_deadline_at`; l'**adaptive pricing è acceso di
      default** e farebbe incassare nella valuta del visitatore, cioè un alert
      critico su un pagamento buono — si spegne esplicitamente
- [x] **[C]** **Ponte Cal.com → `bookings`** (created, rescheduled, cancelled)
      → migration `0037_calcom_webhook.sql` + workflow n8n
      `n8n/calcom-consulenze.json`. **Chiuso il 6 settembre 2026**, provato
      sull'indirizzo di produzione del webhook.
      La logica sta nel database, n8n fa il fattorino: la macchina a stati vive
      già qui, e in un grafo di nodi sarebbe stata reimplementata fuori senza
      vincoli né prove. Le tre cose imparate dai messaggi veri e finite nel
      codice: il designer si identifica con **`cal_username` + `payload.type`**
      (i 25 copiano lo stesso event type modello, quindi lo slug da solo non
      identifica nessuno, e **non** sta in `eventType.slug`); una
      riprogrammazione è una prenotazione **nuova**, quindi la riga si trova con
      `rescheduleUid` e `cal_booking_uid` va **sostituito**; l'attribuzione si
      legge da `rescheduledBy`/`cancelledBy` confrontati con `organizer.email`.
      Le sette fixture vere si rigiocano in sequenza nell'harness, catena
      compresa
- [~] **[C]** Workflow Stripe → conferma. **Risponde sempre 2xx** anche quando
      non ha niente da fare: un 500 ripetuto porta Stripe a disattivare
      l'endpoint. **Il ponte è dentro il 7 settembre 2026** → migration
      `0039_stripe_webhook.sql` + workflow `n8n/stripe-pagamenti.json`, stessa
      forma della 0037 perché due ponti identici sono due ponti che una persona
      sola può tenere in testa. Quello che NON è una copia: la firma di Stripe è
      un HMAC su `"<t>.<corpo>"` con **finestra di tolleranza di 5 minuti**
      (senza, una firma intercettata resta valida per sempre) e può portare più
      `v1` durante una rotazione del segreto; il diario usa l'`evt_` che Stripe
      manda, senza comporre chiavi. Restano da fare le **mail** (serve il
      provider, punto aperto 3) e i due passi di Simone qui sotto
- [x] **[S]** ~~Applicare la migration `0040_showcase_cal_link.sql`~~ →
      **applicata a mano dal SQL Editor**, e confermata il 20 settembre. La
      storia delle migration era rimasta indietro sulle `0038`-`0040` (applicate
      a mano, mai registrate): riparata con `supabase migration repair` dopo aver
      verificato che gli oggetti ci fossero davvero, come già il 6 settembre per
      le `0033`-`0036`. Da lì `db push` ha portato la sola `0041`
- [x] **[S]** ~~Creare l'endpoint webhook su Stripe, `whsec_…` in Vault,
      workflow su n8n~~ → **fatto nel collaudo dell'8 settembre**, con un
      pagamento vero da 60 € che ha attraversato la catena
- [x] **[S]** ~~Inserire su Studio le due righe nuove di `app_config`~~ →
      **fatte nel collaudo dell'8 settembre.** ⚠️ Ma `whatsapp_number` era nel
      gruppo `showcase`, che `public_config` espone ad `anon`: la correzione del
      7 settembre l'ha spostata in **`contacts`**. Se la riga su Studio è stata
      inserita col gruppo vecchio, va cambiata a mano:
      `update app_config set config_group='contacts' where key='whatsapp_number';`
      Altrimenti il tuo cellulare è servito dall'API a chiunque
- [x] **[C]** **"Le mie prenotazioni", l'area del viaggiatore.** Non era in
      nessuna milestone e non è un pezzo dimenticato: **il Flusso guida il
      viaggiatore con le mail**, non con un'area riservata — conferma,
      promemoria, mail post-call coi bottoni, pagine a token per gli ordini. In
      quel disegno una lista personale è comodità.
      *Perché entra adesso.* Con la milestone 4 in piedi si è aperto un buco
      concreto: **se il viaggiatore chiude la scheda fra la prenotazione e il
      pagamento non ha nessun modo di tornare indietro.** Non c'è una lista, e la
      mail che gli darebbe il link **non esiste** — il provider è S-04, non
      fatto. Quella prenotazione diventa irraggiungibile e scade da sola,
      lasciando occupato uno slot.
      Le due vie non sono equivalenti: la mail serve comunque (sono quindici) ma
      **dipende da cose non nostre** — provider, testi di Gaia, e una settimana
      di dominio da scaldare; la pagina non dipende da nessuno e le viste
      esistono dal 4 agosto (`my_bookings`, `my_orders`, migration `0019`,
      costruite esattamente per questo). Si fa la pagina **e** la mail, in
      quest'ordine, perché la pagina si può fare oggi.
      *Deciso da Simone l'8 settembre 2026.* Minima di proposito: le prenotazioni
      con il loro stato e, per quelle da pagare, il tasto. **Nessun profilo,
      nessuna preferenza**: il Flusso non li chiede, e un'area personale che
      cresce da sola è la strada per una milestone non prevista.
      **Costruita il 18 settembre 2026** → `app/le-mie-prenotazioni/page.tsx`,
      `lib/prenotazioni.ts`, link nell'header. Nessuna migration: `my_bookings`
      aveva già tutto dal 4 agosto. Quattro cose decise costruendola:
      · il percorso è **`/le-mie-prenotazioni` e non `/prenotazioni`**, che
        disterebbe una lettera da `/prenotazione/[id]` — una "i" persa in un
        `href` o in un `?next=` non rompe niente di visibile e nessun controllo
        di tipo la intercetta;
      · **lo stato mostrato non è `status`**: `pending_payment` con
        `payment_deadline_at` passata (righe che esistono, e continueranno a
        esistere finché non c'è l'orologio) mostra "tempo scaduto" e **nessun
        tasto**, perché la route della cassa lo rifiuterebbe con un 409. Sette
        stati diventano nove situazioni, tutte con una frase;
      · `Conto` e il tasto *Paga* sono stati **estratti** da
        `stato-prenotazione.tsx` invece di ricopiati: dentro quel tasto stanno
        tre comportamenti che si scoprono solo sbagliandoli (la prova 10, la
        risposta `in_conferma`, il `router.refresh()` sul fallimento);
      · la pagina della prenotazione era **muta su `completed` e `no_show`** —
        testata e sotto il vuoto. Difetto vecchio che nessuno vedeva perché
        nessuno ci arrivava: ora ogni riga della lista ci manda, e i due stati
        hanno il loro racconto.
      **Gli ordini non ci sono**: nascono nelle milestone 6 e 7 e il posto dove
      andranno è segnato con un commento in fondo alla pagina, `my_orders`
      compresa. La **mail resta da fare** e non è un doppione: questa pagina
      copre chi torna sul sito da sé, la mail tutti gli altri
- [x] **[C]** Orologio unico ogni 5 minuti: insoluti oltre i 30 minuti (annulla
      su Cal.com col solo codice prenotazione, stato a "non pagata", mail
      cortese) e tutte le altre scadenze dovute. **In produzione la cadenza deve
      restare 5-10 minuti**: con finestra di 30 e controllo ogni 30 il caso
      peggiore diventa 60 minuti, e la regola dice massimo 35.
      **Costruito il 18 settembre 2026** → `0041_orologio.sql` +
      `n8n/orologio.json`. ~~La mail cortese non c'è~~ → **c'è dal 20 settembre
      2026** (`0043_posta.sql`): si accoda nel momento in cui `clock_task_done()`
      sa che lo slot è stato liberato davvero, mai prima. Convive con
      l'annullamento nativo di Cal.com, che resta acceso (deviazione 5) e porta
      il motivo scritto in `app_config.unpaid_cancel_reason`: la nostra non
      ripete l'annuncio, spiega il perché e dice cosa fare adesso.
      Cinque cose decise costruendolo:
      · **la forma è diversa dai due ponti**, e il perché è uno solo: i ponti
        *ricevono*, questo *agisce verso l'esterno*, e Postgres non fa chiamate
        HTTP. `clock_tick()` decide chi è scaduto, n8n esegue, `clock_task_done()`
        decide cosa significa l'esito — e n8n gli passa il **codice HTTP** che
        Cal.com ha risposto, non un giudizio;
      · **si marca `cancelled_unpaid` dopo, mai prima.** Chiudere la riga prima e
        poi fallire la chiamata lascerebbe una riga chiusa e uno slot occupato
        che nessuno guarderà **mai più**, perché l'orologio non ripassa sulle
        righe chiuse. Marcando dopo, il giro successivo la ritrova. È la stessa
        regola di `webhook_events.processed_at`;
      · **la nostra cancellazione torna indietro come webhook**, e il ponte
        potrebbe attribuirla al viaggiatore. Il trigger
        `bookings_force_system_cancel_actor` la attribuisce al sistema da
        qualunque porta entri: `booking_status_history` è l'unica prova di chi ha
        agito, e il designer non ha login;
      · **il conto dei 35 minuti non torna già adesso**: finestra 30 + grazia 0 +
        cadenza 5 fa esattamente 35, cioè siamo sul limite e la grazia **non ci
        sta**. `booking_cancel_grace_min` nasce a zero, e allargarla è una
        decisione tua — sotto, in "cosa resta a te";
      · **due righe non si toccano mai**: quelle con un incasso già riuscito
        (prendere i soldi e dare via lo slot è il danno peggiore possibile) e
        quelle con `payment_deadline_at` nullo, che la cassa tratta come pagabili.
      Harness a **387 asserzioni** (erano 349), verdi.
      **Collaudato il 20 settembre 2026, e ha funzionato solo dopo due
      correzioni al workflow**, entrambe nella giuntura fra Postgres e n8n:
      il payload non veniva appiattito (`cancel_url`, `api_version` e `reason`
      stanno dentro `payload`, e il nodo HTTP li cercava al livello alto: trovava
      `undefined` e il giro era **tutto verde senza cancellare niente**), e il
      corpo portava `uid` e `allRemainingBookings`, che sono campi della v1 e che
      la v2 rifiuta con 400. `n8n/orologio.json` nel repo è stato riallineato lo
      stesso giorno: reimportarlo non rimette i difetti
- [~] **[C]** Testi che convivono con le mail native di Cal.com. ~~Dipende da
      S-04~~ → **S-04 è chiuso, e l'impalcatura c'è tutta** (0043): i testi sono
      righe di `message_templates`, la coda è `outbound_messages`, la consegna è
      un ramo dell'orologio. **Di questa riga è stata scritta una mail su tre**:
      quella di chi perde lo slot, che il 20 settembre era l'unico pezzo
      mancante dell'orologio.
      Restano le due della conferma, che sono milestone 4 e non sono state
      anticipate: **la conferma al viaggiatore** (data, ora, link video, regole
      in chiaro — e deve dire che lo slot è tenuto 30 minuti e che la conferma
      vera arriva col pagamento) e **la mail al designer** col contesto scritto
      dal viaggiatore, il flag sui servizi e il profilo quiz. Adesso sono due
      righe di seed e un ramo, non un progetto
- [ ] **[C]** Calendario admin degli appuntamenti
- [ ] **[C]** Percorso "slot introvabile": link WhatsApp, prenotazione creata a
      mano dal team che innesca gli stessi workflow
- [x] **[C]** **Le firme Cal.com rifiutate.** Non era in nessuna milestone, e
      non è un pezzo dimenticato: è il **primo** dei due modi in cui un designer
      smette di arrivarci senza nessun segnale. Parola segreta sbagliata →
      `calcom_webhook()` risponde `firma_non_valida`, **non scrive niente da
      nessuna parte**, n8n risponde 200 e Cal.com è contento. Con 25 account
      configurati a mano non è un rischio, è una previsione.
      **Fatto il 20 settembre 2026** → `0042_firme_rifiutate.sql`. Un
      **contatore**, non un diario: una riga per ora in
      `calcom_signature_rejections`, perché il "non si scrive" della 0037 non si
      annulla — l'indirizzo del webhook è pubblico, e una riga per ogni corpo
      arbitrario ne farebbe una discarica scrivibile da chiunque. Il ramo 2
      dell'orologio somma la finestra e alza `calcom_firme_rifiutate` sopra
      soglia, una volta finché non è risolto.
      **L'alert dice anche di chi**, ed è la decisione difficile: su una firma
      non valida il corpo non è autenticato, quindi `organizer.username` è un
      dato che chiunque può scrivere. Senza però l'alert direbbe "qualcuno manda
      firme sbagliate", che con 25 account è decorativo. Il rischio si riduce
      **alla fonte**: si salva solo un username che è già uno dei nostri, tutto
      il resto diventa `null` — quindi il peggio che può fare chi scrive corpi
      finti è indicare al team uno dei 25 veri, non inserire testo arbitrario.
      L'alert lo dichiara non verificato e nessun automatismo ci agisce sopra
- [x] **[C]** ~~Controllo periodico di vitalità dei 25 webhook Cal.com~~ →
      **chiuso il 20 settembre 2026, e NON con un controllo periodico.**
      La tentazione era un ramo dell'orologio che avvisa se un designer non manda
      niente da N giorni, e ha un difetto strutturale: **in Beta un designer
      senza prenotazioni è indistinguibile da uno col webhook rotto**, perché il
      segnale manca per la stessa ragione per cui manca il traffico. Avrebbe
      prodotto 25 alert il primo giorno, il team avrebbe imparato a ignorarli, e
      il giorno che uno è vero nessuno guarda. **Qui la soluzione che sembra più
      completa è quella sbagliata.**
      Al suo posto due cose che sono **evidenza invece che inferenza**:
      · `calcom_webhook_non_arrivato` adesso **dice quale designer**
        (`app/attesa/cerca/route.ts`): è la prova diretta che qualcuno ha
        prenotato e a noi non è arrivato niente. Lo slug della vetrina arriva
        fino alla route e serve solo a cercare la riga di `travel_designers` —
        nell'alert finisce il nome che risponde il database, mai la stringa
        arrivata da fuori;
      · **la prenotazione di prova per designer in onboarding**, verificata con
        una query su `bookings` e non guardando le esecuzioni di n8n — che con la
        parola segreta sbagliata sono **verdi lo stesso**, ed è esattamente
        l'errore che il vecchio passo 5 induceva a fare.
        `cal_webhook_ok_at` si scrive **solo dopo** quella verifica: deve voler
        dire "provato", non "configurato". In `ONBOARDING_CALCOM_TD.md`.
      Scartato anche il **ping sintetico** (interrogare periodicamente Cal.com
      per verificare che il webhook sia configurato): sarebbe evidenza vera, ma
      leggere la configurazione di un account richiede una chiave API per
      account — cioè le 25 chiavi che S-05 ci ha appena risparmiato

### ✅ Le prove nel browser — tutte passate il 18 settembre 2026

**Simone le ha eseguite tutte e sedici: passate.** La tabella resta qui come
descrizione di *cosa* significa "funziona", non come lista di cose da fare: è la
prova di regressione da rigiocare quando si tocca il giro della prenotazione.

**Cosa chiude, precisamente.** Questa era la parte che nessuno di noi due poteva
verificare: l'harness gira su PGlite e io non ho un browser, ma il pezzo centrale
è un **iframe di terze parti**. Del contratto degli eventi avevamo solo i tipi
pubblicati di `@calcom/embed-core@1.5.3` — la documentazione non nomina
`bookingSuccessfulV2` — e la strada alternativa era stata scartata su prova
documentale, non provata. **Adesso l'evento è stato visto scattare su un embed
vero.** Fra "il contratto dice che c'è" e "scatta da noi" c'era la distanza che
con Cal.com avevamo già pagato una volta, su `rescheduleUid`: questa volta non
l'abbiamo pagata.

Passano anche i quattro controlli che nessun test automatico può coprire, e sono
quelli che conta di più aver visto con gli occhi: l'open redirect su `?next=`
(8), il doppio clic su *Paga* che produce **una** riga in `payments` (10), la
prenotazione di un altro account che dà 404 e non un errore di permessi (11), e
il rifiuto su una scadenza passata (12).

Prerequisiti di allora, se si rigioca: migration `0040` applicata, designer di
prova pubblicato con `cal_username` scritto, workflow Cal.com attivo. Le due
righe di `app_config` e l'endpoint Stripe servono dal punto 4 in poi.

| # | Cosa fai | Cosa deve succedere | Esito |
|---|---|---|---|
| ✅ 0a | L'header **da scollegato**, su qualunque pagina | A destra c'è *Accedi* rosso | — |
| ✅ 0b | L'header **da collegato** | Al posto di *Accedi*: **"Ciao \<nome\>"** e un bottone *Esci* che ti riporta alla home scollegato | Se vedi ancora *Accedi* da collegato, la sessione non arriva all'header: guarda i cookie |
| ✅ 0c | `/attesa` **in `npm run dev`**, aprendola a mano senza aver prenotato | Passa da "Stiamo registrando" a **"Lo slot è tuo, la conferma no"** dopo ~33 secondi. ⚠️ Prima dell'8 settembre restava su "Stiamo registrando" **per sempre** in sviluppo | Se resta bloccata: è tornata la guardia `useRef` sull'effetto, vedi `components/attesa-prenotazione.tsx` |
| ✅ 1 | Vetrina di un designer **senza essere collegato** → *Prenota la call* | Vai a `/accedi`, e dopo Google torni **sulla stessa vetrina col servizio giusto**, non sulla home | Guarda il `?next=` nell'indirizzo: dev'essere `/designer/<slug>?servizio=…` |
| ✅ 2 | Header: i tre link | *Accedi* → pagina; *Scopri i Travel Designer* → `/ricerca`; *Entra a far parte* → **spento**, con la spiegazione al passaggio del mouse | — |
| ✅ 3 | Da collegato, *Prenota la call* | Il calendario compare **nella pagina**, e nel campo *Codice XPETIS* c'è il tuo UUID, **precompilato e non modificabile** | Se il campo è vuoto o scrivibile: l'identificatore sull'event type non è `xpetis_user_id` esatto |
| ✅ 4 | Prenoti uno slot fino in fondo | **La pagina cambia da sé**, va su `/attesa` e poi su Stripe | ⚠️ **è il punto che conta.** Vedi sotto |
| ✅ 5 | Dalla pagina Stripe torni indietro col tasto del browser | La pagina della prenotazione dice *Manca il pagamento* col conto alla rovescia, e il tasto riapre **la stessa** cassa, non una seconda | Se apre una cassa nuova, in `payments` compaiono due righe: dimmelo |
| ✅ 6 | Paghi con `4242 4242 4242 4242` | *Stiamo confermando* per qualche secondo, poi *Consulenza confermata* col link della videochiamata | Guarda `webhook_events where provider='stripe'` |
| ✅ 7 | Prenoti dopo aver **spento il workflow n8n Cal.com** | Dopo ~33 secondi: *"Lo slot è tuo, la conferma no"*, il link WhatsApp, e una riga `calcom_webhook_non_arrivato` in `team_alerts` | — |
| ✅ 8 | Apri a mano `/accedi?next=https://example.com` | **Non ti porta fuori dal sito.** `next` accetta solo percorsi interni | Se esci dal dominio, la pagina è un trampolino: fermati e dimmelo |
| ✅ 9 | Sotto il calendario, clicca **di proposito** *"Hai finito di prenotare e la pagina non è cambiata? → Vai al pagamento"* | Stessa destinazione dell'evento automatico | È il paracadute se `bookingSuccessfulV2` cambia nome: se è rotto lo scopriamo il giorno in cui serve |
| ✅ 10 | Sulla pagina della prenotazione, *Paga la consulenza* **due volte in rapida successione** | `select count(*) from payments where booking_id='<id>'` deve dare **1** | È ciò per cui esistono `payments_one_pending_per_kind` e l'ordine invertito nella route: riga prima, Stripe dopo |
| ✅ 11 | Da un **secondo account Google**, apri `/prenotazione/<id di una prenotazione del primo>` | **404**, non un errore di permessi: inesistente e "non è tua" danno la stessa risposta di proposito | Controllo di autorizzazione che nessun test automatico copre |
| ✅ 12 | `update bookings set payment_deadline_at = now() - interval '1 minute' where id='<id>';` poi *Paga* | **Rifiuta.** L'autorità è `payment_deadline_at`, non lo stato | Conta doppio finché l'orologio dei 5 minuti non esiste |
| ✅ 13 | `/le-mie-prenotazioni` **da scollegato** | Ti porta a `/accedi`, e dopo Google **torni qui**, non sulla home | Guarda il `?next=`: dev'essere `/le-mie-prenotazioni` |
| ✅ 14 | Da collegato, con prenotazioni in stati diversi. Il modo veloce di averceli: `update bookings set status='completed' where id='<id>';` su righe di prova, uno stato alla volta | **Nessuna riga muta**: tutte e sette gli stati dicono una frase. In cima quella da pagare col conto alla rovescia e il tasto, in fondo le chiuse, dalla più recente. Con `payment_deadline_at` già passata: "Tempo scaduto" e **nessun tasto** | Una riga senza frase o un tasto *Paga* su una scaduta: dimmelo, sono i due difetti che questa pagina esiste per non avere |
| ✅ 15 | Da collegato, **con un account che non ha prenotato niente** | Non una pagina vuota: "Non hai ancora prenotato niente" e il tasto verso `/ricerca` | — |
| ✅ 16 | Il link nell'header, **da desktop e da telefono** | Desktop: *"Le mie prenotazioni"* per esteso accanto al saluto. Telefono: la voce per esteso non c'è (non ci sta nella pillola) e **il saluto "Ciao \<nome\>" è il link** | Se da telefono il saluto non porta da nessuna parte, l'unica porta all'area sparisce proprio dove serve di più |
| ✅ 17 | **Prima di tutte le altre prove dell'orologio**: il `curl` che verifica l'endpoint di cancellazione, su una prenotazione di prova che puoi permetterti di perdere. I due candidati e i comandi stanno in `n8n/LEGGIMI.md` | Uno dei due risponde 2xx **e lo slot sparisce dal calendario**. Poi, da Studio: `update app_config set value_text = '<quello giusto>' where key = 'calcom_cancel_url';` | ⚠️ **Se nessuno dei due funziona senza chiave, fermati e dimmelo.** Vuol dire 25 chiavi API da raccogliere in onboarding, ed è una decisione di prodotto, non un dettaglio tecnico |
| ✅ 18 | `select * from clock_tick(10);` da Studio **senza nessuna prenotazione scaduta** | Zero righe, nessun errore, nessun alert | Se **solleva**, manca una riga di `app_config`: è voluto che sollevi invece di girare a vuoto in silenzio |
| ✅ 19 | **Il giro completo, che è la prova vera.** Prenoti una consulenza, **non paghi**, aspetti. Tieni aperto il calendario del designer su Cal.com | Entro ~35 minuti la prenotazione passa a `cancelled_unpaid` e **lo slot ricompare libero su Cal.com**. In `booking_status_history` l'ultima riga dice attore **`system`**, non `traveler` | Slot ancora occupato: guarda `team_alerts` (`kind like 'orologio_%'`) e le esecuzioni n8n. Storia che dice `traveler`: il trigger non ha fatto il suo lavoro, **dimmelo** — quella riga è l'unica prova di chi ha agito |
| ✅ 20 | Sulla riga della prova 19: `update bookings set status='pending_payment', cancel_requested_at=null, cancel_attempts=0 where id='<id>';` poi *Execute Workflow* a mano | Cal.com rifiuta la seconda cancellazione, **e va bene così**: l'esito è `gia_liberata`, e in n8n non c'è nessuna esecuzione rossa | È la trappola 3: cancellare due volte dev'essere innocuo. La difesa non è nel messaggio d'errore di Cal.com ma nello stato della riga |
| ✅ 21 | `update bookings set payment_deadline_at = now() - interval '1 minute' where id='<id di una PAGATA>';` e aspetti un giro | **Non succede niente.** Una riga con un incasso riuscito non si tocca, scaduta o no | Se quello slot viene cancellato fermati subito: è il danno peggiore che questo workflow possa fare |
| ✅ 22 | `update app_config set value = 45 where key = 'booking_payment_window_min';` e aspetti due giri. Poi rimetti 30 | **Un** alert `orologio_fuori_budget` in `team_alerts`, e resta uno solo anche dopo il secondo giro | È il guardiano del conto dei 35 minuti, e serve perché i parametri si cambiano da Studio, dove nessun test passa |
| 23 | Manda un corpo qualsiasi all'indirizzo del webhook Cal.com **con una firma inventata**: `curl -X POST "$N8N_PUBLIC_URL/webhook/calcom-consulenze" -H 'Content-Type: application/json' -H 'x-cal-signature-256: inventata' -d '{"triggerEvent":"BOOKING_CREATED","createdAt":"2026-09-20T10:00:00.000Z","payload":{"uid":"prova","type":"consulenza-xpetis-30","organizer":{"username":"<username di un designer vero>"}}}'`. Tre volte | n8n risponde **200** (giusto), l'esito è `firma_non_valida`, **niente in `webhook_events`**, e in `calcom_signature_rejections` **una riga** con `n = 3` e l'username | Se compaiono tre righe invece di una, il raggruppamento per ora non funziona e la tabella crescerebbe per messaggio |
| 24 | Aspetti un giro dell'orologio | Un alert `calcom_firme_rifiutate` in `team_alerts`, che **dice l'username** e dice a chiare lettere che è un indizio non verificato. Dopo altri giri resta **uno solo** | — |
| 25 | Ripeti la 23 mettendo `"username":"non-esiste-questo"` | Nella tabella la riga nuova ha `cal_username_hint` **nullo**, non la stringa inventata | Se ci finisce la stringa, l'indirizzo pubblico può scrivere testo arbitrario in un alert del team: fermati e dimmelo |
| 26 | **La prova che conta per l'onboarding.** Su un designer di prova, cambia di proposito la parola segreta del webhook su Cal.com (una lettera in meno), poi prenota uno slot | In n8n l'esecuzione è **verde**, 200 — e in `bookings` **non c'è nessuna riga nuova**. È il guasto silenzioso, visto una volta di proposito, e il motivo per cui il punto 5 dell'onboarding adesso si verifica sul database e non su n8n. Poi rimetti la parola segreta giusta e rifai la prova | Se invece la riga compare, la parola segreta non era davvero sbagliata: ricontrolla di aver cambiato quella su Cal.com e non quella nel Vault |

⚠️ **Le prove 0c e 7 scrivono un alert critico vero** (`calcom_webhook_non_arrivato`):
è corretto che lo facciano, ma è un falso allarme di collaudo e va tolto, come
già fatto per quello di Stripe —
`delete from team_alerts where kind = 'calcom_webhook_non_arrivato';`

**Sul punto 4, se non si muove niente.** Non è un caso da rincorrere a mano:
sotto il calendario c'è **sempre** la riga *"Hai finito di prenotare e la pagina
non è cambiata? → Vai al pagamento"*, che porta esattamente dove porta l'evento.
Il flusso quindi non è mai bloccato, è solo meno liscio. Se accade, apri la
console del browser **prima** di ricaricare e guarda quale evento arriva:

```js
// nella console, sulla vetrina, dopo aver aperto il calendario e prima di prenotare
["bookingSuccessfulV2", "bookingSuccessful", "*"].forEach((a) =>
  window.Cal.ns[Object.keys(window.Cal.ns)[0]]("on", {
    action: a,
    callback: (e) => console.log("EVENTO:", a, e.detail),
  }),
)
```

Il nome che compare è la risposta, e si cambia in `lib/cal-embed.ts`: due
costanti in cima al file. **Dimmelo invece di sistemarlo** — se il nome è
cambiato è cambiato per tutti, e va scritto nel registro, perché è la stessa
classe di trappola di `rescheduleUid`.

⚠️ **Il punto 7 mostra in pagina il numero WhatsApp, che è il tuo cellulare.**
Non è pubblicato (gruppo `contacts`, che `public_config` non espone) ma resta
visibile a chi apre quella pagina: fai quella prova su localhost, non su un
indirizzo Vercel condiviso.


### 🔴 Le prove della posta e delle pagine a token (20 settembre 2026)

**Da qui in poi le prove mandano posta vera.** Non è una formula di prudenza: il
primo giro dell'orologio dopo la 0043 incontra **tutte** le consulenze già
finite, comprese quelle fabbricate durante i collaudi, e i loro viaggiatori sono
indirizzi veri. Per questo `email_enabled` nasce a **0**, e per questo le prove
27-29 si fanno **prima** di accenderlo.

#### I tre gradini, in ordine

```sql
-- gradino 1 — SPENTA (è il default). Si compone e si accoda, non parte niente.
update app_config set value = 0 where key = 'email_enabled';

-- gradino 2 — DIROTTATA. Parte davvero, ma va tutta a una casella tua, e
-- l'oggetto dice a chi sarebbe andata.
update app_config set value_text = 'tu@example.com' where key = 'email_redirect_to';
update app_config set value = 1 where key = 'email_enabled';

-- gradino 3 — VIVA. Da qui in poi scrive a gente vera.
update app_config set value_text = '' where key = 'email_redirect_to';
```

Il dirottamento cambia **il destinatario della consegna**, non la riga:
`recipient` resta la persona vera — quindi il vincolo «una mail per tipo, entità
e destinatario» continua a significare quello che significa — e `delivered_to`
dice dove è finita davvero.

#### Come si legge la coda su Studio

È anche il modo in cui Gaia corregge i testi: sul vero, non su un documento.

```sql
-- la coda, dall'ultima
select queued_at, status, message_kind, recipient, delivered_to, subject,
       attempts, provider_message_id, last_error
  from outbound_messages
 order by queued_at desc limit 30;

-- una mail, come la leggerà chi la riceve
select body_text from outbound_messages where id = '<id>';
```

Per vederla **impaginata**: copia `body_html` in un file `.html` e aprilo nel
browser. È la versione che arriva davvero.

Per correggere un testo: `update message_templates set body_it = '…' where key =
'postcall_traveler';` — nessun deploy. Le righe già in coda **non** si
ricompongono: portano il testo di quando sono nate, ed è voluto (una mail è un
fatto, non una vista). Per rifarne una, si cancella la riga e si lascia che
l'orologio la ricomponga al giro dopo.

#### Come si crea un token a mano

Serve per provare le pagine senza aspettare una mail.

```sql
-- un bottone post-call su una prenotazione che esiste
insert into access_tokens (purpose, audience, booking_id, td_id, payload)
select 'traveler_service_request', 'traveler', b.id, b.td_id,
       jsonb_build_object('service_type', 'custom_itinerary')
  from bookings b
 where b.id = '<id della prenotazione>'
returning token;
```

L'indirizzo è `<site_base_url>/servizio/<token>`. Per fabbricarne uno **scaduto**
si aggiunge `expires_at => now() - interval '1 day'`; per uno **revocato** si
fa `update access_tokens set revoked_at = now() where token = '…'`.

⚠️ Un token è una credenziale: chi ce l'ha è dentro. Non incollarlo in una chat,
in un ticket o in un messaggio a qualcuno «per far vedere».

| # | Cosa fai | Cosa deve succedere | Esito |
|---|---|---|---|
| 27 | Applicata la `0043` e inserite le righe di `app_config`, da Studio: `select * from clock_tick(10);` | Nessun errore. E in `team_alerts` **nessun** `orologio_ramo_non_configurato` | Se c'è, leggilo: il messaggio elenca esattamente le righe che mancano. Sistemale e al giro dopo si chiude da solo |
| 28 | **Ancora con `email_enabled = 0`.** Fabbrica una call finita: `update bookings set status='confirmed', ends_at = now() - interval '5 minutes', starts_at = now() - interval '35 minutes' where id='<id di una tua prenotazione di prova>';` poi `select * from clock_tick(10);` | In `outbound_messages` **una** riga `postcall_traveler`, `status='queued'`, **`sent_at` nullo**, e `body_html` pieno. E `clock_tick` **non** restituisce nessun compito `email_send` | Se torna un compito `email_send`, l'interruttore è già acceso: spegnilo prima di continuare |
| 29 | Leggi quella riga: `body_text` a schermo, `body_html` copiato in un file e aperto nel browser | Si legge come una mail vera. I bottoni sono **solo** dei servizi attivi di quel designer, e i link puntano a `<site_base_url>/servizio/<token>` | È il momento in cui Gaia guarda. Correggere un testo è un `update` su `message_templates` |
| 30 | Rigira l'orologio due o tre volte | La riga resta **una**. `queued_at` non cambia | Se ne compaiono due, il vincolo di unicità non sta lavorando: fermati e dimmelo, perché è anche il tetto di spesa sulle 100 mail al giorno |
| 31 | **Gradino 2**: dirotta su una casella tua e accendi. Poi *Execute Workflow* a mano su n8n | La mail **arriva a te**, con l'oggetto che comincia per `[prova → <indirizzo vero>]`. In `outbound_messages`: `status='sent'`, `sent_at` pieno, `provider_message_id` pieno, `delivered_to` la casella tua e `recipient` **ancora quella vera** | Se prende 401: hai scelto sul nodo Resend la credenziale di Supabase (`apikey`) invece di quella nuova (`Authorization`). Se prende 422: guarda `last_error`, di solito è il mittente |
| 32 | Nella mail arrivata, clicca un bottone | Si apre una pagina che dice il servizio e il designer, spiega che **non stai comprando niente**, e ha un bottone. **L'ordine non esiste ancora** | Se l'ordine è già stato creato dall'apertura, il clic è diventato un GET: fermati e dimmelo. È il caso che farebbe creare ordini agli antivirus aziendali |
| 33 | Premi il bottone | «L'abbiamo ricevuta», con il riferimento `XP-…`. In `orders` una riga `requested`; in `order_status_history` l'attore è **`traveler`**; in `team_alerts` un `ordine_richiesto` che dice quale gruppo WhatsApp aprire | Se l'attore dice `system`, l'attribuzione non viene dal token: dimmelo, perché il TD non ha login e quella riga è l'unica prova di chi ha agito |
| 34 | Ricarica la pagina, e ripremi il bottone dall'altra scheda | Sempre «l'abbiamo ricevuta», e in `orders` **una riga sola** | — |
| 35 | Apri `<site_base_url>/servizio/questo-token-non-esiste` | Una pagina che dice che il link non funziona e offre WhatsApp, **senza dire altro**. E in `access_token_misses` il contatore sale | Se la pagina dice qualcosa di più — che il token non esiste *nel database*, o su quale prenotazione punterebbe — è diventata un oracolo: dimmelo |
| 36 | Fabbrica un token **scaduto** e uno **revocato** (vedi sopra) e aprili | Due pagine **diverse fra loro** e diverse da quella del punto 35: chi ha un link vecchio è una persona legittima e merita di sapere cosa fare | È la linea: un token che *esiste* riceve la risposta onesta, uno inventato no |
| 37 | Su una prenotazione che ha già un bottone cliccato, da Studio: `update bookings set status='disputed' where id='<id>';` poi riapri il link dell'**altro** servizio | «Su questa consulenza non possiamo partire da qui». Nessun ordine nuovo | È la quinta risposta: token valido, entità cambiata di stato. Poi rimetti `confirmed` |
| 38 | Rigioca la **prova 19** (lo slot non pagato che si libera) con la posta accesa | Oltre allo slot che torna libero su Cal.com, arriva **anche la nostra mail cortese**, che non ripete l'annullamento nativo di Cal.com ma dice cosa fare adesso | È il pezzo che dal 18 settembre mancava a quella riga di milestone 4 |
| 39 | Guarda le esecuzioni di n8n del giro con la posta | Due rami, e ognuno porta **solo** i suoi item: nessun compito `email_send` è passato dal nodo Cal.com | È la ragione per cui lo smistamento è un nodo Code e non uno Switch: uno Switch reimportato con le condizioni vuote lascerebbe passare tutto |
| 40 | **Solo quando le altre sono passate**: gradino 3, svuota `email_redirect_to` | Da qui in poi le mail vanno ai destinatari veri | Prima di farlo, `delete from outbound_messages where status = 'queued';` se in coda sono rimaste mail di collaudo indirizzate a gente vera |

⚠️ **Le prove 27-39 lasciano righe di collaudo.** Prima di considerare chiuso il
giro:

```sql
delete from team_alerts where kind in ('ordine_richiesto', 'postcall_mail_non_partita',
                                       'email_rifiutata', 'email_composizione_fallita',
                                       'token_inventati');
delete from orders where human_ref = '<il XP-… della prova 33>';
delete from outbound_messages where status = 'queued';
```

⚠️ **Cancellare un ordine di prova non cancella il suo token.** Il bottone della
mail resta valido e al clic successivo ne creerebbe un altro: se vuoi spegnerlo,
`update access_tokens set revoked_at = now() where booking_id = '<id>';`


### ✅ Le prove della proposta su misura — 41-56 tutte passate il 23 settembre 2026

Il giro completo, dalla richiesta al pagamento, con i token presi a mano dal
SQL Editor. Vale tutto quello che è scritto sopra per la posta, e in più:

#### Come si prova senza mandare posta a nessuno

**È già risolto, e con gli stessi due gradini delle prove 27-40.** Le due mail
nuove passano dalla stessa coda e dallo stesso ramo di consegna:

- **gradino 1, `email_enabled = 0`** (è il default): la mail al designer e
  quella al viaggiatore si **compongono e si accodano**, e non parte niente. Si
  leggono su Studio da `outbound_messages`, e i link che portano — la pagina
  ordine, la pagina gemella — si prendono da lì o da `access_tokens`. **Per
  queste prove basta questo gradino**: nessuna delle due pagine ha bisogno che
  la mail arrivi;
- **gradino 2, `email_redirect_to` valorizzato**: se vuoi vedere le mail come le
  vedranno designer e viaggiatore, partono ma arrivano tutte a te, con
  l'oggetto `[prova → <destinatario vero>]`.

⚠️ I designer sono **persone vere**. Prima del gradino 3, guarda la coda e
cancella le `order_new_td` degli ordini di collaudo.

Stripe resta in sandbox (`custom_itinerary_stripe_account = 'xpetis'`): carta
`4242 4242 4242 4242`, qualunque scadenza futura e CVC.

#### Come si prendono i token a mano

```sql
-- un ordine su misura su una tua prenotazione di prova (se non passi dal
-- bottone della mail post-call, prova 33). Nasce con il token del designer e
-- con la sua mail in coda.
insert into orders (traveler_id, td_id, service_type, source_booking_id, last_actor)
select b.traveler_id, b.td_id, 'custom_itinerary', b.id, 'team'
  from bookings b where b.id = '<id della prenotazione>'
returning id, human_ref;

-- il link del designer
select '<site_base_url>/ordine/' || token
  from access_tokens where purpose = 'td_order_page' and order_id = '<id ordine>';

-- il link della pagina gemella (esiste solo dopo l'invio della proposta)
select '<site_base_url>/proposta/' || token
  from access_tokens where purpose = 'traveler_public_proposal' and order_id = '<id ordine>';

-- le due mail, come le leggerà chi le riceve
select message_kind, recipient, status, subject, body_text
  from outbound_messages
 where message_kind in ('order_new_td', 'proposal_traveler')
 order by queued_at desc limit 10;
```

⚠️ Vale la stessa avvertenza dei token post-call: **un token è una
credenziale**. Quello del designer, in più, scrive un prezzo.

| # | Cosa fai | Cosa deve succedere | Esito |
|---|---|---|---|
| ✅ 41 | Applicata la `0044`, inserita la riga di `app_config` e rieseguito il seed dei testi: `select * from payment_account('full');` e `select * from consultation_payment_account();` | Tutte e due `xpetis`, `agency_id` nullo. E `select key from message_templates order by key;` ne elenca nove | Se `payment_account` solleva, manca la riga: il messaggio dice quale |
| ✅ 42 | Crea un ordine (SQL sopra, o bottone della prova 33) | In `outbound_messages` una `order_new_td` **in coda** per la mail del designer, e nel corpo il link `/ordine/<token>` e il prezzo della consulenza | Se non c'è, guarda `team_alerts`: un `email_composizione_fallita` dice cosa manca |
| ✅ 43 | Apri il link del designer **dal telefono** | Intestazione con riferimento, nome del viaggiatore (solo il nome), data della call e «consulenza pagata … da scalare». Sotto, il form | Se compare il cognome, la mail o il telefono del viaggiatore, fermati: quel link vive in una casella inoltrabile |
| ✅ 44 | Scrivi un prezzo che non si legge («abc») e salva | Torni al form con un avviso sul prezzo, e l'ordine resta `requested` | — |
| ✅ 45 | Salva una proposta valida, con un credito di qualche euro | Il riepilogo «Rileggila: … la riceverà così». L'ordine è `in_definition`, e in `order_status_history` l'attore è **`td`**. In `orders` il prezzo è **quello che hai scritto**: il credito non è sottratto | Se il prezzo salvato è diverso da quello scritto, il codice ha «corretto» il credito: è il difetto che non deve esistere |
| ✅ 46 | *Modifica*, cambia il prezzo, salva | Riepilogo col prezzo nuovo; ordine ancora `in_definition` | — |
| ✅ 47 | Apri il riepilogo in **due schede**. Nella seconda modifica il prezzo e salva; nella prima premi *Invia* | «La proposta è cambiata dopo che l'hai riletta». **Non parte niente** | È la difesa contro un prezzo che nessuno ha riletto |
| ✅ 48 | Ricarica la prima scheda e premi *Invia* | «Proposta inviata», con il link e il messaggio pronto da copiare (prova il bottone *Copia* dal telefono). Ordine `proposal_sent`, attore `td`; una riga in `order_proposals`; una `proposal_traveler` in coda con descrizione, prezzo all'italiana e link `/proposta/<token>` — e **nessuna cifra di credito** | — |
| ✅ 49 | Torna indietro col browser e ripremi *Invia* | Sempre «inviata»; **una** riga in `order_proposals` e **una** mail | — |
| ✅ 50 | Da Studio: `update orders set proposal_price_cents = 100 where human_ref = '<XP-…>';` | **Errore**: «la proposta … è già partita» | Se passa, il congelamento non c'è: dimmelo, perché è la cosa su cui poggia tutto il resto |
| ✅ 51 | Apri il link della pagina gemella **in una finestra anonima** | La proposta, il prezzo, il bottone *Paga*. Nessun dato del viaggiatore | — |
| ✅ 52 | Paga con la carta di prova | Su Stripe l'importo è quello della proposta e **la mail non è precompilata**. Al ritorno «Stiamo registrando il pagamento…», poi «Pagata». In `orders` lo stato è `in_progress` con attore **`traveler`**; in `payments` una riga `full`, `paid`, `stripe_account = 'xpetis'`. Riaprendo il link del designer: «Il viaggiatore ha pagato» | Se resta su «Stiamo registrando»: guarda l'esecuzione n8n del webhook Stripe e il campo `esito` della risposta |
| ✅ 53 | **L'ordine annullato che riceve un pagamento.** Un secondo ordine, proposta inviata, apri la cassa e **fermati** sulla pagina Stripe. Da Studio: `update orders set status='cancelled', cancelled_at=now(), last_actor='team' where human_ref='<XP-…>';` Poi paga | L'ordine **resta annullato**; la riga in `payments` è `paid`; in `team_alerts` uno `stripe_pagamento_su_ordine_non_in_attesa` che dice «va rimborsato» | È lo slot già dato via, sugli ordini |
| ✅ 54 | **La proposta riaperta.** Un terzo ordine, proposta inviata, apri la cassa e fermati su Stripe. Da Studio: `update orders set status='in_definition', last_actor='team' where human_ref='<XP-…>';` Il designer cambia il prezzo e reinvia. Dalla pagina gemella premi *Paga* | Una **seconda** mail al viaggiatore, due righe in `order_proposals`, e la nuova cassa Stripe porta **il prezzo nuovo**: la vecchia è stata chiusa. Se paghi nella scheda vecchia, Stripe dice che la sessione è scaduta | Se la cassa riusata porta il prezzo vecchio, il controllo d'importo di `lib/cassa.ts` non sta lavorando: dimmelo |
| ✅ 55 | Da Studio assegna uno di quegli ordini a un altro designer e riapri il link del primo | «Questo link non funziona» | Poi rimettilo com'era |
| ✅ 56 | `select * from team_spot_check_proposte;` | Una riga per proposta partita, con prezzo della call, credito dichiarato e prezzo proposto affiancati | È lo spot-check del Flusso: se è leggibile a colpo d'occhio, va bene |

#### ✅ Corretto il 26 settembre — emerso durante le prove del 23 settembre

Tutte e quattro fatte con la `0045` e le modifiche al sito: il racconto è in
`REGISTRO.md`, le prove per verificarle sono le 57-63 qui sotto. Il testo resta
com'era perché dice **cosa non toccare**, e vale anche dopo.

- **[C] Il form della proposta perde la descrizione al primo errore.** Se il
  designer sbaglia il prezzo alla **prima** stesura, torna al form **vuoto** e
  deve riscrivere tutta la descrizione; dalla seconda in poi la ritrova, perché
  a quel punto una bozza esiste. Causa: il form si ripopola leggendo la riga di
  `orders`, non i valori appena inviati. Va ripopolato da **quello che è stato
  mandato**, con la riga come ripiego. Non è un dettaglio di comodità: fargli
  riscrivere tutto per un errore sul prezzo è il modo di fargli sbagliare anche
  la seconda volta, e la seconda volta sbaglia il **prezzo**.
- **[C] Gli importi negli alert escono con sedici decimali.** Visto nella prova
  54: *«Pagamento Stripe di 700.0000000000000000 €»*. La causa è
  `(cents / 100.0)::text`: in Postgres la divisione `numeric` porta con sé la
  scala piena. **Non è un messaggio, sono quindici** — `0037`, `0039`, `0041`,
  `0043`, `0044`. Quindi la correzione non è ritoccare le stringhe ma **una
  funzione sola** (`euro_it(cents)`), gemella di `euro()` in TypeScript, che
  formatta all'italiana (`1.400,00 €`) e si usa ovunque: così il prossimo alert
  la eredita invece di ripetere il difetto. Questi messaggi li legge il team di
  corsa, e un numero illeggibile in un alert critico è un alert che si salta.
- **[C] Il tasto *Copia* del messaggio pronto non copia da mobile.** Provato il
  23 settembre: funziona dal desktop su `localhost`, non dal telefono su
  `http://192.168.x.x:3000`. **Causa confermata il 23 settembre: contesto non sicuro.**
  Aprendo lo stesso indirizzo di rete dal **desktop** il tasto fallisce uguale,
  quindi il telefono non c'entra: `navigator.clipboard` esiste solo su HTTPS o
  `localhost`. **In produzione il difetto non si presenterà.**
  ⚠️ **Ma la correzione va fatta comunque, e non è inseguire i browser con
  `execCommand`**: il messaggio va messo in un **campo selezionabile**, così si
  copia a mano sempre, e il bottone resta una comodità sopra. Oggi se la copia
  fallisce il designer resta senza link e non se ne accorge nessuno — e quel
  testo lo deve incollare nel gruppo WhatsApp col cliente davanti.
- **[C] Il campo degli importi accetta cose che non dovrebbe.** Massimo due
  decimali e nessuno zero iniziale (`030`). ⚠️ È una guardia **del campo**, non
  del calcolo: `euroInCentesimi` è già corretto — gestisce la virgola italiana
  (`1200,50` → 120050), il punto come migliaia (`1.200` → 120000) e fa
  aritmetica intera, quindi `19,99` dà **1999** e non 1998. Non toccare quella
  funzione per "sistemare" il campo: quel centesimo di scarto farebbe rifiutare
  il pagamento dal ponte Stripe, che confronta l'incassato con il listino.


⚠️ **Le prove 41-56 lasciano righe di collaudo.**

```sql
delete from orders where human_ref in ('<XP-…>', '<XP-…>', '<XP-…>');
-- order_proposals, access_tokens e payments vanno via per cascata; la coda no:
delete from outbound_messages where message_kind in ('order_new_td', 'proposal_traveler')
                               and status = 'queued';
delete from team_alerts where kind like 'stripe_%' and entity_type = 'order';
```

I pagamenti di prova restano su Stripe sandbox, dove non costano niente.

### 🔴 Le prove delle correzioni (26 settembre 2026)

Tutte con **`email_enabled = 0`**: nessuna di queste ha bisogno che una mail
parta, si guarda la coda. Per le 58-60 serve un ordine **nuovo**, senza bozza:
il difetto del punto 1 si vede solo alla prima stesura.

```sql
-- la coda delle mail nuove, come la leggerà chi le riceve
select message_kind, recipient, status, subject, body_text
  from outbound_messages
 where message_kind in ('order_paid_td', 'team_ordine_pagato', 'team_ordine_richiesto')
 order by queued_at desc limit 20;
```

| # | Cosa fai | Cosa deve succedere | Esito |
|---|---|---|---|
| 57 | Applicata la `0045`, inserite le due righe e rieseguito il seed dei testi: `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ~ '/\s*100\.0';` | **Nessuna riga.** E `select key from message_templates order by key;` ne elenca **undici** | Se esce un nome, quella funzione scrive ancora importi con sedici decimali |
| 58 | ⚠️ **Il punto 1, ed è la prova che conta.** Ordine nuovo, link del designer, **prima stesura**: scrivi una descrizione lunga, i giorni, e come prezzo `0,10` (passa il campo ma è sotto il minimo). Salva | Torni al form con l'avviso sul prezzo, e **la descrizione è lì, intera**, insieme a `0,10` e ai giorni | Se il form è vuoto, il ripristino non lavora: è il difetto di prima |
| 59 | Salva una proposta valida. *Modifica*: **cambia la descrizione** e metti prezzo `0,20`. Salva | Torni al form con **la descrizione nuova**, non quella salvata prima | È la trappola del «ripopolare dal database»: se ricompare la vecchia, il form legge la riga e non quello che hai inviato |
| 60 | Nel campo prezzo scrivi `030`, poi `12,345`, e salva | Il **browser** ferma l'invio e dice il formato; non perdi niente. Poi dagli strumenti di sviluppo togli l'attributo `pattern` dal campo e risalva `030` | Col `pattern` tolto: avviso sul prezzo dalla route, ordine ancora `requested`. Se passa e salva 30 €, la route non ricontrolla |
| 61 | Invia la proposta e premi *Copia* **dall'indirizzo di rete** (`http://192.168.x.x:3000`, dal telefono o dal desktop) | «Il bottone non è riuscito a copiare», testo **selezionato**. Tenendo il dito sopra si copia e si incolla in WhatsApp. Da `localhost`: «Copiato» | Se il campo non c'è o non si seleziona, il designer resta senza link |
| 62 | **Il punto 5.** Con i tuoi indirizzi in `team_notify_recipients`, paga una proposta (come la 52) | In coda: **una** `order_paid_td` al designer, con link `/ordine/…`, prezzo all'italiana e «entro il GG/MM/AAAA»; **una `team_ordine_pagato` per indirizzo**, oggetto «[XPETIS] Pagata la proposta XP-… · 1.400,00 €». Tutte `queued` | Se al posto delle `team_…` c'è un alert `notifica_team_non_configurata`, la riga dei destinatari è vuota |
| 63 | **Il cablaggio di `ordine_richiesto`, e poi si rimette com'era.** `update app_config set value_text = 'ordine_pagato, ordine_richiesto' where key = 'team_notify_events';` e premi un bottone post-call (come la 33) | Una `team_ordine_richiesto` per indirizzo, oggetto «[XPETIS · da guardare] Nuova richiesta XP-…». Poi `update app_config set value_text = 'ordine_pagato' where key = 'team_notify_events';` — la decisione resta parcheggiata | Dimostra che il punto aperto è una riga di configurazione, non un deploy |

Rigiocando la **54**, l'alert deve dire «1.400,00 €» e non «700.0000000000000000».

⚠️ **Pulizia**, oltre a quella delle prove 41-56:

```sql
delete from outbound_messages
 where message_kind in ('order_paid_td', 'team_ordine_pagato', 'team_ordine_richiesto')
   and status = 'queued';
delete from team_alerts where kind like 'notifica_team_%';
```

### 🔴 Le prove del silenzio-conferma (26 settembre 2026)

Tutte con **`email_enabled = 0`**: si guarda la coda. Servono una call di prova
confermata e un ordine su misura pagato (prove 41-52), con i token presi dal SQL
Editor come allora.

#### Come si fabbrica una finestra scaduta senza aspettare

Nessuna di queste prove richiede di aspettare 48 ore o 5 giorni: le scadenze si
calcolano **dalle date sulla riga**, quindi si spostano indietro le date e si
lascia girare l'orologio (o lo si chiama a mano con `select * from clock_tick(10);`).

```sql
-- una call finita da 49 ore: al prossimo giro si chiude da sola
update bookings set starts_at = now() - interval '49 hours 30 minutes',
                    ends_at   = now() - interval '49 hours'
 where id = '<id della call>';

-- una call appena finita, per far partire la mail dei tasti (serve che sia
-- 'confirmed' e finita da meno di 24 ore)
update bookings set starts_at = now() - interval '40 minutes',
                    ends_at   = now() - interval '10 minutes'
 where id = '<id della call>';

-- la finestra della revisione scaduta, senza chiudere l'ordine
update orders set revision_deadline_at = now() - interval '1 minute'
 where human_ref = '<XP-…>';

-- l'ordine consegnato cinque giorni fa: al prossimo giro si chiude
update orders set delivered_at = now() - interval '5 days 1 minute'
 where human_ref = '<XP-…>';
-- ⚠️ dopo una riconsegna la chiusura conta da revision_delivered_at: va
-- spostata quella, non delivered_at
update orders set revision_delivered_at = now() - interval '5 days 1 minute'
 where human_ref = '<XP-…>';
```

```sql
-- i link dei due tasti di una call
select purpose, '<site_base_url>/eccezione/' || token
  from access_tokens where booking_id = '<id della call>'
   and purpose in ('td_exception_no_show', 'td_exception_problem');
```

| # | Cosa fai | Cosa deve succedere | Esito |
|---|---|---|---|
| 64 | Applicata la `0046` e rieseguito il seed: `select * from clock_tick(10);` | Nessun errore, nessun `orologio_ramo_non_configurato`. `select key from message_templates order by key;` ne elenca **diciotto** | Se c'è l'alert, legge le chiavi che mancano |
| 65 | Una call appena finita (SQL sopra), poi un giro dell'orologio | In coda una `postcall_td` al designer, con due bottoni `/eccezione/…` e la data in cui la call si chiude | — |
| 66 | Apri il link **no-show dal telefono** | «Dall'altra parte non c'era nessuno?», il solo nome di chi ha prenotato, la regola dei 15 minuti, e scritto prima del tasto che **la call non si chiude come no-show da sola** | Se compare cognome, mail o telefono del viaggiatore, fermati |
| 67 | Segnala il no-show con 20 minuti e una nota | «Segnalazione ricevuta». La call è `disputed` con attore `td`; in `team_alerts` un `td_segnala_no_show` **critical** che dice attesa dichiarata, regola, **dopo quanti minuti dall'inizio hai cliccato**, la tua nota, i contatti del viaggiatore e «NON è stato avvisato» | Leggilo come lo leggerebbe Alessandro: basta per decidere? Se manca qualcosa, dimmelo |
| 68 | Ripremi il tasto no-show, poi apri il link «altro problema» della stessa call | «Già segnalata», con data e tipo. **Una** riga in `booking_exceptions`, **un** alert | — |
| 69 | Sposta quella call a 49 ore fa e fai girare l'orologio | Resta `disputed`: il silenzio non chiude una call segnalata | Se diventa `completed`, il silenzio ha scavalcato il designer |
| 70 | Da Studio: `update bookings set status = 'no_show', last_actor = 'team' where id = '<id>';` | In `booking_exceptions` la riga ha `resolved_at` e `resolution = no_show` | — |
| 71 | Un'altra call confermata spostata a 49 ore fa, un giro | `completed`, attore `system`. Apri uno dei suoi tasti (fabbricalo con l'`insert` delle prove 27-40, scopo `td_exception_problem`, `audience 'td'`): «Questa call si è chiusa», nessun modulo | — |
| 72 | **La consegna.** Sull'ordine pagato, dalla pagina del designer **dal telefono**: scegli un PDF **sopra i 5 MB** e premi *Consegna* | «Carico il file…», poi la pagina diventa «Consegnato», col messaggio da girare nel gruppo e il file in elenco. `orders` in `delivered`, attore `td`; una riga in `order_files`; in Storage il file sotto `ordini/<id ordine>/` | ⚠️ È la prova che conta per la scelta dei byte diretti: sopra i 4,5 MB la strada «dal nostro server» si sarebbe rotta su Vercel. Se fallisce, guarda la console del browser (CORS di Storage) |
| 73 | Prova a consegnare un `.html` o un file sopra i 50 MB | Un messaggio chiaro **prima** di caricare, niente in Storage | — |
| 74 | In coda la `delivery_traveler`: leggila | Porta `/proposta/<token>` e la data limite della revisione, **nessun link di Storage** | Se c'è un indirizzo `…/storage/v1/…`, fermati: è il difetto che si vede fra tre settimane |
| 75 | ⚠️ **Il link firmato scaduto.** Dalla pagina del viaggiatore clicca il file: si scarica. Copia l'indirizzo su cui è finito il browser (quello di Storage, con `token=`), **aspetta due minuti** e riaprilo | Storage risponde che il token è scaduto. **Poi** riclicca il file dalla pagina: si scarica di nuovo | È esattamente quello che succederebbe a una mail con dentro il link di Storage; la pagina invece funziona sempre |
| 76 | Dalla pagina del viaggiatore chiedi la revisione con una nota | «Richiesta ricevuta», ordine `revision_requested` attore `traveler`, in coda la `revision_requested_td` con la nota. La pagina **non** mostra più il tasto | — |
| 77 | Riconsegna dalla pagina del designer, poi dalla pagina del viaggiatore riprova a chiedere una revisione (ricarica una scheda vecchia col modulo, se ce l'hai) | Due file in elenco; `revision_deadline_at` **uguale** a prima; seconda mail al viaggiatore. Alla seconda richiesta: «era una sola, ed è già stata chiesta», con le date | È la regola «una sola»: se la seconda passa, dimmelo |
| 78 | Su un secondo ordine consegnato: finestra della revisione scaduta (SQL sopra), apri la pagina del viaggiatore. Poi `delivered_at` a cinque giorni fa e un giro | Prima: niente tasto, «il tempo per chiedere la revisione è finito il…». Dopo: `completed` attore `system`, la pagina dice «chiusa» e **il file si scarica ancora** | — |

⚠️ **Pulizia** delle prove 64-78:

```sql
delete from outbound_messages
 where message_kind in ('postcall_td', 'delivery_traveler', 'revision_delivered_traveler',
                        'revision_requested_td') and status = 'queued';
delete from team_alerts where kind in ('td_segnala_no_show', 'td_segnala_problema');
-- booking_exceptions e order_files vanno via per cascata con la call e l'ordine;
-- i file in Storage NO: si cancellano dal pannello Storage, cartella ordini/<id>.
```

### ❓ Come si accorge il team che c'è un ordine da lavorare (23 settembre 2026)

**Punto aperto, non risolto oggi per scelta.** Oggi `ordine_richiesto` è **una
riga in `team_alerts`**, cioè una tabella che qualcuno deve aprire su Studio.
Nessuna notifica, da nessuna parte. Il piano prevede una vista operativa in
**milestone 9**, cioè dopo — e per quasi tutti gli alert va bene.

**Per questo no, e la ragione è che non è un alert come gli altri.** Gli altri
sono anomalie: qualcosa è configurato male, va sistemato, il mondo aspetta.
`ordine_richiesto` è **un cliente che ha detto sì**, nel momento di massima
intenzione, e ogni ora che passa lo raffredda. La pagina gli promette *«adesso
tocca a noi: apriamo il gruppo WhatsApp»* — non promette tempi, il testo è
onesto, ma se qualcuno clicca sabato sera e il team guarda Studio martedì quella
frase è falsa di fatto.

Ne esce un limite del modello da tenere a mente: **`severity` confonde "quanto è
grave" con "quanto è urgente".** `ordine_richiesto` è registrato `warning` come
una firma rifiutata, ma è una buona notizia urgente e su quella scala non ha una
casella. Smistare le notifiche per severità quindi non basta: servirà un elenco
di `kind` che meritano l'immediato, in `app_config`.

*Cosa si può e cosa no.* **WhatsApp no**: le API non creano gruppi e per mandare
servirebbe WhatsApp Business API, mentre S-08 è ancora un numero personale.
**Email sì e costa poco**, perché la macchina esiste già — Resend, la coda
`outbound_messages`, `render_template`, il ramo di consegna dell'orologio.

*La forma probabile, quando si farà:* due canali, non uno. **Immediato** per gli
alert che significano "c'è una persona che aspetta" (oggi `ordine_richiesto`,
domani disputa e no-show); **digest giornaliero** per l'igiene operativa. Una
mail per ogni anomalia è il modo sicuro per insegnare al team a ignorarle.

⚠️ E una dipendenza da non scoprire dopo: il digest si regge su
`resolved_at is null`, quindi **qualcuno deve marcare gli alert come risolti**.
Se farlo significa scrivere una `update` a mano su Studio nessuno lo farà, il
digest ripeterà gli stessi per sempre e in tre giorni sarà rumore. O si anticipa
una vista operativa minima dalla milestone 9, o questo nasce già morto.

**Deciso in parte il 23 settembre, provando la 52.** Quando il viaggiatore paga
una proposta, **la mail va sia al designer sia agli amministratori** (Simone,
Alessandro, Andrea). Oggi il designer lo scopre solo se riapre il suo link per
caso, e il team non lo scopre affatto.

⚠️ **Da costruire come un meccanismo solo, non come una mail in più.** Se si
aggiunge "mail agli admin quando si paga", poi servirà per `ordine_richiesto`,
poi per la disputa, poi per il no-show, e ci si ritrova con quattro notifiche
scritte in quattro posti. Serve invece: **una lista di destinatari interni** e
**un elenco di eventi che la usano**, entrambi in `app_config`, così aggiungerne
uno è una riga e non un deploy. Il Flusso, per il pagamento, chiede il messaggio
«in pagina e via mail»: in pagina c'è già.

~~**Decisione che spetta a Simone:** a quale casella.~~ → **decisa il 23
settembre**: agli amministratori, cioè agli indirizzi di Simone, Alessandro e
Andrea in `team_notify_recipients`. `info@xpetis.it` resta il **mittente** —
casella vera, dove arrivano le risposte dei viaggiatori — e non riceve gli
alert interni: mescolarli significherebbe perdere entrambi.

**Aggiornamento del 26 settembre 2026 — il meccanismo c'è (`0045`).** Una lista
di destinatari interni (`team_notify_recipients`) e un elenco di eventi che la
usano (`team_notify_events`), tutti e due in `app_config`. Un evento è **o il
`kind` di un alert** — un trigger su `team_alerts` li guarda tutti — **o un
evento che non è un'anomalia**, come `ordine_pagato`, che non va scritto fra
gli alert perché riempirebbe di buone notizie la tabella da svuotare.

**Quindi `ordine_richiesto` adesso è una riga di configurazione**, non un
deploy:

```sql
update app_config set value_text = 'ordine_pagato, ordine_richiesto'
 where key = 'team_notify_events';
```

**Non è stata scritta, per scelta**: resta parcheggiata con il digest, come
deciso da Simone. Restano aperti, e il meccanismo non li pregiudica: il
**digest giornaliero** (che si reggerà sulla stessa lista di destinatari) e la
dipendenza dalla vista operativa minima per marcare gli alert risolti. E vale
ancora l'avvertenza sopra: l'elenco nomina gli eventi uno per uno proprio per
non diventare «una mail per ogni anomalia».

---

### ❓ Domande aperte nate dall'imbocco (8 settembre 2026)

Tutte e tre sono **assenze nel Figma che non sono decisioni** — il corollario di
`CLAUDE.md` — e nessuna si chiude scrivendo codice.

| Domanda | Perché è aperta | Chi decide |
|---|---|---|
| **La pagina "Entra a far parte di XPETIS" esiste?** L'header e il footer la linkano entrambi. Il Flusso non descrive nessuna pagina di reclutamento dei Travel Designer, il Figma non la mostra, e i 25 arrivano da un form esterno (`Vetrina TD (2).html`) gestito a mano dal team. Costruirla vorrebbe dire decidere chi può candidarsi e cosa succede dopo: non è una scelta tecnica. **Per ora le due voci sono spente con una spiegazione**, non linkano un 404 | Serve sapere se il reclutamento è pubblico o su invito | Alessandro, Andrea |
| **`/viaggi-di-gruppo`, `/about`, `/privacy`, `/contatti`**: quattro voci del footer che portano a 404. Le ho **lasciate come link** di proposito, al contrario di quella sopra: quelle pagine *devono* esistere — la privacy per obbligo di legge — e spegnerle direbbe "non ci saranno", che è falso. Aspettano un contenuto, non una decisione tecnica | I testi non sono lavoro mio; la privacy passa da S-14 | Gaia (testi), legale (privacy) |
| **La sezione "Viaggi di gruppo" della vetrina** resta senza sorgente, come già segnato in milestone 3. La voce del footer punta allo stesso buco | — | Chiara, Gaia |
| **Come si vede l'header di chi è collegato?** Il Figma non lo mostra, e per il corollario di `CLAUDE.md` l'assenza non è una decisione. La versione costruita l'8 settembre è la minima onesta — *"Ciao \<nome\>"* e un bottone *Esci* — e le domande sono tre: **nome o avatar** (Google dà `avatar_url`, non l'ho usato: un'immagine tonda nella pillola è una scelta di disegno, non una mia); **testo o tendina**; **dove sta l'uscita**, se dentro una tendina o in chiaro come adesso. ⚠️ Qualunque tendina va riempita con voci che **esistono**. Dal 18 settembre *"Le mie prenotazioni"* esiste ed è nell'header: da desktop per esteso, da telefono sotto il saluto, che è diventato un link. **Se nasce una tendina, quella voce è la prima che ci va dentro** | Serve una riga di Figma, o un ok a quella che c'è | Chiara |


---

## Milestone 5 — Prima della call

- [ ] **[C]** Contatori di riprogrammazione aggiornati dai webhook
- [ ] **[C]** **Le regole di rimborso si applicano sul webhook
      `BOOKING_CANCELLED`**, non controllando l'accesso al link: le mail native
      di Cal.com danno al viaggiatore una via di cancellazione che non possiamo
      chiudere
- [ ] **[C]** Riconoscimento del *Request reschedule* del designer (motivo che
      inizia per `Please reschedule.` e `cancelledBy` uguale alla sua mail) su
      una call pagata: ordine bloccato, alert critico al team, rimborso a mano
- [ ] **[C]** Workflow di controllo dei limiti (6ª riprogrammazione del
      viaggiatore, 3ª del TD, nuova data oltre i 20 giorni, cancellazione sotto
      le 24 ore che pretende il rimborso) → alert in `team_alerts`
- [ ] **[C]** Workflow reminder del giorno prima
- [ ] **[C]** Procedura di rimborso documentata: come si esegue su Stripe e come
      si flagga su Studio
- [ ] **[S]** In onboarding, istruire i designer a usare *Reschedule* e mai
      *Request reschedule* (cintura e bretelle: il riconoscimento automatico c'è
      comunque)

---

## Milestone 6 — Post-call e Itinerario su misura

- [x] **[C]** Workflow mail post-call a fine call, con i bottoni dei soli servizi
      attivi di quel TD. **Fatto il 20 settembre 2026** → `0043_posta.sql`, ramo
      `clock_ramo_postcall()`. Non è un workflow nuovo: è un ramo dell'orologio,
      perché il grilletto è una prenotazione `confirmed` con `ends_at` passato.
      Se il designer non vende niente dopo la call la mail parte lo stesso, come
      ringraziamento, e la frase che introduce i bottoni sparisce con loro —
      sta dentro il blocco, non nel corpo
- [x] **[C]** Bottoni a token permanente che creano l'ordine e notificano il team.
      **Fatto il 20 settembre 2026** → `app/servizio/[token]/`,
      `create_order_from_token()`. Tre cose decise costruendolo:
      · **il clic è un POST**, perché i link delle mail li aprono anche le
        macchine (antivirus aziendali, SafeLinks, client che precaricano) e un
        GET che crea un ordine farebbe aprire gruppi WhatsApp per nessuno;
      · **il servizio sta nel payload del token**, non in un parametro della
        richiesta, e l'indice della 0012 è stato rifatto per ammettere un token
        per servizio sulla stessa call;
      · **cosa può fare chi trova il link** è scritto in testa alla 0043 parte D,
        e da lì discende la regola per le due milestone che seguono: dietro un
        token permanente non va mai un'azione che muove denaro o consegna un
        file
- [x] **[C]** Tasti eccezione del TD: no-show e "altro problema" → disputa.
      **Fatto il 26 settembre 2026** → `0046_silenzio_conferma.sql` parte A,
      `app/eccezione/[token]/`. La mail con i due tasti è un ramo
      dell'orologio (`clock_ramo_postcall_td`). **Tutti e due portano a
      `disputed`**: il no-show si dichiara, lo chiude il team dopo aver
      verificato. Una segnalazione per call (`booking_exceptions`), che si
      chiude da sola quando il team porta la call fuori da `disputed`
- [x] **[C]** Chiusura a 48 ore (dentro l'orologio unico). **Fatto il 26
      settembre 2026** → `clock_ramo_chiusura_call()`: un `update`, niente
      compito. Tocca solo `confirmed`, quindi una segnalazione la ferma senza
      che il ramo sappia che le segnalazioni esistono
- [x] **[C]** Pagina ordine del TD a stati (uno stato, una azione), con upload su
      Storage. **Proposta il 23 settembre, consegna il 26 settembre 2026** →
      `td_delivery_ticket()`, `td_deliver()`, `components/carica-consegna.tsx`.
      I byte vanno dal browser a Storage con un caricamento firmato scelto dal
      database: il limite di 4,5 MB di Vercel non lascia alternative (vedi
      `CLAUDE.md`, convenzione sui file)
- [x] **[C]** Invio proposta: Checkout Session creata dal server con l'importo
      scritto dal TD, pagina pubblica gemella, mail al viaggiatore, messaggio
      pronto al TD. **Fatto il 23 settembre 2026** → `0044_proposta_su_misura.sql`,
      `app/proposta/[token]/`, `lib/cassa.ts`. Il ponte Stripe porta l'ordine a
      `in_progress` e riconosce ordine sconosciuto, annullato, riaperto e doppio
      incasso. Il messaggio «pagata» è **in pagina e via mail** come vuole il
      Flusso: la mail al designer (e agli amministratori) è entrata con la
      `0045` il 26 settembre 2026
- [x] **[C]** Consegna, richiesta di revisione, chiusura a 5 giorni. **Fatto il
      26 settembre 2026** → `0046` parti B e C, `request_revision()`,
      `clock_ramo_chiusura_ordini()`, `app/proposta/[token]/revisione` e
      `/file/[id]`. Una revisione sola, dentro la finestra; la chiusura riparte
      dopo la riconsegna, la finestra della revisione no
- [ ] **[C]** Il tasto «C'è un problema» in fondo alla pagina ordine (Flusso §7:
      «in fondo, sempre»). Non chiesto con i tasti del dopo-call; oggi c'è
      «Scrivi al team» su WhatsApp

### ❓ Domande aperte nate dal silenzio-conferma (26 settembre 2026)

| Domanda | Perché è aperta | Chi decide |
|---|---|---|
| 🔴 **Il viaggiatore dichiarato assente deve saperlo, e poter dire «c'ero»?** Oggi il designer preme no-show, la call va al team, e il viaggiatore **non riceve niente**. Se il team chiude come `no_show`, ha perso la consulenza e non lo sa: il silenzio qui è di chi non è stato informato, non di chi ha scelto di tacere. **Il mio parere: sì, va avvisato prima che il team decida** — una mail breve, «il designer segnala che alla call non c'eri; se non è così scrivici entro 48 ore», con il WhatsApp. Costa una riga di `message_templates` e una riga nel clic del no-show. Non l'ho fatto perché cambia il modo in cui si arbitra, e il Flusso non lo prevede | È una scelta di prodotto e di tono: avvisare vuol dire anche aprire una contestazione per ogni no-show | Simone, Alessandro, Andrea; testo di Gaia |
| **Una revisione mai consegnata resta aperta per sempre.** In `revision_requested` il silenzio non chiude (sarebbe il silenzio di chi non è stato servito), ma nessun timer si accorge se il designer non riconsegna mai. Il Flusso non dà un tempo per la revisione | Serve un tempo (i giorni di consegna originali? un numero fisso?) e cosa succede allo scadere: un alert al team, probabilmente | Simone |
| **Una call rimasta senza la mail dei tasti si chiude lo stesso a 48 ore.** Succede se l'orologio è stato fermo più di `postcall_email_max_age_hours` (24): la mail al designer non parte più, e la call si chiude senza che abbia avuto i tasti. L'alert `postcall_mail_non_partita` conta già quelle call per il viaggiatore; il testo dice di riprenderle a mano | Se va bene così, basta saperlo; altrimenti la chiusura dovrebbe aspettare che la mail sia partita | Simone |
| **La pagina dei tasti non ha un disegno.** Il Flusso le chiede a Chiara («semplicissime, una domanda e un tasto»). Oggi usano il guscio delle altre pagine a token | Serve un disegno, o un ok a quello che c'è | Chiara |
| **Per l'All Inclusive lo scaricamento va ripensato.** La pagina del viaggiatore è girata nel gruppo: per un itinerario va bene, per biglietti e voucher (milestone 7) chi ha il link ha il documento. Scritto in testa alla 0046 | Da decidere quando si fa l'All Inclusive | Simone |

### ❓ Domande aperte nate dalla proposta su misura (23 settembre 2026)

| Domanda | Perché è aperta | Chi decide |
|---|---|---|
| **La pagina ordine del designer e la pagina gemella non hanno un disegno.** Il Flusso le chiede a Chiara («mobile first, uno stato una azione»; la gemella «deve sembrare una pagina XPETIS, non una fattura») e il Figma non le ha. Per il corollario di `CLAUDE.md` l'assenza non è una decisione: oggi usano il guscio delle altre pagine a token, colonna stretta e niente header | Serve un disegno, o un ok a quello che c'è | Chiara |
| ~~**Una mail al designer quando il viaggiatore paga?**~~ → **Decisa da Simone il 23 settembre e fatta il 26** (`0045`): al designer e agli amministratori. Il Flusso vuole il messaggio pronto «in pagina e via mail», e il designer oggi scopre di essere stato pagato solo riaprendo la sua pagina — o dal gruppo. Il prompt di oggi chiedeva due mail e sono due; la terza è una riga di `message_templates` e un trigger sul passaggio a `in_progress` | È la mail che dice al designer «puoi cominciare»: senza, il tempo di consegna parte senza che lui lo sappia | Simone, testi di Gaia |
| **Un ordine annullato libera il credito della call?** `orders_one_credit_per_booking` (0009) conta anche gli annullati: se l'ordine col credito viene annullato, un secondo ordine della stessa call non può più dichiararlo, e dalla 0044 il team non può azzerarlo a mano (la proposta di un ordine annullato è congelata). Se la risposta è sì, è una riga: l'indice con `status <> 'cancelled'` | È una regola di prodotto: dipende se l'annullamento è rimborsato | Alessandro, Andrea |
| **Una proposta a zero euro?** Se il credito copre tutto il prezzo, il designer dovrebbe scrivere 0 — ma Stripe non incassa sotto 0,50 € e senza pagamento l'ordine non arriva a `in_progress`. Oggi il minimo è 0,50 € (è il contratto dell'API, non un parametro). Con i prezzi dei 25 non dovrebbe succedere | Se succede serve un passaggio a mano, o un tasto che salta la cassa | Simone |

---

## Milestone 7 — All Inclusive

- [ ] **[S]** Decidere come custodire le credenziali Stripe delle agenzie →
      **S-11**
- [ ] **[S]** Attivazione tecnica della prima agenzia → **S-12**
- [ ] **[B]** Verifica fiscale del 74-ter con l'agenzia e della quota XPETIS per
      fatturazione tra le parti
- [ ] **[C]** Assegnazione agenzia da Studio e workflow di verifica
- [ ] **[C]** Pagina token di conferma dell'agenzia, che sblocca la cascata
- [ ] **[C]** Acconto e saldo sul conto Stripe dell'agenzia, con i suoi webhook
      che puntano al nostro n8n
- [ ] **[C]** Inserimento dei tempi del saldo da parte del team e workflow
      relativo
- [ ] **[C]** Consegna del file finale

**Cosa la 0044 (proposta su misura, 23 settembre 2026) lascia pronto e cosa
no**, perché nessuna scelta di là venga scoperta dopo:

- **La pagina ordine e la sua mail nascono solo per il su misura.** Un ordine
  All Inclusive oggi non riceve né il token `td_order_page` né la mail al
  designer: la pagina non lo saprebbe trattare. Il trigger
  `on_custom_order_created()` è il punto da allargare.
- **Il congelamento della proposta vale solo per il su misura.** L'All
  Inclusive va all'agenzia e torna in `in_definition` se lei non conferma: le
  sue regole si scrivono qui, e probabilmente vogliono lo stesso principio
  (una proposta confermata dall'agenzia non si tocca più).
- **`payment_account()` solleva su `deposit` e `balance`.** L'agenzia che
  incassa è quella assegnata all'ordine, non un parametro globale.
- **Il ponte Stripe risponde a un pagamento su un ordine All Inclusive con un
  alert critico** (`stripe_pagamento_ordine_non_gestito`) e non tocca l'ordine.
  Il ramo va scritto accanto a `stripe_checkout_ordine()`, e a quel punto i
  webhook arriveranno dal conto dell'agenzia.
- **`my_orders` maschera già la proposta in `proposal_pending_agency`**: il
  Flusso vuole che una proposta non verificata dall'agenzia non raggiunga il
  viaggiatore, e la vista della 0019 gliela mostrava. È stato corretto oggi,
  insieme alle bozze del su misura, perché era lo stesso difetto.

---

## Milestone 8 — Recensioni e chiusura del ciclo

- [ ] **[C]** Buon viaggio, recensione consulenza, recensione viaggio (dentro
      l'orologio unico)
- [ ] **[C]** Pagina token monouso della recensione
- [ ] **[C]** Pubblicazione automatica in vetrina e alert sotto le 3 stelle

---

## Milestone 9 — Operatività e validazione Beta

- [ ] **[S]** Onboarding Cal.com dei 25 TD → **S-13**
- [ ] **[S]** Condizioni generali, privacy e cookie policy → **S-14**
- [ ] **[C]** Viste operative su Studio: ordini aperti, cosa manca a ciascuno,
      coda degli alert, checklist di pubblicazione dei TD
- [ ] **[C]** Come si modifica un profilo TD a regime: Studio a mano oppure una
      form interna minima (da decidere dopo l'import, quando sappiamo quanto è
      pesante correggerli)
- [ ] **[C]** Prova end-to-end su ambiente di test: dalla ricerca alla
      recensione, per tutti e tre i servizi
- [ ] **[C]** Runbook: cosa fare quando un workflow fallisce, come si rilancia,
      dove si guarda
- [ ] **[B]** Taratura dei parametri di matching sui dati reali
- [ ] **[Team]** Beta privata: primo viaggiatore vero su un TD vero

---

## La tua todo list

### ✅ Chiuso

**S-05 · Le tre verifiche sul piano gratuito di Cal.com** — verificate da
Alessandro il 30-31 luglio, con prove sul campo:

| Verifica | Esito |
|---|---|
| Webhook verso un URL esterno sul piano free? | **Sì**, 7 messaggi veri raccolti |
| API key per cancellare una prenotazione dall'esterno? | **Non serve nessuna chiave**: basta il codice della prenotazione |
| L'embed accetta il prefill di un campo custom e torna nel payload? | **Sì**, in `payload.responses.xpetis_user_id.value` |

La seconda risposta è migliore di quella sperata e cancella dall'onboarding
l'intera voce "raccogliere 25 chiavi Cal.com". Ha però un rovescio, registrato
fra i rischi: chiunque conosca il codice di una prenotazione la può cancellare.

**S-10 · Payment Link delle consulenze** — **annullato.** Con la cassa aperta
dal server non esistono link da creare, né a mano ora né a ogni nuovo designer.

### P0 — prima settimana

**S-15 · Farsi passare i materiali di Alessandro** (30 min)
`GUIDA_PONTE_CALCOM.md` con le fixture dei 7 messaggi veri, e il dataset
geografico normalizzato. Non il codice: la conoscenza.
*Blocca:* milestone 1 e 4.

**S-01 · Progetto Supabase** (1 h)
Organizzazione e progetto, regione europea. Due progetti se possibile, test e
produzione. Salva URL, anon key e service key in un password manager e passami
quelle di test.
*Blocca:* tutto.

**S-02 · Repo Git e Vercel Pro** (1 h)
Repo privato, progetto Vercel collegato, dominio puntato, variabili d'ambiente.
Serve il piano **Pro** ($20/mese): l'Hobby è riservato all'uso non commerciale.

~~**S-04 · Provider di invio email e autenticazione del dominio**~~ →
**chiuso il 20 settembre 2026**, e senza creare niente: l'account Resend della
landing page, con `xpetis.it` già autenticato. Non blocca più niente. Resta
aperta solo la chiave API separata per XPETIS, che è in "cosa resta a te".

### P1 — seconde due settimane

**S-03 · Istanza n8n self-hosted su Railway** (2-3 h)
Template n8n, Postgres Railway separato da Supabase, pruning dello storico a
7-14 giorni, credenziali Supabase/Stripe/email dentro n8n. Metti un tetto di
spesa: la fatturazione è a consumo sopra i $5 inclusi.

**S-06 · Account Stripe XPETIS** (2 h)
Attivazione, verifica dell'attività, chiavi test e produzione, endpoint webhook
verso n8n. **La chiave segreta va nelle variabili server di Vercel:** serve alla
cassa aperta dal server.

**S-07 · Login Google** (1 h)
Progetto Google Cloud, credenziali OAuth, URI di redirect, client ID e secret in
Supabase Auth. Google è l'unico provider previsto.

~~**S-08 · Numero WhatsApp XPETIS**~~ — **provvisoriamente chiuso il 6 settembre
2026**: si usa **+39 347 891 1018**, numero personale prestato al progetto per
non tenere fermo lo sviluppo. Va in `app_config`, così sostituirlo è una riga da
Studio. **Resta aperto** il numero dedicato vero e chi lo presidia, prima del
pubblico.

**S-09 · Account Cal.com di regia e event type modello** (1-2 h)
"Consulenza XPETIS · 30 min", URL `consulenza-xpetis-30` **scritto a mano**,
durata 30, buffer 10 dopo, preavviso 12 ore, orizzonte 30 giorni, campo nascosto
`xpetis_user_id`. Dettagli verificati in `GUIDA_PONTE_CALCOM.md`.

*Strumento video: **Cal Video**, deciso l'8 agosto.* Google Meet richiederebbe a
ognuno dei 25 designer di collegare il proprio Google Calendar: una dipendenza in
più in onboarding, per venticinque persone, in cambio di niente. Si cambia con
un'impostazione dell'event type se serve.

### P2 — quando serve

**S-16 · Correzione a mano dei 25 profili importati** (8-12 h con il team)
Guidata dalla coda di correzione prodotta dall'import. I due casi noti: paesi
tutti dichiarati "Base" e voci che non sono stati.

**S-11 · Come custodire le credenziali Stripe delle agenzie** (2 h di
valutazione)
Vale la pena guardare Stripe Connect prima di attivare la prima agenzia: stesso
risultato (agenzia merchant of record, compatibile col 74-ter) senza che XPETIS
custodisca credenziali di terzi.
*Blocca:* milestone 7.

**S-12 · Attivazione tecnica della prima agenzia** (2-3 h)
Chiavi, webhook verso n8n, prova di un pagamento di test.

**S-13 · Onboarding Cal.com dei 25 TD** (6-7 h con il team)
**La procedura completa e provata sul campo è in `ONBOARDING_CALCOM_TD.md`**, con
i valori esatti, le tre trappole e la checklist per designer. Circa 15 minuti a
testa, non 30: nessuna chiave API da raccogliere (vedi S-05) e nessuna
configurazione da inventare. Si può fare in parallelo alla milestone 6.

**S-14 · Condizioni generali, privacy e cookie policy** (esterno)
Il flusso ci appoggia regole precise (15 minuti di attesa, rimborso pieno fino a
24 ore prima, una revisione inclusa): devono stare in un documento che il
viaggiatore accetta al pagamento. Serve un legale, i tempi non li controlliamo.

---

## Rischi

| Rischio | Impatto | Cosa lo tiene sotto controllo |
|---|---|---|
| Il verso di un asse è girato: un designer *wild* risulta amante del comfort, prende la frase sbagliata e finisce nel posto sbagliato | Alto, e **nessuna prova tecnica lo intercetta** | Confronto a vista foglio-database su 3-4 designer all'import (milestone 1). È già successo nel lavoro di Alessandro: due assi su sei erano invertiti |
| **Non esiste un'entità legale XPETIS, e non esisterà nel primo periodo** (8 ago) | **Alto: è il nuovo percorso critico.** Senza partita IVA non si incassa, quindi la Beta con soldi veri non dipende più dalla tecnica. Blocca anche S-14, perché non si scrivono condizioni generali senza sapere chi è la controparte | Lo sviluppo prosegue in test mode senza differenze. La decisione "chi è il venditore" va portata ad Alessandro e Andrea subito: costituire una ditta individuale, far incassare l'agenzia partner anche su consulenze e su misura, oppure far incassare i designer con XPETIS che fattura una commissione. **La terza cambia l'architettura**: il denaro andrebbe verso 25 destinatari e servirebbe Stripe Connect molto prima |
| Detenere le chiavi Stripe delle agenzie | Alto | Valutare Stripe Connect prima della prima agenzia (S-11) |
| Le mail finiscono in spam | Alto: il funnel vive di mail. **Ridotto il 20 settembre:** il dominio spedisce da mesi per la landing page, SPF/DKIM/Return-Path sono verificati, e la settimana di riscaldamento non serve più. Resta il rovescio del riuso: la reputazione è **condivisa**, quindi una newsletter da `xpetis.it` trascinerebbe giù anche le transazionali | Spostare le transazionali su un sottodominio (`mail.xpetis.it`) **prima** del primo invio di massa, non dopo. Verificare che DMARC su `_dmarc.xpetis.it` esista, almeno `p=none` |
| Un giro storto brucia il tetto di 100 mail al giorno, **condiviso con la landing page** | Medio, ma si manifesta in minuti | Tre freni indipendenti: il vincolo di unicità di `outbound_messages` (una mail per tipo, entità e destinatario), `email_max_per_tick`, e `email_enabled` che nasce spento |
| Il link della pagina ordine del designer è permanente e **fissa un prezzo** | Medio | Chi lo trova può scrivere e mandare una proposta, non cambiarne una partita: il congelamento è un trigger che vale anche per Studio. L'invio ridichiara il prezzo riletto; ogni proposta finisce in `team_spot_check_proposte`; il denaro lo muove il viaggiatore su una cassa che ridichiara l'importo. Se il team riassegna l'ordine, il link del primo designer smette di funzionare |
| Un token post-call è permanente e vive in una casella inoltrabile | Medio | Chi lo trova non può impegnare denaro: crea una richiesta che una persona lavora. La pagina non mostra dati del viaggiatore, non è indicizzabile e non manda `Referer` a nessuno. Regola per le milestone 6 e 7: **dietro un token permanente non va mai un'azione che muove denaro** |
| Supabase free non fa backup | Alto se si dimentica il passaggio a Pro | Pro il giorno del primo pagamento vero |
| Le correzioni a mano dei 25 profili non vengono fatte, o fatte male | Alto: il match gira su dati sbagliati e sembra funzionare | I controlli di plausibilità in `td_publish_readiness` bloccano la pubblicazione, non solo segnalano |
| Chiunque conosca il codice di una prenotazione Cal.com la può cancellare, e le mail native di Cal.com lo consegnano al viaggiatore | Medio | Le regole di rimborso si applicano sul webhook, non sull'accesso al link. `cal_booking_uid` non esce mai verso il browser |
| I token dei TD e delle agenzie sono in chiaro nel database — **rischio accettato il 4 agosto** | Medio | La tabella `access_tokens` non è leggibile né da `anon` né dall'utente loggato; l'accesso al database resta al team. Rivedibile passando all'impronta |
| 25 webhook Cal.com configurati uno per uno: se un designer tocca le impostazioni, le sue prenotazioni smettono di arrivarci in silenzio | Medio | Controllo periodico di vitalità (milestone 4) |
| Insoluti oltre il 10-15% | Medio | Misurabile a schema; si sposta il pagamento prima dello slot |
| Il `.docx` del Flusso è superato su cinque punti e nessuno lo aggiorna | Medio: qualcuno lavora su regole vecchie | La tabella "Deviazioni dal Flusso" qui sopra. Da riportare nel `.docx` prima di allargare il team |
| Testi definitivi delle mail in ritardo | Basso | Si costruisce con segnaposto |
| Cal.com non impone i limiti di riprogrammazione | Basso, **ridotto l'8 agosto**: la soglia delle 12 ore ora la impone Cal.com direttamente. Restano da presidiare i conteggi (5 e 2), la finestra dei 20 giorni e le cancellazioni | n8n fa il controllore sul resto e avvisa il team |

---

## Registro avanzamenti

Le voci di sessione stanno in **`REGISTRO.md`**, dalla più recente alla più
vecchia. Sono uscite da qui il 24 agosto: erano diventate mille righe su
milleseicento, e il piano non si leggeva più.

**Chi lavora al progetto scrive lì**, in cima, una voce per sessione.
