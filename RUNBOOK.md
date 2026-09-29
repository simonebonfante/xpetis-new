# XPETIS · runbook

Cosa fare quando qualcosa si rompe. È scritto per chi **non** ha costruito il
sistema e lo legge alle due di notte. Non spiega come è fatto il sistema: dice
dove guardare, in che ordine, e cosa non toccare.

> **Qui non si scrivono segreti.** Chiavi e password stanno nel password
> manager; dove vive ciascuna lo dice `ACCESSI.md`.

---

## Prima di tutto, tre regole

1. **Guarda, poi tocca.** Quasi tutto qui è idempotente se rilanciato *nel modo
   giusto*, e dannoso se rilanciato nel modo sbagliato. La sezione «Cosa NON
   rilanciare» è la più importante del documento.
2. **Sospetta i dati prima del codice.** Il 27-28 settembre 2026, su cinque
   intoppi, quattro non erano difetti ma **stato dei dati**, e il quinto era una
   query che guardava male. Sono in fondo, sotto «Le trappole». Leggile prima di
   aprire un file sorgente.
3. **Gli screenshot delle viste `team_*` si possono girare in chat. Quelli delle
   tabelle no.** Le viste sono fatte per non mostrare credenziali. `bookings`,
   `payments`, `event_log`, `webhook_events` e `access_tokens` invece contengono
   i codici delle prenotazioni Cal.com (con quello solo, su Cal.com, si cancella
   una call), i token delle pagine dei designer e degli indirizzi email.

---

## Dove si guarda

| Cosa | Dove | Cosa ci trovi |
|---|---|---|
| **Il cruscotto** | Supabase Studio → Table Editor → le viste `team_*` | Le quattro viste qui sotto. Si parte sempre da qui |
| Il diario di tutto | Studio → tabelle `event_log`, `webhook_events` | Ogni messaggio arrivato da Cal.com e Stripe, ogni cosa fatta dall'orologio |
| Le automazioni | n8n, `https://n8n-production-d576.up.railway.app` → *Executions* | Le esecuzioni dei tre workflow: *Cal.com → bookings*, *Stripe → payments*, *Orologio · scadenze* |
| La posta | Studio → `outbound_messages`; il pannello di Resend | Ogni mail composta, il suo stato e l'errore. `provider_message_id` è il filo per cercarla su Resend |
| Le pagine del sito | Vercel → progetto → *Logs* | Gli errori delle route server (casse, pagine a token) |
| I soldi | La dashboard Stripe **dell'agenzia** (sandbox oggi) | Pagamenti, rimborsi, e i messaggi webhook con il loro esito (*Developers → Webhooks*) |
| Le call | L'account Cal.com del designer | Il calendario vero. Non lo abbiamo: si chiede al designer |

### Le viste, cosa sono

| Vista | Domanda a cui risponde |
|---|---|
| `team_coda_alert` | Cosa si è rotto, in ordine di **quanto costa ignorarlo**, con **cosa si fa** |
| `team_ordini_aperti` | Chi deve muoversi su ogni ordine, da quanto, e cosa manca. In cima quelli che **toccano a noi** |
| `team_prenotazioni_in_corso` | Chi deve pagare, le call a breve, quelle in attesa di chiudersi, quelle in disputa |
| `team_checklist_pubblicazione` | Quali dei 25 designer sono pronti, e a chi manca cosa |
| `team_pagamenti` | Gli incassi, con l'id Stripe (`pi_…`) per cercarli sulla dashboard. In cima i rimborsi da annotare |

### Come si chiude un alert

**Studio → Table Editor → tabella `team_alerts` → colonna `risolto` → `true`.**
Data e autore si riempiono da soli. Se vuoi, scrivi in `resolution_note` cosa
hai fatto. Togliere la spunta lo riapre.

⚠️ **Chiudere un alert lo riarma.** Quasi tutti gli alert si scrivono solo se
non ce n'è già uno aperto dello stesso tipo. Un alert lasciato aperto «per
ricordarsene» **zittisce tutti quelli dopo**: la prossima firma rifiutata, di un
altro designer, non scrive niente. Quindi: sistemato → spunta.

Venti alert uguali si chiudono in un colpo dal SQL Editor:

```sql
select chiudi_alert('calcom_designer_sconosciuto', 'username corretto su Mario');
```

Alcuni si chiudono da soli quando la condizione non c'è più: l'ordine richiesto
che il designer ha cominciato, il saldo arrivato, il link dell'agenzia
rinnovato o usato, il rimborso annotato.

### Il digest

Una mail al giorno, dopo l'ora di `app_config.team_digest_hour` (ora di Roma),
agli indirizzi di `app_config.team_notify_recipients`. Porta gli alert nuovi per
esteso e quelli vecchi in una riga per tipo, con l'età del più vecchio. **Se non
c'è niente di aperto non arriva niente**, e questo è voluto: una mail «tutto
bene» ogni mattina è una mail che si impara a non aprire.

Se il digest ripete gli stessi alert da giorni, non è rotto: **nessuno li ha
chiusi.**

---

## Cosa NON rilanciare

Leggere prima di premere qualunque *Retry*.

| Non fare | Perché | Invece |
|---|---|---|
| **Rilanciare un'esecuzione vecchia dell'orologio** (*Retry* su n8n) | I compiti dentro quell'esecuzione sono stati calcolati allora. Rigiocarli oggi può **cancellare su Cal.com una call che nel frattempo è stata pagata**, o rimandare una mail a un cliente | Niente. Il giro successivo, fra cinque minuti, ricalcola da capo cosa è dovuto adesso |
| Eseguire `select * from clock_tick();` dal SQL Editor «per vedere» | Non è una lettura. Chiude davvero le call a 48 ore, chiude gli ordini, scrive alert, e **prende in carico** cancellazioni e mail che poi nessuno esegue: uno slot resta occupato un giro in più | Guardare le viste. Se serve proprio, `clock_tick(0)` non prende in carico niente verso l'esterno, ma i rami interni girano lo stesso |
| **Importare un workflow come nuovo** invece di aggiornare quello che c'è | Un workflow nuovo prende un indirizzo nuovo; Cal.com e Stripe continuano a chiamare il vecchio, e **le prenotazioni smettono di arrivare senza nessun errore** | Aggiornare quello esistente (`n8n/LEGGIMI.md`) |
| **Rieseguire i seed `0003_demo.sql` o `0004_foto_finte.sql`** su un database con dati | Riscrivono le foto dei designer e altri campi dei profili demo. È la trappola n. 1 qui sotto | Dei seed si rigiocano solo `0001_config.sql` e `0005_testi_mail.sql`: aggiungono le righe mancanti e non toccano quelle che ci sono |
| Cancellare una riga di `webhook_events` per «farla ripassare» | Il vincolo su quella tabella è la difesa contro il doppio incasso e la doppia prenotazione | Un messaggio fermo su un errore ha `processed_at` vuoto: il *Retry* del ponte su n8n, o il reinvio dal provider, lo rilavora da solo |
| Cambiare a mano lo stato di una prenotazione **per liberare uno slot** | Il nostro database lo dice libero, il calendario del designer no | Lo slot si libera su Cal.com (dal designer, o lasciando lavorare l'orologio) |
| Accendere `email_enabled` con `email_redirect_to` ancora valorizzato, o spegnere il redirect senza guardare la coda | Nel primo caso le mail vere vanno a chi prova; nel secondo parte in un colpo tutto quello che era accumulato | Leggere `outbound_messages` in `queued` prima di toccare uno dei due |

**Cosa invece si può rilanciare senza paura:** un'esecuzione fallita dei due
**ponti** (*Cal.com → bookings*, *Stripe → payments*). Ogni messaggio è unico in
`webhook_events`: se era già stato lavorato risponde `duplicato` e non fa
niente. Lo stesso vale per il tasto *Resend* di un evento sulla dashboard Stripe.

---

## 1 · Un workflow n8n fallisce

**Dove si guarda:** n8n → *Executions*, filtro sul workflow, stato *Error*.

**Prima cosa da sapere:** un'esecuzione **verde** può non aver fatto niente. I
ponti rispondono sempre 200 (un provider che riceve errori spegne l'endpoint), e
il nodo che chiama Cal.com nell'orologio non si colora di rosso quando Cal.com
rifiuta. L'esito vero sta **nel corpo della risposta** del nodo che chiama
Supabase, o nel database.

| Workflow | Rosso vuol dire | Si rilancia? |
|---|---|---|
| *Cal.com → bookings* | Di solito Supabase non ha risposto, o il nodo *Corpo grezzo e firma* non ha ricevuto i byte (opzione *Raw Body* spenta dopo un'importazione) | **Sì**, *Retry* |
| *Stripe → payments* | Come sopra | **Sì**, *Retry*, oppure *Resend* dalla dashboard Stripe |
| *Orologio · scadenze* | Quasi sempre `clock_tick()` ha **sollevato**: manca uno dei sei parametri indispensabili in `app_config`. Il messaggio d'errore dice quale | **No.** Si sistema la causa e si aspetta il giro dopo |

Se l'orologio è rosso a ogni giro:

```sql
-- l'errore, senza passare da n8n
select * from clock_tick(0);
```

Se dice «Manca un parametro dell'orologio», si rigioca
`supabase/seed/0001_config.sql` (solo quello). Se il rosso è sul nodo
*Manda con Resend* con un 401, la credenziale scelta sul nodo è quella di
Supabase invece di quella di Resend: sono due *Header Auth* diverse, e
sembrano uguali.

**Se n8n stesso non risponde:** è su Railway (`ACCESSI.md`). Il suo stato vive
nel suo Postgres, non su disco: un riavvio del servizio non perde niente. Mentre
n8n è giù Cal.com e Stripe ritentano da soli per un po'; l'orologio no, e al
ritorno recupera tutto quello che è scaduto nel frattempo. ⚠️ La cosa che **non**
recupera sono le mail post-call più vecchie di `postcall_email_max_age_hours`:
lo dice l'alert `postcall_mail_non_partita`, e quei viaggiatori vanno ripresi a
mano.

---

## 2 · Una prenotazione non arriva

Sintomo: il viaggiatore dice di aver prenotato, il designer vede la call sul
suo calendario, e da noi non c'è niente.

Si scende in quest'ordine, e ci si ferma alla prima risposta.

```sql
-- 1. C'è davvero? (per designer, le ultime)
select b.created_at, b.status, b.starts_at
  from bookings b join travel_designers td on td.id = b.td_id
 where td.cal_username = '<username Cal.com del designer>'
 order by b.created_at desc limit 5;

-- 2. Il messaggio è arrivato? (le ultime ore, tutti i designer)
select received_at, event_type, processed_at, error
  from webhook_events where provider = 'cal'
 order by received_at desc limit 20;

-- 3. È arrivato ed è stato scartato? Il diario dice perché
select created_at, event, payload ->> 'username' as account, payload ->> 'slug' as slug,
       payload ->> 'dettaglio' as dettaglio
  from event_log where event like 'calcom_%'
 order by created_at desc limit 20;

-- 4. È stato rifiutato per la firma? (nessuna riga in webhook_events)
select bucket_at, cal_username_hint, n
  from calcom_signature_rejections order by last_at desc limit 10;
```

| Dove ti fermi | Cosa vuol dire | Vai a |
|---|---|---|
| 1 ha la riga | È arrivata. Il problema è altrove (la pagina, la mail) | — |
| 2 ha il messaggio con `error` pieno | Si è fermato su un guasto e verrà rilavorato al prossimo tentativo di Cal.com | *Retry* sul ponte |
| 3 dice `calcom_event_type_non_nostro` | Lo slug dell'event type su Cal.com non è uno dei nostri | §3, slug |
| 3 dice `calcom_designer_sconosciuto` | Lo username Cal.com non è in `travel_designers.cal_username` | §3, username |
| 3 dice `calcom_viaggiatore_non_identificato` | Nessun codice XPETIS valido: prenotazione fatta fuori dal sito, o viaggiatore che non esiste più | §3, campo nascosto; trappola n. 3 |
| 4 ha righe | La parola segreta del webhook di quell'account è sbagliata | §3, parola segreta |
| **Niente da nessuna parte** | Il messaggio non è mai partito da Cal.com, o è andato a un indirizzo che non esiste | §3, webhook |

⚠️ `event_log.payload` porta anche il codice della prenotazione Cal.com: la
query 3 sceglie le colonne apposta. Non fare `select *` davanti a qualcuno.

---

## 3 · Un designer configurato male

Sintomo: **«le prenotazioni di Mario non arrivano»**. Tutti gli altri sì.

I 25 account Cal.com li configurano i designer, uno per uno
(`ONBOARDING_CALCOM_TD.md`). Cinque cose possono essere sbagliate, e **lasciano
tracce molto diverse**:

| Cosa è sbagliato | Traccia che lascia | Si sistema |
|---|---|---|
| **La parola segreta del webhook** | Quasi nessuna. Nessuna riga in `webhook_events`, nessuna prenotazione, n8n **verde**. Resta solo un contatore in `calcom_signature_rejections`, con un nome **non verificato** (la firma è falsa, quindi il nome l'ha scritto chiunque); oltre la soglia, un alert `calcom_firme_rifiutate` | Rigenerare la parola segreta sul webhook del suo account, **copiata** dal password manager, mai riscritta a mano. Deve essere identica su tutti i 25 e in Supabase Vault (`calcom_webhook_secret`) |
| **Lo slug dell'event type** (l'URL: `consulenza-xpetis-30`, `-60`, `-90`) | Una riga `calcom_event_type_non_nostro` in `event_log`. **Nessun alert**: gli appuntamenti propri di un designer arrivano allo stesso modo, e scartarli è routine | Correggere l'URL dell'event type su Cal.com. Se l'URL giusto è un altro, correggere `td_services.cal_event_type_slug`. Trappola n. 2 |
| **Lo username** | Alert `calcom_designer_sconosciuto` | Correggere `travel_designers.cal_username` |
| **Il campo nascosto `xpetis_user_id`** mancante o modificabile | Alert `calcom_viaggiatore_non_identificato` | Ricreare il campo come dice l'onboarding, §2 |
| **Il webhook non c'è, è spento, o non ha i tre eventi spuntati** | **Nessuna, da nessuna parte.** È l'unico caso davvero muto | Controllarlo sull'account (*Impostazioni → Sviluppatore → Webhooks*) |

**Come si chiude, sempre:** la **prenotazione di prova** dell'onboarding, §7.
Prenotare uno slot con il codice finto, verificare **sul nostro database** (non
su n8n) che la riga esista, cancellarla, e solo allora scrivere
`travel_designers.cal_webhook_ok_at`. Una configurazione che non è stata fatta
parlare non è provata.

La checklist di pubblicazione (`team_checklist_pubblicazione`) intercetta prima
lo username mancante e lo slug fuori elenco: un designer così **non si
pubblica**. Non vede invece la parola segreta né il webhook: quelli li vede solo
la prova.

---

## 4 · Un pagamento incassato senza riga da noi

Sintomo: Stripe mostra un pagamento riuscito, e da noi la prenotazione o
l'ordine non è andato avanti.

**Se il messaggio è arrivato**, c'è un alert che lo dice, e in
`team_coda_alert` sta in cima (costo 1). I tipi: `stripe_pagamento_senza_prenotazione`,
`stripe_pagamento_senza_ordine`, `stripe_pagamento_su_prenotazione_chiusa`,
`stripe_pagamento_su_ordine_non_in_attesa`, `stripe_importo_non_combacia`,
`stripe_rata_*`. Ognuno ha nella colonna `cosa_fare` il gesto. In tutti i casi
**il database non ha toccato l'ordine**: meglio un ordine fermo con i soldi
incassati che un ordine avanzato su un importo sbagliato.

**Se il messaggio non è arrivato**, nessun alert:

1. Dashboard Stripe → *Developers → Webhooks* → l'endpoint → gli eventi
   recenti. Un evento consegnato con errore o non consegnato si **rimanda da
   lì** (*Resend*): è sicuro, il ponte è idempotente.
2. Se l'evento non c'è proprio, l'endpoint non era iscritto a quel tipo di
   evento. I tre che servono: `checkout.session.completed`,
   `checkout.session.expired`, `charge.refunded`.
3. Se è arrivato ed è stato scartato, `webhook_events` (provider `stripe`) e
   `event_log` (eventi `stripe_*`) dicono perché.

⚠️ **Un webhook perso è un buco a nostro sfavore che nessuno vede.** Per questo
serve la riconciliazione mensile — `team_pagamenti` affiancata all'elenco dei
pagamenti sulla dashboard — ed è ancora un **punto aperto** da decidere con
Andrea (`PIANO.md`, milestone 7).

---

## 5 · Lo slot non si libera

Sintomo: una consulenza non pagata da più di 35 minuti occupa ancora il
calendario del designer.

```sql
select id, status, payment_deadline_at, cancel_requested_at, cancel_attempts
  from bookings
 where status = 'pending_payment'
 order by payment_deadline_at nulls first;
```

| Cosa vedi | Vuol dire |
|---|---|
| `payment_deadline_at` vuoto | Non è una prenotazione scaduta: senza scadenza la cassa la tratta come pagabile e l'orologio **di proposito** non la tocca. Va chiusa a mano con il designer |
| `cancel_attempts` a zero, scadenza passata da più di un giro | L'orologio non gira: §1 |
| `cancel_attempts` che sale | L'orologio ci prova e Cal.com rifiuta. Il perché, con il codice HTTP: `select created_at, payload from event_log where event = 'orologio_cancellazione_fallita' order by created_at desc limit 5;` |
| `cancel_attempts` al massimo | Si è arreso, e c'è l'alert `orologio_cancellazione_calcom_non_riesce` |

La causa più probabile dopo il collaudo è l'indirizzo in
`app_config.calcom_cancel_url`, o un cambiamento dell'API di Cal.com. Il comando
per riverificare quale indirizzo funziona è in `n8n/LEGGIMI.md`, *L'endpoint di
cancellazione*.

---

## 6 · Le mail non arrivano

```sql
select queued_at, message_kind, recipient, delivered_to, status, attempts, last_error
  from outbound_messages
 order by queued_at desc limit 20;
```

| Cosa vedi | Vuol dire |
|---|---|
| Tutte `queued`, `attempts` a zero | `email_enabled` è a 0: le mail si compongono e si accodano, e non partono. È lo stato di nascita |
| `sent`, ma `delivered_to` diverso da `recipient` | È acceso il dirottamento `email_redirect_to`: sono andate a chi prova |
| `failed` con `last_error` | Rifiuto definitivo di Resend (indirizzo, mittente). Non si ritenta da sola |
| `queued` con `attempts` che sale | Resend non accetta: chiave, tetto di 100 al giorno **condiviso con la landing page**, dominio. Alert `email_non_consegnata` |
| La mail **non c'è** | Non si è composta: alert `email_composizione_fallita`, che dice anche con che riga si rilancia |

Per cercarne una su Resend: `provider_message_id`.

---

## 7 · Il rimborso

**Cambiato con la deviazione 9: non è più un'API nostra.** I soldi stanno sul
conto Stripe dell'agenzia; la chiave che abbiamo è ristretta e **non può
rimborsare**. Il rimborso si fa **a mano dalla dashboard**.

**Chi lo fa:** Simone, che ha il ruolo admin sul conto. Oggi è l'unico: se non
c'è lui, il rimborso aspetta. ⚠️ Una seconda persona con lo stesso ruolo è una
decisione da prendere con l'agenzia.

**Chi lo decide:** il team, sulle regole del Flusso (rimborso pieno fino a 24
ore prima della call; call cancellata o spostata dal designer senza una data
nuova; pagamento arrivato su uno slot già liberato; esito di una disputa).

**Con quali tempi:** *proposta, da confermare* — entro due giorni lavorativi
dalla decisione. Poi Stripe impiega di norma 5-10 giorni lavorativi a far
arrivare i soldi sulla carta: va detto al viaggiatore, altrimenti dopo tre
giorni scrive che non li ha visti.

### I passi

1. **Trova il pagamento da noi.** In `team_pagamenti` cerca la riga (per
   ordine, designer, viaggiatore o data) e copia `id_stripe`, il codice `pi_…`.
2. **Rimborsa su Stripe.** Dashboard dell'agenzia → *Pagamenti* → cerca il
   `pi_…` → *Rimborsa* → importo (tutto o una parte) → motivo.
3. **Annotalo da noi, subito.** Dal SQL Editor, con l'importo **di questo
   rimborso** in centesimi (50 € = 5000):

   ```sql
   select annota_rimborso('pi_…', 5000, 'Call cancellata dal designer — deciso da Alessandro');
   ```

   Aggiorna `payments` (`refunded_at`, `refund_amount_cents`, `refund_note`,
   stato `refunded` o `partially_refunded`) e, per una consulenza, anche la
   prenotazione. Un secondo rimborso sullo stesso pagamento si somma.
4. **Decidi lo stato.** Il rimborso da solo **non** cambia la prenotazione né
   l'ordine, di proposito: la call si rifissa o no, l'ordine si annulla o torna
   in definizione, e questa è una decisione. La si scrive su Studio
   (`last_actor = 'team'`, e per un annullamento `cancelled_at`,
   `cancelled_by`, `cancel_reason`). Se la call esiste ancora su Cal.com, la
   cancella il designer dal suo calendario.
5. **Dillo al viaggiatore**, con i tempi di accredito.

### Se il passo 3 si dimentica

Stripe manda `charge.refunded` allo stesso endpoint, e il ponte lo mette nel
diario. Al giro dopo l'orologio confronta quanto Stripe dice rimborsato con
quanto abbiamo annotato, e se non combacia alza **`rimborso_non_annotato`**
(costo 1), con la riga `annota_rimborso(...)` già scritta nel messaggio. Annotato
il rimborso, l'alert si chiude da solo. `team_pagamenti` mette quei pagamenti in
cima, con la colonna `da_fare`.

⚠️ Funziona solo se l'endpoint webhook del conto dell'agenzia è iscritto a
`charge.refunded` (S-12 in `PIANO.md`). E non vede il caso opposto — un
rimborso annotato da noi e mai fatto su Stripe: quello lo trova solo la
riconciliazione.

**Perché conta:** un rimborso eseguito su Stripe e non annotato qui rende il
nostro database una fonte di verità che mente. Dice che quei soldi ci sono.

---

## Le trappole: quando non è un difetto

Il 27-28 settembre 2026 il giro completo è stato provato da capo a fondo. Su
cinque intoppi, **quattro non erano difetti del codice ma stato dei dati**, e il
quinto era una query che sembrava dire una cosa e ne diceva un'altra. Ognuno è
costato più tempo del necessario perché si è cercato nel codice. Sono qui perché
chi viene dopo ci cascherà di nuovo.

Di ognuno è scritto il **meccanismo**, cioè come ci si ricasca, non la cronaca
di quel giorno.

### 1. Le foto sparite: un seed rieseguito

**Sintomo:** le foto dei designer demo non si vedono più, da un momento
all'altro, senza che nessuno abbia toccato il sito.

**Il meccanismo:** `supabase/seed/0003_demo.sql` **riscrive** `photo_url` dei
due designer demo con un indirizzo finto (`https://example.com/…`, un host che
non risponde); è `0004_foto_finte.sql` a rimetterla sul bucket. Rigiocare il
0003 — per esempio per ritrovare una riga di prova — e non il 0004 azzera le
foto. E il 0003 non è l'unico: i seed sono scritti per un database vuoto.

**Regola:** dei seed si rigiocano solo `0001_config.sql` e `0005_testi_mail.sql`,
che aggiungono ciò che manca e non toccano ciò che c'è. Mai l'intera cartella.

### 2. La prenotazione scartata: uno slug vecchio

**Sintomo:** le prenotazioni di un designer non arrivano, e non c'è nessun
alert.

**Il meccanismo:** l'URL del suo event type su Cal.com è quello della regola
precedente (prima del 27 settembre gli slug erano diversi; e Cal.com, se lo
lasci fare, ne inventa uno dal titolo, tipo `consulenza-xpetis-30-min`). Il ponte
scarta ciò che non riconosce come nostro, e lo annota solo nel diario.

**Regola:** `select event, payload ->> 'slug' from event_log where event = 'calcom_event_type_non_nostro' order by created_at desc limit 5;`
prima di qualunque altra cosa. Gli slug ammessi sono in `app_config`
(`calcom_slugs_*`).

### 3. Il viaggiatore che non c'è: un account cancellato

**Sintomo:** `calcom_viaggiatore_non_identificato` su una prenotazione fatta
dal sito, da una persona che «si era registrata».

**Il meccanismo:** il viaggiatore è stato cancellato (da Auth, e quindi da
`travelers`), ma il suo codice gira ancora — in una sessione del browser, in un
link di prova, in una fixture. Il codice è valido nella forma e non corrisponde
più a nessuno, e il ponte risponde onestamente che non sa chi sia.

**Regola:** `select id, email from travelers where id = '<il codice>';` — se non
c'è, non è il ponte. Si esce, si rientra con Google, si riprenota.

### 4. Il comando che non fa niente: un UUID morto

**Sintomo:** una `update` da Studio «non funziona»: nessun errore, e nessun
effetto.

**Il meccanismo:** l'id incollato viene da una prova precedente, da una riga
cancellata nel frattempo, o da un altro progetto Supabase. La riga non esiste,
e Postgres risponde correttamente `UPDATE 0` — che in Studio si legge come
«fatto».

**Regola:** prima di una `update`, la `select` con la stessa `where`. E
guardare **in quale progetto** si è: sviluppo (`rsgyxbqzsxahsbdfgtbm`) o un
altro.

### 5. «L'ultima riga» che non è l'ultima: `order by id` su un UUID

**Sintomo:** una query per vedere l'ultima prenotazione, l'ultimo messaggio,
l'ultimo alert, mostra una riga vecchia, e sembra che il sistema non abbia
scritto niente.

**Il meccanismo:** `order by id desc`. Gli id qui sono UUID casuali: ordinarli non
dice niente sul tempo.

**Regola:** si ordina per la colonna del tempo — `created_at`, `received_at`,
`queued_at`. Tutte le query di questo documento lo fanno.

### Il filo comune

Prima di sospettare il codice, tre domande: **la riga esiste?** **È nello stato
che penso?** **Sto guardando il database giusto?** Hanno risposto a quattro
intoppi su cinque.

---

## Quando questo documento non basta

- Il funzionamento dei tre workflow, riga per riga: `n8n/LEGGIMI.md`.
- Lo schema e le decisioni: `supabase/README.md`, e il commento in testa a ogni
  migration.
- Dove sta ogni credenziale e cosa si recupera se si perde: `ACCESSI.md`.
- La configurazione dei designer su Cal.com: `ONBOARDING_CALCOM_TD.md`.

Se trovi un guasto che qui non c'è, aggiungilo — sintomo, dove si guarda, cosa
si fa — dopo averlo risolto, mentre te lo ricordi.
