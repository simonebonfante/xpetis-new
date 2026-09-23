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
 *
 * ⚠️ Serve a **costruire** indirizzi, non a **verificarne** uno: per il
 * controllo anti-CSRF c'è `origineAmmessa()`, qui sotto.
 */
export function origineDi(request: Request): string {
  const inoltrato = request.headers.get('x-forwarded-host')
  if (process.env.NODE_ENV !== 'development' && inoltrato) {
    const protocollo = request.headers.get('x-forwarded-proto') ?? 'https'
    return `${protocollo}://${inoltrato}`
  }
  return new URL(request.url).origin
}

/**
 * Il controllo anti-CSRF: l'`Origin` di questa richiesta combacia con il suo
 * stesso `Host`?
 *
 * ⚠️ **Non** si confronta con `origineDi()`. Quella funzione costruisce indirizzi
 * da dare a Stripe e per farlo si fida di `x-forwarded-host`: come valore
 * *atteso* di un controllo sarebbe uno header riscrivibile da chi sta davanti,
 * e chi potesse toccarlo controllerebbe entrambi i lati del confronto. Qui si
 * chiede una cosa più piccola e più solida: il browser dice di arrivare dallo
 * stesso host a cui sta parlando?
 *
 * Tre casi:
 * - **header assente** → si lascia passare: non tutti i client lo mandano, e un
 *   POST senza `Origin` da un altro sito non è il caso che ci preoccupa;
 * - **`"null"`** → si rifiuta: non è un'origine, è il segno di un contesto opaco
 *   (iframe sandbox, `file://`, redirect fra origini). Attenzione: è anche ciò
 *   che il browser manda da un form se la pagina ha `Referrer-Policy:
 *   no-referrer` — vedi `next.config.ts`;
 * - **qualunque altra cosa** → deve avere lo stesso host della richiesta.
 */
export function origineAmmessa(request: Request): boolean {
  const mittente = request.headers.get('origin')
  if (mittente === null) return true
  if (mittente === 'null') return false

  const host = request.headers.get('host')
  if (!host) return false
  try {
    return new URL(mittente).host === host
  } catch {
    return false
  }
}
