-- XPETIS · 0002 · Tassonomia geografica
--
-- `gin_trgm_ops` è una classe di operatori di pg_trgm e si risolve dal
-- search_path: su Supabase l'estensione sta in `extensions`, altrove in
-- `public`. Nominarli entrambi copre i due casi (uno schema inesistente nel
-- search_path viene ignorato).
set search_path = public, extensions;
-- ATTENZIONE: struttura provvisoria, da riallineare al file ufficiale della
-- tassonomia interna (6 continenti, 14 macro-aree, 129 stati, 244 regioni,
-- 1.220 città). Le colonne name_*/aliases/sort_order sono il minimo comune:
-- se il file ha altri attributi, si aggiungono qui.

create table geo_continents (
  code       text primary key,
  name_it    text not null,
  sort_order int  not null default 0
);

create table geo_macro_areas (
  code           text primary key,
  continent_code text not null references geo_continents(code) on update cascade,
  name_it        text not null,
  sort_order     int  not null default 0
);
create index geo_macro_areas_continent_idx on geo_macro_areas (continent_code);

create table geo_countries (
  code            text primary key,            -- ISO 3166-1 alpha-2 dove esiste
  iso3            text,
  macro_area_code text not null references geo_macro_areas(code) on update cascade,
  name_it         text not null,
  name_en         text,
  aliases         text[] not null default '{}',  -- sinonimi per il suggeritore
  is_searchable   boolean not null default true,
  sort_order      int not null default 0
);
create index geo_countries_macro_idx on geo_countries (macro_area_code);
create index geo_countries_name_trgm on geo_countries using gin (name_it gin_trgm_ops);

create table geo_regions (
  id           bigint generated always as identity primary key,
  country_code text not null references geo_countries(code) on update cascade on delete cascade,
  name_it      text not null,
  aliases      text[] not null default '{}',
  unique (country_code, name_it)
);
create index geo_regions_name_trgm on geo_regions using gin (name_it gin_trgm_ops);

create table geo_cities (
  id           bigint generated always as identity primary key,
  country_code text not null references geo_countries(code) on update cascade on delete cascade,
  region_id    bigint references geo_regions(id) on delete set null,
  name_it      text not null,
  aliases      text[] not null default '{}',
  unique (country_code, name_it)
);
create index geo_cities_country_idx on geo_cities (country_code);
create index geo_cities_name_trgm on geo_cities using gin (name_it gin_trgm_ops);

-- Sorgente unica del suggeritore destinazioni. Ogni voce porta con sé il paese
-- a cui la ricerca va normalizzata; continenti e macro-aree hanno
-- country_code null perché vivono solo nel suggeritore (DECISIONE APERTA:
-- cosa fa il sito se l'utente li seleziona).
create view geo_search as
  select 'city'::text as level, c.id::text as ref, c.name_it, c.aliases, c.country_code
    from geo_cities c
  union all
  select 'region', r.id::text, r.name_it, r.aliases, r.country_code
    from geo_regions r
  union all
  select 'country', k.code, k.name_it, k.aliases, k.code
    from geo_countries k where k.is_searchable
  union all
  select 'macro_area', m.code, m.name_it, '{}'::text[], null
    from geo_macro_areas m
  union all
  select 'continent', t.code, t.name_it, '{}'::text[], null
    from geo_continents t;
