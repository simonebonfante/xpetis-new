-- XPETIS · 0035 · Ricerca geografica accento-insensibile
--
-- Scrivendo "peru" nel suggeritore non si trovava "Perù". In italiano non è un
-- caso di scuola: Perù, Panamá, Città del Vaticano, São Tomé, Curaçao, Åland.
-- E soprattutto **nessuno scrive gli accenti in un campo di ricerca**, quindi il
-- difetto colpisce la via normale, non quella strana.
--
-- Il rimedio è una colonna normalizzata per riga e la ricerca che va su quella.
-- Non un `unaccent()` nella query: quello impedirebbe l'uso dell'indice e
-- costringerebbe a leggere 1.220 città a ogni tasto premuto.
--
-- La colonna è **generata**, non riempita da un trigger: così non può divergere
-- dal nome. Correggere "Vietnam " in "Vietnam" aggiorna la colonna nello stesso
-- statement, senza che nessuno debba ricordarsene.
--
-- ## Le due trappole
--
-- La prima è `unaccent()`, che è **STABLE e non IMMUTABLE** — dipende dal
-- dizionario di default — e Postgres la rifiuta in una colonna generata. Serve la
-- forma a due argomenti col dizionario nominato: è `unaccent_immutable()`, creata
-- dalla 0033 per lo slug degli itinerari e riusata qui.
--
-- La seconda è il **search_path**. Su Supabase le estensioni stanno nello schema
-- `extensions` e le loro funzioni non sono sul path di default; su un Postgres
-- normale finiscono in `public`. `unaccent_immutable` dichiara
-- `search_path = public, extensions` e quindi funziona in entrambi, ma
-- `gin_trgm_ops` qui sotto è una classe di operatori e si risolve **al momento
-- della creazione dell'indice**: da qui il `set` in testa al file. L'harness su
-- PGlite non intercetta questo errore, perché là le estensioni stanno in
-- `public`: è già successo con pgcrypto.
set search_path = public, extensions;

alter table geo_continents
  add column name_norm text generated always as (lower(unaccent_immutable(name_it))) stored;
alter table geo_macro_areas
  add column name_norm text generated always as (lower(unaccent_immutable(name_it))) stored;
alter table geo_countries
  add column name_norm text generated always as (lower(unaccent_immutable(name_it))) stored;
alter table geo_regions
  add column name_norm text generated always as (lower(unaccent_immutable(name_it))) stored;
alter table geo_cities
  add column name_norm text generated always as (lower(unaccent_immutable(name_it))) stored;

comment on column geo_countries.name_norm is
  'Il nome senza accenti e in minuscolo: è la colonna su cui cerca il '
  'suggeritore. Generata, quindi non può divergere da name_it.';

-- Gli indici solo dove servono. `like '%peru%'` è indicizzabile con i trigrammi,
-- e le tabelle grosse sono queste tre: 129 stati, 244 regioni, 1.220 città. Sui
-- 6 continenti e sulle 14 macro-aree una scansione è più veloce dell'indice, e un
-- indice in meno è una cosa in meno che può divergere.
create index geo_countries_norm_trgm on geo_countries using gin (name_norm gin_trgm_ops);
create index geo_regions_norm_trgm   on geo_regions   using gin (name_norm gin_trgm_ops);
create index geo_cities_norm_trgm    on geo_cities    using gin (name_norm gin_trgm_ops);

-- --------------------------------------------------------------------------
-- Il suggeritore. La vista è quella della 0031 con `name_norm` in più: `name_it`
-- resta ed è quello che si mostra — si cerca sul normalizzato, si legge il nome
-- vero.
--
-- `drop view` porta via i privilegi: il `grant` in fondo non è una ripetizione.

drop view if exists geo_search;

create view geo_search as
  select 'continent'::text as level, t.code as ref, t.name_it, t.name_norm,
         '{}'::text[] as aliases, null::text as country_code,
         t.is_filterable, t.is_selectable, null::text as parent_ref
    from geo_continents t
  union all
  select 'macro_area', m.code, m.name_it, m.name_norm, '{}'::text[], null,
         m.is_filterable, m.is_selectable, m.continent_code
    from geo_macro_areas m
  union all
  select 'country', k.code, k.name_it, k.name_norm, k.aliases, k.code,
         k.is_filterable, k.is_selectable, k.macro_area_code
    from geo_countries k where k.is_searchable
  union all
  select 'region', r.id::text, r.name_it, r.name_norm, r.aliases, r.country_code,
         r.is_filterable, r.is_selectable, r.country_code
    from geo_regions r
  union all
  select 'city', c.id::text, c.name_it, c.name_norm, c.aliases, c.country_code,
         c.is_filterable, c.is_selectable, c.region_id::text
    from geo_cities c;

comment on view geo_search is
  'Sorgente unica del suggeritore. Si cerca su `name_norm` (senza accenti, '
  'minuscolo) e si mostra `name_it`. Il sito obbedisce a `is_filterable`: solo '
  'paesi e macro-aree filtrano. `is_selectable` conserva cosa dichiara la '
  'tassonomia. `country_code` dice a quale paese porta una voce, `parent_ref` '
  'permette di scendere: continente → macro-aree → paesi.';

grant select on geo_search to anon, authenticated;
