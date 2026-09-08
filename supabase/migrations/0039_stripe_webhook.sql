-- XPETIS · 0039 · Il ponte Stripe → `payments` e `bookings`, dentro il database
--
-- Stesso disegno del ponte Cal.com della 0037, e di proposito: due ponti
-- identici nella forma sono due ponti che una persona sola può tenere in testa.
-- n8n riceve il messaggio, passa qui il **corpo grezzo** e la firma, e non
-- guarda dentro; tutta la decisione vive in questa funzione.
--
-- Quello che cambia rispetto alla 0037 non è la forma, sono tre dettagli del
-- protocollo, e sono esattamente i punti in cui copiare l'altro ponte sarebbe
-- stato un errore:
--
--  1. **La firma non è la stessa.** Cal.com firma il corpo; Stripe firma
--     `"<timestamp>.<corpo>"` e manda l'header in un formato a coppie, con una
--     finestra di tolleranza oltre la quale il messaggio si rifiuta.
--  2. **Il diario è più semplice.** Stripe manda un `id` di evento (`evt_…`),
--     quindi `webhook_events.external_id` è quello e basta. La chiave composta
--     della 0037 serviva perché Cal.com un id non lo dà.
--  3. **Qui passano i soldi.** Un messaggio Cal.com sbagliato produce una riga
--     sbagliata; un messaggio Stripe sbagliato produce una consulenza confermata
--     che nessuno ha pagato, o un incasso che nessuno riconosce. Per questo
--     l'importo si ricontrolla contro `bookings.price_cents` prima di
--     confermare, e ogni scarto è un alert al team invece di un silenzio.

-- ===========================================================================
-- Su quale conto incassa una consulenza
-- ===========================================================================
-- La **deviazione 9** di `PIANO.md` (6 settembre 2026): incassa l'agenzia
-- affiliata, perché XPETIS come entità legale non esiste. Lo schema era già
-- pronto — `payments.stripe_account` è un enum `xpetis | agency` e
-- `payments_agency_required` obbliga l'`agency_id` — ma il **default della
-- colonna resta `xpetis` e non si tocca**: fino all'attivazione dell'agenzia i
-- test girano sulla nostra sandbox.
--
-- Quale conto incassa è quindi un parametro, non una costante: `app_config`,
-- riga `consultation_stripe_account`, e passare all'agenzia è una riga da Studio
-- invece di un deploy.
--
-- La funzione sta qui e non nella route perché la stessa risposta serve in due
-- posti — la route quando apre la cassa, questo ponte quando deve ricostruire
-- una riga di pagamento che manca — e due letture dello stesso parametro sono
-- due occasioni di divergere.
create or replace function consultation_payment_account()
returns table (stripe_account stripe_account_kind, agency_id uuid)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_conto text;
  v_agenzia uuid;
begin
  select value_text into v_conto from app_config where key = 'consultation_stripe_account';

  if v_conto is null or btrim(v_conto) = '' then
    raise exception 'Manca app_config.consultation_stripe_account: su quale conto incassa una consulenza non si inventa';
  end if;

  v_conto := lower(btrim(v_conto));
  if v_conto not in ('xpetis', 'agency') then
    raise exception 'app_config.consultation_stripe_account vale "%", che non è né xpetis né agency', v_conto;
  end if;

  if v_conto = 'agency' then
    -- `payments_agency_required` lo pretende per vincolo: senza agenzia la riga
    -- di pagamento non si scrive, e fallire qui con una frase leggibile è
    -- meglio che fallire dopo su un messaggio di violazione di check.
    select id into v_agenzia from agencies where is_default_partner and is_active;
    if v_agenzia is null then
      raise exception 'app_config dice che incassa l''agenzia, ma non c''è nessuna agenzia partner attiva';
    end if;
  end if;

  return query select v_conto::stripe_account_kind, v_agenzia;
end $$;

comment on function consultation_payment_account() is
  'Su quale conto Stripe incassa una consulenza, e con quale agenzia se non è il '
  'nostro. Letto da app_config.consultation_stripe_account (deviazione 9 del PIANO): '
  'passare all''agenzia è una riga da Studio, non un deploy.';

-- ===========================================================================
-- La parola segreta
-- ===========================================================================
-- In Supabase Vault accanto a `calcom_webhook_secret`, per la stessa ragione:
-- una migration è versionata e finisce su GitHub e in ogni copia della cartella.
-- Si inserisce una volta a mano, dal SQL Editor:
--
--   select vault.create_secret('<lo signing secret whsec_… di Stripe>',
--                              'stripe_webhook_secret',
--                              'Firma dei webhook Stripe (header Stripe-Signature)');
--
-- `ACCESSI.md` dice che esiste e dove sta; il valore no.
--
-- Sull'harness lo schema `vault` non esiste: la guardia con `to_regclass` e la
-- lettura via `execute` servono a questo — una query statica su
-- `vault.decrypted_secrets` non compilerebbe dove quello schema manca.
create or replace function stripe_webhook_secret()
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
    raise exception 'Supabase Vault non disponibile: la parola segreta di Stripe non si può leggere';
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_secret using 'stripe_webhook_secret';

  if v_secret is null or btrim(v_secret) = '' then
    raise exception 'Nessun segreto "stripe_webhook_secret" nel Vault: il ponte Stripe non può verificare le firme';
  end if;

  return v_secret;
end $$;

comment on function stripe_webhook_secret() is
  'Lo signing secret con cui Stripe firma i webhook, letto da Supabase Vault. '
  'Non sta in nessun file versionato.';

-- ===========================================================================
-- La firma
-- ===========================================================================
-- NON è quella di Cal.com, e copiarla sarebbe stato il modo più veloce di
-- costruire un ponte che sembra giusto. L'header `Stripe-Signature` è un elenco
-- di coppie separate da virgola:
--
--   t=1788797899,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
--
-- L'HMAC-SHA256 si calcola su `"<t>" || "." || <corpo grezzo>`, non sul solo
-- corpo. Le coppie possono essere più di due: durante una rotazione del segreto
-- Stripe manda **due `v1`**, uno per segreto, e ne basta uno che combaci —
-- accettarne uno solo farebbe cadere il ponte esattamente nel momento in cui si
-- cambia la parola segreta. Le versioni vecchie (`v0`) si ignorano.
--
-- ## La finestra di tolleranza, e perché il numero sta qui e non in `app_config`
--
-- Senza un limite di età, una firma valida intercettata resta valida per sempre:
-- chi si è procurato un `checkout.session.completed` firmato può rigiocarlo fra
-- un mese. Il diario lo fermerebbe (stesso `evt_`, `duplicato`), ma un ponte non
-- si difende su una difesa sola.
--
-- I cinque minuti sono quelli raccomandati da Stripe, e sono l'eccezione
-- consapevole alla regola "nessun numero nel codice" di `CLAUDE.md`: quella
-- regola esiste per i **parametri di prodotto**, che il team cambia da Studio
-- senza deploy. Nessuno in XPETIS regolerà mai la finestra di replay di un
-- webhook, mentre una riga `app_config` mancante o messa a zero disattiverebbe
-- in silenzio la protezione — un parametro di sicurezza che si guasta aprendo è
-- peggio del numero scritto. Resta un argomento con default, così un test può
-- spostarlo senza toccare la funzione.
create or replace function stripe_signature_ok(
  p_corpo text,
  p_firma text,
  p_tolleranza_sec integer default 300)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_pezzo  text;
  v_chiave text;
  v_valore text;
  v_t_raw  text;
  v_t      bigint;
  v_atteso text;
begin
  if p_corpo is null or p_firma is null or btrim(p_firma) = '' then
    return false;
  end if;

  -- Primo giro: il timestamp. Si tiene la stringa ESATTA che è arrivata, non il
  -- numero: è quella che entra nell'HMAC, e un `1788797899` riscritto da un
  -- `bigint` coinciderebbe quasi sempre — quasi.
  foreach v_pezzo in array string_to_array(p_firma, ',') loop
    v_pezzo  := btrim(v_pezzo);
    v_chiave := split_part(v_pezzo, '=', 1);
    if v_chiave = 't' then
      v_t_raw := substr(v_pezzo, length(v_chiave) + 2);
    end if;
  end loop;

  if v_t_raw is null or v_t_raw !~ '^[0-9]+$' then
    return false;
  end if;
  v_t := v_t_raw::bigint;

  -- Fuori finestra: il messaggio si rifiuta prima ancora di calcolare l'HMAC.
  -- `abs` e non solo il passato: un timestamp molto nel futuro è altrettanto
  -- poco credibile, e accettarlo darebbe a un messaggio una validità lunga
  -- quanto lo scarto.
  if abs(extract(epoch from now())::bigint - v_t) > p_tolleranza_sec then
    return false;
  end if;

  v_atteso := encode(
    hmac(convert_to(v_t_raw || '.' || p_corpo, 'utf8'),
         convert_to(stripe_webhook_secret(), 'utf8'),
         'sha256'),
    'hex');

  -- Secondo giro: uno qualunque dei `v1` che combaci basta (rotazione del
  -- segreto). Il confronto non è a tempo costante, per la stessa ragione
  -- scritta nella 0037: misurare microsecondi attraverso Railway, n8n e
  -- PostgREST è rumore, non segnale.
  foreach v_pezzo in array string_to_array(p_firma, ',') loop
    v_pezzo  := btrim(v_pezzo);
    v_chiave := split_part(v_pezzo, '=', 1);
    if v_chiave = 'v1' then
      v_valore := lower(btrim(substr(v_pezzo, length(v_chiave) + 2)));
      if v_valore = v_atteso then
        return true;
      end if;
    end if;
  end loop;

  return false;
end $$;

comment on function stripe_signature_ok(text, text, integer) is
  'Verifica l''header Stripe-Signature: HMAC-SHA256 di "<t>.<corpo grezzo>", '
  'con finestra di tolleranza (5 minuti) contro il rigioco di una firma valida '
  'intercettata. Accetta più v1, perché durante una rotazione del segreto Stripe '
  'ne manda due.';

-- ===========================================================================
-- Il ponte
-- ===========================================================================
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
begin
  -- ---------------------------------------------------------------- 1. firma
  -- Come per Cal.com: firma non valida, il messaggio non entra nemmeno nel
  -- diario. L'indirizzo del webhook è pubblico, e una riga per ogni corpo
  -- arbitrario che arriva farebbe di `webhook_events` una discarica scrivibile
  -- da chiunque. n8n conserva comunque l'esecuzione con la sua risposta.
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

  -- `jsonb_typeof` e non `is null`, per la ragione della 0037: un
  -- `"object": null` dà un jsonb di tipo null, che in SQL non è NULL.
  if v_tipo is null or v_evt_id is null or v_obj is null or jsonb_typeof(v_obj) <> 'object' then
    return jsonb_build_object('ok', false, 'esito', 'corpo_non_riconosciuto',
                              'dettaglio', 'manca type, id o data.object, o data.object non è un oggetto');
  end if;

  -- --------------------------------------------------------------- 2. diario
  -- Qui il ponte è più semplice dell'altro: Stripe manda un identificativo di
  -- evento e la chiave è quello. Nessuna composizione, nessun `createdAt` da
  -- appendere — quella della 0037 esiste solo perché Cal.com un id non lo dà.
  insert into webhook_events (provider, external_id, event_type, payload)
  values ('stripe', v_evt_id, v_tipo, v_body)
  on conflict (provider, external_id) do nothing
  returning id into v_ev_id;

  if v_ev_id is null then
    -- Doppio scatto. Se il tentativo precedente si era fermato su un errore
    -- (`processed_at` nullo), il ritentativo di Stripe è un'occasione da usare.
    select id into v_ev_id
      from webhook_events
     where provider = 'stripe' and external_id = v_evt_id and processed_at is null;

    if v_ev_id is null then
      return jsonb_build_object('ok', true, 'esito', 'duplicato',
                                'dettaglio', 'messaggio già lavorato: nulla da fare');
    end if;
  end if;

  -- --------------------------------------------------------------- 3. lavoro
  -- Dentro un blocco con gestore: se qualcosa va storto il lavoro torna
  -- indietro ma la riga di diario, inserita prima, resta leggibile su Studio.
  begin
    if v_tipo in ('checkout.session.completed', 'checkout.session.expired') then
      v_sess    := v_obj ->> 'id';
      v_pi      := v_obj ->> 'payment_intent';
      v_amount  := nullif(v_obj ->> 'amount_total', '')::integer;
      v_valuta  := lower(coalesce(v_obj ->> 'currency', ''));
      v_pstatus := v_obj ->> 'payment_status';

      -- Il filo con la prenotazione. `metadata.booking_id` è quello che scrive
      -- la nostra route; `client_reference_id` porta lo stesso valore ed è la
      -- rete se un giorno la cassa la aprisse qualcun altro.
      v_rif := coalesce(v_obj -> 'metadata' ->> 'booking_id', v_obj ->> 'client_reference_id');

      if v_sess is not null then
        select * into v_pay from payments where stripe_checkout_session_id = v_sess;
      end if;
      -- **Il ripiego "cerca per prenotazione" vale solo sul pagamento riuscito**,
      -- e la distinzione non è pignoleria. Su un `completed` la sessione
      -- sconosciuta significa che la route ha aperto la cassa e non è riuscita a
      -- registrarla: risalire dalla prenotazione ricuce il registro.
      -- Su un `expired` lo stesso ripiego farebbe danno: la cassa scaduta
      -- potrebbe essere una vecchia, e la riga `pending` che si troverebbe per
      -- quella prenotazione sarebbe quella NUOVA, ancora viva. La chiuderemmo
      -- mentre il viaggiatore ci sta pagando dentro. Una scadenza si applica
      -- solo alla sessione che la porta.
      --
      -- E anche sul `completed` il ripiego prende **solo una riga che non ha
      -- ancora una sessione**: è quella, e solo quella, la riga che la route ha
      -- creato senza riuscire a completarla. Una riga che porta già un'altra
      -- sessione racconta un altro pagamento, e attaccarci sopra questo
      -- scriverebbe l'incasso sulla cassa sbagliata; meglio non trovarla e
      -- ricostruirne una nuova con il suo vero identificativo.
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
    end if;

    -- =====================================================================
    if v_tipo = 'checkout.session.completed' then
    -- =====================================================================
      if v_booking.id is null then
        -- Soldi incassati e nessuna prenotazione a cui attaccarli. È il caso
        -- peggiore del ponte e non ha una riparazione automatica: qualcuno deve
        -- guardare l'incasso su Stripe e decidere.
        v_esito := 'prenotazione_sconosciuta';
        v_dettaglio := 'metadata.booking_id / client_reference_id = ' || coalesce(v_rif, '(assente)');
        v_ok := false;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_pagamento_senza_prenotazione', 'critical', 'webhook_event', v_ev_id,
                'Pagamento Stripe incassato sulla sessione ' || coalesce(v_sess, '(ignota)')
                || ' che non punta a nessuna prenotazione nostra (riferimento: '
                || coalesce(v_rif, 'assente') || '). Il denaro c''è, la riga no: va guardato a mano.');

      elsif coalesce(v_pstatus, '') <> 'paid' then
        -- Con i metodi a notifica differita Stripe manda `completed` mentre
        -- l'incasso è ancora per aria. Confermare qui vorrebbe dire regalare
        -- una consulenza: si aspetta, e la conferma arriverà con l'evento
        -- successivo. Se non arriva, l'orologio libera lo slot.
        v_esito := 'pagamento_non_ancora_incassato';
        v_dettaglio := 'payment_status = ' || coalesce(v_pstatus, '(assente)');
        v_ok := false;
        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_pagamento_differito', 'warning', 'booking', v_booking.id,
                'Sessione Stripe completata ma non ancora incassata (payment_status '
                || coalesce(v_pstatus, 'assente') || '). La prenotazione resta in attesa.');

      elsif v_amount is distinct from v_booking.price_cents or v_valuta <> 'eur' then
        -- Lo scarto non si conferma in silenzio. Il prezzo esiste in un posto
        -- solo — `bookings.price_cents` — e se l'incasso non lo rispecchia, o
        -- la cassa è stata aperta con un importo che non veniva da lì, o è
        -- arrivato il pagamento di qualcun altro. La riga di pagamento resta
        -- `pending` di proposito: marcarla `paid` con un importo che non
        -- combacia renderebbe il registro sbagliato quanto il silenzio.
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
                || coalesce((v_amount / 100.0)::text, 'null') || ' ' || upper(coalesce(v_valuta, '?'))
                || ', attesi ' || (v_booking.price_cents / 100.0)::text || ' EUR. '
                || 'La prenotazione NON è stata confermata. Sessione ' || coalesce(v_sess, '(ignota)') || '.');

      elsif v_booking.status = 'confirmed' then
        -- Ritentativo di Stripe con una chiave di diario diversa, o due eventi
        -- per lo stesso incasso: niente da fare, e non è un guasto.
        v_esito := 'gia_confermata';
        v_dettaglio := 'la prenotazione era già confermata';

      elsif v_booking.status <> 'pending_payment' then
        -- Il caso che succederà davvero: l'orologio dei 5 minuti libera lo slot
        -- al minuto 30 e il pagamento arriva al minuto 30 e qualcosa. I soldi
        -- sono veri e vanno registrati; la prenotazione no, perché lo slot su
        -- Cal.com è già stato dato via.
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
                || ': ' || (v_booking.price_cents / 100.0)::text || ' € incassati per uno slot '
                || 'che non è più tenuto. Va rimborsato o va rimessa in piedi la call.');

      else
        -- Il caso buono.
        if v_pay.id is null then
          -- Nessuna riga di pagamento per una sessione che il nostro server ha
          -- aperto: la route era arrivata a creare la cassa e non a scrivere la
          -- riga. Il registro si ricostruisce qui invece di restare monco, con
          -- il conto letto dallo stesso posto da cui lo legge la route.
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
          -- Chi ha agito è il viaggiatore: ha pagato lui. n8n è il mezzo, e
          -- `booking_status_history` deve dire chi — è l'unica prova, dato che
          -- il designer non ha login.
          last_actor   = 'traveler'
         where id = v_booking.id;

        v_esito := 'confermata';
        v_dettaglio := (v_booking.price_cents / 100.0)::text || ' € incassati, prenotazione confermata';

        insert into event_log (entity_type, entity_id, event, actor, payload)
        values ('booking', v_booking.id, 'stripe_pagata', 'traveler',
                jsonb_build_object('sessione', v_sess, 'payment_intent', v_pi,
                                   'importo_cents', v_amount, 'valuta', v_valuta));
      end if;

    -- =====================================================================
    elsif v_tipo = 'checkout.session.expired' then
    -- =====================================================================
      -- **Solo la riga di pagamento.** La prenotazione non si tocca e lo slot
      -- non si libera: cancellare su Cal.com è compito dell'orologio dei 5
      -- minuti, e il liberamento degli slot deve avvenire in un posto solo.
      -- Due posti che liberano lo stesso slot sono due posti che possono
      -- liberarlo mentre l'altro lo sta pagando.
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

    -- =====================================================================
    elsif v_tipo in ('charge.refunded', 'charge.refund.updated',
                     'refund.created', 'refund.updated', 'refund.failed') then
    -- =====================================================================
      -- Si annota e basta. Le regole di rimborso sono milestone 5, e finché non
      -- ci sono un rimborso che cambia stati da solo è peggio di un rimborso
      -- che qualcuno legge: dopo la deviazione 9 il tasto "rimborsa" è in mano
      -- all'agenzia, quindi ciò che arriva qui può essere già stato deciso da
      -- qualcun altro.
      v_esito := 'rimborso_annotato';
      v_dettaglio := v_tipo;
      insert into event_log (entity_type, entity_id, event, actor, payload)
      values ('webhook_event', v_ev_id, 'stripe_rimborso', 'system',
              jsonb_build_object('tipo', v_tipo, 'oggetto', v_obj));

    -- =====================================================================
    else
    -- =====================================================================
      -- L'endpoint riceve quello che l'iscrizione su Stripe gli manda: se un
      -- giorno qualcuno allarga l'iscrizione, gli eventi in più si annotano
      -- invece di far rumore.
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
  -- `processed_at` resta nullo solo sugli errori: così un ritentativo di Stripe
  -- riprova invece di fermarsi sul duplicato, e la vista degli insoluti mostra
  -- esattamente i messaggi da guardare.
  update webhook_events
     set processed_at = case when v_errore is null then now() else null end,
         error        = v_errore
   where id = v_ev_id;

  if v_esito in ('evento_non_gestito', 'prenotazione_sconosciuta', 'importo_non_combacia',
                 'pagamento_non_ancora_incassato', 'pagamento_su_prenotazione_chiusa',
                 'pagamento_sconosciuto', 'errore') then
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('webhook_event', v_ev_id, 'stripe_' || v_esito, 'n8n',
            jsonb_build_object('tipo', v_tipo, 'evento', v_evt_id, 'sessione', v_sess,
                               'riferimento', v_rif, 'dettaglio', v_dettaglio));
  end if;

  -- Sempre un esito, mai un errore: n8n deve poter rispondere 2xx. Un 500
  -- ripetuto porta Stripe a disattivare l'endpoint, e con lui ogni conferma di
  -- pagamento. La difesa contro il doppio scatto è già nel database.
  return jsonb_build_object(
    'ok', v_ok,
    'esito', v_esito,
    'booking_id', v_booking_id,
    'payment_id', v_pay_id,
    'webhook_event_id', v_ev_id,
    'dettaglio', v_dettaglio);
end $$;

comment on function stripe_webhook(text, text) is
  'Il ponte Stripe → payments/bookings. Riceve il corpo grezzo e l''header '
  'Stripe-Signature, verifica l''HMAC con la finestra di tolleranza, registra il '
  'messaggio in webhook_events e applica l''effetto: conferma della prenotazione '
  'solo se l''importo incassato combacia con bookings.price_cents ed è in EUR, '
  'scadenza della sola riga di pagamento, rimborsi annotati. Non solleva mai: '
  'restituisce sempre un esito, perché n8n deve rispondere 2xx.';

-- ===========================================================================
-- Chi può chiamarle
-- ===========================================================================
-- Solo `service_role`, cioè la chiave secret che vive lato server. `anon` e
-- `authenticated` non devono nemmeno vederle: sono in SECURITY DEFINER e
-- confermano prenotazioni.
revoke all on function consultation_payment_account()               from public;
revoke all on function stripe_webhook_secret()                      from public;
revoke all on function stripe_signature_ok(text, text, integer)     from public;
revoke all on function stripe_webhook(text, text)                   from public;

grant execute on function stripe_webhook(text, text)      to service_role;
grant execute on function consultation_payment_account()  to service_role;
