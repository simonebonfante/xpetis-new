/**
 * L'unica porta verso `public_quiz_axes`, e sta solo lato server — come
 * `lib/match.ts` verso `match_designers()` e `lib/vetrina.ts` verso
 * `public_td_showcase`.
 *
 * La vista è concessa anche ad `anon`, quindi il browser *potrebbe* leggerla da
 * sé; si legge comunque dal server perché la pagina del quiz è un Server
 * Component e le sei domande arrivano già in pagina, senza un giro di rete in
 * più e senza far dipendere il primo render da JavaScript.
 *
 * Cosa la vista dà: codice, tipo, etichetta, domanda, scala e le opzioni. Cosa
 * **non** dà, dalla migration 0018: il peso dell'asse. Il match si calcola solo
 * lato server, quindi il quiz non ne ha bisogno.
 */
import { createClient } from '@/lib/supabase/server'
import type { AsseQuiz, OpzioneQuiz } from '@/lib/quiz-risposte'

type Riga = {
  code: string
  kind: string
  label_it: string
  question_it: string | null
  scale_min: number
  scale_max: number
  sort_order: number
  /** `{ "1": "Comfort", "2": "DA SCRIVERE", … }`, aggregato dalla vista. */
  options: Record<string, string> | null
}

/**
 * I sei assi in ordine di `sort_order`, che è l'ordine delle domande.
 *
 * Le opzioni si costruiscono percorrendo la scala dichiarata dall'asse, non le
 * chiavi del JSON: se un giorno mancasse la riga di un valore, la domanda mostra
 * quella risposta senza etichetta invece di far scomparire una scelta possibile.
 * Un buco si vede; una scelta che manca no.
 */
export async function leggiAssiQuiz(): Promise<AsseQuiz[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('public_quiz_axes')
    .select('code, kind, label_it, question_it, scale_min, scale_max, sort_order, options')
    .order('sort_order')

  if (error) throw new Error(`public_quiz_axes: ${error.message}`)

  return ((data ?? []) as Riga[]).map((riga) => {
    const opzioni: OpzioneQuiz[] = []
    for (let valore = riga.scale_min; valore <= riga.scale_max; valore++) {
      opzioni.push({ valore, etichetta: riga.options?.[String(valore)] ?? null })
    }
    return {
      code: riga.code,
      kind: riga.kind === 'categorical' ? 'categorical' : 'continuous',
      label_it: riga.label_it,
      // Una domanda tutta di spazi è come una domanda che non c'è: la pagina la
      // deve trattare allo stesso modo, cioè dirlo.
      question_it: riga.question_it?.trim() || null,
      scale_min: riga.scale_min,
      scale_max: riga.scale_max,
      sort_order: riga.sort_order,
      opzioni,
    }
  })
}
