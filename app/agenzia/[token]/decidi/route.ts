import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { decidi } from '@/lib/agenzia'

/**
 * La risposta dell'agenzia: «Confermo» o «Non fattibile».
 *
 * **La route non decide niente.** Chi risponde, su quale proposta, se il link
 * vale ancora, se la stessa proposta ha già una risposta — lo dice
 * `agency_decide` (0047), dove la prima risposta vince per chiave primaria. È
 * HTML che fa POST: funziona senza JavaScript, dal browser dentro il
 * programma di posta.
 *
 * Il clic sblocca una cascata (la proposta al viaggiatore, l'acconto), quindi
 * la stessa cintura delle altre pagine a token: `Origin` confrontato con
 * l'host, `"null"` rifiutato — vedi `origineAmmessa()` e, per la ragione per
 * cui la pagina ha `strict-origin` e non `no-referrer`, `next.config.ts`.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params

  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const esito = await decidi(token, String(form.get('decisione') ?? ''), String(form.get('nota') ?? ''))

  // Il token non finisce nei log: solo l'esito.
  if (!esito.ok) console.error('risposta dell\'agenzia non registrata:', esito.esito, esito.campo ?? '')

  const indietro = new URL(`${origineDi(request)}/agenzia/${encodeURIComponent(token)}`)
  indietro.searchParams.set('esito', esito.esito)
  if (esito.campo) indietro.searchParams.set('campo', esito.campo)
  return NextResponse.redirect(indietro, 303)
}
