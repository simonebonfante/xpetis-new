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
