# XPETIS · punti aperti da chiudere

**Per la call di allineamento del 24 agosto 2026.**

Scritto per tutti, non solo per chi segue la parte tecnica: ogni punto dice cosa
si chiede, perché conta e cosa succede se resta aperto.

---

## Dove siamo, in breve

Il database è finito e provato. Il sito pubblico esiste: home, ricerca con il
motore di match funzionante, vetrina del designer, itinerario pronto da vivere e
il quiz. Girano tutti su dati veri. Infrastruttura in piedi: Supabase, il sito
online, n8n per le automazioni, il calendario Cal.com collegato che ci consegna
già le prenotazioni di prova.

Il prossimo blocco è **prenotazione e pagamento**, cioè il punto in cui XPETIS
comincia a incassare.

**La cosa che oggi decide la data di lancio non è il software.** È la prima
domanda qui sotto.

---



# 1 · Le decisioni che spostano la data



### 1.1 — Chi è il venditore? · Alessandro e Andrea

Oggi **non esiste un'entità legale XPETIS**, e senza partita IVA non si può
incassare: Stripe non attiva i pagamenti veri. Lo sviluppo va avanti lo stesso
in modalità di prova, ma il primo viaggiatore che paga davvero non può esistere
finché questo non è risolto.

Le strade sono tre, e **non sono equivalenti per noi**:


| Strada                                                                  | Cosa comporta                                                                                                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Si costituisce qualcosa (ditta individuale o società)                   | Nessun impatto tecnico. Tempi: giorni per una ditta individuale, settimane per una SRL                                                                         |
| **Incassa l'agenzia partner** anche su consulenze e itinerari su misura | Impatto tecnico piccolo: lo schema lo prevede già. Ma **il tasto "rimborsa" passa in mano all'agenzia**                                                        |
| Incassano i 25 designer, XPETIS fattura una commissione                 | **Cambia l'architettura**: il denaro andrebbe verso venticinque destinatari diversi e servirebbe un sistema di pagamenti a più conti, molto prima del previsto |


**Sulla seconda strada, che sembra la più probabile, c'è una conseguenza pratica
da verificare con l'agenzia.** Il flusso dà per scontato che i rimborsi li faccia
il nostro team: rimborso pieno fino a 24 ore prima della call, arbitrato delle
dispute, gestione dei no-show. Se i soldi stanno sul conto dell'agenzia, ognuno
di quei gesti diventa una richiesta a qualcun altro, con i suoi tempi. Su una
consulenza da 20 euro annullata di sabato sera è la differenza fra due clic e una
mail che aspetta lunedì.

Da chiedere all'agenzia: **è disposta a fare da venditore anche su importi
piccoli e frequenti, e chi materialmente preme quel tasto?**

### 1.2 — Le condizioni generali · serve un legale

Il flusso appoggia il servizio su regole precise: il designer aspetta 15 minuti
in call prima di considerare assente il viaggiatore, il rimborso è pieno fino a
24 ore prima, la revisione dell'itinerario è una sola. **Sono impegni
contrattuali**, e devono stare in un documento che il viaggiatore accetta al
momento del pagamento. Servono anche privacy e cookie policy.

Non si può scrivere finché non è chiaro **chi è la controparte**, quindi dipende
dal punto 1.1. I tempi non li controlliamo noi: è la seconda coda più lunga dopo
la costituzione.

### 1.3 — Il dominio e le mail

`xpetis.it` oggi ospita la landing page e non l'abbiamo toccato. Quando il sito
nuovo andrà online serviranno anche le mail: il percorso ne manda **una
quindicina** (conferme, promemoria, proposte, consegne, recensioni).

Il punto da ricordare: fra il momento in cui si configura l'invio e il primo
viaggiatore vero **va lasciata almeno una settimana**. La reputazione di un
dominio che manda mail si costruisce in giorni, e un dominio "freddo" finisce
nello spam proprio mentre stiamo confermando un pagamento.

---



# 2 · I contenuti che mancano · Gaia

Nessuno di questi blocca lo sviluppo: il sito funziona con testi segnaposto, che
si vedono. Ma sono contenuti che solo una persona può scrivere.

### 2.1 — Le sei domande del quiz, e le etichette delle risposte

Il quiz è fatto e funziona, ma **le domande non ci sono**: al loro posto compare
l'etichetta interna dell'asse ("Coinvolgimento nella pianificazione"), che è una
targhetta e non una domanda. E delle quattro risposte di ogni domanda ne
abbiamo scritte solo due, le estreme: **le otto intermedie dicono letteralmente
"DA SCRIVERE"**, in pagina.

Il Figma ha già i testi buoni per le prime due domande e per il ritmo. Vanno
scritti tutti e sei insieme, altrimenti restano due domande buone e quattro
targhette.

⚠️ **Un vincolo che non è di stile.** Ogni asse ha un verso, e le risposte vanno
scritte **nell'ordine in cui il sistema le legge**, non nell'ordine che sembra
più naturale. Se le si inverte, un designer che ama i viaggi scomodi risulta
amante del comfort, e il sito propone la persona sbagliata **senza che nessun
controllo se ne accorga**. È l'errore più insidioso di tutto il progetto. Prima
di scrivere, chiedi il verso di ogni asse.

### 2.2 — Le frasi delle schede dei designer

Sotto ogni designer nei risultati compare una frase che spiega perché lo stiamo
proponendo. È composta da pezzi intercambiabili, e i pezzi vanno scritti — ne
servono tre varianti ciascuno, così due viaggiatori diversi non leggono la stessa
frase.

Tre vincoli tecnici emersi scrivendo i segnaposto:

- **Niente aggettivi con il genere riferiti al designer.** Non sappiamo se sono
uomini o donne e non lo chiederemo: si usano verbi ("lavora", "cura", "porta"),
mai participi ("è abituato").
- **Niente articoli davanti ai nomi di paese.** Il sistema non sa se si dice "il
Vietnam" o "la Thailandia": le destinazioni entrano già formattate.
- **Nessuna virgola dentro un singolo pezzo**, perché i pezzi si uniscono con la
virgola.



### 2.3 — Le frasi quando non c'è un buon match

Quando nessun designer copre davvero la destinazione cercata, il sito lo dice con
onestà invece di far finta di niente. **Servono due frasi, non una**: una per chi
ha cercato una meta precisa, una per chi è arrivato dal quiz senza meta. La
seconda oggi non c'è, e la prima sarebbe falsa nel suo contesto.

### 2.4 — I testi delle mail

Quindici mail. La più importante è quella che parte subito dopo la call, perché è
quella che presenta i servizi acquistabili e il credito della consulenza.

⚠️ **Una cosa da sapere prima di scrivere le mail di conferma.** Cal.com manda
delle sue mail automatiche che non possiamo spegnere, e dicono "prenotazione
confermata" **nell'istante della prenotazione** — mentre per noi quella
prenotazione è ancora da pagare e ha 30 minuti di vita. La nostra mail deve
convivere con quella e chiarire l'equivoco, non ripeterla.

---



# 3 · Le decisioni di disegno · Chiara

Tutte piccole, ma ognuna ferma un dettaglio del sito.

### 3.1 — Il badge "match forte" si mostra?

Il sistema calcola quando un designer è particolarmente affine e può metterci un
bollino. Il flusso dice esplicitamente che è **una decisione tua**. Nel Figma non
è disegnato, quindi oggi è **spento** — ma "non l'ho disegnato" non è una
risposta, e il sistema lo produce comunque.
//
Si e fai fare a claude il design.

### 3.2 — La foto di sfondo nella scheda del designer

Stessa situazione: prevista come possibilità, non disegnata, oggi assente. Il
posto per l'immagine esiste già nel database.

### 3.3 — Le tre pillole nelle schede, quando sono vuote

Nel Figma ogni scheda ha tre pillole con i paesi coperti. Ma il flusso dice che
quei paesi vanno mostrati **solo dove servono a capire qualcosa** — e sotto il
titolo "Esperti di Vietnam" non servono, perché il Vietnam lo dice già il titolo.

Risultato: in quella sezione le schede oggi **non hanno pillole**, e lo spazio
resta vuoto. Se le vuoi comunque, serve decidere **cosa scriverci dentro**,
perché il contenuto che il disegno mostra lì oggi non esiste.
//
Nessuna pillola

### 3.4 — I titoli di sezione quando si arriva dal quiz

Chi cerca una destinazione vede i risultati divisi in fasce ("Esperti del
Vietnam", "Allarghiamo alla regione"). Chi arriva dal quiz, senza destinazione,
vede oggi **un elenco unico**, come nel Figma.

Le fasce però esistono anche in quel caso — i match più forti stanno in cima
comunque. Se le vuoi visibili servono tre titoli, e una risposta a una domanda
che il flusso non affronta: **cosa distingue "gli altri" dal "fondo lista"** quando
non c'è una destinazione?  
//  
Unica fascia

### 3.5 — L'ordine delle risposte della prima domanda del quiz

Nel Figma le risposte vanno **dal massimo controllo al minimo**. Nel sistema
l'asse cresce nel verso opposto. **Non è una questione di impaginazione**: se si
copia l'ordine del disegno, l'asse si inverte e il match sbaglia in silenzio.

O si riordina il disegno, o si gira il verso nel sistema. Mai solo la vista.  
// domande da ale

### 3.6 — Tre cose del Figma che non sono state costruite

Non per dimenticanza. Ti servono per aggiornare i file.

**"Acquista l'itinerario"**, in fondo alla pagina dell'itinerario pronto: il
flusso dice che l'itinerario pronto **non si compra**, l'unica porta d'acquisto è
la consulenza. Non è prudenza: non esiste il prodotto che quel tasto venderebbe.  
//  
Giusto così

**"+100 Designer" e "4.9 valutazione media"** sui due bolli: il primo ora mostra
il numero vero, il secondo è stato tolto perché non esistono ancora recensioni.
Scriverli fissi vorrebbe dire pubblicare due numeri falsi su un sito che incassa.  
//  
Pubblicheremo recensioni

**Il terzo gruppo di filtri, "Quale tipo di supporto cerchi?", e "Filtri
avanzati"**: il motore di ricerca oggi non sa filtrare per quello. Un gruppo di
caselle che non filtrano è peggio del vuoto — quindi o si costruisce la funzione,
o esce dal disegno.  
//  
Per ora rimane un todo, capiremo se implementarlo

---



# 4 · Le decisioni di prodotto · da prendere insieme



### 4.1 — I viaggi di gruppo: da dove arrivano?

Il Figma disegna una sezione "Viaggi di gruppo" nella vetrina, e la home li
presenta come una delle tre modalità di viaggio. **Ma il modulo che i 25 designer
hanno compilato non li raccoglie**: il campo esiste nel file ma non è
modificabile, quindi contiene ancora il testo d'esempio.

O si allarga il modulo — e allora bisogna richiamare venticinque persone — o li  
carica il team a mano, o la sezione non esiste. Oggi non esiste.  
//  
I viaggi di gruppo nella versione 1 funzionano così: sono solo card informative che vivono nella vetrina del td, esattamente come gli itinerari pronti da vivere. Quindi creare le entità a db, i dati nel json stanno nell'array "gruppo": un titolo, date, giorni, persone, prezzo. Non triggerano nessuna funzionalità

### 4.2 — Le recensioni che i designer portano da fuori

Il modulo chiede: *"inserisci qui se hai già qualche recensione sul tuo sito"*, e
i designer ne hanno messe. Il nostro sistema però è costruito su un principio
preciso: **può recensire solo chi ha comprato**, ed è quello che rende impossibili
le recensioni finte.

Quelle esterne sono vere ma vengono da prima. Le abbiamo conservate e **oggi non
si vedono**. Da decidere: si mostrano in vetrina? Si distinguono da quelle
XPETIS? Contano nella media?  
// Le mostriamo e contano nella media

Non è urgente finché non ci sono recensioni vere, ma la vetrina di un designer
senza nessuna recensione è più debole.

### 4.3 — Le regioni italiane nella ricerca

La tassonomia dice che cercando "Italia" si possono scegliere le 20 regioni. La
regola di ricerca che abbiamo definito prevede quattro livelli e le regioni non
ci sono. Oggi **non filtrano**, e il dato originale è conservato: quando si
deciderà, si riattiva.  
//  
Togliamo le regioni italiane, non devono filtrare

---



# 5 · Il lavoro che il team dovrà fare

Non sono decisioni, sono ore. Vale la pena saperle adesso perché entrano nel
calendario.


| Cosa                                                                        | Quanto                          | Quando                                            |
| --------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------- |
| **Onboarding Cal.com dei 25 designer** — account, calendario, disponibilità | ~15 minuti a testa, **6-7 ore** | Prima della Beta. Procedura già scritta e provata |
| **Correzione dei 25 profili** dopo l'import automatico                      | **8-12 ore**                    | Dopo l'import. Vedi sotto perché serve            |
| Numero WhatsApp dedicato, e chi lo presidia                                 | mezz'ora + una decisione        | Prima della Beta                                  |
| Creazione dei gruppi WhatsApp                                               | a mano, **a ogni ordine**       | A regime. Le API non permettono di automatizzarlo |


**Perché i profili vanno corretti a mano.** Il modulo che i designer hanno
compilato non chiede il "livello" di una destinazione, quindi tutti i paesi
risultano dello stesso peso — e un designer così **non comparirebbe mai in cima
a nessuna ricerca**. Inoltre, su un pacchetto reale che abbiamo esaminato, **un
terzo delle destinazioni non erano stati**: California, Florida, Texas, New York,
Hawaii, la Scozia, "Balcani", "Caraibi". Vanno ricondotte a mano.  
//  
i livelli non ci sono ma ogni td setta le sue 3 top destinazioni. Prima di paesi nel json guarda l'array topDestinazioni.
I dati sbagliati li correggiamo a mano

---



# 6 · Tre cose che dovete sapere, anche se non chiedono una decisione

**Il tasto sbagliato di Cal.com.** Nell'agenda dei designer c'è un pulsante
*"Request reschedule"* che **non è una richiesta di spostamento: è una
cancellazione secca**. Se un designer lo usa su una call già pagata, il
viaggiatore resta senza call e senza soldi finché non interviene qualcuno. Il
sistema riconosce il caso e avvisa il team, ma **va detto a voce a tutti e
venticinque** in fase di onboarding.  
//  
Serve un calendario admin

**Sotto le 12 ore non si sposta più niente**, e ora lo impedisce il calendario
stesso, non una regola scritta da qualche parte. Era una regola che chiunque
poteva violare; adesso Cal.com rifiuta.

**Il costo del sito, oggi e a regime.** In sviluppo siamo intorno ai 25 dollari
al mese. In produzione, con i backup del database e il piano commerciale
dell'hosting, saliamo a **50-60 dollari al mese**. Le commissioni sui pagamenti
sono l'1,6% dell'incassato. Un'attenzione: l'hosting si paga **per persona che ha
accesso**, quindi ogni collega che vuole entrare nel pannello sono 20 dollari al
mese in più.