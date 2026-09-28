-- XPETIS · 0049 · Il quiz: testi, ordine, e il verso degli assi
--
-- Fonte: `xpetis_quiz_viaggiatore_.json` (schema 1.0), il quiz del viaggiatore
-- con le sei domande e le risposte scritte. Porta tre cose:
--
--   1. **I testi.** La domanda di ogni asse va in `quiz_axes.question_it`, che
--      era vuota su tutti e sei; le risposte in una colonna nuova,
--      `quiz_axis_options.answer_it`. Al posto dei "DA SCRIVERE" e
--      dell'etichetta interna dell'asse, in pagina arrivano le parole vere.
--   2. **L'ordine.** Controllo, ritmo, scomodità, luogo, sociale, con chi.
--      "Con chi viaggi" passa dalla terza alla sesta posizione.
--   3. **Niente cambia di verso.** Nessun codice di asse, nessun valore, nessun
--      estremo (`label_min` / `label_max`) si tocca.
--
-- Perché una colonna nuova e non `label_it`
-- ------------------------------------------
-- Su "con chi viaggi" `label_it` è una **chiave**: sono le stringhe del form
-- Vetrina TD (`CONCHI`) che arrivano nei JSON dei 25 designer, e l'import le
-- riconosce carattere per carattere. Il quiz invece mostra al viaggiatore
-- parole diverse ("Da solo/a" per "Viaggiatore solo"). Scriverle in
-- `label_it` avrebbe rotto l'import in silenzio, su un dato che non torna
-- indietro. Il file lo sa e porta per ogni opzione il campo `td_value_match`:
-- è su quello che si aggancia il testo, non sulla posizione.
--
-- Verificato il 27 settembre 2026, byte per byte: le cinque `td_value_match`
-- del quiz, le cinque `CONCHI` del form, le cinque `label_it` del database e le
-- voci di `vetrina_nuova.json` (chiave `assi.conChi`) combaciano. Sui cinque
-- assi continui il form manda numeri 1-4, non etichette: lì `label_it` non è
-- una chiave, ma per uniformità il testo del quiz va comunque in `answer_it`.
--
-- Il verso, opzione per opzione
-- -----------------------------
-- Sui cinque assi continui la risposta si aggancia al **campo `score`** del
-- file, non alla sua posizione nell'array. Il file dichiara che il polo 1 è
-- sempre il valore più basso dell'asse lato designer; confrontato a mano con
-- `label_min` / `label_max`, regge su tutte e venti le risposte:
--
--   controllo   1 "Voglio decidere io…"          → Poco controllo (del TD)
--               4 "Pensateci voi…"               → Molto controllo (del TD)
--   ritmo       1 "Lento…"                       → Slow
--               4 "Intenso…"                     → Dynamic
--   scomodità   1 "…l'alternativa più comoda"    → Comfort
--               4 "…la fatica fa parte…"         → Wild
--   luogo       1 "…quasi da cartolina"          → Estetica curata
--               4 "Un luogo vero, anche grezzo…" → Vita reale
--   sociale     1 "Voglio stare con me stesso…"  → Intimità
--               4 "Adoro incontrare persone…"    → Socialità
--
-- ⚠️ Il primo asse è quello da tenere d'occhio: il codice si chiama
-- `planning_involvement` ("coinvolgimento nella pianificazione"), ma il valore
-- 1 è il viaggiatore che vuole decidere di più. Il verso è quello del
-- **designer** ("Poco controllo" del TD), come dice il file. Il nome del codice
-- si legge al contrario: vale la regola di sempre, il verso sta in
-- `label_min` / `label_max`.
--
-- Le risposte già salvate
-- -----------------------
-- `quiz_responses.answers` è `{ codice_asse: valore }`. Codici e valori non
-- cambiano, quindi ogni risposta già salvata resta leggibile e significa quello
-- che significava: cambia il testo che la racconta, non il dato. (Sul database
-- di sviluppo, il 27 settembre, ce n'è una sola: tutti gli assi a 1.)

alter table quiz_axis_options add column answer_it text;

comment on column quiz_axis_options.answer_it is
  'La risposta come la legge il viaggiatore nel quiz. Non è una chiave: su '
  '"con chi viaggi" la chiave che combacia col form Vetrina TD è label_it.';
comment on column quiz_axis_options.label_it is
  'Etichetta corta. Su "con chi viaggi" è la stringa esatta del form Vetrina TD '
  '(CONCHI): l''import la riconosce carattere per carattere, non va riscritta.';

-- ------------------------------------------------------ le domande e l'ordine

update quiz_axes a set question_it = v.question, sort_order = v.ord
  from (values
    ('planning_involvement', 1, 'Quanto vuoi essere coinvolto nella progettazione del viaggio?'),
    ('pace',                 2, 'Come vuoi che scorra il tuo tempo durante il viaggio?'),
    ('comfort_wild',         3, 'Se un''esperienza straordinaria richiede un po'' di fatica o disagio, tu...'),
    ('curated_vs_real',      4, 'Quale di queste immagini senti più tua?'),
    ('social_orientation',   5, 'In viaggio, cerchi più raccoglimento o connessione?'),
    ('companions',           6, 'Con chi vivrai questo viaggio?')
  ) as v(code, ord, question)
 where a.code = v.code;

-- ------------------------------------------- le risposte dei cinque assi continui
-- Il valore è lo `score` del file.

update quiz_axis_options o set answer_it = v.answer
  from (values
    ('planning_involvement', 1, 'Voglio decidere io, ho bisogno di un esperto che mi guidi'),
    ('planning_involvement', 2, 'Mi piace co-progettarlo, costruiamolo insieme!'),
    ('planning_involvement', 3, 'Voglio una proposta già pronta, poi la facciamo nostra insieme'),
    ('planning_involvement', 4, 'Pensateci voi, io voglio solo viverlo'),
    ('pace',                 1, 'Lento: poche cose, vissute a fondo'),
    ('pace',                 2, 'Disteso: clima rilassato con qualche esplorazione nei posti vicini'),
    ('pace',                 3, 'Vivace: ritmo energico e curioso ma senza frenesia'),
    ('pace',                 4, 'Intenso: voglio fare e vedere il più possibile'),
    ('comfort_wild',         1, 'Cerco sempre l''alternativa più comoda'),
    ('comfort_wild',         2, 'Valuto caso per caso, dipende da quanto ne vale la pena'),
    ('comfort_wild',         3, 'Ci sto, se è organizzata bene'),
    ('comfort_wild',         4, 'È proprio quello che voglio, la fatica fa parte del viaggio'),
    ('curated_vs_real',      1, 'Un paesaggio perfetto, quasi da cartolina'),
    ('curated_vs_real',      2, 'Un posto bellissimo ma autentico, fuori dai circuiti turistici'),
    ('curated_vs_real',      3, 'Un''atmosfera viva fatta di dettagli, non di effetti speciali'),
    ('curated_vs_real',      4, 'Un luogo vero, anche grezzo, dove senti la vita scorrere'),
    ('social_orientation',   1, 'Voglio stare con me stesso o con chi è con me in viaggio'),
    ('social_orientation',   2, 'Apprezzo i miei spazi, ma non mi dispiace qualche incontro'),
    ('social_orientation',   3, 'Mi piace aprirmi, a modo mio e con i miei tempi'),
    ('social_orientation',   4, 'Adoro incontrare persone e raccogliere le loro storie')
  ) as v(code, value, answer)
 where o.axis_code = v.code and o.value = v.value;

-- --------------------------------------------------- le cinque di "con chi viaggi"
-- Agganciate alla chiave del form (`td_value_match` = `label_it`), non al numero.

update quiz_axis_options o set answer_it = v.answer
  from (values
    ('Viaggiatore solo',               'Da solo/a'),
    ('Coppia',                         'In coppia'),
    ('Famiglia con bambini/ragazzi',   'Famiglia con bambini/ragazzi'),
    ('Gruppo di amici/piccolo gruppo', 'Gruppo di amici / piccolo gruppo'),
    ('Gruppo organizzato',             'Gruppo organizzato con altri viaggiatori')
  ) as v(td_value_match, answer)
 where o.axis_code = 'companions' and o.label_it = v.td_value_match;

-- ---------------------------------------------------------------- la guardia
-- Su un database già popolato ogni opzione deve aver trovato il suo testo. Se
-- una chiave non ha agganciato (un `label_it` ritoccato a mano da Studio, un
-- valore che manca) ci si ferma: un'opzione muta nel quiz è una scelta che il
-- viaggiatore non può fare. Su un'installazione nuova le tabelle sono vuote,
-- i testi li porta il seed e la guardia non ha niente da guardare.

do $$
declare
  v_mute text;
begin
  select string_agg(axis_code || ':' || value, ', ' order by axis_code, value)
    into v_mute
    from quiz_axis_options
   where answer_it is null;
  if v_mute is not null then
    raise exception 'Quiz: opzioni senza testo dopo la 0049: %', v_mute;
  end if;
end $$;

-- ------------------------------------------------------------------ la vista
-- Stesse colonne della 0018: cambia solo cosa c'è dentro `options`, che ora
-- porta la risposta da leggere. La chiave del form resta dov'è, e al browser
-- non serve.

create or replace view public_quiz_axes as
  select a.code, a.kind, a.label_it, a.question_it, a.scale_min, a.scale_max,
         a.sort_order,
         coalesce((select jsonb_object_agg(o.value, coalesce(o.answer_it, o.label_it))
                     from quiz_axis_options o where o.axis_code = a.code), '{}'::jsonb) as options
    from quiz_axes a;
