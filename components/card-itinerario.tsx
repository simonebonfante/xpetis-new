import Image from 'next/image'
import Link from 'next/link'
import { FotoVetrina } from '@/components/foto-vetrina'
import { urlMedia, type ItinerarioPronto } from '@/lib/vetrina'

/**
 * Una card di "Itinerari pronti da vivere" (Figma 205:190 e seguenti): foto con
 * il bollino "Personalizzabile", poi la scheda bianca con titolo, durata,
 * prezzo indicativo e il tasto verso la pagina dell'itinerario.
 *
 * Durata e prezzo sono **testo libero**, non numeri: arrivano dal form come
 * "12 giorni" e "1.380€" e sono indicazioni di vetrina (deroga consapevole della
 * migration 0026). Nessun pagamento nasce da questa riga, e infatti il tasto non
 * porta a una cassa: porta alla pagina dell'itinerario, dove l'unica azione è
 * prenotare una call. La compravendita dell'itinerario pronto non esiste in
 * nessun punto del sito, per il Flusso.
 */
export function CardItinerario({
  itinerario,
  href,
}: {
  itinerario: ItinerarioPronto
  /** `percorsoItinerario(slug, indice)`: il contratto sta in `lib/vetrina.ts`. */
  href: string
}) {
  return (
    <article className="flex flex-col">
      <div className="relative h-[335px] overflow-hidden rounded-[25px]">
        <FotoVetrina
          src={urlMedia(itinerario.image_path)}
          sizes="(min-width: 1024px) 424px, 100vw"
        />
        <span className="absolute left-4 top-3 inline-flex items-center gap-[10px] rounded-[20px] border border-primario bg-neutro px-5 py-2 text-[12px] leading-none text-scuro">
          {/* 11×10: gli SVG del Figma hanno `preserveAspectRatio="none"`, quindi
              le due misure vanno date entrambe e giuste. */}
          <Image
            src="/img/icona-cuore.svg"
            alt=""
            width={11}
            height={10}
            className="h-[10px] w-[11px] shrink-0"
          />
          Personalizzabile
        </span>
      </div>

      <div className="-mt-8 flex flex-1 flex-col rounded-[30px] bg-neutro p-6">
        <h3 className="font-titoli text-[24px] font-bold leading-[34px]">{itinerario.title}</h3>

        <div className="mt-6 flex items-end justify-between gap-4 border-t border-dashed border-scuro/30 pt-4">
          <p className="text-[18px] leading-[1.5] tracking-[-0.198px]">
            {itinerario.duration_label ?? ' '}
          </p>
          {itinerario.price_label && (
            <div className="border-l border-dashed border-scuro/30 pl-4 text-right">
              <p className="text-[18px] leading-[2] tracking-[-0.198px]">A partire da</p>
              <p className="font-titoli text-[36px] font-bold leading-[34px] text-primario">
                {itinerario.price_label}
              </p>
            </div>
          )}
        </div>

        {/* Il tasto naviga dal 23 agosto: la pagina dell'itinerario (Figma
            261:1068) esiste. Fino a quel giorno era uno `span` spento, perché la
            sua destinazione era un 404. */}
        <Link href={href} className="group mt-6 flex items-center gap-2">
          <span className="flex-1 rounded-[30px] bg-primario px-5 py-2 text-center text-corpo text-neutro transition group-hover:brightness-110">
            Ottieni maggiori informazioni
          </span>
          <Image
            src="/img/freccia-diagonale.svg"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0"
          />
        </Link>
      </div>
    </article>
  )
}
