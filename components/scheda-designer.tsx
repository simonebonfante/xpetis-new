import Link from 'next/link'
import { FotoVetrina } from '@/components/foto-vetrina'
import type { Vetrina } from '@/lib/vetrina'

/**
 * La scheda del designer: la sua foto, il suo nome, e la via per la vetrina.
 *
 * La usano le due pagine figlie della vetrina — l'itinerario pronto (Figma
 * 3-1386) e il viaggio di gruppo (3-1121), che la disegnano uguale. In
 * entrambi i disegni accanto alla foto c'è la **descrizione lunga del
 * viaggio**, che non esiste come campo né per l'uno né per l'altro: al suo
 * posto la headline del designer, che parla di lui e non del viaggio, ed è la
 * sola frase che la vista dà e che qui non è fuori posto.
 */
export function SchedaDesigner({ vetrina }: { vetrina: Vetrina }) {
  return (
    <div className="rounded-[15px] bg-neutro p-6 lg:px-8 lg:py-[39px]">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start lg:gap-[21px]">
        <div className="relative size-[200px] shrink-0 overflow-hidden rounded-[10px] lg:size-[243px]">
          <FotoVetrina
            src={vetrina.photo_url}
            alt={vetrina.display_name}
            sizes="(min-width: 1024px) 243px, 200px"
          />
        </div>

        <div>
          {/* Nel disegno, in questo spazio, c'è la descrizione lunga
              dell'itinerario: non esiste come campo. Resta la firma, che è il
              senso della scheda — questo itinerario ha un autore — con la sua
              headline, che parla del designer e non del viaggio: è la sola frase
              che la vista dà e che qui non è fuori posto. */}
          {/* Figma nuovo: il testo in Merriweather 24 in alto, il nome sotto.
              Qui il testo è la headline, e il nome è un link alla vetrina. */}
          {vetrina.headline && (
            <p className="max-w-[534px] font-titoli text-[20px] leading-[1.4] lg:text-[24px] lg:leading-[34px]">
              {vetrina.headline}
            </p>
          )}
          <h2 className={`${vetrina.headline ? 'mt-6' : ''} font-titoli text-[26px] font-bold leading-tight`}>
            <Link href={`/designer/${vetrina.slug}`} className="hover:text-primario">
              {vetrina.display_name}
            </Link>
          </h2>
        </div>
      </div>
    </div>
  )
}
