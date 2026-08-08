-- XPETIS · 0003 · Tassonomie fisse e parametri configurabili
-- Tutti i parametri del matching vivono qui, non nel codice: si ritarano da
-- Supabase Studio senza deploy (sez. 2 del flusso).

-- I due filtri: 9 temi di viaggio, 8 contesti geografici dominanti.
create table tags (
  code       text primary key,
  kind       tag_kind not null,
  label_it   text not null,
  sort_order int not null default 0
);
create index tags_kind_idx on tags (kind, sort_order);

-- I 6 assi del quiz. Il peso è una colonna: cambiarlo è un UPDATE.
create table quiz_axes (
  code        text primary key,
  kind        axis_kind not null,
  label_it    text not null,
  question_it text,
  weight      numeric(5,2) not null default 1.0 check (weight >= 0),
  scale_min   smallint not null default 1,
  scale_max   smallint not null default 4,
  sort_order  int not null default 0,
  constraint quiz_axes_scale check (scale_max > scale_min)
);

create table quiz_axis_options (
  axis_code text not null references quiz_axes(code) on delete cascade,
  value     smallint not null,
  label_it  text not null,
  primary key (axis_code, value)
);

-- Parametri scalari di prodotto e di flusso. Un solo posto, tipo numerico,
-- modificabile a vista da Studio.
create table app_config (
  key          text primary key,
  value        numeric not null,
  config_group text not null,
  label_it     text not null,
  notes        text,
  updated_at   timestamptz not null default now()
);
create index app_config_group_idx on app_config (config_group, key);
