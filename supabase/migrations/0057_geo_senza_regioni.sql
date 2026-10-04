-- XPETIS · 0057 · La tassonomia senza regioni
--
-- **Decisione di Simone, 4 ottobre 2026**: «Andrea mi ha passato un file
-- sbagliato. Ci sono regioni: vanno buttate. Non ci devono essere
-- assolutamente regioni.» Da oggi la gerarchia è continente → macro-area →
-- paese → città, e basta.
--
-- Le regioni erano di due tipi (0029):
--   · `foreign_region`, 234 righe che esistevano solo per raggruppare le città
--     nel suggeritore. Su un paese piccolo erano l'eco del paese stesso:
--     scrivendo «barbados» si trovava Barbados due volte, paese e «regione»;
--   · `italian_region`, le 20 regioni italiane, che la tassonomia dichiarava
--     selezionabili e che noi non filtravamo (deviazione 7). Con questa
--     migration **la deviazione 7 è superata**: non c'è più niente da non
--     filtrare. Cercando «Toscana» non si trova più niente; si trova l'Italia, e
--     le sue città portano all'Italia.
--
-- ## Cosa cambia nelle tabelle
--
-- Le città pendevano da una regione (`geo_cities.region_id`, obbligatorio e in
-- cascata, 0029). Ora pendono dal paese, che avevano già (`country_code`).
-- L'unicità diventa (paese, slug). Nessuna città del file sta in due regioni
-- dello stesso paese (controllato), ma su un database dove il seed vecchio non
-- è mai stato potato potrebbero esserci doppioni: si tolgono prima di creare
-- l'indice, tenendo la riga più vecchia. Nessuna chiave esterna punta a
-- `geo_cities` (verificato il 27 settembre 2026), quindi non trascinano niente.
--
-- `geo_regions` si cancella: nessuna tabella la referenzia tranne le città, e
-- nessuna funzione la legge (il match ragiona su paesi e macro-aree, 0030).
--
-- Dopo questa migration il seed `0002_geo.sql`, rigenerato da
-- `xpetis_destinazioni_v2.json` senza regioni, non le cerca più.

set search_path = public, extensions;

drop view if exists geo_search;

-- Le città: dal legame con la regione a quello col paese.
alter table geo_cities drop constraint if exists geo_cities_region_id_fkey;
drop index if exists geo_cities_region_slug;

delete from geo_cities a
 using geo_cities b
 where a.country_code = b.country_code and a.slug = b.slug and a.id > b.id;

alter table geo_cities drop column region_id;
create unique index geo_cities_country_slug on geo_cities (country_code, slug);

comment on table geo_cities is
  'Le città vivono solo nel suggeritore: selezionandone una si arriva al suo '
  'paese. Dal 4 ottobre 2026 (0057) pendono direttamente dal paese: le regioni '
  'non esistono più. Uniche per (paese, slug).';

drop table geo_regions;

-- Il suggeritore: la vista della 0035 senza il ramo delle regioni. Una città
-- risale al suo paese (`parent_ref`), non più a una regione.
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
  '0057 niente regioni). Si cerca su `name_norm` e si mostra `name_it`. Solo '
  'paesi e macro-aree filtrano (`is_filterable`). `country_code` dice a quale '
  'paese porta una voce, `parent_ref` permette di scendere: continente → '
  'macro-aree → paesi, e la città risale al suo paese.';

grant select on geo_search to anon, authenticated;
