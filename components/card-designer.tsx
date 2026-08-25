import Image from 'next/image'
import Link from 'next/link'
import type { RisultatoMatch } from '@/lib/match'

/**
 * Mostrare o no il badge "match forte" era una decisione UX aperta con Chiara
 * (Flusso §2, passo 6). **Il Figma 177:262 non lo disegna**, quindi qui è spento:
 * l'algoritmo continua a produrlo, la card non lo dice. Da confermare con Chiara,
 * perché una schermata sola non è una decisione.
 */
export const MOSTRA_BADGE_MATCH_FORTE = false

/** Quante etichette stanno nella riga in cima alla card. Nel Figma sono tre. */
const TAG_NELLA_CARD = 3

type Props = {
  risultato: RisultatoMatch
  frase: string | null
  /**
   * Il tag dei paesi compare dove la copertura non è implicita nella sezione:
   * nelle ricerche senza destinazione e in tutte le sezioni che non sono
   * "esperti della meta cercata". Lo decide `app/ricerca/page.tsx`.
   */
  mostraPaesi: boolean
}

/**
 * Le foto vere stanno su Supabase Storage, l'unico host dichiarato in
 * `next.config.ts`. Un URL altrove è una riga sbagliata nel database: si mostra
 * comunque, senza ottimizzazione, perché `next/image` su un host non dichiarato
 * farebbe cadere l'intera pagina risultati per colpa di una card.
 */
function Avatar({ url }: { url: string | null }) {
  if (!url) return <div className="size-[130px] shrink-0 rounded-[20px] bg-crema" />

  const host = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!host || !url.startsWith(host)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        className="size-[130px] shrink-0 rounded-[20px] object-cover"
      />
    )
  }
  return (
    <Image
      src={url}
      alt=""
      width={130}
      height={130}
      className="size-[130px] shrink-0 rounded-[20px] object-cover"
    />
  )
}

/**
 * La card del Figma: nessuna cornice, solo un velo che scurisce verso il basso
 * sopra il crema della pagina. Sopra il velo l'avatar, il nome e la frase in
 * bianco, e la CTA verso la vetrina.
 */
export function CardDesigner({ risultato, frase, mostraPaesi }: Props) {
  // **In questa riga ci vanno i paesi, e soltanto loro.** Il Flusso §2 la
  // descrive per esteso — *"Il tag paesi compare nella ricerca senza destinazione
  // e nelle sezioni di fallback (dove serve capire cosa copre il TD), mai quando
  // la copertura è implicita nella sezione"* — e non nomina mai i temi. I temi
  // che stavano qui fino al 23 agosto venivano dal disegno: sotto la regola del
  // 14 agosto il Figma decide la forma della pillola, il Flusso cosa ci scrive
  // dentro. Quindi dove la copertura è implicita la riga è vuota, anche se il
  // disegno mostra tre pillole in ogni card: è una domanda aperta per Chiara, non
  // una riga da riempire con l'unico dato che avevamo a portata di mano.
  const etichette = mostraPaesi ? risultato.covered_countries : []

  return (
    <article className="flex h-[520px] flex-col items-center gap-12 overflow-hidden rounded-[24px] bg-[linear-gradient(to_bottom,transparent_46.154%,rgba(0,0,0,0.8)_100%)] p-3">
      {/* La riga si rende anche vuota, e non si nasconde: così l'avatar, il nome
          e la CTA restano alla stessa altezza in tutte le sezioni, comprese
          quelle che il tag non lo portano. */}
      <ul className="flex w-full flex-wrap items-start gap-2">
        {etichette.slice(0, TAG_NELLA_CARD).map((etichetta) => (
          <li
            key={etichetta}
            className="rounded-full border border-primario bg-neutro px-4 py-1 text-[8px] leading-none text-scuro"
          >
            {etichetta}
          </li>
        ))}
      </ul>

      <Avatar url={risultato.photo_url} />

      <div className="flex flex-col items-center gap-2 px-4 text-center text-neutro">
        <h3 className="font-titoli text-h4 font-bold">{risultato.display_name}</h3>
        {MOSTRA_BADGE_MATCH_FORTE && risultato.has_strong_badge && (
          <span className="rounded-full bg-primario px-3 py-1 text-piccolo uppercase tracking-wide">
            Match forte
          </span>
        )}
        {/* La frase dai mattoncini sostituisce la bio breve (Flusso §2). Quando
            non c'è niente da dire — nessuna destinazione, nessun quiz, nessun
            filtro agganciato — resta la headline del designer. */}
        <p className="text-corpo">{frase ?? risultato.headline}</p>
      </div>

      <Link
        href={`/designer/${risultato.slug}`}
        className="rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
      >
        Vai alla vetrina
      </Link>
    </article>
  )
}
