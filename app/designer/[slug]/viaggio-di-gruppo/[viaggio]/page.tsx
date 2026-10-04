import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { CHIAVI, leggiTestiConfig } from '@/lib/config'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { CardViaggioGruppo } from '@/components/card-viaggio-gruppo'
import { GalleriaVoce } from '@/components/galleria-voce'
import { StatoPartenzaChip } from '@/components/stato-partenza'
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
  durataGruppo,
  elencoPaesi,
  etichettaGiorni,
  intervalloDate,
  persone,
  prezzoVetrina,
  prossimaPartenza,
  rigaCredito,
  rigaPrezzo,
} from '@/lib/vetrina-vista'
import {
  formattaPrezzo,
  leggiDettaglioViaggioDiGruppo,
  leggiVetrina,
  percorsoViaggioDiGruppo,
  urlMedia,
} from '@/lib/vetrina'

/**
 * «Viaggio di gruppo», una pagina per viaggio.
 *
 * **Dal 3 ottobre 2026 il riferimento visivo è il tool vetrina v6**
 * (`xpetis-vetrine-tool/riferimento/pagine_tool/gruppo.html`), non più il nodo
 * Figma 3-1121 (D1). Indirizzo invariato: `/designer/<designer>/viaggio-di-gruppo/<slug>`
 * (0051); un link del tool (`/gruppi/3`) o uno slug sparito danno 404 (R3).
 *
 * ## Le partenze
 *
 * Sono date vere dalla 0053, e la vista (0054) dà **solo quelle future**, a
 * Roma. Il tool le mostra tutte, passate comprese, barrando le sold out; e
 * come «prossima partenza», se non ce ne sono di future, mostra l'ultima già
 * andata. Qui una partenza passata non esiste: **senza partenze future la
 * pagina resta, e i blocchi «Partenze» e «Prossima partenza» non escono**.
 *
 * ## Le scelte che divergono dal tool
 *
 *  · niente «Acquista il posto» (R4): l'unica azione è la call (`#servizi`);
 *  · «Accompagnato da» solo se il designer l'ha scritto: il tool ci mette il
 *    suo nome quando manca (D-17);
 *  · con il solo massimo dei partecipanti, «fino a 15» (D-18);
 *  · la nota di prezzo **senza ripiego**: un gruppo coi voli inclusi si
 *    troverebbe scritto «volo non incluso»;
 *  · «Acconto, saldo e cancellazione»: il tool mette un testo XPETIS fisso su
 *    tutti i gruppi. È una promessa commerciale: qui esce solo se
 *    `app_config.group_trip_terms_text` non è vuota (D-2), e oggi lo è. Il
 *    testo scritto dal designer (`td_terms_text`) non esce mai;
 *  · le «tappe principali» il tool non le mostra sulla pagina del gruppo, e
 *    nemmeno qui (D-22);
 *  · niente «secondo Incontro gratis» (D4), credito senza cifre (R2).
 */

type Props = {
  params: Promise<{ slug: string; viaggio: string }>
}

async function leggi(slug: string, slugViaggio: string) {
  const [vetrina, voce] = await Promise.all([leggiVetrina(slug), leggiDettaglioViaggioDiGruppo(slug, slugViaggio)])
  return vetrina && voce ? { vetrina, voce } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, viaggio } = await params
  const trovato = await leggi(slug, viaggio)
  if (!trovato) return { title: 'Viaggio di gruppo · XPETIS' }
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

export default async function PaginaViaggioDiGruppo({ params }: Props) {
  const { slug, viaggio: slugViaggio } = await params

  const [trovato, testi] = await Promise.all([
    leggi(slug, slugViaggio),
    leggiTestiConfig([CHIAVI.prefissoPrezzoGruppo, CHIAVI.prezzoSuRichiesta, CHIAVI.condizioniGruppo]),
  ])
  if (!trovato) notFound()
  const { vetrina, voce } = trovato

  const nome = vetrina.display_name
  const nomeBreve = vetrina.short_name || nome
  const breve = vetrina.services.find((s) => s.service_type === 'consultation')
  const credito = rigaCredito(breve?.duration_minutes ?? null, formattaPrezzo(breve?.price_cents ?? null), nomeBreve)
  const prenota = `/designer/${vetrina.slug}#servizi`
  const cta = { href: prenota, testo: `Parlane con ${nomeBreve}` }

  const prezzo = prezzoVetrina(voce.price_label)
  const riga = rigaPrezzo(testi[CHIAVI.prefissoPrezzoGruppo], voce.price_note)
  const prossima = prossimaPartenza(voce.next_departure)

  const durata = durataGruppo(voce.duration_label, voce.nights)
  const quanti = persone(voce.participants_min, voce.participants_max, 'partecipanti')
  const righe: RigaScheda[] = []
  if (voce.departures.length) {
    righe.push({
      etichetta: 'Partenze',
      contenuto: (
        <ul className="space-y-2">
          {voce.departures.map((d) => (
            <li key={d.starts_on} className="flex flex-wrap items-center gap-2">
              <span className={d.status === 'sold_out' ? 'text-scuro/60 line-through' : ''}>
                {intervalloDate(d.starts_on, d.ends_on)}
              </span>
              <StatoPartenzaChip stato={d.status} />
            </li>
          ))}
        </ul>
      ),
    })
  }
  if (durata) righe.push({ etichetta: 'Durata', contenuto: durata })
  if (quanti) righe.push({ etichetta: 'Persone previste', contenuto: quanti })
  if (voce.age_range) righe.push({ etichetta: 'Fascia d’età', contenuto: voce.age_range })

  const informazioni: VoceInformazioni[] = [
    { titolo: 'Cosa portare in valigia', righe: voce.packing_list },
    voce.price_includes.length
      ? { titolo: 'La quota comprende', spunte: voce.price_includes, sottotitolo: 'La quota non comprende', righe2: voce.price_excludes }
      : { titolo: 'La quota non comprende', righe: voce.price_excludes },
    { titolo: 'Info sanitarie e visti', testo: voce.health_visa_info },
    // Il testo XPETIS, non quello del designer, e solo se la riga non è vuota.
    { titolo: 'Acconto, saldo e cancellazione', testo: testi[CHIAVI.condizioniGruppo] },
  ]

  const paesi = elencoPaesi(voce.countries)
  const altri = vetrina.group_trips.filter((g) => g.slug !== voce.slug).slice(0, 3)

  return (
    <div className="bg-crema">
      <Header />

      <section className="px-4 pb-16 pt-[110px] lg:px-[100px] lg:pb-[89px] lg:pt-[150px]">
        <div className="mx-auto max-w-[1312px]">
          <nav aria-label="Dove sei" className="text-[14px]">
            <Link href={`/designer/${vetrina.slug}`} className="hover:text-primario">{nome}</Link>
            <span aria-hidden> › </span>
            <Link href={`/designer/${vetrina.slug}#viaggi-di-gruppo`} className="hover:text-primario">Viaggi di gruppo</Link>
            <span aria-hidden> › </span>
            <span aria-current="page">{voce.title}</span>
          </nav>

          <h1 className="mt-4 font-titoli text-[32px] font-bold leading-tight lg:text-[40px]">{voce.title}</h1>
          <p className="mt-2 text-[14px]">
            Progettato da{' '}
            <Link href={`/designer/${vetrina.slug}`} className="text-primario underline">{nome}</Link>
            {[etichettaGiorni(voce.duration_label), paesi].filter(Boolean).map((p) => ` · ${p}`)}
          </p>
          {voce.guide_name && <p className="text-[14px] text-scuro/80">Accompagnato da {voce.guide_name}</p>}

          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_424px] lg:gap-8">
            <div className="flex min-w-0 flex-col gap-8 lg:gap-12">
              <GalleriaVoce
                foto={voce.images.map((p) => urlMedia(p)).filter((u): u is string => Boolean(u))}
                titolo={voce.title}
              />
              <div className="lg:hidden">
                <SchedaPrezzo prezzo={prezzo} prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} riga={riga} righe={righe}
                  cta={cta} credito={credito} />
              </div>
              <RaccontoFirmato testo={voce.intro} nome={nome} foto={vetrina.photo_url} />
              <TappeViaggio tappe={voce.stops} />
              <FaPerMe voce={voce} />
            </div>

            <aside className="hidden lg:sticky lg:top-6 lg:block">
              <SchedaPrezzo prezzo={prezzo} prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} riga={riga} righe={righe}
                cta={cta} credito={credito} />
            </aside>
          </div>
        </div>
      </section>

      <InformazioniUtili voci={informazioni} />

      <FasciaFinale
        prezzo={prezzo}
        prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]}
        riga={riga}
        prossima={
          prossima && (
            <div>
              <p className="text-[13px] text-neutro/80">Prossima partenza</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[16px]">
                {prossima.date}
                <StatoPartenzaChip stato={prossima.stato} />
              </p>
            </div>
          )
        }
        cta={cta}
        credito={credito}
      />

      {altri.length > 0 && (
        <section className="px-4 py-16 lg:px-[100px] lg:py-[90px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[36px] font-bold leading-tight lg:text-[48px]">Altri viaggi di gruppo di {nomeBreve}</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {altri.map((g) => (
                <CardViaggioGruppo key={g.slug} viaggio={g} href={percorsoViaggioDiGruppo(vetrina.slug, g.slug)}
                  prezzoMancante={testi[CHIAVI.prezzoSuRichiesta]} etichetta="Viaggio di gruppo" />
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  )
}
