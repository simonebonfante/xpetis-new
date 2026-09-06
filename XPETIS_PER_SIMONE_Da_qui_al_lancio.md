# XPETIS per Simone, da qui al lancio


## 1. I sette prerequisiti di pubblicazione

Non sono correzioni e non sono dentro nessuna sessione. Sono la lista che rende XPETIS pubblicabile.

| # | Cosa | Perché blocca | Dipende da |
|---|---|---|---|
| 1 | **App Google verificata e pubblicata** | In modalità test entrano solo cento indirizzi inseriti a mano. Un viaggiatore vero riceve un rifiuto | Dominio e privacy pubblicata |
| 2 | **Dominio xpetis.it** | Redirect, webhook, mail, credibilità | Alessandro |
| 3 | **Stripe in produzione** | Richiede partita IVA verificata, IBAN, verifica identità, condizioni pubblicate | Cancello del 15 settembre |
| 4 | **Hosting commerciale** | Il piano gratuito di Vercel vieta l'uso commerciale | Niente |
| 5 | **Mittente transazionale vero** | Gmail non regge il volume e finisce in spam. Serve un nuovo giro di test su tutte le mail | Dominio |
| 6 | **Migrazione n8n** dall'istanza personale a una XPETIS | Rifare le credenziali e riconfigurare i webhook su 25 account Cal.com e su Stripe | Niente |
| 7 | **Sorveglianza** | Oggi se un workflow salta alle tre di notte non se ne accorge nessuno | Niente |

**Il cambio dominio è un lavoro, non un interruttore.** Rompe i redirect di Cal.com, i webhook Stripe, gli indirizzi autorizzati di Google e i token già mandati nelle mail. Va fatto presto, non la settimana prima.

---

## 2. Le cinque mail da agganciare

Il contesto: nell'istante in cui il viaggiatore sceglie uno slot, Cal.com manda la sua conferma anche senza pagamento. Per noi quella riga è in attesa e ha trenta minuti di vita. Le mail servono a non lasciare il viaggiatore con una conferma che per noi non esiste.

**Chiara fa impaginazione e template, Gaia scrive i testi, tu agganci i workflow.**

| # | Mail | Quando parte | Cosa deve contenere |
|---|---|---|---|
| 1 | **Prenotazione slot** | Slot scelto | Che per modificare data, orario o cancellare si usano i tasti dentro la mail di Cal.com. E che la stessa cosa si può fare parlando col TD nel gruppo WhatsApp |
| 2 | **Pagamento non completato** | Scadenza dei 30 minuti | Che la mail di Cal.com non va considerata, che la call è cancellata per mancato pagamento, e come si riprenota |
| 3 | **Cancellazione** | Cancellazione confermata | Chiede il perché della cancellazione |
| 4 | **Spostamento** | Spostamento confermato | Conferma che lo spostamento è avvenuto |
| 5 | **Post call** | Dopo la consulenza | Già in lavorazione. Pulsanti per la richiesta All Inclusive o itinerario personalizzato |

---

## 3. Le cose nuove

**a. Tabella di registrazione eventi.** Al lancio ci servono dati, e i dati non si recuperano a posteriori. Da decidere entro il 7 settembre cosa si registra: come minimo ricerca fatta, destinazione cercata, TD mostrato, TD scelto, slot prenotato, pagamento riuscito o fallito, sorgente della visita. Se questa tabella non esiste il 27 ottobre, il primo mese è cieco.

**b. Link personale del TD e attribuzione della prenotazione.** Ogni TD ha il suo link, e il sistema sa se una prenotazione arriva dal suo canale o dal nostro. Non è solo misura, è argomento di vendita: alla call con i TD possiamo dire a venticinque persone che vedranno quanto vale la loro audience. È anche la base su cui costruire una parte del marketing, e uno strumento in più da dare ai TD.

**c. Il paese che viaggia dentro la vetrina e ordina gli itinerari.** Chi cerca la Thailandia ed entra nella vetrina di un TD deve trovare gli itierari sulla Thailandia in cima, non in fondo.

**d. Prima disponibilità nella card del TD in fase di ricerca.** L'idea: n8n interroga i calendari ogni ora e scrive la prima data libera su Supabase, la card la legge da lì. **Prima di costruirlo servono due tue risposte:** se venticinque interrogazioni ogni ora stanno n8n, e se è una cosa fattibile.

**e. Dashboard per i TD (prima era il foglio google sheet ma credo che fare una pagina web sia puù semolice e più carina da mostare).** Da definire il perimetro minimo. Va deciso se la dashboard è una pagina token, se è un link che salvano da qualche parte che apre la loro dashboard o se lo trovano dentro xpetis. Io farei una pagina dashboard da cui cliccando un link prendono anche quella di creazine offerta (quella che funziona con token, non so se è fattibile da cui possonno anche modificare la vetrina sempre con il metodo HTLM form che abbiamo adesso) 
---

## 4. Cosa ti arriva da altri

- **Testi delle mail:** Gaia. È la consegna che sblocca il punto 2.
- **Template e impaginazione delle mail:** Chiara.
- **Tassonomia sfoltita:** Alessandro decide quali delle 1.220 città cadono, perché nel suggeritore le minori sporcano la ricerca. Quando la lista è chiusa, la potatura si applica sul database.
- **testi delle domande modificati:**

## 5. Cose sa sapere

Ho mandato a chiara due mie revisione sulla vetrina (sistemare layout) e sulla pagina dei risultati (mostriamo i primi 3 TD) e poi pulsanti per caricarne altri sotto  - questo non credo abbia ricadute tecniche. 


