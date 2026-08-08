-- XPETIS · 0021 · Gli assi allineati al form
--
-- Il form Vetrina TD dichiara gli estremi di ogni asse (`ASSI_DEF`), sinistra =
-- valore minimo, destra = valore massimo:
--
--   controllo   Poco controllo   → Molto controllo
--   ritmo       Slow             → Dynamic
--   scomodita   Comfort          → Wild
--   luogo       Estetica curata  → Vita reale
--   sociale     Intimità         → Socialità
--
-- Il quarto era la trappola: il mio asse si chiamava `aesthetics`, che su scala
-- crescente si legge "più estetica", mentre nel form crescere significa MENO
-- estetica curata. Chi avesse scritto le etichette guardando il nome della
-- colonna le avrebbe messe al contrario, e nessuna prova tecnica lo avrebbe
-- visto: nel lavoro parallelo di Alessandro due assi su sei erano invertiti.
--
-- Da qui due cose: il nome diventa direzionale, e il verso smette di vivere
-- nella testa di chi legge e diventa un dato (`label_min` / `label_max`).

-- Le chiavi testuali si rinominano solo se le FK propagano.
alter table td_axis_values    drop constraint td_axis_values_axis_code_fkey;
alter table td_axis_values    add  constraint td_axis_values_axis_code_fkey
  foreign key (axis_code) references quiz_axes(code) on update cascade on delete cascade;

alter table quiz_axis_options drop constraint quiz_axis_options_axis_code_fkey;
alter table quiz_axis_options add  constraint quiz_axis_options_axis_code_fkey
  foreign key (axis_code) references quiz_axes(code) on update cascade on delete cascade;

alter table td_destination_tags drop constraint td_destination_tags_tag_code_fkey;
alter table td_destination_tags add  constraint td_destination_tags_tag_code_fkey
  foreign key (tag_code) references tags(code) on update cascade on delete cascade;

-- Il verso come dato, non come interpretazione.
alter table quiz_axes
  add column label_min text,
  add column label_max text;

comment on column quiz_axes.label_min is
  'Estremo sinistro dichiarato nel form Vetrina TD, corrispondente a scale_min. '
  'È qui che vive il verso dell''asse: non dedurlo dal nome della colonna.';
comment on column quiz_axes.label_max is
  'Estremo destro dichiarato nel form Vetrina TD, corrispondente a scale_max.';

-- --------------------------------------------------------------------------
-- Correzioni per un database già popolato. Su un'installazione nuova il seed
-- porta già i valori giusti e questi comandi non toccano niente.

update quiz_axes set code = 'curated_vs_real' where code = 'aesthetics';

update quiz_axes set
  label_min = v.lmin,
  label_max = v.lmax,
  label_it  = coalesce(v.label, quiz_axes.label_it)
  from (values
    ('planning_involvement', 'Poco controllo',  'Molto controllo', 'Coinvolgimento nella pianificazione'),
    ('pace',                 'Slow',            'Dynamic',         'Ritmo'),
    ('comfort_wild',         'Comfort',         'Wild',            'Comfort / Wild'),
    ('curated_vs_real',      'Estetica curata', 'Vita reale',      'Estetica curata / Vita reale'),
    ('social_orientation',   'Intimità',        'Socialità',       'Orientamento sociale')
  ) as v(code, lmin, lmax, label)
 where quiz_axes.code = v.code;

-- "Con chi viaggi" nel form ha cinque opzioni, non quattro.
update quiz_axes set scale_max = 5 where code = 'companions' and scale_max < 5;

delete from quiz_axis_options where axis_code = 'companions';

insert into quiz_axis_options (axis_code, value, label_it)
select 'companions', v.value, v.label
  from (values
    (1, 'Viaggiatore solo'),
    (2, 'Coppia'),
    (3, 'Famiglia con bambini/ragazzi'),
    (4, 'Gruppo di amici/piccolo gruppo'),
    (5, 'Gruppo organizzato')
  ) as v(value, label)
 where exists (select 1 from quiz_axes where code = 'companions')
on conflict (axis_code, value) do update set label_it = excluded.label_it;

-- Gli estremi valgono anche come etichette dei valori 1 e 4: i due valori
-- intermedi li scrive Gaia.
update quiz_axis_options o set label_it = a.label_min
  from quiz_axes a
 where a.code = o.axis_code and a.kind = 'continuous'
   and o.value = a.scale_min and o.label_it like 'DA SCRIVERE%';

update quiz_axis_options o set label_it = a.label_max
  from quiz_axes a
 where a.code = o.axis_code and a.kind = 'continuous'
   and o.value = a.scale_max and o.label_it like 'DA SCRIVERE%';

-- Il form scrive "Aree estreme/polari": se la nostra etichetta non combacia
-- carattere per carattere, quel tag non aggancia e si perde in silenzio.
update tags set label_it = 'Aree estreme/polari' where code = 'aree_estreme';
