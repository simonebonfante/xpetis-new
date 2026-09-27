-- XPETIS · 0047 · All Inclusive: l'agenzia entra nel flusso
--
-- Apre e chiude la milestone 7. Il Flusso §8, la cascata intera:
--
--   requested ─(bozza)─▶ in_definition ─(Invia)─▶ proposal_pending_agency
--                            ▲                           │
--                            └──(agenzia: Non fattibile)─┤
--                                                        │ (agenzia: Confermo)
--                                                        ▼
--   awaiting_deposit ─(Stripe: acconto)─▶ deposit_paid ─(il team scrive i tempi del saldo)─▶
--   awaiting_balance ─(Stripe: saldo)─▶ balance_paid ─(il designer carica il file finale)─▶ delivered
--
-- ===========================================================================
-- LA DECISIONE SU STRIPE, PRESA IL 27 SETTEMBRE 2026
-- ===========================================================================
-- **Esiste un conto Stripe solo, ed è dell'agenzia**, aperto insieme e
-- dedicato a XPETIS; Simone ha un ruolo admin. Niente Stripe Connect: vorrebbe
-- XPETIS attivata su Stripe come entità legale, e non lo è (deviazione 9).
--
-- Per il codice vuol dire tre cose, e sono semplificazioni:
--
--   · `payment_account()` continua a rispondere dalle righe di `app_config`,
--     e ne guadagna una per l'All Inclusive. In produzione diranno **tutte**
--     `agency`; in sandbox dicono `xpetis`, ed è così che si prova. Il
--     meccanismo **non** si toglie perché oggi la risposta è una sola;
--   · **un solo endpoint e un solo `whsec_`**: `stripe_webhook_secret()` della
--     0039 resta com'è. Non c'è un secondo conto da cui distinguere i webhook;
--   · **la chiave è ristretta, non la secret key**, e vive in **Vault**:
--     `agencies.stripe_credential_ref` porta il **nome** del segreto, mai il
--     valore. La legge `agency_stripe_key()`, qui sotto, e solo la chiave
--     secret di Supabase può chiamarla. **Nessun rimborso via API**: la chiave
--     non ne ha il permesso, e i rimborsi li fa il team dalla dashboard.
--
-- ⚠️ Cosa costa, scritto perché non si dimentichi: l'accesso è **revocabile
-- dall'agenzia** in qualunque momento; le contestazioni si pagano **dal loro
-- saldo**; e ogni euro di XPETIS, consulenze comprese, passa prima dal conto di
-- qualcun altro. Da qui la **riconciliazione mensile**, che **non** si
-- costruisce qui: se un webhook si perde il buco è a nostro sfavore e nessuno
-- se ne accorge, ed è un punto aperto da decidere con Andrea (`PIANO.md`).
--
-- ===========================================================================
-- IL TERZO DESTINATARIO DI UNA PAGINA A TOKEN
-- ===========================================================================
-- Dopo il designer e il viaggiatore, l'agenzia. Stesse regole — contesto
-- risolto qui, la pagina non decide, `Origin` confrontato con l'host e `null`
-- rifiutato, `Referrer-Policy: strict-origin` — e una differenza, che la 0043
-- aveva già scritto: «la conferma dell'agenzia, che sblocca una cascata,
-- nascerà `single_use` e con una scadenza». Eccola.
--
-- **Cosa può fare chi trova il link.** Confermare una proposta al posto
-- dell'agenzia, cioè togliere di mezzo **l'unico controllo sui prezzi** che il
-- Flusso prevede. Non muove denaro — il viaggiatore paga con un gesto suo, su
-- una cassa che ridichiara l'importo — ma manda al viaggiatore una proposta che
-- nessuno ha verificato. Quindi il danno si stringe da tre parti:
--
--   · **un token per invio, e si consuma alla prima risposta.** La proposta
--     rifatta ha un token nuovo e il vecchio si revoca: un link rimasto in una
--     casella risponde «annullato», non conferma la proposta nuova;
--   · **scade** dopo `agency_confirm_valid_days`. Una proposta che l'agenzia
--     non guarda in tempo non resta confermabile per sempre da chiunque trovi
--     la mail: l'orologio lo dice al team, che rinnova il link con una riga;
--   · **il primo che clicca decide**, e resta scritto: `agency_decisions` ha
--     una riga per proposta, con la chiave primaria sulla proposta. Il secondo
--     clic — lo stesso tasto o l'altro — trova la prima e la racconta.
--
-- Deciso da Simone: in agenzia risponde **una persona sola**. Il token non sa
-- chi sia, e non serve: l'attore è `agency`, e il diario porta il token.
--
-- ===========================================================================
-- IL FILE FINALE SI SCARICA SOLO COL LOGIN
-- ===========================================================================
-- La 0046 l'aveva lasciato scritto: per un itinerario va bene che chi ha il
-- link della pagina scarichi il file, per biglietti e voucher no — la pagina
-- del viaggiatore è quella che il designer gira nel gruppo. **Deciso da Simone
-- il 27 settembre:** il documento finale si scarica solo da chi è entrato con
-- Google ed è il viaggiatore dell'ordine (`final_document_for_traveler()`),
-- da un indirizzo **senza token** (`/documento/<id>`), così il login non si
-- porta dietro una credenziale nei redirect. Il designer continua a
-- scaricarlo con il suo token. Proposta e pagamenti restano sulla pagina a
-- token, come per il su misura.
--
-- ===========================================================================
-- COSA NON SI FA, DI PROPOSITO
-- ===========================================================================
--   · i rimborsi via API — si fanno a mano, dalla dashboard;
--   · la riconciliazione — punto aperto, da decidere con Andrea;
--   · una seconda agenzia — oggi è una, e `is_default_partner` lo dice;
--   · la chiusura `delivered → completed` dell'All Inclusive: la transizione
--     esiste dalla 0010, ma quando e con quale silenzio non lo dice nessuno
--     (dopo la consegna? dopo il rientro?). Resta un gesto del team, ed è un
--     punto aperto;
--   · un confronto automatico dei prezzi (proposta contro concordato): il
--     Flusso lo dice «evoluzione futura», perché l'agenzia approva a monte.

-- ===========================================================================
-- PARTE A — Un conto solo
-- ===========================================================================
-- `deposit` e `balance` rispondono da `app_config.all_inclusive_stripe_account`,
-- come le altre due. Una riga e non due: acconto e saldo sono lo stesso
-- incasso diviso in due, e un'agenzia che incassasse l'acconto e non il saldo
-- non ha senso — il merchant of record dell'All Inclusive è uno (74-ter).
--
-- La risposta `agency` restituisce l'agenzia partner di default. Che coincida
-- con l'agenzia **assegnata all'ordine** lo controlla chi apre la cassa (è
-- l'unica di cui abbiamo la chiave): con un'agenzia sola coincidono sempre, e
-- il giorno che non coincidessero la cassa si rifiuta invece di incassare sul
-- conto sbagliato.
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
                when 'deposit'      then 'all_inclusive_stripe_account'
                when 'balance'      then 'all_inclusive_stripe_account'
              end;

  if v_chiave is null then
    raise exception 'payment_account: tipo di pagamento "%" sconosciuto', p_kind;
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
  'Su quale conto Stripe incassa un pagamento, per tipo (deviazione 9, decisione del '
  '27 settembre 2026: un conto solo, dell''agenzia). consultation, full, deposit e '
  'balance leggono ognuno la sua riga di app_config; deposit e balance la stessa, '
  'all_inclusive_stripe_account. In produzione dicono tutte agency.';

-- --------------------------------------------------------------------------
-- La chiave ristretta, da Vault
-- --------------------------------------------------------------------------
-- Il valore sta in Supabase Vault, sotto il nome scritto in
-- `agencies.stripe_credential_ref`. Si inserisce una volta a mano dal SQL
-- Editor (vedi `ACCESSI.md`):
--
--   select vault.create_secret('<rk_live_… o rk_test_…>', 'stripe_key_agenzia_partner',
--                              'Chiave ristretta Stripe dell''agenzia partner');
--   update agencies set stripe_credential_ref = 'stripe_key_agenzia_partner'
--    where is_default_partner;
--
-- La legge **solo** la route che apre la cassa, con la chiave secret: è
-- revocata a tutti gli altri. Il prefisso si controlla perché è l'errore più
-- probabile e il più grave: una `sk_` incollata al posto della `rk_` avrebbe
-- in mano anche i rimborsi, e la decisione del 27 settembre dice di no.
create or replace function agency_stripe_key(p_agency_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, vault
as $$
declare
  v_ref    text;
  v_chiave text;
begin
  select stripe_credential_ref into v_ref from agencies where id = p_agency_id and is_active;
  if v_ref is null or btrim(v_ref) = '' then
    raise exception 'L''agenzia % non ha una credenziale Stripe (agencies.stripe_credential_ref vuota, o agenzia non attiva)', p_agency_id;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Supabase Vault non disponibile: la chiave Stripe dell''agenzia non si può leggere';
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
    into v_chiave using v_ref;

  if v_chiave is null or btrim(v_chiave) = '' then
    raise exception 'Nessun segreto "%" nel Vault: la cassa sul conto dell''agenzia non si apre', v_ref;
  end if;
  if v_chiave !~ '^rk_(test|live)_' then
    raise exception 'Il segreto "%" non è una chiave ristretta (rk_…): la secret key dell''agenzia non si usa, per decisione del 27 settembre', v_ref;
  end if;

  return v_chiave;
end $$;

comment on function agency_stripe_key(uuid) is
  'La chiave ristretta Stripe dell''agenzia, letta da Vault sotto il nome in '
  'agencies.stripe_credential_ref. Solo chiavi rk_: niente rimborsi via API. '
  'La chiama solo la route che apre la cassa, con la chiave secret di Supabase.';

-- ===========================================================================
-- PARTE B — La proposta All Inclusive e le sue regole
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Le proposte partite: la tabella della 0044, allargata
-- --------------------------------------------------------------------------
-- La stessa ragione della 0044, e una in più: ogni invio all'agenzia ha **il
-- suo token e la sua decisione**, quindi deve avere una riga sua. Le colonne
-- nuove sono dell'All Inclusive; `delivery_days` smette di essere obbligatoria
-- perché un pacchetto non ha «giorni di consegna» — ha una data di partenza.
-- Il vincolo nuovo tiene il su misura com'era.
alter table order_proposals alter column delivery_days drop not null;
alter table order_proposals
  add column document_file_id uuid references order_files(id),
  add column departure_date   date,
  add column return_date      date,
  add column deposit_cents    integer check (deposit_cents is null or deposit_cents > 0),
  add column balance_cents    integer check (balance_cents is null or balance_cents > 0);

alter table order_proposals add constraint order_proposals_forma check (
  (document_file_id is null and delivery_days is not null)          -- su misura
  or
  (document_file_id is not null and departure_date is not null
   and deposit_cents is not null and balance_cents is not null
   and deposit_cents + balance_cents = price_cents));               -- All Inclusive

comment on column order_proposals.document_file_id is
  'All Inclusive: il documento di proposta che l''agenzia ha verificato. È quello '
  'che il viaggiatore scarica dopo la conferma: un documento caricato dopo non lo sostituisce.';

-- --------------------------------------------------------------------------
-- La decisione dell'agenzia, una per proposta
-- --------------------------------------------------------------------------
-- **La chiave primaria è la regola.** «Il primo che clicca decide» non è un
-- controllo scritto in una funzione, che una corsa fra due clic potrebbe
-- aggirare: è un indice, e il secondo inserimento non esiste.
--
-- In una tabella e non in `orders` perché le decisioni sono tante quanti gli
-- invii, e l'ordine ne ricorda solo l'ultima: `agency_confirmed_at` e
-- `agency_rejection_note` restano lì come riassunto, qui c'è la storia.
create table agency_decisions (
  proposal_id uuid primary key references order_proposals(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  agency_id   uuid not null references agencies(id) on delete restrict,
  decision    text not null check (decision in ('confirmed', 'rejected')),
  note        text,
  -- `agency` se ha cliccato l'agenzia, `team` se il team ha confermato da
  -- Studio (l'agenzia al telefono): la cascata parte lo stesso, e la riga dice
  -- chi è stato.
  actor       actor_kind not null default 'agency',
  decided_at  timestamptz not null default now(),
  constraint agency_decisions_rifiuto_motivato
    check (decision = 'confirmed' or length(btrim(coalesce(note, ''))) > 0)
);

create index agency_decisions_order_idx on agency_decisions (order_id);

comment on table agency_decisions is
  'La risposta dell''agenzia a ogni proposta All Inclusive: una per proposta, per '
  'chiave primaria. Il primo clic decide e il secondo trova questa riga.';

alter table agency_decisions enable row level security;
revoke all on agency_decisions from anon, authenticated;

-- --------------------------------------------------------------------------
-- Le regole dell'ordine All Inclusive, in un trigger solo
-- --------------------------------------------------------------------------
-- Il gemello di `freeze_sent_proposal()` (0044), che vale solo per il su
-- misura. Si chiama `orders_regole_all_inclusive` di proposito: i trigger
-- `before` girano in ordine alfabetico, e questo deve girare **dopo**
-- `orders_enforce_transition` — così una proposta senza agenzia, senza prezzo
-- o senza documento la ferma la 0009, con le sue parole, prima che qui si
-- provi a calcolarci sopra un acconto.
--
-- ⚠️ È un trigger `before update` e **non** `before update of status`: il
-- team scrive `balance_due_at` da Studio senza toccare lo stato, e quella
-- scrittura deve passare di qui lo stesso.
create or replace function ai_order_rules()
returns trigger language plpgsql set search_path = public as $$
declare
  v_pct  numeric;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if new.service_type <> 'all_inclusive' then
    return new;
  end if;

  -- ------------------------------------------------ 1. dopo l'invio non si tocca
  -- Come per il su misura, sullo **stato di partenza**. In più l'agenzia
  -- assegnata: cambiarla dopo l'invio vorrebbe dire una proposta verificata da
  -- un'agenzia e incassata da un'altra. Tornata in `in_definition` (l'agenzia
  -- non conferma) tutto si riapre, e al reinvio si ricalcola.
  if old.status not in ('requested', 'in_definition')
     and (new.proposal_description      is distinct from old.proposal_description
       or new.proposal_price_cents      is distinct from old.proposal_price_cents
       or new.consultation_credit_cents is distinct from old.consultation_credit_cents
       or new.departure_date            is distinct from old.departure_date
       or new.return_date               is distinct from old.return_date
       or new.total_price_cents         is distinct from old.total_price_cents
       or new.deposit_cents             is distinct from old.deposit_cents
       or new.balance_cents             is distinct from old.balance_cents
       or new.agency_id                 is distinct from old.agency_id) then
    raise exception 'La proposta All Inclusive di % è già partita verso l''agenzia (stato %): prezzo, acconto, date, credito e agenzia non si toccano più. Per rifarla l''ordine torna in in_definition.',
      old.human_ref, old.status;
  end if;

  -- ------------------------------------------------ 2. l'invio all'agenzia
  if new.status = 'proposal_pending_agency' and old.status is distinct from 'proposal_pending_agency' then
    if new.proposal_description is null or btrim(new.proposal_description) = '' then
      raise exception 'Proposta All Inclusive % senza descrizione', new.human_ref;
    end if;
    if new.departure_date is null then
      raise exception 'Proposta All Inclusive % senza data di partenza: è un dato del pacchetto (Flusso §9)', new.human_ref;
    end if;
    if new.departure_date <= v_oggi then
      raise exception 'Proposta All Inclusive % con la partenza il % : non è nel futuro', new.human_ref, new.departure_date;
    end if;
    if not exists (select 1 from agencies a where a.id = new.agency_id and a.is_active) then
      raise exception 'Ordine %: l''agenzia assegnata non è attiva', new.human_ref;
    end if;

    -- **L'acconto lo calcola il sistema** (Flusso §8), dal parametro. Il saldo
    -- è il residuo, per sottrazione e non per un secondo arrotondamento: così
    -- acconto più saldo fa sempre il totale, al centesimo.
    select value into v_pct from app_config where key = 'deposit_percent';
    if v_pct is null or v_pct <= 0 or v_pct >= 100 then
      raise exception 'app_config.deposit_percent manca o vale %: deve stare fra 0 e 100 esclusi', v_pct;
    end if;

    -- ⚠️ Il totale è il prezzo scritto dal designer, **già al netto del credito
    -- consulenza** se lo ha scalato: nessuna sottrazione qui, come nella 0044.
    new.total_price_cents := new.proposal_price_cents;
    new.deposit_cents     := round(new.proposal_price_cents * v_pct / 100)::integer;
    new.balance_cents     := new.proposal_price_cents - new.deposit_cents;

    -- Stripe non incassa sotto i 50 centesimi, e qui le casse sono due.
    if new.deposit_cents < 50 or new.balance_cents < 50 then
      raise exception 'Proposta All Inclusive %: acconto % e saldo % — uno dei due è sotto il minimo che Stripe incassa (0,50 €)',
        new.human_ref, euro_it(new.deposit_cents), euro_it(new.balance_cents);
    end if;

    new.proposal_sent_at := now();
  end if;

  -- ------------------------------------------------ 3. la conferma
  -- Chiunque la faccia — l'agenzia dal suo link, o il team da Studio perché
  -- l'agenzia ha confermato al telefono — `agency_confirmed_at` dice quando.
  if new.status = 'awaiting_deposit' and old.status = 'proposal_pending_agency'
     and new.agency_confirmed_at is not distinct from old.agency_confirmed_at then
    new.agency_confirmed_at := now();
  end if;

  -- ------------------------------------------------ 4. i tempi del saldo
  -- Li detta l'agenzia e li scrive il team (Flusso §8). Tre controlli, perché
  -- è una data scritta a mano su Studio e da lei dipende una mail a un cliente:
  -- nel futuro, non dopo la partenza, e non su un ordine già saldato.
  if new.balance_due_at is distinct from old.balance_due_at and new.balance_due_at is not null then
    if old.status in ('balance_paid', 'delivered', 'completed') then
      raise exception 'Ordine %: il saldo è già pagato, i suoi tempi non si cambiano più', new.human_ref;
    end if;
    if new.balance_due_at <= now() then
      raise exception 'Ordine %: la scadenza del saldo (%) è nel passato', new.human_ref, new.balance_due_at;
    end if;
    if new.departure_date is not null
       and (new.balance_due_at at time zone 'Europe/Rome')::date > new.departure_date then
      raise exception 'Ordine %: il saldo scadrebbe dopo la partenza (%), e il Flusso lo vuole prima', new.human_ref, new.departure_date;
    end if;
  end if;

  if new.status = 'awaiting_balance' and old.status is distinct from 'awaiting_balance'
     and new.balance_due_at is null then
    raise exception 'Ordine %: si chiede il saldo senza i suoi tempi (balance_due_at vuota). Li scrive il team, come li detta l''agenzia.', new.human_ref;
  end if;

  -- ------------------------------------------------ 5. la consegna
  -- La 0009 si accontenta di un file qualunque; per l'All Inclusive il
  -- consegnato è il **documento finale**, non la proposta.
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and not exists (select 1 from order_files f
                      where f.order_id = new.id and f.kind = 'final_document') then
    raise exception 'Ordine All Inclusive % marcato consegnato senza il documento finale', new.human_ref;
  end if;

  return new;
end $$;

create trigger orders_regole_all_inclusive before update on orders
  for each row execute function ai_order_rules();

comment on function ai_order_rules() is
  'All Inclusive: proposta, acconto, date, credito e agenzia congelati dopo l''invio; '
  'acconto calcolato da deposit_percent e saldo per residuo; balance_due_at nel futuro, '
  'non dopo la partenza, obbligatoria per chiedere il saldo; consegna solo col documento finale.';

-- --------------------------------------------------------------------------
-- La proposta parte verso l'agenzia
-- --------------------------------------------------------------------------
-- Il token nasce qui, uno per invio. `emetti_verifica_agenzia` è separata dal
-- trigger perché la chiama anche il team, per rinnovare un link scaduto.
--
-- `payload.proposta` lega il token alla proposta; `payload.invio` è l'entità
-- della mail. Non la proposta: un link rinnovato è una mail nuova per la
-- stessa proposta, e il vincolo di unicità della coda la fermerebbe.
create or replace function emetti_verifica_agenzia(p_proposal_id uuid)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_giorni numeric;
  o        record;
  v_invio  uuid := gen_random_uuid();
  v_token  text;
begin
  select value into v_giorni from app_config where key = 'agency_confirm_valid_days';
  if v_giorni is null or v_giorni <= 0 then
    raise exception 'Manca app_config.agency_confirm_valid_days: quanto vale il link dell''agenzia non si inventa';
  end if;

  select o2.id, o2.agency_id, o2.human_ref into o
    from order_proposals pr join orders o2 on o2.id = pr.order_id
   where pr.id = p_proposal_id;
  if not found or o.agency_id is null then
    raise exception 'Proposta % senza ordine o senza agenzia', p_proposal_id;
  end if;

  -- Il link di prima, se c'è, smette di funzionare: risponde «annullato».
  update access_tokens a set revoked_at = now()
   where a.purpose = 'agency_proposal_confirm' and a.order_id = o.id and a.revoked_at is null;

  insert into access_tokens (purpose, audience, order_id, agency_id, payload, single_use, expires_at)
  values ('agency_proposal_confirm', 'agency', o.id, o.agency_id,
          jsonb_build_object('proposta', p_proposal_id, 'invio', v_invio),
          true, now() + make_interval(days => v_giorni::int))
  returning token into v_token;

  perform accoda_mail_verifica_agenzia(v_token);
  return v_token;
end $$;

-- La mail all'agenzia. Porta il link della **pagina** con documento, prezzo e
-- i due tasti: il documento non viaggia in allegato (i file non passano mai
-- da n8n, `CLAUDE.md`) e il link di Storage non va in una mail.
create or replace function accoda_mail_verifica_agenzia(p_token text)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  v_pct      numeric;
  x          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  select value      into v_pct      from app_config where key = 'deposit_percent';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;   -- la mancanza la dice clock_tick
  end if;

  select t.token, t.expires_at, (t.payload ->> 'invio')::uuid as invio,
         pr.round, pr.description, pr.price_cents, pr.deposit_cents, pr.balance_cents,
         pr.departure_date, pr.return_date,
         o.human_ref, ag.name as agenzia, ag.operational_email,
         td.display_name as td_name, f.filename as documento
    into x
    from access_tokens t
    join order_proposals pr on pr.id = (t.payload ->> 'proposta')::uuid
    join orders o on o.id = pr.order_id
    join agencies ag on ag.id = t.agency_id
    join travel_designers td on td.id = o.td_id
    left join order_files f on f.id = pr.document_file_id
   where t.token = p_token;
  if not found then return null; end if;

  select * into m from render_template(
    'agency_proposal_confirm',
    jsonb_build_object(
      'agenzia', x.agenzia,
      'designer', x.td_name,
      'human_ref', x.human_ref,
      'invio_n', x.round::text,
      'descrizione', replace(replace(x.description, '{{', '{ {'), '}}', '} }'),
      'totale', euro_it(x.price_cents),
      'percentuale', coalesce(replace(case when v_pct = trunc(v_pct) then trunc(v_pct)::text else rtrim(rtrim(v_pct::text, '0'), '.') end, '.', ','), '?') || '%',
      'acconto', euro_it(x.deposit_cents),
      'saldo', euro_it(x.balance_cents),
      'partenza', to_char(x.departure_date, 'DD/MM/YYYY'),
      'ritorno', coalesce(to_char(x.return_date, 'DD/MM/YYYY'), 'non indicato'),
      'documento', coalesce(x.documento, 'documento di proposta'),
      'link_verifica', rtrim(v_base, '/') || '/agenzia/' || x.token,
      'valido_fino', to_char(x.expires_at at time zone 'Europe/Rome', 'DD/MM/YYYY'),
      'whatsapp', v_whatsapp));

  return accoda_messaggio('agency_proposal_confirm', 'agency_invio', x.invio, x.operational_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order', o2.id,
         'La mail all''agenzia con la proposta ' || o2.human_ref || ' da verificare non si è composta e '
         || '**l''agenzia non ha il suo link**: ' || sqlerrm || '. Sistemato il problema, si rilancia '
         || 'con un link nuovo: select rinnova_verifica_agenzia(''' || o2.id || ''');'
    from access_tokens t join orders o2 on o2.id = t.order_id
   where t.token = p_token
     and not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- La fotografia, il token, la mail: in un colpo solo come per il su misura.
-- La fotografia e il token stanno fuori da ogni blocco protetto: se non si
-- scrivono l'invio deve fallire, perché una proposta in verifica senza un link
-- per l'agenzia è una proposta che nessuno può sbloccare.
create or replace function on_ai_proposal_sent()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_round smallint;
  v_doc   uuid;
  v_id    uuid;
begin
  if new.service_type <> 'all_inclusive' or new.status <> 'proposal_pending_agency'
     or old.status = 'proposal_pending_agency' then
    return null;
  end if;

  -- Il documento è l'ultimo caricato: la 0009 ne ha già preteso almeno uno.
  select f.id into v_doc from order_files f
   where f.order_id = new.id and f.kind = 'proposal_document'
   order by f.created_at desc, f.id desc limit 1;

  select coalesce(max(pr.round), 0) + 1 into v_round
    from order_proposals pr where pr.order_id = new.id;

  insert into order_proposals (order_id, round, description, price_cents, delivery_days,
                               consultation_credit_cents, actor, document_file_id,
                               departure_date, return_date, deposit_cents, balance_cents)
  values (new.id, v_round, new.proposal_description, new.total_price_cents, null,
          new.consultation_credit_cents, new.last_actor, v_doc,
          new.departure_date, new.return_date, new.deposit_cents, new.balance_cents)
  returning id into v_id;

  perform emetti_verifica_agenzia(v_id);
  return null;
end $$;

create trigger orders_ai_proposal_sent after update of status on orders
  for each row execute function on_ai_proposal_sent();

-- Il team rinnova il link quando l'orologio dice che è scaduto, o quando la
-- mail non si è composta. Stessa proposta, token nuovo, mail nuova.
create or replace function rinnova_verifica_agenzia(p_order_id uuid)
returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  o      orders;
  v_prop uuid;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then
    raise exception 'Ordine % inesistente', p_order_id;
  end if;
  if o.service_type <> 'all_inclusive' or o.status <> 'proposal_pending_agency' then
    raise exception 'L''ordine % è in stato %: c''è da rinnovare un link solo su una proposta in verifica dell''agenzia',
      o.human_ref, o.status;
  end if;

  select pr.id into v_prop from order_proposals pr
   where pr.order_id = o.id order by pr.round desc limit 1;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id, 'verifica_agenzia_rinnovata', 'team', jsonb_build_object('proposta', v_prop));

  return emetti_verifica_agenzia(v_prop);
end $$;

comment on function rinnova_verifica_agenzia(uuid) is
  'Per il team, dal SQL Editor: revoca il link dell''agenzia e ne manda uno nuovo per '
  'la stessa proposta. Restituisce il token, per chi deve mandarlo a mano.';

-- ===========================================================================
-- PARTE C — La pagina dell'agenzia
-- ===========================================================================

-- La proposta a cui punta un token d'agenzia, con i controlli comuni alla
-- pagina e al clic. **Il token è dell'agenzia, non dell'ordine**: se il team
-- riassegna l'ordine (possibile solo prima dell'invio, ma il link di un invio
-- vecchio resta in una casella), il link della prima non apre più niente.
--
-- Accetta anche `gia_usato`: un link consumato deve poter dire **com'è
-- andata**, invece di rispondere «già usato» a chi ha appena confermato.
create or replace function agency_token_context(p_token text)
returns table (esito text, token text, order_id uuid, proposal_id uuid, usato boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  d record;
  o record;
  v_prop uuid;
begin
  select * into d from resolve_access_token_detail(p_token);

  if d.esito is distinct from 'valido' and d.esito is distinct from 'gia_usato' then
    esito := d.esito; return next; return;
  end if;
  if d.purpose <> 'agency_proposal_confirm' or d.audience <> 'agency' or d.order_id is null then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  select o2.id, o2.agency_id, o2.service_type into o from orders o2 where o2.id = d.order_id;
  if not found then
    esito := 'ordine_sconosciuto'; return next; return;
  end if;
  if o.service_type <> 'all_inclusive' or d.agency_id is distinct from o.agency_id then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  begin
    v_prop := (d.payload ->> 'proposta')::uuid;
  exception when others then
    v_prop := null;
  end;
  if v_prop is null or not exists (select 1 from order_proposals pr
                                    where pr.id = v_prop and pr.order_id = o.id) then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  esito := 'valido'; token := d.token; order_id := o.id; proposal_id := v_prop;
  usato := d.esito = 'gia_usato';
  return next;
end $$;

-- La pagina. Quattro facce: da decidere, confermata, non fattibile, superata
-- (è arrivata una proposta nuova, o l'ordine è andato avanti per altre vie).
--
-- **Niente del viaggiatore**: né nome né contatti. All'agenzia servono il
-- pacchetto e il prezzo; le persone le conosce dal gruppo tecnico.
create or replace function agency_page(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  c      record;
  x      record;
  ad    agency_decisions;
  v_ult  uuid;
  v_fase text;
begin
  select * into c from agency_token_context(p_token);
  if c.esito <> 'valido' then
    return jsonb_build_object('esito', c.esito);
  end if;

  select pr.*, o.human_ref, o.status, td.display_name as td_name, ag.name as agenzia,
         f.filename as documento, t.expires_at
    into x
    from order_proposals pr
    join orders o on o.id = pr.order_id
    join travel_designers td on td.id = o.td_id
    join agencies ag on ag.id = o.agency_id
    join access_tokens t on t.token = c.token
    left join order_files f on f.id = pr.document_file_id
   where pr.id = c.proposal_id;

  select * into ad from agency_decisions where proposal_id = c.proposal_id;
  select pr.id into v_ult from order_proposals pr
   where pr.order_id = c.order_id order by pr.round desc limit 1;

  v_fase := case
    when ad.decision = 'confirmed' then 'confermata'
    when ad.decision = 'rejected'  then 'non_fattibile'
    when c.usato then 'superata'
    when x.status = 'proposal_pending_agency' and v_ult = c.proposal_id then 'da_decidere'
    else 'superata'
  end;

  return jsonb_build_object(
    'esito',        'valido',
    'fase',         v_fase,
    'human_ref',    x.human_ref,
    'agenzia',      x.agenzia,
    'td_name',      x.td_name,
    'invio_n',      x.round,
    'descrizione',  x.description,
    'totale_cents', x.price_cents,
    'acconto_cents', x.deposit_cents,
    'saldo_cents',  x.balance_cents,
    'partenza',     x.departure_date,
    'ritorno',      x.return_date,
    'inviata_il',   x.sent_at,
    'valido_fino',  x.expires_at,
    -- Il documento si scarica solo finché c'è da decidere: dopo, il token è
    -- consumato e il file non esce più da questo link.
    'documento',    case when v_fase = 'da_decidere' and x.document_file_id is not null
                         then jsonb_build_object('id', x.document_file_id, 'nome', x.documento) end,
    'deciso_il',    ad.decided_at,
    'nota',         ad.note);
end $$;

-- Il clic. Due tasti, un solo gesto: la prima risposta vince.
create or replace function agency_decide(p_token text, p_decisione text, p_nota text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  c      record;
  o      orders;
  ad    agency_decisions;
  v_ult  uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  select * into c from agency_token_context(p_token);
  if c.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', c.esito);
  end if;

  if p_decisione is null or p_decisione not in ('conferma', 'non_fattibile') then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'decisione');
  end if;

  -- Prima il token, poi l'ordine: due clic partiti insieme si mettono in fila
  -- qui, e il secondo trova la decisione del primo.
  perform 1 from access_tokens a where a.token = c.token for update;
  select * into o from orders where id = c.order_id for update;

  select * into ad from agency_decisions where proposal_id = c.proposal_id;
  if found then
    -- «Agenzia che conferma due volte»: è la verità, con la data. `ok` dice se
    -- il clic di adesso chiedeva la stessa cosa che è stata decisa.
    return jsonb_build_object(
      'ok', (ad.decision = 'confirmed') = (p_decisione = 'conferma'),
      'esito', 'gia_decisa',
      'decisione', case ad.decision when 'confirmed' then 'conferma' else 'non_fattibile' end,
      'deciso_il', ad.decided_at);
  end if;

  select pr.id into v_ult from order_proposals pr
   where pr.order_id = o.id order by pr.round desc limit 1;
  if c.usato or o.status <> 'proposal_pending_agency' or v_ult is distinct from c.proposal_id then
    return jsonb_build_object('ok', false, 'esito', 'superata', 'stato', o.status);
  end if;

  if p_decisione = 'non_fattibile' and (v_nota is null or length(v_nota) > 5000) then
    -- «Non fattibile» senza dire perché lascia il designer a indovinare cosa
    -- correggere. Il gruppo tecnico c'è, ma la nota resta scritta.
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'nota');
  end if;

  insert into agency_decisions (proposal_id, order_id, agency_id, decision, note, actor)
  values (c.proposal_id, o.id, o.agency_id,
          case p_decisione when 'conferma' then 'confirmed' else 'rejected' end,
          v_nota, 'agency');

  update access_tokens a set used_at = now() where a.token = c.token;

  -- Da qui fanno tutto i trigger: la cascata, o la mail al designer.
  if p_decisione = 'conferma' then
    update orders set status = 'awaiting_deposit', agency_confirmed_at = now(),
                      last_actor = 'agency'
     where id = o.id;
  else
    update orders set status = 'in_definition', agency_rejection_note = v_nota,
                      last_actor = 'agency'
     where id = o.id;
  end if;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id,
          case p_decisione when 'conferma' then 'agenzia_ha_confermato' else 'agenzia_non_fattibile' end,
          'agency', jsonb_build_object('token', c.token, 'proposta', c.proposal_id));

  return jsonb_build_object('ok', true,
                            'esito', case p_decisione when 'conferma' then 'confermata' else 'non_fattibile' end);
exception
  -- La corsa che il lucchetto non vede (un ramo che non passa di qui): la
  -- chiave primaria di agency_decisions ferma il secondo.
  when unique_violation then
    return jsonb_build_object('ok', false, 'esito', 'gia_decisa');
end $$;

-- --------------------------------------------------------------------------
-- La cascata, e il suo rovescio
-- --------------------------------------------------------------------------
-- Il grilletto è lo stato, come per le mail della 0044: la cascata parte
-- chiunque faccia il passaggio. Se lo fa il team da Studio (l'agenzia ha
-- confermato al telefono), la decisione si scrive con `actor = 'team'`.
--
-- Uscire da `proposal_pending_agency` per qualunque strada spegne il link
-- dell'agenzia ancora aperto: una proposta ritirata non si conferma.
create or replace function on_ai_agency_outcome()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prop uuid;
  ad    agency_decisions;
  x      record;
begin
  if new.service_type <> 'all_inclusive' or old.status <> 'proposal_pending_agency'
     or new.status = 'proposal_pending_agency' then
    return null;
  end if;

  update access_tokens a set revoked_at = now()
   where a.purpose = 'agency_proposal_confirm' and a.order_id = new.id
     and a.revoked_at is null and a.used_at is null;

  select pr.id into v_prop from order_proposals pr
   where pr.order_id = new.id order by pr.round desc limit 1;
  select * into ad from agency_decisions where proposal_id = v_prop;
  select td.display_name as td_name, ag.name as agenzia into x
    from travel_designers td, agencies ag where td.id = new.td_id and ag.id = new.agency_id;

  if new.status = 'awaiting_deposit' then
    if ad.proposal_id is null then
      insert into agency_decisions (proposal_id, order_id, agency_id, decision, actor)
      values (v_prop, new.id, new.agency_id, 'confirmed', 'team');
    end if;

    -- La pagina del viaggiatore nasce adesso, non prima: la proposta non
    -- raggiunge il viaggiatore finché l'agenzia non l'ha verificata.
    insert into access_tokens (purpose, audience, order_id, td_id)
    values ('traveler_public_proposal', 'traveler', new.id, new.td_id)
    on conflict (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
      where revoked_at is null
    do nothing;

    perform accoda_mail_ai_proposta(v_prop);
    perform accoda_mail_esito_td(v_prop, true);
    perform notifica_team(
      'agenzia_ha_confermato', 'order', new.id,
      '[XPETIS] ' || coalesce(x.agenzia, 'L''agenzia') || ' conferma ' || new.human_ref,
      coalesce(x.agenzia, 'L''agenzia') || ' ha confermato la proposta All Inclusive ' || new.human_ref
        || ' di ' || coalesce(x.td_name, 'un designer') || ': ' || euro_it(new.total_price_cents)
        || ', acconto ' || euro_it(new.deposit_cents) || '. Il viaggiatore ha ricevuto la proposta '
        || 'con il link dell''acconto, il designer il messaggio per il gruppo commerciale.');

  elsif new.status = 'in_definition' and ad.decision = 'rejected' then
    perform accoda_mail_esito_td(v_prop, false);
    perform notifica_team(
      'agenzia_non_fattibile', 'order', new.id,
      '[XPETIS] ' || coalesce(x.agenzia, 'L''agenzia') || ': non fattibile ' || new.human_ref,
      coalesce(x.agenzia, 'L''agenzia') || ' non ha confermato la proposta ' || new.human_ref
        || ' di ' || coalesce(x.td_name, 'un designer') || ': «' || coalesce(ad.note, '') || '». '
        || 'Il designer ha ricevuto la nota e la proposta è di nuovo modificabile.');
  end if;

  return null;
end $$;

create trigger orders_ai_agency_outcome after update of status on orders
  for each row execute function on_ai_agency_outcome();

-- L'esito al designer: una mail per proposta, confermata o no.
create or replace function accoda_mail_esito_td(p_proposal_id uuid, p_confermata boolean)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  x          record;
  v_token    text;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;
  end if;

  select pr.id, pr.order_id, o.human_ref, ad.note, ag.name as agenzia, td.email as td_email,
         split_part(coalesce(nullif(btrim(td.display_name), ''), ''), ' ', 1) as td_nome
    into x
    from order_proposals pr
    join orders o on o.id = pr.order_id
    join travel_designers td on td.id = o.td_id
    join agencies ag on ag.id = o.agency_id
    left join agency_decisions ad on ad.proposal_id = pr.id
   where pr.id = p_proposal_id;
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'td_order_page' and a.order_id = x.order_id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token td_order_page attivo';
  end if;

  select * into m from render_template(
    case when p_confermata then 'agency_confirmed_td' else 'agency_rejected_td' end,
    jsonb_build_object(
      'saluto', case when coalesce(x.td_nome, '') <> '' then 'Ciao ' || x.td_nome else 'Ciao' end,
      'human_ref', x.human_ref,
      'agenzia', x.agenzia,
      'link_ordine', rtrim(v_base, '/') || '/ordine/' || v_token,
      'whatsapp', v_whatsapp)
    || case when p_confermata then '{}'::jsonb
            else jsonb_build_object('nota', replace(replace(coalesce(x.note, ''), '{{', '{ {'), '}}', '} }')) end);

  return accoda_messaggio(case when p_confermata then 'agency_confirmed_td' else 'agency_rejected_td' end,
                          'order_proposal', x.id, x.td_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order_proposal', p_proposal_id,
         'La mail al designer con l''esito della verifica dell''agenzia non si è composta: ' || sqlerrm
         || '. Si rilancia con: select accoda_mail_esito_td(''' || p_proposal_id || ''', '
         || case when p_confermata then 'true' else 'false' end || ');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- La proposta al viaggiatore, con il link dell'acconto. Flusso §8: «la mail al
-- viaggiatore con la proposta allegata e il link per l'acconto del 30%».
-- L'allegato è sulla pagina: dalla mail al documento c'è un clic, e il
-- documento è quello che l'agenzia ha verificato, non un file più recente.
create or replace function accoda_mail_ai_proposta(p_proposal_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  v_pct      numeric;
  x          record;
  v_token    text;
  f          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  select value      into v_pct      from app_config where key = 'deposit_percent';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;
  end if;

  select pr.id, pr.order_id, pr.description, pr.price_cents, pr.deposit_cents, pr.balance_cents,
         pr.departure_date, pr.return_date, o.human_ref, t.email, ag.name as agenzia,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name
    into x
    from order_proposals pr
    join orders o on o.id = pr.order_id
    join travelers t on t.id = o.traveler_id
    join travel_designers td on td.id = o.td_id
    join agencies ag on ag.id = o.agency_id
   where pr.id = p_proposal_id;
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'traveler_public_proposal' and a.order_id = x.order_id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token traveler_public_proposal attivo';
  end if;

  select * into f from render_template('blocco_firma',
    jsonb_build_object('whatsapp', v_whatsapp,
                       'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

  select * into m from render_template(
    'ai_proposal_traveler',
    jsonb_build_object(
      'saluto', case when coalesce(x.nome, '') <> '' then 'Ciao ' || x.nome else 'Ciao' end,
      'designer', x.td_name,
      'agenzia', x.agenzia,
      'human_ref', x.human_ref,
      'descrizione', replace(replace(x.description, '{{', '{ {'), '}}', '} }'),
      'totale', euro_it(x.price_cents),
      'percentuale', coalesce(replace(case when v_pct = trunc(v_pct) then trunc(v_pct)::text else rtrim(rtrim(v_pct::text, '0'), '.') end, '.', ','), '?') || '%',
      'acconto', euro_it(x.deposit_cents),
      'saldo', euro_it(x.balance_cents),
      'partenza', to_char(x.departure_date, 'DD/MM/YYYY'),
      'link_pagina', rtrim(v_base, '/') || '/proposta/' || v_token),
    jsonb_build_object('firma', f.body_html),
    jsonb_build_object('firma', f.body_text));

  return accoda_messaggio('ai_proposal_traveler', 'order_proposal', x.id, x.email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order_proposal', p_proposal_id,
         'La mail al viaggiatore con la proposta All Inclusive confermata e il link dell''acconto '
         || 'non si è composta e **non è partita**: ' || sqlerrm || '. Il designer ha comunque il '
         || 'messaggio da girare nel gruppo. Si rilancia con: select accoda_mail_ai_proposta('''
         || p_proposal_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- ===========================================================================
-- PARTE D — Acconto e saldo
-- ===========================================================================

-- La mail del saldo. Parte quando l'ordine entra in `awaiting_balance`, cioè
-- quando il team ha scritto i tempi; una sola per ordine — se i tempi cambiano
-- dopo, la data nuova si dice nel gruppo (la pagina la mostra sempre giusta).
create or replace function accoda_mail_ai_saldo(p_order_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  x          record;
  v_token    text;
  f          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;
  end if;

  select o.id, o.human_ref, o.balance_cents, o.balance_due_at, o.departure_date, t.email,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name
    into x
    from orders o
    join travelers t on t.id = o.traveler_id
    join travel_designers td on td.id = o.td_id
   where o.id = p_order_id;
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'traveler_public_proposal' and a.order_id = x.id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token traveler_public_proposal attivo';
  end if;

  select * into f from render_template('blocco_firma',
    jsonb_build_object('whatsapp', v_whatsapp,
                       'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

  select * into m from render_template(
    'ai_balance_traveler',
    jsonb_build_object(
      'saluto', case when coalesce(x.nome, '') <> '' then 'Ciao ' || x.nome else 'Ciao' end,
      'designer', x.td_name,
      'human_ref', x.human_ref,
      'saldo', euro_it(x.balance_cents),
      'data_saldo', to_char(x.balance_due_at at time zone 'Europe/Rome', 'DD/MM/YYYY'),
      'partenza', to_char(x.departure_date, 'DD/MM/YYYY'),
      'link_pagina', rtrim(v_base, '/') || '/proposta/' || v_token),
    jsonb_build_object('firma', f.body_html),
    jsonb_build_object('firma', f.body_text));

  return accoda_messaggio('ai_balance_traveler', 'order', x.id, x.email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order', p_order_id,
         'La mail al viaggiatore con la richiesta del saldo non si è composta e **non è partita**: '
         || sqlerrm || '. Si rilancia con: select accoda_mail_ai_saldo(''' || p_order_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- Al designer, a saldo incassato: adesso si carica il file finale (Flusso §8).
create or replace function accoda_mail_ai_saldato_td(p_order_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  x          record;
  v_token    text;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;
  end if;

  select o.id, o.human_ref, o.departure_date, td.email as td_email,
         split_part(coalesce(nullif(btrim(td.display_name), ''), ''), ' ', 1) as td_nome,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as viaggiatore
    into x
    from orders o
    join travel_designers td on td.id = o.td_id
    join travelers t on t.id = o.traveler_id
   where o.id = p_order_id;
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'td_order_page' and a.order_id = x.id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token td_order_page attivo';
  end if;

  select * into m from render_template(
    'ai_balance_paid_td',
    jsonb_build_object(
      'saluto', case when coalesce(x.td_nome, '') <> '' then 'Ciao ' || x.td_nome else 'Ciao' end,
      'nome_viaggiatore', coalesce(nullif(x.viaggiatore, ''), 'Chi viaggia'),
      'human_ref', x.human_ref,
      'partenza', to_char(x.departure_date, 'DD/MM/YYYY'),
      'link_ordine', rtrim(v_base, '/') || '/ordine/' || v_token,
      'whatsapp', v_whatsapp));

  return accoda_messaggio('ai_balance_paid_td', 'order', x.id, x.td_email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order', p_order_id,
         'La mail al designer «saldo incassato, carica il file finale» non si è composta: ' || sqlerrm
         || '. Si rilancia con: select accoda_mail_ai_saldato_td(''' || p_order_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- Al viaggiatore, alla consegna del file finale. Il link è quello della
-- pagina, e il testo dice che per scaricare serve l'accesso con Google: è la
-- decisione del 27 settembre, e senza dirlo la prima reazione sarebbe «il link
-- non funziona».
create or replace function accoda_mail_ai_consegna(p_file_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  x          record;
  v_token    text;
  f          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;
  end if;

  select fl.id, o.id as order_id, o.human_ref, o.departure_date, t.email,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name
    into x
    from order_files fl
    join orders o on o.id = fl.order_id
    join travelers t on t.id = o.traveler_id
    join travel_designers td on td.id = o.td_id
   where fl.id = p_file_id and fl.kind = 'final_document';
  if not found then return null; end if;

  select a.token into v_token from access_tokens a
   where a.purpose = 'traveler_public_proposal' and a.order_id = x.order_id and a.revoked_at is null;
  if v_token is null then
    raise exception 'l''ordine non ha un token traveler_public_proposal attivo';
  end if;

  select * into f from render_template('blocco_firma',
    jsonb_build_object('whatsapp', v_whatsapp,
                       'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

  select * into m from render_template(
    'ai_delivery_traveler',
    jsonb_build_object(
      'saluto', case when coalesce(x.nome, '') <> '' then 'Ciao ' || x.nome else 'Ciao' end,
      'designer', x.td_name,
      'human_ref', x.human_ref,
      'partenza', to_char(x.departure_date, 'DD/MM/YYYY'),
      'link_pagina', rtrim(v_base, '/') || '/proposta/' || v_token),
    jsonb_build_object('firma', f.body_html),
    jsonb_build_object('firma', f.body_text));

  return accoda_messaggio('ai_delivery_traveler', 'order_file', x.id, x.email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'order_file', p_file_id,
         'La mail al viaggiatore con il documento finale non si è composta e **non è partita**: '
         || sqlerrm || '. Si rilancia con: select accoda_mail_ai_consegna(''' || p_file_id || ''');'
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- --------------------------------------------------------------------------
-- I passaggi del denaro, e il ponte fra acconto e saldo
-- --------------------------------------------------------------------------
-- `deposit_paid → awaiting_balance` non lo fa nessuno a mano: succede **quando
-- ci sono tutte e due le cose**, l'acconto pagato e i tempi del saldo scritti.
-- In qualunque ordine arrivino — il team scrive la data prima che il
-- viaggiatore paghi, o dopo — il passaggio lo fa questo trigger, e la mail del
-- saldo parte da lì.
--
-- ⚠️ `after update` e non `after update of status`, per la stessa ragione di
-- `ai_order_rules()`: la data la scrive il team senza toccare lo stato.
create or replace function on_ai_order_money()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  x      record;
  v_file uuid;
begin
  if new.service_type <> 'all_inclusive' then
    return null;
  end if;

  if new.balance_due_at is distinct from old.balance_due_at and new.balance_due_at is not null then
    -- Chi scrive la data è il team: nessun altro la tocca. Studio non dice chi,
    -- quindi lo dice il diario.
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('order', new.id, 'tempi_saldo_inseriti', 'team',
            jsonb_build_object('entro', new.balance_due_at, 'prima', old.balance_due_at));
  end if;

  if new.status is distinct from old.status then
    select td.display_name as td_name,
           coalesce(nullif(btrim(t.full_name), ''), 'Il viaggiatore') as viaggiatore
      into x
      from travel_designers td, travelers t
     where td.id = new.td_id and t.id = new.traveler_id;

    if new.status = 'deposit_paid' then
      perform notifica_team(
        'acconto_pagato', 'order', new.id,
        '[XPETIS] Acconto pagato ' || new.human_ref || ' · ' || euro_it(new.deposit_cents),
        x.viaggiatore || ' ha pagato l''acconto dell''All Inclusive ' || new.human_ref || ' di '
          || coalesce(x.td_name, 'un designer') || ': ' || euro_it(new.deposit_cents) || '. '
          || 'L''agenzia può procedere con le prenotazioni reali. '
          || case when new.balance_due_at is null
                  then 'Mancano i tempi del saldo: quando l''agenzia li comunica, si scrivono in orders.balance_due_at.'
                  else 'I tempi del saldo ci sono già: la richiesta parte adesso.' end);

    elsif new.status = 'awaiting_balance' then
      perform accoda_mail_ai_saldo(new.id);

    elsif new.status = 'balance_paid' then
      perform accoda_mail_ai_saldato_td(new.id);
      perform notifica_team(
        'saldo_pagato', 'order', new.id,
        '[XPETIS] Saldato ' || new.human_ref || ' · ' || euro_it(new.balance_cents),
        x.viaggiatore || ' ha pagato il saldo dell''All Inclusive ' || new.human_ref || ': '
          || euro_it(new.balance_cents) || '. Il designer ha ricevuto la mail per caricare il file finale.');

    elsif new.status = 'delivered' and old.status = 'balance_paid' then
      select f.id into v_file from order_files f
       where f.order_id = new.id and f.kind = 'final_document'
       order by f.created_at desc, f.id desc limit 1;
      perform accoda_mail_ai_consegna(v_file);
      perform notifica_team(
        'ordine_consegnato', 'order_file', v_file,
        '[XPETIS] Consegnato il documento finale ' || new.human_ref,
        coalesce(x.td_name, 'Il designer') || ' ha caricato il documento finale dell''All Inclusive '
          || new.human_ref || '. Il viaggiatore ha ricevuto la mail: per scaricarlo deve entrare con Google.');
    end if;
  end if;

  -- Il ponte. Ultimo di proposito: l'`update` qui sotto rientra in questo
  -- stesso trigger con lo stato nuovo, e i passi sopra per questo giro sono
  -- già fatti.
  if new.status = 'deposit_paid' and new.balance_due_at is not null then
    update orders set status = 'awaiting_balance', last_actor = 'system' where id = new.id;
  end if;

  return null;
end $$;

create trigger orders_soldi_all_inclusive after update on orders
  for each row execute function on_ai_order_money();

-- --------------------------------------------------------------------------
-- Il ponte Stripe: quale delle due rate sta arrivando
-- --------------------------------------------------------------------------
-- Il ramo ordini della 0044 lo lasciava a un alert. Qui la rata la dice, in
-- ordine di forza:
--   1. la nostra riga di `payments` (l'ha scritta il nostro server);
--   2. `metadata.xpetis`, che `apriCassa` scrive su ogni sessione.
-- Senza nessuno dei due non si indovina guardando lo stato dell'ordine: un
-- acconto scambiato per saldo porterebbe l'ordine due passi avanti. Alert.
--
-- Le difese della 0044, identiche: importo contro `deposit_cents` o
-- `balance_cents` (congelati dall'invio all'agenzia, quindi uguali a quelli
-- che la cassa ha dichiarato), `evt_` come chiave del diario nel chiamante,
-- alert critico su ogni scarto, mai un'eccezione. E i soldi veri si
-- registrano anche quando l'ordine non si muove, se l'indice lo permette.
--
-- Gli esiti che il chiamante già conosce si riusano (`importo_non_combacia`,
-- `pagamento_su_ordine_non_in_attesa`, …), così il diario di `stripe_webhook`
-- li scrive senza riemettere il ponte. I due nuovi, `rata_non_riconosciuta` e
-- `rata_gia_registrata`, si scrivono nel diario da qui.
create or replace function stripe_checkout_ai(
  p_obj   jsonb,
  p_ev_id uuid,
  p_pay   payments,
  p_order orders)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_sess    text := p_obj ->> 'id';
  v_pi      text := p_obj ->> 'payment_intent';
  v_amount  integer := nullif(p_obj ->> 'amount_total', '')::integer;
  v_valuta  text := lower(coalesce(p_obj ->> 'currency', ''));
  v_pstatus text := p_obj ->> 'payment_status';
  v_pay     payments := p_pay;
  o         orders := p_order;
  v_rata    text;
  v_atteso  integer;
  v_stato   order_status;
  v_dopo    order_status;
  v_nome    text;
  v_conto   stripe_account_kind;
  v_agenzia uuid;
  v_esito   text;
  v_dett    text;
  v_ok      boolean := true;
  v_caso    text;
  v_registrato boolean;
begin
  v_rata := coalesce(v_pay.kind::text, p_obj -> 'metadata' ->> 'xpetis');

  if v_rata is null or v_rata not in ('deposit', 'balance') then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_rata_non_riconosciuta', 'critical', 'order', o.id,
            'Pagamento Stripe di ' || coalesce(euro_it(v_amount), '(importo ignoto)') || ' arrivato '
            || 'sull''All Inclusive ' || o.human_ref || ' senza dire se è l''acconto o il saldo '
            || '(nessuna riga in payments per la sessione ' || coalesce(v_sess, '(ignota)')
            || ', metadata.xpetis = ' || coalesce(p_obj -> 'metadata' ->> 'xpetis', 'assente') || '). '
            || 'L''ordine non è stato toccato: va guardato a mano.');
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('webhook_event', p_ev_id, 'stripe_rata_non_riconosciuta', 'n8n',
            jsonb_build_object('sessione', v_sess, 'ordine', o.id, 'metadata', p_obj -> 'metadata'));
    return jsonb_build_object('ok', false, 'esito', 'rata_non_riconosciuta',
                              'dettaglio', 'ordine ' || o.human_ref || ': né riga né metadata.xpetis',
                              'order_id', o.id, 'payment_id', v_pay.id);
  end if;

  -- Il ripiego «cerca per ordine», ora che la rata è nota.
  if v_pay.id is null then
    select * into v_pay from payments
     where order_id = o.id and kind = v_rata::payment_kind and stripe_checkout_session_id is null
     order by created_at desc limit 1;
  end if;

  v_atteso := case v_rata when 'deposit' then o.deposit_cents else o.balance_cents end;
  v_stato  := case v_rata when 'deposit' then 'awaiting_deposit'::order_status else 'awaiting_balance'::order_status end;
  v_dopo   := case v_rata when 'deposit' then 'deposit_paid'::order_status else 'balance_paid'::order_status end;
  v_nome   := case v_rata when 'deposit' then 'acconto' else 'saldo' end;

  if coalesce(v_pstatus, '') <> 'paid' then
    v_esito := 'pagamento_non_ancora_incassato';
    v_dett  := 'payment_status = ' || coalesce(v_pstatus, '(assente)');
    v_ok    := false;
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_pagamento_differito', 'warning', 'order', o.id,
            'Sessione Stripe completata ma non ancora incassata (payment_status '
            || coalesce(v_pstatus, 'assente') || ') per il ' || v_nome || ' di ' || o.human_ref
            || '. L''ordine resta in attesa.');

  elsif v_amount is distinct from v_atteso or v_valuta <> 'eur' then
    v_esito := 'importo_non_combacia';
    v_dett  := v_nome || ': incassati ' || coalesce(v_amount::text, 'null') || ' ' || coalesce(v_valuta, '?')
               || ', attesi ' || coalesce(v_atteso::text, 'null') || ' eur';
    v_ok    := false;
    if v_pay.id is not null and v_pi is not null then
      update payments set stripe_payment_intent_id = v_pi where id = v_pay.id;
    end if;
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    values ('stripe_importo_non_combacia', 'critical', 'order', o.id,
            'Incasso Stripe che non combacia con il ' || v_nome || ' dell''All Inclusive ' || o.human_ref
            || ': arrivati ' || coalesce(euro_it(v_amount), '(nessun importo)')
            || case when v_valuta = 'eur' then ''
                    else ' MA IN VALUTA ' || upper(coalesce(nullif(v_valuta, ''), '?')) || ', non in euro' end
            || ', attesi ' || coalesce(euro_it(v_atteso), '(nessun importo in ordine)') || '. '
            || 'L''ordine NON è andato avanti. Sessione ' || coalesce(v_sess, '(ignota)') || '.');

  elsif o.status <> v_stato then
    if v_pay.id is not null and v_pay.status = 'paid'
       and exists (select 1 from order_status_history h
                    where h.order_id = o.id and h.to_status = v_dopo) then
      -- Lo stesso incasso raccontato due volte: non è un guasto.
      v_esito := 'gia_pagato';
      v_dett  := 'il ' || v_nome || ' era già registrato con questa sessione';
    else
      v_esito := 'pagamento_su_ordine_non_in_attesa';
      v_dett  := v_nome || ' arrivato con l''ordine in stato ' || o.status;
      v_ok    := false;

      v_caso := case
        when o.status = 'cancelled' then
          'L''ordine è ANNULLATO: l''incasso va rimborsato.'
        when v_rata = 'balance' and o.status in ('awaiting_deposit', 'deposit_paid') then
          'È un SALDO PAGATO PRIMA DEL TEMPO: '
          || case o.status when 'awaiting_deposit' then 'l''acconto non è ancora stato pagato'
                           else 'i tempi del saldo non sono ancora stati scritti' end
          || '. Va deciso con l''agenzia se tenerlo (e sistemare l''ordine a mano) o rimborsarlo.'
        when v_rata = 'deposit' and o.status in ('requested', 'in_definition', 'proposal_pending_agency') then
          'È un ACCONTO SU UNA PROPOSTA NON CONFERMATA: l''agenzia l''ha rifiutata, o la proposta è '
          || 'stata riaperta. Il viaggiatore ha pagato un pacchetto che oggi non esiste: va rimborsato, '
          || 'o tenuto se la proposta nuova lo assorbe.'
        when o.status = 'disputed' then
          'L''ordine è IN VERIFICA DAL TEAM: il pagamento va messo nel conto dell''arbitrato.'
        else
          'Il ' || v_nome || ' era GIÀ PAGATO con un''altra cassa: è un secondo incasso, e il secondo va rimborsato.'
      end;

      v_registrato := false;
      if v_pay.id is not null then
        begin
          update payments set status = 'paid', paid_at = now(),
                              stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id),
                              stripe_checkout_session_id = coalesce(stripe_checkout_session_id, v_sess)
           where id = v_pay.id and status in ('pending', 'expired');
          v_registrato := found;
        exception when unique_violation then
          v_registrato := false;
        end;
      end if;

      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('stripe_pagamento_su_ordine_non_in_attesa', 'critical', 'order', o.id,
              'Pagamento Stripe di ' || coalesce(euro_it(v_amount), '(importo ignoto)') || ' ('
              || v_nome || ') arrivato sull''All Inclusive ' || o.human_ref || ' in stato ' || o.status || '. '
              || v_caso || ' L''ordine non è stato toccato. '
              || 'Il rimborso, se serve, si fa dalla dashboard Stripe dell''agenzia. '
              || case when v_registrato then 'L''incasso è registrato in payments.'
                      else 'L''incasso NON è registrato in payments (sessione '
                           || coalesce(v_sess, '(ignota)') || '): va guardato su Stripe.' end);
    end if;

  else
    -- Il caso buono.
    --
    -- ⚠️ Con una trappola che il su misura non ha: `payments_one_paid_per_kind`
    -- ammette **un** incasso riuscito per ordine e rata, e conta anche i
    -- rimborsati. Un saldo arrivato prima del tempo (qui sopra) resta scritto
    -- lì anche dopo il rimborso, e il saldo vero, arrivato al momento giusto,
    -- farebbe sollevare l'indice: il ponte tornerebbe `errore` e Stripe
    -- ritenterebbe per sempre. Quindi il tentativo è protetto, e se l'indice lo
    -- ferma l'ordine non avanza e una persona guarda.
    begin
      if v_pay.id is null then
        select stripe_account, agency_id into v_conto, v_agenzia from payment_account(v_rata::payment_kind);
        insert into payments (order_id, kind, status, amount_cents, currency,
                              stripe_account, agency_id,
                              stripe_checkout_session_id, stripe_payment_intent_id,
                              client_reference_id, paid_at)
        values (o.id, v_rata::payment_kind, 'paid', v_amount, 'EUR',
                v_conto, v_agenzia, v_sess, v_pi, o.id::text, now())
        returning * into v_pay;

        insert into team_alerts (kind, severity, entity_type, entity_id, message)
        values ('stripe_riga_pagamento_ricostruita', 'warning', 'order', o.id,
                'Il ' || v_nome || ' dell''All Inclusive ' || o.human_ref || ' è arrivato su una sessione '
                || 'senza riga in `payments`: la riga è stata ricostruita dal webhook. Vale la pena '
                || 'guardare i log della route che apre la cassa.');
      else
        update payments set status = 'paid', paid_at = now(),
                            stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id),
                            stripe_checkout_session_id = coalesce(stripe_checkout_session_id, v_sess)
         where id = v_pay.id;
      end if;
    exception when unique_violation then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('stripe_rata_gia_registrata', 'critical', 'order', o.id,
              'Il ' || v_nome || ' dell''All Inclusive ' || o.human_ref || ' (' || coalesce(euro_it(v_amount), '?')
              || ') è arrivato al momento giusto, ma in payments c''è già un ' || v_nome || ' registrato '
              || 'per questo ordine — di solito uno arrivato prima del tempo, poi rimborsato. L''indice '
              || 'payments_one_paid_per_kind non ne ammette due, quindi l''ordine NON è andato avanti. '
              || 'Guardate le due righe: se la prima è rimborsata, si porta l''ordine avanti a mano. '
              || 'Sessione ' || coalesce(v_sess, '(ignota)') || '.');
      insert into event_log (entity_type, entity_id, event, actor, payload)
      values ('webhook_event', p_ev_id, 'stripe_rata_gia_registrata', 'n8n',
              jsonb_build_object('sessione', v_sess, 'ordine', o.id, 'rata', v_rata));
      return jsonb_build_object('ok', false, 'esito', 'rata_gia_registrata',
                                'dettaglio', v_nome || ' già registrato per ' || o.human_ref,
                                'order_id', o.id, 'payment_id', p_pay.id);
    end;

    update orders set status = v_dopo, last_actor = 'traveler' where id = o.id;

    v_esito := 'ordine_pagato';
    v_dett  := euro_it(v_amount) || ' di ' || v_nome || ' incassati, ordine ' || o.human_ref || ' in ' || v_dopo;

    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('order', o.id, 'stripe_pagata', 'traveler',
            jsonb_build_object('rata', v_rata, 'sessione', v_sess, 'payment_intent', v_pi,
                               'importo_cents', v_amount, 'valuta', v_valuta));
  end if;

  return jsonb_build_object('ok', v_ok, 'esito', v_esito, 'dettaglio', v_dett,
                            'order_id', o.id, 'payment_id', v_pay.id);
end $$;

comment on function stripe_checkout_ai(jsonb, uuid, payments, orders) is
  'Il ramo All Inclusive del ponte Stripe: la rata dalla riga payments o da '
  'metadata.xpetis, l''importo contro deposit_cents o balance_cents, e l''ordine avanti '
  'solo se era in awaiting_deposit o awaiting_balance. Tutto il resto: alert, ordine fermo.';

-- Il ramo ordini, riemesso dalla 0045 con una sola differenza: dove diceva
-- «l'All Inclusive è milestone 7» adesso passa la mano a `stripe_checkout_ai`.
-- Tutto il resto è parola per parola.
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
  v_ai      jsonb;
begin
  v_uuid := v_rif ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- =====================================================================
  if p_tipo = 'checkout.session.expired' then
  -- =====================================================================
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

  elsif v_order.service_type = 'all_inclusive' then
    -- ============================================ 0047: le due rate
    v_ai := stripe_checkout_ai(p_obj, p_ev_id, v_pay, v_order);
    return v_ai || jsonb_build_object('riferimento', v_rif);

  elsif v_order.service_type <> 'custom_itinerary' then
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

      v_registrato := false;
      if v_pay.id is not null then
        begin
          update payments set status = 'paid', paid_at = now(),
                              stripe_payment_intent_id = coalesce(v_pi, stripe_payment_intent_id),
                              stripe_checkout_session_id = coalesce(stripe_checkout_session_id, v_sess)
           where id = v_pay.id and status in ('pending', 'expired');
          v_registrato := found;
        exception when unique_violation then
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

-- ===========================================================================
-- PARTE E — Il designer
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Il token del designer, per tutti e due i servizi
-- --------------------------------------------------------------------------
-- `td_order_from_token` (0044) rifiuta tutto ciò che non è su misura, ed è
-- giusto: le funzioni della proposta su misura non devono mai lavorare su un
-- All Inclusive. Qui si separa **il controllo del token** — scopo, destinatario,
-- designer dell'ordine — dal controllo del servizio, così le pagine che
-- sanno trattare tutti e due risolvono il token **una volta sola**.
create or replace function td_order_token(p_token text, p_blocca boolean default false)
returns table (esito text, token text, order_id uuid, service_type service_type)
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

  -- Il token è del designer, non dell'ordine (0044).
  if d.td_id is distinct from o.td_id then
    esito := 'token_di_altro_tipo'; return next; return;
  end if;

  esito := 'valido'; token := d.token; order_id := o.id; service_type := o.service_type;
  return next;
end $$;

-- La 0044 diventa un involucro: stesso risultato, la regola in un posto solo.
create or replace function td_order_from_token(p_token text, p_blocca boolean default false)
returns table (esito text, token text, order_id uuid)
language plpgsql volatile security definer set search_path = public as $$
declare
  a record;
begin
  select * into a from td_order_token(p_token, p_blocca);
  if a.esito <> 'valido' then
    esito := a.esito; return next; return;
  end if;
  if a.service_type <> 'custom_itinerary' then
    esito := 'servizio_non_gestito'; return next; return;
  end if;
  esito := 'valido'; token := a.token; order_id := a.order_id;
  return next;
end $$;

-- --------------------------------------------------------------------------
-- La nascita dell'ordine: anche l'All Inclusive riceve il suo link
-- --------------------------------------------------------------------------
-- Riemessa dalla 0044. Cambia il `return null` sugli ordini non su misura e
-- il testo, che per l'All Inclusive è un altro: la proposta è un documento e
-- passa dall'agenzia.
create or replace function accoda_mail_ordine_td(p_order_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  o          record;
  v_token    text;
  v_testo    text;
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

  if not found or o.service_type not in ('custom_itinerary', 'all_inclusive') then
    return null;
  end if;
  v_testo := case o.service_type when 'all_inclusive' then 'order_new_td_ai' else 'order_new_td' end;

  insert into access_tokens (purpose, audience, order_id, td_id)
  values ('td_order_page', 'td', o.id, o.td_id)
  on conflict (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
    where revoked_at is null
  do nothing;

  select a.token into v_token
    from access_tokens a
   where a.purpose = 'td_order_page' and a.order_id = o.id and a.revoked_at is null;

  select * into m from render_template(
    v_testo,
    jsonb_build_object(
      'saluto', case when coalesce(o.td_nome, '') <> '' then 'Ciao ' || o.td_nome else 'Ciao' end,
      'human_ref', o.human_ref,
      'nome_viaggiatore', coalesce(nullif(o.viaggiatore, ''), 'Chi ha fatto la call con te'),
      'data_call', coalesce(to_char(o.starts_at, 'DD/MM/YYYY'), '(data non registrata)'),
      'prezzo_call', coalesce(euro_it(o.prezzo_call), '(prezzo non registrato)'),
      'link_ordine', rtrim(v_base, '/') || '/ordine/' || v_token,
      'whatsapp', v_whatsapp));

  return accoda_messaggio(v_testo, 'order', o.id, o.td_email,
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

-- Il trigger della 0044, allargato. Il nome resta quello: rinominarlo vorrebbe
-- dire un `drop trigger`, per una parola.
create or replace function on_custom_order_created()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.service_type in ('custom_itinerary', 'all_inclusive') and new.status = 'requested' then
    perform accoda_mail_ordine_td(new.id);
  end if;
  return null;
end $$;

-- --------------------------------------------------------------------------
-- I file della pagina All Inclusive
-- --------------------------------------------------------------------------
create or replace function ai_files_for_page(p_order_id uuid, p_tipi order_file_kind[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'tipo', f.kind, 'nome', f.filename, 'caricato_il', f.created_at)
           order by f.created_at desc), '[]'::jsonb)
    from order_files f
   where f.order_id = p_order_id and f.kind = any (p_tipi)
$$;

-- --------------------------------------------------------------------------
-- La pagina ordine All Inclusive, vista dal designer
-- --------------------------------------------------------------------------
-- Flusso §8 (Chiara): «stessa base del su misura, stati in più, upload
-- documento vincolante». Del viaggiatore il nome, come nella 0044.
create or replace function td_ai_order_page(p_order_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  o        record;
  v_credito text;
  v_base   text;
  v_link   text;
  v_msg    text;
  v_msg_c  text;
  v_ult    record;
  r        record;
begin
  select o2.*, b.starts_at as call_il, b.price_cents as prezzo_call,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name, ag.name as agenzia
    into o
    from orders o2
    join travelers t on t.id = o2.traveler_id
    join travel_designers td on td.id = o2.td_id
    left join agencies ag on ag.id = o2.agency_id and ag.is_active
    left join bookings b on b.id = o2.source_booking_id
   where o2.id = p_order_id;

  select o2.human_ref into v_credito
    from orders o2
   where o2.source_booking_id = o.source_booking_id and o2.id <> o.id
     and o2.consultation_credit_cents > 0
   limit 1;

  -- L'ultima proposta partita, con la sua decisione: dice al designer perché
  -- la proposta è di nuovo sua (l'agenzia non ha confermato) e cosa correggere.
  select pr.round, pr.sent_at, ad.decision, ad.note, ad.decided_at
    into v_ult
    from order_proposals pr
    left join agency_decisions ad on ad.proposal_id = pr.id
   where pr.order_id = o.id
   order by pr.round desc limit 1;

  if o.status in ('awaiting_deposit', 'deposit_paid', 'awaiting_balance', 'balance_paid',
                  'delivered', 'completed') then
    select value_text into v_base from app_config where key = 'site_base_url';
    select rtrim(v_base, '/') || '/proposta/' || t.token into v_link
      from access_tokens t
     where t.purpose = 'traveler_public_proposal' and t.order_id = o.id and t.revoked_at is null;

    if v_link is not null then
      begin
        select * into r from render_template('blocco_whatsapp_ai_proposta',
          jsonb_build_object('human_ref', o.human_ref, 'link_pagina', v_link));
        v_msg := r.body_text;
      exception when others then
        v_msg := null;
      end;
      if o.status in ('delivered', 'completed') then
        begin
          select * into r from render_template('blocco_whatsapp_ai_consegna',
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
    'servizio',          'all_inclusive',
    'human_ref',         o.human_ref,
    'status',            o.status,
    'td_name',           o.td_name,
    'nome_viaggiatore',  nullif(o.nome, ''),
    'call_il',           o.call_il,
    'prezzo_call_cents', o.prezzo_call,
    'credito_usato_su',  v_credito,
    'agenzia',           o.agenzia,
    'descrizione',       o.proposal_description,
    'prezzo_cents',      o.proposal_price_cents,
    'partenza',          o.departure_date,
    'ritorno',           o.return_date,
    'credito_cents',     o.consultation_credit_cents,
    'acconto_cents',     o.deposit_cents,
    'saldo_cents',       o.balance_cents,
    'saldo_entro',       o.balance_due_at,
    'inviata_il',        o.proposal_sent_at,
    'confermata_il',     o.agency_confirmed_at,
    'ultimo_invio',      case when v_ult.round is not null then jsonb_build_object(
                           'n', v_ult.round, 'inviata_il', v_ult.sent_at,
                           'decisione', v_ult.decision, 'nota', v_ult.note,
                           'decisa_il', v_ult.decided_at) end,
    'documenti',         ai_files_for_page(o.id, array['proposal_document']::order_file_kind[]),
    'file_finale',       ai_files_for_page(o.id, array['final_document']::order_file_kind[]),
    'link_pagina',       v_link,
    'messaggio_pronto',  v_msg,
    'messaggio_consegna', v_msg_c,
    'consegnato_il',     o.delivered_at,
    'chiuso_il',         o.completed_at);
end $$;

-- La pagina ordine della 0046, riemessa: risolve il token una volta sola con
-- `td_order_token` e passa l'All Inclusive alla sua funzione. Da `select * into
-- o` in giù è parola per parola, più la chiave `servizio`.
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
  select * into a from td_order_token(p_token);
  if a.esito <> 'valido' then
    return jsonb_build_object('esito', a.esito);
  end if;
  if a.service_type = 'all_inclusive' then
    return td_ai_order_page(a.order_id);
  end if;
  if a.service_type <> 'custom_itinerary' then
    return jsonb_build_object('esito', 'servizio_non_gestito');
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
    'servizio',          'custom_itinerary',
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

-- --------------------------------------------------------------------------
-- La bozza All Inclusive
-- --------------------------------------------------------------------------
-- Come `save_proposal_draft` della 0044, con le date al posto dei giorni di
-- consegna. Il documento non passa di qui: si carica a parte, con lo stesso
-- meccanismo della consegna (parte B della 0046), e la bozza lo trova.
--
-- ⚠️ Nessuna sottrazione del credito, come nella 0044: il prezzo è il totale
-- finale, già al netto di quello che il designer ha deciso di scalare.
create or replace function ai_save_draft(
  p_token         text,
  p_descrizione   text,
  p_prezzo_cents  integer,
  p_partenza      date,
  p_ritorno       date,
  p_credito_cents integer)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a       record;
  o       orders;
  v_call  integer;
  v_altro text;
  v_desc  text := btrim(coalesce(p_descrizione, ''));
  v_cred  integer := coalesce(p_credito_cents, 0);
  v_oggi  date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into a from td_order_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;
  if a.service_type <> 'all_inclusive' then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_gestito');
  end if;

  select * into o from orders where id = a.order_id;

  if o.status = 'proposal_pending_agency' then
    return jsonb_build_object('ok', false, 'esito', 'in_verifica_agenzia');
  end if;
  if o.status not in ('requested', 'in_definition') then
    return jsonb_build_object('ok', false, 'esito', 'proposta_gia_inviata', 'stato', o.status);
  end if;

  if v_desc = '' or length(v_desc) > 20000 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'descrizione');
  end if;
  -- Il minimo è di due casse da 0,50 €, che è il vincolo di Stripe: il controllo
  -- preciso sull'acconto lo fa l'invio, che conosce la percentuale.
  if p_prezzo_cents is null or p_prezzo_cents < 100 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'prezzo');
  end if;
  if p_partenza is null or p_partenza <= v_oggi then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'partenza');
  end if;
  if p_ritorno is not null and p_ritorno < p_partenza then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'ritorno');
  end if;
  if v_cred < 0 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'credito');
  end if;

  if v_cred > 0 then
    if o.source_booking_id is null then
      return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'credito',
                                'motivo', 'senza_call');
    end if;
    select price_cents into v_call from bookings where id = o.source_booking_id;
    if v_call is null or v_cred > v_call then
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
    departure_date            = p_partenza,
    return_date               = p_ritorno,
    consultation_credit_cents = v_cred,
    status     = case when status = 'requested' then 'in_definition'::order_status else status end,
    last_actor = 'td'
   where id = o.id;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id, 'proposta_bozza_salvata', 'td',
          jsonb_build_object('token', a.token, 'prezzo_cents', p_prezzo_cents,
                             'partenza', p_partenza, 'ritorno', p_ritorno, 'credito_cents', v_cred));

  return jsonb_build_object('ok', true, 'esito', 'salvata');
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'esito', 'credito_gia_usato');
end $$;

-- --------------------------------------------------------------------------
-- L'invio all'agenzia
-- --------------------------------------------------------------------------
-- Il gesto che la 0044 chiamava irreversibile, con una differenza: qui non è
-- irreversibile, perché l'agenzia può rimandarla indietro. Ridichiara il prezzo
-- come `send_proposal`, e risponde con una parola a ogni cosa che manca —
-- l'agenzia per primo, perché è il team a doverla assegnare e il designer deve
-- sapere che non è colpa sua.
create or replace function ai_send_to_agency(p_token text, p_prezzo_confermato_cents integer)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a       record;
  o       orders;
  v_pct   numeric;
  v_acc   integer;
  v_giorni numeric;
begin
  select * into a from td_order_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;
  if a.service_type <> 'all_inclusive' then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_gestito');
  end if;

  select * into o from orders where id = a.order_id;

  if o.status = 'proposal_pending_agency' then
    return jsonb_build_object('ok', true, 'esito', 'gia_inviata');
  end if;
  if o.status = 'requested' then
    return jsonb_build_object('ok', false, 'esito', 'bozza_mancante');
  end if;
  if o.status <> 'in_definition' then
    return jsonb_build_object('ok', false, 'esito', 'proposta_gia_inviata', 'stato', o.status);
  end if;

  if o.proposal_price_cents is null or o.departure_date is null
     or coalesce(btrim(o.proposal_description), '') = '' then
    return jsonb_build_object('ok', false, 'esito', 'bozza_mancante');
  end if;
  if not exists (select 1 from order_files f where f.order_id = o.id and f.kind = 'proposal_document') then
    return jsonb_build_object('ok', false, 'esito', 'documento_mancante');
  end if;
  if o.agency_id is null or not exists (select 1 from agencies ag where ag.id = o.agency_id and ag.is_active) then
    return jsonb_build_object('ok', false, 'esito', 'agenzia_non_assegnata');
  end if;
  if o.departure_date <= (now() at time zone 'Europe/Rome')::date then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'partenza');
  end if;

  select value into v_pct    from app_config where key = 'deposit_percent';
  select value into v_giorni from app_config where key = 'agency_confirm_valid_days';
  if v_pct is null or v_pct <= 0 or v_pct >= 100 or v_giorni is null or v_giorni <= 0 then
    return jsonb_build_object('ok', false, 'esito', 'non_configurato');
  end if;
  v_acc := round(o.proposal_price_cents * v_pct / 100)::integer;
  if v_acc < 50 or o.proposal_price_cents - v_acc < 50 then
    return jsonb_build_object('ok', false, 'esito', 'dati_non_validi', 'campo', 'prezzo');
  end if;

  if p_prezzo_confermato_cents is distinct from o.proposal_price_cents then
    return jsonb_build_object('ok', false, 'esito', 'prezzo_cambiato',
                              'prezzo_cents', o.proposal_price_cents);
  end if;

  -- Da qui fanno tutto i trigger: acconto e saldo, la fotografia, il token
  -- dell'agenzia, la sua mail.
  update orders set status = 'proposal_pending_agency', last_actor = 'td' where id = o.id;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id, 'proposta_inviata_agenzia', 'td',
          jsonb_build_object('token', a.token, 'prezzo_cents', o.proposal_price_cents,
                             'credito_cents', o.consultation_credit_cents));

  return jsonb_build_object('ok', true, 'esito', 'inviata');
end $$;

-- --------------------------------------------------------------------------
-- I file: il documento di proposta e il documento finale
-- --------------------------------------------------------------------------
-- **Lo stesso meccanismo della 0046, non una copia**: `td_delivery_ticket` e
-- `td_deliver` sono le porte, le route e il componente del caricamento restano
-- quelli, e qui cambia solo **cosa** si carica secondo lo stato. Le due
-- funzioni della 0046 si riemettono con uno smistamento in testa; il ramo su
-- misura è il loro corpo di prima.
--
--   · `requested`, `in_definition` → il **documento di proposta**. Non cambia
--     lo stato: è un pezzo della bozza, e se ne possono caricare più d'uno (va
--     all'agenzia l'ultimo);
--   · `balance_paid` → il **documento finale**, e l'ordine va a `delivered`.
create or replace function ai_ticket(p_order_id uuid, p_nome text, p_size bigint, p_mime text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  o orders;
  v_estensione text;
begin
  select * into o from orders where id = p_order_id;

  if o.status not in ('requested', 'in_definition', 'balance_paid') then
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
    'tipo',  case when o.status = 'balance_paid' then 'final_document' else 'proposal_document' end);
end $$;

create or replace function ai_deliver(p_order_id uuid, p_token text, p_path text, p_nome text,
                                      p_size bigint, p_mime text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  o      orders;
  v_tipo order_file_kind;
  v_file uuid;
begin
  select * into o from orders where id = p_order_id;

  if exists (select 1 from order_files f where f.storage_path = p_path and f.order_id = o.id) then
    return jsonb_build_object('ok', true, 'esito', 'gia_consegnato', 'stato', o.status);
  end if;
  if o.status not in ('requested', 'in_definition', 'balance_paid') then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;
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

  v_tipo := case when o.status = 'balance_paid' then 'final_document' else 'proposal_document' end;

  insert into order_files (order_id, kind, storage_path, filename, size_bytes, mime_type, uploaded_by)
  values (o.id, v_tipo, p_path, nome_file_pulito(p_nome), p_size, p_mime, 'td')
  returning id into v_file;

  if v_tipo = 'final_document' then
    update orders set status = 'delivered', delivered_at = now(), last_actor = 'td' where id = o.id;
  end if;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', o.id,
          case v_tipo when 'final_document' then 'documento_finale_consegnato' else 'documento_proposta_caricato' end,
          'td', jsonb_build_object('token', p_token, 'file', v_file, 'byte', p_size, 'tipo', p_mime));

  return jsonb_build_object('ok', true,
                            'esito', case v_tipo when 'final_document' then 'consegnato' else 'caricato' end,
                            'file', v_file);
end $$;

-- Riemessa dalla 0046: token risolto una volta, All Inclusive smistato. Da
-- `select * into o` in giù è la 0046 parola per parola.
create or replace function td_delivery_ticket(p_token text, p_nome text, p_size bigint, p_mime text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  a   record;
  o   orders;
  v_estensione text;
begin
  select * into a from td_order_token(p_token);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;
  if a.service_type = 'all_inclusive' then
    return ai_ticket(a.order_id, p_nome, p_size, p_mime);
  end if;
  if a.service_type <> 'custom_itinerary' then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_gestito');
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
  select * into a from td_order_token(p_token, true);
  if a.esito <> 'valido' then
    return jsonb_build_object('ok', false, 'esito', a.esito);
  end if;
  if a.service_type = 'all_inclusive' then
    return ai_deliver(a.order_id, a.token, p_path, p_nome, p_size, p_mime);
  end if;
  if a.service_type <> 'custom_itinerary' then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_gestito');
  end if;

  select * into o from orders where id = a.order_id;

  if exists (select 1 from order_files f where f.storage_path = p_path and f.order_id = o.id) then
    return jsonb_build_object('ok', true, 'esito', 'gia_consegnato', 'stato', o.status);
  end if;

  if o.status not in ('in_progress', 'revision_requested') then
    return jsonb_build_object('ok', false, 'esito', 'stato_non_ammesso', 'stato', o.status);
  end if;

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
    update orders set
      status               = 'delivered',
      delivered_at         = now(),
      revision_deadline_at = now() + make_interval(days => v_giorni::int),
      last_actor           = 'td'
     where id = o.id;
  else
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

-- ===========================================================================
-- PARTE F — Il viaggiatore
-- ===========================================================================

-- La pagina All Inclusive del viaggiatore. Come la gemella del su misura, **è
-- fatta per essere girata** nel gruppo commerciale: niente del viaggiatore.
--
-- `cassa` dice alla route quale rata aprire e per quanto, **letto da qui**:
-- il browser non manda né una rata né un importo. `agency_id` serve alla
-- route per controllare che l'agenzia che incassa sia quella dell'ordine; la
-- pagina non lo scrive nell'HTML.
create or replace function ai_traveler_page(p_order_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  o      record;
  v_prop record;
  v_fase text;
begin
  select o2.*, td.display_name as td_name, td.slug as td_slug, ag.name as agenzia
    into o
    from orders o2
    join travel_designers td on td.id = o2.td_id
    left join agencies ag on ag.id = o2.agency_id
   where o2.id = p_order_id;

  -- La proposta che l'agenzia ha confermato: la sua fotografia, e il suo
  -- documento. Un documento caricato dopo non la sostituisce.
  select pr.document_file_id, f.filename
    into v_prop
    from order_proposals pr
    join agency_decisions ad on ad.proposal_id = pr.id and ad.decision = 'confirmed'
    left join order_files f on f.id = pr.document_file_id
   where pr.order_id = o.id
   order by pr.round desc limit 1;

  v_fase := case o.status
    when 'awaiting_deposit' then 'da_pagare_acconto'
    when 'deposit_paid'     then 'acconto_pagato'
    when 'awaiting_balance' then 'da_pagare_saldo'
    when 'balance_paid'     then 'saldata'
    when 'delivered'        then 'consegnata'
    when 'completed'        then 'chiusa'
    when 'cancelled'        then 'annullata'
    when 'disputed'         then 'in_verifica'
    else 'in_aggiornamento'   -- requested, in_definition, proposal_pending_agency
  end;

  return jsonb_build_object(
    'esito',          'valido',
    'servizio',       'all_inclusive',
    'fase',           v_fase,
    'order_id',       o.id,
    'agency_id',      o.agency_id,
    'human_ref',      o.human_ref,
    'td_name',        o.td_name,
    'td_slug',        o.td_slug,
    'agenzia',        o.agenzia,
    -- La proposta si vede solo quando è confermata: in `in_aggiornamento` le
    -- colonne portano la bozza nuova del designer.
    'descrizione',    case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_description end,
    'totale_cents',   case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.total_price_cents end,
    'acconto_cents',  case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.deposit_cents end,
    'saldo_cents',    case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.balance_cents end,
    'partenza',       case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.departure_date end,
    'ritorno',        case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.return_date end,
    'saldo_entro',    o.balance_due_at,
    'documento',      case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica')
                            and v_prop.document_file_id is not null
                           then jsonb_build_object('id', v_prop.document_file_id, 'nome', v_prop.filename) end,
    -- Il documento finale: solo i nomi. Si scarica da `/documento/<id>`, dopo
    -- l'accesso con Google (decisione del 27 settembre).
    'file_finale',    case when v_fase in ('consegnata', 'chiusa')
                           then ai_files_for_page(o.id, array['final_document']::order_file_kind[])
                           else '[]'::jsonb end,
    'consegnato_il',  o.delivered_at,
    'cassa',          case v_fase
                        when 'da_pagare_acconto' then jsonb_build_object('rata', 'deposit', 'importo_cents', o.deposit_cents)
                        when 'da_pagare_saldo'   then jsonb_build_object('rata', 'balance', 'importo_cents', o.balance_cents)
                      end);
end $$;

-- La pagina gemella della 0046, riemessa con lo smistamento. Da `select value
-- into v_giorni` in giù è parola per parola.
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
  if o.service_type = 'all_inclusive' then
    return ai_traveler_page(o.id);
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
    'servizio',     'custom_itinerary',
    'fase',         v_fase,
    'order_id',     o.id,
    'human_ref',    o.human_ref,
    'td_name',      o.td_name,
    'td_slug',      o.td_slug,
    'descrizione',  case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_description end,
    'prezzo_cents', case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_price_cents end,
    'giorni',       case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.delivery_days end,
    'inviata_il',   case when v_fase not in ('in_aggiornamento', 'annullata', 'in_verifica') then o.proposal_sent_at end,
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

-- `request_revision` (0046) risponde già `servizio_non_gestito` a un All
-- Inclusive: la revisione inclusa è del su misura, e qui non si tocca.

-- --------------------------------------------------------------------------
-- Scaricare: tre porte a token, e una col login
-- --------------------------------------------------------------------------
-- Riemessa dalla 0046 con l'agenzia e l'All Inclusive. Le regole, per chi:
--
--   · **il designer**: tutti i file del suo ordine, sempre (come prima);
--   · **l'agenzia**: il solo documento della proposta del suo token, e solo
--     finché il token vale — cioè finché non ha risposto;
--   · **la pagina del viaggiatore**, su misura: come la 0046. All Inclusive: il
--     documento della proposta **confermata**, e basta. **Il documento finale
--     no**: da un token girato nel gruppo non esce. Si scarica da
--     `final_document_for_traveler()`, col login.
create or replace function order_file_for_token(p_token text, p_file_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  d record;
  o record;
  f order_files;
  v_doc uuid;
begin
  select * into d from resolve_access_token_detail(p_token);
  if d.esito is distinct from 'valido' then
    return jsonb_build_object('esito', d.esito);
  end if;
  if d.order_id is null
     or d.purpose not in ('td_order_page', 'traveler_public_proposal', 'agency_proposal_confirm') then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;

  select o2.id, o2.td_id, o2.status, o2.service_type, o2.agency_id
    into o from orders o2 where o2.id = d.order_id;
  if not found then
    return jsonb_build_object('esito', 'ordine_sconosciuto');
  end if;

  if d.purpose = 'td_order_page' and d.td_id is distinct from o.td_id then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;
  if d.purpose = 'agency_proposal_confirm' and d.agency_id is distinct from o.agency_id then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;
  if d.purpose = 'traveler_public_proposal' and o.service_type = 'custom_itinerary'
     and o.status not in ('delivered', 'revision_requested', 'completed') then
    return jsonb_build_object('esito', 'file_sconosciuto');
  end if;

  select * into f from order_files where id = p_file_id and order_id = o.id;
  if not found then
    return jsonb_build_object('esito', 'file_sconosciuto');
  end if;

  if d.purpose = 'agency_proposal_confirm' then
    select pr.document_file_id into v_doc from order_proposals pr
     where pr.id = nullif(d.payload ->> 'proposta', '')::uuid;
    if v_doc is distinct from f.id then
      return jsonb_build_object('esito', 'file_sconosciuto');
    end if;
  end if;

  if d.purpose = 'traveler_public_proposal' and o.service_type = 'all_inclusive' then
    select pr.document_file_id into v_doc
      from order_proposals pr
      join agency_decisions ad on ad.proposal_id = pr.id and ad.decision = 'confirmed'
     where pr.order_id = o.id
     order by pr.round desc limit 1;
    if f.kind <> 'proposal_document' or v_doc is distinct from f.id
       or o.status in ('requested', 'in_definition', 'proposal_pending_agency', 'cancelled', 'disputed') then
      return jsonb_build_object('esito', 'file_sconosciuto');
    end if;
  end if;

  return jsonb_build_object('esito', 'valido', 'path', f.storage_path, 'nome', f.filename);
end $$;

comment on function order_file_for_token(text, uuid) is
  'Il permesso di scaricare un file dell''ordine con un token: designer, agenzia (il '
  'documento della sua proposta) o pagina del viaggiatore. Il documento finale All '
  'Inclusive NON esce da qui: vedi final_document_for_traveler. Restituisce il '
  'PERCORSO, mai un URL.';

-- Il documento finale, per chi è entrato con Google. `p_viewer` lo passa la
-- route, dopo averlo letto dalla sessione verificata dal server di
-- autenticazione (`getUser()`, non il cookie letto e basta). Chi non è il
-- viaggiatore dell'ordine riceve la stessa risposta di un file che non esiste:
-- dire «questo documento è di qualcun altro» racconterebbe già troppo.
create or replace function final_document_for_traveler(p_file_id uuid, p_viewer uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  x record;
begin
  if p_viewer is null then
    return jsonb_build_object('esito', 'serve_accesso');
  end if;

  select f.storage_path, f.filename, o.traveler_id, o.status, o.human_ref
    into x
    from order_files f join orders o on o.id = f.order_id
   where f.id = p_file_id and f.kind = 'final_document' and o.service_type = 'all_inclusive';

  if not found or x.traveler_id is distinct from p_viewer
     or x.status not in ('delivered', 'completed') then
    return jsonb_build_object('esito', 'file_sconosciuto');
  end if;

  return jsonb_build_object('esito', 'valido', 'path', x.storage_path, 'nome', x.filename,
                            'human_ref', x.human_ref);
end $$;

comment on function final_document_for_traveler(uuid, uuid) is
  'Il permesso di scaricare il documento finale All Inclusive: solo il viaggiatore '
  'dell''ordine, con la sessione Google. Chiunque altro riceve file_sconosciuto.';

-- ===========================================================================
-- PARTE G — L'orologio, con due rami in più
-- ===========================================================================

-- Il link dell'agenzia è scaduto e la proposta aspetta ancora: è l'eccezione
-- su cui entra una persona. Un alert per ordine, finché resta aperto.
create or replace function clock_ramo_verifica_agenzia()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_n integer;
begin
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'verifica_agenzia_scaduta', 'warning', 'order', o.id,
         'Il link dell''agenzia per la proposta ' || o.human_ref || ' è scaduto il '
         || to_char(t.expires_at at time zone 'Europe/Rome', 'DD/MM/YYYY') || ' senza risposta. '
         || 'La proposta è ferma in verifica. Sentita l''agenzia nel gruppo tecnico, si manda un '
         || 'link nuovo con: select rinnova_verifica_agenzia(''' || o.id || ''');'
    from orders o
    join access_tokens t on t.order_id = o.id and t.purpose = 'agency_proposal_confirm'
                        and t.revoked_at is null and t.used_at is null
   where o.service_type = 'all_inclusive'
     and o.status = 'proposal_pending_agency'
     and t.expires_at <= now()
     and not exists (select 1 from team_alerts a
                      where a.kind = 'verifica_agenzia_scaduta' and a.entity_id = o.id
                        and a.resolved_at is null);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Il saldo è scaduto e non è arrivato. Il sistema non annulla niente — sono
-- prenotazioni reali di un'agenzia, con le loro penali — e lo dice al team.
create or replace function clock_ramo_saldo_scaduto()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_n integer;
begin
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'saldo_scaduto', 'critical', 'order', o.id,
         'Il saldo dell''All Inclusive ' || o.human_ref || ' (' || euro_it(o.balance_cents)
         || ') doveva arrivare entro il '
         || to_char(o.balance_due_at at time zone 'Europe/Rome', 'DD/MM/YYYY')
         || ' e non è arrivato. La partenza è il ' || to_char(o.departure_date, 'DD/MM/YYYY')
         || '. Va sentito il viaggiatore, e l''agenzia per le sue scadenze.'
    from orders o
   where o.service_type = 'all_inclusive'
     and o.status = 'awaiting_balance'
     and o.balance_due_at <= now()
     and not exists (select 1 from team_alerts a
                      where a.kind = 'saldo_scaduto' and a.entity_id = o.id and a.resolved_at is null);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Riemesso dalla 0046: due `perform`, e due chiavi nell'elenco dei parametri.
-- Tutto il resto è parola per parola.
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
      -- 0047: l'acconto All Inclusive e la vita del link dell'agenzia
      'deposit_percent', 'agency_confirm_valid_days'
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
  perform clock_ramo_verifica_agenzia();   -- 0047: il link dell'agenzia scaduto
  perform clock_ramo_saldo_scaduto();      -- 0047: il saldo non arrivato in tempo

  -- ========================================================================
  -- I rami che hanno bisogno del mondo di fuori
  -- ========================================================================
  return query select * from clock_ramo_insoluti(p_limit);
  return query select * from clock_ramo_email(p_limit);
end $$;

-- ===========================================================================
-- I privilegi
-- ===========================================================================
revoke all on function payment_account(payment_kind)                      from public, anon, authenticated;
revoke all on function agency_stripe_key(uuid)                            from public, anon, authenticated;
revoke all on function ai_order_rules()                                   from public, anon, authenticated;
revoke all on function emetti_verifica_agenzia(uuid)                      from public, anon, authenticated;
revoke all on function accoda_mail_verifica_agenzia(text)                 from public, anon, authenticated;
revoke all on function on_ai_proposal_sent()                              from public, anon, authenticated;
revoke all on function rinnova_verifica_agenzia(uuid)                     from public, anon, authenticated;
revoke all on function agency_token_context(text)                         from public, anon, authenticated;
revoke all on function agency_page(text)                                  from public, anon, authenticated;
revoke all on function agency_decide(text, text, text)                    from public, anon, authenticated;
revoke all on function on_ai_agency_outcome()                             from public, anon, authenticated;
revoke all on function accoda_mail_esito_td(uuid, boolean)                from public, anon, authenticated;
revoke all on function accoda_mail_ai_proposta(uuid)                      from public, anon, authenticated;
revoke all on function accoda_mail_ai_saldo(uuid)                         from public, anon, authenticated;
revoke all on function accoda_mail_ai_saldato_td(uuid)                    from public, anon, authenticated;
revoke all on function accoda_mail_ai_consegna(uuid)                      from public, anon, authenticated;
revoke all on function on_ai_order_money()                                from public, anon, authenticated;
revoke all on function stripe_checkout_ai(jsonb, uuid, payments, orders)  from public, anon, authenticated;
revoke all on function stripe_checkout_ordine(text, jsonb, uuid, payments) from public, anon, authenticated;
revoke all on function td_order_token(text, boolean)                      from public, anon, authenticated;
revoke all on function td_order_from_token(text, boolean)                 from public, anon, authenticated;
revoke all on function accoda_mail_ordine_td(uuid)                        from public, anon, authenticated;
revoke all on function on_custom_order_created()                          from public, anon, authenticated;
revoke all on function ai_files_for_page(uuid, order_file_kind[])         from public, anon, authenticated;
revoke all on function td_ai_order_page(uuid)                             from public, anon, authenticated;
revoke all on function td_order_page(text)                                from public, anon, authenticated;
revoke all on function ai_save_draft(text, text, integer, date, date, integer) from public, anon, authenticated;
revoke all on function ai_send_to_agency(text, integer)                   from public, anon, authenticated;
revoke all on function ai_ticket(uuid, text, bigint, text)                from public, anon, authenticated;
revoke all on function ai_deliver(uuid, text, text, text, bigint, text)   from public, anon, authenticated;
revoke all on function td_delivery_ticket(text, text, bigint, text)       from public, anon, authenticated;
revoke all on function td_deliver(text, text, text, bigint, text)         from public, anon, authenticated;
revoke all on function ai_traveler_page(uuid)                             from public, anon, authenticated;
revoke all on function proposal_public_page(text)                         from public, anon, authenticated;
revoke all on function order_file_for_token(text, uuid)                   from public, anon, authenticated;
revoke all on function final_document_for_traveler(uuid, uuid)            from public, anon, authenticated;
revoke all on function clock_ramo_verifica_agenzia()                      from public, anon, authenticated;
revoke all on function clock_ramo_saldo_scaduto()                         from public, anon, authenticated;
revoke all on function clock_tick(integer)                                from public, anon, authenticated;

-- Le route server, con la chiave secret.
grant execute on function payment_account(payment_kind)                    to service_role;
grant execute on function agency_stripe_key(uuid)                          to service_role;
grant execute on function agency_page(text)                                to service_role;
grant execute on function agency_decide(text, text, text)                  to service_role;
grant execute on function td_order_page(text)                              to service_role;
grant execute on function ai_save_draft(text, text, integer, date, date, integer) to service_role;
grant execute on function ai_send_to_agency(text, integer)                 to service_role;
grant execute on function td_delivery_ticket(text, text, bigint, text)     to service_role;
grant execute on function td_deliver(text, text, text, bigint, text)       to service_role;
grant execute on function proposal_public_page(text)                       to service_role;
grant execute on function order_file_for_token(text, uuid)                 to service_role;
grant execute on function final_document_for_traveler(uuid, uuid)          to service_role;
grant execute on function clock_tick(integer)                              to service_role;
-- Per il team dal SQL Editor, come dicono gli alert.
grant execute on function rinnova_verifica_agenzia(uuid)                   to service_role;
grant execute on function accoda_mail_ordine_td(uuid)                      to service_role;
grant execute on function accoda_mail_esito_td(uuid, boolean)              to service_role;
grant execute on function accoda_mail_ai_proposta(uuid)                    to service_role;
grant execute on function accoda_mail_ai_saldo(uuid)                       to service_role;
grant execute on function accoda_mail_ai_saldato_td(uuid)                  to service_role;
grant execute on function accoda_mail_ai_consegna(uuid)                    to service_role;
