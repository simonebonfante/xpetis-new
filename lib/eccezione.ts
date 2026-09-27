import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EsitoToken } from '@/lib/token'

/**
 * La porta verso le due micro-pagine del dopo-call del designer: «no-show» e
 * «altro problema» (`/eccezione/[token]`). Stesse regole di `lib/token.ts` e
 * `lib/ordine.ts`: una chiamata per richiesta, il token non finisce nei log, e
 * **la pagina non decide** — finestra, stato della call, segnalazione già
 * fatta li dicono le funzioni della 0046.
 */

export type FaseEccezione = 'aperta' | 'troppo_presto' | 'gia_segnalata' | 'chiusa' | 'non_ammessa'

export type PaginaEccezione = {
  esito: EsitoToken
  fase?: FaseEccezione
  tipo?: 'no_show' | 'problem'
  nome_viaggiatore?: string | null
  call_il?: string
  call_fine?: string
  minuti_attesa?: number | null
  si_chiude_il?: string | null
  chiusa_il?: string | null
  segnalata_tipo?: 'no_show' | 'problem' | null
  segnalata_il?: string | null
}

export type EsitoSegnalazione = PaginaEccezione & { ok: boolean; campo?: string }

async function rpc<T>(funzione: string, argomenti: Record<string, unknown>, ripiego: T): Promise<T> {
  const { data, error } = await createAdminClient().rpc(funzione, argomenti)
  if (error || !data) return ripiego
  return data as T
}

export const leggiPaginaEccezione = (token: string) =>
  rpc<PaginaEccezione>('td_exception_page', { p_token: token }, { esito: 'irraggiungibile' })

export const segnalaEccezione = (token: string, minuti: number | null, nota: string) =>
  rpc<EsitoSegnalazione>(
    'td_report_exception',
    { p_token: token, p_minuti: minuti, p_nota: nota },
    { ok: false, esito: 'irraggiungibile' },
  )
