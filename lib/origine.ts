import 'server-only'

/**
 * L'indirizzo pubblico del sito, ricavato dalla richiesta.
 *
 * Serve per gli URL assoluti che diamo a Stripe (`success_url`, `cancel_url`):
 * non possono essere relativi, e non possono nemmeno essere l'origine che Next
 * vede — dietro il proxy di Vercel quella è l'host interno, e il viaggiatore
 * finirebbe su un indirizzo che dall'esterno non esiste. È lo stesso motivo per
 * cui `app/auth/callback/route.ts` guarda `x-forwarded-host`.
 *
 * Ricavata dalla richiesta e non da una variabile d'ambiente di proposito: così
 * funziona uguale in locale, sulle anteprime di Vercel (che hanno un host
 * diverso a ogni deploy) e in produzione, senza che nessuno debba ricordarsi di
 * impostarla.
 */
export function origineDi(request: Request): string {
  const inoltrato = request.headers.get('x-forwarded-host')
  if (process.env.NODE_ENV !== 'development' && inoltrato) {
    const protocollo = request.headers.get('x-forwarded-proto') ?? 'https'
    return `${protocollo}://${inoltrato}`
  }
  return new URL(request.url).origin
}
