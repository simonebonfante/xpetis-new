-- XPETIS · 0024 · I cinque servizi del form
--
-- Il form offre cinque servizi, il mio enum ne aveva quattro. Mancavano il
-- viaggio di gruppo a firma del designer e l'accompagnamento privato.
--
-- Entrano nell'enum perché il designer li attiva e la vetrina li mostra, ma
-- **nessun ordine può nascere su di loro**: il vincolo su `orders.service_type`
-- ammette solo `custom_itinerary` e `all_inclusive`. Il database registra così
-- una decisione di prodotto ancora aperta — attivabili in vetrina, non ancora
-- acquistabili — invece di lasciarla a un commento.

alter type service_type add value if not exists 'group_trip';
alter type service_type add value if not exists 'private_guiding';

-- Il form ha una spunta "prezzo deciso da me, non un prezzo fisso uguale per
-- tutti": è un'informazione di prodotto, non un dettaglio del form.
alter table td_services
  add column price_is_custom boolean not null default false;

comment on column td_services.price_is_custom is
  'Campo callPrezzoLibero del form: il designer ha scelto di decidere lui il '
  'prezzo invece di usare quello standard.';

comment on column td_services.price_cents is
  'Importo in centesimi. Attenzione all''import: nel form il prezzo della call è '
  'testo libero (un designer scrive "20", l''esempio del form "30€"). Chi importa '
  'deve parsare e segnalare ciò che non capisce, mai indovinare.';

-- I punti "cosa è incluso" del box consulenza: quattro nel form, ordinati.
create table td_service_bullets (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references td_services(id) on delete cascade,
  position   smallint not null check (position > 0),
  text_it    text not null check (length(btrim(text_it)) > 0),
  unique (service_id, position)
);
create index td_service_bullets_service_idx on td_service_bullets (service_id, position);

comment on table td_service_bullets is
  'Campo callPunti del form: i punti elencati dentro il box di un servizio.';

-- Ogni tabella nuova nasce chiusa. Su Supabase i privilegi di default
-- concedono `anon` e `authenticated` sulle tabelle create dopo: la revoca è
-- esplicita, non ereditata dalla 0016.
alter table td_service_bullets enable row level security;
revoke all on td_service_bullets from anon, authenticated;
