import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { leggiUtente } from '@/lib/supabase/utente'
import { CHIAVI, leggiNumeroConfig } from '@/lib/config'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { BoxServizio } from '@/components/box-servizio'
import { CardViaggioFirma } from '@/components/card-viaggio-firma'
import { CardItinerario } from '@/components/card-itinerario'
import { CardViaggioGruppo } from '@/components/card-viaggio-gruppo'
import { RecensioniVetrina } from '@/components/recensioni-vetrina'
import { FotoVetrina } from '@/components/foto-vetrina'
import { TornaAiRisultati } from '@/components/torna-ai-risultati'
import {
  leggiVetrina,
  paragrafi,
  percorsoItinerario,
  siCompraInVetrina,
  urlMedia,
  type Servizio,
  type Vetrina,
} from '@/lib/vetrina'

/**
 * La vetrina del Travel Designer — Figma nuovo `Q9Krydv6xD8mFJCtU9NHzr`, nodo
 * 2-743 (fino al 27 settembre: file vecchio, nodo 171:17).
 *
 * Tutto arriva da `public_td_showcase` in una sola query, più due numeri di
 * `public_config` per "Come funziona". Nessuna vista nuova, nessuna lettura
 * diretta di tabella.
 *
 * L'ordine delle sezioni è quello del disegno: hero con la scheda della call,
 * "Cosa vuol dire viaggiare per me" con i viaggi firma, "Come funziona",
 * itinerari pronti, viaggi di gruppo, recensioni, e la scheda finale. **Una
 * sezione senza contenuto non esiste**, titolo compreso: un designer senza
 * viaggi di gruppo — su venticinque, il caso più comune — non vede
 * "Viaggi di gruppo" sopra il nulla.
 *
 * Quello che il Figma disegna e questa pagina non mostra, con la sua ragione:
 *
 *  1. **Il voto "4.6" sulla foto** e la sezione recensioni: non esistono
 *     recensioni. Vedi `components/recensioni-vetrina.tsx`.
 *  2. **La riga "Membro XPETIS"** della scheda hero: vuole `joined_at`, che
 *     `public_td_showcase` non espone. Il Figma nuovo la ridisegna, ma
 *     ridisegnarla non decide di esporla. Vedi `lib/vetrina.ts`.
 *  3. **"Ottieni maggiori informazioni" sulle card dei viaggi di gruppo**: la
 *     pagina del viaggio (nodo 3-1121) non c'è. Vedi
 *     `components/card-viaggio-gruppo.tsx`.
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
 * Quale scheda aprire. **Solo fra le due consulenze**: sono le sole che la
 * scheda mostra (deviazione 10). L'ordine di preferenza è quella chiesta nella
 * query, se quel designer ce l'ha; altrimenti la breve, che ogni designer ha
 * per forza (è un blocco alla pubblicazione); altrimenti la prima che c'è.
 *
 * Un `?servizio=` inventato — o un `?servizio=custom_itinerary` rimasto da un
 * link del disegno vecchio — non rompe la pagina: si apre la breve.
 */
function servizioAttivo(servizi: Servizio[], chiesto: string | undefined): Servizio | null {
  const acquistabili = servizi.filter((s) => siCompraInVetrina(s.service_type))
  return (
    acquistabili.find((s) => s.service_type === chiesto) ??
    acquistabili.find((s) => s.service_type === 'consultation') ??
    acquistabili[0] ??
    null
  )
}

function uno(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/** Il tasto rosso che porta alla scheda della call, in alto. */
const TASTO =
  'inline-block rounded-[30px] bg-primario px-[42px] py-2 text-center text-corpo text-neutro transition hover:brightness-110'

/**
 * Foto, nome, tabella e storia. La scheda della call sta accanto, e la
 * compone la pagina: qui c'è solo il designer.
 */
function Presentazione({ vetrina }: { vetrina: Vetrina }) {
  // Il Figma elenca qui le macro-aree ("Sud America, Sud-Est Asiatico"). La
  // vista dà i paesi coperti per nome — **e senza il livello, come vuole il
  // Flusso: la copertura è una sola agli occhi del viaggiatore**.
  const righe: { etichetta: string; valore: string }[] = [
    { etichetta: 'Aree di competenza', valore: vetrina.countries.join(', ') },
    {
      etichetta: 'Anni di esperienza',
      valore: vetrina.years_experience ? `${vetrina.years_experience} anni` : '',
    },
    // Manca "Membro XPETIS": `joined_at` non è nella vista. Vedi lib/vetrina.ts.
    { etichetta: 'Lingue parlate', valore: vetrina.languages.join(', ') },
  ].filter((riga) => riga.valore.length > 0)

  // Il testo sotto la tabella è **la storia** (`bio`, campo `storia` del form):
  // il testo d'esempio del Figma è la stessa storia del form, accorciata.
  const storia = paragrafi(vetrina.bio)

  return (
    <div className="grid gap-10 lg:grid-cols-[276px_minmax(0,1fr)] lg:gap-[82px]">
      <div className="relative h-[340px] w-[276px] max-w-full overflow-hidden rounded-[25px] border-[3px] border-neutro lg:mt-8">
        <FotoVetrina src={vetrina.photo_url} alt={vetrina.display_name} sizes="(min-width: 1024px) 276px, 100vw" />
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
            className="absolute bottom-5 right-[31px] transition hover:opacity-80"
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

      <div className="min-w-0">
        <h1 className="font-titoli text-[40px] font-bold leading-tight lg:mt-[26px] lg:text-[48px]">
          {vetrina.display_name}
        </h1>

        {righe.length > 0 && (
          <dl className="mt-10 max-w-[420px] lg:mt-[57px]">
            {righe.map((riga, i) => (
              <div
                key={riga.etichetta}
                className={`grid gap-1 py-4 sm:grid-cols-[176px_minmax(0,1fr)] sm:gap-[18px] ${
                  i < righe.length - 1 ? 'border-b border-dashed border-neutro' : ''
                } ${i === 0 ? 'pt-0' : ''}`}
              >
                <dt className="text-[14px] font-bold uppercase">{riga.etichetta}</dt>
                <dd className="text-corpo">{riga.valore}</dd>
              </div>
            ))}
          </dl>
        )}

        {storia.length > 0 && (
          <div className="mt-10 max-w-[455px] text-corpo lg:mt-12">
            {storia.map((p) => (
              <p key={p.slice(0, 40)}>{p}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * "Come funziona" (Figma 57:187). Quattro passi che raccontano il Flusso al
 * viaggiatore.
 *
 * **I testi sono del Figma, corretti dove promettevano altro dal Flusso**, e
 * restano segnaposto per Gaia:
 *
 *  · passo 1 — il disegno dice "puoi modificare o cancellare l'appuntamento
 *    fino a 24 ore prima". Il Flusso (§5) dice due cose diverse: rimborso pieno
 *    fino a 24 ore, riprogrammazione fino a 12. I due numeri vengono da
 *    `app_config`, e se una riga manca la frase che la usa sparisce;
 *  · passo 2 — i minuti sono quelli della breve di questo designer, non il "30"
 *    scritto nel disegno;
 *  · passo 3 — nomina solo i servizi che questo designer offre davvero dopo
 *    la call: "dall'Itinerario su misura all'All Inclusive" detto a chi non fa
 *    il su misura promette un bottone che la sua mail post-call non avrà;
 *  · passo 4 — "inclusi i voli se lo desideri" è caduto: il Flusso non lo dice
 *    da nessuna parte, ed è una promessa commerciale. Il passo c'è solo se il
 *    designer ha l'All Inclusive attivo (per il Flusso lo hanno tutti, ma lo
 *    dice il database, non questa pagina).
 */
function ComeFunziona({
  nome,
  minuti,
  oreRimborso,
  oreRiprogrammazione,
  servizi,
}: {
  nome: string
  minuti: number | null
  oreRimborso: number | null
  oreRiprogrammazione: number | null
  servizi: Servizio[]
}) {
  const ha = (tipo: Servizio['service_type']) => servizi.some((s) => s.service_type === tipo)
  const suMisura = ha('custom_itinerary')
  const allInclusive = ha('all_inclusive')
  const dopo =
    suMisura && allInclusive
      ? ', dall’Itinerario su misura all’All Inclusive'
      : suMisura
        ? ', come l’Itinerario su misura'
        : allInclusive
          ? ', come l’All Inclusive'
          : ''

  const regole = [
    oreRimborso !== null && `cancellarlo con rimborso pieno fino a ${oreRimborso} ore prima`,
    oreRiprogrammazione !== null && `spostarlo fino a ${oreRiprogrammazione} ore prima`,
  ].filter(Boolean)

  const passi = [
    {
      titolo: 'Prenota il tuo incontro',
      testo: `Scegli il momento che preferisci per parlare con il tuo Travel Designer.${
        regole.length ? ` Puoi ${regole.join(' e ')}.` : ''
      }`,
    },
    {
      titolo: 'Parlate del tuo viaggio',
      testo: `Un incontro${minuti ? ` di ${minuti} minuti` : ''} con ${nome}, dedicato al viaggio che hai in mente. Racconta cosa cerchi, condividi le tue idee e fai tutte le domande che vuoi: insieme farete il punto su destinazioni, tempi, budget e modo di viaggiare.`,
    },
    {
      titolo: 'Decidete come continuare',
      testo: `Dopo l’incontro riceverai una mail con i prossimi passi. Se vorrai continuare a progettare il viaggio insieme, potrai scegliere il servizio più adatto a te${dopo}.`,
    },
    ...(allInclusive
      ? [
          {
            titolo: 'Se scegli l’All Inclusive',
            testo:
              'Il tuo Travel Designer preparerà un preventivo sulla base di ciò che avete definito insieme. Se decidi di partire, ci occuperemo noi della prenotazione di tutto il viaggio.',
          },
        ]
      : []),
  ]

  return (
    <section className="bg-neutro px-4 py-16 lg:px-0 lg:pb-[82px] lg:pt-[78px]">
      <div className="mx-auto max-w-[1312px]">
        <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2 lg:leading-[70px]">
          Come funziona
        </h2>

        <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:mt-[35px] lg:grid-cols-4 lg:gap-[41px]">
          {passi.map((passo, i) => (
            <li key={passo.titolo} className="max-w-[297px]">
              <p className="font-titoli text-[48px] font-bold leading-[70px] text-primario">{i + 1}</p>
              <h3 className="font-titoli text-[21px] font-bold leading-tight lg:mt-[10px]">
                {passo.titolo}
              </h3>
              <p className="mt-4 text-corpo leading-[1.25] lg:mt-[34px]">{passo.testo}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export default async function PaginaVetrina({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams])

  const [vetrina, oreRimborso, oreRiprogrammazione] = await Promise.all([
    leggiVetrina(slug),
    leggiNumeroConfig(CHIAVI.oreRimborsoPieno),
    leggiNumeroConfig(CHIAVI.oreMinimeRiprogrammazione),
  ])
  // La vista contiene solo i profili pubblicati: uno slug sconosciuto e un
  // designer in bozza sono lo stesso caso, ed è giusto che lo siano.
  if (!vetrina) notFound()

  const servizi = vetrina.services
  const attivo = servizioAttivo(servizi, uno(query.servizio))
  const breve = servizi.find((s) => s.service_type === 'consultation')

  // Chi sta guardando, se collegato. Serve solo al tasto *Prenota*: la vetrina
  // resta identica per un anonimo, perché il Flusso vuole la navigazione
  // anonima e il login soltanto al momento della prenotazione.
  //
  // `leggiUtente` è memorizzato per richiesta: l'header chiede la stessa cosa,
  // e il giro verso Supabase si fa una volta.
  const user = await leggiUtente()
  const utente = user
    ? {
        id: user.id,
        nome:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        email: user.email ?? null,
      }
    : null

  const nome = vetrina.display_name
  const viaggi = vetrina.signature_trips
  const itinerari = vetrina.ready_itineraries
  // `?? []`: la colonna arriva con la 0048. Su un database dove la vista non la
  // serve ancora la sezione semplicemente non c'è, invece di rompere la pagina.
  const gruppi = vetrina.group_trips ?? []

  // "Cosa vuol dire viaggiare per me": nel Figma un paragrafo solo, che si
  // legge come la frase di presentazione (`hero_bio`, "cosa credi quando
  // progetti") chiusa da un aforisma (`manifesto`). Il form li raccoglie
  // separati e qui stanno uno dopo l'altro. Quale campo vada dove è una
  // domanda aperta per Chiara, in PIANO.md.
  const credo = [vetrina.hero_bio, vetrina.manifesto].filter(
    (t): t is string => Boolean(t && t.trim()),
  )

  return (
    <div className="bg-crema">
      <Header />

      {/* ------------------------------------------------ Hero e scheda call
          `id="servizi"` è l'ancora del ritorno dal login e dei tasti "Prenota"
          più in basso: porta alla scheda, ovunque la pagina la metta. */}
      <section
        id="servizi"
        className="scroll-mt-4 bg-[#9e6f54] px-4 pb-14 pt-[120px] text-neutro lg:px-[100px] lg:pt-[178px]"
      >
        <div className="mx-auto grid max-w-[1312px] gap-12 min-[1400px]:grid-cols-[minmax(0,1fr)_420px] min-[1400px]:gap-[80px]">
          <Presentazione vetrina={vetrina} />

          {attivo && (
            <div className="mx-auto w-full max-w-[420px] min-[1400px]:mx-0">
              <BoxServizio
                nomeDesigner={nome}
                servizi={servizi}
                attivo={attivo}
                slug={vetrina.slug}
                calUsername={vetrina.cal_username}
                utente={utente}
              />
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------- Cosa vuol dire viaggiare per me */}
      {(credo.length > 0 || viaggi.length > 0) && (
        <section className="px-4 py-16 lg:px-[100px] lg:pb-[49px] lg:pt-[73px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2">
              Cosa vuol dire viaggiare per me
            </h2>

            {credo.length > 0 && (
              <div className="mt-8 max-w-[708px] space-y-4 text-corpo leading-[1.25] lg:mt-[51px]">
                {credo.map((t) => (
                  <p key={t.slice(0, 40)}>{t}</p>
                ))}
              </div>
            )}

            {viaggi.length > 0 && (
              <div className="mt-10 grid gap-[13px] sm:grid-cols-2 lg:mt-14 lg:grid-cols-3">
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
            )}

            <div className="mt-12 text-center">
              <a href="#servizi" className={TASTO}>
                Prenota una call con {nome}
              </a>
            </div>
          </div>
        </section>
      )}

      <ComeFunziona
        nome={nome}
        minuti={breve?.duration_minutes ?? null}
        oreRimborso={oreRimborso}
        oreRiprogrammazione={oreRiprogrammazione}
        servizi={servizi}
      />

      {/* ------------------------------------------ Itinerari pronti da vivere */}
      {itinerari.length > 0 && (
        <section id="itinerari-pronti" className="bg-scuro px-4 py-16 text-neutro lg:px-[100px] lg:py-[90px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2 lg:leading-[70px]">
              Itinerari pronti da vivere
            </h2>
            <p className="mt-8 max-w-[549px] text-corpo leading-[1.25] lg:mt-[60px]">
              Dai un’occhiata agli itinerari già testati e collaudati: possiamo partire da questi
              per personalizzarli il più possibile sulle tue esigenze e necessità!
            </p>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:mt-[90px] lg:grid-cols-3">
              {itinerari.map((itinerario) => (
                <CardItinerario
                  key={itinerario.slug}
                  itinerario={itinerario}
                  href={percorsoItinerario(vetrina.slug, itinerario.slug)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- Viaggi di gruppo
          Dalla 0048 hanno una sorgente. **O c'è piena o non c'è**: senza
          viaggi, niente titolo. */}
      {gruppi.length > 0 && (
        <section id="viaggi-di-gruppo" className="px-4 py-16 lg:px-[100px] lg:pb-[131px] lg:pt-[86px]">
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-titoli text-[40px] font-bold leading-tight lg:text-h2 lg:leading-[70px]">
              Viaggi di gruppo
            </h2>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
              {gruppi.map((viaggio) => (
                <CardViaggioGruppo key={`${viaggio.title}-${viaggio.dates_label}`} viaggio={viaggio} />
              ))}
            </div>
          </div>
        </section>
      )}

      <RecensioniVetrina />

      {/* ------------------------------ Ti sembra il Travel Designer giusto? */}
      <section className="px-4 py-16 lg:px-[93px] lg:pb-[143px] lg:pt-[123px]">
        <div className="mx-auto max-w-[1323px] rounded-[30px] bg-neutro px-6 py-12 text-center shadow-[0px_0px_25px_0px_rgba(0,0,0,0.15)] lg:px-10 lg:pb-11 lg:pt-[61px]">
          <h2 className="font-titoli text-[36px] font-bold leading-tight lg:text-[58px] lg:leading-[70px]">
            Ti sembra il Travel Designer giusto per te?
          </h2>
          <p className="mx-auto mt-8 max-w-[777px] text-[20px] lg:mt-[38px] lg:text-[24px]">
            Conoscilo, raccontagli il tuo viaggio e scopri se è la persona giusta per te.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-[6px] sm:flex-row lg:mt-[54px]">
            <a
              href="#servizi"
              className="w-full max-w-[277px] rounded-[30px] bg-primario px-5 py-[9px] text-corpo text-neutro transition hover:brightness-110"
            >
              Prenota la call con {nome}
            </a>
            <TornaAiRisultati className="w-full max-w-[277px] rounded-[30px] bg-scuro px-5 py-[9px] text-corpo text-neutro transition hover:brightness-125" />
          </div>

          {/* Il credito consulenza (Flusso §6): lo applica il designer nella
              proposta, qui lo si dice soltanto. */}
          <p className="mt-6 text-[12px] italic">
            Se poi parti con {nome}, il costo della call viene scalato dal viaggio.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
