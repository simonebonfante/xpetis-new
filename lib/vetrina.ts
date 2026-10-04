/**
 * L'unica porta verso la vetrina di un Travel Designer, e sta solo lato server.
 *
 * Legge da `public_td_showcase`, la vista che la migration 0028 ha costruito per
 * servire tutta la pagina in una query: campi di profilo, paesi coperti per
 * nome, servizi attivi con i punti dei box, viaggi firma con le foto in ordine,
 * itinerari pronti. Qui non si aggiunge niente: se serve una lettura nuova si
 * aggiunge una vista, non si apre una tabella.
 *
 * Dalla 0054 (vetrine v6, 3 ottobre 2026) le letture sono quattro, tutte da
 * viste: la vetrina (`public_td_showcase`), il dettaglio di un itinerario
 * (`public_td_ready_itinerary`), quello di un viaggio di gruppo
 * (`public_td_group_trip`) e le recensioni (`public_td_reviews`). Le colonne
 * chiuse — nome anagrafico, livelli, assi, note XPETIS, condizioni scritte dal
 * designer — non sono in nessuna: l'harness lo verifica colonna per colonna.
 *
 * «Membro XPETIS» non legge più `joined_at`: la vista dà gli anni compiuti
 * (`member_years`), mai la data.
 */
import { clientPubblico } from '@/lib/supabase/pubblico'

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
  /**
   * Lo slug dell'event type Cal.com di questo servizio (migration 0040). Sta sul
   * servizio e non sul designer perché consulenza e consulenza approfondita sono
   * due event type distinti. Insieme a `Vetrina.cal_username` forma il link
   * `<username>/<slug>` che l'embed apre.
   *
   * `null` su un servizio che non si prenota da calendario (su misura, All
   * Inclusive) e su un servizio che il team non ha ancora collegato: in
   * entrambi i casi l'embed non si apre, e il tasto non compare.
   */
  cal_event_type_slug: string | null
  /**
   * Il prezzo «da» mostrato in vetrina (0052, D5): oggi solo sull'Itinerario su
   * misura («da 70€»). **Non** è un importo che si incassa: quello del su misura
   * lo scrive il designer nella proposta. Per le consulenze l'importo vero è
   * `price_cents`.
   */
  price_from_cents: number | null
}

export type ViaggioFirma = {
  title: string
  description: string | null
  /** Il nome del paese del viaggio (0052). `null` sui profili caricati prima del tool v6. */
  country: string | null
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
  /** La copertina: la prima foto della voce (0054), o la colonna superata. */
  image_path: string | null
  /** I paesi del viaggio per nome, in ordine (0054). */
  countries: string[]
}

/** Lo stato di una partenza (0053). `open` non ha etichetta. */
export type StatoPartenza = 'open' | 'confirmed' | 'last_seats' | 'sold_out'

/** Una partenza di un viaggio di gruppo: date vere, AAAA-MM-GG. */
export type Partenza = {
  starts_on: string
  ends_on: string | null
  status: StatoPartenza
}

/**
 * Un viaggio di gruppo del designer (migration 0048, chiave `gruppo` del form).
 *
 * **Tutti testo libero, come li scrive il designer**: "14 – 25 set 2025",
 * "12 giorni", "10 persone", "1.380€". Non si riformattano e non si
 * interpretano — chi mostra non indovina. Sono vetrina: nessuna cassa, nessun
 * ordine nasce da qui.
 *
 * **Lo slug è dalla 0051**, ed è la ragione per cui la pagina del viaggio
 * (Figma `3-1121`) esiste: come per gli itinerari (0033), nasce dal titolo al
 * primo inserimento e non si muove più, né correggendo il titolo né
 * riordinando i viaggi.
 */
export type ViaggioDiGruppo = {
  slug: string
  title: string
  /** Superata dalla 0053 (partenze vere): la vista la serve ancora, le pagine non la leggono più. */
  dates_label: string | null
  duration_label: string | null
  /** Superata dalla 0053 (participants_min / participants_max). */
  group_size_label: string | null
  price_label: string | null
  image_path: string | null
  countries: string[]
  participants_min: number | null
  participants_max: number | null
  /**
   * La prima partenza **futura** non sold out, o la prima futura se lo sono
   * tutte (0054, calcolata nel database all'ora di Roma). Mai una passata.
   */
  next_departure: Partenza | null
}

/** Una tappa del viaggio, come la scrive il designer. */
export type Tappa = {
  days_label: string | null
  title: string | null
  description: string | null
}

/**
 * Il dettaglio di un itinerario pronto o di un viaggio di gruppo, dalle viste
 * `public_td_ready_itinerary` e `public_td_group_trip` (0054). Stessa forma
 * nel tool, stessa forma qui; i campi dei soli gruppi sono in fondo.
 */
export type DettaglioVoce = {
  td_slug: string
  slug: string
  title: string
  duration_label: string | null
  price_label: string | null
  nights: number | null
  intro: string | null
  price_note: string | null
  main_stops: string[]
  price_includes: string[]
  price_excludes: string[]
  packing_list: string[]
  health_visa_info: string | null
  fit_nature: number
  fit_trekking: number
  fit_on_the_road: number
  fit_city: number
  fit_culture: number
  fit_chill: number
  images: string[]
  countries: string[]
  stops: Tappa[]
}

export type DettaglioGruppo = DettaglioVoce & {
  participants_min: number | null
  participants_max: number | null
  age_range: string | null
  guide_name: string | null
  /** Solo le partenze future, in ordine di data (0054). */
  departures: Partenza[]
  next_departure: Partenza | null
}

/** Una recensione da mostrare in vetrina (0054, `public_td_reviews`). */
export type Recensione = {
  /** `td_declared`: raccolta dal designer fuori da XPETIS (D3). `xpetis_verified`: dalla milestone 8. */
  source: 'td_declared' | 'xpetis_verified'
  title: string | null
  author_name: string | null
  stars: number
  date_label: string | null
  reviewed_on: string | null
  body: string | null
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

/**
 * L'indirizzo della pagina di un viaggio di gruppo, e il modo di risolverlo:
 * il gemello di `percorsoItinerario` / `trovaItinerario`, con lo stesso
 * contratto. Nell'URL c'è lo slug del viaggio (0051), mai la sua posizione.
 */
export function percorsoViaggioDiGruppo(slugDesigner: string, slugViaggio: string): string {
  return `/designer/${slugDesigner}/viaggio-di-gruppo/${slugViaggio}`
}

export function trovaViaggioDiGruppo(
  viaggi: ViaggioDiGruppo[],
  slug: string | undefined,
): ViaggioDiGruppo | null {
  if (!slug) return null
  return viaggi.find((v) => v.slug === slug) ?? null
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
  /**
   * L'account Cal.com del designer (migration 0040). `null` finché il team non
   * l'ha collegato — ed è un blocco alla pubblicazione, quindi su un profilo
   * pubblicato c'è; il tipo lo ammette perché la colonna lo ammette.
   */
  cal_username: string | null
  /** Dalla 0048, in coda alla vista. Vuoto per chi non ne organizza. */
  group_trips: ViaggioDiGruppo[]
  /** Dalla 0054: aree di competenza come le scrive il designer (campo `competenze` del tool). */
  expertise_areas: string | null
  /** Dalla 0054: «Cosa vuol dire viaggiare per me» (campo `viaggiarePerMe`). */
  travel_philosophy: string | null
  /** Dalla 0054: anni compiuti da quando è entrato in XPETIS. Mai la data. */
  member_years: number
  /**
   * Dalla 0054: media delle sole recensioni **verificate**, e solo sopra la
   * soglia di `app_config.showcase_rating_min_reviews`. Altrimenti `null`, e il
   * voto non esce (D2). Le recensioni dichiarate dal designer non contano mai.
   */
  rating_avg: number | string | null
  /**
   * Dalla 0056: il nome delle frasi («Prenota la call con Luca»). La prima
   * parola del nome, oppure il nome professionale intero (D8).
   */
  short_name: string
}

/** La vetrina di un designer pubblicato, o `null` se lo slug non esiste. */
export async function leggiVetrina(slug: string): Promise<Vetrina | null> {
  const supabase = clientPubblico()
  const { data, error } = await supabase
    .from('public_td_showcase')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw new Error(`public_td_showcase: ${error.message}`)
  return (data as Vetrina | null) ?? null
}

/**
 * Il dettaglio di un itinerario pronto, o `null` se lo slug non esiste o il
 * designer non è pubblicato: la vista contiene solo i pubblicati.
 */
export async function leggiDettaglioItinerario(
  slugDesigner: string,
  slugItinerario: string,
): Promise<DettaglioVoce | null> {
  const supabase = clientPubblico()
  const { data, error } = await supabase
    .from('public_td_ready_itinerary')
    .select('*')
    .eq('td_slug', slugDesigner)
    .eq('slug', slugItinerario)
    .maybeSingle()

  if (error) throw new Error(`public_td_ready_itinerary: ${error.message}`)
  return (data as DettaglioVoce | null) ?? null
}

/** Il gemello per i viaggi di gruppo. */
export async function leggiDettaglioViaggioDiGruppo(
  slugDesigner: string,
  slugViaggio: string,
): Promise<DettaglioGruppo | null> {
  const supabase = clientPubblico()
  const { data, error } = await supabase
    .from('public_td_group_trip')
    .select('*')
    .eq('td_slug', slugDesigner)
    .eq('slug', slugViaggio)
    .maybeSingle()

  if (error) throw new Error(`public_td_group_trip: ${error.message}`)
  return (data as DettaglioGruppo | null) ?? null
}

/**
 * Le recensioni della vetrina, nell'ordine della vista: prima le verificate
 * (dalla più recente), poi le dichiarate (nella posizione data dal designer).
 */
export async function leggiRecensioni(slugDesigner: string): Promise<Recensione[]> {
  const supabase = clientPubblico()
  const { data, error } = await supabase
    .from('public_td_reviews')
    .select('source, title, author_name, stars, date_label, reviewed_on, body')
    .eq('td_slug', slugDesigner)
    .order('source_order', { ascending: true })
    .order('reviewed_on', { ascending: false, nullsFirst: false })
    .order('position', { ascending: true })

  if (error) throw new Error(`public_td_reviews: ${error.message}`)
  return (data ?? []) as Recensione[]
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
