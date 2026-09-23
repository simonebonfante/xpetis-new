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
