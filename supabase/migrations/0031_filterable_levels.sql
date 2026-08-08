-- XPETIS · 0031 · Cosa filtra davvero, oggi
--
-- La tassonomia dichiara selezionabili anche le 20 regioni italiane. La regola
-- di ricerca decisa l'8 agosto 2026 ne prevede quattro livelli e le regioni non
-- ci sono: **non si vuole un quinto filtro.** Come trattarle si deciderà.
--
-- Invece di riscrivere il dato della tassonomia (che perderebbe la sua
-- intenzione) teniamo due fatti distinti:
--
--   is_selectable → cosa dichiara la tassonomia
--   is_filterable → cosa filtra oggi in XPETIS
--
-- Il sito obbedisce a `is_filterable`. Oggi i due valori differiscono su venti
-- righe soltanto — le regioni italiane — e l'harness lo verifica: se un giorno
-- quella differenza cambia, se ne accorge qualcuno.

alter table geo_continents  add column is_filterable boolean not null default false;
alter table geo_macro_areas add column is_filterable boolean not null default true;
alter table geo_countries   add column is_filterable boolean not null default true;
alter table geo_regions     add column is_filterable boolean not null default false;
alter table geo_cities      add column is_filterable boolean not null default false;

comment on column geo_regions.is_selectable is
  'Cosa dichiara la tassonomia: le 20 regioni italiane sono selezionabili.';
comment on column geo_regions.is_filterable is
  'Cosa filtra oggi in XPETIS: niente regioni. Decisione dell''8 agosto 2026, '
  'da rivedere quando si deciderà come trattarle.';

drop view if exists geo_search;

create view geo_search as
  select 'continent'::text as level, t.code as ref, t.name_it, '{}'::text[] as aliases,
         null::text as country_code, t.is_filterable, t.is_selectable, null::text as parent_ref
    from geo_continents t
  union all
  select 'macro_area', m.code, m.name_it, '{}'::text[], null,
         m.is_filterable, m.is_selectable, m.continent_code
    from geo_macro_areas m
  union all
  select 'country', k.code, k.name_it, k.aliases, k.code,
         k.is_filterable, k.is_selectable, k.macro_area_code
    from geo_countries k where k.is_searchable
  union all
  select 'region', r.id::text, r.name_it, r.aliases, r.country_code,
         r.is_filterable, r.is_selectable, r.country_code
    from geo_regions r
  union all
  select 'city', c.id::text, c.name_it, c.aliases, c.country_code,
         c.is_filterable, c.is_selectable, c.region_id::text
    from geo_cities c;

comment on view geo_search is
  'Sorgente unica del suggeritore. Il sito obbedisce a `is_filterable`: solo '
  'paesi e macro-aree filtrano. `is_selectable` conserva cosa dichiara la '
  'tassonomia. `country_code` dice a quale paese porta una voce, `parent_ref` '
  'permette di scendere: continente → macro-aree → paesi.';

grant select on geo_search to anon, authenticated;
