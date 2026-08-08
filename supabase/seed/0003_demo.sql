-- XPETIS · seed 0003 · Dati finti per provare l'algoritmo di matching
-- Due Travel Designer inventati. Non hanno niente a che vedere con i 25 veri:
-- servono solo a far girare le prove del match e dei vincoli.

-- La geografia arriva dalla tassonomia vera (seed 0002): qui si usano i suoi
-- identificatori reali. I paesi scelti servono a provare tutte le bande:
--   vietnam, thailandia, giappone, cambogia, corea_del_sud → stessa macro-area
--   india                                                  → stesso continente, altra macro-area
--   peru, bolivia                                          → Sud America
--   tanzania                                               → Africa Sub-Sahariana

-- Due TD con profili volutamente diversi.
insert into travel_designers (id, slug, status, display_name, headline, bio, email, cal_username, joined_at)
values
  ('11111111-1111-1111-1111-111111111111', 'marco-rossi', 'published', 'Marco Rossi',
   'Sud-est asiatico, ritmo lento',
   'Bio narrativa di prova abbastanza lunga da superare il controllo di completezza del profilo.',
   'marco@example.com', 'marco-rossi-xpetis', '2026-01-10'),
  ('22222222-2222-2222-2222-222222222222', 'giulia-neri', 'published', 'Giulia Neri',
   'Ande e alta quota',
   'Bio narrativa di prova abbastanza lunga da superare il controllo di completezza del profilo.',
   'giulia@example.com', 'giulia-neri-xpetis', '2026-02-05')
on conflict (id) do nothing;

update travel_designers
   set photo_url = 'https://example.com/' || slug || '.jpg'
 where id in ('11111111-1111-1111-1111-111111111111',
              '22222222-2222-2222-2222-222222222222');

insert into td_countries (td_id, country_code, level) values
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 1),
  ('11111111-1111-1111-1111-111111111111', 'thailandia', 1),
  ('11111111-1111-1111-1111-111111111111', 'giappone', 2),
  ('22222222-2222-2222-2222-222222222222', 'peru', 1),
  ('22222222-2222-2222-2222-222222222222', 'bolivia', 2)
on conflict do nothing;

insert into td_axis_values (td_id, axis_code, value) values
  ('11111111-1111-1111-1111-111111111111', 'planning_involvement', 2),
  ('11111111-1111-1111-1111-111111111111', 'pace', 1),
  ('11111111-1111-1111-1111-111111111111', 'comfort_wild', 3),
  ('11111111-1111-1111-1111-111111111111', 'curated_vs_real', 3),
  ('11111111-1111-1111-1111-111111111111', 'social_orientation', 4),
  ('11111111-1111-1111-1111-111111111111', 'companions', 2),
  ('11111111-1111-1111-1111-111111111111', 'companions', 4),
  ('22222222-2222-2222-2222-222222222222', 'planning_involvement', 4),
  ('22222222-2222-2222-2222-222222222222', 'pace', 4),
  ('22222222-2222-2222-2222-222222222222', 'comfort_wild', 4),
  ('22222222-2222-2222-2222-222222222222', 'curated_vs_real', 2),
  ('22222222-2222-2222-2222-222222222222', 'social_orientation', 2),
  ('22222222-2222-2222-2222-222222222222', 'companions', 1)
on conflict do nothing;

insert into td_destination_tags (td_id, country_code, tag_code) values
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 'food'),
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 'cultura_arte_storia'),
  ('11111111-1111-1111-1111-111111111111', 'vietnam', 'campagna_rurale'),
  ('11111111-1111-1111-1111-111111111111', 'thailandia', 'mare_isole'),
  ('11111111-1111-1111-1111-111111111111', 'giappone', 'citta'),
  ('22222222-2222-2222-2222-222222222222', 'peru', 'avventura_outdoor'),
  ('22222222-2222-2222-2222-222222222222', 'peru', 'montagna'),
  ('22222222-2222-2222-2222-222222222222', 'bolivia', 'deserto')
on conflict do nothing;

insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes,
                         cal_event_type_slug, stripe_payment_link_url, text_during_call, text_after_call, sort_order)
values
  ('11111111-1111-1111-1111-111111111111', 'consultation', true, 6000, 30,
   'consulenza-xpetis-30', 'https://buy.stripe.com/test_marco_consulenza',
   'Cosa faremo durante la call.', 'Cosa potrai fare dopo.', 1),
  ('22222222-2222-2222-2222-222222222222', 'consultation', true, 7500, 30,
   'consulenza-xpetis-30', 'https://buy.stripe.com/test_giulia_consulenza',
   'Cosa faremo durante la call.', 'Cosa potrai fare dopo.', 1),
  ('22222222-2222-2222-2222-222222222222', 'consultation_deep', true, 15000, 60,
   'consulenza-xpetis-approfondita', 'https://buy.stripe.com/test_giulia_deep',
   'Cosa faremo durante la call lunga.', 'Cosa potrai fare dopo.', 2)
on conflict do nothing;

-- L'All Inclusive è sempre attivo per tutti; l'itinerario su misura dipende dal TD.
insert into td_services (td_id, service_type, is_active, sort_order)
select id, 'all_inclusive', true, 10 from travel_designers
on conflict do nothing;

insert into td_services (td_id, service_type, is_active, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'custom_itinerary', true, 5)
on conflict do nothing;

insert into agencies (id, name, operational_email, is_default_partner)
values ('33333333-3333-3333-3333-333333333333', 'Agenzia Partner XPETIS', 'ops@agenziapartner.example', true)
on conflict do nothing;
