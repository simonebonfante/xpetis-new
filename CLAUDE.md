# XPETIS — contesto di progetto

Leggi questo file all'inizio di ogni sessione. La fonte di verità sul prodotto è
`XPETIS Flusso Completo.docx` (16 luglio 2026), **superata su cinque punti dalla
tabella "Deviazioni dal Flusso" in `PIANO.md`**: quella tabella vince. Stato dei
lavori e prossimi passi sono in `PIANO.md`.

**Come si lavora.** Si procede solo su via esplicito di Simone: è lui a dettare
gli avanzamenti, milestone per milestone. Non anticipare task non richiesti.

**Perimetro.** Solo la parte tecnica. Design (Figma), flusso, tassonomia
geografica e contenuti dei 25 Travel Designer esistono già e arrivano come
input: non sono lavoro nostro. I profili TD non si scrivono a mano, si
importano dal JSON prodotto dal form `Vetrina TD (2).html`.

## Cos'è

Un marketplace di consulenza di viaggio. Il viaggiatore arriva sul sito, cerca
per destinazione o fa un quiz, trova i Travel Designer più affini, prenota una
consulenza da 30 minuti a pagamento e — se vuole — dopo la call acquista un
itinerario su misura o un viaggio All Inclusive.

Team: Simone (tecnica), Chiara (design), Gaia (comunicazione), Alessandro e
Andrea (business). Il documento di flusso indica per ogni pezzo chi deve fare
cosa.

## I quattro principi

1. **Il Travel Designer non ha login.** Opera solo tramite link con token che
   riceve via mail. Tutto il resto passa da WhatsApp e dal team.
2. **Supabase è l'unica fonte di verità.** Ogni stato di ogni ordine vive lì.
3. **Silenzio-conferma.** Se nessuno segnala un problema, le cose si chiudono da
   sole (48 ore dopo la call, 5 giorni dopo la consegna).
4. **L'umano entra sull'eccezione, mai sulla routine.**

## Lo stack

Niente backend classico: si tiene tutto insieme con servizi gestiti.

| Strumento | Ruolo |
|---|---|
| **Next.js** (App Router, TypeScript, Tailwind, shadcn/ui) | Tutte le pagine, incluse le route server-side che servono le pagine token |
| **Supabase** | Database (fonte di verità), Auth (solo Google), Storage (documenti di viaggio). Progetto di sviluppo: `rsgyxbqzsxahsbdfgtbm` |
| **Supabase Studio** | Pannello operativo del team |
| **n8n** | Tutte le automazioni: webhook Cal.com e Stripe, mail, timer, alert |
| **Cal.com** (piano gratuito, un account per TD) | Calendario delle consulenze. È un ponte: il motore proprietario è la destinazione futura |
| **Stripe** | Pagamenti. Consulenze e su misura sul conto XPETIS; All Inclusive sul conto dell'agenzia (merchant of record, regime 74-ter) |
| **WhatsApp** | Canale umano. I gruppi si creano a mano: le API non permettono di crearli |

Colore brand: verde `#1b5e24`. Mobile first su tutte le pagine dei TD.

## Struttura del repo

```
app/            # Next.js 16, App Router
components/     # header, footer, bottone, badge a stella, suggeritore
lib/supabase/   # client browser, server (cookie) e admin (chiave secret)
public/img,logo # asset esportati dal Figma
public/fonts/   # Ronzino (Merriweather arriva da next/font)
scripts/        # scarica-asset-figma.sh (le URL Figma scadono in 7 giorni)
supabase/
  migrations/   # numerate, si applicano in ordine
  seed/         # config, tassonomia geografica generata, dati finti
  scripts/      # genera_geo.mjs: rigenera il seed geografico dal JSON
  tests/run.mjs # harness: applica tutto su PGlite, ~177 asserzioni
  README.md     # documentazione dello schema e delle decisioni
  MAPPATURA_VETRINA.md  # form Vetrina TD → schema
  MAPPATURA_CALCOM.md   # messaggi Cal.com → schema, da payload veri
PIANO.md              # milestone, task, avanzamenti, deviazioni, stime
ACCESSI.md            # inventario dei servizi esterni e dove vivono i segreti
ONBOARDING_CALCOM_TD.md  # procedura per i 25 designer
```

## Comandi

```bash
npm run dev            # sito su localhost:3000; /prova verifica login e trigger
npm run build
npm run test:schema    # harness dello schema, deve restare verde
bash scripts/scarica-asset-figma.sh   # riscarica gli asset del design
```

## Design

Il Figma è la fonte per tutte le pagine pubbliche: usa il connettore Figma e
leggi la skill design-to-code **prima** di scrivere codice da un design. I token
del design system stanno in `app/globals.css` sotto `@theme`.

### Chi vince, quando Figma e Flusso non dicono la stessa cosa

Il Figma **non è aggiornato al pari del Flusso**: è un disegno, e i disegni
restano indietro. Quindi:

| Materia | Fonte autorevole |
|---|---|
| Forma: colori, tipografia, spazi, gerarchia visiva, componenti | **Figma** |
| Comportamento: quando compare un elemento, cosa succede a un clic, quali stati esistono | **Flusso** |
| Contenuto: quali dati stanno in un elemento, quali servizi si comprano, quali testi | **Flusso** |

Nel dubbio si **chiede**, e finché non arriva risposta **vince il Flusso**.

Due corollari che è facile sbagliare:

- **L'assenza di qualcosa nel Figma non è una decisione.** Se il Flusso prevede
  un elemento e il disegno non lo mostra, è una domanda aperta da segnare in
  `PIANO.md`, non un punto chiuso. Vale in particolare per gli elementi che il
  Flusso stesso dichiara "da definire con Chiara".
- **Il Figma che aggiunge contenuto non previsto dal Flusso** (un filtro nuovo,
  una riga di dati) non si costruisce di iniziativa: si segnala.

File unico: **`x1DYYagZ2moagmpEHZHYYE`**, `https://www.figma.com/design/x1DYYagZ2moagmpEHZHYYE/XPETIS?node-id=<nodo>`

| Pagina | Nodo |
|---|---|
| Homepage | `160-77` |
| Ricerca / risultati | `177-262` |
| Vetrina del designer | `171-17` |
| Itinerario pronto da vivere | `261-1068` |
| Quiz | `346-932` e `346-896` |

Pagamento: **plugin Stripe**, niente pagina disegnata. Prenotazione: **iframe
Cal.com** della pagina del designer. (Deciso da Simone il 10 agosto 2026.)

Gli asset si riscaricano con `bash scripts/scarica-asset-figma.sh`: le URL degli
asset scadono in 7 giorni, la chiave del file no.

## Decisioni architetturali già prese

**Il client non parla mai con le tabelle.** RLS accesa su tutte le tabelle,
nessuna policy per `anon`, nessun privilegio diretto. Il browser legge soltanto
dalle viste `public_*`. Ogni scrittura e ogni pagina token passa da route
server-side Next.js con la service key. Se serve una lettura nuova dal client,
si aggiunge una vista — non si apre una tabella.

Attenzione: questo principio è stato violato due volte dal mio stesso schema, e
le correzioni sono in coda in `PIANO.md` (milestone 0). `public_td_profiles`
espone ad `anon` i livelli dei paesi e i valori degli assi, che il Flusso dice
invisibili: va sostituita dalla funzione `match_designers()` in
`SECURITY DEFINER`. E il `grant select on bookings to authenticated` consegna al
browser `cal_booking_uid`, che dopo la verifica di S-05 è di fatto una
credenziale: **su Cal.com per cancellare una prenotazione basta quel codice,
nessuna chiave**. Quando aggiungi una vista o un grant, chiediti sempre cosa
diventa leggibile con gli strumenti di sviluppo aperti.

**Il match si calcola solo lato server.** I numeri (bande, punteggi, affinità,
badge, salienza degli assi) in una funzione Postgres; la composizione delle frasi
dai mattoncini nella route server Next.js. Mai nel browser.

**Il prezzo esiste in un posto solo.** Le casse Stripe le apre il nostro server
leggendo l'importo dal database (deviazione dal Flusso, che prevedeva Payment
Link fissi): un Payment Link è un indirizzo pubblico e riusabile e niente lo lega
al prezzo di quella prenotazione.

**I timer stanno in un orologio unico.** Un solo workflow n8n ogni 5 minuti che
verifica tutte le scadenze dovute, non un cron per timer. In produzione la
cadenza non deve superare i 5-10 minuti: la regola dice che uno slot non pagato
resta occupato al massimo 35 minuti.

**Cal.com identifica il designer con `cal_username` + slug.** I 25 designer
copiano lo stesso event type modello, quindi lo slug da solo non identifica
nessuno. E lo slug sta in `payload.type`, non in `eventType.slug`.

**Le pagine token sono server-side.** `resolve_access_token(token)` valida e
restituisce il contesto. Il token non arriva mai al browser come credenziale
verso Supabase.

**La macchina a stati degli ordini vive nel database.** Le transizioni ammesse
stanno in `order_status_transitions` e un trigger le impone, insieme ai vincoli
del flusso (niente proposta All Inclusive senza documento, prezzo e agenzia;
niente consegna senza file). Un workflow n8n sbagliato viene fermato dal
database invece di produrre un ordine incoerente.

**Nessun numero di prodotto nel codice.** I pesi dei sei assi sono in
`quiz_axes.weight`, tutto il resto in `app_config`: una riga per parametro,
modificabile da Studio senza deploy. Il sito li legge dalla vista
`public_config`.

**Idempotenza per costruzione.** `webhook_events` (unico per provider +
external_id), `payments` (un solo incasso riuscito per entità e tipo),
`outbound_messages` (una mail per tipo, entità e destinatario). I webhook
ritentano e i timer rigirano: il database deve renderlo innocuo.

**Ogni cambio di stato è attribuito.** Le tabelle `bookings` e `orders` hanno
`last_actor`; i trigger scrivono la storia in `booking_status_history` e
`order_status_history`. Dato che il TD non ha login, quella riga è l'unica prova
di chi ha agito.

## Convenzioni

- SQL e nomi di colonna in inglese; commenti, `label_it` e contenuti in
  italiano.
- Il verso di un asse si legge da `quiz_axes.label_min` / `label_max`, **mai dal
  nome del codice**. È l'errore che nessuna prova tecnica intercetta.
- Le etichette delle liste chiuse (temi, contesti, opzioni degli assi, durata,
  budget, copertura legale) devono combaciare **carattere per carattere** con il
  form Vetrina TD: sono quelle stringhe che arrivano nei JSON.
- Ogni tabella nuova nasce con RLS accesa e `revoke all ... from anon,
  authenticated` esplicito: su Supabase i privilegi di default concedono le
  tabelle create dopo, e la revoca della 0016 non si eredita.
- Importi sempre in centesimi, colonne `*_cents`.
- **I file non passano mai dentro n8n.** I documenti li carica il nostro server
  su Supabase Storage; n8n manda un link firmato a scadenza, mai un allegato.
  Così l'istanza n8n non ha bisogno di disco (tutto il suo stato vive nel suo
  Postgres) e un documento di viaggio non resta per sempre in una casella email
  inoltrabile a chiunque.
- Timestamp `timestamptz`, mai `timestamp`.
- Migration numerate a quattro cifre, mai modificate dopo essere state
  applicate: si aggiunge una migration nuova.
- **Chiavi Supabase: solo quelle nuove.** `anon` e `service_role` sono legacy e
  verranno rimosse. Si usano `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`, sta
  nel browser) e `SUPABASE_SECRET_KEY` (`sb_secret_…`, solo lato server, mai in
  una conversazione né in un file versionato). Nel repo c'è la skill
  `.agents/skills/supabase-server/`: leggila prima di scrivere codice che crea
  client Supabase.
- **Estensioni e search_path.** Su Supabase `pgcrypto`, `pg_trgm` e `unaccent`
  sono già installate nello schema `extensions`, quindi
  `create extension if not exists` non fa niente e le loro funzioni non sono sul
  search_path. Su un Postgres normale finiscono in `public`. Ogni funzione o
  indice che le usa dichiara `search_path = public, extensions`: uno schema
  inesistente nel search_path viene ignorato, quindi la stessa riga funziona in
  entrambi gli ambienti. L'harness su PGlite **non** intercetta questo errore.
- Dopo ogni modifica allo schema: `cd supabase && npm run test:schema`. Deve
  restare verde.
- I file di deliverable finali vanno nella cartella del progetto, non in una
  cartella temporanea.

## Cosa non fare

- Non aggiungere policy RLS per `anon`: si aggiunge una vista `public_*`.
- Non mettere soglie, pesi o finestre temporali nel codice: vanno in
  `app_config`.
- Non far calcolare al codice il credito consulenza: lo applica il TD nella
  proposta, con spot-check del team (decisione di prodotto, non un limite
  tecnico).
- Non salvare credenziali Stripe delle agenzie in una colonna: la tabella
  `agencies` contiene solo un riferimento alla credenziale custodita altrove.
- Non presumere che Cal.com imponga i limiti di riprogrammazione: non li impone,
  è n8n a fare il controllore e ad avvisare il team.

## Punti aperti da non dimenticare

Elenco completo con i riferimenti nei commenti del codice in
`supabase/README.md`. I tre che possono cambiare l'architettura:

1. Le tre verifiche sul piano gratuito di Cal.com (webhook per account, API di
   cancellazione, prefill di un campo custom nell'embed).
2. Come custodire le credenziali Stripe delle agenzie: Vault, n8n o Stripe
   Connect.
3. Il provider di invio email transazionali, che il documento di flusso non
   nomina: senza di lui n8n non manda niente.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
