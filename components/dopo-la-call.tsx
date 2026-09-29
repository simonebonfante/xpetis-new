import type { Servizio, TipoServizio } from '@/lib/vetrina'

/**
 * "E dopo l'incontro? Decidete insieme se continuare." — il riquadro crema
 * sotto la presentazione del designer (Figma nuovo, vetrina `72-48`, nodo
 * 72:471 e seguenti).
 *
 * Fino al 28 settembre viveva **dentro** la scheda della call, in piccolo
 * (vetrina `2-743`). La revisione `72-48` lo porta fuori, nella fascia hero, a
 * sinistra sotto la storia, con riquadri grandi. Il contenuto è lo stesso: i
 * servizi che si comprano dopo la call, presentati e non venduti.
 *
 * **Presentazione, non vendita**: nessun riquadro è un link, perché nessuno di
 * questi servizi si compra da qui (Flusso §3). Nascono dopo la consulenza, dai
 * bottoni della mail post-call.
 *
 * Due cose del disegno che qui non ci sono, di proposito:
 *
 *  · **Il prezzo sul riquadro "Itinerario su misura"** ("50€" nel Figma). Il
 *    form Vetrina TD dà un prezzo solo per la call: il su misura lo prezza il
 *    designer nella proposta, già al netto del credito (Flusso §6). Un numero
 *    qui non avrebbe sorgente, e sarebbe una promessa che la proposta può
 *    smentire. Domanda aperta in `PIANO.md`.
 *  · **Le icone nei tondi rossi.** Il connettore Figma ha esaurito le chiamate
 *    il 29 settembre prima che i quattro segni si potessero scaricare (sono
 *    livelli separati dal tondo, nodi 72:515, 72:535, 72:540, 72:545). Si
 *    aggiungono quando lo script degli asset li avrà. Un tondo vuoto, o un
 *    segno ridisegnato a mano, sarebbe peggio di niente.
 */

/**
 * I quattro riquadri, nell'ordine del disegno (a due colonne: su misura, All
 * inclusive; gruppo, privato). Titolo e riga sono testo del Figma: li rivede
 * Gaia, come ogni testo di prodotto.
 *
 * Compare **solo quello che il designer ha attivo**: il Figma ne disegna
 * quattro perché disegna un designer che li ha tutti. Mostrare "Viaggio privato
 * con me" a chi non accompagna sarebbe promettere un servizio che la mail
 * post-call non offrirà mai, perché i suoi bottoni nascono da quegli stessi
 * servizi attivi.
 */
const DOPO_LA_CALL: { tipo: TipoServizio; titolo: string; riga: string }[] = [
  { tipo: 'custom_itinerary', titolo: 'Itinerario su misura', riga: 'Ti scrivo il viaggio giorno per giorno' },
  { tipo: 'all_inclusive', titolo: 'All inclusive', riga: 'Progetto e prenoto il viaggio' },
  { tipo: 'group_trip', titolo: 'Viaggio di gruppo', riga: 'Piccoli gruppi su date fisse' },
  { tipo: 'private_guiding', titolo: 'Viaggio privato con me', riga: 'Vengo con te sul posto' },
]

/**
 * Quali riquadri mostrare per questo designer. Sta qui, e non nella pagina,
 * perché la usa anche la scheda della call: la riga del credito consulenza ha
 * senso solo se c'è un servizio da cui scalarlo.
 */
export function serviziDopoLaCall(servizi: Servizio[]) {
  return DOPO_LA_CALL.filter((d) => servizi.some((s) => s.service_type === d.tipo))
}

export function DopoLaCall({ servizi }: { servizi: Servizio[] }) {
  const riquadri = serviziDopoLaCall(servizi)
  if (riquadri.length === 0) return null

  return (
    <div className="rounded-[30px] bg-crema px-6 pb-8 pt-8 text-scuro lg:max-w-[815px] lg:pb-[41px] lg:pl-[44px] lg:pr-[30px] lg:pt-[44px]">
      <h2 className="font-titoli text-[28px] font-bold leading-tight lg:max-w-[729px] lg:pl-[13px] lg:text-[36px] lg:leading-[1.25]">
        E dopo l’incontro?
        <br />
        Decidete insieme se continuare.
      </h2>
      <p className="mt-2 max-w-[411px] text-corpo leading-[1.25] lg:pl-[13px]">
        L’incontro serve anche a capire se siete la combinazione giusta per quel viaggio. Poi
        scegli come proseguire.
      </p>

      <ul className="mt-6 grid gap-[17px] sm:grid-cols-2 sm:gap-x-5 lg:max-w-[648px]">
        {riquadri.map((d) => (
          <li key={d.tipo} className="rounded-[10px] bg-neutro px-[21px] py-6">
            <p className="font-titoli text-[22px] font-bold leading-tight">{d.titolo}</p>
            <p className="mt-4 text-[14px] leading-[1.25]">{d.riga}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
