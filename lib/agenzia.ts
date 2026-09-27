import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EsitoToken } from '@/lib/token'

/**
 * La porta verso la pagina dell'agenzia (`/agenzia/[token]`), il terzo
 * destinatario delle pagine a token dopo designer e viaggiatore (0047).
 *
 * Stesse regole di `lib/token.ts` e `lib/ordine.ts`: una chiamata per
 * richiesta, la pagina non decide, il token non finisce nei log. In più, il
 * token dell'agenzia **si consuma alla prima risposta e scade**: la pagina di
 * un link già usato dice com'è andata invece di rispondere «già usato».
 */

export type FaseAgenzia = 'da_decidere' | 'confermata' | 'non_fattibile' | 'superata'

export type PaginaAgenzia = {
  esito: EsitoToken
  fase?: FaseAgenzia
  human_ref?: string
  agenzia?: string
  td_name?: string
  invio_n?: number
  descrizione?: string
  totale_cents?: number
  acconto_cents?: number
  saldo_cents?: number
  partenza?: string
  ritorno?: string | null
  inviata_il?: string
  valido_fino?: string | null
  /** Solo finché c'è da decidere: dopo, il link non scarica più niente. */
  documento?: { id: string; nome: string } | null
  deciso_il?: string | null
  nota?: string | null
}

export type EsitoDecisione = {
  ok: boolean
  esito: string
  campo?: string
  decisione?: 'conferma' | 'non_fattibile'
  deciso_il?: string
  stato?: string
}

async function rpc<T>(funzione: string, argomenti: Record<string, unknown>, ripiego: T): Promise<T> {
  const { data, error } = await createAdminClient().rpc(funzione, argomenti)
  if (error || !data) return ripiego
  return data as T
}

export const leggiPaginaAgenzia = (token: string) =>
  rpc<PaginaAgenzia>('agency_page', { p_token: token }, { esito: 'irraggiungibile' })

export const decidi = (token: string, decisione: string, nota: string) =>
  rpc<EsitoDecisione>(
    'agency_decide',
    { p_token: token, p_decisione: decisione, p_nota: nota },
    { ok: false, esito: 'irraggiungibile' },
  )
