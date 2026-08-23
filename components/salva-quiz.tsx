'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  leggiQuizDaSessione,
  leggiQuizSalvato,
  segnaQuizSalvato,
  serializzaQuiz,
} from '@/lib/quiz-risposte'

/**
 * Porta il quiz dell'anonimo sul profilo appena esiste una sessione
 * (deviazione 3 di PIANO.md). Non disegna niente.
 *
 * Sta nel layout radice, e non nella pagina del quiz, perché il momento da
 * intercettare è il **login**, non la fine del quiz: dopo Google il viaggiatore
 * atterra su una pagina qualunque, e `sessionStorage` si legge solo dal browser
 * — nessuna route server può accorgersene da sé.
 *
 * Costo quando non c'è niente da fare, che è il caso quasi sempre: una lettura
 * di `sessionStorage` e nient'altro. La sessione si guarda solo se ci sono
 * risposte da salvare, e `getSession()` legge i cookie senza chiamare la rete.
 */
export function SalvaQuiz() {
  useEffect(() => {
    const risposte = leggiQuizDaSessione()
    if (!risposte) return

    const serializzato = serializzaQuiz(risposte)
    // Già mandato: non si rimanda a ogni cambio di pagina. Il confronto è sulle
    // risposte, non su un sì/no, così un quiz rifatto dopo il login si salva.
    if (leggiQuizSalvato() === serializzato) return

    let annullato = false

    async function salva() {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      if (!data.session || annullato) return

      const risposta = await fetch('/quiz/salva', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quiz: serializzato }),
      }).catch(() => null)

      if (!risposta?.ok || annullato) return
      const esito = (await risposta.json().catch(() => null)) as { salvato?: boolean } | null
      // Se il salvataggio non è andato — quiz incompleto, errore di rete — non si
      // segna niente e si riprova alla pagina dopo.
      if (esito?.salvato) segnaQuizSalvato(serializzato)
    }

    salva()
    return () => {
      annullato = true
    }
  }, [])

  return null
}
