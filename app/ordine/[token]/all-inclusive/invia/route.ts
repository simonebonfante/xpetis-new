import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { inviaAllAgenzia } from '@/lib/ordine'

/**
 * La proposta All Inclusive parte verso l'agenzia.
 *
 * Il form ripete il prezzo del riepilogo che il designer ha letto, e
 * `ai_send_to_agency` (0047) lo confronta con la bozza, come fa l'invio del su
 * misura. Tutto il resto — acconto e saldo, la fotografia della proposta, il
 * token monouso dell'agenzia, la sua mail — lo fanno i trigger: questa route
 * non manda niente a nessuno.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params

  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const prezzo = Number.parseInt(String(form.get('prezzo_cents') ?? ''), 10)
  const esito = await inviaAllAgenzia(token, Number.isFinite(prezzo) ? prezzo : null)

  if (!esito.ok) console.error('proposta All Inclusive non inviata:', esito.esito, esito.campo ?? '')

  const indietro = new URL(`${origineDi(request)}/ordine/${encodeURIComponent(token)}`)
  indietro.searchParams.set('esito', esito.esito)
  if (esito.campo) indietro.searchParams.set('campo', esito.campo)
  return NextResponse.redirect(indietro, 303)
}
