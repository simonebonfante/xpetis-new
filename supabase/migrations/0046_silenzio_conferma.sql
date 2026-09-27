-- XPETIS · 0046 · Il silenzio-conferma, e i due modi di romperlo
--
-- Chiude la milestone 6. Tre pezzi che sembrano separati e sono la stessa
-- domanda — **cosa succede quando nessuno dice niente**, e cosa succede quando
-- qualcuno parla:
--
--   A. dopo la call: la chiusura a 48 ore, e i due tasti del designer che la
--      fermano (no-show, «altro problema»);
--   B. la consegna: il designer carica l'itinerario, e i file entrano oggi per
--      la prima volta;
--   C. la revisione: una sola, dentro la finestra, e la chiusura a 5 giorni.
--
-- Tre rami dell'orologio in più (`clock_tick` riemesso con tre `perform`) e
-- nessun workflow nuovo: chiudere è un `update`, comporre una mail è un
-- `insert`, e nessuno dei due ha bisogno del mondo di fuori.
--
-- ===========================================================================
-- LA REGOLA DELLA 0043 CHE QUI SI PIEGA, DETTA INVECE CHE TACIUTA
-- ===========================================================================
-- La 0043 ha scritto: «dietro un token permanente non ci va **mai** un'azione
-- che muove denaro o che consegna un file». La consegna è esattamente questo,
-- per costruzione del Flusso: il designer carica dalla sua pagina a token, e il
-- viaggiatore scarica dalla sua. Non c'è un'altra porta — il designer non ha
-- login, e il viaggiatore apre il link dalla mail o dal gruppo WhatsApp.
--
-- Quindi la regola si precisa, e si dice cosa costa:
--
--   · **chi trova il link del designer** può consegnare un file al posto suo.
--     Il danno: un file sbagliato arriva al viaggiatore, e i 5 giorni partono.
--     Lo vede subito chi riceve (mail al viaggiatore, messaggio nel gruppo), e
--     la revisione esiste proprio per quello. Non può toccare il denaro: il
--     pagamento è già avvenuto, e dopo la consegna non c'è niente da incassare;
--   · **chi trova il link del viaggiatore** può scaricare l'itinerario. È il
--     link che il designer gira nel gruppo, quindi è già nelle mani di chi deve
--     averlo; fuori da lì, è un itinerario di viaggio, non un documento
--     d'identità. Per l'All Inclusive (biglietti, voucher: milestone 7) questo
--     ragionamento **non basta**, e andrà rifatto;
--   · **il link firmato di Storage non esce mai in una mail né in una pagina.**
--     Vedi la parte B: è la regola che rende sopportabili le altre due.
--
-- ===========================================================================
-- DUE OROLOGI SULLO STESSO STATO
-- ===========================================================================
-- Dopo una consegna l'ordine è `delivered`, e su `delivered` corrono due
-- scadenze diverse, che è facile confondere perché valgono tutte e due
-- «cinque giorni» (`revision_window_days`):
--
--   · **la finestra della revisione** parte dalla **prima** consegna e **non
--     riparte mai**. La revisione inclusa è una: dopo la riconsegna non c'è una
--     seconda finestra, c'è il gruppo WhatsApp. Colonna: `revision_deadline_at`,
--     scritta una volta sola;
--   · **la chiusura** parte dall'**ultima** consegna e riparte dopo la
--     riconsegna: chi ha appena ricevuto la versione rivista ha cinque giorni
--     per leggerla e dire se qualcosa non va, prima che l'ordine si chiuda da
--     solo. Si calcola, non si scrive: `coalesce(revision_delivered_at,
--     delivered_at) + revision_window_days`.
--
-- In pratica: senza revisione i due orologi scadono insieme; con la revisione
-- il primo è già scaduto (o consumato) quando il secondo riparte.

-- ===========================================================================
-- PARTE A — Dopo la call
-- ===========================================================================
-- Flusso §6: «se entro 48 ore dalla call nessuno segnala niente, l'ordine si
-- chiude da solo come completato e il compenso del TD matura. Il TD ha nella
-- sua mail i tasti per l'eccezione: "viaggiatore non presentato" (verifica
-- rapida del team, chiusura come no-show, TD pagato) e "altro problema"
-- (l'ordine va in disputa, il team arbitra e decide, rimborsi compresi).»
--
-- ## Il tasto no-show non chiude come no-show
--
-- È la scelta che conta, e la ragione è nel Flusso stesso: «verifica rapida del
-- team, chiusura come no-show». Il tasto **decide chi tiene i soldi** sulla
-- sola parola del designer: niente lo verifica, il viaggiatore non è nella
-- stanza, e i 15 minuti di attesa (`td_wait_minutes_in_call`) sono una regola
-- d'onore. Quindi il tasto **dichiara**, e la prenotazione va a `disputed` — lo
-- stato che l'enum della 0001 descrive come «in arbitrato del team» — come per
-- «altro problema». Chiudere come `no_show` resta un gesto del team, da Studio,
-- dopo aver guardato.
--
-- Due effetti, tutti e due voluti:
--
--   · **il silenzio si ferma da solo.** La chiusura a 48 ore tocca solo le
--     prenotazioni `confirmed`: una segnalazione la toglie da lì, senza bisogno
--     che il ramo sappia che le eccezioni esistono;
--   · **i bottoni post-call del viaggiatore smettono di funzionare** su quella
--     call (`create_order_from_token` ammette solo `confirmed` e `completed`, e
--     la pagina dice «stiamo guardando qualcosa a mano»). Per un viaggiatore
--     davvero assente è giusto; per uno che contesta, è il team che lo sblocca.
--
-- ## Il viaggiatore non lo sa
--
-- ⚠️ Oggi chi viene dichiarato assente **non riceve niente**: né una mail, né
-- un modo di dire «c'ero». Il Flusso non lo prevede, e non lo decido io: è un
-- punto aperto in `PIANO.md`. L'alert al team lo scrive in chiaro, così chi
-- arbitra sa che sta decidendo senza aver sentito l'altra parte.

-- --------------------------------------------------------------------------
-- La segnalazione, come fatto
-- --------------------------------------------------------------------------
-- Una riga per call, **non** una per clic: il secondo clic — dallo stesso
-- tasto o dall'altro — trova la prima e la racconta. Due segnalazioni sulla
-- stessa call direbbero due verità al team, e la seconda arriva sempre da chi
-- ha già parlato.
--
-- Sta in una tabella sua e non in colonne di `bookings` perché sono i dati di
-- un arbitrato: si leggono insieme, non si aggiornano, e `bookings` ha già
-- abbastanza porte verso il browser da non volerne una in più.
create table booking_exceptions (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings(id) on delete cascade,
  kind        text not null check (kind in ('no_show', 'problem')),

  -- Quello che dichiara il designer.
  waited_minutes smallint check (waited_minutes is null or waited_minutes between 0 and 600),
  note        text check (note is null or length(note) <= 5000),

  -- Quello che misuriamo noi, e che vale di più in un arbitrato: quanto dopo
  -- l'inizio è arrivata la segnalazione. Il designer può scrivere «ho aspettato
  -- 20 minuti»; l'orologio del server dice a che ora ha cliccato.
  declared_at          timestamptz not null default now(),
  minutes_after_start  integer not null,

  actor       actor_kind not null default 'td',
  resolved_at timestamptz,
  resolution  booking_status,

  constraint booking_exceptions_no_show_ha_attesa check (kind <> 'no_show' or waited_minutes is not null),
  constraint booking_exceptions_problema_ha_nota check (kind <> 'problem' or length(btrim(coalesce(note, ''))) > 0)
);
create unique index booking_exceptions_one_per_booking on booking_exceptions (booking_id);

comment on table booking_exceptions is
  'Le segnalazioni del designer dopo la call (no-show, altro problema): una per call. '
  'Portano la dichiarazione del designer e l''ora misurata dal server. Si chiudono da '
  'sole quando il team porta la prenotazione fuori da disputed.';

alter table booking_exceptions enable row level security;
revoke all on booking_exceptions from anon, authenticated;

-- Quando il team decide — porta la prenotazione da `disputed` a un altro stato
-- — la segnalazione si chiude con la decisione scritta sopra. Così la domanda
-- «quali segnalazioni aspettano qualcuno?» ha una risposta senza che nessuno
-- debba ricordarsi di marcare niente.
create or replace function on_booking_leaves_dispute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'disputed' and new.status <> 'disputed' then
    update booking_exceptions
       set resolved_at = now(), resolution = new.status
     where booking_id = new.id and resolved_at is null;
  end if;
  return null;
end $$;

create trigger bookings_leave_dispute after update of status on bookings
  for each row execute function on_booking_leaves_dispute();

-- --------------------------------------------------------------------------
-- Ramo: la mail al designer con i due tasti
-- --------------------------------------------------------------------------
-- Stesso grilletto della mail post-call al viaggiatore — prenotazione
-- `confirmed` con `ends_at` passato, dentro `postcall_email_max_age_hours` — e
-- stessa forma. Una mail sola, due bottoni, due token.
--
-- I token **non scadono**: la finestra la fa valere la funzione che riceve il
-- clic, guardando lo stato della call. Un token scaduto direbbe «link scaduto»;
-- una call chiusa merita di dire «la call si è chiusa il…», che è la verità.
--
-- Fuori finestra non parte, e non c'è un alert suo: le stesse call le conta già
-- il ramo del viaggiatore (`postcall_mail_non_partita`). ⚠️ Una call rimasta
-- senza questa mail si chiude a 48 ore **senza che il designer abbia avuto i
-- tasti**: resta WhatsApp, ed è scritto nel testo di quell'alert che quei casi
-- vanno ripresi a mano.
create or replace function clock_ramo_postcall_td()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base    text;
  v_whatsapp text;
  v_max_age numeric;
  v_limite  numeric;
  v_ore     numeric;
  b         record;
  r         record;
  m         record;
  v_tok     text;
  v_tasti_h text;
  v_tasti_t text;
  v_n       integer := 0;
  v_scopo   token_purpose;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  select value into v_max_age from app_config where key = 'postcall_email_max_age_hours';
  select value into v_limite  from app_config where key = 'email_max_per_tick';
  select value into v_ore     from app_config where key = 'postcall_autoclose_hours';

  if v_base is null or btrim(v_base) = '' or v_whatsapp is null
     or v_max_age is null or v_limite is null or v_ore is null then
    return 0;   -- la mancanza la dice clock_tick
  end if;

  for b in
    select b2.id, b2.td_id, b2.starts_at, b2.ends_at,
           td.email as td_email,
           split_part(coalesce(nullif(btrim(td.display_name), ''), ''), ' ', 1) as td_nome,
           split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as viaggiatore
      from bookings b2
      join travel_designers td on td.id = b2.td_id
      join travelers t on t.id = b2.traveler_id
     where b2.status = 'confirmed'
       and b2.ends_at <= now()
       and b2.ends_at > now() - make_interval(hours => v_max_age::int)
       and not exists (select 1 from outbound_messages o
                        where o.message_kind = 'postcall_td'
                          and o.entity_type = 'booking' and o.entity_id = b2.id)
     order by b2.ends_at
     limit v_limite::int
  loop
    begin
      v_tasti_h := '';
      v_tasti_t := '';

      foreach v_scopo in array array['td_exception_no_show', 'td_exception_problem']::token_purpose[] loop
        insert into access_tokens (purpose, audience, booking_id, td_id)
        values (v_scopo, 'td', b.id, b.td_id)
        on conflict (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
          where revoked_at is null
        do nothing;

        select a.token into v_tok from access_tokens a
         where a.purpose = v_scopo and a.booking_id = b.id and a.revoked_at is null;

        select * into r from render_template(
          case v_scopo when 'td_exception_no_show' then 'blocco_td_no_show' else 'blocco_td_problema' end);

        v_tasti_h := v_tasti_h || r.body_html
                  || bottone_html(coalesce(r.button_label, 'Segnala'),
                                  rtrim(v_base, '/') || '/eccezione/' || v_tok);
        v_tasti_t := v_tasti_t || r.body_text || E'\n'
                  || coalesce(r.button_label, 'Segnala') || ': '
                  || rtrim(v_base, '/') || '/eccezione/' || v_tok || E'\n\n';
      end loop;

      select * into m from render_template(
        'postcall_td',
        jsonb_build_object(
          'saluto', case when coalesce(b.td_nome, '') <> '' then 'Ciao ' || b.td_nome else 'Ciao' end,
          'nome_viaggiatore', coalesce(nullif(b.viaggiatore, ''), 'chi ha prenotato'),
          'data_call', to_char(b.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI'),
          'ore_chiusura', v_ore::int::text,
          'data_chiusura', to_char((b.ends_at + make_interval(hours => v_ore::int)) at time zone 'Europe/Rome',
                                   'DD/MM/YYYY "alle" HH24:MI'),
          'whatsapp', v_whatsapp),
        jsonb_build_object('tasti', v_tasti_h),
        jsonb_build_object('tasti', v_tasti_t));

      if accoda_messaggio('postcall_td', 'booking', b.id, b.td_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject)) is not null then
        v_n := v_n + 1;
      end if;
    exception when others then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      select 'email_composizione_fallita', 'critical', 'booking', b.id,
             'La mail al designer con i tasti no-show e «altro problema» della call del '
             || to_char(b.starts_at, 'DD/MM/YYYY HH24:MI') || ' non si è composta: ' || sqlerrm
             || '. **Il designer non ha i tasti**, e fra ' || v_ore || ' ore la call si chiude da sola.'
       where not exists (select 1 from team_alerts
                          where kind = 'email_composizione_fallita' and resolved_at is null);
    end;
  end loop;

  return v_n;
end $$;

-- --------------------------------------------------------------------------
-- Ramo: il silenzio-conferma a 48 ore
-- --------------------------------------------------------------------------
-- Un `update`, niente compito. Tocca **solo** `confirmed`: una segnalazione
-- del designer ha già portato la call a `disputed`, e lì il silenzio non vale
-- più. La corsa fra il clic e il giro dell'orologio la decide il blocco di
-- riga: se il clic arriva prima, l'`update` rilegge lo stato e salta la riga;
-- se arriva dopo, la funzione del clic trova `completed` e lo dice.
--
-- Le ore si leggono ogni giro da `app_config` e si contano da `ends_at`, non
-- dalla colonna `autoclose_at` della 0008, che nessuno ha mai scritto: così
-- cambiare il parametro da Studio vale anche per le call già finite.
--
-- ⚠️ Al primo giro dopo questa migration si chiudono **tutte** le call
-- confermate finite da più di 48 ore, collaudi compresi. È la cosa giusta — lo
-- sarebbero state da sole — e per ora a `completed` non segue nessuna mail.
create or replace function clock_ramo_chiusura_call()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_ore numeric;
  v_n   integer;
begin
  select value into v_ore from app_config where key = 'postcall_autoclose_hours';
  if v_ore is null then
    return 0;   -- la mancanza la dice clock_tick
  end if;

  update bookings
     set status       = 'completed',
         completed_at = now(),
         last_actor   = 'system'
   where status = 'confirmed'
     and ends_at + make_interval(hours => v_ore::int) <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function clock_ramo_chiusura_call() is
  'Silenzio-conferma: confirmed → completed passate postcall_autoclose_hours dalla fine '
  'della call. Una segnalazione del designer porta la call a disputed, e il ramo non la tocca.';

-- --------------------------------------------------------------------------
-- La pagina del tasto
-- --------------------------------------------------------------------------
-- Flusso §6: «micro-pagine token, semplicissime, una domanda e un tasto».
-- Una funzione sola per i due tasti, perché le regole sono le stesse: token
-- del designer, call confermata, dentro la finestra.
--
-- Del viaggiatore torna **solo il nome**, come nella pagina ordine: il link
-- vive in una casella inoltrabile.
create or replace function td_exception_from_token(p_token text, p_blocca boolean default false)
returns table (esito text, token text, tipo text, booking_id uuid, use_count integer)
language plpgsql volatile security definer set search_path = public as $$
declare
  d record;
  b record;
begin
  select * into d from resolve_access_token_detail(p_token);
  if d.esito is distinct from 'valido' then
    esito := d.esito; return next; return;
  end if;
  if d.purpose not in ('td_exception_no_show', 'td_exception_problem')
     or d.audience <> 'td' or d.booking_id is null then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  if p_blocca then
    select b2.id, b2.td_id into b from bookings b2 where b2.id = d.booking_id for update;
  else
    select b2.id, b2.td_id into b from bookings b2 where b2.id = d.booking_id;
  end if;
  if not found then
    esito := 'prenotazione_sconosciuta'; return next; return;
  end if;
  -- Come per la pagina ordine: il token è del designer. Una call riassegnata
  -- non si segnala dal link del primo.
  if d.td_id is distinct from b.td_id then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  esito := 'valido';
  token := d.token;
  tipo := case d.purpose when 'td_exception_no_show' then 'no_show' else 'problem' end;
  booking_id := b.id;
  select a.use_count into use_count from access_tokens a where a.token = d.token;
  return next;
end $$;

-- Lo stato della pagina, in una parola: cosa si può fare adesso.
--   · `aperta`       → la domanda e il tasto;
--   · `troppo_presto`→ no-show prima che siano passati i minuti di attesa
--                      dall'inizio (vale solo per il no-show);
--   · `gia_segnalata`→ c'è già una segnalazione su questa call, e si dice quale;
--   · `chiusa`       → la call è chiusa (dal silenzio o dal team), o la
--                      finestra è passata e l'orologio non ci è ancora arrivato;
--   · `non_ammessa`  → la call non è mai stata confermata, o è annullata.
create or replace function td_exception_state(p_booking_id uuid, p_tipo text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b      record;
  e      booking_exceptions;
  v_ore  numeric;
  v_wait numeric;
  v_fase text;
begin
  select value into v_ore  from app_config where key = 'postcall_autoclose_hours';
  select value into v_wait from app_config where key = 'td_wait_minutes_in_call';

  select b2.status, b2.starts_at, b2.ends_at, b2.completed_at,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome
    into b
    from bookings b2 join travelers t on t.id = b2.traveler_id
   where b2.id = p_booking_id;

  select * into e from booking_exceptions where booking_id = p_booking_id;

  v_fase := case
    when e.id is not null then 'gia_segnalata'
    when b.status in ('completed', 'no_show') then 'chiusa'
    when b.status <> 'confirmed' then 'non_ammessa'
    when v_ore is null or v_wait is null then 'non_ammessa'
    when now() >= b.ends_at + make_interval(hours => v_ore::int) then 'chiusa'
    when p_tipo = 'no_show' and now() < b.starts_at + make_interval(mins => v_wait::int) then 'troppo_presto'
    else 'aperta'
  end;

  return jsonb_build_object(
    'fase',             v_fase,
    'tipo',             p_tipo,
    'nome_viaggiatore', nullif(b.nome, ''),
    'call_il',          b.starts_at,
    'call_fine',        b.ends_at,
    'minuti_attesa',    v_wait,
    'si_chiude_il',     case when v_ore is not null then b.ends_at + make_interval(hours => v_ore::int) end,
    'chiusa_il',        b.completed_at,
    'segnalata_tipo',   e.kind,
    'segnalata_il',     e.declared_at);
end $$;

create or replace function td_exception_page(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  a record;
begin
  select * into a from td_exception_from_token(p_token);
  if a.esito <> 'valido' then
    return jsonb_build_object('esito', a.esito);
  end if;
  return jsonb_build_object('esito', 'valido') || td_exception_state(a.booking_id, a.tipo);
end $$;

-- Il clic. Tutto quello che serve per arbitrare finisce nell'alert: chi arbitra
-- non deve aprire tre tabelle per sapere di cosa si parla.
create or replace function td_report_exception(p_token text, p_minuti integer, p_nota text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a       record;
  s       jsonb;
  b       record;
  v_nota  text := nullif(btrim(coalesce(p_nota, '')), '');
  v_dopo  integer;
  v_wait  numeric;
  v_id    uuid;
begin
  select * into a from td_exception_from_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;

  -- Lo stato si rilegge con la riga bloccata: il giro dell'orologio che chiude
  -- a 48 ore aspetta, oppure è già passato e qui si vede.
  s := td_exception_state(a.booking_id, a.tipo);
  if s ->> 'fase' = 'gia_segnalata' then
    return jsonb_build_object('ok', true, 'esito', 'gia_segnalata') || s;
  end if;
  if s ->> 'fase' <> 'aperta' then
    return jsonb_build_object('ok', false, 'esito', s ->> 'fase') || s;
  end if;

  -- ------------------------------------------------------------- i dati
  if a.tipo = 'no_show' and (p_minuti is null or p_minuti < 0 or p_minuti > 600) then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'minuti') || s;
  end if;
  if a.tipo = 'problem' and v_nota is null then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'nota') || s;
  end if;
  if length(coalesce(v_nota, '')) > 5000 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'nota') || s;
  end if;

  select b2.id, b2.starts_at, b2.ends_at, b2.price_cents, b2.traveler_phone,
         td.display_name as td_name, t.full_name, t.email
    into b
    from bookings b2
    join travel_designers td on td.id = b2.td_id
    join travelers t on t.id = b2.traveler_id
   where b2.id = a.booking_id;

  select value into v_wait from app_config where key = 'td_wait_minutes_in_call';
  v_dopo := floor(extract(epoch from (now() - b.starts_at)) / 60)::int;

  insert into booking_exceptions (booking_id, kind, waited_minutes, note, minutes_after_start)
  values (a.booking_id, a.tipo, case when a.tipo = 'no_show' then p_minuti end, v_nota, v_dopo)
  returning id into v_id;

  update bookings
     set status      = 'disputed',
         dispute_note = case a.tipo when 'no_show' then 'Il designer dichiara no-show' else 'Il designer segnala un problema' end
                        || coalesce(': ' || v_nota, ''),
         last_actor  = 'td'
   where id = a.booking_id;

  -- Il messaggio dice **chi decide cosa, e con quali elementi**. Il nome intero e
  -- la mail del viaggiatore stanno qui e non nella pagina del designer: il team
  -- deve poterlo contattare, il link inoltrato no.
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  values (
    case a.tipo when 'no_show' then 'td_segnala_no_show' else 'td_segnala_problema' end,
    'critical', 'booking', a.booking_id,
    case a.tipo
      when 'no_show' then
        b.td_name || ' dichiara che ' || coalesce(nullif(btrim(b.full_name), ''), 'il viaggiatore')
        || ' non c''era alla call del '
        || to_char(b.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY "dalle" HH24:MI')
        || to_char(b.ends_at at time zone 'Europe/Rome', '" alle" HH24:MI') || ' ('
        || coalesce(euro_it(b.price_cents), 'importo non registrato') || ' pagati). '
        || 'Dice di aver aspettato ' || p_minuti || ' minuti (la regola è ' || v_wait || '). '
        || 'Ha cliccato ' || v_dopo || ' minuti dopo l''inizio della call, dal link usato '
        || a.use_count || ' volte. '
        || 'Cosa ha scritto: ' || coalesce('«' || v_nota || '»', '(niente)') || '. '
        || '⚠️ Il viaggiatore NON è stato avvisato da noi e non ha avuto modo di dire la sua: '
        || 'mail ' || b.email || coalesce(', telefono ' || b.traveler_phone, '') || '. '
        || 'La call è in disputed e il silenzio-conferma è fermo. Verificato, si chiude con: '
        || 'update bookings set status = ''no_show'', last_actor = ''team'' where id = '''
        || a.booking_id || '''; — oppure completed, o cancelled con il rimborso su Stripe.'
      else
        b.td_name || ' segnala un problema sulla call del '
        || to_char(b.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI')
        || ' con ' || coalesce(nullif(btrim(b.full_name), ''), 'il viaggiatore') || ' ('
        || coalesce(euro_it(b.price_cents), 'importo non registrato') || ' pagati): «' || v_nota || '». '
        || 'Segnalato ' || v_dopo || ' minuti dopo l''inizio. Contatti del viaggiatore: mail '
        || b.email || coalesce(', telefono ' || b.traveler_phone, '') || '. '
        || 'La call è in disputed e il silenzio-conferma è fermo: si arbitra e si porta a '
        || 'completed, no_show o cancelled (con il rimborso su Stripe, se va fatto).'
    end);

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('booking', a.booking_id,
          case a.tipo when 'no_show' then 'td_dichiara_no_show' else 'td_segnala_problema' end,
          'td',
          jsonb_build_object('token', a.token, 'segnalazione', v_id,
                             'minuti_dichiarati', p_minuti, 'minuti_dopo_inizio', v_dopo));

  return jsonb_build_object('ok', true, 'esito', 'segnalata')
         || td_exception_state(a.booking_id, a.tipo);
exception
  -- Due clic nello stesso istante, dai due tasti: l'indice ferma il secondo.
  when unique_violation then
    return jsonb_build_object('ok', true, 'esito', 'gia_segnalata');
end $$;

-- ===========================================================================
-- PARTE B — La consegna, e i file
-- ===========================================================================
-- Flusso §7: «A itinerario pronto, il TD carica il suo file dalla stessa
-- pagina ordine [...]. Il viaggiatore lo riceve via mail, e il TD riceve di
-- nuovo il messaggio pronto col link al documento da girare nel gruppo.»
--
-- ## Da dove passano i byte, e perché non dal nostro server
--
-- `CLAUDE.md` dice «i documenti li carica il nostro server su Supabase
-- Storage; n8n manda un link firmato». La seconda metà resta com'è — **n8n non
-- vede mai un file** — ma la prima si scontra con un limite che non è nostro:
-- **una funzione Vercel accetta al massimo 4,5 MB di corpo**. Un itinerario col
-- template XPETIS (copertina, foto, giorno per giorno) li supera facilmente, e
-- il bucket ne ammette 50. Un caricamento che passa dalla route funzionerebbe
-- in sviluppo e si romperebbe in produzione col primo PDF vero.
--
-- Quindi il server **decide tutto e non porta niente**:
--
--   1. il browser chiede un biglietto: la route chiama `td_delivery_ticket()`,
--      che controlla token, stato, tipo e dimensione dichiarati e **sceglie il
--      percorso** del file (il nome lo decide il database, non chi carica);
--   2. la route apre un caricamento firmato su quel percorso soltanto (Supabase
--      lo fa valere due ore, per un file, senza sovrascrittura), e il browser
--      manda i byte direttamente a Storage;
--   3. il browser dice «fatto»: la route legge da Storage **quello che c'è
--      davvero** (dimensione e tipo, non quelli dichiarati) e chiama
--      `td_deliver()`, che registra il file e porta l'ordine a `delivered`. Se
--      il database rifiuta, la route cancella l'oggetto appena caricato.
--
-- Il biglietto è una credenziale anche lui, ma piccola: vale per un solo
-- percorso scelto da noi, per un solo file, per due ore, e da solo non consegna
-- niente — la consegna la registra solo il passo 3.
--
-- ## Il link firmato non esce mai
--
-- Un URL firmato di Storage **è** una credenziale, e **scade**. In una mail
-- funzionerebbe oggi e non fra tre settimane: il viaggiatore si troverebbe un
-- itinerario pagato che non scarica più, senza nessuno a cui chiederlo. E
-- finché non scade, è inoltrabile a chiunque.
--
-- Quindi nessuna mail, nessuna pagina e nessuna colonna contiene un link di
-- Storage. Le pagine a token portano un indirizzo **nostro**
-- (`/proposta/<token>/file/<id>`), e solo al clic la route chiede a
-- `order_file_for_token()` se quel token può avere quel file, genera un link
-- firmato di **un minuto** e ci rimanda il browser. Il link nasce e muore nel
-- tempo di un redirect; quello che resta in mano alle persone è il token, che
-- non scade.
--
-- Questa funzione restituisce un **percorso**, mai un URL: firmare è un
-- mestiere della route, perché il database non ha la chiave di Storage — ed è
-- giusto che non ce l'abbia.

-- Un file registrato una volta sola: è la difesa contro il doppio «fatto»
-- (doppio clic, ritentativo del browser).
create unique index order_files_one_per_path on order_files (storage_path);

-- La forma di un documento consegnabile. **Gli stessi valori del bucket**
-- (`0017`): il bucket è la difesa vera — rifiuta da sé un tipo non ammesso o un
-- file oltre i 50 MB — e questa è la risposta onesta prima di provarci. Se si
-- cambiano lì, si cambiano qui.
create or replace function documento_ammesso(p_size bigint, p_mime text)
returns boolean language sql immutable as $$
  select p_size is not null and p_size > 0 and p_size <= 52428800
     and p_mime in ('application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'image/jpeg', 'image/png')
$$;

comment on function documento_ammesso(bigint, text) is
  'Gli stessi limiti del bucket order-documents (0017): 50 MB, PDF, DOCX, JPEG, PNG. '
  'Il bucket li impone comunque; questa dà la risposta prima.';

-- Un nome di file che una persona ha scelto, reso innocuo: niente percorsi,
-- niente caratteri di controllo, lunghezza ragionevole. Serve solo a
-- `Content-Disposition` quando si scarica: nello Storage il file ha il nome
-- che gli dà il database.
create or replace function nome_file_pulito(p_nome text)
returns text language sql immutable as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(p_nome, ''),
                  '^.*[/\\]', ''), '[[:cntrl:]]', '', 'g')), 200), '')
$$;

-- --------------------------------------------------------------------------
-- Il biglietto
-- --------------------------------------------------------------------------
create or replace function td_delivery_ticket(p_token text, p_nome text, p_size bigint, p_mime text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a   record;
  o   orders;
  v_estensione text;
begin
  select * into a from td_order_from_token(p_token);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;

  select * into o from orders where id = a.order_id;

  if o.status not in ('in_progress', 'revision_requested') then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;
  if nome_file_pulito(p_nome) is null then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'nome');
  end if;
  if not documento_ammesso(p_size, p_mime) then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi',
                              'campo', case when p_size > 52428800 then 'dimensione' else 'tipo' end);
  end if;

  v_estensione := case p_mime
    when 'application/pdf' then 'pdf'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'image/jpeg' then 'jpg'
    else 'png' end;

  return jsonb_build_object(
    'ok',    true,
    'esito', 'biglietto',
    'path',  'ordini/' || o.id || '/' || gen_random_uuid() || '.' || v_estensione,
    'tipo',  case o.status when 'in_progress' then 'itinerary' else 'revision' end);
end $$;

-- --------------------------------------------------------------------------
-- La consegna
-- --------------------------------------------------------------------------
-- **L'attribuzione viene dal token**: `last_actor = 'td'`, e la riga di
-- `order_status_history` che il trigger della 0009 scrive è l'unica prova che
-- abbia consegnato il designer. La dimensione e il tipo arrivano dalla route,
-- che li ha letti da Storage dopo il caricamento.
create or replace function td_deliver(p_token text, p_path text, p_nome text, p_size bigint, p_mime text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a        record;
  o        orders;
  v_giorni numeric;
  v_tipo   order_file_kind;
  v_file   uuid;
begin
  select * into a from td_order_from_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;

  select * into o from orders where id = a.order_id;

  -- Il doppio «fatto»: lo stesso file, già registrato. È la verità, non un errore.
  if exists (select 1 from order_files f where f.storage_path = p_path and f.order_id = o.id) then
    return jsonb_build_object('ok', true, 'esito', 'gia_consegnato', 'stato', o.status);
  end if;

  -- Consegnare un ordine non pagato, o già consegnato e non in revisione, non
  -- si chiede qui: la risposta è una parola. La tabella delle transizioni
  -- resta la difesa di fondo.
  if o.status not in ('in_progress', 'revision_requested') then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;

  -- Il percorso deve essere uno che il biglietto di **questo** ordine può aver
  -- scelto: chi ha il token di un ordine non registra il file di un altro.
  if p_path is null
     or p_path !~ ('^ordini/' || o.id || '/[0-9a-f-]{36}\.(pdf|docx|jpg|png)$') then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'percorso');
  end if;
  if nome_file_pulito(p_nome) is null then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'nome');
  end if;
  if not documento_ammesso(p_size, p_mime) then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi',
                              'campo', case when p_size > 52428800 then 'dimensione' else 'tipo' end);
  end if;

  select value into v_giorni from app_config where key = 'revision_window_days';
  if v_giorni is null then
    return jsonb_build_object('ok', false, 'esito', 'non_configurato');
  end if;

  v_tipo := case o.status when 'in_progress' then 'itinerary' else 'revision' end;

  insert into order_files (order_id, kind, storage_path, filename, size_bytes, mime_type, uploaded_by)
  values (o.id, v_tipo, p_path, nome_file_pulito(p_nome), p_size, p_mime, 'td')
  returning id into v_file;

  if o.status = 'in_progress' then
    -- La prima consegna apre i due orologi: la finestra della revisione (che
    -- non riparte mai) e la chiusura (che si calcola da qui).
    update orders set
      status               = 'delivered',
      delivered_at         = now(),
      revision_deadline_at = now() + make_interval(days => v_giorni::int),
      last_actor           = 'td'
     where id = o.id;
  else
    -- La riconsegna fa ripartire **solo** la chiusura: `revision_deadline_at`
    -- non si tocca, perché la revisione inclusa è già stata usata.
    update orders set
      status                = 'delivered',
      revision_delivered_at = now(),
      last_actor            = 'td'
     where id = o.id;
  end if;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id,
          case v_tipo when 'itinerary' then 'itinerario_consegnato' else 'revisione_consegnata' end,
          'td', jsonb_build_object('token', a.token, 'file', v_file, 'byte', p_size, 'tipo', p_mime));

  return jsonb_build_object('ok', true, 'esito', 'consegnato', 'file', v_file);
end $$;

-- --------------------------------------------------------------------------
-- Scaricare: il permesso, non il link
-- --------------------------------------------------------------------------
-- Due porte: il designer (i file del suo ordine, sempre) e la pagina del
-- viaggiatore (solo dopo la consegna: prima non c'è niente da scaricare, e un
-- file caricato a metà non esiste per il database).
create or replace function order_file_for_token(p_token text, p_file_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  d record;
  o record;
  f order_files;
begin
  select * into d from resolve_access_token_detail(p_token);
  if d.esito is distinct from 'valido' then
    return jsonb_build_object('esito', d.esito);
  end if;
  if d.order_id is null or d.purpose not in ('td_order_page', 'traveler_public_proposal') then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;

  select o2.id, o2.td_id, o2.status into o from orders o2 where o2.id = d.order_id;
  if not found then
    return jsonb_build_object('esito', 'ordine_sconosciuto');
  end if;

  if d.purpose = 'td_order_page' and d.td_id is distinct from o.td_id then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;
  if d.purpose = 'traveler_public_proposal'
     and o.status not in ('delivered', 'revision_requested', 'completed') then
    return jsonb_build_object('esito', 'file_sconosciuto');
  end if;

  select * into f from order_files where id = p_file_id and order_id = o.id;
  if not found then
    return jsonb_build_object('esito', 'file_sconosciuto');
  end if;

  return jsonb_build_object('esito', 'valido', 'path', f.storage_path, 'nome', f.filename);
end $$;

comment on function order_file_for_token(text, uuid) is
  'Il permesso di scaricare un file dell''ordine: restituisce il PERCORSO, mai un URL. '
  'Il link firmato lo genera la route al clic, per un minuto, e non finisce in nessuna '
  'mail, pagina o colonna.';

-- --------------------------------------------------------------------------
-- Le mail della consegna
-- --------------------------------------------------------------------------
-- Il grilletto è lo stato, come per le mail della 0044 e della 0045. L'entità
-- della mail è il **file**, non l'ordine: la prima consegna e la riconsegna
-- sono due mail diverse, e il vincolo di unicità della coda continua a dire
-- «una mail per consegna», che è la verità.
--
-- La mail porta il link della **pagina a token** del viaggiatore — la stessa
-- della proposta, che non scade — e mai il file o un link di Storage.
create or replace function accoda_mail_consegna(p_file_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  v_giorni   numeric;
  x          record;
  v_token    text;
  f          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  select value into v_giorni from app_config where key = 'revision_window_days';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null or v_giorni is null then
    return null;   -- la mancanza la dice clock_tick
  end if;

  select fl.id, fl.kind, o.id as order_id, o.human_ref, o.revision_deadline_at,
         o.revision_delivered_at, t.email,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name
    into x
    from order_files fl
    join orders o on o.id = fl.order_id
    join travelers t on t.id = o.traveler_id
    join travel_designers td on td.id = o.td_id
   where fl.id = p_file_id;
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'traveler_public_proposal' and a.order_id = x.order_id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token traveler_public_proposal attivo';
  end if;

  select * into f from render_template('blocco_firma',
    jsonb_build_object('whatsapp', v_whatsapp,
                       'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

  if x.kind = 'itinerary' then
    select * into m from render_template(
      'delivery_traveler',
      jsonb_build_object(
        'saluto', case when coalesce(x.nome, '') <> '' then 'Ciao ' || x.nome else 'Ciao' end,
        'designer', x.td_name,
        'human_ref', x.human_ref,
        'link_pagina', rtrim(v_base, '/') || '/proposta/' || v_token,
        'giorni_revisione', v_giorni::int::text,
        'data_limite_revisione', to_char(x.revision_deadline_at at time zone 'Europe/Rome', 'DD/MM/YYYY')),
      jsonb_build_object('firma', f.body_html),
      jsonb_build_object('firma', f.body_text));
  else
    select * into m from render_template(
      'revision_delivered_traveler',
      jsonb_build_object(
        'saluto', case when coalesce(x.nome, '') <> '' then 'Ciao ' || x.nome else 'Ciao' end,
        'designer', x.td_name,
        'human_ref', x.human_ref,
        'link_pagina', rtrim(v_base, '/') || '/proposta/' || v_token,
        'data_chiusura', to_char((x.revision_delivered_at + make_interval(days => v_giorni::int))
                                 at time zone 'Europe/Rome', 'DD/MM/YYYY')),
      jsonb_build_object('firma', f.body_html),
      jsonb_build_object('firma', f.body_text));
  end if;

  return accoda_messaggio(
    case x.kind when 'itinerary' then 'delivery_traveler' else 'revision_delivered_traveler' end,
    'order_file', x.id, x.email, m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order_file', p_file_id,
         'La mail di consegna al viaggiatore non si è composta e **non è partita**: ' || sqlerrm
         || '. Il file è consegnato e il designer ha il messaggio da girare nel gruppo. Sistemato '
         || 'il problema, si rilancia con: select accoda_mail_consegna(''' || p_file_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

create or replace function on_custom_order_delivered()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_file uuid;
  x      record;
begin
  if new.service_type <> 'custom_itinerary' or new.status <> 'delivered'
     or old.status not in ('in_progress', 'revision_requested') then
    return null;
  end if;

  select f.id into v_file from order_files f
   where f.order_id = new.id and f.kind in ('itinerary', 'revision')
   order by f.created_at desc limit 1;
  if v_file is null then
    return null;   -- non succede: enforce_order_transition lo vieta
  end if;

  perform accoda_mail_consegna(v_file);

  select td.display_name as td_name into x from travel_designers td where td.id = new.td_id;
  perform notifica_team(
    'ordine_consegnato', 'order_file', v_file,
    '[XPETIS] ' || case old.status when 'in_progress' then 'Consegnato' else 'Riconsegnato dopo la revisione' end
      || ' ' || new.human_ref,
    coalesce(x.td_name, 'Il designer') || ' ha '
      || case old.status when 'in_progress' then 'consegnato l''itinerario' else 'consegnato la revisione' end
      || ' dell''ordine ' || new.human_ref || '. Il viaggiatore ha ricevuto la mail con il link alla sua pagina.');
  return null;
end $$;

create trigger orders_custom_delivered after update of status on orders
  for each row execute function on_custom_order_delivered();

-- ===========================================================================
-- PARTE C — La revisione, una sola, e la chiusura
-- ===========================================================================
-- Flusso §7: «il viaggiatore ha 5 giorni per chiedere la revisione inclusa,
-- una; il TD la consegna con lo stesso meccanismo. Nessuna richiesta entro 5
-- giorni: l'ordine si chiude da solo e il compenso del TD matura.»
--
-- La richiesta parte dalla pagina del viaggiatore (`/proposta/<token>`), che è
-- anche la pagina girata nel gruppo: chi la chiede è chiunque abbia quel link.
-- Si registra `traveler` perché è il caso normale, e il diario porta il token.
--
-- ## La seconda richiesta non esiste
--
-- Non c'è un bottone che non fa niente: dopo la prima richiesta la pagina dice
-- **quando** è stata chiesta e che le modifiche successive si chiedono nel
-- gruppo WhatsApp. Se qualcuno la manda lo stesso (una scheda vecchia, un
-- tasto indietro), la funzione risponde `revisione_gia_chiesta` con la data, e
-- la pagina dice la stessa cosa.
--
-- Fuori finestra, allo stesso modo: `finestra_chiusa` con la data in cui si è
-- chiusa. Le due risposte sono diverse di proposito — «l'hai già usata» e «è
-- scaduta» non sono la stessa notizia.
create or replace function request_revision(p_token text, p_nota text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  d      record;
  o      orders;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  select * into d from resolve_access_token_detail(p_token);
  if d.esito is distinct from 'valido' then
    return jsonb_build_object('ok', false, 'esito', d.esito);
  end if;
  if d.purpose <> 'traveler_public_proposal' or d.audience <> 'traveler' or d.order_id is null then
    return jsonb_build_object('ok', false, 'esito', 'token_di_altro_tipo');
  end if;

  select * into o from orders where id = d.order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'esito', 'ordine_sconosciuto');
  end if;
  if o.service_type <> 'custom_itinerary' then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_gestito');
  end if;

  -- Il doppio clic sulla stessa richiesta: è già in corso, ed è la verità.
  if o.status = 'revision_requested' then
    return jsonb_build_object('ok', true, 'esito', 'revisione_in_corso',
                              'chiesta_il', o.revision_requested_at);
  end if;
  if o.revision_requested_at is not null then
    return jsonb_build_object('ok', false, 'esito', 'revisione_gia_chiesta',
                              'chiesta_il', o.revision_requested_at,
                              'consegnata_il', o.revision_delivered_at);
  end if;
  if o.status = 'completed' then
    return jsonb_build_object('ok', false, 'esito', 'ordine_chiuso', 'chiuso_il', o.completed_at);
  end if;
  if o.status <> 'delivered' then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;
  -- La finestra si guarda qui e non solo dall'orologio: fra la scadenza e il
  -- giro che chiude l'ordine passano fino a cinque minuti, e in quei minuti la
  -- revisione non esiste più.
  if o.revision_deadline_at is null or now() >= o.revision_deadline_at then
    return jsonb_build_object('ok', false, 'esito', 'finestra_chiusa',
                              'scaduta_il', o.revision_deadline_at);
  end if;

  if v_nota is null or length(v_nota) > 5000 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'nota');
  end if;

  update orders set
    status                = 'revision_requested',
    revision_requested_at = now(),
    revision_note         = v_nota,
    last_actor            = 'traveler'
   where id = o.id;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id, 'revisione_richiesta', 'traveler', jsonb_build_object('token', d.token));

  return jsonb_build_object('ok', true, 'esito', 'revisione_chiesta', 'chiesta_il', now());
end $$;

-- La mail al designer: c'è una revisione da fare, e cosa ha scritto chi l'ha
-- chiesta. Il testo della richiesta è di un viaggiatore, e passa dalle stesse
-- graffe spezzate della descrizione della proposta (0044).
create or replace function accoda_mail_revisione_td(p_order_id uuid)
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
    return null;
  end if;

  select o2.id, o2.human_ref, o2.revision_note, td.email as td_email,
         split_part(coalesce(nullif(btrim(td.display_name), ''), ''), ' ', 1) as td_nome,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as viaggiatore
    into o
    from orders o2
    join travel_designers td on td.id = o2.td_id
    join travelers t on t.id = o2.traveler_id
   where o2.id = p_order_id;
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'td_order_page' and a.order_id = o.id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token td_order_page attivo';
  end if;

  select * into m from render_template(
    'revision_requested_td',
    jsonb_build_object(
      'saluto', case when coalesce(o.td_nome, '') <> '' then 'Ciao ' || o.td_nome else 'Ciao' end,
      'human_ref', o.human_ref,
      'nome_viaggiatore', coalesce(nullif(o.viaggiatore, ''), 'Chi ha ricevuto l''itinerario'),
      'nota', replace(replace(coalesce(o.revision_note, ''), '{{', '{ {'), '}}', '} }'),
      'link_ordine', rtrim(v_base, '/') || '/ordine/' || v_token,
      'whatsapp', v_whatsapp));

  return accoda_messaggio('revision_requested_td', 'order', o.id, o.td_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order', p_order_id,
         'La mail al designer «c''è una revisione da fare» non si è composta: ' || sqlerrm
         || '. **Il designer non sa della revisione.** Si rilancia con: '
         || 'select accoda_mail_revisione_td(''' || p_order_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

create or replace function on_custom_revision_requested()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.service_type <> 'custom_itinerary' or new.status <> 'revision_requested'
     or old.status <> 'delivered' then
    return null;
  end if;

  perform accoda_mail_revisione_td(new.id);
  perform notifica_team(
    'revisione_richiesta', 'order', new.id,
    '[XPETIS] Revisione chiesta su ' || new.human_ref,
    'Sull''ordine ' || new.human_ref || ' è stata chiesta la revisione inclusa: «'
      || coalesce(new.revision_note, '') || '». Il designer ha ricevuto la mail.');
  return null;
end $$;

create trigger orders_custom_revision_requested after update of status on orders
  for each row execute function on_custom_revision_requested();

-- --------------------------------------------------------------------------
-- Ramo: la chiusura a 5 giorni dall'ultima consegna
-- --------------------------------------------------------------------------
-- Solo su misura: l'All Inclusive ha `delivered → completed` nella tabella
-- delle transizioni, ma il suo «consegnato» è il documento finale prima della
-- partenza, e la sua chiusura è materia della milestone 7.
--
-- Solo `delivered`: un ordine in `revision_requested` aspetta il designer, e
-- lì il silenzio non chiude niente — chiudere un ordine con una revisione
-- promessa e mai consegnata sarebbe il silenzio di chi non è stato servito.
-- ⚠️ Quindi una revisione che il designer non consegna mai resta aperta per
-- sempre, senza che nessuno lo sappia: è un punto aperto in `PIANO.md`.
create or replace function clock_ramo_chiusura_ordini()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_giorni numeric;
  v_n      integer;
begin
  select value into v_giorni from app_config where key = 'revision_window_days';
  if v_giorni is null then
    return 0;   -- la mancanza la dice clock_tick
  end if;

  update orders
     set status       = 'completed',
         completed_at = now(),
         last_actor   = 'system'
   where service_type = 'custom_itinerary'
     and status = 'delivered'
     and coalesce(revision_delivered_at, delivered_at) is not null
     and coalesce(revision_delivered_at, delivered_at) + make_interval(days => v_giorni::int) <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function clock_ramo_chiusura_ordini() is
  'Silenzio-conferma dopo la consegna: delivered → completed passati revision_window_days '
  'dall''ULTIMA consegna (la riconsegna fa ripartire la chiusura, non la revisione).';

-- ===========================================================================
-- PARTE D — Le due pagine, che adesso vedono anche la consegna
-- ===========================================================================
-- Riemesse dalla 0044 con i campi della consegna e della revisione in più.
-- Tutto quello che c'era resta, con lo stesso nome: le pagine già scritte non
-- cambiano per la parte proposta.

-- I file di un ordine come li vede una pagina: id, tipo, nome, quando. Niente
-- percorso — quello serve solo alla route che firma.
create or replace function order_files_for_page(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'tipo', f.kind, 'nome', f.filename, 'caricato_il', f.created_at)
           order by f.created_at desc), '[]'::jsonb)
    from order_files f
   where f.order_id = p_order_id and f.kind in ('itinerary', 'revision')
$$;

create or replace function td_order_page(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a          record;
  o          record;
  v_base     text;
  v_link     text;
  v_credito  text;
  v_msg      text;
  v_msg_c    text;
  v_giorni   numeric;
  r          record;
begin
  select * into a from td_order_from_token(p_token);
  if a.esito <> 'valido' then
    return jsonb_build_object('esito', a.esito);
  end if;

  select o2.*, b.starts_at as call_il, b.price_cents as prezzo_call,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name
    into o
    from orders o2
    join travelers t on t.id = o2.traveler_id
    join travel_designers td on td.id = o2.td_id
    left join bookings b on b.id = o2.source_booking_id
   where o2.id = a.order_id;

  select o2.human_ref into v_credito
    from orders o2
   where o2.source_booking_id = o.source_booking_id and o2.id <> o.id
     and o2.consultation_credit_cents > 0
   limit 1;

  select value into v_giorni from app_config where key = 'revision_window_days';

  if o.status not in ('requested', 'in_definition') then
    select value_text into v_base from app_config where key = 'site_base_url';
    select rtrim(v_base, '/') || '/proposta/' || t.token into v_link
      from access_tokens t
     where t.purpose = 'traveler_public_proposal' and t.order_id = o.id and t.revoked_at is null;

    if v_link is not null then
      begin
        select * into r from render_template('blocco_whatsapp_proposta',
          jsonb_build_object('human_ref', o.human_ref, 'link_proposta', v_link));
        v_msg := r.body_text;
      exception when others then
        v_msg := null;
      end;

      -- Dopo la consegna, il messaggio da girare nel gruppo è un altro: porta
      -- alla stessa pagina, dove adesso c'è il file. Il link è quello della
      -- pagina, **mai** quello del file: il file si scarica solo passando da lì.
      if o.status in ('delivered', 'revision_requested', 'completed') then
        begin
          select * into r from render_template('blocco_whatsapp_consegna',
            jsonb_build_object('human_ref', o.human_ref, 'link_pagina', v_link));
          v_msg_c := r.body_text;
        exception when others then
          v_msg_c := null;
        end;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'esito',             'valido',
    'human_ref',         o.human_ref,
    'status',            o.status,
    'td_name',           o.td_name,
    'nome_viaggiatore',  nullif(o.nome, ''),
    'call_il',           o.call_il,
    'prezzo_call_cents', o.prezzo_call,
    'credito_usato_su',  v_credito,
    'descrizione',       o.proposal_description,
    'prezzo_cents',      o.proposal_price_cents,
    'giorni',            o.delivery_days,
    'credito_cents',     o.consultation_credit_cents,
    'inviata_il',        o.proposal_sent_at,
    'link_proposta',     v_link,
    'messaggio_pronto',  v_msg,
    -- 0046: la consegna
    'messaggio_consegna',      v_msg_c,
    'file',                    order_files_for_page(o.id),
    'consegnato_il',           o.delivered_at,
    'revisione_entro',         o.revision_deadline_at,
    'revisione_chiesta_il',    o.revision_requested_at,
    'revisione_nota',          o.revision_note,
    'revisione_consegnata_il', o.revision_delivered_at,
    'chiuso_il',               o.completed_at,
    'si_chiude_il', case when o.status = 'delivered' and v_giorni is not null
                         then coalesce(o.revision_delivered_at, o.delivered_at)
                              + make_interval(days => v_giorni::int) end);
end $$;

-- La pagina del viaggiatore. Le fasi nuove sono tre — `consegnata`,
-- `in_revisione`, `chiusa` — al posto di un `pagata` che valeva per tutto il
-- dopo-pagamento.
--
-- `puo_chiedere_revisione` lo calcola il database con le **stesse** regole di
-- `request_revision()`: la pagina non decide se mostrare il bottone, legge.
create or replace function proposal_public_page(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  d        record;
  o        record;
  v_fase   text;
  v_giorni numeric;
begin
  select * into d from resolve_access_token_detail(p_token);

  if d.esito is distinct from 'valido' then
    return jsonb_build_object('esito', d.esito);
  end if;
  if d.purpose <> 'traveler_public_proposal' or d.audience <> 'traveler' or d.order_id is null then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;

  select o2.id, o2.status, o2.service_type, o2.human_ref, o2.proposal_description,
         o2.proposal_price_cents, o2.delivery_days, o2.proposal_sent_at,
         o2.delivered_at, o2.revision_deadline_at, o2.revision_requested_at,
         o2.revision_note, o2.revision_delivered_at, o2.completed_at,
         td.display_name as td_name, td.slug as td_slug
    into o
    from orders o2
    join travel_designers td on td.id = o2.td_id
   where o2.id = d.order_id;

  if not found then
    return jsonb_build_object('esito', 'ordine_sconosciuto');
  end if;
  if o.service_type <> 'custom_itinerary' then
    return jsonb_build_object('esito', 'servizio_non_gestito');
  end if;

  select value into v_giorni from app_config where key = 'revision_window_days';

  v_fase := case
    when o.status = 'proposal_sent' then 'da_pagare'
    when o.status = 'in_progress' then 'pagata'
    when o.status = 'delivered' then 'consegnata'
    when o.status = 'revision_requested' then 'in_revisione'
    when o.status = 'completed' then 'chiusa'
    when o.status in ('requested', 'in_definition') then 'in_aggiornamento'
    when o.status = 'cancelled' then 'annullata'
    else 'in_verifica'
  end;

  return jsonb_build_object(
    'esito',        'valido',
    'fase',         v_fase,
    'order_id',     o.id,
    'human_ref',    o.human_ref,
    'td_name',      o.td_name,
    'td_slug',      o.td_slug,
    'descrizione',  case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_description end,
    'prezzo_cents', case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_price_cents end,
    'giorni',       case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.delivery_days end,
    'inviata_il',   case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_sent_at end,
    -- 0046: la consegna. I file si vedono solo dopo che sono stati consegnati.
    'file',         case when v_fase in ('consegnata', 'in_revisione', 'chiusa')
                         then order_files_for_page(o.id) else '[]'::jsonb end,
    'consegnato_il',           o.delivered_at,
    'revisione_entro',         o.revision_deadline_at,
    'revisione_chiesta_il',    o.revision_requested_at,
    'revisione_nota',          case when o.revision_requested_at is not null then o.revision_note end,
    'revisione_consegnata_il', o.revision_delivered_at,
    'chiuso_il',               o.completed_at,
    'si_chiude_il', case when o.status = 'delivered' and v_giorni is not null
                         then coalesce(o.revision_delivered_at, o.delivered_at)
                              + make_interval(days => v_giorni::int) end,
    'puo_chiedere_revisione',  o.status = 'delivered' and o.revision_requested_at is null
                               and o.revision_deadline_at is not null and now() < o.revision_deadline_at);
end $$;

-- ===========================================================================
-- L'orologio, con tre rami in più
-- ===========================================================================
-- Riemesso dalla 0043: tre `perform` e tre chiavi nell'elenco dei parametri dei
-- rami opzionali. Tutto il resto è parola per parola. Nessun ramo nuovo esce
-- come compito: chiudere è un `update`, e le mail le consegna il ramo che
-- c'è già — quindi **n8n non si tocca**.
create or replace function clock_tick(p_limit integer default 100)
returns table (task text, entity_type text, entity_id uuid, payload jsonb)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_window   numeric;
  v_grace    numeric;
  v_sweep    numeric;
  v_budget   numeric;
  v_max_try  numeric;
  v_url      text;
  v_mancanti text[] := '{}';
  v_chiave   text;
  v_alert    uuid;
begin
  -- ------------------------------------------------------ i parametri, tutti
  -- Questi sei sono **indispensabili**: senza, il ramo che libera gli slot non
  -- può nemmeno decidere chi è scaduto. Se ne manca uno l'orologio **solleva**
  -- invece di girare a vuoto: una scadenza non trattata è invisibile,
  -- un'esecuzione rossa su n8n no.
  select value into v_window  from app_config where key = 'booking_payment_window_min';
  select value into v_grace   from app_config where key = 'booking_cancel_grace_min';
  select value into v_sweep   from app_config where key = 'unpaid_sweep_minutes';
  select value into v_budget  from app_config where key = 'unpaid_slot_max_min';
  select value into v_max_try from app_config where key = 'unpaid_cancel_max_attempts';
  select value_text into v_url from app_config where key = 'calcom_cancel_url';

  if v_window is null or v_grace is null or v_sweep is null or v_budget is null
     or v_max_try is null or v_url is null then
    raise exception 'Manca un parametro dell''orologio in app_config (finestra, grazia, cadenza, budget, tentativi, URL di cancellazione): non si inventano';
  end if;

  -- ------------------------------------------- il budget dei 35 minuti
  -- La regola del Flusso è che uno slot non pagato resta occupato **al massimo
  -- 35 minuti**, e il conto è `finestra + grazia + cadenza`: la cadenza entra
  -- perché una riga che scade subito dopo un giro aspetta un giro intero. Con i
  -- valori di oggi — 30 + 0 + 5 — il conto fa esattamente 35.
  --
  -- Il controllo vive qui e non solo nell'harness perché i parametri si cambiano
  -- **da Studio**, dove nessun test passa.
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

  -- ------------------------------------------- i parametri dei rami opzionali
  -- Gli altri rami non fanno sollevare l'orologio se la loro configurazione
  -- manca — fermerebbero anche il ramo 1, e un'installazione che libera slot da
  -- due giorni smetterebbe di farlo perché manca la riga di un'altra scadenza.
  -- Ma **un ramo spento in silenzio è il guasto che la 0042 esiste per
  -- chiudere**, quindi la mancanza si dice.
  --
  -- Un alert solo, con dentro l'elenco, e **aggiornato** invece che duplicato:
  -- chi ne sistema metà deve vedere restare l'altra metà, non un messaggio
  -- vecchio.
  -- ⚠️ «Presente» si controlla **sulla colonna giusta**, non su una qualunque
  -- delle due. `app_config` porta un numero **o** un testo (vincolo XOR della
  -- 0034), e una riga numerica a cui qualcuno ha messo un testo è una riga
  -- rotta che il ramo leggerà come nulla: chiedere «c'è almeno uno dei due
  -- valori?» direbbe che va tutto bene proprio nel caso peggiore.
  for v_chiave in
    select u.chiave from unnest(array[
      'calcom_signature_alert_threshold', 'calcom_signature_alert_window_min',
      'token_miss_alert_threshold', 'token_miss_alert_window_min',
      'email_enabled', 'email_max_per_tick', 'email_max_attempts',
      'postcall_email_max_age_hours',
      -- 0046: il silenzio-conferma, i tasti del designer, la revisione
      'postcall_autoclose_hours', 'td_wait_minutes_in_call', 'revision_window_days'
    ]) as u(chiave)
    where not exists (select 1 from app_config c
                       where c.key = u.chiave and c.value is not null)
    order by u.chiave
  loop
    v_mancanti := v_mancanti || v_chiave;
  end loop;

  for v_chiave in
    select u.chiave from unnest(array[
      'email_from', 'site_base_url', 'whatsapp_number'
    ]) as u(chiave)
    where not exists (select 1 from app_config c
                       where c.key = u.chiave and btrim(coalesce(c.value_text, '')) <> '')
    order by u.chiave
  loop
    v_mancanti := v_mancanti || v_chiave;
  end loop;

  select id into v_alert from team_alerts
   where kind = 'orologio_ramo_non_configurato' and resolved_at is null limit 1;

  if array_length(v_mancanti, 1) > 0 then
    if v_alert is null then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('orologio_ramo_non_configurato', 'warning', null, null,
              'Rami dell''orologio SPENTI perché manca la loro riga in app_config: '
              || array_to_string(v_mancanti, ', ')
              || '. Finché mancano, quelle scadenze non vengono trattate e nessuno lo '
              || 'segnala. Le righe sono in coda a supabase/seed/0001_config.sql.');
    else
      update team_alerts
         set message = 'Rami dell''orologio SPENTI perché manca la loro riga in app_config: '
                    || array_to_string(v_mancanti, ', ')
                    || '. Finché mancano, quelle scadenze non vengono trattate e nessuno lo '
                    || 'segnala. Le righe sono in coda a supabase/seed/0001_config.sql.'
       where id = v_alert;
    end if;
  elsif v_alert is not null then
    -- Si è risolto da solo: lo chiude l'orologio invece di lasciare al team un
    -- allarme che non corrisponde più a niente.
    update team_alerts
       set resolved_at = now(), resolved_by = 'orologio'
     where id = v_alert;
  end if;

  -- ========================================================================
  -- I rami che il database chiude da solo
  -- ========================================================================
  perform clock_ramo_firme_calcom();
  perform clock_ramo_token_inventati();
  perform clock_ramo_postcall();
  perform clock_ramo_postcall_td();        -- 0046: i due tasti al designer
  perform clock_ramo_chiusura_call();      -- 0046: il silenzio-conferma a 48 ore
  perform clock_ramo_chiusura_ordini();    -- 0046: la chiusura a 5 giorni dalla consegna

  -- ========================================================================
  -- I rami che hanno bisogno del mondo di fuori
  -- ========================================================================
  return query select * from clock_ramo_insoluti(p_limit);
  return query select * from clock_ramo_email(p_limit);

  -- RAMO da scrivere — promemoria del giorno prima (milestone 5): compone e
  -- accoda come il post-call, e la consegna la fa il ramo che c'è già.
end $$;

-- ===========================================================================
-- I privilegi
-- ===========================================================================
-- Tutto chiuso ad anon e authenticated; le funzioni che chiamano le route
-- server si aprono alla chiave secret, come nella 0044.
revoke all on function on_booking_leaves_dispute()                         from public, anon, authenticated;
revoke all on function clock_ramo_postcall_td()                            from public, anon, authenticated;
revoke all on function clock_ramo_chiusura_call()                          from public, anon, authenticated;
revoke all on function clock_ramo_chiusura_ordini()                        from public, anon, authenticated;
revoke all on function td_exception_from_token(text, boolean)              from public, anon, authenticated;
revoke all on function td_exception_state(uuid, text)                      from public, anon, authenticated;
revoke all on function td_exception_page(text)                             from public, anon, authenticated;
revoke all on function td_report_exception(text, integer, text)            from public, anon, authenticated;
revoke all on function documento_ammesso(bigint, text)                     from public, anon, authenticated;
revoke all on function nome_file_pulito(text)                              from public, anon, authenticated;
revoke all on function td_delivery_ticket(text, text, bigint, text)        from public, anon, authenticated;
revoke all on function td_deliver(text, text, text, bigint, text)          from public, anon, authenticated;
revoke all on function order_file_for_token(text, uuid)                    from public, anon, authenticated;
revoke all on function accoda_mail_consegna(uuid)                          from public, anon, authenticated;
revoke all on function on_custom_order_delivered()                         from public, anon, authenticated;
revoke all on function request_revision(text, text)                        from public, anon, authenticated;
revoke all on function accoda_mail_revisione_td(uuid)                      from public, anon, authenticated;
revoke all on function on_custom_revision_requested()                      from public, anon, authenticated;
revoke all on function order_files_for_page(uuid)                          from public, anon, authenticated;

grant execute on function td_exception_page(text)                      to service_role;
grant execute on function td_report_exception(text, integer, text)     to service_role;
grant execute on function td_delivery_ticket(text, text, bigint, text) to service_role;
grant execute on function td_deliver(text, text, text, bigint, text)   to service_role;
grant execute on function order_file_for_token(text, uuid)             to service_role;
grant execute on function request_revision(text, text)                 to service_role;
-- Per rilanciare a mano dal SQL Editor, come dicono gli alert.
grant execute on function accoda_mail_consegna(uuid)                   to service_role;
grant execute on function accoda_mail_revisione_td(uuid)               to service_role;
