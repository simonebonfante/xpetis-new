import { NextResponse } from 'next/server'
import { origineAmmessa } from '@/lib/origine'
import { registraConsegna } from '@/lib/ordine'
import { cancellaOggetto, leggiOggetto } from '@/lib/documenti'

/**
 * Secondo passo della consegna: il browser dice «caricato», e noi guardiamo.
 *
 * Dimensione e tipo si leggono da **Storage**, non dal browser: è quello che
 * c'è davvero. Poi `td_deliver` (0046) registra il file e porta l'ordine a
 * `delivered` con `last_actor = 'td'` — la riga di storia che ne esce è l'unica
 * prova che abbia consegnato il designer. Le mail le accoda il trigger.
 *
 * Se il database rifiuta (stato cambiato nel frattempo, percorso non di questo
 * ordine, tipo non ammesso), l'oggetto appena caricato **si cancella**: un file
 * in Storage senza una riga in `order_files` è un documento di viaggio che
 * nessuno sa di avere.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params
  if (!origineAmmessa(request)) {
    return NextResponse.json({ ok: false, esito: 'origine_non_riconosciuta' }, { status: 403 })
  }

  const corpo = (await request.json().catch(() => null)) as { path?: unknown; nome?: unknown } | null
  const path = typeof corpo?.path === 'string' ? corpo.path : ''
  const nome = typeof corpo?.nome === 'string' ? corpo.nome : ''
  // Un percorso che non sembra nemmeno uno dei nostri non si chiede a Storage.
  if (!path.startsWith('ordini/')) return NextResponse.json({ ok: false, esito: 'dati_non_validi' })

  const oggetto = await leggiOggetto(path)
  if (!oggetto) return NextResponse.json({ ok: false, esito: 'file_non_arrivato' })

  const esito = await registraConsegna(token, { path, nome, byte: oggetto.byte, tipo: oggetto.tipo })
  if (!esito.ok) {
    console.error('consegna non registrata:', esito.esito, esito.campo ?? '')
    // «irraggiungibile» vuol dire che non sappiamo se il database l'ha scritta:
    // cancellare il file potrebbe togliere l'itinerario a una consegna riuscita.
    if (esito.esito !== 'irraggiungibile') await cancellaOggetto(path)
  }
  return NextResponse.json({ ok: esito.ok, esito: esito.esito, campo: esito.campo })
}
