-- XPETIS · 0001 · Estensioni ed enum
-- Riferimento: "XPETIS - Il flusso completo" (16 luglio 2026)

-- ATTENZIONE all'ambiente. Su Supabase queste estensioni sono già installate
-- nello schema `extensions`, quindi `if not exists` non fa niente e le loro
-- funzioni NON sono sul search_path di default. Su un Postgres normale finiscono
-- in `public`. Per questo ogni oggetto che le usa dichiara
-- `search_path = public, extensions`: uno schema inesistente nel search_path
-- viene ignorato, quindi la stessa riga funziona in entrambi i casi.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- I quattro servizi. Consulenza e consulenza approfondita si prenotano dalla
-- vetrina; itinerario su misura e all inclusive nascono solo dopo la call.
create type service_type as enum (
  'consultation',
  'consultation_deep',
  'custom_itinerary',
  'all_inclusive'
);

-- Stati di una prenotazione consulenza (sez. 4-6 del flusso).
create type booking_status as enum (
  'pending_payment',    -- prenotata, in attesa di pagamento (30 min)
  'confirmed',          -- confermata, pagata
  'cancelled_unpaid',   -- insoluto: slot liberato dal workflow dei 5 minuti
  'cancelled',          -- cancellata dopo il pagamento (rimborso o no)
  'completed',          -- chiusa a silenzio-conferma dopo 48h
  'no_show',            -- viaggiatore assente, TD pagato
  'disputed'            -- in arbitrato del team
);

-- Stati degli ordini post-call. Un solo enum per i due flussi: quali
-- transizioni sono lecite per quale servizio lo dice order_status_transitions.
create type order_status as enum (
  'requested',                -- click sul bottone della mail post-call
  'in_definition',            -- gruppo WhatsApp creato, si definisce il viaggio
  'proposal_pending_agency',  -- solo All Inclusive: verifica dell'agenzia
  'proposal_sent',            -- su misura: proposta inviata, in attesa di pagamento
  'in_progress',              -- su misura: pagato, in lavorazione
  'awaiting_deposit',         -- All Inclusive: agenzia ha confermato, acconto 30%
  'deposit_paid',             -- acconto pagato, prenotazioni reali in corso
  'awaiting_balance',
  'balance_paid',
  'delivered',                -- itinerario o file finale consegnato
  'revision_requested',       -- su misura: la revisione inclusa
  'completed',
  'cancelled',
  'disputed'
);

create type payment_kind as enum ('consultation', 'full', 'deposit', 'balance');

create type payment_status as enum ('pending', 'paid', 'expired', 'refunded', 'partially_refunded');

-- Su quale conto Stripe incassa. Le consulenze e l'itinerario su misura sul
-- conto XPETIS; l'All Inclusive sul conto dell'agenzia (merchant of record,
-- regime 74-ter).
create type stripe_account_kind as enum ('xpetis', 'agency');

create type td_status as enum ('draft', 'published', 'paused');

create type tag_kind as enum ('theme', 'context');

create type axis_kind as enum ('continuous', 'categorical');

create type token_audience as enum ('td', 'agency', 'traveler');

create type token_purpose as enum (
  'td_order_page',
  'td_exception_no_show',
  'td_exception_problem',
  'agency_proposal_confirm',
  'traveler_service_request',   -- i bottoni servizi della mail post-call
  'traveler_public_proposal',   -- la pagina gemella della proposta
  'traveler_review'
);

-- Chi ha causato un cambio di stato. Serve alla tracciabilità: il TD non ha
-- login, quindi l'unica prova di chi ha agito è il token che ha usato.
create type actor_kind as enum ('system', 'n8n', 'team', 'td', 'agency', 'traveler');

create type review_kind as enum ('consultation', 'trip');

create type order_file_kind as enum ('proposal_document', 'itinerary', 'revision', 'final_document');

create type alert_severity as enum ('info', 'warning', 'critical');
