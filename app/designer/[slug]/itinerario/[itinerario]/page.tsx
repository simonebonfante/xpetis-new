import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { CHIAVI, leggiTestiConfig, leggiTestoConfig } from '@/lib/config'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CardItinerario } from '@/components/card-itinerario'
import { GalleriaVoce } from '@/components/galleria-voce'
import {
  FaPerMe,
  FasciaFinale,
  InformazioniUtili,
  RaccontoFirmato,
  SchedaPrezzo,
  TappeViaggio,
  type RigaScheda,
  type VoceInformazioni,
} from '@/components/blocchi-voce'
import {
  accorcia,
  durataItinerario,
  elencoPaesi,
  etichettaGiorni,
  prezzoVetrina,
  rigaCredito,
  rigaPrezzo,
} from '@/lib/vetrina-vista'
import {
  formattaPrezzo,
  leggiDettaglioItinerario,
  leggiVetrina,
  percorsoItinerario,
  urlMedia,
} from '@/lib/vetrina'

/**
 * «Itinerario pronto da vivere».
 *
 * **Dal 3 ottobre 2026 il riferimento visivo è il tool vetrina v6**
 * (`xpetis-vetrine-tool/riferimento/pagine_tool/itinerario.html`), non più il
 * nodo Figma 3-1386 (D1). Fino a quel giorno questa pagina diceva, qui in
 * testa, tutto quello che il disegno chiedeva senza avere una sorgente — tappe,
 * informazioni utili, tappe principali, galleria, paese. Il tool le raccoglie,
 * la 0053 le conserva, la vista `public_td_ready_itinerary` (0054) le serve.
 *
 * **L'indirizzo non si tocca**: `/designer/<designer>/itinerario/<slug>` (0033).
 * Il tool linka `/itinerari/1`: un ordinale fa rispondere 200 a un link vecchio
 * con un viaggio diverso (R3). Uno slug sparito dà 404.
 *
 * ## Cosa si compra qui: niente
 *
 * Un itinerario pronto è vetrina, non catalogo: l'unica porta d'acquisto è la
 * consulenza (Flusso). Tutti i tasti portano alla scheda della call della
 * vetrina (`#servizi`), dove c'è il login, l'embed di Cal.com e la cassa.
 *
 * ## Le scelte che divergono dal tool
 *
 *  · «Il secondo Incontro, con un altro Travel Designer, è gratis»: non c'è (D4);
 *  · la riga del credito non dice cifre (R2), e durata e prezzo della call
 *    vengono dal servizio del designer, non dal «30 minuti e 30€» del tool (R1);
 *  · la riga sotto il prezzo esce solo sotto un prezzo;
 *  · i testi di «Vuoi cambiare qualcosa?» e del tasto restano i nostri (D-9).
 */

type Props = {
  params: Promise<{ slug: string; itinerario: string }>
}

async function leggi(slug: string, slugItinerario: string) {
  const [vetrina, voce] = await Promise.all([leggiVetrina(slug), leggiDettaglioItinerario(slug, slugItinerario)])
  return vetrina && voce ? { vetrina, voce } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, itinerario } = await params
  const trovato = await leggi(slug, itinerario)
  if (!trovato) return { title: 'Itinerario pronto da vivere · XPETIS' }
  const { vetrina, voce } = trovato
  const titolo = `${voce.title} · ${vetrina.display_name} · XPETIS`
  const copertina = urlMedia(voce.images[0])
  return {
    title: titolo,
    description: accorcia(voce.intro),
    openGraph: {
      title: titolo,
      description: accorcia(voce.intro),
      images: copertina ? [{ url: copertina, alt: voce.title }] : undefined,
    },
  }
}

export default async function PaginaItinerarioPronto({ params }: Props) {
  const { slug, itinerario: slugItinerario } = await params

  const [trovato, testi, notaDiRipiego] = await Promise.all([
    leggi(slug, slugItinerario),
    leggiTestiConfig([CHIAVI.prefissoPrezzoItinerario, CHIAVI.prezzoSuRichiesta]),
    leggiTestoConfig(CHIAVI.notaPrezzoItinerario),
  ])
  // Uno slug che non esiste più, o un designer non pubblicato: la stessa
  // risposta, 404. Mai un altro itinerario.
  if (!trovato) notFound()
  const { vetrina, voce } = trovato

  const nome = vetrina.display_name
  const nomeBreve = vetrina.short_name || nome
  const breve = vetrina.services.find((s) => s.service_type === 'consultation')
  const minuti = breve?.duration_minutes ?? null
  const credito = rigaCredito(minuti, formattaPrezzo(breve?.price_cents ?? null), nomeBreve)
  const prenota = `/designer/${vetrina.slug}#servizi`

  const prezzo = prezzoVetrina(voce.price_label)
  // Il prefisso di `app_config` e la nota del designer; senza nota, la nota
  // generale degli itinerari (`ready_itinerary_price_note`). Il ripiego vale
  // **solo per gli itinerari**: sui gruppi no.
  const riga = rigaPrezzo(testi[CHIAVI.prefissoPrezzoItinerario], voce.price_note ?? notaDiRipiego)

  const durata = durataItinerario(voce.duration_label, voce.nights)
  const righe: RigaScheda[] = []
  if (durata) righe.push({ etichetta: 'Durata', contenuto: durata })
  if (voce.main_stops.length) {
    righe.push({
      etichetta: 'Tappe principali',
      contenuto: (
        <ul>
          {voce.main_stops.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ),
    })
  }

  const informazioni: VoceInformazioni[] = [
    { titolo: 'Cosa portare in valigia', righe: voce.packing_list },
    voce.price_includes.length
      ? { titolo: 'La quota comprende', spunte: voce.price_includes, sottotitolo: 'La quota non comprende', righe2: voce.price_excludes }
      : { titolo: 'La quota non comprende', righe: voce.price_excludes },
    { titolo: 'Info sanitarie e visti', testo: voce.health_visa_info },
  ]

  const paesi = elencoPaesi(voce.countries)
  const altri = vetrina.ready_itineraries.filter((r) => r.slug !== voce.slug).slice(0, 3)

  return (
    <div className="bg-crema">
      <Header />

      <section className="px-4 pb-16 pt-[110px] lg:px-[100px] lg:pb-[89px] lg:pt-[150px]">
        <div className="mx-auto max-w-[1312px]">
          <nav aria-label="Dove sei" className="text-[14px]">
            <Link href={`/designer/${vetrina.slug}`} className="hover:text-primario">{nome}</Link>
            <span aria-hidden> › </span>
            <Link href={`/designer/${vetrina.slug}#itinerari-pronti`} className="hover:text-primario">
              Itinerari pronti da vivere
            </Link>
            <span aria-hidden> › </span>
            <span aria-current="page">{voce.title}</span>
          </nav>

          <h1 className="mt-4 font-titoli text-[32px] font-bold leading-tight lg:text-[40px]">{voce.title}</h1>
          <p className="mt-2 text-[14px]">
            <Link href={`/designer/${vetrina.slug}`} className="text-primario underline">{nome}</Link>
            {[etichettaGiorni(voce.duration_label), paesi].filter(Boolean).map((p) => ` · ${p}`)}
          </p>

          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_424px] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-8 lg:gap-12">
              <GalleriaVoce
                foto={voce.images.map((p) => urlMedia(p)).filter((u): u is string => Boolean(u))}
                titolo={voce.title}
              />

              {/* Sul telefono il prezzo viene subito dopo le foto: è la cosa
                  che si cerca per prima. Da `lg` sta nella colonna a destra. */}
              <div className="lg:hidden">
                <SchedaPrezzo prezzo={prezzo} prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} riga={riga} righe={righe}
                  cta={{ href: prenota, testo: 'Personalizza con una call' }} credito={credito} />
              </div>

              <RaccontoFirmato testo={voce.intro} nome={nome} foto={vetrina.photo_url} />
              <TappeViaggio tappe={voce.stops} />
              <FaPerMe voce={voce} />

              {/* «Vuoi cambiare qualcosa?»: il testo è il nostro di prima, con
                  i minuti della breve di questo designer. L'itinerario è un punto
                  di partenza, la call è la porta, il su misura si compra dopo. */}
              <div className="rounded-[25px] bg-scuro p-6 text-neutro lg:p-[46px]">
                <h2 className="font-titoli text-[30px] font-bold leading-tight lg:text-[36px]">Vuoi cambiare qualcosa?</h2>
                <p className="mt-5 max-w-[560px] text-corpo">
                  Questo itinerario è un punto di partenza. Con una call{minuti ? ` di ${minuti} minuti` : ''},{' '}
                  {nomeBreve} lo adatta ai tuoi tempi, al tuo budget e al tuo stile di viaggio. Poi potrai
                  acquistare la versione su misura per te.
                </p>
                <a href={prenota} className="group mt-8 inline-flex items-center gap-2">
                  <span className="rounded-[30px] bg-primario px-5 py-2 text-corpo text-neutro transition group-hover:brightness-110">
                    Personalizza con una call
                  </span>
                </a>
              </div>
            </div>

            <aside className="hidden lg:sticky lg:top-6 lg:block">
              <SchedaPrezzo prezzo={prezzo} prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} riga={riga} righe={righe}
                cta={{ href: prenota, testo: 'Personalizza con una call' }} credito={credito} />
            </aside>
          </div>
        </div>
      </section>

      <InformazioniUtili voci={informazioni} />

      <FasciaFinale prezzo={prezzo} prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} riga={riga}
        cta={{ href: prenota, testo: 'Personalizza con una call' }} credito={credito} />

      {/* Gli altri itinerari **di questo designer**, fino a tre. */}
      {altri.length > 0 && (
        <section className="px-4 py-16 lg:px-[100px] lg:py-[90px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[36px] font-bold leading-tight lg:text-[48px]">Altri itinerari di {nomeBreve}</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {altri.map((r) => (
                <CardItinerario key={r.slug} itinerario={r} href={percorsoItinerario(vetrina.slug, r.slug)}
                  prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  )
}
