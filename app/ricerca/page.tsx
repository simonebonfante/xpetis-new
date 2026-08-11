import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Bottone } from '@/components/bottone'
import { BadgeStella } from '@/components/badge-stella'
import { RicercaDestinazione } from '@/components/ricerca-destinazione'
import { FiltriRicerca } from '@/components/filtri-ricerca'
import { CardDesigner } from '@/components/card-designer'
import { componiFrase } from '@/lib/frase'
import {
  cercaDesigner,
  contaDesignerPubblicati,
  leggiDestinazione,
  leggiTag,
  type Destinazione,
  type Quiz,
  type RisultatoMatch,
  type Sezione,
} from '@/lib/match'

/** Quanti risultati alla volta. "Carica ancora" alza il tetto, non pagina. */
const PER_PAGINA = 8
const TETTO = 200

/**
 * I divisori di sezione. Il Flusso li vuole "dichiarati con onestà": dalle
 * bande quando c'è una destinazione, dalla soglia del badge quando non c'è.
 *
 * **Il Figma 177:262 non li disegna**, ma quella schermata è l'arrivo dal quiz,
 * cioè il caso senza destinazione, dove il Flusso stesso prevede una fascia
 * unica. Qui i divisori compaiono quindi solo con una destinazione, dove
 * dicono qualcosa che il viaggiatore non può dedurre da solo. Da confermare con
 * Chiara e Gaia insieme ai testi.
 *
 * Due note per chi li riscrive:
 *  · "Esperti di {nome}" viene dal Flusso alla lettera e su alcuni paesi zoppica
 *    ("Esperti di Vietnam"): la tassonomia non porta l'articolo. Stesso
 *    avvertimento in testa a `lib/frase.ts`.
 *  · `esperti_macro_area` non esiste nel Flusso: è nata l'8 agosto, quando si è
 *    deciso che una macro-area filtra. Lì la banda 2 sparisce, perché "un altro
 *    paese della stessa area" è già ciò che l'utente ha chiesto.
 */
function titoloSezione(sezione: Sezione, destinazione: Destinazione): string | null {
  switch (sezione) {
    case 'esperti_paese':
    case 'esperti_macro_area':
      return `Esperti di ${destinazione.nome}`
    case 'macro_area':
      return 'Allarghiamo alla regione'
    case 'continente':
      return 'Se sei flessibile sulla meta'
    case 'fallback':
      return 'Mostra di più'
    default:
      return null
  }
}

const INTRO_FALLBACK =
  'Nessuno di questi lavora sulla meta che hai scelto, ma potrebbe comunque valere la pena conoscerli.'

/**
 * Le risposte del quiz viaggiano nella query: `quiz=pace:1,comfort_wild:4`.
 *
 * Così la pagina resta interamente renderizzata dal server — il match non deve
 * mai passare dal browser — e un risultato è condivisibile per link. Da anonimo
 * il quiz vive in `sessionStorage` (Flusso §1) e sarà la pagina del quiz a
 * travasarlo qui: quel pezzo arriva con la milestone del quiz.
 */
function leggiQuiz(grezzo: string | undefined): Quiz | null {
  if (!grezzo) return null
  const quiz: Quiz = {}
  for (const coppia of grezzo.split(',')) {
    const [codice, valore] = coppia.split(':')
    const n = Number(valore)
    // Le scale sono 1-4 sui cinque assi continui, 1-5 su "con chi viaggi".
    if (codice && Number.isInteger(n) && n >= 1 && n <= 5) quiz[codice] = n
  }
  return Object.keys(quiz).length > 0 ? quiz : null
}

function leggiLista(grezzo: string | undefined): string[] {
  return (grezzo ?? '').split(',').filter(Boolean)
}

function uno(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PaginaRicerca({ searchParams }: Props) {
  const params = await searchParams

  // Una destinazione inesistente o non filtrabile (una città, un continente)
  // torna `null`: la pagina si comporta come una ricerca senza destinazione
  // invece di rompersi in faccia a chi ha modificato l'indirizzo a mano.
  const destinazione = await leggiDestinazione(uno(params.livello), uno(params.ref))
  const quiz = leggiQuiz(uno(params.quiz))
  const temi = leggiLista(uno(params.temi))
  const contesti = leggiLista(uno(params.contesti))
  const limite = Math.min(Math.max(Number(uno(params.n)) || PER_PAGINA, PER_PAGINA), TETTO)

  const [{ risultati, totale }, tag, quantiDesigner] = await Promise.all([
    cercaDesigner({ destinazione, quiz, temi, contesti, limite }),
    leggiTag(),
    contaDesignerPubblicati(),
  ])

  // I risultati arrivano già in ordine: raggruppare di seguito conserva sia
  // l'ordine delle sezioni sia quello dentro ogni sezione. Una sezione vuota non
  // esiste, quindi non mostra il suo divisore.
  const sezioni: { sezione: Sezione; righe: RisultatoMatch[] }[] = []
  for (const riga of risultati) {
    const ultima = sezioni[sezioni.length - 1]
    if (ultima?.sezione === riga.section) ultima.righe.push(riga)
    else sezioni.push({ sezione: riga.section, righe: [riga] })
  }

  // La query da conservare quando si cambia destinazione o si va al quiz.
  const restoQuery = new URLSearchParams()
  if (temi.length) restoQuery.set('temi', temi.join(','))
  if (contesti.length) restoQuery.set('contesti', contesti.join(','))
  if (uno(params.quiz)) restoQuery.set('quiz', uno(params.quiz)!)

  const queryQuiz = new URLSearchParams(restoQuery)
  if (destinazione) {
    queryQuiz.set('livello', destinazione.livello)
    queryQuiz.set('ref', destinazione.ref)
  }

  const ancora = totale - risultati.length
  const queryAncora = new URLSearchParams(queryQuiz)
  queryAncora.set('n', String(Math.min(limite + PER_PAGINA, TETTO)))

  return (
    <div className="relative bg-crema">
      <Header />

      <main className="relative mx-auto max-w-[1312px] px-4 pt-[160px] lg:px-0 lg:pt-[209px]">
        {/* I due bolli del Figma. Quello della valutazione media resta fuori
            finché non esistono recensioni: `td_review_stats` non è esposta al
            browser e la milestone 8 non è cominciata. Il conteggio dei designer
            invece è quello vero — nel Figma c'è "+100", che oggi sarebbe falso. */}
        <BadgeStella
          testo={`+${quantiDesigner} Designer`}
          dimensione={183}
          rotazione={11.53}
          className="absolute left-[1071px] top-[280px] hidden xl:block"
        />

        <h1 className="max-w-[721px] font-titoli text-[40px] font-bold leading-tight lg:text-h2">
          {destinazione ? (
            <>
              I Travel Designer per <span className="text-primario">{destinazione.nome}</span>
            </>
          ) : (
            <>
              Scegli il <span className="text-primario">Travel Designer</span> adatto a te
            </>
          )}
        </h1>

        <p className="mt-16 max-w-[572px] text-corpo">
          Abbiamo selezionato i Travel Designer più affini al tuo modo di viaggiare. Esplora le loro
          vetrine e scegli chi saprà guidarti al meglio nel tuo viaggio!
        </p>

        {/* La barra persistente del Flusso: destinazione modificabile. */}
        <div className="mt-[70px]">
          <RicercaDestinazione
            larga
            lente
            azioneSempre
            etichettaAzione="Modifica"
            destinazioneIniziale={destinazione}
            mantieni={restoQuery.toString()}
          />
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[424px_minmax(0,1fr)]">
          <FiltriRicerca
            temi={tag.temi}
            contesti={tag.contesti}
            linkQuiz={`/quiz?${queryQuiz}`}
          />

          <div>
            {totale === 0 && (
              <p className="text-corpo-big">
                Non c’è ancora nessun Travel Designer pubblicato. Torna a trovarci.
              </p>
            )}

            {sezioni.map(({ sezione, righe }) => {
              const card = (
                <div className="grid gap-5 sm:grid-cols-2">
                  {righe.map((riga) => (
                    <CardDesigner
                      key={riga.td_id}
                      risultato={riga}
                      frase={componiFrase({
                        risultato: riga,
                        destinazione,
                        quiz,
                        etichetteTemi: tag.etichette,
                      })}
                      // Il tag dei paesi serve dove la copertura non è già detta
                      // dalla sezione: senza destinazione, e in tutte le sezioni
                      // che non sono "esperti della meta cercata".
                      mostraPaesi={!destinazione || riga.band !== 3}
                      etichetteTemi={tag.etichette}
                    />
                  ))}
                </div>
              )

              // Con una destinazione la banda 0 sta dietro un "Mostra di più",
              // come chiede il Flusso. Senza destinazione il fallback resta in
              // pagina, preceduto dalla sua frase onesta.
              if (destinazione && sezione === 'fallback') {
                return (
                  <details key={sezione} className="mt-12 first:mt-0">
                    <summary className="cursor-pointer font-titoli text-h4 font-bold marker:text-primario">
                      {titoloSezione(sezione, destinazione)}
                    </summary>
                    <p className="mt-3 max-w-[640px] text-corpo text-scuro/70">{INTRO_FALLBACK}</p>
                    <div className="mt-6">{card}</div>
                  </details>
                )
              }

              const titolo = destinazione ? titoloSezione(sezione, destinazione) : null

              return (
                <section key={sezione} className="mt-12 first:mt-0">
                  {titolo && <h2 className="mb-6 font-titoli text-h4 font-bold">{titolo}</h2>}
                  {!destinazione && sezione === 'fallback' && (
                    <p className="mb-6 max-w-[640px] text-corpo text-scuro/70">{INTRO_FALLBACK}</p>
                  )}
                  {card}
                </section>
              )
            })}

            {ancora > 0 && (
              <div className="mt-12 flex justify-end">
                <Bottone href={`/ricerca?${queryAncora}`} freccia>
                  Carica ancora
                </Bottone>
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="mt-24">
        <Footer />
      </div>
    </div>
  )
}
