-- XPETIS · 0058 · La ricerca non guarda la punteggiatura
--
-- Simone, 4 ottobre 2026: scrivendo «sud est asiatico» nel suggeritore non si
-- trovava «Asia Orientale e Sud-Est Asiatico». La 0035 aveva tolto accenti e
-- maiuscole, ma il **trattino** restava nella colonna su cui si cerca: «sud-est»
-- e «sud est» erano due stringhe diverse. Lo stesso valeva per l'apostrofo
-- («Costa d'Avorio» contro «costa d avorio») e per qualunque altro segno.
--
-- Il rimedio: ogni carattere che non è una lettera o una cifra **diventa uno
-- spazio**, gli spazi doppi diventano uno, e le estremità si puliscono. Lo
-- stesso fa `normalizzaRicerca()` in `lib/geo.ts` sul testo scritto dal
-- viaggiatore, quindi «Sud-Est», «sud est» e «sud  –  est» cercano tutti
-- «sud est».
--
-- **La regola sta in una funzione sola** (`nome_cercabile`), usata da tutte e
-- quattro le colonne generate: prima la stessa espressione era ripetuta quattro
-- volte, ed è così che due metà di una regola cominciano a divergere. L'harness
-- confronta la funzione con `normalizzaRicerca()` lettera per lettera su tutti
-- i nomi della tassonomia.
--
-- Le colonne generate non si possono riscrivere: si tolgono e si rimettono. La
-- vista le legge, quindi cade prima e torna dopo, identica alla 0057.

set search_path = public, extensions;

create or replace function nome_cercabile(p_testo text)
  returns text
  language sql
  immutable
  strict
  parallel safe
  set search_path = public, extensions
as $$
  select btrim(regexp_replace(lower(unaccent_immutable(p_testo)), '[^a-z0-9]+', ' ', 'g'))
$$;

comment on function nome_cercabile(text) is
  'Il nome come lo cerca il suggeritore: senza accenti, minuscolo, ogni segno '
  '(trattino, apostrofo, virgola…) diventato uno spazio. Gemella di '
  'normalizzaRicerca() in lib/geo.ts: le due devono restare uguali (0058).';

drop view if exists geo_search;

alter table geo_continents  drop column name_norm;
alter table geo_macro_areas drop column name_norm;
alter table geo_countries   drop column name_norm;
alter table geo_cities      drop column name_norm;

alter table geo_continents  add column name_norm text generated always as (nome_cercabile(name_it)) stored;
alter table geo_macro_areas add column name_norm text generated always as (nome_cercabile(name_it)) stored;
alter table geo_countries   add column name_norm text generated always as (nome_cercabile(name_it)) stored;
alter table geo_cities      add column name_norm text generated always as (nome_cercabile(name_it)) stored;

comment on column geo_countries.name_norm is
  'Il nome come lo cerca il suggeritore (nome_cercabile, 0058). Generata, '
  'quindi non può divergere da name_it.';

-- Gli indici a trigrammi della 0035, caduti con le colonne.
create index geo_countries_norm_trgm on geo_countries using gin (name_norm gin_trgm_ops);
create index geo_cities_norm_trgm    on geo_cities    using gin (name_norm gin_trgm_ops);

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
  select 'city', c.id::text, c.name_it, c.name_norm, c.aliases, c.country_code,
         c.is_filterable, c.is_selectable, c.country_code
    from geo_cities c;

comment on view geo_search is
  'Sorgente unica del suggeritore: continenti, macro-aree, paesi e città (dalla '
  '0057 niente regioni). Si cerca su `name_norm` (nome_cercabile: senza accenti, '
  'minuscolo, senza punteggiatura, 0058) e si mostra `name_it`. Solo paesi e '
  'macro-aree filtrano (`is_filterable`).';

grant select on geo_search to anon, authenticated;
revoke all on function nome_cercabile(text) from public, anon, authenticated;
