# XPETIS · inventario dei servizi e degli accessi

> ## ⛔ Qui non si scrivono segreti
>
> Nessuna chiave, password, token o secret in questo file. Un repository — anche
> privato — finisce su più computer, in più backup e in ogni copia che qualcuno
> fa della cartella: una chiave che ci passa va considerata compromessa.
>
> Qui c'è **dove sta ogni cosa**, non **cos'è**. I valori vivono nel password
> manager e nelle variabili d'ambiente dei servizi.
>
> Le uniche cose scritte per esteso sono quelle **pubbliche per progetto**: URL,
> identificatori di progetto e la chiave publishable di Supabase, che finisce
> comunque nel browser di chiunque apra il sito.

Aggiornato all'8 settembre 2026. Se cambia qualcosa, si aggiorna qui.

> **Un segreto esposto si chiude ruotandolo, non cancellandolo.** Toglierlo da un
> file non lo toglie dalla storia di git, dai backup, né dalle copie che qualcuno
> ha già. Vale per il client secret di Google (ruotato l'8 settembre) e vale per
> la password del database, **che è ancora quella dei primi otto commit**.

---

## Riepilogo

| Servizio | A cosa serve | Piano oggi | Stato |
|---|---|---|---|
| **Supabase** | Database, Auth, Storage | Free | ✅ attivo, progetto di sviluppo |
| **Vercel** | Sito Next.js | Hobby | ✅ attivo · **serve Pro prima del pubblico** |
| **GitHub** | Repository | privato | ✅ attivo |
| **Google Cloud** | Login Google (OAuth) | gratuito | ✅ attivo e provato |
| **Railway** | Host di n8n (+ landing page esistente) | Hobby $5 | ✅ attivo |
| **n8n** | Automazioni, webhook, timer | self-hosted | ✅ in piedi, 1 workflow |
| **Cal.com** | Calendario delle consulenze | Free | 🟡 account di prova, non i 25 |
| **Stripe** | Pagamenti | sandbox | 🟡 test mode, **attivazione bloccata** |
| **Figma** | Design | — | ✅ file condiviso |
| **Dominio `xpetis.it`** | Sito e mail | — | 🟡 landing page attiva, DNS non toccato |
| **Provider email** | Le 15 mail del funnel | — | ⚪ **da creare** (rimandato) |
| **WhatsApp** | Canale umano | — | 🟡 numero provvisorio, da sostituire |
| **Stripe agenzia** | Incassi All Inclusive | — | ⚪ quando ci sarà un'agenzia |

---

## Supabase

| | |
|---|---|
| Console | supabase.com → progetto `xpetis-dev` |
| Project ref | `rsgyxbqzsxahsbdfgtbm` |
| URL | `https://rsgyxbqzsxahsbdfgtbm.supabase.co` |
| Regione | Europa |
| Proprietario | Simone |
| Piano | Free → **Pro ($25/mese) il giorno del primo pagamento vero**, perché il Free non fa backup |

**Chiave publishable** (pubblica, sta nel browser):
`sb_publishable_C23MrgaS1_j6ADcXbKpKzQ_qKFb3Auu`

**Segreti, nel password manager:**

- chiave `sb_secret_…` → variabile `SUPABASE_SECRET_KEY`, solo lato server
- password del database → serve alla CLI (`supabase link`, `db push`)

Le chiavi `anon` e `service_role` sono **legacy**: non si usano. Vedi le
convenzioni in `CLAUDE.md`.

**Non ancora creato:** il progetto di produzione. Quando si farà, ricordarsi di
**togliere `seed/0003_demo.sql`** dalla lista dei seed in `supabase/config.toml`,
altrimenti Marco Rossi e Giulia Neri finiscono in vetrina.

---

## Vercel

| | |
|---|---|
| Progetto | `xpetis-new` |
| URL | `https://xpetis-new.vercel.app` |
| Collegato a | il repository GitHub, deploy su push |
| Piano | **Hobby** |

⚠️ **Il piano Hobby è riservato all'uso non commerciale.** Va portato a **Pro
($20/mese, per postazione)** prima che il sito sia pubblico o incassi. Con quattro
persone in team, Vercel diventa la voce più cara dello stack.

**Variabili d'ambiente** (Settings → Environment Variables):

| Variabile | Segreta? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no |
| `SUPABASE_SECRET_KEY` | **sì** — mai con il prefisso `NEXT_PUBLIC_` |
| `STRIPE_SECRET_KEY` | **sì** — da aggiungere |

Le stesse servono in locale in `.env.local`, che non va in git. Il modello è in
`.env.example`.

**Da sapere:** il preset del framework si decide una volta sola all'import. Se un
giorno il sito risponde 404 dopo un deploy riuscito, è quasi sempre quello.

---

## Google Cloud · login Google

| | |
|---|---|
| Console | console.cloud.google.com |
| Progetto | `xpetis-504916` |
| Client ID | `947311069781-8nr9sb12n4kf9kfroah2ffjogtini90v.apps.googleusercontent.com` |
| Ambiti | `openid`, `userinfo.email`, `userinfo.profile` — non sensibili, nessuna verifica di Google |

**URI di reindirizzamento autorizzato** — punta a **Supabase**, non al sito:
```
https://rsgyxbqzsxahsbdfgtbm.supabase.co/auth/v1/callback
```

**Origini JavaScript:** `https://xpetis-new.vercel.app`, `http://localhost:3000`

**Segreto:** il client secret sta nel password manager **e** dentro Supabase
(Authentication → Providers → Google). Il file `client_secret_*.json` scaricato da
Google non va tenuto nella cartella: una volta incollato in Supabase non serve
più.

### ✅ Il client secret è stato ruotato — 8 settembre 2026

**Chiuso.** Secret nuovo generato su Google Auth Platform, incollato in Supabase,
login riprovato, **secret vecchio cancellato**. Quello che sta in git dal commit
`ce5aafa` **non funziona più**: è la sola cosa che chiude davvero un segreto
esposto, perché la storia di git non si ripulisce.

Il `client_id` non è cambiato — la rotazione tocca solo il secret — quindi non è
stato necessario aggiornare né i redirect URI, né le variabili di Vercel, né
`.env.local`. Il client secret vive in due posti: Supabase Auth e il password
manager.

*Come si rifà, se serve.* Google Auth Platform → **Clients** → il client →
**Add Secret**. Il nuovo nasce abilitato e il vecchio resta valido, quindi la
rotazione non ha finestre di disservizio; il massimo è **due secret per client**.
Le sessioni già aperte non si rompono: il secret serve solo nello scambio del
codice, quindi tocca i login nuovi e non chi è già dentro.

⚠️ **La trappola da ricordare la prossima volta.** Provare il login *mentre
entrambi i secret sono attivi* non dimostra niente: funzionerebbe anche con il
vecchio, quindi un incolla andato male darebbe comunque verde. Il segnale vero
si ottiene **disabilitando** il vecchio (reversibile) e riprovando; solo dopo si
cancella. La verifica oggettiva non è la pagina che si ricarica ma
`select email, last_sign_in_at from auth.users order by last_sign_in_at desc` —
quel timestamp si muove solo se lo scambio con Google è riuscito.

<details>
<summary>Com'era andata (storico)</summary>

**Non era coperto da `.gitignore`, ed è finito in git.** La riga che doveva
coprirlo era `client_secret*/.next/` — due righe finite in una — e
`client_secret*/` con la barra è un pattern di **cartella**: non ha mai
intercettato un file. Il file
`client_secret_947311069781-….apps.googleusercontent.com.json` è quindi
tracciato dal commit **`ce5aafa`** ("init nextjs project with google auth").

L'8 settembre 2026 il file è stato tolto dall'indice (`git rm --cached`),
cancellato dal disco, e la riga di `.gitignore` corretta in `client_secret*`.
**Questo non basta:** togliere un file dall'indice non lo toglie dalla storia.
Chiunque abbia o ottenga una copia del repository può leggere quel segreto con
`git show ce5aafa`, e riscrivere la storia di un repo condiviso è peggio del
problema. **Per questo si è ruotato: è la rotazione che chiude il buco, non la
cancellazione del file.**

</details>

*Cosa poteva farci chi l'aveva.* Da solo un client secret non dà accesso agli
account Google di nessuno: serve insieme al client ID per farsi passare per la
nostra applicazione nello scambio del codice OAuth, e lo scambio arriva a
Supabase, sul redirect URI registrato. È abbastanza per montare un login che
sembra XPETIS, non per entrare in un account. Va ruotato comunque, e non è una
cosa da rimandare a dopo il lancio: dopo il lancio quel client ID sarà su una
pagina pubblica.

**Da fare al lancio:** portare l'app da "Test" a "Produzione". In Test entrano
solo utenti elencati a mano, massimo 100.

---

## Railway

| | |
|---|---|
| Console | railway.com |
| Proprietario | Simone |
| Piano | Hobby, $5/mese inclusi + consumo |
| Progetti | la landing page di `xpetis.it` (preesistente) e **n8n** (nuovo) |

⚠️ **Mettere un tetto di spesa** (Account Settings → Usage): la fatturazione è a
consumo sopra i $5, e un workflow in loop è il modo classico per scoprirlo a fine
mese.

**Servizi del progetto n8n:** `n8n` + `Postgres-T-N6`.

Il database di n8n è raggiunto sulla **rete privata**
(`DB_POSTGRESDB_HOST = ${{Postgres-T-N6.RAILWAY_PRIVATE_DOMAIN}}`, porta `5432`).
Il proxy TCP pubblico resta attivo ma non lo usa nessuno: passare da lì si paga
come egress ed espone il database su un indirizzo pubblico.

---

## n8n

| | |
|---|---|
| URL | `https://n8n-production-d576.up.railway.app` |
| Webhook Cal.com | `…/webhook/calcom-consulenze` → workflow `rkhzLOHO64kDeGFc`, *Cal.com → bookings · consulenze* |
| Licenza | Sustainable Use — self-hosting per uso interno d'impresa, va bene per noi |

I workflow hanno una copia leggibile e versionata in **`n8n/`**, con le
istruzioni per reimportarli. Le credenziali **non** si esportano: nel file resta
solo il riferimento.

**Segreti, nel password manager:**

- **`N8N_ENCRYPTION_KEY`** — 🔴 **l'unico valore irrecuperabile di tutta
  l'infrastruttura.** Cifra tutte le credenziali salvate dentro n8n: se cambia o
  si perde, diventano illeggibili e si rifanno una per una. Nessun volume è
  montato, quindi vive solo come variabile d'ambiente su Railway.
- **account proprietario di n8n** (email + password) — è l'unica porta
  dell'istanza: chi entra legge tutte le credenziali che ci sono dentro.

**Credenziali dentro n8n:**

- ✅ *Supabase XPETIS · chiave secret (server)* — tipo **Header Auth**, header
  `apikey`, valore la chiave `sb_secret_…`. Creata il 6 settembre 2026, la usa
  il ponte Cal.com per chiamare `calcom_webhook()` via PostgREST.
- ⚪ da creare quando serviranno: Stripe, provider email.

Configurazione: fuso `Europe/Rome` (le pianificazioni si leggono in quel fuso),
potatura dello storico esecuzioni a 14 giorni, dati binari in memoria — perché
**i file non passano mai dentro n8n**, si mandano link firmati.

---

## Cal.com

| | |
|---|---|
| Piano | Free, **un account per designer** |
| Account di prova | username `marco-rossi-xpetis` (account personale di Simone) |
| Event type | `consulenza-xpetis-30` |

**Segreto, nel password manager:** la **parola segreta del webhook**, che deve
essere **identica su tutti i 25 account**. Se non combacia con quella salvata da
noi, il ponte rifiuta tutte le prenotazioni di quel designer — e il sintomo è
"le prenotazioni di Mario non arrivano".

Dal 6 settembre 2026 quella parola vive in **due posti, entrambi fuori dal
repository**, e devono restare d'accordo:

| Dove | Chi la usa |
|---|---|
| **Supabase Vault**, secret `calcom_webhook_secret` | La funzione `calcom_webhook()` la legge per verificare la firma di ogni messaggio |
| `CALCOM_WEBHOOK_SECRET` in `.env.local` (non versionato) | Serve solo a firmare i payload di prova e a far verificare all'harness le firme vere delle fixture |

Si scrive nel Vault una volta sola, dal SQL Editor:

```sql
select vault.create_secret('<la parola segreta>', 'calcom_webhook_secret',
                           'Firma dei webhook Cal.com (x-cal-signature-256)');
```

Per **ruotarla** serve cambiarla in tre punti nello stesso giro: sui webhook dei
designer su Cal.com, nel Vault e in `.env.local`. Nel mezzo il ponte rifiuta i
messaggi con `firma_non_valida`, che è il comportamento giusto ma va fatto in
una finestra tranquilla.

**Da sapere sui 25 account:** ognuno è di proprietà del designer, con le sue
credenziali che noi non abbiamo e non ci servono. La procedura completa è in
`ONBOARDING_CALCOM_TD.md`. Non serve nessuna API key: per cancellare una
prenotazione basta il suo codice.

**Non ancora creato:** l'account di regia XPETIS separato. Oggi il modello vive
su un account personale di prova.

---

## Stripe

| | |
|---|---|
| Console | dashboard.stripe.com |
| Stato | **sandbox / test mode** |
| Piano | commissioni 1,5% + €0,25 su carta europea |

**Segreti, nel password manager:**

| Cosa | Dove vive | A cosa serve |
|---|---|---|
| Chiave `sk_test_…` | `STRIPE_SECRET_KEY` in `.env.local` e nelle variabili di Vercel | Apre le Checkout Session dal nostro server |
| Signing secret `whsec_…` | `STRIPE_WEBHOOK_SECRET` in `.env.local` **e** Supabase Vault sotto `stripe_webhook_secret` | Verifica la firma dei webhook, dentro `stripe_webhook()` |

Nessuna chiave pubblicabile e nessun Stripe.js nel browser: usiamo Checkout
ospitato, quindi il server crea la sessione e reindirizza.

Lo signing secret Stripe lo mostra **una volta sola**, alla creazione
dell'endpoint. Va nel password manager e in Vault:

```sql
select vault.create_secret('<lo signing secret>', 'stripe_webhook_secret',
                           'Firma dei webhook Stripe (header Stripe-Signature)');
```

Senza quella riga il ponte rifiuta ogni messaggio invece di lasciar passare: è
voluto. La copia in `.env.local` serve solo a poter firmare un corpo di prova
(vedi `n8n/LEGGIMI.md`).

🔴 **L'attivazione dei pagamenti reali è bloccata: non esiste un'entità legale
XPETIS.** È il percorso critico del progetto, non la tecnica. La decisione "chi è
il venditore" è aperta — vedi i rischi in `PIANO.md`.

**Da non fare:** creare prodotti, prezzi o Payment Link. Il prezzo vive solo nel
database; la cassa la apre il nostro server.

**L'endpoint webhook.** Punta al workflow n8n `stripe-pagamenti`
(`https://<istanza n8n>/webhook/stripe-pagamenti`) e va iscritto a tre eventi:
`checkout.session.completed`, `checkout.session.expired`, `charge.refunded`. La
procedura completa sta in `n8n/LEGGIMI.md`. **Al 7 settembre 2026 l'endpoint non
è ancora creato**: il ponte e il workflow ci sono e sono verdi sull'harness, ma
nessun messaggio vero è ancora passato.

---

## Figma

| | |
|---|---|
| File | `x1DYYagZ2moagmpEHZHYYE` |
| Nodi | elencati in `CLAUDE.md` |

Gli asset esportati si riscaricano con `bash scripts/scarica-asset-figma.sh`.
**Le URL degli asset scadono in circa 7 giorni**; la chiave del file no.

---

## Dominio, email, WhatsApp

**`xpetis.it`** è nostro e ospita una landing page su Railway. **Il DNS non si
tocca** per ora: in sviluppo si usa l'URL provvisorio di Vercel.

**Provider email: da creare.** Deciso Resend (3.000 mail/mese gratis, che a
volume Beta bastano). Servirà autenticare il dominio con SPF, DKIM e DMARC —
partendo da `p=none` e stringendo dopo. ⚠️ Di record SPF **ne esiste uno solo per
dominio**: se ce n'è già uno, va fuso, non aggiunto.

Fra dominio autenticato e primo viaggiatore vero va lasciata **almeno una
settimana**: la reputazione di invio si scalda in giorni.

**WhatsApp:** **+39 347 891 1018**, deciso il 6 settembre 2026. È un numero
**provvisorio e personale**, prestato al progetto per non tenere fermo lo
sviluppo: va sostituito con un numero dedicato prima del pubblico. Restano da
decidere chi lo presidia e in quali orari.

⚠️ **Il numero sta in `app_config`, non nel codice.** Cambiarlo è una riga da
Studio, non un deploy — è l'unico modo perché la sostituzione sia indolore.
I gruppi si creano a mano: le API non permettono di crearli.

---

## Checklist dei segreti che devono esistere nel password manager

```
[ ] Supabase · chiave sb_secret_
[ ] Supabase · password del database           ← 🔴 DA RUOTARE: è in git dai primi 8 commit
[ ] Google Cloud · OAuth client secret         ← ✅ ruotato l'8 set 2026, il vecchio non funziona più
[ ] Railway · accesso all'account
[ ] n8n · N8N_ENCRYPTION_KEY        ← irrecuperabile
[ ] n8n · account proprietario (email + password)
[ ] Cal.com · parola segreta del webhook (una per tutti i 25)
                                    ← anche in Supabase Vault: calcom_webhook_secret
[ ] Stripe · chiave sk_test_
[ ] Stripe · webhook signing secret whsec_     (quando l'endpoint esisterà)
                                    ← anche in Supabase Vault: stripe_webhook_secret
[ ] Provider email · API key                   (quando esisterà)
[ ] Stripe dell'agenzia · credenziali          (quando esisterà — e vedi sotto)
```

Le credenziali Stripe delle agenzie **non vanno in una colonna del database**:
`agencies` contiene solo un riferimento alla credenziale custodita altrove. Ed è
ancora aperta la valutazione di Stripe Connect, che otterrebbe lo stesso
risultato senza che XPETIS detenga credenziali di terzi.

---

## Cosa si recupera e cosa no

Vale la pena saperlo prima, non dopo.

| Se si perde… | Si recupera? |
|---|---|
| Password del database Supabase | **Sì**, si rigenera dalla console |
| Chiave `sb_secret_` | **Sì**, si ruota dalla console (poi va aggiornata dove è usata) |
| Client secret di Google | **Sì**, *Add Secret* sul client: il nuovo nasce vivo accanto al vecchio, senza disservizio (massimo due) |
| Chiave `sk_test_` di Stripe | **Sì**, si ruota |
| Signing secret del webhook Stripe | **Sì**, si rigenera dall'endpoint — poi va riscritto in Vault |
| Parola segreta del webhook Cal.com | **Sì**, ma va riscritta su tutti i 25 account a mano |
| Account proprietario di n8n | **Sì**, con accesso al database di n8n |
| **`N8N_ENCRYPTION_KEY`** | 🔴 **No.** Le credenziali dentro n8n diventano illeggibili e si rifanno una per una |
