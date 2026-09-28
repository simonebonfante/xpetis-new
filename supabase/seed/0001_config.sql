-- XPETIS · seed 0001 · Tassonomie fisse e parametri di partenza
-- I valori numerici sono punti di partenza dichiarati nel flusso, da tarare sui
-- dati reali dei TD Fondatori. Si cambiano da Supabase Studio, senza deploy.

-- I 6 assi del quiz, con i pesi della sez. 2 del Flusso e il verso dichiarato
-- nel form Vetrina TD. `label_min` e `label_max` sono il verso: non dedurlo mai
-- dal nome del codice, è l'errore che nessuna prova tecnica intercetta.
-- Domanda e ordine vengono da `xpetis_quiz_viaggiatore_.json` (migration 0049):
-- "con chi viaggi" è la sesta domanda, non la terza.
-- ⚠️ `planning_involvement` si legge al contrario del nome: il valore 1 è il
-- viaggiatore che vuole decidere di più, cioè "Poco controllo" del designer.
insert into quiz_axes (code, kind, label_it, question_it, weight, scale_max, label_min, label_max, sort_order) values
  ('planning_involvement', 'continuous',  'Coinvolgimento nella pianificazione',
   'Quanto vuoi essere coinvolto nella progettazione del viaggio?',                              1.5, 4, 'Poco controllo',  'Molto controllo', 1),
  ('pace',                 'continuous',  'Ritmo',
   'Come vuoi che scorra il tuo tempo durante il viaggio?',                                      3.0, 4, 'Slow',            'Dynamic',         2),
  ('comfort_wild',         'continuous',  'Comfort / Wild',
   'Se un''esperienza straordinaria richiede un po'' di fatica o disagio, tu...',               1.5, 4, 'Comfort',         'Wild',            3),
  ('curated_vs_real',      'continuous',  'Estetica curata / Vita reale',
   'Quale di queste immagini senti più tua?',                                                    1.0, 4, 'Estetica curata', 'Vita reale',      4),
  ('social_orientation',   'continuous',  'Orientamento sociale',
   'In viaggio, cerchi più raccoglimento o connessione?',                                        1.0, 4, 'Intimità',        'Socialità',       5),
  ('companions',           'categorical', 'Con chi viaggi',
   'Con chi vivrai questo viaggio?',                                                             2.0, 5, null,              null,              6)
on conflict (code) do nothing;

-- Le risposte. Due colonne con due mestieri diversi:
--  · `label_it` è l'etichetta corta. Su "con chi viaggi" è una **chiave**: le
--    parole esatte del form (`CONCHI`), che arriveranno nei JSON delle vetrine.
--  · `answer_it` è la risposta come la legge il viaggiatore, dal quiz. Sui
--    cinque assi continui il valore è lo `score` del file; su "con chi viaggi"
--    il testo è agganciato alla chiave del form (`td_value_match`).
-- I valori intermedi 2 e 3 dei continui non hanno un'etichetta corta: il quiz
-- mostra `answer_it`, e nessun altro le legge.
insert into quiz_axis_options (axis_code, value, label_it, answer_it) values
  ('planning_involvement', 1, 'Poco controllo',  'Voglio decidere io, ho bisogno di un esperto che mi guidi'),
  ('planning_involvement', 2, 'DA SCRIVERE',     'Mi piace co-progettarlo, costruiamolo insieme!'),
  ('planning_involvement', 3, 'DA SCRIVERE',     'Voglio una proposta già pronta, poi la facciamo nostra insieme'),
  ('planning_involvement', 4, 'Molto controllo', 'Pensateci voi, io voglio solo viverlo'),
  ('pace', 1, 'Lento',   'Lento: poche cose, vissute a fondo'),
  ('pace', 2, 'Disteso', 'Disteso: clima rilassato con qualche esplorazione nei posti vicini'),
  ('pace', 3, 'Vivace',  'Vivace: ritmo energico e curioso ma senza frenesia'),
  ('pace', 4, 'Intenso', 'Intenso: voglio fare e vedere il più possibile'),
  ('comfort_wild', 1, 'Comfort',     'Cerco sempre l''alternativa più comoda'),
  ('comfort_wild', 2, 'DA SCRIVERE', 'Valuto caso per caso, dipende da quanto ne vale la pena'),
  ('comfort_wild', 3, 'DA SCRIVERE', 'Ci sto, se è organizzata bene'),
  ('comfort_wild', 4, 'Wild',        'È proprio quello che voglio, la fatica fa parte del viaggio'),
  ('curated_vs_real', 1, 'Estetica curata', 'Un paesaggio perfetto, quasi da cartolina'),
  ('curated_vs_real', 2, 'DA SCRIVERE',     'Un posto bellissimo ma autentico, fuori dai circuiti turistici'),
  ('curated_vs_real', 3, 'DA SCRIVERE',     'Un''atmosfera viva fatta di dettagli, non di effetti speciali'),
  ('curated_vs_real', 4, 'Vita reale',      'Un luogo vero, anche grezzo, dove senti la vita scorrere'),
  ('social_orientation', 1, 'Intimità',    'Voglio stare con me stesso o con chi è con me in viaggio'),
  ('social_orientation', 2, 'DA SCRIVERE', 'Apprezzo i miei spazi, ma non mi dispiace qualche incontro'),
  ('social_orientation', 3, 'DA SCRIVERE', 'Mi piace aprirmi, a modo mio e con i miei tempi'),
  ('social_orientation', 4, 'Socialità',   'Adoro incontrare persone e raccogliere le loro storie'),
  ('companions', 1, 'Viaggiatore solo',               'Da solo/a'),
  ('companions', 2, 'Coppia',                         'In coppia'),
  ('companions', 3, 'Famiglia con bambini/ragazzi',   'Famiglia con bambini/ragazzi'),
  ('companions', 4, 'Gruppo di amici/piccolo gruppo', 'Gruppo di amici / piccolo gruppo'),
  ('companions', 5, 'Gruppo organizzato',             'Gruppo organizzato con altri viaggiatori')
on conflict do nothing;

-- Filtro 1: tema del viaggio (9 voci).
insert into tags (code, kind, label_it, sort_order) values
  ('food',                        'theme', 'Food', 1),
  ('cultura_arte_storia',         'theme', 'Cultura, arte e storia', 2),
  ('natura_wildlife',             'theme', 'Natura e wildlife', 3),
  ('avventura_outdoor',           'theme', 'Avventura e outdoor', 4),
  ('spiritualita_benessere',      'theme', 'Spiritualità e benessere', 5),
  ('lusso',                       'theme', 'Lusso', 6),
  ('festival_eventi',             'theme', 'Festival ed eventi', 7),
  ('shopping_design_artigianato', 'theme', 'Shopping, design e artigianato', 8),
  ('fotografia_creativita',       'theme', 'Fotografia e creatività', 9)
on conflict (code) do nothing;

-- Filtro 2: contesto geografico dominante (8 voci).
insert into tags (code, kind, label_it, sort_order) values
  ('citta',            'context', 'Città', 1),
  ('borghi',           'context', 'Borghi e piccoli centri', 2),
  ('montagna',         'context', 'Montagna', 3),
  ('mare_isole',       'context', 'Mare e isole', 4),
  ('deserto',          'context', 'Deserto', 5),
  ('foresta_giungla',  'context', 'Foresta e giungla', 6),
  ('campagna_rurale',  'context', 'Campagna e aree rurali', 7),
  ('aree_estreme',     'context', 'Aree estreme/polari', 8)
on conflict (code) do nothing;

-- Parametri.
insert into app_config (key, value, config_group, label_it, notes) values
  ('affinity_quiz_weight',    0.5,  'matching', 'Peso del quiz nell''affinità',    'Parametro, non costante di design: si può spostare verso i filtri quando manca la destinazione'),
  ('affinity_filters_weight', 0.5,  'matching', 'Peso dei filtri nell''affinità',  null),
  ('filters_theme_weight',    0.6,  'matching', 'Peso del tema dentro i filtri',   'Rapporto interno 60/40 tema/contesto'),
  ('filters_context_weight',  0.4,  'matching', 'Peso del contesto dentro i filtri', null),
  ('strong_match_threshold',  0.80, 'matching', 'Soglia del badge "match forte"',  'Con destinazione serve anche che il paese sia livello 1'),

  ('booking_min_notice_hours',   12, 'booking_rules', 'Preavviso minimo per prenotare', 'Impostato anche sull''event type Cal.com'),
  ('booking_horizon_days',       30, 'booking_rules', 'Orizzonte prenotabile',          'Impostato anche sull''event type Cal.com'),
  ('booking_payment_window_min', 30, 'booking_rules', 'Minuti per pagare la consulenza', 'Oltre, il workflow insoluti libera lo slot'),
  ('cancel_full_refund_hours',   24, 'booking_rules', 'Rimborso pieno fino a N ore prima', null),
  ('reschedule_min_hours',       12, 'booking_rules', 'Riprogrammabile fino a N ore prima', null),
  ('reschedule_max_traveler',     5, 'booking_rules', 'Riprogrammazioni max del viaggiatore', 'ATTENZIONE: oggi non lo controlla NESSUNO. Cal.com non lo impone e il controllo di n8n e'' milestone 5: questo numero e'' una regola scritta, non un limite attivo.'),
  ('reschedule_max_td',           2, 'booking_rules', 'Riprogrammazioni max del TD',          'Il TD non può cancellare una consulenza pagata'),
  ('reschedule_max_days_shift',  20, 'booking_rules', 'Giorni max dalla data originaria',     null),
  ('td_wait_minutes_in_call',    15, 'booking_rules', 'Minuti di attesa del TD in call',      'Oltre, no-show: quota non rimborsata'),

  ('postcall_autoclose_hours',   48, 'orders', 'Ore di silenzio-conferma dopo la call', null),
  ('revision_window_days',        5, 'orders', 'Giorni per chiedere la revisione inclusa', null),
  ('deposit_percent',            30, 'orders', 'Percentuale di acconto All Inclusive',     null),
  ('unpaid_sweep_minutes',        5, 'orders', 'Frequenza del workflow insoluti',          null),

  ('bon_voyage_days_before',      3, 'reviews', 'Giorni prima della partenza per il buon viaggio', null),
  ('trip_review_days_after',      3, 'reviews', 'Giorni dopo il rientro per la recensione viaggio', null),
  ('low_review_alert_max',        3, 'reviews', 'Alert al team sotto o pari a N stelle',   'Mai cancellare, solo intervenire')
on conflict (key) do nothing;

-- I parametri di testo (migration 0034). Insert a parte perché `value` resta
-- nullo e `value_text` porta il valore: mettere le due forme nella stessa lista
-- di `values` avrebbe reso illeggibili entrambe.
--
-- La nota sotto il prezzo degli itinerari pronti è **una sola per tutto il
-- sito**: il form Vetrina TD non la raccoglie per itinerario, e la decisione del
-- 23 agosto è di non toccare il form. Dice cosa comprende un prezzo, quindi si
-- cambia da Studio e non con un deploy. Svuotarla la fa sparire dalla pagina.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('ready_itinerary_price_note', null, 'volo non incluso • IVA inclusa', 'showcase',
   'Nota sotto il prezzo degli itinerari pronti',
   'Vale per tutti gli itinerari di tutti i designer: il form non raccoglie questo dato riga per riga. Testo del Figma 261:1068.')
on conflict (key) do nothing;

-- Su quale conto Stripe incassa una consulenza (deviazione 9 del PIANO, 6
-- settembre 2026). Oggi `xpetis`, cioè la nostra sandbox; in produzione
-- `agency`, perché XPETIS come entità legale non esiste e la partita IVA è
-- dell'agenzia affiliata. Il **default della colonna `payments.stripe_account`
-- non si tocca**: il passaggio è questa riga, cambiata da Studio, non un deploy.
-- La legge `consultation_payment_account()` (migration 0039), che quando dice
-- `agency` va a prendere l'agenzia partner di default.
--
-- Gruppo `payments`, che `public_config` non espone: al browser non serve sapere
-- chi incassa, e la cassa la apre comunque il server.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('consultation_stripe_account', null, 'xpetis', 'payments',
   'Conto Stripe che incassa le consulenze',
   'xpetis oppure agency. Con agency serve un''agenzia partner attiva: payments_agency_required la pretende.')
on conflict (key) do nothing;

-- La sua gemella per l'itinerario su misura (migration 0044). Stessa risposta
-- oggi — `xpetis` in sandbox, `agency` in produzione per la deviazione 9 — ma
-- una riga sua, perché non è detto che l'agenzia cominci a incassare le due
-- cose lo stesso giorno. La legge `payment_account('full')`, la stessa funzione
-- che dalla 0044 risponde anche per le consulenze: la regola è una, le righe
-- sono due. L'All Inclusive ha la sua riga, in fondo al file (0047).
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('custom_itinerary_stripe_account', null, 'xpetis', 'payments',
   'Conto Stripe che incassa gli itinerari su misura',
   'xpetis oppure agency, come consultation_stripe_account. Con agency serve un''agenzia partner attiva.')
on conflict (key) do nothing;

-- Il numero WhatsApp del team. È **provvisorio** e va sostituito: sta qui e non
-- nel codice proprio perché sostituirlo dev'essere una riga da Studio. Lo usa il
-- percorso "slot introvabile" e ogni pagina che offre di parlare con una
-- persona quando la macchina non basta.
--
-- ## Perché `contacts` e non `showcase`
--
-- La prima versione lo metteva in `showcase`, cioè fra i parametri che
-- `public_config` serve ad `anon`. Era sbagliato, e non per un principio: oggi
-- quel numero è il **cellulare personale di Simone**, prestato in attesa di un
-- numero dedicato. `public_config` è leggibile dal browser di chiunque senza
-- nemmeno una sessione, quindi il numero finirebbe negli indici dei crawler che
-- raccolgono contatti — e da lì non si torna indietro cambiando una riga.
--
-- Un dato che il visitatore legge in pagina non è la stessa cosa di un dato
-- servito a chiunque interroghi l'API: nel primo caso lo mette lì il nostro
-- server, dove serve; nel secondo si raccoglie in blocco. Le pagine lo leggono
-- con `leggiContatto()` in `lib/config.ts`, che passa dalla chiave secret.
--
-- Il giorno che arriva un numero aziendale dedicato, questa riga può tornare in
-- `showcase` e la lettura semplificarsi: cambia il gruppo, non il resto.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('whatsapp_number', null, '+39 347 891 1018', 'contacts',
   'Numero WhatsApp del team',
   'PROVVISORIO: cellulare personale, non un numero aziendale. Per questo il gruppo è `contacts`, che public_config non espone. Formato internazionale con spazi: chi costruisce un link wa.me toglie spazi e "+".')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- L'orologio dei 5 minuti (migration 0041)
-- ---------------------------------------------------------------------------
-- `unpaid_sweep_minutes` (5) esiste già più sopra: è la cadenza. Qui si
-- aggiungono il margine, il budget e il freno.
--
-- ## Il conto che non torna, e per cui la grazia nasce a zero
--
-- La regola del Flusso è che uno slot non pagato resta occupato **al massimo 35
-- minuti**, e il conto vero è `finestra + grazia + cadenza`: la cadenza entra
-- perché una prenotazione che scade subito dopo un giro aspetta un giro intero.
-- Con i valori di oggi fa 30 + 0 + 5 = **35 esatti**. Siamo sul limite, quindi
-- **non c'è spazio per nessuna grazia** senza toccare qualcos'altro.
--
-- La grazia servirebbe: la cassa Stripe può restare aperta un minuto oltre la
-- nostra scadenza, perché `expires_at` di Stripe accetta minimo 30 minuti e la
-- route taglia al minimo invece di esplodere. Un pagamento che atterra in quel
-- minuto trova lo slot appena liberato.
--
-- Le due strade per comprarsela sono entrambe di Simone, non mie: portare la
-- finestra a 28 minuti, o la cadenza a 2. `clock_tick` controlla il conto a
-- ogni giro e scrive un alert se qualcuno lo sfonda da Studio.
insert into app_config (key, value, config_group, label_it, notes) values
  ('booking_cancel_grace_min', 0, 'orders', 'Minuti di grazia oltre la scadenza prima di liberare lo slot',
   'Oggi 0: finestra 30 + grazia + cadenza 5 deve restare sotto i 35 minuti del Flusso, e 30+0+5 fa già 35. Per alzarla va accorciata la finestra o la cadenza.'),
  ('unpaid_slot_max_min', 35, 'orders', 'Massimo che uno slot non pagato può restare occupato',
   'La regola del Flusso. clock_tick() la usa come budget e avvisa il team se i parametri la sfondano.'),
  ('unpaid_cancel_max_attempts', 3, 'orders', 'Tentativi di cancellazione su Cal.com prima di chiamare una persona',
   'Oltre, l''orologio smette di riprovare e scrive un alert critico: un braccio rotto deve diventare un allarme, non un rumore di fondo.')
on conflict (key) do nothing;

-- I parametri della chiamata a Cal.com. Gruppo `integrations`, che
-- `public_config` non espone: al browser non serve, e a maggior ragione qui —
-- è l'indirizzo con cui si cancella una call conoscendo solo il codice della
-- prenotazione.
--
-- ✅ **Verificato il 20 settembre 2026**, su una prenotazione vera: l'API v2
-- risponde 200, lo slot torna libero sul calendario e le mail native di
-- annullamento partono. **Senza nessuna chiave**, come diceva S-05 — che aveva
-- stabilito il fatto ma non l'indirizzo, lasciato aperto da
-- `GUIDA_PONTE_CALCOM.md` §9.4.
--
-- `{uid}` nel modello viene sostituito col codice della prenotazione: l'endpoint
-- v2 lo vuole nel **percorso**, e il corpo della richiesta porta soltanto
-- `cancellationReason`.
--
-- ⚠️ **Il ripiego v1 non è più a una riga di distanza, e questa nota diceva il
-- contrario.** Fino al 20 settembre qui c'era scritto che le due forme erano
-- entrambe supportate — «se `{uid}` non compare nel modello, il codice viaggia
-- nel corpo» — e non è più vero: il corpo del nodo *Cancella su Cal.com* è stato
-- ridotto al solo motivo, perché la v2 rifiuta con **400** tutto quello che non
-- conosce (*"uid property should not exist, allRemainingBookings property should
-- not exist"*). Passare a `https://api.cal.com/api/cancel` oggi richiede **due
-- cose**, non una:
--
--   1. la riga da Studio:
--      update app_config set value_text = 'https://api.cal.com/api/cancel'
--       where key = 'calcom_cancel_url';
--   2. e rimettere `uid` e `allRemainingBookings` nel `jsonBody` del nodo
--      *Cancella su Cal.com* di `n8n/orologio.json`, cioè **modificare e
--      reimportare il workflow**.
--
-- Resta comunque il posto giusto dove tenere l'indirizzo: cambiare endpoint
-- dentro la stessa famiglia (una v3, un self-hosted) resta una riga da Studio.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('calcom_cancel_url', null, 'https://api.cal.com/v2/bookings/{uid}/cancel', 'integrations',
   'Indirizzo a cui il braccio chiede la cancellazione di uno slot',
   'VERIFICATO il 20 settembre 2026 con un curl su una prenotazione vera: 200, slot tornato libero, mail native di annullamento partite, nessuna chiave necessaria (come diceva S-05). {uid} viene sostituito col codice della prenotazione: la v2 lo vuole nel PERCORSO, e il corpo porta solo cancellationReason. ATTENZIONE: passare al ripiego v1 (https://api.cal.com/api/cancel) NON basta cambiare questa riga — la v1 vuole uid e allRemainingBookings nel corpo, che la v2 rifiuta con 400, quindi va anche modificato il jsonBody del nodo Cancella su Cal.com in n8n/orologio.json.'),
  ('calcom_api_version', null, '2024-08-13', 'integrations',
   'Header cal-api-version della API v2 di Cal.com',
   'L''API v2 vuole la versione dichiarata nell''header. Sull''endpoint v1 di ripiego non serve e viene ignorato.'),
  ('unpaid_cancel_reason', null, 'Pagamento non completato: lo slot è stato liberato.', 'integrations',
   'Motivo della cancellazione scritto su Cal.com',
   'Lo legge il viaggiatore: finisce nella mail nativa di Cal.com, che resta accesa (deviazione 5). Testo segnaposto, lo riscrive Gaia.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Le firme Cal.com rifiutate (migration 0042)
-- ---------------------------------------------------------------------------
-- La soglia non è 1 di proposito: l'indirizzo del webhook è **pubblico**, quindi
-- un singolo corpo arbitrario da uno scanner di passaggio non è una notizia. Tre
-- in un'ora lo sono — e una parola segreta sbagliata su un account attivo ne
-- produce molte di più, perché Cal.com ritenta.
--
-- Senza queste righe il ramo dell'orologio resta **spento**, e lo dice: scrive
-- un alert `orologio_ramo_non_configurato`.
insert into app_config (key, value, config_group, label_it, notes) values
  ('calcom_signature_alert_threshold', 3, 'integrations',
   'Firme Cal.com rifiutate prima di avvisare il team',
   'Non 1: l''indirizzo del webhook è pubblico e un corpo arbitrario di passaggio non è una notizia. Una parola segreta sbagliata su un account attivo ne produce molte di più, perché Cal.com ritenta.'),
  ('calcom_signature_alert_window_min', 60, 'integrations',
   'Finestra su cui si contano le firme rifiutate',
   'Minuti. Il conteggio è per ora piena (calcom_signature_rejections), la finestra somma le ore che ci stanno dentro.'),
  ('calcom_signature_keep_days', 30, 'integrations',
   'Per quanto si tengono i conteggi delle firme rifiutate',
   'Oltre, l''orologio li cancella: le finestre vecchie non servono più a nessuno e la tabella non deve crescere per sempre.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- La posta (migration 0043)
-- ---------------------------------------------------------------------------
-- ⚠️ **Questo file ha `on conflict do nothing` e gira solo su `db reset`.** Sul
-- progetto vero queste righe vanno inserite a mano dal SQL Editor: finché
-- mancano, l'orologio scrive un alert `orologio_ramo_non_configurato` che le
-- elenca una per una. È voluto — un ramo spento in silenzio è il guasto che
-- questa impalcatura esiste per non avere.
--
-- ## L'interruttore nasce spento, e non è prudenza generica
--
-- `email_enabled = 0` **non spegne la composizione**: le mail si compongono e si
-- accodano lo stesso, e si leggono su Studio esattamente come le leggerà un
-- cliente. È la condizione perché Gaia le corregga sul vero invece che su un
-- documento. Quello che l'interruttore ferma è la consegna.
--
-- Nasce a zero perché il primo giro dopo l'applicazione della 0043 incontra
-- tutte le consulenze già finite, e accenderlo dev'essere un gesto fatto
-- guardando la coda, non una cosa che capita applicando una migration.
--
-- ## Il tetto, che è condiviso
--
-- Resend free: **100 mail al giorno e 10 richieste al secondo**, e quelle 100
-- sono condivise con la landing page (vedi `ACCESSI.md`). `email_max_per_tick`
-- è il freno che impedisce a un giro solo di bruciare la giornata; la difesa
-- vera resta il vincolo di unicità di `outbound_messages`.
insert into app_config (key, value, config_group, label_it, notes) values
  ('email_enabled', 0, 'integrations',
   'Interruttore della consegna delle mail',
   '0 = si compone e si accoda ma NON si consegna (le mail si leggono su Studio); 1 = si consegna. Nasce a 0: accenderlo è un gesto che si fa guardando la coda.'),
  ('email_max_per_tick', 20, 'integrations',
   'Mail consegnate al massimo in un giro dell''orologio',
   'Freno sul tetto giornaliero di Resend (100 al giorno, CONDIVISE con la landing page) e sul limite di 10 richieste al secondo. Quelle in più aspettano il giro dopo, cioè cinque minuti.'),
  ('email_max_attempts', 3, 'integrations',
   'Tentativi di consegna prima di chiamare una persona',
   'Oltre, la mail resta in coda e parte un alert email_non_consegnata. Un 4xx definitivo non consuma tentativi: va subito a failed, perché un corpo malformato non guarisce riprovando.'),
  ('postcall_email_max_age_hours', 24, 'orders',
   'Entro quante ore dalla fine della call può ancora partire la mail post-call',
   'Oltre, NON parte e il team riceve un alert postcall_mail_non_partita. Serve a due cose: non mandare la mail a tutto lo storico il giorno che si accende, e non mandare "com''è andata la call?" tre giorni dopo perché n8n era fermo.'),
  ('token_miss_alert_threshold', 50, 'integrations',
   'Token inesistenti in una finestra prima di avvisare il team',
   'Alta di proposito. Un link spezzato in due da un client di posta produce qualche tentativo a vuoto: un alert che scatta sul rumore è un alert che si impara a ignorare.'),
  ('token_miss_alert_window_min', 60, 'integrations',
   'Finestra su cui si contano i token inesistenti', 'Minuti.'),
  ('token_miss_keep_days', 30, 'integrations',
   'Per quanto si tengono i conteggi dei token inesistenti',
   'Oltre, l''orologio li cancella: le finestre vecchie non servono più a nessuno.')
on conflict (key) do nothing;

-- I parametri di testo della posta.
--
-- `email_from` è **una casella vera dove arrivano le risposte**, e i testi sono
-- scritti sapendolo: nessuna mail dice "non rispondere a questo indirizzo".
-- Chi la presidia e con che tempi è una domanda aperta in `PUNTI_APERTI.md`.
--
-- `site_base_url` serve perché i link delle mail li compone Postgres, che non
-- ha nessun modo di sapere a che indirizzo risponde il sito. In sviluppo si
-- mette `http://localhost:3000` **su un database di sviluppo**, mai su quello
-- vero: un link a localhost dentro una mail vera è un vicolo cieco.
--
-- `email_redirect_to` è il modo di provare senza scrivere a nessuno per
-- sbaglio: se è valorizzato, **ogni** mail va lì invece che al destinatario
-- vero, con l'oggetto che dice a chi sarebbe andata. Il destinatario vero resta
-- scritto su `outbound_messages.recipient` (quindi il vincolo di unicità
-- continua a significare quello che significa) e dove è finita davvero lo dice
-- `delivered_to`. **Svuotarlo lo disattiva**, come per le altre righe di testo.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('email_from', null, 'XPETIS <info@xpetis.it>', 'integrations',
   'Mittente delle mail transazionali',
   'Casella VERA: è lì che arrivano le risposte dei viaggiatori. I testi sono scritti sapendolo e nessuno dice "non rispondere". Il dominio xpetis.it è verificato su Resend (SPF, DKIM, Return-Path).'),
  ('email_redirect_to', null, '', 'integrations',
   'Casella a cui dirottare TUTTE le mail durante le prove',
   'Vuoto = disattivato, cioè la posta va ai destinatari veri. Valorizzato = ogni mail va lì, con l''oggetto che dichiara a chi sarebbe andata. recipient resta il destinatario vero; dove è finita lo dice delivered_to.'),
  ('site_base_url', null, 'https://xpetis.it', 'integrations',
   'Indirizzo pubblico del sito, per i link dentro le mail',
   'Lo compone Postgres, che non ha modo di saperlo da sé. In sviluppo http://localhost:3000, ma SOLO su un database di sviluppo: un link a localhost dentro una mail vera è un vicolo cieco.')
on conflict (key) do nothing;

-- Le notifiche interne (0045): **chi** riceve gli avvisi del team e **di
-- cosa**. È un meccanismo solo, così aggiungere un evento è una parola in più
-- qui e non un deploy.
--
-- Un evento è o il `kind` di un alert di `team_alerts` (`ordine_richiesto`,
-- `stripe_importo_non_combacia`, …) o un evento che non è un'anomalia
-- (`ordine_pagato`). **Scrivere `ordine_richiesto` in `team_notify_events` è
-- tutto quello che serve** perché il team riceva una mail a ogni richiesta
-- nuova: il punto aperto del PIANO lascia a Simone la decisione.
--
-- ⚠️ `team_notify_recipients` nasce **vuota** di proposito: gli indirizzi degli
-- amministratori non stanno in un file versionato. Finché è vuota, il primo
-- evento in elenco scrive un alert `notifica_team_non_configurata` invece di
-- perdersi in silenzio.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('team_notify_recipients', null, '', 'integrations',
   'Chi riceve le notifiche interne del team (indirizzi separati da virgola)',
   'Deciso il 23 settembre 2026: gli amministratori, cioè Simone, Alessandro e Andrea. Una mail per indirizzo, accodata come tutte le altre: valgono email_enabled e email_redirect_to. Vuota = nessuna notifica, e al primo evento in elenco un alert lo dice.'),
  ('team_notify_events', null, 'ordine_pagato', 'integrations',
   'Di quali eventi si avvisa il team per mail (nomi separati da virgola)',
   'Un nome è il kind di un alert di team_alerts (es. ordine_richiesto) oppure ordine_pagato. Aggiungerne uno è tutto quello che serve: nessun deploy. NON metterci gli alert di igiene operativa: una mail per ogni anomalia insegna al team a ignorarle. Vuota = nessun evento.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- L'All Inclusive (migration 0047)
-- ---------------------------------------------------------------------------
-- La sorella delle due righe del conto, per acconto e saldo. **Deciso il 27
-- settembre 2026: esiste un conto Stripe solo, ed è dell'agenzia.** In
-- produzione questa riga dice `agency` come le altre due; in sandbox `xpetis`,
-- ed è così che si prova il giro senza il conto vero. Una riga sola per le due
-- rate: il merchant of record dell'All Inclusive è uno.
--
-- `deposit_percent` (più su, gruppo `orders`) c'è dalla prima ora: è la
-- percentuale dell'acconto, oggi 30, e la usa `ai_order_rules()` all'invio
-- della proposta all'agenzia.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('all_inclusive_stripe_account', null, 'xpetis', 'payments',
   'Conto Stripe che incassa acconto e saldo All Inclusive',
   'xpetis oppure agency. In produzione agency (conto unico dell''agenzia, 27 settembre 2026): la cassa legge la chiave ristretta da Vault, sotto il nome in agencies.stripe_credential_ref.')
on conflict (key) do nothing;

-- Quanto vale il link con cui l'agenzia conferma una proposta. È una
-- credenziale che sblocca una cascata e vive in una casella inoltrabile:
-- scade, e si consuma alla prima risposta. Allo scadere la proposta resta in
-- verifica e l'orologio lo dice al team (`verifica_agenzia_scaduta`), che ne
-- manda uno nuovo con `select rinnova_verifica_agenzia('<id ordine>')`.
insert into app_config (key, value, config_group, label_it, notes) values
  ('agency_confirm_valid_days', 7, 'orders',
   'Giorni di validità del link di verifica dell''agenzia',
   'Oltre, il link risponde «scaduto» e il team riceve un alert verifica_agenzia_scaduta. ATTENZIONE: i 7 giorni NON sono una decisione di prodotto — li ha scelti chi ha scritto la 0047 perché serviva un numero, e Simone non li ha mai confermati. Vanno sentiti con l''agenzia su quanto ci mette davvero a rispondere: se ci mette dieci giorni, ogni verifica scade da sola e il team rincorre.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Gli slug Cal.com attesi (migration 0048)
-- ---------------------------------------------------------------------------
-- Tre event type, due servizi (deviazione 10 del PIANO, riscritta il 27
-- settembre 2026): la breve sempre da 30, l'approfondita da 60 oppure 90. Un
-- servizio attivo con uno slug che non è in questa lista **blocca la
-- pubblicazione** del designer (`td_publish_blockers`) e non si può scrivere su
-- un designer già pubblicato: Cal.com genera lo slug dal titolo in modo
-- imprevedibile, e uno slug sbagliato fa scartare le prenotazioni in silenzio.
--
-- Una riga per tipo, valori separati da virgola. **Senza la riga il servizio è
-- bloccato**, non libero: sul progetto vero vanno inserite a mano dal SQL Editor
-- insieme alla 0048, come le altre righe di questo file.
insert into app_config (key, value, value_text, config_group, label_it, notes) values
  ('calcom_slugs_consultation', null, 'consulenza-xpetis-30', 'integrations',
   'Slug Cal.com ammessi per la consulenza breve',
   'Sempre 30 minuti, la crea ogni designer. Separati da virgola. Uno slug fuori elenco blocca la pubblicazione: le prenotazioni verrebbero scartate come appuntamenti privati del designer.'),
  ('calcom_slugs_consultation_deep', null, 'consulenza-xpetis-60, consulenza-xpetis-90', 'integrations',
   'Slug Cal.com ammessi per la consulenza approfondita',
   'Da 60 oppure 90 minuti, solo per chi la offre. Separati da virgola. Lo slug deve corrispondere alla durata scritta nel servizio: se non combacia, lo dice il ponte alla prima prenotazione (alert calcom_durata_non_combacia).')
on conflict (key) do nothing;
