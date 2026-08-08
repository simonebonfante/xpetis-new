-- XPETIS · 0029 · Le tabelle geografiche allineate alla tassonomia vera
--
-- Il file `xpetis_destinazioni.json` (6 continenti, 14 macro-aree, 129 stati,
-- 244 regioni, 1.220 città) ha una struttura che il mio schema provvisorio non
-- prevedeva su tre punti.
--
-- 1. **Non esistono codici ISO.** Ogni voce ha un `id` testuale ("armenia",
--    "corea_del_sud"). Quello diventa la chiave: inventare una tabella di
--    corrispondenza ISO per 129 stati sarebbe indovinare.
--
-- 2. **Non tutto è selezionabile.** La tassonomia dichiara che si possono
--    scegliere come destinazione le macro-aree, gli stati e le regioni
--    italiane; continenti, città e regioni estere esistono solo nel
--    suggeritore. È un'informazione di prodotto e va nel database, non nel
--    codice del sito.
--
-- 3. **Una città può stare in due regioni.** Jaipur è dentro "India del Nord" e
--    dentro "Rajasthan", ed è corretto così. L'unicità delle città va quindi
--    per regione, non per stato.

alter table geo_continents  add column is_selectable boolean not null default false;
alter table geo_macro_areas add column is_selectable boolean not null default true;
alter table geo_countries   add column is_selectable boolean not null default true;

comment on column geo_countries.code is
  'Identificatore della tassonomia interna ("corea_del_sud"), non un codice ISO: '
  'la tassonomia non ne contiene.';
comment on column geo_countries.iso3 is
  'Non popolato dalla tassonomia. Resta per quando servirà (bandiere, elenchi '
  'paese di Stripe): va riempito da una fonte esterna, non dedotto dal nome.';

comment on column geo_macro_areas.is_selectable is
  'La tassonomia dichiara selezionabili tutte e 14 le macro-aree: il viaggiatore '
  'può cercare "Sud America" e non un singolo stato.';

-- Le regioni: quelle italiane sono destinazioni vere, le estere servono solo a
-- raggruppare le città nel suggeritore.
alter table geo_regions
  add column slug          text,
  add column kind          text,
  add column is_selectable boolean not null default false;

alter table geo_regions add constraint geo_regions_kind_values
  check (kind is null or kind in ('italian_region', 'foreign_region'));

create unique index geo_regions_country_slug on geo_regions (country_code, slug);

comment on column geo_regions.kind is
  'italian_region: destinazione selezionabile (le 20 regioni italiane). '
  'foreign_region: esiste solo per raggruppare le città nel suggeritore.';

-- Le città stanno sempre dentro una regione, e la stessa città può comparire in
-- due regioni dello stesso stato.
alter table geo_cities
  add column slug          text,
  add column is_selectable boolean not null default false;

alter table geo_cities drop constraint if exists geo_cities_country_code_name_it_key;

alter table geo_cities alter column region_id set not null;
alter table geo_cities drop constraint geo_cities_region_id_fkey;
alter table geo_cities add  constraint geo_cities_region_id_fkey
  foreign key (region_id) references geo_regions(id) on delete cascade;

create unique index geo_cities_region_slug on geo_cities (region_id, slug);

comment on table geo_cities is
  'Le città vivono solo nel suggeritore: selezionandone una si arriva al suo '
  'stato. La stessa città può stare in due regioni (Jaipur è in India del Nord '
  'e in Rajasthan), quindi l''unicità è per regione.';

-- --------------------------------------------------------------------------
-- Il suggeritore. Una riga per ogni voce cercabile, con dentro due cose che il
-- sito deve sapere: se quella voce si può scegliere come destinazione, e a quale
-- stato porta se la si sceglie.

drop view if exists geo_search;

create view geo_search as
  select 'continent'::text as level, t.code as ref, t.name_it, '{}'::text[] as aliases,
         null::text as country_code, t.is_selectable
    from geo_continents t
  union all
  select 'macro_area', m.code, m.name_it, '{}'::text[], null, m.is_selectable
    from geo_macro_areas m
  union all
  select 'country', k.code, k.name_it, k.aliases, k.code, k.is_selectable
    from geo_countries k where k.is_searchable
  union all
  select 'region', r.id::text, r.name_it, r.aliases, r.country_code, r.is_selectable
    from geo_regions r
  union all
  select 'city', c.id::text, c.name_it, c.aliases, c.country_code, c.is_selectable
    from geo_cities c;

grant select on geo_search to anon, authenticated;
