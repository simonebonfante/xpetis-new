# XPETIS · registro dei lavori

Una voce per sessione, **dalla più recente alla più vecchia**. Dentro lo stesso
giorno le voci restano nell'ordine in cui sono state scritte.

Qui si racconta *cosa è stato fatto e perché*, comprese le scelte scartate e gli
errori: è la memoria del progetto, e serve a non ridiscutere due volte le stesse
cose. Lo stato corrente, le decisioni aperte e i task stanno in `PIANO.md`.

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
