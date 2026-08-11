import Image from 'next/image'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Bottone } from '@/components/bottone'
import { BadgeStella } from '@/components/badge-stella'
import { RicercaDestinazione } from '@/components/ricerca-destinazione'

const VANTAGGI = [
  { icona: 'icona-ricerca', testo: 'Evitare ore di ricerca' },
  { icona: 'icona-supporto', testo: 'Avere supporto prima, durante e dopo il viaggio' },
  { icona: 'icona-misura', testo: 'Vivere un’esperienza costruita davvero su di te' },
]

const MODALITA = [
  {
    numero: '1',
    titolo: 'Progetta il tuo viaggio',
    testo:
      'Parti da una call con il tuo Travel Designer. Insieme costruite l’itinerario perfetto per te. Scegli tra le diverse possibilità:',
    punti: ['Consulenza', 'Itinerario su misura', 'Pacchetto all inclusive'],
  },
  {
    numero: '2',
    titolo: 'Itinerari pronti',
    testo:
      'Esplora itinerari già progettati da Travel Designer esperti, pensati per essere vissuti così come sono o adattati alle tue esigenze.',
    punti: ['Personalizzabili con il designer'],
  },
  {
    numero: '3',
    titolo: 'Viaggi di gruppo',
    testo:
      'Unisciti a viaggi organizzati e guidati da Travel Designer. Condividi l’esperienza mantenendo il rapporto diretto con chi l’ha creata.',
    punti: [
      'Itinerari curati in ogni dettaglio',
      'Call col designer prima di partire',
      'Ideale per chi parte da solo',
    ],
  },
]

export default function Homepage() {
  return (
    <>
      <Header />

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative flex min-h-[760px] items-center justify-center overflow-hidden lg:h-[1007px]">
        <Image
          src="/img/hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-scuro/20" />

        <BadgeStella
          testo="Dove ti portiamo?"
          stella="stella-grande"
          dimensione={231}
          rotazione={-4.18}
          className="absolute left-16 top-[200px] hidden xl:block"
        />
        <BadgeStella
          testo="Pront* a partire?"
          dimensione={183}
          rotazione={11.53}
          className="absolute right-16 top-[717px] hidden xl:block"
        />

        <div className="relative z-10 flex w-full max-w-[1217px] flex-col items-center gap-8 px-4 text-center">
          <h1 className="font-titoli text-[44px] font-bold leading-tight text-neutro sm:text-[60px] lg:text-h1">
            Il viaggio giusto nasce dall’incontro giusto
          </h1>

          <RicercaDestinazione />

          <Link href="/quiz" className="text-corpo-big text-neutro underline-offset-4 hover:underline">
            Non hai ancora le idee chiare? Ti aiutiamo noi!
          </Link>

          <Bottone href="/quiz" freccia>
            Lasciati ispirare
          </Bottone>
        </div>
      </section>

      {/* -------------------------------------------- il valore di un viaggio */}
      <section className="bg-crema py-24 lg:py-32">
        <div className="mx-auto max-w-[1312px] px-4 lg:px-0">
          <h2 className="max-w-[867px] font-titoli text-[40px] font-bold leading-tight lg:text-h2">
            Il valore di un viaggio <br />
            <span className="text-primario">progettato su misura</span>
          </h2>

          <div className="mt-16 grid gap-12 lg:grid-cols-2 lg:items-start">
            <div className="max-w-[548px] space-y-5 text-corpo">
              <p>
                Un Travel Designer non è semplicemente qualcuno che ti consiglia una meta. È un
                professionista che progetta esperienze di viaggio intorno a te.
              </p>
              <p>
                Ascolta i tuoi desideri, interpreta i tuoi bisogni e li trasforma in un itinerario
                coerente, curato e realistico. Dalla scelta delle destinazioni alla costruzione delle
                tappe, fino alla gestione di imprevisti e dettagli pratici.
              </p>
              <p>
                Su XPETIS trovi professionisti indipendenti, ognuno con il proprio approccio, stile e
                specializzazione.
              </p>
            </div>

            <div className="rounded-[25px] bg-neutro p-8 lg:p-10">
              <p className="font-titoli text-[28px] font-bold leading-tight lg:text-h3">
                Scegli chi risuona con il tuo modo di viaggiare e costruite insieme{' '}
                <span className="text-primario">qualcosa di unico</span>.
              </p>
              <div className="mt-10 flex justify-end">
                <Bottone href="/designer" freccia>
                  Scopri i Travel Designer
                </Bottone>
              </div>
            </div>
          </div>

          <p className="mt-20 text-corpo">Affidarti a un Travel Designer significa</p>
          <ul className="mt-6 grid gap-6 lg:grid-cols-3">
            {VANTAGGI.map((vantaggio) => (
              <li
                key={vantaggio.testo}
                className="flex min-h-[108px] items-center gap-6 rounded-[20px] bg-neutro px-8 py-6"
              >
                <Image
                  src={`/img/${vantaggio.icona}.svg`}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 shrink-0"
                />
                <span className="text-corpo">{vantaggio.testo}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------ come puoi viaggiare (scura) */}
      <section className="bg-scuro py-24 text-neutro lg:py-32">
        <div className="mx-auto max-w-[1312px] px-4 lg:px-0">
          <h2 className="max-w-[867px] font-titoli text-[40px] font-bold leading-tight lg:text-h2">
            Come puoi <span className="text-primario">viaggiare</span> <br />
            con XPETIS
          </h2>
          <p className="mt-8 max-w-[549px] text-corpo">
            Scegli il livello di supporto che desideri: dal confronto con un esperto alla
            progettazione completa del viaggio.
          </p>

          <div className="mt-20 grid gap-6 lg:grid-cols-3">
            {MODALITA.map((modalita) => (
              <article
                key={modalita.numero}
                className="relative rounded-[30px] bg-neutro px-8 pb-10 pt-16 text-scuro"
              >
                <BadgeStella
                  testo={modalita.numero}
                  stella="stella-piccola"
                  dimensione={71}
                  className="absolute -top-8 left-8"
                />
                <h3 className="font-titoli text-h4 font-bold text-primario">{modalita.titolo}</h3>
                <p className="mt-6 text-corpo">{modalita.testo}</p>
                <ul className="mt-6 space-y-2">
                  {modalita.punti.map((punto) => (
                    <li key={punto} className="flex items-center gap-3 text-corpo">
                      <Image
                        src="/img/pallino.svg"
                        alt=""
                        width={5}
                        height={5}
                        className="h-[5px] w-[5px] shrink-0"
                      />
                      {punto}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ chiusura */}
      <section className="bg-crema py-24 text-center lg:py-32">
        <h2 className="mx-auto max-w-[1217px] px-4 font-titoli text-[44px] font-bold leading-tight sm:text-[60px] lg:text-h1">
          Il viaggio giusto nasce dall’incontro giusto
        </h2>
        <div className="mt-12 flex justify-center">
          <Bottone href="/designer" freccia>
            Scopri i Travel Designer
          </Bottone>
        </div>
      </section>

      <Footer />
    </>
  )
}
