import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Lo stato di una prenotazione, per la pagina che aspetta.
 *
 * Esiste per il ritorno da Stripe. **Il parametro di successo nell'URL non è una
 * prova di pagamento**: è una stringa che il browser ha ricevuto e che chiunque
 * può riscrivere a mano. La prova sta nel database, e ci arriva dal webhook
 * firmato — quindi la pagina di ritorno non decide niente e chiede qui.
 *
 * Legge da `my_bookings`, che filtra da sé su `auth.uid()` e non contiene
 * `cal_booking_uid`: nessuna riga di qualcun altro può uscire da questa route
 * nemmeno sbagliando la query, perché la vista non la vede proprio.
 */
export async function GET(
  _request: Request,
  contesto: { params: Promise<{ id: string }> },
) {
  const { id } = await contesto.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ motivo: 'nessuna sessione' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('my_bookings')
    .select('id, status, payment_deadline_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ motivo: 'prenotazione illeggibile' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ motivo: 'prenotazione inesistente' }, { status: 404 })
  }

  return NextResponse.json({ stato: data.status, scadenza: data.payment_deadline_at })
}
