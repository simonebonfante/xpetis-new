/**
 * Cosa dire di una prenotazione, e in che ordine mostrarla.
 *
 * Vive qui e non nella pagina perché sono **due decisioni, non del disegno**:
 * quale situazione racconta una riga (che non coincide col suo `status`) e
 * quanto conta rispetto alle altre. La pagina le usa, non le prende.
 *
 * ## `status` non basta, e la differenza non è teorica
 *
 * `pending_payment` **non significa "pagabile"**. L'orologio unico dei 5 minuti
 * non esiste ancora (milestone 4), quindi nel database ci sono — e per un po'
 * continueranno a esserci — righe `pending_payment` con `payment_deadline_at`
 * già passata che nessuno ha portato a `cancelled_unpaid`. Derivare il bottone
 * *Paga* dal solo stato vorrebbe dire offrirlo su quelle righe, e
 * `app/prenotazione/[id]/cassa/route.ts` risponde `409 il tempo per pagare è
 * finito`: un bottone che mente.
 *
 * **L'autorità è `payment_deadline_at`**, e questo file la applica con la stessa
 * regola della route, compreso il caso limite: scadenza **assente** vale
 * pagabile, perché la route la tratta così (`scadenza !== null && scadenza <=
 * ora`). Se un giorno la route cambiasse idea su quel caso, deve cambiare anche
 * qui — sono lo stesso contratto visto dai due lati, come `lib/quiz-risposte.ts`
 * fra `/quiz` e `/ricerca`.
 *
 * Nessuna soglia e nessuna finestra temporale in questo file: l'unico confronto
 * è fra due istanti che arrivano entrambi dal database.
 */

/** I sette stati di `booking_status` (migration 0001). */
export type StatoBooking =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled_unpaid'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'disputed'

/**
 * Le nove situazioni che il viaggiatore può leggere. Sono più dei sette stati
 * perché due di quelli si sdoppiano sul tempo: `pending_payment` è "da pagare"
 * o "tempo scaduto" a seconda della scadenza, e `confirmed` è "in arrivo" o
 * "call passata, aspettiamo l'esito" a seconda dell'orario della call.
 */
export type Situazione =
  | 'da_pagare'
  | 'tempo_scaduto'
  | 'confermata'
  | 'in_attesa_esito'
  | 'in_arbitrato'
  | 'conclusa'
  | 'assente'
  | 'annullata'
  | 'slot_liberato'

/** Le colonne di `my_bookings` che servono a decidere. */
export type RigaPrenotazione = {
  id: string
  status: StatoBooking
  service_type: string
  starts_at: string
  price_cents: number
  video_url: string | null
  payment_deadline_at: string | null
  td_slug: string | null
  td_name: string | null
}

export type PrenotazioneInLista = RigaPrenotazione & { situazione: Situazione }

export function situazioneDi(riga: RigaPrenotazione, adesso: number): Situazione {
  switch (riga.status) {
    case 'pending_payment': {
      const scadenza = riga.payment_deadline_at
        ? new Date(riga.payment_deadline_at).getTime()
        : null
      return scadenza !== null && scadenza <= adesso ? 'tempo_scaduto' : 'da_pagare'
    }
    case 'confirmed':
      return new Date(riga.starts_at).getTime() > adesso ? 'confermata' : 'in_attesa_esito'
    case 'disputed':
      return 'in_arbitrato'
    case 'completed':
      return 'conclusa'
    case 'no_show':
      return 'assente'
    case 'cancelled':
      return 'annullata'
    case 'cancelled_unpaid':
      return 'slot_liberato'
  }
}

/**
 * Quanto conta una situazione. Più basso, più in alto nella pagina.
 *
 * Il criterio è **quanto costa non vederla**: una consulenza da pagare fra venti
 * minuti scade e lascia uno slot occupato sul calendario di un designer; una
 * call fatta a marzo non chiede niente a nessuno. In mezzo stanno le cose vive,
 * e l'arbitrato passa davanti all'attesa dell'esito perché è l'unico stato in
 * cui qualcuno sta già guardando quella riga.
 */
const RANGO: Record<Situazione, number> = {
  da_pagare: 0,
  confermata: 1,
  in_arbitrato: 2,
  in_attesa_esito: 3,
  tempo_scaduto: 4,
  slot_liberato: 4,
  annullata: 4,
  assente: 4,
  conclusa: 4,
}

/** Le situazioni che chiedono un gesto al viaggiatore, per il titolo di sezione. */
export const CHIEDE_UN_GESTO: Situazione[] = ['da_pagare']

/**
 * L'elenco nell'ordine in cui va letto.
 *
 * Dentro le cose vive si guarda avanti — prima la scadenza più vicina, poi la
 * call più prossima — e dentro le cose chiuse si guarda indietro, dalla più
 * recente. Una scadenza assente in fondo al primo gruppo: è il caso che non
 * dovrebbe esistere, e non deve scavalcare chi ha davvero poco tempo.
 *
 * `adesso` si legge **una volta sola**, qui, e non a ogni riga: così tutte le
 * righe di una resa si confrontano con lo stesso istante, e chi prova questa
 * funzione può fissare il momento invece di inseguire l'orologio.
 *
 * Il valore di default non è una comodità: la regola di purezza di React
 * (`react-hooks/purity`) vieta di chiamare `Date.now()` dentro la resa di un
 * componente, e ha ragione — un orologio letto in un componente dà risultati che
 * cambiano da soli fra due rese. Letto qui, in una funzione normale chiamata una
 * volta per richiesta, è quello che è: un ingresso del calcolo.
 */
export function ordinaPrenotazioni(
  righe: RigaPrenotazione[],
  adesso: number = Date.now(),
): PrenotazioneInLista[] {
  return righe
    .map((riga) => ({ ...riga, situazione: situazioneDi(riga, adesso) }))
    .sort((a, b) => {
      const rango = RANGO[a.situazione] - RANGO[b.situazione]
      if (rango !== 0) return rango

      if (a.situazione === 'da_pagare' && b.situazione === 'da_pagare') {
        return scadenza(a) - scadenza(b)
      }
      const inizioA = new Date(a.starts_at).getTime()
      const inizioB = new Date(b.starts_at).getTime()
      // Rango 0 e 1 sono il futuro: crescente. Tutto il resto è il passato:
      // decrescente.
      return RANGO[a.situazione] <= 1 ? inizioA - inizioB : inizioB - inizioA
    })
}

function scadenza(riga: RigaPrenotazione): number {
  return riga.payment_deadline_at
    ? new Date(riga.payment_deadline_at).getTime()
    : Number.POSITIVE_INFINITY
}
