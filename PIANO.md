# XPETIS — piano di sviluppo
pwd db-> Xpet1s2026@
File unico di lavoro: piano, task, avanzamenti. Si aggiorna qui, spuntando le
caselle, e si aggiunge una riga al registro in fondo a ogni sessione.

- Contesto tecnico: `CLAUDE.md`
- Fonte di verità sul prodotto: `XPETIS Flusso Completo.docx` — **attenzione:
  superato su cinque punti, vedi "Deviazioni dal Flusso"**
- Documentazione dello schema: `supabase/README.md`
- Mappatura form vetrina → schema, con le 11 migration da scrivere:
  `supabase/MAPPATURA_VETRINA.md`
- Mappatura messaggi Cal.com → schema, ricavata da un messaggio vero:
  `supabase/MAPPATURA_CALCOM.md`
- Confronto con il piano di Alessandro: `XPETIS_CONFRONTO_PIANI.md`

**Regola di ingaggio:** si lavora solo su via esplicito di Simone. Gli
avanzamenti li detta lui.

**Perimetro:** solo la parte tecnica. Design, flusso, tassonomia e contenuti dei
25 Travel Designer esistono già e arrivano come input. Non sono task nostri e
non li stimiamo.

Legenda: **[C]** lo faccio io (Claude) · **[S]** lo fai tu (Simone) · **[B]**
business (Alessandro e Andrea)

---

## Da dove ripartire

**Stato a fine 8 agosto 2026.**

Milestone 0 **chiusa**: 31 migration, 177 asserzioni verdi, schema applicato al
progetto Supabase vero. Milestone 1 **a metà**: geografia importata, import delle
25 vetrine rimandato alla fine per scelta. Milestone 2 **quasi chiusa**:
Supabase, Vercel, login Google, n8n e Cal.com sono in piedi e provati.

Il ponte Cal.com ha già consegnato il suo primo messaggio vero, ed è mappato in
`supabase/MAPPATURA_CALCOM.md`.

### Cosa resta a te

- **S-08**, numero WhatsApp. Non dipende da nulla, mezz'ora.
- **Stripe**: fermo sulla questione societaria, non sulla tecnica.
- **Il link Figma.** È la cosa che sblocca più lavoro di tutte: la milestone 3
  sono 6-8 sessioni ed è ferma solo su quello.
- **Portare ad Alessandro e Andrea la domanda "chi è il venditore"** — è
  diventata il percorso critico del progetto.

### Cosa posso fare io, in ordine di utilità

1. **Le route server per le pagine token** (`resolve_access_token` è già pronta
   nel database). Non dipende dal design né da nulla di tuo, ed è l'impalcatura
   su cui poggiano milestone 5, 6 e 7.
2. **Il ponte Cal.com → `bookings` in n8n**, ora che abbiamo il messaggio vero e
   la mappatura dei campi. Si può scrivere e provare subito con l'account di
   prova.
3. **Il suggeritore destinazioni** sulla tassonomia: è logica, non grafica, e
   funziona indipendentemente da come sarà disegnata la barra di ricerca.
4. La milestone 3 vera e propria, appena arriva il Figma.

---

## Materiali in arrivo

| Materiale | Serve per | Stato |
|---|---|---|
| Link Figma delle pagine | Milestone 3, 4, 6, 7, 8 | ✅ arrivati il 10 agosto — file `x1DYYagZ2moagmpEHZHYYE`, nodi in `CLAUDE.md` |
| Dataset geografico (129 stati, 244 regioni, 1.220 città) | Import geo, suggeritore, bande del match | ⏳ me lo incolli — versione normalizzata da Alessandro |
| `GUIDA_PONTE_CALCOM.md` + fixture dei 7 messaggi veri | Nomi veri dei campi Cal.com e prove del ponte | ⏳ me lo incolli |
| JSON delle 25 vetrine compilate | Import profili TD | ⏳ da produrre dal form HTML |
| `Vetrina TD (2).html` | È il form che produce quel JSON | ✅ in cartella |
| `XPETIS_CONFRONTO_PIANI.md` | Merge dei due piani | ✅ in cartella, lavorato |
| Testi delle mail transazionali | Milestone 4 in poi | ✅ deciso: si costruisce con segnaposto e si sostituisce dopo |

---

## Deviazioni dai documenti di riferimento

Il Flusso dice di sé che va aggiornato quando una decisione cambia. **Non lo
aggiorniamo ora per scelta:** le deviazioni vivono qui. Chi legge il `.docx` su
questi punti sta leggendo regole superate. L'ultima riga devia invece dalla
tassonomia geografica.

| # | Il Flusso dice | Facciamo | Perché | Data |
|---|---|---|---|---|
| 1 | Payment Link fissi creati a mano dal pannello Stripe (§4) | La cassa la apre il nostro server, con l'importo letto dal database | Un Payment Link è un indirizzo pubblico e riusabile: niente lo lega al prezzo di *quella* prenotazione. Chi ha il link da 89€ può pagarci una consulenza da 149€. E il prezzo esiste in un posto solo invece di due | 4 ago |
| 2 | L'algoritmo di match gira nel sito (§2) | Funzione Postgres per i numeri, route server Next.js per le frasi. Mai nel browser | Calcolarlo nel browser richiede di esporre livelli dei paesi e valori degli assi, che il Flusso stesso dice invisibili. La mia vista `public_td_profiles` li esponeva davvero: era un difetto, non una scelta | 4 ago |
| 3 | Quiz e filtri anonimi vivono in `sessionStorage` e si perdono chiudendo la scheda (§1) | Al primo login il quiz si salva sul profilo | Il briefing che il designer riceve prima della call contiene il profilo quiz. Senza salvataggio arriva vuoto proprio nel pezzo che il designer legge | 4 ago |
| 4 | Il TD non può cancellare una consulenza pagata, può solo riprogrammare (§5) | Il tasto *Request reschedule* di Cal.com **è** una cancellazione secca. Lo riconosciamo dai due segni (motivo che inizia per `Please reschedule.`, `cancelledBy` uguale alla mail del designer), blocchiamo l'ordine, alert critico al team, rimborso eseguito a mano | Cal.com non manda nessuna prenotazione nuova e non lega la vecchia alla nuova: su una call già pagata il viaggiatore resterebbe senza call e senza soldi | 4 ago |
| 5 | Non ne parla | Le mail native di Cal.com restano accese e i testi XPETIS sono scritti per convivere con loro | Spegnerle potrebbe richiedere un piano a pagamento su 25 account. Costo zero e nessuna dipendenza dal piano | 4 ago |
| 6 | "La barra di ricerca normalizza qualunque input a un paese" (§1) | Filtrano **paesi e macro-aree**. Città e continenti sono solo navigazione: la città porta al suo paese, il continente alle sue macro-aree | La tassonomia dichiara selezionabili anche le macro-aree, e cercare "Sud America" è una richiesta legittima | 8 ago |
| 7 | *(deviazione dalla tassonomia)* Le 20 regioni italiane sono dichiarate selezionabili | **Non filtrano.** Nessun quinto livello di filtro: come trattarle si deciderà | Il dato della tassonomia non si perde: `is_selectable` conserva la sua intenzione, `is_filterable` dice cosa filtra oggi. Sono le uniche 20 righe su cui i due valori differiscono, e l'harness lo verifica | 8 ago |
| 8 | "Colore brand: verde `#1b5e24`" (§0) | La palette è **crema `#F0EEDF`, nero `#1C1C1A`, primario `#E53619`**, con Merriweather Bold sui titoli e Ronzino Regular sul testo | Sono i token del Figma, e concordano con il form Vetrina TD, che usa le stesse due tinte. Il verde non compare in nessuno dei due: è un dato più vecchio del design | 9 ago |

**Conseguenza della 5, da non perdere di vista.** Le mail native di Cal.com
contengono i link *cancella* e *riprogramma*, e cancellare su Cal.com richiede
solo il codice della prenotazione, senza credenziali. Il viaggiatore ha quindi
**sempre** una via per cancellare fuori dal nostro flusso, e non possiamo
impedirlo. Le regole di rimborso non si difendono controllando l'accesso al
link: **si applicano da n8n sul webhook `BOOKING_CANCELLED`**, guardando quanto
manca alla call. Vale anche per il caso 4.

---

## Quadro d'insieme

| # | Milestone | Stato | Lavoro con me | Lavoro tuo |
|---|---|---|---|---|
| 0 | Fondazioni database e correzioni | ✅ **chiusa** | — | — |
| 1 | Import dei dati reali | 🟡 **a metà** — geografia dentro; le 25 vetrine per ultime, per scelta | 2-3 sessioni | 8-12 h |
| 2 | Infrastruttura e accessi | 🟡 **in corso** | 2 sessioni | 7-9 h |
| 3 | Sito pubblico: ricerca, quiz, match, vetrina | ⚪ | 6-8 sessioni | — |
| 4 | Prenotazione e pagamento consulenza | ⚪ | 5-6 sessioni | 3-4 h |
| 5 | Prima della call: riprogrammazioni e reminder | ⚪ | 2-3 sessioni | — |
| 6 | Post-call e Itinerario su misura | ⚪ | 5-6 sessioni | — |
| 7 | All Inclusive | ⚪ | 4-5 sessioni | 4-6 h |
| 8 | Recensioni e chiusura del ciclo | ⚪ | 2-3 sessioni | — |
| 9 | Operatività e validazione Beta | ⚪ | 3-4 sessioni | 12-18 h |
|   | **Totale** | | **34-41 sessioni** | **34-49 h** |

Una "sessione" è circa due ore in cui costruisco e tu rivedi.

---

## Stima tempi

| Sessioni a settimana | Ore tue a settimana | Alla Beta privata |
|---|---|---|
| 2 | ~4 h | 17-21 settimane (dicembre 2026) |
| 3 | ~6 h | **12-14 settimane (inizio novembre 2026)** |
| 5 | ~10 h | 7-9 settimane (inizio ottobre 2026) |
| 8 | ~16 h | 5-6 settimane (metà settembre 2026) |

**Il merge col lavoro di Alessandro non accorcia il calendario: riduce la
varianza.** Le 16-18 sessioni di risparmio calcolate nel suo confronto valevano
solo adottando il suo codice come base; avendo scelto il mio schema, quel
risparmio non si applica. Quello che il merge porta davvero è:

- **S-05 è chiuso con prove sul campo**, e con lui sparisce una coda di rischio
  che il piano stimava fino a 2-3 settimane;
- l'onboarding non deve più raccogliere 25 chiavi API di Cal.com: per cancellare
  basta il codice della prenotazione;
- i nomi veri dei campi del payload sono noti (`payload.type`, non
  `eventType.slug`), quindi il ponte non si scrive due volte;
- la forma dell'output del modulo vetrina è nota, e con lei i due problemi che ci
  aspettano sull'import;
- sparisce il task S-10 (30 Payment Link a mano, più mezza giornata a ogni nuovo
  designer);
- in cambio si aggiunge una sessione di correzioni allo schema.

Cosa può ancora far slittare, in ordine di probabilità:

1. **Le correzioni a mano dei 25 profili.** Import fedele più correzione su
   Studio: 8-12 ore del team, e nessuno le può fare al posto suo.
2. **Il verso dei sei assi.** Nel nostro seed solo `pace` ha etichette vere; le
   altre cinque sono segnaposto. Il verso si fissa nel momento in cui si
   scrivono le etichette, ed è l'errore che nessuna prova tecnica intercetta.
3. **L'attivazione Stripe dell'agenzia** e la verifica fiscale del 74-ter.
4. **Le condizioni generali**, che richiedono un legale.

---

## Milestone 0 — Fondazioni database e correzioni ✅

**Chiusa il 6 agosto 2026.** 31 migration, 177 asserzioni verdi.

- [x] **[C]** Enum, tabelle di base, profili TD, geografia, parametri
- [x] **[C]** Prenotazioni e ordini con macchine a stati imposte dal database
- [x] **[C]** RLS chiusa, viste pubbliche, bucket di storage
- [x] **[C]** Seed dei parametri e dati finti
- [x] **[C]** Harness di verifica (~60 asserzioni, `npm run test:schema`)

### Correzioni

Si applicano come migration nuove, mai modificando quelle esistenti.

- [x] **[C]** `0018` — `match_designers()` in `SECURITY DEFINER` al posto di
      `public_td_profiles`, che consegnava ad `anon` livelli dei paesi e valori
      degli assi. Tolti anche i pesi da `public_quiz_axes` e i parametri di
      matching da `public_config`: spostato il calcolo lato server, il browser
      non ne ha più bisogno
- [x] **[C]** `0019` — viste `my_bookings` e `my_orders` filtrate su
      `auth.uid()` al posto del `grant select on bookings`. Senza
      `cal_booking_uid`, che dopo S-05 è di fatto una credenziale
- [x] **[C]** `0020` — `td_publish_blockers()` e `td_publish_warnings()`, vista
      di readiness estesa, e trigger che **impedisce davvero** di pubblicare un
      profilo senza paesi di livello 1
- [x] **[C]** `0021` — assi allineati al form: `aesthetics` → `curated_vs_real`,
      cinque opzioni per `companions`, il verso di ogni asse salvato come dato in
      `label_min`/`label_max`, tag "Aree estreme/polari"
- [x] **[C]** `0022` — campi di profilo del form: hero bio, manifesto, Instagram,
      anni di esperienza, copertura legale, disponibilità sui viaggi di gruppo
- [x] **[C]** `0023` — campi per paese: note sulle aree, temi fuori tassonomia,
      durata e budget tipici
- [x] **[C]** `0024` — i cinque servizi del form, prezzo deciso dal designer,
      punti dei box
- [x] **[C]** `0025-0027` — viaggi firma con foto, itinerari pronti, recensioni
      portate da fuori (tabella separata, non esposta)
- [x] **[C]** `0028` — la vetrina completa su `public_td_showcase`, e limite del
      bucket immagini alzato
- [ ] **[B]** Scrivere le due etichette intermedie di ogni asse continuo. Gli
      estremi ora vengono dal form: restano da scrivere i valori 2 e 3. **Con il
      quiz in piedi (14 agosto) quegli otto "DA SCRIVERE" si vedono in pagina**,
      e con loro un nono buco: `quiz_axes.question_it` è vuoto su tutti e sei gli
      assi, quindi ogni schermata mostra l'etichetta dell'asse invece della
      domanda. Il Figma 346:932 e 346:896 porta già domanda e risposte scritte
      per le prime due — sono testi da mettere nel seed, non nel codice

---

## Decisioni sull'infrastruttura e costi

Chiuse il 2 agosto 2026, dopo verifica dei prezzi correnti.

| Servizio | Scelta | Costo | Perché |
|---|---|---|---|
| **Supabase** | Cloud, free in sviluppo → **Pro al go-live** | €0 → $25/mese | Il free non fa backup, e l'architettura poggia su "Supabase è l'unica fonte di verità". Anche 1 GB di storage sono 200-400 documenti di viaggio |
| **n8n** | **Self-hosted su Railway** | ~$5-14/mese | Il Cloud Starter (€24/mese) dà 2.500 esecuzioni: il solo workflow insoluti ogni 5 minuti ne fa ~8.640. Self-hosted sono illimitate. Railway anziché VPS perché il vincolo del progetto è il tempo di Simone, non €5 |
| **Cal.com** | Free, un account per TD | €0 | Si paga solo per gestire più profili da un account: guidiamo i TD a crearsi il proprio |
| **Vercel** | **Pro, obbligatorio** | $20/mese | Il piano Hobby è solo per uso non commerciale: qualunque deployment che incassa pagamenti richiede Pro |
| **Provider email** | Da scegliere (S-04) | €0-20/mese | — |

### Recap dei costi

**Fisso mensile**

| Voce | Sviluppo | Produzione Beta | A regime (~500 consulenze/mese) |
|---|---|---|---|
| Supabase | €0 free | $25 Pro | $25 |
| Vercel | $20 Pro | $20 | $20 **per postazione** |
| n8n su Railway | ~$5 | ~$5-14 | ~$15-25 |
| Cal.com | €0 | €0 | €0 |
| Provider email | €0 (Resend free, 3.000 mail/mese) | €0 | $20 (Resend Pro, 50.000) |
| **Totale** | **~$25** | **~$50-60** | **~$80-90** |

**Variabile: commissioni Stripe.** 1,5% + €0,25 su carta europea, 3,25% + €0,25
su carta extra-UE. L'All Inclusive incassa sul conto dell'agenzia, merchant of
record: quelle commissioni **non sono un costo XPETIS**. A volume Beta (50
consulenze da €65 e 7 itinerari da €1.200 al mese) sono circa €190 su €11.650
incassati, l'1,6%.

**Una volta o fuori dal cloud**

| Voce | Nota |
|---|---|
| Dominio `xpetis.it` | ~€15/anno |
| Condizioni generali, privacy, cookie policy | Da preventivare con un legale: la voce meno prevedibile e la sola fuori dal nostro controllo |
| Onboarding Cal.com dei 25 TD | 12-15 ore del team |
| Correzione a mano dei 25 profili importati | 8-12 ore del team |
| Google Workspace | Se serve, ~$7 per persona/mese |

**Due soglie da tenere d'occhio**

- **Vercel Pro è per postazione.** Oggi $20 perché lavora solo Simone. Con
  quattro persone Vercel costa più di tutto il resto dello stack messo insieme.
- **Cal.com resta gratis finché ogni TD ha il suo account.** Il giorno in cui
  servisse gestire i 25 profili da un account unico, il prezzo diventa per
  utente al mese: con 25 designer supera il costo di scrivere il motore di
  prenotazione proprietario. È l'argomento economico che deciderà quella
  migrazione, prima di quello tecnico.

**Scartate e perché**

- **n8n Cloud**: quota esecuzioni incompatibile con i timer del flusso.
- **Piani gratuiti con sleep** (Render, Fly free): un'istanza dormiente non fa
  girare il workflow insoluti e perde i webhook di pagamento Stripe.
- **Hetzner o VPS**: quattro volte le risorse a parità di prezzo, ma la
  manutenzione è tempo di Simone. Da riconsiderare dopo la Beta.
- **Timer in `pg_cron` con n8n Cloud** (la "strada C" del confronto): sensata se
  si restasse su n8n Cloud, ma con Railway costerebbe **più** ($24 di Starter
  contro $5-14) e dividerebbe le automazioni fra due sistemi, uno dei quali
  Alessandro non può leggere. Le 60.000 esecuzioni/mese citate nel confronto
  presuppongono sette cron separati a 5 minuti: **un orologio unico che verifica
  tutte le scadenze dovute costa 8.640 esecuzioni al mese in totale.**

**Note operative per n8n**

- Postgres di n8n **separato** da Supabase.
- Pruning dello storico esecuzioni a 7-14 giorni.
- Licenza: la Sustainable Use License copre il self-hosting per uso interno
  d'impresa. Da rinegoziare solo se esponessimo la costruzione di workflow ai TD
  o alle agenzie come funzione di prodotto.

---

## Milestone 1 — Import dei dati reali 🟡

**La geografia è dentro. L'import delle 25 vetrine si fa per ultimo, per
scelta:** serve prima che il sito esista, altrimenti si caricano dati che nessuno
guarda. Il lavoro qui sotto resta in coda fino ad allora.

Deciso: **import fedele, correzioni a mano su Studio.** Si carica quello che il
modulo dice, senza logica di normalizzazione da fidarsi; il team corregge dopo,
guidato da una coda di lavoro.

- [x] **[C]** Leggere il form `Vetrina TD (2).html` e fissare la forma esatta del
      JSON che produce → `supabase/MAPPATURA_VETRINA.md`
- [x] **[C]** Import del dataset geografico e riallineamento delle tabelle
      `geo_*` → migration `0029`, generatore `scripts/genera_geo.mjs`, seed
      `0002_geo.sql`
- [x] **[C]** `0030` — la destinazione può essere un paese o una macro-area;
      città e continenti sollevano errore. Regola di ricerca decisa l'8 agosto
- [x] **[C]** `0031` — le regioni italiane non filtrano (decisione dell'8
      agosto). `is_filterable` dice cosa filtra oggi, `is_selectable` conserva
      cosa dichiara la tassonomia
- [ ] **[S]** *Rimandato:* come trattare le regioni italiane nella ricerca
- [ ] **[C]** Importatore fedele dei profili TD, idempotente e rilanciabile: non
      normalizza, ma **segnala** ogni voce che non ha saputo agganciare
- [ ] **[C]** Coda di correzione per il team: per ogni TD, cosa non è entrato e
      perché. I due casi che ci aspettano, già visti sui dati veri di un designer
      reale: **tutti i paesi dichiarati "Base"** (senza correzione quel TD non
      prende mai il badge e finisce sotto a chiunque) e **circa un terzo delle
      voci che non sono stati** (California, Florida, Texas, New York, Hawaii →
      US; Scozia → GB; "Balcani" e "Caraibi" da scorporare)
- [ ] **[C]** Controllo del verso degli assi: per tre o quattro designer, stampare
      cosa hanno dichiarato nel foglio accanto a cosa dice il database. Un asse
      girato si vede a occhio in trenta secondi, e nessun'altra prova lo trova
- [ ] **[S]** Correggere i 25 profili su Studio seguendo la coda (8-12 h) →
      **S-16**

---

## Milestone 2 — Infrastruttura e accessi 🟡

**L'ordine non è quello d'uso, è quello dei tempi di attesa.** Verifica Stripe e
propagazione DNS non dipendono da noi e possono costare giorni: si avviano
subito, anche se serviranno dopo.

*Blocco A — si avviano oggi, perché fanno partire attese lunghe*

- [x] **[S]** Progetto Supabase → **S-01 fatto l'8 agosto.** Ref
      `rsgyxbqzsxahsbdfgtbm`, 31 migration e i tre seed applicati, le query di
      verifica rispondono
- [ ] **[S]** ~~Dominio, provider email, record DNS~~ → **S-04 rimandato l'8
      agosto.** Su `xpetis.it` c'è una landing page attiva e non si tocca il DNS
      ora. In sviluppo si usa l'URL provvisorio di Vercel e la modalità di prova
      di Resend. *Conseguenza:* la reputazione di invio si scalderà solo alla
      fine, quindi fra dominio autenticato e Beta va lasciata **almeno una
      settimana** di margine
- [~] **[S]** Account Stripe → **S-06 parziale l'8 agosto.** Sandbox creata, si
      sviluppa in test mode. **L'attivazione è bloccata: non esiste un'entità
      legale** e non esisterà nel primo periodo. Vedi i rischi
- [ ] **[B]** Decidere **chi è il venditore** su consulenze e itinerari su
      misura: entità XPETIS, agenzia partner, o i designer con Stripe Connect

*Blocco B — quando il blocco A è avviato*

- [x] **[S]** Repo Git e progetto Vercel → **S-02 fatto l'8 agosto.** Repo
      collegato, deploy su `https://xpetis-new.vercel.app`. Resta su **Hobby**
      finché il sito è un'anteprima privata: **il passaggio a Pro va fatto prima
      di mostrarlo fuori dal team o di incassare**
- [x] **[S]** Login Google → **S-07 fatto l'8 agosto** e verificato end-to-end:
      sessione attiva, riga in `travelers` creata dal trigger, nome preso da
      Google. Progetto Google Cloud `xpetis-504916`

*Blocco C — chiude la milestone*

- [x] **[S]** Istanza n8n self-hosted su Railway → **S-03 fatto l'8 agosto.**
      `https://n8n-production-d576.up.railway.app`, Postgres dedicato,
      **nessun volume**: tutto lo stato vive nel Postgres, la chiave di
      cifratura è una variabile e i dati binari sono in memoria, quindi il disco
      non serve. Potatura dello storico a 14 giorni, fuso Europe/Rome
- [x] **[S]** Account Cal.com ed event type modello → **S-09 fatto l'8 agosto**
      su un account di prova con username `marco-rossi-xpetis`, così le
      prenotazioni atterrano su un designer che esiste già nel seed. Webhook
      verso n8n attivo, primo messaggio vero raccolto e mappato
- [x] **[C]** Verificati `disableCancelling` e `disableRescheduling`. Non esiste
      lo scope "solo host", quindi il divieto di cancellare al solo designer
      resta a n8n. Ma **la riprogrammazione si può bloccare sotto una soglia di
      tempo: impostata a 720 minuti, cioè la regola delle 12 ore del Flusso, che
      da osservata diventa imposta.** Attivato anche *Require cancellation
      reason → solo host*
- [ ] **[S]** Numero WhatsApp XPETIS → **S-08**
- [x] **[S]** ~~Le tre verifiche su Cal.com~~ → **S-05 chiuso**, vedi sotto
- [x] **[C]** Bootstrap Next.js 16: TypeScript, Tailwind 4 con il verde brand,
      i tre client Supabase (publishable nel browser, publishable+cookie lato
      server, secret per le scritture), `proxy.ts` che rinfresca la sessione,
      route di callback OAuth e pagina di prova dell'impianto
- [x] **[C]** Applicare le migration al progetto Supabase e verificare le viste
      — 31 migration e 3 seed applicati, 129 paesi e 1.220 città in risposta,
      `match_designers('country','vietnam')` funzionante sul database vero
- [ ] **[C]** Struttura delle route server-side per le pagine token, con la
      validazione già agganciata a `resolve_access_token`

---

## Milestone 3 — Sito pubblico: ricerca, quiz, match, vetrina

- [x] **[C]** Fondamenta: token del Figma in Tailwind, Merriweather e Ronzino,
      componenti condivisi (header, footer, bottone, badge a stella)
- [x] **[C]** Home dal Figma, con il Cerca che compare alla selezione
- [x] **[C]** Suggeritore destinazioni sulla tassonomia: cerca, distingue i
      livelli, porta una città al suo paese e scende dai continenti alle
      macro-aree ai paesi
- [ ] **[S]** Scaricare gli asset del Figma con
      `bash scripts/scarica-asset-figma.sh` — **le URL scadono in 7 giorni**
- [x] **[S]** Ronzino in `public/fonts/` — fatto il 9 agosto
- [ ] **[C]** Ricerca accento-insensibile: oggi "peru" non trova "Perù". Serve
      una colonna normalizzata con `unaccent` e una migration
- [x] **[C]** Le 6 schermate del quiz (tutte obbligatorie, nessun quiz a metà),
      in `sessionStorage` da anonimo e **salvato sul profilo al primo login** →
      `/quiz` vestita sui Figma 346:932 e 346:896. Le domande arrivano da
      `public_quiz_axes` (`lib/quiz.ts`), il contratto `quiz=codice:valore` sta in
      un posto solo (`lib/quiz-risposte.ts`), il travaso al login è la route
      `/quiz/salva`. Nessuna vista e nessuna migration nuova
- [ ] **[S]** Guardare `/quiz` accanto al Figma e dirmi cosa non torna, come per
      `/ricerca` e `/designer`. **Il giro col mouse non l'ho potuto provare io**:
      in questa sessione non avevo un browser, quindi sono verificati il render
      col dato vero, l'URL d'uscita e le due query della route, non i sei clic
- [ ] **[S]** **L'ordine delle risposte della prima domanda.** Il Figma le elenca
      dal massimo controllo al minimo; nel database `planning_involvement` cresce
      al contrario (`label_min` = "Poco controllo"). Il quiz mostra le risposte in
      ordine di valore, cioè come le dichiara il database: copiare l'ordine del
      disegno significherebbe girare l'asse. Da chiudere con Chiara — o si
      riordina il disegno, o si gira il verso nel database, mai solo la vista
- [x] **[C]** `match_designers()`: bande geografiche, punteggio quiz, punteggio
      filtri, affinità, chiave di ordinamento, badge e salienza dei due assi più
      forti. Restituisce posizione, banda, sezione e badge; **mai punteggi,
      livelli o valori degli assi** — migration `0018` e `0030`, ora chiamata
      davvero da `lib/match.ts` e provata sul database vero
- [x] **[C]** Composizione della frase dai mattoncini nella route server, con
      hash stabile sull'id del TD. In SQL i numeri, in TypeScript le concordanze
      → `lib/frase.ts`. **I testi sono segnaposto: li scrive Gaia**
- [x] **[C]** Pagina risultati con ricalcolo a ogni cambio di filtro (una
      chiamata indicizzata al server, non un ricalcolo nel browser) →
      `app/ricerca/page.tsx`, vestita sul Figma 177:262
- [ ] **[S]** Guardare `/ricerca` accanto al Figma e dirmi cosa non torna
- [ ] **[S]** Il terzo gruppo di filtri del Figma, "QUALE TIPO DI SUPPORTO
      CERCHI?" (consulenza, all inclusive, itinerario pronto, viaggio di
      gruppo), e con lui "Filtri avanzati": **non sono implementati.**
      `match_designers()` accetta solo tema e contesto, e i servizi attivi non
      possono filtrare dal browser. Serve un parametro nuovo sulla funzione, cioè
      una migration: è una decisione tua, non una dimenticanza
- [ ] **[S]** I due bolli a stella del Figma dicono "+100 Designer" e "4.9
      valutazione media". Il primo ora mostra il conteggio vero; il secondo non
      c'è, perché non esistono recensioni e `td_review_stats` non è esposta al
      browser. Decidere se sono promesse di marketing o dati
- [ ] **[C]** Maschera contestuale dei filtri (sulla Bolivia non si mostra
      "mare"): serve una funzione server nuova, perché `td_destination_tags` è
      dato chiuso e nessuna vista pubblica dice quali tag esistono su una
      destinazione
- [ ] **[B]** I mattoncini della frase, i divisori di sezione e la frase
      introduttiva onesta del fallback (Gaia). I vincoli che i testi devono
      rispettare sono in testa a `lib/frase.ts`
- [x] **[C]** Vetrina del TD, con i due box acquistabili e la presentazione non
      acquistabile di su misura e All Inclusive → `/designer/[slug]`, vestita sul
      Figma 171:17. Tutto da `public_td_showcase`, nessuna vista nuova
- [x] **[C]** Contenuto di vetrina nel seed: viaggi firma con foto, itinerari
      pronti, punti dei box, recensioni esterne per Marco e Giulia. Le cinque
      tabelle della vetrina esistevano da migration e nessuna riga le aveva mai
      popolate → `seed/0003_demo.sql`
- [ ] **[S]** **Riapplicare `seed/0003_demo.sql` al progetto Supabase.** Il seed
      arricchito non è ancora sul database di sviluppo: finché non lo è,
      `/designer/marco-rossi` mostra solo hero, storia e box consulenza, e le
      tre sezioni nuove restano invisibili. *(Era segnata come fatta: la spunta
      indicava il codice scritto, non il seed applicato.)*
- [ ] **[S]** **Come si mostrano i viaggi di gruppo.** La sezione del Figma non
      è costruita perché **non ha una sorgente**: nel form `gruppo[]` non ha
      campi modificabili e resta il contenuto d'esempio, quindi non si importa
      mai (deciso il 6 agosto). Le due strade sono aggiungerla al form o farli
      caricare al team. Finché non si decide, niente sezione e niente tasto
      "Vai ai viaggi di gruppo"
- [ ] **[S]** **"Membro XPETIS" nella scheda hero.** La quarta riga del Figma
      vuole `travel_designers.joined_at`, che `public_td_showcase` non espone.
      Non l'ho aggiunta di mia iniziativa: è una riga in più sulla superficie
      pubblica, e la decisione è tua. Oggi le righe sono tre
- [ ] **[S]** Guardare `/designer/marco-rossi` accanto al Figma e dirmi cosa non
      torna, come per `/ricerca`
- [ ] **[C]** Test del match sui 25 profili veri: ordinamenti attesi, casi limite
      (nessun quiz, nessuna destinazione, sezioni vuote)
- [ ] **[S]** **Badge "match forte": domanda aperta, non decisione.** Oggi è
      spento (`MOSTRA_BADGE_MATCH_FORTE` in `components/card-designer.tsx`)
      perché il Figma 177:262 non lo disegna — ma dal 14 agosto l'assenza nel
      Figma non chiude niente, e il Flusso lo dichiara "decisione UX da chiudere
      con Chiara: l'algoritmo lo produce comunque"
- [ ] **[S]** **Foto di sfondo della card: domanda aperta, non decisione.** Il
      Flusso la dà come "da definire con Chiara"; il Figma non la disegna e
      `background_photo_url` resta inutilizzata
- [ ] **[C]** **La riga di tag della card va riportata al Flusso.** Oggi mostra i
      temi agganciati quando ci sono, i paesi quando non ce ne sono. Il Flusso
      parla solo di paesi, con una condizione precisa: *"compare nella ricerca
      senza destinazione e nelle sezioni di fallback, mai quando la copertura è
      implicita nella sezione"*. I temi in quella riga vengono dal disegno

---

## Milestone 4 — Prenotazione e pagamento della consulenza

- [x] **[S]** ~~Account Cal.com di regia con l'event type modello~~ → **S-09
      chiuso nella milestone 2.** L'event type modello, con tutte le
      impostazioni verificate, è in `ONBOARDING_CALCOM_TD.md`
- [ ] **[C]** Login Google al momento del Prenota, con registrazione automatica
- [ ] **[C]** Embed Cal.com con nome, email e ID utente XPETIS precompilati.
      Torna in `payload.responses.xpetis_user_id.value`
- [ ] **[C]** Pagina form + pagamento nei tre stati (in attesa, confermata,
      scaduta): cellulare, domanda di contesto, flag servizi
- [ ] **[C]** **Cassa aperta dal server**: Checkout Session creata da una route
      con l'importo letto dal database, più verifica dell'importo a valle in n8n
      prima di portare la riga a "pagata"
- [ ] **[C]** Ponte Cal.com → `bookings` (created, rescheduled, cancelled). Due
      cose imparate dai messaggi veri: il designer si identifica con
      **`cal_username` + slug** (i 25 copiano lo stesso event type modello,
      quindi lo slug da solo non identifica nessuno), e **lo slug sta in
      `payload.type`**, non in `eventType.slug`
- [ ] **[C]** Workflow Stripe → conferma e mail. **Risponde sempre 2xx** anche
      quando non ha niente da fare: un 500 ripetuto porta Stripe a disattivare
      l'endpoint
- [ ] **[C]** Orologio unico ogni 5 minuti: insoluti oltre i 30 minuti (annulla
      su Cal.com col solo codice prenotazione, stato a "non pagata", mail
      cortese) e tutte le altre scadenze dovute. **In produzione la cadenza deve
      restare 5-10 minuti**: con finestra di 30 e controllo ogni 30 il caso
      peggiore diventa 60 minuti, e la regola dice massimo 35
- [ ] **[C]** Testi che convivono con le mail native di Cal.com: la nostra dice
      che lo slot è tenuto 30 minuti e che la conferma vera arriva col pagamento
- [ ] **[C]** Calendario admin degli appuntamenti
- [ ] **[C]** Percorso "slot introvabile": link WhatsApp, prenotazione creata a
      mano dal team che innesca gli stessi workflow
- [ ] **[C]** Controllo periodico di vitalità dei 25 webhook Cal.com

---

## Milestone 5 — Prima della call

- [ ] **[C]** Contatori di riprogrammazione aggiornati dai webhook
- [ ] **[C]** **Le regole di rimborso si applicano sul webhook
      `BOOKING_CANCELLED`**, non controllando l'accesso al link: le mail native
      di Cal.com danno al viaggiatore una via di cancellazione che non possiamo
      chiudere
- [ ] **[C]** Riconoscimento del *Request reschedule* del designer (motivo che
      inizia per `Please reschedule.` e `cancelledBy` uguale alla sua mail) su
      una call pagata: ordine bloccato, alert critico al team, rimborso a mano
- [ ] **[C]** Workflow di controllo dei limiti (6ª riprogrammazione del
      viaggiatore, 3ª del TD, nuova data oltre i 20 giorni, cancellazione sotto
      le 24 ore che pretende il rimborso) → alert in `team_alerts`
- [ ] **[C]** Workflow reminder del giorno prima
- [ ] **[C]** Procedura di rimborso documentata: come si esegue su Stripe e come
      si flagga su Studio
- [ ] **[S]** In onboarding, istruire i designer a usare *Reschedule* e mai
      *Request reschedule* (cintura e bretelle: il riconoscimento automatico c'è
      comunque)

---

## Milestone 6 — Post-call e Itinerario su misura

- [ ] **[C]** Workflow mail post-call a fine call, con i bottoni dei soli servizi
      attivi di quel TD
- [ ] **[C]** Bottoni a token permanente che creano l'ordine e notificano il team
- [ ] **[C]** Tasti eccezione del TD: no-show e "altro problema" → disputa
- [ ] **[C]** Chiusura a 48 ore (dentro l'orologio unico)
- [ ] **[C]** Pagina ordine del TD a stati (uno stato, una azione), con upload su
      Storage
- [ ] **[C]** Invio proposta: Checkout Session creata dal server con l'importo
      scritto dal TD, pagina pubblica gemella, mail al viaggiatore, messaggio
      pronto al TD
- [ ] **[C]** Consegna, richiesta di revisione, chiusura a 5 giorni

---

## Milestone 7 — All Inclusive

- [ ] **[S]** Decidere come custodire le credenziali Stripe delle agenzie →
      **S-11**
- [ ] **[S]** Attivazione tecnica della prima agenzia → **S-12**
- [ ] **[B]** Verifica fiscale del 74-ter con l'agenzia e della quota XPETIS per
      fatturazione tra le parti
- [ ] **[C]** Assegnazione agenzia da Studio e workflow di verifica
- [ ] **[C]** Pagina token di conferma dell'agenzia, che sblocca la cascata
- [ ] **[C]** Acconto e saldo sul conto Stripe dell'agenzia, con i suoi webhook
      che puntano al nostro n8n
- [ ] **[C]** Inserimento dei tempi del saldo da parte del team e workflow
      relativo
- [ ] **[C]** Consegna del file finale

---

## Milestone 8 — Recensioni e chiusura del ciclo

- [ ] **[C]** Buon viaggio, recensione consulenza, recensione viaggio (dentro
      l'orologio unico)
- [ ] **[C]** Pagina token monouso della recensione
- [ ] **[C]** Pubblicazione automatica in vetrina e alert sotto le 3 stelle

---

## Milestone 9 — Operatività e validazione Beta

- [ ] **[S]** Onboarding Cal.com dei 25 TD → **S-13**
- [ ] **[S]** Condizioni generali, privacy e cookie policy → **S-14**
- [ ] **[C]** Viste operative su Studio: ordini aperti, cosa manca a ciascuno,
      coda degli alert, checklist di pubblicazione dei TD
- [ ] **[C]** Come si modifica un profilo TD a regime: Studio a mano oppure una
      form interna minima (da decidere dopo l'import, quando sappiamo quanto è
      pesante correggerli)
- [ ] **[C]** Prova end-to-end su ambiente di test: dalla ricerca alla
      recensione, per tutti e tre i servizi
- [ ] **[C]** Runbook: cosa fare quando un workflow fallisce, come si rilancia,
      dove si guarda
- [ ] **[B]** Taratura dei parametri di matching sui dati reali
- [ ] **[Team]** Beta privata: primo viaggiatore vero su un TD vero

---

## La tua todo list

### ✅ Chiuso

**S-05 · Le tre verifiche sul piano gratuito di Cal.com** — verificate da
Alessandro il 30-31 luglio, con prove sul campo:

| Verifica | Esito |
|---|---|
| Webhook verso un URL esterno sul piano free? | **Sì**, 7 messaggi veri raccolti |
| API key per cancellare una prenotazione dall'esterno? | **Non serve nessuna chiave**: basta il codice della prenotazione |
| L'embed accetta il prefill di un campo custom e torna nel payload? | **Sì**, in `payload.responses.xpetis_user_id.value` |

La seconda risposta è migliore di quella sperata e cancella dall'onboarding
l'intera voce "raccogliere 25 chiavi Cal.com". Ha però un rovescio, registrato
fra i rischi: chiunque conosca il codice di una prenotazione la può cancellare.

**S-10 · Payment Link delle consulenze** — **annullato.** Con la cassa aperta
dal server non esistono link da creare, né a mano ora né a ogni nuovo designer.

### P0 — prima settimana

**S-15 · Farsi passare i materiali di Alessandro** (30 min)
`GUIDA_PONTE_CALCOM.md` con le fixture dei 7 messaggi veri, e il dataset
geografico normalizzato. Non il codice: la conoscenza.
*Blocca:* milestone 1 e 4.

**S-01 · Progetto Supabase** (1 h)
Organizzazione e progetto, regione europea. Due progetti se possibile, test e
produzione. Salva URL, anon key e service key in un password manager e passami
quelle di test.
*Blocca:* tutto.

**S-02 · Repo Git e Vercel Pro** (1 h)
Repo privato, progetto Vercel collegato, dominio puntato, variabili d'ambiente.
Serve il piano **Pro** ($20/mese): l'Hobby è riservato all'uso non commerciale.

**S-04 · Provider di invio email e autenticazione del dominio** (2 h)
Senza di lui n8n non manda nessuna delle quindici mail del funnel. Un provider
transazionale (Resend, Postmark, SendGrid) e i record SPF/DKIM/DMARC su
`xpetis.it`. Presto: la reputazione di invio si scalda in giorni, non in ore.
*Blocca:* milestone 4 in poi.

### P1 — seconde due settimane

**S-03 · Istanza n8n self-hosted su Railway** (2-3 h)
Template n8n, Postgres Railway separato da Supabase, pruning dello storico a
7-14 giorni, credenziali Supabase/Stripe/email dentro n8n. Metti un tetto di
spesa: la fatturazione è a consumo sopra i $5 inclusi.

**S-06 · Account Stripe XPETIS** (2 h)
Attivazione, verifica dell'attività, chiavi test e produzione, endpoint webhook
verso n8n. **La chiave segreta va nelle variabili server di Vercel:** serve alla
cassa aperta dal server.

**S-07 · Login Google** (1 h)
Progetto Google Cloud, credenziali OAuth, URI di redirect, client ID e secret in
Supabase Auth. Google è l'unico provider previsto.

**S-08 · Numero WhatsApp XPETIS** (1 h)
Numero dedicato, WhatsApp Business, chi lo presidia e con quali orari.

**S-09 · Account Cal.com di regia e event type modello** (1-2 h)
"Consulenza XPETIS · 30 min", URL `consulenza-xpetis-30` **scritto a mano**,
durata 30, buffer 10 dopo, preavviso 12 ore, orizzonte 30 giorni, campo nascosto
`xpetis_user_id`. Dettagli verificati in `GUIDA_PONTE_CALCOM.md`.

*Strumento video: **Cal Video**, deciso l'8 agosto.* Google Meet richiederebbe a
ognuno dei 25 designer di collegare il proprio Google Calendar: una dipendenza in
più in onboarding, per venticinque persone, in cambio di niente. Si cambia con
un'impostazione dell'event type se serve.

### P2 — quando serve

**S-16 · Correzione a mano dei 25 profili importati** (8-12 h con il team)
Guidata dalla coda di correzione prodotta dall'import. I due casi noti: paesi
tutti dichiarati "Base" e voci che non sono stati.

**S-11 · Come custodire le credenziali Stripe delle agenzie** (2 h di
valutazione)
Vale la pena guardare Stripe Connect prima di attivare la prima agenzia: stesso
risultato (agenzia merchant of record, compatibile col 74-ter) senza che XPETIS
custodisca credenziali di terzi.
*Blocca:* milestone 7.

**S-12 · Attivazione tecnica della prima agenzia** (2-3 h)
Chiavi, webhook verso n8n, prova di un pagamento di test.

**S-13 · Onboarding Cal.com dei 25 TD** (6-7 h con il team)
**La procedura completa e provata sul campo è in `ONBOARDING_CALCOM_TD.md`**, con
i valori esatti, le tre trappole e la checklist per designer. Circa 15 minuti a
testa, non 30: nessuna chiave API da raccogliere (vedi S-05) e nessuna
configurazione da inventare. Si può fare in parallelo alla milestone 6.

**S-14 · Condizioni generali, privacy e cookie policy** (esterno)
Il flusso ci appoggia regole precise (15 minuti di attesa, rimborso pieno fino a
24 ore prima, una revisione inclusa): devono stare in un documento che il
viaggiatore accetta al pagamento. Serve un legale, i tempi non li controlliamo.

---

## Rischi

| Rischio | Impatto | Cosa lo tiene sotto controllo |
|---|---|---|
| Il verso di un asse è girato: un designer *wild* risulta amante del comfort, prende la frase sbagliata e finisce nel posto sbagliato | Alto, e **nessuna prova tecnica lo intercetta** | Confronto a vista foglio-database su 3-4 designer all'import (milestone 1). È già successo nel lavoro di Alessandro: due assi su sei erano invertiti |
| **Non esiste un'entità legale XPETIS, e non esisterà nel primo periodo** (8 ago) | **Alto: è il nuovo percorso critico.** Senza partita IVA non si incassa, quindi la Beta con soldi veri non dipende più dalla tecnica. Blocca anche S-14, perché non si scrivono condizioni generali senza sapere chi è la controparte | Lo sviluppo prosegue in test mode senza differenze. La decisione "chi è il venditore" va portata ad Alessandro e Andrea subito: costituire una ditta individuale, far incassare l'agenzia partner anche su consulenze e su misura, oppure far incassare i designer con XPETIS che fattura una commissione. **La terza cambia l'architettura**: il denaro andrebbe verso 25 destinatari e servirebbe Stripe Connect molto prima |
| Detenere le chiavi Stripe delle agenzie | Alto | Valutare Stripe Connect prima della prima agenzia (S-11) |
| Le mail finiscono in spam | Alto: il funnel vive di mail. **Aumentato l'8 agosto:** S-04 è stato rimandato alla fine, quindi la reputazione di invio resterà non provata fino a ridosso della Beta | Lasciare almeno una settimana fra l'autenticazione del dominio e il primo viaggiatore vero |
| Supabase free non fa backup | Alto se si dimentica il passaggio a Pro | Pro il giorno del primo pagamento vero |
| Le correzioni a mano dei 25 profili non vengono fatte, o fatte male | Alto: il match gira su dati sbagliati e sembra funzionare | I controlli di plausibilità in `td_publish_readiness` bloccano la pubblicazione, non solo segnalano |
| Chiunque conosca il codice di una prenotazione Cal.com la può cancellare, e le mail native di Cal.com lo consegnano al viaggiatore | Medio | Le regole di rimborso si applicano sul webhook, non sull'accesso al link. `cal_booking_uid` non esce mai verso il browser |
| I token dei TD e delle agenzie sono in chiaro nel database — **rischio accettato il 4 agosto** | Medio | La tabella `access_tokens` non è leggibile né da `anon` né dall'utente loggato; l'accesso al database resta al team. Rivedibile passando all'impronta |
| 25 webhook Cal.com configurati uno per uno: se un designer tocca le impostazioni, le sue prenotazioni smettono di arrivarci in silenzio | Medio | Controllo periodico di vitalità (milestone 4) |
| Insoluti oltre il 10-15% | Medio | Misurabile a schema; si sposta il pagamento prima dello slot |
| Il `.docx` del Flusso è superato su cinque punti e nessuno lo aggiorna | Medio: qualcuno lavora su regole vecchie | La tabella "Deviazioni dal Flusso" qui sopra. Da riportare nel `.docx` prima di allargare il team |
| Testi definitivi delle mail in ritardo | Basso | Si costruisce con segnaposto |
| Cal.com non impone i limiti di riprogrammazione | Basso, **ridotto l'8 agosto**: la soglia delle 12 ore ora la impone Cal.com direttamente. Restano da presidiare i conteggi (5 e 2), la finestra dei 20 giorni e le cancellazioni | n8n fa il controllore sul resto e avvisa il team |

---

## Registro avanzamenti

**14 agosto 2026 — chi vince fra Figma e Flusso**

Regola fissata da Simone e scritta in `CLAUDE.md`: **il Figma è autorevole sulla
forma, il Flusso sul comportamento e sui contenuti.** Il disegno non è aggiornato
al pari del documento, e resta indietro. Nel dubbio si chiede; finché non arriva
risposta vince il Flusso.

Con questo metro ho ricontrollato tutte le divergenze registrate finora. Sette
reggono senza modifiche — palette e tipografia sono forma, e il Flusso aveva già
vinto su "Cerca" che compare alla selezione, sul solo "Accedi", sui due box
acquistabili, sul terzo gruppo di filtri non costruito, sull'ordine delle
risposte del quiz e sui due bolli che non scrivono numeri falsi.

**Una va riaperta.** La riga di tag della card in `/ricerca` mostra i temi
agganciati quando ci sono e i paesi coperti quando non ce ne sono. Ma il Flusso
è preciso su quella riga, e parla solo di paesi: *"Il tag paesi compare nella
ricerca senza destinazione e nelle sezioni di fallback (dove serve capire cosa
copre il TD), mai quando la copertura è implicita nella sezione."* I temi in
quella riga vengono dal disegno, non dal documento.

**Due erano etichettate come decisioni e sono invece domande aperte**, perché
chiuse dall'assenza nel Figma — che sotto la regola nuova non chiude niente:

- il **badge "match forte"**, che il Flusso dichiara esplicitamente "decisione UX
  da chiudere con Chiara: l'algoritmo lo produce comunque";
- la **foto di sfondo della card**, che il Flusso dà come "da definire con
  Chiara".

Restano spente entrambe come default reversibile, ma sono domande, non risposte.

**14 agosto 2026 — il quiz**

`/quiz` esiste: era il 404 in fondo al "Lasciati ispirare" della home, al "Non hai
ancora le idee chiare?" e al tasto quiz della colonna filtri. Sei schermate, una
domanda per volta, tutte obbligatorie. Tre file nuovi in `lib` e `components` più
la pagina e una route: `lib/quiz.ts` (l'unica porta verso `public_quiz_axes`, solo
lato server), `lib/quiz-risposte.ts` (il contratto delle risposte: query,
`sessionStorage`, tipi), `components/quiz-domande.tsx`, `app/quiz/page.tsx`,
`app/quiz/salva/route.ts`, `components/salva-quiz.tsx`. Nessuna vista nuova,
nessuna migration.

*Le sei domande non sono nel codice.* Codice, tipo, etichetta, domanda, scala e
opzioni vengono da `public_quiz_axes`, quindi il numero delle schermate e il passo
della barra si contano dagli assi: aggiungere un asse o correggere un'etichetta è
un UPDATE da Studio, non un deploy. Le opzioni si costruiscono percorrendo la
scala dichiarata (`scale_min`..`scale_max`) e non le chiavi del JSON: se un giorno
mancasse la riga di un valore, quella risposta appare senza etichetta invece di
sparire. Un buco si vede, una scelta che manca no.

*Il quiz è incompleto e si vede, come deve.* Gli otto "DA SCRIVERE" dei valori 2 e
3 sono in pagina così come sono. E ne è emerso un nono: **`question_it` è nullo su
tutti e sei gli assi** — non è mai stato seminato — quindi l'intestazione ricade
sull'etichetta dell'asse ("Coinvolgimento nella pianificazione"), che è una
targhetta e non una domanda, con sotto un `domanda da scrivere` in rosso. Il Figma
invece ha i testi buoni per le prime due domande, e anche le risposte del ritmo
scritte meglio del seed ("Lento: poche cose, vissute a fondo" contro "Lento"). Non
li ho copiati nel seed: sono contenuti, e vanno scritti tutti e sei insieme,
altrimenti restano due domande buone e quattro targhette.

*La trappola che stava in agguato.* Nel Figma la prima domanda elenca le risposte
**dal massimo controllo al minimo**, mentre nel database `planning_involvement`
cresce al contrario. Copiare l'ordine del disegno appiccicando i valori 1-4 alle
righe avrebbe girato l'asse: è il rischio numero uno del piano, quello che nessuna
prova tecnica intercetta, e si presenta esattamente così — come una questione di
impaginazione. Le risposte si mostrano in ordine di valore. Da chiudere con
Chiara, riordinando il disegno o girando il verso nel database: mai solo la vista.

*Il travaso al login (deviazione 3).* Le risposte dell'anonimo vivono in
`sessionStorage`; `components/salva-quiz.tsx` sta nel **layout radice**, non nella
pagina del quiz, perché il momento da intercettare è il login e dopo Google si
atterra su una pagina qualunque. Costa una lettura di `sessionStorage` quando non
c'è niente da fare, che è quasi sempre. Scrive la route `/quiz/salva` con la
chiave secret, dopo aver verificato la sessione dai cookie: `quiz_responses` ha la
RLS accesa e nessuna policy, il client non parla mai con le tabelle. Tre cose che
la route fa e vale la pena ricordare: **valida i codici degli assi e le scale
leggendoli dal database**, quindi non si salva un `{pippo: 3}` arrivato da fuori;
**rifiuta un quiz incompleto**, perché un profilo parziale nel briefing sembra una
risposta e non lo è; e **confronta con l'ultima riga del viaggiatore** invece di
inserire sempre, perché `quiz_responses` è un registro senza indice unico e il
componente rimonta a ogni pagina — l'indice sarebbe stata una migration non
richiesta. Non salva niente per gli anonimi: la tabella lo permetterebbe con
`session_id`, ma sarebbe un endpoint di scrittura aperto a chiunque.

*Il contratto verso i risultati era già scritto e non l'ho toccato.* `quiz=`,
`livello`, `ref`, `temi`, `contesti` entrano ed escono identici, così chi arriva
dal Vietnam torna al Vietnam. La lettura di quella stringa era duplicata nella
pagina risultati: ora sta in `lib/quiz-risposte.ts` e la usano entrambe, insieme
al tipo `Quiz` che `lib/match.ts` si limita a riesportare. Il passo del quiz
invece **non** sta nell'URL, a differenza di tutto il resto del sito: le risposte
vivono in `sessionStorage`, quindi un `/quiz?passo=4` condiviso mostrerebbe una
domanda in mezzo al nulla. È l'unico pezzo di stato del sito che non è
indirizzabile, e per questa ragione.

*Sugli asset:* due frecce tonde nuove (`freccia-avanti`, `freccia-indietro`) e la
foto, che è il **rendering del nodo** 346:946 a scala 1 — 568×709 e 592 KB, contro
i 9 MB e 2731×4096 della sorgente Unsplash. Tre cose non si scaricano: la stella
della barra, che è `img/stella.svg` (nel Figma è 34,238×36, cioè lo stesso path
"Star 3" dei bolli scalato 5,0833 — misurata su entrambi i lati, che è la lezione
dell'11 agosto sugli SVG con `preserveAspectRatio="none"`); la cucitura
tratteggiata fra card e foto, che è una riga bianca da 3px con 10 pieni e 10 vuoti
e sta in un gradiente ripetuto; e le stesse due frecce, che `galleria-prec.svg` e
`galleria-succ.svg` già portavano come ritaglio del gruppo della galleria — qui
sono l'esportazione pulita, con un nome che non parla di gallerie.

*Rimasto fuori, detto:* il quiz su cellulare **non è disegnato**. Sotto `lg` la
pagina impila la card e la foto sparisce: una foto alta 709 fra la domanda e le
risposte allontanerebbe le due cose che devono stare insieme. E l'ultima schermata
non è disegnata: il tasto resta "Continua" fino in fondo invece di inventarsi un
"Vedi i risultati".

**11 agosto 2026 — la vetrina del designer**

`/designer/[slug]` esiste: era il 404 in fondo a ogni card di `/ricerca`. Cinque
componenti nuovi più `lib/vetrina.ts`, che è l'unica porta verso
`public_td_showcase` e sta solo lato server, esattamente come `lib/match.ts` lo è
verso `match_designers`. Nessuna vista nuova.

*Prima la pagina, il seed.* Le cinque tabelle del contenuto di vetrina —
`td_signature_trips`, `td_signature_trip_images`, `td_ready_itineraries`,
`td_service_bullets`, `td_showcase_reviews` — esistevano dalla migration 0024 e
**nessuna riga le aveva mai popolate**: la pagina sarebbe stata verde e vuota
insieme, e non si sarebbe visto niente. Ora Marco e Giulia hanno tre viaggi
firma a testa con le foto, tre itinerari pronti, i punti dentro ogni box e le
recensioni portate da fuori. Harness a 178 asserzioni, verde.

Una cosa imparata sull'harness: **le sue asserzioni contavano le righe** del
contenuto di vetrina (`signature_trips.length === 1`), quindi qualunque
arricchimento del seed le avrebbe rotte. Ora cercano per titolo, e le prove che
scrivono usano posizioni alte (91, 92) per non collidere col seed. Il test è
diventato più difficile da rompere per il motivo sbagliato.

*Quattro cose del Figma che questa pagina non mostra*, tutte con la ragione
scritta nel codice e tutte reversibili:

1. **Il voto "4.6" sulla foto e la sezione "Cosa dice chi ha viaggiato con me".**
   Non esistono recensioni: `public_reviews` è vuota perché non ci sono ordini, e
   `td_showcase_reviews` non è esposta da nessuna vista per la decisione del 6
   agosto rimandata alla milestone 8. Le ho seminate lo stesso — quella decisione
   si prende meglio guardando dei dati veri che una tabella vuota — ma la vetrina
   non le mostra. Esporle da qui avrebbe voluto dire prendere quella decisione di
   nascosto, aggiungendo una vista pubblica di mia iniziativa.
2. **La riga "Membro XPETIS".** Vuole `joined_at`, che la vista non espone.
   Leggerlo con la chiave secret sarebbe stato lecito ma avrebbe scavalcato la
   regola "la superficie pubblica è la vista".
3. **La sezione "Viaggi di gruppo".** Non ha una sorgente, e non è un buco
   nostro: il form non raccoglie quei viaggi. Il servizio `group_trip` invece
   esiste, quindi il selettore dei box lo mostra a chi lo attiva.
4. **"Prenota la call" e "Ottieni maggiori informazioni" non navigano.** Il primo
   aspetta l'iframe Cal.com (milestone 4), il secondo la pagina "Itinerario
   pronto da vivere" (nodo 261:1068, non costruita). Inerti e detto, invece di un
   link verso un 404.

*E una dove il Figma e il Flusso non dicono la stessa cosa.* Il Figma disegna in
cima al box bianco due pillole — "Consulenza" rossa e attiva, "Itinerario su
misura" marrone e spenta — cioè un selettore fra i servizi, e sotto un solo tasto
"Prenota la call". Il Flusso dice che **i box acquistabili sono due soltanto**.
Le due cose si tengono insieme così: il selettore resta e mostra tutti i servizi
attivi come nel disegno, ma **il tasto d'acquisto compare solo su consulenza e
consulenza approfondita**; sugli altri, al suo posto, c'è la frase che dice
quando si comprano. Il selettore passa dalla query (`?servizio=`) e non da uno
stato nel browser, quindi la pagina resta interamente server-side e una scheda è
condivisibile per link.

*Un errore che ho fatto e che vale la pena ricordare*, perché il codice della
sessione precedente già lo preveniva e io l'avevo perso per strada: `next/image`
su un host non dichiarato in `next.config.ts` **non degrada, solleva e porta giù
tutta la pagina**. Il `photo_url` del seed punta a `example.com` e la vetrina
rispondeva 500. La difesa è la stessa dell'avatar di `card-designer.tsx`: fuori
da Supabase Storage si mostra un `<img>` normale.

*Sugli asset:* i due tondi con le frecce della galleria sono un ritaglio, non un
download. Nel Figma sono un gruppo unico largo 396 con i tondi agli estremi, e
lo script lo spiega. Gli SVG esportati hanno `preserveAspectRatio="none"`: le
icone non quadrate vanno misurate su entrambi i lati, altrimenti si stirano senza
che nessuno se ne accorga leggendo il codice.

*Fuori dal repo:* `supabase/node_modules` era un symlink verso `/tmp/node_modules`
committato per sbaglio nella 084c939, ed era rotto. Cancellato — il `.gitignore`
lo copre già — e rifatto `npm install`, che ora produce un `package-lock.json` da
committare.

**10 agosto 2026 — la pagina risultati chiama il match**

`/ricerca` esiste e gira sul database vero: bande, sezioni, badge, filtri e frase
composta. Tre file nuovi — `lib/match.ts` (l'unica porta verso
`match_designers`, e sta solo lato server), `lib/frase.ts` (i mattoncini),
`app/ricerca/page.tsx` — più la card, i chip dei filtri e due proprietà nuove sul
suggeritore, che ora conserva i filtri quando si cambia meta.

*Il ricalcolo live passa dall'URL.* I filtri riscrivono la query e il Server
Component richiama la funzione: è "una chiamata indicizzata al server" e non un
ricalcolo nel browser. Stessa scelta per le risposte del quiz
(`quiz=pace:1,comfort_wild:4`): la pagina resta interamente server-side e un
risultato è condivisibile per link. Il travaso da `sessionStorage` lo farà la
pagina del quiz.

*Tre cose imparate scrivendo le frasi*, tutte di lingua e nessuna prevista dal
Flusso, che le chiama "concordanze e articoli" in mezza riga:

1. **`travel_designers` non ha il genere**, quindi nessun frammento può contenere
   un participio ("è appassionato"). Si scrive tutto con verbi alla terza
   persona. Aggiungere la colonna non basterebbe: andrebbe raccolta per 25
   persone e mantenuta.
2. **La tassonomia non porta l'articolo.** "Conosce il Vietnam" non si può
   comporre: il default è il locativo "in {nome}", con una ventina di eccezioni
   per identificatore in `lib/frase.ts` (isole e città-stato vogliono "a", i nomi
   plurali "negli/nelle/nei"). Lo stesso problema colpisce il titolo di sezione
   del Flusso, "Esperti di [paese]", che su alcuni paesi zoppica.
3. **Un frammento non può contenere virgole**, perché i pezzi si uniscono con la
   virgola. Il primo giro produceva "sta dalla parte del tempo lungo, come te,
   conosce il ritmo dei viaggi in coppia".

*Rimasto fuori.* La **maschera contestuale** dei filtri: `td_destination_tags` è
dato chiuso e nessuna vista dice quali tag esistono su una destinazione, quindi
serve una funzione server nuova — non l'ho scritta perché è una migration non
richiesta.

**10 agosto 2026 — la pagina ricerca vestita sul Figma**

Arrivati i link: file `x1DYYagZ2moagmpEHZHYYE`, un nodo per pagina, ora scritti
in `CLAUDE.md` perché non si perdano più (l'assenza di quella riga è costata
mezza sessione). Deciso anche: pagamento col **plugin Stripe**, prenotazione con
l'**iframe Cal.com** del designer.

Rifatte card, filtri e impaginazione sul nodo 177:262: colonna bianca dei filtri
a sinistra, griglia a due colonne di card alte 520 con il velo che scurisce verso
il basso, avatar 130, "Vai alla vetrina", "Carica ancora" col tondo della freccia
— che è byte per byte lo stesso asset della home. Aggiunti cinque asset allo
script; `icona-quiz` e `icona-chevron` restano scaricati ma non usati.

*Quattro punti dove il Figma e il Flusso non dicono la stessa cosa*, tutti
risolti in modo reversibile e tutti da chiudere con Chiara e Gaia:

1. **Il badge "match forte" non è disegnato.** Era la domanda aperta del Flusso
   ("decisione UX da chiudere con Chiara"): oggi è spento da una costante sola.
2. **Nessun divisore di sezione.** Ma quel nodo è l'arrivo dal quiz, cioè il caso
   senza destinazione, dove il Flusso stesso vuole una fascia unica. I divisori
   compaiono solo con una destinazione, dove dicono qualcosa che il viaggiatore
   non può dedurre.
3. **La riga di tag sulla card porta i temi**, il Flusso i paesi coperti. Si
   mostrano i temi agganciati quando ci sono, i paesi quando non ce ne sono.
4. **Il terzo gruppo di filtri e "Filtri avanzati" non esistono nel Flusso** e
   `match_designers()` non li sa filtrare: lasciati fuori, con la ragione scritta
   nel componente. Un gruppo di caselle che non filtrano sarebbe peggio del
   vuoto.

*Una cosa che il Figma decide e il database aspettava:* la **foto di sfondo della
card** (`travel_designers.background_photo_url`, decisione aperta dal 1 agosto)
**non c'è**. La card non ha immagine di sfondo: solo l'avatar sopra un velo che
scurisce verso il basso, e sotto il velo si vede il crema della pagina.

*E una che ho tolto di mia iniziativa:* i due bolli dicono "+100 Designer" e "4.9
valutazione media". Il conteggio ora è quello vero (oggi 2); il bollo della
valutazione è fuori, perché non ci sono recensioni e `td_review_stats` non è
esposta al browser. Scriverli fissi sarebbe pubblicare due numeri falsi su un
sito che incassa.

**8 agosto 2026 — primo `db push` su Supabase vero**
Fallito alla migration 0004: `gen_random_bytes does not exist`. Causa: **su
Supabase le estensioni stanno nello schema `extensions`, non in `public`**,
quindi `create extension if not exists pgcrypto` non fa niente (esiste già
altrove) e le sue funzioni non sono sul search_path. Su PGlite finiscono in
`public` e tutto passa: **l'harness non poteva accorgersene**, ed è il primo
errore che il Postgres vero ha trovato e il nostro no.

Corretto in 0001 (commento), 0002 (`set search_path` per `gin_trgm_ops`) e 0004
(`search_path = public, extensions` sulla funzione). Uno schema inesistente nel
search_path viene ignorato, quindi la stessa riga funziona in entrambi gli
ambienti.

*Deroga consapevole alla convenzione "mai modificare una migration applicata":*
la catena non era mai arrivata in fondo da nessuna parte, quindi non c'era storia
da proteggere. Su un database già popolato si sarebbe aggiunta una migration
nuova. Regola aggiunta a `CLAUDE.md`.

**S-01 chiuso.** Progetto `rsgyxbqzsxahsbdfgtbm`, 31 migration e i tre seed
applicati, le query di verifica rispondono.

**S-02 e S-07 chiusi, e il giro Google-Supabase-Vercel è provato.** Repo su
GitHub, deploy su `xpetis-new.vercel.app`, login Google funzionante. Costruita
l'app Next.js 16 con i tre client Supabase e una pagina di verifica
dell'impianto che prova tre cose insieme: la lettura pubblica con la sola chiave
publishable (129 paesi e i due designer di prova rispondono), il login, e la
riga in `travelers` creata dal trigger su `auth.users`. **Tutte e tre verdi al
primo tentativo.**

*Punto aperto chiuso:* Google consegna davvero il nome in
`raw_user_meta_data->>'full_name'`, quindi il trigger popola `full_name` da
solo. Non serve raccoglierlo altrove.

*Un intoppo che vale la pena ricordare:* il primo deploy rispondeva 404. Il
progetto Vercel era stato creato **prima** che l'app Next.js esistesse, e il
preset del framework si decide una volta sola all'import: da allora serviva file
statici che non c'erano. Cambiato il preset a Next.js e ridistribuito senza
cache. Login provato anche in produzione, dove il redirect passa dal proxy ed è
un percorso di codice diverso da localhost.

*Decisione che cambia una convenzione: le chiavi Supabase.* Installata nel repo
la skill `supabase/server`, che documenta il passaggio alle nuove chiavi API:
`anon` e `service_role` sono **legacy e verranno rimosse**, si usano
`sb_publishable_…` (browser) e `sb_secret_…` (solo server). Aggiornati
`CLAUDE.md` e i task che le nominavano. La chiave secret non passa mai da una
conversazione né da un file versionato.

**8 agosto 2026 — import della tassonomia geografica**
Caricato `xpetis_destinazioni.json`: 6 continenti, 14 macro-aree, 129 stati, 244
regioni, 1.220 città. Harness a 166 asserzioni, tutte verdi. Il seed geografico
non si scrive a mano: lo genera `scripts/genera_geo.mjs` dal file, e l'harness
confronta i conteggi contro le statistiche dichiarate dal file stesso.

Tre cose che il mio schema provvisorio non prevedeva. **Non esistono codici
ISO:** ogni voce ha un identificatore testuale (`corea_del_sud`) e quello diventa
la chiave; inventare una corrispondenza ISO per 129 stati sarebbe stato
indovinare. **Una città può stare in due regioni** — Jaipur è in India del Nord e
in Rajasthan, ed è corretto — quindi l'unicità è per regione, non per stato.

E la terza, che è una decisione aperta e non un dettaglio: **la destinazione non
è sempre uno stato.** La tassonomia dichiara selezionabili le 14 macro-aree, i
129 stati e le 20 regioni italiane; continenti, città e regioni estere vivono
solo nel suggeritore. Ma il Flusso dice "la barra di ricerca normalizza qualunque
input a un paese", e `match_designers()` accetta un solo stato. I due documenti
non dicono la stessa cosa, e il codice oggi segue il Flusso.

*Verifica sulle voci paese di un designer reale:* 22 su 30 agganciano per nome
esatto ai 129 stati. Le altre otto sono i casi noti (cinque stati USA, la Scozia
che nella tassonomia è una regione estera del Regno Unito, Balcani e Caraibi da
scorporare), ora documentate in `MAPPATURA_VETRINA.md` con l'identificatore di
destinazione di ciascuna.

**8 agosto 2026 — la regola di ricerca (migration 0030)**
Decisa da Simone e implementata: città e continenti **non filtrano** (la città
porta al suo paese, il continente alle sue macro-aree), paesi e macro-aree sì.
Harness a 174 asserzioni, tutte verdi.

`match_designers` accetta ora la destinazione come livello + identificatore, e
**rifiuta i livelli che non filtrano sollevando un errore** invece di ignorarli.
La regola di prodotto vive nella funzione, non nella buona volontà di chi la
chiama: chi passa una città se ne accorge subito.

Una conseguenza logica da segnalare: **con una macro-area la banda 2 sparisce.**
"Un altro paese della stessa macro-area" è già dentro la banda 3, perché è
esattamente ciò che l'utente ha chiesto. Restano tre bande e serve una etichetta
nuova per la sezione (`esperti_macro_area`), che Gaia dovrà scrivere. Il livello
che entra nell'ordinamento è il migliore fra i paesi coperti là dentro, e il
badge chiede almeno un paese di livello 1 dentro quella macro-area.

Aggiunto `parent_ref` a `geo_search`, che è il filo per la navigazione del
suggeritore: continente → macro-aree → paesi.

*Regioni italiane: rimandate (migration 0031).* La tassonomia le dichiara
selezionabili, la regola dei quattro livelli non le nomina, e non si vuole un
quinto filtro. Invece di riscrivere il dato della tassonomia — che ne
perderebbe l'intenzione — il database tiene due fatti distinti: `is_selectable`
è cosa dichiara la tassonomia, `is_filterable` è cosa filtra oggi in XPETIS, e
il sito obbedisce al secondo. I due valori differiscono su venti righe soltanto,
e c'è un'asserzione che lo verifica: se un giorno quella differenza cambia, se
ne accorge qualcuno. Harness a 177 asserzioni.

**1 agosto 2026**
Lettura del flusso completo. Scelte due decisioni architetturali di fondo:
pagine token servite da route server-side con service key, e nessuna lettura
diretta delle tabelle dal browser. Costruito lo schema Supabase completo: 17
migration, 2 file di seed, 30 tabelle, la macchina a stati degli ordini imposta
da trigger, sette viste pubbliche, RLS chiusa. Scritto l'harness di verifica su
PGlite: 60 asserzioni, tutte verdi.

**2 agosto 2026**
Piano rivisto: design, flusso, tassonomia e i 25 profili TD esistono già, quindi
il perimetro è solo tecnico e il percorso critico non è più il design ma la
disponibilità di Simone. Aggiunta la milestone sull'import dei dati reali.
Chiuse le decisioni sull'infrastruttura: Supabase cloud free in sviluppo e Pro
al go-live, n8n self-hosted su Railway, Cal.com free con un account per TD,
Vercel Pro. Emersi due punti non previsti dal Flusso: il piano Hobby di Vercel
non copre l'uso commerciale, e la quota esecuzioni di n8n Cloud è incompatibile
con il workflow insoluti ogni 5 minuti.

**4 agosto 2026 — merge col piano di Alessandro**
Lavorato punto per punto `XPETIS_CONFRONTO_PIANI.md`. Undici decisioni.

*Base.* Resta il mio schema, da correggere strada facendo. Conseguenza: il
risparmio di 16-18 sessioni calcolato nel confronto non si applica, perché
valeva solo adottando il suo codice. Il merge riduce la varianza, non il
calendario.

*Accolte perché aveva ragione lui.* Il match va in una funzione Postgres: la mia
`public_td_profiles` esponeva ad `anon` livelli dei paesi e valori degli assi,
cioè esattamente ciò che il Flusso dice invisibile — era un difetto, non una
scelta. Il designer si identifica con `cal_username` + slug, perché i 25 copiano
lo stesso event type modello e lo slug da solo non identifica nessuno. La cassa
la apre il server: un Payment Link è pubblico e riusabile e niente lo lega al
prezzo di quella prenotazione. Lo slug sta in `payload.type`. Il workflow Stripe
risponde sempre 2xx. Il quiz si salva al primo login, altrimenti il briefing del
designer arriva vuoto. `td_publish_readiness` controlla la plausibilità e non
solo la completezza: un profilo tutto "Base" era completo e non funzionava.

*Corretto un conto del confronto.* Le 60.000 esecuzioni n8n al mese
presuppongono sette cron separati a 5 minuti. Un orologio unico che verifica
tutte le scadenze dovute costa 8.640 esecuzioni in totale, e su Railway sono
illimitate: la "strada C" con `pg_cron` costerebbe più e dividerebbe le
automazioni fra due sistemi. Resta un orologio unico su n8n self-hosted.

*Trovato incrociando i due documenti.* Se cancellare su Cal.com richiede solo il
codice della prenotazione, `cal_booking_uid` è una credenziale, e il mio
`grant select on bookings to authenticated` la consegnava al viaggiatore.
Da chiudere con una vista senza quel campo. E poiché le mail native di Cal.com
contengono i link di cancellazione, le regole di rimborso vanno applicate sul
webhook `BOOKING_CANCELLED`: non c'è modo di chiudere quella porta.

*Rischi accettati.* Token in chiaro nel database. Verso degli assi non ancora
fissato (nel nostro seed solo `pace` ha etichette vere) con controllo a vista
all'import. Mail native di Cal.com lasciate accese, con i nostri testi scritti
per convivere. Import fedele e correzione a mano dei 25 profili, 8-12 ore del
team. Il `.docx` del Flusso resta superato su cinque punti, tracciati qui.

*Chiuso.* S-05, con prove sul campo: webhook sì, prefill sì, e per cancellare
non serve nessuna chiave. Annullato S-10.

In attesa di: `GUIDA_PONTE_CALCOM.md` con le fixture, dataset geografico, link
Figma, JSON delle 25 vetrine, e via a procedere.

**6 agosto 2026 — mappatura del form vetrina**
Arrivati `vetrina-dennis-milello/` e `GUIDA_PONTE_CALCOM.md`. Letto il form e
scritto `supabase/MAPPATURA_VETRINA.md`: 30 campi mappati, 11 migration
individuate. Deciso di **non importare ora i dati di Dennis**: serve come
struttura, non come carico dati.

Tre scoperte. **Il livello dei paesi non è un campo del form:** non esiste come
campo modificabile, ogni riga nasce "Base" e nessuna interfaccia la cambia.
Quindi i designer non sono disattenti, il form non glielo chiede. L'unico segnale
di rilievo è `topDestinazioni` ("fino a 3, saranno messe in evidenza"), da cui la
regola: top destinazioni → livello 1, gli altri → livello 2, campo `livello`
ignorato. **I viaggi di gruppo nel JSON non sono del designer:** `gruppo[]` non ha
campi modificabili e resta il contenuto d'esempio (il "Argentina: Trekking in
Patagonia" di Dennis è l'esempio dentro il form). Non si importa mai, e la sezione
prevista dal Flusso resta senza sorgente. **Un'etichetta non aggancia:** il mio
seed dice "Aree estreme e polari", il form "Aree estreme/polari".

*Deciso.* Assi allineati al verso dichiarato nel form, con `aesthetics`
rinominato `curated_vs_real` perché il nome suggeriva il verso opposto a quello
vero, e `companions` portato a cinque opzioni. Recensioni di vetrina in una
tabella separata `td_showcase_reviews`, non esposta finché non si affrontano le
recensioni (milestone 8).

*Ancora aperti, non bloccanti:* se `group_trip` e `private_guiding` entrano
nell'enum dei servizi acquistabili; se la sezione viaggi di gruppo va aggiunta al
form o caricata dal team; se `giorni` e `prezzo` degli itinerari sono solo
etichette di vetrina; conferma della regola `topDestinazioni` → livello 1.

**6 agosto 2026 — migration 0018-0020, le correzioni**
Scritte e verificate le tre migration che chiudono i difetti aperti. Harness a 90
asserzioni, tutte verdi.

`0018` sostituisce `public_td_profiles` con `match_designers()` in
`SECURITY DEFINER`: l'algoritmo completo del Flusso in SQL — bande geografiche,
punteggio quiz sui sei assi, punteggio filtri in frazione, affinità pesata,
chiave di ordinamento a quattro livelli, badge, sezioni. Restituisce posizione,
banda, sezione, badge, paesi coperti per nome, i due assi più salienti e i temi
agganciati: nessun punteggio, nessun livello, nessun valore di asse. Una scelta
che vale la pena ricordare: **per comporre la frase non serve il valore dell'asse
del designer.** La salienza pesa l'affinità, quindi un asse saliente è per
costruzione un asse dove i due stanno dalla stessa parte, e il frammento si
scrive dalla risposta del viaggiatore, che lui già conosce. Avendo spostato il
match lato server sono caduti anche i pesi degli assi e i parametri di matching
dalla superficie pubblica: il browser non ne ha più bisogno.

`0019` sostituisce il grant su `bookings` e `orders` con `my_bookings` e
`my_orders`, filtrate su `auth.uid()` e prive di `cal_booking_uid`.

`0020` aggiunge `td_publish_blockers()` — foto, bio, paesi, **almeno un paese di
livello 1**, sei assi, consulenza attiva, account Cal.com — e un trigger di
vincolo differito che rifiuta la pubblicazione elencando i motivi. Più
`td_publish_warnings()` per ciò che non blocca ma fa perdere punteggio: paesi
senza tema, paesi senza contesto, più di tre livelli 1, assi tutti sullo stesso
valore, nessun servizio oltre la consulenza. Il caso del designer con 32 paesi
tutti "Base" ora non si pubblica, e il messaggio dice perché.

Aggiunti al seed tre paesi non coperti da nessuno (Cambogia, Corea del Sud,
India) per poter provare le bande 2 e 1, che senza di loro non erano
verificabili.

**6 agosto 2026 — migration 0021-0024, allineamento al form**
Harness a 133 asserzioni, tutte verdi.

`0021` chiude il rischio numero uno del piano. Il verso degli assi non è più
un'interpretazione: `quiz_axes.label_min` e `label_max` contengono gli estremi
dichiarati nel form, e si legge il verso da lì. L'asse `aesthetics` è diventato
`curated_vs_real`, perché il vecchio nome su scala crescente si leggeva "più
estetica" mentre nel form crescere significa *meno* estetica curata. `companions`
è passato a cinque opzioni con le parole esatte del form. Corretta l'etichetta
"Aree estreme/polari", che con la nostra "Aree estreme e polari" avrebbe fatto
perdere quel tag in silenzio a ogni import.

`0022` e `0023` danno casa ai campi di profilo e ai campi per paese, con vincoli
sulle liste chiuse: se il form cambia le parole, l'import fallisce in modo
visibile invece di scrivere una stringa che nessuno leggerà mai bene. La
copertura legale non è un campo decorativo: "ho già un'agenzia" è l'informazione
che popola `agency_id` per gli ordini All Inclusive.

`0024` porta i servizi da quattro a cinque. `group_trip` e `private_guiding`
entrano nell'enum perché il designer li attiva e la vetrina li mostra, ma il
vincolo su `orders.service_type` impedisce che nasca un ordine: **il database
registra la decisione ancora aperta invece di lasciarla a un commento.**

Da qui in avanti ogni tabella nuova nasce con RLS accesa e privilegi revocati in
modo esplicito: su Supabase i privilegi di default concedono `anon` e
`authenticated` sulle tabelle create dopo, quindi la revoca della 0016 non si
eredita. L'harness lo verifica a ogni run e ha già trovato la prima dimenticanza.

**6 agosto 2026 — migration 0025-0028, il contenuto di vetrina**
Harness a 150 asserzioni, tutte verdi. Con questo blocco **lo schema ha una casa
per ogni campo del form**: era il buco più grosso trovato leggendo il JSON, dove
circa quattro quinti del form non aveva dove atterrare.

Una tabella per sezione — viaggi firma con le foto, itinerari pronti, recensioni
esterne — con righe ordinate e uniche per designer. Il vincolo sul titolo non
vuoto serve all'import: il form nasce con tre righe di viaggio precompilate e
vuote, e senza quel vincolo finirebbero in vetrina.

Deroga consapevole alla convenzione degli importi in centesimi su
`td_ready_itineraries`: durata e prezzo arrivano dal form come testo
("5-7 giorni", "850€") e sono indicazioni di vetrina, non casse. La convenzione
`*_cents` vale dove passa denaro vero.

`public_td_showcase` serve ora tutta la vetrina in una query. Alzato a 15 MB il
limite del bucket immagini: le foto di un pacchetto reale arrivano a 6 MB l'una,
33 MB per 25 file. L'import dovrà comunque ridimensionarle — 1 GB di Storage sul
piano gratuito basta per una trentina di designer e noi ne abbiamo 25.

*Verifica strutturale sul JSON reale, senza importarlo.* Tutti i valori di lista
chiusa del pacchetto di Dennis — temi, contesti, durate, budget, "con chi
viaggi", copertura legale — sono riconosciuti dallo schema: **zero valori
inattesi**. Restano confermati i tre problemi già noti, che sono di dato e non di
struttura: due righe paese vuote, due nomi con spazio in coda ("Perù ",
"Vietnam "), e le voci che non sono stati.
