'use client'

import { useState } from 'react'

/**
 * Le card delle recensioni, tre alla volta: «Carica altre recensioni» ne
 * aggiunge tre e sparisce quando sono finite, come nel tool. Riceve solo i
 * campi che disegna.
 */
type Voce = {
  titolo: string | null
  nome: string | null
  stelle: number
  data: string | null
  testo: string | null
}

const PASSO = 3

export function ElencoRecensioni({ recensioni }: { recensioni: Voce[] }) {
  const [quante, setQuante] = useState(PASSO)
  const mostrate = recensioni.slice(0, quante)

  return (
    <>
      <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:mt-[34px] lg:grid-cols-3">
        {mostrate.map((r, i) => (
          <li key={i} className="flex flex-col">
            <div className="relative rounded-[25px] bg-crema px-6 pb-7 pt-6">
              {r.titolo && (
                <p className="mb-[14px] font-titoli text-[20px] font-bold leading-[1.25] text-primario">“{r.titolo}”</p>
              )}
              {r.nome && <p className="text-corpo font-medium text-primario">{r.nome}</p>}
            </div>
            <div className="-mt-[2px] flex flex-1 flex-col rounded-[30px] bg-neutro px-6 pb-5 pt-6">
              <p className="mb-3 text-[15px] tracking-[2px] text-primario">
                <span aria-hidden>{'★'.repeat(r.stelle) + '☆'.repeat(5 - r.stelle)}</span>
                <span className="sr-only">{r.stelle} stelle su 5</span>
              </p>
              {r.testo && <p className="mb-4 flex-1 text-[14px] leading-[1.5]">{r.testo}</p>}
              {r.data && <p className="border-t border-crema pt-3 text-corpo text-scuro/70">{r.data}</p>}
            </div>
          </li>
        ))}
      </ul>
      {recensioni.length > quante && (
        <div className="mt-[22px] flex justify-end">
          <button
            type="button"
            onClick={() => setQuante((n) => n + PASSO)}
            className="text-corpo text-neutro underline hover:no-underline"
          >
            Carica altre recensioni
          </button>
        </div>
      )}
    </>
  )
}
