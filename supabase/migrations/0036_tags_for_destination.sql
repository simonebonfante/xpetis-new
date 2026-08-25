-- XPETIS · 0036 · La maschera contestuale dei filtri
--
-- Il Flusso la chiede con l'esempio: *"Con la destinazione questo abilita la
-- maschera contestuale (sulla Bolivia non si mostra 'mare')"*. Finora la colonna
-- dei filtri mostrava sempre tutti e diciassette i tag, quindi offriva scatti
-- che non potevano che dare zero risultati.
--
-- ## Perché una funzione e non una vista
--
-- Serve sapere quali tag esistono su una destinazione, e quel dato sta in
-- `td_destination_tags`, che è **chiuso**: la coppia (designer, paese, tag) dice
-- su cosa un designer è forte, cioè uno degli ingredienti del punteggio. Una
-- vista pubblica su quella tabella la consegnerebbe riga per riga al browser.
--
-- La funzione invece restituisce l'**unione** dei tag di tutti i designer
-- pubblicati su quella destinazione: sapere che su Bolivia qualcuno ha dichiarato
-- "deserto" non dice chi, e non permette di ricostruire nessun profilo. È lo
-- stesso criterio con cui `match_designers()` restituisce posizioni e badge ma
-- mai punteggi.
--
-- ## Le due scelte da conoscere
--
-- **Solo i designer pubblicati.** Un tag che esiste solo su una bozza non deve
-- comparire: cliccarlo darebbe zero risultati, che è precisamente il difetto da
-- togliere.
--
-- **Senza destinazione la maschera non esiste** e la funzione restituisce tutti i
-- tag. Così il sito la chiama sempre, con o senza destinazione, e non c'è un ramo
-- nel codice del sito che decide quando mascherare: la regola vive qui.
--
-- Un livello che non filtra (città, continente) **solleva un errore** invece di
-- essere ignorato, come in `match_designers()`: la regola di prodotto sta nella
-- funzione, non nella buona volontà di chi la chiama.

create or replace function tags_for_destination(
  p_destination_level text default null,
  p_destination_ref   text default null
)
returns table (code text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_country text;
  v_macro   text;
begin
  -- Nessuna destinazione: nessuna maschera. Tutti i tag, nell'ordine della
  -- tassonomia.
  if p_destination_level is null then
    return query select t.code from tags t order by t.kind, t.sort_order;
    return;
  end if;

  if p_destination_level not in ('country', 'macro_area') then
    raise exception
      'Destinazione non filtrabile: %. Si filtra per paese o macro-area; città e continenti vivono solo nel suggeritore.',
      p_destination_level;
  end if;
  if p_destination_ref is null then
    raise exception 'Destinazione di livello % senza identificatore', p_destination_level;
  end if;

  if p_destination_level = 'country' then
    select k.code, k.macro_area_code into v_country, v_macro
      from geo_countries k where k.code = p_destination_ref;
  else
    select null, m.code into v_country, v_macro
      from geo_macro_areas m where m.code = p_destination_ref;
  end if;

  if v_macro is null then
    raise exception 'Destinazione inesistente: % "%"', p_destination_level, p_destination_ref;
  end if;

  -- Con un paese si guarda quel paese. Con una macro-area si guardano tutti i
  -- suoi paesi: è la stessa lettura larga che fa `match_designers()`, dove chi
  -- copre un paese dell'area è "esperto dell'area".
  return query
    select distinct t.code
      from td_destination_tags dt
      join travel_designers td on td.id = dt.td_id and td.status = 'published'
      join geo_countries k on k.code = dt.country_code
      join tags t on t.code = dt.tag_code
     where (v_country is not null and k.code = v_country)
        or (v_country is null and k.macro_area_code = v_macro)
     order by t.code;
end $$;

comment on function tags_for_destination(text, text) is
  'I tag che esistono davvero su una destinazione, fra i designer pubblicati: è '
  'la maschera contestuale del Flusso (sulla Bolivia non si mostra "mare"). '
  'Restituisce l''unione dei tag, mai chi li ha dichiarati. Senza destinazione '
  'restituisce tutti i tag, cioè nessuna maschera.';

revoke all on function tags_for_destination(text, text) from public;
grant execute on function tags_for_destination(text, text) to anon, authenticated;
