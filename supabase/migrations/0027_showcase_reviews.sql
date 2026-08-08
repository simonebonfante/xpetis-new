-- XPETIS · 0027 · Le recensioni che il designer porta da fuori
--
-- Il form le chiede così: "inserisci qui se hai già qualche recensione sul tuo
-- sito (facoltativo)". Sono per costruzione esterne a XPETIS, e questo le mette
-- in rotta di collisione con un principio dello schema: `reviews` pretende un
-- ordine vero dietro ogni recensione, ed è quel vincolo a rendere impossibili
-- le recensioni finte.
--
-- Tabella separata, quindi. Il principio resta intatto per le recensioni XPETIS,
-- e queste si conservano senza essere confuse con quelle.
--
-- **Nessuna vista pubblica le espone e `is_published` nasce a falso.** Se
-- mostrarle, come distinguerle e se contarle nelle medie si decide quando si
-- affronteranno le recensioni (milestone 8). Fino ad allora il database le
-- tiene e nessuno le vede.

create table td_showcase_reviews (
  id           uuid primary key default gen_random_uuid(),
  td_id        uuid not null references travel_designers(id) on delete cascade,
  position     smallint not null check (position > 0),
  title        text,
  author_name  text not null check (length(btrim(author_name)) > 0),
  stars        smallint not null check (stars between 1 and 5),
  date_label   text,
  body         text not null check (length(btrim(body)) > 0),
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (td_id, position)
);
create index td_showcase_reviews_td_idx on td_showcase_reviews (td_id, position);

comment on table td_showcase_reviews is
  'Recensioni raccolte dal designer fuori da XPETIS (campo recensioni[] del '
  'form). Distinte da `reviews`, che pretende un ordine vero dietro: è quel '
  'vincolo a rendere impossibili le recensioni finte, e non va allentato.';

comment on column td_showcase_reviews.date_label is
  'Data come l''ha scritta il designer ("Febbraio 2026", "4 gennaio 2026"): '
  'testo libero, non una data. Normalizzarla vorrebbe dire inventare un giorno.';

comment on column td_showcase_reviews.is_published is
  'Falso finché non si decide se e come mostrarle in vetrina (milestone 8). '
  'Non entrano in td_review_stats né nello spareggio del ranking.';

alter table td_showcase_reviews enable row level security;
revoke all on td_showcase_reviews from anon, authenticated;
