/**
 * L'unica porta verso la vetrina di un Travel Designer, e sta solo lato server.
 *
 * Legge da `public_td_showcase`, la vista che la migration 0028 ha costruito per
 * servire tutta la pagina in una query: campi di profilo, paesi coperti per
 * nome, servizi attivi con i punti dei box, viaggi firma con le foto in ordine,
 * itinerari pronti. Qui non si aggiunge niente: se serve una lettura nuova si
 * aggiunge una vista, non si apre una tabella.
 *
 * **Un campo del Figma non c'è, ed è voluto segnalarlo invece di procurarselo.**
 * La riga "Membro XPETIS" della scheda hero vuole `travel_designers.joined_at`,
 * che `public_td_showcase` non espone. Leggerlo con la chiave secret sarebbe
 * lecito ma scavalcherebbe la regola "la superficie pubblica è la vista": la
 * riga resta fuori finché Simone non decide se aggiungere la colonna alla vista.
 * Vedi PIANO.md, milestone 3.
 */
import { createClient } from '@/lib/supabase/server'

/** I cinque servizi del form, più la consulenza approfondita. */
export type TipoServizio =
  | 'consultation'
  | 'consultation_deep'
  | 'custom_itinerary'
  | 'all_inclusive'
  | 'group_trip'
  | 'private_guiding'

/**
 * **I box acquistabili sono due soltanto** (Flusso §3): la consulenza, che ogni
 * designer ha, e la consulenza approfondita, che ha solo chi la attiva. Tutto il
 * resto si presenta ma non si compra: l'itinerario su misura e l'All Inclusive
 * si acquistano dopo la call, dai bottoni della mail post-call.
 *
 * La regola vive qui e non in un `if` sparso nel componente: è di prodotto, ed è
 * la stessa che il database impone su `orders.service_type`.
 */
export const SERVIZI_ACQUISTABILI: readonly TipoServizio[] = ['consultation', 'consultation_deep']

export function siCompraInVetrina(tipo: TipoServizio): boolean {
  return SERVIZI_ACQUISTABILI.includes(tipo)
}

/** Le etichette dei servizi, come li chiama il Flusso. */
export const ETICHETTA_SERVIZIO: Record<TipoServizio, string> = {
  consultation: 'Consulenza',
  consultation_deep: 'Consulenza approfondita',
  custom_itinerary: 'Itinerario su misura',
  all_inclusive: 'All Inclusive',
  group_trip: 'Viaggio di gruppo',
  private_guiding: 'Accompagnamento privato',
}

export type Servizio = {
  service_type: TipoServizio
  price_cents: number | null
  price_is_custom: boolean
  duration_minutes: number | null
  text_during_call: string | null
  text_after_call: string | null
  bullets: string[]
}

export type ViaggioFirma = {
  title: string
  description: string | null
  /** Percorsi nel bucket `td-media`, già in ordine di `position`. */
  images: string[]
}

export type ItinerarioPronto = {
  /**
   * Identificatore stabile dentro il designer, e pezzo dell'indirizzo pubblico
   * (migration 0033). Nasce dal titolo al primo inserimento e non si muove più:
   * né una correzione del titolo né un riordino lo cambiano.
   */
  slug: string
  title: string
  /** Testo libero come lo scrive il designer ("12 giorni"): non è un numero. */
  duration_label: string | null
  /** Idem per il prezzo ("1.380€"). È vetrina, non una cassa: vedi 0026. */
  price_label: string | null
  image_path: string | null
}

/**
 * L'indirizzo della pagina di un itinerario pronto, e il modo di risolverlo. Il
 * contratto sta qui in un posto solo, come `lib/quiz-risposte.ts` fa per le
 * risposte del quiz: chi costruisce il link e chi lo legge vedono la stessa
 * regola.
 *
 * **Nell'URL c'è lo slug dell'itinerario** (migration 0033), non l'ordinale che
 * c'era fino al 23 agosto. L'ordinale rendeva un riordino silenziosamente
 * distruttivo: il link vecchio rispondeva 200 mostrando un altro viaggio. Lo slug
 * nasce dal titolo, è unico per designer e non cambia più — nemmeno correggendo
 * il titolo — quindi un indirizzo dato una volta resta quello. Il perché dello
 * slug invece dell'uuid è scritto in testa alla migration: questi link finiscono
 * nei messaggi WhatsApp, e là un identificatore si legge o non si clicca.
 */
export function percorsoItinerario(slugDesigner: string, slugItinerario: string): string {
  return `/designer/${slugDesigner}/itinerario/${slugItinerario}`
}

/**
 * Dallo slug dell'URL all'itinerario, o `null`.
 *
 * Cerca nell'array che la vista serve già: nessuna query in più, e un solo posto
 * dove sta scritto che l'URL porta uno slug.
 */
export function trovaItinerario(
  itinerari: ItinerarioPronto[],
  slug: string | undefined,
): ItinerarioPronto | null {
  if (!slug) return null
  return itinerari.find((i) => i.slug === slug) ?? null
}

export type Vetrina = {
  id: string
  slug: string
  display_name: string
  headline: string | null
  hero_bio: string | null
  bio: string | null
  manifesto: string | null
  photo_url: string | null
  background_photo_url: string | null
  languages: string[]
  years_experience: number | null
  instagram_handle: string | null
  /** Nomi dei paesi coperti, **senza il livello**: la copertura è una sola. */
  countries: string[]
  services: Servizio[]
  signature_trips: ViaggioFirma[]
  ready_itineraries: ItinerarioPronto[]
}

/** La vetrina di un designer pubblicato, o `null` se lo slug non esiste. */
export async function leggiVetrina(slug: string): Promise<Vetrina | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('public_td_showcase')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`public_td_showcase: ${error.message}`)
  return (data as Vetrina | null) ?? null
}

/**
 * Da percorso nel bucket a URL pubblica.
 *
 * `td-media` è un bucket pubblico (0017), quindi non serve una signed URL: sono
 * foto di vetrina, non documenti di viaggio. Il percorso salvato **comprende il
 * nome del bucket** (`td-media/marco-rossi/ha-giang-1.jpg`), come già fanno il
 * seed e l'harness — è la convenzione da confermare quando si scrive
 * l'importatore, perché il commento della 0025 dice solo "percorso nel bucket".
 *
 * Torna `null` se l'ambiente non dichiara Supabase: senza host non c'è immagine,
 * e la pagina mostra il riquadro neutro invece di rompersi.
 */
export function urlMedia(percorso: string | null | undefined): string | null {
  if (!percorso) return null
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!host) return null
  return `${host}/storage/v1/object/public/${percorso.replace(/^\/+/, '')}`
}

/** Importi in centesimi → "50€", come li scrive il Figma. */
export function formattaPrezzo(centesimi: number | null): string | null {
  if (centesimi === null || centesimi === undefined) return null
  const euro = centesimi / 100
  const testo = Number.isInteger(euro)
    ? euro.toLocaleString('it-IT')
    : euro.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${testo}€`
}

/**
 * La bio lunga arriva dal form con i paragrafi separati da riga vuota
 * (commento della 0022). Qui si spezza per renderli, senza toccare il testo.
 */
export function paragrafi(testo: string | null | undefined): string[] {
  if (!testo) return []
  return testo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}
