import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { origineDi } from '@/lib/origine'
import { ETICHETTA_SERVIZIO, type TipoServizio } from '@/lib/vetrina'
import {
  apriCassa,
  leggiCassa,
  CASSA_MIN_SECONDI,
  CASSA_MAX_SECONDI,
  ErroreStripe,
} from '@/lib/stripe'

/**
 * La cassa della consulenza: apre una Stripe Checkout Session per una
 * prenotazione e restituisce l'indirizzo a cui mandare il viaggiatore.
 *
 * È la **deviazione 1** del `PIANO.md`. Il Flusso prevedeva Payment Link fissi
 * creati a mano dal pannello Stripe; un Payment Link però è un indirizzo
 * pubblico e riusabile, e niente lo lega al prezzo di *quella* prenotazione —
 * chi ha in mano il link da 60 € può pagarci una consulenza da 90 €. Qui
 * l'importo lo legge il server da `bookings.price_cents`, che è l'unico posto in
 * cui il prezzo esiste.
 *
 * **Il browser non manda mai un importo, e non riceve mai `cal_booking_uid`.**
 * Manda l'id della prenotazione, che è nell'URL; tutto il resto lo tira su il
 * server. Dopo la verifica S-05 il codice Cal.com è di fatto una credenziale —
 * basta quello per cancellare una prenotazione, senza nessuna chiave — e la 0019
 * lo tiene fuori dalle viste: non rientra da qui.
 *
 * ## L'ordine delle operazioni, che non è quello ovvio
 *
 * Prima la riga in `payments`, poi la sessione su Stripe. L'ordine inverso è più
 * naturale (crei la cassa, la registri) e ha un difetto: fra il `select` che non
 * trova una cassa aperta e l'`insert` che la registra c'è una finestra, e un
 * doppio clic ci passa dentro due volte — due indirizzi di pagamento vivi per la
 * stessa consulenza. Inserendo prima, è l'indice `payments_one_pending_per_kind`
 * (migration 0038) a fermare la seconda richiesta **prima** che tocchi Stripe:
 * nessuna sessione orfana da ripulire. Se poi Stripe fallisce, la riga si
 * cancella e il viaggiatore può riprovare subito.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Conto = { stripe_account: 'xpetis' | 'agency'; agency_id: string | null }

export async function POST(
  request: Request,
  contesto: { params: Promise<{ id: string }> },
) {
  const { id } = await contesto.params
  if (!UUID.test(id)) {
    return NextResponse.json({ motivo: 'prenotazione inesistente' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ motivo: 'nessuna sessione' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: prenotazione, error: erroreLettura } = await admin
    .from('bookings')
    .select(
      'id, traveler_id, status, price_cents, payment_deadline_at, service_type, starts_at, travel_designers(display_name)',
    )
    .eq('id', id)
    .maybeSingle()

  if (erroreLettura) {
    return NextResponse.json({ motivo: 'prenotazione illeggibile' }, { status: 500 })
  }

  // Prenotazione che non esiste e prenotazione di qualcun altro danno la stessa
  // risposta: confermare l'esistenza di una riga altrui è già un'informazione.
  if (!prenotazione || prenotazione.traveler_id !== user.id) {
    return NextResponse.json({ motivo: 'prenotazione inesistente' }, { status: 404 })
  }

  if (prenotazione.status === 'confirmed') {
    return NextResponse.json({ motivo: 'già pagata', stato: prenotazione.status }, { status: 409 })
  }
  if (prenotazione.status !== 'pending_payment') {
    return NextResponse.json(
      { motivo: 'la prenotazione non è più in attesa di pagamento', stato: prenotazione.status },
      { status: 409 },
    )
  }

  // **L'orologio è il nostro.** `payment_deadline_at` è l'autorità: la scadenza
  // che diamo a Stripe è una cortesia, e più avanti la si taglia sui limiti
  // dell'API. Qui invece non si tratta: scaduta è scaduta, e lo slot lo libera
  // l'orologio dei 5 minuti.
  const scadenza = prenotazione.payment_deadline_at
    ? new Date(prenotazione.payment_deadline_at).getTime()
    : null
  if (scadenza !== null && scadenza <= Date.now()) {
    return NextResponse.json(
      { motivo: 'il tempo per pagare è finito', stato: 'scaduta' },
      { status: 409 },
    )
  }

  // ------------------------------------------------------- una cassa già aperta
  const { data: inCorso } = await admin
    .from('payments')
    .select('id, stripe_checkout_session_id, created_at')
    .eq('booking_id', id)
    .eq('kind', 'consultation')
    .eq('status', 'pending')
    .maybeSingle()

  if (inCorso) {
    const cassa = await statoCassa(inCorso.stripe_checkout_session_id, inCorso.created_at)

    if (cassa.esito === 'aperta') {
      return NextResponse.json({ url: cassa.url, riusata: true })
    }
    if (cassa.esito === 'pagata') {
      // Pagata ma il webhook non è ancora arrivato. Non si apre una seconda
      // cassa su un incasso che sta per confermarsi: la pagina aspetta.
      return NextResponse.json({ stato: 'in_conferma' }, { status: 409 })
    }
    if (cassa.esito === 'ignoto' || cassa.esito === 'in_apertura') {
      // **Non sapere è un motivo per fermarsi, non per ricominciare.** Vedi il
      // commento su `statoCassa`.
      return NextResponse.json(
        { motivo: 'la cassa precedente è in uno stato che non sappiamo leggere: riprova fra poco' },
        { status: 503 },
      )
    }
    // `morta`: Stripe ci ha detto che quella sessione non è più utilizzabile.
    // Solo adesso la riga si libera e si riparte.
    await admin.from('payments').update({ status: 'expired' }).eq('id', inCorso.id)
  }

  // ---------------------------------------------------------- su quale conto
  // Non nel codice: `app_config.consultation_stripe_account`, letto dalla stessa
  // funzione che usa il ponte Stripe. Oggi `xpetis`, in produzione `agency`
  // (deviazione 9). Il default della colonna non si tocca.
  const { data: conti, error: erroreConto } = await admin.rpc('consultation_payment_account')
  const conto = (conti as Conto[] | null)?.[0]
  if (erroreConto || !conto) {
    return NextResponse.json(
      { motivo: 'non è configurato su quale conto incassare' },
      { status: 500 },
    )
  }

  // ------------------------------------------------------------- prima la riga
  const idPagamento = randomUUID()
  const { error: erroreInserimento } = await admin.from('payments').insert({
    id: idPagamento,
    booking_id: id,
    kind: 'consultation',
    status: 'pending',
    amount_cents: prenotazione.price_cents,
    currency: 'EUR',
    stripe_account: conto.stripe_account,
    agency_id: conto.agency_id,
    client_reference_id: id,
    // La nostra scadenza, non quella di Stripe: se i due valori divergono vince
    // questa. Quella di Stripe è una cortesia verso chi ha la pagina aperta.
    expires_at: prenotazione.payment_deadline_at,
  })

  if (erroreInserimento) {
    // 23505 = violazione di unicità, cioè `payments_one_pending_per_kind`: due
    // clic partiti insieme, e l'altra richiesta ha vinto. Non è un errore da
    // mostrare: si aspetta un attimo e si riusa la sua cassa.
    if (erroreInserimento.code === '23505') {
      const { data: altrui } = await admin
        .from('payments')
        .select('stripe_checkout_session_id, created_at')
        .eq('booking_id', id)
        .eq('kind', 'consultation')
        .eq('status', 'pending')
        .maybeSingle()
      const cassa = await statoCassa(
        altrui?.stripe_checkout_session_id ?? null,
        altrui?.created_at ?? null,
      )
      if (cassa.esito === 'aperta') return NextResponse.json({ url: cassa.url, riusata: true })
      // Qui non si tocca mai niente: la riga è di un'altra richiesta, che
      // probabilmente sta ancora parlando con Stripe.
      return NextResponse.json({ motivo: 'cassa in apertura, riprova' }, { status: 503 })
    }
    return NextResponse.json({ motivo: erroreInserimento.message }, { status: 500 })
  }

  // ------------------------------------------------------------ poi la cassa
  const origine = origineDi(request)
  // PostgREST restituisce un oggetto per una relazione a uno, ma il tipo dedotto
  // da supabase-js dice array: si accettano entrambe le forme invece di
  // scommettere su quale delle due arriva.
  const incorporato = prenotazione.travel_designers as
    | { display_name: string }
    | { display_name: string }[]
    | null
  const designer =
    (Array.isArray(incorporato) ? incorporato[0]?.display_name : incorporato?.display_name) ?? null
  const etichetta = ETICHETTA_SERVIZIO[prenotazione.service_type as TipoServizio]

  try {
    const cassa = await apriCassa({
      importoCents: prenotazione.price_cents,
      titolo: designer ? `${etichetta} con ${designer}` : etichetta,
      descrizione: prenotazione.starts_at
        ? `Videochiamata del ${new Intl.DateTimeFormat('it-IT', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'Europe/Rome',
          }).format(new Date(prenotazione.starts_at))}`
        : undefined,
      prenotazioneId: id,
      scadenzaUnix: scadenzaPerStripe(scadenza),
      urlSuccesso: `${origine}/prenotazione/${id}?ritorno=1`,
      urlAnnullamento: `${origine}/prenotazione/${id}`,
      emailCliente: user.email ?? undefined,
      // La riga di pagamento esiste già e il suo id è unico: è la chiave di
      // idempotenza più onesta che ci sia, perché identifica *questo* tentativo
      // e non la prenotazione (che di tentativi ne può avere più d'uno).
      idempotenza: `cassa-${idPagamento}`,
    })

    await admin
      .from('payments')
      .update({ stripe_checkout_session_id: cassa.id })
      .eq('id', idPagamento)

    return NextResponse.json({ url: cassa.url })
  } catch (e) {
    // La cassa non si è aperta: la riga appena creata si cancella, altrimenti
    // resterebbe a occupare l'unico posto `pending` e il viaggiatore non
    // potrebbe riprovare fino alla scadenza.
    await admin.from('payments').delete().eq('id', idPagamento)
    const messaggio = e instanceof ErroreStripe ? e.message : 'la cassa non si è aperta'
    return NextResponse.json({ motivo: messaggio }, { status: 502 })
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
 * indirizzi di pagamento vivi per la stessa consulenza** — esattamente ciò che
 * la migration 0038 esiste per rendere impossibile. Un difetto che compare solo
 * quando Stripe è lento, cioè quando c'è più traffico.
 *
 * Quindi quattro esiti, e solo uno autorizza a buttare la riga:
 *
 * | esito | cosa sappiamo | cosa fa la route |
 * |---|---|---|
 * | `aperta` | Stripe l'ha data per `open` e ha un indirizzo | lo riusa |
 * | `pagata` | Stripe l'ha data per `complete` | aspetta il webhook |
 * | `morta` | Stripe l'ha dichiarata `expired`, o 404 | libera la riga e riparte |
 * | `ignoto` | **Stripe non ha risposto** | 503, e non tocca niente |
 * | `in_apertura` | riga senza sessione, appena creata | 503, e non tocca niente |
 *
 * L'ultimo caso è il gemello del primo sul lato nostro: una riga che non porta
 * ancora una sessione può essere una richiesta interrotta a metà — e allora è da
 * buttare — oppure una richiesta parallela che **in questo istante** sta
 * parlando con Stripe. I due casi si distinguono solo dall'età della riga.
 * `PAUSA_APERTURA_MS` non è un parametro di prodotto e per questo non sta in
 * `app_config`: è la scala dei tempi di una chiamata HTTP, come i cinque minuti
 * di tolleranza della firma nella 0039.
 */
type StatoCassa =
  | { esito: 'aperta'; url: string }
  | { esito: 'pagata' }
  | { esito: 'morta' }
  | { esito: 'ignoto' }
  | { esito: 'in_apertura' }

/** Quanto si concede a una richiesta parallela per finire di parlare con Stripe. */
const PAUSA_APERTURA_MS = 30_000

async function statoCassa(sessione: string | null, creataIl: string | null): Promise<StatoCassa> {
  if (!sessione) {
    const eta = creataIl ? Date.now() - new Date(creataIl).getTime() : Number.POSITIVE_INFINITY
    return eta < PAUSA_APERTURA_MS ? { esito: 'in_apertura' } : { esito: 'morta' }
  }

  try {
    const cassa = await leggiCassa(sessione)
    // `leggiCassa` torna null solo sul 404: è Stripe che dichiara di non
    // conoscere quella sessione, non noi che non siamo riusciti a chiedere.
    if (!cassa) return { esito: 'morta' }
    if (cassa.status === 'open' && cassa.url) return { esito: 'aperta', url: cassa.url }
    if (cassa.status === 'complete') return { esito: 'pagata' }
    return { esito: 'morta' }
  } catch {
    // Rete caduta, 500 di Stripe, timeout. La sessione è probabilmente ancora
    // viva: chi non sa, non tocca.
    return { esito: 'ignoto' }
  }
}
