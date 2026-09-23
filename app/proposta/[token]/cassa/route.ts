import { NextResponse } from 'next/server'
import { origineAmmessa, origineDi } from '@/lib/origine'
import { leggiPaginaProposta } from '@/lib/ordine'
import { apriOriusaCassa } from '@/lib/cassa'

/**
 * La cassa della proposta su misura: sorella di quella della consulenza, non
 * una copia. Le difese — la riga in `payments` prima della sessione, il clamp
 * su `expires_at`, l'adaptive pricing spento — sono in `lib/cassa.ts` e
 * `lib/stripe.ts`, scritte una volta per tutte e due.
 *
 * Quello che è di questa route:
 *
 *  · **chi può aprirla**: chi ha il token della pagina gemella. Nessun login —
 *    chi arriva dal gruppo WhatsApp paga dalla pagina, dice il Flusso — e
 *    nessun rischio in più: la cassa ridichiara l'importo, e chi ha il link può
 *    al massimo pagare l'itinerario di qualcun altro;
 *  · **cosa**: l'ordine a cui punta il token, e solo se è `da_pagare` (cioè in
 *    `proposal_sent`: lì la proposta è congelata dal database);
 *  · **a che prezzo**: `orders.proposal_price_cents`, letto da
 *    `proposal_public_page`. Il browser non manda un importo;
 *  · **su quale conto**: `payment_account('full')`, dentro `lib/cassa.ts` —
 *    la riga `custom_itinerary_stripe_account` di `app_config` (deviazione 9).
 *
 * `payment_kind = 'full'` con `order_id` e non `booking_id`: il vincolo
 * `payments_kind_matches_target` (0011) lo impone, e il ponte (0044) riconosce
 * l'ordine da `metadata.order_id`, che `apriCassa` scrive.
 *
 * ## Due scelte sui dati del viaggiatore
 *
 * La mail del viaggiatore **non** si precompila su Stripe, a differenza della
 * consulenza: chi apre questa cassa può essere chiunque abbia il link girato
 * nel gruppo, e la pagina di Stripe gliela mostrerebbe.
 *
 * Il token invece finisce in `success_url` e `cancel_url`, perché chi paga deve
 * tornare sulla sua pagina. Lo vede Stripe e chi ha accesso al conto che
 * incassa — cioè il venditore della proposta stessa.
 */
export async function POST(request: Request, contesto: { params: Promise<{ token: string }> }) {
  const { token } = await contesto.params

  if (!origineAmmessa(request)) {
    return NextResponse.json({ motivo: 'origine non riconosciuta' }, { status: 403 })
  }

  const origine = origineDi(request)
  const pagina = `${origine}/proposta/${encodeURIComponent(token)}`
  const torna = (codice?: string) =>
    NextResponse.redirect(codice ? `${pagina}?cassa=${codice}` : pagina, 303)

  const proposta = await leggiPaginaProposta(token)

  // Token non valido: la pagina sa spiegare perché, con le parole giuste.
  if (proposta.esito !== 'valido' || !proposta.order_id) return torna()
  if (proposta.fase !== 'da_pagare' || proposta.prezzo_cents == null) return torna('non_pagabile')

  const esito = await apriOriusaCassa({
    riferimento: { order_id: proposta.order_id },
    tipo: 'full',
    importoCents: proposta.prezzo_cents,
    // Una proposta non ha una scadenza nostra: resta pagabile finché è quella
    // corrente. La cassa dura il minimo che Stripe ammette (vedi
    // `scadenzaPerStripe`), così una proposta riaperta smette presto di poter
    // essere pagata al prezzo vecchio.
    scadenzaNostra: null,
    titolo: proposta.td_name ? `Itinerario su misura con ${proposta.td_name}` : 'Itinerario su misura',
    descrizione: proposta.human_ref ? `Proposta ${proposta.human_ref}` : undefined,
    urlSuccesso: `${pagina}?ritorno=1`,
    urlAnnullamento: pagina,
  })

  switch (esito.esito) {
    case 'aperta':
      return NextResponse.redirect(esito.url, 303)
    case 'in_conferma':
      return NextResponse.redirect(`${pagina}?ritorno=1`, 303)
    case 'attendi':
      return torna('attendi')
    case 'errore':
      // Il token non finisce nei log.
      console.error('cassa proposta non aperta:', esito.stato, esito.motivo)
      return torna('errore')
  }
}
