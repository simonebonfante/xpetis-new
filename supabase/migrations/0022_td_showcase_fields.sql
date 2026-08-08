-- XPETIS · 0022 · I campi di profilo che il form raccoglie
--
-- Lo schema era progettato per il matching e per il flusso degli ordini: della
-- vetrina aveva una sola colonna, `bio`. Il form Vetrina TD raccoglie molto di
-- più. Qui entrano i campi singoli del profilo; le sezioni ripetute (viaggi
-- firma, itinerari, recensioni portate da fuori) sono tabelle a parte.

alter table travel_designers
  add column hero_bio              text,
  add column manifesto             text,
  add column instagram_handle      text,
  add column years_experience      smallint check (years_experience is null or years_experience between 0 and 70),
  add column legal_coverage         text,
  add column group_trips_readiness  text,
  add column group_trips_timing     text;

comment on column travel_designers.hero_bio is
  'Il paragrafo in cima alla vetrina (campo heroBio del form). Diverso da '
  'headline, che è una riga, e da bio, che è la storia lunga.';
comment on column travel_designers.bio is
  'La storia narrativa lunga (campo storia del form). Paragrafi separati da doppia riga vuota.';
comment on column travel_designers.manifesto is
  'La frase-manifesto del designer.';
comment on column travel_designers.years_experience is
  'Anni di esperienza dichiarati (campo esperienza del form).';

-- Le tre risposte possibili sono quelle del form. Il vincolo non è pedanteria:
-- se il form cambia le parole, l''import deve fallire in modo visibile invece di
-- scrivere una stringa che nessuno leggerà mai bene.
alter table travel_designers add constraint travel_designers_legal_coverage_values
  check (legal_coverage is null or legal_coverage in (
    'Ho già un''agenzia / struttura — non mi serve supporto',
    'Non ho un''agenzia — vorrei un partner certificato XPETIS',
    'Non so / ne vorrei parlare con voi'
  ));

comment on column travel_designers.legal_coverage is
  'Copertura legale e assicurativa dichiarata nel form. Guida l''assegnazione '
  'dell''agenzia sugli ordini All Inclusive: "ho già un''agenzia" significa che '
  'agency_id va popolato con la sua, "vorrei un partner certificato" che si usa '
  'la partner XPETIS.';

alter table travel_designers add constraint travel_designers_group_readiness_values
  check (group_trips_readiness is null or group_trips_readiness in (
    'Sì, sono pronti', 'Sì, ma da definire', 'No, non ancora'
  ));

alter table travel_designers add constraint travel_designers_group_timing_values
  check (group_trips_timing is null or group_trips_timing in (
    'Entro il 2026', 'Nel 2027'
  ));
