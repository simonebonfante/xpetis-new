import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { BoxServizio } from '@/components/box-servizio'
import { CardViaggioFirma } from '@/components/card-viaggio-firma'
import { CardItinerario } from '@/components/card-itinerario'
import { RecensioniVetrina } from '@/components/recensioni-vetrina'
import { FotoVetrina } from '@/components/foto-vetrina'
import {
  leggiVetrina,
  paragrafi,
  siCompraInVetrina,
  urlMedia,
  type Servizio,
  type Vetrina,
} from '@/lib/vetrina'

/**
 * La vetrina del Travel Designer — Figma 171:17.
 *
 * Tutto arriva da `public_td_showcase` in una sola query. Nessuna vista nuova,
 * nessuna lettura diretta di tabella: quello che la vista non dice, questa
 * pagina non lo mostra, e dove è successo c'è scritto perché.
 *
 * Le quattro cose che il Figma disegna e questa pagina non mostra, ognuna con
 * la sua ragione, tutte reversibili:
 *
 *  1. **Il voto "4.6" sulla foto** e la sezione recensioni: non esistono
 *     recensioni. Vedi `components/recensioni-vetrina.tsx`.
 *  2. **La riga "Membro XPETIS"** della scheda hero: vuole `joined_at`, che
 *     `public_td_showcase` non espone. Vedi il commento in testa a
 *     `lib/vetrina.ts`.
 *  3. **La sezione "Viaggi di gruppo"**: non ha una sorgente. Vedi più sotto.
 *  4. **Il tasto "Prenota la call" e "Ottieni maggiori informazioni"**: non
 *     navigano, perché la loro destinazione è milestone 4 e oltre.
 *
 * E una che il Figma dice in un modo e il Flusso in un altro: il selettore dei
 * servizi. La riconciliazione è in `components/box-servizio.tsx`.
 */

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const vetrina = await leggiVetrina(slug)
  if (!vetrina) return { title: 'Travel Designer · XPETIS' }
  return {
    title: `${vetrina.display_name} · XPETIS`,
    description: vetrina.hero_bio ?? vetrina.headline ?? undefined,
  }
}

/**
 * Quale box mostrare. L'ordine di preferenza è: quello chiesto nella query, se
 * quel designer ce l'ha davvero; altrimenti la consulenza, che ogni designer ha
 * per forza (è un blocco alla pubblicazione); altrimenti il primo che c'è.
 *
 * Un `?servizio=` inventato non rompe la pagina e non mostra un box vuoto: si
 * torna al comportamento di default, come fa `/ricerca` con una destinazione
 * inesistente.
 */
function servizioAttivo(servizi: Servizio[], chiesto: string | undefined): Servizio | null {
  return (
    servizi.find((s) => s.service_type === chiesto) ??
    servizi.find((s) => s.service_type === 'consultation') ??
    servizi[0] ??
    null
  )
}

/**
 * L'ordine delle pillole del selettore: prima ciò che si compra, poi il resto.
 * Il Flusso vuole la consulenza come unica porta d'ingresso, e una porta si
 * mette per prima. `sort_order` della vista decide dentro i due gruppi.
 */
function ordinaServizi(servizi: Servizio[]): Servizio[] {
  return [...servizi].sort(
    (a, b) => Number(siCompraInVetrina(b.service_type)) - Number(siCompraInVetrina(a.service_type)),
  )
}

function uno(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/** La scheda hero: foto a sinistra, nome, tabella e manifesto a destra. */
function SchedaHero({ vetrina }: { vetrina: Vetrina }) {
  // Il Figma elenca qui le macro-aree ("Sud America, Sud-Est Asiatico"). La
  // vista dà i paesi coperti per nome — **e senza il livello, come vuole il
  // Flusso: la copertura è una sola agli occhi del viaggiatore**. Le macro-aree
  // richiederebbero una lettura che nessuna vista pubblica offre.
  const righe: { etichetta: string; valore: string }[] = [
    { etichetta: 'Aree di competenza', valore: vetrina.countries.join(', ') },
    {
      etichetta: 'Anni di esperienza',
      valore: vetrina.years_experience ? `${vetrina.years_experience} anni` : '',
    },
    // Manca "Membro XPETIS": `joined_at` non è nella vista. Vedi lib/vetrina.ts.
    { etichetta: 'Lingue parlate', valore: vetrina.languages.join(', ') },
  ].filter((riga) => riga.valore.length > 0)

  return (
    <section className="bg-[#9e6f54] px-4 pb-16 pt-[140px] text-neutro lg:px-0 lg:pb-24 lg:pt-[267px]">
      <div className="mx-auto grid max-w-[1312px] gap-10 lg:grid-cols-[407px_minmax(0,1fr)] lg:gap-[100px]">
        <div className="relative h-[420px] overflow-hidden rounded-[25px] border-[3px] border-neutro lg:h-[551px]">
          <FotoVetrina
            src={vetrina.photo_url}
            alt={vetrina.display_name}
            sizes="(min-width: 1024px) 407px, 100vw"
          />
          <div
            className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_12.981%,rgba(0,0,0,0.9)_100%)]"
            aria-hidden
          />
          {/* Il Figma mette qui anche il voto medio con la stella rossa: fuori
              finché non esistono recensioni. Resta il link a Instagram, che il
              form raccoglie davvero. */}
          {vetrina.instagram_handle && (
            <a
              href={`https://instagram.com/${vetrina.instagram_handle.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer noopener"
              className="absolute bottom-6 right-6 transition hover:opacity-80"
              aria-label={`Instagram di ${vetrina.display_name}`}
            >
              {/* 35×34.52, le misure esatte del nodo: l'SVG esportato ha
                  `preserveAspectRatio="none"` e in un quadrato si stirerebbe. */}
              <Image
                src="/img/icona-instagram.svg"
                alt=""
                width={35}
                height={34.52}
                style={{ width: 35, height: 34.52 }}
              />
            </a>
          )}
        </div>

        <div>
          <h1 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2">
            {vetrina.display_name}
          </h1>

          {righe.length > 0 && (
            <dl className="mt-10 lg:mt-16">
              {righe.map((riga) => (
                <div
                  key={riga.etichetta}
                  className="grid gap-1 border-b border-dashed border-neutro/60 py-3 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-6"
                >
                  <dt className="text-[14px] font-bold uppercase">{riga.etichetta}</dt>
                  <dd className="text-corpo">{riga.valore}</dd>
                </div>
              ))}
            </dl>
          )}

          {vetrina.manifesto && (
            <p className="mt-10 max-w-[716px] font-titoli text-[20px] leading-snug lg:mt-16 lg:text-[24px]">
              {vetrina.manifesto}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default async function PaginaVetrina({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams])

  const vetrina = await leggiVetrina(slug)
  // La vista contiene solo i profili pubblicati: uno slug sconosciuto e un
  // designer in bozza sono lo stesso caso, ed è giusto che lo siano.
  if (!vetrina) notFound()

  const servizi = ordinaServizi(vetrina.services)
  const attivo = servizioAttivo(servizi, uno(query.servizio))

  const viaggi = vetrina.signature_trips
  const itinerari = vetrina.ready_itineraries
  const storia = paragrafi(vetrina.bio)

  return (
    <div className="bg-crema">
      <Header />

      <SchedaHero vetrina={vetrina} />

      {/* ---------------------------------------------------- La mia storia */}
      <section id="servizi" className="px-4 py-16 lg:px-0 lg:py-[120px]">
        <div className="mx-auto grid max-w-[1312px] gap-12 lg:grid-cols-[minmax(0,549px)_572px] lg:gap-[100px]">
          <div>
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2">
              La mia storia
            </h2>

            {vetrina.hero_bio && <p className="mt-8 text-corpo-big">{vetrina.hero_bio}</p>}

            {storia.length > 0 && (
              <div className="mt-8 space-y-4 text-corpo">
                {storia.map((p) => (
                  <p key={p.slice(0, 40)}>{p}</p>
                ))}
              </div>
            )}

            {/* Il Figma mette qui due tasti. Quello degli itinerari punta alla
                sezione più sotto e c'è se ci sono itinerari. **Quello dei
                viaggi di gruppo non c'è**, per la stessa ragione per cui non
                c'è la sezione: vedi sotto. */}
            {itinerari.length > 0 && (
              <a
                href="#itinerari-pronti"
                className="mt-10 inline-block rounded-[20px] bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
              >
                Vai agli itinerari pronti
              </a>
            )}
          </div>

          {attivo && (
            <BoxServizio
              nomeDesigner={vetrina.display_name}
              servizi={servizi}
              attivo={attivo}
              slug={vetrina.slug}
            />
          )}
        </div>
      </section>

      {/* ---------------------------------------------- Alcuni dei miei viaggi */}
      {viaggi.length > 0 && (
        <section className="bg-neutro px-4 py-16 lg:px-0 lg:py-[89px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2">
              Alcuni dei miei viaggi
            </h2>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-[136px] lg:grid-cols-3">
              {viaggi.map((viaggio) => (
                <CardViaggioFirma
                  key={viaggio.title}
                  titolo={viaggio.title}
                  descrizione={viaggio.description}
                  // Le URL si risolvono qui, lato server: il componente della
                  // galleria è client e non deve importare `lib/vetrina`.
                  foto={viaggio.images.map((percorso) => urlMedia(percorso))}
                  // Il form non raccoglie tag per viaggio: si mostrano i paesi
                  // coperti dal designer. Vedi il commento nel componente.
                  etichette={vetrina.countries.slice(0, 3)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------ Itinerari pronti da vivere */}
      {itinerari.length > 0 && (
        <section id="itinerari-pronti" className="bg-scuro px-4 py-16 text-neutro lg:px-0 lg:py-[90px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2">
              Itinerari pronti da vivere
            </h2>
            <p className="mt-8 max-w-[549px] text-corpo">
              Dai un’occhiata agli itinerari già testati e collaudati: possiamo partire da questi
              per personalizzarli il più possibile sulle tue esigenze e necessità!
            </p>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {itinerari.map((itinerario) => (
                <CardItinerario key={itinerario.title} itinerario={itinerario} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ Viaggi di gruppo
          **La sezione del Figma non c'è, e non si può costruire.** Il servizio
          `group_trip` esiste — il designer lo attiva e il selettore qui sopra lo
          mostra — ma i *viaggi* di gruppo non hanno una sorgente: nel form
          Vetrina TD il blocco `gruppo[]` non ha campi modificabili e resta il
          contenuto d'esempio, quindi non si importa mai (deciso il 6 agosto,
          `MAPPATURA_VETRINA.md`). Riempirla vorrebbe dire mostrare l'esempio
          dentro il form come se fosse il viaggio di quel designer.

          Le due strade sono aggiungere la sezione al form o farli caricare al
          team: è una decisione di prodotto, ed è in PIANO.md. Fino ad allora
          niente sezione e niente tasto "Vai ai viaggi di gruppo". */}

      <RecensioniVetrina />

      <Footer />
    </div>
  )
}
