-- XPETIS · seed 0003 · Dati finti per provare l'algoritmo di matching
-- Due Travel Designer inventati. Non hanno niente a che vedere con i 25 veri:
-- servono solo a far girare le prove del match e dei vincoli.

-- La geografia arriva dalla tassonomia vera (seed 0002): qui si usano i suoi
-- identificatori reali. I paesi scelti servono a provare tutte le bande:
--   vietnam, thailandia, giappone, cambogia, corea_del_sud → stessa macro-area
--   india                                                  → stesso continente, altra macro-area
--   peru, bolivia                                          → Sud America
--   tanzania                                               → Africa Sub-Sahariana

-- Due TD con profili volutamente diversi.
insert into travel_designers (id, slug, status, display_name, headline, bio, email, cal_username, joined_at)
values
  ('11111111-1111-1111-1111-111111111111', 'marco-rossi', 'published', 'Marco Rossi',
   'Sud-est asiatico, ritmo lento',
   'Bio narrativa di prova abbastanza lunga da superare il controllo di completezza del profilo.',
   'marco@example.com', 'marco-rossi-xpetis', '2026-01-10'),
  ('22222222-2222-2222-2222-222222222222', 'giulia-neri', 'published', 'Giulia Neri',
   'Ande e alta quota',
   'Bio narrativa di prova abbastanza lunga da superare il controllo di completezza del profilo.',
   'giulia@example.com', 'giulia-neri-xpetis', '2026-02-05')
on conflict (id) do nothing;

update travel_designers
   set photo_url = 'https://example.com/' || slug || '.jpg'
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222');

insert into td_countries (td_id, country_code, level) values
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 1),
  ('11111111-1111-1111-1111-111111111111', 'thailandia', 1),
  ('11111111-1111-1111-1111-111111111111', 'giappone', 2),
  ('22222222-2222-2222-2222-222222222222', 'peru', 1),
  ('22222222-2222-2222-2222-222222222222', 'bolivia', 2)
on conflict do nothing;

insert into td_axis_values (td_id, axis_code, value) values
  ('11111111-1111-1111-1111-111111111111', 'planning_involvement', 2),
  ('11111111-1111-1111-1111-111111111111', 'pace', 1),
  ('11111111-1111-1111-1111-111111111111', 'comfort_wild', 3),
  ('11111111-1111-1111-1111-111111111111', 'curated_vs_real', 3),
  ('11111111-1111-1111-1111-111111111111', 'social_orientation', 4),
  ('11111111-1111-1111-1111-111111111111', 'companions', 2),
  ('11111111-1111-1111-1111-111111111111', 'companions', 4),
  ('22222222-2222-2222-2222-222222222222', 'planning_involvement', 4),
  ('22222222-2222-2222-2222-222222222222', 'pace', 4),
  ('22222222-2222-2222-2222-222222222222', 'comfort_wild', 4),
  ('22222222-2222-2222-2222-222222222222', 'curated_vs_real', 2),
  ('22222222-2222-2222-2222-222222222222', 'social_orientation', 2),
  ('22222222-2222-2222-2222-222222222222', 'companions', 1)
on conflict do nothing;

insert into td_destination_tags (td_id, country_code, tag_code) values
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 'food'),
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 'cultura_arte_storia'),
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 'campagna_rurale'),
  ('11111111-1111-1111-1111-111111111111', 'thailandia', 'mare_isole'),
  ('11111111-1111-1111-1111-111111111111', 'giappone', 'citta'),
  ('22222222-2222-2222-2222-222222222222', 'peru', 'avventura_outdoor'),
  ('22222222-2222-2222-2222-222222222222', 'peru', 'montagna'),
  ('22222222-2222-2222-2222-222222222222', 'bolivia', 'deserto')
on conflict do nothing;

insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes,
                         cal_event_type_slug, stripe_payment_link_url, text_during_call, text_after_call, sort_order)
values
  ('11111111-1111-1111-1111-111111111111', 'consultation', true, 6000, 30,
   'consulenza-xpetis-30', 'https://buy.stripe.com/test_marco_consulenza',
   'Cosa faremo durante la call.', 'Cosa potrai fare dopo.', 1),
  ('22222222-2222-2222-2222-222222222222', 'consultation', true, 7500, 30,
   'consulenza-xpetis-30', 'https://buy.stripe.com/test_giulia_consulenza',
   'Cosa faremo durante la call.', 'Cosa potrai fare dopo.', 1),
  ('22222222-2222-2222-2222-222222222222', 'consultation_deep', true, 15000, 60,
   'consulenza-xpetis-approfondita', 'https://buy.stripe.com/test_giulia_deep',
   'Cosa faremo durante la call lunga.', 'Cosa potrai fare dopo.', 2)
on conflict do nothing;

-- L'All Inclusive è sempre attivo per tutti; l'itinerario su misura dipende dal TD.
insert into td_services (td_id, service_type, is_active, sort_order)
select id, 'all_inclusive', true, 10 from travel_designers
on conflict do nothing;

insert into td_services (td_id, service_type, is_active, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'custom_itinerary', true, 5)
on conflict do nothing;

insert into agencies (id, name, operational_email, is_default_partner)
values ('33333333-3333-3333-3333-333333333333', 'Agenzia Partner XPETIS', 'ops@agenziapartner.example', true)
on conflict do nothing;

-- ===========================================================================
-- Contenuto di vetrina
-- ===========================================================================
-- Le tabelle della vetrina (0022-0027) esistevano da migration ma nessuna riga
-- le aveva mai popolate: `/designer/[slug]` renderizzava una pagina vuota e non
-- si vedeva se funzionava. Qui c'è quanto serve a far vedere ogni sezione del
-- Figma 171:17 con dati di forma realistica.
--
-- **I file delle immagini non esistono.** `storage_path` e `image_path` sono
-- percorsi nel bucket `td-media`, che nel progetto di sviluppo è vuoto: le foto
-- vere arrivano con l'import delle 25 vetrine (milestone 1). La pagina è scritta
-- per reggere il buco — riquadro neutro al posto dell'immagine — perché è
-- esattamente ciò che succede a un designer che non ha caricato le foto.
--
-- Convenzione del percorso: **comprende il bucket** (`td-media/marco/...`),
-- come già fa l'harness. È il punto da fissare quando si scrive l'importatore.

-- I campi di profilo del form. Update e non insert: le due righe esistono già
-- sopra, e il seed deve restare rilanciabile.
update travel_designers set
  hero_bio = 'Vivo tra Hanoi e Chiang Mai da otto anni. Non organizzo tour: '
             'costruisco viaggi che si possono percorrere piano, dove il tempo '
             'di stare fermi conta quanto quello di spostarsi.',
  manifesto = 'Il Sud-est asiatico non si attraversa: si abita, anche solo per '
              'due settimane.',
  bio = E'Sono partito per il Vietnam nel 2017 con un biglietto di sola andata e '
        'l''idea di restarci tre mesi. Ci vivo ancora.\n\n'
        'In questi anni ho percorso la dorsale del paese in moto sei volte, ho '
        'imparato abbastanza vietnamita per farmi raccontare le cose dalle '
        'persone giuste e ho capito che i viaggi che ricordo non sono quelli in '
        'cui ho visto di più.\n\n'
        'Dal 2021 progetto viaggi per chi vuole andare piano: itinerari corti in '
        'chilometri e lunghi in giorni, con il tempo di tornare due volte nello '
        'stesso posto.',
  languages = array['Italiano', 'Inglese', 'Vietnamita'],
  years_experience = 8,
  instagram_handle = '@marcorossi.slow',
  legal_coverage = 'Non ho un''agenzia — vorrei un partner certificato XPETIS',
  group_trips_readiness = 'Sì, ma da definire',
  group_trips_timing = 'Nel 2027'
where id = '11111111-1111-1111-1111-111111111111';

update travel_designers set
  hero_bio = 'Guida di alta quota e travel designer. Lavoro sulle Ande da undici '
             'anni: conosco le stagioni, i passi che si chiudono e le famiglie '
             'che aprono casa a chi arriva a piedi.',
  manifesto = 'In montagna non si improvvisa. Si prepara, e poi si lascia che '
              'succeda.',
  bio = E'Vengo dall''alpinismo. Ho iniziato ad accompagnare in Perù nel 2015, '
        'quando cercavo una scusa per non tornare a casa.\n\n'
        'Da allora ho percorso la Cordillera Blanca e la Huayhuash in ogni '
        'stagione, ho lavorato con i portatori di Cusco e ho imparato a leggere '
        'la quota sulle persone prima che siano loro ad accorgersene.\n\n'
        'Progetto viaggi impegnativi e li progetto nel dettaglio: acclimatamento, '
        'margini, alternative se il tempo gira. È la parte del lavoro che il '
        'viaggiatore non vede, ed è quella che decide come andrà.',
  languages = array['Italiano', 'Inglese', 'Spagnolo', 'Quechua (base)'],
  years_experience = 11,
  instagram_handle = '@giulianeri.andes',
  legal_coverage = 'Ho già un''agenzia / struttura — non mi serve supporto',
  group_trips_readiness = 'Sì, sono pronti',
  group_trips_timing = 'Entro il 2026'
where id = '22222222-2222-2222-2222-222222222222';

-- I campi per paese (0023). Restano fuori dal matching — il Flusso tiene durata
-- e budget fuori — ma il team li legge e il designer li ha dichiarati.
update td_countries set areas_note = 'Ha Giang, Ninh Binh, Hoi An, delta del Mekong',
  typical_duration = 'Standard (8–14 gg)', typical_budget = 'Medio (€1.500–3.500)'
 where td_id = '11111111-1111-1111-1111-111111111111' and country_code = 'vietnam';
update td_countries set areas_note = 'Isole delle Andamane, Chiang Mai, Isan',
  typical_duration = 'Standard (8–14 gg)', typical_budget = 'Medio (€1.500–3.500)'
 where td_id = '11111111-1111-1111-1111-111111111111' and country_code = 'thailandia';
update td_countries set areas_note = 'Kansai, Alpi giapponesi, Kyushu',
  typical_duration = 'Breve (5–7 gg)', typical_budget = 'Alto (€3.500–7.000)'
 where td_id = '11111111-1111-1111-1111-111111111111' and country_code = 'giappone';
update td_countries set areas_note = 'Cordillera Blanca, Huayhuash, Valle Sacra',
  custom_themes = array['Alpinismo', 'Acclimatamento in quota'],
  typical_duration = 'Lungo (15–30 gg)', typical_budget = 'Alto (€3.500–7.000)'
 where td_id = '22222222-2222-2222-2222-222222222222' and country_code = 'peru';
update td_countries set areas_note = 'Salar de Uyuni, Sud Lípez, Cordillera Real',
  typical_duration = 'Standard (8–14 gg)', typical_budget = 'Medio (€1.500–3.500)'
 where td_id = '22222222-2222-2222-2222-222222222222' and country_code = 'bolivia';

-- I testi dei box. `text_during_call` è il paragrafo sotto il titolo della
-- scheda, `text_after_call` quello che il Flusso usa nella mail post-call.
update td_services set
  text_during_call = 'Fai tutte le domande che vuoi su destinazioni, ritmi e '
                     'modalità di viaggio. Puoi mostrarmi idee, farti dare '
                     'consigli, o chiedermi una review di un itinerario che hai già.',
  text_after_call  = 'Dopo la call ti mando un recap scritto e, se vuoi, la '
                     'proposta per un itinerario su misura.'
 where td_id = '11111111-1111-1111-1111-111111111111' and service_type = 'consultation';

update td_services set
  text_during_call = 'Trenta minuti per capire se la montagna che hai in mente è '
                     'quella giusta per te: quota, stagione, allenamento '
                     'necessario e quanto tempo serve davvero.',
  text_after_call  = 'Ti lascio un promemoria scritto con le date utili e le '
                     'alternative se la stagione non tiene.'
 where td_id = '22222222-2222-2222-2222-222222222222' and service_type = 'consultation';

update td_services set
  text_during_call = 'Un''ora piena, con il tuo itinerario aperto davanti. '
                     'Rivediamo giorno per giorno acclimatamento, margini e '
                     'piani B, e usciamo dalla call con un piano che regge.',
  text_after_call  = 'Ricevi il piano rivisto per iscritto entro due giorni.'
 where td_id = '22222222-2222-2222-2222-222222222222' and service_type = 'consultation_deep';

update td_services set
  text_during_call = 'Un itinerario scritto su di te, giorno per giorno, con '
                     'alloggi e trasporti già verificati. Si acquista dopo la '
                     'consulenza, quando so cosa stai cercando.'
 where service_type = 'custom_itinerary';

update td_services set
  text_during_call = 'Il viaggio completo, prenotato e assistito dall''agenzia '
                     'partner: voli, alloggi, trasferimenti, assicurazione. Si '
                     'acquista dopo la consulenza.'
 where service_type = 'all_inclusive';

-- I punti dentro i box (campo callPunti del form).
insert into td_service_bullets (service_id, position, text_it)
select s.id, v.position, v.text_it
  from td_services s
  join (values
    ('11111111-1111-1111-1111-111111111111'::uuid, 'consultation'::service_type, 1::smallint, 'Call 1:1 di 30 minuti con me, in video'),
    ('11111111-1111-1111-1111-111111111111', 'consultation',      2, 'Analisi di budget, tempi e stile di viaggio'),
    ('11111111-1111-1111-1111-111111111111', 'consultation',      3, 'Consigli pratici su tappe, trasporti e stagionalità'),
    ('11111111-1111-1111-1111-111111111111', 'consultation',      4, 'Risposte a tutte le domande che hai già in testa'),
    ('11111111-1111-1111-1111-111111111111', 'custom_itinerary',  1, 'Itinerario giorno per giorno, scritto su di te'),
    ('11111111-1111-1111-1111-111111111111', 'custom_itinerary',  2, 'Alloggi e trasporti verificati, con i link per prenotare'),
    ('11111111-1111-1111-1111-111111111111', 'custom_itinerary',  3, 'Una revisione inclusa dopo la consegna'),
    ('11111111-1111-1111-1111-111111111111', 'all_inclusive',     1, 'Viaggio completo prenotato dall''agenzia partner'),
    ('11111111-1111-1111-1111-111111111111', 'all_inclusive',     2, 'Voli, alloggi, trasferimenti e assicurazione insieme'),
    ('11111111-1111-1111-1111-111111111111', 'all_inclusive',     3, 'Assistenza in italiano durante il viaggio'),
    ('22222222-2222-2222-2222-222222222222', 'consultation',      1, 'Call 1:1 di 30 minuti con me, in video'),
    ('22222222-2222-2222-2222-222222222222', 'consultation',      2, 'Verifica della quota e della stagione giusta'),
    ('22222222-2222-2222-2222-222222222222', 'consultation',      3, 'Che allenamento serve, in tempo per farlo'),
    ('22222222-2222-2222-2222-222222222222', 'consultation',      4, 'Risposte a tutte le domande che hai già in testa'),
    ('22222222-2222-2222-2222-222222222222', 'consultation_deep', 1, 'Un''ora piena, con il tuo itinerario aperto davanti'),
    ('22222222-2222-2222-2222-222222222222', 'consultation_deep', 2, 'Revisione giorno per giorno dell''acclimatamento'),
    ('22222222-2222-2222-2222-222222222222', 'consultation_deep', 3, 'Piani B se la stagione non tiene'),
    ('22222222-2222-2222-2222-222222222222', 'consultation_deep', 4, 'Lista di materiale e noleggi affidabili sul posto'),
    ('22222222-2222-2222-2222-222222222222', 'all_inclusive',     1, 'Viaggio completo prenotato dall''agenzia partner'),
    ('22222222-2222-2222-2222-222222222222', 'all_inclusive',     2, 'Guide e portatori locali che conosco di persona'),
    ('22222222-2222-2222-2222-222222222222', 'all_inclusive',     3, 'Assicurazione con copertura fino a 6.000 m')
  ) as v (td_id, service_type, position, text_it)
    on v.td_id = s.td_id and v.service_type = s.service_type
on conflict do nothing;

-- I viaggi firma, con le foto in ordine. Gli id espliciti servono a legare le
-- foto senza una sottoquery, e a lasciare il seed rilanciabile.
insert into td_signature_trips (id, td_id, position, title, description) values
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1,
   'Ha Giang Loop, sei giorni in moto',
   'Quattrocento chilometri sul confine cinese, dormendo nelle case delle '
   'famiglie Hmong. È il viaggio che rifaccio ogni anno e che continua a '
   'cambiarmi il modo di guidare: piano, fermandosi dove capita.'),
  ('11111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2,
   'Il Giappone dei treni lenti',
   'Tre settimane senza Shinkansen, solo linee locali. Kyushu dal basso, '
   'onsen di paese, stazioni con un solo binario e nessun turista. Il modo più '
   'costoso di risparmiare tempo è correre.'),
  ('11111111-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 3,
   'Isan, la Thailandia che non va in cartolina',
   'Il nordest rurale, tra risaie e templi di frontiera. Nessuna spiaggia, '
   'nessuna barca, e la cucina più interessante del paese.'),
  ('22222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 1,
   'Huayhuash, il giro completo in dodici giorni',
   'Il trekking più duro delle Ande e il più bello che conosca: dieci passi '
   'sopra i 4.700 metri, campi sotto le pareti sud e nessuna via di fuga '
   'rapida. Si prepara per mesi, si cammina per due settimane.'),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2,
   'Sud Lípez in inverno',
   'Il deserto boliviano d''alta quota quando fa -20 di notte e il cielo è '
   'l''unica cosa che si muove. Lagune colorate, geyser all''alba e '
   'acclimatamento serio prima di partire.'),
  ('22222222-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 3,
   'La Valle Sacra a piedi, senza Machu Picchu',
   'Otto giorni tra i villaggi di tessitori sopra Cusco. La quota c''è, la '
   'folla no.')
on conflict do nothing;

insert into td_signature_trip_images (trip_id, position, storage_path) values
  ('11111111-0000-0000-0000-000000000001', 1, 'td-media/marco-rossi/ha-giang-1.jpg'),
  ('11111111-0000-0000-0000-000000000001', 2, 'td-media/marco-rossi/ha-giang-2.jpg'),
  ('11111111-0000-0000-0000-000000000001', 3, 'td-media/marco-rossi/ha-giang-3.jpg'),
  ('11111111-0000-0000-0000-000000000001', 4, 'td-media/marco-rossi/ha-giang-4.jpg'),
  ('11111111-0000-0000-0000-000000000002', 1, 'td-media/marco-rossi/giappone-1.jpg'),
  ('11111111-0000-0000-0000-000000000002', 2, 'td-media/marco-rossi/giappone-2.jpg'),
  ('11111111-0000-0000-0000-000000000002', 3, 'td-media/marco-rossi/giappone-3.jpg'),
  ('11111111-0000-0000-0000-000000000003', 1, 'td-media/marco-rossi/isan-1.jpg'),
  ('11111111-0000-0000-0000-000000000003', 2, 'td-media/marco-rossi/isan-2.jpg'),
  ('22222222-0000-0000-0000-000000000001', 1, 'td-media/giulia-neri/huayhuash-1.jpg'),
  ('22222222-0000-0000-0000-000000000001', 2, 'td-media/giulia-neri/huayhuash-2.jpg'),
  ('22222222-0000-0000-0000-000000000001', 3, 'td-media/giulia-neri/huayhuash-3.jpg'),
  ('22222222-0000-0000-0000-000000000001', 4, 'td-media/giulia-neri/huayhuash-4.jpg'),
  ('22222222-0000-0000-0000-000000000001', 5, 'td-media/giulia-neri/huayhuash-5.jpg'),
  ('22222222-0000-0000-0000-000000000002', 1, 'td-media/giulia-neri/lipez-1.jpg'),
  ('22222222-0000-0000-0000-000000000002', 2, 'td-media/giulia-neri/lipez-2.jpg'),
  ('22222222-0000-0000-0000-000000000003', 1, 'td-media/giulia-neri/valle-sacra-1.jpg')
on conflict do nothing;

-- Gli itinerari pronti. Durata e prezzo sono testo libero per scelta (0026):
-- sono indicazioni di vetrina, nessun pagamento nasce da queste righe.
insert into td_ready_itineraries (td_id, position, title, duration_label, price_label, image_path) values
  ('11111111-1111-1111-1111-111111111111', 1, 'Vietnam del Nord: Hanoi, Ninh Binh, Ha Giang',
   '12 giorni', '1.380€', 'td-media/marco-rossi/itinerario-vietnam-nord.jpg'),
  ('11111111-1111-1111-1111-111111111111', 2, 'Giappone fuori stagione, da Osaka a Kagoshima',
   '14 giorni', '2.150€', 'td-media/marco-rossi/itinerario-giappone.jpg'),
  ('11111111-1111-1111-1111-111111111111', 3, 'Thailandia del Sud, isole senza folla',
   '9 giorni', '1.290€', null),
  ('22222222-2222-2222-2222-222222222222', 1, 'Cordillera Blanca: Santa Cruz e Laguna 69',
   '10 giorni', '1.650€', 'td-media/giulia-neri/itinerario-blanca.jpg'),
  ('22222222-2222-2222-2222-222222222222', 2, 'Uyuni e Sud Lípez, con acclimatamento a La Paz',
   '8 giorni', '1.450€', 'td-media/giulia-neri/itinerario-uyuni.jpg'),
  ('22222222-2222-2222-2222-222222222222', 3, 'Valle Sacra e Ausangate, senza Machu Picchu',
   '11 giorni', '1.780€', null)
on conflict do nothing;

-- Le recensioni che il designer porta da fuori (0027). **Nessuna vista le
-- espone e `is_published` nasce a falso**: sono qui perché la decisione della
-- milestone 8 si prende guardando dei dati veri, non una tabella vuota. La
-- vetrina non le mostra, ed è giusto così finché quella decisione non c'è.
insert into td_showcase_reviews (td_id, position, title, author_name, stars, date_label, body) values
  ('11111111-1111-1111-1111-111111111111', 1, 'Perfetto per viaggi lenti e autentici',
   'Chiara', 5, '6 aprile 2026',
   'Ho parlato con Marco per mezz''ora e ho buttato via metà dell''itinerario '
   'che mi ero costruito. Aveva ragione lui: due posti in meno e quattro giorni '
   'in più nello stesso posto hanno fatto il viaggio.'),
  ('11111111-1111-1111-1111-111111111111', 2, 'Conosce il Vietnam come casa sua',
   'Davide', 5, '21 febbraio 2026',
   'Indicazioni precise su strade, stagioni e permessi per Ha Giang. Nessuna '
   'delle cose che mi ha detto l''ho trovata scritta da qualche parte.'),
  ('11111111-1111-1111-1111-111111111111', 3, 'Onesto anche quando non conviene',
   'Sara', 4, '4 gennaio 2026',
   'Mi ha sconsigliato il periodo che avevo scelto e mi ha proposto di '
   'spostare di un mese. Ci ho rimesso una consulenza e ci ho guadagnato il viaggio.'),
  ('22222222-2222-2222-2222-222222222222', 1, 'Ottimo per viaggi organizzati nei minimi dettagli',
   'Marco', 5, '18 marzo 2026',
   'Giulia ha rifatto il piano di acclimatamento da zero. Siamo arrivati in cima '
   'tutti e quattro, che sulla Huayhuash non è scontato.'),
  ('22222222-2222-2222-2222-222222222222', 2, 'Sa dire di no',
   'Paola', 5, '2 marzo 2026',
   'Le avevo chiesto un trekking che non ero in grado di fare. Me l''ha detto '
   'chiaramente e mi ha proposto l''alternativa giusta.'),
  ('22222222-2222-2222-2222-222222222222', 3, 'Preparazione fuori dal comune',
   'Luca', 5, '11 dicembre 2025',
   'Materiale, quote, margini, meteo. Un livello di dettaglio che non avevo mai '
   'visto in una consulenza di viaggio.')
on conflict do nothing;
