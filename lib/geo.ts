/**
 * Il testo digitato nel suggeritore, portato nella stessa forma della colonna
 * `geo_search.name_norm`. Modulo **puro**: lo importa un componente client, come
 * `lib/quiz-risposte.ts`.
 *
 * Dalla migration 0035 la ricerca geografica non guarda più `name_it` ma la sua
 * versione senza accenti e in minuscolo, perché nessuno scrive "Perù" con
 * l'accento in un campo di ricerca. La colonna la calcola Postgres con
 * `unaccent`; qui si calcola la stessa cosa sul testo dell'utente, perché il
 * confronto avviene fra i due.
 *
 * **Le due implementazioni non sono lo stesso codice, e non possono esserlo**: il
 * pattern lo compone il browser, la colonna la calcola il database. Non è un
 * dettaglio da lasciare alla buona volontà, quindi l'harness verifica che siano
 * d'accordo **su tutti i 1.613 nomi della tassonomia vera** (`run.mjs`, sezione
 * 0035). Se un giorno arriva un nome su cui divergono, il test lo dice: è già
 * servito il primo giorno.
 */

/**
 * Le lettere che `unaccent` traduce e che `normalize('NFD')` **non** scompone,
 * perché non sono "base + segno" ma lettere a sé.
 *
 * Non è una lista scritta a memoria: ogni riga è il risultato osservato di
 * `unaccent('unaccent', …)`. Quattro di queste vivono davvero nella tassonomia —
 * `ø` (Tromsø, Køge, Helsingør), `ð` (Hveragerði, Ísafjörður), `ł` (Płock,
 * Ostrołęka), `ı` (Kuşadası) — e senza la traduzione quei nove nomi non si
 * trovavano scrivendoli con la loro lettera vera. Le altre stanno qui perché
 * arrivano dallo stesso alfabeto e costano una riga.
 *
 * **Attenzione a non allungare la lista a intuito:** `ə` e `ǝ` per esempio
 * `unaccent` le lascia stare, quindi tradurle qui *creerebbe* la divergenza che
 * questa tabella serve a togliere. Ogni riga nuova va verificata contro
 * `unaccent`, e l'harness la controlla sui nomi veri.
 */
const LETTERE_SENZA_SEGNO: Record<string, string> = {
  ø: 'o',
  ð: 'd',
  ł: 'l',
  ı: 'i',
  đ: 'd',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
  ħ: 'h',
  ŋ: 'n',
  ŧ: 't',
  ĸ: 'q',
  ſ: 's',
  ɛ: 'e',
}

/**
 * `"Perù "` → `"peru"`, `"Tromsø"` → `"tromso"`.
 *
 * I due metacaratteri di `LIKE` (`%` e `_`) escono dal testo: entrerebbero nel
 * pattern come jolly, e chi cerca "100_" non sta cercando un jolly. Tutto il
 * resto resta — punti, apostrofi, trattini e il `·` che il suggeritore usa come
 * separatore quando si scende dentro un continente.
 */
export function normalizzaRicerca(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[øðłıđæœßþħŋŧĸſɛ]/g, (c) => LETTERE_SENZA_SEGNO[c] ?? c)
    .replace(/[%_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
