import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { chiediServizio } from '@/lib/token'

/**
 * Il clic che crea l'ordine.
 *
 * ## Perché è un POST
 *
 * I link delle mail vengono aperti da macchine: antivirus aziendali che li
 * visitano per controllarli, Outlook che li riscrive con SafeLinks, client che
 * precaricano. Un indirizzo che crea un ordine appena lo si apre produrrebbe
 * richieste che nessuno ha mai chiesto, e il team aprirebbe gruppi WhatsApp per
 * nessuno. Nessuno di quegli strumenti fa un POST.
 *
 * ## Cosa NON decide questa route
 *
 * Niente. Il servizio viene dal `payload` del token e non da qui; se la call è
 * in uno stato che non ammette l'azione, se il designer ha spento il servizio,
 * se il bottone era già stato cliccato — lo dice `create_order_from_token`
 * (migration 0043), che è anche la stessa funzione che ha risposto alla pagina
 * un attimo fa. Due giudici diversi sarebbero due giudici che prima o poi
 * dicono cose diverse.
 *
 * ## L'attribuzione
 *
 * `orders.last_actor` vale `traveler`, e lo scrive la funzione Postgres, non
 * questa route. Il Travel Designer non ha login e il viaggiatore qui non ha
 * sessione: quella riga in `order_status_history`, insieme al token annotato in
 * `event_log`, è l'unica prova di chi ha agito.
 */

export async function POST(
  request: Request,
  contesto: { params: Promise<{ token: string }> },
) {
  const { token } = await contesto.params

  // Cintura e bretelle. Un POST da un altro sito richiederebbe comunque di
  // conoscere il token — e chi lo conosce può semplicemente aprire la pagina —
  // quindi non è una difesa contro un attacco vero: è una difesa contro un
  // bottone nostro incollato per sbaglio in un posto che non è nostro. Le regole
  // (header assente, `"null"`, host diverso) stanno in `origineAmmessa()`.
  if (!origineAmmessa(request)) {
    return NextResponse.json(
      { motivo: 'origine non riconosciuta', mittente: request.headers.get('origin') },
      { status: 403 },
    )
  }

  const esito = await chiediServizio(token)

  // ⚠️ Il token non finisce **mai** in un log o in un messaggio d'errore: chi ce
  // l'ha è dentro, e i log di Vercel non sono un posto per le credenziali. La
  // pagina, che il token ce l'ha già nell'indirizzo, racconta cosa è successo.
  if (!esito.ok) {
    console.error('richiesta servizio non riuscita:', esito.esito)
  }

  // Si torna **sempre** sulla pagina, qualunque sia l'esito: è lei che sa
  // raccontare tutti e sette i casi, e ripasserà dalla stessa funzione. 303
  // perché il browser debba seguire in GET: senza, un ricarica ripeterebbe il
  // POST (e sarebbe innocuo — l'indice `orders_one_per_booking_service` lo
  // rende innocuo — ma «innocuo» non è una buona ragione per farlo accadere).
  const origine = origineDi(request)
  return NextResponse.redirect(`${origine}/servizio/${encodeURIComponent(token)}`, 303)
}
