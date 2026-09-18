import 'server-only'
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

/**
 * Chi sta guardando, letto una volta sola per richiesta.
 *
 * Nasce dall'8 settembre 2026, quando l'header ha iniziato a leggere la
 * sessione: da quel momento una pagina come `/designer/<slug>` o `/accedi` la
 * chiedeva **due volte** — una volta per sé e una per l'header — e ogni
 * `getUser()` è un giro di rete verso il server di autenticazione di Supabase,
 * non una lettura locale del cookie.
 *
 * `cache()` di React risolve la duplicazione nel modo giusto: la prima chiamata
 * dentro una richiesta fa il lavoro, le successive ricevono lo stesso risultato,
 * e i componenti restano indipendenti — nessuno deve passare l'utente
 * all'header attraverso quattro livelli di props. La memoria dura quanto la
 * richiesta e non un istante di più: **non è una cache fra utenti diversi**, che
 * su un dato di sessione sarebbe un difetto grave.
 *
 * Vale per i **componenti server**. Le route handler non stanno in una resa e
 * non condividono questa memoria: là si continua a chiamare `getUser()` diretto,
 * ed è giusto, perché una route fa una domanda sola.
 */
export const leggiUtente = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})
