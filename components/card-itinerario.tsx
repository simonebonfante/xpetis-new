import Image from 'next/image'
import Link from 'next/link'
import { FotoVetrina } from '@/components/foto-vetrina'
import { etichettaGiorni, prezzoVetrina } from '@/lib/vetrina-vista'
import { urlMedia, type ItinerarioPronto } from '@/lib/vetrina'

/**
 * Una card di «Itinerari pronti da vivere». Forma dal tool vetrina v6 (dal 3
 * ottobre 2026 il riferimento per vetrina, itinerario e gruppo, D1): foto con
 * la pillola «♥ Personalizzabile» e i paesi del viaggio, poi la scheda bianca
 * con titolo, giorni, prezzo e il tasto verso la pagina dell'itinerario.
 *
 * **La pillola resta** (decisione di Simone, 3 ottobre): i viaggiatori devono
 * sapere che sono esempi, e che tutto è personalizzabile. Il ♥ è la sua icona,
 * non un comando «preferiti».
 *
 * Durata e prezzo sono testo libero del designer, indicazioni di vetrina (0026):
 * nessun pagamento nasce da questa riga, e il tasto porta alla pagina
 * dell'itinerario, dove l'unica azione è prenotare una call. Senza prezzo, al
 * posto di «A partire da» esce `prezzoMancante` (`app_config`), o niente.
 */
export function CardItinerario({
  itinerario,
  href,
  prezzoMancante,
}: {
  itinerario: ItinerarioPronto
  href: string
  /** Il testo di `showcase_price_on_request`, o `null` se la riga è vuota. */
  prezzoMancante: string | null
}) {
  const prezzo = prezzoVetrina(itinerario.price_label)
  const giorni = etichettaGiorni(itinerario.duration_label)
  const paesi = itinerario.countries ?? []

  return (
    <article className="flex flex-col">
      <div className="relative h-[240px] overflow-hidden rounded-[25px] lg:h-[260px]">
        <FotoVetrina
          src={urlMedia(itinerario.image_path)}
          alt={itinerario.title}
          sizes="(min-width: 1024px) 424px, 100vw"
        />
        <span className="absolute left-4 top-3 inline-flex items-center gap-[8px] rounded-[20px] border border-primario bg-neutro px-4 py-[7px] text-[13px] leading-none text-scuro">
          {/* 11×10: gli SVG del Figma hanno `preserveAspectRatio="none"`, quindi
              le due misure vanno date entrambe e giuste. */}
          <Image src="/img/icona-cuore.svg" alt="" width={11} height={10} className="h-[10px] w-[11px] shrink-0" />
          Personalizzabile
        </span>
        {paesi.length > 0 && (
          <ul className="absolute right-4 top-3 flex max-w-[55%] flex-wrap justify-end gap-[6px]">
            {paesi.map((p) => (
              <li key={p} className="rounded-[20px] border border-primario bg-neutro px-4 py-[7px] text-[13px] leading-none text-scuro">
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="-mt-8 flex flex-1 flex-col rounded-[30px] bg-neutro px-6 pb-5 pt-7 text-scuro lg:px-[34px]">
        <h3 className="font-titoli text-[22px] font-bold leading-[1.35] lg:text-[24px]">{itinerario.title}</h3>

        <div className="-mx-6 mt-6 grid grid-cols-2 border-t border-dashed border-scuro py-4 lg:-mx-[34px]">
          <p className="px-6 text-[18px] leading-[1.5] lg:px-[34px]">{giorni ?? ''}</p>
          {(prezzo || prezzoMancante) && (
            <div className="border-l border-dashed border-scuro px-6 lg:px-[26px]">
              {prezzo ? (
                <>
                  <p className="text-[16px] leading-[1.6]">A partire da</p>
                  <p className="font-titoli text-[30px] font-bold leading-[34px] text-primario lg:text-[32px]">{prezzo}</p>
                </>
              ) : (
                <p className="text-[16px] italic leading-[1.5] text-primario">{prezzoMancante}</p>
              )}
            </div>
          )}
        </div>

        <Link href={href} className="group mt-auto flex items-center gap-2">
          <span className="flex-1 rounded-[30px] bg-primario px-5 py-2 text-center text-corpo text-neutro transition group-hover:brightness-110">
            Ottieni maggiori informazioni
          </span>
          <Image src="/img/freccia-diagonale.svg" alt="" width={40} height={40} className="size-10 shrink-0" />
        </Link>
      </div>
    </article>
  )
}
