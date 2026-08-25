/**
 * L'unica porta verso `match_designers()`, e sta solo lato server.
 *
 * La funzione Postgres è in SECURITY DEFINER e restituisce ordine, banda,
 * sezione, badge e gli *ingredienti* della frase: mai un punteggio, mai un
 * livello di paese, mai il valore di un asse. Qui non si ricalcola niente — il
 * browser non vede questo modulo e non deve.
 */
import { createClient } from '@/lib/supabase/server'
import type { Quiz } from '@/lib/quiz-risposte'

/** I due soli livelli che filtrano. Città e continenti vivono nel suggeritore. */
export const LIVELLI_FILTRABILI = ['country', 'macro_area'] as const
export type LivelloDestinazione = (typeof LIVELLI_FILTRABILI)[number]

export type Destinazione = {
  livello: LivelloDestinazione
  ref: string
  /** Nome italiano, letto da `geo_search`: serve ai titoli di sezione e alla frase. */
  nome: string
}

/**
 * Le sezioni che la funzione produce. Con destinazione vengono dalle bande
 * geografiche, senza destinazione dalla soglia del badge.
 */
export type Sezione =
  | 'esperti_paese'
  | 'esperti_macro_area'
  | 'macro_area'
  | 'continente'
  | 'match_forte'
  | 'altri'
  | 'fallback'

export type RisultatoMatch = {
  rank_position: number
  td_id: string
  slug: string
  display_name: string
  headline: string | null
  photo_url: string | null
  background_photo_url: string | null
  band: number
  section: Sezione
  has_strong_badge: boolean
  covered_countries: string[]
  /** Codici degli assi più salienti, in ordine. Mai i valori. */
  salient_axes: string[]
  matched_themes: string[]
  total_count: number
}

/**
 * Le risposte del quiz. Il tipo vive in `lib/quiz-risposte.ts`, insieme alla
 * lettura e alla scrittura della stringa di query: quel modulo è puro e lo
 * possono importare anche i componenti client, questo no.
 */
export type { Quiz }

type Parametri = {
  destinazione?: Destinazione | null
  quiz?: Quiz | null
  temi?: string[]
  contesti?: string[]
  limite?: number
  offset?: number
}

export async function cercaDesigner({
  destinazione = null,
  quiz = null,
  temi = [],
  contesti = [],
  limite = 20,
  offset = 0,
}: Parametri): Promise<{ risultati: RisultatoMatch[]; totale: number }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('match_designers', {
    p_destination_level: destinazione?.livello ?? null,
    p_destination_ref: destinazione?.ref ?? null,
    p_quiz: quiz && Object.keys(quiz).length > 0 ? quiz : null,
    p_themes: temi,
    p_contexts: contesti,
    p_limit: limite,
    p_offset: offset,
  })

  // La funzione solleva un errore su una destinazione non filtrabile o
  // inesistente: è un errore di chi chiama, non un caso da nascondere.
  if (error) throw new Error(`match_designers: ${error.message}`)

  const risultati = (data ?? []) as RisultatoMatch[]
  return { risultati, totale: risultati[0]?.total_count ?? 0 }
}

/**
 * Legge dal suggeritore il nome di una destinazione, e ne verifica il livello.
 * Restituisce `null` se non esiste o se quel livello non filtra: la pagina
 * risultati tratta il caso come "nessuna destinazione" invece di rompersi.
 */
export async function leggiDestinazione(
  livello: string | undefined,
  ref: string | undefined,
): Promise<Destinazione | null> {
  if (!livello || !ref) return null
  if (!(LIVELLI_FILTRABILI as readonly string[]).includes(livello)) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('geo_search')
    .select('name_it, is_filterable')
    .eq('level', livello)
    .eq('ref', ref)
    .maybeSingle()

  if (!data?.is_filterable) return null
  return { livello: livello as LivelloDestinazione, ref, nome: data.name_it }
}

/**
 * Quanti designer pubblicati. Serve al bollo a stella del Figma, che è disegnato
 * con "+100 Designer": un numero di comodo, che qui diventa quello vero.
 */
export async function contaDesignerPubblicati(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('public_td_showcase')
    .select('id', { count: 'exact', head: true })
  return count ?? 0
}

/**
 * I tag che esistono davvero sulla destinazione: **la maschera contestuale** del
 * Flusso (*"sulla Bolivia non si mostra 'mare'"*), migration 0036.
 *
 * Perché una funzione e non una vista: `td_destination_tags` dice su cosa un
 * designer è forte, paese per paese, ed è uno degli ingredienti del punteggio.
 * `tags_for_destination()` restituisce l'unione dei tag dei designer pubblicati
 * su quella destinazione — mai chi li ha dichiarati.
 *
 * Senza destinazione torna tutti i tag, cioè nessuna maschera: la regola sta
 * nella funzione, non in un `if` del sito.
 */
export async function leggiTagDisponibili(
  destinazione: Destinazione | null,
): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('tags_for_destination', {
    p_destination_level: destinazione?.livello ?? null,
    p_destination_ref: destinazione?.ref ?? null,
  })

  if (error) throw new Error(`tags_for_destination: ${error.message}`)
  return ((data ?? []) as { code: string }[]).map((r) => r.code)
}

/** Le etichette dei filtri, dalla vista pubblica. Servono ai chip e alla frase. */
export async function leggiTag(): Promise<{
  temi: { code: string; label_it: string }[]
  contesti: { code: string; label_it: string }[]
  etichette: Record<string, string>
}> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('public_tags')
    .select('code, kind, label_it, sort_order')
    .order('sort_order')

  const righe = (data ?? []) as { code: string; kind: string; label_it: string }[]
  return {
    temi: righe.filter((r) => r.kind === 'theme'),
    contesti: righe.filter((r) => r.kind === 'context'),
    etichette: Object.fromEntries(righe.map((r) => [r.code, r.label_it])),
  }
}
