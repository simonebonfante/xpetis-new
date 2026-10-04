import Image from 'next/image'
import { formattaPrezzo, type Servizio, type TipoServizio } from '@/lib/vetrina'

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
 * **Dal 4 ottobre 2026** (vetrine v6) i riquadri hanno le loro icone, prese
 * dal tool vetrina v6 dove sono SVG in linea (`public/img/dopo-*.svg`): il
 * connettore Figma il 29 settembre aveva finito le chiamate prima di
 * scaricarle. E il riquadro «Itinerario su misura» porta il prezzo di partenza
 * («da 70€») quando il designer l'ha scritto nel tool (`suMisuraPrezzo` →
 * `td_services.price_from_cents`, decisione D5 del 3 ottobre). **Non è il
 * prezzo che si incassa**: quello lo scrive il designer nella proposta, già al
 * netto del credito (Flusso §6). È un «a partire da» di vetrina.
 *
 * La variante del tool «Dopo la sessione, hai già un itinerario completo!»
 * (linguetta Sessione) non c'è: è una differenza fra tool e Flusso aperta in
 * `VETRINE_V6_FASE0.md` (D-1), e fino a una decisione il riquadro è uno solo.
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
const DOPO_LA_CALL: {
  tipo: TipoServizio
  titolo: string
  riga: string
  icona: { src: string; larghezza: number; altezza: number }
}[] = [
  { tipo: 'custom_itinerary', titolo: 'Itinerario su misura', riga: 'Ti scrivo il viaggio giorno per giorno',
    icona: { src: '/img/dopo-su-misura.svg', larghezza: 20, altezza: 18 } },
  { tipo: 'all_inclusive', titolo: 'All inclusive', riga: 'Progetto e prenoto il viaggio',
    icona: { src: '/img/dopo-all-inclusive.svg', larghezza: 13, altezza: 19 } },
  { tipo: 'group_trip', titolo: 'Viaggio di gruppo', riga: 'Piccoli gruppi su date fisse',
    icona: { src: '/img/dopo-gruppo.svg', larghezza: 22, altezza: 16 } },
  { tipo: 'private_guiding', titolo: 'Viaggio privato con me', riga: 'Vengo con te sul posto',
    icona: { src: '/img/dopo-privato.svg', larghezza: 22, altezza: 19 } },
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
        {riquadri.map((d) => {
          const da = formattaPrezzo(servizi.find((s) => s.service_type === d.tipo)?.price_from_cents ?? null)
          return (
            <li key={d.tipo} className="rounded-[10px] bg-neutro px-5 pb-[22px] pt-[17px]">
              <div className="mb-[17px] flex items-center justify-between gap-[10px]">
                {/* Il tondo rosso al 20%: `bg-primario/20`, il token col suo alfa. */}
                <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primario/20" aria-hidden>
                  <Image
                    src={d.icona.src}
                    alt=""
                    width={d.icona.larghezza}
                    height={d.icona.altezza}
                    style={{ width: d.icona.larghezza, height: d.icona.altezza }}
                  />
                </span>
                {da && <span className="font-titoli text-[20px] font-bold text-primario">da {da}</span>}
              </div>
              <p className="font-titoli text-[22px] font-bold leading-tight">{d.titolo}</p>
              <p className="mt-4 text-[14px] leading-[1.25]">{d.riga}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
