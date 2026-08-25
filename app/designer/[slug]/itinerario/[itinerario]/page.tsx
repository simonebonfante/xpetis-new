import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { CHIAVI, leggiTestoConfig } from '@/lib/config'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CardItinerario } from '@/components/card-itinerario'
import { FotoVetrina } from '@/components/foto-vetrina'
import {
  leggiVetrina,
  percorsoItinerario,
  trovaItinerario,
  urlMedia,
  type ItinerarioPronto,
  type Vetrina,
} from '@/lib/vetrina'

/**
 * "Itinerario pronto da vivere" — Figma 261:1068.
 *
 * L'ultima delle quattro pagine disegnate, e la destinazione del tasto "Ottieni
 * maggiori informazioni" delle card di vetrina, che fino a ieri era spento.
 *
 * ## Cosa si compra qui: niente
 *
 * Il Flusso è netto: **l'unica porta d'acquisto è la consulenza**, e un
 * itinerario pronto è vetrina, non catalogo (lo dice anche la migration 0026,
 * dove durata e prezzo sono testo libero perché nessuna cassa nasce da quella
 * riga). Il disegno invece, nella fascia scura in fondo, mette "Acquista
 * l'itinerario" accanto a "Personalizza con una call": **quel tasto non esiste
 * in questa pagina**, perché non esiste il prodotto che venderebbe — nessun
 * `orders.service_type` lo ammette, nessun prezzo in centesimi lo quantifica.
 * Sul comportamento e sui contenuti vince il Flusso: qui l'unica azione è
 * prenotare una call con chi l'itinerario l'ha disegnato.
 *
 * Con quel tasto è caduta anche la fascia che lo conteneva: l'altra sua metà —
 * prezzo e "Personalizza con una call" — è già, identica, nella scheda in alto e
 * nel box "Vuoi cambiare qualcosa?", e nel disegno le separavano tre sezioni che
 * qui non ci sono. Restava una fascia che ripeteva il vicino di sopra.
 *
 * ## Cosa il disegno mostra e questa pagina non ha
 *
 * `td_ready_itineraries` ha **quattro campi**: titolo, durata, prezzo e una
 * foto, tutti come testo libero. Il Figma chiede molto di più, e sono contenuti
 * che il Flusso non prevede da nessuna parte: sotto la regola del 14 agosto un
 * contenuto che il disegno aggiunge non si costruisce di iniziativa, si segnala.
 * Quindi restano fuori, tutti in PIANO.md:
 *
 *  · **"Le tappe del viaggio"** — cinque tappe con giorni, titolo e descrizione.
 *    Non c'è nessuna tabella delle tappe, né un campo che le contenga.
 *  · **"Informazioni utili"** — i tre pannelli (valigia, quota, sanitarie/visti).
 *    Stessa storia, e in più direbbero cosa comprende un prezzo: è una promessa
 *    commerciale, non un testo decorativo.
 *  · **"Tappe principali"** nella scheda del prezzo, e la descrizione lunga
 *    dell'itinerario accanto alla foto del designer.
 *  · **La galleria** (una foto grande e due piccole, più "Mostra tutte le foto"):
 *    `image_path` è **una** foto. Dove il disegno ne mette tre, qui quell'unica
 *    riempie tutta la larghezza. Un finto carosello su una foto sola sarebbe una
 *    bugia sull'interfaccia.
 *  · *"volo non incluso • IVA inclusa"*, sotto il prezzo, **c'è dal 24 agosto**:
 *    non è un dato del designer — il form non la raccoglie — ma un parametro di
 *    prodotto, e vive in `app_config` (migration 0034). Si cambia da Studio, e
 *    svuotarla la fa sparire.
 *  · **Il paese** nel filo di briciole e nella riga "Progettato da … • 16 giorni
 *    • Giappone": un itinerario non dichiara la sua destinazione. I paesi che la
 *    vista espone sono quelli del *designer*, che è un'altra cosa — "Giappone in
 *    Primavera" di chi copre Giappone e Vietnam non diventa un itinerario in
 *    Vietnam.
 *
 * Quello che resta è quanto il database sa davvero: titolo, durata, prezzo, una
 * foto, chi l'ha disegnato, e la strada verso la sua call.
 */

type Props = {
  params: Promise<{ slug: string; itinerario: string }>
}

/**
 * Legge la vetrina e ne estrae l'itinerario che l'URL nomina.
 *
 * Uno slug che quel designer non ha è un 404 — non un ripiego sul primo
 * itinerario: non è una richiesta ambigua, è un link inventato o l'itinerario di
 * un altro designer.
 */
async function leggiItinerario(
  slugDesigner: string,
  slugItinerario: string,
): Promise<{ vetrina: Vetrina; itinerario: ItinerarioPronto } | null> {
  const vetrina = await leggiVetrina(slugDesigner)
  if (!vetrina) return null

  const itinerario = trovaItinerario(vetrina.ready_itineraries, slugItinerario)
  if (!itinerario) return null

  return { vetrina, itinerario }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, itinerario } = await params
  const trovato = await leggiItinerario(slug, itinerario)
  if (!trovato) return { title: 'Itinerario pronto da vivere · XPETIS' }
  return {
    title: `${trovato.itinerario.title} · ${trovato.vetrina.display_name} · XPETIS`,
    description: trovato.vetrina.headline ?? undefined,
  }
}

/**
 * La scheda bianca del prezzo, a destra della foto.
 *
 * Prezzo e durata sono le stringhe del designer, mostrate come le ha scritte:
 * "1.380€" e "12 giorni" non si riformattano, perché non sappiamo se "850€" vuol
 * dire 850,00 o "da 850". Chi importa segnala ciò che non capisce, chi mostra
 * non indovina.
 */
function SchedaPrezzo({
  itinerario,
  slug,
  notaPrezzo,
}: {
  itinerario: ItinerarioPronto
  slug: string
  /** Da `app_config`, gruppo `showcase`. Nulla se la riga è vuota o non c'è. */
  notaPrezzo: string | null
}) {
  return (
    <div className="flex flex-col rounded-[15px] bg-neutro p-6 lg:p-8">
      {itinerario.price_label && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[24px] leading-[2] tracking-[-0.264px]">A partire da</p>
            <p className="font-titoli text-[36px] font-bold leading-[34px] text-primario">
              {itinerario.price_label}
            </p>
          </div>

          {/* La nota compare solo **sotto un prezzo**: dice cosa comprende quel
              prezzo, e senza prezzo non comprende niente. */}
          {notaPrezzo && (
            <p className="mt-1 text-[14px] leading-[1.5] tracking-[-0.154px]">{notaPrezzo}</p>
          )}
        </>
      )}

      {itinerario.duration_label && (
        <dl className="mt-8 border-t border-dashed border-scuro pt-4">
          <div className="grid gap-1 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-6">
            <dt className="text-[18px] font-bold leading-[1.5] tracking-[-0.198px]">Durata</dt>
            <dd className="text-[18px] leading-[1.5] tracking-[-0.198px]">
              {itinerario.duration_label}
            </dd>
          </div>
          {/* E qui "Tappe principali", con le cinque città. Nessuna sorgente. */}
        </dl>
      )}

      {/* L'unica azione della pagina, e porta al box della consulenza sulla
          vetrina: è là che si prenota (milestone 4, iframe Cal.com). Non è un
          404 travestito — la pagina esiste — ma il tasto "Prenota la call" che
          troverà arrivando è ancora spento, e lo dice da sé. */}
      <Link
        href={`/designer/${slug}#servizi`}
        className="mt-auto block rounded-[30px] bg-primario px-5 py-2 text-center text-corpo text-neutro transition hover:brightness-110 lg:mt-10"
      >
        Personalizza con una call
      </Link>
    </div>
  )
}

/** La scheda del designer: la sua foto, il suo nome, e la via per la vetrina. */
function SchedaDesigner({ vetrina }: { vetrina: Vetrina }) {
  return (
    <div className="rounded-[15px] bg-neutro p-6 lg:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center lg:gap-[21px]">
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
          <p className="text-corpo">Progettato da</p>
          <h2 className="mt-1 font-titoli text-[26px] font-bold leading-tight">
            <Link href={`/designer/${vetrina.slug}`} className="hover:text-primario">
              {vetrina.display_name}
            </Link>
          </h2>
          {vetrina.headline && <p className="mt-4 max-w-[534px] text-corpo">{vetrina.headline}</p>}
        </div>
      </div>
    </div>
  )
}

export default async function PaginaItinerarioPronto({ params }: Props) {
  const { slug, itinerario: slugItinerario } = await params

  const [trovato, notaPrezzo] = await Promise.all([
    leggiItinerario(slug, slugItinerario),
    leggiTestoConfig(CHIAVI.notaPrezzoItinerario),
  ])
  if (!trovato) notFound()

  const { vetrina, itinerario } = trovato

  // I minuti della consulenza vengono dal servizio del designer, non dal "45
  // minuti" del disegno: quel numero è suo, non nostro. Se non c'è, la frase
  // vive senza.
  const consulenza = vetrina.services.find((s) => s.service_type === 'consultation')
  const minuti = consulenza?.duration_minutes ?? null

  const altri = vetrina.ready_itineraries.filter((riga) => riga.slug !== itinerario.slug)

  return (
    <div className="bg-crema">
      <Header />

      <section className="px-4 pb-16 pt-[120px] lg:px-0 lg:pb-[89px] lg:pt-[172px]">
        <div className="mx-auto max-w-[1312px]">
          {/* Il filo di briciole del Figma è "Itinerari pronto da vivere >
              Giappone": la prima metà è una pagina che non esiste (non c'è un
              indice degli itinerari) e la seconda è il paese, che l'itinerario
              non dichiara. Qui il filo dice la gerarchia vera — da dove si
              arriva e dove si torna. */}
          <nav aria-label="Dove sei" className="text-corpo">
            <Link href={`/designer/${vetrina.slug}`} className="hover:text-primario">
              {vetrina.display_name}
            </Link>
            <span aria-hidden> &gt; </span>
            <Link href={`/designer/${vetrina.slug}#itinerari-pronti`} className="hover:text-primario">
              Itinerari pronti da vivere
            </Link>
          </nav>

          <h1 className="mt-10 font-titoli text-[40px] font-bold leading-tight lg:mt-12">
            {itinerario.title}
          </h1>

          {/* "Progettato da … • 12 giorni". Il terzo pezzo del disegno è il
              paese, che non esiste come dato. */}
          <p className="mt-6 text-corpo">
            Progettato da {vetrina.display_name}
            {itinerario.duration_label && ` • ${itinerario.duration_label}`}
          </p>

          <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_424px]">
            {/* Una foto, non tre: la larghezza è quella di tutta la galleria del
                disegno, così il vuoto non si vede. */}
            <div className="relative h-[300px] overflow-hidden rounded-[15px] lg:h-[452px]">
              <FotoVetrina
                src={urlMedia(itinerario.image_path)}
                alt={itinerario.title}
                sizes="(min-width: 1024px) 868px, 100vw"
              />
            </div>

            <SchedaPrezzo
              itinerario={itinerario}
              slug={vetrina.slug}
              notaPrezzo={notaPrezzo}
            />
          </div>

          <div className="mt-6 lg:max-w-[868px]">
            <SchedaDesigner vetrina={vetrina} />
          </div>

          {/* ------------------------------------- Vuoi cambiare qualcosa?
              I testi sono **segnaposto**: li scrive Gaia, come quelli della
              frase del match. Il senso però è fissato dal Flusso e non si tocca:
              l'itinerario è un punto di partenza, la call è la porta, il su
              misura si compra dopo la call e non da qui. */}
          <div className="mt-6 rounded-[15px] bg-scuro p-6 text-neutro lg:max-w-[868px] lg:p-[60px]">
            <h2 className="font-titoli text-[32px] font-bold leading-tight lg:text-[40px]">
              Vuoi cambiare qualcosa?
            </h2>
            <p className="mt-6 max-w-[487px] text-corpo">
              Questo itinerario è un punto di partenza. Con una call
              {minuti ? ` di ${minuti} minuti` : ''}, {vetrina.display_name} lo adatta ai tuoi
              tempi, al tuo budget e al tuo stile di viaggio. Poi potrai acquistare la versione su
              misura per te.
            </p>
            <Link
              href={`/designer/${vetrina.slug}#servizi`}
              className="group mt-10 inline-flex items-center gap-3"
            >
              <span className="rounded-[30px] bg-primario px-5 py-2 text-corpo text-neutro transition group-hover:brightness-110">
                Personalizza con una call
              </span>
              {/* 40×40: è la stessa freccia tonda rossa delle card, cioè lo
                  stesso path del nodo (Group 74 e Group 33 differiscono di un
                  sotto-pixel di traslazione). Un asset in meno da tenere
                  allineato. */}
              <Image
                src="/img/freccia-diagonale.svg"
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0"
              />
            </Link>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Altri itinerari
          Gli altri itinerari **di questo designer**: sono i soli che una query
          sulla vetrina conosce. Il disegno non dice se ne voglia altri, e un
          elenco fra designer diversi sarebbe una lettura nuova. */}
      {altri.length > 0 && (
        <section className="bg-crema px-4 pb-16 lg:px-0 lg:pb-[120px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2">
              Altri itinerari
            </h2>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-[100px] lg:grid-cols-3">
              {altri.map((riga) => (
                <CardItinerario
                  key={riga.slug}
                  itinerario={riga}
                  href={percorsoItinerario(vetrina.slug, riga.slug)}
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
