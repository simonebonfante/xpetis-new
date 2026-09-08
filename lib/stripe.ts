import 'server-only'

/**
 * Il minimo indispensabile per parlare con Stripe, e niente di più.
 *
 * Perché non l'SDK ufficiale: di Stripe usiamo tre chiamate — apri una cassa,
 * rileggila, chiudila — e la verifica delle firme, che è la parte in cui
 * l'SDK vale davvero il suo peso, non avviene qui: avviene in Postgres, nella
 * funzione `stripe_webhook()` della migration 0039. Restava una dipendenza
 * grossa per tre POST a un'API form-encoded.
 *
 * `server-only` in cima come in `lib/supabase/admin.ts`: se un giorno qualcuno
 * importa questo file da un componente client, **la build fallisce** invece di
 * spedire al browser la chiave che muove i soldi.
 */

const STRIPE_API = 'https://api.stripe.com/v1'

/**
 * La versione dell'API si fissa qui, e non si lascia decidere all'account.
 * Stripe cambia forma ai payload fra una versione e l'altra, e l'account segue
 * l'ultima: senza questo header un aggiornamento lato loro cambierebbe i
 * messaggi che arrivano al ponte senza che nessuno abbia toccato niente.
 *
 * È la stessa versione con cui sono state raccolte le fixture in
 * `supabase/tests/fixtures/stripe/`: se la si alza, si rialzano quelle.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia'

/**
 * I limiti di Stripe su `expires_at` di una Checkout Session: non meno di 30
 * minuti e non più di 24 ore dal momento della creazione. Non sono parametri
 * nostri e non stanno in `app_config`: sono il contratto dell'API, e il giorno
 * che Stripe li cambiasse cambierebbe questo file, non una riga su Studio.
 */
export const CASSA_MIN_SECONDI = 30 * 60
export const CASSA_MAX_SECONDI = 24 * 60 * 60

function chiave(): string {
  const k = process.env.STRIPE_SECRET_KEY
  if (!k) throw new Error('STRIPE_SECRET_KEY non impostata: la cassa non si può aprire.')
  return k
}

/**
 * Stripe non parla JSON in ingresso: vuole `application/x-www-form-urlencoded`
 * con gli oggetti annidati appiattiti in `a[b][c]`. Gli array diventano indici
 * (`line_items[0][quantity]`), i `null` e gli `undefined` si omettono, i booleani
 * diventano "true"/"false".
 */
function appiattisci(
  valore: unknown,
  prefisso: string,
  dentro: URLSearchParams,
): void {
  if (valore === null || valore === undefined) return

  if (Array.isArray(valore)) {
    valore.forEach((v, i) => appiattisci(v, `${prefisso}[${i}]`, dentro))
    return
  }
  if (typeof valore === 'object') {
    for (const [k, v] of Object.entries(valore as Record<string, unknown>)) {
      appiattisci(v, `${prefisso}[${k}]`, dentro)
    }
    return
  }
  dentro.append(prefisso, String(valore))
}

export function formStripe(corpo: Record<string, unknown>): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(corpo)) appiattisci(v, k, p)
  return p
}

export class ErroreStripe extends Error {
  constructor(
    message: string,
    readonly stato: number,
    readonly codice?: string,
  ) {
    super(message)
    this.name = 'ErroreStripe'
  }
}

async function chiama(
  percorso: string,
  opzioni: { corpo?: Record<string, unknown>; idempotenza?: string } = {},
): Promise<Record<string, unknown>> {
  const intestazioni: Record<string, string> = {
    Authorization: `Bearer ${chiave()}`,
    'Stripe-Version': STRIPE_API_VERSION,
  }
  if (opzioni.corpo) intestazioni['Content-Type'] = 'application/x-www-form-urlencoded'
  // La chiave di idempotenza è la difesa di Stripe contro la doppia cassa, ed è
  // la seconda: la prima è l'indice `payments_one_pending_per_kind`. Servono
  // entrambe perché coprono due momenti diversi — l'indice ferma la seconda
  // riga, questa ferma la seconda sessione quando la prima richiesta è andata a
  // buon fine su Stripe e in errore da noi.
  if (opzioni.idempotenza) intestazioni['Idempotency-Key'] = opzioni.idempotenza

  const risposta = await fetch(`${STRIPE_API}${percorso}`, {
    method: 'POST',
    headers: intestazioni,
    body: opzioni.corpo ? formStripe(opzioni.corpo) : undefined,
    cache: 'no-store',
  })

  const dati = (await risposta.json().catch(() => ({}))) as Record<string, unknown>

  if (!risposta.ok) {
    const errore = (dati.error ?? {}) as { message?: string; code?: string }
    throw new ErroreStripe(
      errore.message ?? `Stripe ha risposto ${risposta.status}`,
      risposta.status,
      errore.code,
    )
  }
  return dati
}

export type CassaStripe = {
  id: string
  url: string | null
  status: 'open' | 'complete' | 'expired'
  payment_status: string
  amount_total: number | null
  currency: string | null
  expires_at: number
}

/**
 * Apre una Checkout Session ospitata.
 *
 * Tre scelte che non sono ovvie e che è meglio non ritrovarsi a rifare:
 *
 *  · **`adaptive_pricing` spento.** Acceso — ed è acceso di default — Stripe può
 *    incassare nella valuta del visitatore. Il ponte confronta l'incasso con
 *    `bookings.price_cents` in EUR e alzerebbe un alert critico su un pagamento
 *    perfettamente buono fatto da chi naviga da fuori area euro.
 *  · **Niente prodotti e niente prezzi a catalogo**: `price_data` inline, con
 *    l'importo che arriva dal database. Il prezzo esiste in un posto solo.
 *  · **`client_reference_id` *e* `metadata`** portano lo stesso id di
 *    prenotazione. È il filo con cui il webhook la ritrova, e due fili identici
 *    costano niente: `client_reference_id` si vede a colpo d'occhio nella
 *    dashboard, `metadata` sopravvive meglio ai cambi di forma dei payload.
 */
export async function apriCassa(parametri: {
  importoCents: number
  titolo: string
  descrizione?: string
  prenotazioneId: string
  scadenzaUnix: number
  urlSuccesso: string
  urlAnnullamento: string
  emailCliente?: string
  idempotenza: string
}): Promise<CassaStripe> {
  const dati = await chiama('/checkout/sessions', {
    idempotenza: parametri.idempotenza,
    corpo: {
      mode: 'payment',
      adaptive_pricing: { enabled: false },
      client_reference_id: parametri.prenotazioneId,
      metadata: { booking_id: parametri.prenotazioneId, xpetis: 'consultation' },
      // Anche il PaymentIntent porta l'id: se un giorno si guarda un incasso
      // partendo dai pagamenti invece che dalle sessioni, il filo c'è comunque.
      payment_intent_data: { metadata: { booking_id: parametri.prenotazioneId } },
      customer_email: parametri.emailCliente,
      expires_at: parametri.scadenzaUnix,
      success_url: parametri.urlSuccesso,
      cancel_url: parametri.urlAnnullamento,
      locale: 'it',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: parametri.importoCents,
            product_data: {
              name: parametri.titolo,
              description: parametri.descrizione,
            },
          },
        },
      ],
    },
  })
  return dati as unknown as CassaStripe
}

/** Rilegge una sessione: serve a sapere se è ancora aperta prima di riusarla. */
export async function leggiCassa(id: string): Promise<CassaStripe | null> {
  try {
    const dati = await chiama(`/checkout/sessions/${encodeURIComponent(id)}`)
    return dati as unknown as CassaStripe
  } catch (e) {
    // Una sessione che Stripe non conosce più non è un guasto: è una cassa da
    // rifare. Tutto il resto risale.
    if (e instanceof ErroreStripe && e.stato === 404) return null
    throw e
  }
}

/**
 * Chiude una sessione prima della sua scadenza. La chiamiamo quando una cassa
 * appena aperta non è riuscita ad avere la sua riga in `payments`: lasciarla
 * viva vorrebbe dire un indirizzo di pagamento buono per una prenotazione che
 * non lo aspetta.
 */
export async function scadiCassa(id: string): Promise<void> {
  try {
    await chiama(`/checkout/sessions/${encodeURIComponent(id)}/expire`, {})
  } catch (e) {
    // Il chiamante sta già gestendo un problema: se anche questa fallisce, la
    // sessione scadrà da sola entro `expires_at`. Non vale un errore in più.
    if (!(e instanceof ErroreStripe)) throw e
  }
}
