import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leggiQuiz, type Quiz } from '@/lib/quiz-risposte'

/**
 * Il travaso del quiz dell'anonimo sul profilo, al primo login.
 *
 * È la **deviazione 3** di PIANO.md: il Flusso lascia le risposte in
 * `sessionStorage`, dove si perdono chiudendo la scheda, ma il briefing che il
 * designer riceve prima della call contiene il profilo quiz — senza salvataggio
 * arriverebbe vuoto proprio nel pezzo che il designer legge.
 *
 * Perché una route e non una scrittura dal browser: `quiz_responses` ha la RLS
 * accesa e nessuna policy: il client non parla mai con le tabelle. Qui la
 * sessione si verifica coi cookie (chiave publishable) e si scrive con la chiave
 * secret, che non esce da questo file.
 *
 * Cosa **non** fa, di proposito:
 *
 *  · non salva le risposte degli anonimi. La tabella lo permetterebbe
 *    (`session_id`), ma sarebbe un endpoint di scrittura aperto a chiunque, e il
 *    Flusso chiede il salvataggio al login, non prima.
 *  · non salva filtri e destinazione, che vivono nella query di `/ricerca` e non
 *    in `sessionStorage`. Le colonne `filters` e `destination_country_code`
 *    restano ai loro valori di partenza: quando serviranno si passeranno da qui.
 */

/** Due insiemi di risposte sono la stessa cosa se coincidono chiave per chiave. */
function stesseRisposte(a: Quiz, b: Quiz): boolean {
  const chiavi = Object.keys(a)
  if (chiavi.length !== Object.keys(b).length) return false
  return chiavi.every((chiave) => a[chiave] === b[chiave])
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ salvato: false, motivo: 'nessuna sessione' }, { status: 401 })
  }

  const corpo = (await request.json().catch(() => null)) as { quiz?: unknown } | null
  const inviate = leggiQuiz(typeof corpo?.quiz === 'string' ? corpo.quiz : null)
  if (!inviate) {
    return NextResponse.json({ salvato: false, motivo: 'nessuna risposta' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Gli assi ammessi e le loro scale vengono dal database: il codice non sa
  // quanti sono né fin dove arriva la scala di ciascuno.
  const { data: assi, error: erroreAssi } = await admin
    .from('public_quiz_axes')
    .select('code, scale_min, scale_max')

  if (erroreAssi) {
    return NextResponse.json({ salvato: false, motivo: 'assi illeggibili' }, { status: 500 })
  }

  const risposte: Quiz = {}
  for (const asse of assi ?? []) {
    const valore = inviate[asse.code]
    if (typeof valore === 'number' && valore >= asse.scale_min && valore <= asse.scale_max) {
      risposte[asse.code] = valore
    }
  }

  // Niente quiz a metà, nemmeno qui: un profilo parziale nel briefing è peggio
  // di nessun profilo, perché sembra una risposta e non lo è.
  if ((assi ?? []).length === 0 || Object.keys(risposte).length !== (assi ?? []).length) {
    return NextResponse.json({ salvato: false, motivo: 'quiz incompleto' })
  }

  // `quiz_responses` è un registro e non ha un indice unico per viaggiatore:
  // l'idempotenza la fa questo confronto con l'ultima riga, perché il componente
  // client rimonta a ogni pagina e non deve moltiplicare la stessa risposta.
  // (Un indice unico sarebbe una migration, e non se ne aggiungono di iniziativa.)
  const { data: ultime } = await admin
    .from('quiz_responses')
    .select('id, answers')
    .eq('traveler_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)

  const ultima = ultime?.[0]?.answers as Quiz | undefined
  if (ultima && stesseRisposte(ultima, risposte)) {
    return NextResponse.json({ salvato: true, motivo: 'già salvato' })
  }

  const { error } = await admin
    .from('quiz_responses')
    .insert({ traveler_id: user.id, answers: risposte })

  if (error) {
    return NextResponse.json({ salvato: false, motivo: error.message }, { status: 500 })
  }

  return NextResponse.json({ salvato: true })
}
