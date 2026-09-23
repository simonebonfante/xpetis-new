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

export type PaginaOrdine = {
  esito: EsitoToken
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

export type FaseProposta = 'da_pagare' | 'pagata' | 'in_aggiornamento' | 'annullata' | 'in_verifica'

export type PaginaProposta = {
  esito: EsitoToken
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
}

async function rpc<T>(funzione: string, argomenti: Record<string, unknown>, ripiego: T): Promise<T> {
  const { data, error } = await createAdminClient().rpc(funzione, argomenti)
  if (error || !data) return ripiego
  return data as T
}

export const leggiPaginaOrdine = (token: string) =>
  rpc<PaginaOrdine>('td_order_page', { p_token: token }, { esito: 'irraggiungibile' })

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
  rpc<PaginaProposta>('proposal_public_page', { p_token: token }, { esito: 'irraggiungibile' })

// ---------------------------------------------------------------- gli euro

/**
 * Da quello che un designer scrive in un campo prezzo a centesimi.
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
