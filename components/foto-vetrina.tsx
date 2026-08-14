import Image from 'next/image'

type Props = {
  /** URL completa. Nel dubbio si passa `urlMedia(percorso)`, che può tornare null. */
  src: string | null
  alt?: string
  /** Passata a `next/image`: la larghezza resa dipende dalla colonna. */
  sizes?: string
  className?: string
}

/**
 * Una foto di vetrina dentro il suo contenitore, che è sempre `relative` e ha
 * già la sua forma. Riempie il contenitore e ritaglia.
 *
 * **Nel database di sviluppo queste foto non esistono.** Il seed scrive percorsi
 * verosimili ma il bucket `td-media` è vuoto: le foto vere arrivano con l'import
 * delle 25 vetrine. Un designer che non le ha caricate produce lo stesso caso, e
 * la pagina deve reggerlo — quindi niente `src` significa riquadro neutro, non
 * un buco nel layout.
 *
 * **Un URL su un host diverso da Supabase Storage non è un caso da configurare,
 * è una riga sbagliata nel database** — e `next/image` su un host non dichiarato
 * in `next.config.ts` non degrada: solleva e porta giù l'intera pagina. Il seed
 * di prova lo dimostra, con `photo_url` su `example.com`. Si mostra comunque,
 * senza ottimizzazione, esattamente come fa l'avatar di `card-designer.tsx`.
 */
export function FotoVetrina({ src, alt = '', sizes = '100vw', className = '' }: Props) {
  if (!src) return <div className={`absolute inset-0 bg-scuro/10 ${className}`} aria-hidden />

  const host = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!host || !src.startsWith(host)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
      />
    )
  }

  return <Image src={src} alt={alt} fill sizes={sizes} className={`object-cover ${className}`} />
}
