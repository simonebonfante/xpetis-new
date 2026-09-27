-- XPETIS · 0045 · Le correzioni delle prove del 23 settembre
--
-- Due cose, e nessuna delle due tocca la logica degli ordini:
--
--   A. **Gli importi negli alert si leggono.** Quindici messaggi scrivevano
--      `(cents / 100.0)::text`, che in Postgres porta con sé la scala piena
--      della divisione `numeric`: «Pagamento Stripe di 700.0000000000000000 €»
--      (prova 54). Adesso passano tutti da `euro_it()`, la gemella in SQL di
--      `euro()` in TypeScript, che c'era già dalla 0044 per le mail.
--   B. **Quando un viaggiatore paga, qualcuno lo sa.** Una mail al designer e
--      una agli amministratori, costruita come un meccanismo — una lista di
--      destinatari interni e un elenco di eventi, tutti e due in `app_config` —
--      e non come una mail in più.
--
-- ===========================================================================
-- PARTE A — Un formattatore solo
-- ===========================================================================
-- Le quindici occorrenze stavano in 0037, 0039, 0041, 0043 e 0044, ma le
-- funzioni **vive** sono quattro: la 0043 ha già riemesso `clock_task_done`
-- della 0041, e la 0044 ha riemesso `stripe_webhook` della 0039. Si riemettono
-- quelle quattro, **parola per parola** salvo le righe degli importi: una
-- migration applicata non si modifica, e questa è l'unica strada.
--
-- **Il prossimo alert eredita la regola invece di ripetere il difetto:** un
-- importo in un messaggio si scrive `euro_it(cents)`, mai `cents / 100.0`.
-- L'harness lo controlla leggendo il sorgente di tutte le funzioni in
-- `pg_proc`, quindi una funzione nuova che ci ricade fa diventare rosso il
-- giro e non un alert illeggibile.
--
-- Una sola cosa cambia oltre alla forma: dove il ponte Stripe confronta
-- l'incasso col listino, la valuta sbagliata adesso è **detta a parole**
-- («700,00 € MA IN VALUTA USD, non in euro») invece di essere un codice di tre
-- lettere in fondo a un numero. `euro_it` mette sempre il simbolo dell'euro, e
-- un «700,00 € USD» sarebbe stato un messaggio che si contraddice.
--
-- Nessun testo di mail cambia: le mail usavano già `euro_it`.

-- --------------------------------------------------------------------------
-- calcom_webhook (0037): il rimborso da fare a mano dopo un Request reschedule
-- --------------------------------------------------------------------------
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
                                then 'ERA PAGATA (' || coalesce(euro_it(v_booking.price_cents), 'importo non registrato')
                                     || '): il rimborso va eseguito a mano su Stripe.'
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

-- --------------------------------------------------------------------------
-- clock_task_done (0043): lo slot pagato che l'orologio ha liberato
-- --------------------------------------------------------------------------
create or replace function clock_task_done(
  p_task      text,
  p_entity_id uuid,
  p_status    integer,
  p_detail    text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_booking bookings;
  v_msg     outbound_messages;
  v_ok      boolean;
  v_esito   text;
  v_max_try numeric;
  v_id      text;
begin
  -- =======================================================================
  -- email_send
  -- =======================================================================
  if p_task = 'email_send' then
    select * into v_msg from outbound_messages where id = p_entity_id;
    if v_msg.id is null then
      return jsonb_build_object('ok', false, 'esito', 'messaggio_sconosciuto');
    end if;

    if v_msg.status = 'sent' then
      -- Già partita, da un giro precedente il cui ack si era perso. Innocuo, e
      -- la chiave di idempotenza ha già impedito il doppione dall'altra parte.
      return jsonb_build_object('ok', true, 'esito', 'gia_inviata', 'message_id', v_msg.id);
    end if;

    v_ok := p_status between 200 and 299;

    if v_ok then
      -- L'identificativo di Resend sta nel corpo della risposta, che il braccio
      -- passa come testo. Si prova a leggerlo e non si insiste: una mail
      -- consegnata resta consegnata anche se il corpo non era JSON.
      begin
        v_id := (p_detail::jsonb) ->> 'id';
      exception when others then
        v_id := null;
      end;

      update outbound_messages
         set status = 'sent', sent_at = now(),
             provider_message_id = v_id, last_error = null
       where id = v_msg.id;

      v_esito := 'inviata';

    elsif p_status = 429 or p_status >= 500 or p_status = 0 or p_status is null then
      update outbound_messages
         set last_error = left(coalesce(p_detail, ''), 500)
       where id = v_msg.id;
      v_esito := case when p_status = 429 then 'troppo_in_fretta' else 'ritentare' end;

    else
      select value into v_max_try from app_config where key = 'email_max_attempts';

      update outbound_messages
         set status = 'failed', last_error = left(coalesce(p_detail, ''), 500)
       where id = v_msg.id;

      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('email_rifiutata', 'critical', v_msg.entity_type, v_msg.entity_id,
              'Resend ha rifiutato definitivamente la mail "' || v_msg.message_kind
              || '" per ' || v_msg.recipient || ' con codice ' || p_status
              || ': ' || left(coalesce(p_detail, '(nessun dettaglio)'), 300)
              || '. Non viene ritentata, perché un corpo malformato o un mittente non '
              || 'verificato non guariscono riprovando. La riga è in outbound_messages, '
              || 'con il corpo composto: si legge, si corregge il testo in '
              || 'message_templates e la si rimette in coda con '
              || 'update outbound_messages set status=''queued'', attempts=0 where id=''' || v_msg.id || ''';');

      v_esito := 'rifiutata';
    end if;

    return jsonb_build_object('ok', v_ok, 'esito', v_esito,
                              'message_id', v_msg.id,
                              'tentativo', v_msg.attempts);
  end if;

  -- =======================================================================
  -- calcom_cancel_unpaid
  -- =======================================================================
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
    v_esito := 'gia_liberata';
    v_ok    := true;

  elsif v_booking.status = 'confirmed' then
    if v_ok then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('orologio_ha_liberato_uno_slot_pagato', 'critical', 'booking', v_booking.id,
              'Lo slot del ' || to_char(v_booking.starts_at, 'DD/MM/YYYY HH24:MI')
              || ' è stato cancellato su Cal.com perché scaduto, ma il pagamento è '
              || 'arrivato nel frattempo e la consulenza risulta confermata ('
              || coalesce(euro_it(v_booking.price_cents), 'importo non registrato') || '). '
              || 'La call su Cal.com non esiste più: va rifissata a mano con il designer, '
              || 'oppure rimborsata.');
    end if;
    v_esito := 'pagata_nel_frattempo';

  elsif v_booking.status = 'pending_payment' and v_ok then
    update bookings set
      status        = 'cancelled_unpaid',
      cancelled_at  = now(),
      cancelled_by  = 'system',
      cancel_reason = 'Pagamento non completato entro il tempo previsto.',
      last_actor    = 'system'
     where id = v_booking.id;

    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('booking', v_booking.id, 'orologio_slot_liberato', 'system',
            jsonb_build_object('scadenza', v_booking.payment_deadline_at,
                               'tentativo', v_booking.cancel_attempts,
                               'inizio_call', v_booking.starts_at));

    -- ⚠️ **La mail cortese, che fino a oggi non esisteva.** Il Flusso la prevede
    -- («parte una mail cortese: lo slot è stato liberato, puoi riprenotare
    -- quando vuoi») e la 0041 l'aveva lasciata fuori perché non c'era un
    -- provider di invio. Adesso c'è, e il posto giusto è esattamente questo: il
    -- momento in cui sappiamo che lo slot è stato liberato davvero, non prima.
    perform accoda_mail_slot_liberato(v_booking.id);

    v_esito := 'liberata';

  elsif v_booking.status = 'pending_payment' then
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

-- --------------------------------------------------------------------------
-- stripe_checkout_ordine (0044): il ramo ordini del ponte Stripe
-- --------------------------------------------------------------------------
create or replace function stripe_checkout_ordine(
  p_tipo  text,
  p_obj   jsonb,
  p_ev_id uuid,
  p_pay   payments)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_sess    text := p_obj ->> 'id';
  v_pi      text := p_obj ->> 'payment_intent';
  v_amount  integer := nullif(p_obj ->> 'amount_total', '')::integer;
  v_valuta  text := lower(coalesce(p_obj ->> 'currency', ''));
  v_pstatus text := p_obj ->> 'payment_status';
  v_rif     text := coalesce(p_obj -> 'metadata' ->> 'order_id', p_obj ->> 'client_reference_id');
  v_pay     payments := p_pay;
  v_order   orders;
  v_conto   stripe_account_kind;
  v_agenzia uuid;
  v_esito   text;
  v_dett    text;
  v_ok      boolean := true;
  v_pay_id  uuid := p_pay.id;
  v_uuid    boolean;
  v_registrato boolean;
  v_caso    text;
begin
  v_uuid := v_rif ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- =====================================================================
  if p_tipo = 'checkout.session.expired' then
  -- =====================================================================
    -- Come per le prenotazioni: **solo la riga di pagamento**, e solo quella
    -- della sessione che porta la scadenza. L'ordine non si tocca — una
    -- proposta resta pagabile anche se una cassa è scaduta: il viaggiatore ne
    -- apre un'altra dalla pagina gemella.
    if v_pay.id is null then
      v_esito := 'pagamento_sconosciuto';
      v_dett  := 'nessuna riga payments per la sessione ' || coalesce(v_sess, '(ignota)');
    elsif v_pay.status <> 'pending' then
      v_esito := 'gia_chiusa';
      v_dett  := 'la riga di pagamento è in stato ' || v_pay.status;
    else
      update payments set status = 'expired' where id = v_pay.id;
      v_esito := 'scaduta';
      v_dett  := 'cassa della proposta scaduta; l''ordine resta com''è';
    end if;
    return jsonb_build_object('ok', true, 'esito', v_esito, 'dettaglio', v_dett,
                              'order_id', v_pay.order_id, 'payment_id', v_pay.id);
  end if;

  -- =====================================================================
  -- checkout.session.completed
  -- =====================================================================
  -- Il ripiego «cerca per ordine» come quello per prenotazione: solo sul
  -- pagamento riuscito, e solo su una riga che non ha ancora una sessione.
  if v_pay.id is null and v_uuid then
    select * into v_pay from payments
     where order_id = v_rif::uuid and kind = 'full' and stripe_checkout_session_id is null
     order by created_at desc limit 1;
    v_pay_id := v_pay.id;
  end if;

  select * into v_order from orders
   where id = coalesce(v_pay.order_id, case when v_uuid then v_rif::uuid end);

  if v_order.id is null then
    v_esito := 'ordine_sconosciuto';
    v_dett  := 'metadata.order_id / client_reference_id = ' || coalesce(v_rif, '(assente)');
    v_ok    := false;
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_pagamento_senza_ordine', 'critical', 'webhook_event', p_ev_id,
            'Pagamento Stripe incassato sulla sessione ' || coalesce(v_sess, '(ignota)')
            || ' che dice di essere per un ordine, ma nessun ordine nostro corrisponde (riferimento: '
            || coalesce(v_rif, 'assente') || '). Il denaro c''è, la riga no: va guardato a mano.');

  elsif v_order.service_type <> 'custom_itinerary' then
    -- L'All Inclusive paga acconto e saldo sul conto dell'agenzia assegnata:
    -- è milestone 7, e questo ramo non lo sa trattare. Meglio un alert che un
    -- `in_progress` scritto su un ordine che quello stato non ce l'ha.
    v_esito := 'ordine_di_altro_tipo';
    v_dett  := 'ordine ' || v_order.human_ref || ' di tipo ' || v_order.service_type;
    v_ok    := false;
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_pagamento_ordine_non_gestito', 'critical', 'order', v_order.id,
            'Pagamento Stripe arrivato per l''ordine ' || v_order.human_ref || ' ('
            || v_order.service_type || '), che il ponte non sa ancora trattare. '
            || 'L''ordine non è stato toccato: va registrato a mano.');

  elsif coalesce(v_pstatus, '') <> 'paid' then
    v_esito := 'pagamento_non_ancora_incassato';
    v_dett  := 'payment_status = ' || coalesce(v_pstatus, '(assente)');
    v_ok    := false;
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_pagamento_differito', 'warning', 'order', v_order.id,
            'Sessione Stripe completata ma non ancora incassata (payment_status '
            || coalesce(v_pstatus, 'assente') || ') sull''ordine ' || v_order.human_ref
            || '. L''ordine resta in attesa di pagamento.');

  elsif v_amount is distinct from v_order.proposal_price_cents or v_valuta <> 'eur' then
    -- Il prezzo esiste in un posto solo: `orders.proposal_price_cents`. Se
    -- l'incasso non lo rispecchia, la riga resta `pending` e l'ordine fermo.
    v_esito := 'importo_non_combacia';
    v_dett  := 'incassati ' || coalesce(v_amount::text, 'null') || ' ' || coalesce(v_valuta, '?')
               || ', attesi ' || coalesce(v_order.proposal_price_cents::text, 'null') || ' eur';
    v_ok    := false;
    if v_pay.id is not null and v_pi is not null then
      update payments set stripe_payment_intent_id = v_pi where id = v_pay.id;
    end if;
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_importo_non_combacia', 'critical', 'order', v_order.id,
            'Incasso Stripe che non combacia con la proposta ' || v_order.human_ref || ': arrivati '
            || coalesce(euro_it(v_amount), '(nessun importo)')
            || case when v_valuta = 'eur' then ''
                    else ' MA IN VALUTA ' || upper(coalesce(nullif(v_valuta, ''), '?')) || ', non in euro' end
            || ', attesi ' || coalesce(euro_it(v_order.proposal_price_cents), '(nessun prezzo in proposta)') || '. '
            || 'L''ordine NON è passato in lavorazione. Il caso più probabile è una proposta '
            || 'riaperta e rifatta mentre una cassa vecchia era ancora aperta. Sessione '
            || coalesce(v_sess, '(ignota)') || '.');

  elsif v_order.status <> 'proposal_sent' then
    if v_pay.id is not null and v_pay.status = 'paid'
       and v_order.status in ('in_progress', 'delivered', 'revision_requested', 'completed') then
      -- Lo stesso incasso raccontato due volte (un altro `evt_` per la stessa
      -- sessione): niente da fare, e non è un guasto.
      v_esito := 'gia_pagato';
      v_dett  := 'l''ordine era già pagato con questa sessione';
    else
      v_esito := 'pagamento_su_ordine_non_in_attesa';
      v_dett  := 'l''ordine è in stato ' || v_order.status;
      v_ok    := false;

      v_caso := case
        when v_order.status = 'cancelled' then
          'L''ordine è ANNULLATO: l''incasso va rimborsato.'
        when v_order.status in ('in_progress', 'delivered', 'revision_requested', 'completed') then
          'L''ordine era GIÀ PAGATO con un''altra cassa: è un secondo incasso, e il secondo va rimborsato.'
        when v_order.status in ('requested', 'in_definition') then
          'La proposta era stata RIAPERTA mentre questa cassa era ancora aperta: il viaggiatore ha '
          || 'pagato una proposta che non è più quella corrente. Va deciso con il designer se tenerla '
          || '(e rimandare la proposta) o rimborsare.'
        else
          'L''ordine è in uno stato in cui un pagamento non è previsto.'
      end;

      -- I soldi sono veri e si registrano, se l'indice lo permette.
      v_registrato := false;
      if v_pay.id is not null then
        begin
          update payments set status = 'paid', paid_at = now(),
                              stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id),
                              stripe_checkout_session_id = coalesce(stripe_checkout_session_id, v_sess)
           where id = v_pay.id and status in ('pending', 'expired');
          v_registrato := found;
        exception when unique_violation then
          -- `payments_one_paid_per_kind`: c'è già un incasso riuscito per
          -- questo ordine. La riga resta com'è; il secondo incasso vive su
          -- Stripe e in questo alert.
          v_registrato := false;
        end;
      end if;

      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('stripe_pagamento_su_ordine_non_in_attesa', 'critical', 'order', v_order.id,
              'Pagamento Stripe di ' || coalesce(euro_it(v_amount), '(importo ignoto)') || ' arrivato '
              || 'sull''ordine ' || v_order.human_ref || ' in stato ' || v_order.status || '. '
              || v_caso || ' L''ordine non è stato toccato. '
              || case when v_registrato then 'L''incasso è registrato in payments.'
                      else 'L''incasso NON è registrato in payments (sessione '
                           || coalesce(v_sess, '(ignota)') || '): va guardato su Stripe.' end);
    end if;

  else
    -- Il caso buono.
    if v_pay.id is null then
      select stripe_account, agency_id into v_conto, v_agenzia from payment_account('full');
      insert into payments (order_id, kind, status, amount_cents, currency,
                            stripe_account, agency_id,
                            stripe_checkout_session_id, stripe_payment_intent_id,
                            client_reference_id, paid_at)
      values (v_order.id, 'full', 'paid', v_amount, 'EUR',
              v_conto, v_agenzia, v_sess, v_pi, v_order.id::text, now())
      returning id into v_pay_id;

      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('stripe_riga_pagamento_ricostruita', 'warning', 'order', v_order.id,
              'Il pagamento della proposta ' || v_order.human_ref || ' è arrivato su una sessione '
              || 'senza riga in `payments`: la riga è stata ricostruita dal webhook. Vale la pena '
              || 'guardare i log della route che apre la cassa della proposta.');
    else
      update payments set status = 'paid', paid_at = now(),
                          stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id),
                          stripe_checkout_session_id = coalesce(stripe_checkout_session_id, v_sess)
       where id = v_pay.id;
    end if;

    -- Chi ha agito è il viaggiatore: ha pagato lui. n8n è il mezzo.
    update orders set status = 'in_progress', last_actor = 'traveler' where id = v_order.id;

    v_esito := 'ordine_pagato';
    v_dett  := euro_it(v_amount) || ' incassati, ordine ' || v_order.human_ref || ' in lavorazione';

    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('order', v_order.id, 'stripe_pagata', 'traveler',
            jsonb_build_object('sessione', v_sess, 'payment_intent', v_pi,
                               'importo_cents', v_amount, 'valuta', v_valuta));
  end if;

  return jsonb_build_object('ok', v_ok, 'esito', v_esito, 'dettaglio', v_dett,
                            'order_id', v_order.id, 'payment_id', v_pay_id,
                            'riferimento', v_rif);
end $$;

-- --------------------------------------------------------------------------
-- stripe_webhook (0044): il ramo prenotazioni del ponte Stripe
-- --------------------------------------------------------------------------
create or replace function stripe_webhook(p_corpo text, p_firma text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_body   jsonb;
  v_obj    jsonb;
  v_tipo   text;
  v_evt_id text;
  v_ev_id  uuid;
  v_errore text;

  v_sess     text;
  v_pi       text;
  v_amount   integer;
  v_valuta   text;
  v_pstatus  text;
  v_rif      text;

  v_booking  bookings;
  v_pay      payments;
  v_conto    stripe_account_kind;
  v_agenzia  uuid;

  v_esito     text;
  v_dettaglio text;
  v_ok        boolean := true;
  v_booking_id uuid;
  v_pay_id     uuid;

  v_ordine     jsonb;
  v_order_id   uuid;
begin
  -- ---------------------------------------------------------------- 1. firma
  if not stripe_signature_ok(p_corpo, p_firma) then
    return jsonb_build_object('ok', false, 'esito', 'firma_non_valida',
                              'dettaglio', 'Stripe-Signature non verificata: firma sbagliata, assente o fuori tolleranza');
  end if;

  begin
    v_body := p_corpo::jsonb;
  exception when others then
    return jsonb_build_object('ok', false, 'esito', 'corpo_non_json',
                              'dettaglio', 'il corpo è firmato ma non è JSON valido');
  end;

  v_tipo   := v_body ->> 'type';
  v_evt_id := v_body ->> 'id';
  v_obj    := v_body -> 'data' -> 'object';

  if v_tipo is null or v_evt_id is null or v_obj is null or jsonb_typeof(v_obj) <> 'object' then
    return jsonb_build_object('ok', false, 'esito', 'corpo_non_riconosciuto',
                              'dettaglio', 'manca type, id o data.object, o data.object non è un oggetto');
  end if;

  -- --------------------------------------------------------------- 2. diario
  insert into webhook_events (provider, external_id, event_type, payload)
  values ('stripe', v_evt_id, v_tipo, v_body)
  on conflict (provider, external_id) do nothing
  returning id into v_ev_id;

  if v_ev_id is null then
    select id into v_ev_id
      from webhook_events
     where provider = 'stripe' and external_id = v_evt_id and processed_at is null;

    if v_ev_id is null then
      return jsonb_build_object('ok', true, 'esito', 'duplicato',
                                'dettaglio', 'messaggio già lavorato: nulla da fare');
    end if;
  end if;

  -- --------------------------------------------------------------- 3. lavoro
  begin
    if v_tipo in ('checkout.session.completed', 'checkout.session.expired') then
      v_sess    := v_obj ->> 'id';
      v_pi      := v_obj ->> 'payment_intent';
      v_amount  := nullif(v_obj ->> 'amount_total', '')::integer;
      v_valuta  := lower(coalesce(v_obj ->> 'currency', ''));
      v_pstatus := v_obj ->> 'payment_status';

      if v_sess is not null then
        select * into v_pay from payments where stripe_checkout_session_id = v_sess;
      end if;

      -- ============================================ 0044: lo smistamento
      -- Un ordine se lo dice la nostra riga di pagamento, o se lo dicono i
      -- metadata che la nostra route scrive sulle casse degli ordini.
      if v_pay.order_id is not null
         or (v_pay.id is null and nullif(v_obj -> 'metadata' ->> 'order_id', '') is not null) then
        v_ordine    := stripe_checkout_ordine(v_tipo, v_obj, v_ev_id, v_pay);
        v_esito     := v_ordine ->> 'esito';
        v_dettaglio := v_ordine ->> 'dettaglio';
        v_ok        := (v_ordine ->> 'ok')::boolean;
        v_order_id  := nullif(v_ordine ->> 'order_id', '')::uuid;
        v_pay_id    := nullif(v_ordine ->> 'payment_id', '')::uuid;
        v_rif       := v_ordine ->> 'riferimento';
      else
      -- ============================================ da qui, la 0039

      v_rif := coalesce(v_obj -> 'metadata' ->> 'booking_id', v_obj ->> 'client_reference_id');

      if v_pay.id is null and v_tipo = 'checkout.session.completed'
         and v_rif is not null
         and v_rif ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select * into v_pay from payments
         where booking_id = v_rif::uuid and kind = 'consultation'
           and stripe_checkout_session_id is null
         order by created_at desc limit 1;
      end if;

      v_booking_id := coalesce(
        v_pay.booking_id,
        case when v_rif ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then v_rif::uuid end);
      if v_booking_id is not null then
        select * into v_booking from bookings where id = v_booking_id;
      end if;
      v_pay_id := v_pay.id;

    -- =====================================================================
    if v_tipo = 'checkout.session.completed' then
    -- =====================================================================
      if v_booking.id is null then
        v_esito := 'prenotazione_sconosciuta';
        v_dettaglio := 'metadata.booking_id / client_reference_id = ' || coalesce(v_rif, '(assente)');
        v_ok := false;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_pagamento_senza_prenotazione', 'critical', 'webhook_event', v_ev_id,
                'Pagamento Stripe incassato sulla sessione ' || coalesce(v_sess, '(ignota)')
                || ' che non punta a nessuna prenotazione nostra (riferimento: '
                || coalesce(v_rif, 'assente') || '). Il denaro c''è, la riga no: va guardato a mano.');

      elsif coalesce(v_pstatus, '') <> 'paid' then
        v_esito := 'pagamento_non_ancora_incassato';
        v_dettaglio := 'payment_status = ' || coalesce(v_pstatus, '(assente)');
        v_ok := false;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_pagamento_differito', 'warning', 'booking', v_booking.id,
                'Sessione Stripe completata ma non ancora incassata (payment_status '
                || coalesce(v_pstatus, 'assente') || '). La prenotazione resta in attesa.');

      elsif v_amount is distinct from v_booking.price_cents or v_valuta <> 'eur' then
        v_esito := 'importo_non_combacia';
        v_dettaglio := 'incassati ' || coalesce(v_amount::text, 'null') || ' ' || coalesce(v_valuta, '?')
                       || ', attesi ' || v_booking.price_cents || ' eur';
        v_ok := false;
        if v_pay.id is not null and v_pi is not null then
          update payments set stripe_payment_intent_id = v_pi where id = v_pay.id;
        end if;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_importo_non_combacia', 'critical', 'booking', v_booking.id,
                'Incasso Stripe che non combacia con il prezzo della consulenza: arrivati '
                || coalesce(euro_it(v_amount), '(nessun importo)')
                || case when v_valuta = 'eur' then ''
                        else ' MA IN VALUTA ' || upper(coalesce(nullif(v_valuta, ''), '?')) || ', non in euro' end
                || ', attesi ' || coalesce(euro_it(v_booking.price_cents), '(prezzo non registrato)') || '. '
                || 'La prenotazione NON è stata confermata. Sessione ' || coalesce(v_sess, '(ignota)') || '.');

      elsif v_booking.status = 'confirmed' then
        v_esito := 'gia_confermata';
        v_dettaglio := 'la prenotazione era già confermata';

      elsif v_booking.status <> 'pending_payment' then
        v_esito := 'pagamento_su_prenotazione_chiusa';
        v_dettaglio := 'la prenotazione è in stato ' || v_booking.status;
        v_ok := false;
        if v_pay.id is not null then
          update payments set status = 'paid', paid_at = now(),
                              stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id)
           where id = v_pay.id and status = 'pending';
        end if;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_pagamento_su_prenotazione_chiusa', 'critical', 'booking', v_booking.id,
                'Pagamento Stripe arrivato su una prenotazione in stato ' || v_booking.status
                || ': ' || coalesce(euro_it(v_booking.price_cents), '(importo non registrato)') || ' incassati per uno slot '
                || 'che non è più tenuto. Va rimborsato o va rimessa in piedi la call.');

      else
        if v_pay.id is null then
          select stripe_account, agency_id into v_conto, v_agenzia from consultation_payment_account();
          insert into payments (booking_id, kind, status, amount_cents, currency,
                                stripe_account, agency_id,
                                stripe_checkout_session_id, stripe_payment_intent_id,
                                client_reference_id, paid_at)
          values (v_booking.id, 'consultation', 'paid', v_amount, 'EUR',
                  v_conto, v_agenzia, v_sess, v_pi, v_booking.id::text, now())
          returning id into v_pay_id;

          insert into team_alerts (kind, severity, entity_type, entity_id, message)
          values ('stripe_riga_pagamento_ricostruita', 'warning', 'booking', v_booking.id,
                  'Il pagamento della consulenza è arrivato su una sessione senza riga in '
                  || '`payments`: la riga è stata ricostruita dal webhook. Vale la pena '
                  || 'guardare i log della route che apre la cassa.');
        else
          update payments set status = 'paid', paid_at = now(),
                              stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id),
                              stripe_checkout_session_id = coalesce(stripe_checkout_session_id, v_sess)
           where id = v_pay.id;
          v_pay_id := v_pay.id;
        end if;

        update bookings set
          status       = 'confirmed',
          confirmed_at = now(),
          last_actor   = 'traveler'
         where id = v_booking.id;

        v_esito := 'confermata';
        v_dettaglio := coalesce(euro_it(v_booking.price_cents), '(importo non registrato)') || ' incassati, prenotazione confermata';

        insert into event_log (entity_type, entity_id, event, actor, payload)
        values ('booking', v_booking.id, 'stripe_pagata', 'traveler',
                jsonb_build_object('sessione', v_sess, 'payment_intent', v_pi,
                                   'importo_cents', v_amount, 'valuta', v_valuta));
      end if;

    -- =====================================================================
    elsif v_tipo = 'checkout.session.expired' then
    -- =====================================================================
      if v_pay.id is null then
        v_esito := 'pagamento_sconosciuto';
        v_dettaglio := 'nessuna riga payments per la sessione ' || coalesce(v_sess, '(ignota)');
      elsif v_pay.status <> 'pending' then
        v_esito := 'gia_chiusa';
        v_dettaglio := 'la riga di pagamento è in stato ' || v_pay.status;
      else
        update payments set status = 'expired' where id = v_pay.id;
        v_esito := 'scaduta';
        v_dettaglio := 'cassa scaduta; la prenotazione resta com''è, la libera l''orologio';
      end if;
    end if;

      end if;   -- 0044: fine del ramo prenotazioni

    -- =====================================================================
    elsif v_tipo in ('charge.refunded', 'charge.refund.updated',
                     'refund.created', 'refund.updated', 'refund.failed') then
    -- =====================================================================
      v_esito := 'rimborso_annotato';
      v_dettaglio := v_tipo;
      insert into event_log (entity_type, entity_id, event, actor, payload)
      values ('webhook_event', v_ev_id, 'stripe_rimborso', 'system',
              jsonb_build_object('tipo', v_tipo, 'oggetto', v_obj));

    -- =====================================================================
    else
    -- =====================================================================
      v_esito := 'evento_non_gestito';
      v_dettaglio := 'type ' || v_tipo;
    end if;

  exception when others then
    v_errore := sqlstate || ' ' || sqlerrm;
    v_esito  := 'errore';
    v_ok     := false;
    v_dettaglio := v_errore;
  end;

  -- ------------------------------------------------------------- 4. chiusura
  update webhook_events
     set processed_at = case when v_errore is null then now() else null end,
         error        = v_errore
   where id = v_ev_id;

  if v_esito in ('evento_non_gestito', 'prenotazione_sconosciuta', 'importo_non_combacia',
                 'pagamento_non_ancora_incassato', 'pagamento_su_prenotazione_chiusa',
                 'pagamento_sconosciuto', 'errore',
                 -- 0044
                 'ordine_sconosciuto', 'ordine_di_altro_tipo',
                 'pagamento_su_ordine_non_in_attesa') then
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('webhook_event', v_ev_id, 'stripe_' || v_esito, 'n8n',
            jsonb_build_object('tipo', v_tipo, 'evento', v_evt_id, 'sessione', v_sess,
                               'riferimento', v_rif, 'dettaglio', v_dettaglio));
  end if;

  return jsonb_build_object(
    'ok', v_ok,
    'esito', v_esito,
    'booking_id', v_booking_id,
    'order_id', v_order_id,
    'payment_id', v_pay_id,
    'webhook_event_id', v_ev_id,
    'dettaglio', v_dettaglio);
end $$;

-- ===========================================================================
-- PARTE B — Chi viene avvisato, e di cosa
-- ===========================================================================
-- Fino a oggi, quando un viaggiatore pagava una proposta, il designer lo
-- scopriva solo riaprendo il suo link per caso e il team non lo scopriva
-- affatto. Il Flusso vuole il messaggio «in pagina e via mail»: in pagina
-- c'era, la mail no.
--
-- **Deciso da Simone il 23 settembre:** la mail va al designer **e** agli
-- amministratori (Simone, Alessandro, Andrea).
--
-- ## Due mail diverse, e non per estetica
--
-- Quella al **designer** è una mail di prodotto, come `order_new_td`: ha un
-- testo che riscrive Gaia, porta il link della sua pagina ordine, e parte per
-- ogni ordine pagato. Non si spegne da configurazione, perché senza di lei il
-- designer non sa che deve cominciare e il conto dei giorni di consegna corre.
--
-- Quella agli **amministratori** è una notifica interna, e passa da un
-- meccanismo solo, che serve anche a tutto quello che verrà dopo:
--
--   · `app_config.team_notify_recipients` — la lista dei destinatari interni,
--     separati da virgola;
--   · `app_config.team_notify_events` — l'elenco degli eventi che la usano,
--     separati da virgola.
--
-- Un evento è un nome. Arriva da due parti:
--
--   1. **ogni `kind` di `team_alerts`**, da un trigger sulla tabella. Quindi
--      avvisare il team di un alert che esiste già — `ordine_richiesto`, e
--      domani la disputa e il no-show — è **una parola in più in
--      `team_notify_events`**, da Studio, senza deploy. È il punto aperto
--      «Come si accorge il team che c'è un ordine da lavorare» del PIANO: il
--      meccanismo lo lascia a una riga di configurazione, e la decisione di
--      scriverla resta di Simone;
--   2. **gli eventi che non sono anomalie**, come `ordine_pagato`. Un
--      pagamento andato bene non è un alert, e scriverlo in `team_alerts` per
--      farlo notificare riempirebbe di buone notizie la tabella che il team
--      deve svuotare (e il digest, quando ci sarà, si regge su
--      `resolved_at is null`). Questi chiamano `notifica_team()` dal loro
--      trigger.
--
-- ## Perché non si smista per severità
--
-- È il limite già scritto nel PIANO: `severity` confonde «quanto è grave» con
-- «quanto è urgente». `ordine_richiesto` è un `warning` come una firma
-- rifiutata, ma è un cliente che aspetta. L'elenco nomina gli eventi uno per
-- uno, ed è voluto: una mail per ogni anomalia è il modo sicuro per insegnare
-- al team a ignorarle.
--
-- ## Cosa **non** fa
--
-- Niente digest, niente canale immediato separato: restano parcheggiati per
-- scelta di Simone. E **nessun invio diretto**: si compone e si accoda come
-- ogni altra mail, quindi valgono l'interruttore `email_enabled`, il
-- dirottamento `email_redirect_to` e il tetto di Resend. Il mittente è
-- `email_from`, cioè `info@xpetis.it`.

-- --------------------------------------------------------------------------
-- Il meccanismo
-- --------------------------------------------------------------------------
-- Una riga di coda per destinatario, con `message_kind = 'team_' || evento`.
-- Il prefisso non è decorativo: il vincolo di unicità della coda è su (tipo,
-- entità, destinatario), e con un tipo unico per tutte le notifiche due eventi
-- diversi sullo stesso ordine si ruberebbero la riga. Il testo invece è uno
-- solo, `team_notifica` in `message_templates`: le notifiche interne portano
-- il messaggio che compone chi le chiama, come gli alert.
--
-- Restituisce quante mail ha accodato. Non solleva mai: sta dentro il trigger
-- di un webhook, e un avviso interno che non parte non deve far ritentare
-- Stripe. Se non riesce lo dice con un alert `notifica_team_*`, che per
-- costruzione non si notifica a sua volta — altrimenti un testo rotto
-- produrrebbe un ciclo.
create or replace function notifica_team(
  p_evento      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_titolo      text,
  p_messaggio   text)
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_eventi       text;
  v_destinatari  text;
  v_dest         text;
  v_n            integer := 0;
  m              record;
begin
  select value_text into v_eventi      from app_config where key = 'team_notify_events';
  select value_text into v_destinatari from app_config where key = 'team_notify_recipients';

  -- La riga che manca del tutto è un ramo spento, e un ramo spento lo si dice
  -- (la regola della 0042). Una riga vuota invece è una scelta: nessun evento.
  if v_eventi is null then
    insert into team_alerts (kind, severity, message)
    select 'notifica_team_non_configurata', 'warning',
           'Manca la riga app_config.team_notify_events: nessuna notifica interna parte. '
           || 'Si inserisce da Studio (è in fondo a supabase/seed/0001_config.sql).'
     where not exists (select 1 from team_alerts
                        where kind = 'notifica_team_non_configurata' and resolved_at is null);
    return 0;
  end if;

  if not exists (select 1 from regexp_split_to_table(v_eventi, '\s*,\s*') e
                  where btrim(e) = p_evento) then
    return 0;
  end if;

  -- L'evento è in elenco ma non c'è nessuno a cui dirlo: è lo stesso guasto,
  -- e questa volta con un evento vero che è andato perso.
  if coalesce(btrim(v_destinatari), '') = '' then
    insert into team_alerts (kind, severity, message)
    select 'notifica_team_non_configurata', 'warning',
           'L''evento «' || p_evento || '» è in app_config.team_notify_events ma '
           || 'app_config.team_notify_recipients è vuota: la notifica non è partita. '
           || 'Si scrivono gli indirizzi separati da virgola.'
     where not exists (select 1 from team_alerts
                        where kind = 'notifica_team_non_configurata' and resolved_at is null);
    return 0;
  end if;

  select * into m from render_template(
    'team_notifica',
    jsonb_build_object('titolo', p_titolo, 'messaggio', p_messaggio, 'evento', p_evento));

  for v_dest in
    select distinct btrim(d) from regexp_split_to_table(v_destinatari, '\s*,\s*') d
     where btrim(d) <> ''
  loop
    if accoda_messaggio('team_' || p_evento, p_entity_type, p_entity_id, v_dest,
                        m.subject, m.body_text, email_document(m.body_html, m.subject)) is not null then
      v_n := v_n + 1;
    end if;
  end loop;

  return v_n;
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'notifica_team_fallita', 'warning', p_entity_type, p_entity_id,
         'La notifica interna «' || p_evento || '» non si è composta e non è partita: '
         || sqlerrm || '. Il caso più probabile è il testo team_notifica in message_templates.'
   where not exists (select 1 from team_alerts
                      where kind = 'notifica_team_fallita' and resolved_at is null);
  return 0;
end $$;

comment on function notifica_team(text, text, uuid, text, text) is
  'Accoda una mail per ogni indirizzo di app_config.team_notify_recipients, se '
  'l''evento è in app_config.team_notify_events. Non solleva mai: un avviso '
  'interno che non parte scrive un alert notifica_team_*, che non si notifica.';

-- Sorgente 1: ogni alert è un evento che si chiama come il suo `kind`.
create or replace function on_team_alert_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Gli alert del meccanismo stesso non si notificano: se la notifica è rotta,
  -- notificare che è rotta la romperebbe di nuovo.
  if new.kind like 'notifica_team%' then
    return null;
  end if;

  perform notifica_team(
    new.kind, 'team_alert', new.id,
    case new.severity when 'critical' then '[XPETIS · critico] '
                      when 'warning'  then '[XPETIS · da guardare] '
                      else '[XPETIS] ' end
      || left(new.message, 90) || case when length(new.message) > 90 then '…' else '' end,
    new.message);
  return null;
end $$;

create trigger team_alerts_notify after insert on team_alerts
  for each row execute function on_team_alert_notify();

-- --------------------------------------------------------------------------
-- La mail al designer quando il viaggiatore paga
-- --------------------------------------------------------------------------
-- Stesso link della mail di nascita dell'ordine: il token della pagina ordine
-- è uno per ordine e non scade. Se non c'è — un ordine nato prima della 0044 —
-- non se ne inventa uno qui: la mail non parte e lo dice un alert, perché un
-- designer che non sa di dover cominciare è il guasto che questa mail chiude.
create or replace function accoda_mail_pagata_td(p_order_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  o          record;
  v_token    text;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;   -- la mancanza la dice clock_tick
  end if;

  select o2.id, o2.human_ref, o2.proposal_price_cents, o2.delivery_days,
         td.email as td_email,
         split_part(coalesce(nullif(btrim(td.display_name), ''), ''), ' ', 1) as td_nome,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as viaggiatore
    into o
    from orders o2
    join travel_designers td on td.id = o2.td_id
    join travelers t on t.id = o2.traveler_id
   where o2.id = p_order_id;

  if not found then return null; end if;

  select a.token into v_token
    from access_tokens a
   where a.purpose = 'td_order_page' and a.order_id = o.id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token td_order_page attivo';
  end if;

  select * into m from render_template(
    'order_paid_td',
    jsonb_build_object(
      'saluto', case when coalesce(o.td_nome, '') <> '' then 'Ciao ' || o.td_nome else 'Ciao' end,
      'human_ref', o.human_ref,
      'nome_viaggiatore', coalesce(nullif(o.viaggiatore, ''), 'Chi ha fatto la call con te'),
      'prezzo', euro_it(o.proposal_price_cents),
      'giorni_consegna', case when o.delivery_days = 1 then '1 giorno'
                              else o.delivery_days || ' giorni' end,
      'data_consegna', to_char((now() at time zone 'Europe/Rome')
                               + make_interval(days => o.delivery_days), 'DD/MM/YYYY'),
      'link_ordine', rtrim(v_base, '/') || '/ordine/' || v_token,
      'whatsapp', v_whatsapp));

  return accoda_messaggio('order_paid_td', 'order', o.id, o.td_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order', p_order_id,
         'La mail al designer «il viaggiatore ha pagato» non si è composta e **il designer non '
         || 'sa di dover cominciare**: ' || sqlerrm || '. Sistemato il problema, si rilancia con: '
         || 'select accoda_mail_pagata_td(''' || p_order_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- Il grilletto è lo stato, come per le mail della 0044: `proposal_sent →
-- in_progress` su un su misura vuol dire «pagata», chiunque faccia il passaggio
-- — il ponte Stripe di norma, il team da Studio per un pagamento arrivato per
-- un'altra strada.
create or replace function on_custom_order_paid()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  o record;
begin
  if new.service_type <> 'custom_itinerary' or new.status <> 'in_progress'
     or old.status <> 'proposal_sent' then
    return null;
  end if;

  perform accoda_mail_pagata_td(new.id);

  select td.display_name as td_name, t.full_name as viaggiatore
    into o
    from travel_designers td, travelers t
   where td.id = new.td_id and t.id = new.traveler_id;

  -- Agli amministratori il nome intero: sono il team, non una casella
  -- inoltrabile di un collaboratore esterno.
  perform notifica_team(
    'ordine_pagato', 'order', new.id,
    '[XPETIS] Pagata la proposta ' || new.human_ref || ' · '
      || coalesce(euro_it(new.proposal_price_cents), 'importo non registrato'),
    coalesce(nullif(btrim(o.viaggiatore), ''), 'Il viaggiatore') || ' ha pagato la proposta '
      || new.human_ref || ' di ' || coalesce(o.td_name, 'un designer') || ': '
      || coalesce(euro_it(new.proposal_price_cents), 'importo non registrato') || '. '
      || 'L''ordine è in lavorazione e la consegna è attesa entro il '
      || to_char((now() at time zone 'Europe/Rome') + make_interval(days => new.delivery_days),
                 'DD/MM/YYYY')
      || ' (' || new.delivery_days || case when new.delivery_days = 1 then ' giorno' else ' giorni' end
      || '). Il designer ha ricevuto la sua mail.');
  return null;
end $$;

create trigger orders_custom_paid after update of status on orders
  for each row execute function on_custom_order_paid();

-- ===========================================================================
-- I privilegi
-- ===========================================================================
revoke all on function notifica_team(text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function on_team_alert_notify()                       from public, anon, authenticated;
revoke all on function accoda_mail_pagata_td(uuid)                  from public, anon, authenticated;
revoke all on function on_custom_order_paid()                       from public, anon, authenticated;

-- Per rilanciare a mano dal SQL Editor, come dicono gli alert.
grant execute on function accoda_mail_pagata_td(uuid) to service_role;
