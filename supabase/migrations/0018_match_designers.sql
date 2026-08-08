-- XPETIS · 0018 · Il match si calcola solo lato server
--
-- Correzione di un difetto della 0015: `public_td_profiles` consegnava ad `anon`
-- i livelli dei paesi e i valori dei sei assi, che il Flusso dichiara invisibili
-- al viaggiatore. Chiunque aprisse gli strumenti di sviluppo li leggeva.
--
-- Al suo posto una funzione in SECURITY DEFINER: è l'unica porta verso quei
-- dati. Restituisce posizione, banda, sezione, badge e gli *ingredienti* della
-- frase — mai un punteggio, mai un livello, mai un valore di asse.

drop view if exists public_td_profiles;

-- La vetrina ha bisogno dei paesi coperti (senza distinzione di livello: "la
-- copertura è una sola agli occhi del viaggiatore") e dei servizi attivi.
drop view if exists public_td_showcase;
create view public_td_showcase as
  select
    td.id,
    td.slug,
    td.display_name,
    td.headline,
    td.bio,
    td.photo_url,
    td.background_photo_url,
    td.languages,
    coalesce(c.countries, '[]'::jsonb) as countries,
    coalesce(s.services,  '[]'::jsonb) as services
  from travel_designers td
  left join lateral (
    select jsonb_agg(k.name_it order by k.name_it) as countries
      from td_countries tc
      join geo_countries k on k.code = tc.country_code
     where tc.td_id = td.id
  ) c on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'service_type', sv.service_type,
             'price_cents', sv.price_cents,
             'duration_minutes', sv.duration_minutes,
             'text_during_call', sv.text_during_call,
             'text_after_call', sv.text_after_call
           ) order by sv.sort_order) as services
      from td_services sv where sv.td_id = td.id and sv.is_active
  ) s on true
  where td.status = 'published';

-- Spostato il match lato server, il browser non ha più bisogno né dei pesi degli
-- assi né dei parametri di matching: si smette di esporli.
drop view if exists public_quiz_axes;
create view public_quiz_axes as
  select a.code, a.kind, a.label_it, a.question_it, a.scale_min, a.scale_max,
         a.sort_order,
         coalesce((select jsonb_object_agg(o.value, o.label_it)
                     from quiz_axis_options o where o.axis_code = a.code), '{}'::jsonb) as options
    from quiz_axes a;

drop view if exists public_config;
create view public_config as
  select key, value, config_group, label_it
    from app_config
   where config_group = 'booking_rules';

-- ---------------------------------------------------------------- il match
--
-- Input: destinazione già normalizzata a un paese (opzionale), risposte al quiz
-- (opzionale, ma se c'è è completa), filtri tema e contesto (opzionali).
--
-- Nota sulla frase: la funzione restituisce i *codici* dei due assi più
-- salienti, non i valori. Il verso del frammento ("come te, ama i ritmi lenti")
-- si ricava dalla risposta del viaggiatore, che lui già conosce: la salienza
-- pesa l'affinità, quindi un asse saliente è per costruzione un asse dove i due
-- stanno dalla stessa parte. Così la frase si compone senza far uscire niente.

create or replace function match_designers(
  p_country_code text default null,
  p_quiz          jsonb default null,   -- { axis_code: valore }
  p_themes        text[] default '{}',
  p_contexts      text[] default '{}',
  p_limit         int default 20,
  p_offset        int default 0
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
language sql
stable
security definer
set search_path = public
as $$
with cfg as (
  select
    coalesce(max(value) filter (where key = 'affinity_quiz_weight'),    0.5) as w_quiz,
    coalesce(max(value) filter (where key = 'affinity_filters_weight'), 0.5) as w_filters,
    coalesce(max(value) filter (where key = 'filters_theme_weight'),    0.6) as w_theme,
    coalesce(max(value) filter (where key = 'filters_context_weight'),  0.4) as w_context,
    coalesce(max(value) filter (where key = 'strong_match_threshold'),  0.8) as badge_min
    from app_config
),
target as (
  select k.code, k.macro_area_code, m.continent_code
    from geo_countries k
    join geo_macro_areas m on m.code = k.macro_area_code
   where k.code = p_country_code
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
      when p_country_code is null then 0::smallint
      when exists (select 1 from td_countries c
                    where c.td_id = t.id and c.country_code = p_country_code) then 3::smallint
      when exists (select 1 from td_countries c
                     join geo_countries k on k.code = c.country_code
                    where c.td_id = t.id
                      and k.macro_area_code = (select macro_area_code from target)) then 2::smallint
      when exists (select 1 from td_countries c
                     join geo_countries k on k.code = c.country_code
                     join geo_macro_areas m on m.code = k.macro_area_code
                    where c.td_id = t.id
                      and m.continent_code = (select continent_code from target)) then 1::smallint
      else 0::smallint
    end as band,
    -- 9 quando la destinazione non è coperta o non è stata indicata: tiene il
    -- livello fuori dall'ordinamento senza casi particolari.
    coalesce((select c.level from td_countries c
               where c.td_id = t.id and c.country_code = p_country_code), 9) as country_level
    from td t
),
-- Passo 2. Punteggio per asse, e salienza dell'asse per la frase.
-- salienza = peso × punteggio × estremità della posizione del viaggiatore.
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
  select td_id,
         case when p_quiz is null then null
              else sum(weight * score) / nullif(sum(weight), 0) end as quiz_score,
         (array_agg(axis_code order by weight * score * extremity desc, axis_code)
            filter (where score > 0 and p_quiz is not null)
         )[1:2] as salient_axes
    from axis_scores
   group by td_id
),
-- Passo 3. Punteggio filtri. Non escludono nessuno: producono una frazione.
-- Con la destinazione contano i tag di quel paese; senza, quelli su tutte le
-- destinazioni del TD.
filters as (
  select
    t.id as td_id,
    case when cardinality(p_themes) = 0 then null else (
      select count(*)::numeric / cardinality(p_themes)
        from unnest(p_themes) x
       where exists (select 1 from td_destination_tags g
                      where g.td_id = t.id and g.tag_code = x
                        and (p_country_code is null or g.country_code = p_country_code))
    ) end as theme_frac,
    case when cardinality(p_contexts) = 0 then null else (
      select count(*)::numeric / cardinality(p_contexts)
        from unnest(p_contexts) x
       where exists (select 1 from td_destination_tags g
                      where g.td_id = t.id and g.tag_code = x
                        and (p_country_code is null or g.country_code = p_country_code))
    ) end as context_frac,
    (select coalesce(array_agg(x order by x), '{}')
       from unnest(p_themes) x
      where exists (select 1 from td_destination_tags g
                     where g.td_id = t.id and g.tag_code = x
                       and (p_country_code is null or g.country_code = p_country_code))
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
    -- Passo 4. Affinità: media pesata di quiz e filtri, normalizzata sui soli
    -- pesi applicabili, così un quiz assente non schiaccia tutti verso lo zero.
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
    -- Con destinazione il badge chiede anche che il paese cercato sia livello 1.
    (coalesce(s.affinity, 0) >= s.badge_min
     and (p_country_code is null or s.country_level = 1)) as has_strong_badge
    from scored s
),
ordered as (
  select b.*,
    -- Passo 5. La chiave di ordinamento del Flusso:
    -- con destinazione   (banda, livello, affinità, spareggio)
    -- senza destinazione (affinità, spareggio)
    row_number() over (
      order by
        case when p_country_code is null then 0 else b.band end desc,
        case when p_country_code is null then 0 else b.country_level end asc,
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
    when p_country_code is not null then
      case o.band when 3 then 'esperti_paese'
                  when 2 then 'macro_area'
                  when 1 then 'continente'
                  else 'fallback' end
    else
      -- Senza destinazione: fascia unica, match forti in cima, il resto sotto,
      -- e in coda il fallback. INTERPRETAZIONE: è fallback chi non aggancia
      -- niente (affinità nulla o zero). Da confermare con Chiara e Gaia.
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
$$;

comment on function match_designers(text, jsonb, text[], text[], int, int) is
  'Unica porta verso i dati chiusi dei profili TD. Restituisce ordine, banda, '
  'sezione, badge e ingredienti della frase: mai punteggi, livelli o valori di asse.';

revoke all on function match_designers(text, jsonb, text[], text[], int, int) from public;
grant execute on function match_designers(text, jsonb, text[], text[], int, int)
  to anon, authenticated;

grant select on public_td_showcase, public_quiz_axes, public_config to anon, authenticated;
