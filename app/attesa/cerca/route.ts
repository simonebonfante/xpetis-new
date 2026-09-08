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
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ motivo: 'nessuna sessione' }, { status: 401 })
  }

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

  await admin.from('team_alerts').insert({
    kind: 'calcom_webhook_non_arrivato',
    severity: 'critical',
    entity_type: 'traveler',
    entity_id: user.id,
    message:
      'Un viaggiatore ha finito di prenotare nell\'embed Cal.com e dopo l\'attesa la '
      + 'prenotazione non è comparsa: il webhook non è arrivato. Probabile slot occupato '
      + 'sul calendario di un designer senza nessuna riga in `bookings`, che nessun '
      + `orologio libererà. Viaggiatore: ${user.email ?? user.id}.`,
  })

  return NextResponse.json({ prenotazione: null, segnalato: true })
}
