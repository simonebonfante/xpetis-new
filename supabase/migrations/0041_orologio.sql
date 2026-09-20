-- XPETIS · 0041 · L'orologio unico, e il braccio che cancella su Cal.com
--
-- L'ultimo bordo del giro del pagamento. Oggi una prenotazione non pagata resta
-- `pending_payment` per sempre e lo slot sul calendario del designer non si
-- libera mai: il Flusso dice al massimo 35 minuti.
--
-- ===========================================================================
-- PERCHÉ QUESTA MIGRATION HA UNA FORMA DIVERSA DAI DUE PONTI
-- ===========================================================================
-- I ponti Cal.com (0037) e Stripe (0039) tengono **tutta** la decisione in
-- Postgres perché **ricevono**: n8n consegna byte e non guarda dentro.
--
-- Questo pezzo **agisce verso l'esterno**: per liberare uno slot bisogna
-- chiamare Cal.com, e Postgres non fa chiamate HTTP. Quindi qui n8n fa qualcosa
-- davvero — ma solo il gesto, mai la scelta:
--
--   clock_tick()        decide CHI è scaduto e cosa va fatto        (Postgres)
--   n8n                 esegue la chiamata a Cal.com                (braccio)
--   clock_task_done()   decide COSA significa l'esito               (Postgres)
--
-- n8n non legge stati, non calcola scadenze, non sceglie. Chiede la lista,
-- esegue, riferisce. Se domani il braccio diventasse una Edge Function o un
-- cron di Vercel, queste due funzioni non cambierebbero di una riga.
--
-- ===========================================================================
-- CHI SCRIVE LO STATO PER PRIMO: SI MARCA **DOPO**
-- ===========================================================================
-- È la scelta vera di questo file, e le due strade hanno conseguenze opposte.
--
-- Marcare `cancelled_unpaid` **prima** di chiamare Cal.com: se la chiamata
-- fallisce restano una riga chiusa e uno slot occupato, e **nessuno se ne
-- accorgerà mai più**, perché l'orologio non guarda le righe già chiuse. Il
-- danno è silenzioso e permanente.
--
-- Marcare **dopo** la conferma di Cal.com: se la chiamata fallisce la riga resta
-- `pending_payment`, cioè scaduta e ancora da liberare, e **il giro successivo
-- la ritrova**. Lo stato segue la realtà invece di anticiparla.
--
-- Si marca dopo. È la stessa regola di `webhook_events.processed_at`, che sugli
-- errori resta nullo di proposito perché il ritentativo riprovi: in questo
-- database un lavoro non riuscito non deve somigliare a un lavoro fatto.
--
-- Il prezzo della scelta è una finestra di qualche secondo in cui lo slot è già
-- libero su Cal.com e la riga dice ancora `pending_payment`. Costa poco — chi
-- guarda Studio in quell'istante vede una riga che sta per chiudersi — mentre il
-- prezzo della scelta opposta è uno slot perso per sempre.
--
-- E il ciclo non gira all'infinito: `cancel_attempts` conta i tentativi, e oltre
-- `unpaid_cancel_max_attempts` l'orologio smette di riprovare e chiama una
-- persona. Un braccio rotto deve diventare un alert, non un rumore di fondo.

-- ===========================================================================
-- Le due colonne nuove
-- ===========================================================================
-- `cancel_requested_at` fa tre lavori con un dato solo:
--  1. **Prenota il lavoro**: una riga appena consegnata al braccio non viene
--     riconsegnata al giro dopo, finché il giro dopo non è davvero passato.
--  2. **Attribuisce la cancellazione**: quando la nostra cancellazione torna
--     indietro come webhook, questa colonna è il segno che ha agito il sistema e
--     non il viaggiatore. Vedi il trigger più sotto.
--  3. **Racconta**: su Studio si vede a colpo d'occhio quali righe l'orologio ha
--     già toccato e quando.
alter table bookings add column cancel_requested_at timestamptz;
alter table bookings add column cancel_attempts smallint not null default 0;

comment on column bookings.cancel_requested_at is
  'Quando l''orologio ha chiesto al braccio di liberare questo slot su Cal.com. '
  'Nullo finché nessuno l''ha chiesto. È anche il segno che attribuisce al '
  'sistema la cancellazione che torna indietro dal webhook Cal.com.';
comment on column bookings.cancel_attempts is
  'Quante volte l''orologio ha consegnato al braccio la cancellazione di questo '
  'slot. Oltre app_config.unpaid_cancel_max_attempts smette e avvisa il team.';

-- ===========================================================================
-- TRAPPOLA 1 — la nostra cancellazione torna indietro come webhook
-- ===========================================================================
-- Appena il braccio cancella su Cal.com, Cal.com manda un `BOOKING_CANCELLED`
-- **al nostro stesso ponte**. Va previsto, non subìto.
--
-- Il ponte (0037) attribuisce la cancellazione confrontando `cancelledBy` con
-- `organizer.email`: uguale = designer, diverso = viaggiatore, assente =
-- sistema. Su una cancellazione fatta da noi via API **non sappiamo** cosa
-- Cal.com metta in quel campo — l'endpoint non è ancora stato provato sul campo
-- (vedi `calcom_cancel_url` più sotto). Se ci mettesse la mail del viaggiatore,
-- `booking_status_history` direbbe che ha cancellato lui, e quella riga è
-- **l'unica prova di chi ha agito**: il Travel Designer non ha login, il
-- viaggiatore non ha cancellato niente, e da una riga sbagliata discenderebbero
-- un contatore di riprogrammazioni mosso sulla persona sbagliata e un arbitrato
-- deciso su un fatto falso.
--
-- Quindi la regola non sta nel ponte, dove varrebbe per un percorso solo: sta
-- **nel database**, dove vale per tutte le porte — il webhook, l'ack del
-- braccio, e la mano di un umano su Studio. Se siamo stati noi a chiedere la
-- cancellazione, siamo stati noi a farla.
--
-- Il trigger è BEFORE UPDATE: `bookings_log_status` è AFTER e legge
-- `new.last_actor`, quindi la storia riceve già il valore corretto e non c'è
-- niente da correggere dopo.
create or replace function force_system_cancel_actor()
returns trigger
language plpgsql
as $$
begin
  if old.cancel_requested_at is not null
     and new.status is distinct from old.status
     and new.status in ('cancelled_unpaid', 'cancelled')
  then
    new.cancelled_by := 'system';
    new.last_actor   := 'system';
  end if;
  return new;
end $$;

comment on function force_system_cancel_actor() is
  'Una cancellazione che abbiamo chiesto noi è attribuita a noi, da qualunque '
  'porta entri: webhook Cal.com, ack del braccio, o una mano su Studio. Senza '
  'questo, il BOOKING_CANCELLED di ritorno potrebbe scrivere "traveler" in '
  'booking_status_history, che è l''unica prova di chi ha agito.';

create trigger bookings_force_system_cancel_actor
  before update on bookings
  for each row execute function force_system_cancel_actor();

-- ⚠️ Quello che questo trigger **non** copre: `event_log`. Il ponte 0037 scrive
-- la sua riga `calcom_cancellata` con l'attore che ha calcolato lui, e quella
-- funzione non si tocca — riemetterne cinquecento righe per cambiarne cinque
-- lascerebbe nel repo due copie della stessa logica, ed è il modo in cui due
-- copie divergono. La prova di chi ha agito è `booking_status_history`, ed è
-- giusta; `event_log` in quel caso porta anche `cancellata_da` col valore grezzo
-- che Cal.com ha mandato, quindi il fatto resta ricostruibile.

-- ===========================================================================
-- L'orologio
-- ===========================================================================
-- `clock_tick()` è **un solo workflow per tutte le scadenze**, non un cron per
-- scadenza (principio in `CLAUDE.md`). Oggi la scadenza dovuta è una sola, ma
-- milestone 5 e 6 ne portano altre: silenzio-conferma a 48 ore, promemoria del
-- giorno prima, chiusura a 5 giorni dalla consegna.
--
-- Perciò la funzione è fatta a **rami**, e aggiungerne una è aggiungere un ramo:
--
--  · i lavori che il database sa fare da solo (chiudere una call a silenzio-
--    conferma è un `update`) si fanno **qui dentro** e non escono;
--  · i lavori che hanno bisogno del mondo di fuori (cancellare su Cal.com,
--    mandare una mail) **escono come compiti**, in una forma sola:
--    `(task, entity_type, entity_id, payload)`.
--
-- Il braccio non sa cosa sono i compiti: li esegue guardando `task` e riferisce.
-- Un ramo nuovo non richiede un secondo workflow, e nemmeno un nodo nuovo se il
-- gesto è dello stesso tipo.
create or replace function clock_tick(p_limit integer default 100)
returns table (task text, entity_type text, entity_id uuid, payload jsonb)
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_window     numeric;
  v_grace      numeric;
  v_sweep      numeric;
  v_budget     numeric;
  v_max_try    numeric;
  v_url        text;
  v_api_ver    text;
  v_reason     text;
  v_bloccate   integer;
begin
  -- ------------------------------------------------------ i parametri, tutti
  -- Nessun numero di prodotto nel codice: stanno in `app_config`, una riga per
  -- parametro, modificabile da Studio senza deploy. Se ne manca uno l'orologio
  -- **solleva** invece di girare a vuoto: una scadenza non trattata è invisibile,
  -- un'esecuzione rossa su n8n no.
  select value into v_window  from app_config where key = 'booking_payment_window_min';
  select value into v_grace   from app_config where key = 'booking_cancel_grace_min';
  select value into v_sweep   from app_config where key = 'unpaid_sweep_minutes';
  select value into v_budget  from app_config where key = 'unpaid_slot_max_min';
  select value into v_max_try from app_config where key = 'unpaid_cancel_max_attempts';
  select value_text into v_url     from app_config where key = 'calcom_cancel_url';
  select value_text into v_api_ver from app_config where key = 'calcom_api_version';
  select value_text into v_reason  from app_config where key = 'unpaid_cancel_reason';

  if v_window is null or v_grace is null or v_sweep is null or v_budget is null
     or v_max_try is null or v_url is null then
    raise exception 'Manca un parametro dell''orologio in app_config (finestra, grazia, cadenza, budget, tentativi, URL di cancellazione): non si inventano';
  end if;

  -- ------------------------------------------- il budget dei 35 minuti
  -- TRAPPOLA 2, primo tempo. La regola del Flusso è che uno slot non pagato
  -- resta occupato **al massimo 35 minuti**, e il conto è:
  --
  --     finestra di pagamento + grazia + cadenza dell'orologio
  --
  -- La cadenza entra perché una riga che scade subito dopo un giro aspetta un
  -- giro intero. Con i valori di oggi — 30 + 0 + 5 — il conto fa **esattamente
  -- 35**: siamo sul limite, non sotto, e **non c'è spazio per nessuna grazia**
  -- senza accorciare la finestra o la cadenza. Per questo `booking_cancel_grace_min`
  -- nasce a **zero**: è il posto dove metterla, non una grazia già data.
  --
  -- Il controllo vive qui e non solo nell'harness perché i parametri si cambiano
  -- **da Studio**, dove nessun test passa: chi allarga la finestra a 45 minuti
  -- per fare un favore a un viaggiatore rompe una regola del Flusso senza
  -- accorgersene. L'alert è uno solo finché non viene risolto.
  if v_window + v_grace + v_sweep > v_budget then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'orologio_fuori_budget', 'warning', null, null,
           'I parametri dell''orologio superano il massimo del Flusso: finestra '
           || v_window || ' + grazia ' || v_grace || ' + cadenza ' || v_sweep
           || ' = ' || (v_window + v_grace + v_sweep) || ' minuti, contro un massimo di '
           || v_budget || '. Uno slot non pagato resta occupato più a lungo di quanto la regola ammetta.'
     where not exists (select 1 from team_alerts
                        where kind = 'orologio_fuori_budget' and resolved_at is null);
  end if;

  -- =========================================================================
  -- RAMO 1 — gli insoluti: lo slot va liberato su Cal.com
  -- =========================================================================
  -- Prima si guarda se il braccio è rotto. Una prenotazione che ha già speso
  -- tutti i tentativi non si riconsegna: si smette e si chiama una persona,
  -- una volta sola. Senza questo, un endpoint Cal.com cambiato produrrebbe una
  -- chiamata fallita ogni cinque minuti per sempre, e nessuno guarderebbe.
  select count(*) into v_bloccate
    from bookings b
   where b.status = 'pending_payment'
     and b.payment_deadline_at is not null
     and b.payment_deadline_at + make_interval(mins => v_grace::int) <= now()
     and b.cancel_attempts >= v_max_try;

  if v_bloccate > 0 then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'orologio_cancellazione_calcom_non_riesce', 'critical', null, null,
           v_bloccate || ' prenotazioni scadute non si riescono a cancellare su Cal.com dopo '
           || v_max_try || ' tentativi: quegli slot restano occupati. '
           || 'Guarda le esecuzioni di n8n e la riga app_config.calcom_cancel_url.'
     where not exists (select 1 from team_alerts
                        where kind = 'orologio_cancellazione_calcom_non_riesce' and resolved_at is null);
  end if;

  return query
  with dovute as (
    select b.id
      from bookings b
     where b.status = 'pending_payment'
       -- TRAPPOLA: `payment_deadline_at` nullo **non** è una prenotazione
       -- scaduta. La route della cassa la tratta come pagabile senza limite
       -- (`scadenza !== null && scadenza <= ora`), quindi l'orologio non la
       -- tocca: cancellare uno slot che il sito dichiara ancora pagabile
       -- sarebbe il tasto che mente, visto dall'altra parte.
       and b.payment_deadline_at is not null
       -- TRAPPOLA 2, secondo tempo: l'autorità è la scadenza, più l'eventuale
       -- grazia.
       and b.payment_deadline_at + make_interval(mins => v_grace::int) <= now()
       -- TRAPPOLA 2, terzo tempo, e la difesa che conta davvero: **mai** una
       -- riga su cui un incasso è già riuscito. Prendere i soldi e dare via lo
       -- slot è il danno peggiore che questo workflow possa fare.
       and not exists (select 1 from payments p
                        where p.booking_id = b.id and p.status = 'paid')
       -- Non si riconsegna un compito che il braccio ha in mano adesso. Se il
       -- giro precedente è fallito, dopo una cadenza la riga torna disponibile
       -- e si riprova: è il senso di marcare **dopo**.
       and (b.cancel_requested_at is null
            or b.cancel_requested_at <= now() - make_interval(mins => v_sweep::int))
       and b.cancel_attempts < v_max_try
     order by b.payment_deadline_at
     limit p_limit
     -- Due giri sovrapposti (un'esecuzione lenta, un avvio a mano) non si
     -- pestano i piedi. Cancellare due volte è comunque innocuo — vedi
     -- `clock_task_done` — ma una chiamata in meno è una chiamata in meno.
     for update skip locked
  ),
  segnate as (
    update bookings b
       set cancel_requested_at = now(),
           cancel_attempts     = b.cancel_attempts + 1
      from dovute d
     where b.id = d.id
    returning b.id, b.cal_booking_uid, b.starts_at, b.cancel_attempts
  )
  select 'calcom_cancel_unpaid'::text,
         'booking'::text,
         s.id,
         jsonb_build_object(
           -- TRAPPOLA 4. `cal_booking_uid` esce dal database per la prima
           -- volta: dopo S-05 quel codice **da solo** cancella una call su
           -- Cal.com, senza nessuna chiave, ed è per questo che la 0019 lo
           -- tiene fuori da `my_bookings`. Qui deve uscire — è l'unica cosa che
           -- il braccio ha bisogno di sapere — e la strada è stretta di
           -- proposito: `clock_tick` la può chiamare solo `service_role`, il
           -- compito va a n8n e da nessun'altra parte, e **l'ack non lo
           -- rimanda indietro** (`clock_task_done` prende l'id della riga, non
           -- il codice). Viaggia in una direzione sola.
           'cal_booking_uid', s.cal_booking_uid,
           -- L'URL non è nel codice e non è in n8n: è una riga di `app_config`,
           -- come tutto il resto. Se `{uid}` compare nel modello viene
           -- sostituito, così la stessa riga serve sia un endpoint che vuole il
           -- codice nel percorso sia uno che lo vuole nel corpo.
           'cancel_url', replace(v_url, '{uid}', s.cal_booking_uid),
           'api_version', v_api_ver,
           'reason', coalesce(v_reason, 'Pagamento non completato.'),
           'starts_at', s.starts_at,
           'attempt', s.cancel_attempts)
    from segnate s;

  -- =========================================================================
  -- RAMO 2 — silenzio-conferma a 48 ore (milestone 5)
  -- RAMO 3 — promemoria del giorno prima (milestone 5)
  -- RAMO 4 — chiusura a 5 giorni dalla consegna (milestone 6)
  -- =========================================================================
  -- Qui, non in un secondo workflow. Il ramo 2 non uscirà nemmeno come compito:
  -- chiudere una call è un `update`, e il database lo sa fare da solo. I rami 3
  -- e 4 usciranno come compiti `email_*` il giorno che esiste un provider di
  -- invio (S-04): finché non esiste, **non si manda niente e non si finge**.
end $$;

comment on function clock_tick(integer) is
  'L''orologio unico: un solo giro ogni 5 minuti per tutte le scadenze dovute. '
  'Fa da sé i lavori interni e restituisce come compiti quelli che hanno '
  'bisogno del mondo di fuori. Chi esegue i compiti riferisce con '
  'clock_task_done().';

-- ===========================================================================
-- L'esito, riferito dal braccio
-- ===========================================================================
-- Il braccio non giudica: passa il **codice HTTP** che Cal.com ha risposto e il
-- corpo della risposta. Cosa significhi si decide qui, dove la regola è
-- versionata e provata dall'harness, e non in un nodo n8n dove sarebbe una
-- riga di espressione che nessuno rilegge.
--
-- TRAPPOLA 3 — cancellare due volte deve essere innocuo. L'orologio rigira ogni
-- cinque minuti e il braccio ritenta: la stessa prenotazione può arrivare qui
-- due volte. La risposta **non si cerca nel messaggio d'errore di Cal.com** —
-- che non conosciamo, e indovinarne il testo sarebbe una trappola nuova al posto
-- di quella vecchia — ma nello stato della riga: se la prenotazione è già
-- chiusa, **lo slot è libero, e come ci sia arrivato non cambia niente**. Un
-- secondo tentativo che Cal.com rifiuta con un 400 su una riga già chiusa è un
-- successo, non un guasto.
create or replace function clock_task_done(
  p_task      text,
  p_entity_id uuid,
  p_status    integer,
  p_detail    text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_booking bookings;
  v_ok      boolean;
  v_esito   text;
begin
  if p_task <> 'calcom_cancel_unpaid' then
    return jsonb_build_object('ok', false, 'esito', 'compito_sconosciuto', 'task', p_task);
  end if;

  select * into v_booking from bookings where id = p_entity_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'esito', 'prenotazione_sconosciuta');
  end if;

  v_ok := p_status between 200 and 299;

  -- Prima la riga, poi il codice HTTP: è l'ordine che rende innocuo il doppio
  -- tentativo senza dover interpretare un messaggio d'errore.
  if v_booking.status in ('cancelled_unpaid', 'cancelled') then
    -- Già chiusa: dal webhook di ritorno di Cal.com, da un giro precedente, o
    -- da una mano sul pannello. Nulla da fare, e non è un errore.
    v_esito := 'gia_liberata';
    v_ok    := true;

  elsif v_booking.status = 'confirmed' then
    -- TRAPPOLA 2 accaduta davvero: mentre cancellavamo lo slot è arrivato il
    -- pagamento. Se la cancellazione è andata a buon fine, su Cal.com quella
    -- call **non esiste più** mentre la consulenza risulta confermata e pagata,
    -- e nessun automatismo può rimediare: ci vuole una persona. Se invece la
    -- chiamata era fallita, non è successo niente di male — e non si riprova,
    -- perché adesso quello slot è pagato.
    if v_ok then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('orologio_ha_liberato_uno_slot_pagato', 'critical', 'booking', v_booking.id,
              'Lo slot del ' || to_char(v_booking.starts_at, 'DD/MM/YYYY HH24:MI')
              || ' è stato cancellato su Cal.com perché scaduto, ma il pagamento è '
              || 'arrivato nel frattempo e la consulenza risulta confermata ('
              || (v_booking.price_cents / 100.0)::text || ' €). '
              || 'La call su Cal.com non esiste più: va rifissata a mano con il designer, '
              || 'oppure rimborsata.');
    end if;
    v_esito := 'pagata_nel_frattempo';

  elsif v_booking.status = 'pending_payment' and v_ok then
    update bookings set
      status        = 'cancelled_unpaid',
      cancelled_at  = now(),
      -- `cancelled_by` e `last_actor` li scriverebbe comunque il trigger
      -- `bookings_force_system_cancel_actor`: qui si dicono lo stesso, perché
      -- si legga senza inseguire un trigger.
      cancelled_by  = 'system',
      cancel_reason = 'Pagamento non completato entro il tempo previsto.',
      last_actor    = 'system'
     where id = v_booking.id;

    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('booking', v_booking.id, 'orologio_slot_liberato', 'system',
            jsonb_build_object('scadenza', v_booking.payment_deadline_at,
                               'tentativo', v_booking.cancel_attempts,
                               'inizio_call', v_booking.starts_at));
    v_esito := 'liberata';

  elsif v_booking.status = 'pending_payment' then
    -- La chiamata non è riuscita: **non si tocca lo stato**. La riga resta
    -- scaduta e da liberare, e il giro successivo la ritrova. È tutta la
    -- ragione per cui si marca dopo invece che prima.
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('booking', v_booking.id, 'orologio_cancellazione_fallita', 'system',
            jsonb_build_object('http', p_status,
                               'tentativo', v_booking.cancel_attempts,
                               'dettaglio', p_detail));
    v_esito := 'ritentare';

  else
    v_esito := 'stato_inatteso';
    v_ok    := false;
  end if;

  return jsonb_build_object('ok', v_ok, 'esito', v_esito,
                            'booking_id', v_booking.id,
                            'tentativo', v_booking.cancel_attempts);
end $$;

comment on function clock_task_done(text, uuid, integer, text) is
  'L''esito di un compito dell''orologio, riferito dal braccio come codice HTTP. '
  'Decide qui cosa significa: liberata, già liberata (innocuo, ed è la difesa '
  'contro il doppio tentativo), da ritentare, o il caso critico del pagamento '
  'arrivato mentre si cancellava.';

-- ===========================================================================
-- Chi può chiamarle
-- ===========================================================================
-- Solo `service_role`, cioè la chiave secret che vive lato server e che usa
-- n8n. `anon` e `authenticated` non devono nemmeno vederle: `clock_tick`
-- restituisce `cal_booking_uid`, che dopo S-05 è una credenziale di
-- cancellazione, e `clock_task_done` chiude prenotazioni.
revoke all on function clock_tick(integer)                      from public;
revoke all on function clock_task_done(text, uuid, integer, text) from public;

grant execute on function clock_tick(integer)                      to service_role;
grant execute on function clock_task_done(text, uuid, integer, text) to service_role;
