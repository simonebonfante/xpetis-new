-- XPETIS · 0026 · Gli itinerari pronti da vivere
--
-- Sezione della vetrina: gli itinerari già confezionati che il designer mostra
-- come esempio. Sono vetrina, non catalogo: non si comprano da qui. Il Flusso è
-- chiaro che l'unica porta d'acquisto è la consulenza.

create table td_ready_itineraries (
  id             uuid primary key default gen_random_uuid(),
  td_id          uuid not null references travel_designers(id) on delete cascade,
  position       smallint not null check (position > 0),
  title          text not null check (length(btrim(title)) > 0),
  duration_label text,
  price_label    text,
  image_path     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (td_id, position)
);
create index td_ready_itineraries_td_idx on td_ready_itineraries (td_id, position);

create trigger td_ready_itineraries_touch before update on td_ready_itineraries
  for each row execute function set_updated_at();

comment on column td_ready_itineraries.duration_label is
  'Testo libero come lo scrive il designer ("5-7 giorni", "12 giorni").';

-- Deroga consapevole alla convenzione degli importi in centesimi: qui il prezzo
-- arriva dal form come testo ("850€", "1.380€") ed è un'indicazione di vetrina,
-- non un importo su cui si incassa. La convenzione *_cents vale dove passa
-- denaro vero: consulenze, proposte, acconti, saldi.
comment on column td_ready_itineraries.price_label is
  'Prezzo indicativo come testo, non in centesimi: è vetrina, non una cassa. '
  'Nessun pagamento nasce da questa riga.';

alter table td_ready_itineraries enable row level security;
revoke all on td_ready_itineraries from anon, authenticated;
