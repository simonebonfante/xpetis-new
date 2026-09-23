import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { origineDi } from '@/lib/origine'
import { ETICHETTA_SERVIZIO, type TipoServizio } from '@/lib/vetrina'
import { apriOriusaCassa } from '@/lib/cassa'

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
 * Prima la riga in `payments`, poi la sessione su Stripe: è l'indice
 * `payments_one_pending_per_kind` (migration 0038) a fermare il doppio clic
 * prima che tocchi Stripe. Dal 23 settembre 2026 quella parte — insieme al clamp
 * su `expires_at` e alla lettura di una cassa già aperta — vive in
 * `lib/cassa.ts`, perché la usa anche la cassa della proposta su misura: le
 * difese si scrivono una volta sola. Qui resta quello che è di questa route:
 * chi può pagare (la sessione del viaggiatore), cosa (la sua prenotazione), a
 * che prezzo (`bookings.price_cents`) ed entro quando.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  // ------------------------------------------------------------ la cassa
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

  const esito = await apriOriusaCassa({
    riferimento: { booking_id: id },
    tipo: 'consultation',
    importoCents: prenotazione.price_cents,
    scadenzaNostra: prenotazione.payment_deadline_at,
    titolo: designer ? `${etichetta} con ${designer}` : etichetta,
    descrizione: prenotazione.starts_at
      ? `Videochiamata del ${new Intl.DateTimeFormat('it-IT', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Europe/Rome',
        }).format(new Date(prenotazione.starts_at))}`
      : undefined,
    urlSuccesso: `${origine}/prenotazione/${id}?ritorno=1`,
    urlAnnullamento: `${origine}/prenotazione/${id}`,
    emailCliente: user.email ?? undefined,
  })

  switch (esito.esito) {
    case 'aperta':
      return NextResponse.json(esito.riusata ? { url: esito.url, riusata: true } : { url: esito.url })
    case 'in_conferma':
      // Pagata ma il webhook non è ancora arrivato. Non si apre una seconda
      // cassa su un incasso che sta per confermarsi: la pagina aspetta.
      return NextResponse.json({ stato: 'in_conferma' }, { status: 409 })
    case 'attendi':
      return NextResponse.json({ motivo: esito.motivo }, { status: 503 })
    case 'errore':
      return NextResponse.json({ motivo: esito.motivo }, { status: esito.stato })
  }
}
