-- XPETIS · 0015 · Viste
-- Le viste con prefisso public_ sono l'unica superficie leggibile dal browser:
-- non hanno security_invoker, quindi bypassano volutamente la RLS delle tabelle
-- sottostanti esponendo solo le colonne che vogliamo pubbliche.

-- Il payload che l'algoritmo di matching carica in un colpo solo: un oggetto
-- per TD con paesi, livelli, assi e tag già aggregati.
create view public_td_profiles as
  select
    td.id,
    td.slug,
    td.display_name,
    td.headline,
    td.photo_url,
    td.background_photo_url,
    td.languages,
    td.joined_at,
    td.tiebreak_score,
    coalesce(c.countries, '[]'::jsonb) as countries,
    coalesce(a.axes,      '{}'::jsonb) as axes,
    coalesce(t.tags,      '{}'::jsonb) as destination_tags,
    coalesce(s.services,  '[]'::jsonb) as services
  from travel_designers td
  left join lateral (
    select jsonb_agg(jsonb_build_object('country_code', k.country_code, 'level', k.level)
                     order by k.level, k.country_code) as countries
      from td_countries k where k.td_id = td.id
  ) c on true
  left join lateral (
    select jsonb_object_agg(x.axis_code, x.values) as axes
      from (select axis_code, jsonb_agg(value order by value) as values
              from td_axis_values where td_id = td.id
             group by axis_code) x
  ) a on true
  left join lateral (
    select jsonb_object_agg(y.country_code, y.tags) as tags
      from (select country_code, jsonb_agg(tag_code order by tag_code) as tags
              from td_destination_tags where td_id = td.id
             group by country_code) y
  ) t on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'service_type', sv.service_type,
             'price_cents', sv.price_cents,
             'duration_minutes', sv.duration_minutes,
             'text_during_call', sv.text_during_call,
             'text_after_call', sv.text_after_call,
             'sort_order', sv.sort_order
           ) order by sv.sort_order) as services
      from td_services sv where sv.td_id = td.id and sv.is_active
  ) s on true
  where td.status = 'published';

-- Vetrina: bio e contenuti lunghi, separati dal payload di matching.
create view public_td_showcase as
  select id, slug, display_name, headline, bio, photo_url, background_photo_url,
         languages
    from travel_designers
   where status = 'published';

create view public_reviews as
  select r.id, r.td_id, r.kind, r.rating_overall, r.body, r.would_recommend,
         r.display_name, r.created_at
    from reviews r
    join travel_designers td on td.id = r.td_id and td.status = 'published'
   where r.is_published;

create view td_review_stats as
  select td_id,
         count(*)                              as reviews_count,
         round(avg(rating_overall)::numeric, 2) as avg_overall,
         round(avg(rating_a)::numeric, 2)       as avg_a,
         round(avg(rating_b)::numeric, 2)       as avg_b,
         count(*) filter (where would_recommend) as recommend_count
    from reviews
   where is_published
   group by td_id;

-- I parametri che il sito deve conoscere per calcolare il matching e mostrare
-- le regole. Solo i gruppi pubblici: niente parametri operativi interni.
create view public_config as
  select key, value, config_group, label_it
    from app_config
   where config_group in ('matching', 'booking_rules');

create view public_quiz_axes as
  select a.code, a.kind, a.label_it, a.question_it, a.weight, a.scale_min,
         a.scale_max, a.sort_order,
         coalesce((select jsonb_object_agg(o.value, o.label_it)
                     from quiz_axis_options o where o.axis_code = a.code), '{}'::jsonb) as options
    from quiz_axes a;

create view public_tags as
  select code, kind, label_it, sort_order from tags;

-- Checklist di pubblicazione di un TD: cosa manca prima di metterlo online.
create view td_publish_readiness as
  select td.id,
         td.slug,
         td.display_name,
         td.status,
         (td.photo_url is not null)  as has_photo,
         (td.bio is not null)        as has_bio,
         (td.cal_username is not null) as has_cal_account,
         (td.cal_webhook_ok_at is not null) as has_cal_webhook,
         exists (select 1 from td_countries k where k.td_id = td.id) as has_countries,
         (select count(*) from td_axis_values v where v.td_id = td.id) as axis_values_count,
         (select count(distinct axis_code) from td_axis_values v where v.td_id = td.id) as axes_declared,
         exists (select 1 from td_services s
                  where s.td_id = td.id and s.service_type = 'consultation' and s.is_active) as has_active_consultation,
         exists (select 1 from td_destination_tags g where g.td_id = td.id) as has_tags
    from travel_designers td;
