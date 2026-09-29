-- XPETIS · 0051 · L'indirizzo stabile dei viaggi di gruppo, e il quiz che non
-- ricade sulla chiave del form
--
-- Due cose piccole e indipendenti, nate dallo stesso giro sul Figma nuovo
-- (29 settembre 2026).
--
-- ## 1. Lo slug di `td_group_trips`
--
-- Il nodo Figma `3-1121` è **una pagina per viaggio di gruppo**: filo di
-- briciole col titolo, «Altri viaggi di gruppo» in fondo. Una pagina vuole un
-- indirizzo, e la 0048 aveva lasciato scritto che lo slug si sarebbe aggiunto
-- con la pagina. Eccolo.
--
-- La ragione è quella della 0033, e vale parola per parola: con un ordinale
-- (`/viaggio-di-gruppo/2`) un riordino fa rispondere **200** ai link vecchi con
-- un viaggio diverso — peggio di un 404, perché nessuno se ne accorge. E
-- `position` non serve a niente, è proprio la colonna che un riordino riscrive.
-- Lo slug e non l'uuid per lo stesso motivo degli itinerari: questi link
-- finiscono nei messaggi WhatsApp, e là un indirizzo si legge prima di
-- toccarlo.
--
-- Stesse regole della 0033, senza eccezioni, perché due contratti diversi per
-- due indirizzi gemelli sarebbero una trappola per chi scrive l'importatore:
--
--  · nasce dal titolo **all'inserimento**, e un UPDATE non lo tocca mai:
--    correggere un refuso nel titolo non muove l'indirizzo;
--  · uno slug scritto a mano si rispetta (è il modo per cambiarlo davvero);
--  · unico **per designer**: l'URL porta già lo slug del designer;
--  · una collisione dentro lo stesso designer prende un suffisso numerico. Nel
--    Figma i viaggi d'esempio si chiamano tutti «Argentina: Trekking in
--    Patagonia»: il secondo diventa `argentina-trekking-in-patagonia-2`;
--  · 60 caratteri al massimo, e un titolo fatto solo di segni ripiega su un
--    pezzo dell'uuid.
--
-- ⚠️ **Il limite che resta, ed è lo stesso degli itinerari:** lo slug è stabile
-- finché la **riga** è la stessa. Un importatore che cancella e reinserisce i
-- viaggi a ogni aggiornamento del JSON li rigenera dal titolo — di solito
-- uguali, ma non se nel frattempo il titolo è cambiato o due titoli uguali
-- hanno cambiato ordine. L'importatore non esiste ancora: quando si scrive,
-- deve aggiornare le righe per titolo, non rifarle. È in `PIANO.md`.
--
-- Cosa diventa leggibile con gli strumenti di sviluppo aperti: lo slug di ogni
-- viaggio di gruppo di un designer pubblicato. È un pezzo dell'indirizzo della
-- pagina, che il viaggiatore ha già nella barra del browser.
--
-- ## 2. `public_quiz_axes` non ricade più su `label_it`
--
-- La 0049 ha messo le risposte del quiz in `answer_it` e ha lasciato nella
-- vista un `coalesce(answer_it, label_it)`. Su «con chi viaggi» `label_it` è
-- la **chiave** che combacia carattere per carattere col form Vetrina TD: se un
-- giorno una risposta perdesse il suo testo, il quiz mostrerebbe la chiave, e
-- una chiave che si vede in pagina è una chiave che qualcuno prima o poi
-- «corregge» per migliorare il testo — e l'import dei 25 smette di riconoscere
-- le risposte, in silenzio.
--
-- Senza ricaduta, un testo che manca arriva come `null`, e il quiz lo mostra
-- come buco dichiarato («etichetta da scrivere», `components/quiz-domande.tsx`)
-- invece di mostrare la chiave. Stesse colonne, stesso ordine: `create or
-- replace` non perde il `grant`.

set search_path = public, extensions;

-- --------------------------------------------------------------------------
-- 1. Lo slug dei viaggi di gruppo

alter table td_group_trips add column slug text;

comment on column td_group_trips.slug is
  'Identificatore stabile dentro il designer, e pezzo dell''indirizzo pubblico '
  '(/designer/<designer>/viaggio-di-gruppo/<slug>). Nasce dal titolo al primo '
  'inserimento e non cambia più, come td_ready_itineraries.slug (0033). Per '
  'cambiarlo davvero si scrive questa colonna a mano.';

create or replace function td_group_trip_slug()
  returns trigger
  language plpgsql
  set search_path = public, extensions
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 1;
begin
  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  v_base := btrim(left(slugify(new.title), 60), '-');
  if v_base = '' then
    v_base := left(new.id::text, 8);
  end if;

  v_slug := v_base;
  while exists (
    select 1 from td_group_trips g
     where g.td_id = new.td_id and g.slug = v_slug
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end $$;

create trigger td_group_trips_slug
  before insert on td_group_trips
  for each row execute function td_group_trip_slug();

-- Le righe che c'erano già (sul database di sviluppo, i sei viaggi del seed).
-- Stesso criterio del trigger, in ordine di posizione.
with base as (
  select id, td_id,
         coalesce(nullif(btrim(left(slugify(title), 60), '-'), ''), left(id::text, 8)) as b,
         position
    from td_group_trips
), numerate as (
  select id, b, row_number() over (partition by td_id, b order by position, id) as n
    from base
)
update td_group_trips g
   set slug = case when u.n = 1 then u.b else u.b || '-' || u.n end
  from numerate u
 where u.id = g.id;

alter table td_group_trips alter column slug set not null;
create unique index td_group_trips_td_slug on td_group_trips (td_id, slug);

-- --------------------------------------------------------------------------
-- La vetrina pubblica: lo slug entra nei viaggi di gruppo, nient'altro cambia.
-- Stesse colonne della 0048 in ordine e tipo (cambia solo il contenuto di un
-- jsonb), quindi `create or replace` basta e il grant resta.

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
    coalesce(g.group_trips,'[]'::jsonb) as group_trips
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
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'slug',             gt.slug,
             'title',            gt.title,
             'dates_label',      gt.dates_label,
             'duration_label',   gt.duration_label,
             'group_size_label', gt.group_size_label,
             'price_label',      gt.price_label,
             'image_path',       gt.image_path
           ) order by gt.position) as group_trips
      from td_group_trips gt where gt.td_id = td.id
  ) g on true
  where td.status = 'published';

comment on view public_td_showcase is
  'La vetrina di un designer pubblicato. Contiene cal_username e '
  'cal_event_type_slug perché l''embed di Cal.com si apre nel browser e senza '
  'quei due pezzi non si può costruire il link. Non contiene cal_booking_uid, '
  'che dopo S-05 è una credenziale di cancellazione (vedi 0019). Dalla 0048 '
  'porta anche i viaggi di gruppo, in coda; dalla 0051 col loro slug.';

-- --------------------------------------------------------------------------
-- 2. Il quiz: la risposta, e mai la chiave

create or replace view public_quiz_axes as
  select a.code, a.kind, a.label_it, a.question_it, a.scale_min, a.scale_max,
         a.sort_order,
         coalesce((select jsonb_object_agg(o.value, o.answer_it)
                     from quiz_axis_options o where o.axis_code = a.code), '{}'::jsonb) as options
    from quiz_axes a;
