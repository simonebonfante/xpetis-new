-- XPETIS · 0020 · Plausibilità, non solo completezza
--
-- `td_publish_readiness` controllava che un profilo fosse completo. Ma un
-- profilo può essere completo e non funzionare: se nessun paese è di livello 1
-- il designer non prenderà mai il badge "match forte" e finirà sotto a chiunque.
-- È il caso reale di un designer con 32 paesi tutti dichiarati "Base", che
-- passava il controllo e poi non compariva.
--
-- Da qui due cose: una funzione che dice cosa impedisce la pubblicazione, e un
-- trigger che la impedisce davvero.

create or replace function td_publish_blockers(p_td_id uuid)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(reason order by reason), '{}')
    from (
      select 'foto profilo mancante' as reason
        from travel_designers where id = p_td_id and photo_url is null
      union all
      select 'bio mancante'
        from travel_designers where id = p_td_id and (bio is null or length(btrim(bio)) < 40)
      union all
      select 'nessun paese dichiarato'
       where not exists (select 1 from td_countries where td_id = p_td_id)
      union all
      -- Il caso del profilo "tutto Base": completo e inutile.
      select 'nessun paese di livello 1: il designer non prenderebbe mai il badge'
       where exists (select 1 from td_countries where td_id = p_td_id)
         and not exists (select 1 from td_countries where td_id = p_td_id and level = 1)
      union all
      select 'assi del quiz incompleti: dichiarati ' || (
               select count(distinct axis_code)::text from td_axis_values where td_id = p_td_id
             ) || ' su ' || (select count(*)::text from quiz_axes)
       where (select count(distinct axis_code) from td_axis_values where td_id = p_td_id)
             < (select count(*) from quiz_axes)
      union all
      select 'nessuna consulenza attiva'
       where not exists (select 1 from td_services
                          where td_id = p_td_id and service_type = 'consultation' and is_active)
      union all
      select 'account Cal.com non collegato'
        from travel_designers where id = p_td_id and cal_username is null
    ) b;
$$;

-- Segnalazioni che non bloccano ma dicono al team dove il profilo perde punti.
create or replace function td_publish_warnings(p_td_id uuid)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(reason order by reason), '{}')
    from (
      select (select count(*)::text from td_countries tc
               where tc.td_id = p_td_id
                 and not exists (select 1 from td_destination_tags g
                                  where g.td_id = tc.td_id and g.country_code = tc.country_code
                                    and g.tag_code in (select code from tags where kind = 'theme')))
             || ' paesi senza nessun tema: perdono la parte tema del punteggio filtri' as reason
       where exists (select 1 from td_countries tc
                      where tc.td_id = p_td_id
                        and not exists (select 1 from td_destination_tags g
                                         where g.td_id = tc.td_id and g.country_code = tc.country_code
                                           and g.tag_code in (select code from tags where kind = 'theme')))
      union all
      select (select count(*)::text from td_countries tc
               where tc.td_id = p_td_id
                 and not exists (select 1 from td_destination_tags g
                                  where g.td_id = tc.td_id and g.country_code = tc.country_code
                                    and g.tag_code in (select code from tags where kind = 'context')))
             || ' paesi senza nessun contesto: perdono la parte contesto del punteggio filtri'
       where exists (select 1 from td_countries tc
                      where tc.td_id = p_td_id
                        and not exists (select 1 from td_destination_tags g
                                         where g.td_id = tc.td_id and g.country_code = tc.country_code
                                           and g.tag_code in (select code from tags where kind = 'context')))
      union all
      select 'più di 3 paesi di livello 1: il rilievo perde significato'
       where (select count(*) from td_countries where td_id = p_td_id and level = 1) > 3
      union all
      select 'tutti gli assi continui sullo stesso valore: profilo probabilmente non compilato'
       where (select count(distinct v.value) from td_axis_values v
                join quiz_axes a on a.code = v.axis_code
               where v.td_id = p_td_id and a.kind = 'continuous') = 1
         and (select count(*) from td_axis_values v
                join quiz_axes a on a.code = v.axis_code
               where v.td_id = p_td_id and a.kind = 'continuous') > 1
      union all
      select 'nessun servizio oltre la consulenza: la mail post-call non avrà bottoni'
       where not exists (select 1 from td_services
                          where td_id = p_td_id and is_active
                            and service_type not in ('consultation', 'consultation_deep'))
    ) w;
$$;

drop view if exists td_publish_readiness;

create view td_publish_readiness as
  select
    td.id,
    td.slug,
    td.display_name,
    td.status,
    (select count(*) from td_countries c where c.td_id = td.id)                    as countries_count,
    (select count(*) from td_countries c where c.td_id = td.id and c.level = 1)     as level1_count,
    (select count(distinct v.axis_code) from td_axis_values v where v.td_id = td.id) as axes_declared,
    (select count(*) from td_destination_tags g where g.td_id = td.id)              as tags_count,
    td_publish_blockers(td.id)                        as blockers,
    td_publish_warnings(td.id)                        as warnings,
    cardinality(td_publish_blockers(td.id)) = 0       as can_publish
    from travel_designers td;

-- Il blocco vero. Un profilo implausibile non si pubblica: la coda di correzione
-- non è un consiglio.
create or replace function enforce_publish_readiness()
returns trigger language plpgsql as $$
declare
  v_blockers text[];
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    v_blockers := td_publish_blockers(new.id);
    if cardinality(v_blockers) > 0 then
      raise exception 'Profilo % non pubblicabile: %', new.slug, array_to_string(v_blockers, '; ');
    end if;
  end if;
  return new;
end $$;

-- Vale anche in INSERT: un profilo non si crea già pubblicato se è incompleto.
-- In INSERT il trigger deve girare DOPO, perché i paesi, gli assi e i servizi
-- arrivano con INSERT successivi: quindi la pubblicazione di un profilo nuovo
-- si fa in due passi, si crea in 'draft' e si porta a 'published' quando il
-- resto è dentro. È voluto.
create constraint trigger travel_designers_enforce_publish
  after insert or update on travel_designers
  deferrable initially deferred
  for each row execute function enforce_publish_readiness();
