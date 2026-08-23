'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  leggiQuizDaSessione,
  scriviQuizInSessione,
  serializzaQuiz,
  type AsseQuiz,
  type Quiz,
} from '@/lib/quiz-risposte'

/**
 * Le sei schermate del quiz, nodi Figma 346:932 e 346:896.
 *
 * Una domanda per schermata, tutte obbligatorie: il Flusso non ammette quiz a
 * metà, e `match_designers()` dà 0 a ogni asse senza risposta — un quiz
 * incompleto non "conta meno", penalizza tutti i designer su quell'asse. Il
 * tasto Continua resta quindi spento finché non c'è una risposta.
 *
 * **Le domande e le risposte non sono scritte qui.** Arrivano da
 * `public_quiz_axes` (vedi `lib/quiz.ts`): aggiungere un asse o correggere
 * un'etichetta è un UPDATE su Supabase Studio, non un deploy. Di conseguenza il
 * numero delle schermate e il passo della barra di avanzamento si contano dagli
 * assi, non da un 6 scritto nel codice.
 *
 * Due punti dove il Figma e i dati non dicono la stessa cosa, entrambi risolti
 * in favore dei dati:
 *
 *  1. **L'ordine delle risposte.** Il Figma della prima domanda elenca le
 *     quattro risposte dal massimo controllo al minimo; nel database l'asse
 *     `planning_involvement` cresce nel verso opposto (`label_min` = "Poco
 *     controllo"). Qui le risposte si mostrano **in ordine di valore**, come le
 *     dichiara il database: l'ordine visivo è una scelta di layout, ma se si
 *     copiasse quello del disegno appiccicando i valori 1-4 alle righe si
 *     girerebbe l'asse — il rischio numero uno del piano, quello che nessuna
 *     prova tecnica intercetta.
 *  2. **Il testo.** Il Figma porta domanda e risposte scritte per le prime due
 *     domande; il database ha `question_it` vuoto su tutti e sei gli assi e
 *     "DA SCRIVERE" sui valori intermedi dei cinque assi continui. Mostriamo
 *     quello che c'è: il quiz è incompleto per davvero e deve vedersi. I testi
 *     del Figma sono materiale per Gaia, e vanno nel seed, non qui.
 */
export function QuizDomande({
  assi,
  queryBase,
  quizIniziale,
}: {
  assi: AsseQuiz[]
  /** Destinazione e filtri già scelti, da riportare intatti alla pagina risultati. */
  queryBase: string
  /** Risposte arrivate dall'URL: chi torna dal "Modifica le risposte del quiz". */
  quizIniziale: Quiz | null
}) {
  const router = useRouter()
  const [risposte, setRisposte] = useState<Quiz>(quizIniziale ?? {})
  const [passo, setPasso] = useState(0)
  // Finché non si è letto `sessionStorage` non si scrive: l'effetto di
  // salvataggio partirebbe con l'oggetto vuoto e cancellerebbe le risposte
  // appena ricaricata la pagina.
  const [idratato, setIdratato] = useState(false)

  useEffect(() => {
    // L'URL vince sulla sessione: è ciò che il viaggiatore ha davanti.
    if (!quizIniziale) {
      const dallaSessione = leggiQuizDaSessione()
      if (dallaSessione) setRisposte(dallaSessione)
    }
    setIdratato(true)
  }, [quizIniziale])

  useEffect(() => {
    if (idratato) scriviQuizInSessione(risposte)
  }, [idratato, risposte])

  if (assi.length === 0) {
    return (
      <p className="rounded-[30px] bg-neutro p-9 text-corpo-big">
        Il quiz non ha domande: <code>public_quiz_axes</code> non restituisce nessun asse.
      </p>
    )
  }

  const asse = assi[Math.min(passo, assi.length - 1)]
  const scelta = risposte[asse.code]
  const risposto = typeof scelta === 'number'
  const ultima = passo === assi.length - 1

  function rispondi(valore: number) {
    setRisposte((precedenti) => ({ ...precedenti, [asse.code]: valore }))
  }

  function avanti() {
    if (!risposto) return
    if (!ultima) return setPasso(passo + 1)

    // Fine del quiz: le risposte tornano nell'URL della pagina risultati, che è
    // un Server Component e richiama `match_designers()`. Il quiz non calcola
    // niente, e un risultato resta condivisibile per link.
    const query = new URLSearchParams(queryBase)
    query.set('quiz', serializzaQuiz(risposte))
    router.push(`/ricerca?${query}`)
  }

  return (
    <>
      {/* -------------------------------------------- barra di avanzamento */}
      <div className="relative">
        <div
          className="h-[5px] w-full rounded-full bg-scuro"
          role="progressbar"
          aria-label="Avanzamento del quiz"
          aria-valuemin={1}
          aria-valuemax={assi.length}
          aria-valuenow={passo + 1}
        />
        {/* La stella del Figma è la stessa forma dei bolli, in piccolo: 34×36,
            non quadrata. Misurarla su un lato solo la stirerebbe, perché gli SVG
            esportati hanno `preserveAspectRatio="none"`. */}
        <Image
          src="/img/stella.svg"
          alt=""
          width={34}
          height={36}
          className="absolute -top-[15px] -translate-x-1/2"
          style={{ left: `${((passo + 1) / assi.length) * 100}%` }}
        />
      </div>

      <div className="mt-10 flex flex-col items-start lg:mt-[57px] lg:flex-row">
        {/* ------------------------------------------------------- la card */}
        <div className="relative w-full rounded-[30px] bg-neutro px-6 py-10 lg:h-[710px] lg:w-[740px] lg:shrink-0 lg:px-0 lg:pb-0 lg:pl-[65px] lg:pr-[56px] lg:pt-[76px]">
          {/* La chiave sull'asse fa nascere un fieldset nuovo a ogni domanda:
              senza, React riuserebbe gli stessi input radio da una schermata
              all'altra. */}
          <fieldset key={asse.code}>
            <legend className="font-titoli text-[30px] font-bold leading-normal lg:min-h-[99px] lg:max-w-[619px] lg:text-h3">
              {asse.question_it ?? asse.label_it}
            </legend>

            {/* `question_it` è vuoto su tutti e sei gli assi: l'intestazione qui
                sopra ricade sull'etichetta dell'asse, che è una targhetta e non
                una domanda. Detto invece di nascosto. */}
            {!asse.question_it && (
              <p className="mt-2 text-piccolo uppercase tracking-wide text-primario">
                domanda da scrivere
              </p>
            )}

            <div className="mt-8 flex flex-col gap-[15px] lg:mt-[72px]">
              {asse.opzioni.map((opzione) => (
                <label
                  key={opzione.valore}
                  className="group flex cursor-pointer items-center gap-[13px]"
                >
                  <input
                    type="radio"
                    name={asse.code}
                    value={opzione.valore}
                    checked={scelta === opzione.valore}
                    onChange={() => rispondi(opzione.valore)}
                    className="peer sr-only"
                  />
                  {/* Il Figma disegna solo il cerchio vuoto: lo stato scelto è
                      il pieno rosso, come le pillole dei filtri di /ricerca.
                      Passaggio del mouse e fuoco sono un anello, non un altro
                      fondo, così non litigano col pieno. */}
                  <span className="h-[30px] w-[30px] shrink-0 rounded-full border-2 border-primario bg-neutro transition peer-checked:bg-primario peer-focus-visible:ring-4 peer-focus-visible:ring-scuro/30 group-hover:ring-4 group-hover:ring-primario/20" />
                  <span className="text-corpo">
                    {/* Un'etichetta che manca nel database non si inventa: si
                        mostra il valore, e chi legge capisce che è un buco. */}
                    {opzione.etichetta ?? `Valore ${opzione.valore} · etichetta da scrivere`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* --------------------------------------------------- i due tasti */}
          <div className="mt-10 flex items-center justify-between lg:absolute lg:bottom-[39px] lg:left-[65px] lg:right-[84px] lg:mt-0">
            {passo > 0 ? (
              <button
                type="button"
                onClick={() => setPasso(passo - 1)}
                className="flex items-center gap-[17px] transition hover:brightness-110"
              >
                <Image src="/img/freccia-indietro.svg" alt="" width={40} height={40} />
                <span className="text-[18px] tracking-[-0.342px]">Precedente</span>
              </button>
            ) : (
              <span />
            )}

            {/* Il Figma non disegna né lo stato spento né l'ultima schermata,
                quindi l'etichetta resta "Continua" fino in fondo e il tasto si
                limita a smorzarsi finché la domanda non ha risposta. */}
            <button
              type="button"
              onClick={avanti}
              disabled={!risposto}
              className={`flex items-center gap-[20px] transition ${
                risposto ? 'hover:brightness-110' : 'cursor-not-allowed opacity-40'
              }`}
            >
              <span className="text-[18px] tracking-[-0.342px]">Continua</span>
              <Image src="/img/freccia-avanti.svg" alt="" width={40} height={40} />
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------- la foto */}
        {/* Decorativa e uguale su tutte le schermate del Figma. Sotto lg
            sparisce: il quiz su cellulare non è disegnato, e una foto alta 709
            fra la domanda e le risposte allontanerebbe le due cose che devono
            stare insieme. */}
        <div className="relative hidden lg:block lg:h-[709px] lg:w-[568px] lg:shrink-0">
          <Image
            src="/img/quiz.jpg"
            alt=""
            width={568}
            height={709}
            priority
            className="h-full w-full rounded-[20px] object-cover"
          />
          {/* La cucitura tratteggiata sul giunto card-foto (Figma "Line 28"):
              tratto bianco 3px, 10 pieni e 10 vuoti. È una riga, non un'icona,
              quindi si riproduce con un gradiente ripetuto invece di portarsi
              dietro un SVG stirato. */}
          <span
            aria-hidden
            className="absolute left-0 top-[25px] h-[659px] w-[3px]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to bottom, #fff 0 10px, transparent 10px 20px)',
            }}
          />
        </div>
      </div>
    </>
  )
}
