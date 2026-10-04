-- XPETIS · 0055 · L'importatore delle vetrine v6, lato database
--
-- `supabase/scripts/importa_vetrina.mjs` legge un pacchetto del tool vetrina v6
-- (`vetrina.json` + `images/`), lo valida, carica le foto e chiama la funzione
-- di questa migration con il contenuto già ripulito. **Le scritture le fa tutte
-- il database**, in una funzione sola, per una ragione: un designer si importa
-- tutto o niente. Uno script che scrivesse tabella per tabella via API, se si
-- fermasse a metà, lascerebbe un profilo con i paesi nuovi e gli assi vecchi —
-- e il match lo userebbe così.
--
-- ## Prova a secco e scrittura sono lo stesso codice
--
-- `td_import_showcase(payload, p_scrivi)` con `p_scrivi = false` esegue **le
-- stesse scritture** dentro un blocco `begin … exception`, poi solleva
-- un'eccezione propria (`XPD01`) e la cattura: Postgres annulla tutto ciò che
-- il blocco ha scritto, e le variabili della funzione — il report — restano.
-- Quindi la prova a secco non simula la scrittura: **la fa e la disfa**, e non
-- può raccontare una cosa diversa da quella che succederà con `--scrivi`
-- (compresi gli slug che ogni voce prenderà, che nascono dal trigger).
--
-- ## Cosa non tocca mai
--
-- `id`, `slug`, `status`, `email`, `phone`, `cal_username`, `cal_webhook_ok_at`,
-- `agency_id`, `joined_at` (è lo spareggio del match). Un designer nuovo nasce
-- `draft`: **l'importatore non pubblica mai**.
--
-- Prezzi, durate e slug Cal.com delle consulenze si scrivono quando la colonna è
-- vuota (in pratica, al primo import); dopo, se il pacchetto li contraddice, il
-- report lo dice e **non sovrascrive**: un prezzo che cambia tocca
-- prenotazioni vere, e lo applica il team a mano.
--
-- ## Idempotente per costruzione
--
-- Ogni UPDATE porta un `is distinct from`: una riga uguale non si riscrive, e
-- `updated_at` non si muove. Le voci (itinerari, gruppi, viaggi firma) si
-- riconciliano **per titolo** — è la regola scritta nella 0051: stesso titolo,
-- stessa riga, stesso slug, stesso indirizzo. Gli insiemi figli (foto, paesi,
-- tappe, partenze, punti, recensioni) si confrontano interi e si riscrivono
-- solo se diversi. Il report conta le modifiche: al secondo lancio sullo stesso
-- pacchetto sono zero.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- 1. L'archivio
-- ---------------------------------------------------------------------------
-- Ogni lancio con `--scrivi`, riuscito o rifiutato, lascia una riga col JSON
-- grezzo intero: è qui che vivono le chiavi che lo schema non conosce
-- (`formato`, `brand`, `membro`, `rating`, `topDestinazioni`, e qualunque
-- chiave futura). **La prova a secco non scrive l'archivio**: senza `--scrivi`
-- non si scrive niente (decisione di default della fase 0, `VETRINE_V6_FASE0.md`
-- § 7.9). Il valore `prova` resta ammesso per il giorno in cui servisse.

create table td_import_runs (
  id         uuid primary key default gen_random_uuid(),
  td_slug    text not null,
  td_id      uuid references travel_designers(id) on delete set null,
  source     text,
  format     text,
  raw        jsonb not null,
  report     jsonb not null,
  outcome    text not null check (outcome in ('prova', 'scritto', 'rifiutato')),
  created_at timestamptz not null default now()
);
create index td_import_runs_td_idx on td_import_runs (td_slug, created_at desc);

comment on table td_import_runs is
  'Archivio degli import delle vetrine v6: chi, da quale cartella, il JSON '
  'grezzo intero, il report (la coda di correzione del team) e l''esito. CHIUSO: '
  'RLS accesa, nessun privilegio ad anon e authenticated, in nessuna vista. Si '
  'legge da Studio.';

alter table td_import_runs enable row level security;
revoke all on td_import_runs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Le due liste «desiderate»
-- ---------------------------------------------------------------------------
-- Che tag e che valori degli assi il pacchetto vuole. Le etichette combaciano
-- **carattere per carattere** con `tags.label_it` e con `quiz_axis_options.label_it`
-- (sono le stringhe del form): quelle che non combaciano le segnala il report e
-- qui semplicemente non producono righe.

create or replace function td_import_desired_tags(p jsonb)
returns table (country_code text, tag_code text)
language sql
stable
set search_path = public, extensions
as $$
  select distinct c->>'country_code', t.code
    from jsonb_array_elements(coalesce(p->'countries', '[]'::jsonb)) c
    cross join lateral (
      select l, 'theme' as kind from jsonb_array_elements_text(coalesce(c->'themes', '[]'::jsonb)) l
      union all
      select l, 'context' from jsonb_array_elements_text(coalesce(c->'contexts', '[]'::jsonb)) l
    ) e
    join tags t on t.label_it = e.l and t.kind::text = e.kind
$$;

create or replace function td_import_desired_axes(p jsonb)
returns table (axis_code text, value smallint)
language sql
stable
set search_path = public, extensions
as $$
  select a->>'axis', (a->>'value')::smallint
    from jsonb_array_elements(coalesce(p->'axes', '[]'::jsonb)) a
    join quiz_axes q on q.code = a->>'axis'
   where (a->>'value')::int between q.scale_min and q.scale_max
  union
  select 'companions', o.value
    from jsonb_array_elements_text(coalesce(p->'companions', '[]'::jsonb)) l
    join quiz_axis_options o on o.axis_code = 'companions' and o.label_it = l
$$;

-- ---------------------------------------------------------------------------
-- 3. Gli insiemi figli di un itinerario o di un viaggio di gruppo
-- ---------------------------------------------------------------------------
-- Ogni insieme si confronta intero con quello del pacchetto e si riscrive solo
-- se è diverso. Restituisce quanti insiemi ha riscritto.

create or replace function td_import_figli(p_kind text, p_id uuid, p_item jsonb)
returns int
language plpgsql
set search_path = public, extensions
as $$
declare
  k   boolean := p_kind = 'itinerary';
  v_n int := 0;
begin
  -- Le foto, in ordine: la prima è la copertina.
  if coalesce((select jsonb_agg(storage_path order by position) from td_trip_images
                where ready_itinerary_id = p_id or group_trip_id = p_id), '[]'::jsonb)
     is distinct from coalesce(p_item->'images', '[]'::jsonb) then
    delete from td_trip_images where ready_itinerary_id = p_id or group_trip_id = p_id;
    insert into td_trip_images (ready_itinerary_id, group_trip_id, position, storage_path)
    select case when k then p_id end, case when not k then p_id end, o, x
      from jsonb_array_elements_text(coalesce(p_item->'images', '[]'::jsonb)) with ordinality t(x, o);
    v_n := v_n + 1;
  end if;

  -- I paesi del viaggio, in ordine.
  if coalesce((select jsonb_agg(country_code order by position) from td_trip_countries
                where ready_itinerary_id = p_id or group_trip_id = p_id), '[]'::jsonb)
     is distinct from coalesce(p_item->'countries', '[]'::jsonb) then
    delete from td_trip_countries where ready_itinerary_id = p_id or group_trip_id = p_id;
    insert into td_trip_countries (ready_itinerary_id, group_trip_id, position, country_code)
    select case when k then p_id end, case when not k then p_id end, o, x
      from jsonb_array_elements_text(coalesce(p_item->'countries', '[]'::jsonb)) with ordinality t(x, o);
    v_n := v_n + 1;
  end if;

  -- Le tappe.
  if coalesce((select jsonb_agg(jsonb_build_object('days_label', days_label, 'title', title,
                                                   'description', description) order by position)
                 from td_trip_stops where ready_itinerary_id = p_id or group_trip_id = p_id), '[]'::jsonb)
     is distinct from
     coalesce((select jsonb_agg(jsonb_build_object('days_label', x->>'days_label', 'title', x->>'title',
                                                   'description', x->>'description') order by o)
                 from jsonb_array_elements(coalesce(p_item->'stops', '[]'::jsonb)) with ordinality t(x, o)), '[]'::jsonb) then
    delete from td_trip_stops where ready_itinerary_id = p_id or group_trip_id = p_id;
    insert into td_trip_stops (ready_itinerary_id, group_trip_id, position, days_label, title, description)
    select case when k then p_id end, case when not k then p_id end, o,
           x->>'days_label', x->>'title', x->>'description'
      from jsonb_array_elements(coalesce(p_item->'stops', '[]'::jsonb)) with ordinality t(x, o);
    v_n := v_n + 1;
  end if;

  -- Le partenze, solo per i gruppi.
  if not k then
    if coalesce((select jsonb_agg(jsonb_build_object('starts_on', starts_on::text, 'ends_on', ends_on::text,
                                                     'status', status) order by starts_on)
                   from td_group_trip_departures where group_trip_id = p_id), '[]'::jsonb)
       is distinct from
       coalesce((select jsonb_agg(jsonb_build_object('starts_on', x->>'starts_on', 'ends_on', x->>'ends_on',
                                                     'status', x->>'status') order by x->>'starts_on')
                   from jsonb_array_elements(coalesce(p_item->'departures', '[]'::jsonb)) x), '[]'::jsonb) then
      delete from td_group_trip_departures where group_trip_id = p_id;
      insert into td_group_trip_departures (group_trip_id, starts_on, ends_on, status)
      select p_id, (x->>'starts_on')::date, (x->>'ends_on')::date, x->>'status'
        from jsonb_array_elements(coalesce(p_item->'departures', '[]'::jsonb)) x;
      v_n := v_n + 1;
    end if;
  end if;

  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Itinerari pronti e viaggi di gruppo
-- ---------------------------------------------------------------------------
-- Stessa forma nel tool, stessa funzione qui: cambia la tabella e quattro
-- colonne in più sui gruppi. Le chiavi di ogni voce del pacchetto sono **i nomi
-- delle colonne**, così `jsonb_populate_record` fa le conversioni (testo,
-- interi, array) e la lista delle colonne sta in un posto solo.

create or replace function td_import_voci(p_td uuid, p_kind text, p_items jsonb)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_tbl   text := case p_kind when 'itinerary' then 'td_ready_itineraries' else 'td_group_trips' end;
  v_cols  text[] := array['title', 'duration_label', 'price_label', 'intro', 'nights', 'price_note',
                          'main_stops', 'price_includes', 'price_excludes', 'packing_list', 'health_visa_info',
                          'fit_nature', 'fit_trekking', 'fit_on_the_road', 'fit_city', 'fit_culture', 'fit_chill',
                          'xpetis_note', 'td_terms_text'];
  v_c     text;
  v_t     text;
  v_nn    text;
  v_ids   uuid[] := '{}';
  v_id    uuid;
  v_item  jsonb;
  v_i     int;
  v_n     int := 0;
  v_rc    int;
  v_bump  boolean;
  v_slug  text;
  v_out   jsonb := '[]'::jsonb;
begin
  if p_kind = 'group' then
    v_cols := v_cols || array['participants_min', 'participants_max', 'age_range', 'guide_name'];
  end if;
  v_c  := array_to_string(v_cols, ', ');
  v_t  := (select string_agg('t.' || c, ', ') from unnest(v_cols) c);
  v_nn := (select string_agg('n.' || c, ', ') from unnest(v_cols) c);

  -- 1. Riconciliazione per titolo (0051): ogni voce del pacchetto prende la
  --    prima riga esistente con lo stesso titolo non ancora presa. Due voci con
  --    lo stesso titolo si accoppiano nell'ordine di posizione.
  for v_item in select x from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x loop
    execute format('select id from %I where td_id = $1 and btrim(title) = btrim($2)
                     and id <> all($3) order by position limit 1', v_tbl)
       into v_id using p_td, v_item->>'title', array_remove(v_ids, null);
    v_ids := array_append(v_ids, v_id);
  end loop;

  -- 2. Le voci sparite dal pacchetto spariscono dal sito, e il loro indirizzo
  --    dà 404. Le figlie se ne vanno in cascata.
  execute format('delete from %I where td_id = $1 and id <> all($2)', v_tbl)
    using p_td, array_remove(v_ids, null);
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;

  -- 3. Se l'ordine cambia, prima tutte fuori dalla strada: `unique (td_id,
  --    position)` non sopporta due voci che si scambiano il posto.
  execute format('select exists (select 1 from unnest($1::uuid[]) with ordinality u(id, o)
                                  join %I t on t.id = u.id where t.position <> u.o)', v_tbl)
     into v_bump using v_ids;
  if v_bump then
    execute format('update %I set position = position + 10000 where td_id = $1', v_tbl) using p_td;
  end if;

  -- 4. Aggiornare o inserire, nell'ordine del pacchetto.
  v_i := 0;
  for v_item in select x from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x loop
    v_i := v_i + 1;
    v_id := v_ids[v_i];
    if v_id is null then
      execute format('insert into %1$I (td_id, position, %2$s)
                      select $1, $2, %2$s from jsonb_populate_record(null::%1$I, $3) returning id',
                     v_tbl, v_c)
         into v_id using p_td, v_i, v_item;
      v_n := v_n + 1;
    else
      execute format('update %1$I t set (position, %2$s) = ($2::smallint, %3$s)
                        from jsonb_populate_record(null::%1$I, $3) n
                       where t.id = $1 and (t.position, %4$s) is distinct from ($2::smallint, %3$s)',
                     v_tbl, v_c, v_nn, v_t)
        using v_id, v_i, v_item;
      get diagnostics v_rc = row_count;
      v_n := v_n + v_rc;
    end if;
    v_n := v_n + td_import_figli(p_kind, v_id, v_item);
    execute format('select slug from %I where id = $1', v_tbl) into v_slug using v_id;
    v_out := v_out || jsonb_build_object('title', v_item->>'title', 'slug', v_slug);
  end loop;

  return jsonb_build_object('modifiche', v_n, 'voci', v_out);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Il designer
-- ---------------------------------------------------------------------------

create or replace function td_import_apply(p jsonb)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_td      jsonb := coalesce(p->'td', '{}'::jsonb);
  v_slug    text  := p->'td'->>'slug';
  v_id      uuid;
  v_nuovo   boolean := false;
  v_err     text[] := '{}';
  v_warn    text[] := coalesce(array(select jsonb_array_elements_text(p->'warnings')), '{}');
  v_n       int := 0;
  v_rc      int;
  v_x       text[];
  v_r       record;
  v_s       jsonb;
  v_type    service_type;
  v_sv      td_services;
  v_found   boolean;
  v_price   int;
  v_dur     int;
  v_cslug   text;
  v_slug30  text := (calcom_expected_slugs('consultation'))[1];
  v_min30   int  := (calcom_expected_minutes('consultation'))[1];
  v_attiva  boolean;
  v_ordine  text[] := array['consultation', 'consultation_deep', 'custom_itinerary', 'all_inclusive',
                            'group_trip', 'private_guiding'];
  v_ids     uuid[];
  v_item    jsonb;
  v_i       int;
  v_trip    uuid;
  v_it      jsonb;
  v_gr      jsonb;
begin
  -- =========================================================================
  -- A. Le verifiche che chiedono il database. Un errore qui ferma il designer
  --    prima di qualunque scrittura.
  -- =========================================================================

  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    v_err := v_err || format('Slug del designer non valido: «%s»', coalesce(v_slug, ''));
  end if;

  -- Paesi sconosciuti, ovunque compaiano: un paese che la tassonomia non ha
  -- ferma l'import con l'elenco completo.
  select array_agg(distinct x order by x) into v_x
    from (select jsonb_path_query(p, '$.countries[*].country_code') #>> '{}' as x
          union all select jsonb_path_query(p, '$.itineraries[*].countries[*]') #>> '{}'
          union all select jsonb_path_query(p, '$.group_trips[*].countries[*]') #>> '{}'
          union all select jsonb_path_query(p, '$.signature_trips[*].country_code') #>> '{}') s
   where x is not null and not exists (select 1 from geo_countries g where g.code = s.x);
  if v_x is not null then
    v_err := v_err || ('Paesi che la tassonomia non ha: ' || array_to_string(v_x, ', '));
  end if;

  -- Il nome del paese scritto nel pacchetto contro quello della tassonomia.
  for v_r in
    select c->>'country_code' as code, c->>'name' as nome, g.name_it
      from jsonb_array_elements(coalesce(p->'countries', '[]'::jsonb)) c
      join geo_countries g on g.code = c->>'country_code'
     where c->>'name' is not null and lower(btrim(c->>'name')) <> lower(g.name_it)
  loop
    v_warn := v_warn || format('Paese %s: il pacchetto lo chiama «%s», la tassonomia «%s»',
                               v_r.code, v_r.nome, v_r.name_it);
  end loop;

  -- Il verso degli assi (milestone 1). Il numero dice da che parte sta il
  -- designer, `assiLato` lo dice a parole: un valore nella metà bassa della
  -- scala deve stare dal lato di `label_min`, nella metà alta da quello di
  -- `label_max`. **Il verso si legge da quiz_axes, mai dal nome dell'asse.**
  for v_r in
    select q.code, q.label_min, q.label_max, q.scale_min, q.scale_max,
           (a->>'value')::int as v, a->>'side' as side
      from jsonb_array_elements(coalesce(p->'axes', '[]'::jsonb)) a
      join quiz_axes q on q.code = a->>'axis'
  loop
    if v_r.v < v_r.scale_min or v_r.v > v_r.scale_max then
      v_err := v_err || format('Asse %s: valore %s fuori scala (%s-%s)', v_r.code, v_r.v, v_r.scale_min, v_r.scale_max);
    elsif v_r.side is null or btrim(v_r.side) = '' then
      v_warn := v_warn || format('Asse %s: manca la controprova (assiLato), il valore %s non è verificato', v_r.code, v_r.v);
    elsif lower(btrim(v_r.side)) <> lower(case when v_r.v <= (v_r.scale_min + v_r.scale_max) / 2.0
                                             then v_r.label_min else v_r.label_max end) then
      v_err := v_err || format('Asse %s: il valore %s sta dal lato «%s», ma il designer ha scelto «%s». '
                               || 'Un asse girato: non si importa finché non è chiarito',
                               v_r.code, v_r.v,
                               case when v_r.v <= (v_r.scale_min + v_r.scale_max) / 2.0
                                    then v_r.label_min else v_r.label_max end,
                               v_r.side);
    end if;
  end loop;
  for v_r in
    select q.code from quiz_axes q
     where q.kind = 'continuous'
       and not exists (select 1 from jsonb_array_elements(coalesce(p->'axes', '[]'::jsonb)) a where a->>'axis' = q.code)
  loop
    v_warn := v_warn || format('Asse %s non dichiarato', v_r.code);
  end loop;

  -- Etichette che non combaciano: «con chi viaggi», temi, contesti.
  for v_r in
    select l from jsonb_array_elements_text(coalesce(p->'companions', '[]'::jsonb)) l
     where not exists (select 1 from quiz_axis_options o where o.axis_code = 'companions' and o.label_it = l)
  loop
    v_warn := v_warn || format('«Con chi viaggi»: etichetta «%s» non riconosciuta, non importata', v_r.l);
  end loop;
  for v_r in
    select c->>'country_code' as code, e.l, e.kind
      from jsonb_array_elements(coalesce(p->'countries', '[]'::jsonb)) c
      cross join lateral (
        select l, 'theme' as kind from jsonb_array_elements_text(coalesce(c->'themes', '[]'::jsonb)) l
        union all
        select l, 'context' from jsonb_array_elements_text(coalesce(c->'contexts', '[]'::jsonb)) l
      ) e
     where not exists (select 1 from tags t where t.label_it = e.l and t.kind::text = e.kind)
  loop
    v_warn := v_warn || format('Paese %s: %s «%s» non combacia con nessun tag, non importato',
                               v_r.code, case v_r.kind when 'theme' then 'tema' else 'contesto' end, v_r.l);
  end loop;

  if v_slug30 is null or v_min30 is null then
    v_err := array_append(v_err, 'Manca app_config.calcom_slugs_consultation o calcom_minutes_consultation: '
                                 'la consulenza breve non saprebbe con che event type e che durata nascere'::text);
  end if;

  select id into v_id from travel_designers where slug = v_slug;
  if v_id is null and nullif(btrim(coalesce(p->>'email', '')), '') is null then
    v_err := v_err || format('Il designer «%s» non esiste ancora: serve --email (la colonna è obbligatoria '
                             || 'e il pacchetto non la contiene)', v_slug);
  end if;

  if cardinality(v_err) > 0 then
    return jsonb_build_object('esito', 'rifiutato', 'td_slug', v_slug, 'nuovo', v_id is null,
                              'modifiche', 0, 'errori', to_jsonb(v_err), 'avvisi', to_jsonb(v_warn));
  end if;

  -- =========================================================================
  -- B. Il profilo
  -- =========================================================================

  if v_id is null then
    insert into travel_designers (slug, email, display_name, legal_name, expertise_areas, years_experience,
                                  languages, instagram_handle, bio, travel_philosophy, hero_bio, manifesto,
                                  photo_url, background_photo_url, legal_coverage, group_trips_readiness,
                                  group_trips_timing, axis_sides, card_phrases, card_phrases_status)
    select v_slug, btrim(p->>'email'), n.display_name, n.legal_name, n.expertise_areas, n.years_experience,
           coalesce(n.languages, '{}'), n.instagram_handle, n.bio, n.travel_philosophy, n.hero_bio, n.manifesto,
           n.photo_url, n.background_photo_url, n.legal_coverage, n.group_trips_readiness,
           n.group_trips_timing, n.axis_sides, n.card_phrases, n.card_phrases_status
      from jsonb_populate_record(null::travel_designers, v_td) n
    returning id into v_id;
    v_nuovo := true;
    v_n := v_n + 1;
  else
    update travel_designers t
       set (display_name, legal_name, expertise_areas, years_experience, languages, instagram_handle, bio,
            travel_philosophy, hero_bio, manifesto, photo_url, background_photo_url, legal_coverage,
            group_trips_readiness, group_trips_timing, axis_sides, card_phrases, card_phrases_status)
         = (n.display_name, n.legal_name, n.expertise_areas, n.years_experience, coalesce(n.languages, '{}'),
            n.instagram_handle, n.bio, n.travel_philosophy, n.hero_bio, n.manifesto, n.photo_url,
            n.background_photo_url, n.legal_coverage, n.group_trips_readiness, n.group_trips_timing,
            n.axis_sides, n.card_phrases, n.card_phrases_status)
      from jsonb_populate_record(null::travel_designers, v_td) n
     where t.id = v_id
       and (t.display_name, t.legal_name, t.expertise_areas, t.years_experience, t.languages, t.instagram_handle,
            t.bio, t.travel_philosophy, t.hero_bio, t.manifesto, t.photo_url, t.background_photo_url,
            t.legal_coverage, t.group_trips_readiness, t.group_trips_timing, t.axis_sides, t.card_phrases,
            t.card_phrases_status)
           is distinct from
           (n.display_name, n.legal_name, n.expertise_areas, n.years_experience, coalesce(n.languages, '{}'),
            n.instagram_handle, n.bio, n.travel_philosophy, n.hero_bio, n.manifesto, n.photo_url,
            n.background_photo_url, n.legal_coverage, n.group_trips_readiness, n.group_trips_timing,
            n.axis_sides, n.card_phrases, n.card_phrases_status);
    get diagnostics v_rc = row_count;
    v_n := v_n + v_rc;

    if nullif(btrim(coalesce(p->>'email', '')), '') is not null
       and exists (select 1 from travel_designers where id = v_id and email <> btrim(p->>'email')) then
      v_warn := array_append(v_warn, 'L''email passata con --email è diversa da quella nel database: non toccata'::text);
    end if;
  end if;

  -- =========================================================================
  -- C. I paesi, i loro tag, gli assi
  -- =========================================================================

  delete from td_countries
   where td_id = v_id
     and country_code <> all (array(select c->>'country_code'
                                      from jsonb_array_elements(coalesce(p->'countries', '[]'::jsonb)) c));
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;

  -- Le posizioni in evidenza che cambiano si liberano prima, così l'indice
  -- unico non vede mai due paesi sulla stessa posizione.
  update td_countries tc set highlight_position = null
   where tc.td_id = v_id and tc.highlight_position is not null
     and tc.highlight_position is distinct from (
           select (c->>'highlight_position')::smallint
             from jsonb_array_elements(coalesce(p->'countries', '[]'::jsonb)) c
            where c->>'country_code' = tc.country_code);
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;

  insert into td_countries (td_id, country_code, level, highlight_position, areas_note, custom_themes,
                            typical_duration, typical_budget)
  select v_id, n.country_code, n.level, n.highlight_position, n.areas_note, coalesce(n.custom_themes, '{}'),
         n.typical_duration, n.typical_budget
    from jsonb_array_elements(coalesce(p->'countries', '[]'::jsonb)) c,
         jsonb_populate_record(null::td_countries, c) n
  on conflict (td_id, country_code) do update
     set level = excluded.level, highlight_position = excluded.highlight_position,
         areas_note = excluded.areas_note, custom_themes = excluded.custom_themes,
         typical_duration = excluded.typical_duration, typical_budget = excluded.typical_budget
   where (td_countries.level, td_countries.highlight_position, td_countries.areas_note,
          td_countries.custom_themes, td_countries.typical_duration, td_countries.typical_budget)
         is distinct from
         (excluded.level, excluded.highlight_position, excluded.areas_note, excluded.custom_themes,
          excluded.typical_duration, excluded.typical_budget);
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;

  delete from td_destination_tags d
   where d.td_id = v_id
     and not exists (select 1 from td_import_desired_tags(p) w
                      where w.country_code = d.country_code and w.tag_code = d.tag_code);
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;
  insert into td_destination_tags (td_id, country_code, tag_code)
  select v_id, w.country_code, w.tag_code from td_import_desired_tags(p) w
  on conflict do nothing;
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;

  -- Prima si tolgono i valori che non servono più: un asse continuo ne ammette
  -- uno solo, e il trigger della 0007 rifiuterebbe il nuovo accanto al vecchio.
  delete from td_axis_values v
   where v.td_id = v_id
     and not exists (select 1 from td_import_desired_axes(p) w
                      where w.axis_code = v.axis_code and w.value = v.value);
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;
  insert into td_axis_values (td_id, axis_code, value)
  select v_id, w.axis_code, w.value from td_import_desired_axes(p) w
  on conflict do nothing;
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;

  -- =========================================================================
  -- D. I servizi
  -- =========================================================================

  for v_s in select x from jsonb_array_elements(coalesce(p->'services', '[]'::jsonb)) x loop
    v_type := (v_s->>'type')::service_type;
    select * into v_sv from td_services where td_id = v_id and service_type = v_type;
    v_found := found;
    v_attiva := coalesce((v_s->>'active')::boolean, false);

    if v_type in ('consultation', 'consultation_deep') then
      v_price := (v_s->>'price_cents')::int;

      -- Durata ed event type: la breve dura sempre quanto dice app_config (30,
      -- deviazione 10); l'approfondita dura quanto dice il pacchetto, se è fra
      -- le durate ammesse, e prende lo slug ammesso che finisce con quel numero.
      if v_type = 'consultation' then
        v_dur := v_min30;
        v_cslug := v_slug30;
      else
        v_dur := (v_s->>'minutes')::int;
        v_cslug := (select x from unnest(calcom_expected_slugs('consultation_deep')) x
                     where v_dur is not null and x ~ ('-' || v_dur::text || '$') limit 1);
        if v_attiva and (v_dur is null
                         or not (v_dur = any (coalesce(calcom_expected_minutes('consultation_deep'), '{}')))
                         or v_cslug is null) then
          v_warn := v_warn || format('Sessione approfondita: durata «%s» non ammessa (ammesse: %s). '
                                     || 'Servizio non scritto: si sistema a mano',
                                     coalesce(v_s->>'minutes_label', ''),
                                     coalesce(array_to_string(calcom_expected_minutes('consultation_deep'), ', '),
                                              'nessuna, manca app_config.calcom_minutes_consultation_deep'));
          continue;
        end if;
      end if;

      if not v_found then
        if v_type = 'consultation_deep' and not v_attiva then
          continue;
        end if;
        if v_type = 'consultation_deep' and v_price is null then
          v_warn := array_append(v_warn, 'Sessione approfondita senza un prezzo leggibile: non creata'::text);
          continue;
        end if;
        -- Una breve senza prezzo nasce spenta: `td_services_bookable_complete`
        -- non ammette un servizio prenotabile senza importo, e il blocco alla
        -- pubblicazione lo dice («consulenza breve senza prezzo»).
        insert into td_services (td_id, service_type, is_active, price_cents, price_is_custom,
                                 duration_minutes, cal_event_type_slug, text_during_call, sort_order)
        values (v_id, v_type, v_price is not null, v_price, coalesce((v_s->>'price_is_custom')::boolean, false),
                v_dur, v_cslug, v_s->>'text_during_call', array_position(v_ordine, v_type::text))
        returning * into v_sv;
        v_n := v_n + 1;
        if v_type = 'consultation' and v_price is null then
          v_warn := array_append(v_warn, 'Consulenza breve creata spenta: il prezzo manca o non si legge'::text);
        end if;
      else
        -- Il listino: si scrive dov'è vuoto, altrimenti si segnala.
        if v_price is not null and v_sv.price_cents is distinct from v_price then
          if v_sv.price_cents is null then
            update td_services set price_cents = v_price where id = v_sv.id;
            v_n := v_n + 1;
          else
            v_warn := v_warn || format('%s: prezzo nel database %s centesimi, nel pacchetto %s. Non sovrascritto: '
                                       || 'tocca prenotazioni vere, lo cambia il team a mano',
                                       v_type, v_sv.price_cents, v_price);
          end if;
        end if;
        if v_dur is not null and v_sv.duration_minutes is distinct from v_dur then
          if v_sv.duration_minutes is null then
            update td_services set duration_minutes = v_dur where id = v_sv.id;
            v_n := v_n + 1;
          else
            v_warn := v_warn || format('%s: durata nel database %s minuti, nel pacchetto %s. Non sovrascritta',
                                       v_type, v_sv.duration_minutes, v_dur);
          end if;
        end if;
        if v_cslug is not null and v_sv.cal_event_type_slug is distinct from v_cslug then
          if v_sv.cal_event_type_slug is null then
            update td_services set cal_event_type_slug = v_cslug where id = v_sv.id;
            v_n := v_n + 1;
          else
            v_warn := v_warn || format('%s: event type Cal.com nel database «%s», atteso «%s». Non sovrascritto',
                                       v_type, v_sv.cal_event_type_slug, v_cslug);
          end if;
        end if;

        update td_services
           set text_during_call = v_s->>'text_during_call',
               price_is_custom  = coalesce((v_s->>'price_is_custom')::boolean, false)
         where id = v_sv.id
           and (text_during_call, price_is_custom)
               is distinct from (v_s->>'text_during_call', coalesce((v_s->>'price_is_custom')::boolean, false));
        get diagnostics v_rc = row_count;
        v_n := v_n + v_rc;

        select * into v_sv from td_services where id = v_sv.id;
        if v_type = 'consultation_deep' then
          -- L'approfondita la offre o la toglie il designer. Si accende solo se
          -- è completa: il vincolo della 0038 non ammette il contrario.
          v_attiva := v_attiva and v_sv.price_cents is not null and v_sv.duration_minutes is not null
                      and v_sv.cal_event_type_slug is not null;
          update td_services set is_active = v_attiva where id = v_sv.id and is_active is distinct from v_attiva;
          get diagnostics v_rc = row_count;
          v_n := v_n + v_rc;
        elsif not v_sv.is_active then
          -- La breve spenta resta spenta: può averla spenta il team.
          v_warn := array_append(v_warn, 'La consulenza breve è spenta nel database: l''importatore non la riaccende, si accende da Studio'::text);
        end if;
      end if;

      -- I punti del box.
      if coalesce((select jsonb_agg(text_it order by position) from td_service_bullets where service_id = v_sv.id), '[]'::jsonb)
         is distinct from coalesce(v_s->'bullets', '[]'::jsonb) then
        delete from td_service_bullets where service_id = v_sv.id;
        insert into td_service_bullets (service_id, position, text_it)
        select v_sv.id, o, x from jsonb_array_elements_text(coalesce(v_s->'bullets', '[]'::jsonb)) with ordinality t(x, o);
        v_n := v_n + 1;
      end if;
    else
      -- I quattro servizi dopo la call: attivi se il designer li ha scelti. Il
      -- prezzo «da» è vetrina (D5), non un listino: segue il pacchetto.
      if not v_found then
        if v_attiva then
          insert into td_services (td_id, service_type, is_active, price_from_cents, sort_order)
          values (v_id, v_type, true, (v_s->>'price_from_cents')::int, array_position(v_ordine, v_type::text));
          v_n := v_n + 1;
        end if;
      else
        update td_services
           set is_active = v_attiva, price_from_cents = (v_s->>'price_from_cents')::int
         where id = v_sv.id
           and (is_active, price_from_cents) is distinct from (v_attiva, (v_s->>'price_from_cents')::int);
        get diagnostics v_rc = row_count;
        v_n := v_n + v_rc;
      end if;
    end if;
  end loop;

  -- =========================================================================
  -- E. I viaggi firma
  -- =========================================================================
  -- Stessa riconciliazione per titolo delle voci; le foto stanno nella loro
  -- tabella della 0025.

  v_ids := '{}';
  for v_item in select x from jsonb_array_elements(coalesce(p->'signature_trips', '[]'::jsonb)) x loop
    select id into v_trip from td_signature_trips
     where td_id = v_id and btrim(title) = btrim(v_item->>'title') and id <> all (array_remove(v_ids, null))
     order by position limit 1;
    v_ids := array_append(v_ids, v_trip);
  end loop;
  delete from td_signature_trips where td_id = v_id and id <> all (array_remove(v_ids, null));
  get diagnostics v_rc = row_count;
  v_n := v_n + v_rc;
  if exists (select 1 from unnest(v_ids) with ordinality u(id, o) join td_signature_trips t on t.id = u.id
              where t.position <> u.o) then
    update td_signature_trips set position = position + 10000 where td_id = v_id;
  end if;
  v_i := 0;
  for v_item in select x from jsonb_array_elements(coalesce(p->'signature_trips', '[]'::jsonb)) x loop
    v_i := v_i + 1;
    v_trip := v_ids[v_i];
    if v_trip is null then
      insert into td_signature_trips (td_id, position, title, description, country_code)
      values (v_id, v_i, v_item->>'title', v_item->>'description', v_item->>'country_code')
      returning id into v_trip;
      v_n := v_n + 1;
    else
      update td_signature_trips
         set position = v_i, description = v_item->>'description', country_code = v_item->>'country_code'
       where id = v_trip
         and (position, description, country_code)
             is distinct from (v_i::smallint, v_item->>'description', v_item->>'country_code');
      get diagnostics v_rc = row_count;
      v_n := v_n + v_rc;
    end if;
    if coalesce((select jsonb_agg(storage_path order by position) from td_signature_trip_images where trip_id = v_trip), '[]'::jsonb)
       is distinct from coalesce(v_item->'images', '[]'::jsonb) then
      delete from td_signature_trip_images where trip_id = v_trip;
      insert into td_signature_trip_images (trip_id, position, storage_path)
      select v_trip, o, x from jsonb_array_elements_text(coalesce(v_item->'images', '[]'::jsonb)) with ordinality t(x, o);
      v_n := v_n + 1;
    end if;
  end loop;

  -- =========================================================================
  -- F. Itinerari pronti e viaggi di gruppo
  -- =========================================================================

  v_it := td_import_voci(v_id, 'itinerary', p->'itineraries');
  v_gr := td_import_voci(v_id, 'group', p->'group_trips');
  v_n := v_n + (v_it->>'modifiche')::int + (v_gr->>'modifiche')::int;

  -- =========================================================================
  -- G. Le recensioni dichiarate
  -- =========================================================================
  -- Non hanno una chiave naturale: si confronta l'insieme intero e, se è
  -- diverso, si riscrive. All'import nascono pubblicate: sono parte della
  -- vetrina che il designer ha consegnato (D3). `is_published` resta fuori dal
  -- confronto, così una recensione spenta da Studio non torna accesa a ogni
  -- reimport — torna accesa solo se il designer cambia le sue recensioni.

  if coalesce((select jsonb_agg(jsonb_build_object('title', title, 'author_name', author_name, 'stars', stars,
                                                   'date_label', date_label, 'body', body,
                                                   'author_years', author_years) order by position)
                 from td_showcase_reviews where td_id = v_id), '[]'::jsonb)
     is distinct from
     coalesce((select jsonb_agg(jsonb_build_object('title', x->>'title', 'author_name', x->>'author_name',
                                                   'stars', (x->>'stars')::int, 'date_label', x->>'date_label',
                                                   'body', x->>'body', 'author_years', (x->>'author_years')::int)
                                order by o)
                 from jsonb_array_elements(coalesce(p->'reviews', '[]'::jsonb)) with ordinality t(x, o)), '[]'::jsonb) then
    delete from td_showcase_reviews where td_id = v_id;
    insert into td_showcase_reviews (td_id, position, title, author_name, stars, date_label, body, author_years,
                                     is_published)
    select v_id, o, x->>'title', x->>'author_name', (x->>'stars')::smallint, x->>'date_label', x->>'body',
           (x->>'author_years')::smallint, true
      from jsonb_array_elements(coalesce(p->'reviews', '[]'::jsonb)) with ordinality t(x, o);
    v_n := v_n + 1;
  end if;

  return jsonb_build_object(
    'esito',      'ok',
    'td_slug',    v_slug,
    'td_id',      v_id,
    'nuovo',      v_nuovo,
    'modifiche',  v_n,
    'errori',     '[]'::jsonb,
    'avvisi',     to_jsonb(v_warn),
    'itinerari',  v_it->'voci',
    'gruppi',     v_gr->'voci',
    'stato',      (select status from travel_designers where id = v_id),
    'blocchi_pubblicazione', to_jsonb(td_publish_blockers(v_id)));
end $$;

-- ---------------------------------------------------------------------------
-- 6. La porta: prova a secco o scrittura, e l'archivio
-- ---------------------------------------------------------------------------

create or replace function td_import_showcase(p_payload jsonb, p_scrivi boolean default false)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_rep  jsonb;
  v_errs jsonb := coalesce(p_payload->'errors', '[]'::jsonb);
begin
  if jsonb_array_length(v_errs) > 0 then
    -- Errori già trovati dallo script (formato vecchio, nome mancante…): niente
    -- da provare.
    v_rep := jsonb_build_object('esito', 'rifiutato', 'td_slug', p_payload->'td'->>'slug', 'modifiche', 0,
                                'errori', v_errs, 'avvisi', coalesce(p_payload->'warnings', '[]'::jsonb));
  else
    begin
      v_rep := td_import_apply(p_payload);
      if v_rep->>'esito' = 'rifiutato' then
        raise exception using errcode = 'XPR01', message = 'import rifiutato';
      end if;
      if not p_scrivi then
        -- La prova a secco: tutto quello che il blocco ha scritto torna
        -- indietro, il report resta.
        raise exception using errcode = 'XPD01', message = 'prova a secco';
      end if;
    exception
      when sqlstate 'XPD01' then null;
      when sqlstate 'XPR01' then null;
      when others then
        -- Un vincolo dello schema che il pacchetto non rispetta (una copertura
        -- legale con parole diverse dal form, una durata tipica sconosciuta):
        -- l'import fallisce in modo visibile invece di scrivere a metà.
        v_rep := jsonb_build_object(
          'esito', 'rifiutato', 'td_slug', p_payload->'td'->>'slug', 'modifiche', 0,
          'errori', jsonb_build_array('Il database ha rifiutato il pacchetto: ' || sqlerrm),
          'avvisi', coalesce(p_payload->'warnings', '[]'::jsonb));
    end;
  end if;

  v_rep := v_rep || jsonb_build_object('scritto', p_scrivi and v_rep->>'esito' = 'ok');

  if p_scrivi then
    insert into td_import_runs (td_slug, td_id, source, format, raw, report, outcome)
    values (coalesce(p_payload->'td'->>'slug', '?'),
            (select id from travel_designers where slug = p_payload->'td'->>'slug'),
            p_payload->>'source', p_payload->>'format', coalesce(p_payload->'raw', '{}'::jsonb), v_rep,
            case when v_rep->>'esito' = 'ok' then 'scritto' else 'rifiutato' end);
  end if;

  return v_rep;
end $$;

comment on function td_import_showcase(jsonb, boolean) is
  'Importa la vetrina v6 di un designer, tutto o niente. p_scrivi = false: '
  'prova a secco (stesse scritture, poi annullate; resta il report). Solo '
  'service_role: la chiama supabase/scripts/importa_vetrina.mjs (0055).';

-- Chiuse a tutti tranne la chiave secret.
revoke all on function td_import_showcase(jsonb, boolean)  from public, anon, authenticated;
revoke all on function td_import_apply(jsonb)               from public, anon, authenticated;
revoke all on function td_import_voci(uuid, text, jsonb)    from public, anon, authenticated;
revoke all on function td_import_figli(text, uuid, jsonb)   from public, anon, authenticated;
revoke all on function td_import_desired_tags(jsonb)        from public, anon, authenticated;
revoke all on function td_import_desired_axes(jsonb)        from public, anon, authenticated;
grant execute on function td_import_showcase(jsonb, boolean) to service_role;
