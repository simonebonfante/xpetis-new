-- XPETIS · 0037 · Il ponte Cal.com → bookings, dentro il database
--
-- Il messaggio di Cal.com arriva in n8n e n8n lo passa qui, grezzo, senza
-- guardarci dentro. Tutta la decisione vive in questa funzione.
--
-- PERCHÉ NEL DATABASE E NON IN n8n. La macchina a stati delle prenotazioni sta
-- già qui, con i suoi trigger e la sua storia; un ponte scritto in un grafo di
-- nodi avrebbe dovuto reimplementarla fuori, senza vincoli e senza prove. Qui
-- invece è versionata come migration e rigiocabile dall'harness sui sette
-- messaggi veri. n8n conserva quello per cui l'abbiamo scelto: il log visuale di
-- ogni chiamata e il retry automatico sul percorso dove passano i soldi.
--
-- SCELTA REVERSIBILE. Se un giorno servisse spostare la logica altrove, la
-- superficie da rifare è una funzione con due argomenti di testo: n8n non sa
-- nulla del contenuto e non cambierebbe.
--
-- Riferimento sui campi veri: `supabase/MAPPATURA_CALCOM.md`, ricavato da sette
-- messaggi raccolti sull'account di prova. Le fixture stanno in
-- `supabase/tests/fixtures/calcom/`.

-- ===========================================================================
-- La parola segreta
-- ===========================================================================
-- Vive in Supabase Vault, non in questo file: una migration è versionata e
-- finisce su GitHub e in ogni copia della cartella. Si inserisce una volta a
-- mano, dal SQL Editor:
--
--   select vault.create_secret('<la parola segreta di Cal.com>',
--                              'calcom_webhook_secret',
--                              'Firma dei webhook Cal.com (x-cal-signature-256)');
--
-- `ACCESSI.md` dice che esiste e dove sta; il valore no.
--
-- Sull'harness lo schema `vault` non esiste: il test lo simula come già fa con
-- `auth.users`. Per questo la lettura passa da `execute` con la guardia di
-- `to_regclass`, invece di una query statica che non compilerebbe altrove.
create or replace function calcom_webhook_secret()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, vault
as $$
declare
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault non disponibile: la parola segreta di Cal.com non si può leggere';
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_secret using 'calcom_webhook_secret';

  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nessun segreto "calcom_webhook_secret" nel Vault: il ponte Cal.com non può verificare le firme';
  end if;

  return v_secret;
end $$;

comment on function calcom_webhook_secret() is
  'La parola segreta con cui Cal.com firma i webhook, letta da Supabase Vault. '
  'Non sta in nessun file versionato.';

-- ===========================================================================
-- La firma
-- ===========================================================================
-- HMAC-SHA256 del corpo GREZZO, in esadecimale minuscolo, nell'header
-- `x-cal-signature-256`. Si calcola sui byte esatti che sono arrivati: un JSON
-- riserializzato dà una firma diversa anche quando il contenuto è identico —
-- l'ordine delle chiavi, gli spazi e il formato dei numeri non sopravvivono al
-- giro di andata e ritorno. È il motivo per cui il nodo Webhook di n8n deve
-- consegnare il corpo grezzo.
--
-- Verificato sulle fixture: Cal.com firma il JSON compatto (nessuno spazio dopo
-- `,` e `:`, non-ASCII lasciati come sono). Sei dei sette messaggi veri hanno
-- una firma che si riproduce con questa formula; il settimo no, perché il JWT
-- della password video era stato sostituito prima di salvarlo.
create or replace function calcom_signature_ok(p_corpo text, p_firma text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_atteso text;
begin
  if p_corpo is null or p_firma is null or btrim(p_firma) = '' then
    return false;
  end if;

  v_atteso := encode(
    hmac(convert_to(p_corpo, 'utf8'),
         convert_to(calcom_webhook_secret(), 'utf8'),
         'sha256'),
    'hex');

  -- Il confronto non è a tempo costante. Un attacco temporale su questo
  -- percorso richiederebbe di misurare microsecondi attraverso Railway, n8n e
  -- PostgREST: il rumore è di ordini di grandezza superiore al segnale.
  return lower(btrim(p_firma)) = v_atteso;
end $$;

comment on function calcom_signature_ok(text, text) is
  'Verifica HMAC-SHA256 del corpo grezzo di un webhook Cal.com contro '
  'l''header x-cal-signature-256.';

-- ===========================================================================
-- Il ponte
-- ===========================================================================
create or replace function calcom_webhook(p_corpo text, p_firma text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_body    jsonb;
  v_payload jsonb;
  v_trigger text;
  v_ext_id  text;
  v_ev_id   uuid;
  v_errore  text;

  v_uid       text;
  v_old_uid   text;
  v_slug      text;
  v_username  text;
  v_org_email text;
  v_start     timestamptz;
  v_end       timestamptz;
  v_video     text;
  v_reason    text;
  v_by        text;

  v_td_id     uuid;
  v_srv_type  service_type;
  v_price     integer;

  v_traveler_raw text;
  v_traveler_id  uuid;

  v_window   numeric;
  v_booking  bookings;
  v_new_id   uuid;

  v_actor    actor_kind;
  v_esito    text;
  v_dettaglio text;
  v_ok       boolean := true;
  v_booking_id uuid;

  -- Chiude il lavoro annotando l'esito e restituendo la risposta a n8n.
  v_richiesta_riprogrammazione boolean;
begin
  -- ---------------------------------------------------------------- 1. firma
  -- Firma non valida: il messaggio non entra nemmeno nel diario. Non viene da
  -- Cal.com, e scrivere una riga per ogni corpo arbitrario che arriva
  -- all'indirizzo pubblico del webhook trasformerebbe `webhook_events` in una
  -- discarica scrivibile da chiunque. Il fatto resta comunque visibile: n8n
  -- conserva l'esecuzione con la sua risposta.
  if not calcom_signature_ok(p_corpo, p_firma) then
    return jsonb_build_object('ok', false, 'esito', 'firma_non_valida',
                              'dettaglio', 'HMAC-SHA256 del corpo non combacia con x-cal-signature-256');
  end if;

  begin
    v_body := p_corpo::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'esito', 'corpo_non_json',
                              'dettaglio', 'il corpo è firmato ma non è JSON valido');
  end;

  -- `triggerEvent` sta alla RADICE del corpo, non dentro `payload`.
  v_trigger := v_body ->> 'triggerEvent';
  v_payload := v_body -> 'payload';
  v_uid     := v_payload ->> 'uid';

  -- `jsonb_typeof` e non `is null`: un `"payload": null` nel corpo dà un jsonb
  -- di tipo null, che in SQL non è NULL e passerebbe il controllo per poi
  -- restituire NULL su ogni campo.
  if v_trigger is null or v_payload is null or jsonb_typeof(v_payload) <> 'object' then
    return jsonb_build_object('ok', false, 'esito', 'corpo_non_riconosciuto',
                              'dettaglio', 'manca triggerEvent o payload, o payload non è un oggetto');
  end if;

  -- --------------------------------------------------------------- 2. diario
  -- Cal.com non manda un identificativo di messaggio: la chiave la componiamo
  -- con i tre campi che insieme identificano l'evento. Il `createdAt` serve
  -- perché `uid` da solo non basta — la seconda riprogrammazione e la
  -- cancellazione della catena vera portano lo stesso `uid`, distinti solo dal
  -- tipo. Un ritentativo di Cal.com rimanda gli stessi byte, quindi la stessa
  -- chiave. Composta e non un hash del corpo perché su Studio si legge.
  v_ext_id := coalesce(v_trigger, '?') || ':' || coalesce(v_uid, '?')
              || ':' || coalesce(v_body ->> 'createdAt', '?');

  insert into webhook_events (provider, external_id, event_type, payload)
  values ('cal', v_ext_id, v_trigger, v_body)
  on conflict (provider, external_id) do nothing
  returning id into v_ev_id;

  if v_ev_id is null then
    -- Doppio scatto. Se però il tentativo precedente si era fermato su un
    -- errore (`processed_at` ancora nullo), il ritentativo di Cal.com è
    -- un'occasione da usare, non da scartare.
    select id into v_ev_id
      from webhook_events
     where provider = 'cal' and external_id = v_ext_id and processed_at is null;

    if v_ev_id is null then
      return jsonb_build_object('ok', true, 'esito', 'duplicato',
                                'dettaglio', 'messaggio già lavorato: nulla da fare');
    end if;
  end if;

  -- ---------------------------------------------------------------- 3. lavoro
  -- Tutto dentro un blocco con gestore: se qualcosa va storto il lavoro torna
  -- indietro ma la riga di diario, inserita prima del blocco, resta. Così
  -- l'errore è leggibile su Studio e il messaggio risulta non lavorato.
  begin
    v_slug      := v_payload ->> 'type';           -- NON eventType.slug
    v_username  := v_payload -> 'organizer' ->> 'username';
    v_org_email := v_payload -> 'organizer' ->> 'email';
    v_start     := (v_payload ->> 'startTime')::timestamptz;
    v_end       := (v_payload ->> 'endTime')::timestamptz;
    v_video     := coalesce(v_payload -> 'metadata' ->> 'videoCallUrl',
                            v_payload -> 'videoCallData' ->> 'url');
    v_reason    := v_payload ->> 'cancellationReason';

    if v_trigger not in ('BOOKING_CREATED', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED') then
      v_esito := 'evento_non_gestito';
      v_dettaglio := 'triggerEvent ' || v_trigger;
    -- ---------------------------------------------------------------------
    -- 4. è roba nostra?
    -- ---------------------------------------------------------------------
    -- Il webhook è per account, non per event type: un designer che tiene sul
    -- suo Cal.com anche appuntamenti propri ce li manda tutti. Scartarli è
    -- routine e non merita un alert; l'annotazione nel diario basta.
    --
    -- `is_active` NON entra nel filtro di proposito: un servizio spento ieri
    -- può avere prenotazioni ancora in volo, e la loro cancellazione deve
    -- arrivare a destinazione.
    elsif v_slug is null or not exists (
      select 1 from td_services
       where cal_event_type_slug = v_slug
         and service_type in ('consultation', 'consultation_deep')
    ) then
      v_esito := 'event_type_non_nostro';
      v_dettaglio := 'slug ' || coalesce(v_slug, '(assente)');
    else
      -- La chiave doppia. Lo slug da solo non identifica nessuno: i 25
      -- designer copiano lo stesso event type modello, quindi
      -- `consulenza-xpetis-30` è identico su tutti.
      select id into v_td_id from travel_designers where cal_username = v_username;

      if v_td_id is null then
        -- Uno dei nostri slug da un account che non conosciamo: o il team non
        -- ha ancora scritto `cal_username`, o un designer l'ha cambiato e le
        -- sue prenotazioni stanno smettendo di arrivarci. Va guardato.
        v_esito := 'designer_sconosciuto';
        v_dettaglio := 'organizer.username ' || coalesce(v_username, '(assente)');
        v_ok := false;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('calcom_designer_sconosciuto', 'warning', 'webhook_event', v_ev_id,
                'Prenotazione Cal.com su un event type XPETIS da un account sconosciuto: '
                || coalesce(v_username, '(username assente)') || ' / ' || v_slug
                || '. Nessuna riga creata.');
      else
        select service_type, price_cents
          into v_srv_type, v_price
          from td_services
         where td_id = v_td_id and cal_event_type_slug = v_slug
         order by sort_order
         limit 1;

        if v_srv_type is null then
          v_esito := 'servizio_non_del_designer';
          v_dettaglio := v_slug || ' non è fra i servizi di questo designer';
          v_ok := false;
          insert into team_alerts (kind, severity, entity_type, entity_id, message)
          values ('calcom_servizio_non_configurato', 'critical', 'webhook_event', v_ev_id,
                  'Prenotazione su ' || v_slug || ' per il designer ' || v_username
                  || ', che non ha quel servizio configurato. Il viaggiatore ha uno slot '
                  || 'e noi nessuna riga: va sistemato a mano.');
        elsif v_trigger = 'BOOKING_CREATED' and v_price is null then
          -- Il vincolo `td_services_bookable_complete` lo rende impossibile su
          -- un servizio attivo. Se accade, il servizio è stato spento o
          -- modificato dopo la prenotazione.
          v_esito := 'servizio_senza_prezzo';
          v_dettaglio := v_slug || ' non ha prezzo';
          v_ok := false;
          insert into team_alerts (kind, severity, entity_type, entity_id, message)
          values ('calcom_servizio_senza_prezzo', 'critical', 'webhook_event', v_ev_id,
                  'Prenotazione su ' || v_slug || ' del designer ' || v_username
                  || ' senza prezzo a listino: la cassa non si può aprire. '
                  || 'Slot occupato e nessuna riga creata.');
        else
          -- -----------------------------------------------------------------
          -- 5. quale viaggiatore
          -- -----------------------------------------------------------------
          -- L'UUID che il sito precompila nell'embed. Verificato: sopravvive a
          -- riprogrammazioni e cancellazioni, in tutti e sette i messaggi.
          v_traveler_raw := v_payload -> 'responses' -> 'xpetis_user_id' ->> 'value';
          if v_traveler_raw is not null
             and v_traveler_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
            select id into v_traveler_id from travelers where id = v_traveler_raw::uuid;
          end if;

          if v_traveler_id is null then
            -- Senza viaggiatore non esiste prenotazione: la riga ha una FK
            -- obbligatoria verso `travelers`, e va bene così — una consulenza
            -- senza cliente non è un dato che vogliamo poter scrivere. Succede
            -- se qualcuno prenota dalla pagina Cal.com nuda invece che dal
            -- nostro embed.
            v_esito := 'viaggiatore_non_identificato';
            v_dettaglio := 'responses.xpetis_user_id.value = '
                           || coalesce(v_traveler_raw, '(assente)');
            v_ok := false;
            insert into team_alerts (kind, severity, entity_type, entity_id, message)
            values ('calcom_viaggiatore_non_identificato', 'critical', 'webhook_event', v_ev_id,
                    'Prenotazione Cal.com su ' || v_username || ' senza codice XPETIS '
                    || 'riconoscibile (' || coalesce(v_traveler_raw, 'campo assente')
                    || '). Probabile prenotazione fuori dal sito: '
                    || coalesce(v_payload -> 'attendees' -> 0 ->> 'email', 'mittente ignoto'));

          -- -----------------------------------------------------------------
          elsif v_trigger = 'BOOKING_CREATED' then
          -- -----------------------------------------------------------------
            select value into v_window from app_config where key = 'booking_payment_window_min';
            if v_window is null then
              raise exception 'Manca app_config.booking_payment_window_min: la finestra di pagamento non si inventa';
            end if;

            insert into bookings (
              traveler_id, td_id, service_type, status,
              cal_booking_uid, cal_event_type_slug, video_url,
              starts_at, ends_at, original_starts_at,
              price_cents, payment_deadline_at, last_actor)
            values (
              v_traveler_id, v_td_id, v_srv_type, 'pending_payment',
              v_uid, v_slug, v_video,
              v_start, v_end,
              -- L'ancora dei 20 giorni: alla nascita coincide con la data
              -- scelta, e da qui in poi non si muove più.
              v_start,
              -- Il prezzo lo dà il listino, non il messaggio: in `payload`
              -- `price` è 0 e `currency` "usd" perché il pagamento di Cal.com
              -- non lo usiamo.
              v_price,
              -- La finestra parte da ADESSO, non da `payload.createdAt`. Se il
              -- messaggio arriva in ritardo (n8n giù, un ritentativo), con
              -- `createdAt` la riga nascerebbe già scaduta e l'orologio dei 5
              -- minuti libererebbe lo slot mentre il viaggiatore sta pagando.
              -- Il difetto opposto — qualche minuto in più per pagare — non fa
              -- male a nessuno.
              now() + (v_window || ' minutes')::interval,
              -- Chi ha agito è il viaggiatore: ha scelto lui lo slot. n8n è
              -- solo il mezzo, e `booking_status_history` deve dire chi.
              'traveler')
            on conflict (cal_booking_uid) do nothing
            returning id into v_new_id;

            if v_new_id is null then
              -- Stesso uid già in tabella con una chiave di diario diversa:
              -- non è un doppio scatto, è lo stesso slot arrivato due volte.
              select id into v_booking_id from bookings where cal_booking_uid = v_uid;
              v_esito := 'gia_esistente';
              v_dettaglio := 'cal_booking_uid già presente';
            else
              v_booking_id := v_new_id;
              v_esito := 'creata';
            end if;

          -- -----------------------------------------------------------------
          elsif v_trigger = 'BOOKING_RESCHEDULED' then
          -- -----------------------------------------------------------------
            -- QUI IL DISEGNO OVVIO È SBAGLIATO. Cal.com non aggiorna la
            -- prenotazione: ne crea una nuova con un `uid` nuovo e mette il
            -- vecchio in `rescheduleUid`. La riga quindi NON si trova con
            -- `uid`, che per noi è sconosciuto: si trova con `rescheduleUid`.
            v_old_uid := v_payload ->> 'rescheduleUid';
            if v_old_uid is not null then
              select * into v_booking from bookings where cal_booking_uid = v_old_uid;
            end if;

            if v_booking.id is null then
              v_esito := 'prenotazione_sconosciuta';
              v_dettaglio := 'rescheduleUid ' || coalesce(v_old_uid, '(assente)');
              v_ok := false;
              insert into team_alerts (kind, severity, entity_type, entity_id, message)
              values ('calcom_riprogrammazione_orfana', 'critical', 'webhook_event', v_ev_id,
                      'Riprogrammazione Cal.com di una prenotazione che non abbiamo: '
                      || 'rescheduleUid ' || coalesce(v_old_uid, '(assente)')
                      || ', designer ' || v_username || '. La call esiste e noi non la vediamo.');
            elsif v_booking.status not in ('pending_payment', 'confirmed') then
              v_esito := 'riprogrammazione_su_stato_chiuso';
              v_dettaglio := 'la prenotazione è in stato ' || v_booking.status;
              v_ok := false;
              v_booking_id := v_booking.id;
              insert into team_alerts (kind, severity, entity_type, entity_id, message)
              values ('calcom_riprogrammazione_su_stato_chiuso', 'warning', 'booking', v_booking.id,
                      'Cal.com ha riprogrammato una prenotazione in stato '
                      || v_booking.status || '. La riga non è stata toccata.');
            else
              -- Chi ha riprogrammato lo dice Cal.com, e il campo segue chi
              -- agisce: verificato con due indirizzi diversi. Uguale a
              -- `organizer.email` = il designer, diverso = il viaggiatore.
              v_by := v_payload ->> 'rescheduledBy';
              v_actor := case
                when v_by is null then 'system'::actor_kind
                when lower(btrim(v_by)) = lower(btrim(coalesce(v_org_email, ''))) then 'td'::actor_kind
                else 'traveler'::actor_kind
              end;

              update bookings set
                -- La sostituzione che tiene in piedi la catena: senza di
                -- questa, la cancellazione successiva — che arriva col codice
                -- NUOVO — non trova più niente.
                cal_booking_uid     = v_uid,
                cal_event_type_slug = v_slug,
                video_url           = v_video,
                starts_at           = v_start,
                ends_at             = v_end,
                -- `original_starts_at` non si tocca MAI: è l'ancora da cui si
                -- contano i 20 giorni massimi di spostamento.
                -- `payment_deadline_at` nemmeno: farla ripartire a ogni
                -- riprogrammazione permetterebbe di tenere occupato uno slot
                -- per sempre senza pagare.
                reschedule_count_traveler = reschedule_count_traveler
                                            + case when v_actor = 'traveler' then 1 else 0 end,
                reschedule_count_td       = reschedule_count_td
                                            + case when v_actor = 'td' then 1 else 0 end,
                last_actor          = v_actor
               where id = v_booking.id;

              v_booking_id := v_booking.id;
              v_esito := 'riprogrammata';
              v_dettaglio := 'da ' || v_old_uid || ' a ' || v_uid
                             || ', ' || to_char(v_booking.starts_at, 'DD/MM HH24:MI')
                             || ' → ' || to_char(v_start, 'DD/MM HH24:MI')
                             || ', per mano di ' || v_actor;

              insert into event_log (entity_type, entity_id, event, actor, payload)
              values ('booking', v_booking.id, 'calcom_riprogrammata', v_actor,
                      jsonb_build_object(
                        'uid_precedente', v_old_uid,
                        'uid_nuovo', v_uid,
                        'inizio_precedente', v_booking.starts_at,
                        'inizio_nuovo', v_start,
                        'riprogrammata_da', v_by,
                        'original_starts_at', v_booking.original_starts_at));

              if v_actor = 'system' then
                -- Senza `rescheduledBy` non si sa a chi addebitare la
                -- riprogrammazione, e incrementare il contatore sbagliato è
                -- peggio che non incrementarne nessuno: uno dei due limiti del
                -- Flusso scatterebbe su una colpa non sua.
                insert into team_alerts (kind, severity, entity_type, entity_id, message)
                values ('calcom_riprogrammazione_non_attribuita', 'warning', 'booking', v_booking.id,
                        'Riprogrammazione senza campo rescheduledBy: nessun contatore '
                        || 'incrementato. Va attribuita a mano.');
              end if;
            end if;

          -- -----------------------------------------------------------------
          elsif v_trigger = 'BOOKING_CANCELLED' then
          -- -----------------------------------------------------------------
            -- Qui il codice è quello corrente, non un precedente: la
            -- cancellazione arriva sempre con l'ultimo `uid` della catena, che
            -- la riprogrammazione ha già scritto in tabella.
            select * into v_booking from bookings where cal_booking_uid = v_uid;

            if v_booking.id is null then
              v_esito := 'prenotazione_sconosciuta';
              v_dettaglio := 'uid ' || coalesce(v_uid, '(assente)');
              v_ok := false;
              insert into team_alerts (kind, severity, entity_type, entity_id, message)
              values ('calcom_cancellazione_orfana', 'warning', 'webhook_event', v_ev_id,
                      'Cancellazione Cal.com di una prenotazione che non abbiamo: uid '
                      || coalesce(v_uid, '(assente)') || ', designer ' || v_username || '.');
            elsif v_booking.status in ('cancelled', 'cancelled_unpaid') then
              v_esito := 'gia_cancellata';
              v_booking_id := v_booking.id;
            else
              v_by := v_payload ->> 'cancelledBy';
              v_actor := case
                when v_by is null then 'system'::actor_kind
                when lower(btrim(v_by)) = lower(btrim(coalesce(v_org_email, ''))) then 'td'::actor_kind
                else 'traveler'::actor_kind
              end;

              -- IL TASTO *Request reschedule*. Non è una richiesta: è una
              -- cancellazione secca. Nessuna prenotazione nuova, nessun legame
              -- con la vecchia. Servono ENTRAMBI i segni — il prefisso esatto
              -- del motivo e la mano del designer — perché un viaggiatore
              -- potrebbe scrivere a mano un motivo che comincia così, e la
              -- conseguenza sarebbe un rimborso non dovuto.
              v_richiesta_riprogrammazione :=
                coalesce(v_reason, '') like 'Please reschedule.%' and v_actor = 'td';

              if v_richiesta_riprogrammazione then
                -- Decisione dell'8 agosto 2026: stato bloccato, alert critico,
                -- rimborso eseguito a mano. `disputed` è lo stato che il
                -- database dà all'arbitrato del team.
                update bookings set
                  status        = 'disputed',
                  cancelled_at  = now(),
                  cancelled_by  = v_actor,
                  cancel_reason = v_reason,
                  dispute_note  = 'Il designer ha usato *Request reschedule* di Cal.com, che è una '
                                  || 'cancellazione secca: la call non esiste più e Cal.com non ne '
                                  || 'ha creata nessuna al suo posto.',
                  last_actor    = v_actor
                 where id = v_booking.id;

                insert into team_alerts (kind, severity, entity_type, entity_id, message)
                values ('calcom_request_reschedule_del_designer', 'critical', 'booking', v_booking.id,
                        'Il designer ' || v_username || ' ha usato *Request reschedule*: la '
                        || 'consulenza del ' || to_char(v_booking.starts_at, 'DD/MM/YYYY HH24:MI')
                        || ' è cancellata e non ce n''è una nuova. '
                        || case when v_booking.status = 'confirmed'
                                then 'ERA PAGATA (' || (v_booking.price_cents / 100.0)::text
                                     || ' €): il rimborso va eseguito a mano su Stripe.'
                                else 'Non era ancora pagata: nessun rimborso, ma il viaggiatore '
                                     || 'va avvisato.' end
                        || ' Motivo scritto dal designer: ' || coalesce(v_reason, '(nessuno)'));

                v_esito := 'request_reschedule_bloccata';
                v_ok := false;
              else
                update bookings set
                  -- Senza pagamento non c'è nulla da rimborsare, e lo stato lo
                  -- dice: `cancelled` significa "cancellata dopo il pagamento".
                  status        = case when v_booking.status = 'pending_payment'
                                       then 'cancelled_unpaid'::booking_status
                                       else 'cancelled'::booking_status end,
                  cancelled_at  = now(),
                  cancelled_by  = v_actor,
                  cancel_reason = v_reason,
                  last_actor    = v_actor
                 where id = v_booking.id;

                v_esito := 'cancellata';
                v_dettaglio := 'per mano di ' || v_actor
                               || ', motivo: ' || coalesce(v_reason, '(nessuno)');

                -- Il Flusso dice che il designer non può cancellare una
                -- consulenza pagata. Cal.com non lo impedisce (gli scope
                -- disponibili sono "host and attendee" e "attendee only":
                -- "solo host" non esiste), quindi qui si può solo constatarlo.
                -- Le regole di rimborso vere le applica la milestone 5: questa
                -- funzione lascia in tabella tutto ciò che servirà — chi ha
                -- cancellato, quando, e quanto mancava alla call.
                if v_actor = 'td' and v_booking.status = 'confirmed' then
                  insert into team_alerts (kind, severity, entity_type, entity_id, message)
                  values ('calcom_designer_ha_cancellato_call_pagata', 'critical', 'booking', v_booking.id,
                          'Il designer ' || v_username || ' ha cancellato una consulenza GIÀ PAGATA '
                          || 'del ' || to_char(v_booking.starts_at, 'DD/MM/YYYY HH24:MI')
                          || '. Il Flusso non lo ammette. Motivo: '
                          || coalesce(v_reason, '(nessuno)'));
                end if;
              end if;

              v_booking_id := v_booking.id;

              insert into event_log (entity_type, entity_id, event, actor, payload)
              values ('booking', v_booking.id, 'calcom_cancellata', v_actor,
                      jsonb_build_object(
                        'uid', v_uid,
                        'stato_precedente', v_booking.status,
                        'cancellata_da', v_by,
                        'motivo', v_reason,
                        'request_reschedule', v_richiesta_riprogrammazione,
                        'inizio_call', v_booking.starts_at,
                        'ore_di_preavviso',
                          round(extract(epoch from (v_booking.starts_at - now())) / 3600.0, 2)));
            end if;
          end if;
        end if;
      end if;
    end if;

  exception when others then
    v_errore := sqlstate || ' ' || sqlerrm;
    v_esito  := 'errore';
    v_ok     := false;
    v_dettaglio := v_errore;
  end;

  -- --------------------------------------------------------------- 4. chiusura
  -- `processed_at` resta nullo solo sugli errori: così un ritentativo di
  -- Cal.com riprova invece di fermarsi sul duplicato, e la vista degli
  -- insoluti (`webhook_events_unprocessed_idx`) mostra esattamente i messaggi
  -- da guardare.
  update webhook_events
     set processed_at = case when v_errore is null then now() else null end,
         error        = v_errore
   where id = v_ev_id;

  -- Gli scarti si annotano nel diario: un event type non nostro, un designer
  -- sconosciuto o un viaggiatore irriconoscibile devono lasciare una traccia
  -- leggibile senza aprire il payload.
  if v_esito in ('evento_non_gestito', 'event_type_non_nostro', 'designer_sconosciuto',
                 'servizio_non_del_designer', 'servizio_senza_prezzo',
                 'viaggiatore_non_identificato', 'prenotazione_sconosciuta', 'errore') then
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('webhook_event', v_ev_id, 'calcom_' || v_esito, 'n8n',
            jsonb_build_object('trigger', v_trigger, 'uid', v_uid,
                               'slug', v_slug, 'username', v_username,
                               'dettaglio', v_dettaglio));
  end if;

  -- Sempre un esito, mai un errore: n8n deve poter rispondere 2xx a Cal.com.
  -- Un 500 ripetuto porta i provider a spegnere l'endpoint, e la difesa contro
  -- il doppio scatto è già nel database.
  return jsonb_build_object(
    'ok', v_ok,
    'esito', v_esito,
    'booking_id', v_booking_id,
    'webhook_event_id', v_ev_id,
    'dettaglio', v_dettaglio);
end $$;

comment on function calcom_webhook(text, text) is
  'Il ponte Cal.com → bookings. Riceve il corpo grezzo e la firma, verifica '
  'l''HMAC, registra il messaggio in webhook_events e applica l''effetto: '
  'creazione, riprogrammazione (che su Cal.com è una prenotazione NUOVA, '
  'trovata con rescheduleUid), cancellazione. Non solleva mai: restituisce '
  'sempre un esito, perché n8n deve rispondere 2xx.';

-- ===========================================================================
-- Chi può chiamarla
-- ===========================================================================
-- Solo `service_role`, cioè la chiave secret che vive lato server. `anon` e
-- `authenticated` non devono nemmeno vederla: la funzione è in SECURITY
-- DEFINER e crea prenotazioni.
revoke all on function calcom_webhook_secret()          from public;
revoke all on function calcom_signature_ok(text, text)  from public;
revoke all on function calcom_webhook(text, text)       from public;

grant execute on function calcom_webhook(text, text) to service_role;
