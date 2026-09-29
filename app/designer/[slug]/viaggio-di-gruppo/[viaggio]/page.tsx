import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CardViaggioGruppo } from '@/components/card-viaggio-gruppo'
import { FotoVetrina } from '@/components/foto-vetrina'
import { SchedaDesigner } from '@/components/scheda-designer'
import {
  leggiVetrina,
  percorsoViaggioDiGruppo,
  trovaViaggioDiGruppo,
  urlMedia,
  type Vetrina,
  type ViaggioDiGruppo,
} from '@/lib/vetrina'

/**
 * Un viaggio di gruppo — Figma nuovo `Q9Krydv6xD8mFJCtU9NHzr`, nodo 3-1121.
 *
 * La destinazione di "Ottieni maggiori informazioni" sulle card della vetrina.
 * **L'indirizzo porta lo slug del viaggio** (`/designer/<designer>/
 * viaggio-di-gruppo/<slug>`, migration 0051), mai la sua posizione: con un
 * ordinale, riordinare i viaggi farebbe rispondere 200 ai link vecchi con un
 * viaggio diverso. È la storia della 0033, e la pagina è la gemella di quella
 * dell'itinerario pronto.
 *
 * ## La regola di questa pagina: i campi sono sei
 *
 * Il form Vetrina TD dà per ogni viaggio **titolo, date, giorni, persone,
 * prezzo, immagine**, e nient'altro (`vetrina_nuova.json`, chiave `gruppo`).
 * Istruzione di Simone, 29 settembre: *se non abbiamo i dati per quella parte,
 * non la facciamo* — né con un segnaposto, né con un «da compilare». Quindi il
 * disegno si costruisce solo dove ha una sorgente, e il resto è in `PIANO.md`
 * come domanda per Alessandro:
 *
 *  · **"Questo viaggio fa per me?"** — sei temi con un voto a stelle
 *    (Natura, Trekking, On the Road, City, Cultura, Chill). Nessun campo del
 *    viaggio li dice; i temi del *designer* sono un'altra cosa.
 *  · **"Le tappe del viaggio"** — sei tappe con giorni, titolo e descrizione.
 *  · **"Informazioni utili"** — valigia, cosa comprende la quota, sanità e
 *    visti. Il secondo sarebbe anche una promessa commerciale.
 *  · **"Fascia d'età"** nella scheda del prezzo.
 *  · **"volo non incluso • IVA inclusa"** sotto il prezzo. Per gli itinerari
 *    pronti è una riga di `app_config`; per i viaggi di gruppo nessuno ha
 *    detto cosa comprende il prezzo, e riusare quella riga lo direbbe per loro.
 *  · **Il paese** nella riga "Progettato da … • 12 giorni • Argentina e Cile":
 *    il viaggio non dichiara la sua destinazione.
 *  · **La descrizione lunga** accanto alla foto del designer, e **la galleria a
 *    tre** con "Mostra tutte le foto": `image_path` è una foto sola, che qui
 *    riempie la larghezza della galleria (come nell'itinerario pronto).
 *
 * ## Cosa non si fa qui: comprare
 *
 * **"Acquista il posto" non c'è.** Il Flusso non prevede di comprare un viaggio
 * di gruppo dal sito: sono solo vetrina (0048: nessuna cassa, nessun ordine,
 * `orders.service_type` non ammette `group_trip`). È Figma che aggiunge un
 * comportamento, e si segnala invece di costruirlo.
 *
 * **"Contatta il Travel Designer" diventa "Prenota una call con …"**, e porta
 * alla scheda della call in vetrina. Il designer non ha un contatto pubblico
 * (principio 1): la sola porta verso di lui è la consulenza, che si paga. Un
 * tasto che dice «contatta» e apre una prenotazione a pagamento prometterebbe
 * una cosa e ne farebbe un'altra. Anche questo è in `PIANO.md`.
 */

type Props = {
  params: Promise<{ slug: string; viaggio: string }>
}

/**
 * Vetrina e viaggio che l'URL nomina. Uno slug che quel designer non ha è un
 * 404, non un ripiego sul primo viaggio: è un link inventato, o il viaggio di
 * un altro designer.
 */
async function leggiViaggio(
  slugDesigner: string,
  slugViaggio: string,
): Promise<{ vetrina: Vetrina; viaggio: ViaggioDiGruppo } | null> {
  const vetrina = await leggiVetrina(slugDesigner)
  if (!vetrina) return null

  const viaggio = trovaViaggioDiGruppo(vetrina.group_trips ?? [], slugViaggio)
  if (!viaggio) return null

  return { vetrina, viaggio }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, viaggio } = await params
  const trovato = await leggiViaggio(slug, viaggio)
  if (!trovato) return { title: 'Viaggio di gruppo · XPETIS' }
  return {
    title: `${trovato.viaggio.title} · ${trovato.vetrina.display_name} · XPETIS`,
    description: trovato.vetrina.headline ?? undefined,
  }
}

/** Le righe della scheda: solo quelle che il designer ha scritto. */
function righe(viaggio: ViaggioDiGruppo): { etichetta: string; valore: string }[] {
  return [
    { etichetta: 'Date', valore: viaggio.dates_label },
    { etichetta: 'Durata', valore: viaggio.duration_label },
    { etichetta: 'Persone previste', valore: viaggio.group_size_label },
    // "Fascia d'età" è nel disegno, non nel form.
  ].filter((r): r is { etichetta: string; valore: string } => Boolean(r.valore && r.valore.trim()))
}

/**
 * La scheda bianca a destra della foto. Prezzo, date, durata e persone sono le
 * stringhe del designer, mostrate come le ha scritte: "1.380€" non si
 * riformatta, perché non sappiamo se vuol dire 1.380,00 o "da 1.380".
 */
function SchedaViaggio({ viaggio, vetrina }: { viaggio: ViaggioDiGruppo; vetrina: Vetrina }) {
  const dettagli = righe(viaggio)

  return (
    <div className="flex flex-col rounded-[15px] bg-neutro p-6 lg:px-[34px] lg:py-5">
      {viaggio.price_label && (
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-[24px] leading-[2] tracking-[-0.264px]">A partire da</p>
          <p className="font-titoli text-[36px] font-bold leading-[34px] text-primario">
            {viaggio.price_label}
          </p>
        </div>
      )}

      {dettagli.length > 0 && (
        <dl className={viaggio.price_label ? 'mt-6 lg:mt-[37px]' : ''}>
          {dettagli.map((riga, i) => (
            <div
              key={riga.etichetta}
              className={`grid gap-1 py-[13px] sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4 ${
                i === 0 ? 'border-t border-dashed border-scuro' : ''
              } border-b border-dashed border-scuro`}
            >
              <dt className="text-[18px] font-bold leading-[1.5] tracking-[-0.198px]">
                {riga.etichetta}
              </dt>
              <dd className="text-[18px] leading-[1.5] tracking-[-0.198px]">{riga.valore}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Il disegno ha qui due tasti rossi: "Acquista il posto" (non esiste,
          vedi in testa) e "Contatta il Travel Designer", che porta alla
          scheda della call — è là che si prenota, col login prima se serve. */}
      <Link
        href={`/designer/${vetrina.slug}#servizi`}
        className="mt-auto block rounded-[30px] bg-primario px-5 py-2 text-center text-corpo text-neutro transition hover:brightness-110 lg:mt-10"
      >
        Prenota una call con {vetrina.display_name}
      </Link>
    </div>
  )
}

export default async function PaginaViaggioDiGruppo({ params }: Props) {
  const { slug, viaggio: slugViaggio } = await params

  const trovato = await leggiViaggio(slug, slugViaggio)
  if (!trovato) notFound()

  const { vetrina, viaggio } = trovato
  const altri = (vetrina.group_trips ?? []).filter((riga) => riga.slug !== viaggio.slug)

  return (
    <div className="bg-crema">
      <Header />

      <section className="px-4 pb-16 pt-[120px] lg:px-0 lg:pb-[89px] lg:pt-[172px]">
        <div className="mx-auto max-w-[1312px]">
          {/* Il filo del Figma è "Viaggi di gruppo > Argentina: …": un indice
              dei viaggi di gruppo non esiste, quindi la prima voce porta alla
              sezione della vetrina che li elenca. */}
          <nav aria-label="Dove sei" className="text-corpo">
            <Link href={`/designer/${vetrina.slug}`} className="hover:text-primario">
              {vetrina.display_name}
            </Link>
            <span aria-hidden> &gt; </span>
            <Link href={`/designer/${vetrina.slug}#viaggi-di-gruppo`} className="hover:text-primario">
              Viaggi di gruppo
            </Link>
          </nav>

          <h1 className="mt-6 font-titoli text-[40px] font-bold leading-tight">{viaggio.title}</h1>

          {/* "Progettato da … • 12 giorni". Il terzo pezzo del disegno è il
              paese, che il viaggio non dichiara. */}
          <p className="mt-6 text-corpo">
            Progettato da {vetrina.display_name}
            {viaggio.duration_label && ` • ${viaggio.duration_label}`}
          </p>

          <div className="mt-8 grid gap-6 lg:mt-[37px] lg:grid-cols-[minmax(0,1fr)_424px]">
            {/* Una foto, non tre: occupa la larghezza di tutta la galleria del
                disegno, così il vuoto non si vede. */}
            <div className="relative h-[300px] overflow-hidden rounded-[15px] lg:h-[452px]">
              <FotoVetrina
                src={urlMedia(viaggio.image_path)}
                alt={viaggio.title}
                sizes="(min-width: 1024px) 868px, 100vw"
              />
            </div>

            <SchedaViaggio viaggio={viaggio} vetrina={vetrina} />
          </div>

          <div className="mt-6 lg:max-w-[868px]">
            <SchedaDesigner vetrina={vetrina} />
          </div>

          {/* Qui il disegno mette "Questo viaggio fa per me?", poi "Le tappe
              del viaggio" e "Informazioni utili". Nessuna delle tre ha una
              sorgente: vedi in testa. */}
        </div>
      </section>

      {/* ----------------------------------------------- Altri viaggi di gruppo
          Gli altri **di questo designer**: sono i soli che la vetrina conosce. */}
      {altri.length > 0 && (
        <section className="bg-crema px-4 pb-16 lg:px-0 lg:pb-[120px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2 lg:leading-[70px]">
              Altri viaggi di gruppo
            </h2>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-[86px] lg:grid-cols-3">
              {altri.map((riga) => (
                <CardViaggioGruppo
                  key={riga.slug}
                  viaggio={riga}
                  href={percorsoViaggioDiGruppo(vetrina.slug, riga.slug)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  )
}
