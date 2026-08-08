-- XPETIS · 0016 · Row Level Security
-- Modello scelto: le pagine token e tutte le scritture passano da route
-- server-side Next.js con service key. Quindi la regola è: RLS accesa
-- ovunque, nessuna policy per anon, e il browser legge solo dalle viste
-- public_*. Se domani serve una lettura dal client, si aggiunge una vista, non
-- si apre una tabella.

alter table travelers                 enable row level security;
alter table quiz_responses            enable row level security;
alter table travel_designers          enable row level security;
alter table td_countries              enable row level security;
alter table td_axis_values            enable row level security;
alter table td_destination_tags       enable row level security;
alter table td_services               enable row level security;
alter table agencies                  enable row level security;
alter table bookings                  enable row level security;
alter table booking_status_history    enable row level security;
alter table orders                    enable row level security;
alter table order_files               enable row level security;
alter table order_status_history      enable row level security;
alter table order_status_transitions  enable row level security;
alter table payments                  enable row level security;
alter table access_tokens             enable row level security;
alter table reviews                   enable row level security;
alter table webhook_events            enable row level security;
alter table outbound_messages         enable row level security;
alter table team_alerts               enable row level security;
alter table event_log                 enable row level security;
alter table tags                      enable row level security;
alter table quiz_axes                 enable row level security;
alter table quiz_axis_options         enable row level security;
alter table app_config                enable row level security;
alter table geo_continents            enable row level security;
alter table geo_macro_areas           enable row level security;
alter table geo_countries             enable row level security;
alter table geo_regions               enable row level security;
alter table geo_cities                enable row level security;

-- Nessun privilegio diretto sulle tabelle per i ruoli del browser.
revoke all on all tables in schema public from anon, authenticated;

-- Le sole letture consentite dal browser.
grant select on
  public_td_profiles,
  public_td_showcase,
  public_reviews,
  public_config,
  public_quiz_axes,
  public_tags,
  geo_search
to anon, authenticated;

-- La tabella geo serve al suggeritore: la esponiamo tramite la vista, e la
-- vista geo_search legge le tabelle con i privilegi del proprietario.

-- L'unica policy per l'utente loggato: leggere e aggiornare la propria riga.
-- Serve per mostrargli nome e telefono già compilati.
grant select, update (full_name, phone) on travelers to authenticated;

create policy travelers_select_own on travelers
  for select to authenticated
  using (id = auth.uid());

create policy travelers_update_own on travelers
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Lettura delle proprie prenotazioni e dei propri ordini: predisposta per una
-- futura area viaggiatore, oggi nessuna pagina la usa.
grant select on bookings, orders to authenticated;

create policy bookings_select_own on bookings
  for select to authenticated
  using (traveler_id = auth.uid());

create policy orders_select_own on orders
  for select to authenticated
  using (traveler_id = auth.uid());

-- Il resto (access_tokens sopra tutto) resta invisibile e inscrivibile a
-- chiunque non sia service_role.
