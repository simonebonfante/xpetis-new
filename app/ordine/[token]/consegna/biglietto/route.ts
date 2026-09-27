import { NextResponse } from 'next/server'
import { origineAmmessa } from '@/lib/origine'
import { bigliettoConsegna } from '@/lib/ordine'
import { apriCaricamento } from '@/lib/documenti'

/**
 * Primo passo della consegna: il permesso di caricare.
 *
 * **La route non decide niente.** `td_delivery_ticket` (0046) controlla token,
 * stato dell'ordine, tipo e dimensione dichiarati, e **sceglie il percorso**
 * del file: chi carica non dà il nome a niente. Qui si apre soltanto il
 * caricamento firmato su quel percorso, e si restituiscono percorso e biglietto
 * al browser, che manda i byte dritti a Storage.
 *
 * Perché i byte non passano da qui: una funzione Vercel accetta al massimo
 * 4,5 MB di corpo, e un itinerario col template XPETIS li supera. Vedi la testa
 * della 0046, parte B.
 *
 * Tipo e dimensione qui sono **dichiarati** dal browser, e servono solo a
 * rispondere prima di caricare: il controllo vero lo fa `/consegna`, su quello
 * che è arrivato in Storage.
 */
const PER_ESTENSIONE: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params
  if (!origineAmmessa(request)) {
    return NextResponse.json({ ok: false, esito: 'origine_non_riconosciuta' }, { status: 403 })
  }

  const corpo = (await request.json().catch(() => null)) as { nome?: unknown; byte?: unknown; tipo?: unknown } | null
  const nome = typeof corpo?.nome === 'string' ? corpo.nome : ''
  const byte = typeof corpo?.byte === 'number' ? corpo.byte : 0
  // Alcuni sistemi non danno un tipo ai .docx: si ricava dall'estensione, e la
  // verità la dirà Storage al passo dopo.
  const dichiarato = typeof corpo?.tipo === 'string' ? corpo.tipo : ''
  const tipo = dichiarato || PER_ESTENSIONE[nome.split('.').pop()?.toLowerCase() ?? ''] || ''

  const esito = await bigliettoConsegna(token, { nome, byte, tipo })
  if (!esito.ok || !esito.path) {
    // Il token non finisce nei log: solo l'esito.
    if (esito.esito !== 'dati_non_validi') console.error('biglietto di consegna negato:', esito.esito)
    return NextResponse.json({ ok: false, esito: esito.esito, campo: esito.campo })
  }

  const caricamento = await apriCaricamento(esito.path)
  if (!caricamento) return NextResponse.json({ ok: false, esito: 'irraggiungibile' })

  return NextResponse.json({ ok: true, path: esito.path, biglietto: caricamento.token, tipo })
}
