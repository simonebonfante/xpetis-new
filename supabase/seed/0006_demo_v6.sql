-- XPETIS · seed 0006 · I due designer demo sulla struttura della vetrina v6
--
-- Il seed 0003 ha caricato Marco Rossi e Giulia Neri con i campi del form
-- vecchio. Le pagine rifatte sul tool vetrina v6 (4 ottobre 2026) leggono campi
-- che quel seed non conosce: paesi dei viaggi, partenze vere, foto multiple,
-- tappe, «fa per me», prezzo «da» del su misura, recensioni pubblicate. Questo
-- file porta i due demo lì, e li rende diversi di proposito:
--
--   · **Marco Rossi è il demo completo**: Sessione approfondita, tutti e
--     quattro i servizi dopo la call con «da 90€» sul su misura, viaggi firma
--     col loro paese, tre itinerari (uno completo in ogni campo, uno parziale,
--     uno senza foto né prezzo), tre viaggi di gruppo (uno con una partenza
--     passata, una sold out, una «ultimi posti» e una aperta; uno con il solo
--     massimo dei partecipanti; uno con le sole partenze passate e senza
--     prezzo), tre recensioni dichiarate pubblicate.
--   · **Giulia Neri è il demo minimo**, come saranno molti dei 25: niente
--     Sessione, niente itinerari, niente viaggi di gruppo, niente recensioni.
--     Restano la consulenza, l'All Inclusive, i viaggi firma e la storia. La
--     sua vetrina deve reggere senza una sola sezione vuota.
--
-- ## Come si applica, e perché non si rigira il 0003
--
-- **Convergente**: rilanciato quante volte si vuole porta sempre allo stesso
-- stato, e su un database dove il 0003 è già passato **aggiunge e corregge**
-- senza ricominciare da capo. Il 0003 non va rigirato sul database vero:
-- riscrive le foto profilo con un host morto (è la trappola n. 1 del runbook).
--
--     supabase db query --linked -f supabase/seed/0006_demo_v6.sql
--
-- **Non tocca `photo_url`**, quindi il seed 0004 non serve rigirarlo. Le foto di
-- itinerari e gruppi riusano i file che `scripts/carica-immagini-finte.sh` ha
-- già messo nel bucket (`seed-immagini/td-media/…`): se non li hai mai
-- caricati, quello script li carica, e finché mancano la pagina mostra il
-- riquadro neutro.
--
-- **Non tocca `joined_at`** (è lo spareggio del match, e le prove del match ci
-- contano) né `cal_username`, `status`, prezzi e durate delle consulenze che
-- c'erano già. Le date delle partenze sono fisse: la «passata» resta passata,
-- le future lo restano fino al 2027, e quando non lo saranno più la pagina lo
-- mostrerà da sola (le partenze passate spariscono, 0054).
--
-- I valori dei servizi nuovi di Marco (approfondita da 90€ e 90 minuti,
-- viaggio di gruppo, accompagnamento privato) sono gli stessi che l'harness
-- usa nelle sue prove: su un database di prova le due cose non si contraddicono.

begin;

-- ===========================================================================
-- Marco Rossi — il demo completo
-- ===========================================================================

update travel_designers set
  expertise_areas   = 'Vietnam, Thailandia e Giappone, soprattutto fuori stagione e lontano dalle rotte di massa',
  travel_philosophy = E'Per me viaggiare è restare. Due giorni in più nello stesso posto valgono più di '
                      'tre città in più sulla cartina: è lì che il viaggio smette di essere un giro e '
                      'comincia a somigliare a una vita.\n\n'
                      'Progetto viaggi corti in chilometri e lunghi in giorni, con il tempo di tornare '
                      'due volte nello stesso mercato e di farsi riconoscere.'
 where id = '11111111-1111-1111-1111-111111111111';

-- La Sessione approfondita, e i due servizi dopo la call che mancavano.
insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug,
                         text_during_call, sort_order)
values ('11111111-1111-1111-1111-111111111111', 'consultation_deep', true, 9000, 90, 'consulenza-xpetis-90',
        'Novanta minuti con il tuo itinerario aperto davanti: lo rivediamo giorno per giorno, '
        'con budget, alternative e cosa prenotare per primo.', 2)
on conflict (td_id, service_type) do update
   set text_during_call = excluded.text_during_call;

insert into td_services (td_id, service_type, is_active, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'group_trip', true, 20),
  ('11111111-1111-1111-1111-111111111111', 'private_guiding', true, 21)
on conflict (td_id, service_type) do update set is_active = true;

-- Il prezzo «da» del su misura (D5): vetrina, non un importo che si incassa.
update td_services set price_from_cents = 9000
 where td_id = '11111111-1111-1111-1111-111111111111' and service_type = 'custom_itinerary';

delete from td_service_bullets
 where service_id = (select id from td_services
                      where td_id = '11111111-1111-1111-1111-111111111111' and service_type = 'consultation_deep');
insert into td_service_bullets (service_id, position, text_it)
select s.id, v.position, v.text_it
  from td_services s,
       (values (1::smallint, 'Videocall 1:1 di 90 minuti'),
               (2, 'Itinerario commentato giorno per giorno'),
               (3, 'Budget reale e come distribuirlo'),
               (4, 'Un documento scritto con tutte le indicazioni')) as v (position, text_it)
 where s.td_id = '11111111-1111-1111-1111-111111111111' and s.service_type = 'consultation_deep';

-- Il paese di ciascun viaggio firma.
update td_signature_trips set country_code = v.paese
  from (values ('11111111-0000-0000-0000-000000000001'::uuid, 'vietnam'),
               ('11111111-0000-0000-0000-000000000002', 'giappone'),
               ('11111111-0000-0000-0000-000000000003', 'thailandia')) as v (id, paese)
 where td_signature_trips.id = v.id;

-- Le recensioni dichiarate si mostrano (D3): pubblicate tutte e tre.
update td_showcase_reviews set is_published = true
 where td_id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------- itinerari
-- Il primo completo in ogni campo; il secondo parziale (niente tappe, niente
-- «fa per me», niente informazioni utili: quei blocchi non devono uscire); il
-- terzo senza foto e senza prezzo («Prezzo su richiesta»).

update td_ready_itineraries set
  intro = E'Il Nord del Vietnam come lo vivo io: piano. Si parte dal caos di Hanoi, ci si ferma '
          'a Ninh Binh tra risaie e pareti di calcare, e poi si sale verso Ha Giang, dove la '
          'strada è il viaggio. Dodici giorni, tre basi, nessuna corsa.',
  nights = 11,
  price_note = null,
  main_stops = array['Hanoi', 'Ninh Binh', 'Ha Giang', 'Dong Van', 'Hanoi'],
  price_includes = array['11 notti in guesthouse e homestay', 'Trasferimenti privati', 'Guida locale a Ha Giang',
                         'Colazioni'],
  price_excludes = array['Volo dall''Italia', 'Pranzi e cene', 'Visto (e-visa)'],
  packing_list = array['Scarpe da camminata', 'Giacca impermeabile', 'Strati caldi per le notti in quota'],
  health_visa_info = 'Per i cittadini italiani serve l''e-visa, da chiedere online almeno una settimana prima. '
                     'Nessuna vaccinazione obbligatoria.',
  fit_nature = 5, fit_trekking = 3, fit_on_the_road = 5, fit_city = 2, fit_culture = 4, fit_chill = 2,
  xpetis_note = 'Prezzo verificato col designer il 2 ottobre 2026 (nota interna, non esce in pagina).'
 where td_id = '11111111-1111-1111-1111-111111111111' and position = 1;

update td_ready_itineraries set
  intro = 'Il Giappone di novembre, quando i treni locali sono vuoti e gli onsen di paese anche.',
  nights = 13
 where td_id = '11111111-1111-1111-1111-111111111111' and position = 2;

update td_ready_itineraries set price_label = null, image_path = null
 where td_id = '11111111-1111-1111-1111-111111111111' and position = 3;

-- Foto, paesi e tappe: si riscrivono interi, così il seed converge.
delete from td_trip_images where ready_itinerary_id in
  (select id from td_ready_itineraries where td_id = '11111111-1111-1111-1111-111111111111');
delete from td_trip_countries where ready_itinerary_id in
  (select id from td_ready_itineraries where td_id = '11111111-1111-1111-1111-111111111111');
delete from td_trip_stops where ready_itinerary_id in
  (select id from td_ready_itineraries where td_id = '11111111-1111-1111-1111-111111111111');

insert into td_trip_images (ready_itinerary_id, position, storage_path)
select r.id, v.position, v.percorso
  from td_ready_itineraries r
  join (values (1, 1::smallint, 'td-media/marco-rossi/itinerario-vietnam-nord.jpg'),
               (1, 2, 'td-media/marco-rossi/ha-giang-1.jpg'),
               (1, 3, 'td-media/marco-rossi/ha-giang-2.jpg'),
               (1, 4, 'td-media/marco-rossi/ha-giang-3.jpg'),
               (2, 1, 'td-media/marco-rossi/itinerario-giappone.jpg'),
               (2, 2, 'td-media/marco-rossi/giappone-1.jpg')) as v (voce, position, percorso)
    on r.position = v.voce
 where r.td_id = '11111111-1111-1111-1111-111111111111';

insert into td_trip_countries (ready_itinerary_id, position, country_code)
select r.id, 1, v.paese
  from td_ready_itineraries r
  join (values (1, 'vietnam'), (2, 'giappone'), (3, 'thailandia')) as v (voce, paese) on r.position = v.voce
 where r.td_id = '11111111-1111-1111-1111-111111111111';

insert into td_trip_stops (ready_itinerary_id, position, days_label, title, description)
select r.id, v.position, v.giorni, v.titolo, v.descrizione
  from td_ready_itineraries r,
       (values (1::smallint, '1-2', 'Hanoi', 'Il quartiere vecchio a piedi, street food la sera.'),
               (2, '3-5', 'Ninh Binh', 'In bicicletta tra le risaie, in barca sotto le grotte di Trang An.'),
               (3, '6-9', 'Ha Giang Loop', 'Quattro giorni sulla strada del confine, dormendo in homestay.'),
               (4, '10-11', 'Dong Van', 'Il mercato della domenica e il passo di Ma Pi Leng.'),
               (5, '12', 'Rientro', 'Ritorno a Hanoi e volo.')) as v (position, giorni, titolo, descrizione)
 where r.td_id = '11111111-1111-1111-1111-111111111111' and r.position = 1;

-- ---------------------------------------------------------------- gruppi
update td_group_trips set
  intro = E'Il Nord del Vietnam in moto, in un gruppo piccolo: si guida piano, ci si ferma dove '
          'capita e si dorme dalle famiglie lungo la strada.',
  nights = 11,
  price_note = 'voli esclusi · cassa comune 120€ in loco',
  main_stops = array['Hanoi', 'Ha Giang', 'Dong Van', 'Meo Vac'],
  price_includes = array['Moto e carburante', 'Homestay', 'Tour leader', 'Colazioni e cene'],
  price_excludes = array['Volo dall''Italia', 'Pranzi', 'Assicurazione'],
  packing_list = array['Patente A o internazionale', 'Giacca da moto leggera'],
  health_visa_info = 'E-visa per i cittadini italiani. Nessuna vaccinazione obbligatoria.',
  fit_nature = 5, fit_trekking = 2, fit_on_the_road = 5, fit_city = 1, fit_culture = 4, fit_chill = 1,
  participants_min = 6, participants_max = 10,
  age_range = '25-50 anni',
  guide_name = 'Marco Rossi',
  td_terms_text = 'Acconto del 30% all''iscrizione, saldo 30 giorni prima (testo del designer: non esce in pagina).'
 where td_id = '11111111-1111-1111-1111-111111111111' and position = 1;

update td_group_trips set
  intro = 'L''Isan e il Mekong, la Thailandia che non va in cartolina.',
  nights = 10,
  participants_min = null, participants_max = 10
 where td_id = '11111111-1111-1111-1111-111111111111' and position = 2;

update td_group_trips set price_label = null, image_path = null, nights = 13
 where td_id = '11111111-1111-1111-1111-111111111111' and position = 3;

delete from td_trip_images where group_trip_id in
  (select id from td_group_trips where td_id = '11111111-1111-1111-1111-111111111111');
delete from td_trip_countries where group_trip_id in
  (select id from td_group_trips where td_id = '11111111-1111-1111-1111-111111111111');
delete from td_trip_stops where group_trip_id in
  (select id from td_group_trips where td_id = '11111111-1111-1111-1111-111111111111');
delete from td_group_trip_departures where group_trip_id in
  (select id from td_group_trips where td_id = '11111111-1111-1111-1111-111111111111');

insert into td_trip_images (group_trip_id, position, storage_path)
select g.id, v.position, v.percorso
  from td_group_trips g
  join (values (1, 1::smallint, 'td-media/marco-rossi/gruppo-ha-giang.jpg'),
               (1, 2, 'td-media/marco-rossi/ha-giang-4.jpg'),
               (2, 1, 'td-media/marco-rossi/gruppo-isan.jpg'),
               (2, 2, 'td-media/marco-rossi/isan-1.jpg'),
               (2, 3, 'td-media/marco-rossi/isan-2.jpg')) as v (voce, position, percorso)
    on g.position = v.voce
 where g.td_id = '11111111-1111-1111-1111-111111111111';

insert into td_trip_countries (group_trip_id, position, country_code)
select g.id, 1, v.paese
  from td_group_trips g
  join (values (1, 'vietnam'), (2, 'thailandia'), (3, 'giappone')) as v (voce, paese) on g.position = v.voce
 where g.td_id = '11111111-1111-1111-1111-111111111111';

insert into td_trip_stops (group_trip_id, position, days_label, title, description)
select g.id, v.position, v.giorni, v.titolo, v.descrizione
  from td_group_trips g,
       (values (1::smallint, '1', 'Arrivo a Hanoi', 'Ci si conosce a cena.'),
               (2, '2-8', 'Ha Giang in moto', 'Sette giorni sulla strada del confine.'),
               (3, '9-12', 'Ritorno', 'Ninh Binh in bicicletta, poi Hanoi.')) as v (position, giorni, titolo, descrizione)
 where g.td_id = '11111111-1111-1111-1111-111111111111' and g.position = 1;

-- Le partenze. Il primo gruppo ha tutti i casi: una passata, una sold out, una
-- «ultimi posti», una aperta. Il terzo ha soltanto una partenza passata: la sua
-- pagina deve restare, senza «Partenze» né «Prossima partenza».
insert into td_group_trip_departures (group_trip_id, starts_on, ends_on, status)
select g.id, v.dal::date, v.al::date, v.stato
  from td_group_trips g
  join (values (1, '2026-03-07', '2026-03-18', 'confirmed'),
               (1, '2026-11-14', '2026-11-25', 'sold_out'),
               (1, '2027-03-06', '2027-03-17', 'last_seats'),
               (1, '2027-10-09', '2027-10-20', 'open'),
               (2, '2027-01-15', '2027-01-25', 'confirmed'),
               (3, '2025-11-02', '2025-11-15', 'confirmed')) as v (voce, dal, al, stato)
    on g.position = v.voce
 where g.td_id = '11111111-1111-1111-1111-111111111111';

-- ===========================================================================
-- Giulia Neri — il demo minimo
-- ===========================================================================
-- La Sessione si spegne invece di cancellarsi: può avere prenotazioni di prova
-- attaccate, e un servizio spento il ponte continua a riconoscerlo.

update td_services set is_active = false
 where td_id = '22222222-2222-2222-2222-222222222222' and service_type = 'consultation_deep';

delete from td_ready_itineraries where td_id = '22222222-2222-2222-2222-222222222222';
delete from td_group_trips       where td_id = '22222222-2222-2222-2222-222222222222';

-- Le recensioni restano nella tabella, spente: nascevano per discutere la
-- milestone 8, e lì servono ancora.
update td_showcase_reviews set is_published = false
 where td_id = '22222222-2222-2222-2222-222222222222';

-- Il paese dei suoi viaggi firma, che restano.
update td_signature_trips set country_code = v.paese
  from (values ('22222222-0000-0000-0000-000000000001'::uuid, 'peru'),
               ('22222222-0000-0000-0000-000000000002', 'bolivia'),
               ('22222222-0000-0000-0000-000000000003', 'peru')) as v (id, paese)
 where td_signature_trips.id = v.id;

commit;
