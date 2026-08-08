-- XPETIS · 0023 · I campi che il designer dichiara per ogni paese
--
-- Il form raccoglie per ogni paese otto campi. Quattro finivano già nello schema
-- (paese, temi, contesti, e il livello che però il form non chiede). Gli altri
-- quattro non avevano casa.

alter table td_countries
  add column areas_note       text,
  add column custom_themes    text[] not null default '{}',
  add column typical_duration text,
  add column typical_budget   text;

comment on column td_countries.areas_note is
  'Campo "aree" del form, testo libero. A volte è un dettaglio dentro il paese '
  '("Lofoten"), a volte contiene i paesi veri di una voce aggregata: sotto '
  '"Balcani" un designer ha scritto "Croazia, Slovenia, Serbia, Albania, '
  'Bosnia, Kosovo". Da leggere quando si normalizza una voce che non è uno stato.';

comment on column td_countries.custom_themes is
  'Temi scritti dal designer fuori dalla tassonomia (temiCustom). Non entrano '
  'nel match: restano visibili al team, che decide se meritano un tag nuovo.';

comment on column td_countries.typical_duration is
  'Durata tipica dichiarata. Il Flusso tiene durata e budget FUORI dal matching '
  '("si concordano in call a match avvenuto"): si conservano perché il designer '
  'li ha dichiarati e servono in call.';

alter table td_countries add constraint td_countries_duration_values
  check (typical_duration is null or typical_duration in (
    'Weekend (2–4 gg)', 'Breve (5–7 gg)', 'Standard (8–14 gg)',
    'Lungo (15–30 gg)', 'Esteso (oltre un mese)'
  ));

alter table td_countries add constraint td_countries_budget_values
  check (typical_budget is null or typical_budget in (
    'Contenuto (<€1.500)', 'Medio (€1.500–3.500)', 'Alto (€3.500–7.000)',
    'Premium (€7.000–15.000)', 'Senza vincolo'
  ));
