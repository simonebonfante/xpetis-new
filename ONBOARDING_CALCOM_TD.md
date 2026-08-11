# Onboarding Cal.com · guida per i 25 Travel Designer

**8 agosto 2026.** Da rifare identica per ogni designer. Circa 15 minuti a testa
in condivisione schermo — quindi 6-7 ore in tutto per venticinque persone.

Tutte le impostazioni qui dentro sono state **provate sul campo**, non lette
nella documentazione: l'account modello è stato costruito e ha già consegnato un
messaggio vero. I campi del messaggio stanno in `supabase/MAPPATURA_CALCOM.md`.

---

## Prima di cominciare

Tieni davanti tre cose per ogni designer:

| Cosa | Dove si trova | A cosa serve |
|---|---|---|
| **Slug della vetrina** | `travel_designers.slug` su Supabase | diventa lo username di Cal.com |
| **Email del designer** | `travel_designers.email` | è l'indirizzo dell'account |
| **La parola segreta del webhook** | password manager, **una sola per tutti** | firma i messaggi verso di noi |

E una cosa da dire al designer prima di iniziare: **se si registra con Google, il
suo calendario Google si collega da solo.** Non è un problema — anzi, vedrà le
consulenze nel proprio calendario — ma è giusto che lo sappia prima, non dopo.

---

## 1. L'account

1. `https://cal.com` → registrazione. **Piano gratuito**, è sufficiente.
2. Cal.com assegna uno username con una sigla casuale attaccata, tipo
   `mario-rossi-s68gyf`. **Va cambiato** dalle impostazioni del profilo.
3. Lo username deve essere **esattamente lo slug della vetrina** più il suffisso
   concordato — per esempio `marco-rossi-xpetis`.

> **Perché conta.** Lo username è la chiave con cui riconosciamo di chi è la
> prenotazione, perché tutti e venticinque avranno lo stesso event type. Se non
> combacia con `cal_username` sul database, le prenotazioni di quel designer
> arrivano e non si agganciano a nessuno.

4. **Disponibilità** → fasce settimanali. Ferie e giorni chiusi si mettono come
   eccezioni di data. Questa parte la compila il designer: è sua.

---

## 2. L'event type della consulenza

Crea un event type nuovo. **Non riusare** quello da 30 minuti che Cal.com genera
da solo: ha già un URL suo e si finisce per litigarci.

### Impostazione evento

| Campo | Valore |
|---|---|
| Titolo | `Consulenza XPETIS · 30 min` |
| **URL** | `consulenza-xpetis-30` |
| Durata | 30 minuti |
| Luogo | **Cal Video** |

> ⚠️ **L'errore più facile di tutta la procedura.** In Cal.com titolo e URL sono
> due campi separati, e Cal.com genera l'URL dal titolo in modo imprevedibile: lo
> stesso identico titolo ha prodotto `consulenza-xpetis-30` su un account e
> `consulenza-xpetis-30-min` su un altro. **Scrivi l'URL a mano e controllalo
> prima di salvare.** Se non è identico su tutti e venticinque, i link delle
> vetrine non si possono più costruire a tavolino e ogni designer diventa un caso
> particolare.

> **Perché Cal Video e non Google Meet.** Meet richiederebbe al designer di
> collegare il proprio Google Calendar: una dipendenza in più, per venticinque
> persone, in cambio di niente. Cal Video è integrato e funziona subito.

### Limiti e buffer

| Campo | Valore | Perché |
|---|---|---|
| Buffer dopo l'evento | **10 minuti** | il designer non finisce una call e ne comincia un'altra nello stesso istante |
| Preavviso minimo | **12 ore** | regola del Flusso |
| Prenotabile nei prossimi | **30 giorni** | orizzonte previsto dal Flusso |

### Cancellazione e riprogrammazione

Queste tre impostazioni sono la scoperta dell'8 agosto, e valgono più di quanto
sembri: spostano una regola del Flusso da "qualcuno la può violare e poi qualcun
altro deve rincorrerla" a "non si può fare".

| Impostazione | Valore |
|---|---|
| **Disable rescheduling** | **attivo** → *when less than* **`720`** *minutes before meeting* → scope **host and attendee** |
| **Disable cancelling** | **spento** |
| **Require cancellation reason** | **mandatory for host only** |

> **720 minuti sono 12 ore**, cioè esattamente la regola del Flusso: *sotto le 12
> ore non si modifica più nulla, la call si fa*. Con questa impostazione Cal.com
> rifiuta da sé, e il caso smette di esistere.
>
> **La cancellazione resta possibile**, e deve restarlo: il viaggiatore ha
> diritto al rimborso pieno fino a 24 ore prima. Gli unici scope disponibili
> sarebbero *host and attendee* o *attendee only*, e il secondo toglierebbe al
> viaggiatore proprio quel diritto.
>
> **Il motivo obbligatorio solo per il designer**, invece, serve al team: quando
> cancella lui siamo sempre in un caso eccezionale da arbitrare, e l'alert arriva
> con scritto perché. Al viaggiatore non si chiede niente: la regola di rimborso
> guarda solo quanto manca alla call.

### Il campo nascosto

**Esperienza di prenotazione → Modulo di prenotazione → Aggiungi domanda:**

| Campo | Valore |
|---|---|
| Tipo | testo breve |
| Etichetta | `Codice XPETIS (non modificare)` |
| **Identificatore** | `xpetis_user_id` |
| Disabilita input se precompilato da URL | **spuntato** |
| Obbligatorio | **no** |
| Nascosto | **sì** |

> **È il pezzo più delicato del meccanismo.** La prenotazione avviene dentro
> Cal.com, che non sa chi sia l'utente per XPETIS. Il nostro sito, aprendo il
> calendario, passa nell'indirizzo l'identificativo dell'utente collegato:
>
> ```
> https://cal.com/<username>/consulenza-xpetis-30?xpetis_user_id=<uuid>
> ```
>
> Cal.com lo precompila, lo blocca, e ce lo restituisce nel messaggio. Senza
> questo campo ogni prenotazione arriverebbe orfana e dovremmo indovinare di chi
> è confrontando indirizzi email — che è fragile e sbaglia.
>
> **L'identificatore deve essere scritto `xpetis_user_id` esatto**, minuscolo,
> con i trattini bassi. È il nome con cui lo leggiamo nel messaggio.

---

## 3. La consulenza approfondita (solo per chi la offre)

Identica alla precedente, con tre differenze:

| Campo | Valore |
|---|---|
| Titolo | `Consulenza XPETIS Approfondita 60 min` |
| **URL** | `consulenza-xpetis-approfondita-60-min` |
| Durata | 60 minuti |

Buffer, preavviso, orizzonte, le tre impostazioni di cancellazione e il campo
nascosto: **tutto uguale**.

Oggi la offre un designer solo. Se non è nella lista di chi l'ha attivata, salta
questo passo.

---

## 4. Il webhook

**Impostazioni → Sviluppatore → Webhooks → nuovo.**

| Campo | Valore |
|---|---|
| URL | `https://n8n-production-d576.up.railway.app/webhook/calcom-consulenze` |
| Eventi | **solo** `Booking Created`, `Booking Rescheduled`, `Booking Cancelled` |
| Secret | la parola segreta, **identica su tutti i 25 account** |
| Attivo | sì |

> Spuntare solo i tre eventi non è pignoleria: gli altri sono rumore che poi
> qualcuno deve filtrare, e ogni messaggio inutile è un'esecuzione in più.
>
> Se la parola segreta non combacia con quella che abbiamo salvato, il ponte
> **rifiuta tutti i messaggi di quel designer** — ed è il comportamento giusto,
> ma si manifesta come "le prenotazioni di Mario non arrivano" e ci si mette un
> po' a capire perché. Copiala, non riscriverla a mano.

---

## 5. Pulizia

Cal.com crea da solo gli event type `15 min meeting`, `30 min meeting` e
`Secret meeting`. **Restano prenotabili da chiunque conosca il link.** Il ponte
li scarta perché non sono censiti a database, quindi non fanno danno tecnico, ma
un viaggiatore che ci finisce sopra prenota una call che per noi non esiste.

Spegnili o cancellali.

---

## 6. Scrivere a database

Sul profilo del designer, in Supabase:

| Colonna | Valore |
|---|---|
| `cal_username` | lo username scelto al punto 1 |
| `cal_webhook_ok_at` | data e ora di adesso |

La seconda serve alla checklist di pubblicazione: un designer senza account
Cal.com collegato **non si può pubblicare**, e il database lo impedisce.

---

## 7. La verifica, prima di chiudere la sessione

Non fidarti della configurazione: falla parlare. Cinque minuti.

1. Apri
   `https://cal.com/<username>/consulenza-xpetis-30?xpetis_user_id=00000000-0000-0000-0000-000000000000`
2. Controlla che il campo **Codice XPETIS** sia visibile in pagina come
   precompilato e **non modificabile**.
3. Controlla che **non ci siano slot prima di 12 ore da adesso**.
4. Prenota uno slot qualsiasi.
5. Su n8n → Executions: deve essere arrivato un messaggio con
   `organizer.username` uguale allo username di quel designer.
6. Cancella la prenotazione di prova.

Se il punto 5 non arriva, nell'ordine: il workflow n8n è attivo? l'URL del
webhook è scritto giusto? gli eventi sono spuntati?

---

## Checklist rapida, una riga per designer

```
[ ] username = slug vetrina
[ ] disponibilità impostata dal designer
[ ] event type: titolo, URL scritto a mano, 30 min, Cal Video
[ ] buffer 10 min dopo · preavviso 12 ore · orizzonte 30 giorni
[ ] disable rescheduling: attivo, 720 minuti, host and attendee
[ ] disable cancelling: spento
[ ] require cancellation reason: solo host
[ ] campo nascosto xpetis_user_id
[ ] consulenza approfondita (se prevista per questo designer)
[ ] webhook verso n8n, 3 eventi, secret condiviso
[ ] event type di fabbrica spenti
[ ] cal_username e cal_webhook_ok_at scritti su Supabase
[ ] prenotazione di prova arrivata su n8n, poi cancellata
```

---

## Da dire al designer, a voce

- **Usa sempre *Reschedule*, mai *Request reschedule*.** Il secondo, in Cal.com,
  non è una richiesta di spostamento: è una **cancellazione secca**. Su una call
  già pagata lascerebbe il viaggiatore senza call e senza soldi finché non
  interviene qualcuno. Il sistema riconosce il caso e avvisa il team, ma è un
  guaio evitabile.
- **Sotto le 12 ore non si sposta più niente**: lo impedisce il calendario, non è
  una scortesia.
- **Le mail di Cal.com arrivano oltre alle nostre.** È previsto. La conferma che
  conta per XPETIS è la nostra, che arriva dopo il pagamento.
- **In call si aspetta almeno 15 minuti** prima di considerare il viaggiatore
  assente.
