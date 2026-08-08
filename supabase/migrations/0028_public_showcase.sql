-- XPETIS · 0028 · La vetrina completa sulla superficie pubblica
--
-- Chiude il blocco: tutto ciò che il form raccoglie e che va mostrato al
-- viaggiatore passa da qui. Restano fuori, di proposito, le recensioni portate
-- da fuori (decisione rimandata alla milestone 8).

drop view if exists public_td_showcase;

create view public_td_showcase as
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
    coalesce(i.itineraries,'[]'::jsonb) as ready_itineraries
  from travel_designers td
  -- I paesi coperti per nome, senza distinzione di livello: "la copertura è una
  -- sola agli occhi del viaggiatore".
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
             'title',          it.title,
             'duration_label', it.duration_label,
             'price_label',    it.price_label,
             'image_path',     it.image_path
           ) order by it.position) as itineraries
      from td_ready_itineraries it where it.td_id = td.id
  ) i on true
  where td.status = 'published';

grant select on public_td_showcase to anon, authenticated;

-- Le foto di un pacchetto vetrina reale arrivano a 6 MB l'una, 33 MB in totale
-- per 25 file. Il limite di 10 MB della 0017 le respingerebbe: si alza, ma
-- l'import deve comunque ridimensionarle. Non è un vezzo: 1 GB di Storage sul
-- piano gratuito di Supabase basta per una trentina di designer, e noi ne
-- abbiamo 25.
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'Schema storage assente: migrazione ignorata (ambiente non Supabase)';
    return;
  end if;

  update storage.buckets
     set file_size_limit = 15728640,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   where id = 'td-media';
end $$;
