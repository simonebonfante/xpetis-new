-- XPETIS · 0012 · Token di accesso
-- Unico meccanismo di autenticazione di TD e agenzie, e delle pagine pubbliche
-- monouso del viaggiatore. Le pagine token si servono SOLO da route server-side
-- con service key: il browser non parla mai con Supabase su queste tabelle.

create table access_tokens (
  token      text primary key default new_access_token(),
  purpose    token_purpose not null,
  audience   token_audience not null,

  booking_id uuid references bookings(id) on delete cascade,
  order_id   uuid references orders(id) on delete cascade,
  td_id      uuid references travel_designers(id) on delete cascade,
  agency_id  uuid references agencies(id) on delete cascade,

  -- Contesto specifico del token: per i bottoni della mail post-call è il
  -- servizio da attivare, es. { "service_type": "all_inclusive" }.
  payload jsonb not null default '{}'::jsonb,

  single_use boolean not null default false,
  expires_at timestamptz,        -- null = non scade (i bottoni post-call non scadono mai)
  used_at    timestamptz,
  revoked_at timestamptz,
  use_count  integer not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),

  constraint access_tokens_has_target check (num_nonnulls(booking_id, order_id) >= 1)
);

create index access_tokens_order_idx on access_tokens (order_id);
create index access_tokens_booking_idx on access_tokens (booking_id);

-- Un solo token attivo per scopo su ogni entità.
create unique index access_tokens_one_active_per_purpose
  on access_tokens (purpose, coalesce(booking_id, order_id))
  where revoked_at is null;

-- Validazione lato server: dice se il token è buono e aggiorna le tracce d'uso.
create or replace function resolve_access_token(p_token text)
returns table (
  token      text,
  purpose    token_purpose,
  audience   token_audience,
  booking_id uuid,
  order_id   uuid,
  td_id      uuid,
  agency_id  uuid,
  payload    jsonb
) language plpgsql security definer set search_path = public as $$
begin
  update access_tokens t
     set last_seen_at = now(),
         use_count    = t.use_count + 1
   where t.token = p_token
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now())
     and (t.single_use = false or t.used_at is null);

  if not found then
    return;
  end if;

  return query
    select t.token, t.purpose, t.audience, t.booking_id, t.order_id,
           t.td_id, t.agency_id, t.payload
      from access_tokens t
     where t.token = p_token;
end $$;

revoke all on function resolve_access_token(text) from public, anon, authenticated;
