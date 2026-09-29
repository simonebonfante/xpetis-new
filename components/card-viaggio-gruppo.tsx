import Image from 'next/image'
import Link from 'next/link'
import { FotoVetrina } from '@/components/foto-vetrina'
import { urlMedia, type ViaggioDiGruppo } from '@/lib/vetrina'

/**
 * Una card di "Viaggi di gruppo" (Figma nuovo, nodi 18:5959 e seguenti della
 * vetrina 2-743, uguali nella 72-48). È la sorella di `card-itinerario.tsx` —
 * stessa foto, stessa scheda bianca con la cucitura tratteggiata, stesso tasto.
 *
 * **Il tasto porta alla pagina del viaggio** (Figma 3-1121) dal 29 settembre,
 * quando `td_group_trips` ha avuto il suo slug (migration 0051). Fino a quel
 * giorno la card non aveva tasto: un tasto verso un 404 è peggio di nessun
 * tasto. **Non porta a una cassa**: il viaggio di gruppo è vetrina, e nemmeno
 * la sua pagina vende niente.
 *
 * **Ha le date, che il Figma della card non disegna.** Le aggiunsi il 28
 * settembre perché la pagina del viaggio non c'era e senza le date non
 * comparivano da nessuna parte. Quella ragione è caduta; resta l'altra — una
 * partenza passata ("14 – 25 set 2025") che si legge come passata è l'unica
 * difesa che oggi esiste contro un viaggio finito ancora in vetrina. Se
 * toglierle è una domanda per Chiara, in PIANO.md.
 *
 * Tutti i campi sono le stringhe del designer, senza riformattarle.
 */
export function CardViaggioGruppo({
  viaggio,
  href,
}: {
  viaggio: ViaggioDiGruppo
  /**
   * `percorsoViaggioDiGruppo(designer, viaggio.slug)`: il contratto sta in
   * `lib/vetrina.ts`. `null` se il viaggio non ha slug (database senza 0051).
   */
  href: string | null
}) {
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

        {/* Il tondo della freccia nel Figma nuovo è un cerchio rosso senza
            freccia (un livello perso, nodo 18:5990): si usa la stessa freccia
            delle card degli itinerari. */}
        {/* Senza `href` il tasto non c'è: è il database a cui manca ancora la
            0051 (nessuno slug, quindi nessun indirizzo). Meglio nessun tasto
            che uno verso `/viaggio-di-gruppo/undefined`. */}
        {href && (
          <Link href={href} className="group mt-auto flex items-center gap-2 pt-6">
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
        )}
      </div>
    </article>
  )
}
