import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { segnalaEccezione } from '@/lib/eccezione'

/**
 * Il clic su uno dei due tasti del dopo-call.
 *
 * **La route non decide niente**: tipo di segnalazione (dal token, non dal
 * form), finestra delle 48 ore, segnalazione già fatta — tutto in
 * `td_report_exception` (0046). Qui si legge il form e si torna alla pagina con
 * l'esito.
 *
 * ⚠️ Il tasto no-show **non** chiude la call come no-show: la passa al team,
 * che verifica. Vedi la testa della 0046, parte A.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params
  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const minutiGrezzi = String(form.get('minuti') ?? '').trim()
  const minuti = /^\d{1,3}$/.test(minutiGrezzi) ? Number(minutiGrezzi) : null

  const esito = await segnalaEccezione(token, minuti, String(form.get('nota') ?? ''))
  // Il token non finisce nei log: solo l'esito.
  if (!esito.ok) console.error('segnalazione non registrata:', esito.esito, esito.campo ?? '')

  const indietro = new URL(`${origineDi(request)}/eccezione/${encodeURIComponent(token)}`)
  indietro.searchParams.set('esito', esito.esito)
  if (esito.campo) indietro.searchParams.set('campo', esito.campo)
  return NextResponse.redirect(indietro, 303)
}
