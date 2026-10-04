'use client'

import { useEffect, useRef } from 'react'
import { FotoVetrina } from '@/components/foto-vetrina'

/**
 * Le foto di un itinerario o di un viaggio di gruppo: una grande e due
 * piccole, come nel tool, più «Mostra tutte le foto (N)», che apre l'elenco
 * intero in un `<dialog>` nativo (chiusura con Esc e con il tasto).
 *
 * Il Figma non disegna la galleria aperta, il tool ne ha una semplice: questa
 * è altrettanto semplice (D-25). Con una foto sola la foto occupa tutto e il
 * tasto non c'è; senza foto, il componente non esce.
 *
 * Riceve solo gli URL già risolti dal server e il titolo per gli `alt`.
 */
export function GalleriaVoce({ foto, titolo }: { foto: string[]; titolo: string }) {
  const dialogo = useRef<HTMLDialogElement>(null)

  // Il dialogo aperto non deve far scorrere la pagina sotto.
  useEffect(() => {
    const d = dialogo.current
    if (!d) return
    const chiudi = () => document.body.classList.remove('overflow-hidden')
    d.addEventListener('close', chiudi)
    return () => d.removeEventListener('close', chiudi)
  }, [])

  if (!foto.length) return null

  const apri = () => {
    document.body.classList.add('overflow-hidden')
    dialogo.current?.showModal()
  }

  const piccole = foto.slice(1, 3)

  return (
    <>
      <div className={`grid gap-[10px] ${piccole.length ? 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
        <div className="relative h-[280px] overflow-hidden rounded-[15px] sm:h-[400px] lg:h-[452px]">
          <FotoVetrina src={foto[0]} alt={titolo} sizes="(min-width: 1024px) 580px, 100vw" />
          {foto.length > 1 && (
            <button
              type="button"
              onClick={apri}
              className="absolute bottom-4 left-4 rounded-[20px] bg-neutro px-4 py-2 text-[14px] text-scuro shadow transition hover:bg-crema"
            >
              Mostra tutte le foto ({foto.length})
            </button>
          )}
        </div>
        {piccole.length > 0 && (
          <div className={`hidden gap-[10px] sm:grid ${piccole.length > 1 ? 'sm:grid-rows-2' : 'sm:grid-rows-1'}`}>
            {piccole.map((src, i) => (
              <div key={src} className="relative overflow-hidden rounded-[15px]">
                <FotoVetrina src={src} alt={`${titolo}, foto ${i + 2}`} sizes="290px" />
              </div>
            ))}
          </div>
        )}
      </div>

      <dialog
        ref={dialogo}
        aria-label={`Foto di ${titolo}`}
        className="m-auto max-h-[90vh] w-[min(1100px,calc(100vw-32px))] rounded-[20px] bg-crema p-0 backdrop:bg-scuro/80"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-crema px-5 py-4">
          <p className="font-titoli text-[18px] font-bold">{titolo}</p>
          <button
            type="button"
            onClick={() => dialogo.current?.close()}
            className="rounded-[20px] bg-scuro px-4 py-2 text-[14px] text-neutro"
          >
            Chiudi
          </button>
        </div>
        <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          {foto.map((src, i) => (
            <li key={src} className="relative aspect-[4/3] overflow-hidden rounded-[12px]">
              <FotoVetrina src={src} alt={`${titolo}, foto ${i + 1}`} sizes="(min-width: 640px) 540px, 100vw" />
            </li>
          ))}
        </ul>
      </dialog>
    </>
  )
}
