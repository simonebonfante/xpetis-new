import { Header } from '@/components/header'
import { QuizDomande } from '@/components/quiz-domande'
import { leggiAssiQuiz } from '@/lib/quiz'
import { leggiQuiz } from '@/lib/quiz-risposte'

/**
 * Il quiz, nodi Figma 346:932 e 346:896.
 *
 * È **sempre disponibile, con o senza destinazione** (Flusso §1): ci si arriva
 * dalla home ("Lasciati ispirare", "Non hai ancora le idee chiare?") e dalla
 * colonna dei filtri di `/ricerca` ("Modifica le risposte del quiz"). Nel
 * secondo caso la query porta con sé destinazione, filtri e risposte già date, e
 * questa pagina le rimette intatte nell'URL d'uscita: chi aveva scelto il
 * Vietnam non deve ritrovarsi a cercare nel mondo.
 *
 * Il Server Component legge le sei domande e non fa altro; il passo, le risposte
 * e `sessionStorage` vivono nel componente client. La pagina non ha piè di
 * pagina perché il Figma non lo disegna: le due schermate sono un percorso, non
 * una pagina da esplorare.
 */
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function uno(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

export default async function PaginaQuiz({ searchParams }: Props) {
  const params = await searchParams
  const assi = await leggiAssiQuiz()

  // Destinazione e filtri si riportano **così come sono**, senza rileggerli dal
  // database: qui non servono né il nome né il livello, e `/ricerca` già tratta
  // una destinazione inesistente o non filtrabile come "nessuna destinazione".
  const queryBase = new URLSearchParams()
  const livello = uno(params.livello)
  const ref = uno(params.ref)
  if (livello && ref) {
    queryBase.set('livello', livello)
    queryBase.set('ref', ref)
  }
  for (const chiave of ['temi', 'contesti'] as const) {
    const valore = uno(params[chiave])
    if (valore) queryBase.set(chiave, valore)
  }

  return (
    <div className="relative min-h-screen bg-crema">
      <Header />

      <main className="mx-auto max-w-[1312px] px-4 pb-16 pt-[130px] lg:px-0 lg:pb-24 lg:pt-[162px]">
        <QuizDomande
          assi={assi}
          queryBase={queryBase.toString()}
          quizIniziale={leggiQuiz(uno(params.quiz))}
        />
      </main>
    </div>
  )
}
