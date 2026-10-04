-- XPETIS · 0056 · Il nome corto del designer, per le frasi della vetrina
--
-- Le pagine dicono «Prenota la call con Luca», «Parlane con Luca»: il tool usa
-- la prima parola del nome. Con un nome professionale (decisione D8 del 3
-- ottobre 2026) la prima parola è sbagliata — «Prenota la call con Pianeta» — e
-- va usato **intero**: «Prenota la call con Pianeta Ferra».
--
-- La pagina non può distinguere i due casi da sola: dovrebbe sapere se
-- `display_name` è il nome anagrafico o quello professionale, e il nome
-- anagrafico (`legal_name`, 0052) è chiuso. Quindi la regola sta qui, e la
-- vista dà il risultato.
--
-- Cosa diventa leggibile con gli strumenti di sviluppo aperti: `short_name`,
-- cioè la prima parola di `display_name` oppure `display_name` intero. Niente
-- che non sia già nel nome mostrato in pagina; in particolare **non** si può
-- risalire al nome anagrafico di chi usa un nome professionale, perché in quel
-- caso `short_name` è il nome professionale stesso. Si capisce soltanto se il
-- designer ne usa uno, cosa che la pagina dice già.
--
-- Senza `legal_name` (i profili caricati prima del tool v6, i demo) vale la
-- prima parola, come nel tool.
--
-- `create or replace`: la vista della 0054 identica, più una colonna in coda.

set search_path = public, extensions;

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
      as rating_avg,
    -- 0056
    case
      when td.legal_name is not null and btrim(td.display_name) <> btrim(td.legal_name)
        then btrim(td.display_name)
      else split_part(btrim(td.display_name), ' ', 1)
    end as short_name
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
