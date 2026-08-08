-- XPETIS · 0010 · Le transizioni ammesse, una per riga

-- Itinerario su misura
insert into order_status_transitions (service_type, from_status, to_status) values
  ('custom_itinerary', 'requested',          'in_definition'),
  ('custom_itinerary', 'requested',          'proposal_sent'),
  ('custom_itinerary', 'in_definition',      'proposal_sent'),
  ('custom_itinerary', 'proposal_sent',      'in_definition'),   -- proposta da rifare
  ('custom_itinerary', 'proposal_sent',      'in_progress'),     -- pagato
  ('custom_itinerary', 'in_progress',        'delivered'),
  ('custom_itinerary', 'delivered',          'revision_requested'),
  ('custom_itinerary', 'revision_requested', 'delivered'),
  ('custom_itinerary', 'delivered',          'completed');       -- 5 giorni di silenzio

-- All Inclusive
insert into order_status_transitions (service_type, from_status, to_status) values
  ('all_inclusive', 'requested',               'in_definition'),
  ('all_inclusive', 'in_definition',           'proposal_pending_agency'),
  ('all_inclusive', 'proposal_pending_agency', 'in_definition'),      -- agenzia non conferma
  ('all_inclusive', 'proposal_pending_agency', 'awaiting_deposit'),   -- agenzia conferma
  ('all_inclusive', 'awaiting_deposit',        'deposit_paid'),
  ('all_inclusive', 'deposit_paid',            'awaiting_balance'),
  ('all_inclusive', 'awaiting_balance',        'balance_paid'),
  ('all_inclusive', 'balance_paid',            'delivered'),
  ('all_inclusive', 'delivered',               'completed');

-- Cancellazione e disputa sono sempre possibili da qualunque stato non finale,
-- e il team può riportare un ordine in disputa dove serve.
insert into order_status_transitions (service_type, from_status, to_status)
select s.service_type, f.status, t.status
  from (values ('custom_itinerary'::service_type), ('all_inclusive'::service_type)) as s(service_type)
  cross join (
    select unnest(array[
      'requested', 'in_definition', 'proposal_pending_agency', 'proposal_sent',
      'in_progress', 'awaiting_deposit', 'deposit_paid', 'awaiting_balance',
      'balance_paid', 'delivered', 'revision_requested'
    ]::order_status[]) as status
  ) as f
  cross join (select unnest(array['cancelled', 'disputed']::order_status[]) as status) as t
on conflict do nothing;

-- Uscite dalla disputa: il team arbitra e decide.
insert into order_status_transitions (service_type, from_status, to_status)
select s.service_type, 'disputed'::order_status, t.status
  from (values ('custom_itinerary'::service_type), ('all_inclusive'::service_type)) as s(service_type)
  cross join (
    select unnest(array[
      'in_definition', 'proposal_sent', 'in_progress', 'awaiting_deposit',
      'deposit_paid', 'awaiting_balance', 'balance_paid', 'delivered',
      'revision_requested', 'completed', 'cancelled'
    ]::order_status[]) as status
  ) as t
on conflict do nothing;
