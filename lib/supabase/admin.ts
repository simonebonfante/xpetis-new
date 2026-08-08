import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Client con la chiave *secret*: scavalca la RLS ed è il solo modo di scrivere
 * sul database. Lo usano le route server — pagine token, form di prenotazione,
 * webhook.
 *
 * L'import di `server-only` in cima non è decorativo: se un giorno qualcuno
 * importa questo file da un componente client, **la build fallisce** invece di
 * spedire al browser la chiave che apre tutto. È la rete di sicurezza sotto il
 * principio "il client non parla mai con le tabelle".
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error(
      'SUPABASE_SECRET_KEY non impostata: le route server non possono scrivere.',
    )
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
