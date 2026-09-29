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
| **Provider email** | Le 15 mail del funnel | Resend, Free | ✅ **esiste già** — account della landing page, `xpetis.it` verificato |
| **WhatsApp** | Canale umano | — | 🟡 numero provvisorio, da sostituire |
| **Stripe agenzia** | **Tutti gli incassi** (conto unico, 27 set 2026) | — | 🟡 da aprire insieme all'agenzia — vedi «Il conto dell'agenzia» |

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
- ✅ *Resend · invio transazionale* — tipo **Header Auth**, header
  `Authorization`, valore `Bearer re_…`. La usa il nodo *Manda con Resend*
  dell'orologio (20 settembre 2026).
  ⚠️ **Non è la stessa Header Auth di Supabase**: quella manda `apikey`, questa
  manda `Authorization`. Sceglierla sbagliata su un nodo dà un 401 che sembra
  una chiave revocata, e si perde mezz'ora a guardare nel posto sbagliato.
- ⚪ da creare quando servirà: Stripe (oggi il ponte Stripe non chiama Stripe,
  riceve e basta).

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

### Il conto dell'agenzia (deciso il 27 settembre 2026)

**Esiste un conto Stripe solo, ed è dell'agenzia.** Lo si apre insieme, nasce
**dedicato a XPETIS**, e Simone ci ha un ruolo admin. Niente Stripe Connect:
richiederebbe che XPETIS sia un'entità legale attivata su Stripe, e non lo è
(deviazione 9 in `PIANO.md`). La sandbox qui sopra resta il posto delle prove.

| Cosa | Dove vive | A cosa serve |
|---|---|---|
| **Chiave ristretta** `rk_live_…` (e `rk_test_…` per le prove) | Password manager **e** Supabase Vault, sotto il nome scritto in `agencies.stripe_credential_ref` (proposta: `stripe_key_agenzia_partner`) | Apre, rilegge e chiude le Checkout Session sul conto dell'agenzia |
| Signing secret `whsec_…` dell'endpoint sul loro conto | Password manager **e** Vault sotto `stripe_webhook_secret` — lo stesso nome di oggi: **l'endpoint è uno** | Verifica la firma dei webhook, dentro `stripe_webhook()` |

⚠️ **La chiave è ristretta, non la secret key.** Permessi: **Checkout Sessions
in scrittura** (crea, rilegge, chiude) e nient'altro — in particolare **niente
rimborsi**: si fanno a mano dalla dashboard, col ruolo admin. La funzione
`agency_stripe_key()` rifiuta una chiave che non cominci per `rk_`, così una
`sk_` incollata per sbaglio non passa. Da verificare in S-12, con un pagamento
di prova, che quei permessi bastino davvero alle tre chiamate.

```sql
select vault.create_secret('<rk_live_…>', 'stripe_key_agenzia_partner',
                           'Chiave ristretta Stripe del conto dell''agenzia');
update agencies set stripe_credential_ref = 'stripe_key_agenzia_partner'
 where is_default_partner;
```

La chiave non sta in una variabile d'ambiente perché **è dell'agenzia e la può
revocare**: se succede, si sostituisce la riga in Vault e basta, senza deploy.
Il passaggio al conto vero sono poi tre righe di `app_config` —
`consultation_stripe_account`, `custom_itinerary_stripe_account`,
`all_inclusive_stripe_account` — da `xpetis` ad `agency`, da Studio.

**Cosa si accetta con questa scelta, da tenere a mente:**

- l'accesso è **revocabile dall'agenzia** in qualunque momento, e con lui la
  capacità del sito di aprire una cassa;
- le **contestazioni** (chargeback) si pagano **dal loro saldo**, e i rimborsi
  sono un gesto loro o del ruolo admin;
- **ogni euro di XPETIS**, consulenze comprese, passa prima dal conto di
  qualcun altro. La quota XPETIS arriva per fatturazione fra le parti.

Da qui la **riconciliazione mensile**, che è un punto aperto vero e non un
dettaglio: se un webhook si perde, il pagamento è sul loro conto e non nel
nostro database, il buco è a nostro sfavore e nessuno se ne accorge. Non è
costruita: va decisa con Andrea (`PIANO.md`, milestone 7).

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
| File | **`Q9Krydv6xD8mFJCtU9NHzr`** («XPETIS - Def»), dal 27 settembre 2026 |
| File superato | `x1DYYagZ2moagmpEHZHYYE`: le pagine costruite fino al 27 settembre vengono da qui. Non è più autorevole |
| Nodi | elencati in `CLAUDE.md`. Home, ricerca e quiz non hanno ancora un nodo sul file nuovo |

Gli asset esportati si riscaricano con `bash scripts/scarica-asset-figma.sh`.
**Le URL degli asset scadono in circa 7 giorni**; la chiave del file no.

---

## Dominio, email, WhatsApp

**`xpetis.it`** è nostro e ospita una landing page su Railway. **Il DNS non si
tocca** per ora: in sviluppo si usa l'URL provvisorio di Vercel.

**Provider email: ✅ esiste già — Resend, dal 20 settembre 2026.** Non è stato
creato adesso: l'account Resend è **quello del progetto della landing page**, il
dominio `xpetis.it` è già verificato (SPF, DKIM, Return-Path) e il giro funziona
in produzione con `RESEND_FROM = info@xpetis.it`.

Questo **chiude S-04**, che era la coda più lunga del piano, e cancella
l'attesa della settimana di riscaldamento: il dominio spedisce già.

Piano gratuito: **3.000 mail/mese e 100 al giorno**, 3 domini verificati, e
**10 richieste al secondo** per team — verificato sulla documentazione il 20
settembre 2026. Il limite al secondo è quello che si incontra per primo se
l'orologio ha più mail in coda nello stesso giro: per questo il nodo n8n manda
un item per volta con 250 ms di pausa, e `app_config.email_max_per_tick` limita
quante ne escono per giro.

**In uso dal 20 settembre 2026**, dal workflow *Orologio · scadenze XPETIS*
(`n8n/orologio.json`, nodo *Manda con Resend*). L'interruttore è
`app_config.email_enabled` e **nasce spento**: a interruttore spento le mail si
compongono e si accodano lo stesso in `outbound_messages`, dove si leggono su
Studio esattamente come le leggerà un cliente. Accenderlo è il gesto che fa
partire posta vera.

⚠️ Tre conseguenze del riuso, da non perdere di vista:

- **Il tetto giornaliero è condiviso con la landing page.** 100 al giorno si
  bruciano in minuti se un workflow entra in ciclo. La difesa è il vincolo di
  unicità di `outbound_messages` su `(message_kind, entity_type, entity_id,
  recipient)`: una mail per tipo, entità e destinatario, anche se l'orologio
  rigira. Da oggi quella riga vale anche come tetto di spesa.
- **Chiave API separata per XPETIS.** Oggi ce n'è una sola, usata da due
  progetti: ruotarla per uno rompe l'altro, e una fuga da uno espone entrambi.
  Resend permette più chiavi, anche con permesso di solo invio. Da fare prima
  che il secondo progetto vada in produzione.
- **La reputazione è condivisa con la landing page.** Oggi è innocuo — quella
  manda notifiche al team, non marketing a sconosciuti. Diventa un problema il
  giorno che da `xpetis.it` parte una newsletter: allora le transazionali vanno
  spostate su un sottodominio (`mail.xpetis.it`), che è la separazione che
  Resend stesso consiglia. Deciderlo prima, non dopo il primo invio di massa.

**Da decidere, e non è tecnico:** `info@xpetis.it` è l'indirizzo mittente, quindi
**è lì che arrivano le risposte** — "posso spostare la call?", "il link non
funziona". Il Flusso manda il canale umano su WhatsApp e non dice niente di
quella casella. Chi la legge, e con che tempi?

DMARC su `_dmarc.xpetis.it` partendo da `p=none` resta da verificare se c'è.
⚠️ Di record SPF **ne esiste uno solo per dominio**: se ce n'è già uno, va fuso,
non aggiunto.

**Le notifiche interne e il digest (0045, 0050)** vanno agli indirizzi di
`app_config.team_notify_recipients`: per la Beta i tre indirizzi **personali**
di Simone, Alessandro e Andrea (confermato il 28 settembre 2026), poi una
casella dedicata. Gli indirizzi non stanno nel repository: la riga nasce vuota
nel seed e si scrive da Studio. Dal 29 settembre ci passa anche il **digest
giornaliero** (`team_digest_hour`): al massimo una mail al giorno per indirizzo,
che conta sul tetto dei 100 di Resend condiviso con la landing page.

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
[ ] Resend · API key                           ← condivisa con la landing page: servirne una per XPETIS
                                    ← anche dentro n8n: credenziale Header Auth "Resend · invio transazionale"
[ ] Stripe dell'agenzia · chiave ristretta rk_  (quando il conto esisterà)
                                    ← anche in Supabase Vault, sotto agencies.stripe_credential_ref
[ ] Stripe dell'agenzia · whsec_ del suo endpoint
                                    ← in Supabase Vault al posto di quello della sandbox: stripe_webhook_secret
```

Le credenziali Stripe dell'agenzia **non vanno in una colonna del database**:
`agencies.stripe_credential_ref` porta solo il **nome** del segreto in Vault.
Stripe Connect è stato scartato il 27 settembre 2026: vedi «Il conto
dell'agenzia» qui sopra.

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
| Chiave ristretta del conto dell'agenzia | **Sì**, la rigenera chi ha il ruolo admin — poi va riscritta in Vault. Se è l'agenzia a revocarla, le casse smettono di aprirsi finché non ce n'è una nuova |
| Parola segreta del webhook Cal.com | **Sì**, ma va riscritta su tutti i 25 account a mano |
| Chiave API di Resend | **Sì**, si rigenera — ma finché è **una sola condivisa con la landing page**, ruotarla per un progetto rompe l'altro. È la ragione per cui serve una chiave separata prima della produzione |
| Account proprietario di n8n | **Sì**, con accesso al database di n8n |
| **`N8N_ENCRYPTION_KEY`** | 🔴 **No.** Le credenziali dentro n8n diventano illeggibili e si rifanno una per una |
