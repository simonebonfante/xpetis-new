-- XPETIS · 0004 · Funzioni di servizio

-- updated_at automatico.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Token opaco url-safe da 32 caratteri: è l'unica autenticazione di TD e
-- agenzie. 24 byte casuali = 192 bit, non indovinabile.
-- `gen_random_bytes` è di pgcrypto: su Supabase sta nello schema `extensions`,
-- altrove in `public`. La funzione se lo porta dietro invece di dipendere dal
-- search_path di chi la chiama.
create or replace function new_access_token()
returns text
language sql
set search_path = public, extensions
as $$
  select translate(encode(gen_random_bytes(24), 'base64'), '+/=', 'xyz');
$$;
