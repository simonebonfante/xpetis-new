import { createBrowserClient } from '@supabase/ssr'

/**
 * Client per il browser. Usa la chiave *publishable*: è pubblica per
 * definizione e non apre niente da sola, perché ogni tabella ha la RLS accesa e
 * nessuna policy per `anon`. Dal browser si leggono solo le viste `public_*` e
 * si chiama `match_designers()`.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
