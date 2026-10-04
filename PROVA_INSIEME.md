# XPETIS · la prova insieme

**Guida per la sessione del 30 settembre 2026 — Simone, Alessandro, Andrea.**

Si attraversa il prodotto **una volta, dall'inizio alla fine**: dalla ricerca
alla consegna di un itinerario, passando per due pagamenti veri (in sandbox),
la mail post-call, l'ordine e il cruscotto del team.

Durata: **due ore circa**, senza fretta.

> **Perché tutti e tre.** Ognuno prova una cosa che gli altri non possono
> provare. Andrea fa il viaggiatore senza sapere come funziona dentro —
> ed è l'unico modo di scoprire cosa non si capisce. Alessandro legge il
> cruscotto **senza spiegazioni**: se deve chiedere cosa significa una riga,
> quella riga è sbagliata. Simone esegue le query e guarda cosa succede sotto.

---



## Come si legge questa guida


| Simbolo | Significato                                                    |
| ------- | -------------------------------------------------------------- |
| 👤      | lo fa **Andrea**, nei panni del viaggiatore                    |
| 🎨      | lo fa **Alessandro**, nei panni del Travel Designer o del team |
| 💻      | lo fa **Simone**: query, configurazione, n8n                   |
| 🔴      | **punto di controllo**: qui un guasto sarebbe silenzioso       |
| ⚠️      | trappola nota, leggere prima di procedere                      |


**Regola per le query:** una alla volta, e guardare **il conteggio righe** in
fondo all'editor. `UPDATE 0` non è un errore ma non ha fatto niente — ci è già
costato mezz'ora tre volte.

**Se qualcosa si rompe: fermarsi e annotare a quale lettera.** Non aggiustare e
proseguire. Sapere *dove* si è fermato vale più di qualunque messaggio.

---



# Parte 0 · Preparazione 💻

Da fare **prima** che arrivino, dieci minuti.

### 0.1 · Le migration

```bash
supabase migration list
supabase db push
```

Devono risultare applicate fino alla **0051**. Se ne mancano, `db push` le
applica.

### 0.2 · Le righe di configurazione nuove

Il seed ha `on conflict do nothing` e il database è già seminato: le righe
nuove vanno inserite a mano. Apri `supabase/seed/0001_config.sql` e
`supabase/seed/0005_testi_mail.sql` e incolla nel SQL Editor **i blocchi**
`insert` **che non sono ancora nel database**.

⚠️ **Non rieseguire** `0003_demo.sql`: contiene un `update` che rimette i
segnaposto `example.com` sulle foto dei designer e le fa sparire dal sito.
Se succede, si rimedia rieseguendo `0004_foto_finte.sql`.

### 0.3 · Lo stato di partenza

```sql
select
  (select value      from app_config where key = 'email_enabled')          as posta_accesa,
  (select value_text from app_config where key = 'email_redirect_to')      as dirottata_a,
  (select value_text from app_config where key = 'site_base_url')          as indirizzo_sito,
  (select value      from app_config where key = 'team_digest_hour')       as ora_digest,
  (select value_text from app_config where key = 'team_notify_recipients') as destinatari_team;
```

Attesi per questa prova:


|                    |                                                              |
| ------------------ | ------------------------------------------------------------ |
| `posta_accesa`     | **0** — le mail si compongono e restano in coda, non partono |
| `indirizzo_sito`   | `http://localhost:3000`                                      |
| `ora_digest`       | un numero (serve nella parte 4)                              |
| `destinatari_team` | i tre indirizzi                                              |


⚠️ `indirizzo_sito` **è la riga più pericolosa del database.** Se punta a
`xpetis.it`, i link dentro le mail portano alla landing page e tutta la parte 3
non funziona — senza nessun errore.

### 0.4 · Il resto

- `npm run dev` acceso
- Su **n8n**, tutti e tre i workflow **Active**: Cal.com, Stripe, Orologio
- Il sito raggiungibile anche dal telefono: nel terminale di `npm run dev` c'è
una riga `Network: http://192.168.x.x:3000` — serve nella parte 2



### 0.5 · I dati

```sql
select slug, status, td_publish_blockers(id) as blocchi
  from travel_designers order by slug;
```

Attesi **Marco Rossi** e **Giulia Neri**, entrambi `published`, colonna
`blocchi` vuota (`{}`).

⚠️ Se un blocco c'è, il designer non compare in ricerca. Il testo dice cosa
manca.

---



# Parte 1 · Il viaggiatore trova un designer 👤

**Andrea guida, gli altri guardano e non suggeriscono.**

### A · La home

`http://localhost:3000`

### B · Il quiz

Clicca per fare il quiz. Sono **sei domande**.

Cosa guardare:

- le domande hanno **testi veri**, non «DA SCRIVERE» né nomi tecnici di assi
- le prime cinque hanno **quattro** risposte
- **la sesta — «Con chi vivrai questo viaggio?» — ne ha cinque**, ed è l'ultima
- sull'ultima c'è **Concludi**

👤 *Andrea:* rispondi come risponderesti davvero, e **dì ad alta voce se una
domanda non si capisce**. Sono testi nuovi, nessuno li ha ancora provati su una
persona.

### C · La ricerca

`http://localhost:3000/ricerca`

Tre prove:

1. **«Vietnam»** → deve trovare Marco
2. **«peru»**, senza accento → deve trovare Perù e Giulia
3. **«Siena»** → **non deve trovare niente**: è fra le 1.032 città tolte dalla
  tassonomia v2, ed è una scelta di prodotto, non un difetto

⚠️ Su «peru» comparirà anche **Perugia**: è corretto — è una città italiana e la
ricerca ignora gli accenti. Annotare **in che ordine** compaiono: se Perugia sta
sopra Perù è un problema di ordinamento, non di dati.

### D · La vetrina

Apri **Marco Rossi**. Poi apri anche **Giulia Neri**.


| Cosa guardare          | Atteso                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| Le pillole dei servizi | **Marco: solo la consulenza breve.** Giulia: breve **e** approfondita |
| Viaggi di gruppo       | una sezione in coda, con tre schede per designer, foto e date         |
| «E dopo l'incontro?»   | **solo i servizi che quel designer offre davvero**                    |


🎨 *Alessandro:* è la pagina che venderai ai 25. Dì cosa manca o cosa è di
troppo — è il momento giusto, dopo sarà più caro.

### E · Le pagine di dettaglio

- clicca un **itinerario pronto** → si apre la sua pagina
- clicca un **viaggio di gruppo** → si apre la sua pagina

⚠️ Sui viaggi di gruppo **non deve esserci nessun tasto per comprare**: il
Flusso non prevede di acquistarli dal sito. Se c'è, annotatelo.

---



# Parte 2 · Prenotare e pagare 👤



### F · Il cancello del login

👤 Da **scollegato** (`/auth/esci` se serve), sulla vetrina di Marco premi
**Prenota la call**.

Deve portare a `/accedi`, e dopo Google **riportare sulla stessa vetrina**, non
sulla home.

⚠️ Sulla pagina `/accedi` il bottone «Entra con Google» deve essere **una
pillola rossa leggibile**. Era bianco su crema fino al 28 settembre.

### G · L'embed [Cal.com](http://Cal.com)

Premi di nuovo **Prenota la call**. Il calendario compare **dentro la pagina**.

🔴 **Controllo:** nel modulo di prenotazione c'è un campo **«Codice XPETIS»**
già compilato e non modificabile.

⚠️ Se è vuoto, **fermarsi**: senza quel codice la prenotazione nasce senza
padrone, lo slot resta occupato e da noi non c'è nessuna riga.

### H · Prenota e paga

Scegli uno slot e completa. La pagina **cambia da sola**: passa da «Stiamo
registrando…» e arriva su Stripe.

Paga con:

```
4242 4242 4242 4242 · scadenza futura qualsiasi · CVC qualsiasi
```



### 🔴 Controllo 1 — dopo il primo pagamento 💻

```sql
select b.status, b.confirmed_at, p.kind, p.status as pagamento, p.amount_cents
  from bookings b left join payments p on p.booking_id = b.id
 order by b.created_at desc limit 2;
```

Atteso: `confirmed`, pagamento `consultation` `paid`, importo giusto.

```sql
select kind, severity, message from team_alerts
 where resolved_at is null order by created_at desc limit 5;
```

**Deve essere vuoto.** Il silenzio qui dice tre cose insieme: l'importo incassato
combacia col listino, la durata dello slot combacia con quella dichiarata, e il
pagamento si è agganciato alla prenotazione giusta.

---



# Parte 3 · Dopo la call 💻👤🎨



### I · Far finire la call

La call vera sarebbe fra qualche giorno: la facciamo finire adesso.

💻 Prendi l'`id` della prenotazione dal controllo 1, poi:

```sql
update bookings
   set starts_at = now() - interval '35 minutes',
       ends_at   = now() - interval '5 minutes'
 where id = '<id della prenotazione>';
```

Controlla che dica `UPDATE 1`.

Poi su **n8n**, workflow *Orologio*, premi **Execute workflow**.

### 🔴 Controllo 2 — la mail post-call 💻

```sql
select message_kind, recipient, status, queued_at, subject
  from outbound_messages
 order by queued_at desc limit 3;
```

⚠️ **Ordinare per** `queued_at`**, mai per** `id`: gli id sono UUID casuali, quindi
`order by id` restituisce righe a caso e sembra che la mail non ci sia.

Atteso: una riga `postcall_traveler`, `status` in coda, `sent_at` **nullo**.

Poi leggi il corpo:

```sql
select body_text from outbound_messages
 where message_kind = 'postcall_traveler'
 order by queued_at desc limit 1;
```

👤 *Andrea, leggilo ad alta voce.* È la mail che riceverà un cliente vero:
si capisce cosa gli stiamo proponendo?

💻 Copia il link `/servizio/<token>` del servizio che Marco offre.

### J · Il viaggiatore chiede un servizio 👤

Apri quel link. La pagina dice cosa stai chiedendo e **che non stai comprando
niente**. Premi il bottone.

Deve rispondere «L'abbiamo ricevuta» con un riferimento tipo `XP-00007`.

💻 Verifica:

```sql
select human_ref, status, service_type from orders
 order by created_at desc limit 2;

select from_status, to_status, actor from order_status_history
 order by created_at desc limit 2;
```

Atteso: ordine `requested`, e `actor = traveler` — è l'unica prova di chi ha
cliccato.

---



# Parte 4 · Il designer lavora 🎨



### K · La pagina del designer

💻 Prendi il link:

```sql
select 'http://localhost:3000/ordine/' || token
  from access_tokens
 where purpose = 'td_order_page'
   and order_id = (select id from orders order by created_at desc limit 1);
```

🎨 **Alessandro: aprilo dal telefono**, usando l'indirizzo di rete
(`http://192.168.x.x:3000/ordine/<token>`) invece di `localhost`. È così che lo
apriranno i designer: dalla mail, in piedi, con una mano sola.

Cosa guardare:

- si vede **solo il nome** del viaggiatore, non cognome né mail
- c'è scritto quanto ha già pagato per la consulenza
- **sotto il prezzo c'è una frase tipo «se scali la consulenza, toglila tu da
qui: il sistema non toglie niente da solo»**

⚠️ Quella frase è la cosa più importante della pagina. Il sistema **non calcola**
lo sconto di proposito: se il designer non legge quella riga, scrive il prezzo
pieno e il cliente paga due volte la consulenza.

### L · Scrivere e inviare

🎨 Compila: una descrizione vera, prezzo **1350**, giorni **7**, credito **60**.
Salva.

Compare un **riepilogo**, non un «salvato»: è la proposta vista con gli occhi
del cliente. Ci sono **due tasti separati**, *Modifica* e *Invia*.

Prova a **modificare** e risalvare: si può cambiare quante volte si vuole.

Poi premi **Invia**.

⚠️ **Da qui non si torna indietro**: prezzo, descrizione, giorni e credito
diventano immutabili — non per la pagina, per il database. Per rifare una
proposta il team deve riaprire l'ordine.

Compare il **messaggio pronto da copiare** per il gruppo WhatsApp: prova il
tasto **Copia** dal telefono.

⚠️ Dal telefono su `http://192.168.x.x` il tasto **non copierà**:
`navigator.clipboard` esiste solo su HTTPS o `localhost`. È noto e in produzione
non succederà. Verificate invece che **il testo si possa selezionare a mano**.

### M · Il viaggiatore paga la proposta 👤

💻 Il link:

```sql
select 'http://localhost:3000/proposta/' || token
  from access_tokens
 where purpose = 'traveler_public_proposal'
   and order_id = (select id from orders order by created_at desc limit 1);
```

👤 Aprilo in una **finestra anonima** — il cliente lo riceve su WhatsApp e può
aprirlo da qualsiasi dispositivo.

Cosa guardare:

- si vede la proposta, il prezzo **1.350,00 €**, i giorni
- **non si vede nessun dato del viaggiatore**: quel link gira in un gruppo
- il prezzo è quello **finale**: non deve comparire nessuna sottrazione né il
numero 60

Paga con la carta di prova.

### 🔴 Controllo 3 — dopo il secondo pagamento 💻

```sql
select o.human_ref, o.status, p.kind, p.status as pagamento, p.amount_cents,
       p.booking_id is null as non_legato_a_prenotazione,
       p.order_id is not null as legato_a_ordine
  from orders o left join payments p on p.order_id = o.id
 order by o.created_at desc limit 2;
```

Atteso: ordine `in_progress`, pagamento `full` `paid` da **135000**
centesimi, `non_legato_a_prenotazione` e `legato_a_ordine` entrambi **true**.

```sql
select kind, severity, message from team_alerts
 where resolved_at is null order by created_at desc limit 5;
```

Ancora **vuoto**.

### N · La consegna 🎨👤

🎨 Torna sulla pagina del designer: adesso dice che può cominciare. Carica un
PDF qualsiasi.

👤 Dalla pagina della proposta, scarica il file.

⚠️ Il link di scaricamento **vale un minuto**. Se volete verificarlo: strumenti
di sviluppo → Network, copiate l'indirizzo lungo di Storage, aspettate settanta
secondi e riapritelo — deve dare errore.

---



# Parte 5 · Il cruscotto del team 🎨

**Questa è la parte che solo Alessandro può provare, e va fatta così:
Simone apre le viste e non dice niente.**

🎨 *Alessandro:* per ognuna, guarda la prima colonna e di' **cosa faresti**. Se
devi chiedere cosa significa una riga, quella riga è sbagliata.

```sql
select * from team_ordini_aperti;
```

Deve dire **chi deve muoversi e da quanto** — «Aspetta l'agenzia da 9 giorni» —
non uno stato tecnico.

```sql
select * from team_prenotazioni_in_corso;
```

```sql
select * from team_coda_alert;
```

In ordine di quanto costa ignorarli, con scritto **cosa si fa**.

```sql
select * from team_checklist_pubblicazione;
```

Chi è pronto per la vetrina e a chi manca cosa. 🎨 **È lo strumento con cui
seguirai i 25 designer**: dì se ti basta.

### O · Chiudere un alert

💻 In Studio apri `team_alerts` **come tabella** (non la vista: le viste sono in
sola lettura), trova un alert di collaudo e **spunta la colonna** `risolto`.

```sql
select kind, risolto, resolved_at, resolved_by
  from team_alerts order by created_at desc limit 5;
```

Data e autore si riempiono da soli, e la riga sparisce da `team_coda_alert`.

⚠️ **Da capire tutti e tre:** un alert lasciato aperto **impedisce che ne venga
scritto un altro dello stesso tipo**. Non spuntare non significa «lo guardo
dopo»: significa restare ciechi su quel problema finché non lo si chiude.

### P · Il digest

💻 Forzalo:

```sql
update app_config set value = 0 where key = 'team_digest_hour';
```

Esegui l'orologio su n8n, poi:

```sql
select subject, body_text from outbound_messages
 where message_kind like '%digest%'
 order by queued_at desc limit 1;
```

🎨 *Alessandro: leggilo come lo leggeresti la mattina.* I nuovi per esteso, i
vecchi raggruppati. **Nessun codice lungo in chiaro.**

💻 Rimetti l'ora com'era.

---



# Cosa annotare

Un foglio solo, tre colonne: **lettera**, **cosa è successo**, **chi l'ha
notato**.

Le tre domande a cui questa sessione deve rispondere:

1. 👤 **Andrea:** c'è un punto in cui non hai capito cosa dovevi fare?
2. 🎨 **Alessandro:** il cruscotto ti basta per seguire venticinque designer, o
  ti serve qualcosa che non c'è?
3. 🎨 **Alessandro:** la pagina del designer sul telefono è usabile da una
  persona che non l'ha mai vista?

---



# Cosa questa prova NON copre

Da dire ad alta voce all'inizio, così nessuno pensa che sia tutto verificato:

- **Nessuna mail parte davvero.** `email_enabled = 0`: si leggono dalla coda.
Verso destinatari veri non è mai stato provato
- **I pagamenti sono in sandbox**, sul conto di prova. Il conto dell'agenzia non
esiste ancora
- **L'All Inclusive non si prova**: serve un'agenzia vera e il suo Stripe
- **Le recensioni non esistono** (milestone 8, non iniziata)
- **I 25 profili veri non sono importati**: in prova ci sono due designer finti
- **Il dominio non punta all'app**, quindi i link nelle mail funzionano solo in
locale

---

*Scritto il 30 settembre 2026. Se durante la prova emerge qualcosa che questa
guida dava per scontato, aggiungerlo qui: la prossima volta la rifate con tre
persone diverse.*