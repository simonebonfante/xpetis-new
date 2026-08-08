-- XPETIS · 0019 · Il viaggiatore non vede il codice della prenotazione
--
-- La verifica S-05 ha stabilito che su Cal.com per cancellare una prenotazione
-- basta il codice della prenotazione, senza nessuna credenziale. Quel codice è
-- quindi di fatto una credenziale, e il `grant select on bookings` della 0016 lo
-- consegnava al viaggiatore loggato: poteva leggere il proprio
-- `cal_booking_uid` e cancellare la call fuori dal nostro flusso, aggirando le
-- regole di rimborso.
--
-- Le regole di rimborso non si difendono comunque chiudendo l'accesso al codice
-- (le mail native di Cal.com contengono il link "cancella"): si applicano sul
-- webhook BOOKING_CANCELLED. Ma consegnare la credenziale al browser resta
-- gratuito e sbagliato.

revoke select on bookings from authenticated;
revoke select on orders   from authenticated;

drop policy if exists bookings_select_own on bookings;
drop policy if exists orders_select_own   on orders;

-- Le viste filtrano su auth.uid() al posto della policy: girano con i privilegi
-- del proprietario, quindi la RLS delle tabelle resta chiusa a tutti.
create view my_bookings as
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
    td.photo_url    as td_photo_url
    from bookings b
    join travel_designers td on td.id = b.td_id
   where b.traveler_id = auth.uid();

comment on view my_bookings is
  'Le prenotazioni del viaggiatore loggato. Senza cal_booking_uid, che dopo S-05 '
  'è di fatto una credenziale di cancellazione.';

create view my_orders as
  select
    o.id,
    o.human_ref,
    o.service_type,
    o.status,
    o.proposal_description,
    o.proposal_price_cents,
    o.delivery_days,
    o.total_price_cents,
    o.deposit_cents,
    o.balance_cents,
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

grant select on my_bookings, my_orders to authenticated;
