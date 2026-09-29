-- XPETIS · 0050 · Il cruscotto del team
--
-- Milestone 9. Il quarto principio dice «l'umano entra sull'eccezione, mai
-- sulla routine». Fino a oggi l'umano entrava **senza strumenti**: l'eccezione
-- era una riga in una tabella che bisognava ricordarsi di aprire.
--
-- Quattro pezzi, e il terzo è quello che tiene in vita gli altri:
--
--   A. **le viste su Studio**, leggibili da una persona di fretta: ordini
--      aperti, prenotazioni in corso, coda degli alert, checklist dei 25;
--   B. **il catalogo degli alert**: per ogni `kind` un titolo, cosa costa
--      ignorarlo e cosa si fa. È ciò che mette la coda in ordine di danno e
--      non di data;
--   C. **chiudere un alert è una spunta**, e alcuni si chiudono da soli;
--   D. **il digest giornaliero**, un ramo dell'orologio e non un workflow;
--   E. **i rimborsi**: si fanno a mano sulla dashboard Stripe dell'agenzia
--      (deviazione 9), qui si annotano con una riga, e se ci si dimentica di
--      annotarli lo dice l'orologio.
--
-- ===========================================================================
-- PERCHÉ IL DIGEST E LA CHIUSURA SONO PROGETTATI INSIEME
-- ===========================================================================
-- Il digest si regge su `resolved_at is null`. Se nessuno marca gli alert come
-- risolti, ripete gli stessi per sempre e in tre giorni è rumore. E se
-- risolvere vuol dire scrivere una `update` a mano, nessuno lo farà.
--
-- Quindi:
--
--   · **una colonna `risolto` che si spunta su Studio**, sulla tabella
--     `team_alerts`. Non sulla vista: Studio mostra le viste in sola lettura.
--     Un trigger riempie `resolved_at` e `resolved_by` da sé, e riaprire
--     (togliere la spunta) li svuota;
--   · **alcuni alert si chiudono da soli**, quando la condizione che li ha
--     alzati non c'è più e il database lo può verificare: l'ordine richiesto
--     che il designer ha preso in carico, il saldo arrivato, il link
--     dell'agenzia rinnovato, il rimborso annotato;
--   · **il digest separa i nuovi dai vecchi.** I nuovi per esteso, i vecchi in
--     una riga per tipo con l'età del più vecchio. Un alert aperto da dodici
--     giorni non si rilegge per intero ogni mattina: si vede che è lì;
--   · **nessuna mail se non c'è niente da dire.**
--
-- ⚠️ La cosa che è facile non sapere: **chiudere un alert lo riarma.** Quasi
-- tutti i rami scrivono un alert nuovo solo se non ce n'è già uno aperto dello
-- stesso tipo (`where not exists … resolved_at is null`). Un alert lasciato
-- aperto «per ricordarsene» **zittisce tutti quelli dopo**: la prossima firma
-- rifiutata, di un altro designer, non scrive niente. Chiudere non è
-- dimenticare, è rimettere la sentinella.
--
-- ===========================================================================
-- COSA NON SI VEDE, ANCHE SE SONO VISTE PER IL TEAM
-- ===========================================================================
-- Uno screenshot di Studio finisce in una chat. Quindi in nessuna vista né nel
-- digest compaiono `cal_booking_uid` (su Cal.com basta quello per cancellare
-- una prenotazione), `video_url`, i token, `client_reference_id` (per le
-- consulenze **è** l'UID Cal.com), telefoni, indirizzi email dei viaggiatori.
--
-- E c'è un buco che questa migration chiude: **due alert scrivono l'UID Cal.com
-- nel messaggio** (`calcom_cancellazione_orfana`, `calcom_riprogrammazione_orfana`,
-- 0048). Il testo resta com'è nella tabella — è il diario, e serve a chi
-- indaga — ma ovunque un alert **esce** (vista, digest, notifica immediata)
-- passa da `alert_testo_sicuro()`, che nasconde le sequenze lunghe che hanno
-- la forma di un UID o di un token.

-- ===========================================================================
-- Tre piccole funzioni di lettura
-- ===========================================================================

-- «da 9 giorni», «da 3 ore». Il conto è sull'ora di Roma, perché è lì che il
-- team legge.
create or replace function da_quanto_it(p_ts timestamptz)
returns text
language sql stable set search_path = public as $$
  select case
    when p_ts is null then null
    when now() - p_ts < interval '1 hour' then 'da meno di un''ora'
    when now() - p_ts < interval '24 hours' then
      'da ' || extract(hour from now() - p_ts)::int
      || case when extract(hour from now() - p_ts)::int = 1 then ' ora' else ' ore' end
    when (now() at time zone 'Europe/Rome')::date - (p_ts at time zone 'Europe/Rome')::date = 1 then 'da ieri'
    else 'da ' || ((now() at time zone 'Europe/Rome')::date - (p_ts at time zone 'Europe/Rome')::date)
         || ' giorni'
  end;
$$;

-- «oggi alle 15:00», «domani alle 9:30», «il 02/10 alle 15:00».
create or replace function quando_it(p_ts timestamptz)
returns text
language sql stable set search_path = public as $$
  select case
    when p_ts is null then null
    when (p_ts at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date
      then 'oggi alle ' || to_char(p_ts at time zone 'Europe/Rome', 'HH24:MI')
    when (p_ts at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date + 1
      then 'domani alle ' || to_char(p_ts at time zone 'Europe/Rome', 'HH24:MI')
    when (p_ts at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date - 1
      then 'ieri alle ' || to_char(p_ts at time zone 'Europe/Rome', 'HH24:MI')
    else 'il ' || to_char(p_ts at time zone 'Europe/Rome', 'DD/MM') || ' alle '
         || to_char(p_ts at time zone 'Europe/Rome', 'HH24:MI')
  end;
$$;

-- Il testo di un alert come può uscire dalla tabella. Nasconde ogni sequenza
-- di 16 o più lettere e cifre che non sia attaccata a un trattino basso:
--
--   · gli UID Cal.com sono 22 caratteri alfanumerici («hXBtFar1ZUCZci4qszEbs2»);
--   · i token di `access_tokens` sono 32 (0004: base64 con +/= tradotti);
--   · gli UUID **restano** — i loro pezzi sono al massimo di 12, e servono: gli
--     alert dicono «si rilancia con select …('<uuid>')»;
--   · gli id Stripe **restano** (`cs_test_…`, `pi_…`): la parte lunga segue un
--     trattino basso, e non sono credenziali. Servono a cercare il pagamento
--     sulla dashboard.
--
-- Toglie anche le graffe doppie: un testo che finisce dentro una mail passa da
-- `render_template`, che tratterebbe `{{x}}` come un segnaposto non fornito.
create or replace function alert_testo_sicuro(p_testo text)
returns text
language sql immutable set search_path = public as $$
  select replace(replace(
           regexp_replace(coalesce(p_testo, ''), '(?<![A-Za-z0-9_])[A-Za-z0-9]{16,}(?![A-Za-z0-9_])',
                          '[codice nascosto]', 'g'),
           '{{', '{ {'), '}}', '} }');
$$;

comment on function alert_testo_sicuro(text) is
  'Il messaggio di un alert come può uscire da team_alerts (viste, digest, notifiche): '
  'nasconde le sequenze che hanno la forma di un UID Cal.com o di un token. '
  'UUID e id Stripe restano.';

create or replace function stato_ordine_it(p order_status)
returns text
language sql immutable as $$
  select case p
    when 'requested'               then 'richiesto'
    when 'in_definition'           then 'in definizione'
    when 'proposal_pending_agency' then 'in verifica dall''agenzia'
    when 'proposal_sent'           then 'proposta inviata'
    when 'in_progress'             then 'pagato, in lavorazione'
    when 'awaiting_deposit'        then 'attende l''acconto'
    when 'deposit_paid'            then 'acconto pagato'
    when 'awaiting_balance'        then 'attende il saldo'
    when 'balance_paid'            then 'saldo pagato'
    when 'delivered'               then 'consegnato'
    when 'revision_requested'      then 'revisione chiesta'
    when 'completed'               then 'chiuso'
    when 'cancelled'               then 'annullato'
    when 'disputed'                then 'in disputa'
  end;
$$;

-- ===========================================================================
-- PARTE B — Il catalogo degli alert
-- ===========================================================================
-- `severity` confonde «quanto è grave» con «quanto è urgente» (PIANO, 23
-- settembre). La coda la ordina un'altra scala, **cosa costa ignorarlo**:
--
--   1 · soldi o un cliente, adesso — c'è denaro fuori posto o una persona
--       senza quello che ha pagato;
--   2 · qualcosa è fermo — una prenotazione o una mail che non esiste, un
--       ordine che non va avanti;
--   3 · igiene — oggi non rompe niente, domani sì;
--   4 · da sapere.
--
-- È una tabella e non un `case` in una vista perché è **dato**: si corregge da
-- Studio, come `app_config`. E porta la cosa che serve di più a chi legge alle
-- due di notte: **cosa si fa**. Il runbook (`RUNBOOK.md`) racconta, questa
-- colonna indica.
--
-- Un `kind` che manca qui non sparisce: la coda lo mostra col costo 2 e il
-- titolo «tipo non catalogato». E l'harness legge il sorgente di tutte le
-- funzioni e fallisce se ne trova uno che non è in elenco.
create table team_alert_kinds (
  kind        text primary key,
  costo       smallint not null check (costo between 1 and 4),
  titolo_it   text not null check (length(btrim(titolo_it)) > 0),
  cosa_fare_it text not null check (length(btrim(cosa_fare_it)) > 0),
  -- Se entra nel digest giornaliero. Di norma sì: il digest è la coda che
  -- arriva in casella. Si spegne da Studio per un tipo che fa solo rumore.
  nel_digest  boolean not null default true
);

comment on table team_alert_kinds is
  'Un tipo di alert, uno per riga: titolo, costo di ignorarlo (1 soldi o cliente, 2 fermo, '
  '3 igiene, 4 da sapere) e cosa si fa. Ordina la coda team_coda_alert e riempie il digest. '
  'Modificabile da Studio.';

alter table team_alert_kinds enable row level security;
revoke all on team_alert_kinds from anon, authenticated;

insert into team_alert_kinds (kind, costo, titolo_it, cosa_fare_it) values
  -- ------------------------------------------------------------------ 1
  ('stripe_importo_non_combacia', 1, 'Incasso Stripe con importo sbagliato',
   'Confrontare l''importo sulla dashboard Stripe con quello dell''ordine o della prenotazione. Se il cliente ha pagato più del dovuto si rimborsa la differenza (RUNBOOK, «Rimborso»); se meno, si sente nel gruppo WhatsApp. L''ordine non è andato avanti.'),
  ('stripe_pagamento_senza_prenotazione', 1, 'Soldi incassati, nessuna prenotazione nostra',
   'Cercare la sessione Stripe citata nel messaggio sulla dashboard: chi ha pagato, per cosa. Di solito è una prenotazione cancellata prima del pagamento: si rimborsa, oppure si ricrea la call con il designer.'),
  ('stripe_pagamento_senza_ordine', 1, 'Soldi incassati, nessun ordine nostro',
   'Come sopra, per un ordine: cercare la sessione sulla dashboard Stripe e capire di chi è. Poi rimborso o registrazione a mano.'),
  ('stripe_pagamento_su_prenotazione_chiusa', 1, 'Pagata una consulenza già chiusa',
   'Il cliente ha pagato uno slot che non esiste più. Due strade: rifissare la call con il designer (e portare la prenotazione a confirmed), oppure rimborsare dalla dashboard e annotarlo.'),
  ('stripe_pagamento_su_ordine_non_in_attesa', 1, 'Pagato un ordine che non aspettava soldi',
   'L''ordine non è stato toccato. Si decide nel gruppo WhatsApp se il pagamento vale (e si porta l''ordine avanti a mano) o si rimborsa dalla dashboard e si annota.'),
  ('stripe_pagamento_ordine_non_gestito', 1, 'Pagamento che il ponte non sa trattare',
   'Il denaro c''è e l''ordine non si è mosso. Registrare a mano: guardare la riga in payments e portare l''ordine nello stato giusto da Studio.'),
  ('stripe_rata_non_riconosciuta', 1, 'Pagamento All Inclusive senza rata',
   'Non si sa se è acconto o saldo. Guardare la sessione sulla dashboard e le righe payments dell''ordine, poi portare l''ordine avanti a mano.'),
  ('stripe_rata_gia_registrata', 1, 'Rata All Inclusive pagata due volte',
   'In payments c''è già la stessa rata. Se la prima è rimborsata, si porta l''ordine avanti a mano; se no, la seconda va rimborsata.'),
  ('orologio_ha_liberato_uno_slot_pagato', 1, 'Slot liberato ma poi pagato',
   'Il cliente ha pagato una call che su Cal.com non esiste più. Rifissarla subito con il designer, nel gruppo o per mail al viaggiatore. Se non si riesce, rimborso.'),
  ('calcom_designer_ha_cancellato_call_pagata', 1, 'Il designer ha cancellato una call pagata',
   'Il Flusso non lo ammette. Sentire il designer, riprogrammare con il viaggiatore; se non si trova una data, rimborso pieno dalla dashboard e annotazione.'),
  ('calcom_request_reschedule_del_designer', 1, 'Il designer ha usato «Request reschedule»',
   'La call è cancellata e non ce n''è una nuova. Se era pagata: fissare la nuova data con il viaggiatore o rimborsare. Ricordare al designer di usare «Reschedule» (ONBOARDING_CALCOM_TD.md).'),
  ('saldo_scaduto', 1, 'Saldo All Inclusive non arrivato',
   'Sentire il viaggiatore nel gruppo commerciale e l''agenzia nel gruppo tecnico per le sue scadenze. Il sistema non annulla niente. Si chiude da solo quando il saldo arriva.'),
  ('rimborso_non_annotato', 1, 'Rimborso fatto su Stripe e non annotato qui',
   'Stripe dice che c''è stato un rimborso che il nostro database non conosce. Si annota con la riga select annota_rimborso(...) scritta nel messaggio. Si chiude da solo.'),
  -- ------------------------------------------------------------------ 2
  ('ordine_richiesto', 2, 'Un cliente ha chiesto un servizio dopo la call',
   'Aprire il gruppo WhatsApp (due per l''All Inclusive, più l''agenzia da assegnare). Fatto questo si spunta risolto; si chiude comunque da solo quando il designer comincia la proposta.'),
  ('calcom_firme_rifiutate', 2, 'Prenotazioni Cal.com rifiutate per firma',
   'Un designer ha la parola segreta del webhook sbagliata: le sue prenotazioni NON arrivano. Rigenerarla sul suo account e rifare la prenotazione di prova (RUNBOOK, «Le prenotazioni di un designer non arrivano»).'),
  ('calcom_viaggiatore_non_identificato', 2, 'Prenotazione senza viaggiatore riconoscibile',
   'Probabile prenotazione fatta fuori dal sito, direttamente su Cal.com. Nessuna riga creata e lo slot è occupato: contattare la persona, farle rifare la prenotazione dal sito, cancellare lo slot vecchio.'),
  ('calcom_servizio_non_configurato', 2, 'Prenotazione su un servizio che il designer non ha',
   'Lo slot è occupato e noi non abbiamo niente. Controllare td_services del designer (slug e servizio attivo) e il suo event type su Cal.com.'),
  ('calcom_servizio_senza_prezzo', 2, 'Prenotazione su un servizio senza prezzo',
   'Manca il prezzo a listino in td_services: la cassa non si apre. Scrivere il prezzo e far rifare la prenotazione.'),
  ('calcom_durata_non_combacia', 2, 'Durata della call diversa dal listino',
   'La prenotazione esiste col prezzo del listino, ma l''event type del designer ha una durata diversa. Correggere l''event type su Cal.com; per questa call decidere se il prezzo va bene.'),
  ('calcom_riprogrammazione_orfana', 2, 'Riprogrammazione di una call che non abbiamo',
   'Su Cal.com c''è una call che da noi non esiste. Cercarla sull''account del designer indicato e capire da dove viene.'),
  ('orologio_cancellazione_calcom_non_riesce', 2, 'Gli slot non pagati non si liberano',
   'Il braccio verso Cal.com non funziona: quegli slot restano occupati. Guardare le esecuzioni dell''orologio su n8n e event_log (RUNBOOK, «Lo slot non si libera»).'),
  ('email_composizione_fallita', 2, 'Una mail non si è composta',
   'Qualcuno non ha ricevuto la sua mail. Il messaggio dice quale e con che riga si rilancia, di solito dopo aver corretto un testo in message_templates.'),
  ('email_non_consegnata', 2, 'Mail ferme in coda',
   'Resend non accetta le mail. Guardare outbound_messages.last_error e le esecuzioni di n8n: chiave Resend, tetto dei 100 al giorno, dominio.'),
  ('email_rifiutata', 2, 'Mail rifiutata da Resend',
   'Rifiuto definitivo, non si ritenta. Leggere il codice nel messaggio: di solito un indirizzo sbagliato o un mittente non verificato.'),
  ('verifica_agenzia_scaduta', 2, 'L''agenzia non ha risposto in tempo',
   'Sentire l''agenzia nel gruppo tecnico, poi mandare un link nuovo con la riga scritta nel messaggio. Si chiude da solo quando l''ordine esce dalla verifica.'),
  ('postcall_mail_non_partita', 2, 'Mail post-call saltate',
   'Se è un arretrato di collaudo, si spunta risolto. Se l''orologio è stato fermo, quei viaggiatori vanno ripresi a mano su WhatsApp.'),
  -- ------------------------------------------------------------------ 3
  ('calcom_designer_sconosciuto', 3, 'Prenotazione da un account Cal.com che non conosciamo',
   'Un account usa il nostro event type ma non è in travel_designers.cal_username: di solito un designer con lo username scritto male da noi, o uno nuovo non ancora importato. Correggere cal_username.'),
  ('calcom_cancellazione_orfana', 3, 'Cancellazione di una call che non abbiamo',
   'Di solito una prenotazione di prova fatta prima del collegamento. Se il designer è nostro, controllare che non ci sia una call persa.'),
  ('calcom_riprogrammazione_non_attribuita', 3, 'Riprogrammazione senza autore',
   'Cal.com non ha detto chi ha spostato la call: nessun contatore è salito. Chiedere nel gruppo e, se serve, correggere a mano reschedule_count_traveler o reschedule_count_td.'),
  ('calcom_riprogrammazione_su_stato_chiuso', 3, 'Riprogrammata una call già chiusa',
   'La riga non è stata toccata. Controllare con il designer se la call c''è davvero: se sì, va rimessa in piedi a mano.'),
  ('stripe_pagamento_differito', 3, 'Pagamento non ancora incassato',
   'Un metodo di pagamento lento: l''ordine resta in attesa. Di norma si risolve da solo con un secondo messaggio di Stripe; se dopo un giorno non è cambiato niente, guardare la dashboard.'),
  ('stripe_riga_pagamento_ricostruita', 3, 'Riga di pagamento ricostruita dal webhook',
   'Il pagamento è registrato. La route che apre la cassa non ha scritto la sua riga: guardare i log di Vercel di quell''ora.'),
  ('orologio_ramo_non_configurato', 3, 'Rami dell''orologio spenti',
   'Manca una riga in app_config, e quelle scadenze non vengono trattate. Si rigioca supabase/seed/0001_config.sql (solo quello). Si chiude da solo.'),
  ('orologio_fuori_budget', 3, 'L''orologio tiene gli slot troppo a lungo',
   'Qualcuno ha cambiato finestra, grazia o cadenza in app_config e la somma supera i 35 minuti del Flusso. Rimettere i valori.'),
  ('notifica_team_non_configurata', 3, 'Le notifiche interne non partono',
   'Manca team_notify_events o team_notify_recipients in app_config. Il messaggio dice quale.'),
  ('notifica_team_fallita', 3, 'Una notifica interna non si è composta',
   'Di solito il testo team_notifica o team_digest in message_templates. Correggerlo e spuntare risolto.'),
  -- ------------------------------------------------------------------ 4
  ('token_inventati', 4, 'Link con token inesistente aperti',
   'Qualcuno prova indirizzi a caso, o un link è stato pubblicato spezzato. Nessuna pagina ha rivelato niente. Guardare i log di Vercel per l''origine.');

-- ===========================================================================
-- PARTE C — Chiudere un alert è una spunta
-- ===========================================================================
alter table team_alerts
  add column risolto boolean not null default false,
  add column resolution_note text;

update team_alerts set risolto = true where resolved_at is not null;

comment on column team_alerts.risolto is
  'Si spunta da Studio per chiudere l''alert: resolved_at e resolved_by si riempiono da '
  'soli. Togliere la spunta lo riapre. ⚠️ Chiudere un alert lo RIARMA: finché ce n''è uno '
  'aperto dello stesso tipo, quasi tutti i rami non ne scrivono di nuovi.';
comment on column team_alerts.resolution_note is
  'Facoltativa: cosa si è fatto. Chi legge il diario fra un mese ringrazia.';

-- Le due strade verso «chiuso» — la spunta da Studio e `resolved_at` scritto da
-- una funzione (l'orologio lo fa dalla 0042) — devono dire la stessa cosa.
create or replace function team_alerts_coerenza()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.risolto := new.risolto or new.resolved_at is not null;
    if new.risolto and new.resolved_at is null then
      new.resolved_at := now();
    end if;
    return new;
  end if;

  if new.risolto and not old.risolto then
    -- Spuntato da Studio (o da chiudi_alert).
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(nullif(btrim(new.resolved_by), ''), 'team (Studio)');
  elsif new.resolved_at is not null and old.resolved_at is null then
    -- Chiuso da una funzione che scrive resolved_at, come fa l'orologio.
    new.risolto := true;
  elsif not new.risolto and old.risolto then
    -- Riaperto.
    new.resolved_at := null;
    new.resolved_by := null;
  elsif new.resolved_at is null and old.resolved_at is not null then
    new.risolto := false;
    new.resolved_by := null;
  end if;
  return new;
end $$;

create trigger team_alerts_coerenza before insert or update on team_alerts
  for each row execute function team_alerts_coerenza();

-- Per il SQL Editor, quando un tipo di alert ne ha prodotti venti tutti uguali.
create or replace function chiudi_alert(p_kind text, p_nota text default null)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_n integer;
begin
  update team_alerts
     set risolto = true, resolved_by = 'team (chiudi_alert)', resolution_note = p_nota
   where kind = p_kind and not risolto;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function chiudi_alert(text, text) is
  'Chiude tutti gli alert aperti di un tipo. Restituisce quanti. Dal SQL Editor: '
  'select chiudi_alert(''calcom_designer_sconosciuto'', ''username corretto'');';

-- ---------------------------------------------------------------------------
-- I rami che chiudono da soli
-- ---------------------------------------------------------------------------
-- Solo dove la condizione è **verificabile dal database**. Una firma rifiutata
-- che smette di arrivare non vuol dire che il designer è stato sistemato —
-- forse non ha più prenotazioni — quindi quella resta a una persona.
create or replace function clock_ramo_alert_superati()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_n integer := 0;
  v_k integer;
begin
  -- Il designer ha cominciato la proposta: l'ordine è stato preso in carico.
  update team_alerts a
     set resolved_at = now(), resolved_by = 'orologio: l''ordine è uscito da «richiesto»'
    from orders o
   where a.kind = 'ordine_richiesto' and not a.risolto
     and a.entity_type = 'order' and a.entity_id = o.id
     and o.status <> 'requested';
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  -- L'ordine non è più in verifica: l'agenzia ha risposto, o il link è stato
  -- rinnovato e poi usato, o il team l'ha spostato.
  update team_alerts a
     set resolved_at = now(), resolved_by = 'orologio: l''ordine è uscito dalla verifica dell''agenzia'
    from orders o
   where a.kind = 'verifica_agenzia_scaduta' and not a.risolto
     and a.entity_type = 'order' and a.entity_id = o.id
     and o.status <> 'proposal_pending_agency';
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  -- Rinnovato ma ancora in verifica: c'è un link attivo non scaduto.
  update team_alerts a
     set resolved_at = now(), resolved_by = 'orologio: il link dell''agenzia è stato rinnovato'
   where a.kind = 'verifica_agenzia_scaduta' and not a.risolto
     and a.entity_type = 'order'
     and exists (select 1 from access_tokens t
                  where t.order_id = a.entity_id and t.purpose = 'agency_proposal_confirm'
                    and t.revoked_at is null and t.used_at is null
                    and (t.expires_at is null or t.expires_at > now()));
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  update team_alerts a
     set resolved_at = now(), resolved_by = 'orologio: l''ordine non attende più il saldo'
    from orders o
   where a.kind = 'saldo_scaduto' and not a.risolto
     and a.entity_type = 'order' and a.entity_id = o.id
     and o.status <> 'awaiting_balance';
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  -- Il rimborso è stato annotato per almeno quanto dice Stripe.
  update team_alerts a
     set resolved_at = now(), resolved_by = 'orologio: il rimborso è stato annotato'
    from team_rimborsi_stripe r
   where a.kind = 'rimborso_non_annotato' and not a.risolto
     and a.entity_type = 'payment' and a.entity_id = r.payment_id
     and coalesce(r.annotato_cents, 0) >= r.stripe_cents;
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  return v_n;
end $$;

-- ===========================================================================
-- PARTE E (prima della A: la coda la usa) — I rimborsi
-- ===========================================================================
-- Deviazione 9: i soldi stanno sul conto Stripe **dell'agenzia**, la chiave
-- che abbiamo è ristretta e non rimborsa. Il rimborso si fa **a mano dalla
-- dashboard**, col ruolo admin di Simone. La procedura è in `RUNBOOK.md`.
--
-- Qui ci sono le due cose che rendono quel gesto manuale sicuro:
--
--   1. **annotarlo è una riga**, `annota_rimborso()`, che accetta l'id che la
--      dashboard mostra (`pi_…`);
--   2. **dimenticarsi di annotarlo si vede.** Stripe manda `charge.refunded`
--      allo stesso endpoint, e il ponte lo mette nel diario dalla 0044
--      (`event_log.event = 'stripe_rimborso'`) senza toccare niente. Da lì un
--      ramo dell'orologio confronta quanto Stripe dice rimborsato con quanto
--      abbiamo annotato, e se non combacia alza `rimborso_non_annotato`.
--
-- Perché non si annota da solo, se il messaggio di Stripe c'è: perché un
-- rimborso **porta con sé una decisione** — la call si rifissa o no, l'ordine
-- si annulla o resta — e quella la prende una persona. Il database si limita a
-- non lasciar passare il silenzio.

-- Quanto Stripe dice rimborsato, per pagamento. Un `charge` porta
-- `amount_refunded`, che è **cumulativo**; un `refund` porta il suo importo e il
-- suo stato, e lo stesso rimborso arriva più volte (`refund.created`,
-- `refund.updated`). Si prende il più grande dei due conti.
create view team_rimborsi_stripe as
  with ev as (
    select l.payload -> 'oggetto' as o, l.created_at
      from event_log l
     where l.event = 'stripe_rimborso'
  ),
  per_pi as (
    select pi,
           max(case when obj = 'charge' then (o ->> 'amount_refunded')::int end) as da_charge,
           max(ultimo) as ultimo_evento
      from (select o ->> 'object' as obj, o ->> 'payment_intent' as pi, o, created_at as ultimo from ev) x
     where pi is not null
     group by pi
  ),
  da_refund as (
    select pi, sum(amount)::int as da_refund
      from (select distinct on (o ->> 'id') o ->> 'payment_intent' as pi,
                   (o ->> 'amount')::int as amount, o ->> 'status' as status
              from ev
             where o ->> 'object' = 'refund'
             order by o ->> 'id', created_at desc) r
     where status = 'succeeded' and pi is not null
     group by pi
  )
  select p.id as payment_id,
         p.stripe_payment_intent_id as pi,
         greatest(coalesce(c.da_charge, 0), coalesce(r.da_refund, 0)) as stripe_cents,
         p.refund_amount_cents as annotato_cents,
         c.ultimo_evento
    from per_pi c
    join payments p on p.stripe_payment_intent_id = c.pi
    left join da_refund r on r.pi = c.pi;

comment on view team_rimborsi_stripe is
  'Per ogni pagamento su cui Stripe ha mandato un messaggio di rimborso: quanto dice '
  'rimborsato Stripe e quanto abbiamo annotato noi. Se non combaciano, rimborso_non_annotato.';

revoke all on team_rimborsi_stripe from anon, authenticated;

create or replace function clock_ramo_rimborsi_non_annotati()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_n integer;
begin
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'rimborso_non_annotato', 'warning', 'payment', r.payment_id,
         'Stripe dice rimborsati ' || euro_it(r.stripe_cents) || ' sul pagamento '
         || r.pi || ' (' || coalesce(o.human_ref, 'consulenza del '
                                      || to_char(b.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY'))
         || '), da noi ne risultano ' || coalesce(euro_it(r.annotato_cents), 'zero') || '. '
         || 'Finché non si annota, il nostro database dice che quei soldi ci sono. '
         || 'Si annota con: select annota_rimborso(''' || r.pi || ''', '
         || (r.stripe_cents - coalesce(r.annotato_cents, 0)) || ', ''<perché>'');'
    from team_rimborsi_stripe r
    join payments p on p.id = r.payment_id
    left join orders o on o.id = p.order_id
    left join bookings b on b.id = p.booking_id
   where r.stripe_cents > coalesce(r.annotato_cents, 0)
     and not exists (select 1 from team_alerts a
                      where a.kind = 'rimborso_non_annotato' and a.entity_id = r.payment_id
                        and not a.risolto);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- L'annotazione. `p_riferimento` è l'id che la dashboard Stripe mostra
-- (`pi_…`) oppure l'id della riga di `payments`. `p_importo_cents` è **questo**
-- rimborso, non il totale: sulla dashboard ogni rimborso è un'operazione, e
-- chiedere il cumulato sarebbe chiedere un conto a chi ha fretta.
--
-- Non cambia lo stato della prenotazione né dell'ordine: quella è la decisione
-- che accompagna il rimborso, e la procedura dice di prenderla a parte. Copia
-- però importo e data sulla prenotazione, che ha le sue colonne dalla 0008.
create or replace function annota_rimborso(p_riferimento text, p_importo_cents integer, p_nota text)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  p       payments;
  v_tot   integer;
begin
  if p_importo_cents is null or p_importo_cents <= 0 then
    raise exception 'L''importo del rimborso va scritto in centesimi e maggiore di zero (50 € = 5000)';
  end if;
  if coalesce(btrim(p_nota), '') = '' then
    raise exception 'Serve una nota: perché si è rimborsato, e chi l''ha deciso';
  end if;

  if p_riferimento ~ '^pi_' then
    select * into p from payments where stripe_payment_intent_id = btrim(p_riferimento) for update;
  elsif p_riferimento ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into p from payments where id = p_riferimento::uuid for update;
  else
    raise exception 'Il riferimento è l''id Stripe del pagamento (pi_…) o l''id della riga di payments';
  end if;

  if not found then
    raise exception 'Nessun pagamento con riferimento %. L''id pi_ si copia dalla dashboard Stripe, pagina del pagamento', p_riferimento;
  end if;
  if p.status not in ('paid', 'partially_refunded') then
    raise exception 'Il pagamento % è in stato %: non c''è niente da rimborsare', p_riferimento, p.status;
  end if;

  v_tot := coalesce(p.refund_amount_cents, 0) + p_importo_cents;
  if v_tot > p.amount_cents then
    raise exception 'Rimborsati in tutto % su un incasso di %: controlla l''importo (in centesimi)',
      euro_it(v_tot), euro_it(p.amount_cents);
  end if;

  update payments
     set refund_amount_cents = v_tot,
         refunded_at         = now(),
         status              = case when v_tot = amount_cents then 'refunded'::payment_status
                                    else 'partially_refunded'::payment_status end,
         refund_note         = concat_ws(E'\n', refund_note,
                                 to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY') || ' · '
                                 || euro_it(p_importo_cents) || ' · ' || btrim(p_nota))
   where id = p.id;

  if p.booking_id is not null then
    update bookings set refunded_at = now(), refund_amount_cents = v_tot, last_actor = 'team'
     where id = p.booking_id;
  end if;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('payment', p.id, 'rimborso_annotato', 'team',
          jsonb_build_object('importo_cents', p_importo_cents, 'totale_cents', v_tot, 'nota', p_nota));

  return 'Annotato: ' || euro_it(p_importo_cents) || ' (in tutto ' || euro_it(v_tot) || ' su '
         || euro_it(p.amount_cents) || '). Ora decidi lo stato della prenotazione o dell''ordine: '
         || 'il rimborso da solo non lo cambia.';
end $$;

comment on function annota_rimborso(text, integer, text) is
  'Annota un rimborso fatto a mano sulla dashboard Stripe. Riferimento: pi_… o id di '
  'payments; importo: QUESTO rimborso, in centesimi. Non cambia stato a prenotazione e ordine.';

-- I pagamenti, per chi rimborsa e per chi riconcilia. Niente
-- `client_reference_id` (sulle consulenze è l'UID Cal.com) né id di sessione.
create view team_pagamenti as
  select
    p.paid_at                                          as pagato_il,
    coalesce(o.human_ref || ' · ' || case o.service_type when 'custom_itinerary' then 'su misura'
                                                         else 'All Inclusive' end
                         || case p.kind when 'deposit' then ' (acconto)'
                                        when 'balance' then ' (saldo)' else '' end,
             'Consulenza del ' || to_char(b.starts_at at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'))
                                                       as cosa,
    coalesce(td_o.display_name, td_b.display_name)     as designer,
    coalesce(t_o.full_name, t_b.full_name)             as viaggiatore,
    euro_it(p.amount_cents)                            as importo,
    p.status                                           as stato,
    p.stripe_account                                   as conto,
    p.stripe_payment_intent_id                         as id_stripe,
    euro_it(p.refund_amount_cents)                     as rimborsato,
    p.refunded_at                                      as rimborsato_il,
    p.refund_note                                      as nota_rimborso,
    euro_it(nullif(r.stripe_cents, 0))                 as stripe_dice_rimborsato,
    case when r.stripe_cents > coalesce(p.refund_amount_cents, 0)
         then 'DA ANNOTARE: select annota_rimborso(''' || p.stripe_payment_intent_id || ''', '
              || (r.stripe_cents - coalesce(p.refund_amount_cents, 0)) || ', ''<perché>'');'
    end                                                as da_fare,
    p.id                                               as payment_id
    from payments p
    left join orders o             on o.id = p.order_id
    left join bookings b           on b.id = p.booking_id
    left join travel_designers td_o on td_o.id = o.td_id
    left join travel_designers td_b on td_b.id = b.td_id
    left join travelers t_o        on t_o.id = o.traveler_id
    left join travelers t_b        on t_b.id = b.traveler_id
    left join team_rimborsi_stripe r on r.payment_id = p.id
   where p.status in ('paid', 'refunded', 'partially_refunded')
   order by (r.stripe_cents > coalesce(p.refund_amount_cents, 0)) desc nulls last, p.paid_at desc;

comment on view team_pagamenti is
  'Gli incassi riusciti, con l''id Stripe (pi_) per cercarli sulla dashboard e lo stato del '
  'rimborso. In cima quelli che Stripe dice rimborsati e noi no.';

revoke all on team_pagamenti from anon, authenticated;

-- ===========================================================================
-- PARTE A — Le quattro viste
-- ===========================================================================
-- Il criterio è uno solo: **cosa manca perché questa cosa vada avanti**, e chi
-- deve muoversi. Non lo stato grezzo. Le colonne vengono per prime nell'ordine
-- in cui si leggono, e i nomi sono in italiano perché li legge il team.
--
-- ⚠️ Su Supabase i privilegi di default concedono le viste nuove ad `anon` e
-- `authenticated`: le revoche in fondo non sono decorative.

-- ---------------------------------------------------------------------------
-- 1 · La coda degli alert
-- ---------------------------------------------------------------------------
create view team_coda_alert as
  select
    coalesce(k.costo, 2)                                   as costo,
    coalesce(k.titolo_it, '⚠️ tipo non catalogato: ' || a.kind) as cosa_e,
    coalesce(k.cosa_fare_it,
             'Leggere il messaggio. Poi aggiungere il tipo a team_alert_kinds, perché la prossima volta lo dica.')
                                                           as cosa_fare,
    coalesce(o.human_ref,
             case when b.id is not null then 'call di ' || td_b.display_name || ' ' || quando_it(b.starts_at) end)
                                                           as riguarda,
    da_quanto_it(a.created_at)                             as aperto,
    alert_testo_sicuro(a.message)                          as messaggio,
    a.severity                                             as gravita,
    a.kind,
    a.created_at,
    a.id
    from team_alerts a
    left join team_alert_kinds k    on k.kind = a.kind
    left join orders o              on a.entity_type = 'order'   and o.id = a.entity_id
    left join bookings b            on a.entity_type = 'booking' and b.id = a.entity_id
    left join travel_designers td_b on td_b.id = b.td_id
   where not a.risolto
   order by coalesce(k.costo, 2), a.severity desc, a.created_at;

comment on view team_coda_alert is
  'Gli alert aperti, in ordine di quanto costa ignorarli. Per chiuderne uno: tabella '
  'team_alerts, colonna risolto → true. Chiudere un alert lo riarma.';

-- ---------------------------------------------------------------------------
-- 2 · Gli ordini aperti
-- ---------------------------------------------------------------------------
-- `dal` è l'ingresso nello stato attuale, dalla storia degli stati. Non
-- `updated_at`: un ordine fermo da nove giorni a cui il designer ha corretto una
-- virgola della bozza è ancora fermo da nove giorni.
create view team_ordini_aperti as
  with o as (
    select o.*,
           td.display_name as designer,
           t.full_name     as viaggiatore,
           ag.name         as agenzia,
           (select max(h.created_at) from order_status_history h
             where h.order_id = o.id and h.to_status = o.status) as dal,
           (select p.paid_at from payments p
             where p.order_id = o.id and p.kind = 'full' and p.status = 'paid'
             order by p.paid_at desc limit 1) as pagato_il,
           (select d.decision || '|' || coalesce(d.note, '') from agency_decisions d
             where d.order_id = o.id order by d.decided_at desc limit 1) as ultima_agenzia,
           (select max(t2.expires_at) from access_tokens t2
             where t2.order_id = o.id and t2.purpose = 'agency_proposal_confirm'
               and t2.revoked_at is null and t2.used_at is null) as link_agenzia_scade,
           exists (select 1 from order_proposals pr where pr.order_id = o.id) as proposta_gia_partita,
           (select value from app_config where key = 'revision_window_days') as giorni_revisione
      from orders o
      join travel_designers td on td.id = o.td_id
      join travelers t on t.id = o.traveler_id
      left join agencies ag on ag.id = o.agency_id
     where o.status not in ('completed', 'cancelled')
  ),
  c as (
    select o.*,
      case
        when o.status in ('requested', 'disputed', 'deposit_paid') then 'team'
        when o.status = 'proposal_pending_agency' and o.link_agenzia_scade <= now() then 'team'
        when o.status = 'proposal_pending_agency' then 'agenzia'
        when o.status in ('proposal_sent', 'awaiting_deposit') then 'viaggiatore'
        when o.status = 'awaiting_balance' and o.balance_due_at <= now() then 'team'
        when o.status = 'awaiting_balance' then 'viaggiatore'
        when o.status = 'delivered' and o.service_type = 'all_inclusive' then 'team'
        when o.status = 'delivered' then 'nessuno'
        else 'designer'
      end as tocca_a,
      case
        -- ------------------------------------------------------ entrambi
        when o.status = 'requested' and o.service_type = 'all_inclusive' then
          'Aprire i due gruppi WhatsApp (commerciale e tecnico)'
          || case when o.agency_id is null then ' e assegnare l''agenzia' else '' end
          || '. Poi il designer scrive la proposta'
        when o.status = 'requested' then
          'Aprire il gruppo WhatsApp con viaggiatore e designer. Poi il designer scrive la proposta'
        when o.status = 'disputed' then
          'Decidere la disputa' || coalesce(': ' || nullif(rtrim(btrim(o.dispute_note), '. '), ''), '')
        -- ------------------------------------------------------ su misura
        when o.status = 'in_definition' and o.service_type = 'custom_itinerary' then
          case when o.proposal_description is null and o.proposta_gia_partita
                 then 'Rifare la proposta: quella partita è stata ritirata'
               when o.proposal_description is null then 'Scrivere la proposta'
               else 'Inviare la proposta: la bozza è salvata ma non è partita' end
        when o.status = 'proposal_sent' then
          'Pagare la proposta di ' || coalesce(euro_it(o.proposal_price_cents), '?')
        when o.status = 'in_progress' then
          'Consegnare l''itinerario entro il '
          || to_char((coalesce(o.pagato_il, o.dal) + make_interval(days => coalesce(o.delivery_days, 0)))
                     at time zone 'Europe/Rome', 'DD/MM')
          || case when coalesce(o.pagato_il, o.dal) + make_interval(days => coalesce(o.delivery_days, 0)) < now()
                  then ' — IN RITARDO' else '' end
        when o.status = 'revision_requested' then
          'Consegnare la revisione' || coalesce(': «' || left(nullif(btrim(o.revision_note), ''), 120) || '»', '')
        when o.status = 'delivered' and o.service_type = 'custom_itinerary' then
          'Niente: si chiude da sola il '
          || to_char((coalesce(o.revision_delivered_at, o.delivered_at)
                     + make_interval(days => coalesce(o.giorni_revisione, 0)::int)) at time zone 'Europe/Rome', 'DD/MM')
          || ', se il viaggiatore non chiede la revisione'
        -- ------------------------------------------------------ All Inclusive
        when o.status = 'in_definition' then
          case when o.ultima_agenzia like 'rejected|%'
                 then 'Rifare la proposta: l''agenzia l''ha giudicata non fattibile («'
                      || left(split_part(o.ultima_agenzia, '|', 2), 120) || '»)'
               when o.proposal_description is null then 'Preparare la proposta e il documento per l''agenzia'
               else 'Inviare la proposta all''agenzia: la bozza è salvata' end
        when o.status = 'proposal_pending_agency' and o.link_agenzia_scade <= now() then
          'Il link dell''agenzia è scaduto: sentirla e rinnovarlo con select rinnova_verifica_agenzia('''
          || o.id || ''');'
        when o.status = 'proposal_pending_agency' then
          'Verificare la proposta' || coalesce(' (' || o.agenzia || ')', '')
        when o.status = 'awaiting_deposit' then
          'Pagare l''acconto di ' || coalesce(euro_it(o.deposit_cents), '?')
        when o.status = 'deposit_paid' then
          'Scrivere balance_due_at, la data del saldo che dà l''agenzia: l''ordine chiede il saldo da solo'
        when o.status = 'awaiting_balance' and o.balance_due_at <= now() then
          'Il saldo di ' || coalesce(euro_it(o.balance_cents), '?') || ' è scaduto il '
          || to_char(o.balance_due_at at time zone 'Europe/Rome', 'DD/MM') || ': sentire viaggiatore e agenzia'
        when o.status = 'awaiting_balance' then
          'Pagare il saldo di ' || coalesce(euro_it(o.balance_cents), '?') || ' entro il '
          || to_char(o.balance_due_at at time zone 'Europe/Rome', 'DD/MM')
        when o.status = 'balance_paid' then
          'Caricare il documento finale (biglietti, voucher)'
        when o.status = 'delivered' then
          'Chiudere l''ordine a mano quando è il momento (la regola è un punto aperto)'
        else 'Stato ' || o.status
      end as cosa_serve
      from o
  )
  select
    case tocca_a
      when 'team'        then 'Tocca a noi'
      when 'designer'    then 'Aspetta il designer'
      when 'viaggiatore' then 'Aspetta il viaggiatore'
      when 'agenzia'     then 'Aspetta l''agenzia'
      else 'Nessuno'
    end || ' ' || coalesce(da_quanto_it(dal), '')          as chi,
    cosa_serve                                             as cosa_manca,
    human_ref                                              as ordine,
    case service_type when 'custom_itinerary' then 'su misura' else 'All Inclusive' end as servizio,
    designer,
    viaggiatore,
    departure_date                                         as partenza,
    stato_ordine_it(status)                                as stato,
    (now()::date - dal::date)                              as giorni_fermo,
    tocca_a,
    id
    from c
   order by (tocca_a = 'team') desc, (tocca_a = 'nessuno'), dal;

comment on view team_ordini_aperti is
  'Gli ordini non chiusi: chi deve muoversi, da quanto, e cosa manca. In cima quelli che '
  'toccano a noi, poi i più fermi.';

-- ---------------------------------------------------------------------------
-- 3 · Le prenotazioni in corso
-- ---------------------------------------------------------------------------
-- Chi deve pagare, chi ha la call a breve, chi aspetta il silenzio-conferma,
-- e le call in disputa. Niente `cal_booking_uid`, niente `video_url`, niente
-- telefono: una call si apre dal calendario del designer, non da qui.
create view team_prenotazioni_in_corso as
  with b as (
    select b.*, td.display_name as designer, t.full_name as viaggiatore,
           e.kind as segnalazione, e.waited_minutes, e.note as nota_segnalazione,
           (select value from app_config where key = 'booking_cancel_grace_min') as grazia,
           (select value from app_config where key = 'postcall_autoclose_hours') as ore_chiusura
      from bookings b
      join travel_designers td on td.id = b.td_id
      join travelers t on t.id = b.traveler_id
      left join booking_exceptions e on e.booking_id = b.id and e.resolved_at is null
     where b.status in ('pending_payment', 'confirmed', 'disputed')
  )
  select
    case
      when status = 'disputed' then 'Tocca a noi'
      when status = 'pending_payment' then 'Deve pagare'
      when starts_at > now() then 'Call ' || quando_it(starts_at)
      else 'Call fatta'
    end                                                    as cosa,
    case
      when status = 'disputed' then
        case segnalazione
          when 'no_show' then 'Il designer segnala un no-show (ha aspettato ' || waited_minutes || ' minuti)'
          when 'problem' then 'Il designer segnala un problema: «' || left(nota_segnalazione, 120) || '»'
          else 'In disputa' || coalesce(': ' || nullif(rtrim(btrim(dispute_note), '. '), ''), '')
        end || '. Si decide e si porta la prenotazione a completed, no_show o cancelled'
      when status = 'pending_payment' and payment_deadline_at is null then
        'Il viaggiatore non ha pagato. Nessuna scadenza: l''orologio non la libera'
      when status = 'pending_payment' and cancel_attempts > 0 then
        'Scaduta: l''orologio sta liberando lo slot (' || cancel_attempts || ' tentativi)'
      when status = 'pending_payment'
           and payment_deadline_at + make_interval(mins => coalesce(grazia, 0)::int) <= now() then
        'Scaduta ' || quando_it(payment_deadline_at) || ': lo slot si libera al prossimo giro dell''orologio'
      when status = 'pending_payment' then
        'Il viaggiatore deve pagare entro ' || quando_it(payment_deadline_at)
        || ', altrimenti lo slot si libera da solo'
      when starts_at > now() then 'Pagata. Niente da fare'
      else 'Si chiude da sola '
           || coalesce(quando_it(ends_at + make_interval(hours => ore_chiusura::int)), '(manca postcall_autoclose_hours)')
           || ', se il designer non segnala niente'
    end                                                    as cosa_succede,
    designer,
    viaggiatore,
    case service_type when 'consultation' then 'breve' else 'approfondita' end as consulenza,
    euro_it(price_cents)                                   as prezzo,
    starts_at                                              as inizio,
    status                                                 as stato,
    id
    from b
   order by (status = 'disputed') desc, (status = 'pending_payment') desc,
            case when status = 'pending_payment' then payment_deadline_at end nulls last, starts_at;

comment on view team_prenotazioni_in_corso is
  'Le consulenze non ancora chiuse: chi deve pagare, le call a breve, quelle in attesa '
  'del silenzio-conferma, quelle in disputa. Senza UID Cal.com né link della call.';

-- ---------------------------------------------------------------------------
-- 4 · La checklist di pubblicazione
-- ---------------------------------------------------------------------------
-- `td_publish_blockers` c'è dalla 0020 e la 0048 ci ha aggiunto gli slug.
-- Questa la mette in fila per chi deve agire: prima i pronti da pubblicare
-- (un gesto e sono in vetrina), poi quelli in vetrina con un problema, poi i
-- più vicini al traguardo.
create view team_checklist_pubblicazione as
  with r as (
    select td.id, td.display_name, td.slug, td.status, td.cal_username,
           td_publish_blockers(td.id) as blocchi,
           td_publish_warnings(td.id) as avvisi
      from travel_designers td
  )
  select
    case
      when status = 'published' and cardinality(blocchi) = 0 then 'In vetrina'
      when status = 'published' then 'IN VETRINA CON PROBLEMI'
      when cardinality(blocchi) = 0 then 'Pronto: si può pubblicare'
      when cardinality(blocchi) = 1 then 'Manca 1 cosa'
      else 'Mancano ' || cardinality(blocchi) || ' cose'
    end                                                    as stato,
    display_name                                           as designer,
    case when cardinality(blocchi) = 0 then null
         else array_to_string(blocchi, ' · ') end          as cosa_manca,
    case when cardinality(avvisi) = 0 then null
         else array_to_string(avvisi, ' · ') end           as avvisi,
    case
      when status <> 'published' and cardinality(blocchi) = 0 then
        'update travel_designers set status = ''published'' where slug = ''' || slug || ''';'
    end                                                    as come_si_pubblica,
    cal_username                                           as account_calcom,
    slug,
    status                                                 as stato_profilo,
    cardinality(blocchi)                                   as n_blocchi,
    id
    from r
   order by case when status <> 'published' and cardinality(blocchi) = 0 then 0
                 when status = 'published' and cardinality(blocchi) > 0 then 1
                 when status <> 'published' then 2
                 else 3 end,
            cardinality(blocchi), display_name;

comment on view team_checklist_pubblicazione is
  'I designer in fila per la pubblicazione: pronti, in vetrina con problemi, e a chi manca '
  'cosa. I blocchi sono quelli di td_publish_blockers: con uno aperto il profilo non si pubblica.';

-- ===========================================================================
-- PARTE D — Il digest giornaliero
-- ===========================================================================
-- Un ramo dell'orologio, non un workflow. Una volta al giorno, dopo l'ora di
-- `app_config.team_digest_hour` (ora di Roma), compone una mail agli indirizzi
-- di `team_notify_recipients` e la accoda come tutte le altre: valgono
-- `email_enabled`, `email_redirect_to` e il tetto di Resend.
--
-- **Una riga al giorno in `team_digests`**, unica per data. È insieme
-- l'idempotenza (l'orologio gira 288 volte al giorno) e l'entità della mail
-- (`outbound_messages` è unica per tipo, entità e destinatario: con un'entità
-- per giorno, due digest nello stesso giorno sono impossibili per vincolo).
--
-- Spento: `team_digest_hour` negativa. Assente: l'orologio lo dice con
-- `orologio_ramo_non_configurato`, come per ogni altro ramo.
create table team_digests (
  id         uuid primary key default gen_random_uuid(),
  giorno     date not null unique,
  n_nuovi    integer not null default 0,
  n_aperti   integer not null default 0,
  -- Falso se non c'era niente da dire (nessuna mail, di proposito) o nessun
  -- destinatario.
  inviato    boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table team_digests is
  'Un giorno, un digest. Unico per data: è l''idempotenza del ramo e l''entità della mail. '
  'inviato = false vuol dire che non c''era niente da dire.';

alter table team_digests enable row level security;
revoke all on team_digests from anon, authenticated;

create or replace function clock_ramo_digest_team()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_ora         numeric;
  v_dest        text;
  v_oggi        date := (now() at time zone 'Europe/Rome')::date;
  v_da          timestamptz;
  v_id          uuid;
  v_nuovi       text;
  v_aperti      text;
  v_n_nuovi     integer;
  v_n_aperti    integer;
  v_d           text;
  v_n           integer := 0;
  m             record;
begin
  select value into v_ora from app_config where key = 'team_digest_hour';
  if v_ora is null or v_ora < 0 then
    return 0;   -- assente lo dice clock_tick; negativa è spento per scelta
  end if;
  if extract(hour from now() at time zone 'Europe/Rome') < v_ora then
    return 0;
  end if;

  -- «Nuovi» = dopo il digest precedente, o nelle ultime 24 ore se è il primo.
  select max(created_at) into v_da from team_digests;
  v_da := coalesce(v_da, now() - interval '24 hours');

  insert into team_digests (giorno) values (v_oggi)
  on conflict (giorno) do nothing
  returning id into v_id;
  if v_id is null then
    return 0;   -- già fatto oggi
  end if;

  select count(*),
         string_agg('• ' || coalesce(k.titolo_it, a.kind)
                    || coalesce(' — ' || coalesce(o.human_ref,
                                   case when b.id is not null then 'call del '
                                     || to_char(b.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') end), '')
                    || E'\n' || left(alert_testo_sicuro(a.message), 400)
                    || case when length(a.message) > 400 then '…' else '' end
                    || E'\nCosa fare: ' || coalesce(k.cosa_fare_it, 'leggere il messaggio su Studio.'),
                    E'\n\n' order by coalesce(k.costo, 2), a.created_at)
    into v_n_nuovi, v_nuovi
    from team_alerts a
    left join team_alert_kinds k on k.kind = a.kind
    left join orders o   on a.entity_type = 'order'   and o.id = a.entity_id
    left join bookings b on a.entity_type = 'booking' and b.id = a.entity_id
   where not a.risolto and a.created_at > v_da
     and coalesce(k.nel_digest, true);

  -- I vecchi: una riga per tipo, con quanti e l'età del più vecchio.
  select coalesce(sum(n), 0),
         string_agg('• ' || titolo || case when n > 1 then ' ×' || n else '' end
                    || ' — ' || da_quanto_it(primo), E'\n' order by costo, primo)
    into v_n_aperti, v_aperti
    from (select coalesce(k.titolo_it, a.kind) as titolo, coalesce(k.costo, 2) as costo,
                 count(*) as n, min(a.created_at) as primo
            from team_alerts a
            left join team_alert_kinds k on k.kind = a.kind
           where not a.risolto and a.created_at <= v_da
             and coalesce(k.nel_digest, true)
           group by 1, 2) x;

  update team_digests set n_nuovi = v_n_nuovi, n_aperti = v_n_aperti where id = v_id;

  -- Niente da dire, niente mail. Una mail che dice «tutto bene» ogni mattina è
  -- la mail che si impara a non aprire.
  if v_n_nuovi = 0 and v_n_aperti = 0 then
    return 0;
  end if;

  select value_text into v_dest from app_config where key = 'team_notify_recipients';
  if coalesce(btrim(v_dest), '') = '' then
    insert into team_alerts (kind, severity, message)
    select 'notifica_team_non_configurata', 'warning',
           'Il digest di oggi aveva ' || v_n_nuovi || ' alert nuovi e ' || v_n_aperti
           || ' ancora aperti, ma app_config.team_notify_recipients è vuota: non è partito.'
     where not exists (select 1 from team_alerts
                        where kind = 'notifica_team_non_configurata' and not risolto);
    return 0;
  end if;

  select * into m from render_template('team_digest', jsonb_build_object(
    'data',     to_char(v_oggi, 'DD/MM/YYYY'),
    'n_nuovi',  v_n_nuovi::text,
    'n_aperti', v_n_aperti::text,
    'nuovi',    coalesce(v_nuovi, 'Nessuno.'),
    'aperti',   coalesce(v_aperti, 'Nessuno.')));

  for v_d in
    select distinct btrim(d) from regexp_split_to_table(v_dest, '\s*,\s*') d where btrim(d) <> ''
  loop
    if accoda_messaggio('team_digest', 'team_digest', v_id, v_d,
                        m.subject, m.body_text, email_document(m.body_html, m.subject)) is not null then
      v_n := v_n + 1;
    end if;
  end loop;

  update team_digests set inviato = v_n > 0 where id = v_id;
  return v_n;
exception when others then
  -- Come notifica_team: un digest rotto non ferma l'orologio. Il tipo
  -- notifica_team_* per costruzione non si notifica.
  insert into team_alerts (kind, severity, message)
  select 'notifica_team_fallita', 'warning',
         'Il digest giornaliero non si è composto: ' || sqlerrm
         || '. Il caso più probabile è il testo team_digest in message_templates. '
         || 'Corretto il testo, il digest si rifà da solo al giro successivo dell''orologio.'
   where not exists (select 1 from team_alerts where kind = 'notifica_team_fallita' and not risolto);
  return 0;
end $$;

-- ---------------------------------------------------------------------------
-- La notifica immediata, riemessa per passare dal testo sicuro
-- ---------------------------------------------------------------------------
-- Dalla 0045 parola per parola, salvo `alert_testo_sicuro()` sui due testi. Oggi
-- nessuno degli alert che portano un UID è in `team_notify_events`; il giorno
-- che qualcuno ce lo mettesse, l'UID finirebbe in tre caselle personali.
create or replace function on_team_alert_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.kind like 'notifica_team%' then
    return null;
  end if;

  perform notifica_team(
    new.kind, 'team_alert', new.id,
    case new.severity when 'critical' then '[XPETIS · critico] '
                      when 'warning'  then '[XPETIS · da guardare] '
                      else '[XPETIS] ' end
      || left(alert_testo_sicuro(new.message), 90)
      || case when length(new.message) > 90 then '…' else '' end,
    alert_testo_sicuro(new.message));
  return null;
end $$;

-- ===========================================================================
-- L'orologio, con tre rami in più
-- ===========================================================================
-- Riemesso dalla 0047: tre `perform` e una chiave nell'elenco. Tutto il resto
-- è parola per parola. L'ordine dei rami conta: i rimborsi prima della
-- chiusura automatica (che li chiude), e il digest per ultimo, così racconta lo
-- stato dopo il giro e non prima.
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

  for v_chiave in
    select u.chiave from unnest(array[
      'calcom_signature_alert_threshold', 'calcom_signature_alert_window_min',
      'token_miss_alert_threshold', 'token_miss_alert_window_min',
      'email_enabled', 'email_max_per_tick', 'email_max_attempts',
      'postcall_email_max_age_hours',
      'postcall_autoclose_hours', 'td_wait_minutes_in_call', 'revision_window_days',
      'deposit_percent', 'agency_confirm_valid_days',
      -- 0050: l'ora del digest (negativa = spento per scelta)
      'team_digest_hour'
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
  perform clock_ramo_postcall_td();
  perform clock_ramo_chiusura_call();
  perform clock_ramo_chiusura_ordini();
  perform clock_ramo_verifica_agenzia();
  perform clock_ramo_saldo_scaduto();
  perform clock_ramo_rimborsi_non_annotati();   -- 0050
  perform clock_ramo_alert_superati();          -- 0050: chiude quelli che non valgono più
  perform clock_ramo_digest_team();             -- 0050: per ultimo, racconta il giro

  -- ========================================================================
  -- I rami che hanno bisogno del mondo di fuori
  -- ========================================================================
  return query select * from clock_ramo_insoluti(p_limit);
  return query select * from clock_ramo_email(p_limit);
end $$;

-- ===========================================================================
-- I privilegi
-- ===========================================================================
revoke all on team_coda_alert              from anon, authenticated;
revoke all on team_ordini_aperti           from anon, authenticated;
revoke all on team_prenotazioni_in_corso   from anon, authenticated;
revoke all on team_checklist_pubblicazione from anon, authenticated;

revoke all on function da_quanto_it(timestamptz)                 from public, anon, authenticated;
revoke all on function quando_it(timestamptz)                    from public, anon, authenticated;
revoke all on function alert_testo_sicuro(text)                  from public, anon, authenticated;
revoke all on function stato_ordine_it(order_status)             from public, anon, authenticated;
revoke all on function team_alerts_coerenza()                    from public, anon, authenticated;
revoke all on function chiudi_alert(text, text)                  from public, anon, authenticated;
revoke all on function clock_ramo_alert_superati()               from public, anon, authenticated;
revoke all on function clock_ramo_rimborsi_non_annotati()        from public, anon, authenticated;
revoke all on function annota_rimborso(text, integer, text)      from public, anon, authenticated;
revoke all on function clock_ramo_digest_team()                  from public, anon, authenticated;
revoke all on function on_team_alert_notify()                    from public, anon, authenticated;
revoke all on function clock_tick(integer)                       from public, anon, authenticated;

grant execute on function clock_tick(integer)                    to service_role;
-- Per il team dal SQL Editor.
grant execute on function chiudi_alert(text, text)               to service_role;
grant execute on function annota_rimborso(text, integer, text)   to service_role;
