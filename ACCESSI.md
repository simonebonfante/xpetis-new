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

Aggiornato al 10 agosto 2026. Se cambia qualcosa, si aggiorna qui.

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
| **WhatsApp Business** | Canale umano | — | ⚪ da creare (S-08) |
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
Google **non va tenuto nella cartella**: è coperto da `.gitignore`, ma una volta
incollato in Supabase non serve più.

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
| Webhook Cal.com | `…/webhook/calcom-consulenze` |
| Licenza | Sustainable Use — self-hosting per uso interno d'impresa, va bene per noi |

**Segreti, nel password manager:**

- **`N8N_ENCRYPTION_KEY`** — 🔴 **l'unico valore irrecuperabile di tutta
  l'infrastruttura.** Cifra tutte le credenziali salvate dentro n8n: se cambia o
  si perde, diventano illeggibili e si rifanno una per una. Nessun volume è
  montato, quindi vive solo come variabile d'ambiente su Railway.
- **account proprietario di n8n** (email + password) — è l'unica porta
  dell'istanza: chi entra legge tutte le credenziali che ci sono dentro.

**Credenziali da creare dentro n8n** quando serviranno: Supabase, Stripe,
provider email.

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

**Segreto, nel password manager:** chiave `sk_test_…` → variabile
`STRIPE_SECRET_KEY`. Serve solo quella: usiamo Checkout ospitato, quindi il
server crea la sessione e reindirizza. Nessuna chiave pubblicabile, nessun
Stripe.js nel browser.

🔴 **L'attivazione dei pagamenti reali è bloccata: non esiste un'entità legale
XPETIS.** È il percorso critico del progetto, non la tecnica. La decisione "chi è
il venditore" è aperta — vedi i rischi in `PIANO.md`.

**Da non fare:** creare prodotti, prezzi o Payment Link. Il prezzo vive solo nel
database; la cassa la apre il nostro server.

**Da aggiungere quando n8n avrà il suo posto:** l'endpoint webhook e il suo
*signing secret*.

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

**WhatsApp Business:** numero dedicato da attivare (S-08), con chi lo presidia e
in quali orari. I gruppi si creano a mano: le API non permettono di crearli.

---

## Checklist dei segreti che devono esistere nel password manager

```
[ ] Supabase · chiave sb_secret_
[ ] Supabase · password del database
[ ] Google Cloud · OAuth client secret
[ ] Railway · accesso all'account
[ ] n8n · N8N_ENCRYPTION_KEY        ← irrecuperabile
[ ] n8n · account proprietario (email + password)
[ ] Cal.com · parola segreta del webhook (una per tutti i 25)
[ ] Stripe · chiave sk_test_
[ ] Stripe · webhook signing secret            (quando esisterà)
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
| Client secret di Google | **Sì**, se ne genera un altro |
| Chiave `sk_test_` di Stripe | **Sì**, si ruota |
| Parola segreta del webhook Cal.com | **Sì**, ma va riscritta su tutti i 25 account a mano |
| Account proprietario di n8n | **Sì**, con accesso al database di n8n |
| **`N8N_ENCRYPTION_KEY`** | 🔴 **No.** Le credenziali dentro n8n diventano illeggibili e si rifanno una per una |
