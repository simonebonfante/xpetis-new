-- XPETIS · 0034 · Parametri di testo in `app_config`
--
-- `app_config` nasce con `value numeric not null`: una riga, un numero. Regge
-- soglie, pesi e finestre temporali, cioè tutto quello che serviva finora.
--
-- Serve anche una riga di **testo**. Il caso che la porta è la nota sotto il
-- prezzo degli itinerari pronti — "volo non incluso • IVA inclusa" nel Figma
-- 261:1068 — e la decisione del 23 agosto è che quella riga **vale per tutti gli
-- itinerari di tutti i designer**: il form Vetrina TD non la raccoglie per riga e
-- non si tocca, quindi non è un dato del designer ma un parametro di prodotto. E
-- i parametri di prodotto vivono qui, modificabili da Studio senza deploy.
--
-- Non è una riga decorativa: dice cosa comprende un prezzo. Metterla nel codice
-- avrebbe voluto dire che cambiare una promessa commerciale richiede un deploy.
--
-- ## Una colonna nuova, non un cambio di tipo
--
-- La strada breve sarebbe stata `value text` e via. È scartata: i parametri
-- numerici sono letti da SQL che fa aritmetica (`match_designers` li pesa,
-- i timer ci sommano ore) e un `numeric` che diventa `text` sposta il controllo
-- dal database a chi scrive la query. Una riga sbagliata smetterebbe di fallire
-- all'inserimento per fallire in un cast, dentro un workflow, di notte.
--
-- Quindi due colonne e un vincolo: **una riga porta un numero o un testo, mai
-- entrambi e mai nessuno dei due.** Chi legge sa dove guardare dal gruppo, e chi
-- scrive da Studio non può creare una riga a metà.

alter table app_config add column value_text text;

alter table app_config alter column value drop not null;

-- `<>` fra due booleani è lo XOR: esattamente uno dei due campi è pieno.
alter table app_config add constraint app_config_value_xor
  check ((value is null) <> (value_text is null));

comment on column app_config.value is
  'Il valore quando il parametro è un numero. Nullo sulle righe di testo.';
comment on column app_config.value_text is
  'Il valore quando il parametro è un testo. Nullo sulle righe numeriche. '
  'Il vincolo app_config_value_xor impedisce le righe a metà.';

-- --------------------------------------------------------------------------
-- La superficie pubblica.
--
-- `public_config` esponeva solo `booking_rules`: la 0018 le aveva tolto
-- `matching` quando il match è passato lato server, e quella porta resta chiusa —
-- i pesi degli assi e le soglie del punteggio non devono uscire.
--
-- Si aggiunge il gruppo `showcase`: sono le stringhe che il sito pubblico
-- stampa in pagina. Esporre un testo che il visitatore legge comunque non
-- concede niente a chi apre gli strumenti di sviluppo.
--
-- `drop view` porta via i privilegi: il `grant` in fondo non è una ripetizione.

drop view if exists public_config;

create view public_config as
  select key, value, value_text, config_group, label_it
    from app_config
   where config_group in ('booking_rules', 'showcase');

comment on view public_config is
  'I parametri che il sito pubblico può leggere: regole di prenotazione e '
  'stringhe di vetrina. Fuori restano `matching` (pesi e soglie del punteggio), '
  '`orders` e `reviews`, che sono operativi.';

grant select on public_config to anon, authenticated;
