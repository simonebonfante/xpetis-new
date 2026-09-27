import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { chiediRevisione } from '@/lib/ordine'

/**
 * La richiesta della revisione inclusa, dalla pagina del viaggiatore.
 *
 * **La route non decide niente**: una sola, dentro la finestra, con una nota —
 * lo dice `request_revision` (0046), e le sue risposte tornano alla pagina come
 * `?revisione=`. È HTML che fa POST: funziona senza JavaScript.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params
  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const esito = await chiediRevisione(token, String(form.get('nota') ?? ''))
  if (!esito.ok) console.error('revisione non chiesta:', esito.esito)

  const indietro = new URL(`${origineDi(request)}/proposta/${encodeURIComponent(token)}`)
  indietro.searchParams.set('revisione', esito.esito)
  return NextResponse.redirect(indietro, 303)
}
