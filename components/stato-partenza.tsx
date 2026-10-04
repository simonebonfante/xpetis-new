import { etichettaStato } from '@/lib/vetrina-vista'
import type { StatoPartenza } from '@/lib/vetrina'

/**
 * L'etichetta dello stato di una partenza: «Confermato», «Ultimi posti»,
 * «Sold out». Una partenza aperta non ne ha.
 *
 * **I colori non sono quelli del tool.** Il tool usa un verde per «Confermato»,
 * un arancio per «Ultimi posti» e un grigio per «Sold out», e nessuno dei tre
 * ha un token nostro (R6: un colore senza corrispondente si segnala e non si
 * aggiunge; è il punto D-31 di `VETRINE_V6_FASE0.md`). Qui i tre stati si
 * distinguono con i tre token che abbiamo: bordo scuro, rosso pieno, grigio
 * attenuato. Se Chiara aggiunge i tre colori al design system, cambiano qui.
 */
const STILE: Record<Exclude<StatoPartenza, 'open'>, string> = {
  confirmed: 'border border-scuro bg-crema text-scuro',
  last_seats: 'bg-primario text-neutro',
  sold_out: 'bg-scuro/10 text-scuro/60',
}

export function StatoPartenzaChip({ stato, corta = false }: { stato: StatoPartenza; corta?: boolean }) {
  const testo = etichettaStato(stato, corta)
  if (stato === 'open' || !testo) return null
  return (
    <span
      className={`inline-flex items-center rounded-[20px] px-3 py-[3px] text-[12px] leading-none ${STILE[stato]}`}
    >
      {testo}
    </span>
  )
}
