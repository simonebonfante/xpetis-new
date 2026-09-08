-- XPETIS · 0038 · Quello che la cassa della consulenza chiede allo schema
--
-- Due cose piccole, entrambe conseguenze diretta dell'aprire una Checkout
-- Session dal nostro server: un vincolo che rende impossibile la seconda cassa
-- sulla stessa prenotazione, e la scadenza di pagamento visibile al viaggiatore
-- che deve pagare entro quella.

-- ===========================================================================
-- Una sola cassa aperta per prenotazione
-- ===========================================================================
-- La 0011 ha già `payments_one_paid_per_kind`: un solo incasso RIUSCITO per
-- coppia (entità, tipo). Non dice niente sulle righe `pending`, e va bene per i
-- Payment Link — che erano fissi e non si "aprivano". Con la cassa aperta dal
-- server la domanda cambia: un doppio clic sul bottone Paga fa partire due
-- richieste, nessuna delle due vede la riga dell'altra, e nascono due Checkout
-- Session per lo stesso slot. Due indirizzi di pagamento vivi per una consulenza
-- sola sono un doppio incasso in attesa di succedere.
--
-- La difesa non può stare nel codice della route: fra il `select` che non trova
-- niente e l'`insert` che crea la riga c'è una finestra, e due richieste
-- parallele ci passano dentro tutte e due. Sta qui, dove il secondo inserimento
-- fallisce e la route riconosce l'errore, butta la sessione appena creata e
-- riusa quella dell'altra richiesta.
--
-- `coalesce(booking_id, order_id)` come nell'indice della 0011: `payments_one_target`
-- garantisce che esattamente uno dei due sia pieno, quindi la coppia identifica
-- l'entità senza ambiguità.
create unique index payments_one_pending_per_kind
  on payments (coalesce(booking_id, order_id), kind)
  where status = 'pending';

comment on index payments_one_pending_per_kind is
  'Una sola cassa aperta per entità e tipo. Il gemello di payments_one_paid_per_kind '
  'sul lato "in attesa": impedisce che un doppio clic apra due Checkout Session '
  'per la stessa prenotazione.';

-- ===========================================================================
-- La scadenza del pagamento, per chi deve pagare
-- ===========================================================================
-- `my_bookings` (0019) è la sola porta da cui il viaggiatore loggato legge le
-- proprie prenotazioni, e non contiene `payment_deadline_at`: alla 0019 non
-- serviva a nessuno. Serve adesso, perché la pagina della prenotazione mostra
-- quanto tempo resta per pagare, ed è un dato suo — non una credenziale come
-- `cal_booking_uid`, che resta fuori.
--
-- `create or replace` invece di `drop` + `create`: aggiungere una colonna in
-- fondo è consentito, e così i privilegi della 0019 non si perdono per strada
-- (un `drop view` se li porta via, e il `grant` andrebbe rifatto).
create or replace view my_bookings as
  select
    b.id,
    b.status,
    b.service_type,
    b.starts_at,
    b.ends_at,
    b.price_cents,
    b.video_url,
    b.context_note,
    b.reschedule_count_traveler,
    b.created_at,
    td.slug         as td_slug,
    td.display_name as td_name,
    td.photo_url    as td_photo_url,
    -- In coda, e non accanto a `created_at` dove starebbe meglio: `create or
    -- replace view` sa aggiungere colonne in fondo, non riordinarle.
    b.payment_deadline_at
    from bookings b
    join travel_designers td on td.id = b.td_id
   where b.traveler_id = auth.uid();

comment on view my_bookings is
  'Le prenotazioni del viaggiatore loggato. Senza cal_booking_uid, che dopo S-05 '
  'è di fatto una credenziale di cancellazione. Con payment_deadline_at, che è '
  'invece un dato suo: è il tempo che ha per pagare.';

-- ===========================================================================
-- Il Payment Link non è più un requisito
-- ===========================================================================
-- `td_services_bookable_complete` (0007) pretende che un servizio di consulenza
-- attivo abbia prezzo, durata, event type Cal.com **e `stripe_payment_link_url`**.
-- L'ultima condizione è più vecchia della **deviazione 1** del `PIANO.md`: quando
-- il vincolo è stato scritto, la cassa era un Payment Link fisso creato a mano
-- dal pannello Stripe. Non lo è più — la Checkout Session la apre il nostro
-- server leggendo l'importo da `bookings.price_cents` — e tenere la condizione
-- vorrebbe dire far inventare a qualcuno 25 URL finte per pubblicare 25 profili.
-- È esattamente il task S-10 che `PIANO.md` dà per sparito.
--
-- Le altre tre condizioni restano, e sono quelle che contano davvero: senza
-- prezzo la cassa non si può aprire, senza durata e senza event type la
-- prenotazione non nasce.
--
-- La colonna non si tocca: è vuota e non dà fastidio, e toglierla romperebbe
-- l'import dei profili senza guadagnare niente.
alter table td_services drop constraint td_services_bookable_complete;

alter table td_services add constraint td_services_bookable_complete check (
  service_type not in ('consultation', 'consultation_deep')
  or is_active = false
  or (price_cents is not null
      and duration_minutes is not null
      and cal_event_type_slug is not null)
);

comment on column td_services.stripe_payment_link_url is
  'Reliquia dei Payment Link fissi, superati dalla deviazione 1: la cassa la apre '
  'il nostro server con l''importo letto dal database. Non è più richiesta per '
  'pubblicare un servizio.';
