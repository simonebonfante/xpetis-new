# n8n · i workflow, e come si rimettono dentro

I workflow di n8n vivono su Railway, dentro il Postgres dell'istanza. Questa
cartella ne tiene la copia leggibile e versionata: serve a poterli rivedere in
una `git diff`, a ricostruirli se l'istanza si perde, e a discuterne senza
aprire il browser.

> **Qui non ci sono segreti, e non ce ne devono finire.** Le credenziali non si
> esportano: nel file resta solo un riferimento (`id` + nome) alla credenziale
> custodita cifrata dentro n8n. Se in un export vedi una chiave scritta per
> esteso, quel file **non si committa**: si rifà l'export dopo aver spostato la
> chiave in una credenziale.

---

## `calcom-consulenze.json` — Cal.com → `bookings`

Il ponte che trasforma i messaggi di Cal.com in righe di `bookings`.

| | |
|---|---|
| Workflow su n8n | **`rkhzLOHO64kDeGFc`** — *Cal.com → bookings · consulenze* |
| Indirizzo che si dà a Cal.com | `https://<istanza n8n>/webhook/calcom-consulenze` |
| Credenziale usata | *Supabase XPETIS · chiave secret (server)*, tipo **Header Auth**, header `apikey` |
| Provato in produzione | 6 settembre 2026: creazione, doppio scatto, riprogrammazione, cancellazione |

### I quattro nodi, e perché sono quattro

```
Webhook  →  Corpo grezzo e firma  →  calcom_webhook()  →  Sempre 2xx
(POST)         (Code)                (HTTP Request)      (Respond to Webhook)
```

**Non c'è logica in n8n.** Tutta la decisione — verifica della firma, diario,
identificazione del designer e del viaggiatore, creazione, riprogrammazione,
cancellazione, alert al team — vive nella funzione Postgres `calcom_webhook()`
della migration `0037_calcom_webhook.sql`. n8n fa il fattorino, e resta su
questo percorso per due cose che il database non ha: **il log visuale** di ogni
messaggio ricevuto e **il retry** automatico quando Supabase non risponde.

Il nodo in mezzo è il solo che sorprende, e la ragione è la più importante di
tutto il ponte:

> **La firma si calcola sui byte esatti.** Cal.com firma il corpo con
> HMAC-SHA256; il nodo Webhook ha l'opzione **Raw Body** accesa e consegna i
> byte originali come dato binario. Il nodo `Corpo grezzo e firma` li decodifica
> e legge l'header `x-cal-signature-256`. **Non si può** far riserializzare il
> JSON a n8n: l'ordine delle chiavi, gli spazi e il formato dei numeri non
> sopravvivono al giro di andata e ritorno, e la firma non combacerebbe più.
> Nessuna espressione di n8n sa toccare byte, quindi serve un nodo Code — quattro
> nodi invece di tre, ma quel nodo non decide niente: è idraulica.

Che i byte arrivino leggibili dipende da una scelta di configurazione
dell'istanza che era già stata fatta per un'altra ragione: n8n tiene i **dati
binari in memoria** (`ACCESSI.md`), perché i file non passano mai dentro n8n. Se
un giorno si passasse allo storage su filesystem, questo nodo va rivisto.

Se il corpo grezzo non arriva, quel nodo **fallisce di proposito** invece di
ripiegare su una riserializzazione. Un ripiego silenzioso darebbe
`firma_non_valida` su ogni messaggio: sembrerebbe un problema di segreti, e non
lo sarebbe. Meglio rumoroso.

`Sempre 2xx` chiude con codice 200 qualunque sia l'esito, incluso l'errore: un
provider che riceve 500 ripetuti spegne l'endpoint, e la difesa contro il doppio
scatto sta già nel database (`webhook_events`, unico per provider + messaggio).

### Come si reimporta

**Dall'interfaccia**, se il workflow è andato perso o va copiato su un'altra
istanza:

1. n8n → *Workflows* → **Import from File** → `calcom-consulenze.json`.
2. Il nodo `calcom_webhook()` arriva **senza credenziale**: aprilo e scegli
   (o crea) una credenziale **Header Auth** con
   `Name: apikey` e `Value:` la chiave `sb_secret_…` del progetto Supabase. La
   chiave sta nel password manager — vedi `ACCESSI.md`.
3. Controlla che il nodo Webhook abbia **path `calcom-consulenze`** e l'opzione
   **Raw Body** accesa.
4. Attiva il workflow. L'indirizzo di produzione compare nel nodo Webhook:
   dev'essere **lo stesso** che è configurato sui webhook dei designer su
   Cal.com, altrimenti le prenotazioni arrivano a un workflow che non esiste
   più.

**Dall'API**, che è come è stato messo dentro la prima volta:

```bash
# le variabili stanno in .env.local (N8N_PUBLIC_URL, N8N_API_KEY)
curl -X PUT "$N8N_PUBLIC_URL/api/v1/workflows/rkhzLOHO64kDeGFc" \
     -H "X-N8N-API-KEY: $N8N_API_KEY" -H 'Content-Type: application/json' \
     -d @n8n/calcom-consulenze.json
curl -X POST "$N8N_PUBLIC_URL/api/v1/workflows/rkhzLOHO64kDeGFc/activate" \
     -H "X-N8N-API-KEY: $N8N_API_KEY"
```

⚠️ **Si aggiorna il workflow esistente, non se ne crea uno nuovo.** Un workflow
nuovo prende un path nuovo, e Cal.com continuerebbe a puntare al vecchio: le
prenotazioni smetterebbero di arrivare senza che nessuno riceva un errore.

### Come si prova senza aspettare una prenotazione vera

Serve un corpo firmato. La parola segreta è `CALCOM_WEBHOOK_SECRET` in
`.env.local` (la stessa che sta in Supabase Vault sotto `calcom_webhook_secret`):

```bash
node -e '
const {readFileSync,writeFileSync}=require("fs"), crypto=require("crypto");
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n")
  .filter(r=>r.includes("=")).map(r=>[r.slice(0,r.indexOf("=")).trim(), r.slice(r.indexOf("=")+1).trim()]));
const o=JSON.parse(readFileSync("supabase/tests/fixtures/calcom/booking_created.json","utf8"));
const b={}; for(const k of Object.keys(o)) if(!k.startsWith("_")) b[k]=o[k];
const raw=JSON.stringify(b);                     // Cal.com firma il JSON COMPATTO
writeFileSync("/tmp/prova.json", raw);
writeFileSync("/tmp/firma.txt",
  crypto.createHmac("sha256", env.CALCOM_WEBHOOK_SECRET).update(raw,"utf8").digest("hex"));
'
curl -X POST "$N8N_PUBLIC_URL/webhook/calcom-consulenze" \
     -H 'Content-Type: application/json' \
     -H "x-cal-signature-256: $(cat /tmp/firma.txt)" \
     --data-binary @/tmp/prova.json
```

La risposta è l'esito della funzione, e dice cosa è stato fatto:
`creata`, `riprogrammata`, `cancellata`, `duplicato`, `firma_non_valida`,
`event_type_non_nostro`, `designer_sconosciuto`, `viaggiatore_non_identificato`,
`prenotazione_sconosciuta`, `request_reschedule_bloccata`, `errore`.

Il payload di una fixture porta il codice XPETIS del viaggiatore di prova, che
sul database vero **non esiste**: l'esito onesto è
`viaggiatore_non_identificato`. Per vedere una riga comparire in `bookings`
bisogna sostituire `payload.responses.xpetis_user_id.value` con l'`id` di una
riga vera di `travelers`, e `payload.uid` con un codice non ancora usato.

### Quando qualcosa non torna, si guarda invece di indovinare

```bash
curl -s "$N8N_PUBLIC_URL/api/v1/executions?workflowId=rkhzLOHO64kDeGFc&limit=5&includeData=true" \
     -H "X-N8N-API-KEY: $N8N_API_KEY"
```

E dal lato database, il diario di tutto quello che è arrivato:

```sql
select received_at, event_type, external_id, processed_at, error
  from webhook_events where provider = 'cal'
 order by received_at desc limit 20;
```

Un messaggio con `processed_at` nullo e `error` pieno si è fermato su un guasto:
è di proposito, così il ritentativo di Cal.com riprova invece di scartarlo come
duplicato. Gli alert operativi (designer sconosciuto, servizio senza prezzo,
*Request reschedule* del designer) stanno in `team_alerts`.

---

## `stripe-pagamenti.json` — Stripe → `payments` e `bookings`

Il ponte che trasforma i messaggi di Stripe in incassi registrati e consulenze
confermate. **Stessa forma dell'altro, di proposito**: quattro nodi, nessuna
decisione in n8n, tutta la logica in una funzione Postgres. Due ponti identici
nella forma sono due ponti che una persona sola può tenere in testa.

| | |
|---|---|
| Workflow su n8n | **da importare** — *Stripe → payments · consulenze* |
| Indirizzo che si dà a Stripe | `https://<istanza n8n>/webhook/stripe-pagamenti` |
| Credenziale usata | *Supabase XPETIS · chiave secret (server)*, tipo **Header Auth**, header `apikey` |
| Eventi da iscrivere su Stripe | `checkout.session.completed`, `checkout.session.expired`, `charge.refunded` |
| Provato in produzione | **non ancora**: il workflow è scritto e versionato, l'endpoint su Stripe va ancora creato |

### I quattro nodi

```
Webhook  →  Corpo grezzo e firma  →  stripe_webhook()  →  Sempre 2xx
(POST)         (Code)                (HTTP Request)      (Respond to Webhook)
```

Vale parola per parola quello che è scritto sopra per `calcom-consulenze`: *Raw
Body* acceso, il nodo Code che decodifica i byte perché nessuna espressione di
n8n sa toccare un buffer, il fallimento rumoroso se i byte grezzi non arrivano,
e il 200 qualunque sia l'esito.

**L'unica differenza è il nome dell'header**: `stripe-signature` invece di
`x-cal-signature-256`. Il *contenuto* invece è tutt'altra cosa, ed è la ragione
per cui il ponte Stripe non è una copia dell'altro:

> Stripe manda `t=<timestamp>,v1=<hex>` e firma **`"<t>.<corpo>"`**, non il solo
> corpo. C'è anche una **finestra di tolleranza di 5 minuti**: senza quella, una
> firma valida intercettata resterebbe valida per sempre. Tutto questo vive in
> `stripe_signature_ok()` (migration 0039), non qui: n8n passa header e corpo e
> non li guarda.

Perché `Sempre 2xx` conta ancora di più che con Cal.com: Stripe disattiva
un endpoint che risponde male troppe volte, e quell'endpoint è l'unico modo che
abbiamo di sapere che una consulenza è stata pagata.

### Come si importa la prima volta

1. n8n → *Workflows* → **Import from File** → `stripe-pagamenti.json`.
2. Il nodo `stripe_webhook()` arriva **senza credenziale**: aprilo e scegli la
   credenziale **Header Auth** già esistente *Supabase XPETIS · chiave secret
   (server)* — è la stessa dell'altro ponte, non se ne crea una seconda.
3. Controlla **path `stripe-pagamenti`** e **Raw Body** acceso.
4. Attiva il workflow e copia l'indirizzo di produzione.
5. Su Stripe (sandbox) → *Developers → Webhooks → Add endpoint*: quell'indirizzo,
   e i tre eventi della tabella qui sopra.
6. Stripe mostra lo **signing secret** `whsec_…` una volta sola. Mettilo nel
   password manager **e** in Supabase Vault, dal SQL Editor:

   ```sql
   select vault.create_secret('<lo signing secret>', 'stripe_webhook_secret',
                              'Firma dei webhook Stripe (header Stripe-Signature)');
   ```

   Finché quel segreto non c'è, il ponte rifiuta **ogni** messaggio: la funzione
   non può verificare le firme e lo dice invece di lasciar passare.

⚠️ **Si aggiorna il workflow esistente, non se ne crea uno nuovo.** Come per
Cal.com: un workflow nuovo prende un path nuovo, e Stripe continuerebbe a puntare
al vecchio. Dall'API, una volta noto l'id:

```bash
curl -X PUT "$N8N_PUBLIC_URL/api/v1/workflows/<id>" \
     -H "X-N8N-API-KEY: $N8N_API_KEY" -H 'Content-Type: application/json' \
     -d @n8n/stripe-pagamenti.json
```

### Come si prova senza pagare davvero

Come per Cal.com, serve un corpo firmato — ma la firma si costruisce diversamente
(`t` dentro l'HMAC, e non più vecchia di 5 minuti). La parola segreta è
`STRIPE_WEBHOOK_SECRET` in `.env.local`, la stessa che sta in Vault:

```bash
node -e '
const {readFileSync,writeFileSync}=require("fs"), crypto=require("crypto");
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n")
  .filter(r=>r.includes("=")).map(r=>[r.slice(0,r.indexOf("=")).trim(), r.slice(r.indexOf("=")+1).trim()]));
const o=JSON.parse(readFileSync("supabase/tests/fixtures/stripe/checkout_session_completed.json","utf8"));
const b={}; for(const k of Object.keys(o)) if(!k.startsWith("_")) b[k]=o[k];
const raw=JSON.stringify(b);
const t=Math.floor(Date.now()/1000);              // DEVE essere adesso: 5 minuti di tolleranza
writeFileSync("/tmp/stripe.json", raw);
writeFileSync("/tmp/stripe-firma.txt", `t=${t},v1=` +
  crypto.createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`,"utf8").digest("hex"));
'
curl -X POST "$N8N_PUBLIC_URL/webhook/stripe-pagamenti" \
     -H 'Content-Type: application/json' \
     -H "Stripe-Signature: $(cat /tmp/stripe-firma.txt)" \
     --data-binary @/tmp/stripe.json
```

La risposta è l'esito della funzione: `confermata`, `scaduta`, `duplicato`,
`gia_confermata`, `gia_chiusa`, `importo_non_combacia`,
`pagamento_non_ancora_incassato`, `pagamento_su_prenotazione_chiusa`,
`prenotazione_sconosciuta`, `pagamento_sconosciuto`, `rimborso_annotato`,
`evento_non_gestito`, `firma_non_valida`, `corpo_non_json`,
`corpo_non_riconosciuto`, `errore`.

La fixture punta a una prenotazione che sul database vero **non esiste**: l'esito
onesto è `prenotazione_sconosciuta`, con il suo alert. Per vedere una conferma
vera bisogna sostituire `data.object.metadata.booking_id` e
`data.object.client_reference_id` con l'id di una riga `bookings` in
`pending_payment`, e `data.object.id` con la sua sessione.

### Quando qualcosa non torna

```sql
select received_at, event_type, external_id, processed_at, error
  from webhook_events where provider = 'stripe'
 order by received_at desc limit 20;
```

E gli alert operativi — importo che non combacia, pagamento senza prenotazione,
pagamento su uno slot già liberato — stanno in `team_alerts` con `kind` che
comincia per `stripe_`.
