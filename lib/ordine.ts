import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EsitoToken } from '@/lib/token'

/**
 * La porta verso le due pagine dell'ordine su misura: quella del designer
 * (`/ordine/[token]`) e la pagina gemella della proposta (`/proposta/[token]`).
 * Stesse regole di `lib/token.ts`, e per le stesse ragioni:
 *
 *  · **una chiamata per richiesta**, perché risolvere un token scrive
 *    (`use_count`, `last_seen_at`);
 *  · **la pagina non decide**: stato ammesso, designer giusto, credito già
 *    usato, prezzo ridichiarato — lo dicono le funzioni Postgres della 0044,
 *    dove l'harness le prova;
 *  · **il token non finisce nei log**.
 */

export type StatoOrdine =
  | 'requested'
  | 'in_definition'
  | 'proposal_sent'
  | 'in_progress'
  | 'delivered'
  | 'revision_requested'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  // Dalla 0047: la cascata dell'All Inclusive.
  | 'proposal_pending_agency'
  | 'awaiting_deposit'
  | 'deposit_paid'
  | 'awaiting_balance'
  | 'balance_paid'

export type PaginaOrdine = {
  esito: EsitoToken
  /** Dalla 0047: la stessa porta serve i due servizi, e la pagina sceglie la faccia. */
  servizio?: 'custom_itinerary'
  human_ref?: string
  status?: StatoOrdine
  td_name?: string
  nome_viaggiatore?: string | null
  call_il?: string | null
  prezzo_call_cents?: number | null
  credito_usato_su?: string | null
  descrizione?: string | null
  prezzo_cents?: number | null
  giorni?: number | null
  credito_cents?: number | null
  inviata_il?: string | null
  link_proposta?: string | null
  messaggio_pronto?: string | null
  // Dalla 0046: la consegna e la revisione.
  messaggio_consegna?: string | null
  file?: FileOrdine[]
  consegnato_il?: string | null
  revisione_entro?: string | null
  revisione_chiesta_il?: string | null
  revisione_nota?: string | null
  revisione_consegnata_il?: string | null
  chiuso_il?: string | null
  si_chiude_il?: string | null
}

/**
 * Un file dell'ordine come lo vede una pagina: **niente percorso, niente
 * link**. Si scarica da `/ordine|proposta/[token]/file/[id]`, dove la route
 * genera un link firmato al clic (vedi `lib/documenti.ts`).
 */
export type FileOrdine = {
  id: string
  tipo: 'itinerary' | 'revision' | 'proposal_document' | 'final_document'
  nome: string
  caricato_il: string
}

/** Le risposte di `save_proposal_draft` e `send_proposal`. */
export type EsitoAzione = {
  ok: boolean
  esito: string
  campo?: string
  motivo?: string
  su?: string
  stato?: string
  prezzo_cents?: number
  prezzo_call_cents?: number
}

export type FaseProposta =
  | 'da_pagare'
  | 'pagata'
  // Dalla 0046: il dopo-pagamento ha tre facce invece di una.
  | 'consegnata'
  | 'in_revisione'
  | 'chiusa'
  | 'in_aggiornamento'
  | 'annullata'
  | 'in_verifica'

export type PaginaProposta = {
  esito: EsitoToken
  servizio?: 'custom_itinerary'
  fase?: FaseProposta
  /** Solo per la route della cassa, lato server: la pagina non lo scrive nell'HTML. */
  order_id?: string
  human_ref?: string
  td_name?: string
  td_slug?: string
  descrizione?: string | null
  prezzo_cents?: number | null
  giorni?: number | null
  inviata_il?: string | null
  // Dalla 0046.
  file?: FileOrdine[]
  consegnato_il?: string | null
  revisione_entro?: string | null
  revisione_chiesta_il?: string | null
  revisione_nota?: string | null
  revisione_consegnata_il?: string | null
  chiuso_il?: string | null
  si_chiude_il?: string | null
  puo_chiedere_revisione?: boolean
}

async function rpc<T>(funzione: string, argomenti: Record<string, unknown>, ripiego: T): Promise<T> {
  const { data, error } = await createAdminClient().rpc(funzione, argomenti)
  if (error || !data) return ripiego
  return data as T
}

export const leggiPaginaOrdine = (token: string) =>
  rpc<PaginaOrdine | PaginaOrdineAI>('td_order_page', { p_token: token }, { esito: 'irraggiungibile' })

export const salvaBozza = (
  token: string,
  bozza: { descrizione: string; prezzoCents: number | null; giorni: number | null; creditoCents: number | null },
) =>
  rpc<EsitoAzione>(
    'save_proposal_draft',
    {
      p_token: token,
      p_descrizione: bozza.descrizione,
      p_prezzo_cents: bozza.prezzoCents,
      p_giorni: bozza.giorni,
      p_credito_cents: bozza.creditoCents,
    },
    { ok: false, esito: 'irraggiungibile' },
  )

export const inviaProposta = (token: string, prezzoConfermatoCents: number | null) =>
  rpc<EsitoAzione>(
    'send_proposal',
    { p_token: token, p_prezzo_confermato_cents: prezzoConfermatoCents },
    { ok: false, esito: 'irraggiungibile' },
  )

export const leggiPaginaProposta = (token: string) =>
  rpc<PaginaProposta | PaginaPropostaAI>('proposal_public_page', { p_token: token }, { esito: 'irraggiungibile' })

// ---------------------------------------------------------------- la consegna (0046)

/** Le risposte di `td_delivery_ticket`, `td_deliver` e `request_revision`. */
export type EsitoConsegna = {
  ok: boolean
  esito: string
  campo?: string
  stato?: string
  path?: string
  tipo?: FileOrdine['tipo']
  chiesta_il?: string
  consegnata_il?: string
  scaduta_il?: string
  chiuso_il?: string
}

/** Il permesso di caricare: il database controlla e **sceglie il percorso**. */
export const bigliettoConsegna = (token: string, file: { nome: string; byte: number; tipo: string }) =>
  rpc<EsitoConsegna>(
    'td_delivery_ticket',
    { p_token: token, p_nome: file.nome, p_size: file.byte, p_mime: file.tipo },
    { ok: false, esito: 'irraggiungibile' },
  )

/** La consegna, con dimensione e tipo letti da Storage e non dichiarati dal browser. */
export const registraConsegna = (
  token: string,
  file: { path: string; nome: string; byte: number; tipo: string },
) =>
  rpc<EsitoConsegna>(
    'td_deliver',
    { p_token: token, p_path: file.path, p_nome: file.nome, p_size: file.byte, p_mime: file.tipo },
    { ok: false, esito: 'irraggiungibile' },
  )

/** Il permesso di scaricare: un **percorso**, mai un URL. Firmare è mestiere della route. */
export const permessoFile = (token: string, fileId: string) =>
  rpc<{ esito: string; path?: string; nome?: string }>(
    'order_file_for_token',
    { p_token: token, p_file_id: fileId },
    { esito: 'irraggiungibile' },
  )

export const chiediRevisione = (token: string, nota: string) =>
  rpc<EsitoConsegna>('request_revision', { p_token: token, p_nota: nota }, { ok: false, esito: 'irraggiungibile' })

// ---------------------------------------------------------------- l'All Inclusive (0047)

/**
 * La pagina ordine All Inclusive, vista dal designer. Stessa porta della su
 * misura (`td_order_page`): il database risolve il token una volta e sceglie
 * la faccia, e `servizio` la dice alla pagina.
 */
export type PaginaOrdineAI = {
  esito: 'valido'
  servizio: 'all_inclusive'
  human_ref: string
  status: StatoOrdine
  td_name: string
  nome_viaggiatore: string | null
  call_il: string | null
  prezzo_call_cents: number | null
  credito_usato_su: string | null
  /** Il nome dell'agenzia assegnata e attiva, o `null`: la assegna il team. */
  agenzia: string | null
  descrizione: string | null
  prezzo_cents: number | null
  partenza: string | null
  ritorno: string | null
  credito_cents: number | null
  acconto_cents: number | null
  saldo_cents: number | null
  saldo_entro: string | null
  inviata_il: string | null
  confermata_il: string | null
  ultimo_invio: {
    n: number
    inviata_il: string
    decisione: 'confirmed' | 'rejected' | null
    nota: string | null
    decisa_il: string | null
  } | null
  documenti: FileOrdine[]
  file_finale: FileOrdine[]
  link_pagina: string | null
  messaggio_pronto: string | null
  messaggio_consegna: string | null
  consegnato_il: string | null
  chiuso_il: string | null
}

export type FasePropostaAI =
  | 'da_pagare_acconto'
  | 'acconto_pagato'
  | 'da_pagare_saldo'
  | 'saldata'
  | 'consegnata'
  | 'chiusa'
  | 'annullata'
  | 'in_verifica'
  | 'in_aggiornamento'

/** La pagina del viaggiatore per l'All Inclusive. Niente del viaggiatore: si gira nel gruppo. */
export type PaginaPropostaAI = {
  esito: 'valido'
  servizio: 'all_inclusive'
  fase: FasePropostaAI
  /** Per la route della cassa, lato server: la pagina non li scrive nell'HTML. */
  order_id: string
  agency_id: string | null
  human_ref: string
  td_name: string
  td_slug: string
  agenzia: string | null
  descrizione: string | null
  totale_cents: number | null
  acconto_cents: number | null
  saldo_cents: number | null
  partenza: string | null
  ritorno: string | null
  saldo_entro: string | null
  documento: { id: string; nome: string } | null
  /** Solo i nomi: il documento finale si scarica da `/documento/<id>`, col login. */
  file_finale: FileOrdine[]
  consegnato_il: string | null
  /** Quale rata aprire e per quanto, **dal database**. Assente se non c'è niente da pagare. */
  cassa: { rata: 'deposit' | 'balance'; importo_cents: number } | null
}

export const eAllInclusive = <T extends { servizio?: string }>(p: T): boolean => p.servizio === 'all_inclusive'

export const salvaBozzaAI = (
  token: string,
  bozza: {
    descrizione: string
    prezzoCents: number | null
    partenza: string | null
    ritorno: string | null
    creditoCents: number | null
  },
) =>
  rpc<EsitoAzione>(
    'ai_save_draft',
    {
      p_token: token,
      p_descrizione: bozza.descrizione,
      p_prezzo_cents: bozza.prezzoCents,
      p_partenza: bozza.partenza,
      p_ritorno: bozza.ritorno,
      p_credito_cents: bozza.creditoCents,
    },
    { ok: false, esito: 'irraggiungibile' },
  )

export const inviaAllAgenzia = (token: string, prezzoConfermatoCents: number | null) =>
  rpc<EsitoAzione>(
    'ai_send_to_agency',
    { p_token: token, p_prezzo_confermato_cents: prezzoConfermatoCents },
    { ok: false, esito: 'irraggiungibile' },
  )

/**
 * Il permesso di scaricare il documento finale, per chi è entrato con Google.
 * `viewer` è l'utente della sessione, **verificato** con `getUser()`.
 */
export const permessoDocumentoFinale = (fileId: string, viewer: string | null) =>
  rpc<{ esito: string; path?: string; nome?: string; human_ref?: string }>(
    'final_document_for_traveler',
    { p_file_id: fileId, p_viewer: viewer },
    { esito: 'irraggiungibile' },
  )

/** Una data `YYYY-MM-DD` del database, scritta per un italiano. */
export function dataGiorno(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, g] = iso.slice(0, 10).split('-')
  return `${g}/${m}/${a}`
}

// ---------------------------------------------------------------- gli euro

/**
 * La forma ammessa di un importo scritto a mano: **la guardia del campo**, non
 * il calcolo. Al massimo due decimali, e nessuno zero iniziale — «030» non è un
 * prezzo, è un dito scivolato, e `euroInCentesimi` da sola lo leggerebbe 30 €.
 *
 * Sta in un posto solo perché la usano in due: l'attributo `pattern` del campo
 * (il browser ferma l'invio e il designer non perde niente) e la route, che
 * **deve** ricontrollare: `pattern` e `type="number"` sono suggerimenti al
 * browser, e la route riceve comunque quello che le si manda.
 *
 * Accetta «450», «0,50», «1150,50», «1150.50», «1.150», «1.150,50 €». Il punto
 * delle migliaia va solo con la virgola decimale: «1.150.50» si rifiuta, come
 * lo rifiuta `euroInCentesimi`. È scritta per valere identica come `RegExp` e
 * come `pattern` HTML (che la ancora da sé e la compila col flag `v`).
 */
export const FORMA_IMPORTO = String.raw`\s*(?:(?:0|[1-9]\d*)(?:[.,]\d{1,2})?|[1-9]\d{0,2}(?:\.\d{3})+(?:,\d{1,2})?)\s*€?\s*`

const IMPORTO_BEN_SCRITTO = new RegExp(`^(?:${FORMA_IMPORTO})$`, 'u')

export function importoBenScritto(testo: string): boolean {
  return IMPORTO_BEN_SCRITTO.test(testo)
}

/**
 * Da quello che un designer scrive in un campo prezzo a centesimi.
 *
 * ⚠️ **Non semplificarla con `parseFloat(testo) * 100`.** È corretta così ed è
 * stata verificata caso per caso: virgola italiana (`1200,50` → 120050), punto
 * come migliaia (`1.200` → 120000), tre decimali rifiutati, e soprattutto
 * **aritmetica intera** — `19,99` dà 1999. Con la virgola mobile `19.99 * 100`
 * fa 1998.9999999999998, e un arrotondamento per difetto è un centesimo di
 * scarto: il ponte Stripe confronta l'incassato col prezzo della proposta,
 * **rifiuta il pagamento** se non combaciano, e ne esce un alert critico e un
 * ordine che non si conferma mai. Le regole sulla forma del campo non vanno
 * qui dentro: stanno in `FORMA_IMPORTO`.
 *
 * Il campo è testo libero di proposito: su telefono un `type="number"` in
 * italiano vuole la virgola su certe tastiere e il punto su altre, e rifiuta in
 * silenzio quello che non capisce. Qui si accettano le forme che una persona
 * scrive davvero — «1150», «1.150», «1150,50», «1.150,50 €», «1150.50» — e tutto
 * il resto torna `null`, che la funzione Postgres rifiuta con un messaggio.
 *
 * La regola sul punto è l'unica ambigua: «1.150» è mille e centocinquanta
 * (separatore delle migliaia, come si scrive in Italia), «1150.5» è un
 * decimale. Un punto seguito da **esattamente tre cifre** è un separatore di
 * migliaia; altrimenti è la virgola decimale di chi ha una tastiera inglese.
 *
 * ⚠️ Nessuna sottrazione qui dentro, e nemmeno in chi chiama: il prezzo che il
 * designer scrive è quello finale, già al netto del credito (vedi la testa di
 * `0044_proposta_su_misura.sql`).
 */
export function euroInCentesimi(testo: string | null | undefined): number | null {
  if (!testo) return null
  let t = testo.replace(/[€\s]/g, '')
  if (!t) return null

  if (t.includes(',')) {
    // Virgola decimale: i punti sono migliaia.
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  }

  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const [interi, decimali = ''] = t.split('.')
  const centesimi = Number(interi) * 100 + Number(decimali.padEnd(2, '0'))
  return Number.isSafeInteger(centesimi) ? centesimi : null
}

const EURO = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

export function euro(centesimi: number | null | undefined): string {
  return centesimi == null ? '—' : EURO.format(centesimi / 100)
}

/** Per rimettere un importo nel campo del form: «1150,50», senza simbolo né migliaia. */
export function euroPerCampo(centesimi: number | null | undefined): string {
  if (centesimi == null) return ''
  const interi = Math.floor(centesimi / 100)
  const resto = centesimi % 100
  return resto === 0 ? String(interi) : `${interi},${String(resto).padStart(2, '0')}`
}
