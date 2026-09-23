-- XPETIS · 0042 · Le firme Cal.com rifiutate, contate invece che perse
--
-- Prima dell'onboarding dei 25, perché è il momento in cui il problema si
-- manifesta.
--
-- ===========================================================================
-- IL SILENZIO CHE QUESTA MIGRATION ROMPE
-- ===========================================================================
-- Se la parola segreta del webhook di un designer è sbagliata — una lettera in
-- meno incollata durante la configurazione — succede questo: Cal.com manda il
-- messaggio, `calcom_webhook()` risponde `firma_non_valida`, **non scrive niente
-- da nessuna parte**, n8n risponde 200 e Cal.com è contento. Quel designer ha
-- smesso di arrivarci e nessuno lo sa. L'unica traccia è nel log delle
-- esecuzioni di n8n, che nessuno guarda.
--
-- Il "non scrive niente" della 0037 **non è un difetto e non si annulla**:
-- l'indirizzo del webhook è pubblico, e una riga in `webhook_events` per ogni
-- corpo arbitrario che arriva ne farebbe una discarica scrivibile da chiunque.
-- Quel ragionamento resta valido. Quello che cambia è che adesso si tiene un
-- **contatore** — una riga per ora, non una per messaggio — e l'orologio
-- decide quando è troppo.
--
-- Con 25 account configurati a mano, che almeno uno sia sbagliato non è un
-- rischio: è una previsione.

-- ===========================================================================
-- Il contatore
-- ===========================================================================
create table calcom_signature_rejections (
  id                bigint generated always as identity primary key,
  -- L'ora piena in cui è caduto il rifiuto. Il raggruppamento per ora è la
  -- ragione per cui questa tabella non cresce: 25 designer che sbagliano tutti
  -- insieme fanno 26 righe l'ora, non una per messaggio.
  bucket_at         timestamptz not null,
  -- ⚠️ **UN INDIZIO, NON UNA PROVA, ed è la decisione difficile di questo file.**
  --
  -- Su una firma non valida il corpo **non è autenticato**: leggerne
  -- `organizer.username` significa leggere un dato che chiunque può scrivere,
  -- perché l'indirizzo del webhook è pubblico. Il caso contro il salvarlo è
  -- questo, ed è serio.
  --
  -- Il caso a favore è che senza, l'alert dice "qualcuno manda firme sbagliate"
  -- e con 25 account il team non sa da dove cominciare: è la differenza fra un
  -- alert utile e uno decorativo.
  --
  -- Si salva, e il rischio si riduce alla fonte invece che nel testo dell'alert:
  -- **si scrive solo un username che è già uno dei nostri.** Qualunque altra
  -- cosa diventa `null`. Quindi il peggio che può fare chi scrive corpi finti
  -- all'indirizzo pubblico è indicare al team uno dei 25 designer veri — non
  -- inserire testo arbitrario in un alert, non far comparire nomi inventati, e
  -- non far crescere questa tabella oltre 26 righe l'ora.
  --
  -- E resta un indizio: **nessun automatismo agisce su questo valore**, l'alert
  -- lo dichiara non verificato, e il controllo che il team fa dopo (rigenerare
  -- la parola segreta di quell'account, rifare la prenotazione di prova) è
  -- innocuo anche se il nome era quello sbagliato.
  --
  -- Nota infine che nel caso più probabile — la parola segreta sbagliata in
  -- onboarding — il nome è **vero**, perché a mandare il messaggio è davvero
  -- Cal.com.
  cal_username_hint text,
  n                 integer not null default 0 check (n >= 0),
  first_at          timestamptz not null default now(),
  last_at           timestamptz not null default now()
);

-- `coalesce` come negli indici della 0011 e della 0038: una colonna nullabile
-- dentro una chiave di unicità si tratta così.
create unique index calcom_signature_rejections_bucket
  on calcom_signature_rejections (bucket_at, coalesce(cal_username_hint, ''));
create index calcom_signature_rejections_recent
  on calcom_signature_rejections (last_at desc);

comment on table calcom_signature_rejections is
  'Quante firme Cal.com sono state rifiutate, per ora e per presunto mittente. '
  'Un contatore e non un diario: i corpi non autenticati non si conservano, '
  'perché l''indirizzo del webhook è pubblico.';

-- Ogni tabella nuova nasce con RLS accesa e i privilegi revocati a mano: su
-- Supabase i default concedono le tabelle create dopo, e la revoca della 0016
-- non si eredita. Qui in più non c'è nessuna vista `public_*` e non ci deve
-- essere: è un dato operativo del team.
alter table calcom_signature_rejections enable row level security;
revoke all on calcom_signature_rejections from anon, authenticated;

-- ===========================================================================
-- La verifica della firma, che adesso tiene il conto
-- ===========================================================================
-- Il conteggio sta **qui dentro** e non in un punto nuovo del ponte per una
-- ragione sola: questa è l'unica funzione che sa che una firma è stata
-- rifiutata, ed è già chiamata da `calcom_webhook()`. L'alternativa sarebbe
-- riemettere le cinquecento righe della 0037 per aggiungerne tre, lasciando nel
-- repo due copie della stessa funzione — che è il modo in cui due copie
-- divergono.
--
-- Il prezzo è che una funzione che si chiama `..._ok` adesso scrive, e va detto
-- invece che nascosto: **da `stable` diventa `volatile`**. Il conteggio è
-- avvolto in un blocco con gestore, perché contare non deve poter far fallire
-- la verifica: se la scrittura va storta, il ponte risponde comunque
-- `firma_non_valida` e n8n risponde 200.
create or replace function calcom_signature_ok(p_corpo text, p_firma text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_atteso text;
  v_hint   text;
begin
  if p_corpo is not null and p_firma is not null and btrim(p_firma) <> '' then
    v_atteso := encode(
      hmac(convert_to(p_corpo, 'utf8'),
           convert_to(calcom_webhook_secret(), 'utf8'),
           'sha256'),
      'hex');

    -- Il confronto non è a tempo costante. Un attacco temporale su questo
    -- percorso richiederebbe di misurare microsecondi attraverso Railway, n8n e
    -- PostgREST: il rumore è di ordini di grandezza superiore al segnale.
    if lower(btrim(p_firma)) = v_atteso then
      return true;
    end if;
  end if;

  -- ------------------------------------------------------------- il conto
  begin
    -- L'indizio: solo se il corpo è JSON leggibile **e** l'username è uno dei
    -- nostri. Tutto il resto è `null`. Vedi il commento sulla colonna.
    begin
      v_hint := (p_corpo::jsonb) -> 'payload' -> 'organizer' ->> 'username';
    exception when others then
      v_hint := null;
    end;

    if v_hint is not null
       and not exists (select 1 from travel_designers where cal_username = v_hint) then
      v_hint := null;
    end if;

    insert into calcom_signature_rejections (bucket_at, cal_username_hint, n, first_at, last_at)
    values (date_trunc('hour', now()), v_hint, 1, now(), now())
    on conflict (bucket_at, coalesce(cal_username_hint, '')) do update
      set n = calcom_signature_rejections.n + 1,
          last_at = now();
  exception when others then
    -- Contare non deve mai far fallire la verifica.
    null;
  end;

  return false;
end $$;

comment on function calcom_signature_ok(text, text) is
  'Verifica HMAC-SHA256 del corpo grezzo di un webhook Cal.com contro '
  'l''header x-cal-signature-256, e tiene il conto dei rifiuti in '
  'calcom_signature_rejections. Da qui l''orologio si accorge di un account '
  'configurato con la parola segreta sbagliata, che altrimenti smetterebbe di '
  'arrivarci in silenzio.';

-- ===========================================================================
-- L'orologio, con un ramo in più
-- ===========================================================================
-- Riemessa per intero perché è così che si cambia una funzione Postgres: la
-- 0041 resta com'è, questa la sostituisce. **Il ramo 1 è identico**, parola per
-- parola; quello che cambia è il ramo 2, che prima era un segnaposto.
--
-- Ed è anche la prova che la struttura regga: aggiungere una scadenza è stato
-- aggiungere un ramo, senza un secondo workflow e senza toccare n8n.
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

  -- Ramo 2
  v_soglia     numeric;
  v_finestra   numeric;
  v_giorni     numeric;
  v_rifiuti    integer;
  v_indizio    text;
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
  select value into v_soglia   from app_config where key = 'calcom_signature_alert_threshold';
  select value into v_finestra from app_config where key = 'calcom_signature_alert_window_min';
  select value into v_giorni   from app_config where key = 'calcom_signature_keep_days';

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
  -- RAMO 2 — le firme Cal.com rifiutate
  -- =========================================================================
  -- Il primo ramo dopo gli insoluti, ed è anche la prova che la struttura
  -- regga: **non esce come compito**. Contare dei rifiuti e alzare un allarme
  -- sono due `select` e un `insert`, cioè cose che il database sa fare da solo,
  -- e un lavoro che non ha bisogno del mondo di fuori non deve uscirne.
  --
  -- Perché serve: una parola segreta sbagliata su un account Cal.com produce
  -- `firma_non_valida`, che **non scrive niente da nessuna parte** — la 0037
  -- rifiuta di annotare nel diario i corpi non autenticati, e ha ragione: quel
  -- diario è scrivibile da chiunque conosca l'indirizzo pubblico del webhook. Il
  -- risultato è che n8n risponde 200, Cal.com è contento, e quel designer ha
  -- smesso di arrivarci **in silenzio**. Con 25 account configurati a mano non è
  -- un rischio, è una previsione.
  --
  -- Il conto lo tiene `calcom_signature_rejections` (una riga per ora, non una
  -- per messaggio). Qui si legge la finestra e si decide.
  -- I parametri di questo ramo **non** stanno nella lista che fa sollevare la
  -- funzione più sopra, e la ragione è che quella lista fermerebbe anche il ramo
  -- 1: un'installazione che libera slot da due giorni smetterebbe di farlo
  -- perché manca una riga di configurazione di un'altra scadenza. Ma un ramo
  -- spento in silenzio è esattamente il guasto che questa migration esiste per
  -- chiudere, quindi la mancanza si dice — una volta, finché non è risolta.
  if v_soglia is null or v_finestra is null then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'orologio_ramo_non_configurato', 'warning', null, null,
           'Il controllo sulle firme Cal.com rifiutate è SPENTO: mancano '
           || 'app_config.calcom_signature_alert_threshold e/o '
           || 'calcom_signature_alert_window_min. Finché mancano, un account con la parola '
           || 'segreta sbagliata smette di arrivarci senza nessun segnale. Le righe sono in '
           || 'coda a supabase/seed/0001_config.sql.'
     where not exists (select 1 from team_alerts
                        where kind = 'orologio_ramo_non_configurato' and resolved_at is null);
  else
    select coalesce(sum(r.n), 0) into v_rifiuti
      from calcom_signature_rejections r
     where r.last_at >= now() - make_interval(mins => v_finestra::int);

    if v_rifiuti >= v_soglia then
      -- L'indizio su CHI: solo username che sono davvero nostri, perché è
      -- l'unica cosa che `calcom_signature_ok()` accetta di scrivere. Vedi il
      -- commento lungo sulla tabella: è un indizio, non una prova.
      select string_agg(x.chi || ' ×' || x.n::text, ', ' order by x.n desc, x.chi)
        into v_indizio
        from (select coalesce(r.cal_username_hint, '(non dichiarato)') as chi,
                     sum(r.n) as n
                from calcom_signature_rejections r
               where r.last_at >= now() - make_interval(mins => v_finestra::int)
               group by r.cal_username_hint) x;

      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      select 'calcom_firme_rifiutate', 'critical', null, null,
             v_rifiuti || ' messaggi Cal.com rifiutati per firma non valida negli ultimi '
             || v_finestra || ' minuti, quindi **non sono diventati prenotazioni**. '
             || 'La causa più probabile è una parola segreta sbagliata sul webhook di un '
             || 'account: quel designer ha smesso di arrivarci senza nessun altro segnale. '
             || 'Chi li manda, per quello che DICHIARA il corpo del messaggio — '
             || '⚠️ INDIZIO NON VERIFICATO, la firma non è valida quindi quel nome può '
             || 'averlo scritto chiunque: ' || coalesce(v_indizio, '(nessuno)') || '. '
             || 'Il controllo si fa sull''account, non su questo alert: rigenera la parola '
             || 'segreta del webhook e rifai la prenotazione di prova dell''onboarding.'
       where not exists (select 1 from team_alerts
                          where kind = 'calcom_firme_rifiutate' and resolved_at is null);
    end if;

    -- La tabella non deve crescere per sempre: le finestre vecchie non servono
    -- più a nessuno, e il conteggio è già stato letto quando contava.
    if v_giorni is not null then
      delete from calcom_signature_rejections
       where bucket_at < now() - make_interval(days => v_giorni::int);
    end if;
  end if;

  -- =========================================================================
  -- RAMO 3 — silenzio-conferma a 48 ore (milestone 5)
  -- RAMO 4 — promemoria del giorno prima (milestone 5)
  -- RAMO 5 — chiusura a 5 giorni dalla consegna (milestone 6)
  -- =========================================================================
  -- Qui, non in un secondo workflow. Il ramo 3 non uscirà come compito, come il
  -- 2: chiudere una call è un `update`, e il database lo sa fare da solo. I rami
  -- 4 e 5 usciranno come compiti `email_*` il giorno che esiste un provider di
  -- invio (S-04): finché non esiste, **non si manda niente e non si finge**.
end $$;


comment on function clock_tick(integer) is
  'L''orologio unico: un solo giro ogni 5 minuti per tutte le scadenze dovute. '
  'Fa da sé i lavori interni — gli insoluti da liberare escono come compiti, le '
  'firme rifiutate no — e restituisce come compiti solo quelli che hanno '
  'bisogno del mondo di fuori.';

revoke all on function calcom_signature_ok(text, text) from public;
revoke all on function clock_tick(integer)             from public;
grant execute on function clock_tick(integer) to service_role;
