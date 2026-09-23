-- XPETIS · 0043 · La cerniera del dopo-call: la posta esce davvero
--
-- La call finisce → la mail si compone → il viaggiatore clicca → nasce l'ordine.
-- È il primo pezzo che attraversa tutte e quattro le parti del sistema nello
-- stesso giro: l'orologio decide, Postgres compone, n8n consegna, una pagina a
-- token riceve il clic.
--
-- Tre cose cambiano qui dentro, e conviene tenerle distinte:
--
--   1. `outbound_messages` smette di essere un **registro** e diventa una
--      **coda**: porta il corpo composto, uno stato, e `sent_at` che si
--      valorizza solo alla consegna riuscita.
--   2. I testi delle mail escono dal codice e diventano **righe di database**
--      (`message_templates`), perché li riscrive Gaia e Gaia non apre un editor.
--   3. Le pagine a token, ferme dalla `0012`, vengono **usate**: un resolver che
--      dice *perché* un token non va bene, e la funzione che trasforma un clic
--      in un ordine `requested`.
--
-- ===========================================================================
-- PERCHÉ LA COMPOSIZIONE STA QUI E NON IN UNA ROUTE NEXT
-- ===========================================================================
-- Il precedente in `CLAUDE.md` dice l'opposto: i numeri del match in Postgres,
-- la composizione delle frasi nella route server. Quella regola nasce da un
-- fatto che qui non c'è — **le frasi del match si compongono per una pagina che
-- qualcuno sta guardando**, dentro una richiesta HTTP che esiste comunque.
--
-- Una mail no. La compone l'orologio, alle tre di notte, senza nessun browser
-- nel giro. Metterla in una route significherebbe far chiamare al database un
-- endpoint del nostro sito per ottenere una stringa: il sito entrerebbe nel
-- percorso della posta senza portare niente, e un deploy in corso diventerebbe
-- una mail non composta.
--
-- E c'è un secondo motivo, che vale di più: **l'harness prova Postgres**.
-- Composta qui, la mail si verifica; composta in TypeScript, la si guarda.
--
-- La consegna invece resta fuori, in n8n, ed è il confine opposto: comporre è
-- una stringa, consegnare è una chiamata a un servizio esterno che va
-- ritentata e guardata. Vedi `n8n/LEGGIMI.md`.
--
-- ===========================================================================
-- IL VINCOLO DI UNICITÀ FA DUE LAVORI, E IL SECONDO È NUOVO
-- ===========================================================================
-- `outbound_messages (message_kind, entity_type, entity_id, recipient)` è unico
-- dalla 0014, e serviva a non mandare due volte la stessa mail quando un timer
-- rigira. Da oggi è anche il **tetto di spesa**: il piano gratuito di Resend dà
-- 100 mail al giorno **condivise con la landing page**, e si bruciano in minuti
-- se qualcosa entra in ciclo. Una mail per tipo, entità e destinatario è
-- l'unica difesa che non dipende da nessuno che si ricordi di qualcosa.
--
-- Perciò: **ogni accodamento passa da `on conflict do nothing`**, mai da un
-- `insert` nudo. Il `not exists` che si legge nei rami è solo per non fare
-- lavoro inutile; la difesa è il vincolo.

-- ===========================================================================
-- PARTE A — I testi, che sono dati
-- ===========================================================================
-- Stessa regola di `app_config` applicata al contenuto: un testo dentro un
-- `.tsx` è una promessa commerciale che per cambiare richiede un deploy.
--
-- Non in `app_config` però, e la ragione non è estetica: `app_config` è
-- «una riga, un valore scalare», e il suo vincolo XOR fra `value` e
-- `value_text` esiste proprio per tenerla tale. Una mail ha un oggetto, un
-- corpo lungo, l'etichetta di un bottone e un elenco di segnaposto ammessi:
-- sono quattro campi correlati, cioè una tabella.
--
-- ## Due specie di riga
--
-- `mail` è una mail intera, e la sua chiave **è** il `message_kind` che finisce
-- in `outbound_messages`: da lì si risale sempre al testo che l'ha prodotta.
-- `blocco` è un pezzo che entra dentro una mail al posto di un segnaposto —
-- il bottone di un servizio, la firma — ed è il modo per non riscrivere la
-- stessa cosa in dieci mail.
--
-- ## Cosa può scrivere Gaia, e cosa no
--
-- Il corpo è **prosa**, non HTML: righe vuote separano i paragrafi, e basta.
-- L'impaginazione la mette la macchina (`testo_in_html`). È voluto: un tag
-- aperto e mai chiuso, scritto per sbaglio da Studio, arriverebbe a un cliente
-- vero, e nessuno se ne accorgerebbe prima di lui.
--
-- I segnaposto si scrivono `{{cosi}}`. Quelli non forniti **fanno fallire la
-- composizione** invece di finire in pagina: vedi `render_template`.
create table message_templates (
  -- Per le mail è il `message_kind`; per i blocchi un nome che comincia per
  -- `blocco_`. La chiave è il filo fra una riga di coda e il testo che l'ha
  -- generata.
  key             text primary key,
  template_kind   text not null check (template_kind in ('mail', 'blocco')),

  -- A chi parla. Serve a chi legge la tabella su Studio per sapere se quel tono
  -- è per un viaggiatore o per un designer, e non ha nessun effetto tecnico.
  audience        token_audience,

  subject_it      text,
  body_it         text not null check (length(btrim(body_it)) > 0),

  -- L'etichetta del bottone, quando il blocco ne ha uno. Sta qui e non dentro
  -- il corpo perché un bottone non è prosa: è una cosa che la macchina
  -- costruisce, e l'unica parte che si scrive a mano è cosa c'è scritto sopra.
  button_label_it text,

  -- I segnaposto che questo testo può usare. **Non è un vincolo**: è la
  -- documentazione dove serve, cioè accanto al testo, per chi lo riscrive da
  -- Studio senza aver letto questa migration.
  placeholders    text[] not null default '{}',

  notes           text,
  updated_at      timestamptz not null default now(),

  constraint message_templates_mail_ha_oggetto check (
    (template_kind = 'mail'   and subject_it is not null and length(btrim(subject_it)) > 0)
    or
    (template_kind = 'blocco' and subject_it is null)),

  -- Un bottone su una mail intera non saprebbe dove mettersi: i bottoni entrano
  -- dai blocchi.
  constraint message_templates_bottone_solo_sui_blocchi check (
    button_label_it is null or template_kind = 'blocco')
);

create trigger message_templates_touch before update on message_templates
  for each row execute function set_updated_at();

comment on table message_templates is
  'I testi delle mail, uno per riga, modificabili da Studio senza deploy. '
  'Il corpo è prosa con segnaposto {{cosi}}: l''impaginazione la mette '
  'testo_in_html(), perché un tag scritto a mano arriverebbe a un cliente vero.';
comment on column message_templates.key is
  'Per le righe `mail` è il message_kind che finisce in outbound_messages: da una '
  'riga di coda si risale sempre al testo che l''ha prodotta.';
comment on column message_templates.placeholders is
  'I segnaposto ammessi, come documentazione per chi riscrive il testo. Non è un '
  'vincolo: il controllo vero è che un segnaposto non fornito fa fallire la '
  'composizione invece di finire in pagina.';

-- Ogni tabella nuova nasce con RLS accesa e i privilegi revocati a mano: su
-- Supabase i default concedono le tabelle create dopo, e la revoca della 0016
-- non si eredita. Qui in più **non c'è nessuna vista `public_*` e non ci deve
-- essere**: un testo in bozza non è materiale da servire al browser di chiunque.
alter table message_templates enable row level security;
revoke all on message_templates from anon, authenticated;

-- ===========================================================================
-- PARTE B — Da registro a coda
-- ===========================================================================
-- `outbound_messages` nasceva (0014) come diario di cosa era partito: `sent_at`
-- con default `now()`, nessun corpo. Diventa la coda, e le tre conseguenze sono
-- tutte volute:
--
--  · **il corpo si conserva**. È l'unico modo perché Gaia corregga le mail
--    leggendole come le leggerà un cliente, sul vero e non su un documento;
--  · **`sent_at` smette di avere un default**. Una riga che dice di essere
--    partita quando nessuno l'ha mandata è peggio di una riga assente: è una
--    bugia che nessuno va a controllare;
--  · **una riga fallita resta lì**, col suo errore, invece di sparire.
create type message_status as enum ('queued', 'sent', 'failed');

alter table outbound_messages
  add column status              message_status not null default 'queued',
  add column subject_rendered_at timestamptz,
  add column body_text           text,
  add column body_html           text,
  add column provider            text not null default 'resend',
  add column provider_message_id text,
  -- Dove è andata davvero. Di norma è `recipient`; differisce quando
  -- `app_config.email_redirect_to` è valorizzato, cioè durante le prove.
  add column delivered_to        text,
  add column attempts            smallint not null default 0,
  add column last_attempt_at     timestamptz,
  add column last_error          text,
  add column queued_at           timestamptz not null default now();

alter table outbound_messages alter column sent_at drop not null;
alter table outbound_messages alter column sent_at drop default;

-- ⚠️ **Le righe che c'erano già.** `status` nasce con default `queued`, quindi
-- senza questa riga tutto lo storico del registro diventerebbe posta da
-- spedire. Sono poche e sono di prova, ma il giorno che non lo fossero questa
-- migration manderebbe mail vecchie di mesi a gente vera.
update outbound_messages set status = 'sent' where sent_at is not null;

alter table outbound_messages add constraint outbound_messages_sent_coerente check (
  (status = 'sent' and sent_at is not null)
  or
  (status <> 'sent' and sent_at is null));

create index outbound_messages_queue_idx on outbound_messages (queued_at)
  where status = 'queued';

comment on column outbound_messages.sent_at is
  'Quando il provider ha accettato la mail. **Nullo finché non è partita**: dalla '
  '0043 non ha più default, perché una riga che dichiara di essere partita senza '
  'esserlo è una bugia che nessuno va a controllare.';
comment on column outbound_messages.provider_message_id is
  'L''identificativo che restituisce Resend. È il filo con cui si cerca una mail '
  'nel loro pannello quando qualcuno dice "non mi è arrivata".';
comment on column outbound_messages.delivered_to is
  'Dove è andata davvero: di norma uguale a recipient, diverso quando '
  'app_config.email_redirect_to dirotta la posta durante le prove.';

-- ===========================================================================
-- PARTE C — Comporre
-- ===========================================================================
-- Tre funzioni piccole invece di una grande, perché ognuna ha una sola cosa da
-- sbagliare.

create or replace function html_escape(p_testo text)
returns text language sql immutable strict as $$
  select replace(replace(replace(replace(replace(
           p_testo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
$$;

comment on function html_escape(text) is
  'L''ampersand per primo, altrimenti si riscrivono le entità appena prodotte.';

-- Da prosa a HTML: righe vuote separano i paragrafi, un a capo singolo è un
-- `<br>`. Nient'altro, di proposito.
--
-- **Un paragrafo che contiene soltanto un segnaposto di blocco viene sostituito
-- dal blocco, senza involucro.** È la regola che rende impossibile il difetto
-- classico di questi impaginatori: un bottone dentro un `<p>`, che in metà dei
-- client di posta si stampa storto. Chi scrive il testo non deve saperlo: deve
-- solo lasciare il segnaposto da solo sulla sua riga, che è come verrebbe
-- naturale scriverlo.
create or replace function testo_in_html(p_testo text, p_blocchi jsonb default '{}'::jsonb)
returns text language plpgsql immutable as $$
declare
  v_out  text := '';
  v_par  text;
  v_nome text;
begin
  for v_par in
    select btrim(t.par) from regexp_split_to_table(coalesce(p_testo, ''), E'\n[ \t]*\n') as t(par)
  loop
    continue when v_par = '';

    v_nome := (regexp_match(v_par, '^\{\{([a-z0-9_]+)\}\}$'))[1];
    if v_nome is not null and p_blocchi ? v_nome then
      v_out := v_out || (p_blocchi ->> v_nome);
    else
      -- Un indirizzo scritto in chiaro dentro la prosa diventa un link. È
      -- l'unica trasformazione oltre ai paragrafi, e c'è perché l'alternativa
      -- sarebbe chiedere a chi scrive di annegare un `<a href>` in mezzo a una
      -- frase. L'escape è già passato, quindi qui non si può introdurre un tag:
      -- si riconosce solo `http(s)://` fino al primo spazio.
      v_out := v_out
            || '<p style="margin:0 0 18px;font-size:16px;line-height:1.55">'
            || regexp_replace(replace(v_par, E'\n', '<br>'),
                              '(https?://[^\s<]+)',
                              '<a href="\1" style="color:#E53619">\1</a>', 'g')
            || '</p>' || E'\n';
    end if;
  end loop;

  return v_out;
end $$;

comment on function testo_in_html(text, jsonb) is
  'Prosa → HTML. Un paragrafo fatto solo da {{segnaposto}} di blocco esce senza '
  'involucro: è così che un bottone non finisce dentro un <p>.';

create or replace function bottone_html(p_label text, p_url text)
returns text language sql immutable as $$
  select '<p style="margin:0 0 24px"><a href="' || html_escape(p_url)
      || '" style="display:inline-block;background:#E53619;color:#ffffff;'
      || 'text-decoration:none;font-weight:700;font-size:16px;'
      || 'padding:14px 24px;border-radius:999px">'
      || html_escape(p_label) || '</a></p>' || E'\n'
$$;

-- L'involucro del documento. Sta nel codice e **non** in `message_templates`
-- di proposito: non è contenuto, è struttura, e chiedere a Gaia di manutenere
-- un `<!doctype>` sarebbe il contrario esatto di quello che questa tabella
-- serve a ottenere. Il contenuto dell'involucro — la firma, il numero WhatsApp
-- — è invece un blocco, quindi si riscrive da Studio.
--
-- Palette dal Figma (deviazione 8 del PIANO): crema, nero, primario rosso. I
-- font del sito non esistono nella posta e non si caricano: stack di sistema.
create or replace function email_document(p_corpo_html text, p_preheader text default null)
returns text language sql immutable as $$
  select '<!doctype html><html lang="it"><head><meta charset="utf-8">'
      || '<meta name="viewport" content="width=device-width,initial-scale=1">'
      || '<meta name="color-scheme" content="light only">'
      || '</head><body style="margin:0;padding:0;background:#F0EEDF;color:#1C1C1A;'
      || 'font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif">'
      -- L'anteprima che i client di posta mostrano accanto all'oggetto. Se non
      -- gliela si dà, la prendono dalla prima riga del corpo.
      || coalesce('<div style="display:none;max-height:0;overflow:hidden;opacity:0">'
                  || html_escape(p_preheader) || '</div>', '')
      || '<div style="max-width:560px;margin:0 auto;padding:32px 20px">'
      || '<div style="font-weight:700;letter-spacing:.18em;font-size:12px;'
      || 'text-transform:uppercase;margin:0 0 28px">XPETIS</div>'
      || p_corpo_html
      || '</div></body></html>'
$$;

-- Comporre un testo: sostituisce i segnaposto e restituisce le tre forme che
-- servono (oggetto, testo semplice, HTML) più l'etichetta del bottone.
--
-- ## Perché un segnaposto non fornito fa fallire
--
-- L'alternativa — lasciarlo in pagina, o sostituirlo col vuoto — produce mail
-- che arrivano a un cliente con scritto `{{designer}}`, oppure «Ciao ,». Sono
-- due modi di rompersi che nessuno vede finché non li vede il destinatario.
-- Fallire invece scrive un alert al team e non manda niente: è il ramo spento
-- che si dichiara, come nella 0042.
--
-- ## Le due forme e il doppio giro di escape
--
-- L'HTML si costruisce **escapando prima la prosa e poi ogni valore**: così un
-- designer che si chiama «Rossi & Co» non apre un tag, e un `<` scritto per
-- sbaglio nel testo si stampa invece di sparire. I `{{` non contengono niente
-- da escapare, quindi sopravvivono al primo passaggio e si sostituiscono dopo.
create or replace function render_template(
  p_key           text,
  p_valori        jsonb default '{}'::jsonb,
  p_blocchi_html  jsonb default '{}'::jsonb,
  p_blocchi_testo jsonb default '{}'::jsonb)
returns table (subject text, body_text text, body_html text, button_label text)
language plpgsql stable set search_path = public as $$
declare
  t      message_templates;
  v_sub  text;
  v_txt  text;
  v_htm  text;
  v_lab  text;
  k      text;
  v      text;
  v_orfano text;
begin
  select * into t from message_templates where key = p_key;
  if not found then
    raise exception 'Testo "%" non trovato in message_templates', p_key;
  end if;

  v_sub := coalesce(t.subject_it, '');
  v_lab := coalesce(t.button_label_it, '');
  v_txt := t.body_it;
  v_htm := html_escape(t.body_it);

  for k, v in select key, value from jsonb_each_text(p_valori) loop
    v_sub := replace(v_sub, '{{' || k || '}}', coalesce(v, ''));
    v_lab := replace(v_lab, '{{' || k || '}}', coalesce(v, ''));
    v_txt := replace(v_txt, '{{' || k || '}}', coalesce(v, ''));
    v_htm := replace(v_htm, '{{' || k || '}}', html_escape(coalesce(v, '')));
  end loop;

  for k, v in select key, value from jsonb_each_text(p_blocchi_testo) loop
    v_txt := replace(v_txt, '{{' || k || '}}', coalesce(v, ''));
  end loop;

  -- I blocchi HTML entrano durante l'impaginazione, non prima: devono stare su
  -- un paragrafo loro e non dentro un `<p>`.
  v_htm := testo_in_html(v_htm, p_blocchi_html);

  -- Il controllo si fa su testo, oggetto ed etichetta, che non sono impaginati
  -- e quindi portano ancora i segnaposto rimasti così come sono.
  v_orfano := (regexp_match(v_sub || E'\n' || v_lab || E'\n' || v_txt, '\{\{([a-z0-9_]+)\}\}'))[1];
  if v_orfano is not null then
    raise exception 'Segnaposto {{%}} non fornito per il testo "%"', v_orfano, p_key;
  end if;

  subject      := btrim(v_sub);
  body_text    := btrim(v_txt);
  body_html    := v_htm;
  button_label := nullif(btrim(v_lab), '');
  return next;
end $$;

comment on function render_template(text, jsonb, jsonb, jsonb) is
  'Compone un testo di message_templates. Un segnaposto non fornito solleva '
  'invece di finire in pagina: «Ciao ,» e «{{designer}}» sono due modi di '
  'rompersi che vede solo il destinatario.';

-- L'accodamento, in un posto solo. Tutti i rami passano di qui, e qui c'è il
-- `on conflict do nothing` che è insieme la difesa contro il doppio invio e il
-- tetto di spesa.
create or replace function accoda_messaggio(
  p_kind        text,
  p_entity_type text,
  p_entity_id   uuid,
  p_recipient   text,
  p_subject     text,
  p_body_text   text,
  p_body_html   text)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- Un destinatario vuoto non è una mail da mandare: è una riga rotta, e
  -- accodarla significherebbe consegnare a n8n un compito che prenderà 400.
  if p_recipient is null or btrim(p_recipient) = '' or position('@' in p_recipient) = 0 then
    return null;
  end if;

  insert into outbound_messages (message_kind, channel, entity_type, entity_id, recipient,
                                 subject, body_text, body_html, status, subject_rendered_at)
  values (p_kind, 'email', p_entity_type, p_entity_id, btrim(p_recipient),
          p_subject, p_body_text, p_body_html, 'queued', now())
  on conflict (message_kind, entity_type, entity_id, recipient) do nothing
  returning id into v_id;

  return v_id;   -- nullo se c'era già: non è un errore, è il vincolo che lavora
end $$;

revoke all on function accoda_messaggio(text, text, uuid, text, text, text, text) from public;

-- ===========================================================================
-- PARTE D — Le pagine a token, finalmente usate
-- ===========================================================================
--
-- ## Un token è una credenziale, e questi non scadono mai
--
-- `expires_at` nullo sui bottoni post-call è **voluto** (Flusso §6: «i bottoni
-- non scadono mai»), e va guardato in faccia: quel link vive per sempre in una
-- casella inoltrabile, sincronizzata su tre dispositivi, e a volte girata a un
-- collega «guarda che bello».
--
-- **Cosa può fare chi se lo trova.** Creare un ordine `requested` a nome di quel
-- viaggiatore, su quel designer, per quel servizio. Non impegna un euro:
-- nessun pagamento parte, nessun prezzo esiste ancora, e dall'altra parte c'è
-- una persona del team che apre un gruppo WhatsApp. Il danno massimo è far
-- lavorare a vuoto il team una volta — e l'ordine porta scritto `traveler`
-- come attore, con il token nel diario, quindi si riconosce e si cancella.
--
-- **La cosa che vale di più non è l'ordine: è quello che la pagina racconta.**
-- Chi ha il link sa che quella persona ha fatto una consulenza con quel
-- designer. Per questo la pagina mostra il minimo che serve a decidere — il
-- nome del designer e il servizio — e **non** il cognome del viaggiatore, il suo
-- telefono, la sua domanda di contesto o il profilo quiz.
--
-- **La regola che ne discende, e che vale per le milestone 6 e 7.** Un bottone
-- che crea una richiesta da lavorare e uno che impegna dei soldi non meritano
-- la stessa fiducia: dietro un token permanente non ci va **mai** un'azione che
-- muove denaro o che consegna un file. Il pagamento di una proposta passa da
-- una cassa che ridichiara l'importo; la conferma dell'agenzia, che sblocca una
-- cascata, nascerà `single_use` e con una scadenza.
--
-- ## Il token, un servizio: perché l'indice della 0012 va rifatto
--
-- La 0012 dà per scontato **un token attivo per scopo su ogni entità**. La mail
-- post-call rompe quell'assunto: porta un bottone per ogni servizio attivo di
-- quel designer, e ogni bottone è un token diverso perché il servizio sta nel
-- `payload` — non in un parametro della richiesta, che sarebbe modificabile da
-- chi clicca.
--
-- L'indice diventa quindi «un token attivo per scopo, entità **e servizio**».
-- Sui token che non portano un servizio nel payload il comportamento non cambia
-- di una virgola: `coalesce(..., '')` li raccoglie tutti sotto la stessa chiave,
-- come prima.
drop index if exists access_tokens_one_active_per_purpose;
create unique index access_tokens_one_active_per_purpose
  on access_tokens (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
  where revoked_at is null;

comment on index access_tokens_one_active_per_purpose is
  'Un token attivo per scopo, entità e servizio. Il servizio entra dalla 0043: '
  'la mail post-call porta un bottone per servizio, e il servizio sta nel '
  'payload del token e non in un parametro della richiesta.';

-- --------------------------------------------------------------------------
-- I token inventati, contati invece che ignorati
-- --------------------------------------------------------------------------
-- Stessa forma di `calcom_signature_rejections` (0042), e per la stessa
-- ragione: l'indirizzo di una pagina token è pubblico, e un diario di ogni
-- tentativo ne farebbe una discarica scrivibile da chiunque. Si tiene un
-- **contatore**, una riga per ora, e l'orologio decide quando è troppo.
--
-- Serve perché la risposta generica che diamo a un token inesistente è l'unica
-- difesa che abbiamo, e una difesa senza un testimone non si sa se ha mai
-- lavorato. Con 32 caratteri casuali indovinarne uno non succede: se il
-- contatore sale, qualcuno sta provando, e vogliamo saperlo il giorno stesso.
create table access_token_misses (
  bucket_at timestamptz primary key,
  n         integer not null default 0 check (n >= 0),
  first_at  timestamptz not null default now(),
  last_at   timestamptz not null default now()
);
create index access_token_misses_recent on access_token_misses (last_at desc);

comment on table access_token_misses is
  'Quanti token inesistenti sono stati presentati, per ora. Un contatore e non '
  'un diario: il token presentato non si conserva — sarebbe conservare un '
  'tentativo di indovinare una credenziale, per scriverlo poi da qualche parte.';

alter table access_token_misses enable row level security;
revoke all on access_token_misses from anon, authenticated;

-- --------------------------------------------------------------------------
-- Cinque risposte, non una
-- --------------------------------------------------------------------------
-- `resolve_access_token()` (0012) dice soltanto sì o no: restituisce zero righe
-- per un token inesistente, scaduto, revocato o monouso già usato. Per una
-- funzione che deve solo decidere se procedere va benissimo; per una **pagina**
-- no, perché chi ha un token scaduto è una persona legittima con un link
-- vecchio e merita di sapere cosa fare, mentre chi ne ha uno inventato no.
--
-- ## Dove passa la linea, scritta
--
-- **Un token che non esiste riceve una risposta generica.** Un token che
-- esiste — scaduto, revocato, già usato — riceve la risposta onesta.
--
-- Il ragionamento: per leggere una risposta onesta bisogna già possedere un
-- token vero, cioè aver avuto il link. A chi prova stringhe a caso questa
-- funzione dice sempre e solo «non va bene», quindi non è un oracolo: non
-- distingue «quasi giusto» da «sbagliatissimo», non dice a quale entità
-- punterebbe, e non conferma mai l'esistenza di niente. In cambio, la persona
-- che ha davvero in mano un link vecchio non si trova davanti a un muro.
--
-- E il tentativo a vuoto **si conta**, così la linea ha un testimone.
--
-- ## L'effetto collaterale che c'era già
--
-- Come la 0012: risolvere un token **scrive** (`use_count`, `last_seen_at`).
-- Chi la chiama la chiama **una volta per richiesta**, e chi legge una pagina
-- token due volte conta due usi — anche se la seconda volta è stato lo scanner
-- antivirus del suo datore di lavoro. È telemetria, non un limite: nessun
-- automatismo decide niente su `use_count`.
create or replace function resolve_access_token_detail(p_token text)
returns table (
  esito      text,
  token      text,
  purpose    token_purpose,
  audience   token_audience,
  booking_id uuid,
  order_id   uuid,
  td_id      uuid,
  agency_id  uuid,
  payload    jsonb,
  expires_at timestamptz,
  used_at    timestamptz,
  revoked_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare
  t access_tokens;
begin
  if p_token is null or btrim(p_token) = '' then
    esito := 'inesistente';
    return next;
    return;
  end if;

  select * into t from access_tokens a where a.token = p_token;

  if not found then
    -- Il token presentato **non si scrive da nessuna parte**: sarebbe
    -- conservare il tentativo di indovinare una credenziale. Si conta e basta,
    -- e il conteggio non può far fallire la risposta.
    begin
      insert into access_token_misses (bucket_at, n, first_at, last_at)
      values (date_trunc('hour', now()), 1, now(), now())
      on conflict (bucket_at) do update
        set n = access_token_misses.n + 1, last_at = now();
    exception when others then
      null;
    end;

    esito := 'inesistente';
    return next;
    return;
  end if;

  if t.revoked_at is not null then
    esito := 'revocato';
  elsif t.expires_at is not null and t.expires_at <= now() then
    esito := 'scaduto';
  elsif t.single_use and t.used_at is not null then
    esito := 'gia_usato';
  else
    esito := 'valido';
    update access_tokens a
       set use_count = a.use_count + 1, last_seen_at = now()
     where a.token = t.token;
  end if;

  token      := t.token;
  purpose    := t.purpose;
  audience   := t.audience;
  booking_id := t.booking_id;
  order_id   := t.order_id;
  td_id      := t.td_id;
  agency_id  := t.agency_id;
  payload    := t.payload;
  expires_at := t.expires_at;
  used_at    := t.used_at;
  revoked_at := t.revoked_at;
  return next;
end $$;

comment on function resolve_access_token_detail(text) is
  'Il resolver delle pagine token: dice anche PERCHÉ un token non va bene — '
  'inesistente, scaduto, revocato, già usato — perché chi ha un link vecchio è '
  'una persona legittima. Un token inesistente riceve solo la risposta generica, '
  'e viene contato in access_token_misses.';

-- La 0012 resta, ma smette di avere una logica sua: **due copie della stessa
-- regola sono il modo in cui due copie divergono.** Da qui in poi è un
-- involucro sottile sopra il resolver dettagliato.
create or replace function resolve_access_token(p_token text)
returns table (
  token      text,
  purpose    token_purpose,
  audience   token_audience,
  booking_id uuid,
  order_id   uuid,
  td_id      uuid,
  agency_id  uuid,
  payload    jsonb)
language sql volatile security definer set search_path = public as $$
  select d.token, d.purpose, d.audience, d.booking_id, d.order_id,
         d.td_id, d.agency_id, d.payload
    from resolve_access_token_detail(p_token) d
   where d.esito = 'valido'
$$;

-- --------------------------------------------------------------------------
-- Un clic, un ordine
-- --------------------------------------------------------------------------
-- La pagina **non decide** se l'azione è lecita: chiede, e riporta la risposta.
-- Le regole stanno qui, dove l'harness le prova e dove valgono anche se domani
-- il clic arrivasse da un'altra porta.
--
-- ## L'attribuzione viene dal token, mai dalla richiesta
--
-- Il servizio sta in `payload.service_type`, il viaggiatore e il designer si
-- leggono dalla prenotazione a cui il token punta. **Questa funzione non
-- accetta nessun altro parametro**, e non è un dettaglio di stile: se il
-- servizio arrivasse dalla richiesta, chi ha in mano il link del servizio da
-- 200 € potrebbe chiederne uno da 2.000.
--
-- ## Cliccare due volte
--
-- Il doppio clic, il tasto indietro, il link aperto su due dispositivi: sono
-- casi normali, non attacchi. L'indice `orders_one_per_booking_service` li rende
-- innocui a livello di database, e la funzione li racconta con `gia_richiesto`
-- invece che con un errore — la pagina mostra lo stesso stato «l'abbiamo
-- ricevuta», che è la verità.
--
-- L'indice esclude gli ordini cancellati di proposito: se una richiesta viene
-- annullata, quel bottone deve tornare a funzionare.
create unique index orders_one_per_booking_service
  on orders (source_booking_id, service_type)
  where source_booking_id is not null and status <> 'cancelled';

comment on index orders_one_per_booking_service is
  'Un ordine aperto per call e servizio: il doppio clic sul bottone della mail '
  'post-call non crea due richieste. Gli annullati restano fuori, così un '
  'bottone torna a funzionare dopo una cancellazione.';

create or replace function create_order_from_token(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  d           record;
  b           record;
  v_servizio  service_type;
  v_ordine    orders;
  v_esistente orders;
begin
  select * into d from resolve_access_token_detail(p_token);

  if d.esito is distinct from 'valido' then
    return jsonb_build_object('ok', false, 'esito', d.esito);
  end if;

  if d.purpose <> 'traveler_service_request' or d.audience <> 'traveler' then
    return jsonb_build_object('ok', false, 'esito', 'token_di_altro_tipo');
  end if;

  -- Il servizio: dal payload, e deve essere uno dei due ordinabili. Il vincolo
  -- su `orders.service_type` lo direbbe comunque, ma lo direbbe con un errore
  -- di database invece che con una risposta.
  begin
    v_servizio := (d.payload ->> 'service_type')::service_type;
  exception when others then
    v_servizio := null;
  end;

  if v_servizio is null or v_servizio not in ('custom_itinerary', 'all_inclusive') then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_ordinabile');
  end if;

  select b2.id, b2.status, b2.traveler_id, b2.td_id, b2.starts_at, b2.price_cents,
         td.display_name as td_name, td.slug as td_slug
    into b
    from bookings b2
    join travel_designers td on td.id = b2.td_id
   where b2.id = d.booking_id;

  if not found then
    return jsonb_build_object('ok', false, 'esito', 'prenotazione_sconosciuta');
  end if;

  -- ------------------------------------------------- l'entità cambiata di stato
  -- La quinta risposta: il token è perfettamente valido ma la call non è più
  -- una call da cui possa nascere un ordine. Succede davvero, perché i bottoni
  -- non scadono mai: uno si clicca a tre mesi, e nel frattempo quella
  -- consulenza è finita in disputa o è stata segnata come no-show.
  if b.status not in ('confirmed', 'completed') then
    return jsonb_build_object('ok', false, 'esito', 'call_in_stato_non_ammesso',
                              'stato', b.status);
  end if;

  -- ⚠️ **Prima si guarda se la richiesta c'è già, poi se il servizio è ancora
  -- attivo**, e l'ordine conta. Se il designer spegne un servizio mentre una
  -- richiesta è in lavorazione, a chi ricarica la pagina va detto «l'abbiamo
  -- ricevuta» e non «non è più disponibile»: la sua richiesta esiste davvero e
  -- qualcuno ci sta lavorando. È anche la ragione per cui `service_request_page`
  -- fa i due controlli nello stesso ordine — due giudici che rispondono diverso
  -- sono il difetto che quella funzione esiste per non avere.
  select * into v_esistente from orders o
   where o.source_booking_id = b.id and o.service_type = v_servizio and o.status <> 'cancelled'
   limit 1;

  if found then
    return jsonb_build_object('ok', true, 'esito', 'gia_richiesto',
                              'order_id', v_esistente.id,
                              'human_ref', v_esistente.human_ref,
                              'service_type', v_servizio,
                              'td_name', b.td_name);
  end if;

  -- Il designer potrebbe aver spento quel servizio dopo che la mail è partita.
  -- Con token che non scadono mai, fra la mail e il clic possono passare mesi.
  if not exists (select 1 from td_services s
                  where s.td_id = b.td_id and s.service_type = v_servizio and s.is_active) then
    return jsonb_build_object('ok', false, 'esito', 'servizio_non_piu_attivo');
  end if;

  -- ------------------------------------------------------------- l'inserimento
  -- ⚠️ `consultation_credit_cents` resta a **zero**, e non è una dimenticanza:
  -- il credito consulenza non lo calcola il codice, lo applica il TD nella
  -- proposta scrivendo un prezzo già al netto, con spot-check del team. È una
  -- decisione di prodotto (Flusso §6, ripetuta in `CLAUDE.md`), non un limite
  -- tecnico: scriverlo qui vorrebbe dire che il sistema promette uno sconto che
  -- poi qualcun altro deve ricordarsi di applicare.
  insert into orders (traveler_id, td_id, service_type, status, source_booking_id, last_actor)
  values (b.traveler_id, b.td_id, v_servizio, 'requested', b.id, 'traveler')
  returning * into v_ordine;

  insert into event_log (entity_type, entity_id, event, actor, payload)
  values ('order', v_ordine.id, 'ordine_richiesto_da_mail_postcall', 'traveler',
          jsonb_build_object('token', d.token,
                             'booking_id', b.id,
                             'service_type', v_servizio));

  -- Nessuna richiesta resta invisibile (Flusso §6). Qui comincia una persona: è
  -- lei che apre il gruppo WhatsApp, perché le API non permettono di crearlo.
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  values ('ordine_richiesto', 'warning', 'order', v_ordine.id,
          'Nuova richiesta ' || v_ordine.human_ref || ' — '
          || case v_servizio when 'custom_itinerary' then 'Itinerario su misura'
                             else 'All Inclusive' end
          || ' con ' || b.td_name
          || ', dalla call del ' || to_char(b.starts_at, 'DD/MM/YYYY HH24:MI') || '. '
          || 'Va aperto il gruppo WhatsApp: '
          || case v_servizio when 'all_inclusive'
               then 'due gruppi (commerciale e tecnico) e l''assegnazione dell''agenzia.'
               else 'uno, con viaggiatore e designer.' end);

  return jsonb_build_object('ok', true, 'esito', 'creato',
                            'order_id', v_ordine.id,
                            'human_ref', v_ordine.human_ref,
                            'service_type', v_servizio,
                            'td_name', b.td_name);
exception
  -- La corsa fra due clic partiti insieme: l'indice ferma il secondo, e il
  -- secondo racconta la verità invece di un errore.
  when unique_violation then
    select * into v_esistente from orders o
     where o.source_booking_id = d.booking_id and o.service_type = v_servizio
       and o.status <> 'cancelled' limit 1;
    return jsonb_build_object('ok', true, 'esito', 'gia_richiesto',
                              'order_id', v_esistente.id,
                              'human_ref', v_esistente.human_ref,
                              'service_type', v_servizio);
end $$;

comment on function create_order_from_token(text) is
  'Un clic sul bottone della mail post-call diventa un ordine `requested` più un '
  'alert al team. Il servizio viene dal payload del token e da nessun altro '
  'posto; l''attore è `traveler` perché il token è l''unica prova di chi ha agito.';

-- La stessa cosa vista dalla pagina, prima del clic: quel poco che serve a
-- decidere, e niente di più. Non torna il cognome del viaggiatore, il telefono,
-- la domanda di contesto né il profilo quiz: chi ha il link non deve poterli
-- leggere (vedi il ragionamento in testa a questa parte).
create or replace function service_request_page(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  d          record;
  b          record;
  v_servizio service_type;
  v_ordine   orders;
begin
  select * into d from resolve_access_token_detail(p_token);

  if d.esito is distinct from 'valido' then
    return jsonb_build_object('esito', d.esito);
  end if;
  if d.purpose <> 'traveler_service_request' or d.audience <> 'traveler' then
    return jsonb_build_object('esito', 'token_di_altro_tipo');
  end if;

  begin
    v_servizio := (d.payload ->> 'service_type')::service_type;
  exception when others then
    return jsonb_build_object('esito', 'servizio_non_ordinabile');
  end;

  select b2.id, b2.status, b2.starts_at, b2.td_id,
         td.display_name as td_name, td.slug as td_slug,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome
    into b
    from bookings b2
    join travel_designers td on td.id = b2.td_id
    join travelers t on t.id = b2.traveler_id
   where b2.id = d.booking_id;

  if not found then
    return jsonb_build_object('esito', 'prenotazione_sconosciuta');
  end if;
  if b.status not in ('confirmed', 'completed') then
    return jsonb_build_object('esito', 'call_in_stato_non_ammesso', 'stato', b.status);
  end if;

  select * into v_ordine from orders o
   where o.source_booking_id = b.id and o.service_type = v_servizio and o.status <> 'cancelled'
   limit 1;

  -- Stesso ordine dei controlli di `create_order_from_token`, e non è una
  -- coincidenza: una pagina che offre un bottone che al clic risponderebbe «non
  -- è più disponibile» è un tasto che mente. Se la richiesta c'è già vince
  -- quella; se non c'è e il servizio è spento, si dice subito.
  if v_ordine.id is not null then
    return jsonb_build_object('esito', 'gia_richiesto',
                              'service_type', v_servizio,
                              'td_name', b.td_name,
                              'td_slug', b.td_slug,
                              'starts_at', b.starts_at,
                              'human_ref', v_ordine.human_ref);
  end if;

  if not exists (select 1 from td_services s
                  where s.td_id = b.td_id and s.service_type = v_servizio and s.is_active) then
    return jsonb_build_object('esito', 'servizio_non_piu_attivo',
                              'service_type', v_servizio,
                              'td_name', b.td_name);
  end if;

  return jsonb_build_object(
    'esito',        'valido',
    'service_type', v_servizio,
    'td_name',      b.td_name,
    'td_slug',      b.td_slug,
    'nome',         nullif(b.nome, ''),
    'starts_at',    b.starts_at);
end $$;

-- ===========================================================================
-- PARTE E — L'orologio, rifatto a rami veri
-- ===========================================================================
-- La 0041 dichiarava la struttura: «la funzione è fatta a rami, e aggiungerne
-- una scadenza è aggiungere un ramo». La 0042 l'ha messa alla prova e ha
-- funzionato — ma al prezzo di **riemettere per intero** una funzione di
-- trecento righe per aggiungerne trenta. Al terzo giro (questo) il file della
-- 0042 e quello della 0041 contengono già due copie parola per parola del ramo
-- 1, ed è esattamente il modo in cui due copie divergono.
--
-- Quindi i rami diventano **funzioni**, e `clock_tick()` torna a essere quello
-- che dice di essere: un orchestratore di dodici righe. Da qui in poi
-- aggiungere una scadenza è scrivere una funzione e aggiungere una riga, senza
-- riemettere niente.
--
--   · i rami che il database sa chiudere da solo restituiscono un conteggio e
--     non escono (`perform`);
--   · i rami che hanno bisogno del mondo di fuori restituiscono **compiti**
--     nella forma unica `(task, entity_type, entity_id, payload)`.
--
-- ⚠️ Il ramo 1 qui sotto è **lo stesso SQL** della 0041 e della 0042, istruzione
-- per istruzione: è stato spostato, non riscritto. Cambiano solo due cose, e
-- nessuna delle due tocca il comportamento — i parametri li legge adesso la
-- funzione invece di riceverli dal chiamante, e i commenti lunghi sulle quattro
-- trappole restano nella 0041, dove sono stati scritti, invece di essere
-- ricopiati una terza volta. Se un giorno questa affermazione smettesse di
-- essere vera, sarebbe perché qualcuno ha cambiato il ramo senza dirlo.

create or replace function clock_ramo_insoluti(p_limit integer)
returns table (task text, entity_type text, entity_id uuid, payload jsonb)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_grace   numeric;
  v_sweep   numeric;
  v_max_try numeric;
  v_url     text;
  v_api_ver text;
  v_reason  text;
  v_bloccate integer;
begin
  select value into v_grace   from app_config where key = 'booking_cancel_grace_min';
  select value into v_sweep   from app_config where key = 'unpaid_sweep_minutes';
  select value into v_max_try from app_config where key = 'unpaid_cancel_max_attempts';
  select value_text into v_url     from app_config where key = 'calcom_cancel_url';
  select value_text into v_api_ver from app_config where key = 'calcom_api_version';
  select value_text into v_reason  from app_config where key = 'unpaid_cancel_reason';

  -- Prima si guarda se il braccio è rotto. Una prenotazione che ha già speso
  -- tutti i tentativi non si riconsegna: si smette e si chiama una persona,
  -- una volta sola. Senza questo, un endpoint Cal.com cambiato produrrebbe una
  -- chiamata fallita ogni cinque minuti per sempre, e nessuno guarderebbe.
  select count(*) into v_bloccate
    from bookings b
   where b.status = 'pending_payment'
     and b.payment_deadline_at is not null
     and b.payment_deadline_at + make_interval(mins => v_grace::int) <= now()
     and b.cancel_attempts >= v_max_try;

  if v_bloccate > 0 then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'orologio_cancellazione_calcom_non_riesce', 'critical', null, null,
           v_bloccate || ' prenotazioni scadute non si riescono a cancellare su Cal.com dopo '
           || v_max_try || ' tentativi: quegli slot restano occupati. '
           || 'Guarda le esecuzioni di n8n e la riga app_config.calcom_cancel_url.'
     where not exists (select 1 from team_alerts
                        where kind = 'orologio_cancellazione_calcom_non_riesce' and resolved_at is null);
  end if;

  return query
  with dovute as (
    select b.id
      from bookings b
     where b.status = 'pending_payment'
       -- TRAPPOLA: `payment_deadline_at` nullo **non** è una prenotazione
       -- scaduta. La route della cassa la tratta come pagabile senza limite,
       -- quindi l'orologio non la tocca: cancellare uno slot che il sito
       -- dichiara ancora pagabile sarebbe il tasto che mente, visto
       -- dall'altra parte.
       and b.payment_deadline_at is not null
       and b.payment_deadline_at + make_interval(mins => v_grace::int) <= now()
       -- La difesa che conta davvero: **mai** una riga su cui un incasso è già
       -- riuscito. Prendere i soldi e dare via lo slot è il danno peggiore che
       -- questo workflow possa fare.
       and not exists (select 1 from payments p
                        where p.booking_id = b.id and p.status = 'paid')
       and (b.cancel_requested_at is null
            or b.cancel_requested_at <= now() - make_interval(mins => v_sweep::int))
       and b.cancel_attempts < v_max_try
     order by b.payment_deadline_at
     limit p_limit
     for update skip locked
  ),
  segnate as (
    update bookings b
       set cancel_requested_at = now(),
           cancel_attempts     = b.cancel_attempts + 1
      from dovute d
     where b.id = d.id
    returning b.id, b.cal_booking_uid, b.starts_at, b.cancel_attempts
  )
  select 'calcom_cancel_unpaid'::text,
         'booking'::text,
         s.id,
         jsonb_build_object(
           'cal_booking_uid', s.cal_booking_uid,
           'cancel_url', replace(v_url, '{uid}', s.cal_booking_uid),
           'api_version', v_api_ver,
           'reason', coalesce(v_reason, 'Pagamento non completato.'),
           'starts_at', s.starts_at,
           'attempt', s.cancel_attempts)
    from segnate s;
end $$;

-- --------------------------------------------------------------------------
-- Ramo: le firme Cal.com rifiutate (era il ramo 2 della 0042)
-- --------------------------------------------------------------------------
create or replace function clock_ramo_firme_calcom()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_soglia   numeric;
  v_finestra numeric;
  v_giorni   numeric;
  v_rifiuti  integer;
  v_indizio  text;
begin
  select value into v_soglia   from app_config where key = 'calcom_signature_alert_threshold';
  select value into v_finestra from app_config where key = 'calcom_signature_alert_window_min';
  select value into v_giorni   from app_config where key = 'calcom_signature_keep_days';

  -- La mancanza la dice `clock_tick`, in un alert solo insieme a tutte le
  -- altre: qui il ramo si limita a restare spento.
  if v_soglia is null or v_finestra is null then
    return 0;
  end if;

  select coalesce(sum(r.n), 0) into v_rifiuti
    from calcom_signature_rejections r
   where r.last_at >= now() - make_interval(mins => v_finestra::int);

  if v_rifiuti >= v_soglia then
    select string_agg(x.chi || ' ×' || x.n::text, ', ' order by x.n desc, x.chi)
      into v_indizio
      from (select coalesce(r.cal_username_hint, '(non dichiarato)') as chi,
                   sum(r.n) as n
              from calcom_signature_rejections r
             where r.last_at >= now() - make_interval(mins => v_finestra::int)
             group by r.cal_username_hint) x;

    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'calcom_firme_rifiutate', 'critical', null, null,
           v_rifiuti || ' messaggi Cal.com rifiutati per firma non valida negli ultimi '
           || v_finestra || ' minuti, quindi **non sono diventati prenotazioni**. '
           || 'La causa più probabile è una parola segreta sbagliata sul webhook di un '
           || 'account: quel designer ha smesso di arrivarci senza nessun altro segnale. '
           || 'Chi li manda, per quello che DICHIARA il corpo del messaggio — '
           || '⚠️ INDIZIO NON VERIFICATO, la firma non è valida quindi quel nome può '
           || 'averlo scritto chiunque: ' || coalesce(v_indizio, '(nessuno)') || '. '
           || 'Il controllo si fa sull''account, non su questo alert: rigenera la parola '
           || 'segreta del webhook e rifai la prenotazione di prova dell''onboarding.'
     where not exists (select 1 from team_alerts
                        where kind = 'calcom_firme_rifiutate' and resolved_at is null);
  end if;

  if v_giorni is not null then
    delete from calcom_signature_rejections
     where bucket_at < now() - make_interval(days => v_giorni::int);
  end if;

  return v_rifiuti;
end $$;

-- --------------------------------------------------------------------------
-- Ramo: i token inventati
-- --------------------------------------------------------------------------
-- Il gemello del precedente, sull'altra porta pubblica. La differenza è cosa
-- significa il numero: tre firme sbagliate in un'ora sono quasi certamente un
-- account configurato male, cinquanta token inventati in un'ora non sono
-- «qualcuno che ha sbagliato a copiare il link» — sono qualcuno che prova.
--
-- La soglia è alta di proposito. Un link spezzato in due da un client di posta
-- produce qualche tentativo a vuoto ogni tanto, ed è rumore normale: un alert
-- che scatta sul rumore è un alert che il team impara a ignorare, ed è la
-- lezione della 0042.
create or replace function clock_ramo_token_inventati()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_soglia   numeric;
  v_finestra numeric;
  v_giorni   numeric;
  v_n        integer;
begin
  select value into v_soglia   from app_config where key = 'token_miss_alert_threshold';
  select value into v_finestra from app_config where key = 'token_miss_alert_window_min';
  select value into v_giorni   from app_config where key = 'token_miss_keep_days';

  if v_soglia is null or v_finestra is null then
    return 0;
  end if;

  select coalesce(sum(m.n), 0) into v_n
    from access_token_misses m
   where m.last_at >= now() - make_interval(mins => v_finestra::int);

  if v_n >= v_soglia then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'token_inventati', 'warning', null, null,
           v_n || ' link con token inesistente aperti negli ultimi ' || v_finestra
           || ' minuti. Un token è di 32 caratteri casuali: indovinarne uno non succede, '
           || 'quindi o qualcuno sta provando, o un link è stato pubblicato spezzato da '
           || 'qualche parte. Nessuna pagina ha rivelato niente — a un token inesistente '
           || 'rispondiamo sempre allo stesso modo — ma vale la pena guardare da dove '
           || 'arrivano le richieste.'
     where not exists (select 1 from team_alerts
                        where kind = 'token_inventati' and resolved_at is null);
  end if;

  if v_giorni is not null then
    delete from access_token_misses
     where bucket_at < now() - make_interval(days => v_giorni::int);
  end if;

  return v_n;
end $$;

-- --------------------------------------------------------------------------
-- Ramo: la mail post-call si compone e si accoda
-- --------------------------------------------------------------------------
-- **Il grilletto è una prenotazione `confirmed` con `ends_at` passato.** Non un
-- workflow nuovo, non un timer per la call: un ramo, come tutti gli altri.
--
-- Comporre e accodare sono un `insert`, cioè una cosa che il database sa fare
-- da solo: questo ramo **non esce come compito**. Uscirà la consegna, che è un
-- ramo separato — e la separazione non è pedanteria: una mail composta e non
-- consegnata resta leggibile su Studio e si riprova, mentre se composizione e
-- consegna fossero lo stesso gesto, un errore di Resend ricomporrebbe tutto da
-- capo ogni cinque minuti.
--
-- ## Le mail vecchie non si mandano, e non si tacciono
--
-- Senza un limite di età, il primo giro dopo questa migration manderebbe la
-- mail post-call a **ogni** consulenza confermata e finita da sempre: le prove
-- di collaudo comprese, a gente vera. E anche a regime, dopo un'istanza n8n
-- ferma tre giorni, una mail che dice «com'è andata la call?» tre giorni dopo è
-- peggio di nessuna mail.
--
-- Quindi c'è una finestra (`postcall_email_max_age_hours`), e quello che cade
-- fuori **si dichiara**: un alert che dice quante call sono rimaste senza mail.
-- Saltare in silenzio sarebbe il guasto che la 0042 esiste per chiudere.
create or replace function clock_ramo_postcall()
returns integer
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base       text;
  v_whatsapp   text;
  v_max_age    numeric;
  v_limite     numeric;
  b            record;
  s            record;
  r            record;
  f            record;
  m            record;
  v_token      text;
  v_url        text;
  v_b_html     text;
  v_b_testo    text;
  v_blocchi_h  jsonb;
  v_blocchi_t  jsonb;
  v_n          integer := 0;
  v_vecchie    integer;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  select value into v_max_age from app_config where key = 'postcall_email_max_age_hours';
  select value into v_limite  from app_config where key = 'email_max_per_tick';

  if v_base is null or btrim(v_base) = '' or v_whatsapp is null
     or v_max_age is null or v_limite is null then
    return 0;   -- la mancanza la dice clock_tick, in un alert solo
  end if;

  -- ----------------------------------------------------- quelle troppo vecchie
  select count(*) into v_vecchie
    from bookings b2
    join travelers t on t.id = b2.traveler_id
   where b2.status = 'confirmed'
     and b2.ends_at <= now() - make_interval(hours => v_max_age::int)
     and not exists (select 1 from outbound_messages o
                      where o.message_kind = 'postcall_traveler'
                        and o.entity_type = 'booking' and o.entity_id = b2.id
                        and o.recipient = t.email);

  if v_vecchie > 0 then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'postcall_mail_non_partita', 'warning', null, null,
           v_vecchie || ' consulenze sono finite da più di ' || v_max_age
           || ' ore senza che sia partita la mail post-call, e **non partirà**: oltre '
           || 'quella finestra una mail che chiede com''è andata la call fa più danno che '
           || 'bene. Se è un arretrato di collaudo va bene così; se invece l''orologio è '
           || 'stato fermo, quei viaggiatori vanno ripresi a mano su WhatsApp. '
           || 'La finestra è app_config.postcall_email_max_age_hours.'
     where not exists (select 1 from team_alerts
                        where kind = 'postcall_mail_non_partita' and resolved_at is null);
  end if;

  -- ------------------------------------------------------------- quelle dovute
  for b in
    select b2.id, b2.td_id, b2.traveler_id, b2.starts_at, b2.ends_at,
           t.email as email,
           split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
           td.display_name as td_name
      from bookings b2
      join travelers t on t.id = b2.traveler_id
      join travel_designers td on td.id = b2.td_id
     where b2.status = 'confirmed'
       and b2.ends_at <= now()
       and b2.ends_at > now() - make_interval(hours => v_max_age::int)
       and not exists (select 1 from outbound_messages o
                        where o.message_kind = 'postcall_traveler'
                          and o.entity_type = 'booking' and o.entity_id = b2.id
                          and o.recipient = t.email)
     order by b2.ends_at
     limit v_limite::int
  loop
    begin
      v_b_html  := '';
      v_b_testo := '';

      -- I bottoni dei **soli servizi attivi di quel designer**. Se non vende
      -- l'All Inclusive, quel bottone non esiste: non spento, non grigio, non
      -- c'è. E se non ne vende nessuno la mail parte lo stesso — è il
      -- ringraziamento, e il blocco resta vuoto senza lasciare una frase
      -- appesa, perché la frase che introduce i bottoni sta dentro il blocco.
      for s in
        select sv.service_type
          from td_services sv
         where sv.td_id = b.td_id
           and sv.is_active
           and sv.service_type in ('custom_itinerary', 'all_inclusive')
         order by sv.sort_order, sv.service_type
      loop
        insert into access_tokens (purpose, audience, booking_id, td_id, payload)
        values ('traveler_service_request', 'traveler', b.id, b.td_id,
                jsonb_build_object('service_type', s.service_type))
        on conflict (purpose, coalesce(booking_id, order_id), coalesce(payload ->> 'service_type', ''))
          where revoked_at is null
        do nothing;

        select a.token into v_token
          from access_tokens a
         where a.purpose = 'traveler_service_request'
           and a.booking_id = b.id
           and a.payload ->> 'service_type' = s.service_type::text
           and a.revoked_at is null;

        v_url := rtrim(v_base, '/') || '/servizio/' || v_token;

        select * into r from render_template(
          'blocco_servizio_' || s.service_type::text,
          jsonb_build_object('designer', b.td_name));

        v_b_html  := v_b_html || r.body_html || bottone_html(coalesce(r.button_label, 'Scopri'), v_url);
        v_b_testo := v_b_testo || r.body_text || E'\n'
                  || coalesce(r.button_label, 'Scopri') || ': ' || v_url || E'\n\n';
      end loop;

      -- La frase che introduce i bottoni sta **dentro il blocco**, non nel
      -- corpo della mail: se quel designer non vende niente dopo la call, il
      -- blocco resta vuoto e la mail non lascia appesa una riga che annuncia
      -- qualcosa che non arriva.
      if v_b_html <> '' then
        select * into r from render_template('blocco_intro_servizi');
        v_b_html  := r.body_html || v_b_html;
        v_b_testo := r.body_text || E'\n\n' || v_b_testo;
      end if;

      select * into f from render_template('blocco_firma',
        jsonb_build_object('whatsapp', v_whatsapp,
                           'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

      v_blocchi_h := jsonb_build_object('bottoni_servizi', v_b_html,  'firma', f.body_html);
      v_blocchi_t := jsonb_build_object('bottoni_servizi', v_b_testo, 'firma', f.body_text);

      select * into m from render_template(
        'postcall_traveler',
        -- `saluto` e non `nome`: il nome può mancare (Google non lo dà sempre),
        -- e «Ciao ,» è il modo più economico di far sembrare rotta una mail.
        jsonb_build_object('saluto', case when coalesce(b.nome, '') <> ''
                                          then 'Ciao ' || b.nome else 'Ciao' end,
                           'designer', b.td_name,
                           'data_call', to_char(b.starts_at, 'DD/MM/YYYY')),
        v_blocchi_h, v_blocchi_t);

      if accoda_messaggio('postcall_traveler', 'booking', b.id, b.email,
                          m.subject, m.body_text,
                          email_document(m.body_html, m.subject)) is not null then
        v_n := v_n + 1;
      end if;

    exception when others then
      -- Una mail che non si compone **non ferma le altre** e non resta muta: il
      -- caso tipico è un segnaposto rinominato su Studio, e va detto a chi l'ha
      -- rinominato.
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      select 'email_composizione_fallita', 'critical', 'booking', b.id,
             'La mail post-call della call del ' || to_char(b.starts_at, 'DD/MM/YYYY HH24:MI')
             || ' non si è composta e **non è stata accodata**: ' || sqlerrm
             || '. Quasi sempre è un segnaposto rimasto senza valore dopo una modifica '
             || 'a message_templates: guarda la colonna placeholders della riga.'
       where not exists (select 1 from team_alerts
                          where kind = 'email_composizione_fallita' and resolved_at is null);
    end;
  end loop;

  return v_n;
end $$;

-- --------------------------------------------------------------------------
-- Ramo: la consegna, che è l'unico pezzo che esce
-- --------------------------------------------------------------------------
-- Stessa forma del ramo 1: si segna la riga **prima** di consegnarla al
-- braccio, e lo stato definitivo (`sent`) si scrive **dopo** che il provider ha
-- risposto. Una mail il cui invio è fallito deve restare in coda e somigliare a
-- una mail da mandare, non a una mandata.
--
-- ## L'interruttore, e perché nasce spento
--
-- `email_enabled` a zero **non spegne la composizione**: le mail si compongono e
-- si accodano lo stesso, e si leggono su Studio esattamente come le leggerà un
-- cliente. È la condizione perché Gaia possa correggerle sul vero. Quello che
-- l'interruttore ferma è la consegna.
--
-- Nasce a **zero** perché accenderlo è un gesto che si fa guardando, non una
-- cosa che capita applicando una migration.
--
-- ## Il dirottamento durante le prove
--
-- `email_redirect_to`, quando è valorizzato, cambia **il destinatario del
-- compito**, non `recipient` sulla riga. È la scelta che conta: `recipient`
-- resta la persona vera, quindi il vincolo di unicità continua a significare
-- «una mail per destinatario» e non «una mail per la casella di prova». Dove è
-- finita davvero lo dice `delivered_to`.
--
-- ## Perché un tetto per giro
--
-- Il piano gratuito di Resend dà 100 mail al giorno, **condivise con la landing
-- page**, e 10 richieste al secondo. `email_max_per_tick` è il freno che
-- impedisce a un giro solo di bruciare la giornata: se ce ne sono di più
-- aspettano il giro dopo, che è fra cinque minuti.
create or replace function clock_ramo_email(p_limit integer)
returns table (task text, entity_type text, entity_id uuid, payload jsonb)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_on       numeric;
  v_from     text;
  v_redirect text;
  v_sweep    numeric;
  v_max_try  numeric;
  v_per_tick numeric;
  v_ferme    integer;
begin
  select value into v_on from app_config where key = 'email_enabled';
  select value_text into v_from     from app_config where key = 'email_from';
  select value_text into v_redirect from app_config where key = 'email_redirect_to';
  select value into v_sweep    from app_config where key = 'unpaid_sweep_minutes';
  select value into v_max_try  from app_config where key = 'email_max_attempts';
  select value into v_per_tick from app_config where key = 'email_max_per_tick';

  if v_on is null or v_from is null or btrim(v_from) = ''
     or v_sweep is null or v_max_try is null or v_per_tick is null then
    return;
  end if;
  if v_on < 1 then
    return;   -- interruttore spento: si compone, non si consegna
  end if;

  v_redirect := nullif(btrim(coalesce(v_redirect, '')), '');

  -- Le mail che hanno speso tutti i tentativi e sono ancora in coda: si smette
  -- e si chiama una persona, una volta sola. Stessa regola del braccio rotto
  -- del ramo 1.
  select count(*) into v_ferme
    from outbound_messages o
   where o.status = 'queued' and o.attempts >= v_max_try;

  if v_ferme > 0 then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'email_non_consegnata', 'critical', null, null,
           v_ferme || ' mail non si riescono a consegnare dopo ' || v_max_try
           || ' tentativi e restano in coda. Guarda outbound_messages.last_error e le '
           || 'esecuzioni di n8n: il caso più probabile è la chiave Resend, il tetto '
           || 'giornaliero di 100 mail condiviso con la landing page, o il dominio '
           || 'mittente.'
     where not exists (select 1 from team_alerts
                        where kind = 'email_non_consegnata' and resolved_at is null);
  end if;

  return query
  with dovute as (
    select o.id
      from outbound_messages o
     where o.status = 'queued'
       and o.channel = 'email'
       and o.body_html is not null
       and (o.last_attempt_at is null
            or o.last_attempt_at <= now() - make_interval(mins => v_sweep::int))
       and o.attempts < v_max_try
     order by o.queued_at
     limit least(p_limit, v_per_tick::int)
     for update skip locked
  ),
  segnate as (
    update outbound_messages o
       set attempts        = o.attempts + 1,
           last_attempt_at = now(),
           delivered_to    = coalesce(v_redirect, o.recipient)
      from dovute d
     where o.id = d.id
    returning o.*
  )
  select 'email_send'::text,
         'outbound_message'::text,
         s.id,
         jsonb_build_object(
           'to',      coalesce(v_redirect, s.recipient),
           'from',    v_from,
           -- Durante le prove l'oggetto dice a chi sarebbe andata: senza, una
           -- casella piena di mail dirottate è illeggibile.
           'subject', case when v_redirect is null then s.subject
                           else '[prova → ' || s.recipient || '] ' || s.subject end,
           'html',    s.body_html,
           'text',    s.body_text,
           -- La chiave di idempotenza di Resend: se il provider ha accettato la
           -- mail ma l'ack non è tornato fin qui, il ritentativo **non** ne
           -- manda una seconda. Vale 24 ore, e i nostri tentativi stanno tutti
           -- dentro un quarto d'ora.
           'idempotency_key', s.id::text,
           'tentativo', s.attempts)
    from segnate s;
end $$;

-- --------------------------------------------------------------------------
-- L'orologio, che adesso è un orchestratore
-- --------------------------------------------------------------------------
create or replace function clock_tick(p_limit integer default 100)
returns table (task text, entity_type text, entity_id uuid, payload jsonb)
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_window   numeric;
  v_grace    numeric;
  v_sweep    numeric;
  v_budget   numeric;
  v_max_try  numeric;
  v_url      text;
  v_mancanti text[] := '{}';
  v_chiave   text;
  v_alert    uuid;
begin
  -- ------------------------------------------------------ i parametri, tutti
  -- Questi sei sono **indispensabili**: senza, il ramo che libera gli slot non
  -- può nemmeno decidere chi è scaduto. Se ne manca uno l'orologio **solleva**
  -- invece di girare a vuoto: una scadenza non trattata è invisibile,
  -- un'esecuzione rossa su n8n no.
  select value into v_window  from app_config where key = 'booking_payment_window_min';
  select value into v_grace   from app_config where key = 'booking_cancel_grace_min';
  select value into v_sweep   from app_config where key = 'unpaid_sweep_minutes';
  select value into v_budget  from app_config where key = 'unpaid_slot_max_min';
  select value into v_max_try from app_config where key = 'unpaid_cancel_max_attempts';
  select value_text into v_url from app_config where key = 'calcom_cancel_url';

  if v_window is null or v_grace is null or v_sweep is null or v_budget is null
     or v_max_try is null or v_url is null then
    raise exception 'Manca un parametro dell''orologio in app_config (finestra, grazia, cadenza, budget, tentativi, URL di cancellazione): non si inventano';
  end if;

  -- ------------------------------------------- il budget dei 35 minuti
  -- La regola del Flusso è che uno slot non pagato resta occupato **al massimo
  -- 35 minuti**, e il conto è `finestra + grazia + cadenza`: la cadenza entra
  -- perché una riga che scade subito dopo un giro aspetta un giro intero. Con i
  -- valori di oggi — 30 + 0 + 5 — il conto fa esattamente 35.
  --
  -- Il controllo vive qui e non solo nell'harness perché i parametri si cambiano
  -- **da Studio**, dove nessun test passa.
  if v_window + v_grace + v_sweep > v_budget then
    insert into team_alerts (kind, severity, entity_type, entity_id, message)
    select 'orologio_fuori_budget', 'warning', null, null,
           'I parametri dell''orologio superano il massimo del Flusso: finestra '
           || v_window || ' + grazia ' || v_grace || ' + cadenza ' || v_sweep
           || ' = ' || (v_window + v_grace + v_sweep) || ' minuti, contro un massimo di '
           || v_budget || '. Uno slot non pagato resta occupato più a lungo di quanto la regola ammetta.'
     where not exists (select 1 from team_alerts
                        where kind = 'orologio_fuori_budget' and resolved_at is null);
  end if;

  -- ------------------------------------------- i parametri dei rami opzionali
  -- Gli altri rami non fanno sollevare l'orologio se la loro configurazione
  -- manca — fermerebbero anche il ramo 1, e un'installazione che libera slot da
  -- due giorni smetterebbe di farlo perché manca la riga di un'altra scadenza.
  -- Ma **un ramo spento in silenzio è il guasto che la 0042 esiste per
  -- chiudere**, quindi la mancanza si dice.
  --
  -- Un alert solo, con dentro l'elenco, e **aggiornato** invece che duplicato:
  -- chi ne sistema metà deve vedere restare l'altra metà, non un messaggio
  -- vecchio.
  -- ⚠️ «Presente» si controlla **sulla colonna giusta**, non su una qualunque
  -- delle due. `app_config` porta un numero **o** un testo (vincolo XOR della
  -- 0034), e una riga numerica a cui qualcuno ha messo un testo è una riga
  -- rotta che il ramo leggerà come nulla: chiedere «c'è almeno uno dei due
  -- valori?» direbbe che va tutto bene proprio nel caso peggiore.
  for v_chiave in
    select u.chiave from unnest(array[
      'calcom_signature_alert_threshold', 'calcom_signature_alert_window_min',
      'token_miss_alert_threshold', 'token_miss_alert_window_min',
      'email_enabled', 'email_max_per_tick', 'email_max_attempts',
      'postcall_email_max_age_hours'
    ]) as u(chiave)
    where not exists (select 1 from app_config c
                       where c.key = u.chiave and c.value is not null)
    order by u.chiave
  loop
    v_mancanti := v_mancanti || v_chiave;
  end loop;

  for v_chiave in
    select u.chiave from unnest(array[
      'email_from', 'site_base_url', 'whatsapp_number'
    ]) as u(chiave)
    where not exists (select 1 from app_config c
                       where c.key = u.chiave and btrim(coalesce(c.value_text, '')) <> '')
    order by u.chiave
  loop
    v_mancanti := v_mancanti || v_chiave;
  end loop;

  select id into v_alert from team_alerts
   where kind = 'orologio_ramo_non_configurato' and resolved_at is null limit 1;

  if array_length(v_mancanti, 1) > 0 then
    if v_alert is null then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('orologio_ramo_non_configurato', 'warning', null, null,
              'Rami dell''orologio SPENTI perché manca la loro riga in app_config: '
              || array_to_string(v_mancanti, ', ')
              || '. Finché mancano, quelle scadenze non vengono trattate e nessuno lo '
              || 'segnala. Le righe sono in coda a supabase/seed/0001_config.sql.');
    else
      update team_alerts
         set message = 'Rami dell''orologio SPENTI perché manca la loro riga in app_config: '
                    || array_to_string(v_mancanti, ', ')
                    || '. Finché mancano, quelle scadenze non vengono trattate e nessuno lo '
                    || 'segnala. Le righe sono in coda a supabase/seed/0001_config.sql.'
       where id = v_alert;
    end if;
  elsif v_alert is not null then
    -- Si è risolto da solo: lo chiude l'orologio invece di lasciare al team un
    -- allarme che non corrisponde più a niente.
    update team_alerts
       set resolved_at = now(), resolved_by = 'orologio'
     where id = v_alert;
  end if;

  -- ========================================================================
  -- I rami che il database chiude da solo
  -- ========================================================================
  perform clock_ramo_firme_calcom();
  perform clock_ramo_token_inventati();
  perform clock_ramo_postcall();

  -- ========================================================================
  -- I rami che hanno bisogno del mondo di fuori
  -- ========================================================================
  return query select * from clock_ramo_insoluti(p_limit);
  return query select * from clock_ramo_email(p_limit);

  -- RAMO da scrivere — silenzio-conferma a 48 ore (milestone 5): è un `update`,
  -- quindi sarà un `perform` come i primi tre.
  -- RAMO da scrivere — promemoria del giorno prima (milestone 5) e chiusura a 5
  -- giorni dalla consegna (milestone 6): compongono e accodano come il
  -- post-call, e la consegna la fa il ramo che c'è già. Da oggi aggiungere una
  -- mail **non** richiede di toccare n8n.
end $$;

comment on function clock_tick(integer) is
  'L''orologio unico: un giro ogni 5 minuti per tutte le scadenze dovute. Dalla '
  '0043 è un orchestratore e ogni ramo è una funzione a sé: aggiungere una '
  'scadenza è scrivere una funzione e aggiungere una riga, senza riemettere '
  'trecento righe come è successo con la 0042.';

-- La mail di chi ha perso lo slot. Sta in una funzione sua e non dentro
-- `clock_task_done` perché quella funzione decide cosa significa un codice
-- HTTP, e comporre una mail non è quello.
--
-- Convive con la mail nativa di Cal.com, che resta accesa (deviazione 5) e che
-- arriva più o meno nello stesso momento portando il motivo scritto in
-- `app_config.unpaid_cancel_reason`. Quindi la nostra **non ripete
-- l'annullamento**: dice cosa fare adesso.
create or replace function accoda_mail_slot_liberato(p_booking_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_base     text;
  v_whatsapp text;
  b          record;
  f          record;
  m          record;
begin
  select value_text into v_base     from app_config where key = 'site_base_url';
  select value_text into v_whatsapp from app_config where key = 'whatsapp_number';
  if v_base is null or btrim(v_base) = '' or v_whatsapp is null then
    return null;   -- la mancanza la dice clock_tick
  end if;

  select b2.id, b2.starts_at, t.email,
         split_part(coalesce(nullif(btrim(t.full_name), ''), ''), ' ', 1) as nome,
         td.display_name as td_name, td.slug as td_slug
    into b
    from bookings b2
    join travelers t on t.id = b2.traveler_id
    join travel_designers td on td.id = b2.td_id
   where b2.id = p_booking_id;

  if not found then return null; end if;

  select * into f from render_template('blocco_firma',
    jsonb_build_object('whatsapp', v_whatsapp,
                       'link_whatsapp', 'https://wa.me/' || regexp_replace(v_whatsapp, '[^0-9]', '', 'g')));

  select * into m from render_template(
    'unpaid_cancelled_traveler',
    jsonb_build_object('saluto', case when coalesce(b.nome, '') <> ''
                                      then 'Ciao ' || b.nome else 'Ciao' end,
                       'designer', b.td_name,
                       'data_call', to_char(b.starts_at, 'DD/MM/YYYY HH24:MI'),
                       'link_vetrina', rtrim(v_base, '/') || '/designer/' || b.td_slug),
    jsonb_build_object('firma', f.body_html),
    jsonb_build_object('firma', f.body_text));

  return accoda_messaggio('unpaid_cancelled_traveler', 'booking', b.id, b.email,
                          m.subject, m.body_text, email_document(m.body_html, m.subject));
exception when others then
  insert into team_alerts (kind, severity, entity_type, entity_id, message)
  select 'email_composizione_fallita', 'critical', 'booking', p_booking_id,
         'La mail "slot liberato" non si è composta e non è stata accodata: ' || sqlerrm
   where not exists (select 1 from team_alerts
                      where kind = 'email_composizione_fallita' and resolved_at is null);
  return null;
end $$;

-- ===========================================================================
-- PARTE F — L'esito, riferito dal braccio
-- ===========================================================================
-- Riemessa per aggiungere il compito `email_send`. La parte
-- `calcom_cancel_unpaid` è identica alla 0041.
--
-- ## Cosa significa un codice HTTP di Resend
--
-- Il braccio passa il numero, non un giudizio. Qui si decide, e la distinzione
-- che conta è fra **riprovabile** e **definitivo**:
--
--  · `2xx` → accettata. `sent_at` si valorizza adesso, insieme
--    all'identificativo che Resend restituisce nel corpo;
--  · `429` → il limite di richieste al secondo (Resend ne dà 10). Non è un
--    guasto: la riga resta in coda e riparte al giro dopo;
--  · `5xx` o `0` → il provider non ha risposto, o n8n non è arrivato. Si
--    riprova;
--  · qualunque altro `4xx` → **definitivo**. Un corpo malformato, un mittente
--    non verificato o una chiave revocata non guariscono riprovando: la riga
--    va a `failed` e il team riceve un alert. Riprovare all'infinito
--    trasformerebbe un difetto in rumore di fondo, che è esattamente il modo
--    in cui non se ne accorge nessuno.
create or replace function clock_task_done(
  p_task      text,
  p_entity_id uuid,
  p_status    integer,
  p_detail    text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_booking bookings;
  v_msg     outbound_messages;
  v_ok      boolean;
  v_esito   text;
  v_max_try numeric;
  v_id      text;
begin
  -- =======================================================================
  -- email_send
  -- =======================================================================
  if p_task = 'email_send' then
    select * into v_msg from outbound_messages where id = p_entity_id;
    if v_msg.id is null then
      return jsonb_build_object('ok', false, 'esito', 'messaggio_sconosciuto');
    end if;

    if v_msg.status = 'sent' then
      -- Già partita, da un giro precedente il cui ack si era perso. Innocuo, e
      -- la chiave di idempotenza ha già impedito il doppione dall'altra parte.
      return jsonb_build_object('ok', true, 'esito', 'gia_inviata', 'message_id', v_msg.id);
    end if;

    v_ok := p_status between 200 and 299;

    if v_ok then
      -- L'identificativo di Resend sta nel corpo della risposta, che il braccio
      -- passa come testo. Si prova a leggerlo e non si insiste: una mail
      -- consegnata resta consegnata anche se il corpo non era JSON.
      begin
        v_id := (p_detail::jsonb) ->> 'id';
      exception when others then
        v_id := null;
      end;

      update outbound_messages
         set status = 'sent', sent_at = now(),
             provider_message_id = v_id, last_error = null
       where id = v_msg.id;

      v_esito := 'inviata';

    elsif p_status = 429 or p_status >= 500 or p_status = 0 or p_status is null then
      update outbound_messages
         set last_error = left(coalesce(p_detail, ''), 500)
       where id = v_msg.id;
      v_esito := case when p_status = 429 then 'troppo_in_fretta' else 'ritentare' end;

    else
      select value into v_max_try from app_config where key = 'email_max_attempts';

      update outbound_messages
         set status = 'failed', last_error = left(coalesce(p_detail, ''), 500)
       where id = v_msg.id;

      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('email_rifiutata', 'critical', v_msg.entity_type, v_msg.entity_id,
              'Resend ha rifiutato definitivamente la mail "' || v_msg.message_kind
              || '" per ' || v_msg.recipient || ' con codice ' || p_status
              || ': ' || left(coalesce(p_detail, '(nessun dettaglio)'), 300)
              || '. Non viene ritentata, perché un corpo malformato o un mittente non '
              || 'verificato non guariscono riprovando. La riga è in outbound_messages, '
              || 'con il corpo composto: si legge, si corregge il testo in '
              || 'message_templates e la si rimette in coda con '
              || 'update outbound_messages set status=''queued'', attempts=0 where id=''' || v_msg.id || ''';');

      v_esito := 'rifiutata';
    end if;

    return jsonb_build_object('ok', v_ok, 'esito', v_esito,
                              'message_id', v_msg.id,
                              'tentativo', v_msg.attempts);
  end if;

  -- =======================================================================
  -- calcom_cancel_unpaid
  -- =======================================================================
  if p_task <> 'calcom_cancel_unpaid' then
    return jsonb_build_object('ok', false, 'esito', 'compito_sconosciuto', 'task', p_task);
  end if;

  select * into v_booking from bookings where id = p_entity_id;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'esito', 'prenotazione_sconosciuta');
  end if;

  v_ok := p_status between 200 and 299;

  -- Prima la riga, poi il codice HTTP: è l'ordine che rende innocuo il doppio
  -- tentativo senza dover interpretare un messaggio d'errore.
  if v_booking.status in ('cancelled_unpaid', 'cancelled') then
    v_esito := 'gia_liberata';
    v_ok    := true;

  elsif v_booking.status = 'confirmed' then
    if v_ok then
      insert into team_alerts (kind, severity, entity_type, entity_id, message)
      values ('orologio_ha_liberato_uno_slot_pagato', 'critical', 'booking', v_booking.id,
              'Lo slot del ' || to_char(v_booking.starts_at, 'DD/MM/YYYY HH24:MI')
              || ' è stato cancellato su Cal.com perché scaduto, ma il pagamento è '
              || 'arrivato nel frattempo e la consulenza risulta confermata ('
              || (v_booking.price_cents / 100.0)::text || ' €). '
              || 'La call su Cal.com non esiste più: va rifissata a mano con il designer, '
              || 'oppure rimborsata.');
    end if;
    v_esito := 'pagata_nel_frattempo';

  elsif v_booking.status = 'pending_payment' and v_ok then
    update bookings set
      status        = 'cancelled_unpaid',
      cancelled_at  = now(),
      cancelled_by  = 'system',
      cancel_reason = 'Pagamento non completato entro il tempo previsto.',
      last_actor    = 'system'
     where id = v_booking.id;

    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('booking', v_booking.id, 'orologio_slot_liberato', 'system',
            jsonb_build_object('scadenza', v_booking.payment_deadline_at,
                               'tentativo', v_booking.cancel_attempts,
                               'inizio_call', v_booking.starts_at));

    -- ⚠️ **La mail cortese, che fino a oggi non esisteva.** Il Flusso la prevede
    -- («parte una mail cortese: lo slot è stato liberato, puoi riprenotare
    -- quando vuoi») e la 0041 l'aveva lasciata fuori perché non c'era un
    -- provider di invio. Adesso c'è, e il posto giusto è esattamente questo: il
    -- momento in cui sappiamo che lo slot è stato liberato davvero, non prima.
    perform accoda_mail_slot_liberato(v_booking.id);

    v_esito := 'liberata';

  elsif v_booking.status = 'pending_payment' then
    insert into event_log (entity_type, entity_id, event, actor, payload)
    values ('booking', v_booking.id, 'orologio_cancellazione_fallita', 'system',
            jsonb_build_object('http', p_status,
                               'tentativo', v_booking.cancel_attempts,
                               'dettaglio', p_detail));
    v_esito := 'ritentare';

  else
    v_esito := 'stato_inatteso';
    v_ok    := false;
  end if;

  return jsonb_build_object('ok', v_ok, 'esito', v_esito,
                            'booking_id', v_booking.id,
                            'tentativo', v_booking.cancel_attempts);
end $$;

comment on function clock_task_done(text, uuid, integer, text) is
  'L''esito di un compito dell''orologio, riferito dal braccio come codice HTTP. '
  'Su email_send la distinzione che conta è fra riprovabile (429, 5xx) e '
  'definitivo (4xx): riprovare un corpo malformato all''infinito trasforma un '
  'difetto in rumore di fondo.';

-- ===========================================================================
-- Chi può chiamare cosa
-- ===========================================================================
-- Solo `service_role`, cioè la chiave secret che vive lato server e che usano
-- n8n e le route Next. `anon` e `authenticated` non devono nemmeno vederle:
-- `clock_tick` restituisce `cal_booking_uid` (una credenziale di cancellazione
-- dopo S-05) e i corpi delle mail; `resolve_access_token_detail` risolve
-- credenziali; `create_order_from_token` crea ordini.
revoke all on function clock_ramo_insoluti(integer)        from public, anon, authenticated;
revoke all on function clock_ramo_firme_calcom()           from public, anon, authenticated;
revoke all on function clock_ramo_token_inventati()        from public, anon, authenticated;
revoke all on function clock_ramo_postcall()               from public, anon, authenticated;
revoke all on function clock_ramo_email(integer)           from public, anon, authenticated;
revoke all on function clock_tick(integer)                 from public, anon, authenticated;
revoke all on function clock_task_done(text, uuid, integer, text) from public, anon, authenticated;
revoke all on function accoda_messaggio(text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function accoda_mail_slot_liberato(uuid)     from public, anon, authenticated;
revoke all on function render_template(text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function resolve_access_token_detail(text)   from public, anon, authenticated;
revoke all on function resolve_access_token(text)          from public, anon, authenticated;
revoke all on function create_order_from_token(text)       from public, anon, authenticated;
revoke all on function service_request_page(text)          from public, anon, authenticated;

grant execute on function clock_tick(integer)                     to service_role;
grant execute on function clock_task_done(text, uuid, integer, text) to service_role;
grant execute on function resolve_access_token_detail(text)       to service_role;
grant execute on function create_order_from_token(text)           to service_role;
grant execute on function service_request_page(text)              to service_role;
