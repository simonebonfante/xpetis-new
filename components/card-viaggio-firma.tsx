'use client'

import Image from 'next/image'
import { useState } from 'react'
import { FotoVetrina } from '@/components/foto-vetrina'

/**
 * Una card di "Alcuni dei miei viaggi" (Figma 171:114).
 *
 * Foto a piena card, velo che scurisce **dall'alto** — al contrario delle card
 * di `/ricerca` — e sopra il velo la riga di tag, il titolo e il racconto. In
 * basso le due frecce tonde e i pallini della galleria.
 *
 * È l'unico componente client di questa pagina. Il Figma disegna una galleria
 * con frecce e indicatore di posizione: senza stato quei comandi sarebbero
 * decorazione, e un comando che non comanda è peggio di un comando assente.
 * Nessun dato sensibile passa di qui — sono percorsi di foto pubbliche.
 */

type Props = {
  titolo: string
  descrizione: string | null
  /**
   * Le URL delle foto, **già risolte dal server**. Il componente non chiama
   * `urlMedia` da sé di proposito: `lib/vetrina.ts` è la porta server-side verso
   * la vetrina e importarla da qui trascinerebbe il client Supabase nel bundle
   * del browser. Un `null` in lista è una foto che non si può mostrare, e la
   * card la rende come riquadro neutro senza saltare la posizione.
   */
  foto: (string | null)[]
  /**
   * Le etichette della riga in cima. Il Figma ne mostra tre (destinazione,
   * durata, contesto) ma **il form non le raccoglie per viaggio**: `viaggi[]`
   * ha titolo, descrizione e foto, e basta. Le passa la pagina, che oggi usa i
   * paesi coperti dal designer; il giorno in cui il form le chiedesse davvero,
   * si cambia solo la sorgente.
   */
  etichette: string[]
}

export function CardViaggioFirma({ titolo, descrizione, foto, etichette }: Props) {
  const [indice, setIndice] = useState(0)
  const quante = foto.length
  const scorri = (passo: number) => setIndice((i) => (i + passo + quante) % quante)

  return (
    <article className="relative isolate flex h-[559px] flex-col overflow-hidden rounded-[30px] bg-scuro">
      <FotoVetrina
        src={foto[indice] ?? null}
        sizes="(min-width: 1024px) 424px, 100vw"
        className="-z-10"
      />
      {/* Il velo: trasparente in cima al 13%, nero all'80% in fondo, ruotato —
          cioè scuro sopra, dove stanno testo e tag. */}
      <div
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,transparent_12.981%,rgba(0,0,0,0.9)_100%)]"
        aria-hidden
      />

      <div className="flex flex-1 flex-col gap-6 p-6 text-neutro">
        {etichette.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {etichette.map((e) => (
              <li
                key={e}
                className="rounded-[20px] border border-primario bg-neutro px-5 py-1 text-[8px] leading-none text-scuro"
              >
                {e}
              </li>
            ))}
          </ul>
        )}

        <h3 className="font-testo text-[24px] font-bold leading-tight">{titolo}</h3>

        {descrizione && <p className="text-corpo">{descrizione}</p>}
      </div>

      {quante > 1 && (
        <div className="relative flex items-center justify-between p-6">
          <button
            type="button"
            onClick={() => scorri(-1)}
            aria-label="Foto precedente"
            className="transition hover:brightness-110"
          >
            <Image src="/img/galleria-prec.svg" alt="" width={40} height={40} className="size-10" />
          </button>

          <ul className="absolute inset-x-0 bottom-4 mx-auto flex w-fit gap-[3px]" aria-hidden>
            {foto.map((url, i) => (
              <li
                key={url ?? i}
                className={`size-[6px] rounded-full ${i === indice ? 'bg-crema' : 'bg-neutro'}`}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={() => scorri(1)}
            aria-label="Foto successiva"
            className="transition hover:brightness-110"
          >
            <Image src="/img/galleria-succ.svg" alt="" width={40} height={40} className="size-10" />
          </button>
        </div>
      )}
    </article>
  )
}
