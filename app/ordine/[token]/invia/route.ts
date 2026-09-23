import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { inviaProposta } from '@/lib/ordine'

/**
 * Il gesto irreversibile: la proposta parte.
 *
 * Il form porta **il prezzo del riepilogo che il designer ha letto**, e
 * `send_proposal` (migration 0044) lo confronta con la bozza salvata: se sono
 * diversi — un'altra scheda, un altro telefono — rifiuta invece di mandare un
 * prezzo che nessuno ha riletto. Non è un importo che il browser impone: è una
 * conferma che il browser ripete, e il prezzo che parte resta quello del
 * database.
 *
 * Tutto il resto lo fanno i trigger dell'ordine: la fotografia della proposta,
 * la pagina gemella, la mail al viaggiatore. Questa route non manda niente a
 * nessuno.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params

  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const prezzo = Number.parseInt(String(form.get('prezzo_cents') ?? ''), 10)
  const esito = await inviaProposta(token, Number.isFinite(prezzo) ? prezzo : null)

  if (!esito.ok) console.error('proposta non inviata:', esito.esito)

  const indietro = new URL(`${origineDi(request)}/ordine/${encodeURIComponent(token)}`)
  indietro.searchParams.set('esito', esito.esito)
  return NextResponse.redirect(indietro, 303)
}
