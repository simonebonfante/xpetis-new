/**
 * L'unica porta verso `public_config`, e sta solo lato server — come
 * `lib/quiz.ts` verso `public_quiz_axes` e `lib/vetrina.ts` verso
 * `public_td_showcase`.
 *
 * `app_config` è il posto dove vivono i parametri di prodotto: niente soglie,
 * pesi o finestre temporali nel codice, una riga per parametro, modificabile da
 * Supabase Studio senza deploy. Dalla migration 0034 una riga può portare un
 * numero **o** un testo, e la vista pubblica serve i gruppi `booking_rules` e
 * `showcase`. Restano fuori `matching` (pesi e soglie del punteggio, chiusi dalla
 * 0018), `orders` e `reviews`.
 */
import { createClient } from '@/lib/supabase/server'

/**
 * Le chiavi che il sito pubblico legge, in un posto solo.
 *
 * Una chiave sbagliata non è un errore che si vede: la riga non si trova, la
 * pagina non mostra niente e nessuno se ne accorge. Tenerle qui è l'unico modo
 * per confrontarle con `seed/0001_config.sql` a occhio.
 */
export const CHIAVI = {
  /** La nota sotto il prezzo degli itinerari pronti: "volo non incluso • IVA inclusa". */
  notaPrezzoItinerario: 'ready_itinerary_price_note',
} as const

/**
 * Il valore di testo di un parametro, o `null` se la riga non c'è o è vuota.
 *
 * Vuoto e assente sono lo stesso caso, di proposito: **svuotare la riga da Studio
 * è il modo di togliere la nota dalla pagina**, e deve funzionare senza che
 * qualcuno cancelli la riga (che poi nessuno saprebbe ricreare).
 */
export async function leggiTestoConfig(chiave: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('public_config')
    .select('value_text')
    .eq('key', chiave)
    .maybeSingle()

  if (error) throw new Error(`public_config: ${error.message}`)

  const testo = (data as { value_text: string | null } | null)?.value_text?.trim()
  return testo ? testo : null
}
