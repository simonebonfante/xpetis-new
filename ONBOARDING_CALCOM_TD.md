# Onboarding Cal.com · guida per i 25 Travel Designer

**8 agosto 2026, riscritta il 27 settembre 2026 sugli event type.** Da rifare
identica per ogni designer. Circa 15 minuti a testa in condivisione schermo —
quindi 6-7 ore in tutto per venticinque persone.

> ⚠️ **Il 27 settembre la regola degli event type è cambiata, per la terza e
> ultima volta** (deviazione 10 in `PIANO.md`). Fino a quel giorno questa guida
> diceva: *un* event type di consulenza, da 30 **oppure** da 60 secondo la
> lista. Adesso: la **consulenza breve da 30 la crea chiunque**, e chi offre
> l'**approfondita** ne crea una seconda da 60 **oppure** da 90. Tre designer
> sono stati onboardati con la regola vecchia: cosa ricontrollare su di loro è
> nella sezione **8**, in fondo.

Tutte le impostazioni qui dentro sono state **provate sul campo**, non lette
nella documentazione: l'account modello è stato costruito e ha già consegnato un
messaggio vero. I campi del messaggio stanno in `supabase/MAPPATURA_CALCOM.md`.

---

## Prima di cominciare

Tieni davanti tre cose per ogni designer:

| Cosa | Dove si trova | A cosa serve |
|---|---|---|
| **Slug della vetrina** | la lista condivisa, poi `travel_designers.slug` | diventa lo username di Cal.com |
| **Email del designer** | `travel_designers.email` | è l'indirizzo dell'account |
| **Consulenza approfondita: sì o no, e da quanto** | la lista condivisa | decide se creare il secondo event type, da 60 o da 90 |
| **La parola segreta del webhook** | password manager, **una sola per tutti** | firma i messaggi verso di noi |

E una cosa da dire al designer prima di iniziare: **se si registra con Google, il
suo calendario Google si collega da solo.** Non è un problema — anzi, vedrà le
consulenze nel proprio calendario — ma è giusto che lo sappia prima, non dopo.

---

## 0. Come si calcolano slug e username

**Si decidono prima di creare l'account, e si scrivono nella lista condivisa.**
Il form della vetrina non produce lo slug: lo sceglie il team. Se lo inventa chi
fa l'onboarding e poi l'import ne scrive un altro, il ponte risponde
`designer_sconosciuto` e le prenotazioni di quella persona non si agganciano a
nessuno.

### La regola

**Slug = `nome-cognome`**, tutto minuscolo, solo caratteri ASCII, spazi in
trattino singolo, apostrofi e punti eliminati.

**Username Cal.com = slug + `-xpetis`.**

| Nome in vetrina | Slug | Username Cal.com |
|---|---|---|
| Marco Rossi | `marco-rossi` | `marco-rossi-xpetis` |
| Frenky Morelli | `frenky-morelli` | `frenky-morelli-xpetis` |
| Niccolò D'Amico | `niccolo-damico` | `niccolo-damico-xpetis` |

### Le quattro regole, in ordine di quanto costa sbagliarle

**1. Lo slug non si cambia mai.** È l'indirizzo pubblico della vetrina
(`/designer/frenky-morelli`) e diventerà il link di attribuzione personale del
designer. Chi cambia cognome **tiene il suo slug**: è il tipo di cosa che sei
mesi dopo si "sistema" volentieri, rompendo ogni link già in circolazione.

**2. Si usa il nome che andrà in vetrina, non quello dei documenti.** Se si fa
chiamare Frenky, lo slug è `frenky-morelli`; se in vetrina sarà Francesco, è
`francesco-morelli`. **Chiediglielo prima di creare l'account**, non dopo.

**3. Omonimi: si numera.** Il secondo Marco Rossi è `marco-rossi-2`. Non
l'iniziale del secondo nome — sembra un refuso — e non la città, perché la gente
si trasferisce. Un numero è brutto e stabile.

**4. Accenti e lettere strane: si tolgono a mano, e una volta sola.**
`Niccolò` → `niccolo`, `Müller` → `muller`, `Kowalczyk-Łódź` → `kowalczyk-lodz`.
⚠️ Non calcolarlo con uno strumento automatico e non farlo due volte in due
posti diversi: **browser e database normalizzano gli accenti in modo diverso**, e
su lettere come `ø`, `ł`, `ş` danno risultati diversi. Ci è già successo con i
nomi delle città. Si decide con la testa, si scrive in lista, e quella è la
verità.

### L'eccezione, quando lo username è già preso

Gli username di Cal.com sono **globali**: `frenky-morelli-xpetis` potrebbe
essere già di uno sconosciuto. In quel caso:

- **lo slug resta il nostro e non cambia** — è nostro, non di Cal.com
- si sceglie un altro username libero e lo si **scrive in
  `travel_designers.cal_username`**, che è una colonna apposta

Non è un caso da temere: la prenotazione di prova a fine procedura intercetta
comunque qualunque disallineamento fra i due.

---

## 1. L'account

1. `https://cal.com` → registrazione. **Piano gratuito**, è sufficiente.
2. Cal.com assegna uno username con una sigla casuale attaccata, tipo
   `mario-rossi-s68gyf`. **Va cambiato** dalle impostazioni del profilo.
3. Lo username è **lo slug della vetrina più `-xpetis`** — vedi il punto 0, dove
   c'è anche cosa fare se quello username risulta già occupato.

> **Perché conta.** Lo username è la chiave con cui riconosciamo di chi è la
> prenotazione, perché tutti e venticinque avranno lo stesso event type. Se non
> combacia con `cal_username` sul database, le prenotazioni di quel designer
> arrivano e non si agganciano a nessuno.

4. **Disponibilità** → fasce settimanali. Ferie e giorni chiusi si mettono come
   eccezioni di data. Questa parte la compila il designer: è sua.

---

## 2. Gli event type delle consulenze

Crea un event type nuovo. **Non riusare** quello da 30 minuti che Cal.com genera
da solo: ha già un URL suo e si finisce per litigarci.

### Impostazione evento

Gli event type ammessi sono **tre**, e per ogni designer se ne creano uno o due:

| Servizio | Chi lo crea | Durata | Titolo | **URL** (scritto a mano) |
|---|---|---|---|---|
| **Consulenza breve** | **tutti**, sempre | **30 minuti** | `Consulenza XPETIS · 30 min` | `consulenza-xpetis-30` |
| Consulenza approfondita | solo chi la offre, **se** in lista è da 60 | 60 minuti | `Consulenza XPETIS · 60 min` | `consulenza-xpetis-60` |
| Consulenza approfondita | solo chi la offre, **se** in lista è da 90 | 90 minuti | `Consulenza XPETIS · 90 min` | `consulenza-xpetis-90` |

La breve **non è condizionale**: la crea chiunque, e dura sempre 30 minuti. Un
designer senza breve non si può pubblicare. L'approfondita è una sola per
designer: da 60 **oppure** da 90, mai tutte e due. Si imposta al punto 3.

Gli altri campi della breve:

| Campo | Valore |
|---|---|
| Durata | **30** minuti |
| Luogo | **Cal Video** |

> **La durata dev'essere la stessa in quattro posti:** la lista, il titolo, il
> campo *Durata* di Cal.com e l'URL. Se il titolo dice 60 e la durata è 30, il
> viaggiatore paga un'ora e ne riceve mezza. Dal 27 settembre **il database se
> ne accorge alla prima prenotazione** — confronta lo slot che arriva da Cal.com
> con la durata a listino e alza un alert critico `calcom_durata_non_combacia`
> — ma a quel punto c'è già un viaggiatore con lo slot sbagliato. Meglio
> guardarla qui.

> ⚠️ **L'errore più facile di tutta la procedura.** In Cal.com titolo e URL sono
> due campi separati, e Cal.com genera l'URL dal titolo in modo imprevedibile: lo
> stesso identico titolo ha prodotto `consulenza-xpetis-30` su un account e
> `consulenza-xpetis-30-min` su un altro. **Scrivi l'URL a mano e controllalo
> prima di salvare.** Se non è identico su tutti e venticinque, i link delle
> vetrine non si possono più costruire a tavolino e ogni designer diventa un caso
> particolare.
>
> Con tre titoli invece di uno la trappola triplica, quindi dal 27 settembre
> c'è una rete: **un servizio attivo con un URL fuori dai tre ammessi blocca la
> pubblicazione del designer** (`td_publish_readiness` dice quale e perché), e
> su un designer già pubblicato non si può nemmeno scrivere. I tre URL ammessi
> stanno in `app_config` (`calcom_slugs_consultation`,
> `calcom_slugs_consultation_deep`). La rete ti ferma, ma ti ferma all'import:
> è meglio non arrivarci.

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

### Il redirect dopo la prenotazione: lasciarlo VUOTO

**Non è un passo da fare, è un passo da non fare** — e per questo sta scritto:
in *Impostazioni avanzate* c'è **"Redirect on booking"** (o *Reindirizza a URL
dopo la prenotazione*). **Va lasciato vuoto su tutti e venticinque.**

Sembrerebbe la strada naturale per portare il viaggiatore dalla prenotazione al
pagamento, e non lo è. La prenotazione avviene dentro un **embed inline** sulla
vetrina XPETIS, cioè dentro un iframe: un redirect configurato lì fa navigare
**l'iframe**, non la pagina, e la nostra pagina di pagamento finirebbe disegnata
dentro il calendario, incorniciata. È un difetto noto e aperto di Cal.com
(issue `#18144`).

Al passaggio ci pensa il sito, che ascolta l'evento che l'embed emette a
prenotazione fatta. Il vantaggio, oltre a funzionare: **niente da configurare su
25 account**, e nessuna impostazione che qualcuno possa cambiare per sbaglio
spegnendo il pagamento di un designer solo.

Se un giorno servisse davvero — per esempio per chi prenota dalla pagina Cal.com
nuda invece che dalla vetrina — sarebbe una modifica su tutti e venticinque gli
account, quindi va decisa e programmata, non aggiunta a metà.

---

## 3. La consulenza approfondita (solo per chi la offre)

Se in lista il designer **non** offre l'approfondita, salta questo passo.

Altrimenti crea un secondo event type, identico alla breve salvo tre campi, e
prendi **una** delle due righe secondo la durata scritta in lista:

| Campo | Da 60 | Da 90 |
|---|---|---|
| Titolo | `Consulenza XPETIS · 60 min` | `Consulenza XPETIS · 90 min` |
| **URL** (a mano) | `consulenza-xpetis-60` | `consulenza-xpetis-90` |
| Durata | 60 minuti | 90 minuti |

Buffer, preavviso, orizzonte, le tre impostazioni di cancellazione e il campo
nascosto: **tutto uguale** alla breve.

> ⚠️ **Il prezzo dell'approfondita non è quello del form.** Il form della
> vetrina chiede solo «Consulenza singola (30 min)», ed è bloccato: il prezzo
> dell'approfondita va chiesto al designer e scritto nella lista condivisa,
> insieme alla durata.

> Fino al 27 settembre questo passo usava l'URL
> `consulenza-xpetis-approfondita-60-min`. **Non è più ammesso**: se lo trovi su
> un account, è uno dei designer della sezione 8.

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
| `td_services.cal_event_type_slug` | l'URL **esatto** di ciascun event type: `consulenza-xpetis-30` sulla breve, `-60` o `-90` sull'approfondita |
| `td_services.duration_minutes` | 30 sulla breve; 60 o 90 sull'approfondita, **uguale all'URL** |
| `cal_webhook_ok_at` | data e ora di adesso — **ma solo dopo il punto 5 della prova qui sotto** |

La seconda serve alla checklist di pubblicazione: un designer senza account
Cal.com collegato **non si può pubblicare**, e il database lo impedisce.

⚠️ Quella colonna deve voler dire **"provato"**, non "configurato": scriverla
prima della prenotazione di prova la trasforma in una dichiarazione di
intenzioni, e il giorno che quel webhook non funziona nessuno avrà motivo di
sospettarlo.

---

## 7. La verifica, prima di chiudere la sessione

Non fidarti della configurazione: falla parlare. Cinque minuti.

1. Apri
   `https://cal.com/<username>/consulenza-xpetis-30?xpetis_user_id=00000000-0000-0000-0000-000000000000`
2. Controlla che il campo **Codice XPETIS** sia visibile in pagina come
   precompilato e **non modificabile**.
3. Controlla che **non ci siano slot prima di 12 ore da adesso**.
4. Prenota uno slot qualsiasi.
5. ⚠️ **Verifica sul NOSTRO database, non su n8n.** Questo è il passo che
   intercetta il guasto più probabile di tutta la procedura, ed è il motivo per
   cui la prenotazione di prova esiste. Dal SQL Editor:

   ```sql
   select b.id, b.status, b.starts_at, td.display_name
     from bookings b join travel_designers td on td.id = b.td_id
    where td.cal_username = '<username del designer>'
    order by b.created_at desc limit 3;
   ```

   **Deve esserci una riga**, in `pending_payment`, con l'orario che hai
   prenotato.

6. Cancella la prenotazione di prova, e **solo adesso** scrivi
   `cal_webhook_ok_at` sul profilo (vedi sopra): quella colonna deve voler dire
   "provato", non "configurato".

### Perché non basta guardare n8n

Guardare le Executions di n8n dice che **un messaggio è arrivato**, non che è
diventato una prenotazione. Con la parola segreta sbagliata — una lettera in
meno incollata dieci minuti fa — succede questo: Cal.com manda, n8n riceve,
n8n risponde **200**, l'esecuzione è **verde**, e il ponte ha risposto
`firma_non_valida` senza scrivere niente da nessuna parte. A colpo d'occhio
sembra che funzioni.

È il guasto peggiore di tutta la configurazione, perché è **silenzioso**: quel
designer smette di arrivarci e nessuno lo sa finché un viaggiatore vero non resta
con uno slot occupato e nessuna prenotazione. E in onboarding costa trenta
secondi correggerlo.

Se al punto 5 la riga non c'è, nell'ordine:

1. **Guarda il corpo della risposta** nell'ultima esecuzione n8n — non solo il
   codice 200. Se dice `firma_non_valida`, è la parola segreta: rigenerala su
   Cal.com e rimettila identica nel Vault di Supabase
   (`calcom_webhook_secret`). Se dice `designer_sconosciuto`, `cal_username` su
   Supabase non combacia con lo username Cal.com. Se dice
   `event_type_non_nostro`, l'URL dell'event type non è quello del modello.
2. **Nessuna esecuzione affatto**: il workflow n8n è attivo? l'indirizzo del
   webhook è scritto giusto? i tre eventi sono spuntati?
3. E dal database, il contatore che tiene traccia dei rifiuti anche quando non
   li vede nessuno:

   ```sql
   select bucket_at, cal_username_hint, n
     from calcom_signature_rejections
    order by last_at desc limit 10;
   ```

---

## Checklist rapida, una riga per designer

```
[ ] slug preso DALLA LISTA, non inventato
[ ] username = slug + -xpetis  (o, se occupato, scritto in cal_username)
[ ] disponibilità impostata dal designer
[ ] consulenza breve: consulenza-xpetis-30, 30 minuti, Cal Video (TUTTI)
[ ] approfondita in lista? se sì: -60 oppure -90, durata uguale all'URL
[ ] buffer 10 min dopo · preavviso 12 ore · orizzonte 30 giorni
[ ] disable rescheduling: attivo, 720 minuti, host and attendee
[ ] disable cancelling: spento
[ ] require cancellation reason: solo host
[ ] campo nascosto xpetis_user_id
[ ] redirect on booking LASCIATO VUOTO
[ ] prezzo dell'approfondita chiesto e scritto in lista (il form non lo ha)
[ ] webhook verso n8n, 3 eventi, secret condiviso
[ ] event type di fabbrica spenti
[ ] cal_username e cal_webhook_ok_at scritti su Supabase
[ ] prenotazione di prova arrivata IN `bookings` (non solo su n8n), poi cancellata
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

---

## 8. I tre designer onboardati con la regola vecchia

Tre designer hanno fatto questa procedura **prima del 27 settembre 2026**,
quando la guida diceva «un event type da 30 **oppure** da 60, secondo la
lista». Niente di quello che hanno fatto va dato per buono: nessuno dei loro
dati è ancora a database (l'import delle 25 vetrine è in coda), quindi oggi
nessuna rete li ha guardati. La rete sugli slug li fermerebbe all'import, ma
sistemarli **con il designer in chiamata** costa cinque minuti, scoprirlo dopo
costa un giro in più per ciascuno.

Per ciascuno dei tre, sul suo account Cal.com:

1. **Ha un event type `consulenza-xpetis-30`, da 30 minuti?** È l'unico modo
   di avere la breve, e senza breve il designer non si pubblica. Controlla l'URL
   **carattere per carattere** (non `-30-min`) e il campo *Durata*.
2. **Ha creato solo un `consulenza-xpetis-60` come consulenza base?** È il caso
   che la regola vecchia permetteva e la nuova no: il 60 **non è più una
   consulenza breve**. Due strade, e la sceglie il designer:
   - vuole offrire l'approfondita da 60 → il 60 resta, **diventa la sua
     approfondita**, e va creato anche il 30 come breve;
   - non vuole l'approfondita → si crea il 30 e il 60 si spegne.
   In tutti e due i casi **va richiamato sul prezzo**: quello che ha scritto nel
   form era pensato per la sua consulenza base, e la breve adesso dura 30.
3. **Ha un'approfondita col vecchio URL `consulenza-xpetis-approfondita-60-min`?**
   Va rinominato in `consulenza-xpetis-60`. ⚠️ Solo se su quell'event type **non
   ci sono prenotazioni vere in volo**: come Cal.com si comporta con l'URL
   cambiato sotto una prenotazione esistente non l'abbiamo verificato, e nel
   dubbio si chiede prima di toccare.
4. **La lista condivisa** dice per ciascuno: breve sì (sempre), approfondita sì
   o no, da 60 o da 90, e i due prezzi. Se una di queste celle è vuota, il
   designer non è finito.
5. **Rifai la prova del punto 7** su ciascun event type che hai toccato: la
   riga deve arrivare in `bookings`, con la durata giusta e senza alert
   `calcom_durata_non_combacia`.

Quando i tre sono ricontrollati, segnalalo nella lista accanto al loro nome
(«ricontrollato 30/60/90») e nella casella di `PIANO.md`.

