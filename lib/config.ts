/**
 * L'unica porta verso i parametri di `app_config`, e sta solo lato server —
 * come `lib/quiz.ts` verso `public_quiz_axes` e `lib/vetrina.ts` verso
 * `public_td_showcase`.
 *
 * `app_config` è il posto dove vivono i parametri di prodotto: niente soglie,
 * pesi o finestre temporali nel codice, una riga per parametro, modificabile da
 * Supabase Studio senza deploy. Dalla migration 0034 una riga può portare un
 * numero **o** un testo.
 *
 * ## Due porte, e la differenza conta
 *
 * `leggiTestoConfig()` passa dalla vista `public_config`, che serve i gruppi
 * `booking_rules` e `showcase` ad `anon`. Restano fuori `matching` (pesi e
 * soglie del punteggio, chiusi dalla 0018), `orders`, `reviews`, `payments` e
 * `contacts`.
 *
 * `leggiContatto()` passa dalla chiave secret e legge `app_config` diretta.
 * Serve per i parametri che **la pagina stampa ma l'API non deve servire a
 * chiunque**: il caso è il numero WhatsApp, che oggi è un cellulare personale.
 * Un dato scritto in pagina dal nostro server e un dato interrogabile in blocco
 * da un crawler non sono la stessa cosa, anche quando il valore è identico.
 */
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Le chiavi che il sito legge, in un posto solo.
 *
 * Una chiave sbagliata non è un errore che si vede: la riga non si trova, la
 * pagina non mostra niente e nessuno se ne accorge. Tenerle qui è l'unico modo
 * per confrontarle con `seed/0001_config.sql` a occhio.
 */
export const CHIAVI = {
  /** La nota sotto il prezzo degli itinerari pronti: "volo non incluso • IVA inclusa". */
  notaPrezzoItinerario: 'ready_itinerary_price_note',
  /**
   * Il numero WhatsApp del team, in formato internazionale con gli spazi.
   * È **provvisorio** e sta in `app_config` proprio per questo: sostituirlo
   * dev'essere una riga cambiata da Studio, non un deploy. Gruppo `contacts`,
   * quindi si legge con `leggiContatto()` e non da `public_config`.
   * Chi ne fa un link `wa.me` toglie spazi e `+`.
   */
  whatsapp: 'whatsapp_number',
} as const

/**
 * Il valore di testo di un parametro **pubblico**, o `null` se la riga non c'è
 * o è vuota.
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

  return ripulisci(data)
}

/**
 * Un recapito del team, letto con la chiave secret perché `public_config` non
 * lo espone e non deve esporlo.
 *
 * Non solleva se la riga manca: un numero di telefono assente fa sparire un
 * bottone, e una pagina in errore al posto di un bottone in meno sarebbe un
 * peggioramento. La riga manca davvero finché qualcuno non la inserisce su
 * Studio — il seed la contiene, ma il seed gira solo su `db reset`.
 */
export async function leggiContatto(chiave: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('app_config')
    .select('value_text')
    .eq('key', chiave)
    .maybeSingle()

  if (error) return null

  return ripulisci(data)
}

function ripulisci(riga: unknown): string | null {
  const testo = (riga as { value_text: string | null } | null)?.value_text?.trim()
  return testo ? testo : null
}
