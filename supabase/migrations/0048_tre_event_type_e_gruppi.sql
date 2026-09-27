-- XPETIS · 0048 · Tre event type, tre reti, e i viaggi di gruppo
--
-- Due cose, indipendenti fra loro.
--
--   A. **Le tre reti sui servizi di consulenza.** Dal 27 settembre 2026 i
--      servizi prenotabili sono due e gli event type tre (deviazione 10 del
--      PIANO): la breve `consultation` sempre da 30 minuti, e l'approfondita
--      `consultation_deep` da 60 oppure 90, solo per chi la offre. Tre slug
--      invece di due moltiplicano i modi di sbagliare, e nessuna delle tre
--      difese scritte il 21 settembre era mai stata costruita:
--
--        a. la coppia (designer, slug) è **unica**;
--        b. uno slug fuori elenco su un servizio attivo **blocca la
--           pubblicazione**, e l'elenco sta in `app_config`;
--        c. la durata dello slot vero si confronta con quella a listino alla
--           prima prenotazione, e la differenza alza un alert — **senza
--           rifiutare la prenotazione**.
--
--   B. **I viaggi di gruppo**, sezione nuova del form Vetrina TD (chiave
--      `gruppo`). Solo vetrina, come gli itinerari pronti.
--
-- ===========================================================================
-- PARTE A — Le reti
-- ===========================================================================

-- --------------------------------------------------------------------------
-- a. Un designer, uno slug, un servizio
-- --------------------------------------------------------------------------
-- Il ponte trova il servizio con `where td_id = … and cal_event_type_slug = …
-- order by sort_order limit 1`. Con due servizi dello stesso designer sullo
-- stesso slug — la breve e l'approfondita collegate entrambe a
-- `consulenza-xpetis-30`, per dire — quel `limit 1` sceglie **in silenzio**, e
-- la prenotazione nasce col prezzo dell'altro servizio. `unique (td_id,
-- service_type)` della 0007 non lo impedisce: i due servizi hanno tipi diversi.
--
-- I dati esistenti sono stati controllati prima di scrivere il vincolo (27
-- settembre, database di sviluppo: tre servizi con slug, nessuna coppia
-- doppia). Il blocco qui sotto lo ricontrolla dove la migration viene
-- applicata, e se trova doppioni **li nomina** invece di lasciare a Postgres un
-- «could not create unique index» che non dice quale designer sistemare.
--
-- I `null` non collidono fra loro: itinerario su misura e All Inclusive non
-- hanno event type, e restano liberi.
do $$
declare
  v_doppi text;
begin
  select string_agg(td.slug || ' → ' || d.cal_event_type_slug
                    || ' (' || d.tipi || ')', '; ')
    into v_doppi
    from (select td_id, cal_event_type_slug,
                 string_agg(service_type::text, ', ' order by service_type) as tipi
            from td_services
           where cal_event_type_slug is not null
           group by td_id, cal_event_type_slug
          having count(*) > 1) d
    join travel_designers td on td.id = d.td_id;

  if v_doppi is not null then
    raise exception 'Servizi con lo stesso slug Cal.com sullo stesso designer, da sistemare prima di questa migration: %', v_doppi;
  end if;
end $$;

alter table td_services
  add constraint td_services_one_service_per_slug unique (td_id, cal_event_type_slug);

comment on constraint td_services_one_service_per_slug on td_services is
  'Una prenotazione Cal.com trova il servizio con designer + slug: due servizi '
  'sulla stessa coppia farebbero scegliere il prezzo a caso (0048).';

-- --------------------------------------------------------------------------
-- b. Gli slug attesi, e il blocco sugli altri
-- --------------------------------------------------------------------------
-- Cal.com genera l'URL dell'event type dal titolo, e non in modo prevedibile:
-- lo stesso titolo ha prodotto `consulenza-xpetis-30` su un account e
-- `consulenza-xpetis-30-min` su un altro (`ONBOARDING_CALCOM_TD.md`). Uno slug
-- sbagliato non dà nessun errore da nessuna parte: le prenotazioni arrivano al
-- ponte, che risponde `event_type_non_nostro` e le scarta come appuntamenti
-- privati del designer. Il viaggiatore ha uno slot, noi niente.
--
-- Quindi un servizio attivo con uno slug fuori elenco **non si pubblica**. La
-- rete sta in `td_publish_blockers`, cioè prima che un viaggiatore veda la
-- vetrina, e non nel ponte, dove sarebbe già tardi.
--
-- L'elenco è in `app_config` (seed 0001, gruppo `integrations`), una riga per
-- tipo di servizio, valori separati da virgola:
--
--   calcom_slugs_consultation       consulenza-xpetis-30
--   calcom_slugs_consultation_deep  consulenza-xpetis-60, consulenza-xpetis-90
--
-- Per tipo e non in un elenco solo: la breve collegata a `consulenza-xpetis-60`
-- è esattamente l'errore che la regola vecchia (30 *o* 60 sulla base) lascia
-- in eredità ai tre designer già onboardati, e un elenco unico lo farebbe
-- passare.
--
-- **Senza la riga di configurazione il servizio è bloccato**, e il motivo lo
-- dice. È la scelta prudente: un controllo che si spegne da solo quando manca
-- il suo parametro non è un controllo.
create or replace function calcom_expected_slugs(p_type service_type)
returns text[]
language sql
stable
set search_path = public, extensions
as $$
  select array_remove(
           array(select btrim(s)
                   from unnest(string_to_array(value_text, ',')) s),
           '')
    from app_config
   where key = 'calcom_slugs_' || p_type::text
     and value_text is not null;
$$;

comment on function calcom_expected_slugs(service_type) is
  'Gli slug Cal.com ammessi per un tipo di servizio, letti da '
  'app_config.calcom_slugs_<tipo>. NULL se la riga manca (0048).';

-- `td_publish_blockers` della 0020, riemessa identica più un ramo in fondo.
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
      union all
      -- 0048: lo slug dell'event type deve essere uno di quelli attesi per il
      -- suo tipo di servizio. Solo sui servizi attivi: uno spento non riceve
      -- prenotazioni nuove, e il ponte continua a riconoscerlo per quelle
      -- ancora in volo.
      select case
               when calcom_expected_slugs(sv.service_type) is null then
                 sv.service_type::text || ': manca app_config.calcom_slugs_'
                 || sv.service_type::text || ', gli slug attesi non sono configurati'
               else
                 sv.service_type::text || ': slug Cal.com «' || sv.cal_event_type_slug
                 || '» fuori elenco (attesi: '
                 || array_to_string(calcom_expected_slugs(sv.service_type), ', ')
                 || '). Le prenotazioni verrebbero scartate come non nostre'
             end
        from td_services sv
       where sv.td_id = p_td_id
         and sv.is_active
         and sv.service_type in ('consultation', 'consultation_deep')
         and (calcom_expected_slugs(sv.service_type) is null
              or not (sv.cal_event_type_slug = any (calcom_expected_slugs(sv.service_type))))
    ) b;
$$;

-- Il blocco della 0020 scatta solo quando il profilo **diventa** pubblicato.
-- Uno slug cambiato dopo, su un designer già in vetrina, non passerebbe di lì:
-- questo trigger chiude la porta laterale. Guarda solo la riga scritta, non
-- l'intero profilo — riesaminare tutti i blocchi a ogni modifica di un servizio
-- cambierebbe le regole di tutto ciò che esiste, e non è questo il posto.
create or replace function enforce_service_slug_on_published()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.is_active
     and new.service_type in ('consultation', 'consultation_deep')
     and exists (select 1 from travel_designers
                  where id = new.td_id and status = 'published')
     and (calcom_expected_slugs(new.service_type) is null
          or not (new.cal_event_type_slug = any (calcom_expected_slugs(new.service_type)))) then
    raise exception 'Slug Cal.com «%» non ammesso per % su un designer pubblicato (attesi: %)',
      new.cal_event_type_slug, new.service_type,
      coalesce(array_to_string(calcom_expected_slugs(new.service_type), ', '),
               'nessuno: manca app_config.calcom_slugs_' || new.service_type::text);
  end if;
  return new;
end $$;

create trigger td_services_enforce_slug
  before insert or update of cal_event_type_slug, is_active, service_type on td_services
  for each row execute function enforce_service_slug_on_published();

revoke all on function calcom_expected_slugs(service_type)   from public, anon, authenticated;
revoke all on function enforce_service_slug_on_published()   from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- c. La durata vera contro quella a listino — `calcom_webhook` (0045)
-- --------------------------------------------------------------------------
-- Riemessa parola per parola dalla 0045, salvo tre punti marcati «0048»: due
-- variabili in più, la durata letta insieme al prezzo, e il confronto subito
-- dopo la creazione della riga. `BOOKING_RESCHEDULED` non si controlla: sposta
-- lo slot dentro lo stesso event type, quindi la durata è quella già vista alla
-- creazione.

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
  v_durata    smallint;   -- 0048: la durata a listino
  v_minuti    numeric;    -- 0048: la durata vera dello slot

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
        -- Dalla 0048 la coppia (designer, slug) è unica per vincolo, quindi
        -- questa riga ne trova al massimo una: `order by ... limit 1` non
        -- sceglie più in silenzio fra due prezzi. Resta per non cambiare forma.
        select service_type, price_cents, duration_minutes
          into v_srv_type, v_price, v_durata
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

              -- 0048 · LA DURATA DICHIARATA CONTRO QUELLA VERA. Con tre event
              -- type (30, 60, 90) collegare il servizio all'event type
              -- sbagliato è facile, e il sintomo è un viaggiatore che paga
              -- un'ora e ne riceve mezza. Cal.com non lo sa: lo sappiamo noi,
              -- perché il messaggio porta inizio e fine dello slot vero.
              --
              -- La prenotazione è GIÀ creata e resta: il viaggiatore ha uno
              -- slot vero, e rifiutarlo lo lascerebbe con una call che per noi
              -- non esiste. L'alert parte alla prima prenotazione, che è il
              -- primo momento in cui l'errore diventa visibile.
              v_minuti := round(extract(epoch from (v_end - v_start)) / 60);
              if v_durata is not null and v_minuti is not null
                 and v_minuti <> v_durata then
                v_dettaglio := 'durata a listino ' || v_durata || ' min, slot di '
                               || v_minuti || ' min';
                insert into team_alerts (kind, severity, entity_type, entity_id, message)
                values ('calcom_durata_non_combacia', 'critical', 'booking', v_new_id,
                        'Prenotazione su ' || v_slug || ' del designer ' || v_username
                        || ': il listino dice ' || v_durata || ' minuti ('
                        || coalesce(euro_it(v_price), 'prezzo non registrato')
                        || '), lo slot su Cal.com ne dura ' || v_minuti
                        || '. Il servizio è collegato all''event type sbagliato, o l''event '
                        || 'type ha la durata sbagliata. La prenotazione è stata creata '
                        || 'comunque: va sistemato l''event type e deciso cosa fare di '
                        || 'questa call.');
              end if;
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

-- `create or replace` conserva i privilegi della 0037 (execute solo a
-- service_role): non serve ripeterli.

-- ===========================================================================
-- PARTE B — I viaggi di gruppo
-- ===========================================================================
-- Il form Vetrina TD nuovo (`vetrina_nuova.json`, chiave `gruppo`) raccoglie i
-- viaggi di gruppo che il designer accompagna: `titolo`, `date`, `giorni`,
-- `persone`, `prezzo`, `img`. È la gemella di `td_ready_itineraries` (0026) con
-- due campi in più, data e numero di persone.
--
-- **Tutto testo libero**, come già deciso per durata e prezzo degli itinerari:
-- il form dà «14 – 25 set 2025», «10 persone», «1.380€», e trasformarli in date
-- e numeri vorrebbe dire indovinare su 25 designer che li scrivono ciascuno a
-- modo suo. Nessuna logica, nessuna cassa, nessun ordine: si mostrano e basta.
--
-- ⚠️ **Una differenza con gli itinerari c'è, e qui non si risolve: un viaggio
-- di gruppo scade.** Un itinerario pronto è sempre valido, una partenza del
-- settembre 2025 no — e i tre esempi del form sono già passati. Con la data
-- come testo niente può nasconderla da sola. Chi toglie dalla vetrina una
-- partenza finita è una domanda aperta in `PIANO.md`; qui non si inventa un
-- campo che il form non dà.
--
-- Niente `slug`, a differenza degli itinerari dopo la 0033: un viaggio di
-- gruppo oggi non ha una pagina sua. Se il nodo Figma 3-1121 la prevede, lo
-- slug si aggiunge con la pagina.
create table td_group_trips (
  id             uuid primary key default gen_random_uuid(),
  td_id          uuid not null references travel_designers(id) on delete cascade,
  position       smallint not null check (position > 0),
  title          text not null check (length(btrim(title)) > 0),
  dates_label    text,
  duration_label text,
  group_size_label text,
  price_label    text,
  image_path     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (td_id, position)
);
create index td_group_trips_td_idx on td_group_trips (td_id, position);

create trigger td_group_trips_touch before update on td_group_trips
  for each row execute function set_updated_at();

comment on table td_group_trips is
  'Viaggi di gruppo del designer, chiave `gruppo` del form Vetrina TD. Vetrina, '
  'non catalogo: nessun pagamento nasce da qui. ATTENZIONE: scadono, e nessun '
  'campo lo dice (domanda aperta in PIANO.md).';
comment on column td_group_trips.dates_label is
  'Date della partenza come le scrive il designer ("14 – 25 set 2025"). Testo, '
  'non date: niente la nasconde quando è passata.';
comment on column td_group_trips.duration_label is
  'Campo `giorni` del form, testo libero ("12 giorni").';
comment on column td_group_trips.group_size_label is
  'Campo `persone` del form, testo libero ("10 persone").';
comment on column td_group_trips.price_label is
  'Campo `prezzo` del form. Testo, non centesimi: è vetrina, come '
  'td_ready_itineraries.price_label (0026).';
comment on column td_group_trips.image_path is
  'Campo `img` del form. Percorso nel bucket, bucket compreso (td-media/<slug>/…).';

alter table td_group_trips enable row level security;
revoke all on td_group_trips from anon, authenticated;

-- --------------------------------------------------------------------------
-- La vetrina pubblica: una colonna in coda
-- --------------------------------------------------------------------------
-- Cosa diventa leggibile con gli strumenti di sviluppo aperti: esattamente ciò
-- che la vetrina mostra — titolo, date, durata, persone, prezzo e percorso
-- dell'immagine — solo per i designer pubblicati. Niente che il viaggiatore non
-- legga comunque sulla pagina.
--
-- `create or replace` come nella 0040: le colonne restano uguali in ordine e
-- tipo, `group_trips` si aggiunge in fondo e il `grant` non si perde.
create or replace view public_td_showcase as
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
    coalesce(i.itineraries,'[]'::jsonb) as ready_itineraries,
    td.cal_username,
    coalesce(g.group_trips,'[]'::jsonb) as group_trips
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
             'cal_event_type_slug', sv.cal_event_type_slug,
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
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'title',            gt.title,
             'dates_label',      gt.dates_label,
             'duration_label',   gt.duration_label,
             'group_size_label', gt.group_size_label,
             'price_label',      gt.price_label,
             'image_path',       gt.image_path
           ) order by gt.position) as group_trips
      from td_group_trips gt where gt.td_id = td.id
  ) g on true
  where td.status = 'published';

comment on view public_td_showcase is
  'La vetrina di un designer pubblicato. Contiene cal_username e '
  'cal_event_type_slug perché l''embed di Cal.com si apre nel browser e senza '
  'quei due pezzi non si può costruire il link. Non contiene cal_booking_uid, '
  'che dopo S-05 è una credenziale di cancellazione (vedi 0019). Dalla 0048 '
  'porta anche i viaggi di gruppo, in coda.';
