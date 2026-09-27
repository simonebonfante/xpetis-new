import 'server-only'
import { NextResponse } from 'next/server'
import { origineDi } from '@/lib/origine'
import { permessoFile } from '@/lib/ordine'
import { linkDiUnMinuto } from '@/lib/documenti'

/**
 * Il clic su un file, dalle due pagine a token.
 *
 * È il punto in cui il link firmato **nasce e muore**: `order_file_for_token`
 * (0046) dice se questo token può avere questo file e restituisce il percorso;
 * qui si firma un link di un minuto e ci si rimanda il browser con un 303. La
 * pagina porta solo l'indirizzo nostro, che vale finché vale il token — cioè
 * sempre — e il link di Storage non finisce in nessuna pagina né mail.
 *
 * `Referrer-Policy: strict-origin` (`next.config.ts`) copre anche questo
 * percorso: senza, il redirect regalerebbe a Storage l'indirizzo con il token.
 *
 * Se qualcosa non va si torna alla pagina con `?file=`: è lei che lo dice, con
 * il resto del contesto intorno.
 */
export async function scarica(request: Request, token: string, fileId: string, pagina: string) {
  const indietro = (codice: string) =>
    NextResponse.redirect(new URL(`${origineDi(request)}${pagina}?file=${codice}`), 303)

  // Un id che non è un uuid non arriva nemmeno al database.
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return indietro('sconosciuto')

  const permesso = await permessoFile(token, fileId)
  if (permesso.esito !== 'valido' || !permesso.path) {
    // Il token non finisce nei log: solo l'esito.
    console.error('scaricamento negato:', permesso.esito)
    return indietro(permesso.esito === 'irraggiungibile' ? 'irraggiungibile' : 'sconosciuto')
  }

  const link = await linkDiUnMinuto(permesso.path, permesso.nome ?? 'itinerario')
  if (!link) return indietro('irraggiungibile')

  const risposta = NextResponse.redirect(link, 303)
  risposta.headers.set('Cache-Control', 'private, no-store')
  return risposta
}
