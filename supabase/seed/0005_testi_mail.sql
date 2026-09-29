-- XPETIS · seed 0005 · I testi delle mail
--
-- Questi **non sono codice**: sono righe di database, e si riscrivono da
-- Supabase Studio senza deploy. Li riscrive Gaia. Quello che c'è qui dentro è
-- una prima stesura che dice le cose giuste nel posto giusto, non il testo
-- definitivo.
--
-- ⚠️ `on conflict do nothing`: modificare questo file **non cambia niente** su
-- un database già seminato. Si correggono con un `update` da Studio, che è
-- esattamente il punto della tabella.
--
-- ===========================================================================
-- COME SI SCRIVE UN TESTO QUI DENTRO
-- ===========================================================================
--
-- **È prosa.** Una riga vuota separa due paragrafi, un a capo singolo va a
-- capo. Nient'altro: niente HTML, niente grassetti, niente elenchi puntati.
-- L'impaginazione la mette la macchina, ed è voluto — un tag aperto e mai
-- chiuso, scritto per sbaglio da Studio, arriverebbe a un cliente vero.
--
-- **Un indirizzo scritto in chiaro diventa un link** da solo, purché cominci
-- per `http://` o `https://`.
--
-- **I segnaposto si scrivono `{{cosi}}`**, e quelli ammessi da ogni testo sono
-- nella colonna `placeholders`. Un segnaposto che non esiste **fa fallire la
-- composizione**: la mail non parte e il team riceve un alert. È voluto: «Ciao
-- ,» e «{{designer}}» sono due modi di rompersi che vede solo il destinatario.
--
-- **Un segnaposto di blocco** (`{{bottoni_servizi}}`, `{{firma}}`) va lasciato
-- **da solo sulla sua riga**, con una riga vuota sopra e sotto. È come verrebbe
-- naturale scriverlo, ed è anche la regola che impedisce a un bottone di
-- finire dentro un paragrafo.
--
-- ===========================================================================
-- LE TRE REGOLE DI CONTENUTO CHE NON SI POSSONO ROMPERE
-- ===========================================================================
--
-- 1. **Niente aggettivi con il genere riferiti al designer.** Dei 25 non
--    sappiamo il genere e non lo vogliamo sapere da un database: si usano
--    **verbi**. «{{designer}} ti scrive», non «{{designer}} è pronto/a». Vale
--    anche per il viaggiatore, di cui sappiamo anche meno.
--
-- 2. **Il credito della consulenza non è un numero.** Non lo calcola il codice:
--    lo applica il designer nella proposta, scrivendo un prezzo già al netto.
--    Una mail che scrivesse «hai 60 € di credito» prometterebbe una cifra che
--    nessun automatismo garantisce. Si dice **che** si scala, mai **quanto**.
--
-- 3. **Le mail native di Cal.com restano accese** (deviazione 5 del PIANO) e
--    arrivano più o meno insieme alle nostre. I nostri testi ci **convivono**:
--    non ripetono la conferma, non ripetono l'annullamento, non contraddicono
--    le loro date. Dicono quello che Cal.com non sa dire.
--
-- E una quarta che è il tono: **il mittente è una casella vera**,
-- `info@xpetis.it`, dove le risposte arrivano davvero a qualcuno. Nessuna mail
-- dice «non rispondere a questo indirizzo», perché non sarebbe vero.

-- ===========================================================================
-- I BLOCCHI — pezzi che entrano dentro più di una mail
-- ===========================================================================

insert into message_templates (key, template_kind, audience, body_it, placeholders, notes) values
  ('blocco_firma', 'blocco', 'traveler',
E'Se hai bisogno di qualcosa rispondi a questa mail: dall''altra parte c''è una persona che legge.\n\nSe preferisci WhatsApp siamo al {{whatsapp}} — {{link_whatsapp}}\n\nXPETIS',
   array['whatsapp', 'link_whatsapp'],
   'La chiusura di ogni mail al viaggiatore. Il numero WhatsApp arriva da app_config.whatsapp_number: NON scriverlo a mano qui, oppure il giorno che cambia resta vecchio in tutte le mail. Il Flusso vuole quel numero in ogni mail (§11).'),

  ('blocco_intro_servizi', 'blocco', 'traveler',
E'Se vuoi andare avanti, ecco cosa potete fare insieme. Non c''è nessuna fretta: questi link restano buoni anche fra un mese.',
   array[]::text[],
   'La frase che apre i bottoni. Sta in un blocco e non nel corpo della mail per un motivo preciso: se quel designer non vende niente dopo la call, il blocco resta vuoto e la mail non annuncia qualcosa che poi non arriva.')
on conflict (key) do nothing;

-- I due servizi acquistabili dopo la call. Uno per riga perché il designer può
-- averne attivo uno, l'altro, tutti e due o nessuno: è `td_services.is_active` a
-- decidere quali bottoni compaiono, e la mail non lo sa prima di comporla.
--
-- ⚠️ `button_label_it` è cosa c'è scritto **sopra il bottone**, e il bottone lo
-- costruisce la macchina. Non va messo dentro il corpo.
insert into message_templates (key, template_kind, audience, body_it, button_label_it, placeholders, notes) values
  ('blocco_servizio_custom_itinerary', 'blocco', 'traveler',
E'Itinerario su misura — {{designer}} costruisce il tuo viaggio giorno per giorno: dove dormire, cosa vedere, come muoverti, con le sue scelte e i suoi tempi. Ti arriva un documento pronto da usare, e una revisione è compresa.',
   'Chiedi l''itinerario su misura',
   array['designer'],
   'Il bottone crea una RICHIESTA, non un acquisto: nessun prezzo esiste ancora, e dopo il clic si apre un gruppo WhatsApp con il designer. Il testo non deve far credere che si stia comprando qualcosa.'),

  ('blocco_servizio_all_inclusive', 'blocco', 'traveler',
E'All Inclusive — tutto prenotato e pagato prima di partire: voli, alloggi, esperienze. {{designer}} disegna il viaggio, un''agenzia partner lo prenota e ne risponde. Tu parti e basta.',
   'Chiedi l''All Inclusive',
   array['designer'],
   'Come sopra: è una richiesta. L''agenzia va nominata perché è lei il venditore e la garanzia formale (regime 74-ter), ma il viaggiatore non ci parla mai direttamente.')
on conflict (key) do nothing;

-- ===========================================================================
-- LE MAIL
-- ===========================================================================

-- La mail post-call. Il Flusso la chiama «la mail più importante del funnel»:
-- è l'unica che presenta i servizi, ed è il momento in cui il ferro è caldo.
--
-- Cosa NON dice, e per scelta:
--  · non chiede com'è andata (la recensione è milestone 8, e chiederla adesso
--    brucerebbe l'attenzione che serve ai bottoni);
--  · non mette fretta. I bottoni non scadono mai — è una decisione di prodotto
--    del Flusso — e una mail che dicesse «entro 48 ore» sarebbe una bugia;
--  · non nomina cifre di credito. Vedi la regola 2 in testa al file.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('postcall_traveler', 'mail', 'traveler',
   'Dopo la call con {{designer}}',
E'{{saluto}},\n\nla call con {{designer}} è finita da poco. Speriamo ti abbia dato quello che cercavi: un''idea più chiara di dove andare, e di come.\n\n{{bottoni_servizi}}\n\nUna cosa che vale la pena sapere: quello che hai pagato per la consulenza non è un costo a parte. {{designer}} lo scala dal prezzo del primo servizio che acquisti dopo questa call, senza scadenze.\n\nE se invece ti fermi qui va benissimo lo stesso.\n\n{{firma}}',
   array['saluto', 'designer', 'data_call', 'bottoni_servizi', 'firma'],
   'LA MAIL PIÙ IMPORTANTE DEL FUNNEL (Flusso §6). Parte a fine call, dal ramo post-call dell''orologio. {{bottoni_servizi}} contiene i bottoni dei SOLI servizi attivi di quel designer, e può essere vuoto: in quel caso la mail resta un ringraziamento, e deve reggersi lo stesso. NON nominare cifre di credito: il credito lo applica il designer nella proposta.'),

  ('unpaid_cancelled_traveler', 'mail', 'traveler',
   'Lo slot con {{designer}} è tornato libero',
E'{{saluto}},\n\navevi scelto un appuntamento con {{designer}} per il {{data_call}}, ma il pagamento non è arrivato entro il tempo in cui potevamo tenere l''orario da parte. Quello slot è tornato disponibile, e non ti abbiamo addebitato niente.\n\nSuccede. Se ti va, scegline un altro quando preferisci: il calendario di {{designer}} è qui.\n\n{{link_vetrina}}\n\nSe invece il pagamento si è bloccato e non capisci perché, scrivici e lo guardiamo insieme.\n\n{{firma}}',
   array['saluto', 'designer', 'data_call', 'link_vetrina', 'firma'],
   'La "mail cortese" del Flusso §4. Parte quando l''orologio ha liberato davvero lo slot su Cal.com, mai prima. CONVIVE con l''annullamento nativo di Cal.com, che arriva quasi insieme e porta il motivo scritto in app_config.unpaid_cancel_reason: questa non ripete l''annuncio, spiega il perché e dice cosa fare adesso.')
on conflict (key) do nothing;

-- ===========================================================================
-- L'ORDINE SU MISURA (migration 0044)
-- ===========================================================================

-- Al designer, alla nascita dell'ordine. È la mail che gli porta **il link
-- della sua pagina ordine**: il Flusso (§7) vuole che la riceva «a ogni nuovo
-- ordine», e senza questa mail il designer non ha nessun modo di scrivere la
-- proposta.
--
-- Qui, e solo qui, il credito ha un numero: al designer serve sapere quanto
-- può scalare, e il Flusso vuole che la sua pagina lo mostri («prezzo pagato
-- per la consulenza da scalare»). La regola 2 in testa al file riguarda le mail
-- al viaggiatore, a cui un numero sarebbe una promessa.
--
-- ⚠️ Il link è una credenziale permanente, e il testo lo dice al designer con
-- parole sue: non inoltrarla. Chi la apre scrive la proposta al posto suo.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('order_new_td', 'mail', 'td',
   'Nuova richiesta {{human_ref}}: itinerario su misura',
E'{{saluto}},\n\n{{nome_viaggiatore}} ha chiesto l''itinerario su misura dopo la call del {{data_call}}. Il riferimento è {{human_ref}}: usalo nel gruppo WhatsApp che apriamo con voi, così parliamo tutti della stessa richiesta.\n\nQuando avete chiarito cosa serve, la proposta si scrive da qui: descrizione del viaggio, prezzo e giorni di consegna. È la pagina di questo ordine, e da qui seguirai anche i passi dopo.\n\n{{link_ordine}}\n\nPrima di scrivere il prezzo, due cose.\n\nIl prezzo che scrivi è quello che paga il viaggiatore. La consulenza costava {{prezzo_call}} e va già scalata lì, a meno che quel credito non sia stato usato su un altro ordine della stessa call: la pagina te lo dice. Il sistema non toglie niente da solo.\n\nUna volta inviata, la proposta non si modifica più dalla pagina. Prima di inviarla la puoi salvare e correggere quante volte vuoi; dopo, se serve cambiarla, scrivi al team.\n\nQuesto link è personale: non inoltrarlo. Chi lo apre può scrivere la proposta al posto tuo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'nome_viaggiatore', 'data_call', 'human_ref', 'prezzo_call', 'link_ordine', 'whatsapp'],
   'Parte alla nascita di ogni ordine su misura, dal trigger della 0044. Porta il link della pagina ordine del designer: senza questa mail il designer non può scrivere la proposta. Il link NON scade ed è una credenziale: il testo deve continuare a dire di non inoltrarlo. Niente aggettivi con il genere: né per il designer né per il viaggiatore.')
on conflict (key) do nothing;

-- Al viaggiatore, all'invio della proposta. Il Flusso: «è lei che vende», e
-- porta «tutta la spiegazione del viaggio, il prezzo, le condizioni e il link
-- di pagamento». Il link è alla pagina gemella, non a Stripe: una cassa Stripe
-- scade in mezz'ora, una mail no.
--
-- Il credito qui **non ha un numero**, per la regola 2: il prezzo è finale e
-- l'ha scritto il designer. Si dice che se c'era da scalare è stato scalato,
-- non quanto.
--
-- Convive con quello che il viaggiatore ha già ricevuto: la post-call gli ha
-- detto che la consulenza si scala dal primo servizio. Questa mantiene la
-- promessa senza ripeterla parola per parola.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('proposal_traveler', 'mail', 'traveler',
   'La proposta di {{designer}} per il tuo viaggio',
E'{{saluto}},\n\necco la proposta di {{designer}} per il tuo itinerario su misura ({{human_ref}}).\n\n{{descrizione}}\n\nPrezzo: {{prezzo}}\nConsegna: entro {{giorni_consegna}} dal pagamento\n\nIl prezzo è quello finale, da pagare così com''è: se c''era la consulenza da scalare, {{designer}} l''ha già fatto. Comprende l''itinerario completo e una revisione, se dopo la consegna vuoi cambiare qualcosa.\n\nPer pagare apri la proposta: è la stessa che leggi qui, con il pagamento dentro.\n\n{{link_proposta}}\n\nSe qualcosa non ti torna, dillo nel gruppo WhatsApp prima di pagare: la proposta si può rifare.\n\n{{firma}}',
   array['saluto', 'designer', 'human_ref', 'descrizione', 'prezzo', 'giorni_consegna', 'link_proposta', 'firma'],
   'Parte all''invio della proposta, dal trigger della 0044: se il team rimanda una proposta rifatta, ne parte una nuova. {{descrizione}} è il testo del designer, così come l''ha scritto. NON nominare cifre di credito: il prezzo è già al netto per scelta del designer. {{link_proposta}} porta alla pagina gemella, dove sta il pagamento.')
on conflict (key) do nothing;

-- Il messaggio pronto da copiare nel gruppo WhatsApp. Non è una mail: il
-- designer lo trova sulla sua pagina ordine dopo l'invio (Flusso §7: «un
-- messaggio pronto da copiare che riceve al momento dell'invio»). È scritto
-- **con la voce del designer**, perché è lui a mandarlo.
insert into message_templates (key, template_kind, audience, body_it, placeholders, notes) values
  ('blocco_whatsapp_proposta', 'blocco', 'td',
E'Ecco la proposta per il tuo itinerario su misura ({{human_ref}}): {{link_proposta}}\n\nDentro trovi tutto, il prezzo e i tempi di consegna, e puoi pagare direttamente da lì. Se qualcosa non ti torna scrivilo qui prima di pagare, e la sistemiamo.',
   array['human_ref', 'link_proposta'],
   'Il messaggio che il designer copia nel gruppo WhatsApp dopo l''invio della proposta. Lo manda LUI, quindi è in prima persona sua. Si compone in pagina, non parte per mail.')
on conflict (key) do nothing;

-- ===========================================================================
-- Aggiunti con la 0045
-- ===========================================================================

-- Al designer, quando il viaggiatore paga la proposta. Il Flusso vuole il
-- messaggio «in pagina e via mail»: in pagina c'era già, questa è la mail.
-- Senza, il designer lo scopre solo riaprendo il link per caso, e i giorni di
-- consegna intanto corrono.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('order_paid_td', 'mail', 'td',
   'Pagata la proposta {{human_ref}}: si comincia',
E'{{saluto}},\n\n{{nome_viaggiatore}} ha pagato la proposta {{human_ref}} ({{prezzo}}). Da adesso puoi cominciare a lavorare all''itinerario.\n\nLa consegna è entro {{giorni_consegna}} dal pagamento, cioè entro il {{data_consegna}}.\n\nLa pagina dell''ordine è la stessa di sempre, e da lì seguirai i passi dopo:\n\n{{link_ordine}}\n\nQuesto link è personale: non inoltrarlo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'nome_viaggiatore', 'human_ref', 'prezzo', 'giorni_consegna', 'data_consegna', 'link_ordine', 'whatsapp'],
   'Parte quando un ordine su misura passa da proposal_sent a in_progress, cioè quando il viaggiatore paga (trigger della 0045). Porta lo stesso link della mail di nascita dell''ordine, che è una credenziale: il testo deve continuare a dire di non inoltrarlo. Niente aggettivi con il genere: né per il designer né per il viaggiatore.')
on conflict (key) do nothing;

-- L'involucro delle notifiche interne agli amministratori (0045). Il
-- contenuto lo compone chi chiama — il messaggio di un alert, o quello del
-- pagamento — e qui c'è solo la cornice. È per il team, non per un cliente:
-- può dire da dove arriva e come si spegne.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('team_notifica', 'mail', null,
   '{{titolo}}',
E'{{messaggio}}\n\nArriva agli amministratori perché «{{evento}}» è fra gli eventi di app_config.team_notify_events. Per non riceverla più si toglie da lì, da Studio.',
   array['titolo', 'messaggio', 'evento'],
   'La cornice di tutte le notifiche interne: una riga di coda per destinatario, con message_kind = team_<evento>. Destinatari in app_config.team_notify_recipients, eventi in app_config.team_notify_events.')
on conflict (key) do nothing;

-- ===========================================================================
-- Aggiunti con la 0046 — il dopo-call del designer, la consegna, la revisione
-- ===========================================================================

-- Al designer, alla fine della call: il silenzio chiude, i due tasti fermano.
-- Il Flusso: «il TD ha nella sua mail i tasti per l'eccezione». Deve dire
-- **che non fare niente va bene** — è il caso normale — e **fino a quando** i
-- tasti funzionano. Niente aggettivi con il genere: né per il designer, né per
-- chi ha prenotato (per questo «dall'altra parte non c'era nessuno» e non
-- «non si è presentato»).
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('postcall_td', 'mail', 'td',
   'La call del {{data_call}}: se è andata bene, non serve fare niente',
E'{{saluto}},\n\nla call con {{nome_viaggiatore}} del {{data_call}} è finita. Se è andata bene non devi fare niente: fra {{ore_chiusura}} ore, il {{data_chiusura}}, la consulenza si chiude da sola.\n\nSe invece qualcosa non è andato, dillo da qui prima di allora. Ognuno dei due tasti apre una pagina con una domanda sola.\n\n{{tasti}}\n\nCon uno dei due la chiusura si ferma e la call passa al team, che ti scrive. Dopo il {{data_chiusura}} i tasti non funzionano più: per qualunque cosa il team è su WhatsApp al {{whatsapp}}.\n\nQuesti link sono personali: non inoltrarli.\n\nXPETIS',
   array['saluto', 'nome_viaggiatore', 'data_call', 'ore_chiusura', 'data_chiusura', 'tasti', 'whatsapp'],
   'Parte alla fine di ogni call confermata, dal ramo clock_ramo_postcall_td (0046). {{tasti}} va lasciato da solo sulla sua riga: sono i due bottoni. I link sono credenziali: il testo deve continuare a dire di non inoltrarli. Niente aggettivi con il genere.')
on conflict (key) do nothing;

insert into message_templates (key, template_kind, audience, body_it, button_label_it, placeholders, notes) values
  ('blocco_td_no_show', 'blocco', 'td',
   'Se all''orario della call dall''altra parte non c''era nessuno, anche dopo l''attesa prevista:',
   'Segnala un no-show',
   '{}',
   'Il primo dei due tasti della mail postcall_td. Porta alla pagina del no-show: la segnalazione NON chiude la call come no-show, la passa al team che verifica.'),
  ('blocco_td_problema', 'blocco', 'td',
   'Se c''è stato un altro problema (la call interrotta, un collegamento che non ha funzionato, qualcosa che il team deve sapere):',
   'Segnala un problema',
   '{}',
   'Il secondo dei due tasti della mail postcall_td. La call va in disputa e il team arbitra.')
on conflict (key) do nothing;

-- Al viaggiatore, alla consegna. Il Flusso: «il viaggiatore lo riceve via
-- mail». ⚠️ Il link è quello della **pagina**, che non scade, e non quello del
-- file: un link di Storage in una mail smetterebbe di funzionare, e il
-- viaggiatore si troverebbe un itinerario pagato che non scarica più.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('delivery_traveler', 'mail', 'traveler',
   'Il tuo itinerario su misura è arrivato ({{human_ref}})',
E'{{saluto}},\n\n{{designer}} ha consegnato il tuo itinerario su misura ({{human_ref}}). Lo trovi qui, e da qui lo scarichi quando vuoi: il link resta valido.\n\n{{link_pagina}}\n\nLeggilo con calma. Se vuoi cambiare qualcosa hai una revisione inclusa: la chiedi dalla stessa pagina entro {{giorni_revisione}} giorni, cioè entro il {{data_limite_revisione}}, scrivendo cosa vorresti diverso.\n\nSe va bene così non devi fare niente.\n\n{{firma}}',
   array['saluto', 'designer', 'human_ref', 'link_pagina', 'giorni_revisione', 'data_limite_revisione', 'firma'],
   'Parte alla prima consegna, dal trigger della 0046. {{link_pagina}} è la pagina a token del viaggiatore: MAI mettere qui un link al file. La revisione si promette una, entro la data.')
on conflict (key) do nothing;

insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('revision_delivered_traveler', 'mail', 'traveler',
   'La versione rivista del tuo itinerario ({{human_ref}})',
E'{{saluto}},\n\n{{designer}} ha consegnato la versione rivista del tuo itinerario ({{human_ref}}). La trovi sulla stessa pagina di prima, insieme alla prima versione:\n\n{{link_pagina}}\n\nCon questa la revisione inclusa è fatta. Se qualcosa ancora non torna, scrivici prima del {{data_chiusura}}: è il giorno in cui l''ordine si chiude.\n\n{{firma}}',
   array['saluto', 'designer', 'human_ref', 'link_pagina', 'data_chiusura', 'firma'],
   'Parte alla riconsegna dopo la revisione (0046). Non promettere una seconda revisione: non esiste. {{data_chiusura}} è l''ultima consegna più revision_window_days.')
on conflict (key) do nothing;

-- Al designer, quando viene chiesta la revisione. {{nota}} è il testo di chi
-- l'ha chiesta, così come l'ha scritto.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('revision_requested_td', 'mail', 'td',
   'Revisione chiesta su {{human_ref}}',
E'{{saluto}},\n\n{{nome_viaggiatore}} ha chiesto la revisione inclusa dell''itinerario {{human_ref}}. Ecco cosa ha scritto:\n\n{{nota}}\n\nQuando la versione rivista è pronta, la carichi dalla pagina dell''ordine, come la prima volta:\n\n{{link_ordine}}\n\nÈ l''unica revisione inclusa: se dopo servisse altro, se ne parla nel gruppo WhatsApp.\n\nQuesto link è personale: non inoltrarlo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'nome_viaggiatore', 'human_ref', 'nota', 'link_ordine', 'whatsapp'],
   'Parte quando il viaggiatore chiede la revisione (0046). Il link è una credenziale: il testo deve continuare a dire di non inoltrarlo. Niente aggettivi con il genere.')
on conflict (key) do nothing;

-- Il messaggio pronto dopo la consegna, da copiare nel gruppo. Con la voce del
-- designer, come quello della proposta. Porta alla pagina, non al file, e non
-- nomina la revisione: dopo la riconsegna non ce n'è più una da chiedere, e il
-- messaggio vale per tutte e due le consegne.
insert into message_templates (key, template_kind, audience, body_it, placeholders, notes) values
  ('blocco_whatsapp_consegna', 'blocco', 'td',
E'Ecco il tuo itinerario ({{human_ref}}): {{link_pagina}}\n\nLo trovi lì e lo scarichi quando vuoi. Se c''è qualcosa da cambiare, dimmelo qui.',
   array['human_ref', 'link_pagina'],
   'Il messaggio che il designer copia nel gruppo WhatsApp dopo una consegna. Lo manda LUI, in prima persona sua. Si compone in pagina, non parte per mail. Il link è la pagina del viaggiatore, mai il file.')
on conflict (key) do nothing;

-- ===========================================================================
-- Aggiunti con la 0047 — l'All Inclusive
-- ===========================================================================
--
-- Una regola in più, oltre alle tre in testa al file: **l'agenzia non parla
-- mai con il viaggiatore** (Flusso §8, «la cucina resta in cucina»). Nelle mail
-- al viaggiatore l'agenzia compare come garanzia — chi organizza il viaggio e
-- incassa — e mai come interlocutore: per qualunque cosa si scrive nel gruppo.

-- Al designer, alla nascita dell'ordine All Inclusive. È la gemella di
-- order_new_td: stesso link, ma la proposta qui è un documento e passa
-- dall'agenzia prima di arrivare al viaggiatore.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('order_new_td_ai', 'mail', 'td',
   'Nuova richiesta {{human_ref}}: All Inclusive',
E'{{saluto}},\n\n{{nome_viaggiatore}} ha chiesto l''All Inclusive dopo la call del {{data_call}}. Il riferimento è {{human_ref}}: usalo nei due gruppi WhatsApp che apriamo, quello con il viaggiatore e quello tecnico con l''agenzia.\n\nQuando il pacchetto è definito nel gruppo tecnico, la proposta si prepara da qui: il documento di viaggio, il prezzo totale e la data di partenza. È la pagina di questo ordine, e da qui seguirai anche i passi dopo.\n\n{{link_ordine}}\n\nTre cose da sapere prima.\n\nLa proposta non arriva subito al viaggiatore: va prima all''agenzia, che la verifica. Se qualcosa non torna te lo dice, la correggi e la rimandi.\n\nIl prezzo che scrivi è il totale che paga il viaggiatore. La consulenza costava {{prezzo_call}} e va già scalata lì, a meno che quel credito non sia stato usato su un altro ordine della stessa call: la pagina te lo dice. Il sistema non toglie niente da solo. L''acconto lo calcola il sistema sul totale.\n\nQuesto link è personale: non inoltrarlo. Chi lo apre può preparare la proposta al posto tuo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'nome_viaggiatore', 'data_call', 'human_ref', 'prezzo_call', 'link_ordine', 'whatsapp'],
   'Parte alla nascita di ogni ordine All Inclusive (0047). Porta il link della pagina ordine: senza, il designer non può preparare la proposta. Il link NON scade ed è una credenziale: il testo deve continuare a dire di non inoltrarlo. Niente aggettivi con il genere.')
on conflict (key) do nothing;

-- All'agenzia, all'invio della proposta. Flusso §8: «via mail, con documento,
-- prezzo e un tasto di conferma». Il documento non è allegato: si scarica
-- dalla pagina, dove stanno anche i due tasti. Il link si consuma alla prima
-- risposta e scade: il testo lo deve dire, altrimenti un link morto sembra un
-- guasto.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('agency_proposal_confirm', 'mail', 'agency',
   'Da verificare: proposta All Inclusive {{human_ref}}',
E'Buongiorno {{agenzia}},\n\n{{designer}} ha preparato la proposta All Inclusive {{human_ref}} (invio n. {{invio_n}}). Prima di arrivare al viaggiatore passa da voi.\n\nTotale: {{totale}}\nAcconto ({{percentuale}}): {{acconto}}\nSaldo: {{saldo}}\nPartenza: {{partenza}}\nRientro: {{ritorno}}\nDocumento: {{documento}}\n\n{{descrizione}}\n\nDalla pagina qui sotto scaricate il documento e rispondete con un clic: Confermo, oppure Non fattibile, con due righe sul perché.\n\n{{link_verifica}}\n\nIl link vale per una risposta sola ed entro il {{valido_fino}}. Alla conferma il viaggiatore riceve la proposta con il link dell''acconto: da quel momento prezzo e condizioni non si cambiano più.\n\nSe qualcosa va chiarito prima, se ne parla nel gruppo tecnico. Per il team XPETIS: WhatsApp {{whatsapp}}.\n\nXPETIS',
   array['agenzia', 'designer', 'human_ref', 'invio_n', 'descrizione', 'totale', 'percentuale', 'acconto', 'saldo', 'partenza', 'ritorno', 'documento', 'link_verifica', 'valido_fino', 'whatsapp'],
   'Parte a ogni invio della proposta all''agenzia, e a ogni rinnovo del link (0047). Il link è una credenziale monouso a scadenza: il testo deve dire che vale una volta ed entro quando. {{descrizione}} è il testo del designer.')
on conflict (key) do nothing;

-- Al designer, l'esito della verifica. Confermata: il viaggiatore ha già la
-- proposta, e sulla pagina c'è il messaggio da girare nel gruppo commerciale.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('agency_confirmed_td', 'mail', 'td',
   '{{agenzia}} ha confermato la proposta {{human_ref}}',
E'{{saluto}},\n\n{{agenzia}} ha confermato la proposta {{human_ref}}. Il viaggiatore l''ha appena ricevuta per mail, con il link per pagare l''acconto.\n\nSulla pagina dell''ordine trovi il messaggio pronto da girare nel gruppo commerciale, con il link della proposta:\n\n{{link_ordine}}\n\nQuesto link è personale: non inoltrarlo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'human_ref', 'agenzia', 'link_ordine', 'whatsapp'],
   'Parte quando l''agenzia conferma (o il team conferma da Studio per lei), 0047. Niente aggettivi con il genere.'),
  ('agency_rejected_td', 'mail', 'td',
   'Proposta {{human_ref}}: {{agenzia}} chiede una correzione',
E'{{saluto}},\n\n{{agenzia}} non ha confermato la proposta {{human_ref}}. Ecco cosa ha scritto:\n\n{{nota}}\n\nLa proposta è tornata tua: la correggi dalla pagina dell''ordine e la rimandi, e l''agenzia la riceve di nuovo. Al viaggiatore non è arrivato niente.\n\n{{link_ordine}}\n\nSe serve chiarire, il posto è il gruppo tecnico.\n\nQuesto link è personale: non inoltrarlo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'human_ref', 'agenzia', 'nota', 'link_ordine', 'whatsapp'],
   'Parte quando l''agenzia risponde Non fattibile (0047). {{nota}} è il testo dell''agenzia. Niente aggettivi con il genere.')
on conflict (key) do nothing;

-- Al viaggiatore, alla conferma dell'agenzia. Flusso §8: «la mail al
-- viaggiatore con la proposta allegata e il link per l'acconto». È lei che
-- vende, come quella del su misura: il testo del designer sta nel corpo. Il
-- documento si scarica dalla pagina — lo stesso che l'agenzia ha verificato.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('ai_proposal_traveler', 'mail', 'traveler',
   'Il tuo viaggio con {{designer}}: la proposta ({{human_ref}})',
E'{{saluto}},\n\necco la proposta di {{designer}} per il tuo viaggio All Inclusive ({{human_ref}}). È stata verificata da {{agenzia}}, l''agenzia che organizza il viaggio e ne è garante.\n\n{{descrizione}}\n\nTotale: {{totale}}\nPartenza: {{partenza}}\n\nSi paga in due momenti. Adesso l''acconto, il {{percentuale}} del totale: {{acconto}}. Con l''acconto l''agenzia comincia le prenotazioni vere. Il saldo, {{saldo}}, ti verrà chiesto più avanti, con i tempi di voli e strutture, e comunque prima della partenza.\n\nIl prezzo è quello finale: se c''era la consulenza da scalare, {{designer}} l''ha già fatto.\n\nLa proposta completa, con il documento da scaricare e il pagamento dell''acconto, è qui:\n\n{{link_pagina}}\n\nSe qualcosa non ti torna, dillo nel gruppo WhatsApp prima di pagare.\n\n{{firma}}',
   array['saluto', 'designer', 'agenzia', 'human_ref', 'descrizione', 'totale', 'percentuale', 'acconto', 'saldo', 'partenza', 'link_pagina', 'firma'],
   'Parte alla conferma dell''agenzia (0047). {{link_pagina}} porta alla pagina del viaggiatore, dove stanno il documento e la cassa dell''acconto. NON nominare cifre di credito. L''agenzia è una garanzia, non un interlocutore: si scrive nel gruppo.')
on conflict (key) do nothing;

-- Al viaggiatore, quando il team ha scritto i tempi del saldo.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('ai_balance_traveler', 'mail', 'traveler',
   'Il saldo del tuo viaggio ({{human_ref}}), entro il {{data_saldo}}',
E'{{saluto}},\n\nle prenotazioni del tuo viaggio con {{designer}} ({{human_ref}}) sono avviate, ed è il momento del saldo: {{saldo}}, da pagare entro il {{data_saldo}}. La data la dettano voli e strutture, ed è prima della partenza del {{partenza}}.\n\nSi paga dalla stessa pagina della proposta:\n\n{{link_pagina}}\n\nA saldo pagato, {{designer}} prepara il documento finale del viaggio, con biglietti, voucher e istruzioni.\n\nSe per quella data c''è un problema, scrivilo subito nel gruppo WhatsApp.\n\n{{firma}}',
   array['saluto', 'designer', 'human_ref', 'saldo', 'data_saldo', 'partenza', 'link_pagina', 'firma'],
   'Parte quando l''ordine entra in attesa del saldo: acconto pagato e tempi scritti dal team in orders.balance_due_at (0047). Una sola per ordine: se la data cambia dopo, lo si dice nel gruppo (la pagina la mostra sempre aggiornata).')
on conflict (key) do nothing;

-- Al designer, a saldo incassato: adesso il file finale.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('ai_balance_paid_td', 'mail', 'td',
   'Saldato {{human_ref}}: si carica il documento finale',
E'{{saluto}},\n\n{{nome_viaggiatore}} ha pagato il saldo dell''All Inclusive {{human_ref}}. Adesso tocca al documento finale: il documento di viaggio completo, con biglietti, voucher, contatti e istruzioni. La partenza è il {{partenza}}.\n\nLo carichi dalla pagina dell''ordine:\n\n{{link_ordine}}\n\nQuesto link è personale: non inoltrarlo.\n\nPer qualunque dubbio il team è su WhatsApp al {{whatsapp}}.\n\nXPETIS',
   array['saluto', 'nome_viaggiatore', 'human_ref', 'partenza', 'link_ordine', 'whatsapp'],
   'Parte quando il saldo è incassato (0047). Niente aggettivi con il genere.')
on conflict (key) do nothing;

-- Al viaggiatore, alla consegna del documento finale. ⚠️ Deve dire che per
-- scaricarlo serve entrare con Google: il documento contiene biglietti e
-- voucher, e dal link girato nel gruppo non si scarica (decisione del 27
-- settembre). Senza questa riga la prima reazione è «il link non funziona».
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('ai_delivery_traveler', 'mail', 'traveler',
   'Il tuo documento di viaggio è pronto ({{human_ref}})',
E'{{saluto}},\n\n{{designer}} ha preparato il documento finale del tuo viaggio ({{human_ref}}): biglietti, voucher, contatti e istruzioni, tutto in un posto. La partenza è il {{partenza}}.\n\nLo trovi qui:\n\n{{link_pagina}}\n\nPer scaricarlo ti chiediamo di entrare con l''account Google con cui hai prenotato la consulenza: dentro ci sono i tuoi biglietti, e così li apri solo tu.\n\nBuon viaggio.\n\n{{firma}}',
   array['saluto', 'designer', 'human_ref', 'partenza', 'link_pagina', 'firma'],
   'Parte alla consegna del documento finale All Inclusive (0047). {{link_pagina}} è la pagina del viaggiatore: MAI un link al file. Il testo deve dire che per scaricare serve l''accesso con Google.')
on conflict (key) do nothing;

-- I due messaggi pronti per il gruppo commerciale, con la voce del designer.
insert into message_templates (key, template_kind, audience, body_it, placeholders, notes) values
  ('blocco_whatsapp_ai_proposta', 'blocco', 'td',
E'Ecco la proposta per il nostro viaggio ({{human_ref}}), verificata dall''agenzia: {{link_pagina}}\n\nDentro trovi il documento completo, il totale e l''acconto, che si paga da lì. Il saldo arriverà più avanti, con i tempi di voli e strutture. Se qualcosa non ti torna scrivilo qui prima di pagare.',
   array['human_ref', 'link_pagina'],
   'Il messaggio che il designer copia nel gruppo commerciale dopo la conferma dell''agenzia (0047). Lo manda LUI, in prima persona sua.'),
  ('blocco_whatsapp_ai_consegna', 'blocco', 'td',
E'Il documento finale del viaggio ({{human_ref}}) è pronto: {{link_pagina}}\n\nDentro ci sono biglietti, voucher e istruzioni. Per scaricarlo si entra con l''account Google della prenotazione, così resta solo tuo.',
   array['human_ref', 'link_pagina'],
   'Il messaggio che il designer copia nel gruppo commerciale dopo la consegna del documento finale (0047). Il link è la pagina, mai il file: il file si scarica solo col login.')
on conflict (key) do nothing;

-- ===========================================================================
-- Aggiunto con la 0050 — il digest giornaliero del team
-- ===========================================================================
-- Agli amministratori, una volta al giorno. È un testo per il team, non per un
-- cliente: può essere asciutto. Le due regole che non si rompono: dire **come
-- si zittisce un alert** (altrimenti il digest diventa rumore), e non
-- promettere che la mail arriva ogni giorno — senza alert aperti non parte.
insert into message_templates (key, template_kind, audience, subject_it, body_it, placeholders, notes) values
  ('team_digest', 'mail', null,
   '[XPETIS] Alert del {{data}}: {{n_nuovi}} nuovi, {{n_aperti}} ancora aperti',
E'Nuovi dall''ultimo digest ({{n_nuovi}}):\n\n{{nuovi}}\n\nAncora aperti da prima ({{n_aperti}}):\n\n{{aperti}}\n\nLa coda completa, in ordine di quanto costa ignorarli, è la vista team_coda_alert su Studio.\n\nPer chiudere un alert: Studio, tabella team_alerts, colonna risolto su true. Chiuderlo lo riarma: finché uno resta aperto, gli alert nuovi dello stesso tipo non vengono scritti. Quelli che il database sa verificare si chiudono da soli.\n\nQuesta mail arriva agli indirizzi di app_config.team_notify_recipients, all''ora di team_digest_hour, e solo se c''è almeno un alert aperto.',
   array['data', 'n_nuovi', 'n_aperti', 'nuovi', 'aperti'],
   'Il digest giornaliero del team (0050), composto da clock_ramo_digest_team. {{nuovi}} e {{aperti}} sono elenchi composti dal database: vanno lasciati su un paragrafo loro. Deve continuare a dire come si chiude un alert.')
on conflict (key) do nothing;
