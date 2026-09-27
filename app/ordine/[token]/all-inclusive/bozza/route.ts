import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { euroInCentesimi, importoBenScritto, salvaBozzaAI } from '@/lib/ordine'

/**
 * Il designer salva la bozza della proposta All Inclusive. La gemella di
 * `/ordine/[token]/bozza`: **non decide niente**, legge il form e passa tutto a
 * `ai_save_draft` (0047), che sa se lo stato ammette una bozza, se la partenza
 * è nel futuro, se il credito è già stato usato altrove.
 *
 * ⚠️ Il prezzo passa così come l'ha scritto il designer: è il totale finale, e
 * nessuno qui sottrae il credito né calcola l'acconto. L'acconto lo calcola il
 * database, all'invio.
 *
 * Le date arrivano da `type="date"` come `AAAA-MM-GG`; tutto il resto diventa
 * `null`, e il database risponde col nome del campo.
 */
const DATA = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params

  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const testo = (k: string) => String(form.get(k) ?? '').trim()
  const data = (k: string) => (DATA.test(testo(k)) ? testo(k) : null)
  const creditoGrezzo = testo('credito')
  const importo = (grezzo: string) => (importoBenScritto(grezzo) ? euroInCentesimi(grezzo) : null)

  const esito = await salvaBozzaAI(token, {
    descrizione: String(form.get('descrizione') ?? ''),
    prezzoCents: importo(testo('prezzo')),
    partenza: data('partenza'),
    // Il rientro è facoltativo: vuoto è «non indicato». Scritto ma illeggibile
    // non deve diventare «non indicato» in silenzio: si manda una data che il
    // database rifiuta sul campo giusto, perché è prima di qualunque partenza.
    ritorno: testo('ritorno') === '' ? null : (data('ritorno') ?? '0001-01-01'),
    creditoCents: creditoGrezzo === '' ? 0 : importo(creditoGrezzo),
  })

  if (!esito.ok) console.error('bozza All Inclusive non salvata:', esito.esito, esito.campo ?? '')

  const indietro = new URL(`${origineDi(request)}/ordine/${encodeURIComponent(token)}`)
  if (!esito.ok) {
    indietro.searchParams.set('esito', esito.esito)
    if (esito.campo) indietro.searchParams.set('campo', esito.campo)
    if (esito.motivo) indietro.searchParams.set('motivo', esito.motivo)
    if (esito.su) indietro.searchParams.set('su', esito.su)
    indietro.searchParams.set('modifica', '1')
  }
  return NextResponse.redirect(indietro, 303)
}
