-- XPETIS · 0044 · L'ordine su misura, prima metà: dalla richiesta al pagamento
--
-- Fino alla 0043, dopo `requested` non succedeva niente: si apriva il gruppo
-- WhatsApp e il sistema smetteva di sapere cosa accadeva. Qui l'ordine su
-- misura arriva fino a **`in_progress`**, cioè proposta scritta dal designer e
-- pagata dal viaggiatore.
--
--   requested ──(bozza salvata dal TD)──▶ in_definition ──(Invia)──▶ proposal_sent
--        │                                     ▲                          │
--        └──────────────(Invia diretto)────────┼──────────────────────────┤
--                                              │ (il team la riapre)      │ (webhook Stripe)
--                                              └──────────────────────────┤
--                                                                         ▼
--                                                                    in_progress
--
-- **Fuori perimetro, di proposito:** consegna, revisione, chiusura a silenzio
-- e tutto l'All Inclusive (milestone 7). Dove una scelta di qui li tocca, lo si
-- dice nel punto in cui la si prende.
--
-- ===========================================================================
-- IL PRIMO TOKEN CHE TOCCA I SOLDI
-- ===========================================================================
-- La pagina del bottone servizio (0043) creava una richiesta da lavorare. La
-- pagina ordine del designer **fissa un prezzo che un cliente pagherà**. È la
-- stessa impalcatura e non merita la stessa fiducia, quindi il ragionamento va
-- scritto per intero, come la 0043 ha fatto per i bottoni.
--
-- **Il token è permanente e vive in una casella inoltrabile.** Deve esserlo:
-- il designer lo usa per tutta la vita dell'ordine (proposta, poi consegna e
-- revisione nella seconda metà), e un link che scade a metà lavoro è un
-- designer bloccato un sabato sera. Quindi la domanda non è «come lo rendo
-- sicuro», è **«cosa può fare chi se lo trova»**, e la risposta è costruita
-- perché sia piccola:
--
--  · **Prima dell'invio: scrivere una bozza e mandarla.** È il danno massimo, e
--    ha tre limiti. Il prezzo non muove denaro — lo muove il viaggiatore, con
--    un gesto suo, su una cassa che gli ridichiara l'importo. La proposta arriva
--    nel gruppo WhatsApp dove designer e viaggiatore si parlano, quindi una
--    proposta che nessuno ha scritto si vede. E ogni proposta partita finisce
--    nella vista `team_spot_check_proposte`, che è lo spot-check del Flusso.
--  · **Dopo l'invio: niente sulla proposta.** Prezzo, descrizione, giorni e
--    credito diventano **immutabili**, e non per la pagina: per il database,
--    con un trigger che vale anche per la chiave secret e per Studio. Il motivo
--    è che dopo l'invio quel prezzo esiste in tre posti che non controlliamo —
--    la casella del viaggiatore, il gruppo WhatsApp, e una cassa Stripe che
--    potrebbe essere aperta in quel momento. Cambiarlo da un link vorrebbe dire
--    che il viaggiatore paga X mentre la pagina dice Y.
--  · **Mai: toccare un pagamento, un rimborso, un altro ordine.** Il token è
--    legato a un ordine e a un designer; se il team riassegna l'ordine, il token
--    del designer precedente smette di funzionare (lo controlla ogni funzione,
--    non la pagina).
--
-- **Cosa il designer può correggere da solo:** la bozza, quante volte vuole,
-- finché non preme Invia. Il salvataggio e l'invio sono due gesti separati, e
-- l'invio **ridichiara il prezzo** che il designer ha visto nel riepilogo: se la
-- bozza è cambiata nel frattempo (un'altra scheda, un altro telefono), l'invio
-- si rifiuta invece di mandare un prezzo che nessuno ha riletto.
--
-- **Cosa invece passa dal team:** rifare una proposta già partita. Il team
-- riporta l'ordine in `in_definition` da Studio (la transizione c'è dalla 0010),
-- il designer riscrive e reinvia, il viaggiatore riceve una proposta nuova. È
-- raro, e quando succede è giusto che ci sia una persona: vuol dire che
-- qualcosa, nel gruppo, non è andato come doveva.
--
-- ===========================================================================
-- IL CREDITO CONSULENZA NON SI CALCOLA — e questo è il posto dove scriverlo
-- ===========================================================================
-- `proposal_price_cents` è il **prezzo finale**: quello che il viaggiatore paga,
-- già al netto di quello che il designer ha deciso di scalare. In questo file
-- non c'è, e non deve esserci, nessun `prezzo - credito`.
--
-- `consultation_credit_cents` è la **dichiarazione** del designer — «ho scalato
-- tanto» — e serve al controllo a campione del team, non al conto. È una
-- decisione di prodotto del Flusso (§6: «il credito consulenza non lo calcola il
-- sistema: lo applica il TD nella proposta, con spot-check del team»), non un
-- limite tecnico. Chi passa di qui e vede un prezzo che «non tiene conto del
-- credito» **non ha trovato un bug**: ha trovato la regola.
--
-- Il database fa due controlli, e nessuno dei due è un calcolo: il credito
-- dichiarato non supera quello che la call è costata (è il refuso «6000» per
-- «60,00»), e si dichiara **una volta sola** per call — l'indice
-- `orders_one_credit_per_booking` della 0009, che qui diventa una risposta
-- leggibile invece di un errore.

-- ===========================================================================
-- PARTE A — Su quale conto incassa, per tipo di pagamento
-- ===========================================================================
-- La 0039 ha scritto `consultation_payment_account()` per le consulenze. La
-- proposta su misura pone la stessa domanda per un altro tipo di pagamento, e
-- la **deviazione 9** dà la stessa risposta: in produzione incassa l'agenzia,
-- su tutto.
--
-- Non si scrive una seconda logica accanto alla prima: la regola diventa
-- `payment_account(kind)`, e la funzione della 0039 resta come involucro di una
-- riga — le route e il ponte che la chiamano non cambiano, e **due copie della
-- stessa regola sono il modo in cui due copie divergono**.
--
-- Il parametro è una riga di `app_config` per tipo, accanto a quella che
-- c'era: `custom_itinerary_stripe_account`. Due righe e non una perché oggi
-- dicono la stessa cosa ma non è detto che la diranno sempre (l'agenzia
-- potrebbe voler incassare le consulenze prima degli itinerari, o viceversa).
-- Il **default della colonna `payments.stripe_account` non si tocca**.
--
-- `deposit` e `balance` (All Inclusive) non rispondono qui: incassano sul conto
-- dell'agenzia **assegnata all'ordine**, che non è l'agenzia partner di
-- default e non è un parametro globale. È milestone 7, e questa funzione
-- solleva invece di indovinare.
create or replace function payment_account(p_kind payment_kind)
returns table (stripe_account stripe_account_kind, agency_id uuid)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_chiave  text;
  v_conto   text;
  v_agenzia uuid;
begin
  v_chiave := case p_kind
                when 'consultation' then 'consultation_stripe_account'
                when 'full'         then 'custom_itinerary_stripe_account'
              end;

  if v_chiave is null then
    raise exception 'payment_account: il conto per i pagamenti "%" non è un parametro globale (All Inclusive, milestone 7: incassa l''agenzia assegnata all''ordine)', p_kind;
  end if;

  select value_text into v_conto from app_config where key = v_chiave;

  if v_conto is null or btrim(v_conto) = '' then
    raise exception 'Manca app_config.%: su quale conto incassa un pagamento non si inventa', v_chiave;
  end if;

  v_conto := lower(btrim(v_conto));
  if v_conto not in ('xpetis', 'agency') then
    raise exception 'app_config.% vale "%", che non è né xpetis né agency', v_chiave, v_conto;
  end if;

  if v_conto = 'agency' then
    select id into v_agenzia from agencies where is_default_partner and is_active;
    if v_agenzia is null then
      raise exception 'app_config.% dice che incassa l''agenzia, ma non c''è nessuna agenzia partner attiva', v_chiave;
    end if;
  end if;

  return query select v_conto::stripe_account_kind, v_agenzia;
end $$;

comment on function payment_account(payment_kind) is
  'Su quale conto Stripe incassa un pagamento, per tipo (deviazione 9 del PIANO): '
  'consultation da app_config.consultation_stripe_account, full (su misura) da '
  'app_config.custom_itinerary_stripe_account. Deposit e balance sollevano: '
  'incassa l''agenzia assegnata all''ordine, milestone 7.';

-- L'involucro. Stessa firma e stesso risultato della 0039, zero logica sua.
create or replace function consultation_payment_account()
returns table (stripe_account stripe_account_kind, agency_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select * from payment_account('consultation')
$$;

comment on function consultation_payment_account() is
  'Involucro di payment_account(''consultation''), tenuto perché lo chiamano il '
  'ponte Stripe e la storia: la regola vive in un posto solo.';

-- ===========================================================================
-- PARTE B — La proposta
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Un euro scritto all'italiana
-- --------------------------------------------------------------------------
-- Serve alle mail e al messaggio pronto, che compone Postgres. `to_char` con
-- `G` e `D` dipende da `lc_numeric` del server, che su Supabase non è italiano:
-- «1,150.00» in una mail a un cliente italiano è un prezzo che si legge male.
-- Quindi a mano, senza dipendere da niente.
create or replace function euro_it(p_cents integer)
returns text language sql immutable strict as $$
  select regexp_replace((p_cents / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
         || ',' || lpad((p_cents % 100)::text, 2, '0') || ' €'
$$;

comment on function euro_it(integer) is
  'Centesimi → «1.150,00 €». A mano perché to_char dipende da lc_numeric, che su '
  'Supabase non è italiano.';

-- --------------------------------------------------------------------------
-- Le proposte partite, una riga per invio
-- --------------------------------------------------------------------------
-- `orders.proposal_*` porta **la proposta corrente**: la bozza finché l'ordine
-- è in definizione, la proposta partita dopo. Serve una seconda cosa che le
-- colonne dell'ordine non sanno dare: **cosa è stato mandato, e quando**. Due
-- ragioni, e la seconda è tecnica:
--
--  · il giorno che il team riapre una proposta e il designer la rifà, la prima
--    non deve sparire — è quella che il viaggiatore ha ricevuto, e in una
--    contestazione è l'unica prova di cosa gli è stato chiesto;
--  · la mail al viaggiatore è unica per (tipo, entità, destinatario) dalla
--    0014, ed è giusto così — è il tetto di spesa. Con l'ordine come entità, la
--    seconda proposta non potrebbe mai partire. Con la **proposta** come
--    entità, ogni invio ha la sua mail e il vincolo continua a dire «una mail
--    per proposta», che è la verità.
--
-- Si scrive **solo** dal trigger qui sotto, al passaggio a `proposal_sent`, e
-- non si modifica: una proposta partita è un fatto, non uno stato. La
-- cancellazione resta possibile per cascata, perché le prove del PIANO
-- ripuliscono cancellando l'ordine.
create table order_proposals (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  round         smallint not null check (round > 0),
  description   text not null,
  price_cents   integer not null check (price_cents > 0),
  delivery_days smallint not null check (delivery_days > 0),
  consultation_credit_cents integer not null default 0 check (consultation_credit_cents >= 0),
  -- Chi l'ha fatta partire. Quasi sempre `td`; `team` se è partita da Studio.
  actor         actor_kind not null,
  sent_at       timestamptz not null default now(),
  unique (order_id, round)
);

comment on table order_proposals is
  'Ogni proposta su misura partita, una riga per invio, immutabile. È la prova di '
  'cosa è stato chiesto al viaggiatore, e l''entità della mail proposal_traveler: '
  'una mail per proposta, così una proposta rifatta ha la sua.';

alter table order_proposals enable row level security;
revoke all on order_proposals from anon, authenticated;

create or replace function order_proposals_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Una proposta partita non si modifica: è quello che il viaggiatore ha ricevuto. Per cambiarla si riapre l''ordine e se ne manda una nuova.';
end $$;

create trigger order_proposals_no_update before update on order_proposals
  for each row execute function order_proposals_immutable();

-- --------------------------------------------------------------------------
-- La proposta partita non si tocca più
-- --------------------------------------------------------------------------
-- Il cuore della parte «cosa dev'essere irreversibile». Sta in un trigger e non
-- nelle funzioni dei token perché deve valere **per chiunque**: la pagina del
-- designer, un workflow n8n sbagliato, e il team su Studio. Il caso che conta
-- di più è l'ultimo — un `update` fatto «per sistemare un refuso» su una
-- proposta con una cassa Stripe aperta porterebbe il viaggiatore a pagare un
-- importo che la pagina non mostra più, e il ponte a rifiutare il pagamento.
--
-- La regola è sullo **stato di partenza**: i campi della proposta cambiano solo
-- mentre l'ordine è in `requested` o `in_definition`. Quindi un `update` che
-- scrive la proposta **e** la manda nello stesso colpo passa (parte da
-- `requested`), mentre riaprire e correggere sono due gesti: prima lo stato
-- torna a `in_definition`, poi si scrive.
--
-- Solo su misura. L'All Inclusive ha una proposta che va all'agenzia e torna
-- indietro se non conferma, con il suo giro: le sue regole le scrive la
-- milestone 7, e questo trigger non le anticipa.
create or replace function freeze_sent_proposal()
returns trigger language plpgsql as $$
begin
  if new.service_type <> 'custom_itinerary' then
    return new;
  end if;

  if old.status not in ('requested', 'in_definition')
     and (new.proposal_description      is distinct from old.proposal_description
       or new.proposal_price_cents      is distinct from old.proposal_price_cents
       or new.delivery_days             is distinct from old.delivery_days
       or new.consultation_credit_cents is distinct from old.consultation_credit_cents) then
    raise exception 'La proposta di % è già partita (stato %): prezzo, descrizione, giorni e credito non si toccano più. Per rifarla si riporta l''ordine in in_definition e se ne manda una nuova.',
      old.human_ref, old.status;
  end if;

  if new.status = 'proposal_sent' and old.status is distinct from 'proposal_sent' then
    -- La 0009 pretende prezzo e giorni; qui anche la descrizione. Una proposta
    -- senza descrizione è un prezzo e basta, e il Flusso vuole che la mail
    -- «venda»: è lei che spiega il viaggio.
    if new.proposal_description is null or btrim(new.proposal_description) = '' then
      raise exception 'Proposta su misura % senza descrizione', new.human_ref;
    end if;
    -- Stripe non incassa meno di 50 centesimi in euro: una proposta sotto non
    -- si potrebbe pagare. È il contratto dell'API, come i 30 minuti di
    -- `CASSA_MIN_SECONDI`, non un parametro di prodotto.
    if new.proposal_price_cents < 50 then
      raise exception 'Proposta su misura % sotto il minimo che Stripe incassa (0,50 €)', new.human_ref;
    end if;
    new.proposal_sent_at := now();
  end if;

  return new;
end $$;

create trigger orders_freeze_sent_proposal before update on orders
  for each row execute function freeze_sent_proposal();

comment on function freeze_sent_proposal() is
  'Su misura: i campi della proposta cambiano solo in requested o in_definition. '
  'Vale per chiunque, Studio compreso: dopo l''invio quel prezzo è nella casella del '
  'viaggiatore e forse in una cassa Stripe aperta.';

-- ===========================================================================
-- PARTE C — Le due mail
-- ===========================================================================
-- Composizione e accodamento come le altre (0043): `render_template`, poi
-- `accoda_messaggio` con il suo `on conflict do nothing`. Nessun invio diretto:
-- le consegna il ramo `clock_ramo_email` dell'orologio, con l'interruttore e il
-- dirottamento che ci sono già.
--
-- ## Il grilletto è lo stato, non un workflow
--
-- Tutte e due partono da un **trigger sull'ordine**, non da un ramo
-- dell'orologio. La mail post-call sta nell'orologio perché il suo grilletto è
-- il **tempo** (`ends_at` che passa); queste hanno per grilletto un **evento** —
-- nasce un ordine, parte una proposta — e un evento il database lo vede nel
-- momento in cui accade. Il vantaggio non è solo la velocità: la mail parte
-- **chiunque** faccia il passaggio di stato, anche il team da Studio, perché
-- «proposta inviata» vuol dire che il viaggiatore l'ha ricevuta.
--
-- ## Una mail che non si compone non ferma niente
--
-- Né la nascita dell'ordine (è il clic di un viaggiatore) né l'invio della
-- proposta (è il lavoro di un designer). Si scrive un alert critico e si va
-- avanti; il designer ha comunque il link da girare nel gruppo, e il team può
-- ricomporre la mail a mano con la funzione nominata nell'alert.

-- --------------------------------------------------------------------------
-- Mail 1 — al designer, alla nascita dell'ordine: il suo link
-- --------------------------------------------------------------------------
-- Flusso §7: la pagina ordine è «raggiungibile solo dal link con token che [il
-- designer] riceve via mail a ogni nuovo ordine». Il token nasce qui, insieme
-- alla mail, e **non scade**: vedi il ragionamento in testa al file.
create or replace function accoda_mail_ordine_td(p_order_id uuid)
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

  select o2.id, o2.td_id, o2.human_ref, o2.service_type,
         td.email as td_email,
         split_part(coalesce(nullif(btrim(td.display_name), ''), ''), ' ', 1) as td_nome,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as viaggiatore,
         b.starts_at, b.price_cents as prezzo_call
    into o
    from orders o2
    join travel_designers td on td.id = o2.td_id
    join travelers t on t.id = o2.traveler_id
    left join bookings b on b.id = o2.source_booking_id
   where o2.id = p_order_id;

  if not found or o.service_type <> 'custom_itinerary' then
    return null;
  end if;

  insert into access_tokens (purpose, audience, order_id, td_id)
  values ('td_order_page', 'td', o.id, o.td_id)
  on conflict (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
    where revoked_at is null
  do nothing;

  select a.token into v_token
    from access_tokens a
   where a.purpose = 'td_order_page' and a.order_id = o.id and a.revoked_at is null;

  select * into m from render_template(
    'order_new_td',
    jsonb_build_object(
      'saluto', case when coalesce(o.td_nome, '') <> '' then 'Ciao ' || o.td_nome else 'Ciao' end,
      'human_ref', o.human_ref,
      -- Il nome del viaggiatore può mancare (Google non lo dà sempre): si
      -- ripiega su una parola che regge la frase, senza genere.
      'nome_viaggiatore', coalesce(nullif(o.viaggiatore, ''), 'Chi ha fatto la call con te'),
      'data_call', coalesce(to_char(o.starts_at, 'DD/MM/YYYY'), '(data non registrata)'),
      'prezzo_call', coalesce(euro_it(o.prezzo_call), '(prezzo non registrato)'),
      'link_ordine', rtrim(v_base, '/') || '/ordine/' || v_token,
      'whatsapp', v_whatsapp));

  return accoda_messaggio('order_new_td', 'order', o.id, o.td_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order', p_order_id,
         'La mail al designer con il link della pagina ordine non si è composta e **il designer '
         || 'non ha il suo link**: ' || sqlerrm || '. Sistemato il testo in message_templates, si '
         || 'rilancia con: select accoda_mail_ordine_td(''' || p_order_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

create or replace function on_custom_order_created()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  -- Solo su misura. L'All Inclusive avrà la sua pagina ordine (milestone 7) e
  -- un token che puntasse qui oggi aprirebbe una pagina che non lo sa trattare.
  if new.service_type = 'custom_itinerary' and new.status = 'requested' then
    perform accoda_mail_ordine_td(new.id);
  end if;
  return null;
end $$;

create trigger orders_custom_created after insert on orders
  for each row execute function on_custom_order_created();

-- --------------------------------------------------------------------------
-- Mail 2 — al viaggiatore, all'invio della proposta
-- --------------------------------------------------------------------------
-- Flusso §7: «una mail completa: nel corpo c'è tutta la spiegazione del viaggio,
-- il prezzo, le condizioni e il link di pagamento». Il link porta alla pagina
-- gemella (`traveler_public_proposal`), dove sta il pagamento: la mail non
-- porta un indirizzo Stripe, perché una Checkout Session scade in mezz'ora e
-- una mail no.
create or replace function accoda_mail_proposta(p_proposal_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  p          record;
  v_token    text;
  f          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;
  end if;

  select pr.id, pr.order_id, pr.description, pr.price_cents, pr.delivery_days,
         o.human_ref, t.email,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name
    into p
    from order_proposals pr
    join orders o on o.id = pr.order_id
    join travelers t on t.id = o.traveler_id
    join travel_designers td on td.id = o.td_id
   where pr.id = p_proposal_id;

  if not found then return null; end if;

  select a.token into v_token
    from access_tokens a
   where a.purpose = 'traveler_public_proposal' and a.order_id = p.order_id and a.revoked_at is null;

  select * into f from render_template('blocco_firma',
    jsonb_build_object('whatsapp', v_whatsapp,
                       'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

  select * into m from render_template(
    'proposal_traveler',
    jsonb_build_object(
      'saluto', case when coalesce(p.nome, '') <> '' then 'Ciao ' || p.nome else 'Ciao' end,
      'designer', p.td_name,
      'human_ref', p.human_ref,
      -- La descrizione la scrive il designer, e `render_template` fa fallire la
      -- composizione su ogni `{{...}}` rimasto nel testo: una descrizione che
      -- contenesse due graffe per caso bloccherebbe la sua stessa mail. Le si
      -- spezza, e il viaggiatore legge «{ {» invece di non leggere niente.
      'descrizione', replace(replace(p.description, '{{', '{ {'), '}}', '} }'),
      'prezzo', euro_it(p.price_cents),
      'giorni_consegna', case when p.delivery_days = 1 then '1 giorno'
                              else p.delivery_days || ' giorni' end,
      'link_proposta', rtrim(v_base, '/') || '/proposta/' || v_token),
    jsonb_build_object('firma', f.body_html),
    jsonb_build_object('firma', f.body_text));

  return accoda_messaggio('proposal_traveler', 'order_proposal', p.id, p.email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order_proposal', p_proposal_id,
         'La mail con la proposta al viaggiatore non si è composta e **non è partita**: '
         || sqlerrm || '. La proposta è comunque inviata e il designer ha il link da girare nel '
         || 'gruppo WhatsApp. Sistemato il testo in message_templates, si rilancia con: '
         || 'select accoda_mail_proposta(''' || p_proposal_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- Al passaggio a `proposal_sent`, in un colpo solo come vuole il Flusso: la
-- fotografia della proposta, la pagina gemella, la mail.
--
-- La fotografia e il token stanno **fuori** dal blocco che protegge la mail: se
-- non si scrivono, l'invio deve fallire tutto, perché una proposta partita
-- senza la sua riga in `order_proposals` è una proposta di cui non resta prova.
create or replace function on_custom_proposal_sent()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_round smallint;
  v_id    uuid;
begin
  if new.service_type <> 'custom_itinerary' or new.status <> 'proposal_sent'
     or old.status = 'proposal_sent' then
    return null;
  end if;

  select coalesce(max(pr.round), 0) + 1 into v_round
    from order_proposals pr where pr.order_id = new.id;

  insert into order_proposals (order_id, round, description, price_cents, delivery_days,
                               consultation_credit_cents, actor)
  values (new.id, v_round, new.proposal_description, new.proposal_price_cents,
          new.delivery_days, new.consultation_credit_cents, new.last_actor)
  returning id into v_id;

  -- Un token per ordine, non per proposta: il link che il designer ha girato
  -- nel gruppo resta buono anche se la proposta viene rifatta, e mostra sempre
  -- quella corrente.
  insert into access_tokens (purpose, audience, order_id, td_id)
  values ('traveler_public_proposal', 'traveler', new.id, new.td_id)
  on conflict (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
    where revoked_at is null
  do nothing;

  perform accoda_mail_proposta(v_id);
  return null;
end $$;

create trigger orders_custom_proposal_sent after update of status on orders
  for each row execute function on_custom_proposal_sent();

-- --------------------------------------------------------------------------
-- Lo spot-check del Flusso, come vista
-- --------------------------------------------------------------------------
-- «Prezzo call e prezzo proposta stanno entrambi su Supabase, il controllo è un
-- confronto a vista» (§6). Una vista e non un alert per proposta: lo spot-check
-- è routine, e un alert per ogni proposta sarebbe il modo sicuro di insegnare
-- al team a non leggere gli alert.
--
-- ⚠️ Su Supabase i privilegi di default concedono le viste nuove ad `anon` e
-- `authenticated`: la revoca qui sotto non è decorativa. Questa vista porta i
-- prezzi di tutti gli ordini.
create view team_spot_check_proposte as
  select
    pr.sent_at,
    o.human_ref,
    o.status,
    td.display_name              as designer,
    pr.round                     as invio_n,
    b.price_cents                as prezzo_call_cents,
    pr.consultation_credit_cents as credito_dichiarato_cents,
    pr.price_cents               as prezzo_proposta_cents,
    pr.delivery_days             as giorni_consegna,
    pr.actor                     as inviata_da,
    -- Il credito della stessa call dichiarato su un altro ordine: se c'è, qui
    -- non andava scalato.
    (select o2.human_ref from orders o2
      where o2.source_booking_id = o.source_booking_id and o2.id <> o.id
        and o2.consultation_credit_cents > 0 limit 1) as credito_gia_su
    from order_proposals pr
    join orders o on o.id = pr.order_id
    join travel_designers td on td.id = o.td_id
    left join bookings b on b.id = o.source_booking_id
   order by pr.sent_at desc;

comment on view team_spot_check_proposte is
  'Lo spot-check del Flusso §6: per ogni proposta partita, prezzo della call, credito '
  'dichiarato e prezzo proposto, affiancati. Il credito NON è sottratto da nessuna '
  'parte: il prezzo proposto è già al netto, per scelta del designer.';

revoke all on team_spot_check_proposte from anon, authenticated;

-- ===========================================================================
-- PARTE D — Le pagine a token
-- ===========================================================================
-- Stessa regola della 0043: **la pagina non decide**, chiede e riporta. Ogni
-- funzione risolve il token **una volta** (risolvere scrive `use_count`),
-- controlla scopo, destinatario e designer, e solo dopo guarda l'ordine.

-- Il controllo comune alle tre funzioni del designer, in un posto solo.
-- Restituisce l'ordine già bloccato per l'aggiornamento quando `p_blocca`: chi
-- salva e chi invia devono vedere lo stesso ordine per tutta la durata del
-- gesto, e due schede aperte non devono poterselo passare in mezzo.
create or replace function td_order_from_token(p_token text, p_blocca boolean default false)
returns table (esito text, token text, order_id uuid)
language plpgsql volatile security definer set search_path = public as $$
declare
  d record;
  o record;
begin
  select * into d from resolve_access_token_detail(p_token);

  if d.esito is distinct from 'valido' then
    esito := d.esito; return next; return;
  end if;
  if d.purpose <> 'td_order_page' or d.audience <> 'td' or d.order_id is null then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  if p_blocca then
    select o2.id, o2.td_id, o2.service_type into o from orders o2 where o2.id = d.order_id for update;
  else
    select o2.id, o2.td_id, o2.service_type into o from orders o2 where o2.id = d.order_id;
  end if;

  if not found then
    esito := 'ordine_sconosciuto'; return next; return;
  end if;

  -- **Il token è del designer, non dell'ordine.** Se il team riassegna l'ordine
  -- a un altro designer, il link rimasto nella casella del primo non deve più
  -- aprire niente. Si risponde come a un token di altro tipo: dire «l'ordine è
  -- stato riassegnato» a chi ha un link inoltrato racconterebbe già troppo.
  if d.td_id is distinct from o.td_id then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  if o.service_type <> 'custom_itinerary' then
    esito := 'servizio_non_gestito'; return next; return;
  end if;

  esito := 'valido'; token := d.token; order_id := o.id;
  return next;
end $$;

-- --------------------------------------------------------------------------
-- La pagina ordine, vista dal designer
-- --------------------------------------------------------------------------
-- Flusso §7: «l'intestazione (viaggiatore, servizio, data della call di
-- origine, prezzo pagato per la consulenza da scalare), lo stato corrente, e la
-- sola azione possibile per quello stato».
--
-- Del viaggiatore torna **il nome, non il cognome, non la mail, non il
-- telefono**. Il designer lo conosce già — ci ha fatto una call — e il nome
-- basta a riconoscerlo insieme alla data; il resto sarebbe materiale in più per
-- chi trova il link inoltrato.
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

  -- Il credito di questa call è già stato dichiarato su un altro ordine? Se sì,
  -- la pagina lo dice prima che il designer scriva il prezzo, invece di
  -- rifiutare il salvataggio dopo.
  select o2.human_ref into v_credito
    from orders o2
   where o2.source_booking_id = o.source_booking_id and o2.id <> o.id
     and o2.consultation_credit_cents > 0
   limit 1;

  -- Dopo l'invio: il link della pagina gemella e il messaggio pronto da
  -- copiare nel gruppo. Il messaggio è un testo di Gaia, quindi una riga di
  -- `message_templates`; se non si compone la pagina resta in piedi senza, e il
  -- link da solo basta.
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
    'messaggio_pronto',  v_msg);
end $$;

-- --------------------------------------------------------------------------
-- Salvare la bozza
-- --------------------------------------------------------------------------
-- Il designer la corregge quante volte vuole: è il suo spazio per sbagliare.
-- Il primo salvataggio porta l'ordine da `requested` a `in_definition` — vuol
-- dire «il designer ci sta lavorando», ed è l'informazione che il team non ha
-- finché non guarda il gruppo WhatsApp.
--
-- Le risposte sono parole, non errori: la pagina le traduce in frasi.
create or replace function save_proposal_draft(
  p_token         text,
  p_descrizione   text,
  p_prezzo_cents  integer,
  p_giorni        integer,
  p_credito_cents integer)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a        record;
  o        orders;
  v_call   integer;
  v_altro  text;
  v_desc   text := btrim(coalesce(p_descrizione, ''));
  v_cred   integer := coalesce(p_credito_cents, 0);
begin
  select * into a from td_order_from_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;

  select * into o from orders where id = a.order_id;

  if o.status = 'proposal_sent' or o.status in ('in_progress', 'delivered', 'revision_requested', 'completed') then
    return jsonb_build_object('ok', false, 'esito', 'proposta_gia_inviata', 'stato', o.status);
  end if;
  if o.status not in ('requested', 'in_definition') then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;

  -- ------------------------------------------------------------- i dati
  if v_desc = '' then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'descrizione');
  end if;
  -- Un tetto tecnico, non di prodotto: è ben oltre qualunque descrizione vera
  -- e ferma chi incolla un documento intero dentro una mail.
  if length(v_desc) > 20000 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'descrizione');
  end if;
  if p_prezzo_cents is null or p_prezzo_cents < 50 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'prezzo');
  end if;
  if p_giorni is null or p_giorni < 1 or p_giorni > 32767 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'giorni');
  end if;
  if v_cred < 0 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'credito');
  end if;

  -- ------------------------------------------------------------- il credito
  -- ⚠️ Nessuna sottrazione. Il credito è la dichiarazione del designer di quanto
  -- ha già scalato dal prezzo qui sopra, e il prezzo resta quello che ha scritto.
  -- Vedi la testa del file: se qualcuno aggiunge qui un `p_prezzo_cents -
  -- v_cred`, fa pagare al viaggiatore la consulenza **due volte meno**.
  if v_cred > 0 then
    if o.source_booking_id is null then
      -- Un ordine creato a mano dal team, senza una call: non c'è niente da
      -- scalare.
      return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'credito',
                                'motivo', 'senza_call');
    end if;

    select price_cents into v_call from bookings where id = o.source_booking_id;
    if v_call is null or v_cred > v_call then
      -- Non un calcolo: un controllo di plausibilità. Dichiarare di aver
      -- scalato più di quanto la call è costata è quasi sempre un refuso sui
      -- centesimi.
      return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'credito',
                                'motivo', 'oltre_prezzo_call', 'prezzo_call_cents', v_call);
    end if;

    select o2.human_ref into v_altro
      from orders o2
     where o2.source_booking_id = o.source_booking_id and o2.id <> o.id
       and o2.consultation_credit_cents > 0
     limit 1;
    if v_altro is not null then
      return jsonb_build_object('ok', false, 'esito', 'credito_gia_usato', 'su', v_altro);
    end if;
  end if;

  update orders set
    proposal_description      = v_desc,
    proposal_price_cents      = p_prezzo_cents,
    delivery_days             = p_giorni,
    consultation_credit_cents = v_cred,
    status     = case when status = 'requested' then 'in_definition'::order_status else status end,
    last_actor = 'td'
   where id = o.id;

  -- La storia degli stati registra solo i cambi di stato: una bozza corretta
  -- tre volte è un cambio solo. Il diario tiene tutte e tre le versioni, col
  -- token, perché il designer non ha login e questa è l'unica traccia di cosa
  -- ha scritto e quando.
  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id, 'proposta_bozza_salvata', 'td',
          jsonb_build_object('token', a.token, 'prezzo_cents', p_prezzo_cents,
                             'giorni', p_giorni, 'credito_cents', v_cred));

  return jsonb_build_object('ok', true, 'esito', 'salvata');
exception
  -- La corsa sul credito: due ordini della stessa call che lo dichiarano nello
  -- stesso istante. L'indice della 0009 ferma il secondo.
  when unique_violation then
    return jsonb_build_object('ok', false, 'esito', 'credito_gia_usato');
end $$;

-- --------------------------------------------------------------------------
-- Inviare
-- --------------------------------------------------------------------------
-- Il gesto irreversibile. **Ridichiara il prezzo**: la pagina manda l'importo
-- che il designer ha letto nel riepilogo, e se la bozza nel frattempo è
-- cambiata l'invio si rifiuta. Senza, due schede aperte — una col riepilogo da
-- 1.150 €, l'altra dove si corregge in 11.500 — manderebbero un prezzo che
-- nessuno ha riletto.
--
-- Il doppio clic risponde `gia_inviata` con `ok: true`: è la verità, e la
-- seconda proposta **non** parte. È anche il caso «due proposte sullo stesso
-- ordine»: finché la prima è viva, non esiste un secondo invio.
create or replace function send_proposal(p_token text, p_prezzo_confermato_cents integer)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a record;
  o orders;
begin
  select * into a from td_order_from_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;

  select * into o from orders where id = a.order_id;

  if o.status = 'proposal_sent' then
    return jsonb_build_object('ok', true, 'esito', 'gia_inviata');
  end if;
  if o.status in ('in_progress', 'delivered', 'revision_requested', 'completed') then
    return jsonb_build_object('ok', false, 'esito', 'proposta_gia_inviata', 'stato', o.status);
  end if;
  if o.status = 'requested' then
    -- Si invia solo una bozza salvata: è il riepilogo che il designer ha
    -- riletto. Un invio senza bozza vorrebbe dire un prezzo mai visto.
    return jsonb_build_object('ok', false, 'esito', 'bozza_mancante');
  end if;
  if o.status <> 'in_definition' then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;

  if o.proposal_price_cents is null or o.delivery_days is null
     or coalesce(btrim(o.proposal_description), '') = '' then
    return jsonb_build_object('ok', false, 'esito', 'bozza_mancante');
  end if;

  if p_prezzo_confermato_cents is distinct from o.proposal_price_cents then
    return jsonb_build_object('ok', false, 'esito', 'prezzo_cambiato',
                              'prezzo_cents', o.proposal_price_cents);
  end if;

  -- Da qui fanno tutto i trigger: la fotografia in `order_proposals`, la
  -- pagina gemella, la mail. Chi ha agito è il designer, e la riga di
  -- `order_status_history` con `actor = 'td'` è l'unica prova che sia stato lui.
  update orders set status = 'proposal_sent', last_actor = 'td' where id = o.id;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id, 'proposta_inviata', 'td',
          jsonb_build_object('token', a.token, 'prezzo_cents', o.proposal_price_cents,
                             'giorni', o.delivery_days,
                             'credito_cents', o.consultation_credit_cents));

  return jsonb_build_object('ok', true, 'esito', 'inviata');
end $$;

-- --------------------------------------------------------------------------
-- La pagina gemella, vista dal viaggiatore (o da chiunque nel gruppo)
-- --------------------------------------------------------------------------
-- È pensata per essere **girata**: il designer la mette nel gruppo WhatsApp.
-- Quindi mostra la proposta — che è il suo scopo — e nient'altro del
-- viaggiatore: né nome, né mail, né telefono. Anche la cassa non precompila la
-- mail del viaggiatore su Stripe, per la stessa ragione (vedi la route).
--
-- **Il pagamento dietro un token permanente** è ammesso qui, e la regola della
-- 0043 («dietro un token permanente non va mai un'azione che muove denaro»)
-- non è violata: il token non muove niente, apre una cassa. Il denaro lo muove
-- chi mette la carta, dopo che Stripe gli ha ridichiarato l'importo letto dal
-- database. Chi trova il link può al massimo **pagare** l'itinerario di
-- qualcun altro.
--
-- `fase` e non lo stato grezzo: la pagina ha cinque facce, e lo stato
-- dell'ordine ne ha quattordici.
create or replace function proposal_public_page(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  d      record;
  o      record;
  v_fase text;
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

  v_fase := case
    when o.status = 'proposal_sent' then 'da_pagare'
    when o.status in ('in_progress', 'delivered', 'revision_requested', 'completed') then 'pagata'
    when o.status in ('requested', 'in_definition') then 'in_aggiornamento'
    when o.status = 'cancelled' then 'annullata'
    else 'in_verifica'
  end;

  return jsonb_build_object(
    'esito',        'valido',
    'fase',         v_fase,
    -- `order_id` serve alla route della cassa, lato server. La pagina non lo
    -- mette nell'HTML.
    'order_id',     o.id,
    'human_ref',    o.human_ref,
    'td_name',      o.td_name,
    'td_slug',      o.td_slug,
    -- La proposta si mostra solo quando ce n'è una partita: in
    -- `in_aggiornamento` le colonne portano la bozza nuova del designer, che il
    -- viaggiatore non deve leggere prima che sia inviata.
    'descrizione',  case when v_fase in ('da_pagare', 'pagata') then o.proposal_description end,
    'prezzo_cents', case when v_fase in ('da_pagare', 'pagata') then o.proposal_price_cents end,
    'giorni',       case when v_fase in ('da_pagare', 'pagata') then o.delivery_days end,
    'inviata_il',   case when v_fase in ('da_pagare', 'pagata') then o.proposal_sent_at end);
end $$;

-- --------------------------------------------------------------------------
-- La bozza non si legge dal browser del viaggiatore
-- --------------------------------------------------------------------------
-- `my_orders` (0019) è la porta da cui il viaggiatore loggato legge i suoi
-- ordini, e porta `proposal_description`, `proposal_price_cents` e
-- `delivery_days` **in qualunque stato**. Finché nessuno scriveva quelle
-- colonne prima dell'invio non era un problema; dalla 0044 ci vive la **bozza**
-- del designer, e con gli strumenti di sviluppo aperti il viaggiatore
-- leggerebbe un prezzo che il designer sta ancora scrivendo — o, dopo una
-- riapertura, la proposta nuova prima che parta.
--
-- Quindi le colonne della proposta si vedono **solo quando c'è una proposta
-- partita**. `create or replace` e non `drop`: stesse colonne, stessi tipi,
-- stesso ordine, e il `grant` della 0019 resta dov'è.
--
-- ⚠️ **Nel mascheramento c'è anche `proposal_pending_agency`**, che è All
-- Inclusive e quindi milestone 7. Non è un'anticipazione, è lo stesso difetto
-- visto dall'altra parte: il Flusso (§8) dice che «nessuna proposta sbagliata
-- può raggiungere il viaggiatore» prima della conferma dell'agenzia, e la 0019
-- gliela mostrava. Stessa cosa per totale, acconto e saldo, che nascono con
-- quella proposta.
create or replace view my_orders as
  select
    o.id,
    o.human_ref,
    o.service_type,
    o.status,
    case when o.status not in ('requested', 'in_definition', 'proposal_pending_agency')
         then o.proposal_description end as proposal_description,
    case when o.status not in ('requested', 'in_definition', 'proposal_pending_agency')
         then o.proposal_price_cents end as proposal_price_cents,
    case when o.status not in ('requested', 'in_definition', 'proposal_pending_agency')
         then o.delivery_days end as delivery_days,
    case when o.status not in ('requested', 'in_definition', 'proposal_pending_agency')
         then o.total_price_cents end as total_price_cents,
    case when o.status not in ('requested', 'in_definition', 'proposal_pending_agency')
         then o.deposit_cents end as deposit_cents,
    case when o.status not in ('requested', 'in_definition', 'proposal_pending_agency')
         then o.balance_cents end as balance_cents,
    o.balance_due_at,
    o.departure_date,
    o.return_date,
    o.delivered_at,
    o.revision_deadline_at,
    o.created_at,
    td.slug         as td_slug,
    td.display_name as td_name
    from orders o
    join travel_designers td on td.id = o.td_id
   where o.traveler_id = auth.uid();

comment on view my_orders is
  'Gli ordini del viaggiatore loggato. Le colonne della proposta sono nulle finché '
  'una proposta non è partita (0044): prima ci vive la bozza del designer, o una '
  'proposta All Inclusive non ancora confermata dall''agenzia.';

-- ===========================================================================
-- PARTE E — Il ponte Stripe riconosce un ordine
-- ===========================================================================
-- La 0039 risolve `metadata.booking_id` e conferma una **prenotazione**. Da qui
-- deve distinguere due bersagli, e la scelta è stata di **non toccare il ramo
-- delle prenotazioni**: il ramo nuovo è una funzione a sé, e `stripe_webhook`
-- guadagna uno smistamento di dieci righe prima del codice che c'era. Il codice
-- delle prenotazioni qui sotto è quello della 0039, istruzione per istruzione.
--
-- Lo smistamento guarda, in ordine:
--   1. la riga di `payments` trovata per sessione: se punta a un ordine, è un
--      ordine — è la prova più forte, l'ha scritta il nostro server;
--   2. `metadata.order_id`, che la nostra route scrive sulle casse degli ordini.
-- Tutto il resto va al ramo delle prenotazioni, com'era.
--
-- ## Le difese, identiche
--
-- Importo ricontrollato **contro `orders.proposal_price_cents`** prima di
-- confermare, e solo se l'ordine è in `proposal_sent`: in quello stato la
-- proposta è congelata (parte B), quindi il prezzo contro cui si confronta è
-- esattamente quello che la cassa ha dichiarato. `evt_` come chiave del diario,
-- alert critico su ogni scarto, e **mai un'eccezione**: il ramo sta dentro lo
-- stesso blocco con gestore del ponte.
--
-- ## I due rami storti, pensati per gli ordini
--
-- *Pagamento su un ordine sconosciuto* → come la prenotazione sconosciuta:
-- soldi senza una riga a cui attaccarli, alert critico, una persona guarda.
--
-- *Pagamento su un ordine che non è in attesa* → è lo stesso problema dello
-- slot già dato via, e ha tre facce: l'ordine **annullato** (va rimborsato),
-- l'ordine **riaperto** dal team mentre una cassa vecchia era ancora aperta
-- (la proposta è cambiata sotto i piedi di chi pagava), e il **secondo
-- incasso** su un ordine già pagato. In tutti e tre i soldi sono veri e si
-- registrano, l'ordine non si muove, e il team riceve un alert che dice quale
-- dei tre è.
--
-- Il terzo ha un dettaglio che il ramo prenotazioni non aveva: l'indice
-- `payments_one_paid_per_kind` (0011) **vieta** una seconda riga pagata per lo
-- stesso ordine. Segnarla `paid` solleverebbe, il blocco del ponte tornerebbe
-- indietro e Stripe ritenterebbe per sempre. Quindi il tentativo è protetto: se
-- l'indice lo ferma, la riga resta `pending` e l'alert dice perché.
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
            || coalesce((v_amount / 100.0)::text, 'null') || ' ' || upper(coalesce(v_valuta, '?'))
            || ', attesi ' || coalesce((v_order.proposal_price_cents / 100.0)::text, 'null') || ' EUR. '
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
              'Pagamento Stripe di ' || coalesce((v_amount / 100.0)::text, '?') || ' € arrivato '
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
    v_dett  := (v_amount / 100.0)::text || ' € incassati, ordine ' || v_order.human_ref || ' in lavorazione';

    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('order', v_order.id, 'stripe_pagata', 'traveler',
            jsonb_build_object('sessione', v_sess, 'payment_intent', v_pi,
                               'importo_cents', v_amount, 'valuta', v_valuta));
  end if;

  return jsonb_build_object('ok', v_ok, 'esito', v_esito, 'dettaglio', v_dett,
                            'order_id', v_order.id, 'payment_id', v_pay_id,
                            'riferimento', v_rif);
end $$;

comment on function stripe_checkout_ordine(text, jsonb, uuid, payments) is
  'Il ramo ordini del ponte Stripe: cassa scaduta → solo la riga di pagamento; '
  'pagamento → in_progress solo se l''ordine è in proposal_sent e l''importo '
  'combacia con orders.proposal_price_cents in EUR. Ordine sconosciuto, annullato, '
  'riaperto o già pagato: soldi registrati se si può, ordine fermo, alert critico.';

-- Il ponte, riemesso con lo smistamento. Tutto ciò che non riguarda gli ordini
-- è la 0039 parola per parola.
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
                || coalesce((v_amount / 100.0)::text, 'null') || ' ' || upper(coalesce(v_valuta, '?'))
                || ', attesi ' || (v_booking.price_cents / 100.0)::text || ' EUR. '
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
                || ': ' || (v_booking.price_cents / 100.0)::text || ' € incassati per uno slot '
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
        v_dettaglio := (v_booking.price_cents / 100.0)::text || ' € incassati, prenotazione confermata';

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

comment on function stripe_webhook(text, text) is
  'Il ponte Stripe → payments/bookings/orders. Verifica la firma, registra il '
  'messaggio in webhook_events e smista: le casse degli ordini (riga payments con '
  'order_id, o metadata.order_id) vanno a stripe_checkout_ordine, tutto il resto '
  'al ramo prenotazioni della 0039. Non solleva mai.';

-- ===========================================================================
-- Chi può chiamare cosa
-- ===========================================================================
-- Solo `service_role`. `anon` e `authenticated` non devono nemmeno vederle:
-- sono in SECURITY DEFINER, risolvono credenziali, fissano prezzi e confermano
-- pagamenti.
revoke all on function payment_account(payment_kind)                      from public, anon, authenticated;
revoke all on function consultation_payment_account()                     from public, anon, authenticated;
revoke all on function euro_it(integer)                                   from public, anon, authenticated;
revoke all on function freeze_sent_proposal()                             from public, anon, authenticated;
revoke all on function order_proposals_immutable()                        from public, anon, authenticated;
revoke all on function accoda_mail_ordine_td(uuid)                        from public, anon, authenticated;
revoke all on function on_custom_order_created()                          from public, anon, authenticated;
revoke all on function accoda_mail_proposta(uuid)                         from public, anon, authenticated;
revoke all on function on_custom_proposal_sent()                          from public, anon, authenticated;
revoke all on function td_order_from_token(text, boolean)                 from public, anon, authenticated;
revoke all on function td_order_page(text)                                from public, anon, authenticated;
revoke all on function save_proposal_draft(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function send_proposal(text, integer)                       from public, anon, authenticated;
revoke all on function proposal_public_page(text)                         from public, anon, authenticated;
revoke all on function stripe_checkout_ordine(text, jsonb, uuid, payments) from public, anon, authenticated;
revoke all on function stripe_webhook(text, text)                         from public, anon, authenticated;

grant execute on function payment_account(payment_kind)                      to service_role;
grant execute on function consultation_payment_account()                     to service_role;
grant execute on function td_order_page(text)                                to service_role;
grant execute on function save_proposal_draft(text, text, integer, integer, integer) to service_role;
grant execute on function send_proposal(text, integer)                       to service_role;
grant execute on function proposal_public_page(text)                         to service_role;
grant execute on function stripe_webhook(text, text)                         to service_role;
-- Le due funzioni di composizione si rilanciano a mano dal SQL Editor quando un
-- alert `email_composizione_fallita` lo chiede.
grant execute on function accoda_mail_ordine_td(uuid)                        to service_role;
grant execute on function accoda_mail_proposta(uuid)                         to service_role;
