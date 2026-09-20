-- XPETIS · seed 0001 · Tassonomie fisse e parametri di partenza
-- I valori numerici sono punti di partenza dichiarati nel flusso, da tarare sui
-- dati reali dei TD Fondatori. Si cambiano da Supabase Studio, senza deploy.

-- I 6 assi del quiz, con i pesi della sez. 2 del Flusso e il verso dichiarato
-- nel form Vetrina TD. `label_min` e `label_max` sono il verso: non dedurlo mai
-- dal nome del codice, è l'errore che nessuna prova tecnica intercetta.
insert into quiz_axes (code, kind, label_it, weight, scale_max, label_min, label_max, sort_order) values
  ('planning_involvement', 'continuous',  'Coinvolgimento nella pianificazione', 1.5, 4, 'Poco controllo',  'Molto controllo', 1),
  ('pace',                 'continuous',  'Ritmo',                                3.0, 4, 'Slow',            'Dynamic',         2),
  ('companions',           'categorical', 'Con chi viaggi',                       2.0, 5, null,              null,              3),
  ('comfort_wild',         'continuous',  'Comfort / Wild',                       1.5, 4, 'Comfort',         'Wild',            4),
  ('curated_vs_real',      'continuous',  'Estetica curata / Vita reale',         1.0, 4, 'Estetica curata', 'Vita reale',      5),
  ('social_orientation',   'continuous',  'Orientamento sociale',                 1.0, 4, 'Intimità',        'Socialità',       6)
on conflict (code) do nothing;

-- Etichette delle quattro risposte per asse continuo. Gli estremi 1 e 4 vengono
-- dal form; i due valori intermedi li scrive Gaia (tono caldo, mai da
-- questionario). Il ritmo ha già tutte e quattro le etichette dal Flusso.
insert into quiz_axis_options (axis_code, value, label_it) values
  ('pace', 1, 'Lento'), ('pace', 2, 'Disteso'), ('pace', 3, 'Vivace'), ('pace', 4, 'Intenso'),
  ('planning_involvement', 1, 'Poco controllo'),  ('planning_involvement', 2, 'DA SCRIVERE'),
  ('planning_involvement', 3, 'DA SCRIVERE'),     ('planning_involvement', 4, 'Molto controllo'),
  ('comfort_wild', 1, 'Comfort'),                 ('comfort_wild', 2, 'DA SCRIVERE'),
  ('comfort_wild', 3, 'DA SCRIVERE'),             ('comfort_wild', 4, 'Wild'),
  ('curated_vs_real', 1, 'Estetica curata'),      ('curated_vs_real', 2, 'DA SCRIVERE'),
  ('curated_vs_real', 3, 'DA SCRIVERE'),          ('curated_vs_real', 4, 'Vita reale'),
  ('social_orientation', 1, 'Intimità'),          ('social_orientation', 2, 'DA SCRIVERE'),
  ('social_orientation', 3, 'DA SCRIVERE'),       ('social_orientation', 4, 'Socialità'),
  -- Le cinque opzioni di "con chi viaggi", con le parole esatte del form: sono
  -- queste stringhe che arriveranno nei JSON delle vetrine.
  ('companions', 1, 'Viaggiatore solo'),
  ('companions', 2, 'Coppia'),
  ('companions', 3, 'Famiglia con bambini/ragazzi'),
  ('companions', 4, 'Gruppo di amici/piccolo gruppo'),
  ('companions', 5, 'Gruppo organizzato')
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
  ('reschedule_max_traveler',     5, 'booking_rules', 'Riprogrammazioni max del viaggiatore', 'Limite osservato da n8n, non imposto da Cal.com'),
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
   'VERIFICATO il 20 settembre 2026 con un curl su una prenotazione vera: 200, slot tornato libero, e le mail native di annullamento partite. Nessuna chiave necessaria, come diceva S-05. {uid} viene sostituito col codice della prenotazione. Ripiego mai servito: https://api.cal.com/api/cancel, che vuole il codice nel corpo.'),
  ('calcom_api_version', null, '2024-08-13', 'integrations',
   'Header cal-api-version della API v2 di Cal.com',
   'L''API v2 vuole la versione dichiarata nell''header. Sull''endpoint v1 di ripiego non serve e viene ignorato.'),
  ('unpaid_cancel_reason', null, 'Pagamento non completato: lo slot è stato liberato.', 'integrations',
   'Motivo della cancellazione scritto su Cal.com',
   'Lo legge il viaggiatore: finisce nella mail nativa di Cal.com, che resta accesa (deviazione 5). Testo segnaposto, lo riscrive Gaia.')
on conflict (key) do nothing;
