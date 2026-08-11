import Image from 'next/image'

type Props = {
  testo: string
  /**
   * Le stelle del design: 183, 231 e 71 px, più la marrone `#9E6F54` della
   * pagina ricerca, che è la stessa forma in un altro colore.
   */
  stella?: 'stella' | 'stella-grande' | 'stella-piccola' | 'stella-marrone'
  dimensione?: number
  rotazione?: number
  className?: string
}

/**
 * Il bollo a stella con la scritta ruotata dentro: "Dove ti portiamo?",
 * "Pront* a partire?", i numeri 1-2-3 delle tre modalità di viaggio.
 */
export function BadgeStella({
  testo,
  stella = 'stella',
  dimensione = 183,
  rotazione = 0,
  className = '',
}: Props) {
  // Due livelli di proposito: il div esterno porta SOLO la className del
  // chiamante (che decide dove e se mostrare il badge — di norma `absolute`),
  // il div interno è il contesto `relative` per stella e scritta. Mettere qui
  // un `relative` fisso entrerebbe in conflitto con l'`absolute` passato da
  // fuori: a parità di specificità in Tailwind vince l'ultima utility nel CSS
  // (`.relative`), il badge tornerebbe in-flow e scentrerebbe il layout.
  return (
    <div className={`pointer-events-none select-none ${className}`} aria-hidden>
      <div className="relative" style={{ width: dimensione, height: dimensione }}>
        <Image
          src={`/img/${stella}.svg`}
          alt=""
          width={dimensione}
          height={dimensione}
          className="absolute inset-0 h-full w-full"
        />
        <span
          className="absolute inset-0 flex items-center justify-center px-[18%] text-center font-titoli font-bold text-neutro"
          style={{
            transform: `rotate(${rotazione}deg)`,
            fontSize: Math.round(dimensione * 0.12),
            lineHeight: 1.25,
          }}
        >
          {testo}
        </span>
      </div>
    </div>
  )
}
