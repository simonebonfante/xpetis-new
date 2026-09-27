import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  apriCassa,
  leggiCassa,
  scadiCassa,
  CASSA_MIN_SECONDI,
  CASSA_MAX_SECONDI,
  ErroreStripe,
  type ContoStripe,
  type RiferimentoCassa,
  type TipoPagamento,
} from '@/lib/stripe'

/**
 * Aprire una cassa Stripe, o riusare quella già aperta: il pezzo comune alla
 * cassa della consulenza (`app/prenotazione/[id]/cassa`) e a quella della
 * pagina del viaggiatore (`app/proposta/[token]/cassa`), che apre la proposta
 * su misura e, dalla 0047, l'acconto e il saldo dell'All Inclusive.
 *
 * ## Perché è estratto, e non copiato
 *
 * La cassa della consulenza ha imparato tre cose, a sue spese, e qui dentro ci
 * sono tutte e tre **una volta sola**:
 *
 *  1. **Prima la riga in `payments`, poi la sessione su Stripe.** È l'indice
 *     `payments_one_pending_per_kind` (0038) a fermare il doppio clic prima che
 *     tocchi Stripe — e l'indice usa `coalesce(booking_id, order_id)`, quindi
 *     copre gli ordini senza toccare niente.
 *  2. **Il clamp su `expires_at`**, perché Stripe rifiuta una scadenza sotto i
 *     30 minuti o sopra le 24 ore (`scadenzaPerStripe`).
 *  3. **L'adaptive pricing spento**, che sta dentro `apriCassa` in
 *     `lib/stripe.ts` ed è quindi comune per costruzione.
 *
 * Due copie di queste difese sarebbero il modo in cui un giorno se ne corregge
 * una sola. Le route fanno **solo** quello che è loro: chi può aprire la cassa
 * (sessione del viaggiatore o token), su cosa, e a che prezzo — letto dal
 * database, mai dalla richiesta.
 *
 * ## Una difesa in più, che la consulenza non aveva bisogno di avere
 *
 * Il prezzo di una consulenza non cambia mai dopo la prenotazione. Quello di
 * una proposta sì: il team può riaprirla e il designer rifarla a un altro
 * prezzo, mentre la cassa di quella vecchia è ancora aperta. Riusarla vorrebbe
 * dire far pagare al viaggiatore l'importo vecchio mentre la pagina mostra il
 * nuovo. Quindi una cassa aperta si riusa **solo se il suo importo è quello di
 * adesso**; altrimenti si chiude su Stripe e se ne apre una nuova. Per la
 * consulenza il controllo è sempre vero e non costa niente.
 */

export type EsitoCassa =
  /** C'è un indirizzo a cui mandare chi paga. */
  | { esito: 'aperta'; url: string; riusata: boolean }
  /** Stripe dice che la cassa è già stata pagata: il webhook sta arrivando. */
  | { esito: 'in_conferma' }
  /** Non sappiamo in che stato è la cassa precedente: meglio fermarsi che aprirne un'altra. */
  | { esito: 'attendi'; motivo: string }
  | { esito: 'errore'; stato: number; motivo: string }

export async function apriOriusaCassa(p: {
  riferimento: RiferimentoCassa
  /**
   * Il `payment_kind`: `consultation` per le prenotazioni, `full` per il su
   * misura, `deposit` e `balance` per le due rate dell'All Inclusive. Due rate
   * di tipo diverso sullo stesso ordine possono essere aperte insieme:
   * `payments_one_pending_per_kind` è su (entità, tipo), e l'harness lo prova.
   */
  tipo: TipoPagamento
  /** Letto dal database dalla route. Il browser non manda mai un importo. */
  importoCents: number
  /**
   * La nostra scadenza, se ce n'è una: per la consulenza è `payment_deadline_at`
   * ed è l'autorità (lo slot lo libera l'orologio). Per una proposta non c'è, e
   * la cassa dura il minimo che Stripe ammette.
   */
  scadenzaNostra: string | null
  titolo: string
  descrizione?: string
  urlSuccesso: string
  urlAnnullamento: string
  emailCliente?: string
  /**
   * L'agenzia **assegnata all'ordine**, per l'All Inclusive. Se incassa
   * l'agenzia deve essere lei: abbiamo la chiave di un conto solo, e una cassa
   * aperta su quel conto per l'ordine di un'altra agenzia incasserebbe al posto
   * sbagliato. Con un'agenzia sola coincidono sempre (0047).
   */
  agenziaOrdine?: string | null
}): Promise<EsitoCassa> {
  const admin = createAdminClient()
  const [colonna, id] =
    'booking_id' in p.riferimento
      ? (['booking_id', p.riferimento.booking_id] as const)
      : (['order_id', p.riferimento.order_id] as const)

  // ------------------------------------------------------- una cassa già aperta
  const { data: inCorso } = await admin
    .from('payments')
    .select('id, stripe_checkout_session_id, created_at, stripe_account, agency_id')
    .eq(colonna, id)
    .eq('kind', p.tipo)
    .eq('status', 'pending')
    .maybeSingle()

  if (inCorso) {
    // La sessione si rilegge sul conto su cui è nata, che dice la sua riga.
    const contoRiga = inCorso as ContoStripe
    const cassa = await statoCassa(inCorso.stripe_checkout_session_id, inCorso.created_at, p.importoCents, contoRiga)

    if (cassa.esito === 'aperta') return { esito: 'aperta', url: cassa.url, riusata: true }
    if (cassa.esito === 'pagata') return { esito: 'in_conferma' }
    if (cassa.esito === 'ignoto' || cassa.esito === 'in_apertura') {
      // **Non sapere è un motivo per fermarsi, non per ricominciare.** Vedi il
      // commento su `statoCassa`.
      return {
        esito: 'attendi',
        motivo: 'la cassa precedente è in uno stato che non sappiamo leggere: riprova fra poco',
      }
    }
    if (cassa.esito === 'superata') {
      // Viva, ma con l'importo di una proposta che non esiste più. Si chiude su
      // Stripe prima di liberare la riga. Se la chiusura fallisce, la sessione
      // vecchia scade da sola in mezz'ora, e se qualcuno ci paga dentro il ponte
      // trova un importo che non combacia e non conferma niente.
      await scadiCassa(cassa.sessione, contoRiga)
    }
    // `morta` o `superata`: solo adesso la riga si libera e si riparte.
    await admin.from('payments').update({ status: 'expired' }).eq('id', inCorso.id)
  }

  // ---------------------------------------------------------- su quale conto
  // Non nel codice: `app_config`, una riga per tipo di pagamento, letta dalla
  // stessa funzione che usa il ponte Stripe quando deve ricostruire una riga
  // (0044). Oggi `xpetis`, in produzione `agency` su tutto: dal 27 settembre il
  // conto Stripe è uno, ed è dell'agenzia (deviazione 9).
  const { data: conti, error: erroreConto } = await admin.rpc('payment_account', {
    p_kind: p.tipo,
  })
  const conto = (conti as ContoStripe[] | null)?.[0]
  if (erroreConto || !conto) {
    return { esito: 'errore', stato: 500, motivo: 'non è configurato su quale conto incassare' }
  }
  if (conto.stripe_account === 'agency' && p.agenziaOrdine && conto.agency_id !== p.agenziaOrdine) {
    return {
      esito: 'errore',
      stato: 409,
      motivo: 'l\'agenzia che incassa non è quella assegnata all\'ordine: la cassa non si apre',
    }
  }

  // ------------------------------------------------------------- prima la riga
  const idPagamento = randomUUID()
  const { error: erroreInserimento } = await admin.from('payments').insert({
    id: idPagamento,
    ...p.riferimento,
    kind: p.tipo,
    status: 'pending',
    amount_cents: p.importoCents,
    currency: 'EUR',
    stripe_account: conto.stripe_account,
    agency_id: conto.agency_id,
    client_reference_id: id,
    // La nostra scadenza, non quella di Stripe: se i due valori divergono vince
    // questa. Quella di Stripe è una cortesia verso chi ha la pagina aperta.
    expires_at: p.scadenzaNostra,
  })

  if (erroreInserimento) {
    // 23505 = violazione di unicità, cioè `payments_one_pending_per_kind`: due
    // clic partiti insieme, e l'altra richiesta ha vinto. Non è un errore da
    // mostrare: si riusa la sua cassa, se è già pronta.
    if (erroreInserimento.code === '23505') {
      const { data: altrui } = await admin
        .from('payments')
        .select('stripe_checkout_session_id, created_at, stripe_account, agency_id')
        .eq(colonna, id)
        .eq('kind', p.tipo)
        .eq('status', 'pending')
        .maybeSingle()
      const cassa = await statoCassa(
        altrui?.stripe_checkout_session_id ?? null,
        altrui?.created_at ?? null,
        p.importoCents,
        (altrui as ContoStripe | null) ?? conto,
      )
      if (cassa.esito === 'aperta') return { esito: 'aperta', url: cassa.url, riusata: true }
      // Qui non si tocca mai niente: la riga è di un'altra richiesta, che
      // probabilmente sta ancora parlando con Stripe.
      return { esito: 'attendi', motivo: 'cassa in apertura, riprova' }
    }
    return { esito: 'errore', stato: 500, motivo: erroreInserimento.message }
  }

  // ------------------------------------------------------------ poi la cassa
  try {
    const cassa = await apriCassa({
      importoCents: p.importoCents,
      titolo: p.titolo,
      descrizione: p.descrizione,
      riferimento: p.riferimento,
      tipo: p.tipo,
      conto,
      scadenzaUnix: scadenzaPerStripe(p.scadenzaNostra ? new Date(p.scadenzaNostra).getTime() : null),
      urlSuccesso: p.urlSuccesso,
      urlAnnullamento: p.urlAnnullamento,
      emailCliente: p.emailCliente,
      // La riga di pagamento esiste già e il suo id è unico: è la chiave di
      // idempotenza più onesta che ci sia, perché identifica *questo* tentativo
      // e non l'entità (che di tentativi ne può avere più d'uno).
      idempotenza: `cassa-${idPagamento}`,
    })

    await admin
      .from('payments')
      .update({ stripe_checkout_session_id: cassa.id })
      .eq('id', idPagamento)

    if (!cassa.url) {
      return { esito: 'errore', stato: 502, motivo: 'Stripe non ha restituito un indirizzo di pagamento' }
    }
    return { esito: 'aperta', url: cassa.url, riusata: false }
  } catch (e) {
    // La cassa non si è aperta: la riga appena creata si cancella, altrimenti
    // resterebbe a occupare l'unico posto `pending` e chi paga non potrebbe
    // riprovare fino alla scadenza.
    await admin.from('payments').delete().eq('id', idPagamento)
    const messaggio = e instanceof ErroreStripe ? e.message : 'la cassa non si è aperta'
    return { esito: 'errore', stato: 502, motivo: messaggio }
  }
}

/**
 * Stripe accetta `expires_at` **fra 30 minuti e 24 ore** dalla creazione, e
 * `booking_payment_window_min` vale esattamente 30: qualunque ritardo — il
 * webhook Cal.com arrivato con calma, il viaggiatore che ci pensa un minuto —
 * porta la nostra scadenza sotto il minimo e fa fallire la chiamata.
 *
 * Quindi si taglia, invece di esplodere. Il minuto in più sopra il minimo copre
 * il tempo di volo della richiesta e lo scarto fra il nostro orologio e quello
 * di Stripe: chiedere esattamente 30 minuti significa chiederne 29 e 58 quando
 * la richiesta arriva.
 *
 * Che i due valori divergano non è un problema: **l'autorità è la nostra
 * scadenza**, e la cassa può restare tecnicamente aperta su Stripe qualche
 * minuto in più senza che nessuno possa usarla — l'orologio dei 5 minuti ha già
 * portato la prenotazione a `cancelled_unpaid`, e il ponte non conferma una
 * prenotazione che non è più in attesa.
 *
 * Senza una scadenza nostra (la proposta su misura, che resta pagabile finché
 * è quella corrente) si chiede **il minimo**: una cassa che vive mezz'ora è una
 * cassa che, se la proposta viene riaperta, smette presto di poter incassare
 * l'importo vecchio.
 */
function scadenzaPerStripe(nostraMs: number | null): number {
  const ora = Math.floor(Date.now() / 1000)
  const minimo = ora + CASSA_MIN_SECONDI + 60
  const massimo = ora + CASSA_MAX_SECONDI
  const nostra = nostraMs === null ? minimo : Math.floor(nostraMs / 1000)
  return Math.min(Math.max(nostra, minimo), massimo)
}

/**
 * Lo stato di una cassa già registrata, e cosa se ne può concludere.
 *
 * ## Non sapere è un motivo per fermarsi, non per ricominciare
 *
 * La prima versione di questa funzione trattava allo stesso modo due cose molto
 * diverse: «Stripe dice che quella sessione non esiste» e «Stripe non ha
 * risposto». In entrambi i casi tornava "niente da riusare", la riga `pending`
 * veniva marcata `expired` e si apriva una seconda cassa.
 *
 * Il difetto è che un errore di rete non dice niente sulla sessione: quella
 * sessione può essere perfettamente viva, con il viaggiatore che ci sta pagando
 * dentro in quel momento. Marcare `expired` la sua riga libera l'unico posto che
 * `payments_one_pending_per_kind` teneva occupato, e il risultato sono **due
 * indirizzi di pagamento vivi per la stessa cosa** — esattamente ciò che la
 * migration 0038 esiste per rendere impossibile. Un difetto che compare solo
 * quando Stripe è lento, cioè quando c'è più traffico.
 *
 * Quindi sei esiti, e solo due autorizzano a buttare la riga:
 *
 * | esito | cosa sappiamo | cosa fa chi chiama |
 * |---|---|---|
 * | `aperta` | Stripe l'ha data per `open`, con l'importo di adesso | la riusa |
 * | `superata` | aperta, ma con un **importo diverso** (proposta rifatta) | la chiude e riparte |
 * | `pagata` | Stripe l'ha data per `complete` | aspetta il webhook |
 * | `morta` | Stripe l'ha dichiarata `expired`, o 404 | libera la riga e riparte |
 * | `ignoto` | **Stripe non ha risposto** | si ferma, e non tocca niente |
 * | `in_apertura` | riga senza sessione, appena creata | si ferma, e non tocca niente |
 *
 * L'ultimo caso è il gemello di `ignoto` sul lato nostro: una riga che non porta
 * ancora una sessione può essere una richiesta interrotta a metà — e allora è da
 * buttare — oppure una richiesta parallela che **in questo istante** sta
 * parlando con Stripe. I due casi si distinguono solo dall'età della riga.
 * `PAUSA_APERTURA_MS` non è un parametro di prodotto e per questo non sta in
 * `app_config`: è la scala dei tempi di una chiamata HTTP, come i cinque minuti
 * di tolleranza della firma nella 0039.
 */
type StatoCassa =
  | { esito: 'aperta'; url: string }
  | { esito: 'superata'; sessione: string }
  | { esito: 'pagata' }
  | { esito: 'morta' }
  | { esito: 'ignoto' }
  | { esito: 'in_apertura' }

/** Quanto si concede a una richiesta parallela per finire di parlare con Stripe. */
const PAUSA_APERTURA_MS = 30_000

async function statoCassa(
  sessione: string | null,
  creataIl: string | null,
  importoCents: number,
  conto: ContoStripe,
): Promise<StatoCassa> {
  if (!sessione) {
    const eta = creataIl ? Date.now() - new Date(creataIl).getTime() : Number.POSITIVE_INFINITY
    return eta < PAUSA_APERTURA_MS ? { esito: 'in_apertura' } : { esito: 'morta' }
  }

  try {
    const cassa = await leggiCassa(sessione, conto)
    // `leggiCassa` torna null solo sul 404: è Stripe che dichiara di non
    // conoscere quella sessione, non noi che non siamo riusciti a chiedere.
    if (!cassa) return { esito: 'morta' }
    if (cassa.status === 'open' && cassa.url) {
      return cassa.amount_total === importoCents
        ? { esito: 'aperta', url: cassa.url }
        : { esito: 'superata', sessione }
    }
    if (cassa.status === 'complete') return { esito: 'pagata' }
    return { esito: 'morta' }
  } catch {
    // Rete caduta, 500 di Stripe, timeout. La sessione è probabilmente ancora
    // viva: chi non sa, non tocca.
    return { esito: 'ignoto' }
  }
}
