/**
 * Il caricatore dell'embed Cal.com, e niente più.
 *
 * **Non ha `server-only`**, al contrario degli altri file di `lib/`: questo gira
 * nel browser, ed è l'unico pezzo di XPETIS che ci gira per forza — l'embed è un
 * iframe di terze parti e l'iframe vive di là.
 *
 * Lo stub qui sotto è quello ufficiale di Cal.com, riscritto leggibile e
 * tipizzato. Fa una cosa sola: mette in piedi `window.Cal` come **coda** prima
 * che `embed.js` sia arrivato, così le istruzioni date subito non si perdono. È
 * il motivo per cui non si può semplicemente aspettare l'`onload` dello script e
 * poi chiamare: fra il montaggio del componente e il caricamento del bundle c'è
 * una finestra, e le chiamate che ci cadono dentro devono essere bufferizzate.
 */

const SORGENTE = 'https://app.cal.com/embed/embed.js'
const ORIGINE = 'https://app.cal.com'

/**
 * Le azioni che l'embed emette, prese dai **tipi pubblicati** del pacchetto
 * `@calcom/embed-core` (`dist/src/sdk-action-manager.d.ts`, versione 1.5.3):
 * `EventDataMap` le elenca una per una.
 *
 * Vale la pena sapere da dove viene questo elenco, perché è la cosa fragile di
 * tutto il pezzo: **la pagina di documentazione degli eventi non le nomina.**
 * Documenta solo gli eventi interni (`__iframeReady`, `__dimensionChanged`…) e
 * dice esplicitamente di non fidarsene. Il contratto vero è nei tipi del
 * pacchetto, dove `bookingSuccessful` è marcato `@deprecated` in favore di
 * `bookingSuccessfulV2` con la nota — testuale — che V2 è quello che potranno
 * "documentare bene". Cioè: V2 è il presente, il vecchio è ancora lì, e nessuno
 * dei due è su una pagina di docs.
 *
 * Per questo ci si iscrive a **entrambi** e per questo esiste comunque una via
 * manuale: se un giorno cambiano nome, l'embed continua a funzionare e il
 * viaggiatore non resta chiuso dentro un iframe.
 */
export const AZIONE_PRENOTATO = 'bookingSuccessfulV2'
export const AZIONE_PRENOTATO_LEGACY = 'bookingSuccessful'

type FunzioneCal = ((...args: unknown[]) => void) & {
  ns?: Record<string, (...args: unknown[]) => void>
  loaded?: boolean
  q?: unknown[]
}

declare global {
  interface Window {
    Cal?: FunzioneCal
  }
}

/** Installa lo stub e lo script, una volta sola per pagina. */
function assicuraCal(): FunzioneCal {
  const w = window
  if (w.Cal) return w.Cal

  const accoda = (obiettivo: { q?: unknown[] }, argomenti: unknown) => {
    obiettivo.q = obiettivo.q || []
    obiettivo.q.push(argomenti)
  }

  const cal = function (this: unknown, ...argomenti: unknown[]) {
    const radice = w.Cal!
    if (!radice.loaded) {
      radice.ns = {}
      radice.q = radice.q || []
      document.head.appendChild(document.createElement('script')).src = SORGENTE
      radice.loaded = true
    }
    // `init` con un nome crea uno spazio di nomi: serve perché due embed sulla
    // stessa pagina non si calpestino. Noi ne apriamo uno per designer+servizio.
    if (argomenti[0] === 'init') {
      const nome = argomenti[1]
      if (typeof nome === 'string') {
        const api = function (...a: unknown[]) {
          accoda(api as unknown as { q?: unknown[] }, a)
        } as FunzioneCal
        radice.ns![nome] = radice.ns![nome] || api
        accoda(radice.ns![nome] as unknown as { q?: unknown[] }, argomenti)
        accoda(radice as { q?: unknown[] }, ['initNamespace', nome])
      } else {
        accoda(radice as { q?: unknown[] }, argomenti)
      }
      return
    }
    accoda(radice as { q?: unknown[] }, argomenti)
  } as FunzioneCal

  w.Cal = cal
  return cal
}

/**
 * Lo spazio di nomi per un calendario. Deve essere stabile per la stessa coppia
 * designer/servizio (rimontare non deve creare un embed nuovo) e diverso fra
 * coppie diverse (cambiare servizio deve creare un embed nuovo).
 */
export function spazioDiNomi(calLink: string): string {
  return `xpetis-${calLink.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

export type ConfigurazioneEmbed = Record<string, string>

/**
 * Monta l'embed inline dentro `selettore` e si iscrive agli eventi di
 * prenotazione riuscita. Torna la funzione di smontaggio.
 *
 * `configurazione` finisce nella query dell'iframe: è così che
 * `xpetis_user_id` arriva a Cal.com e torna nel webhook. Che le chiavi
 * arbitrarie siano ammesse non è un'assunzione — i tipi pubblicati dicono
 * `PrefillAndIframeAttrsConfig = Record<string, string | string[] | …>`.
 */
export function montaEmbed(parametri: {
  calLink: string
  selettore: string
  configurazione: ConfigurazioneEmbed
  quandoPrenotato: () => void
}): () => void {
  const cal = assicuraCal()
  const ns = spazioDiNomi(parametri.calLink)

  cal('init', ns, { origin: ORIGINE })
  const api = () => cal.ns?.[ns]

  api()?.('inline', {
    elementOrSelector: parametri.selettore,
    calLink: parametri.calLink,
    config: parametri.configurazione,
  })
  api()?.('ui', { hideEventTypeDetails: false, layout: 'month_view', theme: 'light' })

  // **Del payload non si usa niente, e non è una dimenticanza.**
  // `bookingSuccessfulV2` porta anche `uid`, cioè il codice della prenotazione:
  // dopo la verifica S-05 quel codice è una credenziale di cancellazione, e non
  // lo accettiamo mai dal browser. Qui serve solo il *fatto* che l'evento sia
  // scattato; chi sia il viaggiatore lo sa già il server dalla sessione, e la
  // prenotazione la ritrova da sé (`app/attesa/cerca/route.ts`).
  const ascoltatore = () => parametri.quandoPrenotato()
  api()?.('on', { action: AZIONE_PRENOTATO, callback: ascoltatore })
  api()?.('on', { action: AZIONE_PRENOTATO_LEGACY, callback: ascoltatore })

  return () => {
    api()?.('off', { action: AZIONE_PRENOTATO, callback: ascoltatore })
    api()?.('off', { action: AZIONE_PRENOTATO_LEGACY, callback: ascoltatore })
  }
}
