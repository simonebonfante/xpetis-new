# Mappatura · messaggi Cal.com → schema Supabase

**8 agosto 2026, aggiornata il 24.** Ricavata da messaggi **veri**, raccolti con
prenotazioni di prova sulla nostra istanza n8n. Le fixture stanno in
`tests/fixtures/calcom/`: creazione, due riprogrammazioni consecutive,
cancellazione, e il tasto *Request reschedule*.

Vale la regola che ha già fatto risparmiare tempo una volta: **prima si ascolta
un messaggio vero, poi si scrive il codice.** La documentazione di un prodotto
di terzi non è un contratto.

Versione del formato dichiarata da Cal.com: `x-cal-webhook-version: 2021-10-20`.
Se un giorno cambia, la fixture è il modo per accorgersene.

---

## I campi che ci servono, e dove stanno davvero

| Cosa ci serve | Dove sta | Nota |
|---|---|---|
| Tipo di evento | `body.triggerEvent` | `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`. **Alla radice del corpo, non dentro `payload`** |
| Quale designer | `payload.organizer.username` | Combacia con `travel_designers.cal_username` |
| Quale servizio | **`payload.type`** | ⚠️ **Non** `eventType.slug`, che non esiste. Vale `consulenza-xpetis-30` |
| Quale viaggiatore | `payload.responses.xpetis_user_id.value` | L'UUID che il sito precompila nell'indirizzo. Presente anche in `userFieldsResponses` |
| Codice prenotazione | `payload.uid` | Va in `bookings.cal_booking_uid`. **Non** `payload.bookingId`, che è l'id numerico interno |
| Inizio e fine | `payload.startTime` / `endTime` | ISO 8601 in UTC |
| Link video | `payload.metadata.videoCallUrl` | Uguale a `payload.videoCallData.url` |
| Nome e mail del viaggiatore | `payload.attendees[0]` | Ha anche `firstName`/`lastName` separati |
| Motivo della cancellazione | `payload.cancellationReason` | Nullo alla creazione. È il campo su cui si riconosce il *Request reschedule* |
| Firma | header `x-cal-signature-256` | HMAC con la parola segreta configurata sull'account |

**La chiave doppia.** Un designer si identifica con `organizer.username` **più**
`payload.type`, mai con lo slug da solo: i 25 designer copiano lo stesso event
type modello, quindi `consulenza-xpetis-30` è identico su tutti e da solo non
distingue nessuno.

**Verificato il 24 agosto: tutti i campi di identità sopravvivono a ogni tipo di
evento.** `organizer.username`, `payload.type` e soprattutto
`responses.xpetis_user_id.value` ci sono anche dopo due riprogrammazioni e in
entrambe le cancellazioni. Il legame col viaggiatore non si perde per strada.

---

## Riprogrammare crea una prenotazione NUOVA

È la scoperta che cambia il disegno del ponte, e nessuna documentazione la
diceva.

Cal.com **non aggiorna** la prenotazione esistente: ne crea un'altra, con un
`uid` nuovo, e mette il vecchio in `rescheduleUid`. La catena, misurata su due
riprogrammazioni consecutive:

| Messaggio | `uid` (nuovo) | `rescheduleUid` (vecchio) | `startTime` | `rescheduleStartTime` |
|---|---|---|---|---|
| 1ª riprogrammazione | `ovsVi7ia…` | `ideSbZgh…` | 14 set | 11 set |
| 2ª riprogrammazione | `hXBtFar1…` | `ovsVi7ia…` | 18 set | 14 set |
| cancellazione | `hXBtFar1…` | — | 18 set | — |

**Conseguenza per il ponte.** Su `BOOKING_RESCHEDULED` la riga da aggiornare
**non si trova con `uid`**, che è nuovo e sconosciuto: si trova con
`rescheduleUid`. E poi va **sostituito** `bookings.cal_booking_uid` con quello
nuovo, altrimenti la cancellazione successiva — che arriva col nuovo uid — non
trova più niente.

`original_starts_at` invece non si tocca mai: è l'ancora da cui si contano i 20
giorni della regola sulle riprogrammazioni, e nella tabella qui sopra si vede
perché serve un campo separato.

`rescheduleStartTime` porta l'orario vecchio, ed è utile per la storia.

## Chi ha riprogrammato, e chi ha cancellato

Cal.com **lo dice**, con due campi che portano un indirizzo email:

- `rescheduledBy` sui messaggi di riprogrammazione
- `cancelledBy` sui messaggi di cancellazione

La regola è quindi: **confrontare con `organizer.email`**. Se coincide ha agito
il designer, altrimenti il viaggiatore. È così che si tengono separati i due
contatori del Flusso, cinque per il viaggiatore e due per il designer.

✅ **Verificato il 24 agosto con due indirizzi diversi.** Una prenotazione presa
da `simone.bonfante@elty.it` su un calendario il cui organizzatore è
`simone.bonfante93@gmail.com`, poi riprogrammata e cancellata **dai link nelle
mail del partecipante**:

| Azione | `organizer.email` | Campo | Valore |
|---|---|---|---|
| Riprogrammazione | `…93@gmail.com` | `rescheduledBy` | **`…@elty.it`** |
| Cancellazione | `…93@gmail.com` | `cancelledBy` | **`…@elty.it`** |

Entrambi i campi **seguono chi agisce**, non l'organizzatore. L'attribuzione è
quindi affidabile, e i due contatori si possono tenere separati.

Le prime prove non lo dimostravano perché sull'account di prova organizzatore e
partecipante erano la stessa persona con la stessa email: i valori coincidevano
per caso, non per costruzione. È il motivo per cui è servita una seconda
casella.

## Il tasto *Request reschedule*, visto davvero

Confermato: **è una cancellazione**, non una richiesta. Nessun
`rescheduleUid`, nessuna prenotazione nuova, `status: CANCELLED`.

Si riconosce dal motivo, che Cal.com precede col prefisso esatto:

```
"cancellationReason": "Please reschedule. text rescheduling\n"
```

Il prefisso `Please reschedule.` è verificato carattere per carattere, e da solo
basta a distinguerlo da una cancellazione normale — che nel nostro campione
portava un motivo scritto a mano senza prefissi.

Il secondo segno regge: `cancelledBy` uguale a `organizer.email`. Ora sappiamo
che quel campo segue davvero chi agisce, quindi la coppia *prefisso + cancellato
dall'organizzatore* distingue il caso senza ambiguità. Serve tutta e due, perché
un viaggiatore potrebbe scrivere a mano un motivo che comincia per "Please
reschedule." — improbabile, ma non impossibile, e la conseguenza sarebbe un
rimborso automatico non dovuto.

## La firma, e perché le fixture la dimostrano

**Cal.com firma il JSON compatto.** Nessuno spazio dopo le virgole e i due
punti, i caratteri non-ASCII lasciati come sono. È stato verificato il 6
settembre 2026 ricalcolando l'HMAC-SHA256 delle fixture con la parola segreta
vera: **sei firme su sette combaciano**.

Non è una curiosità. Vuol dire che `JSON.stringify` di un oggetto appena parsato
riproduce **i byte esatti** che Cal.com ha firmato, e quindi che le firme
registrate nelle fixture sono *verificabili* e non solo ricalcolabili: l'harness
le passa alla funzione di verifica vera e controlla che dica sì. Una prova di
firma costruita su una firma che ci siamo calcolati da soli non prova niente —
verifica il codice contro se stesso.

La settima è `booking_created.json`, e si sa perché: la password del video (un
JWT) era stata sostituita prima di salvare la fixture, quindi quel corpo non è
più quello che era stato firmato. Lo dice il suo `_nota`.

**Conseguenza per il ponte.** La firma si calcola sui byte, non sul contenuto:
il nodo Webhook di n8n deve consegnare il corpo **grezzo**. Un JSON parsato e
riserializzato da n8n darebbe una firma diversa anche a contenuto identico —
l'ordine delle chiavi, gli spazi e il formato dei numeri non sopravvivono al
giro. È il punto in cui questi ponti falliscono, e falliscono male: sembra un
problema di segreti sbagliati.

## Campi che ignoriamo, e perché

- `payload.price` e `payload.currency` (`0` e `"usd"`): sono i campi di pagamento
  **di Cal.com**, che non usiamo. Il prezzo vive solo nel nostro database.
- `payload.bookingId`: id numerico interno di Cal.com. Il codice che conta è `uid`.
- `payload.videoCallData.password`: un JWT. Non serve a niente e non va conservato
  in chiaro dove qualcuno possa leggerlo.

---

## Due scoperte dal messaggio vero

### 1. Il link video contiene il codice della prenotazione

```
https://app.cal.com/video/mMZAwLvZ759AUffL61hj66
                          ^^^^^^^^^^^^^^^^^^^^^^ = payload.uid
```

E per cancellare una prenotazione su Cal.com **basta quel codice, senza nessuna
credenziale** (verifica S-05). Quindi il codice di cancellazione è dentro il link
video, che dobbiamo per forza mandare al viaggiatore e al designer, e che finisce
anche nell'invito del calendario di chiunque sia in copia.

**Conseguenza operativa, e non è una sfumatura:** non esiste modo di rendere
segreto quel codice. Le regole di rimborso — rimborso pieno fino a 24 ore prima,
niente sotto — **non si possono difendere controllando chi ha il link**. Si
applicano da n8n sul webhook `BOOKING_CANCELLED`, guardando quanto manca alla
call. È la stessa conclusione a cui eravamo arrivati per le mail native di
Cal.com, per un'altra strada.

Resta comunque valido non far uscire `cal_booking_uid` dalle nostre viste
(migration 0019): una cosa è che il codice sia in un link che la persona ha
ricevuto, un'altra è servirlo su un endpoint pubblico.

### 2. Cal.com ha opzioni per bloccare cancellazione e riprogrammazione

Nel messaggio compaiono quattro campi che la guida non nominava:

```json
"disableRescheduling": false,
"disableReschedulingScope": "HOST_AND_ATTENDEE",
"disableCancelling": false,
"disableCancellingScope": "HOST_AND_ATTENDEE"
```

L'esistenza di uno *scope* faceva sperare di poter limitare il divieto al solo
organizzatore, e imporre alla fonte la regola **"il TD non può mai cancellare una
consulenza pagata"**.

**Verificato l'8 agosto.** Gli interruttori ci sono, ma gli scope disponibili
sono `host and attendee` e `attendee only`: **non esiste "solo host"**. Il
divieto di cancellare al solo designer, che è la regola del Flusso, non si può
imporre da qui.

In compenso la riprogrammazione ha anche una condizione di tempo, e quella vale
oro.

### Impostazioni adottate sull'event type modello

| Impostazione | Valore | Perché |
|---|---|---|
| **Disable rescheduling** | attivo, *when less than 720 minutes before meeting*, scope *host and attendee* | 720 minuti = 12 ore, cioè **esattamente** la regola del Flusso "sotto le 12 ore non si modifica più nulla". Da regola osservata diventa **regola imposta**: Cal.com rifiuta, il caso smette di esistere |
| **Disable cancelling** | **spento** | Il Flusso dà al viaggiatore il diritto di cancellare con rimborso pieno fino a 24 ore prima. `attendee only` glielo toglierebbe, `host and attendee` lo toglierebbe a tutti. Nessuno dei due scope serve |
| **Require cancellation reason** | *mandatory for host only* | Quando cancella il designer siamo sempre in un caso eccezionale da arbitrare: il motivo scritto trasforma l'alert da "il designer ha cancellato" a "il designer ha cancellato perché…". Al viaggiatore non si chiede: la regola di rimborso guarda solo quanto manca alla call, e chiedere spiegazioni a chi annulla trenta ore prima è attrito inutile |

### Dove passa il confine, adesso

| Regola del Flusso | Chi la impone |
|---|---|
| Non si prenota sotto le 12 ore | **Cal.com** |
| Non si riprogramma sotto le 12 ore | **Cal.com** |
| Massimo 5 riprogrammazioni del viaggiatore | n8n |
| Massimo 2 riprogrammazioni del designer | n8n |
| Nuova data entro 20 giorni dall'originaria | n8n |
| Cancellazione sotto le 24 ore che pretende il rimborso | n8n |
| Il designer non può cancellare una call pagata | n8n |

---

## Cose che il messaggio ci ha detto sull'onboarding

**Google Calendar si collega da solo.** Nel messaggio: `appsStatus` riporta
`google_calendar: success` e `destinationCalendar` punta al calendario personale
di chi ha creato l'account. Succede perché ci si è registrati con Google.

Non è un problema — anzi, il designer vede la call nel proprio calendario, che è
comodo — ma va detto in onboarding, perché è un collegamento che avviene senza
che nessuno lo chieda. E non contraddice la scelta di Cal Video: quella serviva a
non **richiedere** Google Calendar, non a impedirlo.
