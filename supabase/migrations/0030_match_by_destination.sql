-- XPETIS · 0030 · La destinazione non è sempre uno stato
--
-- Regola di ricerca decisa l'8 agosto 2026:
--
--   città        → suggerisce il suo paese, NON filtra
--   paese        → filtra
--   macro-area   → filtra, e suggerisce la lista dei suoi paesi
--   continente   → suggerisce le sue macro-aree, NON filtra
--
-- `match_designers` accettava un solo paese. Ora accetta una destinazione
-- descritta da livello + identificatore, e **rifiuta i livelli che non
-- filtrano**: passare una città o un continente non è un caso da gestire in
-- silenzio, è un errore di chi chiama.
--
-- Con una macro-area la banda 2 non esiste più: "un altro paese della stessa
-- macro-area" è già dentro la banda 3, perché è quello che l'utente ha chiesto.
-- Restano tre bande: la macro-area cercata, il resto del continente, il nulla.

drop function if exists match_designers(text, jsonb, text[], text[], int, int);

create function match_designers(
  p_destination_level text   default null,   -- 'country' | 'macro_area' | null
  p_destination_ref   text   default null,
  p_quiz              jsonb  default null,   -- { axis_code: valore }
  p_themes            text[] default '{}',
  p_contexts          text[] default '{}',
  p_limit             int    default 20,
  p_offset            int    default 0
)
returns table (
  rank_position     bigint,
  td_id             uuid,
  slug              text,
  display_name      text,
  headline          text,
  photo_url         text,
  background_photo_url text,
  band              smallint,
  section           text,
  has_strong_badge  boolean,
  covered_countries text[],
  salient_axes      text[],
  matched_themes    text[],
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
-- Le colonne di RETURNS TABLE (slug, band, section...) sono anche variabili
-- plpgsql: senza questa direttiva ogni riferimento a una colonna omonima è
-- ambiguo e la funzione non compila.
#variable_conflict use_column
declare
  v_country   text;
  v_macro     text;
  v_continent text;
begin
  if p_destination_level is not null then
    if p_destination_level not in ('country', 'macro_area') then
      raise exception
        'Destinazione non filtrabile: %. Si filtra per paese o macro-area; città e continenti vivono solo nel suggeritore.',
        p_destination_level;
    end if;
    if p_destination_ref is null then
      raise exception 'Destinazione di livello % senza identificatore', p_destination_level;
    end if;

    if p_destination_level = 'country' then
      select k.code, k.macro_area_code, m.continent_code
        into v_country, v_macro, v_continent
        from geo_countries k
        join geo_macro_areas m on m.code = k.macro_area_code
       where k.code = p_destination_ref;
    else
      select null, m.code, m.continent_code
        into v_country, v_macro, v_continent
        from geo_macro_areas m
       where m.code = p_destination_ref;
    end if;

    if v_macro is null then
      raise exception 'Destinazione inesistente: % "%"', p_destination_level, p_destination_ref;
    end if;
  end if;

  return query
  with cfg as (
    select
      coalesce(max(value) filter (where key = 'affinity_quiz_weight'),    0.5) as w_quiz,
      coalesce(max(value) filter (where key = 'affinity_filters_weight'), 0.5) as w_filters,
      coalesce(max(value) filter (where key = 'filters_theme_weight'),    0.6) as w_theme,
      coalesce(max(value) filter (where key = 'filters_context_weight'),  0.4) as w_context,
      coalesce(max(value) filter (where key = 'strong_match_threshold'),  0.8) as badge_min
      from app_config
  ),
  td as (
    select id, slug, display_name, headline, photo_url, background_photo_url,
           joined_at, tiebreak_score
      from travel_designers
     where status = 'published'
  ),
  -- Passo 1. La banda geografica. Nessun punteggio fa scavalcare una banda, e
  -- nessun TD è mai escluso.
  bands as (
    select t.id as td_id,
      case
        when p_destination_level is null then 0::smallint
        when v_country is not null then
          case
            when exists (select 1 from td_countries c
                          where c.td_id = t.id and c.country_code = v_country) then 3::smallint
            when exists (select 1 from td_countries c
                           join geo_countries k on k.code = c.country_code
                          where c.td_id = t.id and k.macro_area_code = v_macro) then 2::smallint
            when exists (select 1 from td_countries c
                           join geo_countries k on k.code = c.country_code
                           join geo_macro_areas m on m.code = k.macro_area_code
                          where c.td_id = t.id and m.continent_code = v_continent) then 1::smallint
            else 0::smallint
          end
        else
          -- Macro-area: chi la copre è "esperto", e la vecchia banda 2 collassa
          -- nella 3 perché è esattamente ciò che l'utente ha chiesto.
          case
            when exists (select 1 from td_countries c
                           join geo_countries k on k.code = c.country_code
                          where c.td_id = t.id and k.macro_area_code = v_macro) then 3::smallint
            when exists (select 1 from td_countries c
                           join geo_countries k on k.code = c.country_code
                           join geo_macro_areas m on m.code = k.macro_area_code
                          where c.td_id = t.id and m.continent_code = v_continent) then 1::smallint
            else 0::smallint
          end
      end as band,
      -- 9 quando la destinazione non è coperta o non è stata indicata. Con una
      -- macro-area vale il livello migliore fra i paesi coperti là dentro.
      case
        when v_country is not null then
          coalesce((select c.level from td_countries c
                     where c.td_id = t.id and c.country_code = v_country), 9)
        when v_macro is not null then
          coalesce((select min(c.level) from td_countries c
                      join geo_countries k on k.code = c.country_code
                     where c.td_id = t.id and k.macro_area_code = v_macro), 9)
        else 9
      end as country_level
      from td t
  ),
  -- Passo 2. Punteggio per asse e salienza per la frase.
  axis_scores as (
    select
      t.id as td_id,
      a.code as axis_code,
      a.weight,
      case
        when p_quiz ->> a.code is null then 0::numeric
        when a.kind = 'categorical' then
          case when exists (select 1 from td_axis_values v
                             where v.td_id = t.id and v.axis_code = a.code
                               and v.value = (p_quiz ->> a.code)::int)
               then 1::numeric else 0::numeric end
        when (select min(v.value) from td_axis_values v
               where v.td_id = t.id and v.axis_code = a.code) is null then 0::numeric
        else (
          (a.scale_max - a.scale_min)
          - abs((select min(v.value) from td_axis_values v
                  where v.td_id = t.id and v.axis_code = a.code) - (p_quiz ->> a.code)::int)
        )::numeric / (a.scale_max - a.scale_min)
      end as score,
      case
        when p_quiz ->> a.code is null then 0::numeric
        when a.kind = 'categorical' then 1::numeric
        else abs((p_quiz ->> a.code)::numeric - (a.scale_min + a.scale_max)::numeric / 2)
             / ((a.scale_max - a.scale_min)::numeric / 2)
      end as extremity
      from td t
      cross join quiz_axes a
  ),
  quiz as (
    select axis_scores.td_id,
           case when p_quiz is null then null
                else sum(weight * score) / nullif(sum(weight), 0) end as quiz_score,
           (array_agg(axis_code order by weight * score * extremity desc, axis_code)
              filter (where score > 0 and p_quiz is not null)
           )[1:2] as salient_axes
      from axis_scores
     group by axis_scores.td_id
  ),
  -- Passo 3. Punteggio filtri. Non escludono nessuno: producono una frazione.
  -- I tag contano su quel paese, o su tutti i paesi della macro-area cercata,
  -- o su tutte le destinazioni del TD se non c'è destinazione.
  filters as (
    select
      t.id as td_id,
      case when cardinality(p_themes) = 0 then null else (
        select count(*)::numeric / cardinality(p_themes)
          from unnest(p_themes) x
         where exists (select 1 from td_destination_tags g
                        where g.td_id = t.id and g.tag_code = x
                          and case
                                when v_country is not null then g.country_code = v_country
                                when v_macro   is not null then exists (
                                  select 1 from geo_countries k2
                                   where k2.code = g.country_code and k2.macro_area_code = v_macro)
                                else true
                              end)
      ) end as theme_frac,
      case when cardinality(p_contexts) = 0 then null else (
        select count(*)::numeric / cardinality(p_contexts)
          from unnest(p_contexts) x
         where exists (select 1 from td_destination_tags g
                        where g.td_id = t.id and g.tag_code = x
                          and case
                                when v_country is not null then g.country_code = v_country
                                when v_macro   is not null then exists (
                                  select 1 from geo_countries k2
                                   where k2.code = g.country_code and k2.macro_area_code = v_macro)
                                else true
                              end)
      ) end as context_frac,
      (select coalesce(array_agg(x order by x), '{}')
         from unnest(p_themes) x
        where exists (select 1 from td_destination_tags g
                       where g.td_id = t.id and g.tag_code = x
                         and case
                               when v_country is not null then g.country_code = v_country
                               when v_macro   is not null then exists (
                                 select 1 from geo_countries k2
                                  where k2.code = g.country_code and k2.macro_area_code = v_macro)
                               else true
                             end)
      ) as matched_themes
      from td t
  ),
  scored as (
    select
      t.id, t.slug, t.display_name, t.headline, t.photo_url, t.background_photo_url,
      t.joined_at, t.tiebreak_score,
      b.band, b.country_level,
      q.salient_axes,
      f.matched_themes,
      -- Passo 4. Affinità: media pesata normalizzata sui soli pesi applicabili,
      -- così un quiz assente non schiaccia tutti verso lo zero.
      (
        coalesce(c.w_quiz * q.quiz_score, 0)
        + coalesce(c.w_filters * (
            ( coalesce(c.w_theme * f.theme_frac, 0) + coalesce(c.w_context * f.context_frac, 0) )
            / nullif( (case when f.theme_frac   is null then 0 else c.w_theme   end)
                    + (case when f.context_frac is null then 0 else c.w_context end), 0)
          ), 0)
      ) / nullif(
        (case when q.quiz_score is null then 0 else c.w_quiz end)
        + (case when f.theme_frac is null and f.context_frac is null then 0 else c.w_filters end), 0
      ) as affinity,
      c.badge_min
      from td t
      join bands   b on b.td_id = t.id
      join quiz    q on q.td_id = t.id
      join filters f on f.td_id = t.id
      cross join cfg c
  ),
  badged as (
    select s.*,
      -- Con una destinazione il badge chiede anche il livello 1: sul paese
      -- cercato, o su almeno un paese dentro la macro-area cercata.
      (coalesce(s.affinity, 0) >= s.badge_min
       and (p_destination_level is null or s.country_level = 1)) as has_strong_badge
      from scored s
  ),
  ordered as (
    select b.*,
      -- Passo 5. La chiave di ordinamento del Flusso:
      -- con destinazione   (banda, livello, affinità, spareggio)
      -- senza destinazione (affinità, spareggio)
      row_number() over (
        order by
          case when p_destination_level is null then 0 else b.band end desc,
          case when p_destination_level is null then 0 else b.country_level end asc,
          coalesce(b.affinity, 0) desc,
          b.tiebreak_score desc nulls last,
          b.joined_at asc,
          b.id asc
      ) as rank_position,
      count(*) over () as total_count
      from badged b
  )
  select
    o.rank_position,
    o.id,
    o.slug,
    o.display_name,
    o.headline,
    o.photo_url,
    o.background_photo_url,
    o.band,
    case
      when p_destination_level = 'country' then
        case o.band when 3 then 'esperti_paese'
                    when 2 then 'macro_area'
                    when 1 then 'continente'
                    else 'fallback' end
      when p_destination_level = 'macro_area' then
        case o.band when 3 then 'esperti_macro_area'
                    when 1 then 'continente'
                    else 'fallback' end
      else
        -- Senza destinazione: fascia unica, match forti in cima, il resto sotto,
        -- e in coda il fallback. INTERPRETAZIONE: è fallback chi non aggancia
        -- niente. Da confermare con Chiara e Gaia.
        case when o.has_strong_badge then 'match_forte'
             when coalesce(o.affinity, 0) > 0 then 'altri'
             else 'fallback' end
    end as section,
    o.has_strong_badge,
    coalesce((select array_agg(k.name_it order by k.name_it)
                from td_countries tc join geo_countries k on k.code = tc.country_code
               where tc.td_id = o.id), '{}') as covered_countries,
    coalesce(o.salient_axes, '{}') as salient_axes,
    coalesce(o.matched_themes, '{}') as matched_themes,
    o.total_count
    from ordered o
   order by o.rank_position
   limit greatest(p_limit, 0) offset greatest(p_offset, 0);
end $$;

comment on function match_designers(text, text, jsonb, text[], text[], int, int) is
  'Unica porta verso i dati chiusi dei profili TD. La destinazione è livello + '
  'identificatore e può essere solo "country" o "macro_area": città e continenti '
  'non filtrano. Restituisce ordine, banda, sezione, badge e ingredienti della '
  'frase: mai punteggi, livelli o valori di asse.';

revoke all on function match_designers(text, text, jsonb, text[], text[], int, int) from public;
grant execute on function match_designers(text, text, jsonb, text[], text[], int, int)
  to anon, authenticated;

-- Il suggeritore deve poter navigare: continente → macro-aree → paesi, e
-- risalire da una città al suo paese. `parent_ref` è quel filo.
drop view if exists geo_search;

create view geo_search as
  select 'continent'::text as level, t.code as ref, t.name_it, '{}'::text[] as aliases,
         null::text as country_code, t.is_selectable, null::text as parent_ref
    from geo_continents t
  union all
  select 'macro_area', m.code, m.name_it, '{}'::text[], null, m.is_selectable, m.continent_code
    from geo_macro_areas m
  union all
  select 'country', k.code, k.name_it, k.aliases, k.code, k.is_selectable, k.macro_area_code
    from geo_countries k where k.is_searchable
  union all
  select 'region', r.id::text, r.name_it, r.aliases, r.country_code, r.is_selectable, r.country_code
    from geo_regions r
  union all
  select 'city', c.id::text, c.name_it, c.aliases, c.country_code, c.is_selectable, c.region_id::text
    from geo_cities c;

comment on view geo_search is
  'Sorgente unica del suggeritore. `is_selectable` dice se quella voce filtra '
  '(solo paesi e macro-aree), `country_code` a quale paese porta, `parent_ref` '
  'permette di scendere: continente → macro-aree → paesi.';

grant select on geo_search to anon, authenticated;
