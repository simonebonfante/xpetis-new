import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Il ponte fra l'embed di Cal.com e la cassa, e la corsa che c'è in mezzo.
 *
 * Il viaggiatore finisce di prenotare dentro l'embed. In quel momento la
 * prenotazione esiste **su Cal.com** e da noi no: Cal.com manda il webhook, il
 * webhook passa da n8n, n8n chiama `calcom_webhook()`, e solo alla fine di quel
 * giro nasce la riga in `bookings`. Sono secondi, ma sono secondi durante i
 * quali la pagina non ha niente su cui aprire una cassa.
 *
 * ## Perché non si legge l'uid dall'evento dell'embed
 *
 * L'embed di Cal.com emette un evento a prenotazione fatta, e dentro c'è il
 * codice della prenotazione. Sarebbe la strada corta, ed è quella sbagliata per
 * due ragioni indipendenti: il campo non è documentato e può cambiare senza
 * preavviso, e soprattutto **quel codice non deve stare nel browser** — dopo la
 * verifica S-05 basta lui, senza nessuna chiave, per cancellare la call su
 * Cal.com. È la stessa ragione per cui la 0019 l'ha tolto da `my_bookings`.
 *
 * ## Cosa si fa invece
 *
 * Il viaggiatore è loggato — è il suo UUID che il sito precompila nell'embed e
 * che torna in `payload.responses.xpetis_user_id.value` — quindi il server può
 * cercare *la sua* prenotazione ancora in attesa di pagamento senza che il
 * browser sappia niente di Cal.com. Non serve nemmeno una finestra temporale:
 * una riga `pending_payment` con `payment_deadline_at` nel futuro è viva per
 * costruzione al massimo quanto `booking_payment_window_min`, e se ce n'è una è
 * proprio quella che il viaggiatore deve pagare.
 */

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ motivo: 'nessuna sessione' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bookings')
    .select('id')
    .eq('traveler_id', user.id)
    .eq('status', 'pending_payment')
    .gt('payment_deadline_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    return NextResponse.json({ motivo: 'prenotazioni illeggibili' }, { status: 500 })
  }

  return NextResponse.json({ prenotazione: data?.[0]?.id ?? null })
}

/**
 * L'attesa è finita e la prenotazione non è comparsa.
 *
 * Non è un caso da ignorare e non è un caso da nascondere: se dopo mezzo minuto
 * la riga non c'è, il webhook di Cal.com non è arrivato — e allora **esiste uno
 * slot occupato sul calendario di un designer senza nessuna riga dalla nostra
 * parte**. Nessun orologio lo libererà, perché gli orologi guardano le righe che
 * abbiamo. L'unico che può accorgersene è chi legge `team_alerts`.
 *
 * Il viaggiatore intanto riceve un messaggio onesto e un modo di parlare con una
 * persona: è il principio "l'umano entra sull'eccezione".
 *
 * ## Perché questo alert vale più di un controllo periodico (20 settembre 2026)
 *
 * La tentazione, con 25 account Cal.com configurati a mano, è un ramo
 * dell'orologio che avvisa se un designer non manda niente da N giorni. Il
 * difetto è strutturale: **in Beta un designer senza prenotazioni è
 * indistinguibile da uno col webhook rotto**, perché il segnale manca per la
 * stessa ragione per cui manca il traffico.
 *
 * Questa riga invece è **evidenza e non inferenza**: qualcuno ha davvero
 * prenotato, e a noi non è arrivato niente. Da qui la sola cosa che mancava era
 * saper dire **su quale account guardare**, e adesso lo dice.
 *
 * Lo slug arriva dal corpo della richiesta, cioè da fuori, e si tratta di
 * conseguenza: **si usa solo per cercare una riga di `travel_designers`**, e
 * quello che finisce nell'alert è il nome che il nostro database restituisce,
 * mai la stringa arrivata. Uno slug inventato non inserisce niente nel testo —
 * torna semplicemente un alert senza designer, come prima. Il peggio che può
 * fare un viaggiatore che lo modifica è indicare al team uno dei designer veri,
 * e il controllo che il team fa dopo (guardare il webhook di quell'account) è
 * innocuo comunque.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ motivo: 'nessuna sessione' }, { status: 401 })
  }

  // Un corpo assente o malformato non è un errore: l'alert si scrive lo stesso,
  // solo senza sapere di chi. Questa route esiste per segnalare un guasto, e
  // sarebbe assurdo che un dettaglio mancante le impedisse di farlo.
  const corpo = (await request.json().catch(() => null)) as { designer?: unknown } | null
  const slug = typeof corpo?.designer === 'string' ? corpo.designer.trim() : null

  const admin = createAdminClient()

  // Prima si riguarda: fra l'ultimo tentativo del browser e questa chiamata la
  // riga può essere arrivata, e un alert per un problema che non c'è costa al
  // team più di quanto valga.
  const { data: arrivata } = await admin
    .from('bookings')
    .select('id')
    .eq('traveler_id', user.id)
    .eq('status', 'pending_payment')
    .gt('payment_deadline_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  if (arrivata?.[0]) {
    return NextResponse.json({ prenotazione: arrivata[0].id })
  }

  // Lo slug non finisce nell'alert: ci finisce quello che il database risponde.
  const { data: designer } = slug
    ? await admin
        .from('travel_designers')
        .select('id, display_name, cal_username')
        .eq('slug', slug)
        .maybeSingle()
    : { data: null }

  await admin.from('team_alerts').insert({
    kind: 'calcom_webhook_non_arrivato',
    severity: 'critical',
    // L'entità è il **designer** quando lo sappiamo: è su di lui che si va a
    // guardare, ed è così che due segnalazioni sullo stesso account si vedono
    // vicine su Studio. Il viaggiatore resta nel messaggio, dove serve a
    // ritrovare lo slot e a scrivergli.
    entity_type: designer ? 'travel_designer' : 'traveler',
    entity_id: designer?.id ?? user.id,
    message:
      'Un viaggiatore ha finito di prenotare nell\'embed Cal.com e dopo l\'attesa la '
      + 'prenotazione non è comparsa: il webhook non è arrivato. Probabile slot occupato '
      + 'sul calendario di un designer senza nessuna riga in `bookings`, che nessun '
      + 'orologio libererà. '
      + (designer
          ? `Designer: ${designer.display_name} (account Cal.com \`${designer.cal_username ?? 'non impostato'}\`) — `
            + 'controlla il webhook di quell\'account: indirizzo giusto, parola segreta giusta, '
            + 'i tre eventi iscritti. '
          : 'Designer: **non sappiamo quale** — la vetrina di partenza non è arrivata fino '
            + 'a qui. Cerca lo slot fra i calendari dei 25. ')
      + `Viaggiatore: ${user.email ?? user.id}.`,
  })

  return NextResponse.json({ prenotazione: null, segnalato: true })
}
