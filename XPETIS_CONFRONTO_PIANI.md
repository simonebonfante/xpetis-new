# XPETIS · Confronto fra i due piani di sviluppo
 
**4 agosto 2026**

Confronto fra il `PIANO.md` di Simone (versione del 2 agosto 2026) e il `PIANO_XPETIS.md` di Alessandro (versione 2 del 29 luglio, sessioni 1-7 eseguite fra il 29 e il 31 luglio).

Questo documento non serve a stabilire chi ha ragione. Serve a due cose: mettere in chiaro dove i due piani producono **codice diverso**, e dire cosa costa scegliere l'una o l'altra strada. Le affermazioni tecniche qui dentro sono verificabili: dove c'è una prova sul campo è indicata, dove c'è una stima è detto che è una stima.

---

## 1. I due piani in una pagina

| | Piano Simone | Piano Alessandro |
|---|---|---|
| Unità | 33-40 sessioni da 2 h | 12 sessioni da 3-4 h (in pratica 6-9 h) |
| Ore di sviluppo | 66-80 h | circa 45 h già spese, 5 sessioni residue |
| Ore umane a bilancio | 30-42 h, in 14 task numerati S-01…S-14 | non contate |
| Perimetro | funnel completo + All Inclusive + produzione + onboarding + legale | funnel fino all'Itinerario su misura, in sandbox, "funzionante e brutto" |
| All Inclusive e agenzie | dentro (milestone 7) | fuori, è il Blocco B |
| Produzione | dentro (milestone 2 e 9) | fuori, è il "divario sandbox-produzione" |
| Stato dichiarato | milestone 0 chiusa | sessioni 1-7 chiuse |
| Arrivo stimato | Beta privata fine ottobre 2026 | fine settembre 2026 |

I due perimetri non coincidono, quindi i totali non si confrontano direttamente. Sulla **parte che si sovrappone**, il piano di Simone prevede circa 17-22 sessioni; quelle sessioni sono già state consumate fra il 29 e il 31 luglio.

Sulla data, le due stime misurano cose diverse e sono **compatibili fra loro**. Sul codice, fine ottobre è largo. Sul lancio è credibile, perché il percorso critico non è lo sviluppo: sono il divario sandbox-produzione, la verifica OAuth di Google, il legale, la grafica e i testi. Nessuno dei due piani accorcia quelli.

---

## 2. La mappa milestone contro sessioni

| Milestone (Simone) | Sessioni (Alessandro) | Stato reale al 4 agosto |
|---|---|---|
| 0 · Fondazioni database | 1 | fatta due volte, in due schemi diversi |
| 1 · Import geo e 25 TD | 2, 6 | geografia completa dentro; confronto JSON-schema fatto; un TD vero caricato |
| 2 · Infrastruttura e accessi | 5, 6, 7 + divario | fatta in sandbox; la parte [S] di produzione no |
| 3 · Sito pubblico, quiz, match, vetrina | 3, 5, 6 | fatta |
| 4 · Prenotazione e pagamento consulenza | 4, 7 | fatta, manca la prova con la carta |
| 5 · Prima della call | 8 | parziale: i contatori sono già alimentati dal ponte |
| 6 · Post-call e Itinerario su misura | 9, 10 | da fare |
| 7 · All Inclusive | Blocco B | fuori perimetro |
| 8 · Recensioni | 11 | da fare |
| 9 · Operatività e validazione Beta | 12 + divario | da fare |

---

## 3. Le otto divergenze che producono codice diverso

Non sono differenze di calendario. Sono scelte che, prese in un modo o nell'altro, portano a software diverso.

### 3.1 Dove gira l'algoritmo di match

**Simone:** milestone 3, fra le pagine del sito.
**Alessandro:** funzione Postgres `match_designers`, dichiarata SECURITY DEFINER, unica porta verso i dati chiusi. Restituisce posizione, banda, sezione, badge, frase e paesi coperti. Mai punteggi, mai livelli.

**Perché conta.** Se l'algoritmo sta nel frontend, livelli dei paesi, valori dei sei assi e pesi devono **uscire dal database** per essere calcolati. Il Flusso dice che il viaggiatore non deve vederli, e la regola di sicurezza è che non devono essere leggibili nemmeno interrogando il database di lato. Nell'impostazione frontend o si espone quello che non va esposto, o si finisce comunque a costruire una funzione lato server.

**Costo del cambio.** Portare il match nel frontend significa riscriverlo e aprire in lettura le colonne oggi chiuse. Tenerlo nel database non costa niente perché esiste già.

### 3.2 Come si identifica il designer nei messaggi di Cal.com

**Simone:** milestone 4, "webhook Cal.com verso bookings, con filtro anti-rumore sugli event type".
**Alessandro:** la chiave è **account più event type** (`cal_username` + `cal_event_slug`).

**Perché conta.** In produzione i 25 designer copiano lo **stesso event type modello**. Lo slug è quindi identico su 25 account e da solo non identifica nessuno. Un filtro costruito sullo slug non distingue i designer.

**Prova.** In sandbox esistono tre account Cal.com (`alessandro-de-vita-ale1`, `ale2`, `ale3`), di cui due condividono lo slug apposta, proprio per provare la chiave doppia. Il rilievo era stato trovato in modo indipendente da due revisori il 29 luglio.

### 3.3 Come nasce il pagamento

**Simone:** S-10, circa 30 Payment Link creati a mano, uno per combinazione designer + servizio, aperti con `client_reference_id`. Mezza giornata di lavoro, assegnata ad Andrea.
**Alessandro:** il prezzo lo dice il database, la cassa la apre il nostro server. Zero link da creare.

**Perché conta, e non è comodità.** Un Payment Link è un **indirizzo pubblico e riusabile**. Chi ha il link della consulenza da 89€ può usarlo per una consulenza da 149€ e atterrare con un `client_reference_id` perfettamente valido. Nel piano di Simone non c'è nessun controllo dell'importo. Da noi l'importo lo verifica n8n **dopo** il pagamento: se non coincide con il prezzo scritto sulla riga, la consulenza **non** diventa pagata e parte un allarme.

Secondo motivo: due numeri scritti in due posti diversi (il prezzo dentro Stripe e il prezzo dentro il database) prima o poi divergono. Con la cassa aperta dal server il prezzo esiste in un posto solo.

**Costo.** La chiave segreta di Stripe deve stare dentro Vercel. Il codice regge entrambe le strade e si cambia con la variabile `MODO_PAGAMENTO`.

### 3.4 Come nascono i timer

**Simone:** workflow n8n a orario. Ha individuato per primo che l'Insoluti ogni 5 minuti non sta nella quota di n8n Cloud, e da lì ha scelto il self-hosting.
**Alessandro:** stesso approccio, standard tecnico numero 5, "i timer sono controlli ricorrenti, non appuntamenti".

**Su questo divergiamo entrambi dalla soluzione giusta.** Vedi la sezione 6, che è la più operativa di questo documento.

### 3.5 Come si prova

**Simone:** harness sullo schema, PGlite, circa 60 asserzioni, `npm run test:schema`.
**Alessandro:** i messaggi veri di Cal.com conservati in `private.calcom_fixtures`, `private.calcom_rigioca()` che rigioca il ciclo di vita completo in dieci secondi senza toccare Cal.com, e 45 prove funzionali lanciate da `private.prove_tutte()`.

**Sono complementari, non alternative.** L'harness prova che lo schema regge alle sue stesse regole. Le fixture provano che il mondo esterno si comporta come pensiamo, e si accorgono il giorno in cui Cal.com cambia formato. Servono tutte e due, e nessuno dei due piani le ha entrambe.

### 3.6 Dove vivono le migration

**Simone:** 17 file di migration in un repository Git, più due file di seed.
**Alessandro:** una quarantina di migration che vivono **solo dentro il progetto Supabase**.

Qui ha ragione Simone senza attenuanti. Se il progetto sandbox sparisse, sparirebbe anche la storia per ricostruirlo. Esportarle costa mezz'ora ed è segnalato come buco aperto dal 3 agosto.

### 3.7 Le pagine con token

I due piani dicono la stessa cosa: servite da server, token verificato lato server, mai scrittura diretta dal browser. Nel piano di Alessandro è lo standard tecnico numero 2, con in più tre requisiti sui token (almeno 128 bit di casualità, salvati come impronta e non in chiaro, rigenerabili dal team). Va scritto una volta sola invece che due.

### 3.8 Il quiz

**Simone:** `sessionStorage` per quiz e filtri anonimi, milestone 3. Finisce lì.
**Alessandro:** il quiz si salva sul profilo al primo login (deviazione dal Flusso, approvata il 30 luglio).

**Perché conta.** Il briefing che il designer riceve prima della call contiene il profilo quiz del viaggiatore. Senza il salvataggio, quel briefing arriva vuoto proprio nel pezzo che il designer legge.

---

## 4. I due rischi più alti del piano di Simone sono già chiusi

Il suo piano marca due rischi a impatto alto. Sono entrambi risolti, con prove sul campo e non con opinioni.

### 4.1 S-05, le tre verifiche sul piano gratuito di Cal.com

Il piano di Simone lo definisce "il task più importante di tutti", con un esito negativo che vale 2-3 settimane di riscrittura della milestone 4. Le tre risposte, verificate il 30 e 31 luglio:

| Verifica richiesta | Esito | Prova |
|---|---|---|
| Si possono configurare webhook verso un URL esterno? | **Sì** | 7 messaggi veri raccolti e conservati in `private.calcom_fixtures` |
| Esiste una API key per cancellare una prenotazione dall'esterno? | **Non serve nessuna chiave**: basta il codice della prenotazione | Cancellata una prenotazione finta senza credenziali, slot tornato libero, ponte che registra tutto in cinque secondi |
| L'embed accetta il prefill di un campo custom, e quel campo torna nel payload? | **Sì** | Si precompila da URL con `?xpetis_user_id=...` e torna in `payload.responses.xpetis_user_id.value` |

La seconda risposta è **migliore** di quella sperata: cancella dal divario sandbox-produzione l'intera voce "raccogliere 25 chiavi Cal.com in onboarding". Nota di realtà da tenere presente: chiunque conosca il codice di una prenotazione la può cancellare. È il modo in cui Cal.com fa funzionare il link "cancella" nelle sue mail, e quei codici sono lunghi e casuali.

### 4.2 Il JSON delle vetrine contro lo schema

Il piano di Simone lo mette come primo task della milestone 1 e stima da mezza giornata a una settimana di normalizzazione dei 25 profili.

Il confronto è già stato fatto, due volte. Il 30 luglio leggendo il modulo `Vetrina TD`, che ha rivelato che **due assi su sei erano girati al contrario** nel database. Il 30 luglio caricando il pacchetto reale di Dennis Milello (JSON + 25 foto), che ha confermato in modo indipendente il riallineamento: assi, temi e contesti **combaciano parola per parola** con la tassonomia.

I problemi veri sono altri due, e li conosciamo per esperienza:

1. **I designer scrivono "Base" su tutti i paesi.** Dennis ha messo Base su tutti e 32 i suoi, quindi senza correzione non avrebbe mai preso il badge e sarebbe finito sotto a chiunque. Nel foglio però aveva indicato tre top destinazioni. Regola adottata: **le top destinazioni del foglio diventano livello 1**.
2. **Circa un terzo delle voci non sono stati.** Undici su 32: California, Florida, Texas, New York e Hawaii vanno ricondotte a US, la Scozia a GB, "Balcani" e "Caraibi" vanno scorporati, due righe erano vuote. Delle sue sei isole caraibiche solo la Repubblica Dominicana esiste nei nostri 129 stati.

Il caricamento non si fa a mano: esiste `genera_dennis.py`, che legge il JSON del foglio e produce il SQL. È già il primo pezzo dell'onboarding dei 25.

**Punto importante da segnalare a Simone.** La sua vista `td_publish_readiness` controlla che un profilo sia **completo**, non che sia **plausibile**. Un profilo tutto Base è completo, passa il controllo, e poi non funziona.

---

## 5. Punti aperti nei due piani

### 5.1 Non considerati nel piano di Simone

1. **Il tasto "Request reschedule" del designer è una cancellazione secca.** Cal.com manda `BOOKING_CANCELLED` con motivo che comincia per `Please reschedule.` e `cancelledBy` uguale all'indirizzo del designer. Nessuna prenotazione nuova, nessun legame con la vecchia. Su una call **già pagata** il viaggiatore resta senza call e con i soldi spesi. La milestone 5 costruisce i contatori di riprogrammazione senza sapere questo. Si riconosce dai due segni, e la regola adottata è: in onboarding si dice ai designer di usare *Reschedule* e mai *Request reschedule*; se qualcuno lo usa lo stesso su una pagata, scatta il rimborso pieno automatico più l'allarme al team.
2. **Lo slug dell'event type sta in `payload.type`**, non in `eventType.slug`. Scoperto ascoltando i messaggi veri prima di costruire. Con l'ordine dei passi inverso, il cervello del ponte e le prove sarebbero stati scritti su un campo inesistente.
3. **Il workflow del pagamento deve rispondere sempre 2xx a Stripe.** Il nostro rispondeva 500 ogni volta che non c'era niente da fare sul calendario, cioè quasi sempre. Stripe l'avrebbe letto come consegna fallita, avrebbe riprovato all'infinito e alla fine **disattivato l'indirizzo**. Trovato dalle prove, non dall'uso.
4. **Le mail native di Cal.com** non sono nominate in nessun punto del piano. Partono nell'istante della prenotazione dicendo "confermata", mentre per XPETIS quella riga è in attesa di pagamento e ha 30 minuti di vita. Spegnerle su 25 designer potrebbe richiedere un piano a pagamento, il che contraddice la riga "Cal.com free, €0" della sua tabella costi. **È il costo davvero da chiarire, più di Supabase.** L'alternativa gratuita è che i testi XPETIS vengano riscritti perché le due mail convivano.
5. **Il verso dei sei assi.** La milestone 1 dice "sei assi su scala 1-4" senza specificare da che parte. È esattamente il punto su cui il nostro database diceva l'opposto del foglio dei designer: un designer dichiarato *wild* risultava amante del comfort e prendeva la frase sbagliata in pagina. **Nessuna prova tecnica poteva vederlo**, incluso un harness sullo schema. Il verso definitivo: `controllo` (poco → molto), `ritmo` (slow → dynamic), `scomodita` (comfort → wild), `luogo` (estetica curata → vita reale), `sociale` (intimità → socialità), più `con_chi` a scelta multipla con cinque opzioni.
6. **Le prove che cancellano dati veri.** `calcom_prove()` sembrava una lettura e invece azzerava consulenze e diario: lanciandola è sparita una prenotazione vera da Supabase mentre su Cal.com restava viva, cioè esattamente l'incoerenza che il sistema esiste per evitare. Tre protezioni adottate: una consulenza pagata non si cancella né una per una né svuotando in blocco, le prove si lanciano da un punto solo, e quel punto si rifiuta di partire se trova righe vere e pulisce da sé alla fine.

### 5.2 Non considerati nel piano di Alessandro

1. **La quota esecuzioni di n8n.** Vedi sezione 6. È il rilievo più utile che arriva dal piano di Simone, e colpisce qualcosa che gira adesso.
2. **Le migration su disco** e un harness di asserzioni sullo schema.
3. **Le ore umane a bilancio.** Il piano di Simone è l'unico dei due che dice chi fa cosa e quanto ci mette: 14 task numerati, 30-42 ore, con le dipendenze dichiarate ("blocca la milestone 4"). Il nostro quel lavoro lo elenca nel divario sandbox-produzione ma non lo conta, quindi non entra in nessun calendario. **Va copiato.**
4. **Vercel Pro è per postazione.** Oggi 20$ perché lavora una persona sola. Con quattro persone Vercel costa più di tutto il resto dello stack messo insieme.
5. **Il controllo di vitalità dei 25 webhook Cal.com.** Sono configurati uno per uno dentro gli account dei designer: se un designer tocca le impostazioni, le sue prenotazioni smettono di arrivarci **in silenzio**. Serve un controllo periodico.
6. **Stripe Connect al posto di detenere le chiavi Stripe delle agenzie.** Stesso risultato (agenzia merchant of record, compatibile col 74-ter) senza che XPETIS custodisca credenziali di terzi. Riguarda il Blocco B ma va valutato prima di attivare la prima agenzia.
7. **Il provider mail va aperto presto.** La reputazione di invio si scalda in giorni, non in ore. Il nostro piano tiene Gmail fino alla sessione 8 e rimanda il resto al divario.
8. **Il pruning dello storico esecuzioni di n8n** a 7-14 giorni, e il Postgres di n8n separato da Supabase se si self-hosta.

---

## 6. n8n: il problema della quota, con i numeri veri

### 6.1 Cosa succede adesso

Verificato sull'istanza `sandrolive.app.n8n.cloud` il 4 agosto 2026 alle 11:15.

| Dato | Valore |
|---|---|
| Workflow totali | 4, di cui 3 accesi |
| Workflow Insoluti | `MGipQc5JNHjQFJvk`, acceso dal 31 luglio alle 10:13 |
| Cadenza | una esecuzione ogni 5 minuti esatti |
| Durata media | 0,3-0,5 secondi, quasi sempre senza fare niente |
| Esecuzioni al 4 agosto | id 1212, di cui circa 1.164 del solo Insoluti |
| Ritmo | circa 270 esecuzioni al giorno |

Il piano n8n Cloud Starter costa 24$ al mese e dà **2.500 esecuzioni mensili**. Un controllo ogni 5 minuti ne consuma **8.640**. Consumiamo l'intera quota mensile in **circa 9 giorni**.

### 6.2 Il problema vero è più avanti

Lo standard tecnico numero 5 del nostro piano dice che tutti i timer sono controlli ricorrenti. Ecco quelli ancora da costruire:

| Sessione | Timer |
|---|---|
| 8 | reminder del giorno prima |
| 9 | fine call (mail post-call), chiusura ordini a 48 ore |
| 10 | chiusura revisione a 5 giorni |
| 11 | buon viaggio, recensione consulenza, recensione viaggio, ricostruzione notturna del foglio designer |

Sono **sette timer in più**. Se ognuno nasce come il suo workflow a 5 minuti, si arriva a circa **60.000 esecuzioni al mese**. Non regge nessun piano cloud: anche il Pro da 10.000 salta. La stessa milestone 5 e la milestone 6 del piano di Simone aggiungono gli stessi timer, quindi il problema è comune ai due piani.

### 6.3 Le tre strade

| Strada | Costo mensile | Cosa comporta |
|---|---|---|
| **A · n8n Cloud Pro** | ~60-65$ | Regge un solo orologio consolidato (8.640 esecuzioni). Sette timer separati no. È un tampone, non una soluzione |
| **B · Self-hosted** | ~5-14$ su Railway | Esecuzioni illimitate. È già la decisione presa da Simone per la produzione. Costa manutenzione: Docker, certificati, backup, aggiornamenti |
| **C · Timer dentro Supabase, webhook in n8n** | 0$ in più | n8n scende a poche centinaia di esecuzioni al mese e lo Starter basta per tutto il resto del Blocco A |

### 6.4 Sull'API di n8n self-hosted

Domanda posta il 4 agosto: se si self-hosta l'open source, l'API esiste ancora e si usa con la stessa facilità?

**Sì.** L'API pubblica `/api/v1` è inclusa gratuitamente nella Community edition self-hosted, è la stessa API della versione cloud, si autentica con la stessa intestazione `X-N8N-API-KEY`, e le chiavi sono illimitate. La sola differenza in Enterprise sono le chiavi con permessi ristretti e la gestione utenti via SSO. Il connettore con cui i workflow vengono costruiti e verificati vuole soltanto un indirizzo e una chiave: **il modo di lavorare non cambia**.

Fonti: [documentazione API n8n](https://docs.n8n.io/api/), [autenticazione](https://docs.n8n.io/connect/n8n-api/authentication), [prezzi cloud 2026](https://goodspeed.studio/blog/n8n-pricing).

### 6.5 Raccomandazione

**Subito.** Portare l'Insoluti da 5 a 30 minuti in sandbox. Costa un minuto di lavoro e fa scendere il consumo da 8.640 a 1.440 al mese. In sandbox uno slot liberato entro mezz'ora invece che entro cinque minuti non cambia nulla, e restano circa 1.000 esecuzioni al mese per i webhook e le prove.

**All'apertura della sessione 8.** Adottare la strada C. I timer diventano `pg_cron` dentro Supabase e chiamano le funzioni Postgres che esistono già; le chiamate verso l'esterno passano da `pg_net`. n8n si tiene i due workflow che valgono davvero il suo log visuale e il suo retry, cioè i webhook di Cal.com e di Stripe, che sono quelli dove i soldi arrivano da fuori.

**Perché conviene due volte.** Lo Starter basta fino alla fine del Blocco A, e il giorno della migrazione verso l'istanza XPETIS ci sono **due** workflow da spostare invece di dieci.

**Cosa costa, detto onestamente.** Si perde il log visuale delle esecuzioni sui timer, che oggi è comodo. È mitigato dal fatto che il diario degli eventi esiste già dentro Supabase. E la strada C funziona perché la nostra logica sta già dentro Postgres: i workflow n8n sono sottili, chiamano `public.calcom_webhook` e poco altro. Con un'impostazione che tiene più logica dentro n8n, questa scorciatoia non esisterebbe.

---

## 7. L'effetto sui tempi

Stima di quante sessioni del piano di Simone sono già coperte dal lavoro esistente.

| Milestone | Sue sessioni | Coperte | Restano |
|---|---|---|---|
| 0 · Fondazioni database | 1 | l'ha fatta lui | 0 |
| 1 · Import geo e TD | 3-4 | geografia, confronto JSON, primo TD vero, script di import | 0-1 |
| 2 · Infrastruttura [C] | 2 | bootstrap Next.js, migration, route token | 0,5-1 |
| 3 · Sito pubblico | 6-8 | tutto | 0 |
| 4 · Prenotazione e pagamento | 5-6 | tutto tranne il calendario admin | 0,5-1 |
| 5 · Prima della call | 2-3 | contatori già alimentati dal ponte | 1-2 |
| 6 · Post-call e su misura | 5-6 | niente | 5-6 |
| 7 · All Inclusive | 4-5 | fuori perimetro | 4-5 |
| 8 · Recensioni | 2-3 | niente | 2-3 |
| 9 · Operatività e Beta | 3-4 | niente | 3-4 |
| **Totale** | **33-40** | | **16-23** |

Sono **16-18 sessioni tolte**, cioè circa **32-36 ore delle sue 66-80**: poco più della metà del piano.

Nella sua stessa aritmetica di calendario, a 3 sessioni a settimana, sono **5-6 settimane in meno**. "Fine ottobre" diventa **metà settembre** sul codice, cioè dentro la scadenza originale di fine settembre.

A questo si aggiunge una cosa che non si conta in sessioni ma pesa quanto o più: **la varianza tolta dalla cima del piano**. I due rischi marcati impatto alto sono chiusi con prove, non con opinioni. Il piano di Simone stimava fino a 2-3 settimane di slittamento sul solo S-05.

**Avvertenza che vale quanto il resto.** Questo risparmio esiste **solo se la base esistente viene adottata**. Se si ricostruisce, il risparmio è zero e il costo è doppio.

---

## 8. La decisione da prendere

Esistono **due schemi di database vivi**, costruiti in modo indipendente sullo stesso documento di flusso.

| | Schema Simone | Schema Alessandro |
|---|---|---|
| Dove | repository Git + progetto Supabase | progetto `xpetis-sandbox` |
| Tabelle | 30 | 20 più le aggiunte delle sessioni 2-7 |
| Migration | 17, su disco | circa 44, dentro Supabase |
| Sicurezza | RLS chiusa, 7 viste pubbliche | RLS a tre livelli, permessi per colonna sui livelli dei paesi |
| Prove | harness PGlite, ~60 asserzioni | 45 prove funzionali + fixture dei messaggi veri |
| Dati dentro | seed di parametri e dati finti | geografia completa (129 stati, 244 regioni, 1220 città), 6 profili di prova, 3 vetrine complete di cui **1 di un designer vero** |
| Provato contro il mondo esterno | no | sì: Cal.com e Stripe, con messaggi firmati |

Il registro del piano di Simone, alla data del 1 agosto, dice che ha letto il Flusso e ha costruito da zero. I materiali che elenca come "in arrivo" (file della tassonomia, JSON delle vetrine, esito delle verifiche Cal.com) sono cose già in mano. **Il piano non sa che le sessioni 1-7 esistono e girano.**

La domanda unica a cui rispondere, prima di qualunque altra: **quale dei due schemi è la base.** Tutto il resto discende da lì, e nessuno dei due si butta gratis.

Qualunque sia la risposta, le informazioni della sezione 5.1 valgono comunque: sono fatti su Cal.com e Stripe, non sono legati a uno schema.

---

## 9. Azioni proposte, in ordine

| # | Azione | Chi | Tempo | Perché adesso |
|---|---|---|---|---|
| 1 | Insoluti da 5 a 30 minuti in sandbox | Claude | 1 minuto | Stiamo bruciando la quota mentre leggiamo |
| 2 | Esportare le migration su disco | Claude | 30 minuti | Se il progetto sparisse, sparirebbe la storia per ricostruirlo |
| 3 | Mandare a Simone `XPETIS_STATO_AVANZAMENTO_Sessioni_1-7` e `GUIDA_PONTE_CALCOM.md` | Alessandro | subito | Il suo primo task in ordine di rischio è lavoro già finito e provato |
| 4 | Decidere quale schema è la base | Alessandro e Simone | una conversazione | Blocca tutto il resto |
| 5 | Timer in `pg_cron` all'apertura della sessione 8 | Claude | dentro la sessione | Senza, le sessioni 8-11 non stanno in nessun piano n8n |
| 6 | Aggiungere al piano le ore umane in stile S-01…S-14 | Claude | 1 ora | Oggi quel lavoro non entra in nessun calendario |
| 7 | Aggiungere il controllo di vitalità dei 25 webhook | Claude | sessione 12 | Un webhook morto fa sparire le prenotazioni in silenzio |
| 8 | Chiarire il costo Cal.com sulle mail native | Alessandro | da verificare | È il costo aperto più grosso, e nessuno dei due piani lo quantifica |

---

## 10. Dove stanno le prove

| Affermazione | Dove si verifica |
|---|---|
| Il ponte Cal.com e i campi veri del payload | `GUIDA_PONTE_CALCOM.md`, e `private.calcom_fixtures` su `xpetis-sandbox` |
| Le 45 prove | `private.prove_tutte()` |
| Le decisioni e il perché di ognuna | registro in fondo a `PIANO_XPETIS.md`, oltre 90 voci datate |
| Le relazioni di sessione | `Xpetis/Sessioni/` |
| Lo stato dettagliato delle sessioni 1-7 | `XPETIS_STATO_AVANZAMENTO_Sessioni_1-7.docx` |
| Le cose sapute imperfette e costruite comunque | `ELEMENTI_DI_CRESCITA.md` |
| Il consumo n8n | istanza `sandrolive.app.n8n.cloud`, elenco esecuzioni |
