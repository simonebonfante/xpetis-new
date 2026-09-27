import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { euroInCentesimi, importoBenScritto, salvaBozza } from '@/lib/ordine'

/**
 * Il designer salva la bozza della proposta.
 *
 * **Questa route non decide niente.** Legge il form, trasforma gli euro in
 * centesimi e passa tutto a `save_proposal_draft` (migration 0044): è lei che
 * sa se l'ordine è in uno stato che ammette una bozza, se il token è ancora del
 * designer dell'ordine, se il credito è già stato usato su un altro ordine.
 *
 * ⚠️ Il prezzo passa **così come l'ha scritto il designer**. Il campo credito è
 * una dichiarazione per lo spot-check del team, non un importo da sottrarre: se
 * qualcuno un giorno aggiunge qui `prezzo - credito`, il viaggiatore paga la
 * consulenza una volta meno di quanto il designer ha deciso.
 *
 * Un campo che non si legge (un prezzo «abc») arriva a Postgres come `null`, e
 * Postgres risponde `dati_non_validi` con il nome del campo: così le regole su
 * cosa è un prezzo valido restano in un posto solo.
 *
 * Prima ancora, la **forma** del campo (`importoBenScritto`: due decimali al
 * massimo, nessuno zero iniziale). Il form la chiede già con `pattern`, ma
 * quello è un suggerimento al browser: qui arriva comunque quello che viene
 * mandato, e «030» non deve diventare 30 €.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params

  // Stessa cintura di `/servizio/[token]/richiedi`: vedi `origineAmmessa()`.
  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const form = await request.formData()
  const testo = (k: string) => String(form.get(k) ?? '')
  const giorni = Number.parseInt(testo('giorni'), 10)
  const creditoGrezzo = testo('credito').trim()
  const importo = (grezzo: string) => (importoBenScritto(grezzo) ? euroInCentesimi(grezzo) : null)

  const esito = await salvaBozza(token, {
    descrizione: testo('descrizione'),
    prezzoCents: importo(testo('prezzo')),
    giorni: Number.isFinite(giorni) ? giorni : null,
    // Un campo credito lasciato vuoto vuol dire «non ho scalato niente».
    creditoCents: creditoGrezzo === '' ? 0 : importo(creditoGrezzo),
  })

  // Il token non finisce nei log: solo l'esito.
  if (!esito.ok) console.error('bozza proposta non salvata:', esito.esito, esito.campo ?? '')

  const indietro = new URL(`${origineDi(request)}/ordine/${encodeURIComponent(token)}`)
  if (!esito.ok) {
    indietro.searchParams.set('esito', esito.esito)
    if (esito.campo) indietro.searchParams.set('campo', esito.campo)
    if (esito.motivo) indietro.searchParams.set('motivo', esito.motivo)
    if (esito.su) indietro.searchParams.set('su', esito.su)
    // Con un errore sul form si torna al form, non al riepilogo della bozza
    // vecchia: il designer stava correggendo.
    indietro.searchParams.set('modifica', '1')
  }
  // 303: il browser segue in GET, e un ricarica non ripete il POST.
  return NextResponse.redirect(indietro, 303)
}
