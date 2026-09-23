'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Al ritorno da Stripe, sulla pagina della proposta: si ridisegna la pagina
 * finché il database non dice che l'ordine è pagato.
 *
 * **Non decide niente.** `?ritorno=1` lo può scrivere chiunque nella barra degli
 * indirizzi; la prova del pagamento è la riga che il webhook firmato di Stripe
 * scrive nel database. Qui si chiede al server di rileggere, e basta — come fa
 * `StatoPrenotazione` per la consulenza, ma senza un endpoint di stato: la
 * pagina gemella è già server-side, e `router.refresh()` la rilegge.
 *
 * ⚠️ Ogni ridisegno risolve di nuovo il token, quindi conta un uso: è
 * telemetria (0043), nessun automatismo decide niente su `use_count`. Il tetto
 * di tentativi lo tiene basso.
 */
const PAUSA_MS = 2000
const TENTATIVI = 20

export function AttesaConferma() {
  const router = useRouter()
  const [rinunciato, setRinunciato] = useState(false)

  useEffect(() => {
    let n = 0
    const battito = setInterval(() => {
      n += 1
      if (n > TENTATIVI) {
        clearInterval(battito)
        setRinunciato(true)
        return
      }
      router.refresh()
    }, PAUSA_MS)
    return () => clearInterval(battito)
  }, [router])

  return (
    <p role="status" className="rounded-2xl border border-scuro/30 px-5 py-4 text-corpo">
      {rinunciato
        ? 'Il pagamento non risulta ancora registrato. Di solito basta un minuto: ricarica la pagina più tardi. Se ti è stato addebitato e qui non cambia niente, scrivici.'
        : 'Stiamo registrando il pagamento…'}
    </p>
  )
}
