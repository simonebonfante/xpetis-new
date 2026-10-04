import 'server-only'
import { createClient as creaClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Il client delle **letture pubbliche**: le viste `public_*`, `public_config`,
 * `geo_search`, e le funzioni che `anon` può chiamare (`match_designers`).
 * Chiave publishable, **nessun cookie, nessuna sessione**: legge come un
 * visitatore anonimo, che è esattamente quello che quelle viste servono.
 *
 * ## Perché non `lib/supabase/server.ts`
 *
 * Quel client porta con sé la sessione di chi guarda, letta dai cookie, e la
 * manda a PostgREST col suo token. Per una pagina pubblica non serve — le viste
 * non guardano `auth.uid()` — e anzi è un rischio: se il token del visitatore
 * è storto, PostgREST rifiuta la richiesta e **salta tutta la pagina**, per un
 * visitatore che non doveva nemmeno essere riconosciuto.
 *
 * È successo il 4 ottobre 2026: subito dopo un login, PostgREST ha risposto
 * «JWT issued at future» (l'orologio del servizio di autenticazione di
 * Supabase avanti di qualche secondo rispetto al database) e la vetrina di
 * Luca è andata in errore. Con questo client la vetrina si legge sempre; la
 * sessione resta affare dell'header (`lib/supabase/utente.ts`) e delle pagine
 * del viaggiatore, che ne hanno davvero bisogno.
 *
 * Un client solo per processo: non dipende dalla richiesta, quindi non c'è
 * niente da ricreare a ogni pagina.
 */
let client: SupabaseClient | null = null

export function clientPubblico(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !chiave) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY non impostate.')
  }
  client = creaClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}
