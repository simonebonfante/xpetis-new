# Mappatura · form Vetrina TD → schema Supabase

**6 agosto 2026.** Documento di progetto, non di implementazione: dice dove va
ogni campo prima di scrivere una riga di SQL.

Fonti lette:

- `Vetrina TD (2).html` — il form. Da qui vengono i **campi possibili**, le liste
  chiuse e il verso degli assi. È questa la fonte della struttura.
- `vetrina-dennis-milello/vetrina.json` — un'istanza reale, usata per vedere che
  forma prendono i dati veri. **Non la importiamo ora.**

Il JSON è la struttura dati di *ogni* designer: tutti i 25 compileranno lo stesso
form e produrranno la stessa forma. Quindi lo schema deve avere una casa per ogni
campo, e per tutti i valori delle liste chiuse.

---

## Le quattro scoperte che contano

### 1. Il livello dei paesi non è un campo del form

Ho cercato `livello` fra i campi modificabili: **non c'è.** Esiste solo dentro le
strutture dati, dove ogni nuova riga paese nasce con `livello: "Base"` e nessuna
interfaccia permette di cambiarlo. L'esempio interno del form usa `"Esperto"`,
quindi i due valori previsti erano Base ed Esperto, ma il designer non li vede.

Non è quindi vero che "i designer scrivono Base su tutti i paesi per pigrizia":
**il form non gli chiede il livello.** Dennis ha 32 paesi tutti Base perché non
poteva fare altrimenti.

L'unico segnale di rilievo che il form raccoglie è `topDestinazioni`, con
l'etichetta esplicita *"Scegli fino a 3 tra le destinazioni che hai inserito
sopra: saranno messe in evidenza"*.

**Conseguenza sulla mappatura, e non è un ripiego:**

```
topDestinazioni      → td_countries.level = 1   (le punte di diamante)
tutti gli altri paesi → td_countries.level = 2   (quelli che copre con sicurezza)
paesi[].livello       → si ignora
```

Ogni designer avrà quindi al massimo tre paesi di livello 1, che è esattamente
quello che il Flusso descrive. Il campo `livello` del JSON è morto: non va
mappato, va documentato come tale.

### 2. I viaggi di gruppo non sono raccolti dal form

`gruppo[]` esiste nella struttura ma **non ha nessun campo modificabile**: nasce
precompilato dal contenuto di esempio e resta così. Si vede a occhio nel JSON di
Dennis, dove il primo viaggio di gruppo è "Argentina: Trekking in Patagonia",
12 giorni, 1.380€ — cioè, parola per parola, l'esempio dentro il form. Non è suo.

Del gruppo il form raccoglie solo due domande: `gruppoHaGia` ("hai già dei viaggi
di gruppo da proporre?") e `gruppoTempi` ("in quanto tempo saresti pronto a
inserirli?"). Sono domande di raccolta informazioni, non contenuto di vetrina.

**Quindi: `gruppo[]` non si importa mai** — sarebbero dati finti in vetrina — e la
sezione "viaggi di gruppo" della vetrina, che il Flusso prevede, oggi non ha
sorgente. Punto aperto n. 3.

### 3. Il verso degli assi è dichiarato nel form

Il form contiene la definizione esplicita degli estremi (`ASSI_DEF`), sinistra =
valore 1, destra = valore 4. Confrontato con il mio schema:

| Form | 1 (sinistra) | 4 (destra) | Mio codice | Esito |
|---|---|---|---|---|
| `controllo` | Poco controllo | Molto controllo | `planning_involvement` | ✅ |
| `ritmo` | Slow | Dynamic | `pace` (Lento → Intenso) | ✅ |
| `scomodita` | Comfort | Wild | `comfort_wild` | ✅ |
| `luogo` | Estetica curata | Vita reale | `aesthetics` | ⚠️ **nome invertito** |
| `sociale` | Intimità | Socialità | `social_orientation` | ✅ |
| `conChi` | 5 opzioni a scelta multipla | | `companions`, 4 opzioni | ⚠️ **manca un valore** |

Il quarto è la trappola: `aesthetics` su scala crescente si legge "più estetica",
mentre nel form crescere significa **meno** estetica curata e più vita reale. Chi
scriverà le etichette guardando il nome della colonna le metterà al contrario, e
nessun test lo vedrà. **Deciso: si rinomina** in un nome direzionale.

`conChi` è a scelta multipla e ha cinque opzioni, non quattro. Il mio schema già
ammette più valori per l'asse categoriale, quindi cambia solo il seed.

### 4. Il contenuto della vetrina non ha casa

Lo avevo progettato per il matching e per il flusso degli ordini. Della vetrina
ho una sola colonna, `bio`. Il form invece raccoglie: hero bio, storia,
manifesto, quattro punti della call, tre viaggi firma con foto, quindici
itinerari pronti con giorni/prezzo/foto, sei recensioni portate da fuori, anni di
esperienza, Instagram, copertura legale. **Circa quattro quinti del form non ha
dove atterrare.** È la parte più corposa delle migration da scrivere.

---

## Mappatura campo per campo

Trenta campi modificabili. `→` significa "va in"; **grassetto** = da creare.

### Profilo

| Campo del form | Destinazione | Note |
|---|---|---|
| `nome` | `travel_designers.display_name` | |
| `fotoProfilo` | `travel_designers.photo_url` | Il JSON contiene un percorso relativo (`images/foto-profilo.jpg`): l'import carica il file su Storage e scrive l'URL |
| `lingue` | `travel_designers.languages text[]` | Stringa unica separata da virgole, da spezzare |
| `esperienza` | **`years_experience smallint`** | "15" |
| `heroBio` | **`hero_bio text`** | Il paragrafo in cima alla vetrina. Diverso da `headline`, che è una riga |
| `storia` | `travel_designers.bio` | La bio narrativa lunga, con paragrafi separati da `\n\n` |
| `manifesto` | **`manifesto text`** | Una frase |
| `instagram` | **`instagram_handle text`** | Con la chiocciola |
| `coperturaLegale` | **`legal_coverage text`** | Tre valori chiusi. **Guida l'assegnazione dell'agenzia**: "Ho già un'agenzia" significa che `agency_id` va popolato con la sua, "vorrei un partner certificato XPETIS" che va usata la partner |
| `gruppoHaGia` | **`group_trips_readiness text`** | Tre valori chiusi. Informazione commerciale, non di vetrina |
| `gruppoTempi` | **`group_trips_timing text`** | Due valori chiusi |
| `topDestinazioni` | **non è una colonna**: determina `td_countries.level = 1` | Vedi scoperta 1 |

Presenti nella struttura ma **non modificabili nel form**, quindi da non
mappare: `brand` (costante "XPETIS"), `nomeProfessionale`, `rating` (le stelle si
calcolano da `td_review_stats`), `competenze` (stringa libera di macro-aree,
superata dai paesi strutturati), `membro`.

### La consulenza

| Campo del form | Destinazione | Note |
|---|---|---|
| `callPrezzo` | `td_services.price_cents` | **Testo libero:** Dennis scrive `"20"`, l'esempio del form `"30€"`. L'import deve parsare e segnalare ciò che non capisce, mai indovinare |
| `callPrezzoLibero` | **`td_services.price_is_custom boolean`** | L'etichetta dice "prezzo deciso da me, non un prezzo fisso uguale per tutti" |
| `callDescrizione` | `td_services.text_during_call` | |
| `callPunti[]` | **`td_service_bullets(service_id, position, text)`** | Quattro punti ordinati: "cosa è incluso" |
| `servizi[]` | `td_services.is_active` per tipo | Cinque etichette da mappare sull'enum, vedi sotto |

Mappatura delle cinque etichette:

| Etichetta del form | `service_type` | Nota |
|---|---|---|
| Consulenza singola (30 min) | `consultation` | Marcata `locked` nel form: sempre attiva per tutti |
| Itinerario su misura | `custom_itinerary` | |
| Itinerario su misura ALL INCLUSIVE | `all_inclusive` | Marcata `locked`: sempre attiva per tutti — conferma il Flusso |
| Viaggio di gruppo a tua firma | **`group_trip`** (nuovo) | |
| Accompagnamento privato / presenza sul posto | **`private_guiding`** (nuovo) | |

Il form non ha un campo per la consulenza approfondita, che il Flusso prevede
come servizio a sé (oggi la offre un solo TD). Resta nell'enum e la carica il
team a mano.

### I paesi coperti

Una riga per paese dichiarato. Otto campi.

| Campo | Destinazione | Note |
|---|---|---|
| `paese` | `td_countries.country_code` | Nome libero da normalizzare sui 129 stati della tassonomia. Provato sul pacchetto reale: **22 voci su 30 agganciano per nome esatto**, 8 no (vedi sotto) |
| `livello` | — | Campo morto, sempre "Base" |
| `aree` | **`td_countries.areas_note text`** | Testo libero. A volte è un dettaglio ("Lofoten"), a volte contiene i paesi veri di una voce aggregata ("Croazia, Slovenia, Serbia, Albania, Bosnia, Kosovo" sotto "Balcani") |
| `temi[]` | `td_destination_tags` con `kind='theme'` | Nove valori chiusi, coincidono col mio seed |
| `temiCustom[]` | **`td_countries.custom_themes text[]`** | Temi fuori tassonomia scritti dal designer. Non entrano nel match: restano visibili al team, che decide se meritano un tag nuovo |
| `contesti[]` | `td_destination_tags` con `kind='context'` | Otto valori chiusi. Una etichetta da allineare, vedi sotto |
| `durata` | **`td_countries.typical_duration text`** | Cinque valori chiusi. Il Flusso tiene durata e budget **fuori dal matching**: si conservano perché il designer li ha dichiarati e servono al team in call |
| `budget` | **`td_countries.typical_budget text`** | Cinque valori chiusi |

### Gli assi

| Campo | Destinazione |
|---|---|
| `assi.controllo` | `td_axis_values` asse `planning_involvement` |
| `assi.ritmo` | asse `pace` |
| `assi.scomodita` | asse `comfort_wild` |
| `assi.luogo` | asse **`curated_vs_real`** (rinominato da `aesthetics`) |
| `assi.sociale` | asse `social_orientation` |
| `assi.conChi[]` | asse `companions`, una riga per opzione scelta |

### Il contenuto di vetrina

| Campo | Destinazione | Note |
|---|---|---|
| `viaggi[]` | **`td_signature_trips(td_id, position, title, description)`** | Tre nel form, ma la struttura ne ammette di più |
| `viaggi[].imgs[]` | **`td_signature_trip_images(trip_id, position, storage_path)`** | Fino a tre per viaggio |
| `itinerari[]` | **`td_ready_itineraries(td_id, position, title, duration_label, price_label, image_path)`** | Quindici per Dennis |
| `recensioni[]` | **`td_showcase_reviews(td_id, position, title, author_name, stars, date_label, body)`** | Punto aperto n. 1 |
| `gruppo[]` | **non si importa** | Contenuto di esempio, vedi scoperta 2 |

Su `itinerari`: `giorni` e `prezzo` sono **testo libero** ("5-7 giorni", "850€").
Contro la convenzione degli importi in centesimi, qui vanno tenuti come testo:
non sono prezzi su cui si incassa, sono etichette di vetrina. La convenzione
`*_cents` vale dove passa del denaro vero.

### Le immagini

Venticinque file per Dennis, fino a 2-6 MB ciascuno, per un totale di circa
33 MB. Vanno nel bucket `td-media`, già previsto come pubblico.

Due conseguenze: il bucket ha oggi un limite di 10 MB per file, che va alzato o
accompagnato da un ridimensionamento in fase di import; e **1 GB di Storage sul
piano gratuito di Supabase basta per circa trenta designer**, quindi i 25 profili
con le foto stanno dentro per un soffio. Ridimensionare le immagini all'import
non è un vezzo.

---

## Le liste chiuse, con i valori esatti

Da mettere nel seed così come sono scritte nel form, perché è con queste stringhe
che arriveranno i JSON.

**Temi (9)** — coincidono con il mio seed: Food · Cultura, arte e storia ·
Natura e wildlife · Avventura e outdoor · Spiritualità e benessere · Lusso ·
Festival ed eventi · Shopping, design e artigianato · Fotografia e creatività

**Contesti (8)** — Città · Borghi e piccoli centri · Montagna · Mare e isole ·
Deserto · Foresta e giungla · Campagna e aree rurali · **Aree estreme/polari**
← il mio seed dice "Aree estreme e polari": da allineare, altrimenti quel tag non
aggancia

**Con chi viaggi (5)** — Viaggiatore solo · Coppia · Famiglia con
bambini/ragazzi · Gruppo di amici/piccolo gruppo · Gruppo organizzato

**Durata tipica (5)** — Weekend (2–4 gg) · Breve (5–7 gg) · Standard (8–14 gg) ·
Lungo (15–30 gg) · Esteso (oltre un mese)

**Budget tipico (5)** — Contenuto (<€1.500) · Medio (€1.500–3.500) ·
Alto (€3.500–7.000) · Premium (€7.000–15.000) · Senza vincolo

**Copertura legale (3)** — Ho già un'agenzia / struttura — non mi serve
supporto · Non ho un'agenzia — vorrei un partner certificato XPETIS · Non so / ne
vorrei parlare con voi

**Viaggi di gruppo pronti (3)** — Sì, sono pronti · Sì, ma da definire · No, non
ancora

**Tempi dei viaggi di gruppo (2)** — Entro il 2026 · Nel 2027

---

## Cosa il form non raccoglie

Va caricato dal team, e va nella checklist di onboarding: `slug` della vetrina,
`email` del designer (è l'indirizzo a cui arrivano i link con token: senza,
niente ordini), telefono, `cal_username`, l'agenzia da collegare, e la
consulenza approfondita per chi la offre.

---

## Le migration da scrivere

Nell'ordine. Le prime tre sono le correzioni della milestone 0, che vengono prima
perché sono difetti aperti.

| # | Cosa fa |
|---|---|
| 0018 | `match_designers()` in `SECURITY DEFINER` e rimozione di livelli e valori degli assi da `public_td_profiles` |
| 0019 | Vista delle prenotazioni senza `cal_booking_uid` al posto del `grant select on bookings` |
| 0020 | Controlli di plausibilità in `td_publish_readiness` |
| 0021 | Assi: rinomina `aesthetics` → `curated_vs_real`, cinque opzioni per `companions`, etichette dei cinque assi dagli estremi del form, tag "Aree estreme/polari" allineato |
| 0022 | Colonne di profilo: `hero_bio`, `manifesto`, `instagram_handle`, `years_experience`, `legal_coverage`, `group_trips_readiness`, `group_trips_timing` |
| 0023 | Colonne di `td_countries`: `areas_note`, `custom_themes`, `typical_duration`, `typical_budget` |
| 0024 | Due nuovi `service_type` (`group_trip`, `private_guiding`), `td_services.price_is_custom`, tabella `td_service_bullets` |
| 0025 | `td_signature_trips` e `td_signature_trip_images` |
| 0026 | `td_ready_itineraries` |
| 0027 | `td_showcase_reviews` (subordinata al punto aperto n. 1) |
| 0028 | Viste `public_*` aggiornate per servire la vetrina completa, e limite del bucket `td-media` |

Nota tecnica su 0024: aggiungere valori a un enum e usarli nella stessa
transazione non si può. Servono due migration, o si passa a una tabella di
lookup. Lo risolvo scrivendola.

Ogni migration si chiude con `npm run test:schema` verde, e l'harness cresce con
asserzioni nuove: che `public_td_profiles` non esponga più livelli né assi, che
la vista delle prenotazioni non contenga l'uid, che i controlli di plausibilità
respingano un profilo senza livello 1.

---

## Punti aperti

Nessuno blocca la scrittura delle migration tranne il primo.

**1. Le recensioni di vetrina — deciso il 6 agosto.** Tabella separata
`td_showcase_reviews`, distinta da `reviews`. Il form le chiede come recensioni
esterne ("se hai già qualche recensione sul tuo sito"), quindi il principio
"solo chi ha comprato può recensire" resta intatto per le recensioni XPETIS.
Come si mostrano in vetrina, se si distinguono visivamente e se entrano nelle
medie si decide quando si affronteranno le recensioni (milestone 8). Fino
ad allora la tabella le conserva e nessuna vista pubblica le espone.

**2. I due servizi in più.** `group_trip` e `private_guiding` entrano nell'enum
come servizi che un giorno si compreranno, o restano solo contenuto di vetrina?
Non è urgente — oggi nessuno dei due ha un flusso d'ordine — ma decide se
diventano valori dell'enum o una lista a parte.

**3. I viaggi di gruppo non hanno sorgente.** Il Flusso prevede la sezione in
vetrina, il form non la raccoglie. È un buco del form o è voluto? Se serve, o si
aggiunge al form o li carica il team.

**4. `giorni` e `prezzo` degli itinerari come testo.** Confermi che sono etichette
di vetrina e non prezzi su cui si incasserà?

**5. La regola `topDestinazioni` → livello 1.** È l'unica lettura possibile dei
dati che abbiamo, ma è una regola di prodotto: la confermi?

**6. La destinazione non è sempre uno stato.** Emerso caricando la tassonomia:
sono selezionabili anche le 14 macro-aree e le 20 regioni italiane, mentre
`match_designers()` accetta un solo stato. Vedi sotto.

---

## Le voci paese contro i 129 stati (prova sul pacchetto reale)

Delle 30 voci non vuote di un designer reale, **22 agganciano per nome esatto** e
8 no. Le otto, con la loro destinazione:

| Voce nel form | Cosa fare | Identificatore |
|---|---|---|
| California, Hawaii, Florida, Texas, New York | ricondurre allo stato | `stati_uniti` |
| Scozia | è una regione estera del Regno Unito nella tassonomia | `regno_unito` |
| Balcani | scorporare leggendo il campo `aree` | `croazia`, `slovenia`, `serbia`, `albania`, `bosnia_ed_erzegovina`, `kosovo` |
| Caraibi | scorporare: dei sei nomi solo uno esiste fra i 129 stati | `repubblica_dominicana` |

Più due righe completamente vuote da scartare, e due nomi con lo spazio in coda
("Perù ", "Vietnam ") da tagliare prima del confronto.

Nota su "Caraibi": il designer elenca sei isole nel campo `aree`, ma cinque non
sono stati della tassonomia. Non è un errore dell'import: è una copertura che il
nostro modello non sa rappresentare, e va decisa con una persona.
