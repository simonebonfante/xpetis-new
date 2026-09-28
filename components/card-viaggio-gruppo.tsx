import { FotoVetrina } from '@/components/foto-vetrina'
import { urlMedia, type ViaggioDiGruppo } from '@/lib/vetrina'

/**
 * Una card di "Viaggi di gruppo" (Figma nuovo, nodi 18:5959 e seguenti della
 * vetrina 2-743). È la sorella di `card-itinerario.tsx` — stessa foto, stessa
 * scheda bianca con la cucitura tratteggiata — con due differenze volute.
 *
 * **Non ha tasto.** Il Figma ci mette "Ottieni maggiori informazioni", che
 * porterebbe alla pagina del viaggio (nodo 3-1121). Quella pagina non esiste,
 * perché un indirizzo stabile vuole uno slug che `td_group_trips` non ha: un
 * tasto verso un 404 è peggio di nessun tasto. Né una cassa: il viaggio di
 * gruppo è vetrina.
 *
 * **Ha le date, che il Figma della card non disegna.** Le disegna solo nella
 * pagina del viaggio, che qui non c'è: senza, le date non comparirebbero da
 * nessuna parte. E una partenza passata ("14 – 25 set 2025") che si vede come
 * passata è l'unica difesa che oggi esiste contro un viaggio finito che resta
 * in vetrina — la domanda su chi lo toglie è aperta in PIANO.md.
 *
 * Tutti i campi sono le stringhe del designer, senza riformattarle.
 */
export function CardViaggioGruppo({ viaggio }: { viaggio: ViaggioDiGruppo }) {
  const dettagli = [viaggio.dates_label, viaggio.duration_label, viaggio.group_size_label].filter(
    (riga): riga is string => Boolean(riga && riga.trim()),
  )

  return (
    <article className="flex flex-col">
      <div className="relative h-[335px] overflow-hidden rounded-[25px]">
        <FotoVetrina
          src={urlMedia(viaggio.image_path)}
          alt={viaggio.title}
          sizes="(min-width: 1024px) 424px, 100vw"
        />
      </div>

      <div className="-mt-8 flex flex-1 flex-col rounded-[30px] bg-neutro px-[34px] pb-6 pt-8">
        <h3 className="font-titoli text-[24px] font-bold leading-[34px]">{viaggio.title}</h3>

        {(dettagli.length > 0 || viaggio.price_label) && (
          <div className="-mx-[26px] mt-6 flex items-stretch border-t border-dashed border-scuro pt-4">
            <ul className="flex-1 px-[26px] text-[18px] leading-[1.5] tracking-[-0.198px]">
              {dettagli.map((riga) => (
                <li key={riga}>{riga}</li>
              ))}
            </ul>
            {viaggio.price_label && (
              <div className="flex-1 border-l border-dashed border-scuro px-[26px] pb-4">
                <p className="text-[18px] leading-[2] tracking-[-0.198px]">A partire da</p>
                <p className="font-titoli text-[36px] font-bold leading-[34px] text-primario">
                  {viaggio.price_label}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
