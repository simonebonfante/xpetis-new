-- XPETIS · 0033 · L'identificatore stabile degli itinerari pronti
--
-- Fino a oggi `/designer/<td>/itinerario/2` voleva dire "il secondo della
-- lista", perché `public_td_showcase` serve un array ordinato e niente altro.
-- Un riordino spostava il significato di un indirizzo già dato: il link vecchio
-- rispondeva 200 mostrando l'itinerario sbagliato. Un 404 è un problema, un 200
-- sbagliato è una trappola.
--
-- **`position` non risolve niente**: è esattamente la colonna che un riordino
-- riscrive. Serve un dato che non cambi quando cambia l'ordine.
--
-- ## Perché uno slug e non l'`id` uuid
--
-- L'uuid sarebbe immutabile a costo zero, e l'ho scartato per dove finiscono
-- questi indirizzi: **nei messaggi WhatsApp che il designer incolla al
-- viaggiatore** (il Flusso li prevede in più punti del post-call). Là un link è
-- testo che qualcuno legge prima di toccarlo, e
-- `.../itinerario/9f8c1e2a-4b17-4c90-9a3d-77e0c1b5aa21` non dice niente:
-- nessuno può verificare di aver incollato il Giappone e non il Vietnam, e un
-- link che non si capisce si clicca meno. `.../itinerario/giappone-fuori-stagione`
-- si legge, si riconosce e si corregge a occhio.
--
-- ## Come resta stabile
--
-- Lo slug si **calcola una volta sola, all'inserimento, e poi è un dato come un
-- altro**: il trigger è `before insert` e non tocca mai gli UPDATE. Correggere un
-- titolo — un refuso, una parola in più — non muove l'indirizzo, che è
-- precisamente la garanzia chiesta. Chi vuole cambiarlo davvero scrive la colonna
-- a mano da Studio, che è un atto deliberato e non un effetto collaterale.
--
-- L'unicità è **per designer** (`unique (td_id, slug)`): due designer possono
-- avere entrambi `giappone-in-primavera`, perché l'indirizzo porta già il loro
-- slug. Dentro lo stesso designer una collisione prende un suffisso numerico.
--
-- Reversibile: se un giorno si preferisse l'uuid, l'`id` è già lì e il contratto
-- dell'URL sta in un posto solo (`lib/vetrina.ts`).

-- `gin_trgm_ops`, `unaccent` e le altre funzioni delle estensioni si risolvono
-- dal search_path: su Supabase stanno in `extensions`, altrove in `public`.
-- Nominarli entrambi copre i due casi.
set search_path = public, extensions;

-- --------------------------------------------------------------------------
-- Due utilità che appartengono a `0004_utility.sql` e stanno qui perché quel
-- file è applicato e non si modifica.

-- **`unaccent(text)` è STABLE, non IMMUTABLE**, perché dipende dal dizionario di
-- default: Postgres rifiuta di usarla in una colonna generata o in un indice. La
-- forma a due argomenti, con il dizionario nominato, è deterministica: questo
-- involucro la dichiara immutabile una volta per tutte. Serve allo slug qui
-- sotto e alla ricerca accento-insensibile.
create or replace function unaccent_immutable(p_text text)
  returns text
  language sql
  immutable
  strict
  parallel safe
  set search_path = public, extensions
as $$ select unaccent('unaccent', p_text) $$;

comment on function unaccent_immutable(text) is
  'unaccent() dichiarata immutabile nominando il dizionario: la versione a un '
  'argomento è STABLE e non si può usare in colonne generate o indici.';

-- Da "Vietnam del Nord: Hanoi, Ninh Binh, Ha Giang" a
-- "vietnam-del-nord-hanoi-ninh-binh-ha-giang". Niente accenti, niente
-- maiuscole, un trattino per ogni gruppo di caratteri che non sia una lettera o
-- una cifra. La troncatura **non** è qui: questa funzione fa una cosa sola.
create or replace function slugify(p_text text)
  returns text
  language sql
  immutable
  strict
  parallel safe
  set search_path = public, extensions
as $$
  select btrim(regexp_replace(lower(unaccent_immutable(p_text)), '[^a-z0-9]+', '-', 'g'), '-')
$$;

comment on function slugify(text) is
  'Titolo → slug leggibile. Immutabile, quindi usabile in colonne generate.';

-- --------------------------------------------------------------------------
-- La colonna.

alter table td_ready_itineraries add column slug text;

comment on column td_ready_itineraries.slug is
  'Identificatore stabile dentro il designer, e pezzo dell''indirizzo pubblico. '
  'Nasce dal titolo al primo inserimento e **non cambia più**: un titolo '
  'corretto non muove l''URL, che finisce nei messaggi WhatsApp. Per cambiarlo '
  'davvero si scrive questa colonna a mano.';

-- 60 caratteri: un tetto perché un URL resti incollabile, non un obiettivo.
-- Tagliare a metà parola è accettabile — lo slug è un identificatore leggibile,
-- non una frase.
create or replace function td_ready_itinerary_slug()
  returns trigger
  language plpgsql
  set search_path = public, extensions
as $$
declare
  v_base text;
  v_slug text;
  v_n    int := 1;
begin
  -- Slug scritto a mano: si rispetta. È la via per correggerne uno brutto.
  if new.slug is not null and btrim(new.slug) <> '' then
    return new;
  end if;

  v_base := btrim(left(slugify(new.title), 60), '-');

  -- Un titolo fatto solo di segni ("《》") passa il vincolo di non-vuoto e
  -- produce uno slug vuoto: meglio un pezzo dell'uuid che una riga che non si
  -- può indirizzare.
  if v_base = '' then
    v_base := left(new.id::text, 8);
  end if;

  v_slug := v_base;
  while exists (
    select 1 from td_ready_itineraries r
     where r.td_id = new.td_id and r.slug = v_slug
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end $$;

create trigger td_ready_itineraries_slug
  before insert on td_ready_itineraries
  for each row execute function td_ready_itinerary_slug();

-- Le righe che c'erano già. Il `row_number` per (designer, base) dà il suffisso
-- alle collisioni con lo stesso criterio del trigger, in ordine di posizione.
with base as (
  select id, td_id,
         coalesce(nullif(btrim(left(slugify(title), 60), '-'), ''), left(id::text, 8)) as b,
         position
    from td_ready_itineraries
), numerate as (
  select id, b, row_number() over (partition by td_id, b order by position, id) as n
    from base
)
update td_ready_itineraries r
   set slug = case when u.n = 1 then u.b else u.b || '-' || u.n end
  from numerate u
 where u.id = r.id;

alter table td_ready_itineraries alter column slug set not null;
create unique index td_ready_itineraries_td_slug on td_ready_itineraries (td_id, slug);

-- --------------------------------------------------------------------------
-- La superficie pubblica: la vetrina serve lo slug accanto al titolo. Nient'altro
-- cambia — la vista è la stessa della 0028, con una chiave in più negli
-- itinerari.
--
-- `drop view` porta via anche i privilegi: il `grant` in fondo non è una
-- ripetizione.

drop view if exists public_td_showcase;

create view public_td_showcase as
  select
    td.id,
    td.slug,
    td.display_name,
    td.headline,
    td.hero_bio,
    td.bio,
    td.manifesto,
    td.photo_url,
    td.background_photo_url,
    td.languages,
    td.years_experience,
    td.instagram_handle,
    coalesce(c.countries,  '[]'::jsonb) as countries,
    coalesce(s.services,   '[]'::jsonb) as services,
    coalesce(t.trips,      '[]'::jsonb) as signature_trips,
    coalesce(i.itineraries,'[]'::jsonb) as ready_itineraries
  from travel_designers td
  left join lateral (
    select jsonb_agg(k.name_it order by k.name_it) as countries
      from td_countries tc
      join geo_countries k on k.code = tc.country_code
     where tc.td_id = td.id
  ) c on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'service_type',     sv.service_type,
             'price_cents',      sv.price_cents,
             'price_is_custom',  sv.price_is_custom,
             'duration_minutes', sv.duration_minutes,
             'text_during_call', sv.text_during_call,
             'text_after_call',  sv.text_after_call,
             'bullets', coalesce((
               select jsonb_agg(bl.text_it order by bl.position)
                 from td_service_bullets bl where bl.service_id = sv.id), '[]'::jsonb)
           ) order by sv.sort_order) as services
      from td_services sv where sv.td_id = td.id and sv.is_active
  ) s on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'title',       tr.title,
             'description', tr.description,
             'images', coalesce((
               select jsonb_agg(im.storage_path order by im.position)
                 from td_signature_trip_images im where im.trip_id = tr.id), '[]'::jsonb)
           ) order by tr.position) as trips
      from td_signature_trips tr where tr.td_id = td.id
  ) t on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'slug',           it.slug,
             'title',          it.title,
             'duration_label', it.duration_label,
             'price_label',    it.price_label,
             'image_path',     it.image_path
           ) order by it.position) as itineraries
      from td_ready_itineraries it where it.td_id = td.id
  ) i on true
  where td.status = 'published';

grant select on public_td_showcase to anon, authenticated;
