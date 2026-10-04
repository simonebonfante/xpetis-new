import Image from 'next/image'
import Link from 'next/link'
import { FotoVetrina } from '@/components/foto-vetrina'
import { StatoPartenzaChip } from '@/components/stato-partenza'
import { etichettaGiorni, persone, prezzoVetrina, prossimaPartenza } from '@/lib/vetrina-vista'
import { urlMedia, type ViaggioDiGruppo } from '@/lib/vetrina'

/**
 * Una card di «Viaggi di gruppo». Forma dal tool vetrina v6 (D1): foto con il
 * paese, titolo, prossima partenza con il suo stato, giorni e persone a
 * sinistra, prezzo a destra, tasto verso la pagina del viaggio.
 *
 * La **prossima partenza** la calcola il database all'ora di Roma (0054): la
 * prima futura non sold out, o la prima futura se lo sono tutte, **mai una
 * passata**. Il tool, senza partenze future, mostrerebbe l'ultima già andata;
 * qui la riga non esce.
 *
 * Le colonne di testo della 0048 (`dates_label`, `group_size_label`) non si
 * leggono più: le date sono vere dalla 0053.
 */
export function CardViaggioGruppo({
  viaggio,
  href,
  prezzoMancante,
  etichetta,
}: {
  viaggio: ViaggioDiGruppo
  href: string
  prezzoMancante: string | null
  /** «Viaggio di gruppo» sulle card di «Altri viaggi di gruppo», come nel tool. */
  etichetta?: string
}) {
  const prezzo = prezzoVetrina(viaggio.price_label)
  const giorni = etichettaGiorni(viaggio.duration_label)
  const quanti = persone(viaggio.participants_min, viaggio.participants_max)
  const prossima = prossimaPartenza(viaggio.next_departure)
  const paesi = viaggio.countries ?? []

  return (
    <article className="flex flex-col">
      <div className="relative h-[240px] overflow-hidden rounded-[25px] lg:h-[260px]">
        <FotoVetrina src={urlMedia(viaggio.image_path)} alt={viaggio.title} sizes="(min-width: 1024px) 424px, 100vw" />
        {etichetta && (
          <span className="absolute left-4 top-3 inline-flex items-center gap-[8px] rounded-[20px] border border-primario bg-neutro px-4 py-[7px] text-[13px] leading-none text-scuro">
            <Image src="/img/icona-cuore.svg" alt="" width={11} height={10} className="h-[10px] w-[11px] shrink-0" />
            {etichetta}
          </span>
        )}
        {paesi.length > 0 && !etichetta && (
          <ul className="absolute left-4 top-3 flex max-w-[80%] flex-wrap gap-[6px]">
            {paesi.map((p) => (
              <li key={p} className="rounded-[20px] border border-primario bg-neutro px-4 py-[7px] text-[13px] leading-none text-scuro">
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="-mt-8 flex flex-1 flex-col rounded-[30px] bg-neutro px-6 pb-5 pt-7 text-scuro lg:px-[34px]">
        <h3 className="font-titoli text-[22px] font-bold leading-[1.35] lg:text-[24px]">{viaggio.title}</h3>

        {prossima && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
            <span className="text-scuro/70">Prossima partenza</span>
            <span>{prossima.date}</span>
            <StatoPartenzaChip stato={prossima.stato} corta />
          </div>
        )}

        <div className="-mx-6 mt-5 grid grid-cols-2 border-t border-dashed border-scuro py-4 lg:-mx-[34px]">
          <ul className="px-6 text-[18px] leading-[1.5] lg:px-[34px]">
            {giorni && <li>{giorni}</li>}
            {quanti && <li>{quanti}</li>}
          </ul>
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
