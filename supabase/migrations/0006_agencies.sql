-- XPETIS · 0006 · Agenzie partner (All Inclusive)

create table agencies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  legal_name          text,
  vat_number          text,
  operational_email   text not null,   -- dove arrivano le proposte da verificare
  contacts            jsonb not null default '{}'::jsonb,
  is_default_partner  boolean not null default false,
  is_active           boolean not null default true,

  -- ATTENZIONE: nessuna credenziale Stripe in chiaro qui. Questa colonna è un
  -- puntatore alla credenziale custodita altrove (Supabase Vault o credential
  -- di n8n). Vedi la decisione aperta su Stripe Connect nel README.
  stripe_account_id            text,
  stripe_credential_ref        text,
  stripe_webhook_configured_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola agenzia partner XPETIS di default.
create unique index agencies_single_default on agencies (is_default_partner)
  where is_default_partner;

create trigger agencies_touch before update on agencies
  for each row execute function set_updated_at();
