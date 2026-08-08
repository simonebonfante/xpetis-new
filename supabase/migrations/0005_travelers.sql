-- XPETIS · 0005 · Viaggiatori
-- Login solo Google, e solo al momento di prenotare. Tutta la navigazione
-- prima di lì è anonima e non tocca il database.

create table travelers (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  full_name        text,
  phone            text,
  phone_consent_at timestamptz,   -- consenso raccolto nel form di prenotazione
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index travelers_email_idx on travelers (lower(email));

create trigger travelers_touch before update on travelers
  for each row execute function set_updated_at();

-- La riga nasce da sola al primo login Google: nessuna policy di insert,
-- nessuna scrittura dal client.
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into travelers (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Risposte al quiz. Conservate anche per gli anonimi (session_id) perché sono
-- il dato con cui tareremo i pesi degli assi sui TD Fondatori.
create table quiz_responses (
  id                       uuid primary key default gen_random_uuid(),
  traveler_id              uuid references travelers(id) on delete set null,
  session_id               text,
  answers                  jsonb not null,                    -- { axis_code: value }
  filters                  jsonb not null default '{}'::jsonb, -- { theme: [], context: [] }
  destination_country_code text references geo_countries(code) on update cascade,
  created_at               timestamptz not null default now(),
  constraint quiz_responses_has_owner check (traveler_id is not null or session_id is not null)
);
create index quiz_responses_traveler_idx on quiz_responses (traveler_id);
