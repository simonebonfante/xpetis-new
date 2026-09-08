import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { AttesaPrenotazione } from '@/components/attesa-prenotazione'

export const dynamic = 'force-dynamic'

/**
 * Dove atterra il viaggiatore appena l'embed di Cal.com dice "prenotato".
 *
 * La pagina non sa niente di Cal.com — non ha il codice della prenotazione e non
 * deve averlo: dopo S-05 quel codice è una credenziale. Sa solo che chi la sta
 * guardando è loggato, e questo basta al server per ritrovare la sua
 * prenotazione appena il webhook arriva. Il perché in lungo sta in
 * `app/attesa/cerca/route.ts`.
 */
export default async function Attesa() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Senza sessione questa pagina non ha nemmeno una domanda da fare: la
  // prenotazione si cerca per viaggiatore.
  if (!user) redirect('/')

  const whatsapp = await leggiContatto(CHIAVI.whatsapp)

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-10">
      <AttesaPrenotazione whatsapp={whatsapp} />
    </main>
  )
}
