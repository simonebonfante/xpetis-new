-- XPETIS · 0040 · Il calendario del designer sulla superficie pubblica
--
-- L'embed di Cal.com vive nel browser, e per aprirsi ha bisogno di due stringhe
-- che nessuna vista espone: `cal_username` del designer e
-- `cal_event_type_slug` del servizio. Il link che l'embed costruisce è
-- `<username>/<slug>`, e i due pezzi stanno in tabelle chiuse ad `anon`.
--
-- ## Cosa diventa leggibile con gli strumenti di sviluppo aperti
--
-- `CLAUDE.md` impone di rispondere a questa domanda ogni volta che si aggiunge
-- una vista o un `grant`, e qui la risposta va scritta invece che sottintesa.
--
-- Diventa leggibile la **corrispondenza designer → account Cal.com**: chi apre
-- il pannello di rete vede che Marco Rossi è `marco-rossi-xpetis`. Con quella
-- coppia si può aprire `https://cal.com/marco-rossi-xpetis/consulenza-xpetis-30`
-- e prenotare **saltando il nostro flusso**, quindi senza `xpetis_user_id`
-- precompilato e senza passare dalla cassa.
--
-- **Non è un buco che apriamo noi**, e vale la pena essere precisi sul perché:
--
--  · quella pagina Cal.com è **pubblica per costruzione** — è il prodotto di
--    Cal.com, non una nostra scelta — e resta raggiungibile anche senza questa
--    vista: basta cercare il nome del designer, o leggere il link in una delle
--    mail native che Cal.com manda (deviazione 5, le teniamo accese);
--  · il ponte `calcom_webhook()` **gestisce già** quel caso: senza codice XPETIS
--    riconoscibile risponde `viaggiatore_non_identificato`, non crea nessuna
--    riga e alza un alert critico con l'indirizzo di chi ha prenotato. È il
--    percorso "prenotazione fuori dal sito", previsto e sorvegliato;
--  · quello che NON diventa leggibile è ciò che conta davvero: `cal_booking_uid`
--    resta fuori da ogni vista (0019), perché dopo S-05 quel codice è una
--    credenziale di cancellazione. Sapere *dove* prenotare è diverso dal poter
--    cancellare la call di qualcun altro.
--
-- Il costo di non esporli sarebbe far passare l'embed da una route server che
-- rivelerebbe le stesse due stringhe nell'HTML: la stessa informazione, con un
-- giro in più e la falsa impressione di averla protetta.
--
-- ## `create or replace` e non `drop` + `create`
--
-- Le colonne esistenti restano identiche in ordine e tipo e `cal_username` si
-- aggiunge in coda: `create or replace view` lo consente, e così il `grant` della
-- 0028 non si perde per strada (un `drop view` se lo porta via). Il cambiamento
-- dentro `services` non altera il tipo della colonna, che resta `jsonb`.

create or replace view public_td_showcase as
  select
    td.id,
    td.slug,
    td.display_name,
    td.headline,
    td.hero_bio,
    td.bio,
    td.manifesto,
    td.photo_url,
    td.background_photo_url,
    td.languages,
    td.years_experience,
    td.instagram_handle,
    coalesce(c.countries,  '[]'::jsonb) as countries,
    coalesce(s.services,   '[]'::jsonb) as services,
    coalesce(t.trips,      '[]'::jsonb) as signature_trips,
    coalesce(i.itineraries,'[]'::jsonb) as ready_itineraries,
    -- In coda, e non accanto allo slug dove starebbe meglio: `create or replace
    -- view` sa aggiungere colonne in fondo, non riordinarle.
    td.cal_username
  from travel_designers td
  left join lateral (
    select jsonb_agg(k.name_it order by k.name_it) as countries
      from td_countries tc
      join geo_countries k on k.code = tc.country_code
     where tc.td_id = td.id
  ) c on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'service_type',     sv.service_type,
             'price_cents',      sv.price_cents,
             'price_is_custom',  sv.price_is_custom,
             'duration_minutes', sv.duration_minutes,
             'text_during_call', sv.text_during_call,
             'text_after_call',  sv.text_after_call,
             -- L'altra metà del link dell'embed. Sta sul servizio e non sul
             -- designer perché consulenza e consulenza approfondita sono due
             -- event type diversi, con due slug diversi.
             'cal_event_type_slug', sv.cal_event_type_slug,
             'bullets', coalesce((
               select jsonb_agg(bl.text_it order by bl.position)
                 from td_service_bullets bl where bl.service_id = sv.id), '[]'::jsonb)
           ) order by sv.sort_order) as services
      from td_services sv where sv.td_id = td.id and sv.is_active
  ) s on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'title',       tr.title,
             'description', tr.description,
             'images', coalesce((
               select jsonb_agg(im.storage_path order by im.position)
                 from td_signature_trip_images im where im.trip_id = tr.id), '[]'::jsonb)
           ) order by tr.position) as trips
      from td_signature_trips tr where tr.td_id = td.id
  ) t on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'slug',           it.slug,
             'title',          it.title,
             'duration_label', it.duration_label,
             'price_label',    it.price_label,
             'image_path',     it.image_path
           ) order by it.position) as itineraries
      from td_ready_itineraries it where it.td_id = td.id
  ) i on true
  where td.status = 'published';

comment on view public_td_showcase is
  'La vetrina di un designer pubblicato. Contiene cal_username e '
  'cal_event_type_slug perché l''embed di Cal.com si apre nel browser e senza '
  'quei due pezzi non si può costruire il link. Non contiene cal_booking_uid, '
  'che dopo S-05 è una credenziale di cancellazione (vedi 0019).';
