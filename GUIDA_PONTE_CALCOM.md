# Il ponte Cal.com verso Supabase · guida operativa passo per passo

**Versione 1 · 30 luglio 2026**
**Per chi:** chiunque debba capire, rifare o verificare questo pezzo di XPETIS senza aver parlato con nessuno. In particolare Simone.
**Cosa copre:** tutto quello che è stato costruito nella sessione 4 del piano XPETIS, dalle impostazioni dentro Cal.com fino alle funzioni del database, con i valori esatti usati.
**Cosa NON copre:** pagamenti, mail, sito, login, e tutto ciò che sta nelle sessioni successive.

---

# Parte 0 · Cosa fa questo pezzo, in tre righe

Un viaggiatore prenota una consulenza sul calendario di un Travel Designer. Cal.com avvisa n8n. n8n gira il messaggio a Supabase, che riconosce di quale designer e quale servizio si tratta, crea la riga della consulenza e mette l'appuntamento su un calendario Google che il team guarda.

Se il viaggiatore o il designer spostano la call, o la cancellano, **resta sempre la stessa riga**: cambia il suo stato e la sua data, non nasce un ordine nuovo. Questa è la cosa difficile del pezzo, ed è il motivo per cui esiste.

## Perché non basta usare i codici di Cal.com

**Cal.com cambia il codice della prenotazione a ogni spostamento.** Il codice nuovo arriva in `payload.uid`, quello vecchio in `payload.rescheduleUid`. Chi tratta `uid` come identità dell'ordine crea una prenotazione nuova a ogni spostamento, e la contabilità dei compensi del designer va in confusione.

L'identità stabile è **la chiave primaria della riga su Supabase** (`consultations.id`), che non cambia mai. `booking_uid` è solo un puntatore alla versione corrente su Cal.com.

Questa lezione viene dal POC di luglio 2026 (vedi `VERIFICA_POC_Calcom_n8n_Supabase.md`).

---

# Parte 1 · Gli ingredienti

| Cosa | Valore usato in sandbox | Note |
|---|---|---|
| Progetto Supabase | `rsgyxbqzsxahsbdfgtbm` (`xpetis-sandbox`), regione eu-central-1 | in produzione sarà un altro |
| URL Supabase | `https://rsgyxbqzsxahsbdfgtbm.supabase.co` | |
| Istanza n8n | `https://sandrolive.app.n8n.cloud` | piano con API pubblica attiva |
| Workflow n8n | `XPETIS · Cal.com verso Supabase (consulenze)`, id `pHqtc2VNuLT31PO9` | 8 nodi |
| Indirizzo del webhook | `https://sandrolive.app.n8n.cloud/webhook/calcom-consulenze` | |
| Account Cal.com di prova | `alessandro-de-vita-ale1`, `-ale2`, `-ale3` | piano gratuito |
| Calendario del team | `XPETIS · Consulenze` su Google Calendar di `sandro.vita3@gmail.com` | calendario **dedicato**, vedi Parte 4 |

**Credenziali necessarie dentro n8n** (tre, e si creano a mano dentro n8n: nessuna passa da un documento o da una chat):

1. `Supabase API` con host `https://rsgyxbqzsxahsbdfgtbm.supabase.co` e la chiave **service_role** del progetto.
2. `Google Calendar OAuth2 API`, autorizzata con l'account che possiede il calendario del team.
3. La **parola segreta del webhook**, che però non è una credenziale n8n: si scrive dentro Supabase, vedi Parte 5.

---

# Parte 2 · Cal.com, passo per passo

Da rifare identico per **ogni** Travel Designer. In sandbox sono stati fatti tre account; in produzione saranno 25, ed è il lavoro di onboarding (circa 15 minuti a testa in screen sharing).

## 2.1 Creare l'account

1. Andare su `https://cal.com` e registrarsi. Piano **gratuito**, è sufficiente.
2. Cal.com assegna uno username con una sigla casuale attaccata (per esempio `alessandro-de-vita-gjw0y2`). **Cambiarlo** dalle impostazioni del profilo con qualcosa di riconoscibile.
3. **In produzione l'username deve essere uguale allo slug della vetrina XPETIS** (per esempio `marco-rossi-xpetis`), perché è la chiave con cui il ponte riconosce il designer.
4. Impostare la disponibilità settimanale in **Disponibilità**. Le ferie e i giorni chiusi si mettono come eccezioni di data.

## 2.2 Creare l'event type della consulenza da 30 minuti

Dalla lista degli event type, creane uno nuovo (o rinomina quello da 30 minuti che Cal.com crea da solo).

**Impostazione evento:**

| Campo | Valore |
|---|---|
| Titolo | `Consulenza XPETIS · 30 min` |
| URL | `consulenza-xpetis-30` |
| Durata | 30 minuti |
| Luogo | **Cal Video** |

**ATTENZIONE, ed è l'errore più facile da fare.** In Cal.com **titolo e URL sono due campi separati**: cambiare il titolo non cambia l'URL. Cal.com genera l'URL dal titolo in modo non prevedibile: lo stesso titolo `Consulenza XPETIS · 30 min` ha prodotto `consulenza-xpetis-30` su un account e `consulenza-xpetis-30-min` su un altro. **L'URL va scritto a mano e va scritto identico su tutti gli account**, altrimenti ci si ritrova 25 indirizzi diversi e i link delle vetrine non si possono costruire a tavolino.

Perché **Cal Video** e non Google Meet: Cal Video è integrato e non richiede al designer di collegare il proprio Google Calendar. È una dipendenza in meno in onboarding. Si cambia in qualunque momento con un'impostazione dell'event type.

**Politiche → Limiti e buffer:**

| Campo | Valore | Perché |
|---|---|---|
| Buffer dopo l'evento | 10 minuti | il designer non finisce una call e ne comincia un'altra nello stesso istante |
| Preavviso minimo | 12 ore | è la regola del Flusso: sotto le 12 ore non si modifica più niente |
| Prenotabile nei prossimi | 30 giorni | orizzonte previsto dal Flusso |

**Esperienza di prenotazione → Modulo di prenotazione → Aggiungi domanda:**

| Campo | Valore |
|---|---|
| Tipo | testo breve |
| Etichetta | `Codice XPETIS (non modificare)` |
| **Identificatore** | `xpetis_user_id` |
| Disabilita input se l'identificatore URL è precompilato | **spuntato** |
| Rendi obbligatorio | **non** spuntato |
| Nascosto | sì, se l'opzione è disponibile nell'elenco dei campi |

**A cosa serve questo campo, ed è il pezzo più delicato di tutto il meccanismo.** La prenotazione avviene dentro Cal.com, che non sa chi sia l'utente per XPETIS. Il sito, quando apre il calendario, passa nell'indirizzo l'identificativo dell'utente XPETIS collegato:

```
https://cal.com/<username>/<slug-event-type>?xpetis_user_id=<uuid dell utente>
```

Cal.com precompila il campo, lo rende non modificabile, e **lo restituisce dentro il messaggio del webhook**. Così ogni prenotazione arriva già agganciata all'utente giusto, senza dover confrontare indirizzi mail, che è fragile.

**Verificato il 30 luglio 2026: funziona.** Il valore torna in `payload.responses.xpetis_user_id.value`.

## 2.3 Creare l'event type della consulenza approfondita (solo per chi la offre)

Identico al precedente, ma:

| Campo | Valore |
|---|---|
| Titolo | `Consulenza XPETIS Approfondita 60 min` |
| URL | `consulenza-xpetis-approfondita-60-min` |
| Durata | 60 minuti |

Il resto (buffer, preavviso, orizzonte, campo nascosto) è uguale.

## 2.4 Configurare il webhook

**Impostazioni → Sviluppatore → Webhooks → Nuovo webhook.**

| Campo | Valore |
|---|---|
| URL sottoscrittore | `https://sandrolive.app.n8n.cloud/webhook/calcom-consulenze` |
| Eventi | **solo** `Booking Created`, `Booking Rescheduled`, `Booking Cancelled` |
| Secret | una parola lunga e casuale, **identica su tutti gli account** |
| Attivo | sì |

**La parola segreta va poi scritta dentro Supabase** (Parte 5). Se le due non coincidono, il ponte rifiuta tutti i messaggi. È il comportamento giusto: senza firma valida un messaggio non entra nemmeno nel diario.

## 2.5 Pulizia

Cal.com crea da solo gli event type `15min` e `30min` alla registrazione. **Restano prenotabili**: chi conosce il link pubblico può prenotarli. Il ponte li scarta (non sono censiti a database) e lo annota nel diario, quindi non fanno danno, ma in produzione conviene cancellarli per non confondere i viaggiatori.

---

# Parte 3 · Supabase, com'è fatto dentro

## 3.1 Le tabelle toccate da questo pezzo

**`consultations`** è la riga della consulenza, e l'unica identità che conta. Le colonne che servono al ponte:

| Colonna | A cosa serve |
|---|---|
| `id` | l'identità stabile. Non cambia mai, nemmeno dopo cinque spostamenti |
| `booking_uid` | il codice Cal.com **corrente**. Avanza a ogni spostamento. Unico |
| `booking_id` | il numero interno di Cal.com, utile solo per cercare a mano nel loro pannello |
| `td_id`, `service_key` | quale designer, quale servizio |
| `event_type_title` | il nome del servizio come lo vede il viaggiatore |
| `start_at`, `end_at` | quando, **in UTC** |
| `original_start_at` | la data della **prima** prenotazione. Non si sovrascrive mai: serve alla regola dei 20 giorni |
| `attendee_timezone` | il fuso dichiarato dal viaggiatore |
| `attendee_name`, `attendee_email` | nome e indirizzo di chi ha prenotato su Cal.com. Servono quando non c'è un profilo XPETIS collegato |
| `video_url` | il link della call |
| `status` | vedi 3.2 |
| `price_cents` | il prezzo **congelato** al momento della prenotazione |
| `payment_deadline_at` | scadenza dei 30 minuti per pagare |
| `reschedule_count_traveler`, `reschedule_count_td` | quanti spostamenti, e da chi |
| `rescheduled_by_last`, `cancelled_by` | `viaggiatore`, `designer`, `sistema` o `non_dichiarato` |
| `cancelled_at`, `cancellation_reason` | quando e perché |
| `admin_event_id` | il codice dell'evento sul calendario del team |
| `user_id` | il profilo XPETIS, se c'è |

**`consultation_events`** è il diario: ogni messaggio che arriva da Cal.com viene salvato **intero e grezzo** prima di essere interpretato.

| Colonna | A cosa serve |
|---|---|
| `payload` | il messaggio completo, così come è arrivato |
| `fingerprint` | impronta dei campi che contano. Unica: è ciò che impedisce di lavorare due volte lo stesso messaggio |
| `outcome` | cosa ne ha fatto il cervello: `creata`, `aggiornata`, `cancellata`, `gia_fatto`, `scartata_*`, `errore` |
| `note` | perché, quando il messaggio non ha prodotto niente |
| `consultation_id` | a quale consulenza si riferisce |

Il diario non è un lusso: nel POC di luglio ha fatto capire in minuti cose che altrimenti costavano ore. **E ha permesso di scoprire i campi veri di Cal.com prima di scrivere una riga di logica**, invece di indovinarli.

## 3.2 Gli stati ammessi della consulenza

Sono un vincolo del database, quindi uno stato scritto male non entra:

`prenotata_attesa_pagamento` · `confermata_pagata` · `completata` · `cancellata_non_pagata` · `cancellata_rimborso_da_fare` · `cancellata_rimborsata` · `cancellata_senza_rimborso` · `no_show` · `in_disputa`

**`cancellata_rimborso_da_fare` è stato aggiunto in questa sessione.** Quando arriva la cancellazione di una consulenza già pagata, il rimborso non è ancora stato fatto da nessuno: scrivere `cancellata_rimborsata` sarebbe falso. Quello stato è la verità di quel momento e diventa il campanello per il team.

## 3.3 Il collegamento fra Cal.com e i designer, cioè la chiave doppia

| Dove | Colonna | Cosa contiene |
|---|---|---|
| `travel_designers` | `cal_username` | l'username dell'account Cal.com del designer |
| `td_services` | `cal_event_slug` | l'URL dell'event type che corrisponde a quel servizio |

**L'account dice CHI, l'event type dice COSA.** Serve la coppia, non basta lo slug: in produzione tutti e 25 i designer copiano lo stesso event type modello, quindi lo slug è identico su 25 account e da solo non identifica nessuno. In sandbox ale2 e ale3 hanno lo stesso slug proprio per provare questo caso.

Valori in sandbox:

| Designer | `cal_username` | Servizio | `cal_event_slug` | Prezzo |
|---|---|---|---|---|
| De Vita Alessandro 1 | `alessandro-de-vita-ale1` | consulenza | `consulenza-xpetis-30` | 69,00 |
| De Vita Alessandro 2 | `alessandro-de-vita-ale2` | consulenza | `consulenza-xpetis-30-min` | 89,00 |
| De Vita Alessandro 2 | `alessandro-de-vita-ale2` | consulenza_plus | `consulenza-xpetis-approfondita-60-min` | 149,00 |
| De Vita Alessandro 3 | `alessandro-de-vita-ale3` | consulenza | `consulenza-xpetis-30-min` | 65,00 |

Un designer con `cal_username` vuoto è censito ma non collegato: le sue prenotazioni non possono esistere, e se arrivasse un messaggio da un account sconosciuto viene scartato e annotato.

## 3.4 Le funzioni, e perché sono divise così

Sono quattro strati, e **la divisione è la cosa che vale**. Chi mette mano al codice deve capire questo prima di tutto.

### `private.calcom_leggi(msg jsonb) → jsonb`

**È la sola funzione di tutto il sistema che sa com'è fatto un messaggio di Cal.com.** Traduce il messaggio grezzo in campi con nomi nostri. Se Cal.com cambia formato, si riscrive questa e nient'altro.

Contiene anche una difesa: se il chiamante ha impacchettato il messaggio come testo invece che come struttura, lo srotola. È servito davvero.

### `private.calcom_diario(msg jsonb) → jsonb`

Scrive il messaggio nel diario e dice se è nuovo. Calcola l'impronta **sui campi che contano** (tipo evento, codice, codice precedente, orari) e non su tutto il messaggio, perché Cal.com manda un `createdAt` diverso a ogni consegna: con quello dentro l'impronta cambierebbe e il doppione passerebbe.

Se il messaggio è già stato lavorato risponde `gia_visto` e non si fa niente. Se la volta precedente era rimasta a metà (`in_lavorazione` o `errore`), lo rilavora: è così che un ritentativo di Cal.com ripara un errore invece di essere ignorato per sempre.

### `private.calcom_applica(event_id bigint) → jsonb`

Il cervello. **Non sa niente di Cal.com**: legge il biglietto già tradotto. Fa tre cose diverse a seconda del tipo di evento (vedi 3.5).

### `public.calcom_webhook(p_corpo text, p_firma text) → jsonb`

**La porta unica, e la sola cosa raggiungibile da fuori.** Nell'ordine: verifica la firma, interpreta il corpo, chiama il diario, chiama il cervello, e restituisce anche le istruzioni per il calendario.

Se il cervello va in errore, l'errore viene catturato e scritto sulla riga di diario: **il messaggio non si perde**. La riga di diario è già stata scritta e sopravvive.

### Funzioni di appoggio

| Funzione | Cosa fa |
|---|---|
| `private.calcom_firma_valida(corpo, firma)` | HMAC SHA256 del corpo grezzo con la parola segreta. Senza parola segreta configurata risponde sempre falso: **il ponte nasce chiuso** |
| `private.calcom_utente(id text)` | restituisce l'identità XPETIS solo se esiste davvero fra i profili |
| `private.calcom_calendario(consultation_id, esito)` | dice a n8n cosa fare sul calendario, con titolo e descrizione già pronti |
| `public.calcom_segna_evento(consultation_id, evento_id)` | n8n scrive qui il codice dell'evento appena creato |

### Funzioni di prova

| Funzione | Cosa fa |
|---|---|
| `private.calcom_rigioca(azzera boolean)` | rigioca i messaggi veri conservati, in ordine. Con `true` riparte da zero |
| `private.calcom_prove()` | 20 prove, restituisce PASSA o FALLISCE per ognuna. Girano in pochi secondi |
| `private.calcom_finto(base, patch)` | costruisce un messaggio finto partendo da uno vero, cambiando solo il campo sotto esame |

E la tabella `private.calcom_fixtures` conserva **sette messaggi veri** di Cal.com raccolti il 29 e 30 luglio 2026. Servono a rifare tutte le prove in dieci secondi senza dover riprenotare a mano, e ad accorgersi subito se un domani Cal.com cambia formato.

## 3.5 Cosa fa il cervello, evento per evento

### Prenotazione creata

1. Se esiste già una riga con quel codice, risponde `gia_fatto` e non tocca niente.
2. Riconosce il designer da `cal_username` e il servizio da `cal_event_slug`. Se uno dei due non si riconosce, **scarta e annota nel diario**: non crea righe da smistare a mano.
3. Aggancia l'identità XPETIS **solo se esiste davvero** fra i profili. Se il codice è inventato o malformato, la riga nasce comunque **senza viaggiatore** e il diario scrive perché.
4. Crea la riga: stato `prenotata_attesa_pagamento`, prezzo copiato da `td_services` (congelato), scadenza a 30 minuti da adesso, `original_start_at` uguale a `start_at`.

### Prenotazione spostata

1. Cerca la riga con `booking_uid` uguale al **codice precedente** (`rescheduleUid`), non a quello nuovo.
2. Aggiorna date, fuso, link video, e **fa avanzare `booking_uid`** al codice nuovo.
3. Alza il contatore giusto: quello del designer se ha agito il designer, quello del viaggiatore altrimenti.
4. `original_start_at` **non si tocca**.
5. Se non trova nessuna riga col codice precedente, guarda se ne esiste una col codice nuovo: in quel caso il messaggio è arrivato due volte e risponde `gia_fatto`. Altrimenti scarta e annota. **Non crea mai una riga nuova su uno spostamento.**

### Prenotazione cancellata

1. Cerca la riga con `booking_uid` uguale al codice corrente.
2. Se è già cancellata, risponde `gia_fatto`.
3. Scrive lo stato: `cancellata_non_pagata` se non era pagata, `cancellata_rimborso_da_fare` se lo era. **Il ponte non decide mai un rimborso.**
4. Salva chi ha cancellato e il motivo scritto da chi ha cancellato.
5. Se ha cancellato il **designer**, il diario scrive un avviso: il Flusso dice che non dovrebbe poterlo fare su una consulenza pagata, e Cal.com non lo impedisce. Diventerà una notifica al team.

### Evento non gestito

Qualunque altro `triggerEvent` di Cal.com viene scartato e annotato, senza rumore.

## 3.6 I campi veri del messaggio di Cal.com

Verificati su sette messaggi reali. **Questa tabella è la parte più preziosa del documento**: tre di questi campi non stanno dove la documentazione lascerebbe pensare.

| Cosa serve | Dove sta |
|---|---|
| Tipo di evento | `triggerEvent`: `BOOKING_CREATED` / `BOOKING_RESCHEDULED` / `BOOKING_CANCELLED` |
| Codice prenotazione | `payload.uid` |
| Codice precedente | `payload.rescheduleUid` (solo sullo spostamento) |
| Account del designer | `payload.organizer.username` |
| Event type | **`payload.type`** |
| Nome del servizio | **`payload.eventTypeTitle`** |
| Numero interno | `payload.bookingId` |
| Orari | `payload.startTime` / `endTime`, già in UTC con la Z |
| Fuso del viaggiatore | `payload.attendees[0].timeZone` |
| Nome e mail | `payload.attendees[0].name` / `.email` |
| Link video | `payload.metadata.videoCallUrl` (anche `payload.videoCallData.url`) |
| Identità XPETIS | `payload.responses.xpetis_user_id.value` |
| Chi ha spostato | `payload.rescheduledBy` (indirizzo mail) |
| Chi ha cancellato | `payload.cancelledBy` (indirizzo mail) |
| Motivo | `payload.cancellationReason` |
| Mail del designer | `payload.organizer.email` |

**Le tre trappole:**

1. Lo slug dell'event type **non** è in `eventType.slug` né in `eventTypeSlug`: è in **`payload.type`**.
2. `payload.title` **non** è il nome del servizio: è la frase composta *"Consulenza XPETIS · 30 min between Tizio and Caio"*. Il nome del servizio è in `eventTypeTitle`.
3. Chi ha agito **si sa**, non va indovinato: `rescheduledBy` e `cancelledBy` portano un indirizzo mail. Confrontandolo con `organizer.email` si distingue il designer dal viaggiatore.

---

# Parte 4 · Il calendario del team

## 4.1 Creare il calendario

**Deve essere un calendario Google dedicato, non quello di un designer.** Il motivo è concreto: se l'account Cal.com di un designer è collegato al suo Google Calendar, **Cal.com ci scrive già le sue prenotazioni**. Scrivendoci anche noi, per quel designer ogni call comparirebbe due volte e per gli altri una sola. Un calendario che mente sui numeri è peggio di non averlo.

1. Google Calendar → barra di sinistra → **Altri calendari** → **+** → **Crea nuovo calendario**.
2. Nome: `XPETIS · Consulenze`. Fuso: Europe/Rome.
3. Impostazioni di quel calendario → **Integra calendario** → copiare l'**ID calendario** (finisce in `@group.calendar.google.com`).
4. Condividerlo **in sola lettura** con chi del team deve vederlo.

## 4.2 Scrivere l'ID a database

Dall'editor SQL di Supabase Studio:

```sql
insert into private.calcom_config (chiave, valore)
values ('calendario_team', 'IL-TUO-ID@group.calendar.google.com')
on conflict (chiave) do update set valore = excluded.valore, aggiornato = now();
```

**Sta a database e non dentro il workflow**: se il team cambia calendario si cambia una riga e nessuno tocca n8n.

## 4.3 Cosa si vede in calendario

Il titolo dell'evento dice lo stato a colpo d'occhio, senza aprire niente:

```
IN ATTESA · De Vita Alessandro 2 · Viaggiatore di Prova
```

Diventa `PAGATA · ...` quando arriverà Stripe, e poi `FATTA`, `NON PRESENTATO`, `IN DISPUTA`, `CANCELLATA`.

Nella descrizione: designer, chi ha prenotato con la sua mail, servizio e prezzo, stato, fuso del viaggiatore, link video, quanti spostamenti e da chi, motivo della cancellazione se c'è, e il codice della riga XPETIS.

**Il titolo lo compone il database, non il workflow**, perché è una regola di prodotto: si cambia in `private.calcom_calendario` senza toccare n8n.

## 4.4 Regola importante

**Il calendario non può fermare il ponte.** Sui tre nodi del calendario è attivo "continua anche in caso di errore": se Google non risponde, la consulenza è già salvata su Supabase e un evento mancante in calendario è un fastidio, non un dato perduto. Il contrario, perdere una prenotazione perché il calendario fa i capricci, sarebbe grave.

---

# Parte 5 · La parola segreta del webhook

Serve a impedire che chiunque indovini l'indirizzo del workflow e si finga Cal.com, facendo comparire prenotazioni finte, o peggio facendole risultare pagate quando arriverà Stripe.

Cal.com firma il corpo del messaggio con HMAC SHA256 usando la parola segreta condivisa, e mette la firma nell'intestazione `x-cal-signature-256`.

**La verifica sta dentro Supabase, non dentro n8n**, per tre motivi: la parola segreta vive in un posto solo, in una tabella chiusa; n8n resta stupido e si limita a inoltrare corpo e firma; se un domani si cambia orchestratore, il controllo resta.

**Come si configura.** La stessa parola va in due posti:

1. Nel campo **Secret** del webhook di **ogni** account Cal.com.
2. Dentro Supabase, dall'editor SQL:

```sql
insert into private.calcom_config (chiave, valore)
values ('webhook_secret', 'LA-PAROLA-SEGRETA')
on conflict (chiave) do update set valore = excluded.valore, aggiornato = now();
```

**Senza parola segreta configurata il ponte rifiuta tutto.** Non è un guasto: è la scelta di nascere chiuso.

Per verificare che c'è, senza leggerla:

```sql
select chiave, length(valore) as caratteri, aggiornato from private.calcom_config;
```

---

# Parte 6 · Il workflow n8n, nodo per nodo

Otto nodi. Il principio è: **n8n non decide niente**, fa il portiere e l'esecutore.

```
Webhook Cal.com
   → Prepara corpo e firma
      → Porta del ponte (Supabase)
         → Cosa fare sul calendario
              ├── crea    → Calendario crea evento → Segna il codice evento
              ├── sposta  → Calendario sposta evento
              └── cancella→ Calendario togli evento
```

## 1. `Webhook Cal.com` (Webhook)

| Impostazione | Valore |
|---|---|
| Metodo | POST |
| Percorso | `calcom-consulenze` |
| Modalità di risposta | **Last node** |
| Opzioni → **Raw Body** | **acceso** |

**Raw Body è obbligatorio.** La firma si calcola sui byte originali del messaggio: se n8n interpreta il JSON e lo ricompone, l'ordine delle chiavi o gli spazi possono cambiare e la firma non torna più.

**Last node** e non "immediatamente": così Cal.com riceve un errore se qualcosa va storto e riprova, e il nostro meccanismo di ritentativo può riparare.

## 2. `Prepara corpo e firma` (Code)

Estrae due sole cose: il corpo grezzo come stringa e la firma dall'intestazione `x-cal-signature-256`.

Il corpo grezzo può arrivare in tre forme diverse a seconda della versione di n8n (binario, `rawBody` stringa, `body` stringa): il codice le prende in ordine di fedeltà. Se finisce nell'ultima spiaggia, cioè ricomporre il JSON, restituisce anche `ricomposto: true`, e in quel caso la firma probabilmente non tornerà e il ponte rifiuterà il messaggio. **È il comportamento giusto: meglio chiuso che aperto a chiunque.**

## 3. `Porta del ponte (Supabase)` (HTTP Request)

| Impostazione | Valore |
|---|---|
| Metodo | POST |
| URL | `https://qgsxziomobfodxmiququ.supabase.co/rest/v1/rpc/calcom_webhook` |
| Autenticazione | Predefined Credential Type → **Supabase API** |
| Corpo | JSON: `{ p_corpo, p_firma }` |

Qui dentro non c'è logica. Tutta la decisione sta nel database.

## 4. `Cosa fare sul calendario` (Switch)

Legge `calendario.azione` che arriva da Supabase e smista su tre uscite: `crea`, `sposta`, `cancella`. Se il valore è `niente`, non fa niente (nessuna uscita di riserva).

## 5, 6, 7. I tre nodi Google Calendar

| Nodo | Operazione |
|---|---|
| `Calendario crea evento` | crea, con titolo, descrizione e orari che arrivano da Supabase |
| `Calendario sposta evento` | aggiorna l'evento identificato da `calendario.evento_id` |
| `Calendario togli evento` | cancella l'evento |

L'ID del calendario arriva da Supabase (`calendario.calendario_id`), **non è scritto nel nodo**.

Su tutti e tre: **In caso di errore → continua**. Vedi 4.4.

## 8. `Segna il codice evento` (HTTP Request)

Dopo la creazione, scrive il codice dell'evento Google sulla riga della consulenza, chiamando `calcom_segna_evento`. Serve perché la volta dopo l'evento venga **spostato** invece che duplicato.

---

# Parte 7 · Come si verifica che funziona

## 7.1 Le prove automatiche, in dieci secondi

Dall'editor SQL di Supabase:

```sql
select * from private.calcom_prove();
```

Restituisce venti righe con PASSA o FALLISCE. Al 30 luglio 2026: **20 su 20**.

Coprono: il ciclo di vita completo, i due spostamenti contati sul contatore giusto, la data originaria che non si sovrascrive, la cancellazione che non cancella la riga, **lo stesso slug su due account diversi che dà due designer diversi**, il messaggio ripetuto, lo spostamento con codice precedente inesistente, l'account sconosciuto, l'event type non nostro, l'approfondita riconosciuta come servizio a sé, il fuso di Tokyo, l'identità vera agganciata, l'identità inventata che non fa perdere la prenotazione, la cancellazione di una pagata, la cancellazione del designer riconosciuta, l'evento non gestito, nessun messaggio senza esito, e il prezzo che resta quello del momento della prenotazione.

Per rigiocare solo i messaggi veri:

```sql
select * from private.calcom_rigioca(true);   -- true azzera e riparte da zero
```

## 7.2 La prova a mano, cinque minuti

1. Aprire il link pubblico di un account e prenotare uno slot.
2. Su Supabase Studio, tabella `consultations`: la riga deve comparire con stato `prenotata_attesa_pagamento`, prezzo corretto, scadenza a 30 minuti.
3. Sul calendario `XPETIS · Consulenze`: l'evento deve comparire con `IN ATTESA` nel titolo.
4. Dalla mail di Cal.com, riprogrammare. **Controllare che `id` sia lo stesso** e che l'orario sia quello nuovo. L'evento in calendario si sposta, non si sdoppia.
5. Cancellare. La riga passa a `cancellata_non_pagata` e **resta**. L'evento sparisce dal calendario.

**Se compaiono tre righe invece di una, il ponte non funziona.** È l'errore che questo pezzo esiste per evitare.

## 7.3 Come si legge un problema

Il diario dice tutto. Per vedere gli ultimi messaggi e cosa ne è stato fatto:

```sql
select id, event_type, outcome, note,
       payload->'payload'->'organizer'->>'username' as account,
       payload->'payload'->>'type' as event_type_slug,
       received_at at time zone 'Europe/Rome' as ricevuto
from consultation_events
order by id desc limit 20;
```

Per vedere come il traduttore legge un messaggio:

```sql
select jsonb_pretty(private.calcom_leggi(payload))
from consultation_events where id = <numero>;
```

| Sintomo | Causa quasi certa |
|---|---|
| Il diario resta vuoto | il webhook su Cal.com non è configurato, o l'URL è sbagliato, o il workflow non è pubblicato |
| Tutti i messaggi rifiutati per firma | la parola segreta su Cal.com e quella su Supabase non coincidono |
| `outcome = scartata_account_ignoto` | `cal_username` mancante o diverso sull'account di quel designer |
| `outcome = scartata_event_type_ignoto` | `cal_event_slug` mancante o diverso da quello vero. Verificare l'URL dell'event type |
| `outcome = scartata_riga_non_trovata` su uno spostamento | la prenotazione originale non è mai arrivata (webhook aggiunto dopo?) |
| Due eventi sul calendario per la stessa call | `admin_event_id` non è stato salvato: guardare il nodo `Segna il codice evento` |
| Nota "identita XPETIS dichiarata ma inesistente" | il codice passato nell'indirizzo non corrisponde a nessun profilo |

E su n8n, la scheda **Executions** del workflow mostra ogni singolo passaggio con i dati che ci sono transitati.

---

# Parte 8 · Cosa NON fa questo pezzo

Per non cercare cose che non ci sono:

- **Nessuna mail parte da XPETIS.** Non la conferma, non lo slot liberato, non il reminder. È la sessione 8. Attenzione: le mail **di Cal.com** partono eccome, vedi Parte 9.
- **Nessun pagamento.** Stripe è la sessione 7. Le righe restano in `prenotata_attesa_pagamento` per sempre, perché nessuno le fa avanzare.
- **Nessuna cancellazione automatica degli insoluti.** Sessione 7. Uno slot non pagato resta occupato.
- **Nessun sito, nessun embed, nessun login.** Sessioni 5 e 6. Oggi si prenota dal link pubblico di Cal.com.
- **Nessun allarme al team.** I contatori salgono ma nessuno li guarda. Sessione 8.
- **Il ponte non chiama mai Cal.com**, riceve soltanto. Cancellare uno slot da XPETIS è la sessione 7.

---

# Parte 9 · Problemi noti e aperti

## 9.1 Le mail native di Cal.com

Cal.com manda le sue conferme nell'istante in cui la prenotazione nasce, cioè quando per XPETIS quella riga è ancora **in attesa di pagamento e ha 30 minuti di vita**. I due messaggi si contraddicono.

In sandbox non fa danno, perché arrivano solo agli indirizzi di prova. **Prima del lancio va risolto** in un modo dei due: un piano Cal.com a pagamento che permette di spegnerle, oppure riscrivere i testi XPETIS perché convivano.

## 9.2 Il tasto "richiedi riprogrammazione" del designer

Esiste dentro l'interfaccia di Cal.com, dal lato designer (dalla mail non compare). **Non è stato provato cosa genera.** Il sospetto è che cancelli la prenotazione e chieda al viaggiatore di riprenotarne un'altra: in quel caso il ponte vedrebbe una cancellazione e poi una prenotazione nuova senza legame con la vecchia, quindi riga nuova, prezzo nuovo, nuovo conto alla rovescia, e quella pagata cancellata.

**Da provare prima della sessione 7, perché è money-path.**

## 9.3 Il designer può cancellare

Il Flusso dice che il designer non può cancellare una consulenza pagata, può solo riprogrammare. **Cal.com non lo impedisce.** È una regola osservata, non imposta.

Ora però la si riconosce con certezza (`cancelledBy` confrontato con `organizer.email`) e il diario scrive già un avviso. Diventerà una notifica al team nella sessione 8.

## 9.4 L'API di cancellazione di Cal.com

Il workflow insoluti della sessione 7 deve poter cancellare una prenotazione su Cal.com per liberare lo slot. **Non è stato verificato se serva una chiave per ogni account designer.** Se sì, in produzione significa raccogliere 25 chiavi in onboarding, cosa che oggi nella checklist non c'è.

## 9.5 Il divario sandbox-produzione, per questo pezzo

- **Migrazione di n8n** dall'istanza personale a una XPETIS: significa rifare le credenziali e riconfigurare l'indirizzo del webhook su 25 account Cal.com.
- **25 account Cal.com** con username uguale allo slug della vetrina, event type con URL identico, campo nascosto, webhook con la stessa parola segreta.
- **Eventuali 25 chiavi API** Cal.com, se serve la cancellazione (9.4).
- **Cancellare gli event type di default** `15min` e `30min` su ogni account.
- Un **calendario del team** di produzione, con il suo ID a database.

---

# Parte 10 · L'elenco delle migration

Le migration di questo pezzo, in ordine, sul progetto `qgsxziomobfodxmiququ`. Sono tutte tracciate: si rileggono con `list_migrations` o dalla scheda Database → Migrations di Supabase Studio.

| # | Nome | Cosa fa |
|---|---|---|
| 01 | `calcom_01_designer_di_prova` | rinomina i quattro designer finti, azzera i `cal_username` inventati |
| 02 | `calcom_02_colonne_stati_diario` | colonne della cancellazione, nono stato, impronta e esito nel diario |
| 03 | `calcom_03_username_veri` | gli username Cal.com veri |
| 04 | `calcom_04_slug_approfondita_vero` | lo slug vero dell'approfondita |
| 05 | `calcom_05_slug_veri_letti_da_calcom` | gli slug veri, verificati uno per uno |
| 06 | `calcom_06_approfondita_ale2` | crea la riga di servizio dell'approfondita |
| 07 | `calcom_07_cervello_leggi` | il traduttore, scritto sui messaggi veri |
| 08 | `calcom_08_cervello_diario_e_applica` | diario e cervello |
| 09 | `calcom_09_identita_inesistente_non_perde_la_prenotazione` | l'identità si aggancia solo se esiste |
| 10 | `calcom_10_cervello_usa_identita_verificata` | il cervello usa quella regola |
| 11 | `calcom_11_messaggi_veri_come_materiale_di_prova` | i sette messaggi veri conservati |
| 12 | `calcom_12_rigioca_materiale_di_prova` | la funzione che li rigioca |
| 13 | `calcom_13_suite_di_prove` | le venti prove |
| 14 | `calcom_14_verifica_firma_dentro_supabase` | la firma, e la tabella dei parametri riservati |
| 15 | `calcom_15_porta_unica_del_ponte` | la porta unica |
| 16 | `calcom_16_chiudo_le_porte_di_servizio` | **chiude il buco di sicurezza**, vedi sotto |
| 17 | `calcom_17_prove_e_rigioca_su_funzioni_private` | allinea le funzioni di prova |
| 18 | `calcom_18_istruzioni_per_il_calendario_del_team` | le istruzioni per il calendario |
| 19 | `calcom_19_nome_e_mail_di_chi_prenota` | `attendee_name` e `attendee_email` |
| 20 | `calcom_20_cervello_salva_ospite_e_titolo_pulito` | il cervello li salva |
| 21 | `calcom_21_calendario_id_nelle_istruzioni` | l'ID del calendario viaggia nell'istruzione |

## La migration 16 merita un paragrafo, perché l'errore è facile da rifare

Le funzioni del ponte erano state create nello schema `public` con `revoke ... from anon, authenticated`. **Non basta.** In Postgres il permesso di eseguire una funzione è concesso di default a `PUBLIC`, cioè a tutti, e `anon` e `authenticated` lo ereditano da lì: togliendolo solo a loro non si toglie niente.

La conseguenza era grave: la chiave pubblica del sito sta nel browser di chiunque, e con quella si potevano chiamare `calcom_diario` e `calcom_applica`, che **non** controllano la firma, e far comparire prenotazioni finte. Era esattamente l'attacco che la firma doveva impedire, entrato dalla porta di servizio.

Chiuso così: le due funzioni interne sono state spostate nello schema `private`, dove non esistono nemmeno come indirizzo raggiungibile dall'API; resta raggiungibile solo `calcom_webhook`, che la firma la controlla, e con il permesso concesso **solo a `service_role`**.

**Verificato dall'esterno:** con la chiave pubblica le tre funzioni del ponte rispondono 404, mentre `search_destinations` e `match_designers`, che devono essere pubbliche, rispondono 200.

Regola generale da portarsi dietro: **dopo ogni funzione nuova nello schema `public`, far girare il controllo di sicurezza di Supabase** (Advisors → Security) e leggere cosa dice.

---

# Parte 11 · I principi, in breve

Se di questo documento si deve ricordare solo una pagina, questa.

1. **L'identità di una consulenza è la chiave primaria della riga, non il codice di Cal.com.** Il codice avanza, la riga resta.
2. **Prima si ascolta, poi si costruisce.** I campi veri di un servizio esterno si guardano, non si immaginano. Tre campi su quattro non stavano dove sembrava.
3. **Il diario si scrive prima di capire, e sopravvive agli errori.** È ciò che permette di diagnosticare in minuti invece che in ore.
4. **La logica sta nel database, l'orchestratore fa il portiere.** Si prova in SQL in dieci secondi, e se si cambia orchestratore non si riscrive niente.
5. **Un solo posto sa com'è fatto il messaggio esterno.** Se il fornitore cambia formato, si riscrive una funzione.
6. **Il ponte nasce chiuso.** Senza firma valida un messaggio non entra nemmeno nel diario.
7. **Una comodità non può rompere il percorso principale.** Il calendario può fallire, la prenotazione no.
8. **Un dato che arriva da fuori non deve mai poter far perdere un dato nostro.** Un'identità inventata nell'indirizzo non cancella una prenotazione.
9. **Il prezzo si congela quando si prenota.** Come uno scontrino.
10. **Chi ha agito si registra sempre.** E se non si sa, si scrive "non dichiarato" invece di indovinare: un contatore vuoto è più onesto di uno sbagliato.

---

*Documento operativo, 30 luglio 2026. Il ragionamento che ha portato a queste scelte, con i verdetti dei revisori e le decisioni del committente, sta in `Sessioni/SESSIONE_04_ponte-calcom.md`. Le decisioni di progetto stanno nel Registro in fondo a `PIANO_XPETIS.md`.*
