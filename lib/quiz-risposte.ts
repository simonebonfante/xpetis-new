/**
 * Il contratto delle risposte al quiz, e l'unico posto dove è scritto.
 *
 * Questo modulo è **puro**: nessun import di Supabase, niente `next/headers`.
 * Lo importano insieme il Server Component della pagina risultati, la pagina
 * del quiz e i due componenti client — se ci finisse dentro un client Supabase
 * lato server, il quiz non potrebbe più leggerlo dal browser.
 *
 * Le forme in gioco sono tre e vanno tenute allineate:
 *  1. `Quiz`, l'oggetto `{ codice_asse: valore }` che `match_designers()` vuole
 *     come jsonb;
 *  2. la stringa di query `quiz=pace:1,comfort_wild:4`, che porta le risposte da
 *     una pagina all'altra e rende un risultato condivisibile per link;
 *  3. il JSON in `sessionStorage`, dove vivono le risposte dell'anonimo
 *     (Flusso §1) finché non arriva un login.
 */

/** Le risposte al quiz: `{ codice_asse: valore }`. Il quiz è sempre completo. */
export type Quiz = Record<string, number>

/** Una risposta possibile. `etichetta` è `null` se nel database non c'è. */
export type OpzioneQuiz = { valore: number; etichetta: string | null }

/**
 * Un asse come lo serve `public_quiz_axes`. **Le sei domande non stanno nel
 * codice**: codice, tipo, etichetta, domanda, scala e opzioni arrivano dal
 * database, quindi aggiungere un asse o correggere un'etichetta non richiede un
 * deploy.
 *
 * `kind` distingue i cinque assi continui (scala 1-4, le opzioni sono ordinate e
 * il verso conta) dal categoriale "con chi viaggi" (cinque opzioni senza
 * ordine). Il verso di un asse continuo **si legge dalle opzioni in ordine di
 * valore, mai dal nome del codice**: è l'errore che nessuna prova tecnica
 * intercetta.
 */
export type AsseQuiz = {
  code: string
  kind: 'continuous' | 'categorical'
  label_it: string
  question_it: string | null
  scale_min: number
  scale_max: number
  sort_order: number
  opzioni: OpzioneQuiz[]
}

/** Il valore massimo accettato: 4 sui cinque assi continui, 5 su "con chi viaggi". */
const VALORE_MAX = 5

/**
 * Legge `quiz=codice:valore,codice:valore`. Scarta in silenzio ciò che non è una
 * coppia valida: la query la può scrivere chiunque a mano, e un valore fuori
 * scala non deve far cadere la pagina risultati.
 */
export function leggiQuiz(grezzo: string | null | undefined): Quiz | null {
  if (!grezzo) return null
  const quiz: Quiz = {}
  for (const coppia of grezzo.split(',')) {
    const [codice, valore] = coppia.split(':')
    const n = Number(valore)
    if (codice && Number.isInteger(n) && n >= 1 && n <= VALORE_MAX) quiz[codice] = n
  }
  return Object.keys(quiz).length > 0 ? quiz : null
}

/** L'inverso: dalle risposte alla stringa di query. */
export function serializzaQuiz(quiz: Quiz): string {
  return Object.entries(quiz)
    .map(([codice, valore]) => `${codice}:${valore}`)
    .join(',')
}

/**
 * Se il quiz è completo. Il Flusso non ammette quiz a metà: le sei domande sono
 * tutte obbligatorie, e la lista di ciò che serve viene dagli assi che il
 * database dichiara, non da un conteggio scritto qui.
 */
export function quizCompleto(assi: AsseQuiz[], risposte: Quiz): boolean {
  return assi.length > 0 && assi.every((a) => typeof risposte[a.code] === 'number')
}

// --------------------------------------------------------------- sessionStorage
//
// Le risposte dell'anonimo vivono qui e si perdono chiudendo la scheda, come
// vuole il Flusso. La deviazione 3 di PIANO.md aggiunge il travaso sul profilo
// al primo login: il briefing che il designer riceve prima della call contiene
// il profilo quiz, e senza salvataggio arriverebbe vuoto.

const CHIAVE_RISPOSTE = 'xpetis:quiz'
/** Cosa è già stato salvato sul profilo, in forma serializzata. */
const CHIAVE_SALVATO = 'xpetis:quiz-salvato'

export function leggiQuizDaSessione(): Quiz | null {
  if (typeof window === 'undefined') return null
  try {
    const grezzo = window.sessionStorage.getItem(CHIAVE_RISPOSTE)
    if (!grezzo) return null
    const letto = JSON.parse(grezzo) as unknown
    if (!letto || typeof letto !== 'object') return null
    const quiz: Quiz = {}
    for (const [codice, valore] of Object.entries(letto as Record<string, unknown>)) {
      if (typeof valore === 'number' && Number.isInteger(valore)) quiz[codice] = valore
    }
    return Object.keys(quiz).length > 0 ? quiz : null
  } catch {
    // Modalità privata, quota piena, JSON storto: il quiz funziona comunque,
    // semplicemente non si ricorda niente.
    return null
  }
}

export function scriviQuizInSessione(quiz: Quiz): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CHIAVE_RISPOSTE, JSON.stringify(quiz))
  } catch {
    /* vedi sopra */
  }
}

/** Cosa è già finito sul profilo, per non riscrivere la stessa riga a ogni pagina. */
export function leggiQuizSalvato(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(CHIAVE_SALVATO)
  } catch {
    return null
  }
}

export function segnaQuizSalvato(serializzato: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CHIAVE_SALVATO, serializzato)
  } catch {
    /* vedi sopra */
  }
}
