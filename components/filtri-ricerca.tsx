'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

type Tag = { code: string; label_it: string }

/**
 * La colonna bianca dei filtri del Figma 177:262.
 *
 * I filtri vivono nell'URL, non in uno stato del browser: ogni scatto riscrive
 * la query e la pagina risultati — che è un Server Component — richiama
 * `match_designers()`. È il "ricalcolo live" del Flusso fatto con una chiamata
 * indicizzata al server, non con un ricalcolo nel browser: i livelli dei paesi e
 * i valori degli assi non devono uscire da lì.
 *
 * Manca il terzo gruppo disegnato, "QUALE TIPO DI SUPPORTO CERCHI?", e con lui
 * il tasto "Filtri avanzati": `match_designers()` accetta solo tema e contesto,
 * e i servizi attivi di un designer non possono filtrare dal browser. Servono un
 * parametro nuovo sulla funzione e una migration — decisione di Simone, non
 * un'omissione. Un gruppo di caselle che non filtrano sarebbe peggio del vuoto.
 *
 * **La maschera contestuale** (Flusso §1, migration 0036) arriva in
 * `disponibili`: con una destinazione scelta i chip si riducono a quelli che su
 * quella destinazione esistono davvero, perché uno scatto che non può che dare
 * zero risultati è un invito a un vicolo cieco. Senza destinazione la lista
 * contiene tutti i tag e non maschera niente.
 */
export function FiltriRicerca({
  temi,
  contesti,
  disponibili,
  linkQuiz,
}: {
  temi: Tag[]
  contesti: Tag[]
  /**
   * I codici che la destinazione ammette. Array e non `Set` per non dipendere da
   * cosa il confine server/client sa serializzare: qui dentro diventa un `Set`.
   */
  disponibili: string[]
  linkQuiz: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [inCorso, avvia] = useTransition()

  const attivi = (chiave: string) =>
    (searchParams.get(chiave) ?? '').split(',').filter(Boolean)

  const ammessi = new Set(disponibili)

  function scatta(chiave: string, codice: string) {
    const correnti = attivi(chiave)
    const nuovi = correnti.includes(codice)
      ? correnti.filter((c) => c !== codice)
      : [...correnti, codice]

    const params = new URLSearchParams(searchParams.toString())
    if (nuovi.length > 0) params.set(chiave, nuovi.join(','))
    else params.delete(chiave)
    // Cambiando i filtri l'elenco riparte dalla prima pagina.
    params.delete('n')

    avvia(() => router.push(`${pathname}?${params}`, { scroll: false }))
  }

  return (
    <aside
      className={`h-fit rounded-[25px] bg-neutro p-9 transition-opacity ${
        inCorso ? 'opacity-60' : ''
      }`}
      aria-busy={inCorso}
    >
      <Link
        href={linkQuiz}
        className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
      >
        <Image src="/img/deco-gruppo.svg" alt="" width={20} height={20} className="shrink-0" />
        Modifica le risposte del quiz!
      </Link>

      <Gruppo
        titolo="Che esperienza cerchi?"
        tag={temi}
        attivi={attivi('temi')}
        ammessi={ammessi}
        onScatto={(c) => scatta('temi', c)}
      />

      <hr className="my-8 border-scuro/15" />

      <Gruppo
        titolo="In che ambiente ti immagini?"
        tag={contesti}
        attivi={attivi('contesti')}
        ammessi={ammessi}
        onScatto={(c) => scatta('contesti', c)}
      />
    </aside>
  )
}

function Gruppo({
  titolo,
  tag,
  attivi,
  ammessi,
  onScatto,
}: {
  titolo: string
  tag: Tag[]
  attivi: string[]
  ammessi: Set<string>
  onScatto: (codice: string) => void
}) {
  // **Un filtro acceso si mostra sempre**, anche se la destinazione non lo
  // ammette. Succede cambiando meta con i filtri già scelti: nascondere il chip
  // lascerebbe la query filtrata da qualcosa di invisibile, che è il modo più
  // rapido di far sembrare rotto un elenco giusto. Resta visibile e si può
  // spegnere, con il titolo che dice perché è lì.
  const visibili = tag.filter((t) => ammessi.has(t.code) || attivi.includes(t.code))

  return (
    <fieldset className="mt-10">
      <legend className="mb-4 font-testo text-[14px] font-bold uppercase text-scuro">
        {titolo}
      </legend>

      {visibili.length === 0 ? (
        // Si dice, non si fa sparire il gruppo: un titolo senza chip è una
        // domanda ("dove sono finiti?"), una riga di testo è una risposta.
        <p className="text-corpo text-scuro/70">
          Nessuno su questa destinazione, per ora.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {visibili.map((t) => {
            const acceso = attivi.includes(t.code)
            const fuoriMaschera = !ammessi.has(t.code)
            return (
              <li key={t.code}>
                <button
                  type="button"
                  aria-pressed={acceso}
                  onClick={() => onScatto(t.code)}
                  title={
                    fuoriMaschera
                      ? 'Nessun designer lo dichiara su questa destinazione'
                      : undefined
                  }
                  className={`rounded-[20px] border border-primario px-5 py-2 text-corpo transition ${
                    acceso ? 'bg-primario text-neutro' : 'bg-neutro text-scuro hover:bg-crema'
                  } ${fuoriMaschera ? 'opacity-70' : ''}`}
                >
                  {t.label_it}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
