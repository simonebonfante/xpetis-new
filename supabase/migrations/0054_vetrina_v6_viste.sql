-- XPETIS · 0054 · La vetrina v6 sulla superficie pubblica
--
-- Tre cose:
--
--   1. `public_td_showcase` porta i campi nuovi del profilo e, nelle card di
--      itinerari e gruppi, quello che il disegno del tool ci mette sopra;
--   2. tre viste nuove: il dettaglio di un itinerario, quello di un viaggio di
--      gruppo, e le recensioni da mostrare in vetrina;
--   3. `td_publish_blockers` con due motivi in più.
--
-- ## Cosa diventa leggibile con gli strumenti di sviluppo aperti
--
-- `CLAUDE.md` vuole la risposta scritta sopra ogni vista. Eccola, colonna per
-- colonna; vale solo per i designer pubblicati, come sempre.
--
-- **`public_td_showcase`, in coda:**
--   · `expertise_areas`, `travel_philosophy` — due testi che la pagina stampa;
--   · `member_years` — gli **anni compiuti** da `joined_at`, mai la data. La
--     data darebbe il giorno in cui il team ha caricato il profilo: niente che
--     il viaggiatore debba sapere, e niente che la pagina mostri;
--   · `rating_avg` — la media delle sole recensioni **verificate** (`reviews`,
--     milestone 8), e solo se sono almeno `showcase_rating_min_reviews`.
--     Sotto soglia è `null`. **Nessun conteggio**: la pagina non lo usa, e un
--     «1 recensione» leggibile in rete è un'informazione in più che non serve.
--     Le recensioni dichiarate dal designer non entrano mai nella media (D3).
--   · nei servizi `price_from_cents`, il «da» della vetrina;
--   · nei viaggi firma `country`, il nome del paese del viaggio;
--   · nelle card degli itinerari `countries` (nomi); in quelle dei gruppi
--     `countries`, `next_departure` (date e stato della prima partenza futura)
--     e `participants_min` / `participants_max`.
--
-- **`public_td_ready_itinerary`, `public_td_group_trip`:** tutto ciò che la
-- pagina del viaggio mostra — racconto, tappe, foto, paesi, quota, valigia,
-- informazioni sanitarie, i sei punteggi, e per i gruppi partenze **future**,
-- persone, fascia d'età, accompagnatore. **Fuori**: `xpetis_note` e
-- `td_terms_text`, le due colonne chiuse della 0053.
--
-- **`public_td_reviews`:** titolo, nome, stelle, data e testo di ogni
-- recensione pubblicata, con `source` che dice da dove viene. **Fuori**
-- `author_years` (0052, D3).
--
-- Restano fuori da ogni vista, e l'harness lo verifica: livelli e posizioni in
-- evidenza dei paesi, assi e loro controprova, copertura legale, prontezza ai
-- gruppi, nome anagrafico, frasi della card, note XPETIS, condizioni scritte
-- dal designer, archivio degli import.
--
-- ## La data di oggi
--
-- «Futura» vuol dire `starts_on` da oggi in poi, **a Roma**:
-- `(now() at time zone 'Europe/Rome')::date`. Calcolata qui, dentro il
-- database, e quindi sul server: il browser non decide quali partenze esistono.
--
-- ## Le chiavi vecchie delle card
--
-- `image_path`, `dates_label` e `group_size_label` restano nelle card finché le
-- pagine non sono rifatte (fase 3) e il seed demo non è convertito (fase 4).
-- `image_path` diventa la copertina vera — la prima di `td_trip_images` — con
-- la colonna superata come ripiego: così le pagine di oggi mostrano già le foto
-- importate. Si tolgono con la migration di pulizia.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. public_td_showcase
-- ---------------------------------------------------------------------------
-- `create or replace` come nella 0040 e nella 0048: le diciotto colonne di prima
-- restano uguali in ordine e tipo, le nuove si aggiungono in fondo, e il
-- `grant` non si perde.

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
    td.cal_username,
    coalesce(g.group_trips,'[]'::jsonb) as group_trips,
    -- 0054
    td.expertise_areas,
    td.travel_philosophy,
    greatest(0, extract(year from age((now() at time zone 'Europe/Rome')::date, td.joined_at)))::int
      as member_years,
    -- La soglia si legge da `public_config`, non da `app_config`: una vista
    -- pubblica tocca soltanto parametri già pubblici. Riga assente = nessun voto.
    (select rs.avg_overall
       from td_review_stats rs
      where rs.td_id = td.id
        and rs.reviews_count >= (select pc.value from public_config pc
                                  where pc.key = 'showcase_rating_min_reviews'))
      as rating_avg
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
             'cal_event_type_slug', sv.cal_event_type_slug,
             'price_from_cents', sv.price_from_cents,
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
             'country',     (select k.name_it from geo_countries k where k.code = tr.country_code),
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
             'image_path',     coalesce((select ti.storage_path from td_trip_images ti
                                          where ti.ready_itinerary_id = it.id
                                          order by ti.position limit 1), it.image_path),
             'countries',      coalesce((select jsonb_agg(k.name_it order by tc.position)
                                           from td_trip_countries tc
                                           join geo_countries k on k.code = tc.country_code
                                          where tc.ready_itinerary_id = it.id), '[]'::jsonb)
           ) order by it.position) as itineraries
      from td_ready_itineraries it where it.td_id = td.id
  ) i on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'slug',             gt.slug,
             'title',            gt.title,
             'dates_label',      gt.dates_label,
             'duration_label',   gt.duration_label,
             'group_size_label', gt.group_size_label,
             'price_label',      gt.price_label,
             'image_path',       coalesce((select ti.storage_path from td_trip_images ti
                                            where ti.group_trip_id = gt.id
                                            order by ti.position limit 1), gt.image_path),
             'countries',        coalesce((select jsonb_agg(k.name_it order by tc.position)
                                             from td_trip_countries tc
                                             join geo_countries k on k.code = tc.country_code
                                            where tc.group_trip_id = gt.id), '[]'::jsonb),
             'participants_min', gt.participants_min,
             'participants_max', gt.participants_max,
             -- La regola del tool: la prima partenza futura che non sia sold
             -- out; se lo sono tutte, la prima futura. **Mai una passata**: il
             -- tool, senza future, mostrerebbe l'ultima partenza già andata.
             'next_departure',   (select jsonb_build_object('starts_on', d.starts_on,
                                                            'ends_on',   d.ends_on,
                                                            'status',    d.status)
                                    from td_group_trip_departures d
                                   where d.group_trip_id = gt.id
                                     and d.starts_on >= (now() at time zone 'Europe/Rome')::date
                                   order by (d.status = 'sold_out'), d.starts_on
                                   limit 1)
           ) order by gt.position) as group_trips
      from td_group_trips gt where gt.td_id = td.id
  ) g on true
  where td.status = 'published';

comment on view public_td_showcase is
  'La vetrina di un designer pubblicato. Contiene cal_username e '
  'cal_event_type_slug perché l''embed di Cal.com si apre nel browser e senza '
  'quei due pezzi non si può costruire il link. Non contiene cal_booking_uid, '
  'che dopo S-05 è una credenziale di cancellazione (vedi 0019). Dalla 0048 '
  'porta anche i viaggi di gruppo, in coda; dalla 0051 col loro slug. Dalla '
  '0054 i campi del tool vetrina v6: anni di appartenenza (mai la data) e voto '
  'medio delle sole recensioni verificate, sopra soglia.';

-- ---------------------------------------------------------------------------
-- 2. Il dettaglio di un itinerario pronto
-- ---------------------------------------------------------------------------
-- Una riga per itinerario. La pagina la cerca per (td_slug, slug): lo slug è
-- unico dentro il designer (0033). Il designer — nome, foto, servizi per
-- prenotare — la pagina lo legge già da `public_td_showcase`.

create view public_td_ready_itinerary as
  select
    td.slug as td_slug,
    it.slug,
    it.position,
    it.title,
    it.duration_label,
    it.price_label,
    it.nights,
    it.intro,
    it.price_note,
    it.main_stops,
    it.price_includes,
    it.price_excludes,
    it.packing_list,
    it.health_visa_info,
    it.fit_nature,
    it.fit_trekking,
    it.fit_on_the_road,
    it.fit_city,
    it.fit_culture,
    it.fit_chill,
    coalesce((select jsonb_agg(ti.storage_path order by ti.position)
                from td_trip_images ti where ti.ready_itinerary_id = it.id),
             case when it.image_path is not null then jsonb_build_array(it.image_path) end,
             '[]'::jsonb) as images,
    coalesce((select jsonb_agg(k.name_it order by tc.position)
                from td_trip_countries tc
                join geo_countries k on k.code = tc.country_code
               where tc.ready_itinerary_id = it.id), '[]'::jsonb) as countries,
    coalesce((select jsonb_agg(jsonb_build_object('days_label',  st.days_label,
                                                  'title',       st.title,
                                                  'description', st.description)
                               order by st.position)
                from td_trip_stops st where st.ready_itinerary_id = it.id), '[]'::jsonb) as stops
  from td_ready_itineraries it
  join travel_designers td on td.id = it.td_id
  where td.status = 'published';

comment on view public_td_ready_itinerary is
  'Il dettaglio di un itinerario pronto di un designer pubblicato, per la sua '
  'pagina. Non contiene xpetis_note né td_terms_text (0053), che sono chiuse.';

-- ---------------------------------------------------------------------------
-- 3. Il dettaglio di un viaggio di gruppo
-- ---------------------------------------------------------------------------

create view public_td_group_trip as
  select
    td.slug as td_slug,
    gt.slug,
    gt.position,
    gt.title,
    gt.duration_label,
    gt.price_label,
    gt.nights,
    gt.intro,
    gt.price_note,
    gt.main_stops,
    gt.price_includes,
    gt.price_excludes,
    gt.packing_list,
    gt.health_visa_info,
    gt.fit_nature,
    gt.fit_trekking,
    gt.fit_on_the_road,
    gt.fit_city,
    gt.fit_culture,
    gt.fit_chill,
    gt.participants_min,
    gt.participants_max,
    gt.age_range,
    gt.guide_name,
    coalesce((select jsonb_agg(ti.storage_path order by ti.position)
                from td_trip_images ti where ti.group_trip_id = gt.id),
             case when gt.image_path is not null then jsonb_build_array(gt.image_path) end,
             '[]'::jsonb) as images,
    coalesce((select jsonb_agg(k.name_it order by tc.position)
                from td_trip_countries tc
                join geo_countries k on k.code = tc.country_code
               where tc.group_trip_id = gt.id), '[]'::jsonb) as countries,
    coalesce((select jsonb_agg(jsonb_build_object('days_label',  st.days_label,
                                                  'title',       st.title,
                                                  'description', st.description)
                               order by st.position)
                from td_trip_stops st where st.group_trip_id = gt.id), '[]'::jsonb) as stops,
    -- Solo le partenze future: una partenza passata non si vende e non si
    -- mostra. Il tool le mostrava tutte, barrando le sold out.
    coalesce((select jsonb_agg(jsonb_build_object('starts_on', d.starts_on,
                                                  'ends_on',   d.ends_on,
                                                  'status',    d.status)
                               order by d.starts_on)
                from td_group_trip_departures d
               where d.group_trip_id = gt.id
                 and d.starts_on >= (now() at time zone 'Europe/Rome')::date), '[]'::jsonb) as departures,
    (select jsonb_build_object('starts_on', d.starts_on, 'ends_on', d.ends_on, 'status', d.status)
       from td_group_trip_departures d
      where d.group_trip_id = gt.id
        and d.starts_on >= (now() at time zone 'Europe/Rome')::date
      order by (d.status = 'sold_out'), d.starts_on
      limit 1) as next_departure
  from td_group_trips gt
  join travel_designers td on td.id = gt.td_id
  where td.status = 'published';

comment on view public_td_group_trip is
  'Il dettaglio di un viaggio di gruppo di un designer pubblicato, per la sua '
  'pagina. Solo partenze future (ora di Roma). Non contiene xpetis_note né '
  'td_terms_text (0053), che sono chiuse.';

-- ---------------------------------------------------------------------------
-- 4. Le recensioni della vetrina
-- ---------------------------------------------------------------------------
-- Due fonti, una vista, e la pagina non deve sapere quale delle due arriva:
--
--   · `td_declared` — raccolte dal designer fuori da XPETIS
--     (`td_showcase_reviews`). Si mostrano con una dicitura sopra
--     (`app_config.showcase_declared_reviews_note`), le stelle della singola si
--     vedono, **la media no** (decisione D3 del 3 ottobre 2026);
--   · `xpetis_verified` — quelle di `reviews`, che pretendono un ordine vero
--     dietro. Oggi sono zero; con la milestone 8 arrivano senza cambiare la
--     pagina. Sono già servite da `public_reviews` (0015), quindi qui non si
--     apre niente di nuovo.
--
-- L'ordine: prima le verificate, dalla più recente; poi le dichiarate, nella
-- posizione data dal designer.

create view public_td_reviews as
  select td.slug          as td_slug,
         'xpetis_verified'::text as source,
         1                as source_order,
         null::smallint   as position,
         null::text       as title,
         r.display_name   as author_name,
         r.rating_overall as stars,
         null::text       as date_label,
         (r.created_at at time zone 'Europe/Rome')::date as reviewed_on,
         r.body
    from reviews r
    join travel_designers td on td.id = r.td_id
   where td.status = 'published' and r.is_published
  union all
  select td.slug,
         'td_declared',
         2,
         sr.position,
         sr.title,
         sr.author_name,
         sr.stars,
         sr.date_label,
         null::date,
         sr.body
    from td_showcase_reviews sr
    join travel_designers td on td.id = sr.td_id
   where td.status = 'published' and sr.is_published;

comment on view public_td_reviews is
  'Le recensioni da mostrare in vetrina: verificate (reviews) e dichiarate dal '
  'designer (td_showcase_reviews), distinte da source. Non contiene '
  'author_years. La media sta in public_td_showcase.rating_avg e conta solo '
  'le verificate.';

grant select on public_td_ready_itinerary, public_td_group_trip, public_td_reviews
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. td_publish_blockers: due motivi in più
-- ---------------------------------------------------------------------------
-- Le durate ammesse per l'approfondita, come gli slug della 0048, stanno in
-- `app_config` (`calcom_minutes_consultation_deep`, «60, 90», deviazione 10). Il
-- tool vetrina v6 forza la Sessione a 90 minuti per tutti; noi leggiamo la
-- durata dal pacchetto e la confrontiamo con l'elenco. Senza la riga, la
-- Sessione attiva è bloccata e il motivo lo dice: un controllo che si spegne
-- da solo quando manca il suo parametro non è un controllo.

create or replace function calcom_expected_minutes(p_type service_type)
returns int[]
language sql
stable
set search_path = public, extensions
as $$
  select array(select btrim(s)::int
                 from unnest(string_to_array(value_text, ',')) s
                where btrim(s) ~ '^[0-9]+$')
    from app_config
   where key = 'calcom_minutes_' || p_type::text
     and value_text is not null;
$$;

comment on function calcom_expected_minutes(service_type) is
  'Le durate in minuti ammesse per un tipo di servizio, lette da '
  'app_config.calcom_minutes_<tipo>. NULL se la riga manca (0054).';

revoke all on function calcom_expected_minutes(service_type) from public, anon, authenticated;

-- La funzione della 0048, riemessa identica più due rami in fondo.
create or replace function td_publish_blockers(p_td_id uuid)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(reason order by reason), '{}')
    from (
      select 'foto profilo mancante' as reason
        from travel_designers where id = p_td_id and photo_url is null
      union all
      select 'bio mancante'
        from travel_designers where id = p_td_id and (bio is null or length(btrim(bio)) < 40)
      union all
      select 'nessun paese dichiarato'
       where not exists (select 1 from td_countries where td_id = p_td_id)
      union all
      select 'nessun paese di livello 1: il designer non prenderebbe mai il badge'
       where exists (select 1 from td_countries where td_id = p_td_id)
         and not exists (select 1 from td_countries where td_id = p_td_id and level = 1)
      union all
      select 'assi del quiz incompleti: dichiarati ' || (
               select count(distinct axis_code)::text from td_axis_values where td_id = p_td_id
             ) || ' su ' || (select count(*)::text from quiz_axes)
       where (select count(distinct axis_code) from td_axis_values where td_id = p_td_id)
             < (select count(*) from quiz_axes)
      union all
      select 'nessuna consulenza attiva'
       where not exists (select 1 from td_services
                          where td_id = p_td_id and service_type = 'consultation' and is_active)
      union all
      select 'account Cal.com non collegato'
        from travel_designers where id = p_td_id and cal_username is null
      union all
      select case
               when calcom_expected_slugs(sv.service_type) is null then
                 sv.service_type::text || ': manca app_config.calcom_slugs_'
                 || sv.service_type::text || ', gli slug attesi non sono configurati'
               else
                 sv.service_type::text || ': slug Cal.com «' || sv.cal_event_type_slug
                 || '» fuori elenco (attesi: '
                 || array_to_string(calcom_expected_slugs(sv.service_type), ', ')
                 || '). Le prenotazioni verrebbero scartate come non nostre'
             end
        from td_services sv
       where sv.td_id = p_td_id
         and sv.is_active
         and sv.service_type in ('consultation', 'consultation_deep')
         and (calcom_expected_slugs(sv.service_type) is null
              or not (sv.cal_event_type_slug = any (calcom_expected_slugs(sv.service_type))))
      union all
      -- 0054: la breve c'è ma senza prezzo. Il vincolo
      -- `td_services_bookable_complete` la tiene spenta, e il motivo generico
      -- «nessuna consulenza attiva» non direbbe perché. L'importatore la crea
      -- così quando `callPrezzo` non si sa leggere.
      select 'consulenza breve senza prezzo: la cassa non si può aprire'
       where exists (select 1 from td_services
                      where td_id = p_td_id and service_type = 'consultation' and price_cents is null)
      union all
      -- 0054: l'approfondita attiva con una durata fuori elenco.
      select case
               when calcom_expected_minutes('consultation_deep') is null then
                 'consultation_deep: manca app_config.calcom_minutes_consultation_deep, '
                 || 'le durate ammesse non sono configurate'
               else
                 'consultation_deep: durata di ' || sv.duration_minutes::text
                 || ' minuti non ammessa (ammesse: '
                 || array_to_string(calcom_expected_minutes('consultation_deep'), ', ') || ')'
             end
        from td_services sv
       where sv.td_id = p_td_id
         and sv.is_active
         and sv.service_type = 'consultation_deep'
         and (calcom_expected_minutes('consultation_deep') is null
              or not (sv.duration_minutes = any (calcom_expected_minutes('consultation_deep'))))
    ) b;
$$;
